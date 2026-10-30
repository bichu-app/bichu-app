/**
 * O conjunto `case_state=reunited` da listagem publica: os TRES predicados do
 * selo, e o conjunto de casos ABERTOS intacto.
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
import {
  DIAS_DO_SELO_DE_REENCONTRO,
  type RecorteDePerdidos,
} from '../../ports/listagem-publica-de-perdidos.js';
import {
  construtorDaListagemPublicaDePerdidos,
  inicioDaJanelaDoSelo,
} from './kysely-listagem-publica-de-perdidos.js';

/** O mesmo arranjo dos vizinhos: compila, nao executa. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** Instante fixo: a borda da janela nao sai do relogio da maquina. */
const AGORA = new Date('2026-10-20T13:00:00.000Z');

function recorte(ajustes: Partial<RecorteDePerdidos> = {}): RecorteDePerdidos {
  return { conjunto: 'padrao', pagina: 1, limite: 20, agora: AGORA, ...ajustes };
}

function compilado(ajustes: Partial<RecorteDePerdidos> = {}) {
  return construtorDaListagemPublicaDePerdidos(semBanco, recorte(ajustes)).compile();
}

/**
 * O `WHERE` compilado do conjunto de casos ABERTOS, como `origin/development`
 * (`fb3a0fba`) o escrevia ANTES desta mudanca.
 */
const ONDE_DO_CONJUNTO_ABERTO_ANTES =
  'where "lost_cases"."status" = $3 and "lost_cases"."share_to_public_list" = $4 ' +
  'and conta_habilitada(lost_cases.owner_user_id) and "pets"."deleted_at" is null ' +
  'and "pets"."status" not in ($5, $6)';

/** Os parametros do conjunto aberto, na ordem, como `origin/development` os ligava. */
const PARAMETROS_DO_CONJUNTO_ABERTO_ANTES: readonly unknown[] = [
  true,
  'ready',
  'open',
  true,
  'deceased',
  'archived',
];

function ondeDe(sql: string): string {
  const i = sql.indexOf('where ');
  assert.notEqual(i, -1, `o SQL compilado nao tem WHERE. SQL: ${sql}`);
  return sql.slice(i);
}

void describe('o recorte dos abertos nao derivou, e a uniao o carrega intacto', () => {
  void it('case_state=open devolve o recorte HISTORICO, identico ao de antes do selo', () => {
    const compilada = compilado({ conjunto: 'aberto' });

    assert.equal(
      ondeDe(compilada.sql),
      ONDE_DO_CONJUNTO_ABERTO_ANTES,
      'o `WHERE` de `case_state=open` mudou. Este e o recorte que a rota tinha ' +
        'antes do selo, e quem o pede agora o pede de proposito -- se ele tambem ' +
        'derivou, nao sobrou nenhum jeito de pedir a lista de antes.',
    );
    assert.deepEqual(
      [...compilada.parameters],
      [...PARAMETROS_DO_CONJUNTO_ABERTO_ANTES],
      'os parametros do conjunto aberto mudaram de valor ou de ordem',
    );
  });

  void it('o conjunto PADRAO carrega o predicado dos abertos INTACTO', () => {
    const { sql } = compilado();

    assert.match(
      sql,
      /where \("lost_cases"\."status" = \$(\d+) or \(/,
      'o predicado dos abertos nao abre a uniao, ou nao e mais uma igualdade ' +
        `simples sobre \`status\`. SQL: ${sql}`,
    );
    const posicao = /where \("lost_cases"\."status" = \$(\d+) or \(/.exec(sql)?.[1];
    assert.ok(posicao !== undefined);
    assert.equal(
      compilado().parameters[Number(posicao) - 1],
      'open',
      'o valor ligado ao lado esquerdo da uniao nao e `open`: o conjunto padrao ' +
        'deixou de incluir os casos abertos, e a lista pela qual a vizinhanca ' +
        'acha o animal que sumiu passou a responder outra coisa.',
    );
  });

  void it('o conjunto PADRAO e UNIAO, e nao intersecao', () => {
    const { sql } = compilado();

    assert.match(
      sql,
      /"lost_cases"\."status" = \$\d+ or \("lost_cases"\."status" = \$\d+ and/,
      'a uniao do conjunto padrao nao e um `OR`. Com `AND` ela devolve zero ' +
        `linhas e a pagina de pets abre VAZIA. SQL: ${sql}`,
    );
  });

  void it('o conjunto `aberto` nao olha `conversations` nem `closed_at`', () => {
    const { sql } = compilado({ conjunto: 'aberto' });

    assert.doesNotMatch(
      sql,
      /conversations/,
      `o recorte historico passou a avaliar o sinal da comunidade. SQL: ${sql}`,
    );
    assert.doesNotMatch(sql, /closed_at/, `SQL: ${sql}`);
  });

  void it('o conjunto PADRAO traz os TRES predicados do selo do lado direito', () => {
    const { sql } = compilado();

    assert.match(sql, /"lost_cases"\."status" = \$\d+ and "lost_cases"\."closed_at" >= \$\d+/, `SQL: ${sql}`);
    assert.match(
      sql,
      /exists \(select "conversations"\."id" from "conversations" where "conversations"\."case_id" = "lost_cases"\."id"\)/,
      `o sinal da comunidade saiu do lado direito da uniao. SQL: ${sql}`,
    );
  });
});

void describe('o conjunto do selo carrega os TRES predicados, e nenhum e opcional', () => {
  void it('o ramo do selo le SO o encerramento com reencontro', () => {
    const compilada = compilado({ conjunto: 'reencontrado' });

    assert.match(
      compilada.sql,
      /"lost_cases"\."status" = \$(\d+)/,
      `o predicado de estado saiu do ramo. SQL: ${compilada.sql}`,
    );
    const posicao = /"lost_cases"\."status" = \$(\d+)/.exec(compilada.sql)?.[1];
    assert.ok(posicao !== undefined);
    assert.equal(
      compilada.parameters[Number(posicao) - 1],
      'closed_reunited',
      'o estado ligado ao ramo do selo nao e `closed_reunited`. `closed_not_found` e a busca ' +
        'que nao acabou bem e `closed_false_alarm` e o caso que nunca existiu: publicar ' +
        'qualquer um dos dois seria contar uma historia que o tutor nao autorizou (Emenda 4 ' +
        `do ADR-0010). parametros: ${JSON.stringify([...compilada.parameters])}`,
    );
  });

  void it('a janela de 30 dias e predicado, e ela conta de closed_at', () => {
    const compilada = compilado({ conjunto: 'reencontrado' });

    assert.match(
      compilada.sql,
      /"lost_cases"\."closed_at" >= \$(\d+)/,
      'a janela saiu da consulta. Sem ela o selo fica na rua para sempre, e a Emenda 4 do ' +
        `ADR-0010 promete 30 dias. SQL: ${compilada.sql}`,
    );
    const posicao = /"lost_cases"\."closed_at" >= \$(\d+)/.exec(compilada.sql)?.[1];
    assert.ok(posicao !== undefined);
    assert.deepEqual(
      compilada.parameters[Number(posicao) - 1],
      inicioDaJanelaDoSelo(AGORA),
      'o instante ligado a janela nao e `agora - 30 dias` do relogio da APLICACAO. Um `now()` ' +
        'do banco aqui poria dois relogios na mesma decisao, e a decisao e se um animal ' +
        'aparece numa pagina publica.',
    );
    assert.equal(
      Number(AGORA) - Number(inicioDaJanelaDoSelo(AGORA)),
      DIAS_DO_SELO_DE_REENCONTRO * 24 * 60 * 60 * 1000,
      'a janela deixou de ter o tamanho que `DIAS_DO_SELO_DE_REENCONTRO` declara',
    );
  });

  void it('o sinal da comunidade e a CONVERSA ligada ao caso', () => {
    const { sql } = compilado({ conjunto: 'reencontrado' });

    assert.match(
      sql,
      /exists \(select "conversations"\."id" from "conversations" where "conversations"\."case_id" = "lost_cases"\."id"\)/,
      'o sinal da comunidade saiu da consulta. Sem ele o selo diz "encontrado pela ' +
        'comunidade" sobre um pet que o tutor achou sozinho, numa pagina publica, e passa a ' +
        'ser uma afirmacao que o proprio dono fabrica. A conversa e o sinal porque ela nasce ' +
        'de plaquinha lida que virou aviso (`scan_notice`) ou de achado confirmado pelo tutor ' +
        `(\`found_notice\`), e os dois exigem que o outro lado nao seja o tutor. SQL: ${sql}`,
    );
    assert.doesNotMatch(
      sql,
      /tag_scans/,
      'a consulta passou a ler `tag_scans`. Aquela tabela grava a leitura da pagina, sem ' +
        'conta, sem identidade e sem mensagem: ela conta o proprio tutor e o robo que ' +
        `pre-visualiza o link. SQL: ${sql}`,
    );
    assert.doesNotMatch(
      sql,
      /closure_channel|reunion_channel/,
      'a consulta passou a decidir por `reunion_channel`, que esta NULO em todo o dado ' +
        `(nenhuma tela o preenche, medido em 20/10/2026). SQL: ${sql}`,
    );
  });

  void it('o conjunto reencontrado NAO e o conjunto aberto', () => {
    const aberto = compilado({ conjunto: 'aberto' });
    const reencontrado = compilado({ conjunto: 'reencontrado' });

    assert.notEqual(
      ondeDe(aberto.sql),
      ondeDe(reencontrado.sql),
      'os dois conjuntos compilam o mesmo `WHERE`: o ramo nao esta sendo tomado, e ' +
        '`case_state=reunited` responde a lista de perdidos abertos com o selo ligado.',
    );
  });

  void it('os quatro predicados de publicacao continuam no ramo do selo', () => {
    const { sql } = compilado({ conjunto: 'reencontrado' });

    assert.match(sql, /"lost_cases"\."share_to_public_list" = \$\d+/, `SQL: ${sql}`);
    assert.match(sql, /conta_habilitada\(lost_cases\.owner_user_id\)/, `SQL: ${sql}`);
    assert.match(sql, /"pets"\."deleted_at" is null/, `SQL: ${sql}`);
    assert.match(sql, /"pets"\."status" not in \(\$\d+, \$\d+\)/, `SQL: ${sql}`);
  });

  void it('os filtros que ja existiam valem nos DOIS conjuntos', () => {
    const { sql } = compilado({ conjunto: 'reencontrado', cidade: 'Sao Paulo', especie: 'dog' });

    assert.match(
      sql,
      /texto_para_busca\(lost_cases\.last_seen_city\) = texto_para_busca\(\$\d+\)/,
      `a cidade deixou de recortar o conjunto do selo. SQL: ${sql}`,
    );
    assert.match(sql, /"pets"\."species_code" = \$\d+/, `SQL: ${sql}`);
  });
});

void describe('ISCA: a mesma conferencia REPROVA uma consulta sem os predicados do selo', () => {
  void it('um ramo que esqueceu a janela e acusado', () => {
    const semJanela = semBanco
      .selectFrom('lost_cases')
      .select('lost_cases.share_token')
      .where('lost_cases.status', '=', 'closed_reunited')
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('conversations')
            .whereRef('conversations.case_id', '=', 'lost_cases.id')
            .select('conversations.id'),
        ),
      )
      .compile();

    assert.doesNotMatch(
      semJanela.sql,
      /"lost_cases"\."closed_at" >= \$\d+/,
      `a conferencia da janela aprovou uma consulta sem janela. SQL: ${semJanela.sql}`,
    );
  });

  void it('um ramo que esqueceu o sinal da comunidade e acusado', () => {
    const semSinal = semBanco
      .selectFrom('lost_cases')
      .select('lost_cases.share_token')
      .where('lost_cases.status', '=', 'closed_reunited')
      .where('lost_cases.closed_at', '>=', inicioDaJanelaDoSelo(AGORA))
      .compile();

    assert.doesNotMatch(
      semSinal.sql,
      /exists \(select "conversations"/,
      `a conferencia do sinal aprovou uma consulta sem o EXISTS. SQL: ${semSinal.sql}`,
    );
  });

  void it('um `WHERE` com um predicado a MAIS no conjunto aberto e acusado pela igualdade', () => {
    const comUmAMais = semBanco
      .selectFrom('lost_cases')
      .select('lost_cases.share_token')
      .where('lost_cases.status', '=', 'open')
      .where('lost_cases.share_to_public_list', '=', true)
      .where('lost_cases.closed_at', 'is', null)
      .compile();

    assert.notEqual(
      ondeDe(comUmAMais.sql),
      ONDE_DO_CONJUNTO_ABERTO_ANTES,
      `a igualdade aprovou um WHERE diferente; ela nao mede nada. SQL: ${comUmAMais.sql}`,
    );
  });
});
