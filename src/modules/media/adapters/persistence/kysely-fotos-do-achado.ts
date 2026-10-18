/**
 * A leitura e a escrita da higiene da foto do achado, em `upload_intents`.
 *
 * ## O `dono` sai da CHAVE, e não de uma coluna
 *
 * A derivada higienizada mora em `found-reports/{dono}/sanitized/{...}`, e o
 * `{dono}` precisa ser o mesmo segmento que o original usou: o
 * `found_report_id` na foto de quem tem conta, e o rótulo fixo `sem-conta` na
 * de quem não tem (`chaveDaFotoDoAchadorSemConta`, SEC-001 — o id do aviso não
 * sai para o achador sem conta, nem dentro de uma chave que a política assinada
 * carrega de volta para ele).
 *
 * Então ele é lido do segundo segmento da chave do original, e não de
 * `upload_intents.found_report_id`: usar a coluna faria a derivada do achador
 * sem conta cair em `found-reports/{uuid}/sanitized/` enquanto o original está
 * em `found-reports/sem-conta/original/` — dois prefixos para a mesma foto, e a
 * política de ciclo de vida dos 30 dias (ADR-0010) alcançaria um e não o outro.
 *
 * ## Os dois `kind`, e nenhum outro
 *
 * `found_report_photo` e `finder_photo`. `pet_photo` NÃO entra: ela tem o
 * caminho dela, com tabela própria (`pet_photos`) e derivada pública. Uma
 * varredura que pegasse os três higienizaria a foto de pet duas vezes.
 */
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

// Os dois `kind` do achado vêm da PORTA (`ESPECIES_DO_ACHADO`) e não de uma
// `const` daqui. A cópia local que existia aqui era invisível para a varredura
// de envios vencidos, que por isso apagava a foto do achado.

interface LinhaDeEnvio {
  readonly id: string;
  readonly object_key: string;
  readonly sanitize_status: StatusDaHigiene;
}

/**
 * O segmento de dono da chave do original.
 *
 * `found-reports/{dono}/original/{nome}` — a forma é conferida por
 * `comoObjectKey`, que recusa segmento vazio, `.` e `..`, então o índice 1
 * existe e não atravessa caminho. Uma chave de outra forma (importação, dado
 * antigo) não tem dono e a higiene não a toca: recusar aqui é melhor que
 * adivinhar onde gravar a derivada.
 */
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
    // Mesma porta da geração: o texto vem do banco e vai virar `pathname` de
    // uma URL assinada, e `pathname` RESOLVE `..` (BICHUS-134).
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

/**
 * As intenções pendentes, mais antigas primeiro.
 *
 * `ORDER BY created_at` e não aleatório: a foto que chegou antes é a que está
 * há mais tempo com EXIF no balde, e é ela que precisa sair primeiro.
 *
 * O limite vem de quem chama e não tem padrão aqui: uma varredura sem teto
 * enfileiraria toda a tabela numa passada depois de um reinício longo.
 */
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
  // `flatMap` e não `map`: a chave de forma desconhecida sai da lista em vez de
  // virar uma foto sem dono que o caso de uso teria de tratar.
  return linhas.flatMap((linha) => {
    const foto = comoFoto(linha);
    return foto === null ? [] : [foto];
  });
}

/**
 * `WHERE sanitize_status = 'pendente'` nas três escritas, e é ele que faz o
 * estado final não voltar: o trabalho reentregue depois de um reinício
 * encontra `pronta` e não sobrescreve nada.
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

/**
 * Quantas fotos de achado ainda estão com EXIF no balde.
 *
 * Uma consulta de UMA linha, para o log da varredura: é o número que diz se a
 * higiene está acompanhando o envio ou ficando atrás dele.
 */
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
