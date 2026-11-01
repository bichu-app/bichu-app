import type { IndicacaoNaFila, RevisaoDaIndicacao } from '../domain/fila-de-indicacoes.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { Pagina, TransacaoDoDiretorio } from './diretorio-administrativo.js';

export interface RecorteDaFila {
  /** Sem filtro, a fila de `pending`. */
  readonly reviewStatus?: RevisaoDaIndicacao | undefined;
  readonly page: number;
  readonly limit: number;
}

/** A pagina da fila, com a contagem do aviso do menu. */
export interface PaginaDaFila extends Pagina<IndicacaoNaFila> {
  readonly pendentes: number;
}

export interface TransacaoDaFila extends TransacaoDoDiretorio {
  /** A indicacao com trava de linha. */
  indicacaoPorRef(ref: string): Promise<IndicacaoNaFila | null>;
  /**
   * Marca `approved`, carimba `decided_at` e liga a indicacao a entrada, **por
   * `slug`**: o UUID da entrada e resolvido dentro do adaptador e nao atravessa esta
   * fronteira (ADR-0010 item 6).
   */
  marcarAprovada(ref: string, entradaSlug: string, agora: Instant): Promise<IndicacaoNaFila>;
  /** Marca `declined`, carimba `decided_at` e grava o motivo. */
  marcarRecusada(ref: string, motivo: string, agora: Instant): Promise<IndicacaoNaFila>;
}

export interface FilaDeIndicacoesRepository {
  emTransacao<T>(trabalho: (tx: TransacaoDaFila) => Promise<T>): Promise<T>;
  listar(recorte: RecorteDaFila): Promise<PaginaDaFila>;
  indicacaoPorRef(ref: string): Promise<IndicacaoNaFila | null>;
}
