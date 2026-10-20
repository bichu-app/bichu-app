/**
 * A contagem de entradas novas do diretorio (BICHUS-278), **sobre o construtor
 * da propria listagem**.
 *
 * `construtorDaListagem` e *"o unico caminho de leitura do diretorio, e a
 * contagem e a pagina a chamam as duas"* -- esta escrito nele. Esta contagem e
 * a terceira a chamar, e pelo mesmo motivo: um predicado posto so aqui daria
 * selo maior que a lista.
 *
 * ## O `COALESCE` NAO E ZELO, e a medicao e o motivo
 *
 * `professionals.published_at` e ANULAVEL e **nao ha `CHECK` que o exija quando
 * `status = 'published'`** -- medido nas 80 migracoes: a `20260922000021` o
 * acrescenta sem restricao, e o `COMMENT` dela so DESCREVE a intencao (*"Nulo
 * enquanto status <> 'published'"*). `network_events` tem a restricao e por
 * isso a contagem de la nao precisa de `COALESCE`.
 *
 * Sem o `COALESCE`, uma entrada publicada com `published_at` nulo ficaria
 * **permanentemente invisivel ao contador**: aparece na lista, nunca no selo.
 * Seria o defeito calado -- nenhum teste reprova, nenhum portao olha, e a unica
 * forma de descobrir seria contar a mao. O precedente e do proprio repositorio:
 * a `20261001000005` faz `published_at = COALESCE(published_at, created_at)`
 * para os encontros.
 *
 * ## `sort: 'name'` e nao `'distance'`
 *
 * `distance` pede a localizacao de referencia do chamador e um `ORDER BY` por
 * distancia; contagem nao ordena, e a distancia custaria um calculo por linha
 * para um numero que nao depende dela.
 *
 * ## INDICE: nenhum novo -- a mesma medicao de `network_events`
 *
 * Os indices de `professionals` sao por lugar (GIST) e por atividade
 * (`kind, created_at DESC`); nenhum serve `COALESCE(published_at, created_at) >
 * $1`. Medido em homologacao em 20/10/2026: 31 entradas, volume em que o
 * `Seq Scan` e a escolha certa. Sem `EXPLAIN` em massa de verdade eu nao
 * afirmo que o indice e desnecessario -- afirmo que nao ha medicao que o
 * justifique, e indice sem `EXPLAIN` e o que a `20261019000003` existe para
 * nao deixar acontecer de novo.
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
