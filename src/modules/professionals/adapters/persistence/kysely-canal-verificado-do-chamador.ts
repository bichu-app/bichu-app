/**
 * A leitura de apoio da sugestao do diretorio: a conta que chama tem canal de
 * contato VERIFICADO?
 */
import type { SqlBool } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { CanalDeContatoDoChamador } from '../../application/sugestao-do-diretorio.js';

export function criarCanalDeContatoDoChamador(db: Db): CanalDeContatoDoChamador {
  return {
    async temCanalVerificado(conta: UserId): Promise<boolean> {
      const linha = await db
        .selectFrom('users')
        .select('users.id')
        .where('users.id', '=', conta)
        .where('users.deleted_at', 'is', null)
        .where(canalDeContatoConfirmadoNoSql<SqlBool>('users'))
        .executeTakeFirst();
      return linha !== undefined;
    },
  };
}
