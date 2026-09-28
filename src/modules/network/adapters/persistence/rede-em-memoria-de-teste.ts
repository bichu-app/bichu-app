/**
 * O repositorio da escrita administrativa da `Rede` em memoria, para os testes
 * do caso de uso e das rotas. Nunca e ligado em `api.ts`.
 *
 * Imita o que o caso de uso usa do banco: a versao lida no `WHERE` (devolve
 * `false` quando mudou), o `ROLLBACK` (o rascunho da transacao so vira estado
 * se o trabalho inteiro terminar, trilha incluida), a unicidade do `slug`, a
 * trilha como livro-razao da contagem de linhas (D56) e a fila de trabalhos.
 * A prova contra Postgres e `tests/integration/escrita-administrativa-da-rede.test.ts`.
 */
import type { AuditEvent } from '../../../audit/ports/audit-log.js';
import type { EnvioDeCatalogo } from '../../../media/ports/imagem-de-catalogo.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type {
  DecisaoDoPedido,
  EncontroAdministrativo,
  ImagemDoEncontroAdministrativa,
  PedidoNaFila,
} from '../../domain/escrita-do-encontro.js';
import {
  SlugDoEncontroOcupado,
  type RedeAdministrativaRepository,
  type TransacaoDaRede,
} from '../../ports/rede-administrativa.js';

type EncontroGuardado = Omit<EncontroAdministrativo, 'pedidosPendentes' | 'imagens'>;

interface PedidoGuardado {
  readonly id: string;
  readonly ref: string;
  readonly eventoId: string;
  readonly userId: string;
  readonly decisao: DecisaoDoPedido;
  readonly requestedAt: Date;
  readonly decidedAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly decisor: string | null;
}

interface ContaGuardada {
  readonly displayName: string | null;
  readonly createdAt: Date;
  readonly emailConfirmado: boolean;
  readonly email: string;
}

export interface EstadoDaRede {
  encontros: Map<string, EncontroGuardado>;
  galeria: Map<string, { imageId: string; position: number; altText: string }[]>;
  imagens: Map<string, { uploadId: string; status: 'processing' | 'ready' | 'rejected'; publicKey: string | null }>;
  envios: Map<string, { kind: string; purpose: 'store_item' | 'network_event' | null; expiresAt: Date; imagemId: string | null }>;
  pedidos: Map<string, PedidoGuardado>;
  contas: Map<string, ContaGuardada>;
  trabalhos: { kind: string; payload: Record<string, unknown> }[];
  trilha: (AuditEvent & { readonly em: Instant })[];
}

function clonar(e: EstadoDaRede): EstadoDaRede {
  return {
    encontros: new Map(e.encontros),
    galeria: new Map([...e.galeria].map(([k, v]) => [k, [...v]])),
    imagens: new Map(e.imagens),
    envios: new Map(e.envios),
    pedidos: new Map(e.pedidos),
    contas: new Map(e.contas),
    trabalhos: [...e.trabalhos],
    trilha: [...e.trilha],
  };
}

function montar(e: EstadoDaRede, g: EncontroGuardado): EncontroAdministrativo {
  const imagens: ImagemDoEncontroAdministrativa[] = (e.galeria.get(g.id) ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i) => {
      const img = e.imagens.get(i.imageId);
      return {
        uploadId: img?.uploadId ?? null,
        imageId: i.imageId,
        position: i.position,
        altText: i.altText,
        status: img?.status ?? 'processing',
        publicKey: img?.publicKey ?? null,
        rejectionReason: null,
      };
    });
  const pendentes = [...e.pedidos.values()].filter(
    (p) => p.eventoId === g.id && p.decisao === 'pending' && p.withdrawnAt === null,
  ).length;
  return { ...g, pedidosPendentes: pendentes, imagens };
}

function pedidoNaFila(e: EstadoDaRede, p: PedidoGuardado): PedidoNaFila | null {
  const ev = e.encontros.get(p.eventoId);
  const conta = e.contas.get(p.userId);
  if (ev === undefined || conta === undefined) return null;
  if (ev.visibilidade !== 'private' || ev.publicacao === 'removed') return null;
  return {
    id: p.id,
    ref: p.ref,
    decisao: p.decisao,
    requestedAt: p.requestedAt,
    decidedAt: p.decidedAt,
    withdrawnAt: p.withdrawnAt,
    encontro: { slug: ev.slug, title: ev.title, startsAt: ev.startsAt, timeZone: ev.timeZone },
    solicitante: { displayName: conta.displayName, contaCriadaEm: conta.createdAt, emailConfirmado: conta.emailConfirmado },
  };
}

export function repositorioDaRedeEmMemoria(opcoes: { trilhaFalha?: () => boolean; relogio?: () => Instant } = {}) {
  let estado: EstadoDaRede = {
    encontros: new Map(),
    galeria: new Map(),
    imagens: new Map(),
    envios: new Map(),
    pedidos: new Map(),
    contas: new Map(),
    trabalhos: [],
    trilha: [],
  };
  const agora = opcoes.relogio ?? (() => 0 as Instant);
  const porSlug = (e: EstadoDaRede, slug: string) => [...e.encontros.values()].find((v) => v.slug === slug) ?? null;

  const repo: RedeAdministrativaRepository = {
    async emTransacao(trabalho) {
      const r = clonar(estado);
      const tx: TransacaoDaRede = {
        encontroPorSlug: (slug) => {
          const g = porSlug(r, slug);
          return Promise.resolve(g === null ? null : montar(r, g));
        },
        recarregarEncontro: (id) => {
          const g = r.encontros.get(id);
          if (g === undefined) return Promise.reject(new Error('sumiu'));
          return Promise.resolve(montar(r, g));
        },
        existeSlug: (slug) => Promise.resolve(porSlug(r, slug) !== null),
        inserirEncontro: (novo) => {
          if (porSlug(r, novo.slug) !== null) return Promise.reject(new SlugDoEncontroOcupado());
          const quando = comoData(novo.agora);
          r.encontros.set(novo.id, {
            id: novo.id,
            slug: novo.slug,
            title: novo.title,
            summary: novo.summary,
            lugar: novo.lugar,
            startsAt: novo.startsAt,
            endsAt: novo.endsAt,
            timeZone: novo.timeZone,
            visibilidade: novo.visibilidade,
            entrada: novo.entrada,
            portes: [],
            idadeDosCaes: novo.idadeDosCaes,
            vacinacaoExigida: novo.vacinacaoExigida,
            areaCercada: novo.areaCercada,
            estrutura: [],
            paraLevar: [],
            observacoes: novo.observacoes,
            publicacao: 'published',
            publishedAt: quando,
            cancelledAt: null,
            cancellationNote: null,
            createdAt: quando,
            updatedAt: quando,
            version: 1,
          });
          return Promise.resolve();
        },
        atualizarEncontro: (id, versaoLida, m, quando) => {
          const atual = r.encontros.get(id);
          if (atual === undefined || atual.version !== versaoLida) return Promise.resolve(false);
          if (m.slug !== undefined && m.slug !== atual.slug && porSlug(r, m.slug) !== null) {
            return Promise.reject(new SlugDoEncontroOcupado());
          }
          r.encontros.set(id, {
            ...atual,
            ...(m.slug === undefined ? {} : { slug: m.slug }),
            ...(m.title === undefined ? {} : { title: m.title }),
            ...(m.summary === undefined ? {} : { summary: m.summary }),
            ...(m.lugar === undefined ? {} : { lugar: m.lugar }),
            ...(m.startsAt === undefined ? {} : { startsAt: m.startsAt }),
            ...(m.endsAt === undefined ? {} : { endsAt: m.endsAt }),
            ...(m.timeZone === undefined ? {} : { timeZone: m.timeZone }),
            ...(m.visibilidade === undefined ? {} : { visibilidade: m.visibilidade }),
            ...(m.entrada === undefined ? {} : { entrada: m.entrada }),
            ...(m.idadeDosCaes === undefined ? {} : { idadeDosCaes: m.idadeDosCaes }),
            ...(m.vacinacaoExigida === undefined ? {} : { vacinacaoExigida: m.vacinacaoExigida }),
            ...(m.areaCercada === undefined ? {} : { areaCercada: m.areaCercada }),
            ...(m.observacoes === undefined ? {} : { observacoes: m.observacoes }),
            ...(m.publicacao === undefined ? {} : { publicacao: m.publicacao }),
            ...(m.cancelledAt === undefined ? {} : { cancelledAt: m.cancelledAt }),
            ...(m.cancellationNote === undefined ? {} : { cancellationNote: m.cancellationNote }),
            updatedAt: comoData(quando),
            version: atual.version + 1,
          });
          return Promise.resolve(true);
        },
        substituirPortes: (id, portes) => {
          const g = r.encontros.get(id);
          if (g !== undefined) r.encontros.set(id, { ...g, portes: [...portes] });
          return Promise.resolve();
        },
        substituirEstrutura: (id, estrutura) => {
          const g = r.encontros.get(id);
          if (g !== undefined) r.encontros.set(id, { ...g, estrutura: [...estrutura] });
          return Promise.resolve();
        },
        substituirParaLevar: (id, itens) => {
          const g = r.encontros.get(id);
          if (g !== undefined) r.encontros.set(id, { ...g, paraLevar: [...itens] });
          return Promise.resolve();
        },
        substituirImagens: (id, imagens) => {
          r.galeria.set(id, imagens.map((i) => ({ ...i })));
          return Promise.resolve();
        },
        encontroDaImagem: (imageId) => {
          for (const [eventoId, lista] of r.galeria) if (lista.some((i) => i.imageId === imageId)) return Promise.resolve(eventoId);
          return Promise.resolve(null);
        },
        envioDeCatalogo: (uploadId): Promise<EnvioDeCatalogo | null> => {
          const e = r.envios.get(uploadId);
          if (e === undefined) return Promise.resolve(null);
          return Promise.resolve({
            id: uploadId,
            kind: e.kind,
            purpose: e.purpose,
            expiresAt: e.expiresAt,
            confirmedAt: e.imagemId === null ? null : comoData(0 as Instant),
            catalogImageId: e.imagemId,
          });
        },
        confirmarEnvioDeCatalogo: ({ imagemId, envioId }) => {
          const e = r.envios.get(envioId);
          if (e !== undefined) r.envios.set(envioId, { ...e, imagemId });
          r.imagens.set(imagemId, { uploadId: envioId, status: 'processing', publicKey: null });
          r.trabalhos.push({ kind: 'media.process_catalog_image', payload: { catalog_image_id: imagemId } });
          return Promise.resolve();
        },
        pedidoPorRef: (ref) => {
          const p = [...r.pedidos.values()].find((x) => x.ref === ref);
          return Promise.resolve(p === undefined ? null : pedidoNaFila(r, p));
        },
        decidirPedido: (id, decisao, decisor, quando) => {
          const p = r.pedidos.get(id);
          if (p === undefined) return Promise.reject(new Error('sumiu'));
          const novo = { ...p, decisao, decidedAt: comoData(quando), decisor };
          r.pedidos.set(id, novo);
          const lido = pedidoNaFila(r, novo);
          return lido === null ? Promise.reject(new Error('sumiu')) : Promise.resolve(lido);
        },
        enfileirarAvisoDeAprovacao: ({ pedidoId }) => {
          r.trabalhos.push({ kind: 'network.join_request_approved', payload: { join_request_id: pedidoId } });
          return Promise.resolve();
        },
        travarLeituraDaFila: () => Promise.resolve(),
        linhasDevolvidasDesde: (conta, desde) => {
          const eventos = r.trilha.filter(
            (t) =>
              t.actorUserId === conta && t.action === 'admin.network_join_request.listed' && t.em > desde.getTime(),
          );
          const total = eventos.reduce((soma, t) => soma + Number(t.metadata?.['rows_returned'] ?? 0), 0);
          const maisAntiga = eventos.length === 0 ? null : comoData(Math.min(...eventos.map((t) => t.em)) as Instant);
          return Promise.resolve({ total, maisAntiga });
        },
        listarFila: (recorte) => {
          const decisao = recorte.decisao ?? 'pending';
          const todos = [...r.pedidos.values()]
            .filter((p) => p.decisao === decisao && (decisao !== 'pending' || p.withdrawnAt === null))
            .map((p) => pedidoNaFila(r, p))
            .filter((p): p is PedidoNaFila => p !== null)
            .filter((p) => recorte.eventoSlug === undefined || p.encontro.slug === recorte.eventoSlug)
            .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
          const inicio = (recorte.page - 1) * recorte.limit;
          return Promise.resolve({ itens: todos.slice(inicio, inicio + recorte.limit), total: todos.length });
        },
        registrarNaTrilha: (evento) => {
          if (opcoes.trilhaFalha?.() === true) return Promise.reject(new Error('trilha fora do ar'));
          r.trilha.push({ ...evento, em: agora() });
          return Promise.resolve();
        },
      };
      const resultado = await trabalho(tx);
      estado = r;
      return resultado;
    },
    encontroPorSlug: (slug) => {
      const g = porSlug(estado, slug);
      return Promise.resolve(g === null ? null : montar(estado, g));
    },
    listarEncontros: (recorte) => {
      const itens = [...estado.encontros.values()]
        .filter((g) => (recorte.publicacao === undefined ? g.publicacao !== 'removed' : g.publicacao === recorte.publicacao))
        .map((g) => montar(estado, g));
      const inicio = (recorte.page - 1) * recorte.limit;
      return Promise.resolve({ itens: itens.slice(inicio, inicio + recorte.limit), total: itens.length });
    },
  };

  return {
    repo,
    estado: () => estado,
    /** Semeia fora de transacao: conta, envio e pedido, que o painel nao cria. */
    semear: (ajuste: (e: EstadoDaRede) => void) => {
      const r = clonar(estado);
      ajuste(r);
      estado = r;
    },
  };
}
