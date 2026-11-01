import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AbsoluteUrl, TagCodeCanonical } from '../../../shared/types/brands.js';
import {
  LARGURA_UTIL_DA_PLAQUINHA_EM_MM,
  MODULOS_DE_MARGEM,
  MODULO_MINIMO_EM_MM,
  PIXELS_POR_MODULO,
  RESOLUCAO_EM_DPI,
  desenharQr,
  medidaImpressa,
  urlDaTag,
} from './qr-da-tag.js';
import { formaImpressaDoCodigo, normalizarCodigoDaTag } from './tag-code.js';

const COMPRIMENTO_DA_BASE_DE_PRODUCAO = 21;
const BASE_DA_TAG = 'https://tag.teste.inv' as AbsoluteUrl;

const CODIGO = normalizarCodigoDaTag('GQSM-0XHB-T4D9-G31S') as TagCodeCanonical;

void describe('urlDaTag: uma função só para o QR e para o texto legível', () => {
  void it('monta `{base}/t/{código canônico}`, sem os hífens da forma impressa', () => {
    const url = urlDaTag(BASE_DA_TAG, CODIGO);

    assert.equal(url, `${BASE_DA_TAG}/t/${CODIGO}`);
    assert.equal(url.includes(formaImpressaDoCodigo(CODIGO)), false);
    assert.equal(url.endsWith(CODIGO), true);
  });

  void it('não há espaço por onde um identificador interno entrar', () => {
    const formaDeUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.equal(formaDeUuid.test(urlDaTag(BASE_DA_TAG, CODIGO)), false);
  });
});

void describe('a medida impressa, contra a plaquinha da BICHUS-103', () => {
  void it('a base desta bancada tem o comprimento da base de produção', () => {
    assert.equal(BASE_DA_TAG.length, COMPRIMENTO_DA_BASE_DE_PRODUCAO);
  });

  void it('com 16 caracteres o símbolo cabe nos 44 mm úteis, e a medida fica escrita', () => {
    const medida = medidaImpressa(urlDaTag(BASE_DA_TAG, CODIGO));

    assert.equal(medida.bytesDoPayload, 40);
    assert.equal(medida.versao, 4);
    assert.equal(medida.modulosDoSimbolo, 33);
    assert.equal(medida.modulosComMargem, 33 + 2 * MODULOS_DE_MARGEM);
    assert.equal(medida.ladoEmPixels, 41 * PIXELS_POR_MODULO);

    assert.equal(medida.ladoEmMilimetros.toFixed(2), '27.77');
    assert.equal(medida.moduloEmMilimetros.toFixed(3), '0.677');
    assert.ok(
      medida.ladoEmMilimetros < LARGURA_UTIL_DA_PLAQUINHA_EM_MM,
      `O QR mede ${medida.ladoEmMilimetros.toFixed(2)} mm e não cabe nos ` +
        `${String(LARGURA_UTIL_DA_PLAQUINHA_EM_MM)} mm úteis.`,
    );
    assert.ok(medida.moduloEmMilimetros > MODULO_MINIMO_EM_MM);
  });

  void it('sobra largura para o que mais for impresso ao lado do QR', () => {
    const medida = medidaImpressa(urlDaTag(BASE_DA_TAG, CODIGO));
    const sobra = LARGURA_UTIL_DA_PLAQUINHA_EM_MM - medida.ladoEmMilimetros;

    assert.equal(sobra.toFixed(2), '16.23');
  });

  void it('PROVA NEGATIVA: uma base longa demais recusa o desenho em vez de produzi-lo', () => {
    const baseLonga = `https://${'t'.repeat(180)}.exemplo.invalid` as AbsoluteUrl;

    assert.throws(
      () => desenharQr(urlDaTag(baseLonga, CODIGO)),
      /44 mm úteis/u,
      'Uma base que estoura a plaquinha precisa recusar, e não produzir um ' +
        'desenho que sai cortado da impressão.',
    );
  });

  void it('PROVA NEGATIVA: a mesma base longa é medível — quem reprova é a guarda', () => {
    const baseLonga = `https://${'t'.repeat(180)}.exemplo.invalid` as AbsoluteUrl;
    const medida = medidaImpressa(urlDaTag(baseLonga, CODIGO));

    assert.ok(medida.versao > 4);
    assert.ok(medida.ladoEmMilimetros > LARGURA_UTIL_DA_PLAQUINHA_EM_MM);
  });
});

void describe('desenharQr: o mapa de pixels que atravessa a porta', () => {
  void it('tem o lado da medida, a densidade de impressão e dois valores só', () => {
    const desenho = desenharQr(urlDaTag(BASE_DA_TAG, CODIGO));

    assert.equal(desenho.ladoEmPixels, desenho.medida.ladoEmPixels);
    assert.equal(desenho.pixels.length, desenho.ladoEmPixels ** 2);
    assert.equal(desenho.densidadeEmDpi, RESOLUCAO_EM_DPI);

    assert.deepEqual([...new Set(desenho.pixels)].sort((a, b) => a - b), [0, 255]);
  });

  void it('a margem de silêncio está pintada de claro, nas quatro bordas', () => {
    const desenho = desenharQr(urlDaTag(BASE_DA_TAG, CODIGO));
    const lado = desenho.ladoEmPixels;
    const margem = MODULOS_DE_MARGEM * PIXELS_POR_MODULO;

    const claro = (x: number, y: number): boolean => desenho.pixels[y * lado + x] === 255;

    for (let i = 0; i < lado; i += 1) {
      for (let d = 0; d < margem; d += 1) {
        assert.ok(claro(i, d), `topo escuro em (${String(i)}, ${String(d)})`);
        assert.ok(claro(i, lado - 1 - d), `base escura em (${String(i)}, ${String(d)})`);
        assert.ok(claro(d, i), `esquerda escura em (${String(d)}, ${String(i)})`);
        assert.ok(claro(lado - 1 - d, i), `direita escura em (${String(d)}, ${String(i)})`);
      }
    }
  });

  void it('cada módulo escuro é um bloco inteiro, e não um pixel solto', () => {
    const desenho = desenharQr(urlDaTag(BASE_DA_TAG, CODIGO));
    const lado = desenho.ladoEmPixels;

    const inicio = MODULOS_DE_MARGEM * PIXELS_POR_MODULO;
    for (let dy = 0; dy < PIXELS_POR_MODULO; dy += 1) {
      for (let dx = 0; dx < PIXELS_POR_MODULO; dx += 1) {
        assert.equal(desenho.pixels[(inicio + dy) * lado + inicio + dx], 0);
      }
    }
    assert.equal(desenho.pixels[(inicio - 1) * lado + inicio - 1], 255);
  });
});
