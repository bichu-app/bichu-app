/** A autorização das tags está na cláusula `WHERE`, e o SQL compilado prova isso. */
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
import type { PetId, TagId, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaBuscaParaReimpressao,
  construtorDaConferenciaDoPet,
  construtorDaListaDeTags,
  construtorDoContextoDoDono,
} from './kysely-tag-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const TAG = '018f3a2b-0000-7000-8000-0000000000dd' as TagId;
const CODE_HASH = new Uint8Array(32).fill(0x5e);

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

void describe('toda consulta de tag que responde a um tutor carrega o dono no WHERE', () => {
  void it('a busca para reimpressão do QR tem o predicado do dono, com o dono ligado', () => {
    const compilada = construtorDaBuscaParaReimpressao(semBanco, PET, TAG, DONO).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DO_DONO,
      'a rota marcada reveals_credential perdeu a única coisa que a autoriza. ' +
        `SQL compilado: ${compilada.sql}`,
    );
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'o predicado do dono existe e está ligado a outro valor: a consulta autoriza contra ' +
        'algo que não é a conta do token',
    );
  });

  void it('a busca para reimpressão amarra pet e tag no MESMO WHERE, sem `if` depois', () => {
    const { sql, parameters } = construtorDaBuscaParaReimpressao(
      semBanco,
      PET,
      TAG,
      DONO,
    ).compile();

    assert.match(sql, /"id"\s*=\s*\$\d+/, `a tag saiu do WHERE. SQL: ${sql}`);
    assert.match(sql, /"pet_id"\s*=\s*\$\d+/, `o pet saiu do WHERE. SQL: ${sql}`);
    assert.match(
      sql,
      /"deleted_at"\s+is\s+null/,
      `pet excluído voltou a reimprimir a plaquinha. SQL: ${sql}`,
    );
    assert.deepEqual(
      [...parameters],
      [TAG, PET, DONO],
      'os três predicados são irmãos no mesmo WHERE, na ordem em que o adaptador os escreve',
    );
  });

  void it('a busca para reimpressão NÃO filtra por `status`, e a ausência é deliberada', () => {
    const { sql } = construtorDaBuscaParaReimpressao(semBanco, PET, TAG, DONO).compile();

    assert.ok(
      !/"status"\s*=\s*\$\d+/.test(sql),
      `a reimpressão ganhou um filtro de status e o 410 da tag revogada virou 404. SQL: ${sql}`,
    );
  });

  void it('o contexto do dono tem o resumo do código e o dono no mesmo WHERE', () => {
    const compilada = construtorDoContextoDoDono(semBanco, CODE_HASH, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.match(
      compilada.sql,
      /"code_hash"\s*=\s*\$\d+/,
      `o resumo do código saiu do WHERE. SQL: ${compilada.sql}`,
    );
  });

  void it('a conferência do pet — de listar e de emitir — tem o dono ligado', () => {
    const compilada = construtorDaConferenciaDoPet(semBanco, PET, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'é a consulta que impede emitir e listar plaquinha de pet alheio a partir de um id ' +
        'adivinhado, e ela é a mesma nos dois caminhos',
    );
  });

  void it('a lista de tags do pet tem o dono ligado', () => {
    const compilada = construtorDaListaDeTags(semBanco, PET, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o dono', () => {
  void it('um SELECT sem `owner_user_id` no WHERE é acusado pelo predicado', () => {
    const semDono = semBanco
      .selectFrom('pet_tags')
      .innerJoin('pets', 'pets.id', 'pet_tags.pet_id')
      .select(['pet_tags.status as status', 'pet_tags.code_ciphertext as code_ciphertext'])
      .where('pet_tags.id', '=', TAG)
      .where('pet_tags.pet_id', '=', PET)
      .compile();

    assert.ok(
      !PREDICADO_DO_DONO.test(semDono.sql),
      'a conferência passou numa consulta que serve o cifrado de qualquer tag: ela parou ' +
        'de enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
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
      .where('id', '=', DONO)
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
});
