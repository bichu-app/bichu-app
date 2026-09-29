/**
 * A persistencia da intencao de envio de imagem de catalogo (ADR-0027 item 10,
 * apendice A.3).
 *
 * Funcao solta sobre um executor, e nao um repositorio com transacao propria:
 * a intencao e a linha de trilha dela vao na MESMA transacao (D49), e quem a
 * abre e a escrita administrativa.
 *
 * A confirmacao do envio e a escrita do item (ou do encontro), e vai na mesma
 * transacao dela: por isso estas funcoes recebem o executor de quem chama.
 *
 * Nenhuma funcao daqui le `users` nem `user_roles` (D51). A intencao mora em
 * `catalog_upload_intents` (ADR-0027 item 20.2, A.3), com `admin_account_id`,
 * e nao em `upload_intents`, que e do app: um envio de foto de pet nem existe
 * aqui, entao nao ha como confirma-lo como imagem de catalogo (T9).
 */
import type { DbExecutor } from '../../../../shared/db/pool.js';
import type { PropositoDaImagemDeCatalogo } from '../../../../shared/db/schema.js';
import type { ObjectKey } from '../../../../shared/types/brands.js';
import {
  TRABALHO_DE_IMAGEM_DE_CATALOGO,
  type ConfirmacaoDeCatalogo,
  type EnvioDeCatalogo,
  type ImagemParaProcessar,
  type ImagensDeCatalogoDoWorker,
  type RegistroDeImagemDeCatalogo,
} from '../../ports/imagem-de-catalogo.js';
import { comoObjectKey } from '../../domain/chave-de-objeto.js';

export async function registrarIntencaoDeCatalogo(
  db: DbExecutor,
  nova: {
    readonly id: string;
    readonly adminAccountId: string;
    readonly purpose: PropositoDaImagemDeCatalogo;
    readonly objectKey: ObjectKey;
    readonly declaredType: string;
    readonly maxBytes: number;
    readonly expiresAt: Date;
  },
): Promise<void> {
  await db
    .insertInto('catalog_upload_intents')
    .values({
      id: nova.id,
      admin_account_id: nova.adminAccountId,
      purpose: nova.purpose,
      object_key: nova.objectKey,
      declared_type: nova.declaredType,
      max_bytes: nova.maxBytes,
      expires_at: nova.expiresAt,
    })
    .execute();
}

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O envio pelo `id`, com a imagem que ja nasceu dele, e `FOR UPDATE` na linha
 * do envio. `id` que nao e UUID devolve `null`, e nao erro de banco: o contrato
 * ja o valida como `format: uuid`, e esta e a segunda rede.
 */
export async function envioDeCatalogo(db: DbExecutor, uploadId: string): Promise<EnvioDeCatalogo | null> {
  if (!FORMA_DE_UUID.test(uploadId)) return null;
  const linha = await db
    .selectFrom('catalog_upload_intents as u')
    .leftJoin('catalog_images as c', 'c.upload_intent_id', 'u.id')
    .select([
      'u.id as id',
      'u.purpose as purpose',
      'u.expires_at as expires_at',
      'u.confirmed_at as confirmed_at',
      'c.id as catalog_image_id',
    ])
    .where('u.id', '=', uploadId)
    .forUpdate('u')
    .executeTakeFirst();
  if (linha === undefined) return null;
  return {
    id: linha.id,
    // A tabela so guarda envio de catalogo; o campo continua para a segunda
    // conferencia do caso de uso.
    kind: 'catalog_image',
    purpose: linha.purpose,
    expiresAt: linha.expires_at,
    confirmedAt: linha.confirmed_at,
    catalogImageId: linha.catalog_image_id,
  };
}

/**
 * Cria a imagem em `processing`, marca o envio como confirmado e enfileira o
 * processamento, os tres na transacao de quem chama. Imagem sem trabalho
 * ficaria `processing` para sempre; trabalho sem imagem falharia em laco.
 */
export async function confirmarEnvioDeCatalogo(db: DbExecutor, entrada: ConfirmacaoDeCatalogo): Promise<void> {
  await db
    .updateTable('catalog_upload_intents')
    .set({ confirmed_at: new Date(entrada.agora) })
    .where('id', '=', entrada.envioId)
    .where('confirmed_at', 'is', null)
    .execute();
  await db
    .insertInto('catalog_images')
    .values({
      id: entrada.imagemId,
      upload_intent_id: entrada.envioId,
      purpose: entrada.purpose,
      public_key: null,
      rejection_reason: null,
    })
    .execute();
  await db
    .insertInto('jobs')
    .values({
      id: entrada.trabalhoId,
      kind: TRABALHO_DE_IMAGEM_DE_CATALOGO,
      payload: JSON.stringify({ catalog_image_id: entrada.imagemId }),
    })
    .execute();
}

/** O que a escrita administrativa enxerga pela porta. */
export const registroDeImagemDeCatalogo: RegistroDeImagemDeCatalogo = {
  registrarIntencao: registrarIntencaoDeCatalogo,
  envio: envioDeCatalogo,
  confirmar: confirmarEnvioDeCatalogo,
};

// ---------------------------------------------------------------------------
// O que o worker usa (`processar-imagem-de-catalogo.ts`), com o `Db` direto
// ---------------------------------------------------------------------------

export async function imagemDeCatalogoParaProcessar(
  db: DbExecutor,
  imagemId: string,
): Promise<ImagemParaProcessar | null> {
  if (!FORMA_DE_UUID.test(imagemId)) return null;
  const linha = await db
    .selectFrom('catalog_images as c')
    .innerJoin('catalog_upload_intents as u', 'u.id', 'c.upload_intent_id')
    .select(['c.id as id', 'c.status as status', 'c.purpose as purpose', 'u.object_key as object_key'])
    .where('c.id', '=', imagemId)
    .executeTakeFirst();
  if (linha === undefined) return null;
  return {
    id: linha.id,
    status: linha.status,
    purpose: linha.purpose,
    originalKey: comoObjectKey(linha.object_key),
  };
}

/** `ready` so com a chave publica, e so a partir de `processing`: estado final nao volta. */
export async function marcarImagemDeCatalogoPronta(
  db: DbExecutor,
  imagemId: string,
  chavePublica: string,
): Promise<void> {
  await db
    .updateTable('catalog_images')
    .set({ status: 'ready', public_key: chavePublica })
    .where('id', '=', imagemId)
    .where('status', '=', 'processing')
    .execute();
}

export async function marcarImagemDeCatalogoRecusada(
  db: DbExecutor,
  imagemId: string,
  motivo: string,
): Promise<void> {
  await db
    .updateTable('catalog_images')
    .set({ status: 'rejected', rejection_reason: motivo })
    .where('id', '=', imagemId)
    .where('status', '=', 'processing')
    .execute();
}

export function criarImagensDeCatalogoDoWorker(db: DbExecutor): ImagensDeCatalogoDoWorker {
  return {
    paraProcessar: (id) => imagemDeCatalogoParaProcessar(db, id),
    marcarPronta: (id, chave) => marcarImagemDeCatalogoPronta(db, id, chave),
    marcarRecusada: (id, motivo) => marcarImagemDeCatalogoRecusada(db, id, motivo),
  };
}
