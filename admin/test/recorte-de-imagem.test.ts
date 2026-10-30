/**
 * A GEOMETRIA DO RECORTE (BICHUS-314).
 *
 * ## O que cada isca prova, e o que desligar para ela reprovar
 *
 * | isca | o que desligar |
 * |---|---|
 * | a moldura 1:1 sobre um retrato devolve um QUADRADO | trocar `alvo / daImagem` por `daImagem / alvo` |
 * | a moldura sai da geometria da derivada, propósito a propósito | mudar `PROPORCAO_DA_MOLDURA` |
 * | a Loja nasce com a imagem inteira (o servidor não corta esse propósito) | pôr uma proporção fixa em `store_item` |
 * | o zoom estreita a região, e a proporção não muda | dividir só um dos lados pela escala |
 * | região que estoura a borda é PRESA, e não recusada | tirar o `preso` de `x`/`y` |
 * | o envio nunca AMPLIA e nunca passa de 2048 px | tirar o `Math.min(1, ...)` de `tamanhoDoEnvio` |
 * | PNG sai PNG (ou WebP), nunca JPEG | devolver `['image/jpeg']` em `formatosDeSaida` |
 *
 * **A isca da moldura 1:1 é a que pega o engano que não dá erro.** Trocar os
 * eixos devolve `w = 1, h = 1` e entrega a imagem inteira achatada dentro de um
 * quadrado: um recorte plausível do lugar errado, sem erro e sem log. Foi o que
 * o protótipo mostrou na primeira execução.
 */
import { describe, expect, it } from 'vitest';

import { DIMENSAO_MINIMA, type Proposito } from '../src/componentes/envio-de-imagem.ts';
import {
  ENQUADRAMENTO_INICIAL,
  formatosDeSaida,
  janelaEmPixels,
  LADO_MAXIMO_DO_ENVIO,
  PROPORCAO_DA_MOLDURA,
  regiaoEnquadrada,
  tamanhoDoEnvio,
} from '../src/componentes/recorte-de-imagem.ts';

/** Um retrato de celular: é a foto que a heurística do servidor decapita. */
const RETRATO = { largura: 1600, altura: 2000 };

function emPixeis(imagem: { largura: number; altura: number }, proporcao: number | null, enquadramento = ENQUADRAMENTO_INICIAL) {
  return janelaEmPixels(regiaoEnquadrada(imagem, proporcao, enquadramento), imagem.largura, imagem.altura);
}

describe('a moldura, por propósito', () => {
  it('1:1 sobre um retrato devolve um QUADRADO, e não a imagem inteira', () => {
    const janela = emPixeis(RETRATO, PROPORCAO_DA_MOLDURA.directory_logo);
    expect(janela).toEqual({ left: 0, top: 200, width: 1600, height: 1600 });
    // O engano dos eixos trocados devolveria a imagem inteira, 1600 x 2000.
    expect(janela.height).not.toBe(RETRATO.altura);
  });

  it('16:9 sobre um quadrado devolve uma faixa deitada centrada', () => {
    expect(emPixeis({ largura: 1000, altura: 1000 }, PROPORCAO_DA_MOLDURA.directory_photo)).toEqual({
      left: 0,
      top: 219,
      width: 1000,
      height: 563,
    });
  });

  it('16:9 sobre uma foto MAIS deitada que 16:9 corta pelos lados, e não por cima', () => {
    expect(emPixeis({ largura: 4000, altura: 1000 }, PROPORCAO_DA_MOLDURA.network_event)).toEqual({
      left: 1111,
      top: 0,
      width: 1778,
      height: 1000,
    });
  });

  it('a Loja nasce com a imagem INTEIRA: o servidor não corta esse propósito', () => {
    expect(PROPORCAO_DA_MOLDURA.store_item).toBeNull();
    expect(emPixeis(RETRATO, PROPORCAO_DA_MOLDURA.store_item)).toEqual({ left: 0, top: 0, width: 1600, height: 2000 });
  });

  it('cada propósito do contrato tem moldura e mínima declaradas', () => {
    const propositos = Object.keys(DIMENSAO_MINIMA) as Proposito[];
    expect(propositos.length).toBeGreaterThan(0);
    expect(Object.keys(PROPORCAO_DA_MOLDURA).sort()).toEqual([...propositos].sort());
    // As quatro superfícies que o servidor CORTA têm proporção; só a Loja é livre.
    expect(propositos.filter((p) => PROPORCAO_DA_MOLDURA[p] === null)).toEqual(['store_item']);
  });
});

describe('zoom e posição', () => {
  it('o zoom estreita a região pela escala, nos dois lados, e a proporção não muda', () => {
    const um = emPixeis(RETRATO, 1);
    const dois = emPixeis(RETRATO, 1, { ...ENQUADRAMENTO_INICIAL, escala: 2 });
    expect(dois.width).toBe(Math.round(um.width / 2));
    expect(dois.height).toBe(Math.round(um.height / 2));
    expect(dois.width).toBe(dois.height);
  });

  it('a posição escolhida é a que sai: mover o centro para cima sobe a janela', () => {
    const centrada = emPixeis(RETRATO, 1);
    const acima = emPixeis(RETRATO, 1, { ...ENQUADRAMENTO_INICIAL, centroY: 0.4 });
    expect(acima.top).toBeLessThan(centrada.top);
    expect(acima.top).toBe(0);
  });

  it('região que estoura a borda é PRESA dentro da imagem, e não recusada', () => {
    for (const centro of [
      { centroX: -5, centroY: -5 },
      { centroX: 9, centroY: 9 },
    ]) {
      const janela = emPixeis(RETRATO, 1, { ...ENQUADRAMENTO_INICIAL, ...centro });
      expect(janela.left).toBeGreaterThanOrEqual(0);
      expect(janela.top).toBeGreaterThanOrEqual(0);
      expect(janela.left + janela.width).toBeLessThanOrEqual(RETRATO.largura);
      expect(janela.top + janela.height).toBeLessThanOrEqual(RETRATO.altura);
    }
  });

  it('a escala é presa na faixa: 0,1 não devolve região maior do que a imagem', () => {
    const janela = emPixeis(RETRATO, 1, { ...ENQUADRAMENTO_INICIAL, escala: 0.1 });
    expect(janela.width).toBeLessThanOrEqual(RETRATO.largura);
    expect(janela.height).toBeLessThanOrEqual(RETRATO.altura);
  });
});

describe('o tamanho do envio', () => {
  it('nunca AMPLIA: um recorte pequeno sai do tamanho que tem', () => {
    expect(tamanhoDoEnvio({ left: 0, top: 0, width: 640, height: 360 })).toEqual({ largura: 640, altura: 360 });
  });

  it('o lado maior é limitado a 2048, e a proporção é preservada', () => {
    const { largura, altura } = tamanhoDoEnvio({ left: 0, top: 0, width: 4000, height: 2250 });
    expect(largura).toBe(LADO_MAXIMO_DO_ENVIO);
    expect(altura).toBe(1152);
  });

  it('o limite cobre a maior derivada do servidor (banner 1280 x 720)', () => {
    expect(LADO_MAXIMO_DO_ENVIO).toBeGreaterThanOrEqual(1280);
  });
});

describe('o formato de saída', () => {
  it('PNG sai PNG, e cai em WebP quando não couber — nunca em JPEG, que perde o alfa', () => {
    expect(formatosDeSaida('image/png')).toEqual(['image/png', 'image/webp']);
  });

  it('JPEG e WebP saem no formato em que entraram', () => {
    expect(formatosDeSaida('image/jpeg')).toEqual(['image/jpeg']);
    expect(formatosDeSaida('image/webp')).toEqual(['image/webp']);
  });
});
