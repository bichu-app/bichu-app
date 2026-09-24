/**
 * Persistencia da escrita administrativa da `Loja` (BICHUS-266 e BICHUS-267).
 *
 * ## A versao lida mora na clausula `WHERE`
 *
 * `UPDATE ... SET version = version + 1 WHERE id = $1 AND version = $2
 * RETURNING id`. Zero linhas quer dizer que outra pessoa salvou depois da
 * leitura, e o caso de uso responde 412 sem ter gravado nada. Ler, comparar e
 * gravar em tres passos deixaria dois administradores passarem juntos pela
 * comparacao.
 *
 * ## A trilha e da porta de `audit`, e nao daqui
 *
 * `registrarNaTrilha` delega a `TrilhaTransacional.recordIn(trx, evento)`, a
 * forma transacional da trilha que o ADR-0027 item 8 pede: o evento e gravado NA transacao da
 * escrita, e a falha dele desfaz a escrita. Este adaptador nao conhece o papel
 * `bichu_audit_writer` nem o esquema `audit`.
 *
 * ## O que este arquivo nao le
 *
 * `users`, `user_roles`, `pets`, conversas e casos (D51). A intencao de envio
 * de imagem e gravada pela porta de `media`.
 */
import { sql } from 'kysely';
import type { Db, DbTransaction, DbExecutor } from '../../../../shared/db/pool.js';
import type { TrilhaTransacional } from '../../../audit/ports/audit-log.js';
import type { RegistroDeImagemDeCatalogo } from '../../../media/ports/imagem-de-catalogo.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type { ItemAdministrativo, ParceiroAdministrativo } from '../../domain/escrita-da-vitrine.js';
import type { CategoriaDaVitrine } from '../../domain/item-da-vitrine.js';
import { DIAS_DE_VALIDADE_DO_PRECO } from '../../domain/item-da-vitrine.js';
import { somarDias } from '../../domain/escrita-da-vitrine.js';
import {
  SlugOcupado,
  type CatalogoAdministrativoRepository,
  type MudancaDeItem,
  type MudancaDeParceiro,
  type NovoItem,
  type NovoParceiro,
  type Pagina,
  type RecorteDeItens,
  type RecorteDeParceiros,
  type TransacaoDoCatalogo,
} from '../../ports/catalogo-administrativo.js';
import { comoDataSimples, escaparCuringas } from './kysely-store-repository.js';

export interface DependenciasDoCatalogoAdministrativo {
  readonly db: Db;
  /**
   * A forma transacional da trilha (`criarTrilhaTransacional`). Nao e
   * `EscritaAuditada` porque duas operacoes daqui terminam SEM evento: publicar
   * item ja publicado e retirar item ja retirado respondem 200 sem nova linha
   * de trilha, como o contrato declara, e `EscritaAuditada` nao admite
   * trabalho sem evento. Toda escrita que muda estado grava o evento pelo
   * mesmo `recordIn`, na mesma transacao, e por ultimo.
   */
  readonly trilha: TrilhaTransacional;
  readonly imagens: RegistroDeImagemDeCatalogo;
}

/** `23505`, `unique_violation`, nos dois indices de endereco publico. */
const VIOLACAO_DE_UNICIDADE = '23505';
const INDICE_DO_PARCEIRO = 'store_partners_slug_unico';
const INDICE_DO_ITEM = 'store_items_slug_unico';

function comSlugTraduzido<T>(recurso: 'store_partner' | 'store_item', indice: string) {
  return async (escrever: () => Promise<T>): Promise<T> => {
    try {
      return await escrever();
    } catch (erro) {
      const e = erro as { code?: string; constraint?: string };
      if (e.code === VIOLACAO_DE_UNICIDADE && e.constraint === indice) throw new SlugOcupado(recurso);
      throw erro;
    }
  };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

interface LinhaDoParceiro {
  id: string;
  slug: string;
  name: string;
  host: string;
  active: boolean;
  sort_order: number;
  item_count: string | number;
  created_at: Date;
  updated_at: Date;
  version: number;
}

function comoParceiro(l: LinhaDoParceiro): ParceiroAdministrativo {
  return {
    id: l.id,
    slug: l.slug,
    name: l.name,
    host: l.host,
    active: l.active,
    sortOrder: Number(l.sort_order),
    itemCount: Number(l.item_count),
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    version: Number(l.version),
  };
}

function consultaDeParceiros(db: DbExecutor) {
  return db
    .selectFrom('store_partners as p')
    .select([
      'p.id as id',
      'p.slug as slug',
      'p.name as name',
      'p.host as host',
      'p.active as active',
      'p.sort_order as sort_order',
      'p.created_at as created_at',
      'p.updated_at as updated_at',
      'p.version as version',
      // Subconsulta correlacionada e nao `GROUP BY`: a pagina tem no maximo cem
      // linhas, e o `COUNT` por parceiro usa o indice de `partner_id` que a
      // chave estrangeira pede. Uma consulta por pagina, sem N+1.
      (eb) =>
        eb
          .selectFrom('store_items as i')
          .select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('i.partner_id', '=', 'p.id')
          .as('item_count'),
    ]);
}

interface LinhaDoItem {
  id: string;
  slug: string;
  partner_slug: string;
  partner_name: string;
  partner_host: string;
  title: string;
  summary: string;
  category: CategoriaDaVitrine;
  target_url: string;
  image_url: string | null;
  price_amount: number | null;
  price_currency: string | null;
  price_checked_at: Date | string | null;
  active: boolean;
  published_at: Date | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  version: number;
}

function comoItem(l: LinhaDoItem): ItemAdministrativo {
  return {
    id: l.id,
    slug: l.slug,
    partner: { slug: l.partner_slug, name: l.partner_name, host: l.partner_host },
    title: l.title,
    summary: l.summary,
    category: l.category,
    targetUrl: l.target_url,
    imageUrl: l.image_url,
    priceAmount: l.price_amount === null ? null : Number(l.price_amount),
    priceCurrency: l.price_currency,
    priceCheckedAt: comoDataSimples(l.price_checked_at),
    active: l.active,
    publishedAt: l.published_at,
    sortOrder: Number(l.sort_order),
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    version: Number(l.version),
  };
}

function consultaDeItens(db: DbExecutor) {
  return db
    .selectFrom('store_items as i')
    .innerJoin('store_partners as p', 'p.id', 'i.partner_id')
    .select([
      'i.id as id',
      'i.slug as slug',
      'p.slug as partner_slug',
      'p.name as partner_name',
      'p.host as partner_host',
      'i.title as title',
      'i.summary as summary',
      'i.category as category',
      'i.target_url as target_url',
      'i.image_url as image_url',
      'i.price_amount as price_amount',
      'i.price_currency as price_currency',
      'i.price_checked_at as price_checked_at',
      'i.active as active',
      'i.published_at as published_at',
      'i.sort_order as sort_order',
      'i.created_at as created_at',
      'i.updated_at as updated_at',
      'i.version as version',
    ]);
}

async function parceiroPorSlug(db: DbExecutor, slug: string): Promise<ParceiroAdministrativo | null> {
  const linha = await consultaDeParceiros(db).where('p.slug', '=', slug).executeTakeFirst();
  return linha === undefined ? null : comoParceiro(linha as LinhaDoParceiro);
}

async function parceiroPorId(db: DbExecutor, id: string): Promise<ParceiroAdministrativo> {
  const linha = await consultaDeParceiros(db).where('p.id', '=', id).executeTakeFirstOrThrow();
  return comoParceiro(linha as LinhaDoParceiro);
}

async function itemPorSlug(db: DbExecutor, slug: string): Promise<ItemAdministrativo | null> {
  const linha = await consultaDeItens(db).where('i.slug', '=', slug).executeTakeFirst();
  return linha === undefined ? null : comoItem(linha);
}

async function itemPorId(db: DbExecutor, id: string): Promise<ItemAdministrativo> {
  const linha = await consultaDeItens(db).where('i.id', '=', id).executeTakeFirstOrThrow();
  return comoItem(linha);
}

/**
 * O construtor da listagem de itens do painel, exportado para ser compilado e
 * lido por teste sem banco.
 *
 * `price_status` e filtrado pela MESMA fronteira de `estadoDoPreco`: vencido e
 * `price_checked_at` com MAIS de 30 dias, entao o corte e
 * `price_checked_at < hoje - 30`. O dia 30 ainda vale.
 */
export function construtorDaListagemDoPainel(db: DbExecutor, recorte: RecorteDeItens) {
  let consulta = consultaDeItens(db);

  if (recorte.q !== undefined && recorte.q !== '') {
    const padrao = `%${escaparCuringas(recorte.q)}%`;
    consulta = consulta.where((eb) =>
      eb.or([eb(sql`i.title`, 'ilike', sql`${padrao}`), eb(sql`i.summary`, 'ilike', sql`${padrao}`)]),
    );
  }
  if (recorte.category !== undefined) consulta = consulta.where('i.category', '=', recorte.category);
  if (recorte.partnerSlug !== undefined) consulta = consulta.where('p.slug', '=', recorte.partnerSlug);

  if (recorte.publicationState === 'draft') {
    consulta = consulta.where('i.published_at', 'is', null);
  } else if (recorte.publicationState === 'published') {
    consulta = consulta.where('i.active', '=', true);
  } else if (recorte.publicationState === 'retired') {
    consulta = consulta.where('i.active', '=', false).where('i.published_at', 'is not', null);
  }

  const corte = somarDias(recorte.hoje, -DIAS_DE_VALIDADE_DO_PRECO);
  if (recorte.priceStatus === 'sem_preco') {
    consulta = consulta.where('i.price_amount', 'is', null);
  } else if (recorte.priceStatus === 'vencido') {
    consulta = consulta.where(sql<boolean>`i.price_checked_at < ${corte}::date`);
  } else if (recorte.priceStatus === 'vigente') {
    consulta = consulta.where(sql<boolean>`i.price_checked_at >= ${corte}::date`);
  }
  return consulta;
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

function transacao(trx: DbTransaction, deps: DependenciasDoCatalogoAdministrativo): TransacaoDoCatalogo {
  return {
    // Dentro da escrita, o parceiro e lido com `FOR UPDATE`. Sem a trava, criar
    // um item e trocar o host do mesmo parceiro podiam correr juntos: a troca
    // conferia os destinos antes de o item novo existir, e o item nascia
    // apontando para o host antigo. Com ela, uma das duas espera a outra.
    async parceiroPorSlug(slug) {
      const linha = await consultaDeParceiros(trx)
        .where('p.slug', '=', slug)
        .forUpdate('p')
        .executeTakeFirst();
      return linha === undefined ? null : comoParceiro(linha as LinhaDoParceiro);
    },

    async inserirParceiro(novo: NovoParceiro) {
      const agora = new Date(novo.agora);
      await comSlugTraduzido<void>('store_partner', INDICE_DO_PARCEIRO)(async () => {
        await trx
          .insertInto('store_partners')
          .values({
            id: novo.id,
            slug: novo.slug,
            name: novo.name,
            host: novo.host,
            active: true,
            sort_order: novo.sortOrder,
            created_at: agora,
            updated_at: agora,
            version: 1,
          })
          .execute();
      });
      return parceiroPorId(trx, novo.id);
    },

    async atualizarParceiro(id, versaoLida, mudanca: MudancaDeParceiro, agora: Instant) {
      const atualizado = await comSlugTraduzido<{ id: string } | undefined>(
        'store_partner',
        INDICE_DO_PARCEIRO,
      )(() =>
        trx
          .updateTable('store_partners')
          .set((eb) => ({
            ...(mudanca.slug === undefined ? {} : { slug: mudanca.slug }),
            ...(mudanca.name === undefined ? {} : { name: mudanca.name }),
            ...(mudanca.host === undefined ? {} : { host: mudanca.host }),
            ...(mudanca.sortOrder === undefined ? {} : { sort_order: mudanca.sortOrder }),
            ...(mudanca.active === undefined ? {} : { active: mudanca.active }),
            updated_at: new Date(agora),
            version: eb('version', '+', 1),
          }))
          .where('id', '=', id)
          .where('version', '=', versaoLida)
          .returning('id')
          .executeTakeFirst(),
      );
      return atualizado === undefined ? null : parceiroPorId(trx, id);
    },

    async destinosDosItensDoParceiro(partnerId) {
      // `FOR UPDATE` para a troca de host nao correr com um item novo apontando
      // para o host antigo: o item criado depois desta leitura espera o COMMIT.
      const linhas = await trx
        .selectFrom('store_items')
        .select('target_url')
        .where('partner_id', '=', partnerId)
        .forUpdate()
        .execute();
      return linhas.map((l) => l.target_url);
    },

    itemPorSlug: (slug) => itemPorSlug(trx, slug),

    async inserirItem(novo: NovoItem) {
      const agora = new Date(novo.agora);
      await comSlugTraduzido<void>('store_item', INDICE_DO_ITEM)(async () => {
        await trx
          .insertInto('store_items')
          .values({
            id: novo.id,
            slug: novo.slug,
            partner_id: novo.partnerId,
            title: novo.title,
            summary: novo.summary,
            category: novo.category,
            image_url: null,
            target_url: novo.targetUrl,
            price_amount: novo.preco?.amount ?? null,
            price_currency: novo.preco?.currency ?? null,
            price_checked_at: novo.preco === null ? null : sql<Date>`${novo.preco.checkedAt}::date`,
            // RASCUNHO. O padrao `true` da coluna e da massa (ADR-0027 item 14).
            active: false,
            published_at: null,
            sort_order: novo.sortOrder,
            created_at: agora,
            updated_at: agora,
            version: 1,
          })
          .execute();
      });
      return itemPorId(trx, novo.id);
    },

    async atualizarItem(id, versaoLida, mudanca: MudancaDeItem, agora: Instant) {
      const atualizado = await comSlugTraduzido<{ id: string } | undefined>(
        'store_item',
        INDICE_DO_ITEM,
      )(() =>
        trx
          .updateTable('store_items')
          .set((eb) => ({
            ...(mudanca.slug === undefined ? {} : { slug: mudanca.slug }),
            ...(mudanca.partnerId === undefined ? {} : { partner_id: mudanca.partnerId }),
            ...(mudanca.title === undefined ? {} : { title: mudanca.title }),
            ...(mudanca.summary === undefined ? {} : { summary: mudanca.summary }),
            ...(mudanca.category === undefined ? {} : { category: mudanca.category }),
            ...(mudanca.targetUrl === undefined ? {} : { target_url: mudanca.targetUrl }),
            ...(mudanca.preco === undefined
              ? {}
              : mudanca.preco === null
                ? { price_amount: null, price_currency: null, price_checked_at: null }
                : {
                    price_amount: mudanca.preco.amount,
                    price_currency: mudanca.preco.currency,
                    price_checked_at: sql<Date>`${mudanca.preco.checkedAt}::date`,
                  }),
            ...(mudanca.sortOrder === undefined ? {} : { sort_order: mudanca.sortOrder }),
            ...(mudanca.active === undefined ? {} : { active: mudanca.active }),
            // `coalesce` e a segunda rede do "nunca reescrito": mesmo que o caso
            // de uso mande a data de novo, a primeira publicacao fica.
            ...(mudanca.publishedAt === undefined
              ? {}
              : { published_at: sql<Date>`coalesce(published_at, ${new Date(mudanca.publishedAt)})` }),
            updated_at: new Date(agora),
            version: eb('version', '+', 1),
          }))
          .where('id', '=', id)
          .where('version', '=', versaoLida)
          .returning('id')
          .executeTakeFirst(),
      );
      return atualizado === undefined ? null : itemPorId(trx, id);
    },

    registrarIntencaoDeCatalogo: (nova) => deps.imagens.registrarIntencao(trx, nova),

    registrarNaTrilha: (evento) => deps.trilha.recordIn(trx, evento),
  };
}

export function criarCatalogoAdministrativoRepository(
  deps: DependenciasDoCatalogoAdministrativo,
): CatalogoAdministrativoRepository {
  const { db } = deps;
  return {
    emTransacao: (trabalho) => db.transaction().execute((trx) => trabalho(transacao(trx, deps))),

    async listarParceiros(recorte: RecorteDeParceiros): Promise<Pagina<ParceiroAdministrativo>> {
      let base = db.selectFrom('store_partners as p');
      if (recorte.q !== undefined && recorte.q !== '') {
        const padrao = `%${escaparCuringas(recorte.q)}%`;
        base = base.where((eb) =>
          eb.or([eb(sql`p.name`, 'ilike', sql`${padrao}`), eb(sql`p.host`, 'ilike', sql`${padrao}`)]),
        );
      }
      if (recorte.active !== undefined) base = base.where('p.active', '=', recorte.active);

      const contagem = await base
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirst();

      let pagina = consultaDeParceiros(db);
      if (recorte.q !== undefined && recorte.q !== '') {
        const padrao = `%${escaparCuringas(recorte.q)}%`;
        pagina = pagina.where((eb) =>
          eb.or([eb(sql`p.name`, 'ilike', sql`${padrao}`), eb(sql`p.host`, 'ilike', sql`${padrao}`)]),
        );
      }
      if (recorte.active !== undefined) pagina = pagina.where('p.active', '=', recorte.active);

      const linhas = await pagina
        .orderBy('p.sort_order', 'asc')
        .orderBy('p.slug', 'asc')
        .limit(recorte.limit)
        .offset((recorte.page - 1) * recorte.limit)
        .execute();
      return {
        itens: (linhas as LinhaDoParceiro[]).map(comoParceiro),
        total: Number(contagem?.total ?? 0),
      };
    },

    parceiroPorSlug: (slug) => parceiroPorSlug(db, slug),

    async listarItens(recorte: RecorteDeItens): Promise<Pagina<ItemAdministrativo>> {
      const base = construtorDaListagemDoPainel(db, recorte);
      const contagem = await base
        .clearSelect()
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirst();

      // O desempate por `slug` em toda ordem: sem ele a paginacao repete e pula.
      const ordenada =
        recorte.sort === 'nome'
          ? base.orderBy('i.title', 'asc').orderBy('i.slug', 'asc')
          : recorte.sort === 'atualizado'
            ? base.orderBy('i.updated_at', 'desc').orderBy('i.slug', 'asc')
            : recorte.sort === 'validade'
              ? base.orderBy(sql`i.price_checked_at asc nulls last`).orderBy('i.slug', 'asc')
              : base.orderBy('i.sort_order', 'asc').orderBy('i.slug', 'asc');

      const linhas = await ordenada
        .limit(recorte.limit)
        .offset((recorte.page - 1) * recorte.limit)
        .execute();
      return {
        itens: (linhas as LinhaDoItem[]).map(comoItem),
        total: Number(contagem?.total ?? 0),
      };
    },

    itemPorSlug: (slug) => itemPorSlug(db, slug),
  };
}
