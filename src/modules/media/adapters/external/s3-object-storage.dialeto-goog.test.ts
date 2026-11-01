/**
 * O DIALETO `goog` da assinatura V4 (ADR-0007 Emenda 1).
 *
 * ## Por que este arquivo existe
 *
 * Em 30/10/2026 o envio de foto ficou bloqueado em homologação e três rodadas
 * de diagnóstico foram gastas suspeitando desta assinatura. Ela estava certa —
 * medida contra o GCS de verdade, 204 em todos os caminhos. Mas **nenhum teste
 * do repositório podia confirmar nem negar isso**: os quatro arquivos de
 * `s3-object-storage` instanciam o adaptador sem `dialetoDeAssinatura`, e o
 * padrão é `amz`. A suíte inteira media o dialeto da API S3 enquanto produção
 * assinava no dialeto do armazenamento gerenciado.
 *
 * Um dialeto sem caso é um dialeto que ninguém mede, e o sintoma de errá-lo é
 * 403 no primeiro envio de um usuário real — nunca na subida.
 *
 * ## O que se prova aqui, e em que direção
 *
 * A aritmética da V4 é a MESMA nos dois dialetos; o que muda é nome. Então os
 * casos abaixo cobram exatamente os nomes, a SIMETRIA entre política e
 * formulário, e a cadeia de derivação recomputada **por fora do adaptador** —
 * que é o que pega troca de prefixo, de serviço, de terminador ou de região.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { criarObjectStorage } from './s3-object-storage.js';
import type { ObjectStorageConfig } from '../../../../shared/config/app-config.js';
import { TETO_DE_BYTES, comoObjectKey } from '../../domain/chave-de-objeto.js';

const BASE = {
  endpoint: 'https://storage.googleapis.com',
  region: 'southamerica-east1',
  accessKeyId: 'GOOG1EXEMPLO',
  secretAccessKey: 'segredo-de-teste',
  forcePathStyle: true,
  bucketPrivate: 'privado-de-teste',
  bucketPublic: 'publico-de-teste',
  prazoCurtoMs: 5_000,
  prazoDeTransferenciaMs: 45_000,
} satisfies Omit<ObjectStorageConfig, 'dialetoDeAssinatura'>;

function adaptador(dialeto: 'amz' | 'goog'): ReturnType<typeof criarObjectStorage> {
  return criarObjectStorage({ ...BASE, dialetoDeAssinatura: dialeto });
}

interface Envio {
  readonly campos: Record<string, string>;
  readonly condicoes: readonly unknown[];
  readonly politicaB64: string;
}

async function envioDe(dialeto: 'amz' | 'goog'): Promise<Envio> {
  const a = await adaptador(dialeto).createUploadIntent({
    classe: 'privado',
    chave: comoObjectKey('pets/p/original/abc'),
    contentType: 'image/jpeg',
    maxBytes: TETO_DE_BYTES,
    validadeEmSegundos: 300,
  });
  const campos = a.campos!;
  const politicaB64 = campos['policy']!;
  const bruta = JSON.parse(Buffer.from(politicaB64, 'base64').toString()) as {
    conditions: unknown[];
  };
  return { campos, condicoes: bruta.conditions, politicaB64 };
}

function paresDeCondicao(condicoes: readonly unknown[]): Map<string, unknown> {
  const pares = new Map<string, unknown>();
  for (const c of condicoes) {
    if (typeof c === 'object' && c !== null && !Array.isArray(c)) {
      for (const [k, v] of Object.entries(c)) pares.set(k, v);
    }
  }
  return pares;
}

void describe('dialeto `goog` — os nomes que o armazenamento gerenciado exige', () => {
  void it('o formulário sai com os SETE campos do XML API, e nenhum `x-amz-`', async () => {
    const { campos } = await envioDe('goog');
    assert.deepEqual(
      new Set(Object.keys(campos)),
      new Set([
        'key',
        'Content-Type',
        'x-goog-algorithm',
        'x-goog-credential',
        'x-goog-date',
        'policy',
        'x-goog-signature',
      ]),
    );
    assert.equal(campos['x-goog-algorithm'], 'GOOG4-HMAC-SHA256');
    assert.ok(
      campos['x-goog-credential']!.endsWith(`/${BASE.region}/storage/goog4_request`),
      `escopo fora do dialeto: ${campos['x-goog-credential']!}`,
    );
  });

  void it('NÃO declara criptografia no servidor, nem campo nem condição', async () => {
    const { campos, condicoes } = await envioDe('goog');
    for (const nome of Object.keys(campos)) {
      assert.ok(
        !nome.includes('server-side-encryption'),
        `campo de criptografia no dialeto goog: ${nome}`,
      );
    }
    assert.equal(paresDeCondicao(condicoes).has('x-goog-server-side-encryption'), false);
    assert.equal(paresDeCondicao(condicoes).has('x-amz-server-side-encryption'), false);
  });

  void it('a assinatura confere com a cadeia GOOG4 recomputada POR FORA', async () => {
    const { campos, politicaB64 } = await envioDe('goog');
    const dataCurta = campos['x-goog-date']!.slice(0, 8);
    const hmac = (chave: Buffer | string, dado: string): Buffer =>
      createHmac('sha256', chave).update(dado, 'utf8').digest();
    const chave = hmac(
      hmac(hmac(hmac(`GOOG4${BASE.secretAccessKey}`, dataCurta), BASE.region), 'storage'),
      'goog4_request',
    );
    const esperada = createHmac('sha256', chave).update(politicaB64, 'utf8').digest('hex');
    assert.equal(campos['x-goog-signature'], esperada);
  });
});

void describe('simetria entre política e formulário — vale nos DOIS dialetos', () => {
  for (const dialeto of ['amz', 'goog'] as const) {
    void it(`[${dialeto}] todo campo do formulário tem condição, com o MESMO valor`, async () => {
      const { campos, condicoes } = await envioDe(dialeto);
      const pares = paresDeCondicao(condicoes);
      const isentos = new Set(['policy', `x-${dialeto}-signature`]);
      for (const [nome, valor] of Object.entries(campos)) {
        if (isentos.has(nome)) continue;
        assert.ok(
          pares.has(nome),
          `campo \`${nome}\` sai no formulário e NÃO está nas condições: o ` +
            `armazenamento recusa o envio inteiro.`,
        );
        assert.equal(pares.get(nome), valor, `condição de \`${nome}\` difere do campo enviado`);
      }
    });

    void it(`[${dialeto}] toda condição tem campo no formulário (menos \`bucket\`)`, async () => {
      const { campos, condicoes } = await envioDe(dialeto);
      for (const nome of paresDeCondicao(condicoes).keys()) {
        if (nome === 'bucket') continue;
        assert.ok(
          nome in campos,
          `condição \`${nome}\` sem campo no formulário: o cliente é recusado ` +
            `por omitir o que a política exige.`,
        );
      }
    });
  }
});

void describe('o controle positivo: `amz` continua sendo `amz`', () => {
  void it('o dialeto da API S3 mantém `x-amz-` e a criptografia declarada', async () => {
    const { campos, condicoes } = await envioDe('amz');
    assert.equal(campos['x-amz-algorithm'], 'AWS4-HMAC-SHA256');
    assert.equal(campos['x-amz-server-side-encryption'], 'AES256');
    assert.equal(paresDeCondicao(condicoes).get('x-amz-server-side-encryption'), 'AES256');
    assert.ok(
      campos['x-amz-credential']!.endsWith(`/${BASE.region}/s3/aws4_request`),
      `escopo fora do dialeto: ${campos['x-amz-credential']!}`,
    );
    for (const nome of Object.keys(campos)) {
      assert.ok(!nome.startsWith('x-goog-'), `campo do outro dialeto em amz: ${nome}`);
    }
  });

  void it('os dois dialetos NÃO produzem a mesma assinatura', async () => {
    const a = await envioDe('amz');
    const g = await envioDe('goog');
    assert.notEqual(a.campos['x-amz-signature'], g.campos['x-goog-signature']);
  });
});
