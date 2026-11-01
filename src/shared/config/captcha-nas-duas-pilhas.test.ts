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

const COMPOSE_DA_RAIZ = 'compose.yaml';
const COMPOSE_EFEMERO = 'infra/integracao/compose.integracao.yaml';
const WORKFLOW = '.github/workflows/ci.yml';
const JOB_DA_INTEGRACAO = 'integracao';
const PASSO_DA_SUBIDA = 'sobe a pilha inteira, do zero';
const PASSO_DO_ALVO_PROD = 'o alvo de producao constroi, e morre pelo motivo certo';
const ENCANAMENTO = `\${${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO}:-}`;

function ler(caminho: string): string {
  return readFileSync(resolve(process.cwd(), caminho), 'utf8');
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function servicoDe(caminho: string, nome: string): Record<string, unknown> {
  const compose = parseYaml(ler(caminho)) as unknown;
  const servicos = ehObjeto(compose) ? compose['services'] : undefined;
  const servico = ehObjeto(servicos) ? servicos[nome] : undefined;
  assert.ok(ehObjeto(servico), `${caminho} não tem o serviço \`${nome}\``);
  return servico;
}

function ambienteDoServico(caminho: string, nome: string): Record<string, unknown> {
  const ambiente = servicoDe(caminho, nome)['environment'];
  assert.ok(ehObjeto(ambiente), `o serviço \`${nome}\` de ${caminho} não tem \`environment\``);
  return ambiente;
}

interface PassoDaEsteira {
  readonly name?: unknown;
  readonly run?: unknown;
  readonly env?: unknown;
}

function passosDoJob(): readonly PassoDaEsteira[] {
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
  assert.ok(passos.length > 0, `o job \`${JOB_DA_INTEGRACAO}\` não tem passo nenhum`);
  return passos as readonly PassoDaEsteira[];
}

function passoChamado(nome: string): PassoDaEsteira {
  const passo = passosDoJob().find((p) => p.name === nome);
  assert.ok(
    passo !== undefined,
    `o job \`${JOB_DA_INTEGRACAO}\` não tem o passo \`${nome}\`. Se ele foi renomeado, ` +
      `renomeie aqui também: sem o passo, este arquivo aprova sem medir.`,
  );
  return passo;
}

function variaveisDoExemplo(): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const linha of ler('.env.example').split('\n')) {
    if (linha.trimStart().startsWith('#') || !linha.includes('=')) continue;
    mapa[linha.slice(0, linha.indexOf('='))] = linha.slice(linha.indexOf('=') + 1);
  }
  return mapa;
}

void describe('BICHUS-319: o desafio de desenvolvimento do login, ligado nas duas pilhas e em lugar estreito', () => {
  void it('o `compose.yaml` da raiz tem o encanamento no `api`, e VAZIO por padrão', () => {
    assert.equal(
      ambienteDoServico(COMPOSE_DA_RAIZ, 'api')[VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO],
      ENCANAMENTO,
      `o serviço \`api\` de ${COMPOSE_DA_RAIZ} precisa declarar ` +
        `${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO} como \`${ENCANAMENTO}\`. É esse padrão ` +
        `VAZIO que mantém o desafio desligado em \`make up\`, na homologação e em ` +
        `produção (vazio a guarda trata como ausente), e é ele que permite a esteira ` +
        `ligar o desafio pelo ambiente de quem chama o \`up\` -- sem passar pelo \`.env\`.`,
    );
  });

  void it('o `worker` NÃO recebe o desafio: ele não atende login', () => {
    const ambiente = servicoDe(COMPOSE_DA_RAIZ, 'worker')['environment'];
    const valor = ehObjeto(ambiente) ? ambiente[VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO] : undefined;
    assert.equal(
      valor,
      undefined,
      'o `worker` passou a receber o desafio do login. Ele não atende `POST ' +
        '/admin/auth/login`, e alargar o alcance é o defeito da execução 124436463888 ' +
        'de volta, por outra porta.',
    );
  });

  void it('a pilha efêmera dos worktrees liga o desafio no serviço `api`', () => {
    assert.equal(
      ambienteDoServico(COMPOSE_EFEMERO, 'api')[VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO],
      VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO,
      `o serviço \`api\` de ${COMPOSE_EFEMERO} não liga ` +
        `${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO} com o valor que o código exige. ` +
        `\`POST /admin/auth/login\` cairia no verificador de verdade e o caso do portão ` +
        `de rastro reprovaria com 403 \`captcha-rejected\`.`,
    );
  });

  void it('a esteira liga o desafio no `env:` do passo que SOBE a pilha', () => {
    const passo = passoChamado(PASSO_DA_SUBIDA);
    const ambiente = passo.env;
    assert.ok(
      ehObjeto(ambiente),
      `o passo \`${PASSO_DA_SUBIDA}\` não tem \`env:\`. É por ele que o desafio chega ` +
        `à api do job sem passar pelo \`.env\` compartilhado.`,
    );
    assert.equal(
      ambiente[VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO],
      VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO,
      `o passo \`${PASSO_DA_SUBIDA}\` não liga ${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO} ` +
        `com o valor que o código exige. Sem isso, \`POST /admin/auth/login\` cai no ` +
        `reCAPTCHA Enterprise de verdade na esteira -- a reprovação de 877 de 878.`,
    );
    const roteiro = typeof passo.run === 'string' ? passo.run : '';
    assert.ok(
      /docker compose[^\n]*\bup\b/.test(roteiro),
      `o passo \`${PASSO_DA_SUBIDA}\` não roda \`docker compose ... up\`. O \`env:\` só ` +
        `alcança a api se estiver no passo que a CRIA: o ambiente de quem chama o \`up\` ` +
        `é o que o \`${ENCANAMENTO}\` do compose interpola.`,
    );
  });

  void it('NENHUM passo do job escreve o desafio no `.env` compartilhado', () => {
    const passos = passosDoJob();
    const culpados = passos
      .filter((p) => typeof p.run === 'string' && p.run.includes(VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO))
      .map((p) => String(p.name));
    assert.deepEqual(
      culpados,
      [],
      `passo(s) do job \`${JOB_DA_INTEGRACAO}\` mencionam ` +
        `${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO} no \`run\`: ${culpados.join(', ')}. ` +
        `Aquele \`.env\` é compartilhado por treze passos, e um deles ` +
        `(\`${PASSO_DO_ALVO_PROD}\`) faz \`docker run --env-file .env -e ` +
        `NODE_ENV=production\`: a PRESENÇA da variável derruba o alvo \`prod\` na guarda ` +
        `do captcha, antes do gerenciador de segredos, e o portão daquele passo recusa ` +
        `com razão -- foi a execução 124436463888. O valor mora no \`env:\` do passo ` +
        `\`${PASSO_DA_SUBIDA}\`, não no arquivo.`,
    );
    assert.ok(
      passos.filter((p) => typeof p.run === 'string').length > 5,
      `o job \`${JOB_DA_INTEGRACAO}\` quase não tem passo com \`run\`: a varredura acima ` +
        `não teria onde casar, e zero culpados não significaria nada.`,
    );
  });

  void it('o `.env.example` não traz o desafio como atribuição ativa', () => {
    assert.equal(
      variaveisDoExemplo()[VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO],
      undefined,
      `.env.example atribui ${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO}. É dele que sai o ` +
        `\`.env\` do job da esteira E o de toda máquina de desenvolvimento, e o alvo ` +
        `\`prod\` lê aquele arquivo com \`--env-file\`: a variável ali derruba a subida ` +
        `dele. A linha comentada do exemplo é a forma certa -- quem quiser o desafio na ` +
        `própria máquina a descomenta e assume o efeito no portão do alvo \`prod\`.`,
    );
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
        '`.env.example`. A api da esteira não subiria, `--wait` reprovaria o passo da ' +
        'subida, e o portão de rastro reprovaria nos 34 casos por causa de um.',
    );
  });

  void it('vazio é tratado como AUSENTE: é o que o padrão do encanamento depende', () => {
    assert.equal(
      recusaDoCaptchaDeDesenvolvimento({
        ENVIRONMENT: 'prod',
        NODE_ENV: 'production',
        ADMIN_ORIGIN: 'https://admin.bichu.app',
        [VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO]: '',
      }),
      undefined,
      'a guarda recusou a variável VAZIA num ambiente hospedado. O ' +
        '`${...:-}` do `compose.yaml` entrega vazio a TODA api -- inclusive a de ' +
        'produção -- e com esta recusa nenhuma delas subiria.',
    );
    assert.equal(captchaDeDesenvolvimentoLigado(''), false);
  });

  void it('controle negativo: valor diferente não liga, e host hospedado faz a guarda recusar', () => {
    assert.equal(captchaDeDesenvolvimentoLigado(VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO), true);
    assert.equal(captchaDeDesenvolvimentoLigado('sim'), false);
    assert.equal(captchaDeDesenvolvimentoLigado(undefined), false);
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
    assert.equal(TOKEN_DE_DESENVOLVIMENTO, 'desenvolvimento-sem-chave-de-captcha');
  });
});
