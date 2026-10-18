/** Massa na forma de `api/openapi.yaml`, com parceiros ficticios (secao 25.5). */
import type { Esquemas } from '../../src/api/cliente.ts';

export function parceiro(extra: Partial<Esquemas['AdminStorePartner']> = {}): Esquemas['AdminStorePartner'] {
  return {
    slug: 'pet-center-aurora',
    name: 'Pet Center Aurora',
    host: 'petcenteraurora.com.br',
    active: true,
    sort_order: 1,
    item_count: 2,
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-20T12:00:00Z',
    version: 3,
    ...extra,
  };
}

export function tag(label: string, extra: Partial<Esquemas['AdminStoreTag']> = {}): Esquemas['AdminStoreTag'] {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ /g, '-');
  return { slug, label, active: true, item_count: 1, created_at: '2026-09-20T12:00:00Z', updated_at: '2026-09-20T12:00:00Z', version: 1, ...extra };
}

export function item(extra: Partial<Esquemas['AdminStoreItem']> = {}): Esquemas['AdminStoreItem'] {
  return {
    slug: 'racao-adulto-15kg',
    partner: { slug: 'pet-center-aurora', name: 'Pet Center Aurora', host: 'petcenteraurora.com.br' },
    title: 'Ração seca para cães adultos 15 kg',
    summary: 'Para cães adultos de porte médio e grande.',
    category: 'food',
    target_url: 'https://petcenteraurora.com.br/racao-15kg',
    species: ['dog'],
    tags: [{ slug: 'adulto', label: 'adulto', active: true }],
    images: [],
    // Vazio: a massa nasce publicavel. O rascunho incompleto e caso de teste,
    // e os testes o montam com `item({ summary: null, missing_to_publish: [...] })`.
    missing_to_publish: [],
    price: { amount: 18990, currency: 'BRL', checked_at: '2026-09-15', valid_until: '2026-10-15' },
    price_status: 'vigente',
    publication_state: 'published',
    published_at: '2026-09-15T12:00:00Z',
    sort_order: 0,
    created_at: '2026-09-15T12:00:00Z',
    updated_at: '2026-09-18T12:00:00Z',
    version: 4,
    ...extra,
  };
}

export function pagina<T>(items: T[], total = items.length) {
  return { items, page: 1, limit: 50, total };
}

/**
 * O vocabulario dos dois niveis, como `GET /v1/store/taxonomy` o entrega
 * (`StoreTaxonomy` em `api/openapi.yaml`).
 *
 * A carga do formulario de produto pede a taxonomia JUNTO com o item, os
 * parceiros e as tags, e a falha dela reprova a carga: sem vocabulario nao ha
 * categoria para oferecer, e `category` e obrigatorio. Teste de tela da Loja
 * que nao declara esta rota abre o formulario em "erro", e nenhum campo existe
 * para encontrar.
 */
export function taxonomia(extra: Partial<Esquemas['StoreTaxonomy']> = {}): Esquemas['StoreTaxonomy'] {
  return {
    categories: [
      {
        code: 'food',
        label: 'Rações',
        subcategories: [
          { code: 'racao_seca', label: 'Ração seca', species: ['dog'] },
          { code: 'racao_umida', label: 'Ração úmida', species: ['dog'] },
        ],
      },
      { code: 'treats', label: 'Petiscos e ossos', subcategories: [{ code: 'bifinhos', label: 'Bifinhos', species: ['dog'] }] },
      { code: 'toy', label: 'Brinquedos', subcategories: [] },
      { code: 'accessory', label: 'Roupas e acessorios', subcategories: [] },
      { code: 'bed', label: 'Camas e casinhas', subcategories: [] },
    ],
    ...extra,
  };
}
