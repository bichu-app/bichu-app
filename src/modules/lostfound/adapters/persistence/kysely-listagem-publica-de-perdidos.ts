/**
 * Persistência da **listagem pública de perdidos** (`listPublicLostPets`).
 *
 * Irmã de `kysely-leitura-publica-do-caso.ts`, e com a mesma disciplina: ela
 * **não toca `users`** para ler nada. Telefone, e-mail e endereço do tutor não
 * estão em tabela nenhuma que esta consulta junte, então não há coluna para
 * selecionar por engano — e o teste
 * `listagem-publica-de-perdidos-sem-id-interno.test.ts` lê o SQL compilado e
 * reprova se `users`, `lost_cases.id`, `pet_id`, `owner_user_id` como coluna de
 * saída ou a coordenada aparecerem na lista de seleção.
 *
 * `owner_user_id` entra **só dentro de `conta_habilitada(...)`**, que é uma
 * chamada de função no `WHERE` e não uma coluna de saída. É a mesma razão pela
 * qual a leitura por token compara o dono no banco em vez de ler o
 * identificador para a aplicação: o que não chega à camada de cima não tem como
 * ser serializado por engano.
 *
 * ## `conta_habilitada` e não `innerJoin('users')`
 *
 * A função é da migração `20261017000013` e devolve verdadeiro para nulo.
 * `lost_cases.owner_user_id` é `NOT NULL`, então aqui a diferença não é a do
 * achado sem conta — a razão é outra e é de forma: uma junção interna com
 * `users` traria a tabela do tutor para dentro da consulta pública, e a
 * garantia "esta consulta não junta `users`" deixaria de ser verificável por
 * leitura do SQL.
 *
 * ## O recorte geográfico é TEXTO, e isso é o ADR-0006 e o ADR-0010
 *
 * `city` e `neighborhood` comparam contra `lost_cases.last_seen_city` e
 * `last_seen_neighborhood`, que são o que o tutor digitou. `last_seen_point`
 * **não é lido e não é filtrado**, nem arredondado, nem agrupado: um ponto por
 * caso permitiria montar o mapa que a privacidade existe para impedir, e não há
 * geocodificação que transforme coordenada em bairro.
 *
 * A comparação de cidade é por igualdade normalizada (`texto_para_busca`), e a
 * de bairro também: "vila mariana" e "Vila Mariana" são o mesmo bairro, e um
 * `=` cru faria a listagem responder vazio para quem digitou com acento
 * diferente do que o tutor gravou. O termo de busca (`q`) é `LIKE` com
 * `padrao_de_busca`, que é a forma que o índice trigrama do diretório já usa
 * (migração `20260928000006`).
 *
 * ## SEM JANELA A CONSULTA LÊ A CIDADE INTEIRA, E FALTA ÍNDICE
 *
 * `period` perdeu o `default: 30d` no contrato em 18/10/2026 (pedido do
 * cliente), então a ausência de janela é janela aberta e o predicado de
 * `last_seen_at` deixa de existir. O que isso custa foi MEDIDO, e não estimado:
 * pilha de integração, Postgres 16, 6 000 casos abertos públicos em 10 cidades
 * (600 em `Sao Paulo`) espalhados por 720 dias, `ANALYZE` feito,
 * `EXPLAIN (ANALYZE, BUFFERS)` da MESMA consulta que este arquivo compila:
 *
 * ```
 * contagem, janela de 30 d   Seq Scan   26 linhas     923 buffers   15,9 ms
 * contagem, janela aberta    Seq Scan  600 linhas  15 113 buffers   58,8 ms
 * página 1,  janela de 30 d  Seq Scan   26 linhas     839 buffers   10,3 ms
 * página 1,  janela aberta   Seq Scan  600 linhas  15 114 buffers   57,5 ms
 * ```
 *
 * **O plano já era `Seq Scan` nos dois casos**, e é aqui que a medição
 * desmente a leitura rápida: `lost_cases_publicos_por_cidade`
 * — `(last_seen_city, opened_at DESC) WHERE status = 'open' AND
 * share_to_public_list` — NÃO SERVE esta consulta e nunca serviu. Dois motivos
 * independentes: o predicado de cidade é `texto_para_busca(last_seen_city) =
 * ...`, uma função sobre a coluna, que nenhum btree sobre a coluna crua
 * alcança; e a ordenação do índice é `opened_at`, enquanto a janela e a ordem
 * desta rota são `last_seen_at`. Tirar o `default` não degradou um plano bom:
 * ele tornou visível quantas linhas o plano ruim já percorria.
 *
 * O que explica os 16x de buffers não é a varredura em si — ela lê as mesmas
 * páginas de qualquer jeito —, é `conta_habilitada(owner_user_id)`, uma função
 * por linha que consulta `users`. Com a janela, o Postgres a avalia depois do
 * `last_seen_at` e ela roda 26 vezes; sem a janela, ela roda para as 600 da
 * cidade.
 *
 * O índice que resolve é a migração **`20261019000003`**, que desce no mesmo
 * trabalho que este comentário:
 *
 * ```
 * CREATE INDEX lost_cases_publicos_por_cidade_e_visto
 *   ON lost_cases (texto_para_busca(last_seen_city), last_seen_at DESC, share_token)
 *   WHERE status = 'open' AND share_to_public_list;
 *
 * contagem, janela aberta   Bitmap Index Scan   4 320 buffers   8,7 ms
 * página 1,  janela aberta  Bitmap Index Scan                  16,2 ms
 * ```
 *
 * `texto_para_busca` é IMMUTABLE (`provolatile = 'i'`), então ela pode indexar;
 * `conta_habilitada` é STABLE e por isso NÃO pode entrar no `WHERE` do índice.
 * Além do índice, a contenção são os três tetos por `ip` da operação e a
 * paginação de 20, que o contrato já declara.
 *
 * O índice ANTIGO continua lá e **não é duplicata deste**: ele foi criado na
 * `20260918000003` para esta mesma lista, nunca a serviu pelos dois motivos
 * acima, e por grep em `src/` não tem leitor nenhum hoje. A `20261019000003`
 * explica por que ele não foi derrubado junto.
 *
 * ## SEM CIDADE A CONSULTA LÊ O PAÍS INTEIRO, E O ÍNDICE SÓ COBRE A PÁGINA
 *
 * `city` perdeu o `required: true` no contrato em 19/10/2026 (pedido do
 * cliente: *"o campo cidade do filtro da página pet não deve ser obrigatório,
 * mas devemos filtrar pelos 20 últimos pets cadastrados"*), então a ausência de
 * cidade é geografia aberta e o predicado de `last_seen_city` deixa de existir.
 *
 * Medido, e não estimado — mesma imagem pinada do `compose.yaml`, as 76
 * migrações aplicadas por `node-pg-migrate`, **20 000 casos abertos públicos em
 * 40 cidades** (500 em `Sao Paulo`) por 720 dias, `ANALYZE` feito,
 * `EXPLAIN (ANALYZE, BUFFERS)` do SQL que ESTE construtor compila (impresso
 * pelo próprio construtor, não reescrito à mão):
 *
 * ```
 * ANTES da 20261019000008
 *   página 1, sem cidade   Seq Scan    20 000 linhas  60 800 buffers  61,933 ms
 *   contagem, sem cidade   Seq Scan    20 000 linhas  60 751 buffers  54,372 ms
 * DEPOIS da 20261019000008
 *   página 1, sem cidade   Index Scan      20 linhas     169 buffers   2,391 ms
 *   contagem, sem cidade   Seq Scan    20 000 linhas  60 751 buffers  54,372 ms
 * com cidade (inalterado, pela 20261019000003)
 *   página 1, Sao Paulo    Index Scan      20 linhas     145 buffers   0,232 ms
 * ```
 *
 * **Leia as duas linhas de contagem: elas são idênticas.** O índice
 * `lost_cases_publicos_por_visto` resolve a PÁGINA e não a CONTAGEM, e isso não
 * é escolha ruim de colunas — `count(*)` sobre geografia aberta visita toda
 * linha que qualifica, e `conta_habilitada` (STABLE, e por isso inelegível para
 * `WHERE` de índice) corre uma vez por linha. Com cidade ela corria 500 vezes;
 * sem cidade, 20 000. O `total` não é opcional: `PublicLostPetPage` o declara
 * `required` porque a tela diz "Mostrando 1 a 20 de 87".
 *
 * **E em homologação nada disso aparece**: `lost_cases` tem 1 linha lá (medido
 * em 19/10/2026), o plano é `Seq Scan` com 104 buffers e 0,619 ms, e `Seq Scan`
 * é a escolha CERTA com uma linha. Quem medir só em homologação concluirá que o
 * índice é inerte, e concluirá errado.
 *
 * **CUSTO MEDIDO E NÃO ESCONDIDO:** não existe índice trigrama sobre
 * `texto_para_busca(pets.name)`. Com `q` preenchido, o predicado é uma
 * varredura dos casos abertos da cidade — que é um conjunto pequeno, porque os
 * três predicados de publicação vêm antes dele. A operação declara
 * `x-effects: [expensive_query]` e tem teto próprio por `[ip, q]` no contrato,
 * que é a contenção que existe hoje. Criar o índice é uma migração, e migração
 * não entrou neste trabalho.
 */
import { sql, type SqlBool } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { StatusDoPet } from '../../../../shared/db/schema.js';
import {
  DIAS_DO_SELO_DE_REENCONTRO,
  type JanelaDePerdidos,
  type ListagemPublicaDePerdidos,
  type PaginaDePerdidos,
  type PerdidoPublico,
  type RecorteDePerdidos,
} from '../../ports/listagem-publica-de-perdidos.js';

/** Pet nesses estados não tem mais caso público, mesmo com o caso aberto. */
const STATUS_DE_PET_SEM_CASO_PUBLICO: readonly StatusDoPet[] = ['deceased', 'archived'];

/** Quantas horas cada janela do contrato vale. */
const HORAS_DA_JANELA: Readonly<Record<JanelaDePerdidos, number>> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

/**
 * O início da janela, contado do relógio da aplicação e nunca do `now()` do
 * banco: dois relógios na mesma decisão é o defeito que faz teste de carga
 * falhar sozinho em múltiplo comum.
 */
export function inicioDaJanela(agora: Date, janela: JanelaDePerdidos): Date {
  return new Date(agora.getTime() - HORAS_DA_JANELA[janela] * 60 * 60 * 1000);
}

/**
 * O INÍCIO DA JANELA DO SELO: `agora - 30 dias`, e o selo vale para o caso cujo
 * `closed_at` é **maior ou igual** a este instante.
 *
 * Mesmo relógio de [inicioDaJanela] e pelo mesmo motivo, que o cabeçalho desta
 * seção já escreve: o instante vem da aplicação e nunca do `now()` do banco.
 * Dois relógios na mesma decisão é o defeito que faz carga falhar sozinha em
 * múltiplo comum — e aqui ele seria pior que na janela de `period`, porque este
 * predicado decide se um pet aparece ou não numa superfície pública.
 *
 * **Predicado, e não estado gravado.** A alternativa era uma coluna
 * `selo_expira_em` virada por varredura, e ela custa um agendador que falha
 * calado: no dia em que a varredura não roda, o selo continua na rua. O
 * predicado não tem dia em que não roda.
 */
export function inicioDaJanelaDoSelo(agora: Date): Date {
  return new Date(agora.getTime() - DIAS_DO_SELO_DE_REENCONTRO * 24 * 60 * 60 * 1000);
}

/**
 * A consulta base: os quatro predicados de publicação e as junções.
 *
 * Exportada porque o teste do SQL compilado a lê, e porque a contagem do
 * `total` tem de usar **exatamente** os mesmos predicados da página. Dois
 * construtores separados divergiriam no dia em que alguém mexesse em um só, e a
 * tela diria "1 a 20 de 87" sobre um recorte diferente do que ela desenhou.
 */
export function construtorDaListagemPublicaDePerdidos(
  db: DbExecutor,
  recorte: RecorteDePerdidos,
) {
  const comAsJuncoes = db
    .selectFrom('lost_cases')
    .innerJoin('pets', 'pets.id', 'lost_cases.pet_id')
    .leftJoin('ref_breeds', 'ref_breeds.code', 'pets.breed_code')
    .leftJoin('ref_colors', 'ref_colors.code', 'pets.primary_color_code')
    // A foto principal PRONTA. O índice `pet_photos_uma_principal` garante no
    // máximo uma linha, então a junção não multiplica o caso.
    .leftJoin('pet_photos', (juncao) =>
      juncao
        .onRef('pet_photos.pet_id', '=', 'pets.id')
        .on('pet_photos.is_primary', '=', true)
        .on('pet_photos.status', '=', 'ready')
        .on('pet_photos.deleted_at', 'is', null),
    );

  // 1. O ESTADO DO CASO, e ele é um RAMO e não um filtro (decisão do cliente de
  //    20/10/2026: *"o pet ganha um selo/filtro na pagina de pets como
  //    encontrado por 30 dias e depois ele expira e sai"*).
  //
  // **O ramo `aberto` ocupa a posição EXATA do predicado que estava escrito
  // aqui**, e isso não é capricho de diagramação: com ele nesta posição, o SQL
  // compilado do conjunto de casos abertos é IDÊNTICO, caractere por caractere,
  // ao de antes desta mudança — mesmos predicados, mesma ordem, mesmos
  // parâmetros. A lista que a vizinhança abre para achar o animal que sumiu é a
  // consulta mais cara de mexer deste produto, e a forma de não mexer nela é
  // essa. `selo-de-reencontro-na-listagem.test.ts` compara os dois textos.
  //
  // O ramo `reencontrado` acrescenta TRÊS predicados, e os três são obrigatórios
  // juntos — um sem o outro é um selo errado numa superfície pública:
  //
  //   a) `status = 'closed_reunited'`. Encerramento `not_found` e `false_alarm`
  //      não entram em janela nenhuma: `not_found` é a busca que não acabou bem,
  //      e `false_alarm` é o caso que nunca existiu.
  //   b) `closed_at >= agora - 30 dias`, do relógio da APLICAÇÃO.
  //   c) EXISTE conversa ligada ao caso. É o sinal da comunidade, e ele cobre os
  //      DOIS caminhos que o cliente nomeou — *"depois de um usuario ter
  //      escaneado a tag do usuario ou ter entrado em contato"*: a conversa de
  //      `scan_notice` nasce da plaquinha lida que virou aviso ao tutor, e a de
  //      `found_notice` nasce do achado avulso que o tutor CONFIRMOU. São os
  //      dois únicos chamadores de `abrirPorAviso` (`src/bin/api.ts`), e o
  //      `INSERT` dos dois exige `pets.owner_user_id IS DISTINCT FROM` quem
  //      avisa — então tutor que lê a própria plaquinha **não** produz selo.
  //
  // `tag_scans` NÃO é o sinal, e a diferença decide se o selo mente: aquela
  // tabela grava a leitura da página, sem conta, sem identidade e sem mensagem.
  // Ela conta o próprio tutor, o robô que pré-visualiza o link e quem abriu por
  // curiosidade. A própria tabela já separa as duas coisas, na coluna
  // `resulted_in_found_report`.
  //
  // `resolution.reunion_channel` também não participa: o enum existe em
  // `LostCaseClosure` e NENHUMA tela o preenche — medido em 20/10/2026, nulo em
  // todo o dado. Decidir por ele seria decidir por um campo vazio.
  const comOEstado =
    recorte.conjunto === 'aberto'
      ? comAsJuncoes.where('lost_cases.status', '=', 'open')
      : comAsJuncoes
          .where('lost_cases.status', '=', 'closed_reunited')
          .where('lost_cases.closed_at', '>=', inicioDaJanelaDoSelo(recorte.agora))
          .where((eb) =>
            eb.exists(
              eb
                .selectFrom('conversations')
                .whereRef('conversations.case_id', '=', 'lost_cases.id')
                .select('conversations.id'),
            ),
          );

  let consulta = comOEstado
    // 2. O tutor deixou o caso aparecer na LISTA. O link dele continua valendo
    //    de qualquer forma: quem decide isso é a leitura por token, que de
    //    propósito não tem este predicado.
    .where('lost_cases.share_to_public_list', '=', true)
    // 3. Conta desabilitada sai da superfície pública.
    .where(sql<SqlBool>`conta_habilitada(lost_cases.owner_user_id)`)
    // 4. O pet existe e não está falecido nem arquivado.
    .where('pets.deleted_at', 'is', null)
    .where('pets.status', 'not in', STATUS_DE_PET_SEM_CASO_PUBLICO);

  // A CIDADE É CONDICIONAL DESDE 19/10/2026, e a condição é o pedido do
  // cliente: *"o campo cidade do filtro da página pet não deve ser
  // obrigatório"*. Cidade indefinida é geografia ABERTA, e geografia aberta é a
  // AUSÊNCIA deste predicado — não um `LIKE '%'` nem um `IS NOT NULL`, que
  // pareceriam o mesmo e continuariam carregando uma comparação por linha.
  //
  // É a mesma forma da janela logo abaixo, e a simetria não é estética: os dois
  // predicados opcionais desta consulta aparecem e desaparecem pelo mesmo
  // teste (`!== undefined`), então quem lê um entende o outro.
  if (recorte.cidade !== undefined) {
    consulta = consulta.where(
      sql<SqlBool>`texto_para_busca(lost_cases.last_seen_city) = texto_para_busca(${recorte.cidade})`,
    );
  }

  // A JANELA É CONDICIONAL, e a condição é o pedido do cliente de 18/10/2026:
  // *"a página de pets não deve trazer nenhum item do filtro por padrão, como
  // está atualmente por últimos 30 dias"*. Janela indefinida é janela ABERTA, e
  // janela aberta é a AUSÊNCIA deste predicado — não um `>= epoch`, que
  // pareceria o mesmo e continuaria carregando uma comparação de data por
  // linha para o planejador considerar.
  //
  // Quando há janela, ela é sobre `last_seen_at` — que é quando o animal foi
  // visto, e é o mesmo campo que a tela mostra. O contrato chamava a janela de
  // "desde a abertura do caso"; `opened_at` faria "últimas 24 h" esconder o
  // caso aberto hoje de um animal visto anteontem, que é o oposto do que quem
  // procura precisa ver.
  if (recorte.janela !== undefined) {
    consulta = consulta.where(
      'lost_cases.last_seen_at',
      '>=',
      inicioDaJanela(recorte.agora, recorte.janela),
    );
  }

  const bairro = recorte.bairro?.trim();
  if (bairro !== undefined && bairro !== '') {
    consulta = consulta.where(
      sql<SqlBool>`texto_para_busca(lost_cases.last_seen_neighborhood) = texto_para_busca(${bairro})`,
    );
  }
  if (recorte.especie !== undefined) {
    consulta = consulta.where('pets.species_code', '=', recorte.especie);
  }
  if (recorte.porte !== undefined) {
    consulta = consulta.where('pets.size_code', '=', recorte.porte);
  }
  const termo = recorte.termo?.trim();
  if (termo !== undefined && termo !== '') {
    consulta = consulta.where(
      sql<SqlBool>`texto_para_busca(pets.name) LIKE padrao_de_busca(${termo})`,
    );
  }
  return consulta;
}

export function criarListagemPublicaDePerdidos(db: Db): ListagemPublicaDePerdidos {
  return {
    async listar(recorte: RecorteDePerdidos): Promise<PaginaDePerdidos> {
      const base = construtorDaListagemPublicaDePerdidos(db, recorte);

      const contagem = await base
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirst();
      const total = Number(contagem?.total ?? 0);

      const linhas = await base
        .select([
          'lost_cases.share_token as share_token',
          'lost_cases.last_seen_at as last_seen_at',
          'lost_cases.last_seen_city as last_seen_city',
          'lost_cases.last_seen_neighborhood as last_seen_neighborhood',
          'pets.name as name',
          'pets.species_code as species_code',
          'pets.size_code as size_code',
          'pets.breed_free_text as breed_free_text',
          'ref_breeds.label as breed_label',
          'ref_colors.label as color_label',
          'pet_photos.thumb_key as thumb_key',
        ])
        // Mais recente primeiro: quem procura quer o que sumiu agora. O
        // `share_token` é o desempate, e ele existe para a página 2 não repetir
        // nem pular caso quando dois casos têm o mesmo `last_seen_at` — sem
        // desempate estável, `OFFSET` devolve ordem arbitrária entre iguais.
        .orderBy('lost_cases.last_seen_at', 'desc')
        .orderBy('lost_cases.share_token', 'asc')
        .limit(recorte.limite)
        .offset((recorte.pagina - 1) * recorte.limite)
        .execute();

      return {
        total,
        itens: linhas.map(
          (linha): PerdidoPublico => ({
            shareToken: linha.share_token,
            petNome: linha.name,
            especie: linha.species_code,
            porte: linha.size_code,
            // A raça da lista quando há código; o texto do tutor quando não há.
            // Mesma regra de `kysely-leitura-publica-do-caso.ts`.
            racaRotulo: linha.breed_label ?? linha.breed_free_text,
            corRotulo: linha.color_label,
            vistoPorUltimoEm: linha.last_seen_at,
            cidade: linha.last_seen_city,
            bairro: linha.last_seen_neighborhood,
            chaveDaFoto: linha.thumb_key,
            // O SELO. Ele não é lido de coluna nenhuma e não é eco do pedido: no
            // ramo `reencontrado` a existência da conversa é predicado do
            // `WHERE` logo acima, então todo item deste conjunto a tem, e no ramo
            // `aberto` o selo não tem significado. Avaliar o `EXISTS` por linha
            // também no ramo aberto seria custo novo na consulta que a
            // vizinhança abre, pago por um valor que já se sabe.
            //
            // O que sustenta a frase "todo item deste conjunto a tem" é a isca
            // de SQL compilado: `selo-de-reencontro-na-listagem.test.ts` cobra o
            // `EXISTS` e os outros dois predicados do ramo, por nome.
            encontradoPelaComunidade: recorte.conjunto === 'reencontrado',
          }),
        ),
      };
    },
  };
}
