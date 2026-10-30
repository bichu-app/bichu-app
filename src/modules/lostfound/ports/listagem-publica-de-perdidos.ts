/** Porta da **listagem pública de perdidos** (`listPublicLostPets`). */
import type { EspecieDoCaso, PorteDoCaso } from './leitura-publica-do-caso.js';

/** A janela de `period`, como o contrato a declara. */
export type JanelaDePerdidos = '24h' | '7d' | '30d';

/** QUAL CONJUNTO a pagina devolve (`case_state` do contrato), e sao TRES. */
export type ConjuntoDePerdidos = 'padrao' | 'aberto' | 'reencontrado';

/** A JANELA DO SELO, em dias. */
export const DIAS_DO_SELO_DE_REENCONTRO = 30;

/** O recorte pedido. */
export interface RecorteDePerdidos {
  /**
   * Qual conjunto. **Sem `?`, de propósito**: quem monta o recorte tem de decidir, e
   * `undefined` aqui faria a consulta escolher sozinha num `??` espalhado por três
   * arquivos.
   */
  readonly conjunto: ConjuntoDePerdidos;
  /** A cidade pedida, ou **indefinida quando ninguém pediu nenhuma**. */
  readonly cidade?: string | undefined;
  readonly bairro?: string | undefined;
  readonly especie?: EspecieDoCaso | undefined;
  readonly porte?: PorteDoCaso | undefined;
  /** A janela PEDIDA, ou **indefinida quando ninguem pediu nenhuma**. */
  readonly janela?: JanelaDePerdidos | undefined;
  /** Busca parcial por **nome do pet**, e nunca por código de tag. */
  readonly termo?: string | undefined;
  readonly pagina: number;
  readonly limite: number;
  /** O instante de referência da janela. */
  readonly agora: Date;
}

/** Um perdido como a superfície pública pode vê-lo. */
export interface PerdidoPublico {
  readonly shareToken: string;
  readonly petNome: string;
  readonly especie: EspecieDoCaso;
  readonly porte: PorteDoCaso;
  readonly racaRotulo: string | null;
  readonly corRotulo: string | null;
  /** `lost_cases.last_seen_at`: quando o animal foi visto, e não quando o caso abriu. */
  readonly vistoPorUltimoEm: Date;
  readonly cidade: string | null;
  readonly bairro: string | null;
  /** Chave da derivada **`thumb`** (176 × 194 px) da foto principal pronta. */
  readonly chaveDaFoto: string | null;
  /** `found_by_community` do contrato: o SELO. */
  readonly encontradoPelaComunidade: boolean;
}

export interface PaginaDePerdidos {
  readonly itens: readonly PerdidoPublico[];
  /** Quantos o recorte tem no servidor. */
  readonly total: number;
}

export interface ListagemPublicaDePerdidos {
  listar(recorte: RecorteDePerdidos): Promise<PaginaDePerdidos>;
}
