/**
 * A contagem de encontros novos (BICHUS-278), **sobre o construtor da propria
 * agenda**.
 */
import type { Db } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type {
  ContagemDeEventosNovos,
  RecorteDeEventosNovos,
} from '../../ports/contagem-de-eventos-novos.js';
import { construtorDaAgenda } from './kysely-network-repository.js';

export function criarContagemDeEventosNovos(db: Db): ContagemDeEventosNovos {
  return {
    async contar(recorte: RecorteDeEventosNovos): Promise<number> {
      let consulta = construtorDaAgenda(db, {
        when: 'upcoming',
        sort: 'proximos',
        agora: recorte.agora,
        page: 1,
        limit: 1,
      });
      if (recorte.desde !== undefined) {
        consulta = consulta.where('e.published_at', '>', comoData(recorte.desde));
      }
      const linha = await consulta
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirst();
      return Number(linha?.total ?? 0);
    },
  };
}
