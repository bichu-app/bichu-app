#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint deste
// repositorio nao declara os globais de Node para `**/*.mjs` fora de `src/`,
// entao `console` e `process` reprovariam em `no-undef`.
/**
 * Tudo que a esteira manda rodar DENTRO do conteiner chegou na imagem?
 *
 *   node infra/verificacao/verificar-arquivos-no-container.mjs bichu-app:local
 *
 * ====================================================================
 * POR QUE ESTE VERIFICADOR EXISTE
 * ====================================================================
 *
 * Em 22/09 a esteira reprovou com:
 *
 *   Error: Cannot find module '/app/infra/integracao/executar-suite.mjs'
 *
 * O arquivo estava no repositorio e estava no CONTEXTO de build -- o
 * `.dockerignore` nunca o excluiu. O que faltava era uma linha: o alvo `dev` do
 * Dockerfile copia `src`, `tests`, `api` e `migrations` NOME A NOME, e a
 * BICHUS-204 tinha acabado de mover o executor da suite de integracao para
 * `infra/integracao/`, que nenhum `COPY` alcanca.
 *
 * O defeito passou despercebido por um motivo que se repete: a pilha efemera de
 * `compose.integracao.yaml` monta o worktree inteiro por cima de `/app`
 * (`- ../..:/app`). De dentro de um worktree a suite achava o arquivo pelo
 * VOLUME, nunca pela imagem. Rodar a suite localmente ficava verde com o defeito
 * inteiro de pe; so a esteira, que nao monta volume nenhum, tocava no caminho
 * real.
 *
 * Por isso a prova nao pode ser "a suite passou aqui". A prova e esta: para cada
 * `npm run <script>` que alguma coisa deste repositorio manda executar dentro de
 * um conteiner, todo arquivo que esse script abre precisa EXISTIR na imagem.
 *
 * ====================================================================
 * NADA AQUI E LISTA MANTIDA A MAO
 * ====================================================================
 *
 * Lista de arquivos escrita a mao envelhece calada: o proximo arquivo novo nao
 * entra nela, e o portao aprova a ausencia dele. As duas pontas sao derivadas.
 *
 * 1. QUEM CHAMA. Os chamadores sao varridos de `.github/workflows/*.yml`, do
 *    `Makefile` e de `infra/integracao/rodar.mjs`, procurando a forma
 *    `run --rm <servico> npm [run] <script>`. Quem acrescentar um passo novo na
 *    esteira entra nesta conta sem editar nada.
 *
 * 2. O QUE O SCRIPT ABRE. O comando do script sai do `package.json`, e dele saem
 *    os caminhos: token que tem barra e que existe no disco do repositorio. De
 *    cada `.mjs` encontrado, as importacoes relativas sao seguidas em cadeia --
 *    `executar-suite.mjs` importa `guarda-de-banco-descartavel.mjs`, e uma
 *    imagem com o primeiro e sem o segundo morreria igual.
 *
 * Verificacao que nao consegue verificar REPROVA: descoberta vazia dos dois
 * lados e falha, com o motivo. Um portao que nao achou o que conferir e
 * indistinguivel de um portao que conferiu e aprovou, e e assim que ele deixa de
 * valer sem ninguem desliga-lo.
 *
 * ====================================================================
 * A PROVA NEGATIVA RODA JUNTO, SEMPRE
 * ====================================================================
 *
 * Antes de olhar para a imagem de verdade, este script deriva duas imagens
 * mutiladas a partir dela (uma camada cada, segundos) e EXIGE que as duas
 * reprovem:
 *
 *   sem `/app/infra`                          o defeito de 22/09, identico
 *   sem `guarda-de-banco-descartavel.mjs`     so a importacao em cadeia
 *
 * A terceira isca nao precisa de Docker: uma descoberta que nao acha chamador
 * nenhum PRECISA reprovar, em vez de anunciar "nenhum arquivo faltando".
 *
 * Se qualquer uma das tres der o resultado errado, este script falha com "o
 * verificador de arquivos no conteiner parou de verificar" e NAO chega a avaliar
 * a imagem real.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(raiz);

const FONTES = ['.github/workflows/ci.yml', 'Makefile', 'infra/integracao/rodar.mjs'];

function morrer(mensagem) {
  console.error(`\nREPROVADO: ${mensagem}\n`);
  process.exit(1);
}

/**
 * `run --rm <servico> npm [run] <script>`, nas tres formas em que ela aparece.
 *
 * A do `rodar.mjs` e um vetor de JavaScript (`['run', '--rm', 'testes', ...]`) e
 * as outras duas sao linha de shell. Em vez de tres expressoes, o texto e
 * normalizado antes: aspas, virgulas e colchetes viram espaco, e as tres formas
 * passam a ser a mesma frase.
 */
function descobrirChamadas(fontes) {
  const achadas = [];
  for (const fonte of fontes) {
    if (!existsSync(fonte)) continue;
    const texto = readFileSync(fonte, 'utf8').replace(/['"[\],]/g, ' ');
    const padrao = /\brun\s+--rm\s+(?:-T\s+)?([A-Za-z][\w.-]*)\s+npm\s+(?:run\s+)?([\w:.-]+)/g;
    for (const casado of texto.matchAll(padrao)) {
      achadas.push({ fonte, servico: casado[1], script: casado[2] });
    }
  }
  return achadas;
}

/**
 * Token que e arquivo DESTE repositorio, e nao curinga nem bandeira.
 *
 * O teste e o disco, e nao a forma do texto: `tsconfig.json` nao tem barra e e
 * exatamente o tipo de arquivo cuja ausencia na imagem so aparece em execucao.
 * Exigir barra deixaria de fora tudo que mora na raiz.
 */
function ehCaminhoDoRepositorio(token) {
  if (token === '' || token.startsWith('-')) return false;
  if (token.includes('*') || token.includes('$')) return false;
  if (!existsSync(token)) return false;
  return statSync(token).isFile();
}

/** Importacoes RELATIVAS de um modulo, em cadeia. Pacote de node_modules, nao. */
function seguirImportacoes(arquivo, vistos) {
  if (vistos.has(arquivo)) return;
  vistos.add(arquivo);
  if (!/\.m?js$/.test(arquivo)) return;
  const texto = readFileSync(arquivo, 'utf8');
  const padrao = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
  for (const casado of texto.matchAll(padrao)) {
    const alvo = relative(raiz, resolve(dirname(arquivo), casado[1]));
    if (existsSync(alvo) && statSync(alvo).isFile()) seguirImportacoes(alvo, vistos);
  }
}

function caminhosDoScript(scripts, nome) {
  const comando = scripts[nome];
  if (comando === undefined) {
    morrer(
      `algo neste repositorio manda \`npm run ${nome}\` dentro de um conteiner, e o script ` +
        'nao existe em `package.json`. Dentro da imagem isso sai como `npm error Missing script`, ' +
        'e o passo reprova longe de onde o nome foi digitado.',
    );
  }
  const vistos = new Set();
  for (const token of comando.replace(/[&|;]+/g, ' ').split(/\s+/)) {
    if (ehCaminhoDoRepositorio(token)) seguirImportacoes(token, vistos);
  }
  return vistos;
}

/** Quais destes caminhos NAO existem em `/app` da imagem. Uma subida de conteiner so. */
function faltandoNaImagem(imagem, caminhos) {
  const lista = [...caminhos].sort();
  if (lista.length === 0) return [];
  const resultado = spawnSync(
    'docker',
    [
      'run', '--rm', '--entrypoint', 'sh', imagem,
      '-c', 'for p in "$@"; do [ -e "/app/$p" ] || echo "$p"; done', 'sh',
      ...lista,
    ],
    { encoding: 'utf8' },
  );
  if (resultado.status !== 0) {
    morrer(
      `nao consegui inspecionar a imagem \`${imagem}\` (saida ${String(resultado.status)}). ` +
        `Sem leitura da imagem nao ha o que afirmar.\n${resultado.stderr ?? ''}`,
    );
  }
  return resultado.stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '');
}

/** Uma camada por cima da imagem real: constroi em segundos e nao toca na original. */
function derivarImagem(base, instrucao, marca) {
  const tag = `bichu-isca-arquivos:${marca}`;
  const resultado = spawnSync('docker', ['build', '-q', '-t', tag, '-'], {
    input: `FROM ${base}\nUSER root\nRUN ${instrucao}\n`,
    encoding: 'utf8',
  });
  if (resultado.status !== 0) {
    morrer(
      `nao consegui derivar a imagem de isca a partir de \`${base}\`. As iscas sao a prova de ` +
        `que este portao ainda reprova; sem elas ele vale por confianca.\n${resultado.stderr ?? ''}`,
    );
  }
  return tag;
}

function apagarImagem(tag) {
  spawnSync('docker', ['image', 'rm', '-f', tag], { stdio: 'ignore' });
}

// ====================================================================
// As duas descobertas, e a exigencia de que nenhuma delas volte vazia.
// ====================================================================
const imagem = process.argv[2];
if (imagem === undefined || imagem === '') {
  morrer('falta o nome da imagem. Uso: verificar-arquivos-no-container.mjs bichu-app:local');
}

const chamadas = descobrirChamadas(FONTES);
if (chamadas.length === 0) {
  morrer(
    'nao encontrei NENHUM `run --rm <servico> npm ...` em ' +
      `${FONTES.join(', ')}. Ou a esteira parou de rodar coisa dentro do conteiner, ou a forma ` +
      'do comando mudou e esta varredura ficou cega. Aprovar aqui seria aprovar sem ter olhado.',
  );
}

const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
const exigidos = new Set();
for (const chamada of chamadas) {
  for (const caminho of caminhosDoScript(scripts, chamada.script)) exigidos.add(caminho);
}
if (exigidos.size === 0) {
  morrer(
    `os ${String(chamadas.length)} chamadores encontrados nao apontaram para arquivo nenhum do ` +
      'repositorio. Ou os scripts passaram a ser todos curinga, ou a extracao de caminho ficou ' +
      'cega -- nos dois casos este portao deixou de conferir o que quer que seja.',
  );
}

console.log(`chamadores dentro de conteiner: ${String(chamadas.length)}`);
for (const c of chamadas) console.log(`  ${c.fonte}: run --rm ${c.servico} npm run ${c.script}`);
console.log(`\narquivos que precisam estar na imagem: ${String(exigidos.size)}`);
for (const caminho of [...exigidos].sort()) console.log(`  ${caminho}`);

// ====================================================================
// AS ISCAS. Antes da imagem real, e sem elas nada aqui vale.
// ====================================================================
const marca = String(process.pid);
const iscas = [
  {
    nome: 'imagem sem /app/infra (o defeito de 22/09, identico)',
    instrucao: 'rm -rf /app/infra',
    esperado: 'infra/integracao/executar-suite.mjs',
  },
  {
    nome: 'imagem sem guarda-de-banco-descartavel.mjs (so a importacao em cadeia)',
    instrucao: 'rm -f /app/infra/integracao/guarda-de-banco-descartavel.mjs',
    esperado: 'infra/integracao/guarda-de-banco-descartavel.mjs',
  },
];

console.log('\niscas, que precisam REPROVAR:');
for (const [indice, isca] of iscas.entries()) {
  const tag = derivarImagem(imagem, isca.instrucao, `${marca}-${String(indice)}`);
  let faltando;
  try {
    faltando = faltandoNaImagem(tag, exigidos);
  } finally {
    apagarImagem(tag);
  }
  if (!faltando.includes(isca.esperado)) {
    morrer(
      `o verificador de arquivos no conteiner parou de verificar: a isca "${isca.nome}" NAO ` +
        `acusou \`${isca.esperado}\`. O que ele acusou foi: ${faltando.join(', ') || '(nada)'}. ` +
        'Enquanto isto nao voltar a reprovar, o veredito verde deste portao nao significa nada.',
    );
  }
  console.log(`  OK, reprovou: ${isca.nome}`);
}

// A terceira isca nao precisa de Docker: descoberta vazia tem que morrer, e nao
// anunciar "nenhum arquivo faltando" para uma lista de zero arquivos.
if (descobrirChamadas(['package.json']).length !== 0) {
  morrer(
    'o verificador de arquivos no conteiner parou de verificar: a varredura achou chamador ' +
      'em `package.json`, que nao chama nada dentro de conteiner. A expressao virou larga ' +
      'demais e passou a casar texto qualquer.',
  );
}
console.log('  OK, descoberta vazia reprova (a varredura nao casa texto qualquer)');

// ====================================================================
// A imagem real.
// ====================================================================
const faltando = faltandoNaImagem(imagem, exigidos);
if (faltando.length > 0) {
  morrer(
    `a imagem \`${imagem}\` nao carrega ${String(faltando.length)} arquivo(s) que a esteira ` +
      `manda executar dentro dela:\n  ${faltando.join('\n  ')}\n\n` +
      'O alvo `dev` do Dockerfile copia diretorio NOME A NOME. Arquivo novo fora de `src`, ' +
      '`tests`, `api`, `migrations` e `infra/integracao` precisa do seu proprio `COPY`. ' +
      'Rodar a suite de um worktree NAO pega isto: `compose.integracao.yaml` monta a arvore ' +
      'inteira por cima de `/app` e o arquivo aparece pelo volume, nunca pela imagem.',
  );
}

console.log(
  `\narquivos no conteiner: APROVADO -- ${String(exigidos.size)} arquivo(s) exigidos por ` +
    `${String(chamadas.length)} chamador(es), todos presentes em \`${imagem}\``,
);
