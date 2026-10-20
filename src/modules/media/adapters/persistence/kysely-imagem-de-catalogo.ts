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
  type ChavesDaImagemDeCatalogo,
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

/**
 * A intencao de envio da CAPA do encontro, com autor de `users` (ADR-0025
 * emenda 3).
 *
 * Funcao separada de `registrarIntencaoDeCatalogo`, e nao um parametro
 * opcional: as duas gravam autores de tabelas diferentes, e um objeto com os
 * dois campos opcionais deixaria passar o envio sem autor nenhum -- que o
 * `CHECK catalog_upload_intents_um_autor` recusaria no banco, mas so depois de
 * a politica ja estar assinada.
 */
export async function registrarIntencaoDeCapaDaComunidade(
  db: DbExecutor,
  nova: {
    readonly id: string;
    readonly userId: string;
    readonly objectKey: string;
    readonly declaredType: string;
    readonly maxBytes: number;
    readonly expiresAt: Date;
  },
): Promise<void> {
  await db
    .insertInto('catalog_upload_intents')
    .values({
      id: nova.id,
      admin_account_id: null,
      user_id: nova.userId,
      purpose: 'network_event',
      object_key: nova.objectKey,
      declared_type: nova.declaredType,
      max_bytes: nova.maxBytes,
      expires_at: nova.expiresAt,
    })
    .execute();
}

/**
 * A intencao de envio da FOTO DO PROPRIO USUARIO (cliente, 18/10/2026).
 *
 * Terceira funcao e nao um parametro, pelo mesmo motivo da segunda: `purpose` e
 * o que amarra o envio ao destino (T9), e um parametro livre deixaria uma rota
 * do app assinar envio de imagem de produto. Aqui ele e LITERAL.
 */
export async function registrarIntencaoDeFotoDoUsuario(
  db: DbExecutor,
  nova: {
    readonly id: string;
    readonly userId: string;
    readonly objectKey: string;
    readonly declaredType: string;
    readonly maxBytes: number;
    readonly expiresAt: Date;
  },
): Promise<void> {
  await db
    .insertInto('catalog_upload_intents')
    .values({
      id: nova.id,
      admin_account_id: null,
      user_id: nova.userId,
      purpose: 'user_photo',
      object_key: nova.objectKey,
      declared_type: nova.declaredType,
      max_bytes: nova.maxBytes,
      expires_at: nova.expiresAt,
    })
    .execute();
}

/**
 * A intencao de envio da VITRINE DE FOTOS DO USUARIO (18/10/2026).
 *
 * QUARTA FUNCAO, E ELA EXISTE PORQUE A AUSENCIA DELA ERA UM DEFEITO MEDIDO.
 *
 * Ate 18/10/2026 `api.ts` ligava a vitrine a
 * `registrarIntencaoDeCapaDaComunidade`, que grava `purpose = 'network_event'`
 * LITERAL. As duas funcoes tem a MESMA assinatura, entao a troca compilou e
 * nenhum teste de unidade a enxergou. O resultado, medido contra a pilha de
 * integracao: `POST /v1/me/showcase/photo-intents` respondia `201` com a chave
 * certa (`people/original/...`) e a linha ia para o banco com
 * `purpose = network_event`; `PUT /v1/me/showcase` procura o envio com
 * `WHERE u.purpose = 'user_showcase'` (`kysely-vitrine.ts`), nao achava, e
 * devolvia `404` -- isto e, **nenhuma foto de vitrine podia ser salva**.
 *
 * `purpose` chega pelo parametro, e com o tipo FECHADO no literal: e isso que
 * faz esta funcao nao poder ser ligada no lugar das outras tres nem elas no
 * lugar dela sem o compilador reclamar. Era a conferencia que faltava, e ela
 * nao e um comentario.
 */
export async function registrarIntencaoDaVitrineDoUsuario(
  db: DbExecutor,
  nova: {
    readonly id: string;
    readonly userId: string;
    readonly objectKey: string;
    readonly declaredType: string;
    readonly maxBytes: number;
    readonly expiresAt: Date;
    readonly purpose: 'user_showcase';
  },
): Promise<void> {
  await db
    .insertInto('catalog_upload_intents')
    .values({
      id: nova.id,
      admin_account_id: null,
      user_id: nova.userId,
      // Do parametro, e nao um literal escrito aqui: o MESMO valor que o caso
      // de uso usou para assinar (`PROPOSITO_DA_VITRINE`) e o que vai para a
      // linha. Dois literais em dois arquivos foi o que divergiu.
      purpose: nova.purpose,
      object_key: nova.objectKey,
      declared_type: nova.declaredType,
      max_bytes: nova.maxBytes,
      expires_at: nova.expiresAt,
    })
    .execute();
}

/**
 * A intencao da FOTO DE UMA PUBLICACAO DO MURAL (20/10/2026). Autor em `users`.
 *
 * **Funcao propria, com `purpose` FECHADO no literal `'user_publication'`**, e
 * nao um parametro aberto nem reuso da irma da vitrine. A razao esta no
 * cabecalho de `registrarIntencaoDaVitrineDoUsuario`, logo acima, e ela foi
 * paga: em 18/10/2026 `api.ts` ligou a vitrine ao registrador da capa do
 * encontro, as duas assinaturas eram identicas, **a troca compilou**, e nenhuma
 * foto de vitrine podia ser salva -- `201` na intencao e `404` na confirmacao,
 * porque a confirmacao procura o envio pelo proposito.
 *
 * Com o literal no tipo, ligar esta funcao no lugar de qualquer uma das outras
 * quatro (ou qualquer uma delas no lugar desta) **nao compila**. E a quinta vez
 * que este arquivo repete a forma, e a repeticao e o mecanismo.
 */
export async function registrarIntencaoDaFotoDaPublicacao(
  db: DbExecutor,
  nova: {
    readonly id: string;
    readonly userId: string;
    readonly objectKey: string;
    readonly declaredType: string;
    readonly maxBytes: number;
    readonly expiresAt: Date;
    readonly purpose: 'user_publication';
  },
): Promise<void> {
  await db
    .insertInto('catalog_upload_intents')
    .values({
      id: nova.id,
      admin_account_id: null,
      user_id: nova.userId,
      // Do parametro, e nao um literal escrito aqui: o MESMO valor que o caso
      // de uso usou para assinar e o que vai para a linha.
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

/**
 * `ready` so com as chaves, e so a partir de `processing`: estado final nao volta.
 *
 * `thumb_key` e `banner_key` sao gravadas no MESMO `UPDATE` de `public_key`, e
 * nao em escritas separadas: a leitura publica filtra por `status = 'ready'`, e
 * duas escritas abririam uma janela em que a imagem esta pronta com a capa e
 * sem a miniatura. Ausentes (imagem de produto), elas entram `null` e o leitor
 * cai na capa, que e o que ele faz hoje.
 */
export async function marcarImagemDeCatalogoPronta(
  db: DbExecutor,
  imagemId: string,
  chaves: ChavesDaImagemDeCatalogo,
): Promise<void> {
  await db
    .updateTable('catalog_images')
    .set({
      status: 'ready',
      public_key: chaves.card,
      thumb_key: chaves.thumb ?? null,
      banner_key: chaves.banner ?? null,
    })
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
    marcarPronta: (id, chaves) => marcarImagemDeCatalogoPronta(db, id, chaves),
    marcarRecusada: (id, motivo) => marcarImagemDeCatalogoRecusada(db, id, motivo),
  };
}
