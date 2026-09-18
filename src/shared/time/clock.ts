/**
 * Relógio injetável.
 *
 * Requisito de testabilidade da §7 de docs/03-arquitetura.md, e regra normativa:
 * **`Date.now()` e `new Date()` são proibidos em `domain/` e `application/`.**
 * A proibição é imposta por lint (src/architecture.rules.mjs) e existe porque
 * sem ela não há como testar, sem esperar, o que o produto depende de tempo:
 * expiração de token (30 min), validade da localização (30 dias), lembrete de
 * desfecho (24 h e depois 48 h), prazo de reabertura (7 dias), idempotência
 * (24 h) e teto de fadiga (3 alertas em 24 h).
 *
 * O `Instant` é marcado de propósito: um `number` cru não é aceito onde se
 * espera um instante, então o atalho de passar `Date.now()` adiante não compila.
 */
import type { Instant } from '../types/brands.js';

export interface Clock {
  now(): Instant;
}

/**
 * Implementação real. Vive aqui, e este é o ÚNICO arquivo de `src/` autorizado
 * a chamar `Date.now()`. A exceção está declarada na regra de lint pelo caminho
 * do arquivo, e não por comentário de supressão — comentário de supressão que o
 * formatador move deixa de cobrir o que deveria.
 */
export const systemClock: Clock = {
  now: () => Date.now() as Instant,
};

/**
 * Converte um instante para `Date`, e mora aqui pelo mesmo motivo do relógio.
 *
 * A regra de lint proíbe `new Date()` em `domain/` e `application/`, e a
 * proibição é boa: é ela que impede o relógio de parede de voltar por uma porta
 * lateral. Mas ela também alcança `new Date(instante)`, que **não** lê relógio
 * nenhum — é conversão de um valor que já veio de `Clock`.
 *
 * Sem um caminho declarado, cada lugar que precisar disso vai inventar o seu, e
 * o que se inventa nessas horas é uma supressão de lint — que o formatador move
 * e que para de cobrir o que deveria. O caminho declarado é esta função.
 */
export function comoData(instante: Instant): Date {
  return new Date(instante);
}

/** O mesmo, para o formato que o contrato usa no fio (`format: date-time`). */
export function comoIso(instante: Instant): string {
  return new Date(instante).toISOString();
}
