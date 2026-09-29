/**
 * ISCA. Protege o `noindex` do backoffice: se a meta sair de index.html, este
 * teste reprova. O backoffice e interno e nao pode aparecer em buscador.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const html = readFileSync(path.resolve(import.meta.dirname, '../index.html'), 'utf8');
const documento = new DOMParser().parseFromString(html, 'text/html');

describe('index.html', () => {
  it('declara robots noindex', () => {
    const robots = documento.querySelector('meta[name="robots"]');
    expect(robots, 'index.html perdeu <meta name="robots">').not.toBeNull();
    const diretivas = (robots?.getAttribute('content') ?? '').split(',').map((d) => d.trim().toLowerCase());
    expect(diretivas).toContain('noindex');
  });

  it('declara o idioma da pagina (WCAG 3.1.1)', () => {
    expect(documento.documentElement.getAttribute('lang')).toBe('pt-BR');
  });
});
