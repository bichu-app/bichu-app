/**
 * Contador de limite de chamadas.
 *
 * Hoje: em processo, com o serviço em UMA tarefa (dívida 2 do ADR-0001).
 * Em teste e na esteira: `RATE_LIMIT_DRIVER=postgres`, contra a tabela
 * `rate_limit_counters`, que **já existe no modelo** — é o que permite ao QA
 * zerar os contadores entre cenários sem que a aplicação ganhe endpoint de
 * teste.
 *
 * **Aviso que precisa estar no código e não só no documento:** com duas
 * instâncias e o driver em processo, todo número da política de
 * `docs/04-seguranca.md` dobra em silêncio, porque cada instância conta o seu.
 * Não é degradação elegante: é a proteção valendo metade sem nenhum alarme.
 * O passo 4 da §16 exige trocar o driver ANTES de subir a segunda instância.
 */
export type RateLimitDriver = 'memory' | 'postgres' | 'disabled';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds?: number;
}

export interface RateLimitStore {
  /** `bucketKey` já vem composto pela dimensão (uma lista de dois itens é um par). */
  hit(bucketKey: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
  /**
   * Lê o balde **sem incrementar**.
   *
   * Existe por causa de `applies_to: invalid_attempts`. Esse recorte conta só a
   * tentativa que se revelou inválida, e só dá para saber se ela era inválida
   * DEPOIS de conferir — mas a conferência é justamente o trabalho caro que o
   * teto existe para não pagar. Com `hit()` na entrada, toda tentativa válida
   * consumiria o contador de inválidas, e o critério 8 da BICHUS-178 existe
   * para impedir exatamente isso.
   *
   * Então: consulta na entrada (recusa quem já estourou, antes de qualquer
   * trabalho), e `hit()` depois, só quando a tentativa se revelou inválida.
   */
  peek(bucketKey: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
  /** Só existe para o preparo de cenário de teste. Recusa em produção. */
  reset(prefix?: string): Promise<void>;
}
