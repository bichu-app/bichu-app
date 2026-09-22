/**
 * Porta de persistencia da transferencia de pet.
 *
 * **A forma desta porta e onde a autorizacao acontece** (ADR-0021), e e a mesma
 * decisao que `pet-repository.ts` e `tag-repository.ts` ja tinham tomado: todo
 * metodo que toca uma transferencia especifica do tutor recebe o dono como
 * argumento **obrigatorio**, e a busca e vinculada --
 * `WHERE pet_transfers.id = :t AND pet_transfers.from_user_id = :chamador`.
 *
 * Nao existe aqui um `buscarPorId` que devolva a linha para quem quiser comparar
 * o tutor depois. A alternativa funciona igual e depende de a comparacao estar
 * escrita em todos os pontos, para sempre; com esta forma o arranjo perigoso nao
 * esta disponivel para ser esquecido. Consequencia direta e intencional:
 * **transferencia de outro tutor responde 404, nunca 403.**
 *
 * ## As duas excecoes, e por que elas nao sao furo
 *
 * `buscarPorTokenDeConvite` e `buscarPorTokenDeCancelamento` nao recebem dono, e
 * nao poderiam: quem chega ali apresenta um segredo de 256 bits, e a posse do
 * token E a credencial. E a mesma forma de `resolverPorCodigo` nas tags. O que
 * elas devolvem e o minimo para a decisao seguinte, e a decisao de "este token e
 * para esta conta?" acontece no servico, com o e-mail verificado do chamador --
 * nao com uma comparacao de id que o cliente pudesse influenciar.
 *
 * ## O que sai daqui nao e a linha do banco
 *
 * Nenhum metodo devolve `invite_token_hash` nem `cancel_token_hash` para fora.
 * O que sai e a forma do dominio, e `recipientEmail` sai em claro **apenas** na
 * visao do tutor que iniciou -- quem monta a mascara e a borda.
 */
import type { Instant, PetId, UserId } from '../../../shared/types/brands.js';
import type {
  MotivoDoCancelamento,
  StatusDaTransferencia,
} from '../domain/janela-da-transferencia.js';

/** Identificador da transferencia. Interno: so aparece na visao autenticada. */
export type TransferId = string & { readonly __marca: 'TransferId' };

/** A transferencia como o tutor que iniciou a ve. Espelha `PetTransfer`. */
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

/**
 * O que as duas rotas publicas do token de cancelamento precisam, e **so** isso.
 *
 * Sem `petId`, sem `transferId` e sem o e-mail do destinatario: o
 * `TransferCancelView` do contrato e explicito, e imprimir o endereco de outra
 * pessoa numa pagina publica nao acrescenta nada a decisao de quem cancela
 * (ADR-0010).
 */
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

/**
 * Por que a insercao nao recusa por excecao do banco.
 *
 * O indice parcial `pet_transfers_uma_viva_por_pet` e a garantia, mas a
 * violacao dele chega como `23505` -- um 500, para um caso que o contrato
 * promete como 409. O adaptador traduz, e a porta entrega o resultado nomeado.
 */
export type ResultadoDaAbertura =
  /** O pet nao existe, foi excluido, ou nao e deste tutor. Os tres sao 404. */
  | { readonly tipo: 'pet_nao_e_deste_tutor' }
  /** Ja ha transferencia viva para este pet. 409. */
  | { readonly tipo: 'ja_em_andamento' }
  /** O pet tem caso de perdido aberto. 409, e o contrato o declara junto. */
  | { readonly tipo: 'caso_aberto' }
  | { readonly tipo: 'aberta'; readonly transferencia: TransferenciaGravada };

export type ResultadoDoAceite =
  | { readonly tipo: 'aceita'; readonly transferencia: TransferenciaGravada }
  /** Perdeu a corrida: outra requisicao aceitou ou cancelou entre a leitura e a escrita. */
  | { readonly tipo: 'estado_mudou' };

export interface TransferRepository {
  /**
   * Abre a transferencia, conferindo o dono, o caso aberto e a unicidade **na
   * mesma transacao** em que insere. Conferir antes e inserir depois deixa duas
   * requisicoes simultaneas passarem pela conferencia de "ja em andamento".
   */
  abrir(nova: NovaTransferencia, agora: Instant): Promise<ResultadoDaAbertura>;

  /**
   * **A busca vinculada.** `id` e `from_user_id` na mesma clausula `WHERE`.
   * `undefined` para "nao existe" e para "nao e sua", que sao a mesma resposta.
   */
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
   * Registra o aceite: grava `to_user_id`, `accepted_at`, `effective_at` e o
   * resumo do token de cancelamento, **condicionado** a linha ainda estar em
   * `pending_acceptance` e dentro do prazo. A condicao mora no `WHERE` e nao num
   * `if` antes da chamada: sem ela, dois aceites simultaneos do mesmo convite
   * agendariam duas consumacoes.
   */
  registrarAceite(entrada: {
    readonly transferencia: TransferId;
    readonly toUserId: UserId;
    readonly cancelTokenHash: Uint8Array;
    readonly acceptedAt: Instant;
    readonly effectiveAt: Instant;
  }): Promise<ResultadoDoAceite>;

  /**
   * Cancela, **condicionado** ao estado ainda permitir. Devolve a linha
   * resultante, ou `undefined` quando ela ja tinha saido da janela -- que e o
   * que faz o cancelamento por token deixar de funcionar depois de consumada
   * sem depender de nenhuma leitura anterior.
   *
   * `consumirTokenDeCancelamento` apaga o resumo do token na mesma escrita: o
   * contrato diz uso unico, e uso unico que depende de uma segunda instrucao
   * nao e uso unico.
   */
  cancelar(entrada: {
    readonly transferencia: TransferId;
    readonly motivo: MotivoDoCancelamento;
    readonly quando: Instant;
    readonly consumirTokenDeCancelamento: boolean;
  }): Promise<TransferenciaGravada | undefined>;

  /**
   * Cancela a transferencia viva **deste pet**, se houver, por causa externa.
   * Devolve `undefined` quando nao havia nenhuma -- o caminho normal, e por isso
   * silencioso. E o que `lostfound` chama ao abrir um caso.
   */
  cancelarVivaDoPet(entrada: {
    readonly pet: PetId;
    readonly motivo: MotivoDoCancelamento;
    readonly quando: Instant;
  }): Promise<TransferenciaGravada | undefined>;

  /** Marca como vencida a transferencia cujo convite passou das 72 h. */
  expirar(transferencia: TransferId, quando: Instant): Promise<boolean>;

  /**
   * A CONSUMACAO, e ela e uma transacao so.
   *
   * Troca `pets.owner_user_id`, revoga **todas** as tags ativas do pet com
   * `pet_transferred` (ADR-0004) e move a linha para `effective` -- tudo ou
   * nada. Separar em tres chamadas deixaria o pet trocando de dono com a
   * plaquinha antiga ainda resolvendo, que e o unico estado que este desenho
   * existe para nunca produzir.
   *
   * Ela **reconfere** dentro da transacao, e a reconferencia nao e paranoia: o
   * trabalho foi agendado 24 h antes, e o mundo mudou nesse meio-tempo.
   */
  consumar(transferencia: TransferId, agora: Instant): Promise<ResultadoDaConsumacao>;
}

export type ResultadoDaConsumacao =
  | {
      readonly tipo: 'consumada';
      readonly transferencia: TransferenciaGravada;
      readonly tagsRevogadas: number;
    }
  /** Cancelada, expirada ou ja consumada. Nada a fazer, e nao e erro. */
  | { readonly tipo: 'ja_resolvida' }
  /** A janela ainda nao fechou. O trabalho foi acordado cedo. */
  | { readonly tipo: 'ainda_na_janela'; readonly effectiveAt: Date }
  /**
   * Ha caso de perdido aberto para este pet. **A transferencia e cancelada**, e
   * nao adiada: ver o cabecalho de `pet-transfer-service.ts`.
   */
  | { readonly tipo: 'caso_aberto' }
  /** O destinatario apagou a conta antes de consumar (`to_user_id` virou nulo). */
  | { readonly tipo: 'destinatario_sumiu' };
