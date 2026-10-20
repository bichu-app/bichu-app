/**
 * A porta da secao `Rede`.
 *
 * As leituras do contrato -- a agenda, o encontro, o ponto, o conteudo do
 * privado e os pedidos -- e **as tres escritas da emenda 3 do ADR-0025**:
 * criar, editar e cancelar o encontro da COMUNIDADE.
 *
 * Elas nao sao a escrita administrativa: mover, mudar acesso e remover
 * continuam em `/v1/admin/network/*` (ADR-0027), com porta propria, e o painel
 * continua sendo o unico que mexe em encontro de `origin = 'admin'`.
 *
 * **A autoria e decidida NUM LUGAR SO**: `TransacaoDaComunidade.encontroDoAutor`
 * carrega `origin = 'community'` e a conta do chamador na clausula `WHERE` (pela
 * funcao `network_events_do_autor` da migracao `20261001000005`), e devolve
 * `undefined` para o que nao existe, o de outra pessoa e o do painel -- os tres
 * sao o mesmo 404 (ADR-0021). A edicao e o cancelamento passam pelos dois pela
 * mesma leitura; nao ha uma segunda regra de autoria em lugar nenhum.
 *
 * Check-in e galeria sairam desta versao por decisao do cliente (ADR-0027
 * 12.4). O desenho anterior esta na branch `guarda/rede-checkin-galeria`.
 *
 * **As tres leituras compartilham o predicado de visibilidade**
 * (`publication_status IN ('published', 'cancelled')`), e ele mora na clausula
 * `WHERE` de cada consulta, nunca num `if` de quem chama (ADR-0021).
 */
import type { EncontroDaRede, PontoDoEncontro } from '../domain/encontro-da-rede.js';
import type {
  MudancaDoEncontroDaComunidade,
  NovoEncontroDaComunidade,
} from '../domain/encontro-da-comunidade.js';
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
 * A capa do encontro **como o dono a ve**: a imagem e o que aconteceu com ela.
 *
 * ESTA ESTRUTURA NAO EXISTE NA LEITURA PUBLICA, e a assimetria e o ponto.
 * `colunasDoEncontro` so carrega imagem `ready` com chave publica -- a agenda
 * nao tem como mostrar o que nao esta pronto, e nem deve. A consequencia,
 * medida por outra frente em 19/10/2026: a capa podia ser RECUSADA depois do
 * `201` de criar e ninguem contava a quem enviou. Estado de processamento de
 * imagem e assunto entre quem enviou e o servidor, entao ele sai so aqui.
 */
export interface CapaDoMeuEncontro {
  readonly estado: 'processing' | 'ready' | 'rejected';
  /** A derivada publica, a MESMA que a agenda serve. Nula fora de `ready`. */
  readonly url: string | null;
  /**
   * O motivo da recusa, em texto pronto para a tela, quando `estado` e
   * `rejected`. O banco garante que a recusada tem motivo
   * (`catalog_images_recusada_tem_motivo`), e por isso a tela nunca precisa de
   * frase generica de reserva.
   */
  readonly motivoDaRecusa: string | null;
}

/** Um item da lista do dono: o encontro e o estado da capa dele. */
export interface ItemDosMeusEncontros {
  readonly encontro: EncontroDaRede;
  /** Nula quando o encontro NAO TEM capa -- diferente de `processing`. */
  readonly capa: CapaDoMeuEncontro | null;
}

/**
 * O encontro da propria conta, com a versao dele.
 *
 * A versao vem junto porque e ela que `getMyNetworkEvent` publica no `ETag`, e
 * `cancelNetworkEvent` a exige em `If-Match`. **Ela NAO sai no corpo**: a
 * projecao do dono (`MyNetworkEvent`) nao tem campo de versao, e a borda poe o
 * valor no cabecalho. Dois lugares para a mesma versao divergiriam.
 */
export interface MeuEncontro extends ItemDosMeusEncontros {
  readonly versao: number;
}

/**
 * O recorte de `listMyNetworkEvents`: so a conta e a pagina.
 *
 * **Nao ha busca, filtro nem ordem escolhivel**, e a ausencia e decisao: o teto
 * e de tres encontros ativos por conta, entao a lista e curta por construcao. A
 * ordem e fixa no repositorio -- o que ainda nao terminou primeiro --, e `agora`
 * existe exatamente para ela, e para o rotulo `status` concordar com a ordem.
 */
export interface RecorteDosMeusEncontros {
  readonly chamador: string;
  readonly agora: Instant;
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDosMeusEncontros {
  readonly itens: readonly ItemDosMeusEncontros[];
  readonly total: number;
}

/**
 * O estado da conta para criar encontro, numa consulta so.
 *
 * **A autorizacao e a verificacao moram na clausula `WHERE`** (ADR-0021): o
 * `EXISTS` do canal verificado e a contagem dos encontros ativos sao do
 * CHAMADOR, e nao de uma conta que um `if` depois escolhe.
 */
export interface EstadoDaContaParaCriar {
  readonly temCanalVerificado: boolean;
  readonly encontrosAtivos: number;
}

/**
 * O encontro da comunidade DESTA conta, como a escrita precisa dele.
 *
 * So o que decide: o `id` interno (que nunca sai em resposta), a versao para o
 * `If-Match`, o estado de publicacao e os dois instantes, que respondem "ja
 * terminou?". Nada mais -- a resposta sai de uma leitura publica depois do
 * `COMMIT`.
 */
export interface EncontroDoAutor {
  readonly id: string;
  readonly versao: number;
  readonly publicacao: 'published' | 'cancelled';
  readonly startsAt: Instant;
  readonly endsAt: Instant | null;
}

/**
 * A transacao das escritas da comunidade. Mesma forma de `TransacaoDaRede` do
 * painel, e pelo mesmo motivo: as regras ficam no caso de uso, e o que a
 * transacao oferece sao leituras autorizadas e escritas elementares.
 */
export interface TransacaoDaComunidade {
  /**
   * Com `FOR UPDATE`. **Este e o unico ponto onde se decide "este encontro e
   * desta pessoa"**: `undefined` para inexistente, de outra conta, do painel e
   * removido, que sao o mesmo 404.
   */
  encontroDoAutor(slug: string, chamador: string): Promise<EncontroDoAutor | undefined>;
  /** Grava o encontro novo, com `slug` derivado do titulo. Devolve o `slug` que vingou. */
  inserirEncontro(novo: NovoEncontroDaComunidade): Promise<string>;
  /**
   * `null` quando `versaoLida` nao e mais a atual -- a comparacao esta na
   * clausula `WHERE` do `UPDATE`, e nao num `SELECT` antes, que deixaria duas
   * edicoes passarem juntas. Devolve a versao nova.
   */
  alterarEncontro(
    id: string,
    versaoLida: number,
    mudanca: MudancaDoEncontroDaComunidade,
    agora: Instant,
  ): Promise<number | null>;
  /** `cancelled` com o instante e a nota. `null` quando a versao mudou. */
  cancelarEncontro(id: string, versaoLida: number, nota: string, agora: Instant): Promise<number | null>;
  substituirPortes(eventoId: string, portes: readonly string[]): Promise<void>;
  substituirEstrutura(eventoId: string, estrutura: readonly string[]): Promise<void>;
  substituirParaLevar(eventoId: string, itens: readonly string[]): Promise<void>;
  /**
   * Confirma o envio da capa e devolve o `id` da imagem, ou `undefined` quando
   * o envio nao serve: inexistente, **de outra conta**, de outro proposito,
   * vencido ou ja usado em outro encontro. A conta do chamador esta na clausula
   * `WHERE`, e os casos sao um so de proposito.
   */
  capaDoEnvio(entrada: {
    readonly uploadId: string;
    readonly chamador: string;
    readonly eventoId: string;
    readonly agora: Instant;
  }): Promise<string | undefined>;
  /** A capa na posicao 0. `null` tira a capa. */
  definirCapa(eventoId: string, capa: { readonly imagemId: string; readonly altText: string } | null): Promise<void>;
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

  /**
   * Os encontros da comunidade DESTA conta (`listMyNetworkEvents`, 19/10/2026).
   *
   * A autoria mora na clausula `WHERE`, pela funcao `network_events_da_conta`
   * da migracao `20261019000010`: nao ha parametro de autoria e nao ha como
   * pedir a lista de outra pessoa. Encontro do painel nao entra nem quando a
   * conta e a mesma. Lista vazia e estado NORMAL, e nao erro: quem nunca criou
   * encontro recebe zero itens.
   */
  listarMeusEncontros(recorte: RecorteDosMeusEncontros): Promise<PaginaDosMeusEncontros>;

  /**
   * Um encontro da propria conta, com a VERSAO (`getMyNetworkEvent`).
   *
   * **Esta e a fonte do `ETag` da secao `Rede`**, e a razao de ela existir:
   * medido em homologacao em 19/10/2026, nenhuma outra leitura da secao emite
   * o cabecalho, e sem ele a primeira escrita versionada era impossivel.
   *
   * `undefined` para inexistente, de outra conta, do painel e removido -- os
   * quatro sao o mesmo 404 (ADR-0021). A regra de autoria e a MESMA de
   * `encontroDoAutor`, pela mesma funcao de banco
   * (`network_events_do_autor`): nao ha uma segunda definicao de "e meu".
   */
  buscarMeuEncontro(slug: string, chamador: string): Promise<MeuEncontro | undefined>;

  /** Canal verificado e teto de encontros ativos, numa consulta so. */
  estadoParaCriarEncontro(chamador: string, agora: Instant): Promise<EstadoDaContaParaCriar>;

  /**
   * A transacao das escritas da comunidade.
   *
   * A autoria em coluna e carimbada aqui dentro, pela funcao
   * `network_events_gravar_autoria` da migracao `20261001000004`, e nao por um
   * `INSERT` com o nome da coluna: o portao `portao-colunas-que-nao-saem`
   * reprova esse nome em `src/`, e foi por isso que a coluna irma do painel
   * ficou tres semanas sem nunca ser gravada. A trilha e do caso de uso, pelo
   * caminho do app (`AuditLog.record`, transacao propria).
   */
  emTransacao<T>(trabalho: (tx: TransacaoDaComunidade) => Promise<T>): Promise<T>;
}
