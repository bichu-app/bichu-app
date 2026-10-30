/** Portas transversais: as que mais de um módulo precisa. */
export type { Clock } from '../time/clock.js';
export type { JobQueue, JobKind, JobRecord } from './job-queue.js';
export type { RateLimitStore } from './rate-limit-store.js';
export type { SecretCipher } from './secret-cipher.js';
export type { SecretProvider, NomeDeSegredo } from './secret-provider.js';
export { SegredoIndisponivelError } from './secret-provider.js';
export type { IdGenerator } from './id-generator.js';
