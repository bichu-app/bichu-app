import { comoData, type Clock } from '../../../shared/time/clock.js';
import type { components } from '../../../shared/types/generated/api.js';
import {
  projecaoPublicaDoPerdido,
  type BasesPublicas,
} from '../domain/projecao-publica-do-caso.js';
import type {
  ConjuntoDePerdidos,
  JanelaDePerdidos,
  ListagemPublicaDePerdidos,
  RecorteDePerdidos,
} from '../ports/listagem-publica-de-perdidos.js';
import type { EspecieDoCaso, PorteDoCaso } from '../ports/leitura-publica-do-caso.js';

type PublicLostPetPage = components['schemas']['PublicLostPetPage'];

/**
 * O relógio é o `Clock` do projeto, e a conversão para `Date` passa por `comoData`
 * — o caminho declarado em `shared/time/clock.ts`.
 */
export type Relogio = Clock;

/**
 * O pedido como a borda o entrega: **tudo opcional**, a cidade inclusive desde
 * 19/10/2026 (decisão do cliente: *"o campo cidade do filtro da página pet não
 * deve ser obrigatório"*).
 */
export type EstadoDoCasoPedido = 'open' | 'reunited';

/**
 * A traducao de `case_state` para o conjunto da porta, e **o unico lugar** onde a
 * ausencia do parametro se torna `padrao`.
 */
export function conjuntoPedido(estado: EstadoDoCasoPedido | undefined): ConjuntoDePerdidos {
  switch (estado) {
    case 'reunited':
      return 'reencontrado';
    case 'open':
      return 'aberto';
    case undefined:
      return 'padrao';
  }
}

export interface PedidoDePerdidos {
  readonly caseState?: EstadoDoCasoPedido | undefined;
  readonly city?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly species?: EspecieDoCaso | undefined;
  readonly size?: PorteDoCaso | undefined;
  readonly period?: JanelaDePerdidos | undefined;
  readonly q?: string | undefined;
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}

/** Os padrões são os do contrato, COPIADOS de lá e não escolhidos aqui. */
export const PAGINA_INICIAL = 1;
export const TAMANHO_PADRAO = 20;

function aparado(valor: string | undefined): string | undefined {
  const t = valor?.trim();
  return t === undefined || t === '' ? undefined : t;
}

/** O recorte que de fato valeu, para a tela escrever a linha que explica o corte. */
export function recortesAplicados(
  entradas: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const aplicados: Record<string, string> = {};
  for (const [nome, valor] of Object.entries(entradas)) {
    if (valor !== undefined) aplicados[nome] = valor;
  }
  return aplicados;
}

export class ListagemPublicaDePerdidosService {
  constructor(
    private readonly listagem: ListagemPublicaDePerdidos,
    private readonly bases: BasesPublicas,
    private readonly relogio: Relogio,
  ) {}

  async pagina(pedido: PedidoDePerdidos): Promise<PublicLostPetPage> {
    const janela = pedido.period;
    const pagina = pedido.page ?? PAGINA_INICIAL;
    const limite = pedido.limit ?? TAMANHO_PADRAO;
    const bairro = aparado(pedido.neighborhood);
    const termo = aparado(pedido.q);
    const cidade = aparado(pedido.city);

    const recorte: RecorteDePerdidos = {
      conjunto: conjuntoPedido(pedido.caseState),
      cidade,
      bairro,
      especie: pedido.species,
      porte: pedido.size,
      janela,
      termo,
      pagina,
      limite,
      agora: comoData(this.relogio.now()),
    };

    const resultado = await this.listagem.listar(recorte);

    return {
      items: resultado.itens.map((p) => projecaoPublicaDoPerdido(p, this.bases)),
      page: pagina,
      limit: limite,
      total: resultado.total,
      applied_filters: recortesAplicados({
        case_state: pedido.caseState,
        city: cidade,
        neighborhood: bairro,
        species: pedido.species,
        size: pedido.size,
        period: janela,
        q: termo,
      }),
    };
  }
}
