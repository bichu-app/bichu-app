/**
 * As chamadas da Rede no backoffice, tipadas pelo contrato. Toda chamada
 * devolve um `Resultado`: a tela decide pelo `tipo` da falha (RFC 9457,
 * `Problem.type`), nunca pelo texto do servidor.
 *
 * Reautenticacao (D40): o cliente pede a senha, chama `reauthenticateAdmin`
 * com o escopo da operacao e manda o token em `X-Admin-Reauth-Token`. O
 * token e de uso unico, entao cada operacao sensivel reautentica de novo. A
 * resposta traz um `csrf_token` novo (a sessao foi rotacionada, D38), que vai
 * para `aoRotacionarCsrf`: guardar o token e trabalho da sessao, nao daqui.
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
      return { tipo: 'endereco-ocupado' };
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
  aoRotacionarCsrf?: (token: string) => void;
}

const reauth = (token: string) => ({ 'X-Admin-Reauth-Token': token });

export function criarApiDaRede({ cliente, fetch = globalThis.fetch.bind(globalThis), aoRotacionarCsrf }: OpcoesDaApiDaRede) {
  const evento = (slug: string) => ({ path: { eventSlug: slug } });

  async function reautenticar(senha: string, escopo: EscopoDeReautenticacao): Promise<Resultado<string>> {
    const r = await executar(() => cliente.POST('/admin/auth/reauth', { body: { password: senha, scope: escopo } }));
    if (!r.ok) return r;
    aoRotacionarCsrf?.(r.dados.csrf_token);
    return { ok: true, dados: r.dados.reauth_token, etag: null };
  }

  /** Reautentica no escopo e executa a operacao com o token recem-emitido. */
  async function comSenha<T>(senha: string, escopo: EscopoDeReautenticacao, operacao: (token: string) => Promise<Resultado<T>>) {
    const token = await reautenticar(senha, escopo);
    if (!token.ok) return token;
    return operacao(token.dados);
  }

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

    mover: (senha: string, slug: string, etag: string, corpo: Mudanca) =>
      comSenha(senha, 'network_event_relocation', (token) =>
        executar(() =>
          cliente.POST('/admin/network/events/{eventSlug}/relocation', {
            params: { ...evento(slug), header: { 'If-Match': etag } },
            headers: reauth(token),
            body: corpo,
          }),
        ),
      ),

    mudarAcesso: (senha: string, slug: string, etag: string, corpo: MudancaDeAcesso) =>
      comSenha(senha, 'network_event_access_change', (token) =>
        executar(() =>
          cliente.POST('/admin/network/events/{eventSlug}/access', {
            params: { ...evento(slug), header: { 'If-Match': etag } },
            headers: reauth(token),
            body: corpo,
          }),
        ),
      ),

    cancelar: (senha: string, slug: string, etag: string, motivo: string) =>
      comSenha(senha, 'network_event_cancellation', (token) =>
        executar(() =>
          cliente.POST('/admin/network/events/{eventSlug}/cancellation', {
            params: { ...evento(slug), header: { 'If-Match': etag } },
            headers: reauth(token),
            body: { note: motivo },
          }),
        ),
      ),

    remover: (senha: string, slug: string, etag: string) =>
      comSenha(senha, 'network_event_removal', (token) =>
        executar(() =>
          cliente.DELETE('/admin/network/events/{eventSlug}', {
            params: { ...evento(slug), header: { 'If-Match': etag } },
            headers: reauth(token),
          }),
        ),
      ),

    pedidos: (slug: string, status: EstadoDoPedido, page = 1): Promise<Resultado<PaginaDePedidos>> =>
      executar(() => cliente.GET('/admin/network/join-requests', { params: { query: { event: slug, status, page, limit: 50 } } })),

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
