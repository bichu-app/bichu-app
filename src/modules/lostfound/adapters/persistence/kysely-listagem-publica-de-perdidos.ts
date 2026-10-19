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
 * O índice que resolve FOI MEDIDO e NÃO EXISTE (criá-lo é migração, e migração
 * carimbada não entrou neste trabalho):
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
 * A contenção enquanto o índice não existe são os três tetos por `ip` da
 * operação e a paginação de 20, que o contrato já declara.
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
import type {
  JanelaDePerdidos,
  ListagemPublicaDePerdidos,
  PaginaDePerdidos,
  PerdidoPublico,
  RecorteDePerdidos,
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
  let consulta = db
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
    )
    // 1. O caso está aberto.
    .where('lost_cases.status', '=', 'open')
    // 2. O tutor deixou o caso aparecer na LISTA. O link dele continua valendo
    //    de qualquer forma: quem decide isso é a leitura por token, que de
    //    propósito não tem este predicado.
    .where('lost_cases.share_to_public_list', '=', true)
    // 3. Conta desabilitada sai da superfície pública.
    .where(sql<SqlBool>`conta_habilitada(lost_cases.owner_user_id)`)
    // 4. O pet existe e não está falecido nem arquivado.
    .where('pets.deleted_at', 'is', null)
    .where('pets.status', 'not in', STATUS_DE_PET_SEM_CASO_PUBLICO)
    .where(
      sql<SqlBool>`texto_para_busca(lost_cases.last_seen_city) = texto_para_busca(${recorte.cidade})`,
    );

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
          }),
        ),
      };
    },
  };
}
