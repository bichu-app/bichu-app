/**
 * Um servidor falso na forma do contrato: responde por metodo e caminho, e
 * guarda cada requisicao (com o corpo ja lido) para o teste conferir o que o
 * painel mandou. Nao inventa resposta: cada teste declara a que precisa, com
 * os campos de `api/openapi.yaml`.
 */
import { vi } from 'vitest';

export interface RequisicaoGravada {
  metodo: string;
  caminho: string;
  busca: URLSearchParams;
  cabecalhos: Headers;
  corpo: unknown;
  credenciais: RequestCredentials;
}

export type Resposta = { status: number; corpo?: unknown; cabecalhos?: Record<string, string> };
export type Rota = (req: RequisicaoGravada) => Resposta | Promise<Resposta>;

export function json(status: number, corpo?: unknown, cabecalhos: Record<string, string> = {}): Resposta {
  return { status, corpo, cabecalhos };
}

export function problema(status: number, slug: string, extra: Record<string, unknown> = {}, cabecalhos: Record<string, string> = {}): Resposta {
  return {
    status,
    corpo: { type: `https://dominio-a-definir.com.br/problems/${slug}`, title: slug, status, ...extra },
    cabecalhos: { 'Content-Type': 'application/problem+json', ...cabecalhos },
  };
}

export function criarServidorFalso(rotas: Record<string, Rota | Resposta>) {
  const requisicoes: RequisicaoGravada[] = [];
  const fetch = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const req = entrada instanceof Request ? entrada : new Request(entrada, init);
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/^\/v1/, '');
    const texto = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.clone().text();
    let corpo: unknown = undefined;
    if (texto) {
      try {
        corpo = JSON.parse(texto);
      } catch {
        corpo = texto;
      }
    }
    const gravada: RequisicaoGravada = {
      metodo: req.method,
      caminho,
      busca: url.searchParams,
      cabecalhos: req.headers,
      corpo,
      credenciais: req.credentials,
    };
    requisicoes.push(gravada);
    const chaveExata = `${req.method} ${caminho}`;
    const rota =
      rotas[chaveExata] ??
      Object.entries(rotas).find(([chave]) => {
        const [metodo, padrao] = chave.split(' ');
        if (metodo !== req.method || !padrao) return false;
        const re = new RegExp(`^${padrao.replace(/\{[^}]+\}/g, '[^/]+')}$`);
        return re.test(caminho);
      })?.[1];
    if (!rota) return new Response(JSON.stringify({ type: 'nao-declarada', status: 599 }), { status: 599 });
    const r = typeof rota === 'function' ? await rota(gravada) : rota;
    const cabecalhos = { 'Content-Type': 'application/json', ...(r.cabecalhos ?? {}) };
    return new Response(r.corpo === undefined ? null : JSON.stringify(r.corpo), { status: r.status, headers: cabecalhos });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, requisicoes };
}

export const SESSAO = {
  display_name: 'Marina Rocha',
  roles: ['admin'],
  csrf_token: 'csrf-da-sessao-0123456789abcdef0123456789abcdef',
  idle_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  absolute_expires_at: new Date(Date.now() + 12 * 3_600_000).toISOString(),
};

export function sessaoCom(agora: number, extra: Partial<typeof SESSAO> = {}) {
  return {
    ...SESSAO,
    idle_expires_at: new Date(agora + 30 * 60_000).toISOString(),
    absolute_expires_at: new Date(agora + 12 * 3_600_000).toISOString(),
    ...extra,
  };
}
