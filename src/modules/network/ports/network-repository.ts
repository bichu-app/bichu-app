/**
 * A porta da secao `Rede`.
 *
 * As leituras do contrato -- a agenda, o encontro, o ponto, o conteudo do
 * privado e os pedidos -- e **uma escrita, a da emenda 3 do ADR-0025**: a
 * proposta de encontro pela comunidade (`createNetworkEvent`).
 *
 * Essa escrita e a unica aqui, e ela nao e a escrita administrativa: alterar,
 * mover, cancelar, remover e **decidir a revisao** continuam em
 * `/v1/admin/network/*` (ADR-0027), com porta propria. O que esta porta sabe
 * fazer e criar em `pending_review`, que e um estado que nenhuma das leituras
 * daqui enxerga.
 *
 * Check-in e galeria sairam desta versao por decisao do cliente (ADR-0027
 * 12.4). O desenho anterior esta na branch `guarda/rede-checkin-galeria`.
 *
 * **As tres leituras compartilham o predicado de visibilidade**
 * (`publication_status IN ('published', 'cancelled')`), e ele mora na clausula
 * `WHERE` de cada consulta, nunca num `if` de quem chama (ADR-0021).
 */
import type { EncontroDaRede, PontoDoEncontro } from '../domain/encontro-da-rede.js';
import type { NovoEncontroDaComunidade } from '../domain/encontro-da-comunidade.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * O recorte no tempo da agenda.
 *
 * `upcoming` e o default no contrato e **isso importa**: a lista abre com o que
 * ainda vai acontecer. `all` existe e nao e o default.
 */
export type RecorteNoTempo = 'upcoming' | 'past' | 'all' | 'today' | 'weekend' | 'next_30_days';

/**
 * As ordens que a rota aceita. `proximos` e crescente, `recentes` e decrescente.
 *
 * **Nao ha ordem por distancia.** O encontro pode ter ponto, mas o ponto so sai
 * em resposta autenticada e a agenda e publica: ordenar por distancia nela
 * revelaria, pela ordem, onde o encontro esta. O ADR-0027 nao abriu essa porta,
 * e ela nao aparece desabilitada.
 */
export type OrdemDaAgenda = 'proximos' | 'recentes';

export interface RecorteDaAgenda {
  /** O termo de busca. Procura em titulo e resumo, **no servidor**. */
  readonly q?: string | undefined;
  /** A cidade DIGITADA, nunca uma coordenada (ADR-0006). */
  readonly city?: string | undefined;
  /** Exclui o privado: a condicao de acesso dele e oculta (ADR-0027 12.14). */
  readonly admission?: 'free' | 'paid' | undefined;
  readonly visibility?: 'public' | 'private' | undefined;
  /** Porte aceito. Exclui o privado, pelo mesmo motivo de `admission`. */
  readonly size?: string | undefined;
  readonly when: RecorteNoTempo;
  readonly sort: OrdemDaAgenda;
  /**
   * O instante que separa passado de futuro, injetado pelo `Clock`, para que o
   * recorte de `when` e o rotulo `status` concordem.
   */
  readonly agora: Instant;
  /** 1-based, como o contrato a declara. */
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDaAgenda {
  readonly itens: readonly EncontroDaRede[];
  /** O total do RECORTE, nao o da tabela. */
  readonly total: number;
}

/** O que a leitura do ponto devolve para um encontro visivel. */
export interface LocalDoEncontro {
  /** Nulo quando o encontro nao tem ponto marcado, e a ausencia e estado normal. */
  readonly ponto: PontoDoEncontro | null;
  /** O endereco por extenso, na mesma resposta autenticada do ponto. */
  readonly endereco: string | null;
}

/** A agenda por distancia (`listNearbyNetworkEvents`). So encontros publicos. */
export interface RecorteDaAgendaPorDistancia extends Omit<RecorteDaAgenda, 'sort' | 'visibility'> {
  readonly chamador: string;
  readonly sort: 'distancia' | 'proximos';
  readonly maxKm?: 2 | 5 | 10 | undefined;
}

export interface EncontroComDistancia {
  readonly encontro: EncontroDaRede;
  /** Metros, SEM arredondar: quem arredonda e o dominio. Nulo sem ponto ou sem regiao. */
  readonly distanciaM: number | null;
}

export interface PaginaPorDistancia {
  readonly itens: readonly EncontroComDistancia[];
  readonly total: number;
  /** `false` quando a conta nao tem regiao de referencia valida. */
  readonly temRegiao: boolean;
}

/** O pedido da propria conta, como o banco o guarda, com o encontro dele. */
export interface PedidoDaConta {
  readonly decisao: 'pending' | 'approved' | 'declined';
  readonly pedidoEm: Instant;
  readonly encontro: EncontroDaRede;
}

export type DesfechoDoPedido =
  | { readonly tipo: 'nao_encontrado' }
  | { readonly tipo: 'encerrado' }
  | { readonly tipo: 'ok'; readonly pedido: PedidoDaConta };

export type DesfechoDaDesistencia =
  | { readonly tipo: 'nao_encontrado' }
  | { readonly tipo: 'final' }
  | { readonly tipo: 'ok'; readonly pedidoEm: Instant };

export interface RecorteDosMeusPedidos {
  readonly chamador: string;
  readonly q?: string | undefined;
  readonly estado?: 'requested' | 'approved' | 'withdrawn' | 'expired' | undefined;
  readonly agora: Instant;
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDosMeusPedidos {
  readonly itens: readonly PedidoDaConta[];
  readonly total: number;
}

/**
 * O estado da conta para propor encontro, numa consulta so.
 *
 * **A autorizacao e a verificacao moram na clausula `WHERE`** (ADR-0021): o
 * `EXISTS` do canal verificado e a contagem dos encontros em revisao sao do
 * CHAMADOR, e nao de uma conta que um `if` depois escolhe.
 */
export interface EstadoDaContaParaCriar {
  readonly temCanalVerificado: boolean;
  readonly encontrosEmRevisao: number;
}

export interface NetworkRepository {
  listarAgenda(recorte: RecorteDaAgenda): Promise<PaginaDaAgenda>;
  listarPorDistancia(recorte: RecorteDaAgendaPorDistancia): Promise<PaginaPorDistancia>;
  /**
   * O encontro. `undefined` quando ele nao existe **ou nao e visivel**
   * (`pending_review`, `removed`), e os casos sao o mesmo caso de proposito.
   */
  buscarEncontro(slug: string): Promise<EncontroDaRede | undefined>;
  /**
   * O ponto, sob a mesma visibilidade de `buscarEncontro`, e, **no privado, so
   * para quem tem pedido aprovado** (ADR-0027 12.11). A aprovacao e um `EXISTS`
   * na clausula `WHERE`: sem ela, `undefined`, que e o mesmo 404.
   */
  buscarLocalDoEncontro(slug: string, chamador: string): Promise<LocalDoEncontro | undefined>;
  /** O conteudo oculto do privado, so com pedido aprovado. Senao, `undefined`. */
  buscarDetalhesPrivados(slug: string, chamador: string): Promise<EncontroDaRede | undefined>;
  pedirParaParticipar(slug: string, chamador: string, agora: Instant): Promise<DesfechoDoPedido>;
  /** O pedido NAO desistido da conta num privado visivel. */
  lerMeuPedido(slug: string, chamador: string): Promise<PedidoDaConta | undefined>;
  desistirDoPedido(slug: string, chamador: string, agora: Instant): Promise<DesfechoDaDesistencia>;
  listarMeusPedidos(recorte: RecorteDosMeusPedidos): Promise<PaginaDosMeusPedidos>;

  /** O estado da conta para propor encontro (canal verificado e teto). */
  estadoParaCriarEncontro(chamador: string): Promise<EstadoDaContaParaCriar>;

  /**
   * Grava a proposta em `pending_review`, com `origin = 'community'` e a
   * autoria carimbada **na mesma transacao**, e devolve o `slug` que vingou.
   *
   * A autoria vai para `created_by_*` pela funcao
   * `network_events_gravar_autoria` da migracao `20261001000004`, e nao por um
   * `INSERT` com o nome da coluna: o portao `portao-colunas-que-nao-saem`
   * reprova esse nome em `src/`, e foi por isso que a coluna irma do painel
   * ficou tres semanas sem nunca ser gravada. A trilha
   * (`network_event.submitted`) e do caso de uso, pelo caminho do app
   * (`AuditLog.record`, transacao propria).
   *
   * O `slug` e derivado do titulo e pode colidir: quem implementa tenta o
   * derivado, depois o derivado com sufixo curto, e a colisao persistente sobe
   * como `SlugDoEncontroOcupado`. A borda nao escolhe `slug` nenhum -- a
   * comunidade nao manda `slug`, pelo mesmo motivo pelo qual o encontro privado
   * do painel nao aceita um.
   */
  criarEncontroDaComunidade(novo: NovoEncontroDaComunidade): Promise<EncontroProposto>;
}

/** O que a criacao devolve: o `slug` que vingou e o instante gravado. */
export interface EncontroProposto {
  readonly slug: string;
  readonly submittedAt: Instant;
}
