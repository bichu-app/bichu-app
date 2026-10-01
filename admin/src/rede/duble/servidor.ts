/**
 * Duble das rotas `/v1/admin/network/*`, `/v1/admin/auth/reauth` e
 * `/v1/admin/media/catalog-image-intents`, escrito contra os tipos gerados do
 * contrato enquanto o servidor de verdade nao existe
 * (`feat/backoffice-rede-admin`). Ele e deliberadamente exigente onde o
 * contrato e: `If-Match` obrigatorio (428) e conferido (412), reautenticacao
 * de uso unico e de um escopo (401 `reauthentication-required`), recusa de
 * observacao com contato (400 `contact_or_payment_detected`) e as transicoes
 * da fila (aprovado nao volta a recusado).
 *
 * Tudo o que chega fica em `registro`, para os testes (e as iscas) lerem.
 */
import { achadosNasObservacoes } from '../dominio/observacoes.ts';
import type {
  Cancelamento,
  ConcessaoDeReautenticacao,
  Encontro,
  EncontroInput,
  EncontroPatch,
  EscopoDeReautenticacao,
  Mudanca,
  MudancaDeAcesso,
  PaginaDeEncontros,
  PaginaDePedidos,
  Pedido,
  Problema,
} from '../dominio/tipos.ts';
import type { components } from '../../api/generated/api.ts';

type AdminSession = components['schemas']['AdminSession'];
import { encontrosDeExemplo, pedidosDeExemplo } from './massa.ts';

export const SENHA_DO_DUBLE = 'senha-do-duble-de-teste';

export interface Requisicao {
  metodo: string;
  caminho: string;
  consulta: URLSearchParams;
  cabecalhos: Record<string, string>;
  corpo: unknown;
}

export interface OpcoesDoDuble {
  encontros?: Encontro[];
  pedidos?: Pedido[];
  /** Atraso artificial, para ver carregando no navegador. */
  atrasoMs?: number;
  /** Faz a proxima leitura da lista falhar com 500. */
  falharLista?: boolean;
  /** Teto de linhas devolvidas da fila por hora (D56). O servidor usa 300. */
  tetoDeLinhasDaFila?: number;
}

// Sem host: o duble nao e nenhum ambiente, e o cliente decide pelo slug depois da ultima `/`.
const PROBLEMA = 'urn:bichu:problems/';

function json(status: number, corpo: unknown, extra: Record<string, string> = {}): Response {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...extra },
  });
}

function problema(status: number, slug: string, title: string, errors?: Problema['errors']): Response {
  return json(status, { type: PROBLEMA + slug, title, status, ...(errors ? { errors } : {}) } satisfies Problema);
}

const etag = (e: Encontro) => `"${e.version}"`;

function aleatorio(n: number): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: n }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

function slugDoTitulo(t: string): string {
  return t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function criarDuble(opcoes: OpcoesDoDuble = {}) {
  const encontros = new Map<string, Encontro>((opcoes.encontros ?? encontrosDeExemplo()).map((e) => [e.slug, e]));
  const pedidos: Pedido[] =
    opcoes.pedidos ??
    [...encontros.values()].filter((e) => e.visibility === 'private').flatMap((e) => pedidosDeExemplo(e));
  const tokens = new Map<string, EscopoDeReautenticacao>();
  const registro: Requisicao[] = [];
  let falharLista = !!opcoes.falharLista;
  let uploads = 100;
  let linhasDaFila = 0;

  function recalcularPendentes() {
    for (const e of encontros.values()) {
      e.pending_request_count =
        e.visibility === 'private' ? pedidos.filter((p) => p.event.slug === e.slug && p.status === 'pending' && !p.withdrawn_at).length : 0;
    }
  }
  recalcularPendentes();

  function exigirReauth(req: Requisicao, escopo: EscopoDeReautenticacao): Response | null {
    const t = req.cabecalhos['x-admin-reauth-token'];
    if (!t || tokens.get(t) !== escopo) {
      return problema(401, 'reauthentication-required', 'Confirme sua senha');
    }
    tokens.delete(t); // uso unico
    return null;
  }

  /** Como o servidor: faltar `If-Match` responde 428 antes de sessao e reautenticacao. */
  function exigirIfMatch(req: Requisicao): Response | null {
    return req.cabecalhos['if-match'] ? null : problema(428, 'precondition-required', 'Falta a versao');
  }

  function exigirVersao(req: Requisicao, e: Encontro): Response | null {
    const v = req.cabecalhos['if-match'];
    if (!v) return problema(428, 'precondition-required', 'Falta a versao');
    if (v !== etag(e)) return problema(412, 'precondition-failed', 'Alguem mudou este encontro');
    return null;
  }

  function salvar(e: Encontro, mudar: (x: Encontro) => void, status = 200): Response {
    mudar(e);
    e.version += 1;
    e.updated_at = new Date().toISOString();
    return json(status, e, { ETag: etag(e) });
  }

  function recusaDeNotas(notes: unknown): Response | null {
    if (typeof notes === 'string' && achadosNasObservacoes(notes).length) {
      return problema(400, 'validation-failed', 'Confira os campos', [{ field: 'notes', code: 'contact_or_payment_detected' }]);
    }
    return null;
  }

  /** Um recorte da regra do servidor (errosDoEndereco): link, e-mail ou telefone com DDD recusam; rua e CEP, nao. */
  function recusaDeEndereco(endereco: unknown): Response | null {
    if (typeof endereco === 'string' && /https?:\/\/|www\.|@|\(?\d{2}\)?\s?9?\d{4}-?\d{4}/.test(endereco)) {
      return problema(400, 'validation-failed', 'Confira os campos', [{ field: 'street_address', code: 'contact_or_payment_detected' }]);
    }
    return null;
  }

  function galeria(imagens: EncontroInput['images']): Encontro['images'] {
    return (imagens ?? []).map((img, position) => ({
      source: 'uploaded',
      status: 'processing',
      url: null,
      rejection_reason: null,
      upload_id: img.upload_id,
      position,
      alt_text: img.alt_text,
    }));
  }

  function responder(req: Requisicao): Response {
    const partes = req.caminho.replace(/^.*?\/admin\//, '').split('/');
    const [area, recurso, id, sub] = partes;

    if (area === 'session' && req.metodo === 'GET') {
      const agora = Date.now();
      return json(200, {
        display_name: 'Marina Rocha',
        roles: ['admin'],
        csrf_token: aleatorio(40),
        idle_expires_at: new Date(agora + 30 * 60_000).toISOString(),
        absolute_expires_at: new Date(agora + 12 * 3_600_000).toISOString(),
      } satisfies AdminSession);
    }

    if (area === 'auth' && (recurso === 'logout' || recurso === 'logout-all') && req.metodo === 'POST') {
      return new Response(null, { status: 204 });
    }

    if (area === 'auth' && recurso === 'reauth' && req.metodo === 'POST') {
      const corpo = req.corpo as { password?: string; scope?: EscopoDeReautenticacao; scopes?: EscopoDeReautenticacao[] };
      if (corpo.password !== SENHA_DO_DUBLE) return problema(401, 'invalid-credentials', 'Senha incorreta');
      if (!!corpo.scope === !!corpo.scopes) return problema(400, 'validation-failed', 'scope ou scopes, nunca os dois');
      const escopos = corpo.scopes ?? (corpo.scope ? [corpo.scope] : []);
      if (escopos.length < 1 || escopos.length > 2 || new Set(escopos).size !== escopos.length) {
        return problema(400, 'validation-failed', 'De um a dois escopos distintos');
      }
      // Como o servidor: a reautenticacao rotaciona a sessao, e os tokens da anterior deixam de valer.
      tokens.clear();
      const emitidos = escopos.map((scope) => ({ scope, reauth_token: aleatorio(32) }));
      emitidos.forEach((t) => tokens.set(t.reauth_token, t.scope));
      const [primeiro] = emitidos as [{ scope: EscopoDeReautenticacao; reauth_token: string }];
      return json(200, {
        reauth_token: primeiro.reauth_token,
        expires_in: 300,
        scope: primeiro.scope,
        tokens: emitidos,
        csrf_token: aleatorio(40),
      } satisfies ConcessaoDeReautenticacao);
    }

    if (area === 'media' && recurso === 'catalog-image-intents' && req.metodo === 'POST') {
      uploads += 1;
      return json(201, {
        upload_id: `00000000-0000-4000-8000-${uploads.toString().padStart(12, '0')}`,
        method: 'PUT',
        url: `${globalThis.location.origin}/duble-upload/${uploads}`,
        headers: { 'Content-Type': (req.corpo as { content_type: string }).content_type },
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      });
    }

    if (area !== 'network') return problema(404, 'not-found', 'Nao encontrado');

    if (recurso === 'events' && !id) {
      if (req.metodo === 'GET') {
        if (falharLista) {
          falharLista = false;
          return problema(500, 'internal', 'Falha');
        }
        const q = req.consulta;
        let itens = [...encontros.values()];
        const busca = q.get('q')?.toLowerCase();
        if (busca) itens = itens.filter((e) => `${e.title} ${e.summary} ${e.place.place_name}`.toLowerCase().includes(busca));
        for (const [param, campo] of [['publication_status', 'publication_status'], ['timing', 'timing'], ['visibility', 'visibility']] as const) {
          const v = q.get(param);
          if (v) itens = itens.filter((e) => e[campo] === v);
        }
        const sort = q.get('sort') === 'atualizado' ? 'atualizado' : 'agenda';
        itens.sort((a, b) => (sort === 'agenda' ? a.starts_at.localeCompare(b.starts_at) : b.updated_at.localeCompare(a.updated_at)));
        const page = Number(q.get('page') ?? 1);
        const limit = Number(q.get('limit') ?? 50);
        const pagina: PaginaDeEncontros = { items: itens.slice((page - 1) * limit, page * limit), page, limit, total: itens.length, effective_sort: sort };
        return json(200, pagina);
      }
      if (req.metodo === 'POST') {
        const corpo = req.corpo as EncontroInput;
        const recusa = recusaDeNotas(corpo.notes);
        if (recusa) return recusa;
        const recusaDoEndereco = recusaDeEndereco(corpo.street_address);
        if (recusaDoEndereco) return recusaDoEndereco;
        if (corpo.admission?.kind === 'paid' && !corpo.admission.price) {
          return problema(400, 'validation-failed', 'Confira os campos', [{ field: 'admission.price', code: 'admission_incomplete' }]);
        }
        const privado = corpo.visibility === 'private';
        if (privado && corpo.slug) return problema(400, 'validation-failed', 'Confira os campos', [{ field: 'slug', code: 'private_slug_is_generated' }]);
        const slug = privado ? aleatorio(20) : corpo.slug ?? slugDoTitulo(corpo.title);
        if (encontros.has(slug)) return problema(409, 'slug-taken', 'Endereco ocupado');
        const agora = new Date().toISOString();
        const novo: Encontro = {
          slug,
          title: corpo.title,
          summary: corpo.summary,
          place: { ...corpo.place, point: corpo.place.point ?? null },
          starts_at: corpo.starts_at,
          ends_at: corpo.ends_at ?? null,
          time_zone: corpo.time_zone ?? 'America/Sao_Paulo',
          images: galeria(corpo.images),
          accepted_sizes: corpo.accepted_sizes ?? ['P', 'M', 'G', 'GG'],
          dog_age: corpo.dog_age ?? 'any',
          vaccination_required: corpo.vaccination_required ?? true,
          fenced_off_leash_area: corpo.fenced_off_leash_area ?? false,
          amenities: corpo.amenities ?? [],
          origin: 'admin',
          visibility: corpo.visibility ?? 'public',
          admission: { kind: corpo.admission?.kind ?? 'free', price: corpo.admission?.price ?? null },
          bring_items: corpo.bring_items ?? [],
          notes: corpo.notes ?? null,
          street_address: corpo.street_address ?? null,
          pending_request_count: 0,
          publication_status: 'published',
          timing: 'upcoming',
          published_at: agora,
          cancelled_at: null,
          cancellation_note: null,
          created_at: agora,
          updated_at: agora,
          version: 1,
        };
        encontros.set(slug, novo);
        return json(201, novo, { ETag: etag(novo) });
      }
    }

    if (recurso === 'events' && id) {
      const e = encontros.get(decodeURIComponent(id));
      if (!e) return problema(404, 'not-found', 'Nao encontrado');

      if (!sub && req.metodo === 'GET') return json(200, e, { ETag: etag(e) });

      if (!sub && req.metodo === 'PATCH') {
        const v = exigirVersao(req, e);
        if (v) return v;
        if (e.publication_status === 'removed') return problema(400, 'validation-failed', 'Removido', [{ field: 'slug', code: 'event_removed' }]);
        const corpo = req.corpo as EncontroPatch;
        const recusa = recusaDeNotas(corpo.notes);
        if (recusa) return recusa;
        return salvar(e, (x) => {
          const { images, ...resto } = corpo;
          Object.assign(x, resto);
          if (images) x.images = galeria(images);
        });
      }

      if (!sub && req.metodo === 'DELETE') {
        const semVersao = exigirIfMatch(req);
        if (semVersao) return semVersao;
        const r = exigirReauth(req, 'network_event_removal');
        if (r) return r;
        const v = exigirVersao(req, e);
        if (v) return v;
        e.publication_status = 'removed';
        e.version += 1;
        return new Response(null, { status: 204 });
      }

      if (sub === 'relocation' && req.metodo === 'POST') {
        const semVersao = exigirIfMatch(req);
        if (semVersao) return semVersao;
        const r = exigirReauth(req, 'network_event_relocation');
        if (r) return r;
        const v = exigirVersao(req, e);
        if (v) return v;
        if (e.publication_status !== 'published') return problema(400, 'validation-failed', 'Nao publicado', [{ field: 'slug', code: 'event_not_published' }]);
        const corpo = req.corpo as Mudanca;
        if (!corpo.reason) return problema(400, 'validation-failed', 'Falta o motivo', [{ field: 'reason', code: 'required' }]);
        const recusaDoEnderecoNovo = recusaDeEndereco(corpo.street_address);
        if (recusaDoEnderecoNovo) return recusaDoEnderecoNovo;
        return salvar(e, (x) => {
          if (corpo.place) x.place = { ...corpo.place, point: corpo.place.point ?? null };
          if (corpo.street_address !== undefined) x.street_address = corpo.street_address;
          if (corpo.starts_at) x.starts_at = corpo.starts_at;
          if (corpo.ends_at !== undefined) x.ends_at = corpo.ends_at;
        });
      }

      if (sub === 'access' && req.metodo === 'POST') {
        const semVersao = exigirIfMatch(req);
        if (semVersao) return semVersao;
        const r = exigirReauth(req, 'network_event_access_change');
        if (r) return r;
        const v = exigirVersao(req, e);
        if (v) return v;
        const corpo = req.corpo as MudancaDeAcesso;
        if (!corpo.reason) return problema(400, 'validation-failed', 'Falta o motivo', [{ field: 'reason', code: 'required' }]);
        const resposta = salvar(e, (x) => {
          if (corpo.admission) x.admission = { kind: corpo.admission.kind ?? 'free', price: corpo.admission.price ?? null };
          if (corpo.visibility) {
            if (corpo.visibility === 'private' && x.visibility === 'public') {
              encontros.delete(x.slug);
              x.slug = aleatorio(20);
              encontros.set(x.slug, x);
            }
            x.visibility = corpo.visibility;
          }
        });
        recalcularPendentes();
        return resposta;
      }

      if (sub === 'cancellation' && req.metodo === 'POST') {
        const semVersao = exigirIfMatch(req);
        if (semVersao) return semVersao;
        const r = exigirReauth(req, 'network_event_cancellation');
        if (r) return r;
        const v = exigirVersao(req, e);
        if (v) return v;
        const corpo = req.corpo as Cancelamento;
        if (!corpo.note || corpo.note.trim().length < 2) return problema(400, 'validation-failed', 'Falta o motivo', [{ field: 'note', code: 'required' }]);
        return salvar(e, (x) => {
          x.publication_status = 'cancelled';
          x.cancelled_at = new Date().toISOString();
          x.cancellation_note = corpo.note;
        });
      }
    }

    if (recurso === 'join-requests' && !id && req.metodo === 'GET') {
      const status = req.consulta.get('status') ?? 'pending';
      const evento = req.consulta.get('event');
      let itens = pedidos.filter((p) => p.status === status && (!evento || p.event.slug === evento));
      if (status === 'pending') itens = itens.filter((p) => !p.withdrawn_at);
      itens.sort((a, b) => a.requested_at.localeCompare(b.requested_at));
      const limit = Math.min(Number(req.consulta.get('limit') ?? 50), 50);
      const page = Number(req.consulta.get('page') ?? 1);
      const pagina: PaginaDePedidos = { items: itens.slice((page - 1) * limit, page * limit), page, limit, total: itens.length };
      const teto = opcoes.tetoDeLinhasDaFila ?? 300;
      if (linhasDaFila + pagina.items.length > teto) {
        return new Response(JSON.stringify({ type: `${PROBLEMA}rate-limited`, title: 'Muitas leituras', status: 429 }), {
          status: 429,
          headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '3600' },
        });
      }
      linhasDaFila += pagina.items.length;
      return json(200, pagina);
    }

    if (recurso === 'join-requests' && id && req.metodo === 'POST') {
      const p = pedidos.find((x) => x.ref === decodeURIComponent(id));
      if (!p) return problema(404, 'not-found', 'Nao encontrado');
      const ev = encontros.get(p.event.slug);
      if (ev && (ev.publication_status !== 'published' || ev.timing === 'ended')) {
        return problema(409, 'event-not-open', 'Encontro fechado');
      }
      const podeAprovar = !p.withdrawn_at && (p.status === 'pending' || p.status === 'declined');
      const podeRecusar = !p.withdrawn_at && p.status === 'pending';
      if ((sub === 'approval' && !podeAprovar) || (sub === 'decline' && !podeRecusar)) {
        return problema(400, 'validation-failed', 'Pedido ja decidido', [{ field: 'status', code: 'request_not_pending' }]);
      }
      p.status = sub === 'approval' ? 'approved' : 'declined';
      p.decided_at = new Date().toISOString();
      recalcularPendentes();
      return json(200, p);
    }

    return problema(404, 'not-found', 'Nao encontrado');
  }

  const fetchDoDuble = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const endereco = entrada instanceof Request ? entrada.url : entrada.toString();
    if (new URL(endereco, globalThis.location.href).pathname.startsWith('/duble-upload/')) {
      // O envio direto ao armazenamento: o corpo e o arquivo, e nao interessa ao duble.
      registro.push({ metodo: init?.method ?? 'GET', caminho: new URL(endereco).pathname, consulta: new URLSearchParams(), cabecalhos: {}, corpo: undefined });
      return new Response(null, { status: 200 });
    }
    const request = entrada instanceof Request ? entrada : new Request(entrada, init);
    const url = new URL(request.url);
    const cabecalhos: Record<string, string> = {};
    request.headers.forEach((v, k) => (cabecalhos[k.toLowerCase()] = v));
    const texto = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
    let corpo: unknown = undefined;
    if (texto) {
      try {
        corpo = JSON.parse(texto);
      } catch {
        corpo = texto;
      }
    }
    const req: Requisicao = { metodo: request.method, caminho: url.pathname, consulta: url.searchParams, cabecalhos, corpo };
    registro.push(req);
    if (opcoes.atrasoMs) await new Promise((r) => setTimeout(r, opcoes.atrasoMs));
    return responder(req);
  };

  return {
    fetch: fetchDoDuble,
    registro,
    encontros,
    pedidos,
    falharProximaLista: () => {
      falharLista = true;
    },
  };
}

export type Duble = ReturnType<typeof criarDuble>;
