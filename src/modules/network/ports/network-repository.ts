/** A porta da secao `Rede`. */
import type { EncontroDaRede, PontoDoEncontro, StatusDoEncontro } from '../domain/encontro-da-rede.js';
import type {
  MudancaDoEncontroDaComunidade,
  NovoEncontroDaComunidade,
} from '../domain/encontro-da-comunidade.js';
import type { FamiliaDeSessao } from '../../identity/ports/localizacao-de-referencia-repository.js';
import type { Instant } from '../../../shared/types/brands.js';

/** O recorte no tempo da agenda. */
export type RecorteNoTempo = 'upcoming' | 'past' | 'all' | 'today' | 'weekend' | 'next_30_days';

/** As ordens que a rota aceita. */
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
  /** A SITUACAO CALCULADA (`NetworkEventStatus`), nunca a coluna de publicacao. */
  readonly status?: StatusDoEncontro | undefined;
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

/** A agenda por distancia (`listNearbyNetworkEvents`). */
export interface RecorteDaAgendaPorDistancia
  extends Omit<RecorteDaAgenda, 'sort' | 'visibility' | 'status'> {
  readonly chamador: string;
  /** **De qual APARELHO de quem chama** sai a regiao de referencia. */
  readonly familia: FamiliaDeSessao | undefined;
  readonly sort: 'distancia' | 'proximos';
  readonly maxKm?: 2 | 5 | 10 | undefined;
}

export interface EncontroComDistancia {
  readonly encontro: EncontroDaRede;
  /** Metros, SEM arredondar: quem arredonda e o dominio. */
  readonly distanciaM: number | null;
}

export interface PaginaPorDistancia {
  readonly itens: readonly EncontroComDistancia[];
  readonly total: number;
  /** `false` quando ESTE APARELHO da conta nao tem regiao de referencia valida. */
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

/** A capa do encontro **como o dono a ve**: a imagem e o que aconteceu com ela. */
export interface CapaDoMeuEncontro {
  readonly estado: 'processing' | 'ready' | 'rejected';
  /** A derivada publica, a MESMA que a agenda serve. */
  readonly url: string | null;
  /** O motivo da recusa, em texto pronto para a tela, quando `estado` e `rejected`. */
  readonly motivoDaRecusa: string | null;
}

/** Um item da lista do dono: o encontro e o estado da capa dele. */
export interface ItemDosMeusEncontros {
  readonly encontro: EncontroDaRede;
  /** Nula quando o encontro NAO TEM capa -- diferente de `processing`. */
  readonly capa: CapaDoMeuEncontro | null;
}

/** O encontro da propria conta, com a versao dele. */
export interface MeuEncontro extends ItemDosMeusEncontros {
  readonly versao: number;
}

/** O recorte de `listMyNetworkEvents`: a conta, a pagina e UM filtro. */
export interface RecorteDosMeusEncontros {
  readonly chamador: string;
  /** O MESMO campo da agenda, pelo mesmo calculo. */
  readonly status?: StatusDoEncontro | undefined;
  readonly agora: Instant;
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDosMeusEncontros {
  readonly itens: readonly ItemDosMeusEncontros[];
  readonly total: number;
}

/** O estado da conta para criar encontro, numa consulta so. */
export interface EstadoDaContaParaCriar {
  readonly temCanalVerificado: boolean;
  readonly encontrosAtivos: number;
}

/** O encontro da comunidade DESTA conta, como a escrita precisa dele. */
export interface EncontroDoAutor {
  readonly id: string;
  readonly versao: number;
  readonly publicacao: 'published' | 'cancelled';
  readonly startsAt: Instant;
  readonly endsAt: Instant | null;
}

/** A transacao das escritas da comunidade. */
export interface TransacaoDaComunidade {
  /**
   * Com `FOR UPDATE`. **Este e o unico ponto onde se decide "este encontro e desta
   * pessoa"**: `undefined` para inexistente, de outra conta, do painel e removido,
   * que sao o mesmo 404.
   */
  encontroDoAutor(slug: string, chamador: string): Promise<EncontroDoAutor | undefined>;
  /** Grava o encontro novo, com `slug` derivado do titulo. */
  inserirEncontro(novo: NovoEncontroDaComunidade): Promise<string>;
  /**
   * `null` quando `versaoLida` nao e mais a atual -- a comparacao esta na clausula
   * `WHERE` do `UPDATE`, e nao num `SELECT` antes, que deixaria duas edicoes
   * passarem juntas.
   */
  alterarEncontro(
    id: string,
    versaoLida: number,
    mudanca: MudancaDoEncontroDaComunidade,
    agora: Instant,
  ): Promise<number | null>;
  /** `cancelled` com o instante e a nota. */
  cancelarEncontro(id: string, versaoLida: number, nota: string, agora: Instant): Promise<number | null>;
  substituirPortes(eventoId: string, portes: readonly string[]): Promise<void>;
  substituirEstrutura(eventoId: string, estrutura: readonly string[]): Promise<void>;
  substituirParaLevar(eventoId: string, itens: readonly string[]): Promise<void>;
  /**
   * Confirma o envio da capa e devolve o `id` da imagem, ou `undefined` quando o
   * envio nao serve: inexistente, **de outra conta**, de outro proposito, vencido ou
   * ja usado em outro encontro.
   */
  capaDoEnvio(entrada: {
    readonly uploadId: string;
    readonly chamador: string;
    readonly eventoId: string;
    readonly agora: Instant;
  }): Promise<string | undefined>;
  /**
   * As imagens do encontro, **na ordem do array**: o indice e a `position`, e a
   * `0` e a capa. Array VAZIO tira todas.
   *
   * **Era `definirCapa(eventoId, capa | null)` ate 30/10/2026**, e a troca e por
   * conteudo e nao arrumacao: `image_upload_ids` manda ate quatro, e um metodo que
   * so soubesse gravar a `position` 0 obrigaria quem chama a conhecer a tabela.
   * `definirCapa(id, null)` virou `definirImagens(id, [])`, e `definirCapa(id, c)`
   * virou `definirImagens(id, [c])` -- a capa sozinha e o caso de UM item, e nao
   * um caminho proprio.
   */
  definirImagens(
    eventoId: string,
    imagens: readonly { readonly imagemId: string; readonly altText: string | null }[],
  ): Promise<void>;
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
   * O ponto, sob a mesma visibilidade de `buscarEncontro`, e, **no privado, so para
   * quem tem pedido aprovado** (ADR-0027 12.11).
   */
  buscarLocalDoEncontro(slug: string, chamador: string): Promise<LocalDoEncontro | undefined>;
  /** O conteudo oculto do privado, so com pedido aprovado. */
  buscarDetalhesPrivados(slug: string, chamador: string): Promise<EncontroDaRede | undefined>;
  pedirParaParticipar(slug: string, chamador: string, agora: Instant): Promise<DesfechoDoPedido>;
  /** O pedido NAO desistido da conta num privado visivel. */
  lerMeuPedido(slug: string, chamador: string): Promise<PedidoDaConta | undefined>;
  desistirDoPedido(slug: string, chamador: string, agora: Instant): Promise<DesfechoDaDesistencia>;
  listarMeusPedidos(recorte: RecorteDosMeusPedidos): Promise<PaginaDosMeusPedidos>;

  /** Os encontros da comunidade DESTA conta (`listMyNetworkEvents`, 19/10/2026). */
  listarMeusEncontros(recorte: RecorteDosMeusEncontros): Promise<PaginaDosMeusEncontros>;

  /** Um encontro da propria conta, com a VERSAO (`getMyNetworkEvent`). */
  buscarMeuEncontro(slug: string, chamador: string): Promise<MeuEncontro | undefined>;

  /** Canal verificado e teto de encontros ativos, numa consulta so. */
  estadoParaCriarEncontro(chamador: string, agora: Instant): Promise<EstadoDaContaParaCriar>;

  /** A transacao das escritas da comunidade. */
  emTransacao<T>(trabalho: (tx: TransacaoDaComunidade) => Promise<T>): Promise<T>;
}
