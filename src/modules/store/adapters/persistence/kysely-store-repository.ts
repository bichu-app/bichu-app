/**
 * Persistencia da vitrine da `Loja`.
 *
 * ## `active` mora na clausula `WHERE`, e em lugar nenhum alem
 *
 * Mesmo desenho de `kysely-directory-repository.ts`, e pelo mesmo motivo: a
 * diferenca entre filtrar na consulta e filtrar depois aparece no dia em que
 * alguem esquece o `if`. Item retirado da vitrine fica na tabela, marcado
 * inativo e nunca apagado (criterio 22 da BICHUS-185, mesma regra da
 * BICHUS-90) -- e a unica coisa que o mantem fora da tela e este predicado.
 *
 * Vale para as DUAS tabelas: um item ativo de um parceiro desativado nao
 * aparece. Desativar um parceiro e como se retira a vitrine dele inteira, e um
 * item orfao na tela levaria a um site que decidimos nao mais apontar.
 *
 * ## A busca e `ILIKE` com escape, e nao busca de texto completo
 *
 * `to_tsvector` acertaria radical e plural, e custaria um indice GIN, uma
 * configuracao de idioma e uma segunda definicao de "o que casa" que diverge da
 * que a pessoa ve. A vitrine curada tem dezenas de itens, nao milhares:
 * `ILIKE` sobre titulo e resumo responde em tempo que ninguem percebe e casa o
 * que a pessoa digitou.
 *
 * **`%`, `_` e `\` sao escapados.** Sem isso, digitar `%` na busca casa tudo e
 * a contagem da barra de listagem passa a dizer o total da vitrine para um
 * termo que a pessoa acha que filtrou.
 */
import { sql } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import type { CategoriaDaVitrine, ItemDaVitrine } from '../../domain/item-da-vitrine.js';
import type {
  PaginaDaVitrine,
  RecorteDaVitrine,
  StoreRepository,
} from '../../ports/store-repository.js';

interface LinhaDoItem {
  slug: string;
  title: string;
  summary: string;
  category: CategoriaDaVitrine;
  image_url: string | null;
  target_url: string;
  partner_slug: string;
  partner_name: string;
  partner_host: string;
  price_amount: number | null;
  price_currency: string | null;
  price_checked_at: Date | string | null;
}

/**
 * Escapa os curingas do `LIKE` para que o termo da pessoa seja procurado como
 * texto, e nao como padrao.
 *
 * A barra invertida vem primeiro: escapar `%` depois dela duplicaria a barra
 * que acabou de ser inserida.
 */
export function escaparCuringas(termo: string): string {
  return termo.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => `\\${c}`);
}

/**
 * `price_checked_at` como `AAAA-MM-DD`.
 *
 * O driver devolve `Date` para `date`, e `Date.toISOString()` passa por UTC. Em
 * fuso negativo, uma data pura lida como meia-noite local vira o dia anterior
 * em UTC -- e o preco de um item passaria a ter sido consultado um dia antes,
 * silenciosamente aproximando o vencimento. As tres partes sao lidas em UTC,
 * que e como o driver monta a data pura.
 */
export function comoDataSimples(valor: Date | string | null): string | null {
  if (valor === null) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  const ano = String(valor.getUTCFullYear()).padStart(4, '0');
  const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(valor.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * O construtor da listagem, separado para poder ser **compilado e lido** por um
 * teste sem subir banco, como `construtorDaListagem` faz em `Perto`.
 *
 * E o que permite que "o item inativo esta fora" seja verificavel em vez de
 * combinado: o teste compila esta consulta e confere o predicado.
 */
export function construtorDaVitrine(db: Db, recorte: RecorteDaVitrine) {
  let consulta = db
    .selectFrom('store_items as i')
    // A juncao e pela identidade INTERNA (ADR-0024). O `slug` do parceiro
    // continua sendo o que sai na resposta, projetado logo abaixo -- o que
    // mudou foi por onde as duas tabelas se ligam, nao o que a tela recebe.
    .innerJoin('store_partners as p', 'p.id', 'i.partner_id')
    .where('i.active', '=', true)
    .where('p.active', '=', true);

  if (recorte.category !== undefined) {
    consulta = consulta.where('i.category', '=', recorte.category);
  }

  if (recorte.q !== undefined && recorte.q !== '') {
    const padrao = `%${escaparCuringas(recorte.q)}%`;
    consulta = consulta.where((eb) =>
      eb.or([
        eb(sql`i.title`, 'ilike', sql`${padrao}`),
        eb(sql`i.summary`, 'ilike', sql`${padrao}`),
      ]),
    );
  }

  return consulta;
}

export class KyselyStoreRepository implements StoreRepository {
  constructor(private readonly db: Db) {}

  async listarVitrine(recorte: RecorteDaVitrine): Promise<PaginaDaVitrine> {
    const base = construtorDaVitrine(this.db, recorte);

    // O total do RECORTE. Consulta separada e nao `COUNT(*) OVER ()` porque a
    // janela some quando a pagina nao tem linha nenhuma, e e justamente ai que
    // a tela precisa do total para distinguir "filtrou e nao sobrou" de "a
    // vitrine esta vazia".
    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const total = Number(contagem?.total ?? 0);

    // O desempate por `slug` nao e enfeite: sem ele, duas linhas com o mesmo
    // `sort_order` (ou o mesmo titulo) podem trocar de lugar entre duas
    // chamadas, e a paginacao passa a repetir e a pular itens sem nada acusar.
    const consulta =
      recorte.sort === 'nome'
        ? base.orderBy('i.title', 'asc').orderBy('i.slug', 'asc')
        : base.orderBy('i.sort_order', 'asc').orderBy('i.slug', 'asc');

    const linhas = (await consulta
      .select([
        'i.slug as slug',
        'i.title as title',
        'i.summary as summary',
        'i.category as category',
        'i.image_url as image_url',
        'i.target_url as target_url',
        'p.slug as partner_slug',
        'p.name as partner_name',
        'p.host as partner_host',
        'i.price_amount as price_amount',
        'i.price_currency as price_currency',
        'i.price_checked_at as price_checked_at',
      ])
      .limit(recorte.limit)
      .offset((recorte.page - 1) * recorte.limit)
      .execute()) as unknown as LinhaDoItem[];

    const itens: ItemDaVitrine[] = linhas.map((linha) => ({
      slug: linha.slug,
      title: linha.title,
      summary: linha.summary,
      category: linha.category,
      imageUrl: linha.image_url,
      targetUrl: linha.target_url,
      partnerSlug: linha.partner_slug,
      partnerName: linha.partner_name,
      partnerHost: linha.partner_host,
      priceAmount: linha.price_amount === null ? null : Number(linha.price_amount),
      priceCurrency: linha.price_currency,
      priceCheckedAt: comoDataSimples(linha.price_checked_at),
    }));

    return { itens, total };
  }
}

export function criarStoreRepository(db: Db): StoreRepository {
  return new KyselyStoreRepository(db);
}
