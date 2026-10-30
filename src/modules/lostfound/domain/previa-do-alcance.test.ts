/**
 * As quatro respostas honestas do alcance (BICHUS-202, BICHUS-20 critérios 5, 12 e
 * 14).
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
    assert.deepEqual(alcanceDe(CENTRO, 0), { estado: 'computed', tutoresAlcancaveis: 0 });
  });

  void it('com centro e SEM contagem: unavailable com nulo, nunca zero', () => {
    const alcance = alcanceDe(CENTRO, null);
    assert.equal(alcance.estado, 'unavailable');
    assert.equal(alcance.tutoresAlcancaveis, null);
    assert.notEqual(alcance.tutoresAlcancaveis, 0);
  });

  void it('SEM centro: no_location, e a contagem nem é consultada', () => {
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
    assert.equal(centroDe(-23.56, undefined), undefined);
    assert.equal(centroDe(undefined, -46.68), undefined);
  });

  void it('zero é coordenada válida, e não ausência', () => {
    assert.deepEqual(centroDe(0, -50), { lat: 0, lon: -50 });
  });
});

void describe('o raio', () => {
  void it('é 5 km, que é o número fixo do MVP', () => {
    assert.equal(RAIO_DO_ALERTA_EM_METROS, 5000);
  });
});
