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
import { readFileSync } from 'node:fs';

import { gerar } from '../integracao/gerar-env-de-integracao.mjs';
import { identidadeDaPilha } from '../integracao/identidade-da-pilha.mjs';

const ARQUIVO = 'infra/integracao/compose.integracao.yaml';
const ENV = '.env.integracao';
/**
 * O ambiente da SEGUNDA subida: o mesmo, em `MAIL_TRANSPORT=postmark`, sem
 * token. Ele existe porque a primeira subida so prova metade da regra.
 */
const ENV_DA_RECUSA = '.env.integracao.postmark';
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
  // A REGRESSAO DE 29/09, com nome proprio. Sem esta regra a volta do defeito
  // sairia como "a pilha nao ficou de pe", que e o que QUALQUER morte diz -- e
  // uma isca sobre ela nao conseguiria mostrar ESTA regra reprovando.
  //
  // O ambiente desta pilha sobe em `MAIL_TRANSPORT=smtp` com `MAIL_API_TOKEN`
  // VAZIA, de proposito (ver gerar-env-de-integracao.mjs). Com `smtp` ninguem
  // le o token: o nome dele aparecer no log de subida significa que alguem
  // voltou a cobra-lo fora do ramo `postmark`.
  if (texto.includes('MAIL_API_TOKEN')) {
    motivos.push(
      'a subida com `MAIL_TRANSPORT=smtp` cobrou `MAIL_API_TOKEN`: o token do ' +
        'provedor so e lido com `postmark` (ADR-0009), e o `.env.example` promete ' +
        'isso. E a regressao de 29/09 -- `api` e `worker` morrendo na subida pelo ' +
        'caminho que o README manda um desenvolvedor novo seguir.',
    );
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

/**
 * A OUTRA METADE, e ela e a que faltava: o ramo `postmark` sem token precisa
 * RECUSAR subir.
 *
 * Um portao que so prova "sobe com `smtp`" aprovaria a correcao preguicosa --
 * parar de exigir o token em lugar nenhum. Entrega de verdade sem token volta
 * 401 no primeiro pedido de redefinicao de senha de alguem, em producao, com a
 * pessoa na tela. As duas direcoes, ou nenhuma.
 *
 * `estadoDaSaida` e o codigo de saida do processo, ou `'nenhuma'` quando ele
 * nao terminou no prazo -- ficar vivo TAMBEM e reprovacao, e com outras
 * palavras, pelo mesmo motivo de `verificar_boot_do_alvo_prod.py`.
 */
export function julgarRecusaSemToken({ estadoDaSaida, log }) {
  const motivos = [];
  const texto = typeof log === 'string' ? log : '';

  if (estadoDaSaida === 0) {
    motivos.push(
      'o processo SUBIU com `MAIL_TRANSPORT=postmark` e `MAIL_API_TOKEN` vazia. ' +
        'Entrega de verdade sem token volta 401 no primeiro envio, e um processo ' +
        'de pe afirma que esta configurado. Verde aqui seria confianca falsa.',
    );
  } else if (estadoDaSaida === 'nenhuma') {
    motivos.push(
      'o processo NAO terminou no prazo. Ele deveria recusar subir em segundos, ' +
        'na leitura da configuracao. Continuar vivo significa que a sequencia de ' +
        'subida mudou, e esta verificacao precisa ser reapontada antes de valer.',
    );
  }

  // O nome no texto e UMA regra a mais, e nao um detalhe da de cima: morrer por
  // outro motivo (banco fora, porta ocupada) daria o mesmo codigo de saida e
  // aprovaria um portao que so olhasse a saida.
  if (!texto.includes('MAIL_API_TOKEN')) {
    motivos.push(
      'a recusa nao NOMEIA `MAIL_API_TOKEN`. O processo morreu por outro motivo, ' +
        'e uma recusa que aprova qualquer morte nao prova nada -- quem le o log ' +
        'precisa saber qual variavel falta, que e a promessa da secao 11.2.',
    );
  }

  return motivos;
}

/**
 * O ambiente da pilha de integracao NAO pode mascarar o caso.
 *
 * Esta e a regra que faltava em 29/09, e ela e a mais grave das tres: o defeito
 * atravessou um `fechar-integracao` VERDE porque `gerar-env-de-integracao.mjs`
 * preenchia `MAIL_API_TOKEN` com um token falso. A suite exercitava um ambiente
 * que a maquina de quem desenvolve nao tem, e chamava isso de prova.
 *
 * Recebe o TEXTO do `.env` gerado, e nao o objeto: o que a pilha le e o arquivo.
 */
export function julgarAmbienteDeIntegracao(texto) {
  const motivos = [];
  const ler = (chave) => {
    const achado = (typeof texto === 'string' ? texto : '')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .find((l) => l.startsWith(`${chave}=`));
    return achado === undefined ? undefined : achado.slice(chave.length + 1).trim();
  };

  const transporte = ler('MAIL_TRANSPORT');
  const token = ler('MAIL_API_TOKEN');

  if (transporte === undefined) {
    motivos.push(
      '`MAIL_TRANSPORT` nao esta declarada no ambiente gerado: sem ela nao da ' +
        'para saber qual ramo esta pilha exercita, e aprovar sem saber e o ponto ' +
        'cego que esta regra existe para nao ser.',
    );
    return motivos;
  }

  if (transporte !== 'postmark' && (token ?? '') !== '') {
    motivos.push(
      `o ambiente gerado esta em \`MAIL_TRANSPORT=${transporte}\` e MESMO ASSIM ` +
        'preenche `MAIL_API_TOKEN`. E a cegueira de 29/09 voltando: com um valor ' +
        'ali a pilha sobe, a suite fica verde, e quem segue o `.env.example` -- que ' +
        'deixa o token VAZIO -- continua sem conseguir subir. O vazio e o teste.',
    );
  }

  if (transporte === 'postmark' && (token ?? '') === '') {
    motivos.push(
      'o ambiente gerado esta em `MAIL_TRANSPORT=postmark` com `MAIL_API_TOKEN` ' +
        'vazia. Esta pilha existe para SUBIR: o caso da recusa e a segunda ' +
        'subida, com o seu proprio ambiente, e nao este.',
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
    // A ISCA DA REGRESSAO. Desligar a regra de `MAIL_API_TOKEN` em `julgar()`
    // faz o autoteste cair citando ESTE nome, e nao "a pilha nao ficou de pe".
    nome: 'a subida com `smtp` morreu cobrando MAIL_API_TOKEN (a regressao de 29/09)',
    evidencia: {
      estadoDoWait: 1,
      sonda: undefined,
      log:
        'Error: Nao foi possivel ler 1 segredo(s) de runtime em variavel de ambiente. A aplicacao NAO sobe sem eles:\n' +
        '  - MAIL_API_TOKEN: A variavel de ambiente nao esta definida, ou esta vazia.\n',
    },
    precisaReprovar: true,
  },
  {
    // A MESMA regra, com a pilha DE PE. Sem este caso, desligar a regra de
    // `MAIL_API_TOKEN` continuaria reprovando o caso de cima pela regra do
    // `estadoDoWait`, e a isca aprovaria a regra quebrada -- que e o defeito
    // que o comentario de `verificar_boot_do_alvo_prod.py` registra.
    nome: 'a pilha subiu, e o log ainda assim cobra MAIL_API_TOKEN com `smtp`',
    evidencia: {
      estadoDoWait: 0,
      sonda: SONDA_BOA,
      log: 'aviso: MAIL_API_TOKEN vazia; o mailer vai falhar no primeiro envio\n',
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

/** As iscas da RECUSA: `postmark` sem token nao pode subir. */
const ISCAS_DA_RECUSA = [
  {
    nome: 'o processo SUBIU com `postmark` e sem token',
    evidencia: { estadoDaSaida: 0, log: 'servidor ouvindo em 0.0.0.0:3000\nMAIL_API_TOKEN\n' },
    precisaReprovar: true,
  },
  {
    nome: 'o processo com `postmark` e sem token nao terminou no prazo',
    evidencia: { estadoDaSaida: 'nenhuma', log: 'MAIL_API_TOKEN\n' },
    precisaReprovar: true,
  },
  {
    nome: 'morreu, e a recusa NAO nomeia MAIL_API_TOKEN',
    evidencia: { estadoDaSaida: 1, log: 'Error: connect ECONNREFUSED 172.18.0.2:5432\n' },
    precisaReprovar: true,
  },
  {
    // CONTROLE POSITIVO da recusa.
    nome: 'CONTROLE POSITIVO: a recusa certa precisa PASSAR',
    evidencia: {
      estadoDaSaida: 1,
      log:
        'Error: Nao foi possivel ler 1 segredo(s) de runtime em variavel de ambiente. A aplicacao NAO sobe sem eles:\n' +
        '  - MAIL_API_TOKEN: A variavel de ambiente nao esta definida, ou esta vazia.\n',
    },
    precisaReprovar: false,
  },
];

/** As iscas do AMBIENTE: o gerador nao pode mascarar o caso. */
const ISCAS_DO_AMBIENTE = [
  {
    nome: 'o gerador voltou a preencher MAIL_API_TOKEN com `smtp` (a cegueira de 29/09)',
    texto: 'MAIL_TRANSPORT=smtp\nMAIL_API_TOKEN=integracao-descartavel-token-que-nao-autentica\n',
    precisaReprovar: true,
  },
  {
    nome: 'o mesmo com `log`, que tambem nao le o token',
    texto: 'MAIL_TRANSPORT=log\nMAIL_API_TOKEN=qualquer-coisa\n',
    precisaReprovar: true,
  },
  {
    nome: 'o ambiente nao declara MAIL_TRANSPORT nenhuma',
    texto: 'MAIL_API_TOKEN=\n',
    precisaReprovar: true,
  },
  {
    nome: '`postmark` com token vazio nao e o ambiente desta pilha',
    texto: 'MAIL_TRANSPORT=postmark\nMAIL_API_TOKEN=\n',
    precisaReprovar: true,
  },
  {
    // CONTROLE POSITIVO do ambiente: e assim que o gerador precisa sair.
    nome: 'CONTROLE POSITIVO: `smtp` com o token VAZIO precisa PASSAR',
    texto: '# comentario\nMAIL_TRANSPORT=smtp\nMAIL_API_TOKEN=\n',
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
  for (const isca of ISCAS_DA_RECUSA) {
    const motivos = julgarRecusaSemToken(isca.evidencia);
    const reprovou = motivos.length > 0;
    if (reprovou !== isca.precisaReprovar) {
      cegueiras.push(
        isca.precisaReprovar
          ? `o juizo da RECUSA aprovou um caso que precisa reprovar: ${isca.nome}`
          : `o juizo da RECUSA reprovou um caso que precisa passar: ${isca.nome} (${motivos.join('; ')})`,
      );
    }
  }
  for (const isca of ISCAS_DO_AMBIENTE) {
    const motivos = julgarAmbienteDeIntegracao(isca.texto);
    const reprovou = motivos.length > 0;
    if (reprovou !== isca.precisaReprovar) {
      cegueiras.push(
        isca.precisaReprovar
          ? `o juizo do AMBIENTE aprovou um caso que precisa reprovar: ${isca.nome}`
          : `o juizo do AMBIENTE reprovou um caso que precisa passar: ${isca.nome} (${motivos.join('; ')})`,
      );
    }
  }
  return cegueiras;
}

function exigirAsIscas() {
  const cegueiras = autoteste();
  const quantas = ISCAS.length + ISCAS_DA_RECUSA.length + ISCAS_DO_AMBIENTE.length;
  console.log(`  [${cegueiras.length === 0 ? 'ok' : 'REPROVA'}] autoteste das iscas (${String(quantas)} casos)`);
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

  // O AMBIENTE E JULGADO ANTES DE QUALQUER DOCKER. Um `.env` que mascara o caso
  // faz a subida seguinte provar outra coisa -- foi assim que o defeito de
  // 29/09 atravessou um `fechar-integracao` verde.
  const motivosDoAmbiente = julgarAmbienteDeIntegracao(readFileSync(ENV, 'utf8'));
  if (motivosDoAmbiente.length > 0) {
    console.error('\nREPROVADO: o ambiente da pilha de integracao mascara o caso. Nao subi nada.\n');
    for (const m of motivosDoAmbiente) console.error(`  - ${m}`);
    console.error('');
    process.exit(1);
  }
  console.log('ambiente:  MAIL_TRANSPORT=smtp com MAIL_API_TOKEN VAZIA -- o caminho do .env.example');

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

  // ---------------------------------------------------------------------
  // A SEGUNDA METADE: `postmark` sem token precisa RECUSAR subir.
  // ---------------------------------------------------------------------
  // Sem pilha: a imagem ja esta construida e o processo morre na leitura da
  // configuracao, antes de abrir conexao com qualquer coisa. `docker run`
  // direto, como em `verificar-boot-do-alvo-prod-local.sh`, e pelo mesmo
  // motivo -- e tambem sem `--network`, para nao encostar em pilha de ninguem.
  //
  // Sem este bloco, a correcao preguicosa (parar de exigir o token em lugar
  // nenhum) passaria neste portao.
  gerar({
    destino: ENV_DA_RECUSA,
    sobrepor: { MAIL_TRANSPORT: 'postmark', MAIL_API_TOKEN: '' },
    // O ambiente da recusa e INVALIDO de proposito: e o arquivo que faz a
    // subida recusar. Sem esta linha a propria geracao derruba antes, citando
    // `MAIL_API_TOKEN` -- que e o comportamento certo para todo o resto.
    faltandoDeProposito: ['MAIL_API_TOKEN'],
  });
  const nomeDaRecusa = `prova-recusa-${String(process.pid)}`;
  spawnSync('docker', ['rm', '-f', nomeDaRecusa], { stdio: 'ignore' });
  // `-d` E UM LACO LIMITADO, e nao `docker run` em primeiro plano.
  //
  // MEDIDO, e nao deduzido: com o mecanismo desligado a mao (predicado sempre
  // `false` E a rede de baixo de `postmark-mailer.ts` fora), o processo SOBE e
  // fica de pe. Um `docker run` sincrono ficava pendurado para sempre, e a
  // reprovacao que este bloco existe para produzir nunca saia -- o ramo
  // `'nenhuma'` de `julgarRecusaSemToken` era inalcancavel, e um portao que nao
  // consegue reprovar e o portao cego que esta tarefa veio consertar.
  //
  // NAO USA `timeout`: nesta maquina o binario NAO EXISTE (nem `gtimeout`), o
  // shell responde 127 e o `if` leria isso como veredito. E a mesma decisao, e
  // pelo mesmo motivo, de `infra/verificacao/verificar-boot-do-alvo-prod-local.sh`.
  spawnSync(
    'docker',
    ['run', '-d', '--name', nomeDaRecusa, '--env-file', ENV_DA_RECUSA, `bichu-app:${tagDaPilha}`],
    { encoding: 'utf8' },
  );
  const esperaMaxima = Number.parseInt(process.env.BICHU_ESPERA_DA_RECUSA ?? '30', 10);
  let estadoDaSaida = 'nenhuma';
  for (let i = 0; i < esperaMaxima; i += 1) {
    const vivo = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', nomeDaRecusa], {
      encoding: 'utf8',
    });
    if ((vivo.stdout ?? '').trim() === 'false') {
      const codigo = spawnSync('docker', ['inspect', '-f', '{{.State.ExitCode}}', nomeDaRecusa], {
        encoding: 'utf8',
      });
      estadoDaSaida = Number.parseInt((codigo.stdout ?? '').trim(), 10);
      break;
    }
    // `sleep 1` sem dependencia externa: o laco precisa rodar igual em qualquer
    // maquina, e `Atomics.wait` e o unico sono sincrono que o Node garante.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  const logsDaRecusa = spawnSync('docker', ['logs', nomeDaRecusa], { encoding: 'utf8' });
  const logDaRecusa = `${logsDaRecusa.stdout ?? ''}${logsDaRecusa.stderr ?? ''}`;
  spawnSync('docker', ['rm', '-f', nomeDaRecusa], { stdio: 'ignore' });
  const motivosDaRecusa = julgarRecusaSemToken({ estadoDaSaida, log: logDaRecusa });
  if (motivosDaRecusa.length > 0) {
    console.error('\n--- log da recusa (`postmark` sem token) ---');
    console.error(logDaRecusa.split('\n').slice(-20).join('\n'));
    console.error('-------------------------------------------\n');
  }
  motivos.push(...motivosDaRecusa);

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
  console.log(
    '  e as duas direcoes do token do provedor: SOBE com `smtp` sem token, ' +
      'e RECUSA com `postmark` sem token, nomeando MAIL_API_TOKEN.',
  );
}

// ---------------------------------------------------------------------------

console.log('subida da API: as iscas primeiro, o docker depois.');
exigirAsIscas();
if (!process.argv.includes('--autoteste')) subirEJulgar();
else console.log('so o autoteste: nenhuma pilha foi subida.');
