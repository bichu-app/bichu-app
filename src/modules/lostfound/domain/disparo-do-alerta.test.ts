/** As decisões do disparo, exercitadas sem banco, sem rede e sem relógio. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { AlcanceCalculado } from '../ports/alcance-do-alerta.js';
import {
  contagemDe,
  estadoInicialDoDisparo,
  JANELA_DE_24H_EM_MS,
  podeDispararDeNovo,
  TETO_DE_DESTINATARIOS,
  TETO_DE_FADIGA,
} from './disparo-do-alerta.js';

const AGORA = 1_800_000_000_000 as Instant;

function alcanceCom(n: number): AlcanceCalculado {
  return {
    destinatarios: Array.from({ length: n }, (_, i) => ({
      usuario: `018f3a2b-0000-7000-8000-${String(i).padStart(12, '0')}` as UserId,
      aparelhos: [],
    })),
    tetoAtingido: false,
  };
}

void describe('contagemDe: uma via só para "quantos"', () => {
  void it('a contagem é o tamanho da lista, e não um número à parte', () => {
    assert.equal(contagemDe(alcanceCom(12)), 12);
  });

  void it('lista VAZIA devolve zero, que é um número verdadeiro', () => {
    assert.equal(contagemDe(alcanceCom(0)), 0);
  });

  void it('`null` entra e `null` SAI: falha de cálculo não vira zero', () => {
    assert.equal(contagemDe(null), null);
  });

  void it('zero e `null` são distinguíveis pelo tipo, e não por convenção', () => {
    assert.notEqual(contagemDe(alcanceCom(0)), contagemDe(null));
  });
});

void describe('estadoInicialDoDisparo: o disparo nasce honesto', () => {
  void it('com coordenada o disparo nasce `queued`, nunca `computed`', () => {
    assert.equal(estadoInicialDoDisparo(true), 'queued');
  });

  void it('sem coordenada o disparo nasce `no_location`, que não é zero', () => {
    assert.equal(estadoInicialDoDisparo(false), 'no_location');
  });

  void it('os dois estados iniciais são diferentes entre si', () => {
    assert.notEqual(estadoInicialDoDisparo(true), estadoInicialDoDisparo(false));
  });
});

void describe('podeDispararDeNovo: o sétimo critério do ADR-0006', () => {
  void it('o caso que nunca disparou pode disparar', () => {
    assert.equal(podeDispararDeNovo(null, AGORA), true);
  });

  void it('o caso que disparou agora NÃO dispara de novo', () => {
    assert.equal(podeDispararDeNovo(AGORA, AGORA), false);
  });

  void it('uma hora antes das 24 h ainda NÃO dispara', () => {
    const umaHoraAntes = (Number(AGORA) - JANELA_DE_24H_EM_MS + 3_600_000) as Instant;
    assert.equal(podeDispararDeNovo(umaHoraAntes, AGORA), false);
  });

  void it('exatamente 24 h depois JÁ dispara: a borda é inclusiva', () => {
    const exatamente = (Number(AGORA) - JANELA_DE_24H_EM_MS) as Instant;
    assert.equal(podeDispararDeNovo(exatamente, AGORA), true);
  });

  void it('um milissegundo antes das 24 h ainda não dispara', () => {
    const quase = (Number(AGORA) - JANELA_DE_24H_EM_MS + 1) as Instant;
    assert.equal(podeDispararDeNovo(quase, AGORA), false);
  });
});

void describe('os tetos são os do ADR-0006, e estão escritos uma vez', () => {
  void it('o teto de destinatários é 500 e o de fadiga é 3', () => {
    assert.equal(TETO_DE_DESTINATARIOS, 500);
    assert.equal(TETO_DE_FADIGA, 3);
  });

  void it('a janela de 24 h é 24 h em milissegundos', () => {
    assert.equal(JANELA_DE_24H_EM_MS, 86_400_000);
  });
});
