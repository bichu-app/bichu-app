#!/usr/bin/env node
// Varredor de valores soltos em web/src (ADR-0028, item 8: "nenhuma cor
// escrita a mao em web/src/ fora do gerado").
//
// Reprova, fora de src/styles/tokens.g.css e dos gerados:
//   1. literal de cor (#rgb, #rrggbb, #rrggbbaa, rgb(), hsl(), oklch()...) em
//      .css, .astro, .ts e .mjs;
//   2. cor por nome (red, white...) numa propriedade de CSS;
//   3. `@media` com largura que nao e um ponto de quebra de web.breakpoint.*
//      (CSS nao aceita var() em @media, entao o numero aparece e e conferido);
//   4. distancia em px escrita a mao dentro de CSS (arquivo .css ou <style>);
//   5. atributo style= em .astro (a aparencia sai toda do CSS);
//   6. papel "nunca texto" de design/tokens.json usado em `color:`.
//
// Excecao so com motivo, na lista fechada de scripts/excecoes-valores-soltos.json.
// Excecao que nao casa com nada tambem reprova: lista que so cresce vira ruido.
//
// As iscas rodam PRIMEIRO (tests/iscas/valores-soltos/): cada uma declara o que
// precisa ser acusado, e se o varredor deixar passar alguma, ele parou de
// enxergar e o comando sai 1 antes de olhar para src/.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(AQUI, '..');
const tokens = JSON.parse(readFileSync(resolve(WEB, '../design/tokens.json'), 'utf8'));
const excecoes = JSON.parse(readFileSync(resolve(AQUI, 'excecoes-valores-soltos.json'), 'utf8')).excecoes;

const PONTOS = Object.entries(tokens.web?.breakpoint ?? {})
  .filter(([k]) => !k.startsWith('$'))
  .map(([, v]) => `${v.$value.value}${v.$value.unit}`);
if (PONTOS.length === 0) {
  console.error('ERRO: nao achei web.breakpoint em design/tokens.json; sem eles o varredor nao sabe o que conferir.');
  process.exit(2);
}
const NUNCA_TEXTO = Object.keys(tokens.$extensions?.['bichu.nunca-texto'] ?? {}).filter((k) => !k.startsWith('$'));

const IGNORAR = [/^src\/styles\/tokens\.g\.css$/, /^src\/api\/generated\//, /^src\/icones\/simbolos\.ts$/];
const EXTENSOES = new Set(['.css', '.astro', '.ts', '.mjs']);
const NOMES_DE_COR =
  /\b(black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|cyan|magenta|silver|gold|navy|teal|maroon|olive|lime|aqua|fuchsia|beige|ivory|khaki|coral|salmon|crimson|indigo|violet|tomato|wheat)\b/i;
const PROPRIEDADES_DE_COR = /(?:^|[{;\s])(?:color|background(?:-color)?|border(?:-[a-z]+)*|outline(?:-color)?|fill|stroke|box-shadow|text-decoration(?:-color)?|caret-color|accent-color)\s*:\s*([^;}]*)/gi;

function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (EXTENSOES.has(extname(nome))) saida.push(caminho);
  }
  return saida;
}

/** Linhas que sao CSS: o arquivo .css inteiro, ou o miolo de <style> num .astro. */
function linhasDeCss(texto, ext) {
  const linhas = texto.split('\n');
  if (ext === '.css') return linhas.map((l, i) => [i + 1, l]);
  const saida = [];
  let dentro = false;
  linhas.forEach((l, i) => {
    if (/<style[\s>]/.test(l)) dentro = true;
    if (dentro) saida.push([i + 1, l]);
    if (/<\/style>/.test(l)) dentro = false;
  });
  return saida;
}

function semComentario(linha) {
  return linha.replace(/\/\*.*?\*\//g, '').replace(/(^|[^:])\/\/.*$/, '$1');
}

function varrer(raiz, rotulo) {
  const achados = [];
  for (const arquivo of arquivos(raiz)) {
    const rel = relative(rotulo === 'src' ? WEB : raiz, arquivo);
    if (rotulo === 'src' && IGNORAR.some((r) => r.test(rel))) continue;
    const ext = extname(arquivo);
    const texto = readFileSync(arquivo, 'utf8');
    const acusar = (linha, regra, trecho) => achados.push({ arquivo: rel, linha, regra, trecho: trecho.trim() });

    texto.split('\n').forEach((bruta, i) => {
      const l = semComentario(bruta);
      if (/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(l) && !/href=|["'`]#[a-z-]+["'`]/.test(l)) acusar(i + 1, 'cor literal (#hex)', bruta);
      if (/\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/i.test(l)) acusar(i + 1, 'cor literal (funcao de cor)', bruta);
      if (ext === '.astro' && /\sstyle=/.test(l)) acusar(i + 1, 'atributo style=', bruta);
    });

    for (const [n, bruta] of linhasDeCss(texto, ext)) {
      const l = semComentario(bruta);
      const media = [...l.matchAll(/\((?:min|max)-width:\s*([\d.]+px)\)/g)].map((m) => m[1]);
      for (const valor of media) if (!PONTOS.includes(valor)) acusar(n, `@media fora de web.breakpoint (${PONTOS.join(', ')})`, bruta);
      const semMedia = l.replace(/@media[^{]*/g, '');
      if (/(?<![\w.-])-?\d*\.?\d+px\b/.test(semMedia)) acusar(n, 'distancia em px escrita a mao', bruta);
      if ([...semMedia.matchAll(PROPRIEDADES_DE_COR)].some((m) => NOMES_DE_COR.test(m[1] ?? ''))) acusar(n, 'cor por nome', bruta);
      for (const papel of NUNCA_TEXTO) {
        if (new RegExp(`(^|[;{\\s])color:\\s*var\\(--cor-${papel}\\)`).test(semMedia)) acusar(n, `papel "${papel}" pintando texto (bichu.nunca-texto)`, bruta);
      }
    }
  }
  return achados;
}

// ------------------------------------------------------------------ iscas
const DIR_ISCAS = resolve(WEB, 'tests/iscas/valores-soltos');
const esperado = JSON.parse(readFileSync(join(DIR_ISCAS, 'esperado.json'), 'utf8'));
const achadosDaIsca = varrer(DIR_ISCAS, 'isca');
let iscaFalhou = false;
for (const e of esperado) {
  if (!achadosDaIsca.some((a) => a.arquivo === e.arquivo && a.linha === e.linha && a.regra.startsWith(e.regra))) {
    console.error(`ERRO: a isca ${e.arquivo}:${e.linha} (${e.regra}) passou sem ser acusada. O varredor parou de enxergar.`);
    iscaFalhou = true;
  }
}
if (achadosDaIsca.length !== esperado.length) {
  console.error(`ERRO: as iscas deviam produzir ${esperado.length} achados e produziram ${achadosDaIsca.length}:`);
  for (const a of achadosDaIsca) console.error(`  ${a.arquivo}:${a.linha} ${a.regra}`);
  iscaFalhou = true;
}
if (iscaFalhou) process.exit(1);
console.log(`iscas: ${esperado.length} valores soltos plantados, ${esperado.length} acusados.`);

// ------------------------------------------------------------------ src
const achados = varrer(resolve(WEB, 'src'), 'src');
const usadas = new Set();
const reais = achados.filter((a) => {
  const i = excecoes.findIndex((x) => x.arquivo === a.arquivo && a.trecho.includes(x.trecho));
  if (i === -1) return true;
  usadas.add(i);
  return false;
});
let falhou = false;
for (const a of reais) {
  console.error(`web/${a.arquivo}:${a.linha}  ${a.regra}\n    ${a.trecho}`);
  falhou = true;
}
excecoes.forEach((x, i) => {
  if (!usadas.has(i)) {
    console.error(`ERRO: a excecao de ${x.arquivo} ("${x.trecho}") nao casa com nada. Tire da lista.`);
    falhou = true;
  }
});
if (falhou) {
  console.error('\nValor solto em web/src. Use o token de design/tokens.json (via tokens.g.css) ou, se for mesmo excecao, registre com motivo em scripts/excecoes-valores-soltos.json.');
  process.exit(1);
}
console.log(`web/src sem valor solto (${excecoes.length} excecoes com motivo).`);
