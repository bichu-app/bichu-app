/** O acesso de quem achou o pet e não tem conta (BICHUS-41), como regra. */
import type { Instant } from '../../../shared/types/brands.js';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** "mais 30 dias" do contrato, depois do encerramento do caso. */
export const DIAS_DE_LEITURA_DEPOIS_DO_ENCERRAMENTO = 30;

const FORMATO_DO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** O token tem a forma de um `opaqueToken`. */
export function tokenBemFormado(token: string): boolean {
  return FORMATO_DO_TOKEN.test(token);
}

export interface CasoDaConversa {
  readonly aberto: boolean;
  readonly encerradoEm: Date | null;
}

export interface ValidadeDoToken {
  /** `found_reports.finder_token_expires_at`: 30 dias a partir do aviso. */
  readonly expiraEm: Date;
  /** O caso ligado à conversa. */
  readonly caso: CasoDaConversa | null;
}

/** A regra da validade, inteira. */
export function tokenDoAchadorVale(validade: ValidadeDoToken, agora: Instant): boolean {
  if (agora < validade.expiraEm.getTime()) return true;
  const caso = validade.caso;
  if (caso === null) return false;
  if (caso.aberto) return true;
  if (caso.encerradoEm === null) return false;
  return agora < caso.encerradoEm.getTime() + DIAS_DE_LEITURA_DEPOIS_DO_ENCERRAMENTO * DIA_EM_MS;
}

const PREFIXO_DO_CURSOR = 'p:';

/** A posição da próxima página, opaca para o cliente e sem id dentro. */
export function codificarCursorDoAchador(posicao: number): string {
  return Buffer.from(`${PREFIXO_DO_CURSOR}${String(posicao)}`, 'utf8').toString('base64url');
}

/**
 * `undefined` para cursor ausente ou que não saiu daqui: a leitura começa do
 * início.
 */
export function decodificarCursorDoAchador(cursor: string | undefined): number | undefined {
  if (cursor === undefined || cursor === '') return undefined;
  const cru = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!cru.startsWith(PREFIXO_DO_CURSOR)) return undefined;
  const numero = cru.slice(PREFIXO_DO_CURSOR.length);
  if (!/^\d{1,9}$/.test(numero)) return undefined;
  return Number(numero);
}
