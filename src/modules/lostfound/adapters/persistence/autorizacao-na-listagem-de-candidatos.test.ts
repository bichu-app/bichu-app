/**
 * **A lista de candidatos carrega o TUTOR DO CASO no `WHERE`**, e o SQL compilado
 * prova.
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
import type { CaseId, UserId } from '../../../../shared/types/brands.js';
import { construtorDosCandidatosDoCaso } from './kysely-lost-case-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const CASO = '018f3a2b-0000-7000-8000-0000000000dd' as CaseId;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const PREDICADO_DO_DONO = /"lost_cases"\."owner_user_id"\s*=\s*\$(\d+)/;
const CORRELACAO_DO_CASO = /"lost_cases"\."id"\s*=\s*"match_candidates"\."case_id"/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * Confere que o predicado existe **e** que o valor ligado à posição dele é o
 * esperado.
 */
function exigirNaPosicao(
  compilada: Compilada,
  predicado: RegExp,
  esperado: unknown,
  onde: string,
): void {
  const casado = predicado.exec(compilada.sql);
  assert.ok(
    casado !== null,
    `${onde}: o predicado ${String(predicado)} sumiu (ou trocou de operador). SQL: ${compilada.sql}`,
  );
  const posicao = Number(casado[1]) - 1;
  assert.equal(
    compilada.parameters[posicao],
    esperado,
    `${onde}: o predicado existe e está ligado a OUTRO valor — ` +
      `\`$${String(posicao + 1)}\` vale ${JSON.stringify(compilada.parameters[posicao])}. ` +
      `Parâmetros: ${JSON.stringify(compilada.parameters)}`,
  );
}

function listagem(dono: UserId = DONO, depoisDe?: { score: number; id: string }) {
  return construtorDosCandidatosDoCaso(semBanco, CASO, dono, {
    limit: 20,
    depoisDe,
  }).compile();
}

void describe('a listagem de candidatos carrega o tutor do caso no WHERE', () => {
  void it('o dono do caso está no WHERE, ligado à posição do próprio predicado', () => {
    exigirNaPosicao(listagem(), PREDICADO_DO_DONO, DONO, 'a listagem');
  });

  void it('o dono viaja de verdade: trocar quem chama troca o parâmetro ligado', () => {
    exigirNaPosicao(listagem(OUTRO), PREDICADO_DO_DONO, OUTRO, 'a listagem de outro chamador');
  });

  void it('a correlação entre o candidato e o caso está escrita', () => {
    assert.match(listagem().sql, CORRELACAO_DO_CASO);
  });

  void it('o `caseId` é filtro A MAIS, nunca no lugar do dono', () => {
    const compilada = listagem();
    assert.match(compilada.sql, /"match_candidates"\."case_id"\s*=\s*\$\d+/);
    assert.ok(compilada.parameters.includes(CASO));
  });

  void it('NÃO filtra por status: os três estados do contrato saem', () => {
    assert.doesNotMatch(listagem().sql, /"match_candidates"\."status"\s*(=|<>|!=|in)/);
  });

  void it('ordena por score decrescente, com o id como desempate estável', () => {
    assert.match(
      listagem().sql,
      /order by[\s\S]*"match_candidates"\."score" desc[\s\S]*"match_candidates"\."id" desc/,
    );
  });

  void it('o cursor é uma comparação de TUPLA, e não dois `AND` escritos à mão', () => {
    const compilada = listagem(DONO, { score: 0.42, id: 'cand-1' });
    assert.match(
      compilada.sql,
      /\(match_candidates\.score,\s*match_candidates\.id\)\s*<\s*\(\$\d+,\s*\$\d+\)/,
    );
    assert.ok(compilada.parameters.includes(0.42));
    assert.ok(compilada.parameters.includes('cand-1'));
  });

  void it('pet excluído logicamente não aparece na lista', () => {
    assert.match(listagem().sql, /"pets"\."deleted_at" is null/);
  });

  void it('ISCA: a conferência REPROVA a mesma consulta sem o predicado do dono', () => {
    const semDono = semBanco
      .selectFrom('match_candidates')
      .innerJoin('lost_cases', (join) =>
        join.onRef('lost_cases.id', '=', 'match_candidates.case_id'),
      )
      .select(['match_candidates.id', 'match_candidates.status'])
      .where('match_candidates.case_id', '=', CASO)
      .compile();

    assert.throws(
      () => {
        exigirNaPosicao(semDono, PREDICADO_DO_DONO, DONO, 'a isca');
      },
      assert.AssertionError,
      'a isca passou: a conferência aprova uma listagem SEM autorização, ' +
        'então ela não está conferindo a autorização.',
    );
  });
});
