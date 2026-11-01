import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compararVersoes, lerVersao } from './versao.js';

const ORDEM: readonly { a: string; b: string; esperado: -1 | 0 | 1; porque: string }[] = [
  { a: '1.10.0', b: '1.9.0', esperado: 1, porque: 'menor 10 e mais novo que menor 9' },
  { a: '1.9.0', b: '1.10.0', esperado: -1, porque: 'o mesmo, do outro lado' },
  { a: '10.0.0', b: '9.9.9', esperado: 1, porque: 'maior 10 e mais novo que maior 9' },
  { a: '1.0.10', b: '1.0.9', esperado: 1, porque: 'correcao 10 e mais nova que correcao 9' },
  { a: '2.0.0', b: '10.0.0', esperado: -1, porque: 'maior 2 e mais antigo que maior 10' },
  { a: '1.100.0', b: '1.99.0', esperado: 1, porque: 'a centena tambem' },

  { a: '1.4.0', b: '1.4.0', esperado: 0, porque: 'a mesma versao' },
  { a: '0.0.0', b: '0.0.0', esperado: 0, porque: 'zero e versao valida' },

  { a: '2.0.0', b: '1.99.99', esperado: 1, porque: 'maior manda sobre menor' },
  { a: '1.2.0', b: '1.1.99', esperado: 1, porque: 'menor manda sobre correcao' },
  { a: '1.0.1', b: '1.0.0', esperado: 1, porque: 'a correcao decide o empate' },
  { a: '0.1.0', b: '0.0.99', esperado: 1, porque: 'vale tambem abaixo de 1.0.0' },

  { a: '9999.9999.9999', b: '9999.9999.9998', esperado: 1, porque: 'o teto ainda compara' },
];

const NAO_E_VERSAO: readonly { bruta: string; porque: string }[] = [
  { bruta: '', porque: 'vazio' },
  { bruta: '1', porque: 'um componente' },
  { bruta: '1.4', porque: 'dois componentes -- o engano mais comum de quem digita' },
  { bruta: '1.4.0.1', porque: 'quatro componentes' },
  { bruta: 'v1.4.0', porque: 'o `v` na frente' },
  { bruta: '1.4.0-rc.1', porque: 'rotulo de pre-lancamento' },
  { bruta: '1.4.0+build7', porque: 'metadado de build' },
  { bruta: ' 1.4.0', porque: 'espaco na frente (valor colado de outro lugar)' },
  { bruta: '1.4.0 ', porque: 'espaco no fim' },
  { bruta: '1.04.0', porque: 'zero a esquerda: duas grafias para a mesma versao' },
  { bruta: '01.4.0', porque: 'zero a esquerda no maior' },
  { bruta: '1..0', porque: 'componente vazio' },
  { bruta: '1.4.', porque: 'termina no ponto' },
  { bruta: '-1.4.0', porque: 'sinal' },
  { bruta: '1.4.x', porque: 'componente que nao e digito' },
  { bruta: '10000.0.0', porque: 'acima do teto de quatro digitos do contrato' },
  { bruta: '1.4.0\n', porque: 'quebra de linha' },
  { bruta: 'latest', porque: 'palavra' },
];

void describe('a comparacao de versao nao erra na dezena', () => {
  for (const caso of ORDEM) {
    void it(`${caso.a} vs ${caso.b} = ${caso.esperado} (${caso.porque})`, () => {
      const ordem = compararVersoes(caso.a, caso.b);
      assert.notEqual(ordem, undefined, `${caso.a} e ${caso.b} precisam ser legiveis`);
      assert.equal(Math.sign(ordem as number), caso.esperado);
    });
  }

  void it('a tabela cobre a dezena nos tres componentes, e nao um caso so', () => {
    const dezenas = ORDEM.filter(
      (c) => c.a.includes('10') || c.b.includes('10') || c.a.includes('100'),
    );
    assert.ok(dezenas.length >= 6, `a tabela precisa manter os casos de dezena, tem ${dezenas.length}`);
    assert.ok(ORDEM.length >= 13, `a tabela encolheu para ${ORDEM.length} casos`);
  });
});

void describe('valor que nao se entende devolve `undefined`, e nao lanca', () => {
  for (const caso of NAO_E_VERSAO) {
    void it(`"${caso.bruta}" nao e versao (${caso.porque})`, () => {
      assert.equal(lerVersao(caso.bruta), undefined);
      assert.equal(compararVersoes(caso.bruta, '1.4.0'), undefined);
      assert.equal(compararVersoes('1.4.0', caso.bruta), undefined);
    });
  }

  void it('nulo e indefinido tambem, e por isso a politica vazia nao bloqueia', () => {
    assert.equal(lerVersao(null), undefined);
    assert.equal(lerVersao(undefined), undefined);
    assert.equal(compararVersoes(null, '1.4.0'), undefined);
    assert.equal(compararVersoes('1.4.0', undefined), undefined);
  });

  void it('`lerVersao` devolve os tres numeros quando entende', () => {
    assert.deepEqual(lerVersao('1.10.2'), { maior: 1, menor: 10, correcao: 2 });
    assert.deepEqual(lerVersao('0.0.0'), { maior: 0, menor: 0, correcao: 0 });
  });
});
