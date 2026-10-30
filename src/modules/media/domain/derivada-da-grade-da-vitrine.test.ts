/** ISCA (c): A GRADE DA VITRINE USA A DERIVADA DE 320 px, E NUNCA OUTRA. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DERIVADAS_DA_FOTO_DE_USUARIO,
  DERIVADAS_DA_VITRINE_DO_USUARIO,
  ESCADA_ENXUTA,
  ESCADA_DA_FAIXA,
  escadaDo,
} from './derivadas.js';

/** A célula da grade, medida na tela, e a densidade do pior caso comum. */
const CELULA_EM_DP = 104;
const DENSIDADE = 3;
const PIXEIS_REAIS_DA_CELULA = CELULA_EM_DP * DENSIDADE;

const daGrade = DERIVADAS_DA_VITRINE_DO_USUARIO.find((d) => d.variante === 'thumb');
const aberta = DERIVADAS_DA_VITRINE_DO_USUARIO.find((d) => d.variante === 'card');

void describe('a derivada da grade da vitrine', () => {
  void it('EXISTE, e é a `thumb` da vitrine', () => {
    assert.ok(daGrade, 'sem ela a grade cairia na `card`, que é 1,6x dado demais, nove vezes');
  });

  void it('COBRE os 312 px reais da célula SEM AMPLIAR', () => {
    assert.ok(
      (daGrade?.largura ?? 0) >= PIXEIS_REAIS_DA_CELULA,
      `a célula pinta ${String(PIXEIS_REAIS_DA_CELULA)} px reais; derivada menor é ampliação, e ampliar não acrescenta informação`,
    );
  });

  void it('NÃO DESPERDIÇA: fica abaixo de 1,25x o que a célula pinta', () => {
    const desperdicio = (daGrade?.largura ?? 0) / PIXEIS_REAIS_DA_CELULA;
    assert.ok(
      desperdicio < 1.25,
      `a derivada da grade está ${desperdicio.toFixed(2)}x a célula. A \`card\` de 512 já era 1,64x, e é por isso que esta existe`,
    );
  });

  void it('ISCA -- NÃO é a `thumb` de 176 px da foto única (seria ampliada 1,8x)', () => {
    const thumbDaFotoUnica = DERIVADAS_DA_FOTO_DE_USUARIO.find((d) => d.variante === 'thumb');
    assert.equal(thumbDaFotoUnica?.largura, 176, 'a premissa deste caso: a foto única tem thumb de 176');
    assert.notEqual(
      daGrade?.largura,
      thumbDaFotoUnica?.largura,
      'reusar a thumb de 176 para uma célula de 312 px é ampliar 1,8x',
    );
  });

  void it('ISCA -- NÃO é a `card` de 512 px da foto única (1,6x dado demais)', () => {
    const cardDaFotoUnica = DERIVADAS_DA_FOTO_DE_USUARIO.find((d) => d.variante === 'card');
    assert.equal(cardDaFotoUnica?.largura, 512, 'a premissa: a foto única tem card de 512');
    assert.ok(
      (daGrade?.largura ?? 0) < (cardDaFotoUnica?.largura ?? 0),
      'a derivada da grade tem de ser MENOR que a card da foto única, ou ela não existe por motivo nenhum',
    );
  });

  void it('é QUADRADA e CORTA: a grade é 1:1, e retrato sem corte deixaria faixa vazia', () => {
    assert.equal(daGrade?.altura, daGrade?.largura, '`altura` presente = fit cover, na proporção 1:1');
  });

  void it('usa a ESCADA ENXUTA: o que importa é o peso da TELA, não o do arquivo', () => {
    assert.equal(daGrade?.porte, 'enxuta');
    assert.equal(escadaDo('enxuta'), ESCADA_ENXUTA);
  });

  void it('CONTRAPESO -- a `card` de 1024 continua existindo, e continua `grande`', () => {
    assert.equal(aberta?.largura, 1024, 'é ela que sai na foto ABERTA, a única que a pessoa olha grande');
    assert.equal(aberta?.altura, 1024);
    assert.equal(aberta?.porte, 'grande', 'só a imagem olhada grande mira a faixa de 300 a 500 KB');
    assert.equal(escadaDo('grande'), ESCADA_DA_FAIXA);
  });

  void it('A GRADE É MAIS LEVE QUE A ABERTA -- a conta que justifica as duas', () => {
    const areaDaGrade = (daGrade?.largura ?? 0) * (daGrade?.altura ?? 0);
    const areaDaAberta = (aberta?.largura ?? 0) * (aberta?.altura ?? 0);
    assert.ok(
      areaDaGrade * 9 < areaDaAberta,
      'NOVE células da grade precisam custar menos que UMA foto aberta; se não, a grade não vale uma derivada própria',
    );
  });
});
