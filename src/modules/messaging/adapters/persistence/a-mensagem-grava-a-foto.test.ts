/**
 * O `INSERT` da mensagem LIGA a chave da foto, em vez de cravar um literal.
 *
 * ## Por que este arquivo existe, e a medição que o pediu
 *
 * A bancada do serviço (`application/conversation-service.test.ts`) confere o
 * `NovaMensagem` que o serviço **passa**, porque é o que o dublê do repositório
 * captura. Ela não vê a linha que o banco recebe.
 *
 * Isso foi medido, não suposto. Em 21/10/2026, com `photo_object_key` voltando a
 * ser `null` cravado em `construtorDaInsercaoDeMensagem`, a suíte inteira ficou
 * **3678 casos, 3678 passaram, 0 reprovaram** — inclusive os quatro casos que
 * têm "a foto chega na mensagem" no nome. Todos eles mediam o argumento, e o
 * argumento continuava certo: quem descartava a chave era o `INSERT`, uma camada
 * abaixo de onde eles olhavam.
 *
 * É a forma exata de "o dublê recusou" que este repositório já registra ter
 * pago duas vezes. A correção não é escrever mais casos de comportamento — eles
 * ficariam verdes igual —, é olhar o SQL.
 *
 * ## O que se confere, e por que não é o valor
 *
 * Que `photo_object_key` esteja na lista de colunas **e ligado a um parâmetro**,
 * com a chave entre os valores ligados. Um `null` cravado compila como `null`
 * literal no texto do SQL, sem parâmetro — e é essa diferença que o caso vê.
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
    // É este caso que a desativação precisa derrubar. Um `null` cravado compila
    // como literal e some da lista de parâmetros.
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
    // A conferência que pega a forma exata do defeito antigo
    // (`photo_object_key: null`): ali a coluna continua na lista e o valor
    // aparece como `null` no texto, sem `$n`.
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
    // O controle que impede o caso de cima de virar "a foto é obrigatória". Sem
    // ele, uma implementação que recusasse gravar mensagem sem foto passaria nos
    // três casos acima.
    const { sql, parameters } = construtorDaInsercaoDeMensagem(semBanco, mensagem()).compile();
    assert.match(sql, /"photo_object_key"/, `SQL: ${sql}`);
    assert.ok(
      parameters.includes(null),
      `a mensagem sem foto deixou de ligar o nulo. Parâmetros: ${JSON.stringify(parameters)}`,
    );
  });

  void it('CONTROLE: a mensagem de SISTEMA nunca carrega foto', () => {
    // Passa nos dois estados de toda isca desta frente: a espécie do sistema é o
    // terceiro argumento e não tem campo de foto, e isto confere que nenhum
    // caminho de foto apareceu nela por tabela.
    const { parameters } = construtorDaInsercaoDeMensagem(
      semBanco,
      mensagem({ senderRole: 'system', senderUserId: null }),
      'scan_notice',
    ).compile();
    assert.ok(!parameters.includes(CHAVE_HIGIENIZADA));
    assert.ok(parameters.includes('scan_notice'));
  });
});
