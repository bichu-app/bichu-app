import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { criarObjectStorage } from './s3-object-storage.js';
import { comoObjectKey } from '../../domain/chave-de-objeto.js';
import { PrazoDoArmazenamentoEsgotadoError } from '../../ports/object-storage.js';

const PRAZO_CURTO_MS = 150;
const PRAZO_DE_TRANSFERENCIA_MS = 300;
const GUARDA_MS = 3_000;

const CHAVE = comoObjectKey('pets/p/original/abc');

type Comportamento = (pedido: IncomingMessage, resposta: ServerResponse) => void;

let servidor: Server;
let comportamento: Comportamento = () => undefined;

function armazenamentoEm(porta: number): ReturnType<typeof criarObjectStorage> {
  return criarObjectStorage({
    endpoint: `http://127.0.0.1:${String(porta)}`,
    region: 'regiao-de-teste',
    accessKeyId: 'chave-de-teste',
    secretAccessKey: 'segredo-de-teste',
    forcePathStyle: true,
    bucketPrivate: 'privado-de-teste',
    bucketPublic: 'publico-de-teste',
    prazoCurtoMs: PRAZO_CURTO_MS,
    prazoDeTransferenciaMs: PRAZO_DE_TRANSFERENCIA_MS,
  });
}

let armazenamento: ReturnType<typeof criarObjectStorage>;

before(async () => {
  servidor = createServer((pedido, resposta) => {
    pedido.resume();
    comportamento(pedido, resposta);
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  armazenamento = armazenamentoEm((servidor.address() as AddressInfo).port);
});

after(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((fechado) => servidor.close(() => fechado()));
});

const mudo: Comportamento = () => undefined;

const corpoQueTrava: Comportamento = (_pedido, resposta) => {
  resposta.writeHead(200, { 'content-length': '1024', 'content-type': 'image/jpeg' });
  resposta.write(Buffer.alloc(512));
};

const responde = (status: number, corpo?: Buffer): Comportamento => (_pedido, resposta) => {
  resposta.writeHead(status, corpo ? { 'content-length': String(corpo.length) } : {});
  resposta.end(corpo);
};

async function rejeicaoDentroDaGuarda(chamada: () => Promise<unknown>): Promise<{ erro: unknown; ms: number }> {
  const inicio = performance.now();
  let guarda: NodeJS.Timeout | undefined;
  const pendurou = new Promise<never>((_, rejeitar) => {
    guarda = setTimeout(
      () => rejeitar(new Error(`SEM PRAZO: a chamada ficou pendurada por mais de ${String(GUARDA_MS)} ms`)),
      GUARDA_MS,
    );
  });
  try {
    await Promise.race([chamada(), pendurou]);
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith('SEM PRAZO')) throw erro;
    return { erro, ms: performance.now() - inicio };
  } finally {
    clearTimeout(guarda);
  }
  throw new Error('a chamada resolveu contra um servidor que não respondeu');
}

function assertPrazoEsgotado(erro: unknown, operacao: string, prazoMs: number): void {
  assert.ok(erro instanceof PrazoDoArmazenamentoEsgotadoError, `esperava erro de prazo, veio ${String(erro)}`);
  assert.equal(erro.operacao, operacao);
  assert.equal(erro.prazoMs, prazoMs);
  for (const proibido of ['127.0.0.1', 'privado-de-teste', 'pets/p/original', 'chave-de-teste', 'segredo']) {
    assert.ok(!erro.message.includes(proibido), `a mensagem vazou "${proibido}": ${erro.message}`);
  }
}

void describe('servidor que aceita a conexão e nunca responde', () => {
  void it('HEAD é abortado pelo prazo CURTO, e vira erro tipado', async () => {
    comportamento = mudo;
    const { erro, ms } = await rejeicaoDentroDaGuarda(() => armazenamento.head('privado', CHAVE));
    assertPrazoEsgotado(erro, 'HEAD', PRAZO_CURTO_MS);
    assert.ok(ms < PRAZO_DE_TRANSFERENCIA_MS, `HEAD levou ${String(ms)} ms: usou o prazo longo`);
  });

  void it('DELETE é abortado pelo prazo curto', async () => {
    comportamento = mudo;
    const { erro } = await rejeicaoDentroDaGuarda(() => armazenamento.delete('privado', CHAVE));
    assertPrazoEsgotado(erro, 'DELETE', PRAZO_CURTO_MS);
  });

  void it('GET é abortado pelo prazo de TRANSFERÊNCIA', async () => {
    comportamento = mudo;
    const { erro, ms } = await rejeicaoDentroDaGuarda(() => armazenamento.get('privado', CHAVE));
    assertPrazoEsgotado(erro, 'GET', PRAZO_DE_TRANSFERENCIA_MS);
    assert.ok(ms >= PRAZO_DE_TRANSFERENCIA_MS - 20, `GET abortou em ${String(ms)} ms: usou o prazo curto`);
  });

  void it('PUT é abortado pelo prazo de transferência', async () => {
    comportamento = mudo;
    const { erro } = await rejeicaoDentroDaGuarda(() =>
      armazenamento.put('publico', comoObjectKey('card/xyz.webp'), Buffer.alloc(4096), 'image/webp'),
    );
    assertPrazoEsgotado(erro, 'PUT', PRAZO_DE_TRANSFERENCIA_MS);
  });

  void it('GET cujo corpo trava no meio também é abortado: o prazo cobre a leitura dos bytes', async () => {
    comportamento = corpoQueTrava;
    const { erro } = await rejeicaoDentroDaGuarda(() => armazenamento.get('privado', CHAVE));
    assertPrazoEsgotado(erro, 'GET', PRAZO_DE_TRANSFERENCIA_MS);
  });
});

void describe('chamada normal passa', () => {
  void it('HEAD, GET, PUT e DELETE contra servidor que responde', async () => {
    comportamento = (pedido, resposta) => {
      if (pedido.method === 'GET') return responde(200, Buffer.from([1, 2, 3]))(pedido, resposta);
      if (pedido.method === 'HEAD') {
        resposta.writeHead(200, { 'content-length': '2048', 'content-type': 'image/jpeg' });
        return resposta.end();
      }
      return responde(pedido.method === 'DELETE' ? 204 : 200)(pedido, resposta);
    };

    assert.equal((await armazenamento.head('privado', CHAVE))?.contentLength, 2048);
    assert.deepEqual([...(await armazenamento.get('privado', CHAVE))], [1, 2, 3]);
    await armazenamento.put('publico', comoObjectKey('card/xyz.webp'), Buffer.from('x'), 'image/webp');
    await armazenamento.delete('privado', CHAVE);
  });

  void it('resposta lenta, mas dentro do prazo, não é abortada', async () => {
    comportamento = (pedido, resposta) => {
      setTimeout(() => responde(200, Buffer.from([9]))(pedido, resposta), PRAZO_DE_TRANSFERENCIA_MS / 3);
    };
    assert.deepEqual([...(await armazenamento.get('privado', CHAVE))], [9]);
  });

  void it('status de erro continua sendo o erro de status, e não de prazo', async () => {
    comportamento = responde(503);
    await assert.rejects(
      () => armazenamento.head('privado', CHAVE),
      (erro: unknown) => !(erro instanceof PrazoDoArmazenamentoEsgotadoError) && /HEAD 503/.test(String(erro)),
    );
  });
});
