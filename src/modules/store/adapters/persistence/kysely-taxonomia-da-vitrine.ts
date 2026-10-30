/** Leitura do vocabulario dos dois niveis, com cache em processo. */
import type { Db } from '../../../../shared/db/pool.js';
import type { EspecieDoItem } from '../../domain/item-da-vitrine.js';
import type {
  SubcategoriaDoVocabulario,
  TaxonomiaDaVitrine,
  TaxonomiaDaVitrineRepository,
} from '../../ports/taxonomia-da-vitrine.js';

export function criarTaxonomiaDaVitrineRepository(db: Db): TaxonomiaDaVitrineRepository {
  let emCache: TaxonomiaDaVitrine | undefined;

  return {
    async carregar(): Promise<TaxonomiaDaVitrine> {
      if (emCache !== undefined) return emCache;

      const [categorias, subcategorias, especies] = await Promise.all([
        db
          .selectFrom('store_categories')
          .select(['code', 'label'])
          .where('active', '=', true)
          .orderBy('sort_order')
          .orderBy('code')
          .execute(),
        db
          .selectFrom('store_subcategories')
          .select(['category_code', 'code', 'label'])
          .where('active', '=', true)
          .orderBy('category_code')
          .orderBy('sort_order')
          .orderBy('code')
          .execute(),
        db
          .selectFrom('store_subcategory_species')
          .select(['category_code', 'code', 'species_code'])
          .orderBy('species_code')
          .execute(),
      ]);

      const porSubcategoria = new Map<string, EspecieDoItem[]>();
      for (const linha of especies) {
        const chave = `${linha.category_code}/${linha.code}`;
        const lista = porSubcategoria.get(chave);
        if (lista === undefined) porSubcategoria.set(chave, [linha.species_code]);
        else lista.push(linha.species_code);
      }

      const porCategoria = new Map<string, SubcategoriaDoVocabulario[]>();
      for (const linha of subcategorias) {
        const lista = porCategoria.get(linha.category_code) ?? [];
        lista.push({
          code: linha.code,
          label: linha.label,
          species: porSubcategoria.get(`${linha.category_code}/${linha.code}`) ?? [],
        });
        porCategoria.set(linha.category_code, lista);
      }

      emCache = {
        categories: categorias.map((categoria) => ({
          code: categoria.code,
          label: categoria.label,
          subcategories: porCategoria.get(categoria.code) ?? [],
        })),
      };
      return emCache;
    },
  };
}
