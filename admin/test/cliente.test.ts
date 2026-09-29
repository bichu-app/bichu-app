import { describe, expect, it, vi } from 'vitest';

import { criarClienteDaApi } from '../src/api/cliente.ts';
import type { EstrategiaDeSessao } from '../src/sessao/sessao.ts';

function fetchQueResponde(status: number, corpo: unknown = {}) {
  const chamadas: Request[] = [];
  const fetch = vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push(entrada instanceof Request ? entrada : new Request(entrada, init));
    return Promise.resolve(
      new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }),
    );
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, chamadas };
}

describe('cliente da API', () => {
  it('monta a URL a partir da base e aplica a estrategia de sessao', async () => {
    const { fetch, chamadas } = fetchQueResponde(200);
    const sessao: EstrategiaDeSessao = {
      prepararRequisicao: (r) => {
        const nova = new Request(r);
        nova.headers.set('X-Teste', 'sessao-aplicada');
        return nova;
      },
    };
    const api = criarClienteDaApi({ baseUrl: 'https://api.exemplo.test/v1', sessao, fetch });

    await api.GET('/me');

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url).toBe('https://api.exemplo.test/v1/me');
    expect(chamadas[0]?.headers.get('X-Teste')).toBe('sessao-aplicada');
  });

  it('sem base informada usa a relativa do build, na origem da pagina', async () => {
    const { fetch, chamadas } = fetchQueResponde(200);
    await criarClienteDaApi({ fetch }).GET('/me');
    expect(new URL(chamadas[0]?.url ?? '').pathname).toBe('/v1/me');
    expect(new URL(chamadas[0]?.url ?? '').origin).toBe(window.location.origin);
  });

  it('sem estrategia nao anexa credencial', async () => {
    const { fetch, chamadas } = fetchQueResponde(200);
    await criarClienteDaApi({ baseUrl: 'https://api.exemplo.test/v1', fetch }).GET('/me');
    expect(chamadas[0]?.headers.get('Authorization')).toBeNull();
  });

  it('401 avisa a estrategia de sessao', async () => {
    const { fetch } = fetchQueResponde(401);
    const aoPerderAutorizacao = vi.fn();
    const api = criarClienteDaApi({
      baseUrl: 'https://api.exemplo.test/v1',
      sessao: { prepararRequisicao: (r) => r, aoPerderAutorizacao },
      fetch,
    });
    await api.GET('/me');
    expect(aoPerderAutorizacao).toHaveBeenCalledOnce();
  });
});
