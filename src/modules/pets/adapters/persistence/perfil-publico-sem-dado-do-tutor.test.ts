/**
 * A consulta do perfil público não lê dado do tutor nem id interno, e filtra no
 * `WHERE`, e o SQL compilado prova as duas coisas.
 *
 * O teste HTTP (`adapters/http/perfil-publico.test.ts`) usa dublê no lugar da
 * porta e não enxerga esta camada. Mesmo instrumento de
 * `autorizacao-na-clausula-where.test.ts`: compilador do Postgres, sem banco.
 */
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
import { construtorDoPerfilPublico } from './kysely-perfil-publico.js';

const SLUG = 'thor-da-vila';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

function compilada(): { sql: string; parameters: readonly unknown[] } {
  return construtorDoPerfilPublico(semBanco, SLUG).compile();
}

/** O trecho entre o primeiro `select` e o `from "pets"` da consulta de fora. */
function listaDeSaida(sql: string): string {
  const achado = /^select\s+([\s\S]*?)\s+from\s+"pets"/i.exec(sql);
  assert.ok(achado !== null, `não achei a lista de saída. SQL compilado: ${sql}`);
  return achado[1] ?? '';
}

void describe('o perfil público não seleciona dado do tutor nem id interno', () => {
  void it('a lista de saída não tem id, dono, microchip nem contato', () => {
    const { sql } = compilada();
    const saida = listaDeSaida(sql);
    for (const proibida of [
      /"pets"\."id"\s+as/,
      /"owner_user_id"/,
      /"microchip_number"/,
      /"sinpatinhas_id"/,
      /"care_notes"/,
      /"original_key"/,
      /"email/,
      /"phone/,
    ]) {
      assert.doesNotMatch(saida, proibida, `coluna proibida na saída. SQL compilado: ${sql}`);
    }
  });

  void it('a consulta não junta `users`', () => {
    assert.doesNotMatch(compilada().sql, /"users"/);
  });
});

void describe('o perfil público filtra no WHERE', () => {
  void it('slug ligado ao slug, perfil ligado, pet não excluído e não indisponível', () => {
    const { sql, parameters } = compilada();
    const where = /\swhere\s(?![\s\S]*\swhere\s)([\s\S]*)$/i.exec(sql)?.[1] ?? '';
    const slug = /"pets"\."slug"\s*=\s*\$(\d+)/.exec(where);
    assert.ok(slug !== null, `o slug saiu do WHERE. SQL compilado: ${sql}`);
    assert.equal(parameters[Number(slug[1]) - 1], SLUG);

    const ligado = /"pets"\."public_profile_enabled"\s*=\s*\$(\d+)/.exec(where);
    assert.ok(ligado !== null, `perfil desligado voltou a ser legível. SQL compilado: ${sql}`);
    assert.equal(parameters[Number(ligado[1]) - 1], true);

    assert.match(where, /"pets"\."deleted_at"\s+is\s+null/, `pet excluído voltou. SQL: ${sql}`);
    const indisponivel = /"pets"\."status"\s+not in\s+\(\$(\d+),\s*\$(\d+)\)/.exec(where);
    assert.ok(indisponivel !== null, `pet falecido ou arquivado voltou. SQL: ${sql}`);
    assert.deepEqual(
      [parameters[Number(indisponivel[1]) - 1], parameters[Number(indisponivel[2]) - 1]].sort(),
      ['archived', 'deceased'],
    );
  });
});
