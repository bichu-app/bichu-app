/** A CAIXA DE NOTIFICACOES, do lado da aplicacao. */
import { problemas } from '../../../shared/http/errors.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  LIMITE_PADRAO_DA_CAIXA,
  type ComunicadoDaCaixa,
  type PaginaDaCaixa,
} from '../domain/caixa.js';
import type { CaixaDeNotificacoes } from '../ports/caixa-de-notificacoes.js';

/** Quem esta chamando, como o autenticador o identificou. */
export interface ChamadorDaCaixa {
  readonly userId: UserId;
}

export interface DependenciasDaCaixa {
  readonly caixa: CaixaDeNotificacoes;
}

export class CaixaDeNotificacoesService {
  constructor(private readonly deps: DependenciasDaCaixa) {}

  /** Uma pagina da caixa. */
  async listar(
    chamador: ChamadorDaCaixa,
    pedido: { readonly pagina?: number; readonly limite?: number },
  ): Promise<PaginaDaCaixa> {
    const pagina = Math.max(1, pedido.pagina ?? 1);
    const limite = Math.min(Math.max(1, pedido.limite ?? LIMITE_PADRAO_DA_CAIXA), LIMITE_PADRAO_DA_CAIXA);
    return this.deps.caixa.listar(chamador.userId, pagina, limite);
  }

  /** O numero do sino, inteiro. */
  async contar(chamador: ChamadorDaCaixa): Promise<number> {
    return this.deps.caixa.contar(chamador.userId);
  }

  /** A lista foi aberta: zera o numero e NAO marca nada. */
  async listaVista(chamador: ChamadorDaCaixa): Promise<void> {
    await this.deps.caixa.listaVista(chamador.userId);
  }

  /** Marca UM aviso como lido. */
  async marcarLida(chamador: ChamadorDaCaixa, ref: string): Promise<void> {
    const marcada = await this.deps.caixa.marcarLida(chamador.userId, ref);
    if (!marcada) throw problemas.naoEncontrado();
  }

  /** "Marcar todas como lidas", explicito. */
  async marcarTodasLidas(chamador: ChamadorDaCaixa): Promise<number> {
    return this.deps.caixa.marcarTodasLidas(chamador.userId);
  }

  /** DISPENSA a LINHA da caixa -- o "x". */
  async dispensar(chamador: ChamadorDaCaixa, ref: string): Promise<void> {
    const dispensada = await this.deps.caixa.dispensar(chamador.userId, ref);
    if (!dispensada) throw problemas.naoEncontrado();
  }

  /** O COMUNICADO, para a pagina intermediaria. */
  async buscarComunicado(chamador: ChamadorDaCaixa, ref: string): Promise<ComunicadoDaCaixa> {
    const comunicado = await this.deps.caixa.buscarComunicado(chamador.userId, ref);
    if (comunicado === undefined) throw problemas.naoEncontrado();
    return comunicado;
  }
}
