/**
 * Listagem pública de perdidos (`listPublicLostPets`).
 *
 * **A operação estava no contrato e não tinha código.** Ela era a última linha
 * de `OPERACOES_AINDA_SEM_ROTA` em
 * `src/shared/http/rotas-registradas-contra-o-contrato.test.ts`, e sai daquela
 * lista no mesmo commit que traz este arquivo — é a regra que o comentário de
 * lá escreve: "quem implementa uma linha daqui tira a linha no mesmo commit".
 *
 * Não há decisão de 200 contra 410 aqui, e a ausência é a diferença entre
 * listar e abrir: a leitura por token responde 410 quando o caso fechou, porque
 * quem tem o link merece saber que o link morreu. A listagem **filtra**: caso
 * fechado, conta desabilitada e pet arquivado simplesmente não estão na página,
 * e recorte sem resultado é uma página vazia com `total: 0` — nunca um erro.
 *
 * O que esta camada faz é só o que a borda não deve fazer: aplicar os padrões
 * do contrato (`page` e `limit` — `period` não tem mais padrão nenhum, ver
 * `PAGINA_INICIAL` abaixo) num lugar só e montar o `applied_filters` que a tela
 * usa para dizer o recorte. Janela ausente não entra no `applied_filters`, e é
 * assim que a tela sabe que a página abriu sem filtro.
 */
import { comoData, type Clock } from '../../../shared/time/clock.js';
import type { components } from '../../../shared/types/generated/api.js';
import {
  projecaoPublicaDoPerdido,
  type BasesPublicas,
} from '../domain/projecao-publica-do-caso.js';
import type {
  JanelaDePerdidos,
  ListagemPublicaDePerdidos,
  RecorteDePerdidos,
} from '../ports/listagem-publica-de-perdidos.js';
import type { EspecieDoCaso, PorteDoCaso } from '../ports/leitura-publica-do-caso.js';

type PublicLostPetPage = components['schemas']['PublicLostPetPage'];

/**
 * O relógio é o `Clock` do projeto, e a conversão para `Date` passa por
 * `comoData` — o caminho declarado em `shared/time/clock.ts`. `new Date()`
 * aqui dentro é proibido por lint, e a proibição é boa: é ela que impede o
 * relógio de parede de voltar por uma porta lateral.
 */
export type Relogio = Clock;

/** O pedido como a borda o entrega: tudo opcional menos a cidade. */
export interface PedidoDePerdidos {
  readonly city: string;
  readonly neighborhood?: string | undefined;
  readonly species?: EspecieDoCaso | undefined;
  readonly size?: PorteDoCaso | undefined;
  readonly period?: JanelaDePerdidos | undefined;
  readonly q?: string | undefined;
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}

/**
 * Os padrões são os do contrato, COPIADOS de lá e não escolhidos aqui.
 *
 * **Não há `JANELA_PADRAO`, e a ausência dela é a correção.** Ela existia e
 * valia `'30d'`, copiada do `default: 30d` que o contrato declarava em
 * `period`. O cliente pediu o contrário em 18/10/2026 — *"a página de pets não
 * deve trazer nenhum item do filtro por padrão, como está atualmente por
 * últimos 30 dias"* — e o `default` saiu do contrato no mesmo commit. Repor o
 * padrão aqui deixaria a ausência significar 30 dias de novo, com a diferença
 * de ninguém mais achar isso lendo o YAML.
 *
 * `page` e `limit` continuam com padrão porque o contrato continua declarando
 * o deles: paginação ausente é página 1 de 20, e isso ninguém reclamou.
 */
export const PAGINA_INICIAL = 1;
export const TAMANHO_PADRAO = 20;

function aparado(valor: string | undefined): string | undefined {
  const t = valor?.trim();
  return t === undefined || t === '' ? undefined : t;
}

/**
 * O recorte que de fato valeu, para a tela escrever a linha que explica o
 * corte. Mesmo formato de `recortesAplicados` da agenda da Rede: `scope: all`
 * quando nada além do obrigatório foi recortado.
 */
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
    // `pedido.period` SEM `??`: a ausência é janela aberta, e não 30 dias.
    const janela = pedido.period;
    const pagina = pedido.page ?? PAGINA_INICIAL;
    const limite = pedido.limit ?? TAMANHO_PADRAO;
    const bairro = aparado(pedido.neighborhood);
    const termo = aparado(pedido.q);

    const recorte: RecorteDePerdidos = {
      cidade: pedido.city.trim(),
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
        city: recorte.cidade,
        neighborhood: bairro,
        species: pedido.species,
        size: pedido.size,
        period: janela,
        q: termo,
      }),
    };
  }
}
