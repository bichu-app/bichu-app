/**
 * O teto das duas confirmacoes por link (`confirmEmailVerification` e
 * `confirmPasswordReset`), medido pelo EFEITO sobre quem age de boa-fe.
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO PROVA, E POR QUE A DECLARACAO NAO BASTA
 * ===========================================================================
 * O contrato (`api/openapi.yaml`) declara, nas duas operacoes:
 *
 *   dimension [ip], limit 20, window 1h, on_exceed deny_429,
 *   applies_to invalid_attempts
 *
 * e o codigo declarava a MESMA entrada **sem** `appliesTo`. O teste de
 * declaracao (`src/shared/http/rotas-registradas-contra-o-contrato.test.ts`)
 * acusa essa diferenca de texto, e fica verde no instante em que os dois
 * arquivos batem. Verde ali nao prova nada sobre a pessoa: ele compara dois
 * documentos, nao duas respostas HTTP.
 *
 * A qualificacao muda o mecanismo, e nao a redacao. Sem `appliesTo` a entrada
 * vai por `hit()` (`shared/http/aplicacao-de-teto.ts`, `aplicarNaEntrada`) e
 * conta TODA requisicao: "20 tentativas invalidas por hora" vira "20
 * requisicoes por hora". Com `appliesTo: 'invalid_attempts'` a entrada e
 * CONSULTADA na chegada (`peek`) e so incrementada depois, em `onResponse`,
 * quando a resposta foi uma recusa de credencial
 * (`registrar-rota.ts`, `TIPOS_DE_TENTATIVA_INVALIDA`).
 *
 * A diferenca aparece em quem confirma o link CERTO:
 *
 *   | requisicoes validas seguidas, mesmo IP | sem appliesTo | com appliesTo |
 *   |---|---|---|
 *   | 1..20                                  | 200           | 200           |
 *   | 21                                     | **429**       | 200           |
 *
 * E `ip` e a dimensao. Vinte e uma confirmacoes de boa-fe atras do mesmo
 * endereco nao sao um ataque: sao vinte e uma pessoas no CGNAT de uma operadora
 * movel, ou no escritorio, ou na mesma rede do predio — e a vigesima primeira
 * fica trancada para fora da confirmacao que estava tentando fazer, sem ter
 * errado nada. O proprio `aplicacao-de-teto.ts` escreve isso na justificativa
 * da dimensao `ip_24`: "teto por IP puro e armadilha no Brasil".
 *
 * ===========================================================================
 * AS DUAS ARMADILHAS QUE ESTE ARQUIVO PRECISA DESVIAR
 * ===========================================================================
 * **1. "Alguma chamada levou 429" nao mede nada.** A recusa existe nos dois
 * mundos; o que muda e QUEM a recebe e EM QUE POSICAO. Por isso os dois casos
 * de cada operacao afirmam posicao: as validas nao param NUNCA dentro da
 * janela medida, e a INVALIDA de numero 21 para. Medir presenca deixaria a
 * regressao passar inteira.
 *
 * **2. A ORDEM DOS CASOS DENTRO DE CADA BLOCO E CARREGADA DE SENTIDO.** O
 * balde e por `operationId` + dimensao, entao os dois casos de uma mesma
 * operacao dividem o MESMO balde. Depois de 20 invalidas, `peek` recusa
 * tambem a valida — o que e o comportamento correto e desejado, e nao um
 * defeito. O caso das validas roda PRIMEIRO, com o balde zerado, porque e ele
 * que mede o dano; inverter a ordem faria o caso das validas reprovar por um
 * motivo que nao e o que ele investiga. `node:test` roda os `it` de um
 * `describe` em serie e na ordem em que foram escritos.
 *
 * ===========================================================================
 * O NUMERO E LITERAL, E A FONTE ESTA CITADA
 * ===========================================================================
 * `TETO` e 20 escrito aqui, com fonte no contrato, e nao
 * `rotaDeConfirmacaoDeEmail.rateLimit[0].limit`. Esperado que sai do mesmo
 * lugar que se exercita e tautologia: trocar 20 por 200 na rota passaria,
 * porque o teste teria passado a cobrar 200. O terceiro caso de cada bloco
 * fecha o outro lado da pinca, comparando a declaracao contra o literal.
 *
 * O CAMINHO, ao contrario do numero, sai da declaracao: caminho escrito a mao
 * vira 404 em silencio, e 404 nao e 429 nem 200.
 *
 * Contrato: `api/openapi.yaml`, `confirmEmailVerification` e
 * `confirmPasswordReset`. Mecanismo: ADR-0016 e emenda 1.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hmacDeEnderecoIp } from '../../src/shared/crypto/digest.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import type { RateLimitEntry } from '../../src/shared/http/route-definition.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { UserId } from '../../src/shared/types/brands.js';
import type {
  RegistradorDeRotas,
  VerificadorDeReautenticacao,
} from '../../src/shared/http/registrar-rota.js';
import { criarTrilhaDeAuditoria } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import {
  criarVerificadorDeReautenticacao,
  registrarRotasDeIdentidade,
  rotaDeConfirmacaoDeEmail,
  rotaDeConfirmacaoDeRedefinicao,
  rotaDePedidoDeRedefinicao,
  type DependenciasDasRotas,
} from '../../src/modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../../src/modules/identity/application/aviso-de-reuso.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';

const PREFIXO_DA_API = '/v1';
const DOMINIO_DE_TESTE = 'exemplo.invalid';
const SENHA = 'chuva-morna-no-telhado-47';
const SENHA_NOVA = 'barco-lento-na-manha-63';

/** Da DECLARACAO, nunca escrito a mao: caminho errado vira 404 em silencio. */
const CONFIRMACAO_DE_EMAIL = rotaDeConfirmacaoDeEmail.path;
const CONFIRMACAO_DE_REDEFINICAO = rotaDeConfirmacaoDeRedefinicao.path;
const PEDIDO_DE_REDEFINICAO = rotaDePedidoDeRedefinicao.path;

/**
 * O teto por IP das duas confirmacoes, literal e com fonte.
 *
 * Fonte: `api/openapi.yaml`, operacoes `confirmEmailVerification` e
 * `confirmPasswordReset`, unica entrada de `x-rate-limit` (`dimension: [ip]`,
 * `limit: 20`, `window: 1h`, `on_exceed: deny_429`,
 * `applies_to: invalid_attempts`).
 *
 * NAO sai de `rota*.rateLimit`, e a distancia e o ponto.
 */
const TETO = 20;

/** `limit + 1`: a primeira chamada que o teto alcanca, se ele contasse tudo. */
const ALEM_DO_TETO = TETO + 1;

let app: RegistradorDeRotas;
let banco: { db: Db; close: () => Promise<void> };
let base: string;
const contas: UserId[] = [];
const caixaDeEntrada: Mensagem[] = [];

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
  readonly retryAfter: string | null;
}

async function chamar(
  caminho: string,
  opcoes: { metodo: 'POST'; corpo?: unknown },
): Promise<Resposta> {
  const cabecalhos: Record<string, string> = { accept: 'application/json' };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';

  const resposta = await fetch(`${base}${PREFIXO_DA_API}${caminho}`, {
    method: opcoes.metodo,
    headers: cabecalhos,
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    corpo: texto === '' ? undefined : JSON.parse(texto),
    retryAfter: resposta.headers.get('retry-after'),
  };
}

function tipoDoProblema(corpo: unknown): string {
  const tipo = (corpo as { type?: unknown }).type;
  return typeof tipo === 'string' ? (tipo.split('/').pop() ?? '') : '';
}

/**
 * Um token que passa no esquema (20..256 caracteres) e NAO existe no banco.
 *
 * O tamanho importa: um token curto reprovaria na validacao de esquema e sairia
 * `validation-failed`, que **nao** esta em `TIPOS_DE_TENTATIVA_INVALIDA` e
 * portanto nao seria contado. O caso das invalidas mediria o nada, verde.
 */
function tokenQueNaoExiste(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Cadastra e devolve o token de verificacao que saiu no e-mail do cadastro.
 *
 * O envio acontece dentro de `cadastrar` (BICHUS-147), entao nao ha um segundo
 * pedido a fazer — e nao gastar `POST /auth/email-verification` e o que mantem
 * este arquivo medindo o teto da CONFIRMACAO e nao o do pedido.
 */
async function contaNovaComTokenDeEmail(rotulo: string): Promise<string> {
  const antes = caixaDeEntrada.length;
  const email = `link-${rotulo}-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
  const cadastro = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: { email, password: SENHA },
  });
  assert.equal(
    cadastro.status,
    201,
    `a conta ${email} nao foi criada (${String(cadastro.status)}): ` +
      `${JSON.stringify(cadastro.corpo)}. Sem conta nova nao ha token novo, e sem token ` +
      'novo este arquivo mediria confirmacao invalida achando que mede valida.',
  );
  contas.push((cadastro.corpo as { user: { id: string } }).user.id as UserId);

  const mensagem = caixaDeEntrada[antes];
  assert.ok(
    mensagem !== undefined,
    `nenhuma mensagem de verificacao saiu no cadastro de ${email}.`,
  );
  const achado = /verificar-email\?token=([^\s]+)/.exec(mensagem.corpo);
  const token = achado?.[1];
  assert.ok(
    token !== undefined,
    `o corpo da mensagem de verificacao nao traz o link no formato esperado: ${mensagem.corpo}`,
  );
  return token;
}

/** Cadastra, pede a redefinicao e devolve o token do link do e-mail. */
async function contaNovaComTokenDeRedefinicao(rotulo: string): Promise<string> {
  const email = `reset-${rotulo}-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
  const cadastro = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: { email, password: SENHA },
  });
  assert.equal(
    cadastro.status,
    201,
    `a conta ${email} nao foi criada (${String(cadastro.status)}): ` +
      `${JSON.stringify(cadastro.corpo)}`,
  );
  contas.push((cadastro.corpo as { user: { id: string } }).user.id as UserId);

  const antes = caixaDeEntrada.length;
  const pedido = await chamar(PEDIDO_DE_REDEFINICAO, { metodo: 'POST', corpo: { email } });
  assert.equal(
    pedido.status,
    202,
    `o pedido de redefinicao de ${email} respondeu ${String(pedido.status)}: ` +
      `${JSON.stringify(pedido.corpo)}`,
  );

  const mensagem = caixaDeEntrada[antes];
  assert.ok(mensagem !== undefined, `nenhuma mensagem de redefinicao saiu para ${email}.`);
  const achado = /redefinir-senha\?token=([^\s]+)/.exec(mensagem.corpo);
  const token = achado?.[1];
  assert.ok(
    token !== undefined,
    `o corpo da mensagem de redefinicao nao traz o link no formato esperado: ${mensagem.corpo}`,
  );
  return token;
}

/**
 * A afirmacao central, e ela e a mesma para as duas operacoes: NENHUMA das
 * `ALEM_DO_TETO` requisicoes legitimas recebeu 429.
 */
function nenhumaRecusaPorTeto(
  status: readonly number[],
  esperado: number,
  operacao: string,
  cenario: string,
): void {
  const posicao = status.indexOf(429);
  assert.equal(
    posicao,
    -1,
    `a ${String(posicao + 1)}a requisicao LEGITIMA a \`${operacao}\` recebeu 429, e o ` +
      `conjunto foi ${JSON.stringify(status)}.\n\n` +
      'O TETO ESTA CONTANDO REQUISICAO EM VEZ DE TENTATIVA INVALIDA. O contrato declara ' +
      '`applies_to: invalid_attempts` nesta entrada; sem essa qualificacao a entrada vai por ' +
      '`hit()` e conta TODA chamada, e "20 tentativas invalidas por hora" vira "20 ' +
      `requisicoes por hora" — por IP. ${cenario}\n\n` +
      'Quem paga nao e o atacante: e a pessoa que abriu o link certo atras do mesmo endereco ' +
      'que outras vinte, no CGNAT de uma operadora movel ou na rede de um escritorio. Ela ' +
      'fica trancada para fora exatamente da operacao que estava tentando concluir, por uma ' +
      'hora, sem ter errado nada.',
  );
  assert.deepEqual(
    status,
    Array.from({ length: status.length }, () => esperado),
    `alguma das ${String(status.length)} chamadas legitimas a \`${operacao}\` nao respondeu ` +
      `${String(esperado)}: ${JSON.stringify(status)}. Sem todas valerem, a ausencia de 429 ` +
      'acima nao prova nada — uma confirmacao que falhou por outro motivo tambem nao seria ' +
      '429, e o caso ficaria verde medindo o erro errado.',
  );
}

before(async () => {
  const config = loadAppConfig();
  const contrato = carregarContrato(config.openapiSpecPath);

  banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  let verificarReautenticacao: VerificadorDeReautenticacao = () => {
    throw new Error('verificador chamado antes de a fiacao terminar');
  };

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    // Contador EM MEMORIA, e nao desligado. Um contador desligado faria este
    // arquivo inteiro medir o nada, verde, para sempre — e verde e justamente
    // o que o caso das validas espera.
    teto: tetoDeTeste(),
    reautenticacao: (request, escopo) => verificarReautenticacao(request, escopo),
  });

  const trilha = criarTrilhaDeAuditoria({
    db,
    ids,
    clock: systemClock,
    ipHmacKey: config.ipHmacKey,
    onFailure: (erro) => {
      console.error('trilha de auditoria nao gravou:', erro);
    },
  });

  const repositorio = criarIdentityRepository(db, ids);
  const mailer: Mailer = {
    enviar: (mensagem: Mensagem) => {
      caixaDeEntrada.push(mensagem);
      return Promise.resolve();
    },
  };

  const auth = criarAuthService({
    repositorio,
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    mailer,
    registrarOcorrencia: () => {
      // Nenhum caso deste arquivo afirma log.
    },
    baseDaWeb: config.publicBaseUrl,
    avisarTitular: criarAvisoDeReusoAoTitular({
      repositorio,
      mailer,
      registrarOcorrencia: () => {
        // idem
      },
    }),
  });

  const deps: DependenciasDasRotas = {
    auth,
    assinador,
    contrato,
    issuer: config.token.issuer,
    apiBaseUrl: config.apiBaseUrl,
  };
  verificarReautenticacao = criarVerificadorDeReautenticacao(deps);

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, deps);
      pronto();
    },
    { prefix: PREFIXO_DA_API },
  );

  await app.listen({ port: 0, host: '127.0.0.1' });
  const endereco = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${String(endereco.port)}`;
});

after(async () => {
  if (app !== undefined) await app.close();
  if (banco !== undefined) {
    for (const id of contas) {
      await banco.db.deleteFrom('users').where('id', '=', id).execute();
    }
    await banco.close();
  }
});

void describe('confirmEmailVerification: o teto por IP conta invalida, nao confirmacao', () => {
  // A ORDEM IMPORTA, e o cabecalho deste arquivo explica: o caso das validas
  // precisa do balde zerado, e o das invalidas o deixa cheio.
  void it(`${String(ALEM_DO_TETO)} confirmacoes VALIDAS seguidas do mesmo IP: nenhuma 429`, async () => {
    const tokens: string[] = [];
    for (let i = 0; i < ALEM_DO_TETO; i += 1) {
      tokens.push(await contaNovaComTokenDeEmail(`valida-${String(i)}`));
    }

    // EM SERIE, de proposito: a contagem da invalida acontece em `onResponse`,
    // depois de a resposta sair, e em paralelo a posicao medida seria outra.
    const status: number[] = [];
    for (const token of tokens) {
      const resposta = await chamar(CONFIRMACAO_DE_EMAIL, { metodo: 'POST', corpo: { token } });
      status.push(resposta.status);
    }

    nenhumaRecusaPorTeto(
      status,
      200,
      'POST /auth/email-verification/confirm',
      `Sao ${String(ALEM_DO_TETO)} contas diferentes, com ${String(ALEM_DO_TETO)} tokens ` +
        'validos e distintos, confirmando cada uma o proprio e-mail.',
    );
  });

  void it(`a ${String(ALEM_DO_TETO)}a confirmacao INVALIDA responde 429; as ${String(TETO)} antes, 410`, async () => {
    const status: number[] = [];
    const respostas: Resposta[] = [];
    for (let i = 0; i < ALEM_DO_TETO; i += 1) {
      const resposta = await chamar(CONFIRMACAO_DE_EMAIL, {
        metodo: 'POST',
        corpo: { token: tokenQueNaoExiste() },
      });
      respostas.push(resposta);
      status.push(resposta.status);
    }

    assert.deepEqual(
      status.slice(0, TETO),
      Array.from({ length: TETO }, () => 410),
      `as ${String(TETO)} primeiras tentativas com token invalido deviam responder 410 ` +
        `(\`verification-token-expired\`), e sairam ${JSON.stringify(status)}. Um 429 antes da ` +
        `${String(ALEM_DO_TETO)}a recusaria quem abriu um link vencido menos vezes do que o ` +
        'contrato permite.',
    );
    assert.equal(
      status[TETO],
      429,
      `a ${String(ALEM_DO_TETO)}a tentativa com token invalido respondeu ` +
        `${String(status[TETO])}, e o conjunto foi ${JSON.stringify(status)}. A qualificacao ` +
        '`applies_to: invalid_attempts` nao pode virar "nunca recusa": ela move o que se conta, ' +
        'e nao desliga o teto. Sem a recusa aqui, o link de confirmacao vira oraculo de token ' +
        'sem custo nenhum para quem esta varrendo.',
    );

    const ultima = respostas[TETO];
    assert.ok(ultima !== undefined);
    assert.equal(
      tipoDoProblema(ultima.corpo),
      'rate-limited',
      `a recusa saiu com \`type: ${tipoDoProblema(ultima.corpo)}\` em vez de \`rate-limited\`. ` +
        'Um 429 de outro `type` nao e este teto, e o cliente decide pelo `type` (RFC 9457).',
    );
    assert.ok(
      ultima.retryAfter !== null,
      'o 429 saiu sem `Retry-After`. RFC 9110: sem ele o cliente fica martelando a rota.',
    );
  });

  void it('a rota declara o teto que o contrato declara, com a qualificacao', () => {
    // O OUTRO LADO DA PINCA, independente dos dois acima de proposito: eles
    // provam que o mecanismo age onde deve, este prova que o numero e a
    // qualificacao nao mudaram. Esperado tirado da propria rota seria
    // tautologia nos tres.
    const declaradas: readonly RateLimitEntry[] = rotaDeConfirmacaoDeEmail.rateLimit ?? [];
    assert.equal(
      declaradas.length,
      1,
      'POST /auth/email-verification/confirm deixou de declarar exatamente uma entrada de ' +
        'teto. O contrato declara uma (`api/openapi.yaml`, `confirmEmailVerification`).',
    );
    const entrada = declaradas[0];
    assert.ok(entrada !== undefined);
    assert.deepEqual(
      {
        dimension: [...entrada.dimension],
        limit: entrada.limit,
        window: entrada.window,
        onExceed: entrada.onExceed,
        appliesTo: entrada.appliesTo,
      },
      {
        dimension: ['ip'],
        limit: TETO,
        window: '1h',
        onExceed: 'deny_429',
        appliesTo: 'invalid_attempts',
      },
      'o teto de POST /auth/email-verification/confirm divergiu do contrato ' +
        '(`api/openapi.yaml`, `confirmEmailVerification`: dimension [ip], limit 20, window 1h, ' +
        'on_exceed deny_429, applies_to invalid_attempts). Perder `applies_to` nao afrouxa o ' +
        'teto: aperta, e aperta contra quem confirmou o link certo.',
    );
  });
});

void describe('confirmPasswordReset: o teto por IP conta invalida, nao redefinicao', () => {
  void it(`${String(ALEM_DO_TETO)} redefinicoes VALIDAS seguidas do mesmo IP: nenhuma 429`, async () => {
    const tokens: string[] = [];
    for (let i = 0; i < ALEM_DO_TETO; i += 1) {
      tokens.push(await contaNovaComTokenDeRedefinicao(`valida-${String(i)}`));
    }

    const status: number[] = [];
    for (const token of tokens) {
      const resposta = await chamar(CONFIRMACAO_DE_REDEFINICAO, {
        metodo: 'POST',
        corpo: { token, new_password: SENHA_NOVA },
      });
      status.push(resposta.status);
    }

    nenhumaRecusaPorTeto(
      status,
      204,
      'POST /auth/password-reset/confirm',
      `Sao ${String(ALEM_DO_TETO)} contas diferentes, cada uma redefinindo a propria senha ` +
        'pelo link que recebeu.',
    );
  });

  void it(`a ${String(ALEM_DO_TETO)}a redefinicao INVALIDA responde 429; as ${String(TETO)} antes, 410`, async () => {
    const status: number[] = [];
    const respostas: Resposta[] = [];
    for (let i = 0; i < ALEM_DO_TETO; i += 1) {
      const resposta = await chamar(CONFIRMACAO_DE_REDEFINICAO, {
        metodo: 'POST',
        corpo: { token: tokenQueNaoExiste(), new_password: SENHA_NOVA },
      });
      respostas.push(resposta);
      status.push(resposta.status);
    }

    assert.deepEqual(
      status.slice(0, TETO),
      Array.from({ length: TETO }, () => 410),
      `as ${String(TETO)} primeiras tentativas com token invalido deviam responder 410, e ` +
        `sairam ${JSON.stringify(status)}.`,
    );
    assert.equal(
      status[TETO],
      429,
      `a ${String(ALEM_DO_TETO)}a tentativa com token invalido respondeu ` +
        `${String(status[TETO])}, e o conjunto foi ${JSON.stringify(status)}. Esta rota troca ` +
        'senha: sem a recusa, varrer token de redefinicao sai de graca.',
    );

    const ultima = respostas[TETO];
    assert.ok(ultima !== undefined);
    assert.equal(
      tipoDoProblema(ultima.corpo),
      'rate-limited',
      `a recusa saiu com \`type: ${tipoDoProblema(ultima.corpo)}\` em vez de \`rate-limited\`.`,
    );
    assert.ok(ultima.retryAfter !== null, 'o 429 saiu sem `Retry-After` (RFC 9110).');
  });

  void it('a rota declara o teto que o contrato declara, com a qualificacao', () => {
    const declaradas: readonly RateLimitEntry[] = rotaDeConfirmacaoDeRedefinicao.rateLimit ?? [];
    assert.equal(
      declaradas.length,
      1,
      'POST /auth/password-reset/confirm deixou de declarar exatamente uma entrada de teto.',
    );
    const entrada = declaradas[0];
    assert.ok(entrada !== undefined);
    assert.deepEqual(
      {
        dimension: [...entrada.dimension],
        limit: entrada.limit,
        window: entrada.window,
        onExceed: entrada.onExceed,
        appliesTo: entrada.appliesTo,
      },
      {
        dimension: ['ip'],
        limit: TETO,
        window: '1h',
        onExceed: 'deny_429',
        appliesTo: 'invalid_attempts',
      },
      'o teto de POST /auth/password-reset/confirm divergiu do contrato ' +
        '(`api/openapi.yaml`, `confirmPasswordReset`: dimension [ip], limit 20, window 1h, ' +
        'on_exceed deny_429, applies_to invalid_attempts).',
    );
  });
});
