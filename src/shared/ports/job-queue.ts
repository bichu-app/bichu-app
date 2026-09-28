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

/**
 * O que a varredura de órfãos encontrou e o que ela fez com cada linha.
 *
 * `desistiu` é a informação que o chamador não consegue deduzir: um trabalho
 * devolvido à fila vai ser tentado outra vez e não precisa de nada de ninguém;
 * um trabalho que esgotou a tolerância a orfandade é **final**, e quem sabe o
 * que aquele trabalho prometia a alguém tem de desfazer a promessa. É por essa
 * porta que a foto sai de `processing`.
 */
export interface TrabalhoRecuperado {
  readonly id: string;
  readonly kind: JobKind;
  readonly payload: unknown;
  /** Quantas vezes o processo morreu segurando este trabalho, contando esta. */
  readonly orfandades: number;
  /** `true` quando virou `failed` e não volta mais. */
  readonly desistiu: boolean;
}

export interface CriteriosDeOrfandade {
  /**
   * Quanto tempo de `running` sem sinal de vida é órfão.
   *
   * Prazo curto rouba trabalho legítimo no meio; prazo longo deixa a foto presa.
   * O número e o argumento estão em `worker.ts`, junto da medição que o
   * sustenta.
   */
  readonly prazoEmMs: number;
  /**
   * Quantas orfandades o mesmo trabalho pode acumular antes de ser final.
   *
   * Não é `max_attempts`: aquele conta falha por exceção, que acusa o ambiente.
   * Este conta morte de processo com o trabalho na mão, que acusa a carga.
   */
  readonly tetoDeOrfandade: number;
  /** Teto de linhas por varredura, para uma passada não virar uma transação longa. */
  readonly limite: number;
}

export interface JobQueue {
  /** `payload` só com identificador. Ver a regra acima. */
  enqueue<P>(kind: JobKind, payload: P, runAt?: Instant): Promise<string>;
  /** Reserva até `limit` itens prontos, com trava de linha. */
  claim(limit: number): Promise<readonly JobRecord[]>;
  complete(id: string): Promise<void>;
  fail(id: string, error: string, retryAt?: Instant): Promise<void>;
  /**
   * Devolve à fila o que ficou `running` além do prazo, e declara final o que
   * já foi recuperado vezes demais.
   *
   * **Sem isto, `running` não tem saída nenhuma.** `claim` só olha `pending`, e
   * `complete`/`fail` só são alcançados por um processo vivo: trabalho cujo
   * processo morreu fica `running` para sempre, sem erro, sem alarme e sem
   * ninguém para tentar de novo.
   */
  recuperarOrfaos(criterios: CriteriosDeOrfandade): Promise<readonly TrabalhoRecuperado[]>;
}
