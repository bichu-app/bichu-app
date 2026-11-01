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
import type { ConversationId } from '../../../../shared/types/brands.js';
import {
  construtorDaFotoDoAchadorSemConta,
  construtorDaFotoDoLadoComConta,
} from './kysely-foto-da-conversa.js';

const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc' as ConversationId;
const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa';
const UPLOAD = '018f3a2b-0000-7000-8000-00000000f001';
const UPLOAD_REF = 'abcdefghijklmnopqrstuv';
const RESUMO = new Uint8Array(32).fill(7);

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const doLadoComConta = (): { sql: string; parameters: readonly unknown[] } =>
  construtorDaFotoDoLadoComConta(semBanco, CONVERSA, CHAMADOR, UPLOAD).compile();

const doAchador = (): { sql: string; parameters: readonly unknown[] } =>
  construtorDaFotoDoAchadorSemConta(semBanco, RESUMO, UPLOAD_REF).compile();

void describe('A INVARIANTE: a consulta traz `sanitized_key`, e NUNCA `object_key`', () => {
  void it('o lado com conta seleciona `sanitized_key`', () => {
    const { sql } = doLadoComConta();
    assert.match(
      sql,
      /"sanitized_key"/,
      `a consulta parou de trazer a chave higienizada. SQL: ${sql}`,
    );
  });

  void it('o lado com conta NÃO seleciona `object_key`', () => {
    const { sql } = doLadoComConta();
    assert.ok(
      !/"object_key"/.test(sql),
      'a consulta da foto passou a trazer a chave do ORIGINAL. O que ela seleciona ' +
        'vira `conversation_messages.photo_object_key`, e o original carrega o EXIF ' +
        `com a coordenada de GPS de quem achou o animal. SQL: ${sql}`,
    );
  });

  void it('o lado SEM conta seleciona `sanitized_key` e não `object_key`', () => {
    const { sql } = doAchador();
    assert.match(sql, /"sanitized_key"/, `SQL: ${sql}`);
    assert.ok(!/"object_key"/.test(sql), `SQL: ${sql}`);
  });

  void it('CONTROLE: a mesma conferência ACUSA uma consulta que traga o original', () => {
    const comOriginal = semBanco
      .selectFrom('upload_intents')
      .select(['upload_intents.object_key', 'upload_intents.sanitize_status'])
      .where('upload_intents.id', '=', UPLOAD)
      .compile();
    assert.ok(
      /"object_key"/.test(comOriginal.sql),
      'a conferência de ausência não enxerga a coluna do original nem quando ela ' +
        `está ali: ela não mede nada. SQL: ${comOriginal.sql}`,
    );
  });
});

void describe('o recorte por AVISO está no WHERE (ADR-0021)', () => {
  void it('o lado com conta correlaciona a intenção com o aviso DA CONVERSA', () => {
    const { sql } = doLadoComConta();
    assert.match(
      sql,
      /"conversations"\."found_report_id"\s*=\s*"upload_intents"\."found_report_id"/,
      `a correlação entre a intenção e o aviso da conversa sumiu. SQL: ${sql}`,
    );
  });

  void it('o lado com conta exige que a conversa seja de um dos DOIS lados', () => {
    const { sql, parameters } = doLadoComConta();
    assert.match(sql, /"conversations"\."tutor_user_id"\s*=\s*\$\d+/, `SQL: ${sql}`);
    assert.match(sql, /"conversations"\."finder_user_id"\s*=\s*\$\d+/, `SQL: ${sql}`);
    assert.ok(
      parameters.includes(CHAMADOR),
      `o chamador não está entre os parâmetros: ${JSON.stringify(parameters)}`,
    );
  });

  void it('o lado com conta filtra a conversa E a intenção, as duas no WHERE', () => {
    const { sql, parameters } = doLadoComConta();
    assert.match(sql, /"conversations"\."id"\s*=\s*\$\d+/, `SQL: ${sql}`);
    assert.match(sql, /"upload_intents"\."id"\s*=\s*\$\d+/, `SQL: ${sql}`);
    assert.ok(parameters.includes(CONVERSA));
    assert.ok(parameters.includes(UPLOAD));
  });

  void it('o lado SEM conta leva o RESUMO DO TOKEN no WHERE, e não um id', () => {
    const { sql, parameters } = doAchador();
    assert.match(
      sql,
      /"found_reports"\."finder_token_hash"\s*=\s*\$\d+/,
      `o resumo do token saiu do WHERE. SQL: ${sql}`,
    );
    assert.ok(
      parameters.some((p) => Buffer.isBuffer(p) && Buffer.from(RESUMO).equals(p)),
      `o resumo do token não está entre os parâmetros: ${JSON.stringify(parameters)}`,
    );
  });

  void it('o lado SEM conta correlaciona a intenção com o aviso do token', () => {
    const { sql } = doAchador();
    assert.match(
      sql,
      /"found_reports"\."id"\s*=\s*"upload_intents"\."found_report_id"/,
      `a correlação sumiu: a consulta passou a perguntar "esta referência existe E ` +
        `este token existe" em vez de "esta referência é do aviso DESTE token". ` +
        `SQL: ${sql}`,
    );
  });

  void it('as duas filtram pelas ESPÉCIES DO ACHADO, derivadas da constante', () => {
    for (const [onde, { sql, parameters }] of [
      ['lado com conta', doLadoComConta()],
      ['lado sem conta', doAchador()],
    ] as const) {
      assert.match(sql, /"kind" in \(/, `${onde}: o filtro de espécie sumiu. SQL: ${sql}`);
      assert.ok(
        parameters.includes('found_report_photo') && parameters.includes('finder_photo'),
        `${onde}: as duas espécies do achado não estão ligadas à consulta: ` +
          JSON.stringify(parameters),
      );
    }
  });
});
