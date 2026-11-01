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
import type { UserId } from '../../../../shared/types/brands.js';
import { construtorDaLeituraDoDono } from './kysely-pet-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const SUBCONSULTA_DO_CASO =
  /\(select\s+"lost_cases"\."id"\s+from\s+"lost_cases"\s+where\s+[^)]*\)\s+as\s+"open_case_id"/;

function sqlDaLeitura(): string {
  return construtorDaLeituraDoDono(semBanco, DONO).compile().sql;
}

void describe('a ficha do pet diz que ele está sendo procurado, porque ela LÊ o caso aberto', () => {
  void it('a leitura do dono traz o caso ABERTO do pet', () => {
    const sql = sqlDaLeitura();

    assert.match(
      sql,
      SUBCONSULTA_DO_CASO,
      'a ficha do pet voltou a não saber do caso aberto. `Encontrei meu pet` vive no ramo ' +
        `\`_jaProcurado\` da tela, e ele é o OU de \`status == lost\` com \`open_case_id != null\`; ` +
        `\`pets.status\` NÃO vira \`lost\` ao abrir um caso (cabeçalho de ` +
        `\`kysely-perfil-publico.ts\`), então sem este campo não sobra nenhum sinal e o botão de ` +
        `desmarcar não é desenhado para nenhum pet. SQL: ${sql}`,
    );
  });

  void it('o recorte da subconsulta é o estado ABERTO, e ele é o campo', () => {
    const compilada = construtorDaLeituraDoDono(semBanco, DONO).compile();

    assert.match(
      compilada.sql,
      /"lost_cases"\."status"\s*=\s*\$(\d+)/,
      `a subconsulta perdeu o recorte de estado. SQL: ${compilada.sql}`,
    );
    const posicao = /"lost_cases"\."status"\s*=\s*\$(\d+)/.exec(compilada.sql)?.[1];
    assert.ok(posicao !== undefined, 'a posição do parâmetro não foi lida de volta');
    assert.equal(
      compilada.parameters[Number(posicao) - 1],
      'open',
      'o estado ligado à subconsulta não é `open`. Com outro valor, `open_case_id` passa a ' +
        'apontar para caso encerrado, e a tela oferece `Encontrei meu pet` sobre um caso que ' +
        `já tem desfecho. parâmetros: ${JSON.stringify([...compilada.parameters])}`,
    );
  });

  void it('a subconsulta é CORRELACIONADA pelo pet da linha de fora', () => {
    const sql = sqlDaLeitura();

    assert.match(
      sql,
      /"lost_cases"\."pet_id"\s*=\s*"pets"\."id"/,
      'a subconsulta deixou de se correlacionar com a linha de fora. Sem isto ela devolve o ' +
        'caso aberto de QUALQUER pet — o de outro tutor inclusive — e a ficha anuncia perdido ' +
        `um animal que não está. SQL: ${sql}`,
    );
  });

  void it('o dono continua no WHERE da consulta de fora, com a subconsulta nova no meio', () => {
    const compilada = construtorDaLeituraDoDono(semBanco, DONO).compile();
    const achado = /"owner_user_id"\s*=\s*\$(\d+)/.exec(compilada.sql);

    assert.ok(achado !== null, `o predicado do dono saiu do WHERE. SQL: ${compilada.sql}`);
    assert.equal(
      compilada.parameters[Number(achado[1]) - 1],
      DONO,
      `a posição \`$${String(achado[1])}\` não carrega o dono. parâmetros: ` +
        JSON.stringify([...compilada.parameters]),
    );
  });
});

void describe('ISCA: a mesma conferência REPROVA uma leitura sem o caso aberto', () => {
  void it('a consulta de antes de 20/10 — sem a subconsulta — é acusada', () => {
    const comoEraAntes = semBanco
      .selectFrom('pets')
      .select((eb) => [
        'pets.id',
        'pets.status',
        eb
          .selectFrom('pet_tags')
          .whereRef('pet_tags.pet_id', '=', 'pets.id')
          .where('pet_tags.status', '=', 'active')
          .select(({ fn }) => fn.countAll().as('n'))
          .as('active_tag_count'),
      ])
      .where('pets.owner_user_id', '=', DONO)
      .compile();

    assert.doesNotMatch(
      comoEraAntes.sql,
      SUBCONSULTA_DO_CASO,
      'a conferência aprovou a consulta que PRODUZIU o defeito; ela não mede nada. SQL: ' +
        comoEraAntes.sql,
    );
  });

  void it('uma subconsulta a `lost_cases` SEM recorte de estado é acusada', () => {
    const semRecorte = semBanco
      .selectFrom('pets')
      .select((eb) => [
        'pets.id',
        eb
          .selectFrom('lost_cases')
          .whereRef('lost_cases.pet_id', '=', 'pets.id')
          .select('lost_cases.id')
          .as('open_case_id'),
      ])
      .where('pets.owner_user_id', '=', DONO)
      .compile();

    assert.match(
      semRecorte.sql,
      SUBCONSULTA_DO_CASO,
      `a isca precisa casar a FORMA para a próxima asserção medir algo. SQL: ${semRecorte.sql}`,
    );
    assert.doesNotMatch(
      semRecorte.sql,
      /"lost_cases"\."status"\s*=\s*\$(\d+)/,
      `a conferência de estado aprovou uma subconsulta sem recorte. SQL: ${semRecorte.sql}`,
    );
  });

  void it('uma subconsulta NÃO correlacionada é acusada', () => {
    const semCorrelacao = semBanco
      .selectFrom('pets')
      .select((eb) => [
        'pets.id',
        eb
          .selectFrom('lost_cases')
          .where('lost_cases.status', '=', 'open')
          .select('lost_cases.id')
          .as('open_case_id'),
      ])
      .where('pets.owner_user_id', '=', DONO)
      .compile();

    assert.doesNotMatch(
      semCorrelacao.sql,
      /"lost_cases"\."pet_id"\s*=\s*"pets"\."id"/,
      `a conferência aprovou uma subconsulta solta. SQL: ${semCorrelacao.sql}`,
    );
  });
});
