/**
 * A persistência da **busca de pessoas**. **Toda autorização está na cláusula
 * `WHERE`** (ADR-0021), e os predicados são os MESMOS seis de
 * `construtorDoPerfilPorApelido`.
 *
 * ## Por que os seis predicados importam MAIS aqui que no perfil
 *
 * No perfil, quem chama já tem um apelido na mão e a resposta é uma pessoa. Aqui
 * a resposta é uma **lista**, e uma lista que incluísse quem bloqueou quem busca
 * entregaria, de uma vez, exatamente o que o bloqueio existe para negar — e
 * entregaria por diferença: quem some da lista de hoje e estava na de ontem
 * bloqueou você. Por isso os seis predicados não são copiados para cá por
 * simetria estética; eles são a razão pela qual **esta busca não é um oráculo**.
 *
 * Os seis, na ordem em que a consulta os escreve:
 *
 * 1. `h.kind = 'pessoa'` — **apelido de PET e apelido RESERVADO não entram na
 *    busca.** O espaço de nomes é compartilhado (`20261018000021`); sem este
 *    predicado a busca viraria um oráculo de "este apelido existe e é de um
 *    pet", e devolveria o pet de alguém como se fosse gente;
 * 2. `conta_habilitada(u.id)` — decisão do cliente de 17/10: conta desabilitada
 *    *"não é mais encontrada em nenhuma página ou funcionalidade"*. **Busca é
 *    literalmente "ser encontrada"**, então este predicado é o caso central
 *    daquela frase e não uma aplicação dela por analogia;
 * 3. `conta_habilitada(quemBusca)` — o outro lado também: quem desabilitou a
 *    própria conta não busca ninguém;
 * 4. `NOT bloqueio_entre(u.id, quemBusca)` — **simétrico**. Se qualquer um dos
 *    dois bloqueou o outro, a pessoa não aparece;
 * 5. `NOT perfil_ocultado_para_quem_denunciou(u.public_ref, quemBusca)` — quem
 *    denunciou um perfil não volta a vê-lo, e a promessa da tela é literal:
 *    *"Você não vai mais ver este conteúdo"*. Uma busca que o devolvesse
 *    desfaria a promessa no lugar mais fácil de chegar;
 * 6. `u.id <> quemBusca` — **a própria pessoa não aparece na própria busca.**
 *    Não é cosmético: o único botão de um resultado é "adicionar", e a conta não
 *    se conecta consigo mesma (`user_connections_nao_e_consigo`). Aparecer com
 *    um botão que só pode falhar é pior que não aparecer.
 *
 * ## `bloqueio_entre` na cláusula `WHERE`, e NÃO o `LeitorDeBloqueio`
 *
 * O módulo `connections` declara `LeitorDeBloqueio`, e a fiação de produção liga
 * `semBloqueioConhecido` — que **devolve `false` para todo par**. Aquele
 * comentário diz que `user_blocks` não existe em `origin/development`, e isso
 * **deixou de ser verdade**: a migração `20261018000031` cria a tabela e a
 * função `bloqueio_entre`, e a `20261018000032` cria
 * `perfil_ocultado_para_quem_denunciou`. As duas estão em
 * `origin/development` (`70f4aa34`, conferido em 20/10/2026).
 *
 * Usar a porta aqui faria o bloqueio ser ignorado em silêncio, porque a
 * implementação ligada hoje responde "não há bloqueio" a qualquer pergunta. A
 * função SQL na cláusula `WHERE` é o que `people` já faz para o perfil, é o que
 * a própria `src/architecture.rules.mjs` registra para este módulo, e é o único
 * arranjo em que o predicado não depende de alguém ter trocado uma linha de
 * fiação.
 *
 * ## O que NÃO é selecionado, e a ausência é a defesa
 *
 * **Nenhuma coluna de foto.** `catalog_images` e `user_showcase_images` não
 * aparecem em `JOIN` nem em subconsulta nenhuma deste arquivo, e é isso que a
 * emenda 5 item 2 do ADR-0010 cobra: o rosto não sai para quem não é conexão
 * aceita, e resultado de busca é por construção lista de não-conexões.
 *
 * **Nenhum `users.id` e nenhum `public_ref`.** Ao contrário do perfil, a busca
 * não precisa de `users.id` — ela não pergunta a conexão a módulo nenhum, porque
 * o resultado não traz `connection_state` — e não precisa de `public_ref`,
 * porque não hospeda denunciar nem bloquear. O que não é selecionado não tem
 * como vazar.
 *
 * **Nenhuma coluna de pet além da contagem**, e as duas contagens são
 * subconsultas correlacionadas e não `LEFT JOIN` com `GROUP BY` — a razão está
 * escrita em `kysely-perfil-de-pessoa.ts` e é de vazamento, não de desempenho:
 * com junção, `p.name` fica a um caractere de distância de quem mexer aqui.
 *
 * ## Por que `texto_para_busca` e não normalização em TypeScript
 *
 * A `20260928000006` já respondeu: o índice é construído sobre **uma** expressão
 * e o predicado precisa ser a **mesma** expressão, caractere a caractere, ou o
 * planejador não casa os dois e o índice fica de enfeite. Duas definições da
 * mesma normalização divergem **sem erro**, só ficando lentas. `padrao_de_busca`
 * entra pela mesma porta, e ela é o que neutraliza `%` e `_` do termo — sem
 * isso, `q=%` é uma consulta legítima que devolve a tabela de contas inteira.
 */
import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  BuscaDePessoasRepository,
  PaginaDeBuscaDePessoas,
  PessoaEncontrada,
} from '../../ports/busca-de-pessoas-repository.js';

interface LinhaDaBusca {
  readonly handle: string;
  readonly display_name: string | null;
  readonly pets_count: string | number;
  readonly connections_count: string | number;
  readonly total: string | number;
}

/**
 * **A busca, com os seis predicados e o casamento por nome OU apelido.**
 *
 * O `OR` é entre as duas expressões normalizadas, e cada uma tem o seu índice
 * trigrama (`users_busca_por_nome` e `handles_busca_por_apelido`, migração
 * `20261020000012`). O planejador resolve um `OR` de dois índices por
 * `BitmapOr`, que é exatamente o arranjo que estes dois índices servem.
 *
 * **`display_name` é anulável, e `texto_para_busca` é `STRICT`** — então
 * `texto_para_busca(NULL)` é `NULL`, e `NULL LIKE padrão` é `NULL`, que em
 * `WHERE` não é verdadeiro. A consequência é correta e vale dita: quem não
 * preencheu nome é achável **pelo apelido** e não pelo nome, em vez de
 * desaparecer da busca ou de derrubar a consulta.
 *
 * **O total vem na mesma consulta**, por `count(*) OVER ()`, e não numa segunda
 * chamada: duas consultas com os mesmos seis predicados são duas chances de os
 * predicados divergirem, e a página e o total discordariam sem nada acusar — o
 * mesmo motivo que `contagem-de-entradas-conta-o-que-o-diretorio-mostra.test.ts`
 * defende no diretório.
 *
 * **A ordenação é por nome e depois por apelido**, e não por relevância: nota de
 * relevância ordenaria pessoas por quão bem elas casam um termo, o que é um
 * sinal sobre gente que ninguém pediu. `handle` é único, então a ordem é total e
 * a paginação não repete nem perde linha entre páginas.
 */
export function construtorDaBuscaDePessoas(
  db: Kysely<Database>,
  termo: string,
  quemBusca: UserId,
  pagina: number,
  limite: number,
): CompiledQuery<LinhaDaBusca> {
  return db
    .selectFrom('handles as h')
    .innerJoin('users as u', 'u.id', 'h.user_id')
    .select(['h.handle as handle', 'u.display_name as display_name'])
    .select(
      sql<number>`(SELECT count(*) FROM pets p
         WHERE p.owner_user_id = u.id AND p.deleted_at IS NULL)`.as('pets_count'),
    )
    .select(
      sql<number>`(SELECT count(*) FROM user_connections uc
         WHERE uc.state = 'accepted'
           AND (uc.requester_user_id = u.id OR uc.addressee_user_id = u.id)
           AND conta_habilitada(uc.requester_user_id)
           AND conta_habilitada(uc.addressee_user_id))`.as('connections_count'),
    )
    .select(sql<number>`count(*) OVER ()`.as('total'))
    // O casamento: nome OU apelido, as duas pela MESMA normalização do índice.
    .where(
      sql<boolean>`(texto_para_busca(u.display_name) LIKE padrao_de_busca(${termo})
                 OR texto_para_busca(h.handle::text) LIKE padrao_de_busca(${termo}))`,
    )
    // Os seis. Nenhum é dispensável -- ver o cabeçalho.
    .where('h.kind', '=', 'pessoa')
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${quemBusca}::uuid)`)
    .where(sql<boolean>`NOT bloqueio_entre(u.id, ${quemBusca}::uuid)`)
    .where(
      sql<boolean>`NOT perfil_ocultado_para_quem_denunciou(u.public_ref, ${quemBusca}::uuid)`,
    )
    .where(sql<boolean>`u.id <> ${quemBusca}::uuid`)
    .orderBy('u.display_name', 'asc')
    .orderBy('h.handle', 'asc')
    .limit(limite)
    .offset((pagina - 1) * limite)
    .compile();
}

function comoPessoa(linha: LinhaDaBusca): PessoaEncontrada {
  return {
    handle: linha.handle,
    displayName: linha.display_name,
    // `count(*)` do Postgres e `bigint`, e o driver o entrega como CADEIA. A
    // conversao e da borda do banco: deixa-la subir faria `pets_count` sair como
    // `"3"` no JSON, que o contrato declara `integer` e que **nenhum portao
    // deste repositorio pega**, porque nenhum confere o CORPO da resposta.
    petsCount: Number(linha.pets_count),
    connectionsCount: Number(linha.connections_count),
  };
}

export function criarBuscaDePessoasRepository(db: Kysely<Database>): BuscaDePessoasRepository {
  return {
    async buscar(termo: string, quemBusca: UserId, pagina: number, limite: number) {
      const { rows } = await db.executeQuery(
        construtorDaBuscaDePessoas(db, termo, quemBusca, pagina, limite),
      );
      const pessoas = rows.map(comoPessoa);
      // `count(*) OVER ()` nao vem em pagina vazia -- nao ha linha que o
      // carregue. Zero e a leitura certa: pagina vazia de busca que nao casou
      // ninguem e pagina vazia alem do fim sao a mesma coisa para a tela, e
      // uma segunda consulta so para distinguir as duas custaria os mesmos
      // seis predicados de novo.
      const total = rows.length === 0 ? 0 : Number(rows[0]?.total ?? 0);
      const resultado: PaginaDeBuscaDePessoas = { itens: pessoas, total };
      return resultado;
    },
  };
}
