#!/usr/bin/env node
// Orcamento do painel como PORTAO (ADR-0027 item 1): medido no que o build
// produziu, e quebrando a esteira quando estoura. Orcamento que nao quebra o
// build e decoracao.
//
//   JavaScript INICIAL de cada documento HTML  <= 200 KB comprimidos
//   cada pedaco carregado SOB DEMANDA          <= 150 KB comprimidos
//
// "Inicial" e o que o documento pede antes de qualquer interacao: os
// `<script type="module" src>` e os `<link rel="modulepreload" href>` que o
// Vite escreve no HTML. Vale para CADA documento em `dist/` (a SPA em
// `index.html` e o login isolado em `entrar/index.html`, D41), porque cada um e
// uma primeira carga. Todo outro `.js` de `dist/` e sob demanda -- o pedaco do
// mapa (Leaflet, so na tela de evento) e o caso que o ADR nomeia, e a regra vale
// para qualquer um, porque o nome do pedaco e decisao do app e nao desta
// conferencia.
//
// "Comprimidos" = gzip nivel 9, medido aqui, e nao o `.gz` que o Dockerfile
// gera: a conferencia roda sobre o `dist/` do `npm run build`, antes da imagem.
// O brotli servido e menor, entao o gzip e o lado conservador. KB = 1000 bytes,
// como o Vite imprime.
//
// Uso:  node verificar-orcamento-do-admin.mjs admin/dist
//       node verificar-orcamento-do-admin.mjs --autoteste
// Saida 0 aprovado, 1 reprovado. Sem HTML ou sem JS inicial, reprova: nao ter
// o que medir nao e caber no orcamento.

import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

export const TETO_INICIAL = 200_000;
export const TETO_SOB_DEMANDA = 150_000;

function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const c = join(dir, nome);
    if (statSync(c).isDirectory()) saida.push(...arquivos(c));
    else saida.push(c);
  }
  return saida;
}

const comprimido = (caminho) => gzipSync(readFileSync(caminho), { level: 9 }).length;

export function medir(dist) {
  const todos = arquivos(dist);
  const htmls = todos.filter((f) => f.endsWith('.html'));
  const js = todos.filter((f) => /\.m?js$/.test(f));
  const falhas = [];
  const relatorio = [];
  if (htmls.length === 0) return { falhas: [`nenhum HTML em ${dist}: nao ha documento para medir`], relatorio };

  const iniciais = new Set();
  for (const html of htmls) {
    const texto = readFileSync(html, 'utf8');
    const refs = [
      ...texto.matchAll(/<script[^>]*\stype="module"[^>]*\ssrc="([^"]+)"/g),
      ...texto.matchAll(/<link[^>]*\srel="modulepreload"[^>]*\shref="([^"]+)"/g),
    ].map((m) => m[1]);
    const locais = refs.filter((r) => !/^[a-z]+:\/\//i.test(r));
    if (locais.length === 0) {
      // Documento sem JS (uma pagina de erro estatica, por exemplo) cabe em
      // qualquer orcamento. O `index.html` da raiz, nao: e a SPA, e SPA sem
      // script de modulo quer dizer que a leitura do HTML parou de enxergar.
      if (relative(dist, html) === 'index.html') {
        falhas.push('index.html: nenhum script de modulo local; a SPA sem JS inicial quer dizer que esta leitura cegou');
      } else {
        relatorio.push(`inicial de ${relative(dist, html)}: sem JavaScript`);
      }
      continue;
    }
    let soma = 0;
    for (const ref of locais) {
      const alvo = ref.startsWith('/') ? join(dist, ref) : resolve(dirname(html), ref);
      try {
        soma += comprimido(alvo);
        iniciais.add(alvo);
      } catch {
        falhas.push(`${relative(dist, html)} referencia ${ref}, que nao existe em dist/`);
      }
    }
    relatorio.push(`inicial de ${relative(dist, html)}: ${(soma / 1000).toFixed(1)} KB (teto ${TETO_INICIAL / 1000})`);
    if (soma > TETO_INICIAL) {
      falhas.push(`${relative(dist, html)}: JavaScript inicial com ${(soma / 1000).toFixed(1)} KB comprimidos, acima de ${TETO_INICIAL / 1000} KB (ADR-0027 item 1)`);
    }
  }
  for (const f of js) {
    if (iniciais.has(f)) continue;
    const n = comprimido(f);
    relatorio.push(`sob demanda ${relative(dist, f)}: ${(n / 1000).toFixed(1)} KB (teto ${TETO_SOB_DEMANDA / 1000})`);
    if (n > TETO_SOB_DEMANDA) {
      falhas.push(`${relative(dist, f)}: pedaco sob demanda com ${(n / 1000).toFixed(1)} KB comprimidos, acima de ${TETO_SOB_DEMANDA / 1000} KB (ADR-0027 item 1)`);
    }
  }
  return { falhas, relatorio };
}

// Bytes aleatorios nao comprimem: N bytes aqui viram ~N bytes comprimidos, e a
// isca estoura o teto de verdade. (Texto em base36 comprime a ~65% e deixava as
// iscas ABAIXO do teto -- medido em 23/09, o autoteste acusou.) O arquivo so e
// medido, nunca executado.
const ruido = (n) => randomBytes(n);

export function autoteste() {
  const falhas = [];
  const caso = (nome, montar, deveReprovar) => {
    const d = mkdtempSync(join(tmpdir(), 'orcamento-'));
    try {
      mkdirSync(join(d, 'assets'), { recursive: true });
      montar(d);
      const { falhas: f } = medir(d);
      if (deveReprovar && f.length === 0) falhas.push(`isca "${nome}" PASSOU: o orcamento parou de enxergar esse estouro`);
      if (!deveReprovar && f.length > 0) falhas.push(`caso certo "${nome}" reprovou: ${f.join('; ')}`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };
  const html = (scripts, preload = []) =>
    `<!doctype html><html><head>${preload.map((p) => `<link rel="modulepreload" crossorigin href="${p}">`).join('')}` +
    `${scripts.map((s) => `<script type="module" crossorigin src="${s}"></script>`).join('')}</head></html>`;

  caso('painel dentro do orcamento', (d) => {
    writeFileSync(join(d, 'index.html'), html(['/assets/main.js']));
    writeFileSync(join(d, 'assets/main.js'), ruido(50_000));
    writeFileSync(join(d, 'assets/mapa.js'), ruido(100_000));
  }, false);
  caso('JS inicial acima de 200 KB', (d) => {
    writeFileSync(join(d, 'index.html'), html(['/assets/main.js']));
    writeFileSync(join(d, 'assets/main.js'), ruido(260_000));
  }, true);
  caso('inicial estourando SO pela soma com o modulepreload', (d) => {
    writeFileSync(join(d, 'index.html'), html(['/assets/main.js'], ['/assets/vendor.js']));
    writeFileSync(join(d, 'assets/main.js'), ruido(120_000));
    writeFileSync(join(d, 'assets/vendor.js'), ruido(120_000));
  }, true);
  caso('pedaco sob demanda acima de 150 KB', (d) => {
    writeFileSync(join(d, 'index.html'), html(['/assets/main.js']));
    writeFileSync(join(d, 'assets/main.js'), ruido(10_000));
    writeFileSync(join(d, 'assets/mapa.js'), ruido(190_000));
  }, true);
  caso('login isolado estourando', (d) => {
    writeFileSync(join(d, 'index.html'), html(['/assets/main.js']));
    writeFileSync(join(d, 'assets/main.js'), ruido(10_000));
    mkdirSync(join(d, 'entrar'));
    writeFileSync(join(d, 'entrar/index.html'), html(['/assets/entrar.js']));
    writeFileSync(join(d, 'assets/entrar.js'), ruido(230_000));
  }, true);
  caso('documento estatico sem JS ao lado da SPA', (d) => {
    writeFileSync(join(d, 'index.html'), html(['/assets/main.js']));
    writeFileSync(join(d, 'assets/main.js'), ruido(10_000));
    writeFileSync(join(d, '404.html'), '<!doctype html><p>nao encontrado</p>');
  }, false);
  caso('SPA sem script de modulo', (d) => {
    writeFileSync(join(d, 'index.html'), '<!doctype html><p>nada</p>');
  }, true);
  caso('dist sem HTML', (d) => {
    writeFileSync(join(d, 'assets/main.js'), ruido(1_000));
  }, true);
  return falhas;
}

function main(argv) {
  console.log(`orcamento do painel (ADR-0027 item 1): inicial <= ${TETO_INICIAL / 1000} KB, sob demanda <= ${TETO_SOB_DEMANDA / 1000} KB, gzip -9`);
  const cegueira = autoteste();
  console.log(`  [${cegueira.length === 0 ? 'ok' : 'REPROVA'}] autoteste das iscas`);
  if (cegueira.length > 0) {
    for (const f of cegueira) console.log(`  - ${f}`);
    return 1;
  }
  if (argv[0] === '--autoteste') return 0;
  if (!argv[0]) {
    console.log('REPROVADO: informe o diretorio do build (admin/dist)');
    return 1;
  }
  let resultado;
  try {
    resultado = medir(argv[0]);
  } catch (erro) {
    console.log(`REPROVADO: nao consegui ler ${argv[0]}: ${erro instanceof Error ? erro.message : erro}`);
    return 1;
  }
  for (const linha of resultado.relatorio) console.log(`  ${linha}`);
  if (resultado.falhas.length > 0) {
    console.log(`\nREPROVADO com ${resultado.falhas.length} achado(s):`);
    for (const f of resultado.falhas) console.log(`  - ${f}`);
    return 1;
  }
  console.log('\nAPROVADO');
  return 0;
}

const invocadoDiretamente = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invocadoDiretamente) process.exit(main(process.argv.slice(2)));
