/**
 * Os verbos do armazenamento: `getSignedReadUrl`, `head`, `get`, `put`, `delete`.
 *
 * Eles não aparecem no caminho do usuário — quem os usa é o worker — e por isso
 * são exatamente o tipo de código que passa meses sem ninguém olhar. Um erro na
 * assinatura aqui não quebra nenhuma tela: quebra o processamento de foto, de
 * madrugada, num log que ninguém lê.
 *
 * O `fetch` é substituído por um dublê que **guarda o pedido**, porque o que se
 * verifica não é a resposta (ela é inventada aqui): é o que o adaptador
 * **enviou** — método, caminho, e os cabeçalhos assinados.
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
  prazoCurtoMs: 5_000,
  prazoDeTransferenciaMs: 45_000,
});

const CHAVE = comoObjectKey('pets/p/original/abc');

interface PedidoCapturado {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  corpo: unknown;
}

const originalFetch = globalThis.fetch;
let capturado: PedidoCapturado | undefined;

function dublarFetch(resposta: { status: number; headers?: Record<string, string>; corpo?: Buffer }): void {
  globalThis.fetch = ((url: URL | string, init?: RequestInit) => {
    capturado = {
      url: String(url),
      metodo: init?.method ?? 'GET',
      cabecalhos: (init?.headers ?? {}) as Record<string, string>,
      corpo: init?.body,
    };
    return Promise.resolve(
      new Response(resposta.corpo ?? null, {
        status: resposta.status,
        headers: resposta.headers ?? {},
      }),
    );
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  capturado = undefined;
});

void describe('getSignedReadUrl', () => {
  void it('assina por consulta, e a assinatura cobre o que está na URL', async () => {
    const url = new URL(await armazenamento.getSignedReadUrl('privado', CHAVE, 600));

    assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
    assert.equal(url.searchParams.get('X-Amz-Expires'), '600');
    assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
    assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
    assert.ok(url.pathname.endsWith('/privado-de-teste/pets/p/original/abc'));
  });

  void it('validade diferente produz assinatura diferente', async () => {
    // Prova que a assinatura cobre os parâmetros, e não é um valor constante:
    // sem isso, mudar a validade passaria despercebido e o armazenamento
    // recusaria em produção por um motivo que ninguém liga à mudança.
    const a = new URL(await armazenamento.getSignedReadUrl('privado', CHAVE, 60));
    const b = new URL(await armazenamento.getSignedReadUrl('privado', CHAVE, 600));
    assert.notEqual(a.searchParams.get('X-Amz-Signature'), b.searchParams.get('X-Amz-Signature'));
  });

  void it('a classe escolhe o bucket', async () => {
    const publico = new URL(await armazenamento.getSignedReadUrl('publico', CHAVE, 60));
    assert.ok(publico.pathname.includes('/publico-de-teste/'));
  });
});

void describe('head', () => {
  void it('devolve tamanho e tipo quando o objeto existe', async () => {
    dublarFetch({ status: 200, headers: { 'content-length': '2048', 'content-type': 'image/jpeg', etag: '"abc"' } });
    const r = await armazenamento.head('privado', CHAVE);

    assert.deepEqual(r, { contentLength: 2048, contentType: 'image/jpeg', etag: '"abc"' });
    assert.equal(capturado?.metodo, 'HEAD');
    assert.match(capturado?.cabecalhos['authorization'] ?? '', /^AWS4-HMAC-SHA256 Credential=chave-de-teste\//);
  });

  void it('404 vira NULL, e não erro: o objeto que nunca chegou é caso normal', async () => {
    dublarFetch({ status: 404 });
    assert.equal(await armazenamento.head('privado', CHAVE), null);
  });

  void it('outro status vira erro: 503 não é "não existe"', async () => {
    // Confundir os dois faria a confirmação recusar uma foto que chegou, só
    // porque o armazenamento piscou.
    dublarFetch({ status: 503 });
    await assert.rejects(() => armazenamento.head('privado', CHAVE), /HEAD 503/);
  });
});

void describe('get e put — só o worker', () => {
  void it('get devolve os bytes', async () => {
    dublarFetch({ status: 200, corpo: Buffer.from([1, 2, 3]) });
    const bytes = await armazenamento.get('privado', CHAVE);
    assert.deepEqual([...bytes], [1, 2, 3]);
    assert.equal(capturado?.metodo, 'GET');
  });

  void it('get que falha lança, em vez de devolver buffer vazio', async () => {
    dublarFetch({ status: 500 });
    await assert.rejects(() => armazenamento.get('privado', CHAVE), /GET 500/);
  });

  void it('put manda o content-type e assina o CORPO', async () => {
    dublarFetch({ status: 200 });
    await armazenamento.put('publico', comoObjectKey('card/xyz.webp'), Buffer.from('bytes'), 'image/webp');

    assert.equal(capturado?.metodo, 'PUT');
    assert.equal(capturado?.cabecalhos['content-type'], 'image/webp');
    // O hash do conteúdo entra na assinatura: corpo trocado no caminho é
    // recusado pelo armazenamento, e não aceito em silêncio.
    assert.match(capturado?.cabecalhos['x-amz-content-sha256'] ?? '', /^[0-9a-f]{64}$/);
  });

  void it('put que falha lança', async () => {
    dublarFetch({ status: 403 });
    await assert.rejects(
      () => armazenamento.put('publico', CHAVE, Buffer.from('x'), 'image/webp'),
      /PUT 403/,
    );
  });
});

void describe('delete', () => {
  void it('apaga', async () => {
    dublarFetch({ status: 204 });
    await armazenamento.delete('privado', CHAVE);
    assert.equal(capturado?.metodo, 'DELETE');
  });

  void it('404 é SUCESSO: o estado desejado é "não existe"', async () => {
    // A varredura de envios vencidos depende disto — o caso mais comum lá é
    // justamente o objeto nunca ter chegado. Tratar ausência como erro
    // deixaria a linha presa na fila para sempre.
    dublarFetch({ status: 404 });
    await assert.doesNotReject(() => armazenamento.delete('privado', CHAVE));
  });

  void it('503 continua sendo erro', async () => {
    dublarFetch({ status: 503 });
    await assert.rejects(() => armazenamento.delete('privado', CHAVE), /DELETE 503/);
  });
});
