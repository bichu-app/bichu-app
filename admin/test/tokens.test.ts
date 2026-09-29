import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { divergencias, FONTE, gerarCss } from '../scripts/gerar-tokens-css.mjs';

type Tokens = Record<string, unknown>;
const lerTokens = (): Tokens => JSON.parse(readFileSync(FONTE, 'utf8')) as Tokens;

describe('gerador de tokens CSS', () => {
  const css = gerarCss(lerTokens());

  it('todo var() referenciado esta declarado', () => {
    const declarados = new Set([...css.matchAll(/^\s+(--bichu-[\w-]+):/gm)].map((m) => m[1]));
    const referenciados = new Set([...css.matchAll(/var\((--bichu-[\w-]+)\)/g)].map((m) => m[1]));
    expect(declarados.size).toBeGreaterThan(0);
    expect([...referenciados].filter((r) => !declarados.has(r))).toEqual([]);
  });

  it('papel nunca-texto so existe com o nome feio', () => {
    expect(css).toContain('--bichu-cor-action-fill-raw-do-not-use-as-text:');
    expect(css).not.toMatch(/--bichu-cor-action-fill:/);
  });

  it('o tema escuro redefine os papeis', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(css).toMatch(/:root\[data-tema="escuro"\]/);
  });

  it('sem o contrato nunca-texto o gerador para, em vez de emitir nome bonito', () => {
    const tokens = lerTokens();
    delete tokens.$extensions;
    expect(() => gerarCss(tokens)).toThrow(/nunca-texto/);
  });
});

describe('verificacao dos tokens (o caso que PRECISA reprovar)', () => {
  it('um token que chega ao CSS mudado na fonte e acusado', () => {
    const emDisco = gerarCss(lerTokens());
    const tokens = lerTokens() as { raspberry: Record<string, { $value: string }> };
    tokens.raspberry['700'] = { $value: '#000000' };
    const motivos = divergencias(emDisco, gerarCss(tokens));
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toMatch(/raspberry-700/);
  });

  it('destino ausente ou vazio reprova, nunca aprova', () => {
    const gerado = gerarCss(lerTokens());
    expect(divergencias(null, gerado)).not.toEqual([]);
    expect(divergencias('', gerado)).not.toEqual([]);
  });

  it('em dia nao acusa nada', () => {
    const gerado = gerarCss(lerTokens());
    expect(divergencias(gerado, gerado)).toEqual([]);
  });
});
