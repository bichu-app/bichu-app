import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { criarObjectStorage } from './s3-object-storage.js';
import { TETO_DE_BYTES, comoObjectKey } from '../../domain/chave-de-objeto.js';

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

async function politicaDe(maxBytes = TETO_DE_BYTES): Promise<{
  condicoes: unknown[];
  expiration: string;
  campos: Record<string, string>;
}> {
  const a = await armazenamento.createUploadIntent({
    classe: 'privado',
    chave: comoObjectKey('pets/p/original/abc'),
    contentType: 'image/jpeg',
    maxBytes,
    validadeEmSegundos: 300,
  });
  const bruta = JSON.parse(Buffer.from(a.campos!['policy']!, 'base64').toString()) as {
    conditions: unknown[];
    expiration: string;
  };
  return { condicoes: bruta.conditions, expiration: bruta.expiration, campos: a.campos! };
}

function condicao(condicoes: unknown[], nome: string): unknown {
  for (const c of condicoes) {
    if (typeof c === 'object' && c !== null && !Array.isArray(c) && nome in c) {
      return (c as Record<string, unknown>)[nome];
    }
  }
  return undefined;
}

void describe('política assinada — o que ela limita', () => {
  void it('CRITÉRIO 24: 20 MB são recusados pela própria política, e não pelo cliente', async () => {
    const { condicoes } = await politicaDe();
    const faixa = condicoes.find((c) => Array.isArray(c) && c[0] === 'content-length-range') as
      | [string, number, number]
      | undefined;

    assert.notEqual(faixa, undefined, 'sem content-length-range: qualquer tamanho passaria');
    assert.equal(faixa![2], TETO_DE_BYTES, 'a política não leva o teto que o envio pediu');
    assert.ok(20 * 1024 * 1024 > faixa![2], '20 MB precisam estar acima do teto');
  });

  void it('o piso é 1 byte: objeto de zero byte é upload que falhou e passou', async () => {
    const { condicoes } = await politicaDe();
    const faixa = condicoes.find((c) => Array.isArray(c) && c[0] === 'content-length-range') as
      | [string, number, number];
    assert.equal(faixa[1], 1);
  });

  void it('CRITÉRIO 22: o Content-Type é restrito por IGUALDADE, nunca por prefixo', async () => {
    const { condicoes } = await politicaDe();
    assert.equal(condicao(condicoes, 'Content-Type'), 'image/jpeg');
    assert.ok(
      !condicoes.some((c) => Array.isArray(c) && c[0] === 'starts-with'),
      'a política usa starts-with em algum lugar',
    );
  });

  void it('CRITÉRIO 22: a criptografia no servidor está na POLÍTICA e no formulário', async () => {
    const { condicoes, campos } = await politicaDe();
    assert.equal(condicao(condicoes, 'x-amz-server-side-encryption'), 'AES256');
    assert.equal(campos['x-amz-server-side-encryption'], 'AES256');
  });

  void it('CRITÉRIO 21: a chave é EXATA, e não um prefixo', async () => {
    const { condicoes } = await politicaDe();
    assert.equal(condicao(condicoes, 'key'), 'pets/p/original/abc');
  });

  void it('CRITÉRIO 22: a validade é de 5 minutos', async () => {
    const { expiration } = await politicaDe();
    const restante = new Date(expiration).getTime() - Date.now();
    assert.ok(restante > 4.5 * 60_000 && restante <= 5 * 60_000, `validade fora do previsto: ${String(restante)}ms`);
  });

  void it('o bucket é o privado: original nunca nasce no bucket público', async () => {
    const { condicoes } = await politicaDe();
    assert.equal(condicao(condicoes, 'bucket'), 'privado-de-teste');
  });

  void it('a assinatura muda quando a política muda', async () => {
    const a = await politicaDe(TETO_DE_BYTES);
    const b = await politicaDe(1000);
    assert.notEqual(a.campos['x-amz-signature'], b.campos['x-amz-signature']);
  });
});

async function politicaOuNada(contentType: string): Promise<Record<string, string> | null> {
  try {
    const a = await armazenamento.createUploadIntent({
      classe: 'privado',
      chave: comoObjectKey('pets/p/original/abc'),
      contentType,
      maxBytes: TETO_DE_BYTES,
      validadeEmSegundos: 300,
    });
    return a.campos ?? {};
  } catch {
    return null;
  }
}

const TIPOS_HOSTIS = [
  'image/svg+xml',
  'text/html',
  'image/',
  'image/jpeg; charset=utf-8',
  'IMAGE/JPEG',
  'application/octet-stream',
  '',
];

void describe('content-type do pedido de envio — recusado ANTES de assinar', () => {
  void it('nenhum tipo hostil sai assinado na política nem no formulário', async () => {
    for (const hostil of TIPOS_HOSTIS) {
      const campos = await politicaOuNada(hostil);
      assert.equal(
        campos,
        null,
        `assinou content-type fora da lista: ${JSON.stringify(hostil)} -> ${JSON.stringify(campos)}`,
      );
    }
  });

  void it('RECUSA com o tipo no texto, para o defeito aparecer no log', async () => {
    await assert.rejects(
      () =>
        armazenamento.createUploadIntent({
          classe: 'privado',
          chave: comoObjectKey('pets/p/original/abc'),
          contentType: 'image/svg+xml',
          maxBytes: TETO_DE_BYTES,
          validadeEmSegundos: 300,
        }),
      /Autorização de envio recusada.*svg/s,
    );
  });

  void it('os quatro tipos do contrato continuam sendo autorizados', async () => {
    for (const bom of ['image/jpeg', 'image/png', 'image/heic', 'image/webp']) {
      const campos = await politicaOuNada(bom);
      assert.ok(campos !== null, `recusou tipo aceito: ${bom}`);
      assert.equal(campos['Content-Type'], bom);
    }
  });
});
