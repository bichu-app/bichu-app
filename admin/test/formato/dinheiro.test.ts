import { describe, expect, it } from 'vitest';

import { CENTAVOS_MAXIMO, centavosDosDigitos, mascaraDeReais, reaisDeCentavos } from '../../src/formato/dinheiro.ts';
import { centavosParaCampo, centavosParaTexto, precoEmCentavos } from '../../src/loja/dominio.ts';
import { centavosDoTexto, textoDosCentavos } from '../../src/rede/dominio/valor.ts';

/**
 * ESCRITO E NAO RODADO (regra do cliente nesta tarefa: nada de suite). O que
 * cada bloco guarda esta dito em texto, para quem rodar saber o que uma
 * reprovacao significa.
 */

describe('mascara de reais: so o que a pessoa ve', () => {
  it.each([
    ['', ''],
    ['1', '1'],
    ['1234', '1.234'],
    ['1234567', '1.234.567'],
    ['89,90', '89,90'],
    ['189,9', '189,9'],
    ['1.234,56', '1.234,56'],
    ['0,05', '0,05'],
    ['0,01', '0,01'],
    ['007', '7'],
  ])('"%s" fica "%s"', (bruto, esperado) => {
    expect(mascaraDeReais(bruto)).toBe(esperado);
  });

  it('COLAR TEXTO COM "R$" DENTRO nao deixa lixo no campo', () => {
    // O caso que o cliente pediu por escrito. Tudo que nao e digito, virgula
    // ou ponto sai, e a gramatica brasileira fica.
    expect(mascaraDeReais('R$ 1.234,56')).toBe('1.234,56');
    expect(mascaraDeReais('R$74,90')).toBe('74,90');
    expect(mascaraDeReais('  R$ 89,90  ')).toBe('89,90');
    expect(mascaraDeReais('R$ 1 234,56')).toBe('1.234,56');
    expect(mascaraDeReais('1.234,56 (promo)')).toBe('1.234,56');
    expect(mascaraDeReais('preço: R$ 15')).toBe('15');
  });

  it('e IDEMPOTENTE: mascarar duas vezes da o mesmo texto', () => {
    // Importa porque a mascara roda a cada tecla sobre o proprio resultado.
    for (const bruto of ['', '1', 'R$ 1.234,56', '0,05', '189,9', '12,', '1.000', '189.90']) {
      expect(mascaraDeReais(mascaraDeReais(bruto)), bruto).toBe(mascaraDeReais(bruto));
    }
  });

  it('ponto: decimal so quando sobram 1 ou 2 digitos no fim', () => {
    expect(mascaraDeReais('189.90')).toBe('189,90');
    expect(mascaraDeReais('15.5')).toBe('15,5');
    expect(mascaraDeReais('1.000')).toBe('1.000');
    expect(mascaraDeReais('1.234.567')).toBe('1.234.567');
  });

  it('virgula no fim sobrevive: e estado de quem esta digitando', () => {
    expect(mascaraDeReais('12,')).toBe('12,');
    expect(mascaraDeReais(',')).toBe('0,');
  });

  it('decimal e cortado em dois digitos, sem arredondar', () => {
    expect(mascaraDeReais('10,999')).toBe('10,99');
  });

  it('ISCA: nao completa centavos — "30" continua "30"', () => {
    // Se a mascara virasse uma mascara de centavos (digitar da direita para a
    // esquerda), o campo do encontro abriria com "0,30" sobre um valor de
    // R$ 30,00, e `textoDosCentavos` -> campo -> `centavosDoTexto` passaria a
    // devolver 30 centavos em vez de 3000. Preco corrompido em silencio.
    expect(mascaraDeReais('30')).toBe('30');
    expect(mascaraDeReais(textoDosCentavos(3000))).toBe('30');
  });
});

describe('o que vai para a API continua sendo CENTAVOS INTEIROS', () => {
  const casos: [string, number][] = [
    ['0,01', 1],
    ['9.999,99', 999999],
    ['89,90', 8990],
    ['1.000.000,00', CENTAVOS_MAXIMO],
  ];

  it.each(casos)('Loja: campo "%s" -> %i centavos, inteiro', (texto, centavos) => {
    const amount = precoEmCentavos(mascaraDeReais(texto));
    expect(amount).toBe(centavos);
    expect(Number.isInteger(amount)).toBe(true);
  });

  it.each(casos)('Rede: campo "%s" -> %i centavos, inteiro', (texto, centavos) => {
    const amount = centavosDoTexto(mascaraDeReais(texto));
    expect(amount).toBe(centavos);
    expect(Number.isInteger(amount)).toBe(true);
  });

  it('ZERO nao e preco, nos dois lados (o contrato pede >= 1)', () => {
    for (const zero of ['0', '0,00', '', '0,0']) {
      expect(precoEmCentavos(mascaraDeReais(zero)), zero).toBeUndefined();
      expect(centavosDoTexto(mascaraDeReais(zero)), zero).toBeNull();
    }
  });

  it('999999 centavos: o valor exato, e nao 999998 nem 1000000', () => {
    expect(precoEmCentavos('9.999,99')).toBe(999999);
    expect(centavosDoTexto('9.999,99')).toBe(999999);
  });

  it('acima do teto do contrato nao passa', () => {
    expect(precoEmCentavos('1.000.000,01')).toBeUndefined();
    expect(centavosDoTexto('1.000.000,01')).toBeNull();
  });

  it('COLAR "R$" e enviar: a Loja le, e o que sai e inteiro', () => {
    expect(precoEmCentavos(mascaraDeReais('R$ 1.234,56'))).toBe(123456);
  });

  it('ISCA: colar "R$" na Rede so funciona porque a MASCARA tirou o "R$"', () => {
    // `centavosDoTexto` recusa `R$ 15` de proposito, e continua recusando.
    // Quem resolve o colar e a mascara, antes de o leitor ver o texto -- e e
    // por isso que o `R$` nao pode entrar no valor do campo.
    expect(centavosDoTexto('R$ 15')).toBeNull();
    expect(centavosDoTexto(mascaraDeReais('R$ 15'))).toBe(1500);
  });

  it('ida e volta: centavos -> campo -> centavos nao perde nem ganha um centavo', () => {
    for (const centavos of [1, 5, 29, 115, 435, 8990, 999999, 100000, CENTAVOS_MAXIMO]) {
      expect(precoEmCentavos(mascaraDeReais(centavosParaCampo(centavos))), String(centavos)).toBe(centavos);
      expect(centavosDoTexto(mascaraDeReais(textoDosCentavos(centavos))), String(centavos)).toBe(centavos);
    }
  });
});

describe('uma aritmetica so, e a forma brasileira', () => {
  it('centavosDosDigitos completa o decimal a DIREITA', () => {
    expect(centavosDosDigitos('15', '5')).toBe(1550);
    expect(centavosDosDigitos('15', '50')).toBe(1550);
    expect(centavosDosDigitos('15', '')).toBe(1500);
    expect(centavosDosDigitos('0', '01')).toBe(1);
  });

  it('centavosDosDigitos recusa fora da faixa do contrato', () => {
    expect(centavosDosDigitos('0', '')).toBeNull();
    expect(centavosDosDigitos('0', '00')).toBeNull();
    expect(centavosDosDigitos('1000000', '01')).toBeNull();
  });

  it('ISCA: virgula decimal e ponto de milhar, nunca o contrario', () => {
    // `R$ 1,249.90` e mil vezes menos para quem le rapido.
    expect(reaisDeCentavos(124990)).toBe('1.249,90');
    expect(reaisDeCentavos(124990)).not.toBe('1,249.90');
    expect(centavosParaTexto(123456)).toBe('R$ 1.234,56');
  });

  it('Loja escreve sempre dois digitos de centavo; Rede nao escreve ",00"', () => {
    expect(reaisDeCentavos(10000)).toBe('100,00');
    expect(reaisDeCentavos(10000, { centavosRedondos: false })).toBe('100');
    expect(textoDosCentavos(1500)).toBe('15');
    expect(textoDosCentavos(1550)).toBe('15,50');
    expect(textoDosCentavos(125000)).toBe('1.250');
    expect(centavosParaCampo(18990)).toBe('189,90');
    expect(centavosParaCampo(5)).toBe('0,05');
    expect(centavosParaCampo(CENTAVOS_MAXIMO)).toBe('1.000.000,00');
  });
});
