/**
 * As iscas do detector de vazamento em resposta pública.
 *
 * Os testes das rotas públicas afirmam "zero achados". Essa afirmação só vale se
 * o detector ACUSA quando há o que acusar, e é isso que este arquivo prova: um
 * corpo que vaza de cada um dos quatro jeitos, e a exigência de que cada jeito
 * seja acusado. Se alguém afrouxar o detector, é aqui que reprova, e não em
 * produção com o telefone de alguém num cartaz.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  achadosDeVazamento,
  propriedadesDeclaradas,
  type ValorPlantado,
} from './vazamento-publico.js';

const PLANTADOS: readonly ValorPlantado[] = [
  { rotulo: 'e-mail do tutor', valor: 'tutor.privado@exemplo.com' },
  { rotulo: 'telefone do tutor', valor: '+55 11 98765-4321', porDigitos: true },
  { rotulo: 'endereço do tutor', valor: 'Rua das Acácias, 120' },
];

const DECLARADAS = new Set(['pet_display_name', 'area_label', 'nested']);

void describe('o detector de vazamento acusa cada um dos quatro jeitos de vazar', () => {
  void it('corpo limpo: zero achados', () => {
    const corpo = { pet_display_name: 'Thor', area_label: 'Pinheiros, São Paulo' };
    assert.deepEqual(achadosDeVazamento(corpo, { declaradas: DECLARADAS, plantados: PLANTADOS }), []);
  });

  void it('isca 1: propriedade que o contrato não declara', () => {
    const achados = achadosDeVazamento(
      { pet_display_name: 'Thor', tutor_nickname: 'Ana' },
      { declaradas: DECLARADAS, plantados: PLANTADOS },
    );
    assert.ok(achados.some((a) => a.onde === 'tutor_nickname'), JSON.stringify(achados));
  });

  void it('isca 2: nome proibido, mesmo aninhado dentro de propriedade declarada', () => {
    const achados = achadosDeVazamento(
      { nested: { owner_user_id: 'x', email: 'y' } },
      { declaradas: DECLARADAS, plantados: [] },
    );
    const onde = achados.map((a) => a.onde);
    assert.ok(onde.includes('nested.owner_user_id'), JSON.stringify(achados));
    assert.ok(onde.includes('nested.email'), JSON.stringify(achados));
  });

  void it('isca 3: valor plantado, dentro de texto livre e com outra grafia', () => {
    const corpo = {
      pet_display_name: 'Me liga: 11987654321',
      area_label: 'fica na rua das acácias, 120',
      nested: { texto: 'escreve para TUTOR.PRIVADO@exemplo.com' },
    };
    const motivos = achadosDeVazamento(corpo, { declaradas: DECLARADAS, plantados: PLANTADOS }).map(
      (a) => a.motivo,
    );
    assert.ok(motivos.includes('telefone do tutor apareceu na resposta'), motivos.join('; '));
    assert.ok(motivos.includes('endereço do tutor apareceu na resposta'), motivos.join('; '));
    assert.ok(motivos.includes('e-mail do tutor apareceu na resposta'), motivos.join('; '));
  });

  void it('isca 4: qualquer UUID, mesmo sem ter sido plantado', () => {
    const achados = achadosDeVazamento(
      { pet_display_name: 'Thor', area_label: '018f3a2b-0000-7000-8000-0000000000aa' },
      { declaradas: DECLARADAS, plantados: [] },
    );
    assert.ok(achados.some((a) => a.onde === 'area_label'), JSON.stringify(achados));
  });

  void it('telefone curto demais não vira critério: número de casa não é telefone', () => {
    const achados = achadosDeVazamento(
      { area_label: 'Quadra 104' },
      { plantados: [{ rotulo: 'número curto', valor: '104', porDigitos: true }] },
    );
    assert.deepEqual(achados, []);
  });
});

void describe('propriedades declaradas pelo schema de resposta', () => {
  void it('junta as propriedades de allOf', () => {
    const nomes = propriedadesDeclaradas({
      allOf: [{ properties: { a: {}, b: {} } }, { type: 'object', properties: { c: {} } }],
    });
    assert.deepEqual([...nomes].sort(), ['a', 'b', 'c']);
  });

  void it('schema sem propriedade reprova, em vez de aprovar qualquer corpo', () => {
    assert.throws(() => propriedadesDeclaradas({ type: 'object' }), /não declara propriedade nenhuma/);
  });
});
