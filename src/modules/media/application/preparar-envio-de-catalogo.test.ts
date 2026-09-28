/**
 * A intencao de envio de imagem de catalogo (ADR-0027 item 10): SVG e tipo
 * fora da lista recusados, teto de 5 MiB, e a politica assinada no bucket
 * privado com a chave de 128 bits do catalogo.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import type { AbsoluteUrl, Instant } from '../../../shared/types/brands.js';
import { TETO_DE_BYTES_DO_CATALOGO } from '../ports/imagem-de-catalogo.js';
import type { ObjectStorage, PedidoDeEnvio } from '../ports/object-storage.js';
import { criarPreparadorDeEnvioDeCatalogo } from './preparar-envio-de-catalogo.js';

function montar() {
  const pedidos: PedidoDeEnvio[] = [];
  const armazenamento = {
    createUploadIntent: (p: PedidoDeEnvio) => {
      pedidos.push(p);
      return Promise.resolve({
        metodo: 'POST' as const,
        url: 'https://armazenamento.exemplo.invalid/envio' as AbsoluteUrl,
        campos: {},
        expiraEm: comoData(0 as Instant),
        maxBytes: p.maxBytes,
      });
    },
  } as unknown as ObjectStorage;
  const preparador = criarPreparadorDeEnvioDeCatalogo({
    armazenamento,
    ids: {
      uuidv7: () => '0192a3b4-0000-7000-8000-000000000001',
      random128: () => new Uint8Array(16).fill(1),
      random80: () => new Uint8Array(10),
      opaqueToken: () => {
        throw new Error('nao usado');
      },
    },
  });
  return { preparador, pedidos };
}

void describe('preparar envio de imagem de catalogo', () => {
  void it('ISCA: SVG e tipo fora da lista sao recusados sem pedir assinatura', async () => {
    const { preparador, pedidos } = montar();
    for (const tipo of ['image/svg+xml', 'image/gif', 'text/html']) {
      const erro = await preparador.preparar(tipo, 1000).catch((e: unknown) => e);
      assert.ok(erro instanceof AppError, tipo);
      assert.equal(erro.problemType, 'unsupported-media-type');
    }
    assert.equal(pedidos.length, 0);
  });

  void it('tamanho fora de 1..5 MiB e recusado', async () => {
    const { preparador } = montar();
    for (const tamanho of [0, -1, 1.5, TETO_DE_BYTES_DO_CATALOGO + 1]) {
      const erro = await preparador.preparar('image/jpeg', tamanho).catch((e: unknown) => e);
      assert.ok(erro instanceof AppError, String(tamanho));
      assert.equal(erro.status, 400);
    }
  });

  void it('pede a politica no bucket privado, com o teto e a chave do catalogo', async () => {
    const { preparador, pedidos } = montar();
    const envio = await preparador.preparar('image/webp', 2048);
    assert.equal(envio.uploadId, '0192a3b4-0000-7000-8000-000000000001');
    assert.equal(envio.maxBytes, TETO_DE_BYTES_DO_CATALOGO);
    assert.equal(pedidos[0]?.classe, 'privado');
    assert.equal(pedidos[0]?.contentType, 'image/webp');
    assert.equal(pedidos[0]?.chave, envio.chave);
  });
});
