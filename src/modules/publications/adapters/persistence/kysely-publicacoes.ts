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
 * ## O autor sai SEM FOTO, e é por omissão de coluna
 *
 * `users.photo_image_id` não é lido em consulta nenhuma deste arquivo, e
 * `catalog_images` entra uma vez só — para a foto DA PUBLICAÇÃO, por
 * `p.image_id`. A Emenda 3 do ADR-0010 abriu a foto de pessoa em
 * `Conversation.participants[]` *"e em mais nenhuma resposta deste contrato"*:
 * a coluna ausente é o que torna isso verificável em vez de prometido.
 */
import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
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

interface LinhaDaLinhaDoTempo {
  readonly ref: string;
  readonly body: string;
  readonly created_at: Date;
  readonly alt_text: string | null;
  readonly public_key: string | null;
  readonly handle: string | null;
  readonly display_name: string;
  readonly minha: boolean;
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
    ])
    .select(sql<boolean>`p.author_user_id = ${quemOlha}::uuid`.as('minha'))
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
    minha: linha.minha,
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
