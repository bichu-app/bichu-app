/**
 * Portas transversais: as que mais de um módulo precisa.
 *
 * Porta específica de um módulo mora em `modules/<módulo>/ports/`, declarada
 * pelo módulo que a EXIGE — nunca pelo que a implementa (§6 e §11.3 de
 * docs/03-arquitetura.md).
 *
 * Regra que vale para todas: a implementação vive em `adapters/external/` e é
 * escolhida por variável de ambiente na composição da aplicação. **Nenhum SDK
 * de provedor é importado fora de `adapters/external/`**, e isso é imposto por
 * lint (src/architecture.rules.mjs), não por combinado.
 */
export type { Clock } from '../time/clock.js';
export type { JobQueue, JobKind, JobRecord } from './job-queue.js';
export type { RateLimitStore } from './rate-limit-store.js';
export type { SecretCipher } from './secret-cipher.js';
export type { IdGenerator } from './id-generator.js';
