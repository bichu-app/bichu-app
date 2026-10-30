/**
 * **O bloqueio do lado COM CONTA carrega o chamador no `WHERE`**, e o papel sai do
 * SQL — não de quem chama.
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
import type { ConversationId, Instant, UserId } from '../../../../shared/types/brands.js';
import { construtorDoBloqueioDoChamador } from './kysely-conversation-repository.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc' as ConversationId;
const AGORA = 1_800_000_000_000 as Instant;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

function bloqueio(chamador: UserId = CHAMADOR) {
  return construtorDoBloqueioDoChamador(semBanco, CONVERSA, chamador, AGORA).compile();
}

/** O `CASE` que deriva o papel. */
const PAPEL_DERIVADO =
  /case when "tutor_user_id" = \$\d+ then 'tutor' else 'finder' end/i;

void describe('o bloqueio pelo chamador com conta', () => {
  void it('carrega o chamador no WHERE, nos dois lados possíveis', () => {
    const { sql, parameters } = bloqueio();
    assert.match(sql, /"tutor_user_id"\s*=\s*\$\d+/);
    assert.match(sql, /"finder_user_id"\s*=\s*\$\d+/);
    assert.ok(
      parameters.filter((p) => p === CHAMADOR).length >= 2,
      'o chamador precisa estar ligado aos DOIS predicados (tutor e finder), ' +
        `e os parâmetros são ${JSON.stringify(parameters)}`,
    );
  });

  void it('o chamador viaja de verdade: trocar quem chama troca o parâmetro', () => {
    assert.ok(bloqueio(OUTRO).parameters.includes(OUTRO));
    assert.ok(!bloqueio(OUTRO).parameters.includes(CHAMADOR));
  });

  void it('o id da conversa é filtro A MAIS, nunca no lugar do chamador', () => {
    const { sql, parameters } = bloqueio();
    assert.match(sql, /"id"\s*=\s*\$\d+/);
    assert.ok(parameters.includes(CONVERSA));
  });

  void it('`blocked_at IS NULL` preserva o PRIMEIRO bloqueio', () => {
    assert.match(bloqueio().sql, /"blocked_at" is null/);
  });

  void it('o papel é DERIVADO no SQL, e não recebido de quem chama', () => {
    assert.match(bloqueio().sql, PAPEL_DERIVADO);
    assert.ok(
      !bloqueio().parameters.includes('tutor') && !bloqueio().parameters.includes('finder'),
      'nenhum papel pode estar ligado como parâmetro: `blocked_by_role` diz à ' +
        'outra pessoa quem fechou a porta, e vindo de fora ele acusaria a vítima. ' +
        `Parâmetros: ${JSON.stringify(bloqueio().parameters)}`,
    );
  });

  void it('grava o instante do relógio injetado, e não o de parede', () => {
    assert.ok(
      bloqueio().parameters.some((p) => p instanceof Date && p.getTime() === Number(AGORA)),
      `o instante do bloqueio não é o do relógio injetado: ${JSON.stringify(bloqueio().parameters)}`,
    );
  });

  void it('ISCA: a conferência do papel REPROVA quando ele vem como parâmetro', () => {
    const comPapelDeFora = semBanco
      .updateTable('conversations')
      .set({ blocked_at: new Date(Number(AGORA)), blocked_by_role: 'tutor' })
      .where('id', '=', CONVERSA)
      .compile();

    assert.doesNotMatch(
      comPapelDeFora.sql,
      PAPEL_DERIVADO,
      'a isca passou: a expressão do `CASE` casa até numa escrita que recebe o ' +
        'papel de fora, então ela não prova a derivação.',
    );
    assert.ok(
      comPapelDeFora.parameters.includes('tutor'),
      'a isca não ligou o papel como parâmetro, então ela não é a isca que se ' +
        'pretendia e a conferência de cima continua sem prova negativa.',
    );
  });
});
