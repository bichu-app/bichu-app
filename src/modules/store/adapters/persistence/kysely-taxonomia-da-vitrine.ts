/**
 * Leitura do vocabulario dos dois niveis, com cache em processo.
 *
 * ## O cache e copiado de `reference-data`, e pela mesma razao
 *
 * A lista muda por MIGRACAO, nunca em tempo de execucao, e a resposta sai com
 * `Cache-Control: public, max-age=86400`. Consultar tres tabelas a cada chamada
 * de uma resposta que nao muda por 24 h seria trabalho que so existe para ser
 * jogado fora -- e esta e a rota que o filtro da aba `Loja` e o formulario do
 * painel abrem primeiro.
 *
 * O cache e invalidado por REINICIO, que e exatamente quando a migracao que
 * mudou a lista entra. Nao existe caminho de escrita que ele possa perder: nem
 * o painel nem o app escrevem em `store_categories` (o backoffice da Loja
 * escreve item, parceiro e tag, nunca o vocabulario de categoria).
 *
 * ## Tres consultas, e nao uma com juncao
 *
 * Uma juncao das tres tabelas traria o rotulo da categoria repetido em cada
 * subcategoria e cada especie, e o agrupamento seria feito aqui de qualquer
 * forma. Tres leituras de tabela pequena, uma vez por processo, custam menos
 * que o produto cartesiano -- e o `ORDER BY` de cada uma fica legivel.
 */
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
          // Categoria sem arvore de segundo nivel levantada sai com a lista
          // VAZIA, e nao fora da resposta: ela continua sendo uma categoria
          // escolhivel, so nao oferece subcategoria.
          subcategories: porCategoria.get(categoria.code) ?? [],
        })),
      };
      return emCache;
    },
  };
}
