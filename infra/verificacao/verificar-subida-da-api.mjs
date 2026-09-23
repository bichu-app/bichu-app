#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`. `/* eslint-env node */` nao serve -- a configuracao
// plana do ESLint 9 deixou de honrar `eslint-env`.
/**
 * A API SOBE. Nao "compila", nao "tem os testes verdes": SOBE.
 *
 * ===========================================================================
 * POR QUE ESTE ALVO EXISTE
 * ===========================================================================
 * Em 22/09/2026 a suite unitaria (1499 casos) e a de integracao (358) estavam
 * verdes com a API RECUSANDO SUBIR. `POST /conversations/{id}/messages`
 * declarava `Idempotency-Key` no contrato e nao passava pela idempotencia, e
 * `vigiarIdempotenciaDasRotas` derrubava a aplicacao na sequencia de subida.
 *
 * Nenhuma das duas suites alcanca essa sequencia. Elas montam uma instancia do
 * Fastify a mao, registram o modulo que interessa ao caso e injetam
 * requisicao. `src/bin/api.ts` -- onde moram as conferencias que comparam o
 * codigo com o contrato INTEIRO na subida -- nunca roda. O defeito so apareceria
 * em `docker compose up`, que e onde ninguem estava olhando.
 *
 * ===========================================================================
 * POR QUE NO FECHAMENTO, E NAO EM `make verificar`
 * ===========================================================================
 * Medido neste worktree, com `time make verificar-subida-da-api`: 15 s com a
 * camada de codigo quente e 27 s com ela invalidada (uma linha a mais em
 * `src/bin/api.ts`; `touch` nao serve, porque o `COPY` do Docker casa por
 * CONTEUDO e nao por data -- medir com `touch` teria dado o numero da camada
 * quente com o nome do numero frio).
 *
 * O laco de quem desenvolve custa 0,22 s hoje, e 15 a 27 s ali e laco
 * desligado. E o mesmo argumento que o proprio `Makefile` faz sobre o `apk`: o
 * alvo caro tem um momento, e ele e o fechamento.
 *
 * ===========================================================================
 * POR QUE O JUIZO E SEPARADO DO DOCKER (o padrao de verificar_boot_do_alvo_prod)
 * ===========================================================================
 * Um portao que aprova QUALQUER subida nao prova nada, e para mostrar que ele
 * nao aprova qualquer subida e preciso mostra-lo REPROVANDO. Com o docker por
 * dentro de cada isca, cada uma custaria uma pilha e ninguem as rodaria.
 *
 * Aqui `julgar()` e uma funcao pura sobre a evidencia (o estado do `--wait`, o
 * corpo da sonda e o log do conteiner), e `autoteste()` a alimenta com casos
 * montados a mao -- os que PRECISAM reprovar e o controle positivo, que precisa
 * passar. Portao que reprova tudo e tao inutil quanto o que aprova tudo, e o
 * segundo defeito so aparece quando alguem tenta passar um caso legitimo.
 *
 * Qualquer isca com o resultado errado derruba o script ANTES de o docker ser
 * chamado: dali em diante o verde dele nao significaria nada.
 *
 * Uso:
 *   node infra/verificacao/verificar-subida-da-api.mjs              sobe e julga
 *   node infra/verificacao/verificar-subida-da-api.mjs --autoteste  so as iscas
 */
import { execFileSync, spawnSync } from 'node:child_process';

import { gerar } from '../integracao/gerar-env-de-integracao.mjs';
import { identidadeDaPilha } from '../integracao/identidade-da-pilha.mjs';

const ARQUIVO = 'infra/integracao/compose.integracao.yaml';
const ENV = '.env.integracao';
/** O subconjunto minimo que faz a API subir: banco, esquema e o processo. */
const SERVICOS = ['db', 'migracao', 'api'];

// ---------------------------------------------------------------------------
// O JUIZO
// ---------------------------------------------------------------------------

/**
 * A evidencia vira veredito. Devolve a lista de motivos de reprovacao, vazia
 * quando a subida esta boa.
 *
 * `estadoDoWait` e o codigo de saida de `docker compose up -d --wait`. Zero
 * nao basta como prova: o `--wait` olha a sonda, e sonda pode ficar verde com o
 * servico respondendo coisa errada. Por isso o corpo da sonda tambem e julgado.
 */
export function julgar({ estadoDoWait, sonda, log }) {
  const motivos = [];

  if (estadoDoWait !== 0) {
    motivos.push(
      `a pilha nao ficou de pe: \`up -d --wait\` saiu ${String(estadoDoWait)}. ` +
        'A API morreu na subida ou a sonda nunca ficou verde.',
    );
  }

  // O log e julgado SEMPRE, e nao so quando o `--wait` reprova. Uma conferencia
  // de subida que lance e seja engolida por um `catch` deixaria o processo de
  // pe, a sonda verde e o `--wait` em zero -- e o motivo estaria so aqui.
  const texto = typeof log === 'string' ? log : '';
  for (const marca of ['Idempotência e contrato divergem', 'Idempotencia e contrato divergem']) {
    if (texto.includes(marca)) {
      motivos.push(
        'o log da subida acusa divergencia entre idempotencia e contrato: ' +
          'rota que promete `Idempotency-Key` sem passar pelo mecanismo, ou o contrario.',
      );
      break;
    }
  }
  // As conferencias de subida falam por `Error`. Qualquer uma delas no log e
  // reprovacao, mesmo com o processo de pe: a proxima replica pode nao subir.
  if (/\b(FATAL|UnhandledPromiseRejection|Error: Opera[cç][aã]o fora do contrato)\b/.test(texto)) {
    motivos.push('o log da subida carrega erro fatal, ainda que o processo tenha ficado de pe.');
  }

  if (sonda === undefined || sonda === null) {
    motivos.push('a sonda nao devolveu corpo nenhum: sem resposta nao ha o que aprovar.');
    return motivos;
  }
  if (sonda.status !== 'ok') {
    motivos.push(`a sonda respondeu \`status: ${String(sonda.status)}\`, e o esperado e \`ok\`.`);
  }
  // A sonda toca o banco. Sem esta linha, uma sonda que deixasse de conferir o
  // banco continuaria aprovando aqui -- e o que ela existe para provar e que a
  // API alcanca o esquema que o `migracao` acabou de aplicar.
  const banco = sonda.checks?.database ?? sonda.verificacoes?.database;
  if (banco !== 'ok' && banco !== true && banco !== 'up') {
    motivos.push(
      `a sonda nao afirma que o banco esta de pe (\`${JSON.stringify(banco)}\`): ` +
        'subida que nao alcanca o esquema nao e subida.',
    );
  }

  return motivos;
}

// ---------------------------------------------------------------------------
// AS ISCAS
// ---------------------------------------------------------------------------

const SONDA_BOA = { status: 'ok', checks: { database: 'ok' } };

/** Cada isca: o que e, a evidencia, e o que o juizo PRECISA responder. */
const ISCAS = [
  {
    nome: 'a API morreu na subida (o defeito da idempotencia de 22/09)',
    evidencia: {
      estadoDoWait: 1,
      sonda: undefined,
      log:
        'Error: Idempotência e contrato divergem, e a divergência só apareceria no segundo envio\n' +
        '    at file:///app/dist/shared/http/idempotency.js:1:1\n',
    },
    precisaReprovar: true,
  },
  {
    nome: 'a pilha nao ficou de pe, sem log nenhum',
    evidencia: { estadoDoWait: 1, sonda: undefined, log: '' },
    precisaReprovar: true,
  },
  {
    nome: 'o processo ficou de pe e a divergencia foi ENGOLIDA por um catch',
    // O caso que o `--wait` sozinho aprovaria: saida zero, sonda verde, e a
    // conferencia de subida reclamando no log.
    evidencia: {
      estadoDoWait: 0,
      sonda: SONDA_BOA,
      log: 'Idempotencia e contrato divergem: POST /pets/{petId}/lost-cases\n',
    },
    precisaReprovar: true,
  },
  {
    nome: 'a sonda respondeu, mas se declarando degradada',
    evidencia: { estadoDoWait: 0, sonda: { status: 'degraded', checks: { database: 'ok' } }, log: '' },
    precisaReprovar: true,
  },
  {
    nome: 'a sonda diz `ok` com o banco fora',
    evidencia: { estadoDoWait: 0, sonda: { status: 'ok', checks: { database: 'down' } }, log: '' },
    precisaReprovar: true,
  },
  {
    nome: 'a sonda nao respondeu nada, com a pilha de pe',
    evidencia: { estadoDoWait: 0, sonda: undefined, log: '' },
    precisaReprovar: true,
  },
  {
    nome: 'rota citando operationId que o contrato nao tem',
    evidencia: {
      estadoDoWait: 1,
      sonda: undefined,
      log: 'Error: Operação fora do contrato: postFinderMessage\n',
    },
    precisaReprovar: true,
  },
  {
    // CONTROLE POSITIVO. Sem ele o autoteste ficaria verde com um juizo que
    // reprova tudo -- e um portao que reprova tudo e tao inutil quanto o que
    // aprova tudo, com a diferenca de que este ninguem consegue ignorar.
    nome: 'CONTROLE POSITIVO: subida boa precisa PASSAR',
    evidencia: { estadoDoWait: 0, sonda: SONDA_BOA, log: 'servidor ouvindo em 0.0.0.0:3000\n' },
    precisaReprovar: false,
  },
];

/** Devolve a lista de cegueiras. Vazia e o unico resultado aceitavel. */
export function autoteste() {
  const cegueiras = [];
  for (const isca of ISCAS) {
    const motivos = julgar(isca.evidencia);
    const reprovou = motivos.length > 0;
    if (reprovou !== isca.precisaReprovar) {
      cegueiras.push(
        isca.precisaReprovar
          ? `o juizo APROVOU um caso que precisa reprovar: ${isca.nome}`
          : `o juizo REPROVOU um caso que precisa passar: ${isca.nome} (${motivos.join('; ')})`,
      );
    }
  }
  return cegueiras;
}

function exigirAsIscas() {
  const cegueiras = autoteste();
  console.log(`  [${cegueiras.length === 0 ? 'ok' : 'REPROVA'}] autoteste das iscas (${String(ISCAS.length)} casos)`);
  if (cegueiras.length === 0) return;
  console.error('\nO PORTAO PAROU DE ENXERGAR. Nao cheguei a subir nada:\n');
  for (const c of cegueiras) console.error(`  - ${c}`);
  console.error('');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// A SUBIDA DE VERDADE
// ---------------------------------------------------------------------------

function subirEJulgar() {
  const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  process.chdir(raiz);

  // A MESMA disciplina de `rodar.mjs`: projeto e tag derivados do caminho do
  // worktree. O sufixo separa esta pilha da de `test:integration` -- as duas
  // rodam no mesmo worktree dentro de `make fechar-integracao`, e um `down -v`
  // de uma nao pode levar a outra junto.
  const { projeto, tagDaPilha } = identidadeDaPilha(raiz);
  const projetoDaSubida = `${projeto}-subida`;

  const commitDeBuild =
    process.env.BUILD_COMMIT?.trim() ||
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();

  const compose = (args, opcoes = {}) =>
    spawnSync(
      'docker',
      ['compose', '-p', projetoDaSubida, '-f', ARQUIVO, '--env-file', ENV, ...args],
      {
        stdio: 'inherit',
        ...opcoes,
        env: { ...process.env, BUILD_COMMIT: commitDeBuild, TAG_DA_PILHA: tagDaPilha, ...(opcoes.env ?? {}) },
      },
    );

  let derrubando = false;
  const derrubar = () => {
    if (derrubando) return;
    derrubando = true;
    compose(['down', '-v', '--remove-orphans', '--timeout', '5'], { stdio: 'ignore' });
    // As imagens vao junto, pelo mesmo motivo de `rodar.mjs`: a tag e por
    // worktree, e aqui ha setenta. O que custa nao e a imagem (118 MB + 111 MB
    // de camada unica), e o CACHE DE BUILD -- e ele nao vai junto, entao a
    // proxima execucao reaproveita as mesmas camadas.
    if (process.env.BICHU_MANTER_IMAGEM === '1') {
      console.log(`imagens mantidas por BICHU_MANTER_IMAGEM=1: bichu-app:${tagDaPilha}`);
      return;
    }
    for (const imagem of [`bichu-app:${tagDaPilha}`, `bichu-migrador:${tagDaPilha}`]) {
      spawnSync('docker', ['image', 'rm', '-f', imagem], { stdio: 'ignore' });
    }
  };
  process.on('SIGINT', () => {
    derrubar();
    process.exit(130);
  });

  console.log(`worktree:  ${raiz}`);
  console.log(`projeto:   ${projetoDaSubida}  (a pilha principal e \`bichu\`; esta nunca e)`);
  console.log(`imagens:   bichu-app:${tagDaPilha} e bichu-migrador:${tagDaPilha}`);
  const { conferidas } = gerar();
  console.log(`ambiente:  ${ENV} gerado, ${String(conferidas)} variaveis exigidas pelo codigo preenchidas`);

  // Uma pilha anterior interrompida deixaria conteiner de pe com dado velho.
  compose(['down', '-v', '--remove-orphans', '--timeout', '5'], { stdio: 'ignore' });

  const construcao = compose(['build', ...SERVICOS]);
  if (construcao.status !== 0) {
    derrubar();
    console.error(`\nREPROVADO: a imagem nao construiu (saida ${String(construcao.status)}).\n`);
    process.exit(1);
  }

  const subida = compose(['up', '-d', '--wait', ...SERVICOS]);
  const estadoDoWait = subida.status === null ? 1 : subida.status;

  // A sonda e feita de DENTRO da rede, por `exec`: nao ha porta publicada, e a
  // ausencia dela e o que mantem esta pilha fora da disputa com a principal.
  const sondagem = spawnSync(
    'docker',
    [
      'compose', '-p', projetoDaSubida, '-f', ARQUIVO, '--env-file', ENV,
      'exec', '-T', 'api',
      'node', '-e',
      "fetch('http://127.0.0.1:3000/v1/health').then(r=>r.text()).then(t=>{process.stdout.write(t)}).catch(e=>{process.stderr.write(String(e));process.exit(1)})",
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, BUILD_COMMIT: commitDeBuild, TAG_DA_PILHA: tagDaPilha },
    },
  );

  let sonda;
  if (sondagem.status === 0 && (sondagem.stdout ?? '').trim() !== '') {
    try {
      sonda = JSON.parse(sondagem.stdout);
    } catch {
      // Corpo que nao e JSON nao vira `undefined` calado: vira um corpo que o
      // juizo reprova nominalmente, com o que chegou na mensagem.
      sonda = { status: `resposta que nao e JSON: ${sondagem.stdout.slice(0, 200)}` };
    }
  }

  const logs = spawnSync(
    'docker',
    ['compose', '-p', projetoDaSubida, '-f', ARQUIVO, '--env-file', ENV, 'logs', '--no-color', 'api'],
    {
      encoding: 'utf8',
      env: { ...process.env, BUILD_COMMIT: commitDeBuild, TAG_DA_PILHA: tagDaPilha },
    },
  );
  const log = `${logs.stdout ?? ''}${logs.stderr ?? ''}`;

  const motivos = julgar({ estadoDoWait, sonda, log });

  if (motivos.length > 0) {
    console.error('\n--- log da api ---');
    console.error(log.split('\n').slice(-40).join('\n'));
    console.error('------------------\n');
  }
  derrubar();

  if (motivos.length > 0) {
    console.error('REPROVADO: a API nao subiu como a subida promete.\n');
    for (const m of motivos) console.error(`  - ${m}`);
    console.error('');
    process.exit(1);
  }

  console.log(`\nsubida da API APROVADA: sonda \`${String(sonda.status)}\`, banco de pe, sem erro no log.`);
}

// ---------------------------------------------------------------------------

console.log('subida da API: as iscas primeiro, o docker depois.');
exigirAsIscas();
if (!process.argv.includes('--autoteste')) subirEJulgar();
else console.log('so o autoteste: nenhuma pilha foi subida.');
