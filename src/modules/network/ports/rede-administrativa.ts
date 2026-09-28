/**
 * As portas da escrita administrativa da `Rede` (BICHUS-273 e BICHUS-292).
 *
 * ## A transacao e a unidade
 *
 * Toda escrita acontece dentro de `emTransacao`, e a trilha e gravada por
 * `registrarNaTrilha` NA MESMA transacao (ADR-0027 item 8, D49): se a trilha
 * falhar, a escrita e desfeita. A leitura da fila de pedidos tambem abre
 * transacao, porque ela grava na trilha (D55) e le dela o teto de linhas (D56).
 *
 * ## A versao lida decide
 *
 * `atualizarEncontro` recebe a versao que a pessoa leu e devolve `null` quando
 * ela nao e mais a atual: a comparacao e na clausula `WHERE` do `UPDATE`, e nao
 * num `SELECT` antes, que deixaria dois administradores passarem juntos.
 */
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type { EnvioDeCatalogo } from '../../media/ports/imagem-de-catalogo.js';
import type { Instant } from '../../../shared/types/brands.js';
import type {
  DecisaoDoPedido,
  EncontroAdministrativo,
  Entrada,
  Lugar,
  PedidoNaFila,
  PublicacaoAdministrativa,
  TempoDoEncontro,
  Visibilidade,
} from '../domain/escrita-do-encontro.js';

/** Violacao do indice unico do `slug`. O caso de uso a traduz para 409. */
export class SlugDoEncontroOcupado extends Error {
  constructor() {
    super('slug de encontro ja usado');
    this.name = 'SlugDoEncontroOcupado';
  }
}

export interface NovoEncontro {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly lugar: Lugar;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly timeZone: string;
  readonly visibilidade: Visibilidade;
  readonly entrada: Entrada;
  readonly idadeDosCaes: string;
  readonly vacinacaoExigida: boolean;
  readonly areaCercada: boolean;
  readonly observacoes: string | null;
  readonly agora: Instant;
}

/** O que muda numa escrita. Campo ausente nao muda. */
export interface MudancaDeEncontro {
  readonly slug?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly lugar?: Lugar;
  readonly startsAt?: Date;
  readonly endsAt?: Date | null;
  readonly timeZone?: string;
  readonly visibilidade?: Visibilidade;
  readonly entrada?: Entrada;
  readonly idadeDosCaes?: string;
  readonly vacinacaoExigida?: boolean;
  readonly areaCercada?: boolean;
  readonly observacoes?: string | null;
  readonly publicacao?: PublicacaoAdministrativa;
  readonly cancelledAt?: Date;
  readonly cancellationNote?: string;
}

export interface ImagemNaPosicao {
  readonly imageId: string;
  readonly position: number;
  readonly altText: string;
}

export interface RecorteDoPainel {
  readonly q?: string | undefined;
  readonly publicacao?: PublicacaoAdministrativa | undefined;
  readonly tempo?: TempoDoEncontro | undefined;
  readonly visibilidade?: Visibilidade | undefined;
  readonly city?: string | undefined;
  readonly sort: 'agenda' | 'atualizado';
  readonly agora: Instant;
  readonly page: number;
  readonly limit: number;
}

export interface RecorteDaFila {
  readonly decisao?: DecisaoDoPedido | undefined;
  readonly eventoSlug?: string | undefined;
  readonly page: number;
  readonly limit: number;
}

export interface Pagina<T> {
  readonly itens: readonly T[];
  readonly total: number;
}

export interface TransacaoDaRede {
  /** Com `FOR UPDATE`: a escrita segura a linha ate o `COMMIT`. */
  encontroPorSlug(slug: string): Promise<EncontroAdministrativo | null>;
  recarregarEncontro(id: string): Promise<EncontroAdministrativo>;
  existeSlug(slug: string): Promise<boolean>;
  /** Lanca `SlugDoEncontroOcupado`. */
  inserirEncontro(novo: NovoEncontro): Promise<void>;
  /** `null` quando `versaoLida` nao e mais a atual. Lanca `SlugDoEncontroOcupado`. */
  atualizarEncontro(id: string, versaoLida: number, mudanca: MudancaDeEncontro, agora: Instant): Promise<boolean>;
  substituirPortes(eventoId: string, portes: readonly string[]): Promise<void>;
  substituirEstrutura(eventoId: string, estrutura: readonly string[]): Promise<void>;
  substituirParaLevar(eventoId: string, itens: readonly string[]): Promise<void>;
  substituirImagens(eventoId: string, imagens: readonly ImagemNaPosicao[]): Promise<void>;
  /** O encontro que ja usa esta imagem de catalogo, ou `null`. */
  encontroDaImagem(imageId: string): Promise<string | null>;
  envioDeCatalogo(uploadId: string): Promise<EnvioDeCatalogo | null>;
  confirmarEnvioDeCatalogo(entrada: {
    readonly imagemId: string;
    readonly trabalhoId: string;
    readonly envioId: string;
    readonly agora: Instant;
  }): Promise<void>;

  /** Com `FOR UPDATE`. So pedido de encontro privado que nao foi removido. */
  pedidoPorRef(ref: string): Promise<PedidoNaFila | null>;
  decidirPedido(id: string, decisao: 'approved' | 'declined', decisor: string, agora: Instant): Promise<PedidoNaFila>;
  /** O aviso de aprovacao ao tutor, enfileirado NA transacao da decisao. */
  enfileirarAvisoDeAprovacao(entrada: { readonly trabalhoId: string; readonly pedidoId: string }): Promise<void>;

  /** Serializa as leituras da fila da mesma conta, para o teto de D56 nao correr. */
  travarLeituraDaFila(conta: string): Promise<void>;
  /** Linhas ja devolvidas a esta conta desde `desde`, somadas da trilha (D56). */
  linhasDevolvidasDesde(conta: string, desde: Date): Promise<{ total: number; maisAntiga: Date | null }>;
  listarFila(recorte: RecorteDaFila): Promise<Pagina<PedidoNaFila>>;

  registrarNaTrilha(evento: AuditEvent): Promise<void>;
}

export interface RedeAdministrativaRepository {
  emTransacao<T>(trabalho: (tx: TransacaoDaRede) => Promise<T>): Promise<T>;
  encontroPorSlug(slug: string): Promise<EncontroAdministrativo | null>;
  listarEncontros(recorte: RecorteDoPainel): Promise<Pagina<EncontroAdministrativo>>;
}

/**
 * O aviso a todos os administradores (D52, D60). Sai DEPOIS do `COMMIT`: um
 * e-mail sobre uma escrita que foi desfeita seria um aviso falso. Falha do envio
 * nao desfaz a escrita, e quem implementa registra a falha.
 */
export interface AvisoAosAdministradores {
  avisar(aviso: { readonly assunto: string; readonly linhas: readonly string[] }): Promise<void>;
}
