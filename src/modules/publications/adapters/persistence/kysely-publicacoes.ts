import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import type { Database } from '../../../../shared/db/schema.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type { Instant, ObjectKey, UserId } from '../../../../shared/types/brands.js';
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

/** O propósito desta esteira, **tipado** por `PropositoDaImagem`. */
export const PROPOSITO_DA_PUBLICACAO: PropositoDaImagem = 'user_publication';

const FOTO_PRONTA = 'ready' as const;

const PROPOSITO_DA_FOTO_DE_PESSOA: PropositoDaImagem = 'user_photo';

const CANAL_VERIFICADO_DO_AUTOR = canalDeContatoConfirmadoNoSql('a');

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  readonly autor_thumb_key: string | null;
  readonly canal_verificado: boolean;
  readonly minha: boolean;
  readonly like_count: string;
  readonly comment_count: string;
  readonly liked_by_me: boolean;
}

function antesDoCursor(curso: CursoDaLinhaDoTempo) {
  return sql<boolean>`(p.created_at, p.public_ref) < (${comoData(curso.antesDe)}::timestamptz, ${curso.ref})`;
}

/**
 * AS MINHAS PUBLICAÇÕES. `author_user_id = dono` no `WHERE`, e nada mais — **ela
 * não depende de conexão**, e é isso que a torna a leitura que distingue "não
 * tenho conexão" de "ninguém publicou".
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
      'c.public_key as public_key',
      'c.rejection_reason as rejection_reason',
    ])
    .where('p.author_user_id', '=', dono)
    .where('p.deleted_at', 'is', null)
    .orderBy('p.created_at', 'desc')
    .orderBy('p.public_ref', 'desc')
    .limit(recorte.limite + 1);
  if (recorte.curso !== undefined) consulta = consulta.where(antesDoCursor(recorte.curso));
  return consulta.compile();
}

/**
 * A LINHA DO TEMPO. **Aqui mora o recorte inteiro**, e cada predicado tem uma
 * frase.
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
    .leftJoin('catalog_images as fa', (junta) =>
      junta
        .onRef('fa.id', '=', 'a.photo_image_id')
        .on('fa.purpose', '=', PROPOSITO_DA_FOTO_DE_PESSOA)
        .on('fa.status', '=', FOTO_PRONTA)
        .on(sql<boolean>`fa.thumb_key IS NOT NULL`),
    )
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
    .select(
      sql<string>`(SELECT count(*) FROM publication_likes pl
                    WHERE pl.publication_id = p.id)`.as('like_count'),
    )
    .select(
      sql<string>`(SELECT count(*) FROM publication_comments pc
                    WHERE pc.publication_id = p.id AND pc.deleted_at IS NULL)`.as('comment_count'),
    )
    .select(
      sql<boolean>`EXISTS (SELECT 1 FROM publication_likes pl
                            WHERE pl.publication_id = p.id
                              AND pl.user_id = ${quemOlha}::uuid)`.as('liked_by_me'),
    )
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
    .orderBy('p.created_at', 'desc')
    .orderBy('p.public_ref', 'desc')
    .limit(recorte.limite + 1);
  if (recorte.curso !== undefined) consulta = consulta.where(antesDoCursor(recorte.curso));
  return consulta.compile();
}

/** O `UPDATE` que apaga, **com o autor na cláusula**. */
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

/** A PUBLICACAO VISIVEL A QUEM CHAMA, resolvida pelo endereco publico. */
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

/** OS COMENTARIOS de uma publicacao, **mais ANTIGO primeiro**. */
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
    .leftJoin('catalog_images as fa', (junta) =>
      junta
        .onRef('fa.id', '=', 'a.photo_image_id')
        .on('fa.purpose', '=', PROPOSITO_DA_FOTO_DE_PESSOA)
        .on('fa.status', '=', FOTO_PRONTA)
        .on(sql<boolean>`fa.thumb_key IS NOT NULL`)
        .on(
          sql<boolean>`(
        k.author_user_id = ${quemOlha}::uuid
        OR EXISTS (
          SELECT 1 FROM user_connections uc
           WHERE uc.state = 'accepted'
             AND ((uc.requester_user_id = k.author_user_id AND uc.addressee_user_id = ${quemOlha}::uuid)
               OR (uc.requester_user_id = ${quemOlha}::uuid AND uc.addressee_user_id = k.author_user_id))
             AND conta_habilitada(uc.requester_user_id)
             AND conta_habilitada(uc.addressee_user_id))
      )`,
        ),
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
    .where(sql<boolean>`NOT bloqueio_entre(k.author_user_id, ${quemOlha}::uuid)`)
    .orderBy('k.created_at', 'asc')
    .orderBy('k.public_ref', 'asc')
    .limit(recorte.limite + 1);
  if (recorte.curso !== undefined) {
    consulta = consulta.where(
      sql<boolean>`(k.created_at, k.public_ref) > (${comoData(recorte.curso.antesDe)}::timestamptz, ${recorte.curso.ref})`,
    );
  }
  return consulta.compile();
}

/**
 * O `UPDATE` que apaga um comentario, com **DOIS caminhos de autorizacao na
 * clausula** -- e nenhum deles acima dela (ADR-0021).
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
    curtidas: Number(linha.like_count),
    comentarios: Number(linha.comment_count),
    curtiEu: linha.liked_by_me,
  };
}

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

/** A escrita, **sobre um executor recebido de fora**. */
export async function gravarPublicacaoNaTransacao(
  trx: DbExecutor,
  nova: NovaPublicacao,
  ids: IdGenerator,
): Promise<PublicacaoDoDono | RecusaDaPublicacao> {
  let imagemId: string | null = null;

  if (nova.uploadId !== null) {
    const envio = await envioDaPublicacaoDoDono(trx, nova.uploadId, nova.autor);
    if (envio === undefined) return 'envio-nao-encontrado';
    if (envio.catalogImageId !== null || envio.confirmedAt !== null) return 'envio-ja-usado';
    if (envio.expiresAt.getTime() <= nova.agora) return 'envio-vencido';

    imagemId = ids.uuidv7();
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
            status: 'processing',
            abertaKey: null,
            rejectionReason: null,
            altText: nova.textoAlternativo,
          },
  };
}

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
    curtidas: Number(linha?.total ?? '0'),
    curtiEu: linha?.curti === true,
  };
}

async function contarComentarios(executor: DbExecutor, publicacaoId: string): Promise<number> {
  const { rows } = await sql<{ readonly total: string }>`
    SELECT count(*) AS total
      FROM publication_comments pc
     WHERE pc.publication_id = ${publicacaoId}::uuid
       AND pc.deleted_at IS NULL
  `.execute(executor);
  return Number(rows[0]?.total ?? '0');
}

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
      if (!FORMA_DE_REF.test(ref)) return false;
      const resultado = await db.executeQuery(construtorDoApagar(db, dono, ref, agora));
      return (resultado.numAffectedRows ?? 0n) > 0n;
    },
  };
}
