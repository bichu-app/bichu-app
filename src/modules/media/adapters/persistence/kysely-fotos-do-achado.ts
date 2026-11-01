import { sql } from 'kysely';

import type { DbExecutor } from '../../../../shared/db/pool.js';
import type { ObjectKey } from '../../../../shared/types/brands.js';
import { comoObjectKey } from '../../domain/chave-de-objeto.js';
import type {
  FotoDoAchadoParaHigienizar,
  FotosDoAchadoDoWorker,
  StatusDaHigiene,
} from '../../ports/fotos-do-achado.js';
import { ESPECIES_DO_ACHADO } from '../../ports/fotos-do-achado.js';

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LinhaDeEnvio {
  readonly id: string;
  readonly object_key: string;
  readonly sanitize_status: StatusDaHigiene;
}

function donoDaChave(chave: string): string | null {
  const segmentos = chave.split('/');
  if (segmentos.length !== 4 || segmentos[0] !== 'found-reports' || segmentos[2] !== 'original') {
    return null;
  }
  return segmentos[1] ?? null;
}

function comoFoto(linha: LinhaDeEnvio): FotoDoAchadoParaHigienizar | null {
  const dono = donoDaChave(linha.object_key);
  if (dono === null) return null;
  return {
    uploadIntentId: linha.id,
    dono,
    originalKey: comoObjectKey(linha.object_key),
    status: linha.sanitize_status,
  };
}

export async function fotoDoAchadoParaHigienizar(
  db: DbExecutor,
  uploadIntentId: string,
): Promise<FotoDoAchadoParaHigienizar | null> {
  if (!FORMA_DE_UUID.test(uploadIntentId)) return null;
  const linha = await db
    .selectFrom('upload_intents')
    .select(['id', 'object_key', 'sanitize_status'])
    .where('id', '=', uploadIntentId)
    .where('kind', 'in', [...ESPECIES_DO_ACHADO])
    .executeTakeFirst();
  if (linha === undefined) return null;
  return comoFoto(linha);
}

/** As intenções pendentes, mais antigas primeiro. */
export async function fotosDoAchadoPendentes(
  db: DbExecutor,
  limite: number,
): Promise<readonly FotoDoAchadoParaHigienizar[]> {
  const linhas = await db
    .selectFrom('upload_intents')
    .select(['id', 'object_key', 'sanitize_status'])
    .where('kind', 'in', [...ESPECIES_DO_ACHADO])
    .where('sanitize_status', '=', 'pendente')
    .orderBy('created_at', 'asc')
    .limit(limite)
    .execute();
  return linhas.flatMap((linha) => {
    const foto = comoFoto(linha);
    return foto === null ? [] : [foto];
  });
}

/**
 * `WHERE sanitize_status = 'pendente'` nas três escritas, e é ele que faz o estado
 * final não voltar: o trabalho reentregue depois de um reinício encontra `pronta`
 * e não sobrescreve nada.
 */
export async function marcarFotoDoAchadoHigienizada(
  db: DbExecutor,
  uploadIntentId: string,
  chave: ObjectKey,
  agora: Date,
): Promise<void> {
  await db
    .updateTable('upload_intents')
    .set({ sanitize_status: 'pronta', sanitized_key: chave, sanitized_at: agora })
    .where('id', '=', uploadIntentId)
    .where('sanitize_status', '=', 'pendente')
    .execute();
}

export async function marcarFotoDoAchadoRecusada(
  db: DbExecutor,
  uploadIntentId: string,
  motivo: string,
  agora: Date,
): Promise<void> {
  await db
    .updateTable('upload_intents')
    .set({ sanitize_status: 'recusada', sanitize_rejection_reason: motivo, sanitized_at: agora })
    .where('id', '=', uploadIntentId)
    .where('sanitize_status', '=', 'pendente')
    .execute();
}

export async function marcarFotoDoAchadoAusente(
  db: DbExecutor,
  uploadIntentId: string,
  agora: Date,
): Promise<void> {
  await db
    .updateTable('upload_intents')
    .set({ sanitize_status: 'ausente', sanitized_at: agora })
    .where('id', '=', uploadIntentId)
    .where('sanitize_status', '=', 'pendente')
    .execute();
}

/** Quantas fotos de achado ainda estão com EXIF no balde. */
export async function contarFotosDoAchadoPendentes(db: DbExecutor): Promise<number> {
  const linha = await db
    .selectFrom('upload_intents')
    .select(sql<number>`count(*)::int`.as('total'))
    .where('kind', 'in', [...ESPECIES_DO_ACHADO])
    .where('sanitize_status', '=', 'pendente')
    .executeTakeFirst();
  return linha?.total ?? 0;
}

export function criarFotosDoAchadoDoWorker(db: DbExecutor): FotosDoAchadoDoWorker {
  return {
    paraHigienizar: (id) => fotoDoAchadoParaHigienizar(db, id),
    pendentes: (limite) => fotosDoAchadoPendentes(db, limite),
    marcarHigienizada: (id, chave, agora) =>
      marcarFotoDoAchadoHigienizada(db, id, chave, agora),
    marcarRecusada: (id, motivo, agora) => marcarFotoDoAchadoRecusada(db, id, motivo, agora),
    marcarAusente: (id, agora) => marcarFotoDoAchadoAusente(db, id, agora),
  };
}
