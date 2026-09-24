#!/usr/bin/env node
// A isca do portao dos tokens do site (ADR-0028, item 8).
//
// Muda `raspberry.700` numa COPIA de design/tokens.json e pergunta ao gerador,
// em modo --verificar, se o CSS versionado ainda bate. Ele PRECISA reprovar,
// e precisa reprovar nomeando web/src/styles/tokens.g.css. Se aprovar, o
// portao parou de enxergar, e este script termina em 1.
//
// A isca mexe em raspberry.700 de proposito: e a tinta da marca (vira
// `--cor-primary`), entao ela chega ao derivado por dois caminhos, o primitivo
// e o papel. Uma isca num token que nao chega ao derivado aprovaria e nao
// provaria nada; foi o que aconteceu com o portao do Dart (ver
// infra/verificacao/verificar-tokens-gerados.mjs).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FONTE = resolve(AQUI, '../../design/tokens.json');
const GERADOR = resolve(AQUI, 'gerar-tokens-css.mjs');

const tokens = JSON.parse(readFileSync(FONTE, 'utf8'));
const original = tokens.raspberry?.['700']?.$value;
if (!original) {
  console.error('ERRO: a isca nao achou raspberry.700 em design/tokens.json. Sem o token, a isca nao isca nada.');
  process.exit(1);
}
tokens.raspberry['700'].$value = original.toUpperCase() === '#000000' ? '#000001' : '#000000';

const dir = mkdtempSync(join(tmpdir(), 'isca-tokens-'));
const copia = join(dir, 'tokens.json');
writeFileSync(copia, JSON.stringify(tokens, null, 2));

let saiu = 0;
let erro = '';
try {
  execFileSync(process.execPath, [GERADOR, '--verificar', '--tokens', copia], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  saiu = e.status;
  erro = String(e.stderr);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (saiu !== 1) {
  console.error(`ERRO: com raspberry.700 alterado, o portao dos tokens do site saiu com ${saiu}, e precisava reprovar com 1. O portao parou de verificar.`);
  process.exit(1);
}
if (!erro.includes('web/src/styles/tokens.g.css')) {
  console.error(`ERRO: o portao reprovou, mas sem nomear web/src/styles/tokens.g.css. Saida:\n${erro}`);
  process.exit(1);
}
console.log('isca dos tokens reprovada pelo motivo certo (raspberry.700 alterado, tokens.g.css nomeado).');
