/**
 * A contagem de encontros novos (BICHUS-278), **sobre o construtor da propria
 * agenda**.
 *
 * ## `when: 'upcoming'`, e nao `'all'`
 *
 * E o default de `listNetworkEvents` no contrato, entao e o recorte com que a
 * agenda ABRE. Contar `all` poria no selo um encontro publicado hoje para uma
 * data que ja passou -- e a agenda nao o abriria. Selo que promete o que a
 * lista nao mostra e o defeito que esta frente inteira existe para nao cometer.
 *
 * ## O CANCELADO ainda visivel CONTA, e isso e deliberado
 *
 * `consultaBase` traz `publication_status IN ('published', 'cancelled')`,
 * porque o encontro cancelado continua na agenda ate o fim previsto, com o
 * rotulo de cancelado (ADR-0027 12.6). Ele conta porque ESTA na lista: um selo
 * que o ignorasse mandaria a pessoa para uma agenda com um item novo que o
 * numero negou.
 *
 * ## `published_at` e nao `created_at`
 *
 * Um encontro pode nascer em rascunho no painel e ser publicado depois; quem
 * entra na agenda e a publicacao. A coluna **nao precisa de `COALESCE`** aqui, e
 * a diferenca com `professionals` e medida: `network_events` tem
 * `CHECK (publication_status NOT IN ('published','cancelled') OR published_at IS
 * NOT NULL)` desde a `20260928000001`, entao toda linha visivel tem o instante.
 *
 * ## INDICE: nenhum novo, e a ausencia e medida e nao esquecimento
 *
 * `network_events` tem **um** indice: `network_events_slug_unico`. A propria
 * agenda varre a tabela hoje, e criar indice para o CONTADOR e nao para a LISTA
 * seria escolher o caminho menos percorrido. Medido em homologacao em
 * 20/10/2026: 44 encontros -- volume em que `Seq Scan` e a escolha certa do
 * planejador e um indice novo nao apareceria no plano.
 *
 * **O que eu NAO medi e o plano com massa de verdade**, e por isso nao afirmo
 * que o indice e desnecessario: afirmo que nao ha medicao que o justifique.
 * Inventar um por precaucao poria no repositorio um indice sem `EXPLAIN`, que e
 * o que a `20261019000003` existe para nao deixar acontecer de novo.
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
      // `sort` e exigido pelo tipo do recorte da agenda e nao afeta contagem.
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
