/**
 * A persistência do Mural. **Toda a autorização está na cláusula `WHERE`**
 * (ADR-0021), e não numa camada acima.
 *
 * ## Os construtores são exportados, e é de propósito
 *
 * Cada leitura tem um `construtorDe...` que devolve a consulta **compilada**. A
 * suíte unitária não tem banco: ela compila com o `DummyDriver` e **lê o SQL**,
 * que é o único jeito de provar que o predicado está no `WHERE` em vez de num
 * `if` que alguém esquece num caminho novo. É a forma que
 * `people/adapters/persistence/autorizacao-na-clausula-where.test.ts` e
 * `safety/adapters/persistence/bloqueio-e-ocultacao-na-clausula-where.test.ts`
 * já usam nesta casa.
 *
 * **Ler o SQL não prova que o Postgres se comporta como o texto diz.**
 * `conta_habilitada`, `bloqueio_entre` e
 * `publicacao_ocultada_para_quem_denunciou` são funções SQL das migrações
 * `20261017000013`, `20261018000031` e `20261018000032`, e o que elas fazem é
 * medido onde elas moram. Aqui se prova que esta camada as CHAMA, no `WHERE`,
 * em toda consulta — que é a metade que um refator quebra.
 *
 * ## O RECORTE DA LINHA DO TEMPO, por extenso
 *
 * Uma publicação chega a quem chama quando, e só quando:
 *
 * 1. ela está viva (`p.deleted_at IS NULL`);
 * 2. **ou** o autor é quem chama, **ou** existe aresta `accepted` entre os dois
 *    em `user_connections`, nos DOIS sentidos do par, com `conta_habilitada` nas
 *    duas pontas;
 * 3. não há `bloqueio_entre` o autor e quem chama (simétrico);
 * 4. quem chama não denunciou aquela publicação
 *    (`publicacao_ocultada_para_quem_denunciou`).
 *
 * Os quatro são `WHERE`. **Não há `CASE`, não há `UNION` e não há segunda
 * consulta** que escolha visibilidade: é por isso que `403` não existe nesta
 * fatia — não existe caminho que o produza.
 *
 * ## A FOTO DO AUTOR, e o predicado dela é o da própria linha do tempo
 *
 * **Emenda 5 do ADR-0010 (20/10/2026)**, decisão do cliente: *"tras a foto,
 * algo bem parecido com o instagram"*. Ela nasceu ausente, de propósito — a
 * Emenda 3 limitava a foto de pessoa a `Conversation.participants[]` *"e em
 * mais nenhuma resposta deste contrato"* —, a frente parou e perguntou, e a
 * emenda NOMEOU esta superfície.
 *
 * **O predicado da Emenda 3 não foi relaxado: ele é satisfeito por construção.**
 * A foto sai por `LEFT JOIN` sobre a imagem da PESSOA, e esse `JOIN` não carrega
 * predicado de conexão nenhum — porque não precisa: a linha que ele decora só
 * existe se o `WHERE` desta consulta já a admitiu, e o `WHERE` só admite autor
 * que é quem chama ou é conexão `accepted` dele. **Pôr o predicado no `JOIN`
 * seria a segunda cópia dele**, e segunda cópia é onde uma correção falta.
 *
 * O que o `JOIN` carrega são os três estados em que a foto não sai, e nenhum é
 * de autorização: `purpose = 'user_photo'` (T9), `status = 'ready'` (em
 * `processing` ela carrega o EXIF do celular, ADR-0010 item 4) e
 * `thumb_key IS NOT NULL`.
 *
 * **É a `thumb` de 176 e nunca a `card` de 512**, e a conta é a da própria
 * emenda: o ícone pinta 40 dp, 120 px reais a 3×; a de 176 cobre sem ampliar
 * (1,47×) e a de 512 seria 4,27× mais dado do que a célula pinta, vinte vezes
 * por página.
 *
 * **`construtorDasMinhasPublicacoes` continua sem ler foto de pessoa**, e a
 * omissão é o item 8 da Emenda 5: quem lê aquela lista é o autor, e repetir a
 * própria foto ali seria uma terceira superfície dela sem consumidor.
 */
import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import type { Database } from '../../../../shared/db/schema.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type { Instant, ObjectKey, UserId } from '../../../../shared/types/brands.js';
// `comoObjectKey` vem da PORTA de `media`, e não de `media/domain`: a fronteira
// da arquitetura proíbe importar domínio alheio, e copiar a conferência da forma
// da chave seria a segunda definição dela.
import {
  TRABALHO_DE_IMAGEM_DE_CATALOGO,
  comoObjectKey,
  type PropositoDaImagem,
} from '../../../media/ports/imagem-de-catalogo.js';
import { escreverCursor, type CursoDaLinhaDoTempo } from '../../domain/publicacao.js';
import type {
  ComentarioVisivel,
  ContagemDaReacao,
  EstadoDaFotoDaPublicacao,
  NovaPublicacao,
  PaginaDePublicacoes,
  PublicacaoDoDono,
  PublicacaoNaLinha,
  PublicacoesRepository,
  RecorteDaLinhaDoTempo,
  RecusaDaPublicacao,
} from '../../ports/publicacoes-repository.js';

/**
 * O propósito desta esteira, **tipado** por `PropositoDaImagem`.
 *
 * O tipo é o que impede um valor fora da lista fechada de propósitos de entrar
 * aqui em silêncio — e foi exatamente a divergência entre o propósito assinado e
 * o propósito gravado que, em 18/10/2026, fez `POST /me/showcase/photo-intents`
 * responder `201` e `PUT /me/showcase` responder `404` para a mesma `upload_id`.
 */
export const PROPOSITO_DA_PUBLICACAO: PropositoDaImagem = 'user_publication';

/** Só foto `ready` sai na linha do tempo: em `processing` ela carrega o EXIF. */
const FOTO_PRONTA = 'ready' as const;

/**
 * O propósito da foto ÚNICA da pessoa — a do autor, pela Emenda 5.
 *
 * **Tipado** por `PropositoDaImagem`, como `PROPOSITO_DA_PUBLICACAO`: um valor
 * fora da lista fechada não compila. É a mesma constante que
 * `people/adapters/persistence/kysely-perfil-de-pessoa.ts` escreve para a
 * vitrine, e pela mesma razão — adapter de outro módulo é o que a fronteira
 * proíbe importar, e copiar a conferência seria a segunda definição dela.
 */
const PROPOSITO_DA_FOTO_DE_PESSOA: PropositoDaImagem = 'user_photo';

/**
 * **O SELO DE VALIDADO do autor**, derivado no SQL a partir do alias `a`
 * (`users`), que as tres leituras de autor deste arquivo já têm.
 *
 * `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL` vem da
 * **FONTE ÚNICA** (`canalDeContatoConfirmadoNoSql`, em
 * `shared/db/canal-de-contato-confirmado.ts`). Este cabeçalho dizia antes que a
 * condição era *cópia* da de `kysely-canal-verificado-do-chamador.ts` e que a
 * cópia era deliberada; o motivo que ele dava — duas definições de "validado"
 * são duas réguas — era exatamente o motivo para a cópia **não** existir, e em
 * 21/10/2026 o cliente mandou unificar. Na prática isso é e-mail: nada em
 * `src/` grava `phone_verified_at`.
 *
 * **Escrito UMA vez e usado nas três leituras** (linha do tempo, lista de
 * comentários e o autor do comentário recém-criado). Três cópias da expressão
 * seriam três lugares onde uma correção pode faltar, e o cartão recém-criado
 * apareceria diferente dos outros da mesma lista — que é a razão escrita no
 * cabeçalho de `autorDoComentario`.
 *
 * **`COALESCE` não é necessário**, e o motivo está escrito na fonte única: `a`
 * vem de `INNER JOIN users`, então a linha existe.
 */
const CANAL_VERIFICADO_DO_AUTOR = canalDeContatoConfirmadoNoSql('a');

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A forma do endereço público, a mesma que o `CHECK` do banco cobra. */
const FORMA_DE_REF = /^[A-Za-z0-9_-]{22}$/;

interface LinhaDaMinhaPublicacao {
  readonly ref: string;
  readonly body: string;
  readonly created_at: Date;
  readonly alt_text: string | null;
  readonly upload_id: string | null;
  readonly status: EstadoDaFotoDaPublicacao | null;
  readonly public_key: string | null;
  readonly rejection_reason: string | null;
}

interface LinhaDoComentario {
  readonly ref: string;
  readonly body: string;
  readonly created_at: Date;
  readonly handle: string | null;
  readonly display_name: string;
  readonly autor_thumb_key: string | null;
  /** O selo de validado do autor. Ver [CANAL_VERIFICADO_DO_AUTOR]. */
  readonly canal_verificado: boolean;
  readonly minha: boolean;
}

interface LinhaDaLinhaDoTempo {
  readonly ref: string;
  readonly body: string;
  readonly created_at: Date;
  readonly alt_text: string | null;
  readonly public_key: string | null;
  readonly handle: string | null;
  readonly display_name: string;
  /** A `thumb` 176 da foto do AUTOR (Emenda 5). Nula nos tres estados do JOIN. */
  readonly autor_thumb_key: string | null;
  /** O selo de validado do autor. Ver [CANAL_VERIFICADO_DO_AUTOR]. */
  readonly canal_verificado: boolean;
  readonly minha: boolean;
  /**
   * `count(*)` do Postgres e `bigint`, e o driver o entrega como **CADEIA**.
   *
   * O tipo diz `string` de proposito, e a conversao acontece na projecao: deixar
   * `number` aqui faria o `Number` faltar e `like_count` sair como `"3"` no
   * JSON -- que o contrato declara `integer` e que **nenhum portao deste
   * repositorio pega**, porque nenhum confere o corpo da resposta. E o mesmo
   * defeito que `kysely-perfil-de-pessoa.ts` registra para `pets_count`.
   */
  readonly like_count: string;
  readonly comment_count: string;
  readonly liked_by_me: boolean;
}

/**
 * O par `(created_at, public_ref)` estritamente ANTERIOR ao cursor.
 *
 * Comparação de LINHA (`(a, b) < (c, d)`) e não dois predicados soltos: dois
 * predicados `AND` recusariam a linha seguinte quando o instante empata, e a
 * página seguinte começaria depois dela. A comparação de linha do Postgres é
 * lexicográfica e é exatamente a ordem do índice
 * `user_publications_da_linha_do_tempo`.
 */
function antesDoCursor(curso: CursoDaLinhaDoTempo) {
  return sql<boolean>`(p.created_at, p.public_ref) < (${comoData(curso.antesDe)}::timestamptz, ${curso.ref})`;
}

/**
 * AS MINHAS PUBLICAÇÕES. `author_user_id = dono` no `WHERE`, e nada mais —
 * **ela não depende de conexão**, e é isso que a torna a leitura que distingue
 * "não tenho conexão" de "ninguém publicou".
 *
 * `LEFT JOIN` na imagem e não `INNER`: a publicação de texto puro é o caso
 * comum, e um `INNER` a esconderia inteira.
 *
 * `c.purpose = 'user_publication'` junto do `JOIN`: imagem de outro propósito
 * não vira foto de publicação nem por engano de ligação (T9).
 */
export function construtorDasMinhasPublicacoes(
  db: Kysely<Database>,
  dono: UserId,
  recorte: RecorteDaLinhaDoTempo,
): CompiledQuery<LinhaDaMinhaPublicacao> {
  let consulta = db
    .selectFrom('user_publications as p')
    .leftJoin('catalog_images as c', (junta) =>
      junta.onRef('c.id', '=', 'p.image_id').on('c.purpose', '=', PROPOSITO_DA_PUBLICACAO),
    )
    .leftJoin('catalog_upload_intents as u', 'u.id', 'c.upload_intent_id')
    .select([
      'p.public_ref as ref',
      'p.body as body',
      'p.created_at as created_at',
      'p.alt_text as alt_text',
      'u.id as upload_id',
      'c.status as status',
      // A derivada `card` de 1024 x 1024, que é a ÚNICA desta foto. `thumb_key`
      // e `banner_key` não são lidos: não há grade no Mural e não há faixa de
      // borda a borda, e `DERIVADAS_DA_PUBLICACAO` por isso só declara `card`.
      'c.public_key as public_key',
      'c.rejection_reason as rejection_reason',
    ])
    .where('p.author_user_id', '=', dono)
    .where('p.deleted_at', 'is', null)
    .orderBy('p.created_at', 'desc')
    .orderBy('p.public_ref', 'desc')
    // `limite + 1` para saber se há página seguinte sem uma segunda consulta de
    // contagem. A linha extra é descartada e o cursor sai da última mantida.
    .limit(recorte.limite + 1);
  if (recorte.curso !== undefined) consulta = consulta.where(antesDoCursor(recorte.curso));
  return consulta.compile();
}

/**
 * A LINHA DO TEMPO. **Aqui mora o recorte inteiro**, e cada predicado tem uma
 * frase.
 *
 * `minha` sai como coluna calculada e não como comparação na tela: a tela não
 * tem o apelido de quem chama em toda rolagem, e comparar ali seria a
 * autorização migrando para o cliente.
 */
export function construtorDaLinhaDoTempo(
  db: Kysely<Database>,
  quemOlha: UserId,
  recorte: RecorteDaLinhaDoTempo,
): CompiledQuery<LinhaDaLinhaDoTempo> {
  let consulta = db
    .selectFrom('user_publications as p')
    .innerJoin('users as a', 'a.id', 'p.author_user_id')
    .leftJoin('handles as h', (junta) =>
      junta.onRef('h.user_id', '=', 'a.id').on('h.kind', '=', 'pessoa'),
    )
    // A FOTO DO AUTOR (Emenda 5 do ADR-0010). **Sem predicado de conexão
    // aqui**, e a ausência é a regra: a linha que este `JOIN` decora só existe
    // se o `WHERE` abaixo já a admitiu, e o `WHERE` só admite autor que é quem
    // chama ou é conexão `accepted` dele. Uma segunda cópia do predicado seria
    // o lugar onde uma correção pode faltar.
    //
    // `thumb_key` e NUNCA `public_key`: a `card` de 512 seria 4,27x mais dado
    // do que o ícone de 40 dp pinta, vinte vezes por página.
    .leftJoin('catalog_images as fa', (junta) =>
      junta
        .onRef('fa.id', '=', 'a.photo_image_id')
        .on('fa.purpose', '=', PROPOSITO_DA_FOTO_DE_PESSOA)
        .on('fa.status', '=', FOTO_PRONTA)
        .on(sql<boolean>`fa.thumb_key IS NOT NULL`),
    )
    // A foto entra só quando está `ready` E tem a derivada: foto em
    // `processing` carrega o EXIF do celular (ADR-0010 item 4), e servi-la
    // entregaria a coordenada de onde ela foi tirada. O predicado está no
    // `JOIN` e não num `if` da projeção: assim a coluna chega nula e não há
    // estado a desenhar — que é a razão de `PublicationPhoto` não ter `status`.
    .leftJoin('catalog_images as c', (junta) =>
      junta
        .onRef('c.id', '=', 'p.image_id')
        .on('c.purpose', '=', PROPOSITO_DA_PUBLICACAO)
        .on('c.status', '=', FOTO_PRONTA)
        .on(sql<boolean>`c.public_key IS NOT NULL`),
    )
    .select([
      'p.public_ref as ref',
      'p.body as body',
      'p.created_at as created_at',
      'p.alt_text as alt_text',
      'c.public_key as public_key',
      'h.handle as handle',
      'a.display_name as display_name',
      'fa.thumb_key as autor_thumb_key',
    ])
    .select(CANAL_VERIFICADO_DO_AUTOR.as('canal_verificado'))
    .select(sql<boolean>`p.author_user_id = ${quemOlha}::uuid`.as('minha'))
    // ------------------------------------------------------------------
    // AS CONTAGENS (20/10/2026, decisao do cliente de 19/10)
    // ------------------------------------------------------------------
    // **SUBCONSULTA, e nunca `LEFT JOIN` + `GROUP BY`.** Com a juncao, uma
    // publicacao com tres curtidas e dois comentarios viraria SEIS linhas e as
    // duas contagens sairiam multiplicadas uma pela outra -- o defeito classico
    // desta superficie, e ele nao da erro: da numero errado.
    //
    // **E NAO HA COLUNA DENORMALIZADA de contagem**, em tabela nenhuma. A
    // ausencia e a defesa: contagem guardada divirja das linhas no primeiro
    // caminho que esquecer de atualiza-la, e a divergencia nao aparece em teste
    // nenhum que nao conte as duas coisas. Aqui o numero E as linhas.
    .select(
      sql<string>`(SELECT count(*) FROM publication_likes pl
                    WHERE pl.publication_id = p.id)`.as('like_count'),
    )
    // `deleted_at IS NULL`: comentario apagado nao conta. E e por isso que
    // `deleteMyComment` devolve a contagem nova em vez de `204`.
    .select(
      sql<string>`(SELECT count(*) FROM publication_comments pc
                    WHERE pc.publication_id = p.id AND pc.deleted_at IS NULL)`.as('comment_count'),
    )
    // `liked_by_me`: um `EXISTS` sobre a CHAVE PRIMARIA inteira de
    // `publication_likes`. A tela nao tem como saber, e deixa-la adivinhar faria
    // o coracao piscar errado na primeira rolagem.
    .select(
      sql<boolean>`EXISTS (SELECT 1 FROM publication_likes pl
                            WHERE pl.publication_id = p.id
                              AND pl.user_id = ${quemOlha}::uuid)`.as('liked_by_me'),
    )
    .where('p.deleted_at', 'is', null)
    // ------------------------------------------------------------------
    // O RECORTE. Conexão aceita, OU o próprio autor.
    // ------------------------------------------------------------------
    // `EXISTS` sobre `user_connections` nos DOIS sentidos do par: a conexão é
    // simétrica, e quem pediu não decide quem vê. `conta_habilitada` nas duas
    // pontas pela mesma razão de toda leitura desta casa — conta desabilitada
    // "não é mais encontrada em nenhuma página ou funcionalidade".
    //
    // O `OR` com o próprio autor existe para que publicar e voltar ao Mural não
    // entregue o estado vazio. Ele é o ÚNICO ramo além da conexão, e é sobre
    // quem chama — não sobre um atributo da publicação.
    .where(
      sql<boolean>`(
        p.author_user_id = ${quemOlha}::uuid
        OR EXISTS (
          SELECT 1 FROM user_connections uc
           WHERE uc.state = 'accepted'
             AND ((uc.requester_user_id = p.author_user_id AND uc.addressee_user_id = ${quemOlha}::uuid)
               OR (uc.requester_user_id = ${quemOlha}::uuid AND uc.addressee_user_id = p.author_user_id))
             AND conta_habilitada(uc.requester_user_id)
             AND conta_habilitada(uc.addressee_user_id))
      )`,
    )
    // BLOQUEIO, simétrico. Bloquear desfaz a conexão, mas são duas escritas, e
    // este predicado cobre a corrida entre elas.
    .where(sql<boolean>`NOT bloqueio_entre(p.author_user_id, ${quemOlha}::uuid)`)
    // A OCULTAÇÃO IMEDIATA, por ARTEFATO: quem denunciou uma publicação não
    // volta a vê-la, mesmo continuando conexão de quem a publicou. É o que faz
    // a denúncia valer sem prazo prometido — porque não temos prazo.
    .where(
      sql<boolean>`NOT publicacao_ocultada_para_quem_denunciou(p.public_ref, ${quemOlha}::uuid)`,
    )
    .orderBy('p.created_at', 'desc')
    .orderBy('p.public_ref', 'desc')
    .limit(recorte.limite + 1);
  if (recorte.curso !== undefined) consulta = consulta.where(antesDoCursor(recorte.curso));
  return consulta.compile();
}

/**
 * O `UPDATE` que apaga, **com o autor na cláusula**.
 *
 * `author_user_id = dono` e `deleted_at IS NULL` juntos: publicação de outra
 * conta, endereço inexistente e publicação já apagada não são atingidos, e os
 * três viram o mesmo `404`. Sem o autor na cláusula bastaria o endereço — e o
 * endereço é o que `reportPublication` entrega a quem denuncia.
 */
export function construtorDoApagar(
  db: Kysely<Database>,
  dono: UserId,
  ref: string,
  agora: Instant,
): CompiledQuery<unknown> {
  return db
    .updateTable('user_publications')
    .set({ deleted_at: comoData(agora) })
    .where('public_ref', '=', ref)
    .where('author_user_id', '=', dono)
    .where('deleted_at', 'is', null)
    .compile();
}

/**
 * A PUBLICACAO VISIVEL A QUEM CHAMA, resolvida pelo endereco publico.
 *
 * **O MESMO recorte da linha do tempo, numa funcao so**, e e esta funcao que
 * curtir, descurtir, comentar e listar comentario chamam. Quatro copias do
 * predicado seriam quatro lugares onde uma correcao pode faltar -- e foi
 * exatamente essa aritmetica que fez `bloqueio_entre` existir como funcao SQL em
 * vez de expressao repetida em Kysely.
 *
 * Devolve `undefined` para endereco inexistente, publicacao apagada e
 * publicacao de quem nao tem relacao com quem chama. **Os tres sao o MESMO
 * `undefined`**, e a borda os transforma no mesmo `404` -- nunca `403`.
 */
export function construtorDaPublicacaoVisivel(
  db: Kysely<Database>,
  ref: string,
  quemOlha: UserId,
): CompiledQuery<{ readonly id: string }> {
  return db
    .selectFrom('user_publications as p')
    .select('p.id as id')
    .where('p.public_ref', '=', ref)
    .where('p.deleted_at', 'is', null)
    .where(
      sql<boolean>`(
        p.author_user_id = ${quemOlha}::uuid
        OR EXISTS (
          SELECT 1 FROM user_connections uc
           WHERE uc.state = 'accepted'
             AND ((uc.requester_user_id = p.author_user_id AND uc.addressee_user_id = ${quemOlha}::uuid)
               OR (uc.requester_user_id = ${quemOlha}::uuid AND uc.addressee_user_id = p.author_user_id))
             AND conta_habilitada(uc.requester_user_id)
             AND conta_habilitada(uc.addressee_user_id))
      )`,
    )
    .where(sql<boolean>`NOT bloqueio_entre(p.author_user_id, ${quemOlha}::uuid)`)
    .where(
      sql<boolean>`NOT publicacao_ocultada_para_quem_denunciou(p.public_ref, ${quemOlha}::uuid)`,
    )
    .compile();
}

/**
 * OS COMENTARIOS de uma publicacao, **mais ANTIGO primeiro**.
 *
 * A ordem e o inverso da linha do tempo, e e deliberado: comentario se le na
 * ordem em que a conversa aconteceu.
 *
 * **`NOT bloqueio_entre(autor_do_comentario, quem chama)` esta aqui**, e hoje
 * ele e a unica ferramenta que a pessoa tem sobre um comentario alheio: a
 * denuncia de comentario nao existe (ver o cabecalho da migracao
 * `20261020000006`). Bloquear o autor some com os comentarios dele.
 *
 * **O recorte da PUBLICACAO nao se repete aqui**: quem chama esta consulta ja
 * resolveu o alvo por `construtorDaPublicacaoVisivel`, e recebe o `id` interno.
 */
export function construtorDosComentarios(
  db: Kysely<Database>,
  publicacaoId: string,
  quemOlha: UserId,
  recorte: RecorteDaLinhaDoTempo,
): CompiledQuery<LinhaDoComentario> {
  let consulta = db
    .selectFrom('publication_comments as k')
    .innerJoin('users as a', 'a.id', 'k.author_user_id')
    .leftJoin('handles as h', (junta) =>
      junta.onRef('h.user_id', '=', 'a.id').on('h.kind', '=', 'pessoa'),
    )
    // A foto do autor do COMENTARIO, pela Emenda 5: e a mesma pessoa, o mesmo
    // schema (`PublicationAuthor`) e a mesma derivada. Sem predicado de conexao
    // no `JOIN`, pela mesma razao do irmao da linha do tempo.
    .leftJoin('catalog_images as fa', (junta) =>
      junta
        .onRef('fa.id', '=', 'a.photo_image_id')
        .on('fa.purpose', '=', PROPOSITO_DA_FOTO_DE_PESSOA)
        .on('fa.status', '=', FOTO_PRONTA)
        .on(sql<boolean>`fa.thumb_key IS NOT NULL`),
    )
    .select([
      'k.public_ref as ref',
      'k.body as body',
      'k.created_at as created_at',
      'h.handle as handle',
      'a.display_name as display_name',
      'fa.thumb_key as autor_thumb_key',
    ])
    .select(CANAL_VERIFICADO_DO_AUTOR.as('canal_verificado'))
    .select(sql<boolean>`k.author_user_id = ${quemOlha}::uuid`.as('minha'))
    .where('k.publication_id', '=', publicacaoId)
    .where('k.deleted_at', 'is', null)
    // Ver o cabecalho: hoje a unica ferramenta da pessoa sobre comentario alheio.
    .where(sql<boolean>`NOT bloqueio_entre(k.author_user_id, ${quemOlha}::uuid)`)
    .orderBy('k.created_at', 'asc')
    .orderBy('k.public_ref', 'asc')
    .limit(recorte.limite + 1);
  if (recorte.curso !== undefined) {
    // `>` e nao `<`: a ordem aqui e CRESCENTE. Usar o mesmo predicado da linha
    // do tempo devolveria a pagina anterior, e a lista pararia na primeira
    // virada -- com `items: []` e um `next_cursor` que nunca termina.
    consulta = consulta.where(
      sql<boolean>`(k.created_at, k.public_ref) > (${comoData(recorte.curso.antesDe)}::timestamptz, ${recorte.curso.ref})`,
    );
  }
  return consulta.compile();
}

/**
 * O `UPDATE` que apaga um comentario, com **DOIS caminhos de autorizacao na
 * clausula** -- e nenhum deles acima dela (ADR-0021).
 *
 * ## Quem apaga, e as duas razoes sao diferentes
 *
 * 1. **o AUTOR DO COMENTARIO** apaga o proprio -- tirar do ar o que eu escrevi;
 * 2. **o DONO DA PUBLICACAO** apaga comentario de terceiro na publicacao DELE
 *    (decisao do cliente de 20/10/2026).
 *
 * **O segundo caminho NAO e moderacao, e a distincao nao e semantica:** nao
 * passa por fila, nao tem administrador, nao tem revisao, nao tem motivo
 * obrigatorio e nao gera registro para ninguem olhar depois. E dono limpando a
 * propria casa, com efeito imediato -- a mesma natureza de `user_blocks`, que a
 * `20261018000031` descreve como *"ferramenta PESSOAL, nao moderacao"* e que por
 * isso **nao entra** em `fila_de_moderacao`. A moderacao de comentario pelo
 * painel continua nao existindo, e ficar sem ela foi decisao do cliente no mesmo
 * dia -- ver o cabecalho da migracao `20261020000006`.
 *
 * ## Por que o `OR` e aqui e nao num `if`
 *
 * Os dois caminhos sao UM predicado, e quem nao esta em nenhum dos dois **nao
 * atinge linha**: terceiro que e conexao aceita chega ate este `UPDATE` (ele VE
 * a publicacao) e sai com zero linhas afetadas, que a borda transforma em
 * `404` -- nunca `403`. Com um `if` na camada acima, o caminho novo que
 * esquecesse a leitura abriria o furo sem nada acusar.
 *
 * `publication_id` continua na clausula: ele vem de `alvoVisivel`, e sem ele um
 * `ref` de comentario de OUTRA publicacao seria atingido pelo dono desta.
 */
export function construtorDoApagarComentario(
  db: Kysely<Database>,
  chamador: UserId,
  publicacaoId: string,
  ref: string,
  agora: Instant,
): CompiledQuery<unknown> {
  return db
    .updateTable('publication_comments')
    .set({ deleted_at: comoData(agora) })
    .where('public_ref', '=', ref)
    .where('publication_id', '=', publicacaoId)
    .where(
      sql<boolean>`(
        publication_comments.author_user_id = ${chamador}::uuid
        OR EXISTS (
          SELECT 1 FROM user_publications p
           WHERE p.id = publication_comments.publication_id
             AND p.author_user_id = ${chamador}::uuid)
      )`,
    )
    .where('deleted_at', 'is', null)
    .compile();
}

function chaveOuNulo(valor: string | null): ObjectKey | null {
  return valor === null ? null : comoObjectKey(valor);
}

function comoPublicacaoDoDono(linha: LinhaDaMinhaPublicacao): PublicacaoDoDono {
  return {
    ref: linha.ref,
    corpo: linha.body,
    criadaEm: linha.created_at,
    foto:
      linha.status === null
        ? null
        : {
            uploadId: linha.upload_id,
            status: linha.status,
            abertaKey: chaveOuNulo(linha.public_key),
            rejectionReason: linha.rejection_reason,
            altText: linha.alt_text,
          },
  };
}

function comoPublicacaoNaLinha(linha: LinhaDaLinhaDoTempo): PublicacaoNaLinha {
  return {
    ref: linha.ref,
    corpo: linha.body,
    criadaEm: linha.created_at,
    foto:
      linha.public_key === null
        ? null
        : { abertaKey: comoObjectKey(linha.public_key), altText: linha.alt_text },
    handle: linha.handle,
    displayName: linha.display_name,
    autorThumbKey: chaveOuNulo(linha.autor_thumb_key),
    canalVerificado: linha.canal_verificado,
    minha: linha.minha,
    // `Number` AQUI, e nao mais acima: a conversao e da borda do banco, e
    // deixa-la subir faria a contagem sair como cadeia no JSON. Ver o
    // comentario de `like_count` em `LinhaDaLinhaDoTempo`.
    curtidas: Number(linha.like_count),
    comentarios: Number(linha.comment_count),
    curtiEu: linha.liked_by_me,
  };
}

/**
 * Corta a linha extra e escreve o cursor da última mantida.
 *
 * O cursor sai da ÚLTIMA LINHA DA PÁGINA, e não da linha extra: ele é "venha
 * depois desta", e usar a extra pularia uma publicação em cada virada.
 */
function paginar<L, T>(
  linhas: readonly L[],
  limite: number,
  converter: (linha: L) => T,
  cursoDe: (linha: L) => CursoDaLinhaDoTempo,
): PaginaDePublicacoes<T> {
  const temMais = linhas.length > limite;
  const mantidas = temMais ? linhas.slice(0, limite) : linhas;
  const ultima = mantidas[mantidas.length - 1];
  return {
    itens: mantidas.map(converter),
    proximoCursor: temMais && ultima !== undefined ? escreverCursor(cursoDe(ultima)) : null,
  };
}

/**
 * O envio do DONO, com trava de linha.
 *
 * `user_id = dono` na cláusula, e `purpose = 'user_publication'` junto: um
 * `upload_id` de capa de encontro ou de vitrine **não vira foto de publicação**
 * (T9), e o envio de outra conta não é encontrado — a rota responde `404` e
 * nunca `403`, porque distinguir os dois revelaria que o envio existe.
 *
 * `forUpdate`: duas escritas com o mesmo `upload_id` não podem as duas achá-lo
 * aberto e criar duas imagens.
 */
async function envioDaPublicacaoDoDono(
  trx: DbExecutor,
  uploadId: string,
  dono: UserId,
): Promise<
  | {
      readonly id: string;
      readonly expiresAt: Date;
      readonly confirmedAt: Date | null;
      readonly catalogImageId: string | null;
    }
  | undefined
> {
  if (!FORMA_DE_UUID.test(uploadId)) return undefined;
  const linha = await trx
    .selectFrom('catalog_upload_intents as u')
    .leftJoin('catalog_images as c', 'c.upload_intent_id', 'u.id')
    .select([
      'u.id as id',
      'u.expires_at as expires_at',
      'u.confirmed_at as confirmed_at',
      'c.id as catalog_image_id',
    ])
    .where('u.id', '=', uploadId)
    .where('u.user_id', '=', dono)
    .where('u.purpose', '=', PROPOSITO_DA_PUBLICACAO)
    .forUpdate('u')
    .executeTakeFirst();
  if (linha === undefined) return undefined;
  return {
    id: linha.id,
    expiresAt: linha.expires_at,
    confirmedAt: linha.confirmed_at,
    catalogImageId: linha.catalog_image_id,
  };
}

/**
 * A escrita, **sobre um executor recebido de fora**.
 *
 * Função separada de `publicar`, e a separação não é estilo: é o que torna a
 * promessa "a confirmação do envio vai na MESMA transação da escrita"
 * **mensurável por teste**. Com o corpo dentro do `db.transaction()`, a única
 * prova possível seria ler o código e acreditar — e foi exatamente um
 * comentário acreditado que deixou a varredura apagar foto de achado. Recebendo
 * o executor, um teste passa um dublê que registra as operações e confere que o
 * `UPDATE ... confirmed_at` e o `INSERT INTO user_publications` chegaram no
 * MESMO executor. É a forma de `gravarVitrineNaTransacao`.
 */
export async function gravarPublicacaoNaTransacao(
  trx: DbExecutor,
  nova: NovaPublicacao,
  ids: IdGenerator,
): Promise<PublicacaoDoDono | RecusaDaPublicacao> {
  let imagemId: string | null = null;

  if (nova.uploadId !== null) {
    const envio = await envioDaPublicacaoDoDono(trx, nova.uploadId, nova.autor);
    // Envio que não é do dono, não é de publicação, ou não existe: 404, e nunca
    // 403. Distinguir os dois revelaria que o envio existe.
    if (envio === undefined) return 'envio-nao-encontrado';
    if (envio.catalogImageId !== null || envio.confirmedAt !== null) return 'envio-ja-usado';
    if (envio.expiresAt.getTime() <= nova.agora) return 'envio-vencido';

    imagemId = ids.uuidv7();
    // OS TRÊS JUNTOS, nesta transação: confirma o envio, cria a imagem em
    // `processing` e enfileira o processamento. Ver o cabeçalho da porta sobre
    // a varredura de vencidos.
    await trx
      .updateTable('catalog_upload_intents')
      .set({ confirmed_at: comoData(nova.agora) })
      .where('id', '=', envio.id)
      .where('confirmed_at', 'is', null)
      .execute();
    await trx
      .insertInto('catalog_images')
      .values({
        id: imagemId,
        upload_intent_id: envio.id,
        purpose: PROPOSITO_DA_PUBLICACAO,
        public_key: null,
        rejection_reason: null,
      })
      .execute();
    await trx
      .insertInto('jobs')
      .values({
        id: ids.uuidv7(),
        kind: TRABALHO_DE_IMAGEM_DE_CATALOGO,
        payload: JSON.stringify({ catalog_image_id: imagemId }),
      })
      .execute();
  }

  await trx
    .insertInto('user_publications')
    .values({
      id: ids.uuidv7(),
      author_user_id: nova.autor,
      public_ref: nova.ref,
      body: nova.corpo,
      image_id: imagemId,
      // `alt_text` só com imagem, e o `CHECK` do banco cobra o mesmo. A camada
      // de domínio já recusou o par inválido com `400` e campo.
      alt_text: imagemId === null ? null : nova.textoAlternativo,
      created_at: comoData(nova.agora),
    })
    .execute();

  return {
    ref: nova.ref,
    corpo: nova.corpo,
    criadaEm: comoData(nova.agora),
    foto:
      imagemId === null
        ? null
        : {
            uploadId: nova.uploadId,
            // `processing`, e as URLs nulas: antes de o worker reescrever a
            // derivada a foto carrega o EXIF do celular. O contrato diz isso no
            // `status` em vez de deixar o app descobrir pela ausência da URL.
            status: 'processing',
            abertaKey: null,
            rejectionReason: null,
            altText: nova.textoAlternativo,
          },
  };
}

/**
 * O `id` interno da publicacao visivel a quem chama, ou `undefined`.
 *
 * **UMA funcao, chamada pelas cinco escritas de interacao**, e e isso que
 * impede cinco copias do recorte. Ela devolve o `id` INTERNO -- que nao sai em
 * resposta nenhuma -- justamente para que as escritas nao precisem do `ref` de
 * novo nem de uma segunda consulta.
 */
async function alvoVisivel(
  executor: DbExecutor,
  ref: string,
  quemOlha: UserId,
): Promise<string | undefined> {
  const { rows } = await executor.executeQuery(
    construtorDaPublicacaoVisivel(executor as unknown as Kysely<Database>, ref, quemOlha),
  );
  return rows[0]?.id;
}

/** A contagem de curtidas, lida das LINHAS, mais `liked_by_me`. */
async function contarCurtidas(
  executor: DbExecutor,
  publicacaoId: string,
  quemOlha: UserId,
): Promise<ContagemDaReacao> {
  const { rows } = await sql<{ readonly total: string; readonly curti: boolean }>`
    SELECT count(*) AS total,
           bool_or(pl.user_id = ${quemOlha}::uuid) AS curti
      FROM publication_likes pl
     WHERE pl.publication_id = ${publicacaoId}::uuid
  `.execute(executor);
  const linha = rows[0];
  return {
    // `Number` na borda do banco: `count(*)` e `bigint` e o driver o entrega
    // como cadeia. Ver o comentario de `like_count` em `LinhaDaLinhaDoTempo`.
    curtidas: Number(linha?.total ?? '0'),
    // `bool_or` devolve NULO quando nao ha linha nenhuma -- e ai ninguem curtiu.
    curtiEu: linha?.curti === true,
  };
}

/** A contagem de comentarios VIVOS, lida das LINHAS. */
async function contarComentarios(executor: DbExecutor, publicacaoId: string): Promise<number> {
  const { rows } = await sql<{ readonly total: string }>`
    SELECT count(*) AS total
      FROM publication_comments pc
     WHERE pc.publication_id = ${publicacaoId}::uuid
       AND pc.deleted_at IS NULL
  `.execute(executor);
  return Number(rows[0]?.total ?? '0');
}

/**
 * O autor de um comentario recem-criado: apelido, nome e a `thumb` da foto.
 *
 * **A MESMA projecao dos irmaos** -- o mesmo `kind = 'pessoa'` em `handles` e os
 * mesmos tres predicados na imagem (proposito, `ready`, `thumb_key` nao nula).
 * Uma projecao diferente aqui faria o cartao recem-criado parecer diferente dos
 * outros na mesma lista, e a diferenca apareceria so em producao.
 */
async function autorDoComentario(
  executor: DbExecutor,
  quem: UserId,
): Promise<{
  readonly handle: string | null;
  readonly displayName: string;
  readonly autorThumbKey: ObjectKey | null;
  readonly canalVerificado: boolean;
}> {
  const linha = await executor
    .selectFrom('users as a')
    .leftJoin('handles as h', (junta) =>
      junta.onRef('h.user_id', '=', 'a.id').on('h.kind', '=', 'pessoa'),
    )
    .leftJoin('catalog_images as fa', (junta) =>
      junta
        .onRef('fa.id', '=', 'a.photo_image_id')
        .on('fa.purpose', '=', PROPOSITO_DA_FOTO_DE_PESSOA)
        .on('fa.status', '=', FOTO_PRONTA)
        .on(sql<boolean>`fa.thumb_key IS NOT NULL`),
    )
    .select([
      'h.handle as handle',
      'a.display_name as display_name',
      'fa.thumb_key as autor_thumb_key',
    ])
    .select(CANAL_VERIFICADO_DO_AUTOR.as('canal_verificado'))
    .where('a.id', '=', quem)
    .executeTakeFirst();
  return {
    handle: linha?.handle ?? null,
    displayName: linha?.display_name ?? '',
    autorThumbKey: chaveOuNulo(linha?.autor_thumb_key ?? null),
    // **`false` quando a linha nao veio**, e nao `true`: a conta de quem acabou
    // de comentar existe (a escrita passou), entao este caminho e teorico --
    // mas na duvida o selo NAO nasce. Um padrao `true` afirmaria validacao de
    // uma leitura que falhou, e e exatamente a mentira que o rotulo nao pode
    // contar. Mesma direcao do padrao `false` de `minha`.
    canalVerificado: linha?.canal_verificado ?? false,
  };
}

function comoComentario(linha: LinhaDoComentario): ComentarioVisivel {
  return {
    ref: linha.ref,
    corpo: linha.body,
    criadoEm: linha.created_at,
    handle: linha.handle,
    displayName: linha.display_name,
    autorThumbKey: chaveOuNulo(linha.autor_thumb_key),
    canalVerificado: linha.canal_verificado,
    meu: linha.minha,
  };
}

export function criarPublicacoesRepository(
  db: Db,
  ids: IdGenerator,
): PublicacoesRepository {
  return {
    async minhas(dono, recorte) {
      const { rows } = await db.executeQuery(construtorDasMinhasPublicacoes(db, dono, recorte));
      return paginar(rows, recorte.limite, comoPublicacaoDoDono, (linha) => ({
        antesDe: linha.created_at.getTime() as Instant,
        ref: linha.ref,
      }));
    },

    async linhaDoTempo(quemOlha, recorte) {
      const { rows } = await db.executeQuery(construtorDaLinhaDoTempo(db, quemOlha, recorte));
      return paginar(rows, recorte.limite, comoPublicacaoNaLinha, (linha) => ({
        antesDe: linha.created_at.getTime() as Instant,
        ref: linha.ref,
      }));
    },

    publicar: (nova) =>
      db.transaction().execute((trx) => gravarPublicacaoNaTransacao(trx, nova, ids)),

    async curtir(quemCurte, ref) {
      if (!FORMA_DE_REF.test(ref)) return undefined;
      return db.transaction().execute(async (trx) => {
        const alvo = await alvoVisivel(trx, ref, quemCurte);
        if (alvo === undefined) return undefined;
        // **`ON CONFLICT DO NOTHING`, e e isto que faz curtir ser idempotente.**
        // A chave primaria `(publication_id, user_id)` recusa a segunda linha; o
        // conflito e absorvido aqui, sem laco de retentativa e sem erro para a
        // pessoa. Conferir antes de inserir teria a janela do toque duplo.
        await sql`
          INSERT INTO publication_likes (publication_id, user_id)
          VALUES (${alvo}::uuid, ${quemCurte}::uuid)
          ON CONFLICT DO NOTHING
        `.execute(trx);
        return contarCurtidas(trx, alvo, quemCurte);
      });
    },

    async descurtir(quemCurte, ref) {
      if (!FORMA_DE_REF.test(ref)) return undefined;
      return db.transaction().execute(async (trx) => {
        const alvo = await alvoVisivel(trx, ref, quemCurte);
        if (alvo === undefined) return undefined;
        // Idempotente do outro lado: `DELETE` que nao atinge nada nao e erro.
        await trx
          .deleteFrom('publication_likes')
          .where('publication_id', '=', alvo)
          .where('user_id', '=', quemCurte)
          .execute();
        return contarCurtidas(trx, alvo, quemCurte);
      });
    },

    async comentarios(quemOlha, ref, recorte) {
      if (!FORMA_DE_REF.test(ref)) return undefined;
      const alvo = await alvoVisivel(db, ref, quemOlha);
      if (alvo === undefined) return undefined;
      const { rows } = await db.executeQuery(
        construtorDosComentarios(db, alvo, quemOlha, recorte),
      );
      const pagina = paginar(rows, recorte.limite, comoComentario, (linha) => ({
        antesDe: linha.created_at.getTime() as Instant,
        ref: linha.ref,
      }));
      return {
        itens: pagina.itens,
        proximoCursor: pagina.proximoCursor,
        // O TOTAL da publicacao, e nao o tamanho da pagina. A tela mostra o
        // total no cartao e a pagina na folha, e sao numeros diferentes.
        total: await contarComentarios(db, alvo),
      };
    },

    async comentar(autor, ref, corpo, refDoComentario, agora) {
      if (!FORMA_DE_REF.test(ref)) return undefined;
      return db.transaction().execute(async (trx) => {
        const alvo = await alvoVisivel(trx, ref, autor);
        if (alvo === undefined) return undefined;
        await trx
          .insertInto('publication_comments')
          .values({
            id: ids.uuidv7(),
            publication_id: alvo,
            author_user_id: autor,
            public_ref: refDoComentario,
            body: corpo,
            created_at: comoData(agora),
          })
          .execute();
        // **O AUTOR E LIDO DE VOLTA, e nao montado com valores vazios.**
        //
        // A primeira versao devolvia `displayName: ''` e `autorThumbKey: null`
        // "porque a tela de quem comenta ja sabe quem ela e" -- e isso estava
        // errado por duas razoes: `PublicationComment.author.display_name` e
        // OBRIGATORIO no contrato, e o cartao novo nasceria sem nome e sem foto
        // ao lado dos outros que tem os dois. A leitura e a MESMA projecao dos
        // irmaos, na mesma transacao, e custa uma consulta por comentario
        // criado -- uma, nao uma por rolada.
        const autorLido = await autorDoComentario(trx, autor);
        return {
          comentario: {
            ref: refDoComentario,
            corpo,
            criadoEm: comoData(agora),
            handle: autorLido.handle,
            displayName: autorLido.displayName,
            autorThumbKey: autorLido.autorThumbKey,
            canalVerificado: autorLido.canalVerificado,
            meu: true,
          },
          total: await contarComentarios(trx, alvo),
        };
      });
    },

    async apagarComentario(chamador, ref, refDoComentario, agora) {
      if (!FORMA_DE_REF.test(ref) || !FORMA_DE_REF.test(refDoComentario)) return undefined;
      return db.transaction().execute(async (trx) => {
        const alvo = await alvoVisivel(trx, ref, chamador);
        if (alvo === undefined) return undefined;
        const resultado = await trx.executeQuery(
          construtorDoApagarComentario(trx as unknown as Kysely<Database>, chamador, alvo, refDoComentario, agora),
        );
        if ((resultado.numAffectedRows ?? 0n) === 0n) return null;
        return contarComentarios(trx, alvo);
      });
    },

    async apagar(dono, ref, agora) {
      // A forma do endereço, antes de ir ao banco: `public_ref` não é UUID e
      // texto arbitrário aqui seria uma consulta garantidamente vazia com ida
      // ao banco paga.
      if (!FORMA_DE_REF.test(ref)) return false;
      const resultado = await db.executeQuery(construtorDoApagar(db, dono, ref, agora));
      return (resultado.numAffectedRows ?? 0n) > 0n;
    },
  };
}
