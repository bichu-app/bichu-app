/** A fila das duvidas que chegam pelo botao `Ajuda` do menu do usuario. */
import type { AtorAdministrativo } from '../../audit/ports/trilha-administrativa.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';

/** O que o tutor escreveu, ja aparado e dentro dos tetos do contrato. */
export interface DuvidaParaRegistrar {
  readonly autor: UserId;
  readonly assunto: string;
  readonly texto: string;
}

/** Uma linha da fila, **como o painel a le**. */
export interface DuvidaNaFila {
  /** O endereco OPACO da duvida, 22 simbolos. */
  readonly ref: string;
  readonly assunto: string;
  readonly texto: string;
  readonly criadaEm: Instant;
  /** Quando foi atendida, ou `undefined` enquanto esta na fila. */
  readonly atendidaEm?: Instant;
  /** O nome de exibicao da OPERADORA que marcou, ou `undefined`. */
  readonly atendidaPor?: string;
}

/** O recorte da fila. Derivado de `attended_at`, e nao uma coluna de texto. */
export type SituacaoDaDuvida = 'open' | 'attended';

/** Uma pagina da fila, no formato que o painel ja usa nas outras duas. */
export interface PaginaDaFila {
  readonly itens: readonly DuvidaNaFila[];
  /** O total do RECORTE desta chamada, com o filtro aplicado. */
  readonly total: number;
  /** Quantas estao ABERTAS, **ignorando o filtro**. */
  readonly abertas: number;
}

export interface DuvidasDeAjuda {
  /**
   * Grava a duvida. **Nao notifica ninguem**: nao escreve em `notification_items`,
   * nao enfileira e-mail e nao dispara push.
   */
  registrar(duvida: DuvidaParaRegistrar, agora: Instant): Promise<void>;

  /**
   * A fila, da mais nova para a mais velha -- a consulta que o painel usa, e a mesma
   * que o indice `help_requests_da_fila` serve.
   */
  listarAFila(
    situacao: SituacaoDaDuvida,
    pagina: number,
    limite: number,
  ): Promise<PaginaDaFila>;

  /** Marca como atendida, e devolve a duvida como ela ficou. */
  marcarAtendida(
    ator: AtorAdministrativo,
    ref: string,
    agora: Instant,
  ): Promise<DuvidaNaFila | undefined>;
}
