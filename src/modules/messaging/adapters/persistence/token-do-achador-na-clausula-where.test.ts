/**
 * O token do achador está na cláusula `WHERE`, como RESUMO, e o SQL compilado
 * prova (BICHUS-41).
 *
 * Mesmo instrumento de `autorizacao-na-clausula-where.test.ts`: compila com
 * `DummyDriver`, sem banco, lê o predicado e confere o valor ligado À POSIÇÃO
 * dele. `parameters.includes(resumo)` seria frouxo: numa consulta que liga dois
 * valores, aprovaria o resumo ligado à coluna errada.
 *
 * O que cada caso cobra:
 *
 * - toda consulta que responde ao achador filtra por `finder_token_hash`, e o
 *   valor ligado ali é o resumo (32 bytes), nunca o token;
 * - a de mensagens, a de bloqueio e a de leitura resolvem a conversa pela
 *   SUBCONSULTA do token, e não por um id que a aplicação leu antes;
 * - o bloqueio só escreve onde ainda não há bloqueio.
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
import type { Instant } from '../../../../shared/types/brands.js';
import {
  construtorDaLeituraDoAchador,
  construtorDasMensagensDoAchador,
  construtorDoBloqueioDoAchador,
} from './kysely-conversation-repository.js';

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

/** Cada `finder_token_hash = $n` do SQL, com o valor ligado àquela posição. */
function ligacoesDoToken(compilado: { sql: string; parameters: readonly unknown[] }): unknown[] {
  const padrao = /"?finder_token_hash"?\s*=\s*\$(\d+)/g;
  const valores: unknown[] = [];
  for (const casado of compilado.sql.matchAll(padrao)) {
    valores.push(compilado.parameters[Number(casado[1]) - 1]);
  }
  return valores;
}

function exigirResumoEmTodas(compilado: { sql: string; parameters: readonly unknown[] }, minimo: number): void {
  const ligados = ligacoesDoToken(compilado);
  assert.ok(
    ligados.length >= minimo,
    `esperava ao menos ${String(minimo)} predicado(s) de finder_token_hash e achei ${String(ligados.length)}:\n${compilado.sql}`,
  );
  for (const valor of ligados) {
    assert.ok(Buffer.isBuffer(valor), 'o valor ligado ao token não é o resumo em bytes');
    assert.ok(valor.equals(RESUMO), 'o valor ligado a finder_token_hash não é o resumo do token');
  }
  assert.ok(
    !compilado.parameters.some((p) => p === TOKEN),
    'o token em claro foi ligado à consulta',
  );
}

void describe('o resumo do token no WHERE de toda consulta do achador', () => {
  void it('a leitura da conversa: na junção do aviso dono do token e na subconsulta', () => {
    const compilado = construtorDaLeituraDoAchador(semBanco, RESUMO).compile();
    exigirResumoEmTodas(compilado, 2);
    assert.match(compilado.sql, /"conversations"\."id" = \(\s*SELECT c\.id/);
  });

  void it('as mensagens: a conversa sai da subconsulta do token, e não de um id', () => {
    const compilado = construtorDasMensagensDoAchador(semBanco, RESUMO, {
      limit: 20,
      deslocamento: 0,
    }).compile();
    exigirResumoEmTodas(compilado, 1);
    assert.match(compilado.sql, /"conversation_id" = \(\s*SELECT c\.id/);
  });

  void it('o bloqueio: pela subconsulta do token, e só onde ainda não há bloqueio', () => {
    const compilado = construtorDoBloqueioDoAchador(
      semBanco,
      RESUMO,
      Date.parse('2026-09-23T10:00:00Z') as Instant,
    ).compile();
    exigirResumoEmTodas(compilado, 1);
    assert.match(compilado.sql, /"blocked_at" is null/);
  });

  void it('a subconsulta só aceita aviso de plaquinha, e só agrupa pela mesma identidade', () => {
    const { sql } = construtorDaLeituraDoAchador(semBanco, RESUMO).compile();
    assert.match(sql, /proprio\.origin = 'tag_scan'/);
    assert.match(sql, /proprio\.finder_identity_hash IS NOT NULL/);
    assert.match(sql, /origem\.finder_identity_hash = proprio\.finder_identity_hash/);
    assert.match(sql, /origem\.tag_id = proprio\.tag_id/);
  });
});
