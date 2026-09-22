/**
 * Dependências de teto para cenário de teste.
 *
 * Existe pelo mesmo motivo de `time/relogio-de-teste.ts`: o cenário precisa de
 * um contador de verdade, e montá-lo à mão em cada arquivo faria cada teste
 * exercitar uma fiação ligeiramente diferente da que roda.
 *
 * **O padrão é `criarContadorEmMemoria`, e nunca `criarContadorDesligado`.** Um
 * auxiliar de teste que desligue o teto por omissão é a forma mais barata de
 * reintroduzir o defeito da BICHUS-178: toda asserção de limite passaria, e ela
 * passaria porque não há limite. Quem quiser o contador desligado — e há um uso
 * legítimo, que é a isca do portão de vigência — passa `criarContadorDesligado()`
 * explicitamente, escrito na linha, onde a revisão vê.
 */
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
