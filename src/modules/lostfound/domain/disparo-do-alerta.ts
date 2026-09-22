/**
 * O disparo do alerta de 5 km: as decisões, separadas do encanamento.
 *
 * Nada aqui abre banco, lê relógio ou manda push. É a parte que um teste
 * exercita exaustivamente — e é onde o erro não tem volta, porque um disparo
 * que sai errado não se recolhe da bandeja de notificação de 500 pessoas.
 *
 * ## A contagem e a lista saem daqui, da mesma origem
 *
 * `contagemDe` é a **única** forma de transformar um alcance em número no
 * sistema inteiro. A prévia (BICHUS-20) e o disparo (BICHUS-18) chamam esta
 * função sobre o mesmo `AlcanceCalculado`, e é isso que impede a tela de
 * prometer 12 e o envio de entregar 9: não existe segundo caminho para
 * "quantos". Ela é de uma linha de propósito — uma linha que se pode apontar é
 * melhor que uma regra que se pede que alguém lembre.
 *
 * ## O sétimo critério é do CASO, e não das pessoas
 *
 * `podeDispararDeNovo` responde o critério 7 do ADR-0006 (*"o caso não mandou
 * alerta nas últimas 24 h"*). Ele está fora da consulta de alcance, e a razão
 * está no cabeçalho de `ports/alcance-do-alerta.ts`: como filtro de linhas ele
 * devolveria zero destinatários, e zero destinatários viraria `computed: 0` —
 * "não há ninguém por perto" em vez de "este caso já avisou hoje". A tela tem
 * texto diferente para cada um, e trocá-los é mentir para quem está em pânico.
 */
import type { AlcanceCalculado } from '../ports/alcance-do-alerta.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * Os quatro estados de `AlertDispatch.reach_status`, e os quatro são distintos.
 *
 * | estado | o que aconteceu | `recipients_total` |
 * |---|---|---|
 * | `queued` | pedimos, e ainda não rodou | `null` |
 * | `computed` | rodou, e o número é este (inclusive zero) | o número |
 * | `unavailable` | havia raio, e o cálculo não respondeu | `null` |
 * | `no_location` | não há raio: o caso não tem coordenada | `null` |
 *
 * Não é o mesmo conjunto de `EstadoDoAlcance`, que é da prévia e tem três: lá
 * `queued` não existe porque a prévia não enfileira nada (critério 11 da
 * BICHUS-20, que pede os dois como estados distintos).
 */
export type EstadoDoDisparo = 'computed' | 'unavailable' | 'queued' | 'no_location';

/**
 * O teto de destinatários por disparo (critério 9 da BICHUS-18).
 *
 * Ele limita custo e o efeito de um caso em região densa. O corte é **depois**
 * de ordenar por distância crescente: quando sobra alerta para 500 de 900, quem
 * fica são os mais perto, que são os que têm chance de ver o animal na rua.
 */
export const TETO_DE_DESTINATARIOS = 500;

/**
 * O teto de fadiga: no máximo 3 alertas por conta em 24 h (critério 6 do
 * ADR-0006, critério 10 da BICHUS-18).
 *
 * Por USUÁRIO e não por caso, e a distinção é o ponto: quatro casos diferentes
 * na mesma quadra não dão a ninguém o direito de acordar a mesma pessoa quatro
 * vezes. Quem passa do teto simplesmente não entra na lista — e não entra em
 * `reachable_tutors` também, porque o número da tela é o de quem vai receber.
 */
export const TETO_DE_FADIGA = 3;

/** A janela do teto de fadiga e a do critério 7, em milissegundos. */
export const JANELA_DE_24H_EM_MS = 24 * 60 * 60 * 1000;

/** Trinta dias, a validade da localização (critério 2 do ADR-0006). */
export const VALIDADE_DA_LOCALIZACAO_EM_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Quantos vão receber, a partir de quem vai receber.
 *
 * `null` entra e `null` sai, e isso é a regra do ADR-0006 num `if`: *"falha de
 * cálculo não vira zero"*. Lista vazia devolve `0`, que é um número verdadeiro
 * e diz "não há ninguém num raio de 5 km" — resposta diferente de "não
 * conseguimos calcular", e a única das duas que a tela pode transformar em
 * "compartilhe no WhatsApp do bairro".
 */
export function contagemDe(alcance: AlcanceCalculado | null): number | null {
  return alcance === null ? null : alcance.destinatarios.length;
}

/**
 * O estado em que o disparo NASCE, no instante em que o caso é aberto.
 *
 * Dois estados, e nenhum deles é `computed`: a API enfileira e o worker envia
 * (ADR-0001, e a métrica de arquitetura fala em "último push ENFILEIRADO").
 * Um caso sem coordenada nasce `no_location` e **não é enfileirado** — critério
 * 14 da BICHUS-18, que é explícito em dizer que isso não é falha de envio e não
 * gera retentativa. Enfileirar para depois descobrir que não há centro gastaria
 * a fila e produziria uma tentativa fracassada onde não havia o que tentar.
 */
export function estadoInicialDoDisparo(temCoordenada: boolean): EstadoDoDisparo {
  return temCoordenada ? 'queued' : 'no_location';
}

/**
 * O critério 7: este caso pode disparar agora?
 *
 * `ultimoEnvio` é o instante em que o último alerta deste caso **saiu** — não
 * em que foi pedido. A diferença é a coluna `dispatched_at` em vez de
 * `requested_at`, e ela importa: um disparo que ficou enfileirado e nunca saiu
 * não gastou o direito de ninguém a ser avisado.
 *
 * `null` é "nunca disparou", e o primeiro alerta de um caso sempre pode sair.
 */
export function podeDispararDeNovo(ultimoEnvio: Instant | null, agora: Instant): boolean {
  if (ultimoEnvio === null) return true;
  return Number(agora) - Number(ultimoEnvio) >= JANELA_DE_24H_EM_MS;
}
