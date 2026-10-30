/** Contador de limite de chamadas. */
export type RateLimitDriver = 'memory' | 'postgres' | 'disabled';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds?: number;
}

export interface RateLimitStore {
  /** `bucketKey` já vem composto pela dimensão (uma lista de dois itens é um par). */
  hit(bucketKey: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
  /** Lê o balde **sem incrementar**. */
  peek(bucketKey: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
  /** Só existe para o preparo de cenário de teste. */
  reset(prefix?: string): Promise<void>;
}
