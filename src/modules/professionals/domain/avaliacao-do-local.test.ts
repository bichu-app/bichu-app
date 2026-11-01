import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MOTIVOS_DA_DENUNCIA,
  NOTAS,
  NOTA_MAXIMA,
  NOTA_MINIMA,
  PONTUACAO_VAZIA,
  TAMANHO_MAXIMO_DO_TEXTO,
  projetarAvaliacao,
  projetarPontuacao,
  validarDenuncia,
  validarEntradaDaAvaliacao,
} from './avaliacao-do-local.js';
import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

const CRIADA_EM = comoData(Date.UTC(2026, 9, 18, 12, 0, 0) as Instant);

const campos = (erros: readonly { field: string; code: string }[]): string[] =>
  erros.map((e) => `${e.field}:${e.code}`);

void describe('a nota vai de 1 a 5, e a faixa é recusada no domínio', () => {
  void it('1 e 5 são notas válidas', () => {
    for (const nota of [NOTA_MINIMA, NOTA_MAXIMA]) {
      const r = validarEntradaDaAvaliacao({ rating: nota });
      assert.deepEqual(r.erros, [], `a nota ${String(nota)} foi recusada e ela é da faixa`);
      assert.equal(r.entrada?.nota, nota);
    }
  });

  void it('as cinco notas declaradas em NOTAS passam, uma a uma', () => {
    for (const nota of NOTAS) {
      assert.deepEqual(
        validarEntradaDaAvaliacao({ rating: nota }).erros,
        [],
        `a nota ${String(nota)} está em NOTAS e foi recusada`,
      );
    }
  });

  void it('nota fora da faixa é recusada e NOMEADA', () => {
    for (const ruim of [0, 6, -1, 100]) {
      const r = validarEntradaDaAvaliacao({ rating: ruim });
      assert.deepEqual(
        campos(r.erros),
        ['rating:out_of_range'],
        `a nota ${String(ruim)} passou, ou foi recusada pelo motivo errado`,
      );
      assert.equal(r.entrada, undefined, 'a entrada voltou mesmo com erro');
    }
  });

  void it('nota quebrada não é nota', () => {
    assert.deepEqual(campos(validarEntradaDaAvaliacao({ rating: 4.5 }).erros), ['rating:required']);
  });

  void it('nota ausente, nula ou em texto é recusada e NOMEADA', () => {
    for (const ruim of [undefined, null, '5', true, {}]) {
      assert.deepEqual(
        campos(validarEntradaDaAvaliacao({ rating: ruim }).erros),
        ['rating:required'],
        `${JSON.stringify(ruim)} passou como nota`,
      );
    }
    assert.deepEqual(campos(validarEntradaDaAvaliacao({}).erros), ['rating:required']);
    assert.deepEqual(campos(validarEntradaDaAvaliacao(undefined).erros), ['rating:required']);
  });
});

void describe('o texto da avaliação: opcional, aparado e sem HTML', () => {
  void it('sem `body`, a avaliação é só a nota, e o texto é `null`', () => {
    const r = validarEntradaDaAvaliacao({ rating: 4 });
    assert.deepEqual(r.erros, []);
    assert.equal(r.entrada?.texto, null);
  });

  void it('texto só de espaço é "sem texto", e não um erro', () => {
    for (const vazio of ['', '   ', '\n\t ']) {
      const r = validarEntradaDaAvaliacao({ rating: 4, body: vazio });
      assert.deepEqual(r.erros, [], `${JSON.stringify(vazio)} virou erro, e apagar o texto é legítimo`);
      assert.equal(r.entrada?.texto, null, 'vazio precisa virar `null`, a única forma de "sem texto"');
    }
  });

  void it('o texto é gravado aparado', () => {
    const r = validarEntradaDaAvaliacao({ rating: 5, body: '  atenderam muito bem  ' });
    assert.equal(r.entrada?.texto, 'atenderam muito bem');
  });

  void it('o texto no limite passa, e um caractere além reprova', () => {
    const noLimite = 'a'.repeat(TAMANHO_MAXIMO_DO_TEXTO);
    assert.deepEqual(
      validarEntradaDaAvaliacao({ rating: 3, body: noLimite }).erros,
      [],
      'o texto de tamanho exatamente máximo foi recusado',
    );
    assert.deepEqual(
      campos(validarEntradaDaAvaliacao({ rating: 3, body: `${noLimite}a` }).erros),
      ['body:too_long'],
    );
  });

  void it('mil e quinhentos espaços não são um texto de 1500 caracteres', () => {
    const r = validarEntradaDaAvaliacao({ rating: 3, body: ' '.repeat(TAMANHO_MAXIMO_DO_TEXTO + 50) });
    assert.deepEqual(r.erros, []);
    assert.equal(r.entrada?.texto, null);
  });

  void it('sinal de maior ou menor é recusado, nos dois campos', () => {
    assert.deepEqual(
      campos(validarEntradaDaAvaliacao({ rating: 5, body: 'nota 10 <3' }).erros),
      ['body:html_not_allowed'],
    );
    assert.deepEqual(
      campos(validarEntradaDaAvaliacao({ rating: 5, body: '<script>alert(1)</script>' }).erros),
      ['body:html_not_allowed'],
    );
    assert.deepEqual(
      campos(validarDenuncia({ reason: MOTIVOS_DA_DENUNCIA[0], detail: 'olha o <b>' }).erros),
      ['detail:html_not_allowed'],
    );
  });

  void it('texto que não é texto é recusado e NOMEADO', () => {
    assert.deepEqual(campos(validarEntradaDaAvaliacao({ rating: 3, body: 42 }).erros), ['body:invalid']);
  });

  void it('nota e texto errados ao mesmo tempo nomeiam OS DOIS campos', () => {
    assert.deepEqual(campos(validarEntradaDaAvaliacao({ rating: 9, body: 42 }).erros).sort(), [
      'body:invalid',
      'rating:out_of_range',
    ]);
  });
});

void describe('a denúncia: motivo de lista fechada', () => {
  void it('cada motivo declarado passa', () => {
    for (const motivo of MOTIVOS_DA_DENUNCIA) {
      assert.deepEqual(
        validarDenuncia({ reason: motivo }).erros,
        [],
        `o motivo ${motivo} está na lista e foi recusado`,
      );
    }
  });

  void it('motivo fora da lista é recusado', () => {
    for (const ruim of ['nao_gostei', '', undefined, 7]) {
      assert.deepEqual(
        campos(validarDenuncia({ reason: ruim }).erros),
        ['reason:required'],
        `${JSON.stringify(ruim)} passou como motivo`,
      );
    }
  });

  void it('detalhe é opcional, e vazio vira `null`', () => {
    const r = validarDenuncia({ reason: MOTIVOS_DA_DENUNCIA[0], detail: '   ' });
    assert.deepEqual(r.erros, []);
    assert.equal(r.denuncia?.detalhe, null);
  });
});

void describe('a pontuação do local', () => {
  void it('local sem avaliação tem média NULA, e não zero', () => {
    const p = projetarPontuacao(PONTUACAO_VAZIA);
    assert.equal(
      p.average,
      null,
      'REPROVA: zero se lê como "péssimo" numa escala de 1 a 5, e um local que ninguém avaliou não é péssimo.',
    );
    assert.equal(p.count, 0);
  });

  void it('as cinco barras vêm sempre, inclusive com zero', () => {
    const p = projetarPontuacao({
      ...PONTUACAO_VAZIA,
      quantidade: 2,
      media: 4.5,
      histograma: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
    });
    assert.deepEqual(
      Object.keys(p.histogram).sort(),
      ['1', '2', '3', '4', '5'],
      'REPROVA: barra faltando muda a forma do gráfico e ele deixa de ser comparável entre locais.',
    );
    assert.equal(p.average, 4.5);
    assert.equal(p.count, 2);
  });
});

void describe('o que a avaliação projetada NÃO carrega', () => {
  const AVALIACAO = {
    id: '018f3a2b-0000-7000-8000-00000000abcd',
    ref: 'Xk3Qm9TbPz7Lw2Rv5Nd8Hq',
    nota: 5 as const,
    texto: 'atenderam muito bem',
    nomeDeExibicaoDoAutor: 'Mariana',
    criadaEm: CRIADA_EM,
    editadaEm: null,
    minha: true,
  };

  void it('as chaves são exatamente as sete do contrato', () => {
    assert.deepEqual(Object.keys(projetarAvaliacao(AVALIACAO)).sort(), [
      'author_display_name',
      'body',
      'created_at',
      'edited_at',
      'mine',
      'rating',
      'ref',
    ]);
  });

  void it('NÃO carrega UUID interno, em nenhuma profundidade', () => {
    const projetada = JSON.stringify(projetarAvaliacao(AVALIACAO));
    assert.equal(
      projetada.includes(AVALIACAO.id),
      false,
      'REPROVA: o `id` da avaliação saiu. É UUID interno, proibido em saída pelo ADR-0010.',
    );
    assert.doesNotMatch(projetada, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu);
  });

  void it('o `ref` opaco é o que sai no lugar', () => {
    assert.equal(projetarAvaliacao(AVALIACAO).ref, AVALIACAO.ref);
  });
});
