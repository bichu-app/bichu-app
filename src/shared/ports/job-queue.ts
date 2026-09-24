/**
 * Fila de trabalho do domínio.
 *
 * Hoje: tabela `jobs` no Postgres, consumida com `FOR UPDATE SKIP LOCKED`
 * (ADR-0001). Amanhã: fila gerenciada, **se algum dia houver motivo** — e não há
 * hoje, de propósito: é um componente a menos para operar e zero vínculo com
 * provedor. O passo 4 da §16 depende de `SKIP LOCKED` já ser seguro para várias
 * instâncias, e ele é.
 *
 * Regra normativa do payload (§11.5): **carrega identificador, nunca conteúdo
 * renderizado.** Enfileirar um corpo de e-mail já montado gravaria a URL base
 * vigente numa linha que só vai ser lida horas depois — é a forma mais provável
 * de `localhost` vazar para produção, e é silenciosa.
 */
import type { Instant } from '../types/brands.js';

export type JobKind =
  | 'alert.dispatch'
  | 'alert.resend'
  | 'case.reminder'
  | 'case.transfer_consummate'
  | 'media.process_upload'
  /** ADR-0027 item 10: a imagem de catalogo enviada pelo painel (item da Loja, encontro da Rede). */
  | 'media.process_catalog_image'
  | 'media.purge_expired'
  | 'email.send'
  | 'push.send'
  | 'match.recompute';

export interface JobRecord<P = unknown> {
  readonly id: string;
  readonly kind: JobKind;
  readonly payload: P;
  readonly runAt: Instant;
  readonly attempts: number;
  readonly maxAttempts: number;
}

export interface JobQueue {
  /** `payload` só com identificador. Ver a regra acima. */
  enqueue<P>(kind: JobKind, payload: P, runAt?: Instant): Promise<string>;
  /** Reserva até `limit` itens prontos, com trava de linha. */
  claim(limit: number): Promise<readonly JobRecord[]>;
  complete(id: string): Promise<void>;
  fail(id: string, error: string, retryAt?: Instant): Promise<void>;
}
