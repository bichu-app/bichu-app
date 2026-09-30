/**
 * O aviso do achador sem conta é alcançado pelo RESUMO do token, no `WHERE`
 * (BICHUS-41). Mesmo instrumento de `autorizacao-na-clausula-where.test.ts`:
 * SQL compilado com `DummyDriver`, valor conferido na posição do predicado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import {
  construtorDaContagemDeFotosDoAchador,
  construtorDaIntencaoPelaReferencia,
  construtorDoAvisoDoAchador,
  construtorDoEnriquecimentoDoAchador,
} from './kysely-found-report-repository.js';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const TOKEN = 'T'.repeat(43);
const RESUMO = createHash('sha256').update(TOKEN, 'utf8').digest();

function exigirResumo(compilado: { sql: string; parameters: readonly unknown[] }): void {
  const casado = /"finder_token_hash" = \$(\d+)/.exec(compilado.sql);
  assert.ok(casado !== null, `sem predicado de finder_token_hash:\n${compilado.sql}`);
  const valor = compilado.parameters[Number(casado[1]) - 1];
  assert.ok(Buffer.isBuffer(valor) && valor.equals(RESUMO), 'o valor ligado não é o resumo do token');
  assert.ok(!compilado.parameters.some((p) => p === TOKEN), 'o token em claro foi ligado à consulta');
}

void describe('o resumo do token no WHERE das consultas do aviso', () => {
  void it('a leitura do aviso, só de plaquinha, sem selecionar o ponto', () => {
    const compilado = construtorDoAvisoDoAchador(semBanco, RESUMO).compile();
    exigirResumo(compilado);
    assert.match(compilado.sql, /"origin" = \$\d+/);
    // O ponto não atravessa a aplicação: só o booleano calculado no banco.
    assert.doesNotMatch(compilado.sql, /select[^;]*"found_point"[,\s]/i);
    assert.match(compilado.sql, /found_point IS NOT NULL/);
  });

  void it('o enriquecimento, que não escreve em aviso encerrado', () => {
    const compilado = construtorDoEnriquecimentoDoAchador(semBanco, RESUMO, {
      nome: 'Ana',
    }).compile();
    exigirResumo(compilado);
    assert.match(compilado.sql, /"status" <> \$\d+/);
  });

  void it('a referência da foto só resolve para upload do aviso deste token', () => {
    const compilado = construtorDaIntencaoPelaReferencia(semBanco, RESUMO, 'r'.repeat(22)).compile();
    exigirResumo(compilado);
    assert.match(compilado.sql, /"upload_intents"\."upload_ref" = \$\d+/);
  });

  void it('a contagem do teto de três fotos, pelo aviso deste token', () => {
    exigirResumo(construtorDaContagemDeFotosDoAchador(semBanco, RESUMO).compile());
  });
});
