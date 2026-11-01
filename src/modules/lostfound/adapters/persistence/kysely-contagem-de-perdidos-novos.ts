import type { Db } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type {
  ContagemDePerdidosNovos,
  RecorteDePerdidosNovos,
} from '../../ports/contagem-de-perdidos-novos.js';
import { construtorDaListagemPublicaDePerdidos } from './kysely-listagem-publica-de-perdidos.js';

export function criarContagemDePerdidosNovos(db: Db): ContagemDePerdidosNovos {
  return {
    async contar(recorte: RecorteDePerdidosNovos): Promise<number> {
      let consulta = construtorDaListagemPublicaDePerdidos(db, {
        conjunto: 'aberto',
        agora: comoData(recorte.agora),
        pagina: 1,
        limite: 1,
        ...(recorte.cidade === undefined ? {} : { cidade: recorte.cidade }),
      });
      if (recorte.desde !== undefined) {
        consulta = consulta.where(
          'lost_cases.last_seen_at',
          '>',
          comoData(recorte.desde),
        );
      }
      const linha = await consulta
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirst();
      return Number(linha?.total ?? 0);
    },
  };
}
