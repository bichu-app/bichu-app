/**
 * Leitura dos dados de referência, com cache em processo.
 *
 * A lista muda por migração, nunca em tempo de execução, e é servida com
 * `Cache-Control: public, max-age=86400`. Consultar quatro tabelas a cada
 * chamada de uma resposta que não muda por 24 h seria trabalho que só existe
 * para ser jogado fora — e esta é a rota que todo cadastro de pet e todo
 * registro de achado abre primeiro.
 *
 * O cache é invalidado por reinício, que é exatamente quando a migração que
 * mudou a lista entra. Não existe caminho de escrita que ele possa perder.
 */
import type { Db } from '../../../../shared/db/pool.js';
import type {
  DadosDeReferencia,
  ReferenceDataRepository,
} from '../../ports/reference-data-repository.js';

export function criarReferenceDataRepository(db: Db): ReferenceDataRepository {
  let emCache: DadosDeReferencia | undefined;

  return {
    async carregar(): Promise<DadosDeReferencia> {
      if (emCache !== undefined) return emCache;

      const [versao, especies, racas, cores, portes] = await Promise.all([
        db
          .selectFrom('ref_data_versions')
          .select('version')
          .where('is_current', '=', true)
          .executeTakeFirst(),
        db
          .selectFrom('ref_species')
          .select(['code', 'label'])
          .where('active', '=', true)
          .orderBy('sort_order')
          .execute(),
        db
          .selectFrom('ref_breeds')
          .select(['code', 'label', 'species_code'])
          .where('active', '=', true)
          .orderBy(['species_code', 'sort_order'])
          .execute(),
        db
          .selectFrom('ref_colors')
          .select(['code', 'label'])
          .where('active', '=', true)
          .orderBy('sort_order')
          .execute(),
        db
          .selectFrom('ref_sizes')
          .select(['code', 'label', 'weight_hint'])
          .where('active', '=', true)
          .orderBy('sort_order')
          .execute(),
      ]);

      if (versao === undefined) {
        // Verificação que não consegue verificar precisa reprovar. Sem versão
        // corrente a resposta seria uma lista sem identidade, e o critério 5 da
        // história ("a versão usada em cada registro fica gravada") passaria a
        // gravar vazio em todo pet cadastrado a partir daí.
        throw new Error(
          'Nenhuma versão corrente em `ref_data_versions`. A migração de dados ' +
            'de referência não rodou, ou duas versões foram marcadas e nenhuma sobrou.',
        );
      }

      emCache = {
        version: versao.version,
        species: especies,
        breeds: racas.map((linha) => ({
          code: linha.code,
          label: linha.label,
          species: linha.species_code,
        })),
        colors: cores,
        sizes: portes.map((linha) => ({
          code: linha.code,
          label: linha.label,
          weightHint: linha.weight_hint,
        })),
      };
      return emCache;
    },
  };
}
