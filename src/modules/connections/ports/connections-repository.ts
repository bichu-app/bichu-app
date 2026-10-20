/**
 * A porta de persistência da conexão. **Interna ao módulo**: outro módulo só
 * enxerga `conexao.ts`.
 *
 * ## A autorização mora na cláusula `WHERE` (ADR-0021)
 *
 * Toda operação que toca uma aresta recebe **quem chama**, e quem chama entra no
 * `WHERE` ao lado do `ref`. Não existe "ler a aresta, conferir num `if`, depois
 * escrever": a janela entre a leitura e a escrita é onde a corrida mora, e um
 * caminho novo que esquecesse a leitura abriria o furo sem nenhum teste de
 * comportamento acusar.
 *
 * Consequência direta: **`ref` de aresta alheia, `ref` inexistente, conta
 * desabilitada de qualquer um dos dois lados e par bloqueado são o MESMO
 * `undefined`** — que a borda transforma no mesmo 404, nunca 403.
 *
 * ## Nenhum método devolve um conjunto de pessoas
 *
 * `pedidosRecebidos` e `pedidosEnviados` devolvem **pedidos**, que é outra
 * coisa: pedido pendente é um dos três caminhos que o desenho reconhece como
 * relação (plano 4-B), e sem saber quem pediu não se decide nada. **Não existe
 * método de listar conexões** — nem de terceiro, nem do próprio dono.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { ArestaGuardada, OrigemDoPedido } from '../domain/conexao.js';
import type { ContagensDaConta } from '../domain/teto-de-conexoes.js';

/** Qual caixa de pedidos. Não há uma terceira, e não há "todos". */
export type DirecaoDoPedido = 'received' | 'sent';

export interface PaginaDePedidos {
  readonly itens: readonly ArestaGuardada[];
  readonly total: number;
}

export interface RecortePedidos {
  readonly direcao: DirecaoDoPedido;
  readonly pagina: number;
  readonly limite: number;
  readonly agora: Instant;
}

export interface NovoPedido {
  readonly id: string;
  readonly ref: string;
  readonly quemPede: UserId;
  readonly alvo: UserId;
  readonly origem: OrigemDoPedido;
  readonly agora: Instant;
}

/** O que `encerrar` de fato fez. Serve à trilha, **nunca à resposta**. */
export type Encerramento = 'declined' | 'cancelled' | 'undone';

export interface ConnectionsRepository {
  /**
   * As contagens da conta, já recortadas por conta habilitada dos dois lados e
   * por validade do pendente. Alimenta os tetos e o resumo do próprio dono.
   */
  contagens(pessoa: UserId, agora: Instant): Promise<ContagensDaConta>;

  /** Quantas conexões aceitas tem esta conta. Para o teto do OUTRO lado. */
  contarConexoes(pessoa: UserId): Promise<number>;

  /** A aresta do par, em qualquer direção, na perspectiva de `quemChama`. */
  arestaDoPar(quemChama: UserId, outro: UserId, agora: Instant): Promise<ArestaGuardada | undefined>;

  /** A aresta por `ref`, **se e só se** quem chama é uma das duas pontas. */
  arestaPorRef(ref: string, quemChama: UserId, agora: Instant): Promise<ArestaGuardada | undefined>;

  /**
   * Cria o pendente. **Os tetos estão no `WHERE` deste `INSERT`**, e é este o
   * nível que vale sob concorrência; `undefined` quando qualquer um deles barrou,
   * quando o par já tem linha viva, ou quando alguma das contas está
   * desabilitada. Quem traduz `undefined` em recusa legível é o caso de uso, que
   * já conferiu as contagens e sabe qual teto bateu.
   */
  pedir(pedido: NovoPedido): Promise<ArestaGuardada | undefined>;

  /**
   * Aceita. Só o **destinatário** de um pendente **vivo** aceita, e os dois
   * predicados estão no `WHERE` junto com o teto de 150 dos dois lados.
   */
  aceitar(ref: string, quemChama: UserId, agora: Instant): Promise<ArestaGuardada | undefined>;

  /**
   * Recusar, cancelar e desfazer, **numa escrita só**, porque do lado de fora as
   * três são "esta aresta deixa de existir para mim" e a diferença é derivada do
   * estado e do papel — não recebida de quem chama. Receber a intenção por
   * argumento deixaria a borda escolher a semântica, e um cliente que mandasse
   * "desfazer" num pendente lavaria a recusa.
   *
   * O pendente **recusado** grava a recusa e o descanso de 90 dias; o pendente
   * **cancelado por quem pediu** e a conexão **desfeita** apagam a linha. A
   * diferença existe por uma razão: apagar a recusa faria o próximo pedido nascer
   * pendente e lavaria a recusa — a mesma decisão que o pedido do encontro
   * privado já tomou (`withdrawNetworkEventJoinRequest`).
   */
  encerrar(ref: string, quemChama: UserId, agora: Instant): Promise<Encerramento | undefined>;

  /** Os pedidos de uma das duas caixas. Nunca conexões. */
  pedidos(quemChama: UserId, recorte: RecortePedidos): Promise<PaginaDePedidos>;

  /** O predicado de par, para as fatias G e J. Ver `ports/conexao.ts`. */
  estaConectado(um: UserId, outro: UserId): Promise<boolean>;

  /** O contrato com a fatia E. Ver `ConexaoSobBloqueio`. */
  desfazerPorBloqueio(um: UserId, outro: UserId, agora: Instant): Promise<number>;
}
