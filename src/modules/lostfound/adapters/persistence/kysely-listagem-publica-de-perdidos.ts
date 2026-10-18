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
    // A janela, sobre `last_seen_at` — que é quando o animal foi visto, e é o
    // mesmo campo que a tela mostra. O contrato chama a janela de "desde a
    // abertura do caso"; `opened_at` faria "últimas 24 h" esconder o caso
    // aberto hoje de um animal visto anteontem, que é o oposto do que quem
    // procura precisa ver.
    .where('lost_cases.last_seen_at', '>=', inicioDaJanela(recorte.agora, recorte.janela))
    .where(
      sql<SqlBool>`texto_para_busca(lost_cases.last_seen_city) = texto_para_busca(${recorte.cidade})`,
    );

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
