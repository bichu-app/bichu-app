/**
 * O que o token de acesso promete a quem não é o nosso app (BICHUS-15,
 * critérios 1 e 5).
 *
 * Estes quatro números e nomes — RS256, 15 minutos, `sub` igual ao UUID interno,
 * lista de emissores confiáveis — não são detalhe de implementação: eles são o
 * contrato que o Keycloak vai ter que honrar no dia da virada, e é por isso que
 * o teste afirma o VALOR e não "o que a configuração disser". Um teste que
 * lesse o TTL da configuração e o comparasse consigo mesmo passaria com o TTL em
 * 60 minutos, que é justamente o experimento que o QA de BICHUS-123 rodou e
 * deixou a suíte verde: quatro vezes mais tempo de vida para um token roubado,
 * sem nenhuma linha vermelha.
 *
 * A configuração vem de `loadAppConfig()`, e não de um objeto montado aqui, pelo
 * mesmo motivo: o que precisa ficar travado é o número que o processo de
 * produção carrega, não um número que este arquivo escolheu para si.
 */
import assert from 'node:assert/strict';
import { constants, createVerify, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import { loadAppConfig, type TokenConfig } from '../../../../shared/config/app-config.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { criarTokenSigner } from './rs256-token-signer.js';

const QUINZE_MINUTOS_EM_SEGUNDOS = 15 * 60;

/** O UUIDv7 interno de uma conta. É ele que precisa chegar ao `sub`. */
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

/**
 * Ambiente mínimo para a configuração subir. Os valores são descartáveis: o que
 * importa é que o `token` que sai daqui é o mesmo objeto que o processo de
 * produção monta, com os mesmos números embutidos no código.
 */
function ambiente(): Record<string, string> {
  return {
    ENVIRONMENT: 'dev',
    DATABASE_URL: 'postgres://bichu:descartavel@localhost:5432/bichu',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    // Obrigatorias desde o ADR-0017 item 2. Aqui elas nao mudam nada do que
    // este arquivo prova; existem porque sem elas a configuracao nao sobe.
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
    OBJECT_STORAGE_REGION: 'us-east-1',
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

void describe('token de acesso emitido (BICHUS-15, critério 1)', () => {
  void it('o access token vale exatamente 15 minutos', () => {
    const config = configuracaoDoToken();
    const emitido = criarTokenSigner(config).emitir(USUARIO, AGORA, 'jti-1');
    const { corpo } = abrir(emitido.token);
    const iat = corpo['iat'] as number;
    const exp = corpo['exp'] as number;

    // O TTL é o teto de tempo em que uma revogação AINDA não alcançou o token
    // de acesso. Esticá-lo para 60 minutos dá a quem roubou o token 45 minutos
    // a mais de conta alheia depois de o titular trocar a senha — e nada na
    // tela do titular denuncia isso.
    assert.equal(exp - iat, QUINZE_MINUTOS_EM_SEGUNDOS);
    assert.equal(iat, Math.floor(AGORA / 1000));
    // O mesmo número vai para `expires_in` da resposta: é por ele que o app
    // decide quando renovar, e divergir aqui deixa o app renovando tarde.
    assert.equal(emitido.expiresInSeconds, QUINZE_MINUTOS_EM_SEGUNDOS);
  });

  void it('o `sub` é o UUID interno do usuário, e não um apelido nem o e-mail', () => {
    const config = configuracaoDoToken();
    const emitido = criarTokenSigner(config).emitir(USUARIO, AGORA, 'jti-2');

    // É este detalhe que compra a liberdade de trocar o emissor: no dia do
    // Keycloak, os usuários nascem lá com o `id` forçado igual ao nosso e o
    // `sub` continua sendo o mesmo valor. Um `sub` que fosse e-mail obrigaria
    // a reescrever toda linha de auditoria quando alguém troca de endereço.
    assert.equal(abrir(emitido.token).corpo['sub'], USUARIO);
  });

  void it('o cabeçalho diz RS256, e a assinatura é mesmo RSA da chave ativa', () => {
    const config = configuracaoDoToken();
    const emitido = criarTokenSigner(config).emitir(USUARIO, AGORA, 'jti-3');
    const { cabecalho, dadosAssinados, assinatura } = abrir(emitido.token);

    // RS256 e nunca HS256: com chave simétrica, quem valida também emite — e
    // aí o serviço que só deveria conferir o token do tutor passa a poder
    // fabricar o de qualquer pessoa. É a porta que fecharia o Keycloak.
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

    // O token é assinado com a NOSSA chave e traz a nossa audiência: só o `iss`
    // é de outro. Sem a lista de emissores confiáveis, um serviço interno que
    // um dia ganhe a chave — ou o próprio Keycloak mal configurado — emite
    // token para qualquer conta e o backend obedece.
    const emissorEstranho = criarTokenSigner({
      ...config,
      issuer: 'https://keycloak.que-ninguem-configurou.test',
    });
    const forjado = emissorEstranho.emitir(USUARIO, AGORA, 'jti-4');

    const resultado = criarTokenSigner(config).verificar(forjado.token, AGORA);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.ok === false && resultado.motivo, 'emissor_nao_confiavel');
  });

  void it('aceita o token do emissor que está na lista', () => {
    // O contrapeso: sem ele, uma verificação que recusasse TUDO passaria no
    // caso acima e ninguém conseguiria entrar no aplicativo.
    const config = configuracaoDoToken();
    const assinador = criarTokenSigner(config);
    const emitido = assinador.emitir(USUARIO, AGORA, 'jti-5');

    const resultado = assinador.verificar(emitido.token, AGORA);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.ok === true && resultado.claims.sub, USUARIO);
  });

  void it('recusa o token cujo cabeçalho troca o algoritmo, mesmo com o resto intacto', () => {
    const config = configuracaoDoToken();
    const assinador = criarTokenSigner(config);
    const emitido = assinador.emitir(USUARIO, AGORA, 'jti-6');
    const { corpo, assinatura } = abrir(emitido.token);

    // Confusão de algoritmo: com o JWKS público, aceitar HS256 permite assinar
    // um token usando a nossa chave PÚBLICA como segredo HMAC — e a conferência
    // fecha. É velha e continua acontecendo porque a biblioteca aceita por
    // padrão. Aqui o `alg` é conferido antes de qualquer outra coisa.
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
