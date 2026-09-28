import { describe, expect, it } from 'vitest';

import { CATEGORIAS, centavosParaCampo, centavosParaTexto, ESPECIES, precoEmCentavos, slugSugerido } from '../src/loja/dominio.ts';
import { corpoDeAlteracao, corpoDeCriacao, errosDoServidor, validarProduto, VALORES_VAZIOS } from '../src/loja/formulario-do-produto.ts';

describe('preco de referencia em centavos (AdminPriceInput.amount)', () => {
  it.each([
    ['89,90', 8990],
    ['189,9', 18990],
    ['1.234,56', 123456],
    ['R$ 74,90', 7490],
    ['59', 5900],
    ['189.90', 18990],
    ['1.000', 100000],
    ['0,01', 1],
  ])('"%s" vira %i centavos, inteiro', (texto, centavos) => {
    const r = precoEmCentavos(texto);
    expect(r).toBe(centavos);
    expect(Number.isInteger(r)).toBe(true);
  });

  it.each(['', 'abc', '0', '0,00', '10,999', '12,3,4', '-5', '1.23.4', '1000000,01'])('"%s" nao e preco', (texto) => {
    expect(precoEmCentavos(texto)).toBeUndefined();
  });

  it('nao passa por ponto flutuante: 0,29 e 1,15 dao o inteiro exato', () => {
    expect(precoEmCentavos('0,29')).toBe(29);
    expect(precoEmCentavos('1,15')).toBe(115);
    expect(precoEmCentavos('4,35')).toBe(435);
  });

  it('volta para o campo e para a tabela', () => {
    expect(centavosParaCampo(18990)).toBe('189,90');
    expect(centavosParaCampo(5)).toBe('0,05');
    expect(centavosParaTexto(123456)).toBe('R$ 1.234,56');
  });
});

describe('rotulos do contrato', () => {
  it('categoria e especie usam os seis e os tres codigos do contrato, com os rotulos do app', () => {
    expect(Object.keys(CATEGORIAS)).toEqual(['food', 'toy', 'hygiene', 'accessory', 'health', 'bed']);
    expect(Object.values(CATEGORIAS)).toEqual(['Alimentação', 'Brinquedo', 'Higiene', 'Acessório', 'Saúde', 'Cama e conforto']);
    expect(ESPECIES).toEqual({ dog: 'Cão', cat: 'Gato', other: 'Outros animais' });
  });

  it('identificador sugerido cabe no formato de Slug', () => {
    expect(slugSugerido('Pet Center Aurora')).toBe('pet-center-aurora');
    expect(slugSugerido('Empório Focinho & Cia')).toBe('emporio-focinho-cia');
    expect(slugSugerido('x'.repeat(40)).length).toBe(30);
  });
});

describe('formulario de produto', () => {
  const validos = {
    ...VALORES_VAZIOS,
    titulo: 'Ração seca 15 kg',
    resumo: 'Para cães adultos.',
    categoria: 'food' as const,
    especies: ['dog' as const],
    parceiro: 'pet-center-aurora',
    link: 'https://www.petcenteraurora.com.br/racao',
    preco: '189,90',
    consultadoEm: '2026-09-15',
  };

  it('monta o corpo com o preco em centavos e sem slug', () => {
    const corpo = corpoDeCriacao(validos);
    expect(corpo.price).toEqual({ amount: 18990, currency: 'BRL', checked_at: '2026-09-15' });
    expect('slug' in corpo).toBe(false);
    expect(corpoDeAlteracao({ ...validos, preco: '', consultadoEm: '' }).price).toBeNull();
  });

  it('as mensagens da UX 29.4 e 29.10', () => {
    expect(validarProduto(VALORES_VAZIOS, { hoje: '2026-09-28' })).toEqual({
      'f-nome': 'Informe o nome do produto.',
      'f-desc': 'Escreva uma descrição.',
      'f-categoria': 'Escolha a categoria.',
      'f-especies': 'Marque pelo menos um animal.',
      'f-parceiro': 'Informe o parceiro ou a loja.',
      'f-link': 'O link precisa começar com https://.',
    });
    const hoje = { hostDoParceiro: 'petcenteraurora.com.br', hoje: '2026-09-28' };
    expect(validarProduto(validos, hoje)).toEqual({});
    expect(validarProduto({ ...validos, preco: '74,90,0' }, hoje)['f-preco']).toBe('Informe o preço em reais, por exemplo 89,90.');
    expect(validarProduto({ ...validos, consultadoEm: '' }, hoje)['f-data']).toBe('Com preço, informe também a data da consulta.');
    expect(validarProduto({ ...validos, consultadoEm: '2026-09-29' }, hoje)['f-data']).toBe('A data da consulta não pode ser depois de hoje.');
    expect(validarProduto({ ...validos, link: 'http://petcenteraurora.com.br/x' }, hoje)['f-link']).toBe('O link precisa começar com https://.');
    expect(validarProduto({ ...validos, link: 'https://outraloja.com.br/x' }, hoje)['f-link']).toBe('O link precisa ser do site do parceiro escolhido.');
    // Host parecido nao e o do parceiro.
    expect(validarProduto({ ...validos, link: 'https://falsopetcenteraurora.com.br/x' }, hoje)['f-link']).toBeDefined();
  });

  it('traduz o validation-failed do servidor pelo codigo, nunca pelo texto', () => {
    expect(
      errosDoServidor([
        { field: 'target_url', code: 'host_mismatch' },
        { field: 'price.checked_at', code: 'future' },
        { field: 'tag_slugs[1]', code: 'unknown_tag' },
      ]),
    ).toEqual({
      'f-link': 'O link precisa ser do site do parceiro escolhido.',
      'f-data': 'A data da consulta não pode ser depois de hoje.',
      'f-tags': 'Uma das tags escolhidas não existe mais. Tire-a e salve de novo.',
    });
  });
});
