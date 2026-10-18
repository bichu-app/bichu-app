/**
 * A MAQUINA DE ESTADOS DA ENTREGA da plaquinha, e o saneamento do codigo de
 * rastreio.
 *
 * ## Por que isto e dominio, e nao um `if` dentro do caso de uso
 *
 * A regra "nao se volta atras" e a unica coisa nesta frente que nao tem como
 * ser conferida por `CHECK` de banco: o banco ve a linha DEPOIS da escrita, e
 * `arrived -> in_transit` produz uma linha perfeitamente valida -- so que ela
 * apaga uma chegada que alguem registrou. Quem precisa recusar isso e quem
 * conhece o estado ANTERIOR, e esse e o unico lugar do codigo que conhece os
 * dois.
 *
 * Por isso a transicao mora aqui, pura, sem banco e sem HTTP: e o que faz a
 * isca da transicao invalida medir a REGRA em vez de medir um `UPDATE`.
 *
 * ## Os dois eixos, e por que esta maquina e so de um
 *
 * `status` (`pending`/`fulfilled`/`declined`) e a DECISAO do painel, e ela nao
 * e desta maquina: quem a move e `atender`/`recusar`.
 *
 * `delivery_state` (`requested`/`in_transit`/`arrived`) e a ENTREGA, e e o que
 * esta maquina governa -- os tres passos que o cliente nomeou em 18/10:
 * solicitado, em transporte, chegou.
 *
 * A dependencia entre os eixos esta no banco
 * (`collar_tag_requests_entrega_exige_atendimento`: so sai de `requested` quem
 * esta `fulfilled`) e e repetida aqui como RESPOSTA, nao como segunda regra:
 * [entregaPodeAndar] existe para o pedido pendente receber um `400` que diz
 * qual e o proximo passo, em vez de estourar uma violacao de `CHECK` na cara de
 * quem clicou.
 */
import type {
  DecisaoDoPedidoDePlaquinha,
  PassoAlcancavelDoPedido,
  PassoDaEntrega,
} from '../ports/pedido-de-plaquinha.js';

/** O teto do codigo de rastreio, e o mesmo numero do `CHECK` do banco. */
export const TAMANHO_MAXIMO_DO_RASTREIO = 64;
/** O piso. Tres simbolos nao e formato de transportadora: e "nao e vazio". */
export const TAMANHO_MINIMO_DO_RASTREIO = 3;

/**
 * As transicoes permitidas, escritas como DADO e nao como cadeia de `if`.
 *
 * Uma tabela se le inteira de uma vez -- quem revisar ve as quatro linhas e as
 * ausencias --, e uma cadeia de `if` esconde a ausencia no meio do fluxo.
 *
 * | de | para | o que e |
 * | --- | --- | --- |
 * | `requested` | `in_transit` | a plaquinha saiu |
 * | `in_transit` | `arrived` | a plaquinha chegou |
 * | `in_transit` | `in_transit` | so o rastreio mudou |
 * | `arrived` | `arrived` | so o rastreio mudou |
 *
 * **O que NAO esta aqui, e o motivo de cada ausencia:**
 *
 * - `arrived -> in_transit` e qualquer `-> requested`: e VOLTAR ATRAS. A chegada
 *   e o despacho foram registrados por pessoas, e desfaze-los por rota faria a
 *   trilha contar uma historia que nao aconteceu. Corrigir engano aqui nao e
 *   transicao: e pedido novo, ou ajuste por quem opera o banco;
 * - `requested -> arrived`: e para FRENTE, e mesmo assim nao entra. O passo
 *   intermediario e o que carrega o rastreio e o carimbo de despacho, e pular
 *   direto para a chegada deixaria a entrega sem registro de que ela saiu. Sao
 *   dois cliques, e o painel os oferece em sequencia;
 * - `requested -> requested`: nao ha o que atualizar. Rastreio em pedido que nao
 *   saiu e proibido pelo `CHECK` `rastreio_so_apos_sair`, entao esta transicao
 *   seria uma escrita que nao pode mudar nada.
 */
const TRANSICOES: ReadonlyMap<PassoDaEntrega, readonly PassoDaEntrega[]> = new Map([
  ['requested', ['in_transit'] as const],
  ['in_transit', ['in_transit', 'arrived'] as const],
  ['arrived', ['arrived'] as const],
]);

/**
 * Os passos que a rota aceita como ALVO, como VALOR -- o tipo
 * [PassoAlcancavelDoPedido] mora na porta.
 *
 * `satisfies` como trava: se [PassoDaEntrega] ganhar um passo alcancavel, o
 * compilador reprova aqui em vez de a rota aceitar em silencio um valor que
 * nenhuma transicao conhece.
 */
export const PASSOS_ALCANCAVEIS = ['in_transit', 'arrived'] as const satisfies readonly PassoAlcancavelDoPedido[];

/**
 * A transicao e permitida?
 *
 * Repetir o passo atual (`in_transit` sobre `in_transit`, `arrived` sobre
 * `arrived`) e PERMITIDO de proposito: e o caminho de corrigir so o codigo de
 * rastreio, que o cliente pediu junto do estado. Nao e "voltar atras" -- nada
 * se desfaz.
 */
export function transicaoDeEntregaPermitida(de: PassoDaEntrega, para: PassoDaEntrega): boolean {
  return TRANSICOES.get(de)?.includes(para) ?? false;
}

/**
 * O pedido pode ter a entrega mexida?
 *
 * Espelha o `CHECK` `collar_tag_requests_entrega_exige_atendimento`. A
 * duplicacao e deliberada e tem um proposito que o `CHECK` nao cumpre: dar ao
 * painel um `400` que NOMEIA o proximo passo ("atenda o pedido primeiro") em
 * vez de uma violacao de restricao do Postgres, que chega como 500.
 *
 * Quem decide continua sendo o banco: se esta funcao fosse apagada, a escrita
 * ainda seria recusada -- so que feio.
 */
export function entregaPodeAndar(status: DecisaoDoPedidoDePlaquinha): boolean {
  return status === 'fulfilled';
}

/**
 * O codigo de rastreio como ele vai para o banco.
 *
 * Tres resultados, e os tres sao estados diferentes do pedido do cliente:
 *
 * - `{ tipo: 'manter' }` -- o campo nao veio no corpo. O rastreio nao muda;
 * - `{ tipo: 'definir', codigo }` -- veio texto. Vai `trim`ado;
 * - `{ tipo: 'apagar' }` -- veio `null`. O rastreio sai.
 *
 * **Texto que e so espaco NAO vira `apagar`.** Ele e recusado, e a diferenca
 * importa: quem mandou `"   "` quis escrever um codigo e errou, e apagar em
 * silencio o rastreio que ja estava la seria a pior leitura possivel desse
 * engano. Quem quer apagar manda `null`, que e explicito.
 *
 * **Nao ha validacao de formato de transportadora**, e a ausencia e a decisao:
 * Correios tem 13 simbolos, FedEx de 12 a 22, DHL 10, e regional tem o que
 * quiser e muda. Um formato cravado aqui recusaria, em producao e sem aviso, o
 * rastreio legitimo de amanha. O teto e o piso sao de TAMANHO, e nao afirmam
 * nada sobre a forma do codigo.
 */
export type RastreioPedido =
  | { readonly tipo: 'manter' }
  | { readonly tipo: 'apagar' }
  | { readonly tipo: 'definir'; readonly codigo: string };

export type SaneamentoDoRastreio =
  | { readonly ok: true; readonly pedido: RastreioPedido }
  | { readonly ok: false; readonly code: 'blank_tracking_code' | 'tracking_code_too_long' };

export function sanearRastreio(bruto: string | null | undefined): SaneamentoDoRastreio {
  if (bruto === undefined) return { ok: true, pedido: { tipo: 'manter' } };
  if (bruto === null) return { ok: true, pedido: { tipo: 'apagar' } };

  const limpo = bruto.trim();
  // Vazio, ou so espaco. Recusa explicita, e nao `apagar`: ver o cabecalho.
  if (limpo.length < TAMANHO_MINIMO_DO_RASTREIO) return { ok: false, code: 'blank_tracking_code' };
  // O schema do contrato ja cobra `maxLength: 64`, e este ramo e a mesma regra
  // do lado de ca para quem chamar o caso de uso sem passar pelo Ajv.
  if (limpo.length > TAMANHO_MAXIMO_DO_RASTREIO) {
    return { ok: false, code: 'tracking_code_too_long' };
  }
  return { ok: true, pedido: { tipo: 'definir', codigo: limpo } };
}
