import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';

import { loadAppConfig } from '../../../../shared/config/app-config.js';
import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { criarTokenSigner } from '../external/rs256-token-signer.js';
import { registrarRotasDeDescoberta, type DependenciasDasRotas } from './routes.js';
import type { AuthService } from '../../application/auth-service.js';

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

function ambiente(): Record<string, string> {
  return {
    ENVIRONMENT: 'dev',
    DATABASE_URL: 'postgres://bichu:descartavel@db.exemplo.invalid:5432/bichu',
    PUBLIC_BASE_URL: 'http://api.exemplo.invalid:3000',
    TAG_BASE_URL: 'https://tag.exemplo.invalid',
    WEB_BASE_URL: 'https://exemplo.invalid',
    API_BASE_URL: 'https://api.bichu.test',
    MEDIA_PUBLIC_BASE_URL: 'http://midia.exemplo.invalid:9000',
    TOKEN_ISSUER: 'https://api.bichu.test',
    JWT_ACTIVE_KID: 'teste-ativa',
    JWT_ACTIVE_PRIVATE_KEY: PEM_ATIVA,
    JWT_NEXT_KID: 'teste-rotacao',
    JWT_NEXT_PRIVATE_KEY: PEM_ROTACAO,
    IP_HMAC_KEY: Buffer.alloc(32, 7).toString('base64'),
    TAG_CODE_KEY: 'c1'.repeat(32),
    TAG_CODE_INDEX_KEY: 'd2'.repeat(32),
    OBJECT_STORAGE_REGION: 'regiao-de-teste',
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

afterEach(() => {
  for (const [nome, valor] of ORIGINAL) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
});

function subirApp() {
  for (const nome of CHAVES_DO_AMBIENTE) delete process.env[nome];
  for (const [nome, valor] of Object.entries(ambiente())) process.env[nome] = valor;
  const config = loadAppConfig();

  const app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  const deps: DependenciasDasRotas = {
    auth: {} as unknown as AuthService,
    assinador: criarTokenSigner(config.token),
    contrato: carregarContrato('api/openapi.yaml'),
    issuer: config.token.issuer,
    apiBaseUrl: config.apiBaseUrl,
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
  };
  registrarRotasDeDescoberta(app, deps);
  return { app, config };
}

interface ChaveJwkNaResposta {
  readonly kty: string;
  readonly kid: string;
  readonly use: string;
  readonly alg: string;
  readonly n: string;
  readonly e: string;
}

const CAMPOS_PUBLICOS_DA_CHAVE = ['alg', 'e', 'kid', 'kty', 'n', 'use'].sort();

void describe('GET /.well-known/jwks.json (BICHUS-15, critério 2)', () => {
  void it('responde 200 sem cabeçalho Authorization', async () => {
    const { app } = subirApp();
    const resposta = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });
    assert.equal(resposta.statusCode, 200);
  });

  void it('publica duas chaves com `kid` distintos', async () => {
    const { app } = subirApp();
    const resposta = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });
    const corpo = resposta.json<{ keys: ChaveJwkNaResposta[] }>();

    assert.equal(corpo.keys.length, 2, 'o JWKS precisa publicar exatamente duas chaves (ativa + rotação)');

    const kids = corpo.keys.map((chave) => chave.kid);
    assert.equal(new Set(kids).size, 2, 'os dois `kid` precisam ser distintos entre si');
  });

  void it('não vaza material privado: cada chave só tem os campos públicos do JWK', async () => {
    const { app } = subirApp();
    const resposta = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });
    const corpo = resposta.json<{ keys: ChaveJwkNaResposta[] }>();

    for (const chave of corpo.keys) {
      assert.deepEqual(Object.keys(chave).sort(), CAMPOS_PUBLICOS_DA_CHAVE);
      assert.equal(chave.kty, 'RSA');
      assert.equal(chave.use, 'sig');
      assert.equal(chave.alg, 'RS256');
    }
  });

  void it('continua 200 mesmo com um `Authorization` inválido', async () => {
    const { app } = subirApp();
    const resposta = await app.inject({
      method: 'GET',
      url: '/.well-known/jwks.json',
      headers: { authorization: 'Bearer isto-nao-e-um-jwt-valido' },
    });

    assert.equal(resposta.statusCode, 200);
  });
});

void describe('GET /.well-known/openid-configuration (BICHUS-15, critério 2)', () => {
  void it('responde 200 sem cabeçalho Authorization e aponta para o `jwks_uri` certo', async () => {
    const { app, config } = subirApp();
    const resposta = await app.inject({ method: 'GET', url: '/.well-known/openid-configuration' });
    assert.equal(resposta.statusCode, 200);

    const corpo = resposta.json<{ issuer: string; jwks_uri: string }>();
    assert.equal(corpo.issuer, config.token.issuer);
    assert.equal(corpo.jwks_uri, `${config.apiBaseUrl}/.well-known/jwks.json`);
  });

  void it('continua 200 mesmo com um `Authorization` inválido', async () => {
    const { app } = subirApp();
    const resposta = await app.inject({
      method: 'GET',
      url: '/.well-known/openid-configuration',
      headers: { authorization: 'Bearer isto-nao-e-um-jwt-valido' },
    });
    assert.equal(resposta.statusCode, 200);
  });
});
