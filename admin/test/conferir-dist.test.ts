/**
 * ISCA do D48: o portao que confere `dist/` precisa REPROVAR mapa de codigo e
 * pasta vazia, e a configuracao de producao precisa desligar o mapa.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import configuracao from '../vite.config.ts';
import { achadosDeMapa } from '../scripts/conferir-dist.mjs';

const pastas: string[] = [];
function pasta(arquivos: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'bichu-admin-dist-'));
  pastas.push(dir);
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    mkdirSync(path.dirname(path.join(dir, nome)), { recursive: true });
    writeFileSync(path.join(dir, nome), conteudo);
  }
  return dir;
}
afterEach(() => pastas.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('D48: build de producao sem mapa de codigo', () => {
  it('reprova arquivo .map (isca)', () => {
    expect(achadosDeMapa(pasta({ 'assets/a.js': 'x()', 'assets/a.js.map': '{}' }))).toEqual(['assets/a.js.map: arquivo de mapa']);
  });

  it('reprova o comentario sourceMappingURL, mesmo sem o arquivo (isca)', () => {
    expect(achadosDeMapa(pasta({ 'assets/a.js': 'x()\n//# sourceMappingURL=a.js.map' }))).toEqual(['assets/a.js: comentario sourceMappingURL']);
  });

  it('reprova pasta sem o que conferir, e pasta que nao existe', () => {
    expect(achadosDeMapa(pasta({ 'index.html': '<p>' }))).toHaveLength(1);
    expect(achadosDeMapa(path.join(tmpdir(), 'nao-existe-bichu-admin'))).toHaveLength(1);
  });

  it('aprova o build limpo', () => {
    expect(achadosDeMapa(pasta({ 'index.html': '<p>', 'assets/a.js': 'x()' }))).toEqual([]);
  });

  it('a configuracao desliga o mapa em producao e o mantem fora dela', () => {
    const producao = configuracao({ mode: 'production', command: 'build' });
    const desenvolvimento = configuracao({ mode: 'development', command: 'build' });
    if (typeof producao !== 'object' || typeof desenvolvimento !== 'object' || 'then' in producao || 'then' in desenvolvimento)
      throw new Error('vite.config.ts deixou de devolver objeto');
    expect(producao.build?.sourcemap).toBe(false);
    expect(desenvolvimento.build?.sourcemap).toBe(true);
  });
});
