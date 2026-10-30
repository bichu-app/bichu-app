/**
 * A contagem de entradas novas do diretorio (BICHUS-278), **sobre o construtor da
 * propria listagem**.
 */
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type {
  ContagemDeEntradasNovas,
  RecorteDeEntradasNovas,
} from '../../ports/contagem-de-entradas-novas.js';
import { construtorDaListagem } from './kysely-directory-repository.js';

export function criarContagemDeEntradasNovas(db: Db): ContagemDeEntradasNovas {
  return {
    async contar(recorte: RecorteDeEntradasNovas): Promise<number> {
      let consulta = construtorDaListagem(db, {
        chamador: recorte.chamador,
        familia: undefined,
        agora: recorte.agora,
        sort: 'name',
        page: 1,
        limit: 1,
      });
      if (recorte.desde !== undefined) {
        const desde = comoData(recorte.desde);
        consulta = consulta.where(
          sql<boolean>`COALESCE(professionals.published_at, professionals.created_at) > ${desde}`,
        );
      }
      const linha = await consulta
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirst();
      return Number(linha?.total ?? 0);
    },
  };
}
