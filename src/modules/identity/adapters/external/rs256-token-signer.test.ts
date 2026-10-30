/**
 * O que o token de acesso promete a quem não é o nosso app (BICHUS-15, critérios 1
 * e 5).
 */
import assert from 'node:assert/strict';
import { constants, createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import { loadAppConfig, type TokenConfig } from '../../../../shared/config/app-config.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { criarTokenSigner } from './rs256-token-signer.js';

const QUINZE_MINUTOS_EM_SEGUNDOS = 15 * 60;

/** O UUIDv7 interno de uma conta. */
const USUARIO = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const AGORA = 1_789_128_000_000 as Instant;
const EMISSOR = 'https://api.bichu.test';

function gerarPem(): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return privateKey;
}

const PEM_ATIVA = gerarPem();
const PEM_ROTACAO = gerarPem();

/** Ambiente mínimo para a configuração subir. */
function ambiente(): Record<string, string> {
  return {
    ENVIRONMENT: 'dev',
    DATABASE_URL: 'postgres://bichu:descartavel@localhost:5432/bichu',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    TAG_BASE_URL: 'http://localhost:3000',
    WEB_BASE_URL: 'http://localhost:3000',
    API_BASE_URL: EMISSOR,
    MEDIA_PUBLIC_BASE_URL: 'http://localhost:9000',
    TOKEN_ISSUER: EMISSOR,
    JWT_ACTIVE_KID: 'teste-ativa',
    JWT_ACTIVE_PRIVATE_KEY: PEM_ATIVA,
    JWT_NEXT_KID: 'teste-rotacao',
    JWT_NEXT_PRIVATE_KEY: PEM_ROTACAO,
    IP_HMAC_KEY: Buffer.alloc(32, 7).toString('base64'),
    TAG_CODE_KEY: 'c1'.repeat(32),
    TAG_CODE_INDEX_KEY: 'd2'.repeat(32),
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'descartavel',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'descartavel-segredo',
    OBJECT_BUCKET_PRIVATE: 'bichu-privado',
    OBJECT_BUCKET_PUBLIC: 'bichu-publico',
    MAIL_FROM: 'nao-responda@mail.exemplo.test',
    MAIL_WEBHOOK_SECRET: 'segredo-de-teste-com-32-bytes!!!',
  };
}

const CHAVES_DO_AMBIENTE = [...Object.keys(ambiente()), 'NODE_ENV'];
const ORIGINAL = new Map(CHAVES_DO_AMBIENTE.map((nome) => [nome, process.env[nome]]));

function configuracaoDoToken(): TokenConfig {
  for (const nome of CHAVES_DO_AMBIENTE) delete process.env[nome];
  for (const [nome, valor] of Object.entries(ambiente())) process.env[nome] = valor;
  return loadAppConfig().token;
}

afterEach(() => {
  for (const [nome, valor] of ORIGINAL) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
});

interface PartesDoToken {
  readonly cabecalho: Record<string, unknown>;
  readonly corpo: Record<string, unknown>;
  readonly dadosAssinados: string;
  readonly assinatura: Buffer;
}

/** Abre o token SEM usar o verificador: o que se prova é o que está no fio. */
function abrir(token: string): PartesDoToken {
  const partes = token.split('.');
  assert.equal(partes.length, 3, 'um JWT tem três partes');
  const [cabecalhoBruto, corpoBruto, assinatura] = partes as [string, string, string];
  const ler = (parte: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(parte, 'base64url').toString('utf8')) as Record<string, unknown>;
  return {
    cabecalho: ler(cabecalhoBruto),
    corpo: ler(corpoBruto),
    dadosAssinados: `${cabecalhoBruto}.${corpoBruto}`,
    assinatura: Buffer.from(assinatura, 'base64url'),
  };
}

/** A familia de refresh que emitiu o token (ADR-0002, emenda 1). */
const FAMILIA = 'fam-de-teste-0001';

void describe('token de acesso emitido (BICHUS-15, critério 1)', () => {
  void it('o access token vale exatamente 15 minutos', () => {
    const config = configuracaoDoToken();
    const emitido = criarTokenSigner(config).emitir(USUARIO, AGORA, 'jti-1', FAMILIA);
    const { corpo } = abrir(emitido.token);
    const iat = corpo['iat'] as number;
    const exp = corpo['exp'] as number;

    assert.equal(exp - iat, QUINZE_MINUTOS_EM_SEGUNDOS);
    assert.equal(iat, Math.floor(AGORA / 1000));
    assert.equal(emitido.expiresInSeconds, QUINZE_MINUTOS_EM_SEGUNDOS);
  });

  void it('o `sub` é o UUID interno do usuário, e não um apelido nem o e-mail', () => {
    const config = configuracaoDoToken();
    const emitido = criarTokenSigner(config).emitir(USUARIO, AGORA, 'jti-2', FAMILIA);

    assert.equal(abrir(emitido.token).corpo['sub'], USUARIO);
  });

  void it('o cabeçalho diz RS256, e a assinatura é mesmo RSA da chave ativa', () => {
    const config = configuracaoDoToken();
    const emitido = criarTokenSigner(config).emitir(USUARIO, AGORA, 'jti-3', FAMILIA);
    const { cabecalho, dadosAssinados, assinatura } = abrir(emitido.token);

    assert.equal(cabecalho['alg'], 'RS256');
    assert.equal(cabecalho['kid'], config.activeKey.kid);
    assert.ok(
      createVerify('RSA-SHA256')
        .update(dadosAssinados)
        .verify({ key: config.activeKey.publicKey, padding: constants.RSA_PKCS1_PADDING }, assinatura),
      'o cabeçalho pode dizer RS256 sem que a assinatura seja RSA; esta linha confere a assinatura',
    );
  });

  void it('o JWKS publica RS256 nas duas chaves', () => {
    const config = configuracaoDoToken();
    const jwks = criarTokenSigner(config).jwks();
    for (const chave of jwks) {
      assert.equal(chave.alg, 'RS256');
      assert.equal(chave.kty, 'RSA');
    }
  });
});

void describe('verificação do token de acesso (BICHUS-15, critério 5)', () => {
  void it('recusa o token de um emissor fora da lista configurada', () => {
    const config = configuracaoDoToken();

    const emissorEstranho = criarTokenSigner({
      ...config,
      issuer: 'https://keycloak.que-ninguem-configurou.test',
    });
    const forjado = emissorEstranho.emitir(USUARIO, AGORA, 'jti-4', FAMILIA);

    const resultado = criarTokenSigner(config).verificar(forjado.token, AGORA);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.ok === false && resultado.motivo, 'emissor_nao_confiavel');
  });

  void it('aceita o token do emissor que está na lista', () => {
    const config = configuracaoDoToken();
    const assinador = criarTokenSigner(config);
    const emitido = assinador.emitir(USUARIO, AGORA, 'jti-5', FAMILIA);

    const resultado = assinador.verificar(emitido.token, AGORA);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.ok === true && resultado.claims.sub, USUARIO);
  });

  void it('recusa o token cujo cabeçalho troca o algoritmo, mesmo com o resto intacto', () => {
    const config = configuracaoDoToken();
    const assinador = criarTokenSigner(config);
    const emitido = assinador.emitir(USUARIO, AGORA, 'jti-6', FAMILIA);
    const { corpo, assinatura } = abrir(emitido.token);

    const cabecalhoTrocado = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: config.activeKey.kid }),
    ).toString('base64url');
    const corpoBruto = Buffer.from(JSON.stringify(corpo)).toString('base64url');
    const token = `${cabecalhoTrocado}.${corpoBruto}.${assinatura.toString('base64url')}`;

    const resultado = assinador.verificar(token, AGORA);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.ok === false && resultado.motivo, 'algoritmo_nao_permitido');
  });
});

/** `sid` no token de acesso (ADR-0002, emenda 1). */
void describe('`sid` no token de acesso (ADR-0002, emenda 1)', () => {
  void it('todo token emitido carrega o `sid` da família que o emitiu', () => {
    const config = configuracaoDoToken();
    const emitido = criarTokenSigner(config).emitir(USUARIO, AGORA, 'jti-sid-1', FAMILIA);

    assert.equal(abrir(emitido.token).corpo['sid'], FAMILIA);
  });

  void it('aceita o token SEM `sid`: é o que já está no aparelho das pessoas', () => {
    const config = configuracaoDoToken();
    const assinador = criarTokenSigner(config);
    const emitido = assinador.emitir(USUARIO, AGORA, 'jti-sid-2', FAMILIA);
    const { corpo } = abrir(emitido.token);

    const semSid = { ...corpo };
    delete semSid['sid'];
    const cabecalho = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: config.activeKey.kid }),
    ).toString('base64url');
    const corpoBruto = Buffer.from(JSON.stringify(semSid)).toString('base64url');
    const dados = `${cabecalho}.${corpoBruto}`;
    const assinatura = createSign('RSA-SHA256')
      .update(dados)
      .sign(config.activeKey.privateKey)
      .toString('base64url');

    const resultado = assinador.verificar(`${dados}.${assinatura}`, AGORA);

    assert.equal(resultado.ok, true, 'token antigo, sem `sid`, continua valendo até o `exp`');
    assert.equal(resultado.ok === true && resultado.claims.sid, undefined);
  });
});
