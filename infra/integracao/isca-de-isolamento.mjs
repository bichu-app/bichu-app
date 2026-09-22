#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint deste
// repositorio nao declara os globais de Node para `**/*.mjs` fora de `src/`.
/**
 * `npm run verify:isolamento-da-pilha`
 *
 * Duas pilhas de integracao simultaneas, em worktrees diferentes, nao podem se
 * enxergar. Esta isca prova isso, e prova tambem que SEM o conserto elas se
 * enxergam -- que e o que separa uma prova de uma afirmacao.
 *
 * ===========================================================================
 * O DEFEITO QUE ELA GUARDA
 * ===========================================================================
 * `compose.integracao.yaml` declarava `image: bichu-migrador:integracao`. Tag
 * e nome GLOBAL da maquina: o `-p` isola conteiner, rede e volume, e nao
 * alcanca imagem. Cada `compose build`, de qualquer worktree, arrancava a tag
 * de quem a tinha.
 *
 * O `migracao` copia `migrations/` para dentro da imagem, entao o esquema vem
 * inteiro dela; o `testes` monta `../..` por cima de `/app`, entao o codigo
 * vem do worktree. A combinacao produz uma suite que roda o SEU teste contra o
 * esquema de OUTRA branch, sem nenhuma linha de erro.
 *
 * ===========================================================================
 * O DESENHO, E POR QUE ELE NAO SOBE DUAS PILHAS COMPLETAS
 * ===========================================================================
 * Subir dois Postgres, migrar os dois e rodar duas suites custaria minutos a
 * cada execucao, e isca cara e isca desligada.
 *
 * O que precisa ser provado nao depende de banco nenhum: e que a imagem que o
 * servico `migracao` do projeto A resolve carregue as migracoes de A, e nao as
 * de B. Entao a isca cria duas arvores descartaveis, poe em cada uma uma
 * migracao com marca propria, constroi o alvo `migrador` das duas na ordem que
 * causa o estrago (A, depois B) e le `/app/migrations` DENTRO da imagem que
 * cada projeto resolve. Sem `up`, sem banco, sem rede.
 *
 * Isso nao e atalho equivalente: e o mesmo `docker compose build` e a mesma
 * resolucao de `image:` que a suite usa, com o mesmo modulo de identidade. O
 * que ficou de fora -- subir o banco e aplicar as migracoes -- e justamente a
 * parte que nao participa do defeito.
 *
 * ===========================================================================
 * OS DOIS SENTIDOS
 * ===========================================================================
 * 1. COM o conserto (o `compose.integracao.yaml` de hoje): cada projeto so ve
 *    a sua marca. Se ver a do vizinho, REPROVA -- o isolamento quebrou.
 * 2. SEM o conserto (`iscas/compose-defeito-tag-global.yaml` sobreposto, que
 *    devolve a tag fixa): os dois projetos veem a mesma imagem. Se NAO
 *    contaminar, REPROVA tambem -- significa que a isca perdeu a capacidade de
 *    detectar o defeito, e uma isca cega aprova tudo.
 *
 * ===========================================================================
 * A VARREDURA DAS OUTRAS DIMENSOES
 * ===========================================================================
 * Imagem era a que estava global, mas ela nao e a unica por onde duas pilhas
 * se encontrariam. A isca confere as cinco, lendo o `docker compose config`
 * resolvido dos dois projetos: imagem, rede, volume nomeado, nome de conteiner
 * e porta publicada no hospedeiro. Qualquer identificador que aparecer nos
 * dois reprova, mesmo os que hoje ja estao certos -- porque o que a isca
 * precisa impedir e a REGRESSAO, e nao so o defeito conhecido.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { gerar } from './gerar-env-de-integracao.mjs';
import { identidadeDaPilha } from './identidade-da-pilha.mjs';

const COMPOSE = 'infra/integracao/compose.integracao.yaml';
const DEFEITO = 'infra/integracao/iscas/compose-defeito-tag-global.yaml';
const ENV = '.env.integracao';

const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const commitDeBuild =
  process.env.BUILD_COMMIT?.trim() ||
  execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();

const aLimpar = { arvores: [], imagens: new Set() };

function morrer(mensagem) {
  console.error(`\nREPROVADO: ${mensagem}\n`);
  limpar();
  process.exit(1);
}

function rodar(programa, argumentos, opcoes = {}) {
  const r = spawnSync(programa, argumentos, { encoding: 'utf8', ...opcoes });
  if (r.status !== 0) {
    throw new Error(
      `${programa} ${argumentos.join(' ')} saiu ${String(r.status)}\n${r.stderr ?? ''}`.trim(),
    );
  }
  return r.stdout ?? '';
}

/**
 * Uma arvore descartavel com uma migracao de marca propria.
 *
 * `git worktree add --detach` e nao uma copia do diretorio: o caminho precisa
 * ser um worktree de verdade para `git rev-parse --show-toplevel` responder, e
 * e desse caminho que a identidade da pilha sai. Copiar a arvore provaria a
 * regra de um lugar que a suite nunca roda.
 *
 * A migracao de marca fica SO aqui dentro, nao rastreada, e vai embora com a
 * arvore. `migrations/` do repositorio nao e tocado.
 */
function arvoreDescartavel(rotulo) {
  const caminho = mkdtempSync(join(tmpdir(), `isca-isolamento-${rotulo}-`));
  rmSync(caminho, { recursive: true, force: true });
  rodar('git', ['-C', raiz, 'worktree', 'add', '--detach', '--quiet', caminho, commitDeBuild]);
  aLimpar.arvores.push(caminho);

  const marca = `29990101000000_marca-da-isca-${rotulo}.sql`;
  writeFileSync(
    join(caminho, 'migrations', marca),
    `-- Migracao de marca da isca de isolamento (arvore ${rotulo}).\n` +
      '-- Nunca e aplicada: a isca le o NOME do arquivo dentro da imagem e nao sobe banco.\n' +
      '-- Ano 2999 para nunca disputar ordem com migracao de verdade.\n' +
      'SELECT 1;\n',
  );

  // `.env.integracao` e exigido pelo `env_file` e pela interpolacao (`:?`) de
  // `POSTGRES_PASSWORD`. Sem ele nem `config` resolve. Gerado pelo mesmo
  // modulo que a suite usa, com os mesmos valores falsos que se anunciam como
  // falsos -- nada do `.env` real sai da arvore principal.
  const antes = process.cwd();
  process.chdir(caminho);
  try {
    gerar();
  } finally {
    process.chdir(antes);
  }

  return { rotulo, caminho, marca, ...identidadeDaPilha(caminho) };
}

function compose(arvore, argumentos, sobreporDefeito) {
  const arquivos = sobreporDefeito
    ? ['-f', COMPOSE, '-f', DEFEITO]
    : ['-f', COMPOSE];
  return rodar(
    'docker',
    ['compose', '-p', arvore.projeto, ...arquivos, '--env-file', ENV, ...argumentos],
    {
      cwd: arvore.caminho,
      env: {
        ...process.env,
        BUILD_COMMIT: commitDeBuild,
        TAG_DA_PILHA: arvore.tagDaPilha,
      },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
}

/** A configuracao RESOLVIDA, que e o que o compose de fato executa. */
function configuracao(arvore, sobreporDefeito) {
  return JSON.parse(compose(arvore, ['config', '--format', 'json'], sobreporDefeito));
}

/** As migracoes que existem DENTRO da imagem que este projeto resolve. */
function migracoesNaImagem(imagem) {
  aLimpar.imagens.add(imagem);
  const saida = rodar('docker', ['run', '--rm', '--entrypoint', 'ls', imagem, '/app/migrations']);
  return saida.split('\n').filter((l) => l.trim() !== '');
}

/**
 * Todo identificador que duas pilhas poderiam compartilhar, por dimensao.
 *
 * Volume anonimo (`/app/node_modules`) nao entra: ele nasce por conteiner e
 * nao tem nome que colida. Volume NOMEADO entraria, e por isso a chave
 * `volumes` de topo e lida mesmo hoje, que ela nao existe.
 */
function identificadores(cfg) {
  const servicos = Object.entries(cfg.services ?? {});
  return {
    imagem: servicos.map(([n, s]) => `${n}=${String(s.image ?? '')}`),
    'nome de conteiner': servicos
      .filter(([, s]) => s.container_name)
      .map(([n, s]) => `${n}=${String(s.container_name)}`),
    rede: Object.keys(cfg.networks ?? {}).map((n) => String(cfg.networks[n]?.name ?? n)),
    'volume nomeado': Object.keys(cfg.volumes ?? {}).map((n) => String(cfg.volumes[n]?.name ?? n)),
    'porta publicada': servicos.flatMap(([n, s]) =>
      (s.ports ?? [])
        .filter((p) => p.published !== undefined && p.published !== '')
        .map((p) => `${n}=${String(p.host_ip ?? '')}:${String(p.published)}`),
    ),
  };
}

function limpar() {
  for (const imagem of aLimpar.imagens) {
    // So imagens que ESTA isca criou: `int-<sufixo>` de arvore descartavel e a
    // tag do proprio arquivo de defeito. Nunca a de outro worktree -- imagem
    // apagada no meio da suite de outra pessoa seria um defeito novo, e seria
    // este mesmo defeito com o sinal trocado.
    spawnSync('docker', ['image', 'rm', '-f', imagem], { stdio: 'ignore' });
  }
  for (const caminho of aLimpar.arvores) {
    spawnSync('git', ['-C', raiz, 'worktree', 'remove', '--force', caminho], { stdio: 'ignore' });
    rmSync(caminho, { recursive: true, force: true });
  }
  spawnSync('git', ['-C', raiz, 'worktree', 'prune'], { stdio: 'ignore' });
}
process.on('SIGINT', () => {
  limpar();
  process.exit(130);
});

/**
 * Constroi A, depois B, e le o que cada projeto resolve. A ordem importa: e o
 * segundo build que arranca a tag do primeiro, entao quem sofre e A.
 *
 * @returns {{contaminou: boolean, linhas: string[]}}
 */
function experimento(a, b, sobreporDefeito) {
  compose(a, ['build', 'migracao'], sobreporDefeito);
  compose(b, ['build', 'migracao'], sobreporDefeito);

  const linhas = [];
  let contaminou = false;
  for (const [arvore, vizinha] of [
    [a, b],
    [b, a],
  ]) {
    const imagem = String(configuracao(arvore, sobreporDefeito).services.migracao.image);
    const migracoes = migracoesNaImagem(imagem);
    const temAPropria = migracoes.includes(arvore.marca);
    const temADoVizinho = migracoes.includes(vizinha.marca);
    if (temADoVizinho || !temAPropria) contaminou = true;
    linhas.push(
      `    ${arvore.rotulo}  projeto=${arvore.projeto}  imagem=${imagem}\n` +
        `       a sua (${arvore.marca}): ${temAPropria ? 'SIM' : 'NAO'}` +
        `   a do vizinho (${vizinha.marca}): ${temADoVizinho ? 'SIM' : 'NAO'}`,
    );
  }
  return { contaminou, linhas };
}

// ---------------------------------------------------------------------------

let saida = 0;
try {
  console.log(`worktree de origem: ${raiz}`);
  console.log('criando duas arvores descartaveis, cada uma com uma migracao de marca propria...\n');
  const a = arvoreDescartavel('a');
  const b = arvoreDescartavel('b');

  console.log('== SENTIDO 1: com o conserto (tag derivada do caminho) ==');
  const comConserto = experimento(a, b, false);
  console.log(comConserto.linhas.join('\n'));
  if (comConserto.contaminou) {
    morrer(
      'duas pilhas simultaneas se enxergaram. A imagem de um projeto trouxe a migracao do ' +
        'outro, ou perdeu a propria. O isolamento por worktree quebrou: `npm run ' +
        'test:integration` pode estar migrando com o esquema de outra branch, em silencio.',
    );
  }
  console.log('    -> isolado: cada projeto so ve a sua.\n');

  console.log('== dimensoes conferidas (identificador compartilhado reprova) ==');
  const idA = identificadores(configuracao(a, false));
  const idB = identificadores(configuracao(b, false));
  const compartilhadas = [];
  for (const dimensao of Object.keys(idA)) {
    const comuns = idA[dimensao].filter((v) => idB[dimensao].includes(v));
    const quantos = idA[dimensao].length;
    console.log(
      `    ${dimensao.padEnd(18)} ${String(quantos).padStart(2)} identificador(es)  ` +
        `${comuns.length === 0 ? 'nenhum em comum' : `EM COMUM: ${comuns.join(', ')}`}`,
    );
    if (comuns.length > 0) compartilhadas.push(`${dimensao} (${comuns.join(', ')})`);
  }
  if (compartilhadas.length > 0) {
    morrer(
      `dois worktrees compartilham identificador em: ${compartilhadas.join('; ')}. ` +
        'Cada uma dessas dimensoes e um caminho por onde uma pilha alcanca a outra.',
    );
  }
  console.log('');

  console.log('== SENTIDO 2: sem o conserto (tag fixa reposta pela isca) ==');
  const semConserto = experimento(a, b, true);
  console.log(semConserto.linhas.join('\n'));
  if (!semConserto.contaminou) {
    morrer(
      `com ${DEFEITO} sobreposto, que repoe a tag fixa, as duas pilhas continuaram isoladas. ` +
        'Isso NAO significa que o defeito sumiu: significa que esta isca deixou de saber ' +
        'detecta-lo, e isca cega aprova tudo. Conserte a isca antes de confiar no sentido 1.',
    );
  }
  console.log('    -> contaminou, como tem que contaminar: a isca enxerga o defeito.\n');

  console.log('isolamento da pilha de integracao: APROVADO nos dois sentidos');
} catch (erro) {
  console.error(`\nREPROVADO: a isca nao conseguiu concluir.\n${String(erro?.message ?? erro)}\n`);
  saida = 1;
} finally {
  limpar();
}
process.exit(saida);
