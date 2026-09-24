/**
 * O repositorio da escrita administrativa da `Loja` em memoria, para os testes
 * do caso de uso e das rotas. Nunca e ligado em `api.ts`.
 *
 * Imita as duas coisas do banco de que o caso de uso depende: a versao lida no
 * `WHERE` (devolve `null` quando mudou) e o `ROLLBACK` (o rascunho da transacao
 * so vira estado se o trabalho inteiro terminar). A prova contra Postgres de
 * verdade e de `tests/integration/escrita-administrativa-da-loja.test.ts`.
 */
import { comoData } from '../../../../shared/time/clock.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type { AuditEvent } from '../../../audit/ports/audit-log.js';
import type {
  EnvioPreparado,
  NovaIntencaoDeCatalogo,
  PreparadorDeEnvioDeCatalogo,
} from '../../../media/ports/imagem-de-catalogo.js';
import type { ItemAdministrativo, ParceiroAdministrativo } from '../../domain/escrita-da-vitrine.js';
import {
  SlugOcupado,
  type CatalogoAdministrativoRepository,
  type MudancaDeItem,
  type MudancaDeParceiro,
  type NovoItem,
  type NovoParceiro,
  type TransacaoDoCatalogo,
} from '../../ports/catalogo-administrativo.js';

export interface Estado {
  parceiros: Map<string, ParceiroAdministrativo>;
  itens: Map<string, ItemAdministrativo>;
  intencoes: NovaIntencaoDeCatalogo[];
  trilha: AuditEvent[];
}

function clonar(e: Estado): Estado {
  return {
    parceiros: new Map(e.parceiros),
    itens: new Map(e.itens),
    intencoes: [...e.intencoes],
    trilha: [...e.trilha],
  };
}

let contador = 0;
export function novoId(): string {
  contador += 1;
  return `0192a3b4-0000-7000-8000-${String(contador).padStart(12, '0')}`;
}

/** Repositorio em memoria com `ROLLBACK` e versao no `WHERE`. */
export function repositorioEmMemoria(opcoes: { trilhaFalha?: () => boolean } = {}) {
  let estado: Estado = { parceiros: new Map(), itens: new Map(), intencoes: [], trilha: [] };

  const porSlug = <T extends { slug: string }>(m: Map<string, T>, slug: string): T | null =>
    [...m.values()].find((v) => v.slug === slug) ?? null;

  const repo: CatalogoAdministrativoRepository = {
    async emTransacao(trabalho) {
      const rascunho = clonar(estado);
      const tx: TransacaoDoCatalogo = {
        parceiroPorSlug: (slug) => Promise.resolve(porSlug(rascunho.parceiros, slug)),
        async inserirParceiro(novo: NovoParceiro) {
          await Promise.resolve();
          if (porSlug(rascunho.parceiros, novo.slug) !== null) throw new SlugOcupado('store_partner');
          const p: ParceiroAdministrativo = {
            id: novo.id,
            slug: novo.slug,
            name: novo.name,
            host: novo.host,
            active: true,
            sortOrder: novo.sortOrder,
            itemCount: 0,
            createdAt: comoData(novo.agora),
            updatedAt: comoData(novo.agora),
            version: 1,
          };
          rascunho.parceiros.set(p.id, p);
          return p;
        },
        async atualizarParceiro(id, versao, m: MudancaDeParceiro, agora) {
          await Promise.resolve();
          const atual = rascunho.parceiros.get(id);
          if (atual === undefined || atual.version !== versao) return null;
          if (m.slug !== undefined && m.slug !== atual.slug && porSlug(rascunho.parceiros, m.slug) !== null) {
            throw new SlugOcupado('store_partner');
          }
          const novo: ParceiroAdministrativo = {
            ...atual,
            ...(m.slug === undefined ? {} : { slug: m.slug }),
            ...(m.name === undefined ? {} : { name: m.name }),
            ...(m.host === undefined ? {} : { host: m.host }),
            ...(m.sortOrder === undefined ? {} : { sortOrder: m.sortOrder }),
            ...(m.active === undefined ? {} : { active: m.active }),
            updatedAt: comoData(agora),
            version: atual.version + 1,
          };
          rascunho.parceiros.set(id, novo);
          return novo;
        },
        destinosDosItensDoParceiro: async (partnerId) => {
          await Promise.resolve();
          const parceiro = rascunho.parceiros.get(partnerId);
          return [...rascunho.itens.values()]
            .filter((i) => i.partner.slug === parceiro?.slug)
            .map((i) => i.targetUrl);
        },
        itemPorSlug: (slug) => Promise.resolve(porSlug(rascunho.itens, slug)),
        async inserirItem(novo: NovoItem) {
          await Promise.resolve();
          if (porSlug(rascunho.itens, novo.slug) !== null) throw new SlugOcupado('store_item');
          const parceiro = rascunho.parceiros.get(novo.partnerId);
          if (parceiro === undefined) throw new Error('parceiro inexistente no dublê');
          const i: ItemAdministrativo = {
            id: novo.id,
            slug: novo.slug,
            partner: { slug: parceiro.slug, name: parceiro.name, host: parceiro.host },
            title: novo.title,
            summary: novo.summary,
            category: novo.category,
            targetUrl: novo.targetUrl,
            imageUrl: null,
            priceAmount: novo.preco?.amount ?? null,
            priceCurrency: novo.preco?.currency ?? null,
            priceCheckedAt: novo.preco?.checkedAt ?? null,
            active: false,
            publishedAt: null,
            sortOrder: novo.sortOrder,
            createdAt: comoData(novo.agora),
            updatedAt: comoData(novo.agora),
            version: 1,
          };
          rascunho.itens.set(i.id, i);
          return i;
        },
        async atualizarItem(id, versao, m: MudancaDeItem, agora) {
          await Promise.resolve();
          const atual = rascunho.itens.get(id);
          if (atual === undefined || atual.version !== versao) return null;
          const parceiro = m.partnerId === undefined ? undefined : rascunho.parceiros.get(m.partnerId);
          const novo: ItemAdministrativo = {
            ...atual,
            ...(m.slug === undefined ? {} : { slug: m.slug }),
            ...(parceiro === undefined
              ? {}
              : { partner: { slug: parceiro.slug, name: parceiro.name, host: parceiro.host } }),
            ...(m.title === undefined ? {} : { title: m.title }),
            ...(m.summary === undefined ? {} : { summary: m.summary }),
            ...(m.category === undefined ? {} : { category: m.category }),
            ...(m.targetUrl === undefined ? {} : { targetUrl: m.targetUrl }),
            ...(m.preco === undefined
              ? {}
              : m.preco === null
                ? { priceAmount: null, priceCurrency: null, priceCheckedAt: null }
                : {
                    priceAmount: m.preco.amount,
                    priceCurrency: m.preco.currency,
                    priceCheckedAt: m.preco.checkedAt,
                  }),
            ...(m.sortOrder === undefined ? {} : { sortOrder: m.sortOrder }),
            ...(m.active === undefined ? {} : { active: m.active }),
            ...(m.publishedAt === undefined || atual.publishedAt !== null
              ? {}
              : { publishedAt: comoData(m.publishedAt) }),
            updatedAt: comoData(agora),
            version: atual.version + 1,
          };
          rascunho.itens.set(id, novo);
          return novo;
        },
        registrarIntencaoDeCatalogo: async (nova) => {
          await Promise.resolve();
          rascunho.intencoes.push(nova);
        },
        registrarNaTrilha: async (evento) => {
          await Promise.resolve();
          if (opcoes.trilhaFalha?.() === true) throw new Error('trilha fora do ar');
          rascunho.trilha.push(evento);
        },
      };
      // O ROLLBACK: o rascunho so vira estado se o trabalho inteiro terminar.
      const resultado = await trabalho(tx);
      estado = rascunho;
      return resultado;
    },
    listarParceiros: () =>
      Promise.resolve({ itens: [...estado.parceiros.values()], total: estado.parceiros.size }),
    parceiroPorSlug: (slug) => Promise.resolve(porSlug(estado.parceiros, slug)),
    listarItens: () => Promise.resolve({ itens: [...estado.itens.values()], total: estado.itens.size }),
    itemPorSlug: (slug) => Promise.resolve(porSlug(estado.itens, slug)),
  };
  return { repo, estado: () => estado };
}

export function preparadorFalso(agora: Instant): PreparadorDeEnvioDeCatalogo {
  return {
    preparar: (contentType) =>
      Promise.resolve({
      uploadId: novoId(),
      chave: 'catalog/original/KioqKioqKioqKioqKioqKg' as EnvioPreparado['chave'],
      contentType,
      maxBytes: 10 * 1024 * 1024,
      autorizacao: {
        metodo: 'POST',
        url: 'https://upload.exemplo.invalid/' as EnvioPreparado['autorizacao']['url'],
        campos: { key: 'catalog/original/x' },
        expiraEm: comoData((agora + 600_000) as Instant),
        maxBytes: 10 * 1024 * 1024,
      },
      }),
  };
}

