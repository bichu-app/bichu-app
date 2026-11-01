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
import {
  construtorDaBuscaDeFoto,
  construtorDaConferenciaDoPet,
  construtorDaExclusaoDeFoto,
  construtorDaIntencaoAberta,
  construtorDaListaDoPet,
} from './kysely-media-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const FOTO = '018f3a2b-0000-7000-8000-0000000000ee';
const INTENCAO = '018f3a2b-0000-7000-8000-0000000000ff';
const AGORA = 1_800_000_000_000 as Instant;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const PREDICADO_DO_DONO = /"owner_user_id"\s*=\s*\$(\d+)/;

const PREDICADO_DA_INTENCAO = /"user_id"\s*=\s*\$(\d+)/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

function valorLigadoAo(predicado: RegExp, compilada: Compilada): unknown {
  const achado = predicado.exec(compilada.sql);
  assert.ok(
    achado !== null,
    `a consulta perdeu o predicado ${String(predicado)}. SQL compilado: ${compilada.sql}`,
  );
  return compilada.parameters[Number(achado[1]) - 1];
}

const donoLigadoAoPredicado = (c: Compilada): unknown => valorLigadoAo(PREDICADO_DO_DONO, c);

void describe('toda consulta de mídia que responde a um tutor carrega o dono no WHERE', () => {
  void it('a conferência do pet tem o dono ligado', () => {
    const compilada = construtorDaConferenciaDoPet(semBanco, PET, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'é a consulta que impede enviar foto para o pet de outra pessoa a partir de um id ' +
        'adivinhado',
    );
    assert.match(
      compilada.sql,
      /"deleted_at"\s+is\s+null/,
      `pet excluído voltou a aceitar foto. SQL: ${compilada.sql}`,
    );
  });

  void it('a intenção de envio tem o dono ligado, e ele é `user_id`', () => {
    const compilada = construtorDaIntencaoAberta(semBanco, INTENCAO, DONO, AGORA).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DA_INTENCAO,
      `a intenção perdeu o dono: qualquer conta confirma o envio de qualquer outra. ` +
        `SQL: ${compilada.sql}`,
    );
    assert.equal(valorLigadoAo(PREDICADO_DA_INTENCAO, compilada), DONO);

    assert.match(compilada.sql, /"expires_at"\s*>\s*\$\d+/, `SQL: ${compilada.sql}`);
    assert.match(compilada.sql, /"confirmed_at"\s+is\s+null/, `SQL: ${compilada.sql}`);
  });

  void it('a lista de fotos do pet tem o dono ligado', () => {
    const compilada = construtorDaListaDoPet(semBanco, PET, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.match(
      compilada.sql,
      /"pet_photos"\."pet_id"\s*=\s*\$\d+/,
      `o pet saiu do WHERE. SQL: ${compilada.sql}`,
    );
  });

  void it('a busca de uma foto amarra foto, pet e dono no MESMO WHERE, sem `if` depois', () => {
    const compilada = construtorDaBuscaDeFoto(semBanco, PET, FOTO, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.deepEqual(
      [...compilada.parameters],
      [FOTO, PET, DONO],
      'os três predicados são irmãos no mesmo WHERE, na ordem em que o adaptador os escreve',
    );
  });

  void it('a exclusão da foto tem o dono ligado dentro de um `exists` CORRELACIONADO', () => {
    const compilada = construtorDaExclusaoDeFoto(semBanco, PET, FOTO, DONO, AGORA).compile();

    assert.match(
      compilada.sql,
      /exists\s*\(/,
      `o exists do dono sumiu. SQL: ${compilada.sql}`,
    );
    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);

    assert.match(
      compilada.sql,
      /"pets"\."id"\s*=\s*"pet_photos"\."pet_id"/,
      'o `exists` perdeu a correlação: ele passou a responder "esta conta tem algum pet?" ' +
        `em vez de "esta conta é dona DESTE pet?". SQL: ${compilada.sql}`,
    );
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o dono', () => {
  void it('um SELECT sem `owner_user_id` no WHERE é acusado pelo predicado', () => {
    const semDono = semBanco
      .selectFrom('pet_photos')
      .innerJoin('pets', 'pets.id', 'pet_photos.pet_id')
      .select('pet_photos.id')
      .where('pet_photos.id', '=', FOTO)
      .where('pet_photos.pet_id', '=', PET)
      .compile();

    assert.ok(
      !PREDICADO_DO_DONO.test(semDono.sql),
      'a conferência passou numa consulta que serve a foto de qualquer pet: ela parou de ' +
        'enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
    );
  });

  void it('as duas colunas de dono não se confundem', () => {
    const soDono = semBanco
      .selectFrom('pets')
      .select('id')
      .where('owner_user_id', '=', DONO)
      .compile();

    assert.match(soDono.sql, PREDICADO_DO_DONO);
    assert.ok(
      !PREDICADO_DA_INTENCAO.test(soDono.sql),
      `o predicado da intenção casou com a coluna do pet: ${soDono.sql}`,
    );

    const soIntencao = semBanco
      .selectFrom('upload_intents')
      .select('id')
      .where('user_id', '=', DONO)
      .compile();

    assert.match(soIntencao.sql, PREDICADO_DA_INTENCAO);
    assert.ok(
      !PREDICADO_DO_DONO.test(soIntencao.sql),
      `o predicado do pet casou com a coluna da intenção: ${soIntencao.sql}`,
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
      .selectFrom('pet_photos')
      .innerJoin('pets', 'pets.id', 'pet_photos.pet_id')
      .select('pet_photos.id')
      .where('pet_photos.id', '=', DONO)
      .where('pets.owner_user_id', '=', PET as unknown as UserId)
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

  void it('um `exists` SEM correlação é acusado, e o nome da coluna continua lá', () => {
    const semCorrelacao = semBanco
      .updateTable('pet_photos')
      .set({ is_primary: false })
      .where('id', '=', FOTO)
      .where((eb) =>
        eb.exists(eb.selectFrom('pets').select('pets.id').where('pets.owner_user_id', '=', DONO)),
      )
      .compile();

    assert.match(
      semCorrelacao.sql,
      PREDICADO_DO_DONO,
      'a isca precisa ter o predicado do dono presente e correto, senão ela não prova o ponto',
    );
    assert.equal(
      donoLigadoAoPredicado(semCorrelacao),
      DONO,
      'e ligado ao dono certo: é exatamente por isso que só a correlação acusa este caso',
    );
    assert.ok(
      !/"pets"\."id"\s*=\s*"pet_photos"\."pet_id"/.test(semCorrelacao.sql),
      `uma conferência que só cobrasse o predicado do dono aprovaria isto: ${semCorrelacao.sql}`,
    );
  });
});
