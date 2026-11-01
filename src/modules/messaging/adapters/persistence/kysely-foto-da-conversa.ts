import type { Db } from '../../../../shared/db/pool.js';
import { ESPECIES_DO_ACHADO } from '../../../media/ports/fotos-do-achado.js';
import type { FotoDaConversa, FotoParaAMensagem } from '../../ports/foto-da-conversa.js';
import type { ConversationId } from '../../../../shared/types/brands.js';

interface LinhaDaHigiene {
  sanitize_status: 'pendente' | 'pronta' | 'recusada' | 'ausente';
  sanitized_key: string | null;
  sanitize_rejection_reason: string | null;
}

function comoFoto(linha: LinhaDaHigiene | undefined): FotoParaAMensagem {
  if (linha === undefined) return { situacao: 'nao-encontrada' };
  switch (linha.sanitize_status) {
    case 'pronta':
      return linha.sanitized_key === null
        ? { situacao: 'nao-encontrada' }
        : { situacao: 'pronta', chaveHigienizada: linha.sanitized_key };
    case 'recusada':
      return { situacao: 'recusada', motivo: linha.sanitize_rejection_reason ?? '' };
    case 'ausente':
      return { situacao: 'ausente' };
    case 'pendente':
    default:
      return { situacao: 'pendente' };
  }
}

/** O LADO COM CONTA. Três predicados, e nenhum deles é dispensável. */
export function construtorDaFotoDoLadoComConta(
  db: Db,
  conversa: ConversationId,
  chamador: string,
  uploadId: string,
) {
  return db
    .selectFrom('upload_intents')
    .innerJoin('conversations', (join) =>
      join.onRef('conversations.found_report_id', '=', 'upload_intents.found_report_id'),
    )
    .select([
      'upload_intents.sanitize_status',
      'upload_intents.sanitized_key',
      'upload_intents.sanitize_rejection_reason',
    ])
    .where('upload_intents.id', '=', uploadId)
    .where('upload_intents.kind', 'in', [...ESPECIES_DO_ACHADO])
    .where('conversations.id', '=', conversa)
    .where((eb) =>
      eb.or([
        eb('conversations.tutor_user_id', '=', chamador),
        eb('conversations.finder_user_id', '=', chamador),
      ]),
    );
}

/** O LADO SEM CONTA, pela referência opaca. */
export function construtorDaFotoDoAchadorSemConta(db: Db, resumo: Uint8Array, uploadRef: string) {
  return db
    .selectFrom('upload_intents')
    .innerJoin('found_reports', 'found_reports.id', 'upload_intents.found_report_id')
    .select([
      'upload_intents.sanitize_status',
      'upload_intents.sanitized_key',
      'upload_intents.sanitize_rejection_reason',
    ])
    .where('upload_intents.upload_ref', '=', uploadRef)
    .where('upload_intents.kind', 'in', [...ESPECIES_DO_ACHADO])
    .where('found_reports.finder_token_hash', '=', Buffer.from(resumo));
}

export function criarFotoDaConversa(db: Db): FotoDaConversa {
  return {
    async porUploadId(conversa, chamador, uploadId): Promise<FotoParaAMensagem> {
      if (!/^[0-9a-fA-F-]{36}$/.test(uploadId)) return { situacao: 'nao-encontrada' };
      const linha = await construtorDaFotoDoLadoComConta(
        db,
        conversa,
        chamador,
        uploadId,
      ).executeTakeFirst();
      return comoFoto(linha);
    },

    async pelaReferenciaDoAchador(resumo, uploadRef): Promise<FotoParaAMensagem> {
      const linha = await construtorDaFotoDoAchadorSemConta(
        db,
        resumo,
        uploadRef,
      ).executeTakeFirst();
      return comoFoto(linha);
    },
  };
}
