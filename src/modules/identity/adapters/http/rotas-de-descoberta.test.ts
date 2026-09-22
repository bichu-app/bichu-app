/**
 * `GET /.well-known/jwks.json` e `GET /.well-known/openid-configuration`
 * (BICHUS-15, critério 2).
 *
 * Por que este arquivo existe: as duas rotas já existiam em `routes.ts` e já
 * estavam com `security: []` em `api/openapi.yaml`, mas nenhum teste subia o
 * Fastify para provar isso. "Existe no contrato" e "está hospedado" são duas
 * afirmações diferentes, e só a segunda vale alguma coisa no dia em que um
 * terceiro tenta buscar a chave.
 *
 * Isso importa de um jeito específico aqui: quem consulta estas duas rotas
 * **não é o nosso app** — é o integrador que valida o nosso JWT, ou uma
 * biblioteca OIDC genérica que resolve `.well-known` na raiz do host. Se uma
 * delas quebrar, ninguém no nosso aplicativo percebe nada: a tela do tutor
 * continua normal. Quem percebe é o terceiro, mais tarde, quando o cache dele
 * vence e a rebusca falha — e nesse ponto a investigação começa do lado de
 * fora, sem log nosso para olhar primeiro.
 *
 * Subida mínima: só `registrarRotasDeDescoberta` é chamada, e não `main()` de
 * `src/bin/api.ts`. As duas rotas não leem banco (conferido em routes.ts: o
 * handler só chama `deps.assinador.jwks()` e monta um objeto estático), então
 * `auth` e `contrato` entram como valores que a função não usa — não há
 * conexão nenhuma para abrir. `assinador` é o de verdade
 * (`criarTokenSigner`), porque é ele quem decide quantas chaves saem no ar, e
 * é exatamente isso que o critério cobra.
 *
 * Duas iscas foram conferidas manualmente antes de este arquivo ser dado como
 * pronto (não ficam automatizadas aqui, porque cada uma exige desligar um
 * mecanismo de verdade, e não uma segunda cópia do teste):
 *
 *   (a) `criarTokenSigner` com uma configuração que só tem a chave ativa
 *       (equivalente a não configurar `JWT_NEXT_KID`) faz o caso "duas chaves
 *       com `kid` distintos" abaixo reprovar — `keys.length` vira 1.
 *   (b) colocar as duas rotas atrás de autenticação (editando `routes.ts`
 *       temporariamente, e só para este experimento) faz o caso "responde sem
 *       `Authorization`" reprovar com 401. `routes.ts` foi restaurado da cópia
 *       própria e o hash SHA-256 conferido contra o original antes de este
 *       arquivo ser commitado como prova.
 */
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

/**
 * Ambiente mínimo para `loadAppConfig()` subir, no mesmo espírito de
 * `rs256-token-signer.test.ts`: os valores são descartáveis, o que importa é
 * que `token` sai daqui do mesmo jeito que sai no processo de produção.
 * `DATABASE_URL` é só uma string aqui — `loadAppConfig()` não abre conexão
 * nenhuma, e as duas rotas sob teste não tocam banco.
 */
function ambiente(): Record<string, string> {
  return {
    // Nada de `localhost` nem de nome de regiao de provedor nesta bancada.
    // O portao de portabilidade varre `src/` e SO abre excecao para
    // `adapters/external/`, que e onde o ADR-0007 permite falar com provedor.
    // Este arquivo esta em `adapters/http/`, entao vale a regra cheia -- e ja
    // reprovou a esteira uma vez por isso. `.invalid` e reservado por RFC 2606
    // e nunca resolve, em lugar nenhum.
    //
    // Esta e a TERCEIRA copia desta bancada (as outras estao em
    // `app-config.test.ts` e em `rs256-token-signer.test.ts`). Vale extrair
    // quando aparecer a quarta.
    ENVIRONMENT: 'dev',
    DATABASE_URL: 'postgres://bichu:descartavel@db.exemplo.invalid:5432/bichu',
    PUBLIC_BASE_URL: 'http://api.exemplo.invalid:3000',
    // Separadas de PUBLIC_BASE_URL pelo ADR-0017 item 2, e obrigatorias desde
    // entao: a bancada precisa declara-las ou `loadAppConfig()` morre citando a
    // que faltou, que e o comportamento pedido pelos criterios 5 e 11.
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
    // 32 bytes: o piso que `app-config.ts` impoe ao segredo do webhook de
    // entrega. Ele e obrigatorio e sem padrao embutido, entao a bancada
    // precisa declara-lo -- a ausencia derruba `loadAppConfig()` com o nome
    // da variavel, que e o comportamento pedido pelos criterios 5 e 11.
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

/**
 * Sobe só o suficiente para exercitar as duas rotas de descoberta: o servidor
 * HTTP de verdade (`criarServidor`) e `registrarRotasDeDescoberta` de verdade,
 * sem `main()`, sem banco, sem as outras rotas de identidade.
 *
 * `auth` entra como `{}` porque o handler das duas rotas nunca o lê — é
 * `DependenciasDasRotas` inteiro que a assinatura de `registrarRotasDeDescoberta`
 * pede, e não o que o corpo da função usa. `contrato` é o de verdade
 * (`api/openapi.yaml`), porque carregá-lo não custa banco nem rede e prova de
 * quebra que a especificação ainda declara `security: []` nas duas operações —
 * `carregarContrato` reprova a subida se alguma operação ficar sem `security`.
 */
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

/** Só os seis campos que `api/openapi.yaml` declara para uma chave do JWKS. */
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

    // `minItems: 2` em api/openapi.yaml não é sugestão: é a promessa "sempre
    // duas chaves" do ADR-0002, e é ESTA linha que a confere de verdade — a
    // isca (a) descrita no cabeçalho do arquivo prova que ela reprova quando
    // só a chave ativa está publicada.
    assert.equal(corpo.keys.length, 2, 'o JWKS precisa publicar exatamente duas chaves (ativa + rotação)');

    const kids = corpo.keys.map((chave) => chave.kid);
    assert.equal(new Set(kids).size, 2, 'os dois `kid` precisam ser distintos entre si');
  });

  void it('não vaza material privado: cada chave só tem os campos públicos do JWK', async () => {
    const { app } = subirApp();
    const resposta = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });
    const corpo = resposta.json<{ keys: ChaveJwkNaResposta[] }>();

    for (const chave of corpo.keys) {
      // `d`, `p`, `q`, `dp`, `dq`, `qi` são o expoente privado e os fatores
      // primos: qualquer um deles no ar é a chave privada RSA inteira exposta
      // sem autenticação. A asserção é sobre o CONJUNTO exato de campos, e não
      // sobre a ausência de `d` isolada, porque um campo novo e inesperado
      // também merece parar o teste até alguém olhar.
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

    // Rota pública não pode ficar MENOS pública por causa de um cabeçalho
    // ruim: o cliente que manda um `Authorization` velho, corrompido ou de
    // outro emissor não pode perder acesso à própria chave de verificação. A
    // isca (b) descrita no cabeçalho do arquivo prova que este caso reprova
    // quando as rotas de descoberta passam a exigir autenticação.
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
