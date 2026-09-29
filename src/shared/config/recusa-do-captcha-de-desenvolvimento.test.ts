/**
 * QA, 28/09: o desafio de desenvolvimento do login do painel so sobe na pilha
 * local. `assertSafeBoot` roda antes de a API ouvir qualquer porta
 * (`bin/api.ts`), e e ele que recusa.
 *
 * As iscas deste arquivo sao os casos que PRECISAM derrubar o boot: producao,
 * ambiente que nao e dev, e host que nao e local. Se a trava deixar de
 * existir, os tres reprovam.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { assertSafeBoot, ehHostLocal, recusaDoCaptchaDeDesenvolvimento } from './env.js';

const ORIGINAL = { ...process.env };
const LIGA = { CAPTCHA_DESENVOLVIMENTO_LOCAL: 'aprovar-token-de-desenvolvimento' };
// Hosts de teste que o portao de portabilidade aceita: `*.localhost`, `*.test`,
// loopback IPv6 e dominios reservados (`.invalid`), nunca um host de verdade.
const LOCAL = { PUBLIC_BASE_URL: 'http://app.localhost:3000', ADMIN_ORIGIN: 'http://admin.localhost' };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

function subir(ambiente: Record<string, string>): unknown {
  process.env = { ...ORIGINAL, ...ambiente };
  delete process.env['NODE_ENV'];
  if (ambiente['NODE_ENV'] !== undefined) process.env['NODE_ENV'] = ambiente['NODE_ENV'];
  try {
    assertSafeBoot();
    return undefined;
  } catch (erro) {
    return erro;
  }
}

void describe('recusa de subida com o captcha de desenvolvimento fora da pilha local', () => {
  void it('ISCA: com NODE_ENV=production a API nao sobe, e a mensagem nomeia a variavel e o motivo', () => {
    const erro = subir({ ...LIGA, ...LOCAL, ENVIRONMENT: 'dev', NODE_ENV: 'production' });
    assert.ok(erro instanceof Error, 'a API subiu com o captcha de desenvolvimento em producao');
    assert.match(erro.message, /CAPTCHA_DESENVOLVIMENTO_LOCAL/);
    assert.match(erro.message, /NODE_ENV=production/);
  });

  void it('ISCA: num host que nao e local a API nao sobe (hosts reservados que nao sao locais)', () => {
    for (const hospedado of [
      { PUBLIC_BASE_URL: 'https://hml.exemplo.invalid' },
      { ADMIN_ORIGIN: 'https://admin.exemplo.invalid' },
      { PUBLIC_BASE_URL: 'http://34.95.10.10' },
    ]) {
      const erro = subir({ ...LIGA, ...LOCAL, ENVIRONMENT: 'dev', ...hospedado });
      assert.ok(erro instanceof Error, `a API subiu com ${JSON.stringify(hospedado)}`);
      assert.match(erro.message, /host que nao e local/);
    }
  });

  void it('ISCA: fora de ENVIRONMENT=dev a API nao sobe, mesmo com host local', () => {
    const erro = subir({ ...LIGA, ...LOCAL, ENVIRONMENT: 'homologacao' });
    assert.ok(erro instanceof Error);
    assert.match(erro.message, /ENVIRONMENT=homologacao/);
  });

  void it('a variavel presente com qualquer valor ja e gatilho num ambiente hospedado', () => {
    const erro = subir({ CAPTCHA_DESENVOLVIMENTO_LOCAL: 'nao', ENVIRONMENT: 'prod', ...LOCAL });
    assert.ok(erro instanceof Error);
  });

  void it('na pilha local, dev e sem producao, a API sobe', () => {
    assert.equal(subir({ ...LIGA, ...LOCAL, ENVIRONMENT: 'dev' }), undefined);
    assert.equal(recusaDoCaptchaDeDesenvolvimento({ ...LIGA, ...LOCAL }), undefined);
  });

  void it('sem a variavel, nada muda: nenhuma recusa nova', () => {
    assert.equal(recusaDoCaptchaDeDesenvolvimento({ PUBLIC_BASE_URL: 'https://exemplo.invalid', NODE_ENV: 'production' }), undefined);
  });

  void it('host local e comparado pelo hostname, e nao por texto', () => {
    assert.equal(ehHostLocal('http://app.localhost:3300'), true);
    assert.equal(ehHostLocal('http://admin.localhost'), true);
    assert.equal(ehHostLocal('http://painel.exemplo.test'), true);
    assert.equal(ehHostLocal('http://[::1]:3000'), true);
    assert.equal(ehHostLocal('https://app.localhost.exemplo.invalid'), false);
    assert.equal(ehHostLocal('https://exemplo.invalid/localhost'), false);
    assert.equal(ehHostLocal('nao e url'), false);
  });
});
