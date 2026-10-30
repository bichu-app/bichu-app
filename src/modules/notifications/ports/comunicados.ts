/** A porta do COMUNICADO. */
import type { TransacaoDeEscrita } from '../../audit/ports/audit-log.js';
import type {
  Comunicado,
  PaginaDeComunicados,
  JanelaDeDisparo,
  RascunhoDeComunicado,
} from '../domain/comunicado.js';

export type TransacaoDoComunicado = TransacaoDeEscrita;

/** O comunidado gravado, com o `id` INTERNO ao lado. */
export interface ComunicadoGravado {
  readonly id: string;
  readonly comunicado: Comunicado;
}

export interface RepositorioDeComunicados {
  /** Os ja disparados, do mais recente para o mais antigo. */
  listar(pagina: number, limite: number): Promise<PaginaDeComunicados>;

  /** O que o disparo alcancaria agora, quantos ainda cabem hoje e qual e o teto. */
  janelaDeDisparo(): Promise<JanelaDeDisparo>;

  /**
   * Grava o comunicado e abre em leque uma notificacao por conta habilitada, dentro
   * da transacao recebida.
   */
  disparar(
    trx: TransacaoDoComunicado,
    adminId: string,
    rascunho: RascunhoDeComunicado,
  ): Promise<ComunicadoGravado | undefined>;
}
