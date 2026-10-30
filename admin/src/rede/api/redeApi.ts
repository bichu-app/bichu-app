/** As chamadas da Rede no backoffice, tipadas pelo contrato. */
import type { ClienteDaApi } from '../../api/cliente.ts';
import type {
  Encontro,
  EncontroInput,
  EncontroPatch,
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
  | { tipo: 'sessao' }
  | { tipo: 'proibido' }
  | { tipo: 'nao-encontrado' }
  | { tipo: 'versao' }
  | { tipo: 'sem-versao' }
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
      return { tipo: 'sessao' };
    case 403:
      return { tipo: 'proibido' };
    case 404:
      return { tipo: 'nao-encontrado' };
    case 409:
      return slug === 'event-not-open' ? { tipo: 'encontro-fechado' } : { tipo: 'endereco-ocupado' };
    case 412:
      return { tipo: 'versao' };
    case 428:
      return { tipo: 'sem-versao' };
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

    mover: (slug: string, etag: string, corpo: Mudanca) =>
      executar(() =>
        cliente.POST('/admin/network/events/{eventSlug}/relocation', {
          params: { ...evento(slug), header: { 'If-Match': etag } },
          body: corpo,
        }),
      ),

    mudarAcesso: (slug: string, etag: string, corpo: MudancaDeAcesso) =>
      executar(() =>
        cliente.POST('/admin/network/events/{eventSlug}/access', {
          params: { ...evento(slug), header: { 'If-Match': etag } },
          body: corpo,
        }),
      ),

    cancelar: (slug: string, etag: string, motivo: string) =>
      executar(() =>
        cliente.POST('/admin/network/events/{eventSlug}/cancellation', {
          params: { ...evento(slug), header: { 'If-Match': etag } },
          body: { note: motivo },
        }),
      ),

    remover: (slug: string, etag: string) =>
      executar(() =>
        cliente.DELETE('/admin/network/events/{eventSlug}', {
          params: { ...evento(slug), header: { 'If-Match': etag } },
        }),
      ),

    pedidos: (slug: string, status: EstadoDoPedido, page = 1): Promise<Resultado<PaginaDePedidos>> =>
      executar(() => cliente.GET('/admin/network/join-requests', { params: { query: { event: slug, status, page, limit: 50 } } })),

    /**
     * So a contagem de uma aba: `limit=1` devolve no maximo uma linha (D56 conta
     * linhas).
     */
    contarPedidos: (slug: string, status: EstadoDoPedido): Promise<Resultado<PaginaDePedidos>> =>
      executar(() => cliente.GET('/admin/network/join-requests', { params: { query: { event: slug, status, page: 1, limit: 1 } } })),

    aprovar: (ref: string): Promise<Resultado<Pedido>> =>
      executar(() => cliente.POST('/admin/network/join-requests/{requestRef}/approval', { params: { path: { requestRef: ref } } })),

    recusar: (ref: string): Promise<Resultado<Pedido>> =>
      executar(() => cliente.POST('/admin/network/join-requests/{requestRef}/decline', { params: { path: { requestRef: ref } } })),

    /** Pede a politica de envio e manda os bytes direto ao armazenamento. */
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

/** 412 e 428 pedem o mesmo remedio: reler o recurso antes de tentar de novo. */
export function precisaReler(falha: Falha): boolean {
  return falha.tipo === 'versao' || falha.tipo === 'sem-versao';
}
