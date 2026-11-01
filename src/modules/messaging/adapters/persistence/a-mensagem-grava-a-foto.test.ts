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
import type { ConversationId, UserId } from '../../../../shared/types/brands.js';
import type { NovaMensagem } from '../../ports/conversation-repository.js';
import { construtorDaInsercaoDeMensagem } from './kysely-conversation-repository.js';

const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc' as ConversationId;
const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const CHAVE_HIGIENIZADA = 'found-reports/018f3a2b-0000-7000-8000-00000000f001/sanitized/abc.webp';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

function mensagem(ajustes: Partial<NovaMensagem> = {}): NovaMensagem {
  return {
    id: '018f3a2b-0000-7000-8000-00000000aa01',
    conversationId: CONVERSA,
    senderRole: 'tutor',
    senderUserId: TUTOR,
    body: 'Achei ela!',
    redactions: [],
    ...ajustes,
  };
}

void describe('o INSERT da mensagem grava a chave da foto', () => {
  void it('`photo_object_key` está na lista de colunas', () => {
    const { sql } = construtorDaInsercaoDeMensagem(
      semBanco,
      mensagem({ photoObjectKey: CHAVE_HIGIENIZADA }),
    ).compile();
    assert.match(
      sql,
      /"photo_object_key"/,
      `a coluna da foto saiu do INSERT. SQL: ${sql}`,
    );
  });

  void it('a CHAVE está entre os valores ligados — e não cravada', () => {
    const { parameters } = construtorDaInsercaoDeMensagem(
      semBanco,
      mensagem({ photoObjectKey: CHAVE_HIGIENIZADA }),
    ).compile();
    assert.ok(
      parameters.includes(CHAVE_HIGIENIZADA),
      'a chave da foto NÃO foi ligada ao INSERT: ela está sendo descartada pelo ' +
        `adaptador, e nenhuma bancada de comportamento enxerga isso. Parâmetros: ${JSON.stringify(parameters)}`,
    );
  });

  void it('`photo_object_key` é um PARÂMETRO, e não um literal no texto', () => {
    const { sql } = construtorDaInsercaoDeMensagem(
      semBanco,
      mensagem({ photoObjectKey: CHAVE_HIGIENIZADA }),
    ).compile();
    const colunas = /insert into "conversation_messages" \(([^)]+)\)/.exec(sql);
    assert.ok(colunas !== null, `não consegui ler a lista de colunas. SQL: ${sql}`);
    const posicao = (colunas[1] ?? '')
      .split(',')
      .map((c) => c.trim().replaceAll('"', ''))
      .indexOf('photo_object_key');
    assert.ok(posicao >= 0, `a coluna da foto não está na lista. SQL: ${sql}`);

    const valores = /values \(([^)]+)\)/.exec(sql);
    assert.ok(valores !== null, `não consegui ler a lista de valores. SQL: ${sql}`);
    const valor = (valores[1] ?? '').split(',')[posicao]?.trim();
    assert.match(
      valor ?? '',
      /^\$\d+$/,
      `a coluna da foto recebeu um LITERAL (${String(valor)}) e não um parâmetro. ` +
        'Alguém cravou o valor no adaptador, e a bancada do serviço não enxerga ' +
        `isso porque ela confere o argumento. SQL: ${sql}`,
    );
  });

  void it('CONTROLE: sem foto, a coluna continua na lista e o valor ligado é nulo', () => {
    const { sql, parameters } = construtorDaInsercaoDeMensagem(semBanco, mensagem()).compile();
    assert.match(sql, /"photo_object_key"/, `SQL: ${sql}`);
    assert.ok(
      parameters.includes(null),
      `a mensagem sem foto deixou de ligar o nulo. Parâmetros: ${JSON.stringify(parameters)}`,
    );
  });

  void it('CONTROLE: a mensagem de SISTEMA nunca carrega foto', () => {
    const { parameters } = construtorDaInsercaoDeMensagem(
      semBanco,
      mensagem({ senderRole: 'system', senderUserId: null }),
      'scan_notice',
    ).compile();
    assert.ok(!parameters.includes(CHAVE_HIGIENIZADA));
    assert.ok(parameters.includes('scan_notice'));
  });
});
