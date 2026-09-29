/**
 * Nenhuma cor escrita a mao em admin/src. A unica origem de cor e
 * src/theme/tokens.g.css, gerado de design/tokens.json.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '../src');
const ISENTOS = new Set(['theme/tokens.g.css']);
const DIRETORIOS_ISENTOS = new Set(['api/generated']);

const COR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(?:white|black|red|green|blue|yellow|orange|purple|gray|grey|pink)\b(?=\s*[;,)!'"}`])/i;

export function coresAMao(texto: string): string[] {
  return texto
    .split('\n')
    .map((linha, i) => ({ linha: linha.trim(), n: i + 1 }))
    .filter(({ linha }) => COR_LITERAL.test(linha))
    .map(({ linha, n }) => `${n}: ${linha}`);
}

function arquivos(dir: string, rel = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return DIRETORIOS_ISENTOS.has(r) ? [] : arquivos(path.join(dir, e.name), r);
    return /\.(tsx?|css)$/.test(e.name) && !ISENTOS.has(r) ? [r] : [];
  });
}

describe('sem cor a mao', () => {
  it('o detector reconhece as formas de cor (casos que PRECISAM reprovar)', () => {
    for (const caso of [
      'color: #fff;',
      'background: #1C1B19A3;',
      "const c = '#9E0B3A';",
      'color: rgb(0 0 0);',
      'border-color: hsl(10 20% 30%);',
      'color: oklch(0.5 0.1 20);',
      'color: white;',
      "style={{ color: 'black' }}",
    ]) {
      expect(coresAMao(caso), caso).not.toEqual([]);
    }
    expect(coresAMao('color: var(--bichu-cor-text-primary);')).toEqual([]);
  });

  it('nenhum arquivo de src/ escreve cor fora de tokens.g.css', () => {
    const lista = arquivos(SRC);
    // Varredura sem arquivo nenhum terminaria verde sem checar nada.
    expect(lista.length, 'a varredura nao encontrou arquivo em src/').toBeGreaterThan(0);
    const achados = lista.flatMap((r) => coresAMao(readFileSync(path.join(SRC, r), 'utf8')).map((a) => `${r}:${a}`));
    expect(achados).toEqual([]);
  });
});
