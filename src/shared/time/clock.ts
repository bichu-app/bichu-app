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

/**
 * O caminho de VOLTA: um texto ISO-8601 vira `Instant`, ou `undefined` quando
 * não é data.
 *
 * Mora aqui pela MESMA razão de `comoData`, e a terceira direção da mesma
 * regra. `new Date(texto)` não lê relógio nenhum — é conversão de um valor que
 * chegou de fora —, mas o lint o proíbe em `domain/` e `application/` com
 * razão, porque distinguir `new Date(x)` de `new Date()` por inspeção é
 * exatamente o tipo de exceção que para de valer no dia em que `x` fica opcional.
 *
 * Quem precisa disto é o cursor da linha do tempo
 * (`publications/domain/publicacao.ts`): o cursor viaja como texto e volta, e
 * sem um caminho declarado aquele arquivo inventaria uma supressão de lint.
 *
 * **`undefined` e não exceção**, e não `NaN`: cursor ilegível é `400` com campo,
 * decidido pela borda, e um `Instant` que vale `NaN` atravessaria a borda e
 * chegaria ao `WHERE` da consulta.
 */
export function comoInstante(iso: string): Instant | undefined {
  const milissegundos = new Date(iso).getTime();
  return Number.isNaN(milissegundos) ? undefined : (milissegundos as Instant);
}
