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
