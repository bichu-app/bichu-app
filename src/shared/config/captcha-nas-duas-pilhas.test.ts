/**
 * **A fiação que um teste exige tem de existir nas DUAS pilhas -- e no lugar
 * ESTREITO** (BICHUS-319).
 *
 * ===========================================================================
 * DUAS REPROVAÇÕES DE ESTEIRA MORAM NESTE ARQUIVO, E ELAS ENSINAM COISAS
 * DIFERENTES
 * ===========================================================================
 * `tests/integration/rastro-de-toda-escrita-administrativa.test.ts` exercita as
 * 34 escritas administrativas do contrato, e uma delas é
 * `POST /admin/auth/login`. Ela só é exercitável com o desafio de
 * desenvolvimento local ligado -- sem ele a rota chama o reCAPTCHA Enterprise
 * de verdade e responde 403 `captcha-rejected`.
 *
 * **Execução 124430445974 -- 877 de 878.** A variável foi posta no
 * `environment:` do serviço `api` de `infra/integracao/compose.integracao.yaml`
 * e na bancada passou, 878 de 878. O job `integracao` **não usa aquele
 * arquivo**: ele sobe o `compose.yaml` da RAIZ. Duas pilhas, duas fiações, e só
 * uma ligada. Lição: *onde a bancada mede não é onde a esteira mede.*
 *
 * **Execução 124436463888 -- o alvo `prod` morreu pelo motivo errado.** A
 * correção escreveu a variável no `.env` do job. Medido depois: **treze** passos
 * daquele job tocam aquele arquivo, e um deles -- `o alvo de producao constroi,
 * e morre pelo motivo certo` -- faz `docker run --env-file .env -e
 * NODE_ENV=production`. A guarda `recusaDoCaptchaDeDesenvolvimento` fez
 * exatamente o que promete e derrubou o alvo `prod` na PRESENÇA da variável,
 * antes de ele alcançar o gerenciador de segredos; o portão recusou com razão,
 * porque passo que aprova qualquer morte não prova nada. Lição: *o diagnóstico
 * estava certo e a forma era larga demais.*
 *
 * ===========================================================================
 * A FORMA QUE ESTE ARQUIVO PROTEGE
 * ===========================================================================
 * O valor alcança UM processo: a api que o passo `sobe a pilha inteira, do
 * zero` cria.
 *
 * - `compose.yaml` declara, **só no serviço `api`**,
 *   `CAPTCHA_DESENVOLVIMENTO_LOCAL: ${CAPTCHA_DESENVOLVIMENTO_LOCAL:-}` -- o
 *   encanamento, VAZIO por padrão. Vazio a guarda trata como ausente, então
 *   `make up`, a homologação e produção seguem com o verificador de verdade;
 * - a esteira liga no `env:` **daquele passo**, e não no `.env` do job;
 * - a pilha efêmera dos worktrees liga no `environment:` do seu próprio `api`.
 *
 * E o `.env` do job fica LIMPO -- é o que o caso "nenhum passo escreve a
 * variável no `.env`" existe para manter.
 *
 * ===========================================================================
 * POR QUE AQUI, E NÃO NUM PORTÃO DE DOCKER
 * ===========================================================================
 * Este arquivo roda na suíte UNITÁRIA, no job `codigo`, que é `needs` do job
 * `integracao`. A divergência passa a reprovar em segundos e pelo nome, antes
 * de a esteira gastar vinte minutos subindo pilha para descobrir pela via de um
 * 403 que fala de captcha, ou de um alvo `prod` que morre no lugar errado.
 *
 * ## O que NÃO está aqui
 *
 * Que a variável é SEGURA é conferido por
 * `recusa-do-captcha-de-desenvolvimento.test.ts` (as quatro iscas de 28/09): a
 * API RECUSA SUBIR com ela fora de `dev`/host local. Aquela guarda não foi
 * tocada -- foi ela que pegou a segunda reprovação.
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

const COMPOSE_DA_RAIZ = 'compose.yaml';
const COMPOSE_EFEMERO = 'infra/integracao/compose.integracao.yaml';
const WORKFLOW = '.github/workflows/ci.yml';
/** O job da esteira que sobe pilha e roda a suíte de integração. */
const JOB_DA_INTEGRACAO = 'integracao';
/** O passo que CRIA a api do job: é o `env:` dele que liga o desafio. */
const PASSO_DA_SUBIDA = 'sobe a pilha inteira, do zero';
/** O passo que o `.env` largo quebrou, nomeado para a mensagem não ser abstrata. */
const PASSO_DO_ALVO_PROD = 'o alvo de producao constroi, e morre pelo motivo certo';
/** A forma exata do encanamento: presente e VAZIO por padrão. */
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

/** As variáveis que o `.env` da esteira herda do exemplo, por nome. */
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
    // Hoje ele não tem `environment:` nenhum, que é a forma mais forte de não
    // receber. O caso aceita as duas: sem bloco, ou com bloco e sem a chave.
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
    // O `env:` tem de estar no passo que CRIA a api. Posto em outro, o valor
    // não alcança processo nenhum e este arquivo aprovaria uma fiação morta.
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
    // Controle positivo da varredura: se nenhum passo tivesse `run`, o filtro
    // acima casaria zero por vacuidade e aprovaria sem medir.
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
    // `${VAR:-}` entrega string VAZIA ao container, e não a ausência da chave.
    // Se a guarda recusasse por vazio, `make up` e a homologação pararia de
    // subir -- o encanamento inteiro depende deste comportamento.
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
