/**
 * O processamento da imagem de catalogo, sem armazenamento nem banco.
 *
 * Iscas: a dimensao minima por proposito (800 x 800 no produto, 600 x 600 no
 * encontro desde 01/10; antes 1600 x 900) recusa com o numero no motivo; HEIC e recusado mesmo passando na
 * inspecao da foto do pet; objeto que nunca chegou e recusa final; e `ready`
 * so depois de a derivada estar no bucket publico.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ObjectKey } from '../../../shared/types/brands.js';
import type { DimensoesDaImagem, ImageProcessor } from '../ports/image-processor.js';
import type { ImagemParaProcessar, ImagensDeCatalogoDoWorker } from '../ports/imagem-de-catalogo.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import { processarImagemDeCatalogo } from './processar-imagem-de-catalogo.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';

function bancada(opcoes: {
  purpose: ImagemParaProcessar['purpose'];
  dimensoes: DimensoesDaImagem;
  semObjeto?: boolean;
}) {
  const eventos: string[] = [];
  const imagens: ImagensDeCatalogoDoWorker = {
    paraProcessar: (id) =>
      Promise.resolve({
        id,
        purpose: opcoes.purpose,
        status: 'processing',
        originalKey: comoObjectKey('catalog/original/KioqKioqKioqKioqKioqKg'),
      }),
    marcarPronta: (_id, chave) => {
      eventos.push(`pronta:${chave}`);
      return Promise.resolve();
    },
    marcarRecusada: (_id, motivo) => {
      eventos.push(`recusada:${motivo}`);
      return Promise.resolve();
    },
  };
  const armazenamento = {
    head: () => Promise.resolve(opcoes.semObjeto === true ? null : { contentLength: 10, contentType: undefined, etag: undefined }),
    get: () => Promise.resolve(Buffer.from('x')),
    put: (_c: string, chave: ObjectKey) => {
      eventos.push(`put:${chave}`);
      return Promise.resolve();
    },
  } as unknown as ObjectStorage;
  const processador: ImageProcessor = {
    inspecionar: () => Promise.resolve(opcoes.dimensoes),
    derivar: () =>
      Promise.resolve({ bytes: Buffer.from('y'), contentType: 'image/webp', extensao: 'webp', largura: 1024, altura: 1024 }),
  };
  const ids = {
    uuidv7: () => 'id',
    random128: () => new Uint8Array(16).fill(7),
    random80: () => new Uint8Array(10),
    opaqueToken: () => {
      throw new Error('nao usado');
    },
  };
  return { deps: { imagens, armazenamento, processador, ids }, eventos };
}

const dim = (largura: number, altura: number, formato: DimensoesDaImagem['formato'] = 'jpeg'): DimensoesDaImagem => ({
  formato,
  largura,
  altura,
  megapixels: (largura * altura) / 1e6,
});

void describe('processamento da imagem de catalogo', () => {
  void it('ISCA: produto com 799 px e recusado, com o numero no motivo; 800 x 800 passa', async () => {
    const pequena = bancada({ purpose: 'store_item', dimensoes: dim(799, 1000) });
    const r = await processarImagemDeCatalogo(pequena.deps, { catalog_image_id: 'c1' });
    assert.equal(r.tipo, 'recusada');
    assert.deepEqual(pequena.eventos, ['recusada:A imagem precisa ter pelo menos 800 x 800 pixels.']);

    const certa = bancada({ purpose: 'store_item', dimensoes: dim(800, 800) });
    assert.equal((await processarImagemDeCatalogo(certa.deps, { catalog_image_id: 'c2' })).tipo, 'pronta');
  });

  void it('ISCA: encontro com 600 x 599 ou 599 x 600 e recusado, com o numero no motivo; 600 x 600 passa', async () => {
    for (const [largura, altura] of [
      [600, 599],
      [599, 600],
    ] as const) {
      const capa = bancada({ purpose: 'network_event', dimensoes: dim(largura, altura) });
      assert.equal((await processarImagemDeCatalogo(capa.deps, { catalog_image_id: 'c3' })).tipo, 'recusada');
      assert.deepEqual(capa.eventos, ['recusada:A imagem precisa ter pelo menos 600 x 600 pixels.']);
    }
    const quadrada = bancada({ purpose: 'network_event', dimensoes: dim(600, 600) });
    assert.equal((await processarImagemDeCatalogo(quadrada.deps, { catalog_image_id: 'c3b' })).tipo, 'pronta');
  });

  void it('ISCA: o minimo antigo do encontro (1600 x 900) nao volta -- retrato de celular 720 x 1280 passa', async () => {
    const retrato = bancada({ purpose: 'network_event', dimensoes: dim(720, 1280) });
    assert.equal((await processarImagemDeCatalogo(retrato.deps, { catalog_image_id: 'c4' })).tipo, 'pronta');
  });

  void it('ISCA: o mesmo 700 x 700 serve ao encontro e nao ao produto', async () => {
    const capa = bancada({ purpose: 'network_event', dimensoes: dim(700, 700) });
    assert.equal((await processarImagemDeCatalogo(capa.deps, { catalog_image_id: 'c4b' })).tipo, 'pronta');
    const produto = bancada({ purpose: 'store_item', dimensoes: dim(700, 700) });
    assert.equal((await processarImagemDeCatalogo(produto.deps, { catalog_image_id: 'c4c' })).tipo, 'recusada');
  });

  void it('HEIC e recusado; objeto que nunca chegou e recusa final', async () => {
    const heic = bancada({ purpose: 'store_item', dimensoes: dim(2000, 2000, 'heic') });
    assert.equal((await processarImagemDeCatalogo(heic.deps, { catalog_image_id: 'c5' })).tipo, 'recusada');
    const sem = bancada({ purpose: 'store_item', dimensoes: dim(2000, 2000), semObjeto: true });
    assert.equal((await processarImagemDeCatalogo(sem.deps, { catalog_image_id: 'c6' })).tipo, 'recusada');
  });

  void it('ready so depois da derivada no bucket publico', async () => {
    const b = bancada({ purpose: 'store_item', dimensoes: dim(1200, 1200) });
    await processarImagemDeCatalogo(b.deps, { catalog_image_id: 'c7' });
    assert.equal(b.eventos.length, 2);
    assert.match(b.eventos[0] ?? '', /^put:card\//);
    assert.equal(b.eventos[1], `pronta:${(b.eventos[0] ?? '').slice(4)}`);
  });
});
