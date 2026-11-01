import type { Instant, PetId, UserId } from '../../../shared/types/brands.js';
import type {
  MotivoDoCancelamento,
  StatusDaTransferencia,
} from '../domain/janela-da-transferencia.js';

/** Identificador da transferencia. */
export type TransferId = string & { readonly __marca: 'TransferId' };

/** A transferencia como o tutor que iniciou a ve. */
export interface TransferenciaGravada {
  readonly id: TransferId;
  readonly petId: PetId;
  readonly fromUserId: UserId;
  readonly toUserId: UserId | null;
  /** Em claro. A mascara (`ma****@…`) e montada na borda, nunca gravada. */
  readonly recipientEmail: string;
  readonly status: StatusDaTransferencia;
  readonly inviteExpiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly effectiveAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancellationReason: MotivoDoCancelamento | null;
}

/** O que o aceite precisa saber sobre o convite apresentado. */
export interface ConviteResolvido {
  readonly id: TransferId;
  readonly petId: PetId;
  readonly fromUserId: UserId;
  /** Normalizado. O servico compara com o e-mail **verificado** do chamador. */
  readonly recipientEmail: string;
  readonly status: StatusDaTransferencia;
  readonly inviteExpiresAt: Date;
}

/** O que as duas rotas publicas do token de cancelamento precisam, e **so** isso. */
export interface TransferenciaPorTokenDeCancelamento {
  readonly id: TransferId;
  readonly petDisplayName: string;
  readonly status: StatusDaTransferencia;
  readonly effectiveAt: Date | null;
  readonly requestedAt: Date;
}

export interface NovaTransferencia {
  readonly id: TransferId;
  readonly petId: PetId;
  readonly fromUserId: UserId;
  readonly recipientEmail: string;
  readonly inviteTokenHash: Uint8Array;
  readonly inviteExpiresAt: Instant;
}

/** Por que a insercao nao recusa por excecao do banco. */
export type ResultadoDaAbertura =
  /** O pet nao existe, foi excluido, ou nao e deste tutor. */
  | { readonly tipo: 'pet_nao_e_deste_tutor' }
  /** Ja ha transferencia viva para este pet. */
  | { readonly tipo: 'ja_em_andamento' }
  /** O pet tem caso de perdido aberto. */
  | { readonly tipo: 'caso_aberto' }
  | { readonly tipo: 'aberta'; readonly transferencia: TransferenciaGravada };

export type ResultadoDoAceite =
  | { readonly tipo: 'aceita'; readonly transferencia: TransferenciaGravada }
  /**
   * Perdeu a corrida: outra requisicao aceitou ou cancelou entre a leitura e a
   * escrita.
   */
  | { readonly tipo: 'estado_mudou' };

export interface TransferRepository {
  /**
   * Abre a transferencia, conferindo o dono, o caso aberto e a unicidade **na mesma
   * transacao** em que insere.
   */
  abrir(nova: NovaTransferencia, agora: Instant): Promise<ResultadoDaAbertura>;

  /** **A busca vinculada.** `id` e `from_user_id` na mesma clausula `WHERE`. */
  buscarDoTutor(
    transferencia: TransferId,
    dono: UserId,
  ): Promise<TransferenciaGravada | undefined>;

  /** Pela posse do token. Ver as duas excecoes no cabecalho deste arquivo. */
  buscarPorTokenDeConvite(hash: Uint8Array): Promise<ConviteResolvido | undefined>;

  buscarPorTokenDeCancelamento(
    hash: Uint8Array,
  ): Promise<TransferenciaPorTokenDeCancelamento | undefined>;

  /**
   * Registra o aceite: grava `to_user_id`, `accepted_at`, `effective_at` e o resumo
   * do token de cancelamento, **condicionado** a linha ainda estar em
   * `pending_acceptance` e dentro do prazo.
   */
  registrarAceite(entrada: {
    readonly transferencia: TransferId;
    readonly toUserId: UserId;
    readonly cancelTokenHash: Uint8Array;
    readonly acceptedAt: Instant;
    readonly effectiveAt: Instant;
  }): Promise<ResultadoDoAceite>;

  /** Cancela, **condicionado** ao estado ainda permitir. */
  cancelar(entrada: {
    readonly transferencia: TransferId;
    readonly motivo: MotivoDoCancelamento;
    readonly quando: Instant;
    readonly consumirTokenDeCancelamento: boolean;
  }): Promise<TransferenciaGravada | undefined>;

  /** Cancela a transferencia viva **deste pet**, se houver, por causa externa. */
  cancelarVivaDoPet(entrada: {
    readonly pet: PetId;
    readonly motivo: MotivoDoCancelamento;
    readonly quando: Instant;
  }): Promise<TransferenciaGravada | undefined>;

  /** Marca como vencida a transferencia cujo convite passou das 72 h. */
  expirar(transferencia: TransferId, quando: Instant): Promise<boolean>;

  /** A CONSUMACAO, e ela e uma transacao so. */
  consumar(transferencia: TransferId, agora: Instant): Promise<ResultadoDaConsumacao>;
}

export type ResultadoDaConsumacao =
  | {
      readonly tipo: 'consumada';
      readonly transferencia: TransferenciaGravada;
      readonly tagsRevogadas: number;
    }
  /** Cancelada, expirada ou ja consumada. */
  | { readonly tipo: 'ja_resolvida' }
  /** A janela ainda nao fechou. */
  | { readonly tipo: 'ainda_na_janela'; readonly effectiveAt: Date }
  /** Ha caso de perdido aberto para este pet. */
  | { readonly tipo: 'caso_aberto' }
  /** O destinatario apagou a conta antes de consumar (`to_user_id` virou nulo). */
  | { readonly tipo: 'destinatario_sumiu' };
