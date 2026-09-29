import { describe, expect, it } from 'vitest';

import { urlDaApi } from '../config/url-da-api.ts';

describe('URL base da API no build', () => {
  it('sem sobrescrita, e relativa: SPA e API na mesma origem', () => {
    expect(urlDaApi(undefined, true)).toBe('/v1');
    expect(urlDaApi('', true)).toBe('/v1');
  });

  it('producao REPROVA URL absoluta, que quebraria a mesma origem', () => {
    expect(() => urlDaApi('https://api.bichu.app/v1', true)).toThrow(/relativo/);
    expect(() => urlDaApi('//api.bichu.app/v1', true)).toThrow(/relativo/);
  });

  it('desenvolvimento aceita URL absoluta http(s) como sobrescrita', () => {
    expect(urlDaApi('http://localhost:3000/v1/', false)).toBe('http://localhost:3000/v1');
    expect(() => urlDaApi('ftp://x', false)).toThrow(/http/);
    expect(() => urlDaApi('nao-e-url', false)).toThrow();
  });
});
