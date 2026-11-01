import type { DbExecutor } from '../../../../shared/db/pool.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { LeituraDoAvisoAoTutor } from '../../ports/aviso-ao-tutor.js';

export function criarLeituraDoAvisoAoTutor(db: DbExecutor): LeituraDoAvisoAoTutor {
  return {
    async avisoDoAchado(foundReportId) {
      const linha = await db
        .selectFrom('found_reports as f')
        .innerJoin('pets as p', 'p.id', 'f.pet_id')
        .leftJoin('lost_cases as c', (join) =>
          join.onRef('c.pet_id', '=', 'p.id').on('c.status', '=', 'open'),
        )
        .select([
          'p.owner_user_id as owner_user_id',
          'p.name as name',
          'c.share_token as share_token',
        ])
        .where('f.id', '=', foundReportId)
        .where('f.origin', '=', 'tag_scan')
        .where('p.deleted_at', 'is', null)
        .executeTakeFirst();

      if (linha === undefined) return null;
      return {
        donoUserId: linha.owner_user_id as UserId,
        nomeDoPet: linha.name,
        casoAberto: linha.share_token !== null,
        tokenPublicoDoCaso: linha.share_token,
      };
    },
  };
}
