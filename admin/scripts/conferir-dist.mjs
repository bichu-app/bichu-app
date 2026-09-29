#!/usr/bin/env node
/**
 * Portao do D48, chamado no fim de `npm run build`: o build de producao do
 * backoffice nao entrega mapa de codigo, nem o arquivo `.map` nem o comentario
 * `sourceMappingURL` que o anuncia. Reprova (saida 1) com a lista do que achou.
 *
 * `dist/` sem nenhum `.js` tambem reprova: conferencia que nao achou o que
 * conferir nao aprova nada. A isca esta em `test/conferir-dist.test.ts`.
 *
 *   node scripts/conferir-dist.mjs            confere admin/dist
 *   node scripts/conferir-dist.mjs <pasta>    confere outra pasta
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @param {string} dir @param {string} [rel] @returns {string[]} */
function listar(dir, rel = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? listar(path.join(dir, e.name), r) : [r];
  });
}

/** @param {string} dist @returns {string[]} o que viola o D48 */
export function achadosDeMapa(dist) {
  let arquivos;
  try {
    arquivos = listar(dist);
  } catch {
    return [`${dist} nao existe: rode o build antes de conferir`];
  }
  if (!arquivos.some((a) => a.endsWith('.js'))) return [`${dist} nao tem nenhum .js: nada para conferir`];
  const achados = [];
  for (const a of arquivos) {
    if (a.endsWith('.map')) achados.push(`${a}: arquivo de mapa`);
    else if (/\.(js|css|html)$/.test(a) && readFileSync(path.join(dist, a), 'utf8').includes('sourceMappingURL=')) {
      achados.push(`${a}: comentario sourceMappingURL`);
    }
  }
  return achados;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist'));
  const achados = achadosDeMapa(dist);
  if (achados.length > 0) {
    process.stderr.write(`REPROVADO (D48: build de producao sem mapa de codigo):\n  ${achados.join('\n  ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`ok: ${path.relative(process.cwd(), dist) || dist} sem .map nem sourceMappingURL\n`);
}
