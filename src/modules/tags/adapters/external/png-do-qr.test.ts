/** ISCA 1: o PNG do QR decodifica de volta para o código certo. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as jsqrModulo from 'jsqr';
import sharp from 'sharp';

import type { AbsoluteUrl, TagCodeCanonical } from '../../../../shared/types/brands.js';
import {
  MODULOS_DE_MARGEM,
  PIXELS_POR_MODULO,
  desenharQr,
  type DesenhoDoQr,
} from '../../domain/qr-da-tag.js';
import { formaImpressaDoCodigo, normalizarCodigoDaTag } from '../../domain/tag-code.js';
import { urlDaTag } from '../../domain/qr-da-tag.js';
import { criarRasterizadorDeQr } from './sharp-rasterizador-de-qr.js';

/** O que se usa do decodificador: os pixels entram, o texto lido sai. */
type Decodificador = (
  pixels: Uint8ClampedArray,
  largura: number,
  altura: number,
) => { readonly data: string } | null;

/** `jsqr` é CommonJS e este projeto é ESM. */
const jsQR = (jsqrModulo as unknown as { default: Decodificador }).default;

/** A base da tag nos testes: o **tamanho** da base de produção, não o nome dela. */
const BASE_DA_TAG = 'https://tag.teste.inv' as AbsoluteUrl;
const CODIGO = normalizarCodigoDaTag('GQSM-0XHB-T4D9-G31S') as TagCodeCanonical;
const PET_ID = '018f3a2b-0000-7000-8000-0000000000cc';

const rasterizador = criarRasterizadorDeQr();

function png(conteudo: string): Promise<Buffer> {
  return rasterizador.paraPng(desenharQr(conteudo));
}

/**
 * Decodifica um PNG como um leitor de verdade faria: rasteriza para RGBA e entrega
 * os pixels ao decodificador.
 */
async function decodificar(arquivo: Buffer): Promise<string | undefined> {
  const { data, info } = await sharp(arquivo)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lido = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return lido === null ? undefined : lido.data;
}

/** O mesmo desenho com a margem de silêncio trocada. */
function desenharComMargem(conteudo: string, margem: number): DesenhoDoQr {
  const original = desenharQr(conteudo);
  const lado = original.medida.modulosDoSimbolo;
  const total = (lado + 2 * margem) * PIXELS_POR_MODULO;
  const pixels = new Uint8Array(total * total).fill(255);
  const deslocamentoOriginal = MODULOS_DE_MARGEM * PIXELS_POR_MODULO;
  const deslocamentoNovo = margem * PIXELS_POR_MODULO;
  const simbolo = lado * PIXELS_POR_MODULO;

  for (let y = 0; y < simbolo; y += 1) {
    for (let x = 0; x < simbolo; x += 1) {
      const origem = (y + deslocamentoOriginal) * original.ladoEmPixels + x + deslocamentoOriginal;
      pixels[(y + deslocamentoNovo) * total + x + deslocamentoNovo] = original.pixels[origem] ?? 255;
    }
  }

  return {
    pixels,
    ladoEmPixels: total,
    densidadeEmDpi: original.densidadeEmDpi,
    medida: original.medida,
  };
}

/** Põe o arquivo sobre fundo escuro, com folga em volta. */
async function sobreFundoEscuro(arquivo: Buffer): Promise<Buffer> {
  const { width } = await sharp(arquivo).metadata();
  const lado = (width ?? 0) + 80;
  return sharp({
    create: { width: lado, height: lado, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: arquivo, gravity: 'centre' }])
    .png()
    .toBuffer();
}

void describe('ISCA 1: o QR decodifica de volta para o código certo', () => {
  void it('o PNG gerado decodifica, por um leitor independente, para a URL da tag', async () => {
    const esperado = `${BASE_DA_TAG}/t/GQSM0XHBT4D9G31S`;
    assert.equal(esperado, urlDaTag(BASE_DA_TAG, CODIGO));

    const lido = await decodificar(await png(urlDaTag(BASE_DA_TAG, CODIGO)));

    assert.equal(
      lido,
      esperado,
      'O PNG não decodificou para a URL da tag. Uma plaquinha impressa a partir ' +
        'deste arquivo não resolveria, e o formato impresso é irreversível.',
    );
  });

  void it('o código extraído do que foi decodificado é o mesmo que entrou', async () => {
    const lido = await decodificar(await png(urlDaTag(BASE_DA_TAG, CODIGO)));

    assert.ok(lido !== undefined);
    const codigoLido = lido.slice(`${BASE_DA_TAG}/t/`.length);

    assert.equal(codigoLido, CODIGO, 'O código voltou diferente do que foi codificado.');
    assert.equal(normalizarCodigoDaTag(codigoLido), CODIGO);
  });

  void it('PROVA NEGATIVA: codificar a forma impressa em vez do canônico reprova aqui', async () => {
    const certo = urlDaTag(BASE_DA_TAG, CODIGO);
    const errado = `${BASE_DA_TAG}/t/${formaImpressaDoCodigo(CODIGO)}`;

    const lido = await decodificar(await png(errado));

    assert.notEqual(
      lido,
      certo,
      'A asserção da ISCA 1 não distingue o código canônico da forma impressa.',
    );
    assert.equal(lido, errado);
  });

  void it('PROVA NEGATIVA: sem a margem de silêncio, o símbolo encostado em tinta não é lido', async () => {
    const conteudo = urlDaTag(BASE_DA_TAG, CODIGO);

    const comMargem = await sobreFundoEscuro(
      await rasterizador.paraPng(desenharComMargem(conteudo, MODULOS_DE_MARGEM)),
    );
    const semMargem = await sobreFundoEscuro(
      await rasterizador.paraPng(desenharComMargem(conteudo, 0)),
    );

    assert.equal(
      await decodificar(comMargem),
      conteudo,
      'Com a margem de silêncio o símbolo precisa ser lido mesmo encostado em tinta.',
    );
    assert.equal(
      await decodificar(semMargem),
      undefined,
      'Sem a margem de silêncio o leitor ainda decodificou sobre fundo escuro. ' +
        'Então esta isca não está medindo a margem, e `MODULOS_DE_MARGEM` poderia ' +
        'ir a zero sem que nada acusasse — até a primeira impressão.',
    );
  });

  void it('PROVA NEGATIVA: corrupção além da correção Q quebra a decodificação', async () => {
    const arquivo = await png(urlDaTag(BASE_DA_TAG, CODIGO));
    const { data, info } = await sharp(arquivo)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const corrompido = Buffer.from(data);
    const altura = Math.floor(info.height * 0.4);
    const inicio = Math.floor((info.height - altura) / 2);
    for (let y = inicio; y < inicio + altura; y += 1) {
      corrompido.fill(0, y * info.width * 4, (y + 1) * info.width * 4);
    }

    const lido = jsQR(new Uint8ClampedArray(corrompido), info.width, info.height);
    assert.equal(
      lido === null ? undefined : lido.data,
      undefined,
      'O leitor decodificou uma imagem corrompida além da correção de erro. ' +
        'Então ele não está lendo os módulos, e a ISCA 1 estaria aprovando ' +
        'qualquer coisa.',
    );
  });
});

void describe('ISCA 2: nenhum identificador interno entra na URL codificada', () => {
  void it('o conteúdo do QR é exatamente a URL da tag, e nada mais', async () => {
    const lido = await decodificar(await png(urlDaTag(BASE_DA_TAG, CODIGO)));

    assert.equal(lido, `${BASE_DA_TAG}/t/${CODIGO}`);
  });

  void it('nenhum UUID sobrevive à decodificação', async () => {
    const lido = await decodificar(await png(urlDaTag(BASE_DA_TAG, CODIGO)));
    assert.ok(lido !== undefined);

    const formaDeUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.equal(
      formaDeUuid.test(lido),
      false,
      `O QR decodificou para '${lido}', que contém algo com forma de UUID.`,
    );
  });

  void it('PROVA NEGATIVA: com o pet na URL, a mesma conferência reprova', async () => {
    const lido = await decodificar(await png(`${BASE_DA_TAG}/t/${CODIGO}?pet=${PET_ID}`));
    assert.ok(lido !== undefined);

    const formaDeUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.equal(
      formaDeUuid.test(lido),
      true,
      'A conferência de UUID não acusou um UUID escrito na URL. Ela aprovaria o ' +
        'erro irreversível do ADR-0004 em silêncio.',
    );
  });
});

void describe('o arquivo, como ele chega à impressão', () => {
  void it('sai a 300 dpi, com a densidade gravada no próprio PNG', async () => {
    const meta = await sharp(await png(urlDaTag(BASE_DA_TAG, CODIGO))).metadata();

    assert.equal(meta.density, 300);
    assert.equal(meta.width, 328);
    assert.equal(meta.height, 328);
  });

  void it('PROVA NEGATIVA: um rasterizador que descarte a densidade reprova acima', async () => {
    const desenho = desenharQr(urlDaTag(BASE_DA_TAG, CODIGO));
    const semDensidade = await sharp(Buffer.from(desenho.pixels), {
      raw: { width: desenho.ladoEmPixels, height: desenho.ladoEmPixels, channels: 1 },
    })
      .png()
      .toBuffer();

    const meta = await sharp(semDensidade).metadata();
    assert.notEqual(
      meta.density,
      300,
      'Sem gravar a densidade o PNG ainda saiu com 300 dpi. Então o caso acima ' +
        'não está medindo nada.',
    );
    assert.equal(await decodificar(semDensidade), urlDaTag(BASE_DA_TAG, CODIGO));
  });
});
