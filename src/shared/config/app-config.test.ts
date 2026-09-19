/**
 * Testes da subida da configuração, com foco na promessa de **"Sempre duas
 * chaves"** do `GET /.well-known/jwks.json` (BICHUS-124, critério 2).
 *
 * O caso que importa é negativo, e é fácil escrever um teste que não o pega: um
 * teste que só confere `allKeys.length === 2` depois de preencher as quatro
 * variáveis passaria com a guarda arrancada, porque as chaves estariam lá de
 * qualquer jeito. O que prova a guarda é a SUBIDA QUE MORRE quando a chave de
 * rotação falta num ambiente hospedado — e morre citando o nome exato da
 * variável, que é o que o operador precisa ler para consertar.
 *
 * O último caso é o contrapeso: `dev` continua subindo com uma chave só. Guarda
 * que vaza para a máquina de quem desenvolve vira `export JWT_NEXT_...` no
 * `.zshrc` de todo mundo, e aí ela não guarda mais nada.
 */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import { loadAppConfig } from './app-config.js';

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
 * Ambiente mínimo para `loadAppConfig()` chegar até a leitura das chaves. Os
 * valores não são segredo de lugar nenhum: são descartáveis e existem só para
 * que a primeira coisa a faltar seja a que o teste quer ver faltar.
 *
 * **Nenhum `localhost` e nenhum nome de região de provedor aqui, de propósito.**
 * O portão de portabilidade (`infra/verificacao/verificar_portabilidade.py`)
 * varre `src/` inteiro, e arquivo de teste não é exceção — e não deve ser. Um
 * `us-east-1` escrito num teste hoje é o `us-east-1` que alguém copia para o
 * código amanhã, e o ADR-0007 existe para que a nuvem continue sendo escolha e
 * não fato consumado. `.invalid` é reservado por RFC 2606 justamente para isto:
 * nunca resolve, em lugar nenhum.
 */
function ambienteCompleto(): Record<string, string> {
  return {
    ENVIRONMENT: 'dev',
    DATABASE_URL: 'postgres://bichu:descartavel@db.exemplo.invalid:5432/bichu',
    PUBLIC_BASE_URL: 'http://api.exemplo.invalid:3000',
    API_BASE_URL: 'http://api.exemplo.invalid:3000',
    MEDIA_PUBLIC_BASE_URL: 'http://midia.exemplo.invalid:9000',
    TOKEN_ISSUER: 'http://api.exemplo.invalid:3000',
    JWT_ACTIVE_KID: 'teste-ativa',
    JWT_ACTIVE_PRIVATE_KEY: PEM_ATIVA,
    JWT_NEXT_KID: 'teste-rotacao',
    JWT_NEXT_PRIVATE_KEY: PEM_ROTACAO,
    IP_HMAC_KEY: Buffer.alloc(32, 7).toString('base64'),
    TAG_CODE_KEY: 'c1'.repeat(32),
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
    MAIL_TRANSPORT: 'smtp',
  };
}

const CHAVES_DO_AMBIENTE = [...Object.keys(ambienteCompleto()), 'NODE_ENV'];
const ORIGINAL = new Map(CHAVES_DO_AMBIENTE.map((nome) => [nome, process.env[nome]]));

/**
 * Aplica o ambiente do caso. `undefined` APAGA a variável em vez de escrevê-la
 * vazia — e a diferença não é cosmética: `optionalEnv` trata string vazia como
 * ausente, mas um `JWT_NEXT_KID=` herdado do processo que roda o teste passaria
 * despercebido se a limpeza fosse por cima.
 */
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
    // A imagem de produção do Dockerfile define NODE_ENV e pode não definir
    // ENVIRONMENT. Se a guarda olhasse só o rótulo, o ambiente que mais precisa
    // dela seria justamente o que escaparia.
    aplicar(semChaveDeRotacao({ ENVIRONMENT: 'dev', NODE_ENV: 'production' }));
    assert.throws(loadAppConfig, /JWT_NEXT_KID/);
  });

  void it('com o kid presente e o PEM ausente, a mensagem nomeia o PEM, e não o kid', () => {
    // Nomear a variável errada custa uma rodada de implantação inteira: o
    // operador preenche o que a mensagem pediu e a subida morre de novo.
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
  // A forma anterior era `=== 'log' ? 'log' : 'smtp'`, entao TODO valor fora
  // dos dois virava envio real em silencio. O `.env` desta maquina estava em
  // `MAIL_TRANSPORT=mailpit` -- um valor que ninguem definiu, que parecia dizer
  // "manda para o receptor local" e que dizia "manda para o mundo". So nao doeu
  // porque o host apontava para o mailpit.
  //
  // Estes casos existem porque a correcao entrou SEM TESTE em 19/09, e o QA
  // reprovou por isso. Conferir a mao nao e regressao: amanha ninguem confere.

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

  void it('`postmark` ganha mensagem propria, porque o roteiro mandava usa-lo', () => {
    // O roteiro de provisionamento dizia `MAIL_TRANSPORT=postmark` para
    // homologacao. Quem seguir uma versao antiga cai aqui, e uma mensagem
    // generica o faria duvidar da instrucao em vez de entender o estado: a
    // chave pode estar no cofre, mas o adaptador nao existe (ADR-0009).
    aplicar({ ...ambienteCompleto(), MAIL_TRANSPORT: 'postmark' });
    assert.throws(
      () => loadAppConfig(),
      (erro: unknown) => erro instanceof Error && erro.message.includes('ADR-0009'),
      'REPROVA: `postmark` caiu na mensagem generica, e quem seguiu o roteiro fica sem saber por que.',
    );
  });

  // Contrapesos. Sem eles, uma implementacao que recusasse TUDO passaria nos
  // dois casos acima -- e recusar tudo tambem derruba a subida.
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
});
