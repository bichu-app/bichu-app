/**
 * **A fiação que um teste exige tem de existir nas DUAS pilhas** (BICHUS-319).
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR, COM DATA
 * ===========================================================================
 * `tests/integration/rastro-de-toda-escrita-administrativa.test.ts` exercita as
 * 34 escritas administrativas do contrato, e uma delas é
 * `POST /admin/auth/login`. Ela só é exercitável com o desafio de
 * desenvolvimento local ligado -- sem ele a rota chama o reCAPTCHA Enterprise
 * de verdade e responde 403 `captcha-rejected`.
 *
 * A variável foi posta no `environment:` do serviço `api` de
 * `infra/integracao/compose.integracao.yaml`, e na bancada passou: 878 de 878.
 * **Na esteira reprovou**, 877 de 878, e o único caso vermelho era o login
 * (execução 124430445974). A causa não era a guarda nem o gerenciador de
 * segredos: **o job `integracao` não usa aquele arquivo**. Ele sobe o
 * `compose.yaml` da RAIZ, com um `.env` que o próprio workflow monta a partir
 * de `.env.example`. Duas pilhas, duas fiações, e eu só havia ligado uma.
 *
 * O comentário que eu mesmo escrevi no compose dizia que o valor "só vale
 * aqui". A esteira mostrou que "aqui" era mais estreito do que a frase supunha
 * -- e mais estreito justamente onde a medição que conta acontece.
 *
 * ===========================================================================
 * POR QUE AQUI, E NÃO NUM PORTÃO DE DOCKER
 * ===========================================================================
 * Este arquivo roda na suíte UNITÁRIA, no job `codigo`, que é `needs` do job
 * `integracao`. A divergência passa a reprovar em segundos e pelo nome, antes
 * de a esteira gastar vinte minutos subindo pilha para descobrir pela via de um
 * 403 que fala de captcha e não de fiação.
 *
 * ## O que NÃO está aqui
 *
 * Que a variável é segura é conferido por
 * `recusa-do-captcha-de-desenvolvimento.test.ts` (as quatro iscas de 28/09):
 * a API RECUSA SUBIR com ela fora de `dev`/host local. Este arquivo só confere
 * que as duas pilhas ligam a MESMA coisa, e confirma que o `.env.example` -- de
 * onde o `.env` da esteira sai -- satisfaz aquela guarda.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  TOKEN_DE_DESENVOLVIMENTO,
  VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO,
  captchaDeDesenvolvimentoLigado,
} from '../../modules/admin-access/adapters/external/captcha-de-desenvolvimento-local.js';
import { VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO, recusaDoCaptchaDeDesenvolvimento } from './env.js';

const COMPOSE_EFEMERO = 'infra/integracao/compose.integracao.yaml';
const WORKFLOW = '.github/workflows/ci.yml';
/** O job da esteira que sobe pilha e roda a suíte de integração. */
const JOB_DA_INTEGRACAO = 'integracao';
const PASSO_DO_ENV = 'ambiente de teste';

function ler(caminho: string): string {
  return readFileSync(resolve(process.cwd(), caminho), 'utf8');
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** As variáveis que o `.env` da esteira herda do exemplo, por nome. */
function variaveisDoExemplo(): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const linha of ler('.env.example').split('\n')) {
    if (linha.trimStart().startsWith('#') || !linha.includes('=')) continue;
    mapa[linha.slice(0, linha.indexOf('='))] = linha.slice(linha.indexOf('=') + 1);
  }
  return mapa;
}

/** O `run` do passo que monta o `.env` do job de integração. */
function roteiroDoEnvDaEsteira(): string {
  const workflow = parseYaml(ler(WORKFLOW)) as unknown;
  const jobs = ehObjeto(workflow) ? workflow['jobs'] : undefined;
  const job = ehObjeto(jobs) ? jobs[JOB_DA_INTEGRACAO] : undefined;
  assert.ok(
    ehObjeto(job),
    `${WORKFLOW} não tem o job \`${JOB_DA_INTEGRACAO}\`. Ele foi renomeado, e este ` +
      `arquivo passaria a conferir o nada -- filtro que não casa aprova sem medir.`,
  );
  const passos = job['steps'];
  assert.ok(Array.isArray(passos), `o job \`${JOB_DA_INTEGRACAO}\` não tem \`steps\``);
  const passo = passos.find((p) => ehObjeto(p) && p['name'] === PASSO_DO_ENV);
  assert.ok(
    ehObjeto(passo) && typeof passo['run'] === 'string',
    `o job \`${JOB_DA_INTEGRACAO}\` não tem o passo \`${PASSO_DO_ENV}\` com \`run\`. ` +
      `É ele que monta o \`.env\` da pilha da esteira.`,
  );
  return passo['run'];
}

void describe('BICHUS-319: o desafio de desenvolvimento do login está ligado nas DUAS pilhas', () => {
  void it('a pilha efêmera dos worktrees liga o desafio no serviço `api`', () => {
    const compose = parseYaml(ler(COMPOSE_EFEMERO)) as unknown;
    const servicos = ehObjeto(compose) ? compose['services'] : undefined;
    const api = ehObjeto(servicos) ? servicos['api'] : undefined;
    assert.ok(ehObjeto(api), `${COMPOSE_EFEMERO} não tem o serviço \`api\``);
    const ambiente = api['environment'];
    assert.ok(ehObjeto(ambiente), `o serviço \`api\` de ${COMPOSE_EFEMERO} não tem \`environment\``);
    assert.equal(
      ambiente[VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO],
      VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO,
      `o serviço \`api\` de ${COMPOSE_EFEMERO} não liga ` +
        `${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO} com o valor que o código exige. ` +
        `\`POST /admin/auth/login\` cairia no verificador de verdade e o caso do ` +
        `portão de rastro reprovaria com 403 \`captcha-rejected\`.`,
    );
  });

  void it('o `.env` que a esteira monta liga o desafio com o MESMO valor', () => {
    const roteiro = roteiroDoEnvDaEsteira();
    // As linhas que ATRIBUEM, e não as que comentam: o bloco acima da
    // atribuição explica o porquê e cita o nome da variável.
    const atribuicoes = roteiro
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('#') && l.includes(`${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO}=`));
    assert.ok(
      atribuicoes.length > 0,
      `o passo \`${PASSO_DO_ENV}\` do job \`${JOB_DA_INTEGRACAO}\` não escreve ` +
        `${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO} no \`.env\`. Esse job NÃO usa ` +
        `${COMPOSE_EFEMERO}: ele sobe o \`compose.yaml\` da raiz com o \`.env\` deste ` +
        `passo, então ligar o desafio só na pilha efêmera deixa o login da esteira no ` +
        `verificador de verdade -- foi a reprovação de 877 de 878.`,
    );
    for (const linha of atribuicoes) {
      assert.ok(
        linha.includes(`${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO}=${VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO}`),
        `o passo \`${PASSO_DO_ENV}\` escreve ${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO} com ` +
          `valor que não liga o desafio: ${linha}`,
      );
    }
  });

  void it('o `.env.example`, de onde o `.env` da esteira sai, satisfaz a guarda de subida', () => {
    const exemplo = variaveisDoExemplo();
    for (const chave of ['ENVIRONMENT', 'PUBLIC_BASE_URL', 'ADMIN_ORIGIN']) {
      assert.ok(
        (exemplo[chave] ?? '') !== '',
        `.env.example não define ${chave}, e é dele que o \`.env\` da esteira sai. ` +
          `Sem o valor, este caso mediria um ambiente que não existe.`,
      );
    }
    assert.equal(
      recusaDoCaptchaDeDesenvolvimento({
        ...exemplo,
        NODE_ENV: 'development',
        [VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO]: VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO,
      }),
      undefined,
      'a guarda de subida RECUSA o desafio de desenvolvimento com o ambiente do ' +
        '`.env.example`. A api da esteira não subiria, e o portão de rastro reprovaria ' +
        'nos 34 casos por causa de um.',
    );
  });

  void it('controle negativo: valor diferente não liga, e host hospedado faz a guarda recusar', () => {
    assert.equal(captchaDeDesenvolvimentoLigado(VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO), true);
    assert.equal(captchaDeDesenvolvimentoLigado('sim'), false);
    assert.equal(captchaDeDesenvolvimentoLigado(undefined), false);
    // Se este caso passasse com host hospedado, os três de cima estariam
    // medindo a presença da variável e não a regra.
    const recusa = recusaDoCaptchaDeDesenvolvimento({
      ...variaveisDoExemplo(),
      NODE_ENV: 'development',
      ADMIN_ORIGIN: 'https://admin.bichu.app',
      [VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO]: VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO,
    });
    assert.ok(
      recusa !== undefined && recusa.includes('ADMIN_ORIGIN'),
      'a guarda aceitou o desafio de desenvolvimento com `ADMIN_ORIGIN` hospedado',
    );
  });

  void it('o token que o painel manda é o que o verificador local aprova', () => {
    // Os dois lados do mesmo acordo: o painel (`admin/src/entrar/captcha.ts`)
    // envia este token, e o verificador local aprova este token. O caso do
    // portão de rastro manda o mesmo, e é por isso que ele existe aqui.
    assert.equal(TOKEN_DE_DESENVOLVIMENTO, 'desenvolvimento-sem-chave-de-captcha');
  });
});
