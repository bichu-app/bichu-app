#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint
// deste repositorio nao declara os globais de Node para `**/*.mjs` fora de
// `src/`, entao `console` e `process` reprovariam em `no-undef`.
/**
 * As variaveis de ambiente que o CODIGO exige, lidas do proprio codigo.
 *
 * Uma fonte so para duas bocas: o gerador do `.env.integracao` e a guarda
 * `nenhuma variavel exigida ficou vazia` da esteira. Duas copias da mesma
 * leitura divergem, e a que diverge para menos aprova o que nao conferiu.
 *
 * ===========================================================================
 * A ORDEM DE RETIRAR COMENTARIO NAO E ESTILO. LEIA ANTES DE TROCAR.
 * ===========================================================================
 * A versao anterior desta leitura (inline em ci.yml) retirava BLOCO primeiro e
 * LINHA depois. `src/shared/config/app-config.ts:531` tem, dentro de um
 * comentario de LINHA, o texto:
 *
 *     // dos seus proprios `/.well-known/*` -- e a falta deles nao produz erro
 *
 * O `/*` do fim de `/.well-known/*` abre um bloco para a expressao regular. A
 * retirada de bloco engolia dali ate o proximo fechamento de JSDoc, e com ele
 * TREZE chamadas reais de `requireEnv`: DATABASE_URL, IP_HMAC_KEY,
 * TAG_CODE_KEY, MAIL_FROM, MAIL_WEBHOOK_SECRET, API_BASE_URL,
 * MEDIA_PUBLIC_BASE_URL, OBJECT_STORAGE_REGION, OBJECT_STORAGE_ACCESS_KEY_ID,
 * OBJECT_STORAGE_SECRET_ACCESS_KEY, OBJECT_BUCKET_PRIVATE, OBJECT_BUCKET_PUBLIC
 * e MAIL_FROM em `replyTo`.
 *
 * A guarda dizia "12 variaveis exigidas pelo codigo, todas preenchidas" e nao
 * tinha olhado para DATABASE_URL. Ela aprovava por nao ter visto.
 *
 * Retirar LINHA primeiro e depois BLOCO corrige este caso. O caso esta guardado
 * em `infra/integracao/iscas/isca-comentario-que-abre-bloco.ts` e a funcao
 * `autoteste()` abaixo REPROVA se ele voltar a passar despercebido.
 * ===========================================================================
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LITERAL = /requireEnv\(\s*'([A-Z0-9_]+)'\s*\)/g;
const QUALQUER = /requireEnv\(/g;

function semComentarios(texto, nomeDoArquivo) {
  // LINHA primeiro. Ver o bloco acima.
  let limpo = texto.replace(/^[^\n]*?\/\/[^\n]*$/gm, (linha) => {
    const i = linha.indexOf('//');
    // So retira quando o `//` esta no comeco do que sobrou da linha depois do
    // recuo. `https://` no meio de uma string nao e comentario, e retirar dali
    // apagaria codigo.
    return linha.slice(0, i).trim() === '' ? '' : linha;
  });
  limpo = limpo.replace(/\/\*[\s\S]*?\*\//g, '');
  // A definicao da propria funcao nao e chamada.
  if (nomeDoArquivo === 'env.ts') {
    limpo = limpo.replace(/export function requireEnv[^\n]*/g, '');
  }
  return limpo;
}

function arquivosTs(raiz, sufixo) {
  const saida = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (nome.endsWith(sufixo) && !nome.endsWith('.test.ts')) saida.push(caminho);
    }
  };
  andar(raiz);
  return saida;
}

/**
 * @returns {{exigidas: string[], opacas: string[]}}
 * `opacas` sao as chamadas cujo nome so existe em tempo de execucao
 * (`requireEnv(nome)`, template literal). Elas NAO estao sendo conferidas, e
 * quem chama precisa reprovar em vez de seguir calado.
 */
export function lerVariaveisExigidas(raiz = 'src', sufixo = '.ts') {
  const exigidas = new Set();
  const opacas = [];
  for (const caminho of arquivosTs(raiz, sufixo)) {
    const nome = caminho.split('/').pop().replace(/\.fixture$/, '');
    const texto = semComentarios(readFileSync(caminho, 'utf8'), nome);
    const literais = [...texto.matchAll(LITERAL)].map((m) => m[1]);
    for (const v of literais) exigidas.add(v);
    const todas = [...texto.matchAll(QUALQUER)].length;
    if (todas > literais.length) opacas.push(`${caminho}: ${todas - literais.length}`);
  }
  return { exigidas: [...exigidas].sort(), opacas };
}

/**
 * A isca. Reprova se a leitura voltar a perder chamada por causa de um `/*`
 * dentro de comentario de linha.
 *
 * Isto nao e teste de unidade solto: e a condicao de a guarda valer. Guarda que
 * nao se prova enxergando vale pela confianca no dia em que foi escrita.
 */
export function autoteste(diretorioDaIsca = 'infra/integracao/iscas') {
  const { exigidas } = lerVariaveisExigidas(diretorioDaIsca, '.ts.fixture');
  const precisa = ['ISCA_DEPOIS_DO_COMENTARIO_DE_LINHA', 'ISCA_ANTES_DO_COMENTARIO_DE_LINHA'];
  const faltando = precisa.filter((v) => !exigidas.includes(v));
  if (faltando.length > 0) {
    throw new Error(
      'autoteste da leitura de variaveis REPROVOU: ' +
        `${faltando.join(', ')} nao foi encontrada em ${diretorioDaIsca}. ` +
        'A retirada de comentario esta engolindo codigo, e a guarda da esteira ' +
        'passaria a aprovar um .env sem variavel obrigatoria. Ver o bloco no ' +
        'topo de infra/integracao/variaveis-exigidas.mjs.',
    );
  }
  const naoPodem = exigidas.filter((v) => v.startsWith('ISCA_SO_EM_COMENTARIO'));
  if (naoPodem.length > 0) {
    throw new Error(
      `autoteste REPROVOU no outro sentido: ${naoPodem.join(', ')} esta dentro de ` +
        'comentario e foi contada como exigencia. A leitura parou de retirar ' +
        'comentario, e a guarda passaria a exigir variavel que ninguem le.',
    );
  }
  return `autoteste da leitura de variaveis: aprovado (${precisa.length} achadas, comentario ignorado)`;
}

if (process.argv[1]?.endsWith('variaveis-exigidas.mjs')) {
  console.log(autoteste());
  const { exigidas, opacas } = lerVariaveisExigidas('src');
  console.log(`${exigidas.length} variaveis exigidas pelo codigo:`);
  console.log(exigidas.join('\n'));
  if (opacas.length > 0) {
    console.error('chamadas fora do alcance da leitura: ' + opacas.join('; '));
    process.exit(1);
  }
}
