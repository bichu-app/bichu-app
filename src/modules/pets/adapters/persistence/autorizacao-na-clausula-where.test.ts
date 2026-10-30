/**
 * A autorização do cadastro do pet está na cláusula `WHERE`, e o SQL compilado
 * prova isso.
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
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';
import type { DadosDoPet } from '../../ports/pet-repository.js';
import {
  construtorDaAtualizacao,
  construtorDaContagemDoTutor,
  construtorDaExclusao,
  construtorDaLeituraDoDono,
  valoresDaAtualizacao,
} from './kysely-pet-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const QUANDO = 1_800_000_000_000 as Instant;

const DADOS: DadosDoPet = {
  name: 'Bichinho',
  species: 'dog',
  breedCode: null,
  breedFreeText: null,
  refDataVersion: null,
  size: 'M',
  primaryColorCode: null,
  secondaryColorCode: null,
  sex: null,
  neutered: null,
  birthDateApprox: null,
  distinctiveMarks: null,
  careNotes: null,
  careNotesRedactions: [],
  microchipNumber: null,
  sinpatinhasId: null,
};

/** Kysely sem banco: ele compila a consulta e não a executa. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/**
 * O predicado do dono, como o compilador do Postgres o escreve: `"owner_user_id" =
 * $n`, com ou sem o `"pets".` na frente.
 */
const PREDICADO_DO_DONO = /"owner_user_id"\s*=\s*\$(\d+)/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/** O valor REALMENTE ligado à posição que o predicado do dono ocupa. */
function donoLigadoAoPredicado(compilada: Compilada): unknown {
  const achado = PREDICADO_DO_DONO.exec(compilada.sql);
  assert.ok(
    achado !== null,
    `a consulta perdeu o predicado do dono. SQL compilado: ${compilada.sql}`,
  );
  return compilada.parameters[Number(achado[1]) - 1];
}

void describe('toda consulta de pet que responde a um tutor carrega o dono no WHERE', () => {
  void it('a leitura do dono tem o predicado do dono, com o dono ligado', () => {
    const compilada = construtorDaLeituraDoDono(semBanco, DONO).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DO_DONO,
      `a leitura do dono perdeu a única coisa que a autoriza. SQL compilado: ${compilada.sql}`,
    );
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'o predicado do dono existe e está ligado a outro valor: a consulta autoriza contra ' +
        'algo que não é a conta do token',
    );
  });

  void it('a leitura do dono é a base de buscar, listar e da releitura de criar', () => {
    const { sql } = construtorDaLeituraDoDono(semBanco, DONO)
      .where('pets.id', '=', PET)
      .compile();

    assert.match(sql, PREDICADO_DO_DONO, `SQL: ${sql}`);
    assert.match(sql, /"pets"\."id"\s*=\s*\$\d+/, `o pet saiu do WHERE. SQL: ${sql}`);
    assert.match(
      sql,
      /"pets"\."deleted_at"\s+is\s+null/,
      `pet excluído voltou a ser legível. SQL: ${sql}`,
    );
  });

  void it('a leitura do dono liga o dono a $3, e não a $1: DUAS subconsultas vem antes', () => {
    const compilada = construtorDaLeituraDoDono(semBanco, DONO).compile();

    assert.deepEqual(
      [...compilada.parameters],
      ['active', 'open', DONO],
      'a ordem dos parâmetros mudou; a leitura por posição continua certa, mas a tabela de ' +
        'prova do cabeçalho precisa ser refeita',
    );
  });

  void it('a contagem do tutor tem o dono ligado', () => {
    const compilada = construtorDaContagemDoTutor(semBanco, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'é a contagem que decide o teto de pets por conta. Sem o dono no WHERE ela conta os ' +
        'pets do mundo inteiro, e a primeira conta a criar um pet bateria no teto',
    );
  });

  void it('a atualização tem o dono ligado, atrás de dezessete valores do SET', () => {
    const compilada = construtorDaAtualizacao(
      semBanco,
      PET,
      DONO,
      valoresDaAtualizacao(DADOS, new Date(Number(QUANDO))),
    ).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DO_DONO,
      `o UPDATE da ficha perdeu o dono: qualquer conta edita qualquer pet. SQL: ${compilada.sql}`,
    );
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.match(compilada.sql, /"id"\s*=\s*\$\d+/, `o pet saiu do WHERE. SQL: ${compilada.sql}`);
    assert.match(
      compilada.sql,
      /"deleted_at"\s+is\s+null/,
      `pet excluído voltou a ser editável. SQL: ${compilada.sql}`,
    );
  });

  void it('a exclusão tem o dono ligado', () => {
    const compilada = construtorDaExclusao(semBanco, PET, DONO, QUANDO).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DO_DONO,
      `o UPDATE de exclusão perdeu o dono: qualquer conta apaga qualquer pet. SQL: ${compilada.sql}`,
    );
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.match(compilada.sql, /"id"\s*=\s*\$\d+/, `o pet saiu do WHERE. SQL: ${compilada.sql}`);
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o dono', () => {
  void it('um SELECT sem `owner_user_id` no WHERE é acusado pelo predicado', () => {
    const semDono = semBanco
      .selectFrom('pets')
      .select('id')
      .where('id', '=', PET)
      .where('deleted_at', 'is', null)
      .compile();

    assert.ok(
      !PREDICADO_DO_DONO.test(semDono.sql),
      'a conferência passou numa consulta que serve o pet de qualquer conta: ela parou de ' +
        'enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
    );
  });

  void it('um WHERE com a coluna certa e o operador errado também é acusado', () => {
    const operadorErrado = semBanco
      .selectFrom('pets')
      .select('id')
      .where('owner_user_id', 'is not', DONO)
      .compile();

    assert.ok(
      operadorErrado.sql.includes('"owner_user_id"'),
      'a isca precisa mesmo mencionar a coluna, senão ela não prova nada',
    );
    assert.ok(
      !PREDICADO_DO_DONO.test(operadorErrado.sql),
      `uma conferência que só procurasse o NOME aprovaria isto: ${operadorErrado.sql}`,
    );
  });

  void it('a coluna e o operador certos com o VALOR errado são acusados', () => {
    const valorErrado = semBanco
      .selectFrom('pets')
      .select('id')
      .where('id', '=', DONO as unknown as PetId)
      .where('owner_user_id', '=', PET as unknown as UserId)
      .compile();

    assert.ok(
      valorErrado.parameters.includes(DONO),
      'a isca precisa ter o dono entre os parâmetros, senão ela não prova o ponto',
    );
    assert.notEqual(
      donoLigadoAoPredicado(valorErrado),
      DONO,
      'uma conferência que só procurasse o dono na lista de parâmetros aprovaria esta ' +
        `consulta, que autoriza contra o id do pet: ${valorErrado.sql}`,
    );
  });

  void it('no UPDATE, o valor errado é acusado mesmo com o dono no SET', () => {
    const updateErrado = semBanco
      .updateTable('pets')
      .set({ name: DONO })
      .where('owner_user_id', '=', PET as unknown as UserId)
      .compile();

    assert.ok(
      updateErrado.parameters.includes(DONO),
      'a isca precisa ter o dono entre os parâmetros, senão ela não prova o ponto',
    );
    assert.notEqual(
      donoLigadoAoPredicado(updateErrado),
      DONO,
      `um UPDATE que grava o dono e autoriza contra o pet seria aprovado: ${updateErrado.sql}`,
    );
  });
});
