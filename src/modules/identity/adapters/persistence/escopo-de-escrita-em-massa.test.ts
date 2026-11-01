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
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaInvalidacaoDeTokensPendentes,
  construtorDaRevogacaoEmMassa,
} from './kysely-identity-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_800_000_000_000 as Instant;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

const PREDICADO_DO_DONO = /"user_id"\s*=\s*\$(\d+)/;

function donoLigadoAoPredicado(compilada: Compilada): unknown {
  const achado = PREDICADO_DO_DONO.exec(compilada.sql);
  if (achado === null) return undefined;
  return compilada.parameters[Number(achado[1]) - 1];
}

function clausulaWhere(sqlCompilado: string): string {
  const inicio = sqlCompilado.indexOf(' where ');
  assert.notEqual(
    inicio,
    -1,
    `a instrução ficou SEM cláusula WHERE e atinge a tabela inteira: ${sqlCompilado}`,
  );
  const resto = sqlCompilado.slice(inicio + ' where '.length);
  const returning = resto.indexOf(' returning ');
  return (returning === -1 ? resto : resto.slice(0, returning)).trim();
}

interface EscopoEsperado {
  readonly tabela: string;
  readonly where: string;
  readonly parametros: readonly unknown[];
}

function conferirEscopo(compilada: Compilada, esperado: EscopoEsperado): void {
  assert.ok(
    compilada.sql.startsWith(`update "${esperado.tabela}" set `),
    `a instrução deixou de ser um UPDATE em "${esperado.tabela}". ` +
      `Um DELETE com o mesmo WHERE é outro raio de alcance. SQL: ${compilada.sql}`,
  );
  assert.equal(
    clausulaWhere(compilada.sql),
    esperado.where,
    'a cláusula WHERE desta escrita em massa mudou. Ela é o ÚNICO limite de quantas ' +
      'linhas a instrução atinge: qualquer termo a mais, a menos, ou ligado por `or`, ' +
      'muda quem é afetado. Se o alargamento é intencional, escreva-o aqui e explique ' +
      `no PR. SQL compilado: ${compilada.sql}`,
  );
  assert.deepEqual(
    [...compilada.parameters],
    [...esperado.parametros],
    `algum valor ligado mudou de posição ou de conteúdo. SQL: ${compilada.sql}`,
  );
}

void describe('a revogação em massa de famílias de refresh para na conta', () => {
  void it('o WHERE inteiro é o escopo da conta mais a idempotência', () => {
    const compilada = construtorDaRevogacaoEmMassa(
      semBanco,
      DONO,
      'logout_all',
      AGORA,
    ).compile();

    conferirEscopo(compilada, {
      tabela: 'refresh_tokens',
      where: '"user_id" = $3 and "revoked_at" is null',
      parametros: [new Date(AGORA), 'logout_all', DONO],
    });
  });

  void it('o dono ligado à posição do predicado é o dono, e não outro parâmetro', () => {
    const compilada = construtorDaRevogacaoEmMassa(
      semBanco,
      DONO,
      'password_changed',
      AGORA,
    ).compile();

    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      `a posição $n do predicado do dono carrega outro valor. SQL: ${compilada.sql}`,
    );
  });

  void it('ela devolve as linhas atingidas: a contagem da trilha sai do RETURNING', () => {
    const { sql } = construtorDaRevogacaoEmMassa(semBanco, DONO, 'logout_all', AGORA).compile();
    assert.match(sql, /returning "id"$/, `o RETURNING saiu da instrução: ${sql}`);
  });
});

void describe('a invalidação de tokens pendentes para na conta', () => {
  void it('o WHERE inteiro é o escopo da conta mais a idempotência', () => {
    const compilada = construtorDaInvalidacaoDeTokensPendentes(semBanco, DONO, AGORA).compile();

    conferirEscopo(compilada, {
      tabela: 'verification_tokens',
      where: '"user_id" = $2 and "consumed_at" is null',
      parametros: [new Date(AGORA), DONO],
    });
  });

  void it('o dono ligado à posição do predicado é o dono, e não a data', () => {
    const compilada = construtorDaInvalidacaoDeTokensPendentes(semBanco, DONO, AGORA).compile();

    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      `a posição $n do predicado do dono carrega outro valor. SQL: ${compilada.sql}`,
    );
  });

  void it('ela não filtra por `purpose`: a troca de senha queima TODO link pendente', () => {
    const { sql } = construtorDaInvalidacaoDeTokensPendentes(semBanco, DONO, AGORA).compile();
    assert.ok(
      !sql.includes('"purpose"'),
      `a invalidação ganhou um filtro de propósito e deixa link pendente vivo: ${sql}`,
    );
  });
});

void describe('ISCA: a conferência de escopo REPROVA as escritas largas demais', () => {
  const CERTA = {
    tabela: 'refresh_tokens',
    where: '"user_id" = $3 and "revoked_at" is null',
    parametros: [new Date(AGORA), 'logout_all', DONO],
  } as const;

  function reprova(compilada: Compilada, esperado: EscopoEsperado = CERTA): void {
    assert.throws(
      () => {
        conferirEscopo(compilada, esperado);
      },
      assert.AssertionError,
      `a conferência APROVOU esta instrução: ${compilada.sql}`,
    );
  }

  void it('um UPDATE sem WHERE nenhum é acusado', () => {
    const semEscopo = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .compile();
    reprova(semEscopo);
  });

  void it('um UPDATE que perdeu só o `user_id` é acusado', () => {
    const semDono = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .where('revoked_at', 'is', null)
      .returning('id')
      .compile();
    reprova(semDono);
  });

  void it('a coluna certa com o operador errado é acusada', () => {
    const operadorErrado = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .where('user_id', 'is not', DONO)
      .where('revoked_at', 'is', null)
      .returning('id')
      .compile();
    reprova(operadorErrado);
  });

  void it('um DELETE com o mesmo WHERE é acusado', () => {
    const apagando = semBanco
      .deleteFrom('refresh_tokens')
      .where('user_id', '=', DONO)
      .where('revoked_at', 'is', null)
      .compile();
    reprova(apagando);
  });

  void it('um estreitamento silencioso também é acusado', () => {
    const estreita = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .where('user_id', '=', DONO)
      .where('revoked_at', 'is', null)
      .where('stay_signed_in', '=', true)
      .returning('id')
      .compile();
    reprova(estreita);
  });

  void it('a presença do predicado NÃO prova o alcance, e é por isso que este arquivo existe', () => {
    const alargada = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .where((eb) => eb.or([eb('user_id', '=', DONO), eb('user_id', 'is not', null)]))
      .where('revoked_at', 'is', null)
      .returning('id')
      .compile();

    assert.match(
      alargada.sql,
      PREDICADO_DO_DONO,
      'a isca precisa mesmo carregar o predicado, senão ela não prova nada',
    );
    assert.equal(
      donoLigadoAoPredicado(alargada),
      DONO,
      'a isca precisa mesmo ligar o DONO à posição do predicado: é essa a ' +
        'conferência da BICHUS-92 que ela tem de atravessar',
    );

    reprova(alargada, {
      tabela: 'refresh_tokens',
      where: '"user_id" = $2 and "revoked_at" is null',
      parametros: [new Date(AGORA), DONO],
    });
  });

  void it('a invalidação de tokens alargada com `or true` também é acusada', () => {
    const alargada = semBanco
      .updateTable('verification_tokens')
      .set({ consumed_at: new Date(AGORA) })
      .where((eb) => eb.or([eb('user_id', '=', DONO), eb('consumed_at', 'is', null)]))
      .compile();
    reprova(alargada, {
      tabela: 'verification_tokens',
      where: '"user_id" = $2 and "consumed_at" is null',
      parametros: [new Date(AGORA), DONO],
    });
  });
});
