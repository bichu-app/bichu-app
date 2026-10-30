/** A porta da CAIXA DE NOTIFICACOES. */
import type { UserId } from '../../../shared/types/brands.js';
import type { ComunicadoDaCaixa, PaginaDaCaixa } from '../domain/caixa.js';

export interface CaixaDeNotificacoes {
  /** Uma pagina da caixa, ja agrupada. */
  listar(usuario: UserId, pagina: number, limite: number): Promise<PaginaDaCaixa>;

  /** O numero do sino. Conta desabilitada devolve zero. */
  contar(usuario: UserId): Promise<number>;

  /** Marca UM aviso como lido. */
  marcarLida(usuario: UserId, ref: string): Promise<boolean>;

  /** "Marcar todas como lidas". */
  marcarTodasLidas(usuario: UserId): Promise<number>;

  /**
   * DISPENSA a LINHA -- o "x" (cliente, 20/10/2026): ela sai da LISTA e do CONTADOR,
   * e **continua nao lida**.
   */
  dispensar(usuario: UserId, ref: string): Promise<boolean>;

  /** A lista foi aberta: zera o NUMERO sem marcar item nenhum. */
  listaVista(usuario: UserId): Promise<void>;

  /**
   * O COMUNICADO de `ref`, **se ele chegou a esta conta** -- a pagina intermediaria
   * do unico tipo de aviso sem destino natural.
   */
  buscarComunicado(usuario: UserId, ref: string): Promise<ComunicadoDaCaixa | undefined>;
}
