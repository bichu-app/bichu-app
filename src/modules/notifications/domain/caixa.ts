/** Os tipos de aviso que a caixa mostra. */
export const TIPOS_DE_AVISO = [
  'tag_scanned',
  'found_reported',
  'match_suggested',
  'neighborhood_alert',
  'event_join_requested',
  'event_join_decided',
  'event_cancelled',
  'suggestion_decided',
  'tag_request_updated',
  'broadcast',
  /**
   * Alguem pediu conexao, e quem RECEBEU o pedido e avisado (cliente, 22/10/2026:
   * *"quando o usuario me adicionou, nao apareceu na notificacao que eu tinha uma
   * solicitacao de amizade"*).
   */
  'connection_requested',
] as const;

export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

/** Os tipos que NUNCA se juntam a outro no agrupamento por (tipo, autor, dia). */
export const TIPOS_QUE_NUNCA_AGRUPAM: readonly TipoDeAviso[] = ['tag_scanned', 'found_reported'];

/** Os tipos que continuam contando depois de a lista ter sido vista. */
export const TIPOS_QUE_PERSISTEM_NO_CONTADOR: readonly TipoDeAviso[] = [
  'tag_scanned',
  'found_reported',
];

/** Para onde o toque numa linha da caixa leva. */
export const DESTINOS_DO_AVISO = [
  'pet',
  'found_report',
  'public_case',
  'network_event',
  'directory_suggestion',
  'collar_tag_request',
  'broadcast',
  /** A tela *"Pedidos de conexao"* (`/conexoes/pedidos`), que existe desde 18/10. */
  'connection_request',
] as const;

export type DestinoDoAviso = (typeof DESTINOS_DO_AVISO)[number];

/** Uma linha da caixa, ja agrupada. */
export interface AvisoDaCaixa {
  /** Identificador opaco. **Nao e UUID** (ADR-0010). */
  readonly ref: string;
  readonly tipo: TipoDeAviso;
  /** Nome do pet, titulo do encontro, nome indicado. */
  readonly assunto: string | null;
  /** Quando o FATO aconteceu, e nao quando a linha nasceu. */
  readonly aconteceuEm: Date;
  /** O item foi ABERTO. Ver a lista nao marca nada. */
  readonly lido: boolean;
  /** Quantos avisos esta linha resume. */
  readonly agrupados: number;
  /** Para onde o toque leva, ou **nulo quando esta linha nao tem destino**. */
  readonly destino: DestinoDoAviso | null;
  /** A chave do destino. Nula exatamente quando [destino] e nula. */
  readonly destinoRef: string | null;
}

/**
 * Um COMUNICADO como o dono da caixa o le -- a pagina intermediaria do unico tipo
 * de aviso sem destino natural.
 */
export interface ComunicadoDaCaixa {
  readonly ref: string;
  readonly titulo: string;
  readonly corpo: string;
  readonly disparadoEm: Date;
}

export interface PaginaDaCaixa {
  readonly itens: readonly AvisoDaCaixa[];
  readonly pagina: number;
  readonly limite: number;
  /** Total de LINHAS ja agrupadas, e nao de avisos. */
  readonly total: number;
  /** Avisos nao abertos. O mesmo numero do sino. */
  readonly naoLidos: number;
}

/** A pagina da caixa e de 30 por decisao de desenho, e o contrato a limita a isso. */
export const LIMITE_PADRAO_DA_CAIXA = 30;
