/**
 * A prévia do alcance do alerta, e as quatro respostas honestas.
 *
 * Quem está do outro lado é a mesma tutora de `abertura-do-caso.ts`: em pânico,
 * com 11% de bateria, prestes a decidir se vale a pena disparar. O único jeito
 * de trair essa pessoa aqui é **mostrar um número que não é verdade**, e há duas
 * formas de fazer isso sem querer:
 *
 * 1. Responder `0` quando o cálculo falhou. "Ninguém por perto" e "não
 *    conseguimos contar" levam a decisões opostas, e a primeira faz desistir
 *    quem tinha cem vizinhos ao redor.
 * 2. Responder `0` quando não há centro. Sem coordenada não existe raio, e
 *    portanto não existe a pergunta "quantos dentro dele". `no_location` é um
 *    estado próprio, e o contrato o declara justamente por isso.
 *
 * As quatro respostas, e o que cada uma quer dizer:
 *
 * | `reach_status` | significado | `reachable_tutors` |
 * |---|---|---|
 * | `computed` | contamos, e o número é este (inclusive zero) | o número |
 * | `unavailable` | havia centro, e o cálculo não respondeu | `null` |
 * | `no_location` | não há centro: **não haverá alerta** | `null` |
 * | `queued` | do `AlertDispatch`, **não desta rota** | — |
 *
 * `queued` é do disparo, não da prévia: o contrato o declara em
 * `LostCase.alert.reach_status` e o `enum` desta resposta não o contém (critério
 * 11 da BICHUS-20, que pede os dois como estados distintos).
 *
 * Padrão de referência: ADR-0006 ("falha de cálculo não vira zero") e a
 * descrição de `LostCaseReachPreview` em `api/openapi.yaml`, que é a fonte.
 */

/** O raio do alerta. Fixo em 5 km no MVP — raio configurável está fora de escopo. */
export const RAIO_DO_ALERTA_EM_METROS = 5000;

/** Os três que o `enum` de `LostCaseReachPreview.reach_status` declara. */
export type EstadoDoAlcance = 'computed' | 'unavailable' | 'no_location';

/** Onde o raio é centrado. Uma coordenada, ou nenhuma. */
export interface CentroDoAlcance {
  readonly lat: number;
  readonly lon: number;
}

export interface Alcance {
  readonly estado: EstadoDoAlcance;
  readonly tutoresAlcancaveis: number | null;
}

/**
 * Traduz "havia centro?" mais "a contagem respondeu?" nas três respostas.
 *
 * `contagem` é `null` quando **não foi possível contar**, e essa é a única
 * leitura dele: um contador que devolvesse `0` para dizer "não sei" apagaria a
 * distinção que esta função inteira existe para preservar. A porta
 * `AlcanceDoAlerta` declara isso no tipo, e não em prosa.
 */
export function alcanceDe(
  centro: CentroDoAlcance | undefined,
  contagem: number | null,
): Alcance {
  // Sem centro a pergunta não existe, e a contagem nem chega a ser feita.
  if (centro === undefined) return { estado: 'no_location', tutoresAlcancaveis: null };
  if (contagem === null) return { estado: 'unavailable', tutoresAlcancaveis: null };
  return { estado: 'computed', tutoresAlcancaveis: contagem };
}

/**
 * O centro, a partir do que chegou na consulta.
 *
 * **As duas, ou nenhuma.** Uma latitude sem longitude não é meio centro: é
 * entrada malformada, e aceitá-la faria a rota escolher em silêncio entre
 * ignorar o que a pessoa mandou e inventar o que faltou. `undefined` aqui
 * significa "sem centro"; o par pela metade é recusado na borda, antes de
 * chegar nesta função.
 *
 * A localização de referência do tutor **não** entra como centro alternativo, e
 * a ausência é deliberada: `users` guarda bairro, cidade e UF como TEXTO, e não
 * há geocodificação no MVP (ADR-0006). Texto não vira coordenada, então o
 * fallback que o contrato descreve ("ausente, usa a do tutor") só passa a
 * existir no dia em que houver coordenada de referência gravada.
 */
export function centroDe(
  lat: number | undefined,
  lon: number | undefined,
): CentroDoAlcance | undefined {
  if (typeof lat !== 'number' || typeof lon !== 'number') return undefined;
  return { lat, lon };
}
