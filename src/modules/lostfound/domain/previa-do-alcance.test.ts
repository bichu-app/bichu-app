/**
 * As quatro respostas honestas do alcance (BICHUS-202, BICHUS-20 critérios 5,
 * 12 e 14).
 *
 * Roda sem servidor, sem banco e sem rede: a decisão "qual das três respostas"
 * é regra de domínio, e precisar de infraestrutura para exercitá-la seria o
 * acoplamento como defeito.
 *
 * O que estes casos protegem é uma distinção que desaparece com facilidade,
 * porque as três respostas erradas são todas o mesmo `0`:
 *
 * - `0` porque contamos e não havia ninguém — **verdade**;
 * - `0` porque a consulta falhou — mentira, e a mais cara delas;
 * - `0` porque não havia raio para contar dentro — mentira de outro tipo.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  alcanceDe,
  centroDe,
  RAIO_DO_ALERTA_EM_METROS,
  type CentroDoAlcance,
} from './previa-do-alcance.js';

const CENTRO: CentroDoAlcance = { lat: -23.56, lon: -46.68 };

void describe('as três respostas de reach_status', () => {
  void it('com centro e com contagem: computed, com o número', () => {
    assert.deepEqual(alcanceDe(CENTRO, 46), { estado: 'computed', tutoresAlcancaveis: 46 });
  });

  void it('ZERO CONTADO é computed com zero, e não unavailable', () => {
    // A variante A do contrato: "nenhum tutor por perto" é uma resposta válida e
    // a tela tem texto próprio para ela. Confundi-la com falha esconderia da
    // pessoa a informação mais acionável que existe — que compartilhar no
    // WhatsApp alcança mais gente hoje do que o alerta.
    assert.deepEqual(alcanceDe(CENTRO, 0), { estado: 'computed', tutoresAlcancaveis: 0 });
  });

  void it('com centro e SEM contagem: unavailable com nulo, nunca zero', () => {
    const alcance = alcanceDe(CENTRO, null);
    assert.equal(alcance.estado, 'unavailable');
    assert.equal(alcance.tutoresAlcancaveis, null);
    assert.notEqual(alcance.tutoresAlcancaveis, 0);
  });

  void it('SEM centro: no_location, e a contagem nem é consultada', () => {
    // O segundo argumento é `0` de propósito: mesmo com uma contagem em mãos,
    // sem centro não existe a pergunta "quantos dentro do raio". Se esta função
    // passasse a devolver `computed: 0` aqui, a tela diria "ninguém por perto"
    // quando a verdade é "não vai haver alerta" — coisas diferentes, e o
    // critério 12 da BICHUS-20 existe para separá-las.
    assert.deepEqual(alcanceDe(undefined, 0), { estado: 'no_location', tutoresAlcancaveis: null });
  });

  void it('`queued` não é resposta desta rota: ele é do disparo', () => {
    const estados = [
      alcanceDe(CENTRO, 1).estado,
      alcanceDe(CENTRO, null).estado,
      alcanceDe(undefined, null).estado,
    ];
    assert.equal(estados.includes('queued' as never), false);
  });
});

void describe('o centro sai da consulta, e só quando ele está inteiro', () => {
  void it('as duas coordenadas fazem um centro', () => {
    assert.deepEqual(centroDe(-23.56, -46.68), { lat: -23.56, lon: -46.68 });
  });

  void it('nenhuma das duas não faz centro nenhum', () => {
    assert.equal(centroDe(undefined, undefined), undefined);
  });

  void it('meia coordenada NÃO vira meio centro', () => {
    // A borda recusa este caso com 400 antes de chegar aqui. A função também não
    // o aceita, porque a defesa que existe em um lugar só some no dia em que
    // alguém chamar esta função de outro ponto.
    assert.equal(centroDe(-23.56, undefined), undefined);
    assert.equal(centroDe(undefined, -46.68), undefined);
  });

  void it('zero é coordenada válida, e não ausência', () => {
    // A linha do Equador cruza o Brasil. Um `if (!lat)` aqui — que é como isto
    // costuma ser escrito — apagaria o centro de quem está em Macapá.
    assert.deepEqual(centroDe(0, -50), { lat: 0, lon: -50 });
  });
});

void describe('o raio', () => {
  void it('é 5 km, que é o número fixo do MVP', () => {
    assert.equal(RAIO_DO_ALERTA_EM_METROS, 5000);
  });
});
