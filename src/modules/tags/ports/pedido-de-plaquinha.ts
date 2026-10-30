/** O pedido do OBJETO FISICO da plaquinha da coleira. */
import type { AdminAccountId, PetId, UserId } from '../../../shared/types/brands.js';
import type { TransacaoDeEscrita } from '../../audit/ports/audit-log.js';

/**
 * O `CHECK` `collar_tag_requests_decisao_conhecida`: a DECISAO do painel, e so
 * ela.
 */
export type DecisaoDoPedidoDePlaquinha = 'pending' | 'fulfilled' | 'declined';

/**
 * O `CHECK` `collar_tag_requests_entrega_conhecida`: o EIXO DA ENTREGA, e os tres
 * passos que o cliente nomeou em 18/10 -- solicitado, em transporte, chegou.
 */
export type PassoDaEntrega = 'requested' | 'in_transit' | 'arrived';

/** Os passos que a rota aceita como ALVO. */
export type PassoAlcancavelDoPedido = Exclude<PassoDaEntrega, 'requested'>;

/**
 * O que o painel escreve numa atualizacao de entrega: o passo e o que fazer com o
 * codigo de rastreio.
 */
export interface EntregaAAtualizar {
  readonly passo: PassoDaEntrega;
  readonly rastreio: string | null | undefined;
}

/** O endereco de entrega, como o tutor o digitou. */
export interface EnderecoDeEntrega {
  /** Quem recebe, como vai na etiqueta. */
  readonly destinatario: string;
  /** E.164 do Brasil. Obrigatorio: a transportadora costuma exigir. */
  readonly telefone: string;
  /** Oito digitos, sem mascara. */
  readonly cep: string;
  readonly logradouro: string;
  /** Texto, e nao inteiro: `s/n`, `120A` e `KM 32` sao numeros de porta. */
  readonly numero: string;
  /** O unico opcional do endereco. */
  readonly complemento: string | null;
  readonly bairro: string;
  readonly cidade: string;
  readonly uf: string;
}

/** O pedido como o APP o ve. */
export interface PedidoDoTutor {
  /** O identificador opaco, 128 bits em base64url. */
  readonly ref: string;
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly solicitadoEm: Date;
  readonly decididoEm: Date | null;
  readonly observacao: string | null;
  /** O passo da entrega -- `requested`, `in_transit` ou `arrived`. */
  readonly passoDaEntrega: PassoDaEntrega;
  /** O codigo de rastreio, ou nulo. */
  readonly codigoDeRastreio: string | null;
  /** Quando saiu. Nulo enquanto o passo e `requested`. */
  readonly despachadoEm: Date | null;
  /** Quando chegou. Nulo em tudo que nao chegou. */
  readonly entregueEm: Date | null;
}

/** O pedido como a FILA DO PAINEL o ve. */
export interface PedidoNaFilaDePlaquinhas {
  /** Interno, para a trilha. Nunca projetado em resposta. */
  readonly id: string;
  readonly ref: string;
  readonly petNome: string;
  readonly petEspecie: string;
  readonly endereco: EnderecoDeEntrega;
  readonly observacao: string | null;
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly solicitadoEm: Date;
  readonly decididoEm: Date | null;
  readonly passoDaEntrega: PassoDaEntrega;
  readonly codigoDeRastreio: string | null;
  readonly despachadoEm: Date | null;
  readonly entregueEm: Date | null;
}

export interface RecorteDaFilaDePlaquinhas {
  readonly status?: DecisaoDoPedidoDePlaquinha | undefined;
  /**
   * Recorta por PASSO DA ENTREGA, e combina com `status` em vez de substitui-lo: os
   * dois sao eixos diferentes.
   */
  readonly passoDaEntrega?: PassoDaEntrega | undefined;
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDaFilaDePlaquinhas {
  readonly itens: readonly PedidoNaFilaDePlaquinhas[];
  readonly total: number;
}

export interface PedidoDePlaquinhaRepository {
  /** Cria o pedido do tutor, ou devolve o pendente que ja existe. */
  criarOuDevolverPendente(entrada: {
    readonly id: string;
    readonly ref: string;
    readonly petId: PetId;
    readonly solicitante: UserId;
    readonly endereco: EnderecoDeEntrega;
    readonly observacao: string | null;
  }): Promise<PedidoDoTutor | undefined>;

  /** Os pedidos de UM pet do chamador, do mais recente para o mais antigo. */
  listarDoPet(
    petId: PetId,
    solicitante: UserId,
  ): Promise<readonly PedidoDoTutor[] | undefined>;

  /** A fila do painel. Pedido de pet excluido nao aparece: a linha cai com o pet. */
  listarFila(recorte: RecorteDaFilaDePlaquinhas): Promise<PaginaDaFilaDePlaquinhas>;

  /** Com `FOR UPDATE`: a decisao segura a linha ate o `COMMIT`. */
  pedidoPorRef(trx: TransacaoDeEscrita, ref: string): Promise<PedidoNaFilaDePlaquinhas | undefined>;

  decidir(
    trx: TransacaoDeEscrita,
    id: string,
    decisao: Exclude<DecisaoDoPedidoDePlaquinha, 'pending'>,
    decisor: AdminAccountId,
    agora: Date,
  ): Promise<PedidoNaFilaDePlaquinhas>;

  /** UM pedido, para a tela de entrega do painel. */
  pedidoParaLeitura(ref: string): Promise<PedidoNaFilaDePlaquinhas | undefined>;

  /** Grava o passo da entrega e o codigo de rastreio. */
  atualizarEntrega(
    trx: TransacaoDeEscrita,
    id: string,
    entrega: EntregaAAtualizar,
    agora: Date,
  ): Promise<PedidoNaFilaDePlaquinhas>;
}
