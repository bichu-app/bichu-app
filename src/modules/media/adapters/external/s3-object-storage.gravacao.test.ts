/**
 * A gravação da derivada recusa content-type que não seja de imagem (BICHUS-133).
 *
 * O `contentType` do `put` vira o cabeçalho do PUT e volta como `Content-Type`
 * de resposta para quem baixar o objeto. A entrada já recusa tipo fora da lista
 * fechada (critério 22 de BICHUS-87, por igualdade e nunca por prefixo); a
 * saída não recusava nada, e a garantia inteira era o único adaptador de imagem
 * devolver o literal `image/webp`.
 *
 * O que se prova aqui é que a recusa acontece **antes de o pedido sair**: o
 * dublê de `fetch` guarda o que foi enviado, e nos casos de recusa ele precisa
 * continuar vazio. Recusar depois de gravar seria recusar o que já está lá.
 */
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
    // HTML gravado no domínio de mídia é página executável hospedada por nós —
    // e esse domínio é separado da origem do app exatamente para conter XSS.
    dublarFetch(200);
    await assert.rejects(
      () => armazenamento.put('publico', CHAVE, BYTES, 'text/html'),
      /PUT recusado/,
    );
    assert.equal(enviados, 0, 'o pedido saiu antes da recusa');
  });

  void it('RECUSA image/svg+xml: o prefixo `image/` não é critério', async () => {
    // É o caso que `starts-with: image/` deixaria passar. SVG é documento com
    // script, e o critério 15 o recusa em qualquer hipótese.
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
    // O contrapeso: sem ele, um `put` que recusasse todo tipo passaria nos três
    // casos acima e pararia o processamento de foto inteiro.
    for (const bom of ['image/webp', 'image/jpeg']) {
      dublarFetch(200);
      await armazenamento.put('publico', CHAVE, BYTES, bom);
      assert.equal(enviados, 1, bom);
      assert.equal(ultimoContentType, bom);
    }
  });
});
