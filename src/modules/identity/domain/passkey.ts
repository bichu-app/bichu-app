/** As regras puras da credencial digital (passkey), BICHUS-301. */
import type { Instant } from '../../../shared/types/brands.js';

/** Teto de credenciais ATIVAS por conta. */
export const TETO_DE_PASSKEYS_POR_CONTA = 10;

/**
 * Prazo do desafio, em milissegundos — a unidade que o WebAuthn usa no `timeout`,
 * e a mesma que o servidor aplica na cópia guardada.
 */
export const PRAZO_DO_DESAFIO_MS = 300_000;

/** Algoritmos COSE aceitos, em ordem de preferência: ES256 e RS256. */
export const ALGORITMOS_ACEITOS: readonly number[] = [-7, -257];

/** Teto do rótulo do aparelho. */
export const TETO_DO_ROTULO = 60;

export type PropositoDoDesafio = 'registration' | 'authentication';

export type RazaoDaRevogacao = 'user' | 'counter_regression' | 'account_deleted';

/** O contador de assinatura aceita esta asserção? */
export function contadorAceito(guardado: bigint, recebido: bigint): boolean {
  if (guardado === 0n && recebido === 0n) return true;
  return recebido > guardado;
}

/** O desafio ainda vale neste instante? */
export function desafioValido(
  desafio: { readonly expiraEm: Instant; readonly consumidoEm: Instant | null },
  agora: Instant,
): boolean {
  if (desafio.consumidoEm !== null) return false;
  return desafio.expiraEm > agora;
}

/** O rótulo do aparelho, normalizado, ou `null`. */
export function rotuloNormalizado(bruto: string | undefined): string | null {
  if (bruto === undefined) return null;
  const aparado = bruto.trim();
  if (aparado === '') return null;
  return aparado.slice(0, TETO_DO_ROTULO);
}
