/** A porta de persistência da conexão. */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { ArestaGuardada, OrigemDoPedido } from '../domain/conexao.js';
import type { ContagensDaConta } from '../domain/teto-de-conexoes.js';

/** Qual caixa de pedidos. Não há uma terceira, e não há "todos". */
export type DirecaoDoPedido = 'received' | 'sent';

export interface PaginaDePedidos {
  readonly itens: readonly ArestaGuardada[];
  readonly total: number;
}

/** **Uma pessoa na lista das PRÓPRIAS conexões** (cliente, 22/10/2026). */
export interface PessoaConectada {
  /** O apelido. **Não anulável**: conexão sem apelido não tem perfil a abrir. */
  readonly apelido: string;
  /** O nome de exibição, **anulável** — a coluna é anulável em `users`. */
  readonly nomeDeExibicao: string | null;
  /** Quantos pets, **e nada além do número** (emenda 2 do ADR-0010). */
  readonly petsCount: number;
  /** Quantas conexões aceitas daquela pessoa. */
  readonly connectionsCount: number;
  /** A chave de objeto da derivada **`thumb`**, ou `null` sem foto pronta. */
  readonly photoKey: string | null;
}

/** Uma aresta guardada, com o apelido pelo qual ela foi perguntada. */
export interface ArestaComApelido {
  readonly apelido: string;
  readonly aresta: ArestaGuardada;
}

/** Uma página das próprias conexões aceitas. */
export interface PaginaDeConexoes {
  readonly itens: readonly PessoaConectada[];
  readonly total: number;
}

/** O recorte da lista das próprias conexões. */
export interface RecorteDeConexoes {
  readonly pagina: number;
  readonly limite: number;
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

/** O que `encerrar` de fato fez. */
export type Encerramento = 'declined' | 'cancelled' | 'undone';

export interface ConnectionsRepository {
  /**
   * As contagens da conta, já recortadas por conta habilitada dos dois lados e por
   * validade do pendente.
   */
  contagens(pessoa: UserId, agora: Instant): Promise<ContagensDaConta>;

  /** Quantas conexões aceitas tem esta conta. */
  contarConexoes(pessoa: UserId): Promise<number>;

  /**
   * **Quantos tutores entraram pelo convite desta conta e viraram conexão aceita** —
   * o número da seção `Convide tutores` (cliente, 21/10/2026).
   */
  contarConvidadosQueEntraram(pessoa: UserId): Promise<number>;

  /** A aresta do par, em qualquer direção, na perspectiva de `quemChama`. */
  arestaDoPar(quemChama: UserId, outro: UserId, agora: Instant): Promise<ArestaGuardada | undefined>;

  /** A aresta por `ref`, **se e só se** quem chama é uma das duas pontas. */
  arestaPorRef(ref: string, quemChama: UserId, agora: Instant): Promise<ArestaGuardada | undefined>;

  /**
   * Cria o pendente. **Os tetos estão no `WHERE` deste `INSERT`**, e é este o nível
   * que vale sob concorrência; `undefined` quando qualquer um deles barrou, quando o
   * par já tem linha viva, ou quando alguma das contas está desabilitada.
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
   * estado e do papel — não recebida de quem chama.
   */
  encerrar(ref: string, quemChama: UserId, agora: Instant): Promise<Encerramento | undefined>;

  /** Os pedidos de uma das duas caixas. */
  pedidos(quemChama: UserId, recorte: RecortePedidos): Promise<PaginaDePedidos>;

  /**
   * **As conexões ACEITAS de `quemChama` — as dele, e de mais ninguém** (cliente,
   * 22/10/2026: *"o usuário pode abrir a lista de usuários que é sua conexão"*).
   */
  conexoes(quemChama: UserId, recorte: RecorteDeConexoes): Promise<PaginaDeConexoes>;

  /** **As arestas entre `quemChama` e cada um destes apelidos**, numa consulta só. */
  arestasPorApelido(
    quemChama: UserId,
    apelidos: readonly string[],
    agora: Instant,
  ): Promise<readonly ArestaComApelido[]>;

  /** O predicado de par, para as fatias G e J. */
  estaConectado(um: UserId, outro: UserId): Promise<boolean>;

  /** O contrato com a fatia E. */
  desfazerPorBloqueio(um: UserId, outro: UserId, agora: Instant): Promise<number>;
}
