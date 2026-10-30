/** Leitura da politica de versao, por chave primaria. */
import type { Db } from '../../../../shared/db/pool.js';
import type {
  LeituraDaPoliticaDeVersao,
  PlataformaDoApp,
  PoliticaDeVersao,
} from '../../ports/politica-de-versao.js';

export function criarLeituraDaPoliticaDeVersao(db: Db): LeituraDaPoliticaDeVersao {
  return {
    async politicaDe(plataforma: PlataformaDoApp): Promise<PoliticaDeVersao | undefined> {
      const linha = await db
        .selectFrom('app_version_policy')
        .select(['minimum_version', 'recommended_version', 'store_url'])
        .where('platform', '=', plataforma)
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      return {
        minimumVersion: linha.minimum_version,
        recommendedVersion: linha.recommended_version,
        storeUrl: linha.store_url,
      };
    },
  };
}
