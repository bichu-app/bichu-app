/** Dependências de teto para cenário de teste. */
import { dependenciasDoTeto, type DependenciasDoTeto } from './aplicacao-de-teto.js';
import { criarContadorEmMemoria } from './rate-limit.js';
import type { RateLimitStore } from '../ports/rate-limit-store.js';

/** Chave fixa e sem valor fora do teste: ela só precisa ser estável. */
export const CHAVE_DE_HMAC_DE_TESTE = Buffer.alloc(32, 7);

export function tetoDeTeste(
  contador: RateLimitStore = criarContadorEmMemoria(() => Date.now()),
  log: (evento: Record<string, unknown>, mensagem: string) => void = () => {},
): DependenciasDoTeto {
  return dependenciasDoTeto({ contador, chaveDeHmac: CHAVE_DE_HMAC_DE_TESTE, log });
}
