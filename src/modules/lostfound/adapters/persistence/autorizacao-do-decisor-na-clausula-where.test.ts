/** **Quem decide a correspondência é o tutor do caso**, e o SQL compilado prova. */
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
import type { CaseId, Instant, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaDecisaoDoCandidato,
  construtorDoCandidatoDecidido,
} from './kysely-lost-case-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const CASO = '018f3a2b-0000-7000-8000-0000000000dd' as CaseId;
const CANDIDATO = '018f3a2b-0000-7000-8000-0000000000ee';
const AGORA = 1_800_000_000_000 as Instant;

/** Kysely sem banco: ele compila a consulta e não a executa. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** **A REGRA DE AUTORIZAÇÃO DESTA OPERAÇÃO, em uma frase:** */
const PREDICADO_DO_DONO = /"lost_cases"\."owner_user_id"\s*=\s*\$(\d+)/;

/** A correlação. Sem ela o dono responde sobre o conjunto errado. */
const CORRELACAO_DO_CASO = /"lost_cases"\."id"\s*=\s*"match_candidates"\."case_id"/;

/** O que faz *"rejeitado não volta"* ser propriedade da escrita. */
const PREDICADO_DE_SUGERIDO = /"match_candidates"\."status"\s*=\s*\$(\d+)/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/** O SQL **até** o `RETURNING`. */
function apenasOWhere(compilada: Compilada): string {
  const corte = compilada.sql.indexOf(' returning ');
  return corte === -1 ? compilada.sql : compilada.sql.slice(0, corte);
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
  const casado = predicado.exec(apenasOWhere(compilada));
  assert.ok(
    casado !== null,
    `${onde}: o predicado ${String(predicado)} sumiu do WHERE (ou trocou de operador). ` +
      `SQL: ${compilada.sql}`,
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

function decisao(dono: UserId = DONO) {
  return construtorDaDecisaoDoCandidato(semBanco, {
    caso: CASO,
    candidato: CANDIDATO,
    dono,
    decisao: 'confirmed',
    agora: AGORA,
  }).compile();
}

void describe('a decisão do candidato carrega o TUTOR DO CASO no WHERE', () => {
  void it('o dono do caso está no WHERE, ligado à posição do próprio predicado', () => {
    exigirNaPosicao(decisao(), PREDICADO_DO_DONO, DONO, 'a decisão');
  });

  void it('o dono viaja de verdade: trocar quem chama troca o parâmetro ligado', () => {
    const outro = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
    exigirNaPosicao(decisao(outro), PREDICADO_DO_DONO, outro, 'a decisão de outro chamador');
  });

  void it('a correlação entre o candidato e o caso está escrita', () => {
    assert.match(apenasOWhere(decisao()), CORRELACAO_DO_CASO);
  });

  void it('o id do candidato e o do caso são filtro A MAIS, nunca no lugar do dono', () => {
    const compilada = decisao();
    const onde = apenasOWhere(compilada);
    assert.match(onde, /"match_candidates"\."id"\s*=\s*\$\d+/);
    assert.match(onde, /"match_candidates"\."case_id"\s*=\s*\$\d+/);
    assert.ok(compilada.parameters.includes(CANDIDATO));
    assert.ok(compilada.parameters.includes(CASO));
  });

  void it('só sai de `suggested`, e o predicado está no WHERE e não num `if` antes', () => {
    exigirNaPosicao(decisao(), PREDICADO_DE_SUGERIDO, 'suggested', 'a decisão');
  });

  void it('o caso precisa estar aberto, e o predicado é o de `lost_cases`', () => {
    exigirNaPosicao(
      decisao(),
      /"lost_cases"\."status"\s*=\s*\$(\d+)/,
      'open',
      'a decisão',
    );
  });

  void it('a escrita grava QUEM decidiu e QUANDO, que é o que o CHECK do banco cobra', () => {
    const { sql, parameters } = decisao();
    assert.match(sql, /set[^]*"decided_by_user_id"\s*=\s*\$\d+/);
    assert.match(sql, /set[^]*"decided_at"\s*=\s*\$\d+/);
    assert.ok(
      parameters.some((p) => p instanceof Date && p.getTime() === Number(AGORA)),
      `o instante da decisão não é o do relógio injetado. Parâmetros: ${JSON.stringify(parameters)}`,
    );
  });

  void it('a leitura do já decidido carrega o MESMO predicado do dono', () => {
    const compilada = construtorDoCandidatoDecidido(semBanco, CASO, CANDIDATO, DONO).compile();
    exigirNaPosicao(compilada, PREDICADO_DO_DONO, DONO, 'a leitura do já decidido');
    assert.match(compilada.sql, /"match_candidates"\."status"\s*(<>|!=)\s*\$\d+/);
  });
});

void describe('ISCA: a mesma conferência REPROVA a consulta sem o dono do caso', () => {
  void it('um UPDATE sem `owner_user_id` no WHERE é acusado', () => {
    const semDono = semBanco
      .updateTable('match_candidates')
      .set({ status: 'confirmed' })
      .where('match_candidates.id', '=', CANDIDATO)
      .compile();
    assert.ok(
      !PREDICADO_DO_DONO.test(apenasOWhere(semDono)),
      'a conferência aprovou uma escrita que não filtra por tutor nenhum: ela parou de ' +
        'enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
    );
  });

  void it('coluna certa com o VALOR ERRADO ligado passa por `includes` e é acusada aqui', () => {
    const trocada = semBanco
      .updateTable('match_candidates')
      .from('lost_cases')
      .set({ decided_by_user_id: DONO, status: 'confirmed' })
      .whereRef('lost_cases.id', '=', 'match_candidates.case_id')
      .where('lost_cases.owner_user_id', '=', CANDIDATO)
      .compile();

    assert.ok(PREDICADO_DO_DONO.test(apenasOWhere(trocada)));
    assert.ok(trocada.parameters.includes(DONO));

    assert.throws(
      () => exigirNaPosicao(trocada, PREDICADO_DO_DONO, DONO, 'a isca'),
      /ligado a OUTRO valor/,
      'a conferência posicional parou de enxergar a troca, e voltou a valer o que ' +
        '`parameters.includes` valia — que é aprovar coluna certa com valor errado',
    );
  });

  void it('a conferência da correlação ACUSA o produto cartesiano', () => {
    const semCorrelacao = semBanco
      .updateTable('match_candidates')
      .from('lost_cases')
      .set({ status: 'confirmed' })
      .where('match_candidates.id', '=', CANDIDATO)
      .where('lost_cases.owner_user_id', '=', DONO)
      .compile();

    exigirNaPosicao(semCorrelacao, PREDICADO_DO_DONO, DONO, 'a isca sem correlação');
    assert.ok(
      !CORRELACAO_DO_CASO.test(apenasOWhere(semCorrelacao)),
      'a conferência da correlação parou de enxergar o produto cartesiano, e o caso ' +
        `acima passou a medir o silêncio dela. SQL: ${semCorrelacao.sql}`,
    );
  });

  void it('a conferência de `suggested` ACUSA a escrita que desfaria uma rejeição', () => {
    const semGuarda = semBanco
      .updateTable('match_candidates')
      .from('lost_cases')
      .set({ status: 'confirmed' })
      .whereRef('lost_cases.id', '=', 'match_candidates.case_id')
      .where('match_candidates.id', '=', CANDIDATO)
      .where('lost_cases.owner_user_id', '=', DONO)
      .compile();

    exigirNaPosicao(semGuarda, PREDICADO_DO_DONO, DONO, 'a isca sem guarda de status');
    assert.ok(
      !PREDICADO_DE_SUGERIDO.test(apenasOWhere(semGuarda)),
      `"rejeitado não volta" deixou de ser conferível. SQL: ${semGuarda.sql}`,
    );
  });

  void it('ISCA DO `RETURNING`: procurar no SQL inteiro aprova a consulta sem o predicado', () => {
    const soNoReturning = semBanco
      .updateTable('match_candidates')
      .from('lost_cases')
      .set({ status: 'confirmed' })
      .whereRef('lost_cases.id', '=', 'match_candidates.case_id')
      .where('match_candidates.id', '=', CANDIDATO)
      .returning(['match_candidates.id', 'lost_cases.owner_user_id'])
      .compile();

    assert.ok(soNoReturning.sql.includes('"lost_cases"."owner_user_id"'));

    assert.throws(
      () => exigirNaPosicao(soNoReturning, PREDICADO_DO_DONO, DONO, 'a isca do returning'),
      /sumiu do WHERE/,
      'o corte em `RETURNING` deixou de funcionar, e a bancada voltou a aprovar uma ' +
        'escrita que decide o candidato de qualquer tutor',
    );
  });
});
