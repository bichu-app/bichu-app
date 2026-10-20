/**
 * A CAIXA DE NOTIFICACOES, do lado da aplicacao.
 *
 * Camada fina de proposito: as regras que custam dinheiro -- agrupamento,
 * retencao, a regra do zero do contador e o filtro de conta desabilitada nos
 * tres lugares -- moram nas funcoes SQL da migracao `20261018000020`, porque e
 * la que elas sao a mesma consulta que as paga. O que esta classe acrescenta e
 * o que NAO cabe em SQL: o recorte da pagina contra o teto do contrato, e a
 * traducao de "nao achei" em 404.
 *
 * **Nenhum metodo aqui recebe um identificador de conta de fora.** O dono vem
 * sempre do token, por `ChamadorDaCaixa`, e e esse o unico `user_id` que chega
 * ao `WHERE`. Nao ha caminho de codigo que leia a caixa de um terceiro.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { UserId } from '../../../shared/types/brands.js';
import { LIMITE_PADRAO_DA_CAIXA, type PaginaDaCaixa } from '../domain/caixa.js';
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

  /**
   * Uma pagina da caixa.
   *
   * O recorte do limite acontece aqui e tambem no contrato (`maximum: 30`), e a
   * repeticao e deliberada: o contrato recusa 31 na borda com 400, e este
   * `Math.min` e o que impede um chamador interno -- um teste, um trabalho
   * agendado -- de pedir 10 000 linhas por uma porta que nao passa pela borda.
   */
  async listar(
    chamador: ChamadorDaCaixa,
    pedido: { readonly pagina?: number; readonly limite?: number },
  ): Promise<PaginaDaCaixa> {
    const pagina = Math.max(1, pedido.pagina ?? 1);
    const limite = Math.min(Math.max(1, pedido.limite ?? LIMITE_PADRAO_DA_CAIXA), LIMITE_PADRAO_DA_CAIXA);
    return this.deps.caixa.listar(chamador.userId, pagina, limite);
  }

  /** O numero do sino, inteiro. O recorte em `9+` e da barra, nao daqui. */
  async contar(chamador: ChamadorDaCaixa): Promise<number> {
    return this.deps.caixa.contar(chamador.userId);
  }

  /**
   * A lista foi aberta: zera o numero e NAO marca nada.
   *
   * Metodo proprio, e nao um efeito de `listar`. Se ele fosse efeito de
   * `listar`, "abrir a lista nao marca os itens" deixaria de ser verificavel --
   * nao haveria como chamar um sem o outro num teste.
   */
  async listaVista(chamador: ChamadorDaCaixa): Promise<void> {
    await this.deps.caixa.listaVista(chamador.userId);
  }

  /**
   * Marca UM aviso como lido.
   *
   * **404 e nunca 403** (ADR-0021): a porta devolve `false` para "nao existe" e
   * para "e de outra conta", e as duas sao indistinguiveis aqui de proposito --
   * um 403 confirmaria que o `ref` existe.
   */
  async marcarLida(chamador: ChamadorDaCaixa, ref: string): Promise<void> {
    const marcada = await this.deps.caixa.marcarLida(chamador.userId, ref);
    if (!marcada) throw problemas.naoEncontrado();
  }

  /** "Marcar todas como lidas", explicito. Devolve quantas foram. */
  async marcarTodasLidas(chamador: ChamadorDaCaixa): Promise<number> {
    return this.deps.caixa.marcarTodasLidas(chamador.userId);
  }
}
