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
import type {
  RecorteDaAgenda,
  RecorteDosMeusEncontros,
} from '../../ports/network-repository.js';
import {
  agendaOrdenada,
  construtorDaAgenda,
  construtorDosMeusEncontros,
  meusEncontrosOrdenados,
} from './kysely-network-repository.js';

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

function agenda(extra: Partial<RecorteDaAgenda> = {}): RecorteDaAgenda {
  return { when: 'upcoming', sort: 'proximos', agora: AGORA, page: 1, limit: 20, ...extra };
}

function meus(extra: Partial<RecorteDosMeusEncontros> = {}): RecorteDosMeusEncontros {
  return { chamador: CHAMADOR, agora: AGORA, page: 1, limit: 20, ...extra };
}

function ordemDe(sql: string): string {
  const i = sql.lastIndexOf('order by');
  assert.notEqual(
    i,
    -1,
    `a consulta compilou SEM \`order by\` -- este arquivo mede ordem, e sem ela ` +
      `todo caso abaixo ficaria verde por não ter o que ler. SQL: ${sql}`,
  );
  return sql.slice(i);
}

const CHAVE_DO_CANCELADO = /case when \(\s*"?e"?\."?publication_status"? = 'cancelled'[\s\S]*?coalesce/i;

void describe('o cancelado desce para depois do ativo nas duas listas', () => {
  void it('a agenda em `proximos` ordena pelo cancelado ANTES da data', () => {
    const ordem = ordemDe(agendaOrdenada(semBanco, agenda()).compile().sql);
    assert.match(
      ordem,
      CHAVE_DO_CANCELADO,
      'a ordem `proximos` perdeu a chave que desce o cancelado. Um encontro cancelado ' +
        'para amanhã volta a abrir a agenda na frente de um encontro ativo para depois ' +
        `de amanhã (decisão de 26/10/2026). ORDER BY: ${ordem}`,
    );
    const posCancelado = ordem.search(CHAVE_DO_CANCELADO);
    const posData = ordem.indexOf('starts_at');
    assert.ok(
      posCancelado < posData,
      'a chave do cancelado está DEPOIS de `starts_at` no `ORDER BY`, e nessa posição ' +
        `ela não reordena nada. ORDER BY: ${ordem}`,
    );
  });

  void it('o rótulo é CALCULADO: o fim previsto entra no predicado', () => {
    const ordem = ordemDe(agendaOrdenada(semBanco, agenda()).compile().sql);
    assert.match(
      ordem,
      /coalesce\(\s*"?e"?\."?ends_at"?/i,
      'a chave do cancelado parou de olhar o fim previsto. Sem ele, o rótulo da ordem ' +
        `deixa de ser o rótulo da resposta. ORDER BY: ${ordem}`,
    );
  });

  void it('a ordem `recentes` NÃO carrega a chave do cancelado', () => {
    const ordem = ordemDe(agendaOrdenada(semBanco, agenda({ sort: 'recentes' })).compile().sql);
    assert.doesNotMatch(
      ordem,
      CHAVE_DO_CANCELADO,
      `\`recentes\` ganhou uma chave que nunca muda de valor. ORDER BY: ${ordem}`,
    );
  });

  void it('`Meus eventos` testa o cancelado ANTES de "ainda não terminou"', () => {
    const ordem = ordemDe(meusEncontrosOrdenados(semBanco, meus()).compile().sql);
    const posCancelado = ordem.search(CHAVE_DO_CANCELADO);
    assert.notEqual(
      posCancelado,
      -1,
      `\`Meus eventos\` perdeu a chave do cancelado. ORDER BY: ${ordem}`,
    );
    const posNaoTerminou = ordem.search(/coalesce\(\s*"?e"?\."?ends_at"?,\s*"?e"?\."?starts_at"?/i);
    assert.notEqual(
      posNaoTerminou,
      -1,
      `\`Meus eventos\` perdeu a chave de "ainda não terminou". ORDER BY: ${ordem}`,
    );
    assert.ok(
      posCancelado < posNaoTerminou,
      'o `WHEN` do cancelado está DEPOIS do `WHEN` de "ainda não terminou", e nessa ' +
        'ordem o cancelado cai no grupo do ativo. É o defeito que esta entrega fecha. ' +
        `ORDER BY: ${ordem}`,
    );
  });

  void it('`Meus eventos` ordena em TRÊS grupos, e o passado é o último', () => {
    const ordem = ordemDe(meusEncontrosOrdenados(semBanco, meus()).compile().sql);
    for (const grupo of ['1', '0', '2']) {
      assert.match(
        ordem,
        new RegExp(`then ${grupo}\\b|else ${grupo}\\b`, 'i'),
        `o grupo \`${grupo}\` saiu da chave de agrupamento -- a ordem voltou a ter dois ` +
          `grupos. ORDER BY: ${ordem}`,
      );
    }
    assert.match(
      ordem,
      /"?e"?\."?starts_at"? desc/i,
      `o passado perdeu a ordem decrescente. ORDER BY: ${ordem}`,
    );
  });

  void it('`status` recorta a agenda pela situação calculada', () => {
    const compilada = construtorDaAgenda(semBanco, agenda({ status: 'cancelled' })).compile();
    assert.match(
      compilada.sql,
      /case[\s\S]*?then 'cancelled'[\s\S]*?then 'upcoming'/i,
      'o recorte por `status` não usa a situação calculada. Recortar por ' +
        '`publication_status` entregaria encontro cujo rótulo contradiz o filtro que o ' +
        `trouxe. SQL: ${compilada.sql}`,
    );
    assert.ok(
      compilada.parameters.includes('cancelled'),
      'o valor pedido não chegou como parâmetro ligado -- o recorte não vale. ' +
        `Parâmetros: ${JSON.stringify(compilada.parameters)}`,
    );
  });

  void it('`status` recorta `Meus eventos` pela MESMA expressão da agenda', () => {
    const naAgenda = construtorDaAgenda(semBanco, agenda({ status: 'ended' })).compile().sql;
    const nosMeus = construtorDosMeusEncontros(semBanco, meus({ status: 'ended' })).compile().sql;
    const caso = /\(case\s+when[\s\S]*?then 'cancelled'[\s\S]*?end\)/i;
    const daAgenda = naAgenda.match(caso);
    const dosMeus = nosMeus.match(caso);
    assert.ok(daAgenda !== null, `a agenda perdeu a expressão de situação. SQL: ${naAgenda}`);
    assert.ok(dosMeus !== null, `\`Meus eventos\` não recorta por situação. SQL: ${nosMeus}`);
    const semIndice = (sql: string): string => sql.replace(/\$\d+/g, '$N');
    assert.equal(
      semIndice(dosMeus[0]),
      semIndice(daAgenda[0]),
      'as duas listas calculam a situação de formas DIFERENTES. Elas têm de sair da ' +
        'mesma função, senão o mesmo encontro entra num recorte e sai do outro.',
    );
  });

  void it('CONTRAPESO -- sem `status` nada é recortado, e o cancelado continua na lista', () => {
    const semFiltro = construtorDaAgenda(semBanco, agenda()).compile();
    assert.doesNotMatch(
      semFiltro.sql,
      /then 'cancelled'[\s\S]*?then 'upcoming'[\s\S]*?end\) = \$/i,
      `uma agenda sem \`status\` ganhou recorte por situação. SQL: ${semFiltro.sql}`,
    );
    const semFiltroNosMeus = construtorDosMeusEncontros(semBanco, meus()).compile();
    assert.doesNotMatch(
      semFiltroNosMeus.sql,
      /then 'cancelled'/i,
      `\`Meus eventos\` sem \`status\` ganhou recorte por situação. SQL: ${semFiltroNosMeus.sql}`,
    );
  });
});
