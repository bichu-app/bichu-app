/**
 * O que o worker le para emitir o aviso ao tutor do pet escaneado.
 *
 * ## A autorizacao esta na consulta, e nao num `if` depois
 *
 * Nao existe aqui "busque o aviso e depois descubra de quem e o pet": o dono
 * sai do mesmo `JOIN` que o nome do animal. **Nao ha parametro de dono porque
 * nao ha o que comparar** — quem recebe o aviso e, por construcao,
 * `pets.owner_user_id` da linha do aviso. Um tutor de outro pet nao tem como
 * aparecer no resultado nem se o id do trabalho vier trocado, e e esse arranjo
 * (e nao uma checagem) que sustenta o criterio "tutor de outro pet nao recebe
 * nada" (ADR-0021).
 *
 * ## O caso aberto entra por `LEFT JOIN`, e e aqui que `ref` nasce
 *
 * `lost_cases_um_aberto_por_pet` e UNIQUE em `(pet_id) WHERE status = 'open'`:
 * o `LEFT JOIN` por isso devolve zero ou uma linha, nunca duas, e nao precisa
 * de `ORDER BY` nem `LIMIT` para ser deterministico. Sem caso aberto, o aviso
 * sai com `tokenPublicoDoCaso = null` — e esse e o caso MAIS urgente, nao o
 * menos (o tutor ainda nao sabe de nada).
 *
 * ## O que esta consulta NAO seleciona
 *
 * Nada do achador: nem `finder_display_name`, nem `finder_email`, nem
 * `finder_identity_hash`, nem `notes`. O push e superficie publica e o produto
 * expoe o achador ao tutor dentro da conversa mediada, e so la. A colher nao
 * passa nem para o log.
 *
 * Nada de lugar: nem `found_point` (que o esquema tipado torna inselecionavel),
 * nem `found_neighborhood`, nem `found_city`. O escaneamento da plaquinha nao
 * resolve localizacao neste caminho, e um push nao leva endereco nem ponto.
 */
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
        // So aviso de plaquinha. O achado avulso tem caminho proprio
        // (`possivelCorrespondencia`) e nao e este aviso.
        .where('f.origin', '=', 'tag_scan')
        // Pet excluido nao gera aviso: o `ON DELETE CASCADE` do banco cuida da
        // exclusao dura, e `deleted_at` cobre a macia.
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
