import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type { RecorteDaAgenda, RecorteNoTempo } from '../../ports/network-repository.js';
import { construtorDaAgenda, construtorDoLocal } from './kysely-network-repository.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa';
const AGORA = 1_800_000_000_000 as Instant;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const PREDICADO_DO_AUTOR = /encontro_com_autor_ativo\(\s*"?e"?\."?id"?\s*\)/;

const SEM_O_PREDICADO =
  'a consulta perdeu `encontro_com_autor_ativo(e.id)`. O encontro de quem desabilitou a ' +
  'conta volta a aparecer nesta superfície, e a decisão do cliente de 17/10 é "Sim, sai da ' +
  'agenda".';

function agenda(when: RecorteNoTempo): RecorteDaAgenda {
  return { when, sort: 'proximos', agora: AGORA, page: 1, limit: 20 };
}

void describe('o encontro de conta desabilitada sai de toda superfície da Rede', () => {
  void it('a agenda PÚBLICA carrega o predicado do autor', () => {
    const compilada = construtorDaAgenda(semBanco, agenda('upcoming')).compile();
    assert.match(compilada.sql, PREDICADO_DO_AUTOR, `${SEM_O_PREDICADO} SQL: ${compilada.sql}`);
  });

  void it('OS SEIS RECORTES carregam o predicado, `past` e `all` inclusive', () => {
    const recortes: readonly RecorteNoTempo[] = [
      'upcoming',
      'past',
      'all',
      'today',
      'weekend',
      'next_30_days',
    ];
    for (const when of recortes) {
      const compilada = construtorDaAgenda(semBanco, agenda(when)).compile();
      assert.match(
        compilada.sql,
        PREDICADO_DO_AUTOR,
        `recorte \`${when}\`: ${SEM_O_PREDICADO} SQL: ${compilada.sql}`,
      );
    }
  });

  void it('o LOCAL do encontro carrega o predicado', () => {
    const compilada = construtorDoLocal(semBanco, 'encontro-de-teste', CHAMADOR).compile();
    assert.match(compilada.sql, PREDICADO_DO_AUTOR, `${SEM_O_PREDICADO} SQL: ${compilada.sql}`);
  });

  void it('o predicado está na BASE, e por isso o filtro de visibilidade não o desloca', () => {
    const compilada = construtorDaAgenda(semBanco, {
      ...agenda('all'),
      visibility: 'private',
    }).compile();
    assert.match(compilada.sql, PREDICADO_DO_AUTOR, `${SEM_O_PREDICADO} SQL: ${compilada.sql}`);
  });

  void it('o predicado NÃO cita a coluna de autoria: ela nunca sai do servidor', () => {
    const compilada = construtorDaAgenda(semBanco, agenda('all')).compile();
    assert.doesNotMatch(
      compilada.sql,
      /created_by/,
      'a consulta passou a citar a coluna de autoria. Ela está marcada "NUNCA sai do ' +
        'servidor" e o predicado existe como FUNÇÃO de banco exatamente para não precisar ' +
        `dela aqui. SQL: ${compilada.sql}`,
    );
  });
});
