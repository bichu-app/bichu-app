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
  ConjuntoDePerdidos,
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

/**
 * O pedido como a borda o entrega: **tudo opcional**, a cidade inclusive desde
 * 19/10/2026 (decisão do cliente: *"o campo cidade do filtro da página pet não
 * deve ser obrigatório"*).
 */
/** `case_state` como o contrato o escreve. */
export type EstadoDoCasoPedido = 'open' | 'reunited';

/**
 * A traducao de `case_state` para o conjunto da porta, e **o unico lugar** onde
 * a ausencia do parametro se torna `aberto`.
 *
 * Um `?? 'aberto'` dentro do adaptador faria a consulta decidir sozinha, e um
 * `default: open` no contrato faria o Ajv escrever o valor na consulta de quem
 * nao mandou nada -- `applied_filters` citaria um filtro que ninguem aplicou,
 * que e o defeito que `period` pagou em 18/10/2026.
 */
export function conjuntoPedido(estado: EstadoDoCasoPedido | undefined): ConjuntoDePerdidos {
  return estado === 'reunited' ? 'reencontrado' : 'aberto';
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
    // `aparado` e nao `.trim()`: `city="   "` passa pelo `minLength: 2` do
    // contrato com dois espacos dentro, e `"   ".trim()` seria `""` -- uma
    // cidade vazia que o adaptador compararia contra `texto_para_busca('')` e
    // que nao casaria com nada, devolvendo uma pagina vazia em vez da lista
    // aberta. `aparado` transforma os dois casos (ausente e so-espaco) na MESMA
    // coisa, que e a unica leitura defensavel: ninguem pediu cidade.
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
      // `city` entra em `applied_filters` **so quando foi pedida**, pelo mesmo
      // `recortesAplicados` que ja omitia `period` ausente: a tela le esta
      // lista para escrever a linha que explica o corte, e citar uma cidade que
      // ninguem escolheu seria a tela afirmando um recorte que o servidor nao
      // aplicou.
      applied_filters: recortesAplicados({
        // `case_state` entra aqui SO quando foi enviado, e a ausencia nao entra:
        // a pagina precisa poder dizer que abriu sem recorte, e o conjunto de
        // casos abertos e o que ela sempre devolveu.
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
