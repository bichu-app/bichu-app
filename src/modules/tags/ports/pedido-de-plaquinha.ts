/**
 * O pedido do OBJETO FISICO da plaquinha da coleira.
 *
 * ## Solicitar nao e emitir, e confundir os dois custa caro
 *
 * `issuePetTag` cria o CODIGO: 16 simbolos Crockford com simbolo de
 * verificacao, irreversivel, sem reciclagem e sem reativacao (ADR-0004). Ele
 * nasce a pedido do tutor e so ele o ve em claro.
 *
 * O que esta porta registra e outra coisa: o pedido do PLASTICO. Quem toca o
 * botao `Fazer a tag da coleira` ja tem o codigo -- a tela de `Pet cadastrado`
 * emite a tag antes de oferecer o botao -- e o que falta e alguem prensar e
 * entregar. Por isso **nenhum metodo daqui emite, revoga ou le codigo**, e por
 * isso nao ha `tagId` no pedido: qual tag ativa do pet vai para o plastico e
 * decisao de quem atende, no minuto em que atende.
 *
 * ## O que esta porta NAO tem
 *
 * Nao ha endereco de entrega e nao ha valor. As duas sao decisao de produto do
 * cliente e nao foram tomadas; inventa-las aqui seria decidir no lugar dele. A
 * consequencia esta dita onde ela importa: **sem endereco, quem atende nao
 * tem como cumprir o pedido**, e a fila do painel serve para enxergar a
 * demanda antes de a decisao existir, nao para despachar encomenda.
 */
import type { AdminAccountId, PetId, UserId } from '../../../shared/types/brands.js';
import type { TransacaoDeEscrita } from '../../audit/ports/audit-log.js';

/** O `CHECK` `collar_tag_requests_decisao_conhecida`. */
export type DecisaoDoPedidoDePlaquinha = 'pending' | 'fulfilled' | 'declined';

/** O pedido como o APP o ve. Sem `ref` e sem UUID nenhum (ADR-0010 item 6). */
export interface PedidoDoTutor {
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly solicitadoEm: Date;
  readonly observacao: string | null;
}

/**
 * O pedido como a FILA DO PAINEL o ve.
 *
 * `petNome` e `petEspecie` sao o que identifica qual plaquinha prensar.
 * **Nenhum campo do solicitante**, e a ausencia e deliberada: a unica leitura
 * de pessoa do backoffice v1 e a fila de pedidos de encontro, coberta pelo
 * RA-01 por decisao do cliente de 23/09 (D53 a D57). Abrir uma segunda e
 * decisao dele, e enquanto entrega estiver em aberto o nome do solicitante nao
 * tornaria o pedido cumprivel -- faltaria o endereco do mesmo jeito.
 */
export interface PedidoNaFilaDePlaquinhas {
  /** Interno, para a trilha. Nunca projetado em resposta. */
  readonly id: string;
  readonly ref: string;
  readonly petNome: string;
  readonly petEspecie: string;
  readonly observacao: string | null;
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly solicitadoEm: Date;
  readonly decididoEm: Date | null;
}

export interface RecorteDaFilaDePlaquinhas {
  readonly status?: DecisaoDoPedidoDePlaquinha | undefined;
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDaFilaDePlaquinhas {
  readonly itens: readonly PedidoNaFilaDePlaquinhas[];
  readonly total: number;
}

export interface PedidoDePlaquinhaRepository {
  /**
   * Cria o pedido do tutor, ou devolve o pendente que ja existe.
   *
   * **A autorizacao esta na clausula `WHERE`**, e e isso que faz pedido para
   * pet de outra pessoa simplesmente NAO EXISTIR: o `INSERT ... SELECT` so
   * encontra linha quando o pet e do chamador, e `undefined` vira 404 na rota
   * -- nunca 403, porque 403 confirmaria que o pet existe (ADR-0021).
   */
  criarOuDevolverPendente(entrada: {
    readonly id: string;
    readonly ref: string;
    readonly petId: PetId;
    readonly solicitante: UserId;
    readonly observacao: string | null;
  }): Promise<PedidoDoTutor | undefined>;

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
}
