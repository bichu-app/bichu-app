/**
 * Testes da subida da configuração, com foco na promessa de **"Sempre duas
 * chaves"** do `GET /.well-known/jwks.json` (BICHUS-124, critério 2).
 */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import {
  loadAppConfig,
  PRAZO_CURTO_DO_ARMAZENAMENTO_MS,
  PRAZO_DE_TRANSFERENCIA_DO_ARMAZENAMENTO_MS,
  VAZAO_MINIMA_DO_ARMAZENAMENTO_BYTES_POR_SEGUNDO,
} from './app-config.js';
import { TETO_DE_BYTES } from '../../modules/media/domain/chave-de-objeto.js';

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

/** Ambiente mínimo para `loadAppConfig()` chegar até a leitura das chaves. */
function ambienteCompleto(): Record<string, string> {
  return {
    ENVIRONMENT: 'dev',
    DATABASE_URL: 'postgres://bichu:descartavel@db.exemplo.invalid:5432/bichu',
    PUBLIC_BASE_URL: 'http://api.exemplo.invalid:3000',
    TAG_BASE_URL: 'https://tag.exemplo.invalid',
    WEB_BASE_URL: 'https://exemplo.invalid',
    API_BASE_URL: 'http://api.exemplo.invalid:3000',
    MEDIA_PUBLIC_BASE_URL: 'http://midia.exemplo.invalid:9000',
    TOKEN_ISSUER: 'http://api.exemplo.invalid:3000',
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
    MAIL_TRANSPORT: 'smtp',
    MAIL_API_TOKEN: 'token-de-bancada-que-nao-autentica',
    PUSH_TRANSPORT: 'log',
    FCM_PROJECT: 'projeto-de-teste',
  };
}

const CHAVES_DO_AMBIENTE = [
  ...Object.keys(ambienteCompleto()),
  'NODE_ENV',
  'OBJECT_STORAGE_TIMEOUT_MS',
  'OBJECT_STORAGE_TRANSFER_TIMEOUT_MS',
];
const ORIGINAL = new Map(CHAVES_DO_AMBIENTE.map((nome) => [nome, process.env[nome]]));

/** Aplica o ambiente do caso. */
function aplicar(ambiente: Record<string, string | undefined>): void {
  for (const nome of CHAVES_DO_AMBIENTE) {
    const valor = ambiente[nome];
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
}

function semChaveDeRotacao(extras: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    ...ambienteCompleto(),
    JWT_NEXT_KID: undefined,
    JWT_NEXT_PRIVATE_KEY: undefined,
    ...extras,
  };
}

afterEach(() => {
  for (const [nome, valor] of ORIGINAL) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
});

void describe('JWKS: o contrato promete duas chaves e a subida garante', () => {
  void it('ENVIRONMENT=prod sem a chave de rotação: a subida morre citando JWT_NEXT_KID', () => {
    aplicar(semChaveDeRotacao({ ENVIRONMENT: 'prod' }));
    assert.throws(loadAppConfig, /JWT_NEXT_KID/);
  });

  void it('preprod também exige: é dela que o outro time consome o JWKS', () => {
    aplicar(semChaveDeRotacao({ ENVIRONMENT: 'preprod' }));
    assert.throws(loadAppConfig, /JWT_NEXT_KID/);
  });

  void it('NODE_ENV=production exige mesmo com ENVIRONMENT dizendo outra coisa', () => {
    aplicar(semChaveDeRotacao({ ENVIRONMENT: 'dev', NODE_ENV: 'production' }));
    assert.throws(loadAppConfig, /JWT_NEXT_KID/);
  });

  void it('com o kid presente e o PEM ausente, a mensagem nomeia o PEM, e não o kid', () => {
    aplicar(semChaveDeRotacao({ ENVIRONMENT: 'prod', JWT_NEXT_KID: 'teste-rotacao' }));
    assert.throws(loadAppConfig, /JWT_NEXT_PRIVATE_KEY/);
  });

  void it('com as duas chaves, o JWKS publica a ativa e a de rotação, nesta ordem', () => {
    aplicar({ ...ambienteCompleto(), ENVIRONMENT: 'prod' });
    const config = loadAppConfig();
    assert.deepEqual(
      config.token.allKeys.map((chave) => chave.kid),
      ['teste-ativa', 'teste-rotacao'],
    );
  });

  void it('dev continua subindo com uma chave só: a guarda não vaza para quem desenvolve', () => {
    aplicar(semChaveDeRotacao({ ENVIRONMENT: 'dev', NODE_ENV: undefined }));
    const config = loadAppConfig();
    assert.equal(config.token.allKeys.length, 1);
  });
});

void describe('MAIL_TRANSPORT: valor desconhecido nao vira envio real', () => {

  void it('recusa na subida, citando o valor visto', () => {
    aplicar({ ...ambienteCompleto(), MAIL_TRANSPORT: 'mailpit' });
    assert.throws(
      () => loadAppConfig(),
      (erro: unknown) =>
        erro instanceof Error &&
        erro.message.includes('mailpit') &&
        erro.message.includes('MAIL_TRANSPORT'),
      'REPROVA: valor desconhecido passou, e passar aqui significa mandar e-mail de verdade.',
    );
  });

  void it('ISCA: `postmark` e ACEITO na subida, e chega ao `MailConfig`', () => {
    aplicar({ ...ambienteCompleto(), MAIL_TRANSPORT: 'postmark' });
    const config = loadAppConfig();
    assert.equal(
      config.mail.transport,
      'postmark',
      'REPROVA: `postmark` nao e um transporte aceito, e o unico caminho de entrega ' +
        'real do produto (ADR-0009) nao sobe.',
    );
    assert.equal(
      config.mail.apiToken,
      'token-de-bancada-que-nao-autentica',
      'REPROVA: o transporte subiu sem o token do provedor chegar ao `MailConfig`. ' +
        'O adaptador emitiria cabecalho sem credencial e colheria 401 no primeiro ' +
        'pedido de redefinicao de senha de alguem.',
    );
  });

  void it('ISCA: `postmark` SEM MAIL_API_TOKEN nao sobe, e a falha cita a variavel', () => {
    aplicar({ ...ambienteCompleto(), MAIL_TRANSPORT: 'postmark', MAIL_API_TOKEN: undefined });
    assert.throws(
      () => loadAppConfig(),
      (erro: unknown) => erro instanceof Error && erro.message.includes('MAIL_API_TOKEN'),
      'REPROVA: o processo subiu com o transporte do provedor e sem o token dele. A ' +
        'falha apareceria no primeiro pedido de redefinicao de senha, em producao.',
    );
  });

  void it('`smtp` e `log` sobem, e ausente vale `smtp`', () => {
    for (const [valor, esperado] of [
      ['smtp', 'smtp'],
      ['log', 'log'],
    ] as const) {
      aplicar({ ...ambienteCompleto(), MAIL_TRANSPORT: valor });
      assert.equal(loadAppConfig().mail.transport, esperado);
    }
    aplicar({ ...ambienteCompleto(), MAIL_TRANSPORT: undefined });
    assert.equal(loadAppConfig().mail.transport, 'smtp');
  });

  void it('o token do provedor NAO e exigido com `smtp` nem com `log`', () => {
    for (const valor of ['smtp', 'log'] as const) {
      aplicar({ ...ambienteCompleto(), MAIL_TRANSPORT: valor, MAIL_API_TOKEN: undefined });
      const config = loadAppConfig();
      assert.equal(config.mail.transport, valor);
      assert.equal(
        config.mail.apiToken,
        undefined,
        '`undefined` e o valor certo aqui: e assim que se le, do proprio tipo, que ' +
          'nenhum envio autentica em provedor nenhum.',
      );
    }
  });
});

/** `PUSH_TRANSPORT` e `FCM_PROJECT` (ADR-0008). */
void describe('PUSH_TRANSPORT: valor desconhecido não sobe, e `log` não vira envio real', () => {
  void it('recusa na subida, citando o valor visto E os dois aceitos', () => {
    aplicar({ ...ambienteCompleto(), PUSH_TRANSPORT: 'firebase' });
    assert.throws(
      () => loadAppConfig(),
      (erro: unknown) =>
        erro instanceof Error &&
        erro.message.includes('firebase') &&
        erro.message.includes('PUSH_TRANSPORT') &&
        erro.message.includes('"log"') &&
        erro.message.includes('"fcm"'),
      'REPROVA: valor desconhecido passou. Passar aqui é o defeito de MAIL_TRANSPORT ' +
        'repetido num canal que toca o telefone de um tutor e não desfaz.',
    );
  });

  void it('um erro de digitação no valor certo também morre, e não vira o outro', () => {
    for (const valor of ['logs', 'Log', 'FCM', 'log ']) {
      aplicar({ ...ambienteCompleto(), PUSH_TRANSPORT: valor });
      assert.throws(() => loadAppConfig(), /PUSH_TRANSPORT/, `"${valor}" subiu`);
    }
  });

  void it('`fcm` sem FCM_PROJECT: a subida morre citando FCM_PROJECT', () => {
    aplicar({ ...ambienteCompleto(), PUSH_TRANSPORT: 'fcm', FCM_PROJECT: undefined });
    assert.throws(loadAppConfig, /FCM_PROJECT/);
  });

  void it('`fcm` com o projeto sobe, e o projeto chega à configuração', () => {
    aplicar({ ...ambienteCompleto(), PUSH_TRANSPORT: 'fcm' });
    const config = loadAppConfig();
    assert.equal(config.push.transport, 'fcm');
    assert.equal(config.push.projeto, 'projeto-de-teste');
  });

  void it('`log` e `fcm` sobem, e ausente vale `log`', () => {
    aplicar({ ...ambienteCompleto(), PUSH_TRANSPORT: 'log' });
    assert.equal(loadAppConfig().push.transport, 'log');

    aplicar({ ...ambienteCompleto(), PUSH_TRANSPORT: undefined });
    assert.equal(loadAppConfig().push.transport, 'log');
  });

  void it('`log` não exige o projeto: rodar `npm test` não depende de conta do Firebase', () => {
    aplicar({ ...ambienteCompleto(), PUSH_TRANSPORT: 'log', FCM_PROJECT: undefined });
    const config = loadAppConfig();
    assert.equal(config.push.transport, 'log');
    assert.equal(config.push.projeto, undefined);
  });

  void it('ambiente hospedado com `log` continua subindo: é o estado de homologação hoje', () => {
    aplicar({
      ...ambienteCompleto(),
      ENVIRONMENT: 'preprod',
      PUSH_TRANSPORT: 'log',
      FCM_PROJECT: undefined,
    });
    assert.doesNotThrow(loadAppConfig);
  });
});

/** As bases que o ADR-0017 item 2 separou de `PUBLIC_BASE_URL`. */
void describe('TAG_BASE_URL e WEB_BASE_URL: a separação que registra o irreversível', () => {
  void it('sem TAG_BASE_URL a subida morre citando TAG_BASE_URL', () => {
    aplicar({ ...ambienteCompleto(), TAG_BASE_URL: undefined });
    assert.throws(loadAppConfig, /TAG_BASE_URL/);
  });

  void it('sem WEB_BASE_URL a subida morre citando WEB_BASE_URL', () => {
    aplicar({ ...ambienteCompleto(), WEB_BASE_URL: undefined });
    assert.throws(loadAppConfig, /WEB_BASE_URL/);
  });

  void it('base sem esquema é recusada: `host/t/codigo` não é endereço que leitor de QR abra', () => {
    aplicar({ ...ambienteCompleto(), TAG_BASE_URL: 'tag.exemplo.invalid' });
    assert.throws(loadAppConfig, /TAG_BASE_URL/);
  });

  void it('base com consulta é recusada: o `?` engole o `/t/{código}` em silêncio', () => {
    aplicar({ ...ambienteCompleto(), TAG_BASE_URL: 'https://tag.exemplo.invalid?de=cartaz' });
    assert.throws(loadAppConfig, /TAG_BASE_URL/);
  });

  void it('domínios diferentes derrubam a subida: a plaquinha não aponta para casa de terceiro', () => {
    aplicar({ ...ambienteCompleto(), WEB_BASE_URL: 'https://outra-casa.invalid' });
    assert.throws(loadAppConfig, /TAG_BASE_URL|WEB_BASE_URL/);
  });

  void it('http na base da tag derruba ambiente hospedado: o esquema vai codificado junto', () => {
    aplicar({
      ...ambienteCompleto(),
      ENVIRONMENT: 'preprod',
      TAG_BASE_URL: 'http://tag.exemplo.invalid',
    });
    assert.throws(loadAppConfig, /TAG_BASE_URL/);
  });

  void it('http continua valendo em dev: guarda que atrapalha quem desenvolve vira contorno no .zshrc', () => {
    aplicar({ ...ambienteCompleto(), TAG_BASE_URL: 'http://tag.exemplo.invalid' });
    assert.doesNotThrow(loadAppConfig);
  });

  void it('hosts diferentes no mesmo domínio sobem, que é a decisão do cliente de 19/09', () => {
    aplicar(ambienteCompleto());
    const config = loadAppConfig();
    assert.notEqual(config.tagBaseUrl, config.webBaseUrl);
    assert.notEqual(config.tagBaseUrl, config.publicBaseUrl);
    assert.notEqual(config.webBaseUrl, config.publicBaseUrl);
  });

  void it('a barra do fim é aparada: `base//t/codigo` é outro endereço', () => {
    aplicar({ ...ambienteCompleto(), TAG_BASE_URL: 'https://tag.exemplo.invalid/' });
    assert.equal(loadAppConfig().tagBaseUrl, 'https://tag.exemplo.invalid');
  });
});

/** `TAG_CODE_INDEX_KEY`: a chave do índice cego (ADR-0004, Emenda 1, §3.1). */
void describe('TAG_CODE_INDEX_KEY: índice cego ausente não degrada, derruba a subida', () => {
  void it('ausente: a subida morre citando a variável', () => {
    aplicar({ ...ambienteCompleto(), TAG_CODE_INDEX_KEY: undefined });
    assert.throws(loadAppConfig, /TAG_CODE_INDEX_KEY/);
  });

  void it('curta: 16 bytes não viram uma chave mais fraca, viram recusa', () => {
    aplicar({ ...ambienteCompleto(), TAG_CODE_INDEX_KEY: 'd2'.repeat(16) });
    assert.throws(loadAppConfig, /TAG_CODE_INDEX_KEY/);
  });

  void it('a mensagem diz o tamanho visto, porque é isso que o operador conserta', () => {
    aplicar({ ...ambienteCompleto(), TAG_CODE_INDEX_KEY: 'd2'.repeat(16) });
    assert.throws(loadAppConfig, /16/);
  });

  void it('é DIFERENTE de TAG_CODE_KEY: a mesma chave cifrando e indexando é um erro', () => {
    aplicar({ ...ambienteCompleto(), TAG_CODE_INDEX_KEY: 'c1'.repeat(32) });
    assert.throws(loadAppConfig, /TAG_CODE_INDEX_KEY/);
  });

  void it('com 32 bytes em hexadecimal, sobe e entrega os bytes', () => {
    aplicar(ambienteCompleto());
    const config = loadAppConfig();
    assert.equal(config.tagCodeIndexKey.length, 32);
    assert.equal(config.tagCodeIndexKey.toString('hex'), 'd2'.repeat(32));
  });
});

void describe('Prazos do armazenamento de objeto: toda chamada de rede termina', () => {
  void it('ausentes, valem os padrões: 5 s para metadado, 45 s para transferência', () => {
    aplicar(ambienteCompleto());
    const { objectStorage } = loadAppConfig();
    assert.equal(objectStorage.prazoCurtoMs, 5_000);
    assert.equal(objectStorage.prazoDeTransferenciaMs, 45_000);
  });

  void it('o prazo de transferência cobre o maior objeto aceito na vazão mínima', () => {
    const necessario =
      (TETO_DE_BYTES / VAZAO_MINIMA_DO_ARMAZENAMENTO_BYTES_POR_SEGUNDO) * 1000 + PRAZO_CURTO_DO_ARMAZENAMENTO_MS;
    assert.ok(
      PRAZO_DE_TRANSFERENCIA_DO_ARMAZENAMENTO_MS >= necessario,
      `prazo de ${String(PRAZO_DE_TRANSFERENCIA_DO_ARMAZENAMENTO_MS)} ms < ${String(necessario)} ms exigidos por TETO_DE_BYTES`,
    );
  });

  void it('o ambiente sobrepõe os dois', () => {
    aplicar({
      ...ambienteCompleto(),
      OBJECT_STORAGE_TIMEOUT_MS: '1500',
      OBJECT_STORAGE_TRANSFER_TIMEOUT_MS: '120000',
    });
    const { objectStorage } = loadAppConfig();
    assert.equal(objectStorage.prazoCurtoMs, 1500);
    assert.equal(objectStorage.prazoDeTransferenciaMs, 120_000);
  });

  for (const invalido of ['0', '-1', '30s', '1.5', 'abc']) {
    void it(`${JSON.stringify(invalido)} derruba a subida citando a variável, em vez de cair no padrão`, () => {
      aplicar({ ...ambienteCompleto(), OBJECT_STORAGE_TRANSFER_TIMEOUT_MS: invalido });
      assert.throws(loadAppConfig, /OBJECT_STORAGE_TRANSFER_TIMEOUT_MS/);
    });
  }
});
