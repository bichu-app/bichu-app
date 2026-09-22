/**
 * As decisões do disparo, exercitadas sem banco, sem rede e sem relógio.
 *
 * O que está aqui é a parte onde o erro não tem volta: um disparo que sai
 * errado não se recolhe da bandeja de notificação de 500 pessoas.
 *
 * ## As iscas, e como foram provadas
 *
 * Desligadas em `disparo-do-alerta.ts`, rodadas e vistas reprovar em
 * 22/09/2026, e depois restauradas. A conferência de que o arquivo mudou foi
 * por CONTEÚDO e não por `git diff`: o arquivo é novo e não rastreado, e o
 * `git diff` não teria o que mostrar.
 *
 * | o que foi desligado | reprovaram, aqui |
 * |---|---|
 * | `contagemDe` devolvendo `0` no lugar de `null` | 2 casos |
 * | `estadoInicialDoDisparo` devolvendo sempre `queued` | 2 casos |
 * | `podeDispararDeNovo` devolvendo sempre `true` | 2 casos |
 * | `>=` virando `>` na janela de 24 h | 1 caso |
 */
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
    // `computed` com zero é "não há ninguém num raio de 5 km", e é a resposta
    // que a BICHUS-20 existe para dizer em vez de esconder: ela é o que faz a
    // tela trocar a ação principal por "Compartilhar no WhatsApp" (critério 2).
    assert.equal(contagemDe(alcanceCom(0)), 0);
  });

  void it('`null` entra e `null` SAI: falha de cálculo não vira zero', () => {
    // ADR-0006, textual. Zero aqui faria desistir quem tinha cem vizinhos ao
    // redor, e é a forma mais barata de mentir para alguém em pânico.
    assert.equal(contagemDe(null), null);
  });

  void it('zero e `null` são distinguíveis pelo tipo, e não por convenção', () => {
    // A distinção precisa sobreviver a quem leia o valor sem ler o comentário.
    // `0 === null` é falso, e é essa a garantia; um contador que devolvesse
    // `-1` para "não sei" dependeria de todo chamador lembrar do acordo.
    assert.notEqual(contagemDe(alcanceCom(0)), contagemDe(null));
  });
});

void describe('estadoInicialDoDisparo: o disparo nasce honesto', () => {
  void it('com coordenada o disparo nasce `queued`, nunca `computed`', () => {
    // A API enfileira e o worker envia: no instante da abertura ninguém contou
    // nada ainda, e `computed` seria um número que não existe.
    assert.equal(estadoInicialDoDisparo(true), 'queued');
  });

  void it('sem coordenada o disparo nasce `no_location`, que não é zero', () => {
    // Critério 12 da BICHUS-20 e 14 da BICHUS-18: sem centro não há raio, e
    // portanto não existe a pergunta "quantos dentro dele". `computed: 0` diria
    // "não há ninguém por perto", que é outro fato e leva a outra decisão.
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
    // É também a trava de idempotência da fila: uma retentativa lê o
    // `dispatched_at` que a primeira passada gravou e desiste, em vez de
    // acordar as mesmas 500 pessoas duas vezes.
    assert.equal(podeDispararDeNovo(AGORA, AGORA), false);
  });

  void it('uma hora antes das 24 h ainda NÃO dispara', () => {
    const umaHoraAntes = (Number(AGORA) - JANELA_DE_24H_EM_MS + 3_600_000) as Instant;
    assert.equal(podeDispararDeNovo(umaHoraAntes, AGORA), false);
  });

  void it('exatamente 24 h depois JÁ dispara: a borda é inclusiva', () => {
    // A borda é escolhida, e não acidental: "um disparo por caso por dia" com
    // `>` faria o segundo alerta precisar de 24 h e um milissegundo, e o tutor
    // que tentasse no mesmo horário do dia seguinte seria recusado sem
    // entender por quê.
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
    // Os números vivem aqui e são lidos pela consulta: escritos à mão no SQL,
    // eles divergiriam da regra no dia em que a regra mudasse, e o teste que
    // comparasse SQL com SQL continuaria verde.
    assert.equal(TETO_DE_DESTINATARIOS, 500);
    assert.equal(TETO_DE_FADIGA, 3);
  });

  void it('a janela de 24 h é 24 h em milissegundos', () => {
    assert.equal(JANELA_DE_24H_EM_MS, 86_400_000);
  });
});
