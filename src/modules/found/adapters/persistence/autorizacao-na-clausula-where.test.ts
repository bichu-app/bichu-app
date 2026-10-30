/** A autorização está na cláusula `WHERE`, e o SQL compilado prova isso. */
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
import type { FoundReportId, Instant, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaContagemDeFotos,
  construtorDaLeitura,
  construtorDaLista,
  construtorDoEnriquecimento,
} from './kysely-found-report-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const ACHADO = '018f3a2b-0000-7000-8000-00000000f001' as FoundReportId;
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

/** O predicado do dono, com o número do parâmetro capturado. */
const PREDICADO_DO_DONO = /"reporter_user_id"\s*=\s*\$(\d+)/;

/** A REGRA DE AUTORIZAÇÃO DESTE MÓDULO, em uma frase: */
const COLUNA_DO_DONO = 'found_reports"."reporter_user_id';

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/** Confere que o predicado existe **e** que o valor ligado à posição dele é o dono. */
function exigirDonoNoWhere(
  compilada: Compilada,
  onde: string,
  predicado: RegExp = PREDICADO_DO_DONO,
): void {
  const casado = predicado.exec(compilada.sql);
  assert.ok(
    casado !== null,
    `${onde} perdeu o predicado do dono (ou trocou o operador). SQL compilado: ${compilada.sql}`,
  );
  const posicao = Number(casado[1]) - 1;
  assert.equal(
    compilada.parameters[posicao],
    DONO,
    `${onde}: o predicado do dono existe e está ligado a OUTRO valor — ` +
      `\`$${String(posicao + 1)}\` vale ${JSON.stringify(compilada.parameters[posicao])}, ` +
      `e não o dono. Parâmetros: ${JSON.stringify(compilada.parameters)}`,
  );
}

void describe('toda consulta que toca o achado de alguém carrega o dono no WHERE', () => {
  void it('a leitura de um achado, com o dono ligado à posição do predicado', () => {
    exigirDonoNoWhere(construtorDaLeitura(semBanco, ACHADO, DONO).compile(), 'a leitura');
  });

  void it('a leitura filtra o id JUNTO, e não depois', () => {
    const { sql, parameters } = construtorDaLeitura(semBanco, ACHADO, DONO).compile();
    assert.match(sql, /"id"\s*=\s*\$\d+/, `o id saiu do WHERE. SQL: ${sql}`);
    assert.ok(parameters.includes(ACHADO));
  });

  void it('a lista do relator', () => {
    exigirDonoNoWhere(construtorDaLista(semBanco, DONO, 20, null).compile(), 'a lista');
  });

  void it('a lista pede uma linha a mais que o limite, e ordena por criação decrescente', () => {
    const { sql, parameters } = construtorDaLista(semBanco, DONO, 20, null).compile();
    assert.match(sql, /order by "created_at" desc/i, `a ordem sumiu. SQL: ${sql}`);
    assert.ok(
      parameters.includes(21),
      'a lista parou de pedir a linha extra, e `next_cursor` passou a ser adivinhação',
    );
  });

  void it('o enriquecimento', () => {
    exigirDonoNoWhere(
      construtorDoEnriquecimento(semBanco, ACHADO, DONO, { observacao: 'oi' }, AGORA).compile(),
      'o enriquecimento',
    );
  });

  void it('o enriquecimento recusa o achado encerrado NO WHERE, e não num `if` antes', () => {
    const { sql } = construtorDoEnriquecimento(
      semBanco,
      ACHADO,
      DONO,
      { observacao: 'oi' },
      AGORA,
    ).compile();
    assert.match(
      sql,
      /"status"\s*(!=|<>)\s*\$\d+/,
      `o predicado de status saiu do WHERE. SQL: ${sql}`,
    );
  });

  void it('a contagem de fotos do aviso', () => {
    exigirDonoNoWhere(
      construtorDaContagemDeFotos(semBanco, ACHADO, DONO).compile(),
      'a contagem de fotos',
      /"found_reports"\."reporter_user_id"\s*=\s*\$(\d+)/,
    );
  });

  void it('nenhuma delas seleciona `found_point` cru', () => {
    for (const compilada of [
      construtorDaLeitura(semBanco, ACHADO, DONO).compile(),
      construtorDaLista(semBanco, DONO, 20, null).compile(),
    ]) {
      assert.ok(
        !/select[^]*"found_point"/i.test(compilada.sql),
        `a coluna geográfica entrou na lista de seleção crua. SQL: ${compilada.sql}`,
      );
      assert.match(compilada.sql, /photo_upload_id IS NOT NULL/);
    }
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o dono', () => {
  void it('um SELECT sem `reporter_user_id` no WHERE é acusado pelo predicado', () => {
    const semDono = semBanco
      .selectFrom('found_reports')
      .select(['id'])
      .where('id', '=', ACHADO)
      .compile();
    assert.ok(
      !PREDICADO_DO_DONO.test(semDono.sql),
      'a conferência passou numa consulta que não filtra por conta nenhuma: ela parou de ' +
        'enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
    );
  });

  void it('um WHERE com a coluna certa e o operador errado também é acusado', () => {
    const operadorErrado = semBanco
      .selectFrom('found_reports')
      .select(['id'])
      .where('reporter_user_id', 'is not', DONO)
      .compile();
    assert.ok(
      operadorErrado.sql.includes('"reporter_user_id"'),
      'a isca precisa mesmo mencionar a coluna, senão ela não prova nada',
    );
    assert.ok(
      !PREDICADO_DO_DONO.test(operadorErrado.sql),
      `uma conferência que só procura o NOME aprovaria isto: ${operadorErrado.sql}`,
    );
  });

  void it('ISCA DA BICHUS-237: troca de posições passa por `includes` e é acusada aqui', () => {
    const trocada = semBanco
      .selectFrom('found_reports')
      .select(['id'])
      .where('reporter_user_id', '=', ACHADO as unknown as UserId)
      .where('id', '=', DONO as unknown as FoundReportId)
      .compile();

    assert.ok(
      PREDICADO_DO_DONO.test(trocada.sql),
      'a isca precisa mesmo ter o predicado com a coluna e o operador certos',
    );
    assert.ok(
      trocada.parameters.includes(DONO),
      'a isca precisa mesmo ter o dono na lista de parâmetros, senão ela não é o furo',
    );

    assert.throws(
      () => exigirDonoNoWhere(trocada, 'a isca'),
      /ligado a OUTRO valor/,
      'a conferência posicional parou de enxergar a troca, e voltou a valer o que ' +
        '`parameters.includes` valia — que é aprovar coluna certa com valor errado',
    );
  });
});

void describe('ISCA: a coluna certa e a correlação entre tabelas', () => {
  void it('a contagem de fotos autoriza por `found_reports`, e NÃO por `upload_intents.user_id`', () => {
    const { sql } = construtorDaContagemDeFotos(semBanco, ACHADO, DONO).compile();
    assert.ok(
      sql.includes(`"${COLUNA_DO_DONO}"`),
      `a contagem trocou de coluna de autorização. SQL: ${sql}`,
    );
    assert.ok(
      !/"upload_intents"\."user_id"\s*=\s*\$/.test(sql),
      'a contagem voltou a autorizar por quem pediu a intenção, e não por quem é dono ' +
        `do aviso. SQL: ${sql}`,
    );
  });

  void it('a contagem correlaciona as duas tabelas, e sem isso ela pergunta OUTRA coisa', () => {
    const { sql } = construtorDaContagemDeFotos(semBanco, ACHADO, DONO).compile();
    assert.match(
      sql,
      /"found_reports"\."id"\s*=\s*"upload_intents"\."found_report_id"/,
      `a correlação entre as duas tabelas sumiu. SQL: ${sql}`,
    );
  });

  void it('a mesma conferência ACUSA a consulta sem correlação', () => {
    const semCorrelacao = semBanco
      .selectFrom('upload_intents')
      .innerJoin('found_reports', (join) => join.on('found_reports.id', '=', ACHADO))
      .select(({ fn }) => fn.countAll<number>().as('total'))
      .where('found_reports.reporter_user_id', '=', DONO)
      .compile();

    exigirDonoNoWhere(
      semCorrelacao,
      'a isca sem correlação',
      /"found_reports"\."reporter_user_id"\s*=\s*\$(\d+)/,
    );

    assert.ok(
      !/"found_reports"\."id"\s*=\s*"upload_intents"\."found_report_id"/.test(semCorrelacao.sql),
      'a conferência da correlação parou de enxergar o produto cartesiano, e os dois ' +
        `casos acima passaram a medir o silêncio dela. SQL: ${semCorrelacao.sql}`,
    );
  });
});
