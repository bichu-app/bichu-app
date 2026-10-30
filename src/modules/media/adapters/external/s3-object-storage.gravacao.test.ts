/** A gravação da derivada recusa content-type que não seja de imagem (BICHUS-133). */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { criarObjectStorage } from './s3-object-storage.js';
import { comoObjectKey } from '../../domain/chave-de-objeto.js';

const armazenamento = criarObjectStorage({
  endpoint: 'http://objeto:9000',
  region: 'us-east-1',
  accessKeyId: 'chave-de-teste',
  secretAccessKey: 'segredo-de-teste',
  forcePathStyle: true,
  bucketPrivate: 'privado-de-teste',
  bucketPublic: 'publico-de-teste',
  prazoCurtoMs: 5_000,
  prazoDeTransferenciaMs: 45_000,
});

const CHAVE = comoObjectKey('card/abcdefghijklmnopqrstuv.webp');
const BYTES = Buffer.from('bytes da derivada');

const originalFetch = globalThis.fetch;
let enviados = 0;
let ultimoContentType: string | undefined;

function dublarFetch(status: number): void {
  enviados = 0;
  globalThis.fetch = ((_url: URL | string, init?: RequestInit) => {
    enviados += 1;
    ultimoContentType = (init?.headers as Record<string, string> | undefined)?.['content-type'];
    return Promise.resolve(new Response(null, { status }));
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  enviados = 0;
  ultimoContentType = undefined;
});

void describe('put — content-type da derivada', () => {
  void it('RECUSA text/html, e nem chega a falar com o armazenamento', async () => {
    dublarFetch(200);
    await assert.rejects(
      () => armazenamento.put('publico', CHAVE, BYTES, 'text/html'),
      /PUT recusado/,
    );
    assert.equal(enviados, 0, 'o pedido saiu antes da recusa');
  });

  void it('RECUSA image/svg+xml: o prefixo `image/` não é critério', async () => {
    dublarFetch(200);
    await assert.rejects(
      () => armazenamento.put('publico', CHAVE, BYTES, 'image/svg+xml'),
      /PUT recusado/,
    );
    assert.equal(enviados, 0);
  });

  void it('RECUSA image/webp com parâmetro colado, que não é o mesmo texto', async () => {
    dublarFetch(200);
    await assert.rejects(
      () => armazenamento.put('publico', CHAVE, BYTES, 'image/webp, text/html'),
      /PUT recusado/,
    );
    assert.equal(enviados, 0);
  });

  void it('image/webp e image/jpeg continuam gravando — recusar tudo não é defesa', async () => {
    for (const bom of ['image/webp', 'image/jpeg']) {
      dublarFetch(200);
      await armazenamento.put('publico', CHAVE, BYTES, bom);
      assert.equal(enviados, 1, bom);
      assert.equal(ultimoContentType, bom);
    }
  });
});
