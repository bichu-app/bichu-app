/**
 * As chamadas da Rede no backoffice, tipadas pelo contrato. Toda chamada
 * devolve um `Resultado`: a tela decide pelo `tipo` da falha (RFC 9457,
 * `Problem.type`), nunca pelo texto do servidor.
 *
 * As operacoes sensiveis (D40) recebem o `X-Admin-Reauth-Token` pronto. Quem
 * o obtem e a sessao (`reautenticar`, que tambem troca o token anti-CSRF
 * rotacionado, D38): a Rede nao guarda credencial nenhuma. O token e de uso
 * unico, entao cada operacao sensivel pede uma reautenticacao propria.
 */
import type { ClienteDaApi } from '../../api/cliente.ts';
import type {
  Encontro,
  EncontroInput,
  EncontroPatch,
  EscopoDeReautenticacao,
  EstadoDoPedido,
  FiltrosDaLista,
  Mudanca,
  MudancaDeAcesso,
  PaginaDeEncontros,
  PaginaDePedidos,
  Pedido,
  Problema,
} from '../dominio/tipos.ts';

export type Falha =
  | { tipo: 'validacao'; erros: NonNullable<Problema['errors']> }
  | { tipo: 'senha-incorreta' }
  | { tipo: 'precisa-da-senha' }
  | { tipo: 'sessao' }
  | { tipo: 'proibido' }
  | { tipo: 'nao-encontrado' }
  | { tipo: 'versao' }
  | { tipo: 'limite'; esperaSegundos: number | null }
  | { tipo: 'endereco-ocupado' }
  | { tipo: 'encontro-fechado' }
  | { tipo: 'sem-conexao' }
  | { tipo: 'servidor'; status: number };

export type Resultado<T> = { ok: true; dados: T; etag: string | null } | { ok: false; falha: Falha };

function slugDoProblema(p: unknown): string {
  const t = (p as Problema | undefined)?.type ?? '';
  return t.slice(t.lastIndexOf('/') + 1);
}

export function falhaDaResposta(resposta: Response, corpo: unknown): Falha {
  const slug = slugDoProblema(corpo);
  switch (resposta.status) {
    case 400:
      return { tipo: 'validacao', erros: (corpo as Problema | undefined)?.errors ?? [] };
    case 401:
      if (slug === 'invalid-credentials') return { tipo: 'senha-incorreta' };
      if (slug === 'reauthentication-required') return { tipo: 'precisa-da-senha' };
      return { tipo: 'sessao' };
    case 403:
      return { tipo: 'proibido' };
    case 404:
      return { tipo: 'nao-encontrado' };
    case 409:
      // `event-not-open`: o encontro foi cancelado, removido ou terminou, e a fila dele fechou.
      return slug === 'event-not-open' ? { tipo: 'encontro-fechado' } : { tipo: 'endereco-ocupado' };
    case 412:
    case 428:
      return { tipo: 'versao' };
    case 429: {
      const s = Number(resposta.headers.get('Retry-After'));
      return { tipo: 'limite', esperaSegundos: Number.isFinite(s) && s > 0 ? s : null };
    }
    default:
      return { tipo: 'servidor', status: resposta.status };
  }
}

interface RespostaDoCliente<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

async function executar<T>(chamada: () => Promise<RespostaDoCliente<T>>): Promise<Resultado<T>> {
  try {
    const { data, error, response } = await chamada();
    if (!response.ok) return { ok: false, falha: falhaDaResposta(response, error) };
    return { ok: true, dados: data as T, etag: response.headers.get('ETag') };
  } catch {
    return { ok: false, falha: { tipo: 'sem-conexao' } };
  }
}

export interface OpcoesDaApiDaRede {
  cliente: ClienteDaApi;
  /** Para o envio direto da foto ao armazenamento (ADR-0007). */
  fetch?: typeof globalThis.fetch;
}

/** A mesma forma de `reautenticar` da sessao do painel. */
export type ResultadoDaReautenticacao =
  | { ok: true; token: string }
  | { ok: false; motivo: 'incorreta' }
  | { ok: false; motivo: 'tentativas'; espera: string; segundos: number }
  | { ok: false; motivo: 'falha' };

export type Reautenticar = (senha: string, escopo: EscopoDeReautenticacao) => Promise<ResultadoDaReautenticacao>;

const reauth = (token: string) => ({ 'X-Admin-Reauth-Token': token });

export function criarApiDaRede({ cliente, fetch = globalThis.fetch.bind(globalThis) }: OpcoesDaApiDaRede) {
  const evento = (slug: string) => ({ path: { eventSlug: slug } });

  return {
    listar: (query: FiltrosDaLista): Promise<Resultado<PaginaDeEncontros>> =>
      executar(() => cliente.GET('/admin/network/events', { params: { query } })),

    obter: (slug: string): Promise<Resultado<Encontro>> =>
      executar(() => cliente.GET('/admin/network/events/{eventSlug}', { params: evento(slug) })),

    criar: (corpo: EncontroInput): Promise<Resultado<Encontro>> =>
      executar(() => cliente.POST('/admin/network/events', { body: corpo })),

    atualizar: (slug: string, etag: string, corpo: EncontroPatch): Promise<Resultado<Encontro>> =>
      executar(() =>
        cliente.PATCH('/admin/network/events/{eventSlug}', {
          params: { ...evento(slug), header: { 'If-Match': etag } },
          body: corpo,
        }),
      ),

    mover: (token: string, slug: string, etag: string, corpo: Mudanca) =>
      executar(() =>
        cliente.POST('/admin/network/events/{eventSlug}/relocation', {
          params: { ...evento(slug), header: { 'If-Match': etag } },
          headers: reauth(token),
          body: corpo,
        }),
      ),

    mudarAcesso: (token: string, slug: string, etag: string, corpo: MudancaDeAcesso) =>
      executar(() =>
        cliente.POST('/admin/network/events/{eventSlug}/access', {
          params: { ...evento(slug), header: { 'If-Match': etag } },
          headers: reauth(token),
          body: corpo,
        }),
      ),

    cancelar: (token: string, slug: string, etag: string, motivo: string) =>
      executar(() =>
        cliente.POST('/admin/network/events/{eventSlug}/cancellation', {
          params: { ...evento(slug), header: { 'If-Match': etag } },
          headers: reauth(token),
          body: { note: motivo },
        }),
      ),

    remover: (token: string, slug: string, etag: string) =>
      executar(() =>
        cliente.DELETE('/admin/network/events/{eventSlug}', {
          params: { ...evento(slug), header: { 'If-Match': etag } },
          headers: reauth(token),
        }),
      ),

    pedidos: (slug: string, status: EstadoDoPedido, page = 1): Promise<Resultado<PaginaDePedidos>> =>
      executar(() => cliente.GET('/admin/network/join-requests', { params: { query: { event: slug, status, page, limit: 50 } } })),

    /** So a contagem de uma aba: `limit=1` devolve no maximo uma linha (D56 conta linhas). */
    contarPedidos: (slug: string, status: EstadoDoPedido): Promise<Resultado<PaginaDePedidos>> =>
      executar(() => cliente.GET('/admin/network/join-requests', { params: { query: { event: slug, status, page: 1, limit: 1 } } })),

    aprovar: (ref: string): Promise<Resultado<Pedido>> =>
      executar(() => cliente.POST('/admin/network/join-requests/{requestRef}/approval', { params: { path: { requestRef: ref } } })),

    recusar: (ref: string): Promise<Resultado<Pedido>> =>
      executar(() => cliente.POST('/admin/network/join-requests/{requestRef}/decline', { params: { path: { requestRef: ref } } })),

    /** Pede a politica de envio e manda os bytes direto ao armazenamento. Devolve o `upload_id`. */
    async enviarFoto(arquivo: File): Promise<Resultado<string>> {
      const tipo = arquivo.type as 'image/jpeg' | 'image/png' | 'image/webp';
      const intencao = await executar(() =>
        cliente.POST('/admin/media/catalog-image-intents', {
          body: { purpose: 'network_event', content_type: tipo, byte_size: arquivo.size },
        }),
      );
      if (!intencao.ok) return intencao;
      const i = intencao.dados;
      try {
        let resposta: Response;
        if (i.method === 'PUT') {
          resposta = await fetch(i.url, { method: 'PUT', headers: i.headers ?? {}, body: arquivo });
        } else {
          const form = new FormData();
          for (const [k, v] of Object.entries(i.fields ?? {})) form.append(k, v);
          form.append('file', arquivo);
          resposta = await fetch(i.url, { method: 'POST', body: form });
        }
        if (!resposta.ok) return { ok: false, falha: { tipo: 'servidor', status: resposta.status } };
      } catch {
        return { ok: false, falha: { tipo: 'sem-conexao' } };
      }
      return { ok: true, dados: i.upload_id, etag: null };
    },
  };
}

export type ApiDaRede = ReturnType<typeof criarApiDaRede>;

/** "1 minuto", "15 minutos", "1 hora", a partir do `Retry-After`. */
export function esperaPorExtenso(segundos: number | null): string {
  if (!segundos) return 'alguns minutos';
  if (segundos >= 3600) {
    const h = Math.round(segundos / 3600);
    return h === 1 ? '1 hora' : `${h} horas`;
  }
  const m = Math.max(1, Math.round(segundos / 60));
  return m === 1 ? '1 minuto' : `${m} minutos`;
}

/**
 * Reautenticacao direta pelo cliente, para o duble e para os testes. No
 * painel montado, a Rede usa a `reautenticar` da sessao, que tambem guarda o
 * token anti-CSRF novo.
 */
export function reautenticarPeloCliente(cliente: ClienteDaApi): Reautenticar {
  return async (senha, escopo) => {
    try {
      const { data, error, response } = await cliente.POST('/admin/auth/reauth', { body: { password: senha, scope: escopo } });
      if (data) return { ok: true, token: data.reauth_token };
      if (response.status === 429) {
        const s = Number(response.headers.get('Retry-After')) || null;
        return { ok: false, motivo: 'tentativas', espera: esperaPorExtenso(s), segundos: s ?? 0 };
      }
      if (slugDoProblema(error) === 'invalid-credentials') return { ok: false, motivo: 'incorreta' };
      return { ok: false, motivo: 'falha' };
    } catch {
      return { ok: false, motivo: 'falha' };
    }
  };
}
