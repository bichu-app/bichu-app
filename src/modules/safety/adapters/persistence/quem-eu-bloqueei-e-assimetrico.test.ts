/** **ISCA (a): A LISTA TRAZ QUEM EU BLOQUEEI, E NÃO TRAZ QUEM ME BLOQUEOU.** */
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
  construtorDaContagemDeQuemEuBloqueei,
  construtorDeQuemEuBloqueei,
} from './kysely-safety-repository.js';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const CHAMADOR = '11111111-1111-7111-8111-111111111111';

function sqlDaPagina(): string {
  return construtorDeQuemEuBloqueei(semBanco, CHAMADOR, 1, 20).sql;
}

void describe('ISCA (a): a lista e de quem EU bloqueei, e so dela', () => {
  void it('CONTRAPESO -- a consulta EXISTE e le `user_blocks` juntando a pessoa', () => {
    const sql = sqlDaPagina();
    assert.match(sql, /from "user_blocks" as "b"/, sql);
    assert.match(sql, /inner join "users" as "u" on "u"\."id" = "b"\."blocked_user_id"/, sql);
    assert.match(sql, /"u"\."public_ref"/, sql);
    assert.match(sql, /"b"\."created_at"/, sql);
  });

  void it('A IGUALDADE ESTA NO `WHERE`, e ela carrega quem chama como parametro', () => {
    const { sql, parameters } = construtorDeQuemEuBloqueei(semBanco, CHAMADOR, 1, 20);
    assert.match(sql, /where "b"\."blocker_user_id" = \$\d/, sql);
    assert.deepEqual(parameters, ['pessoa', CHAMADOR, CHAMADOR, 20, 0]);
    assert.deepEqual(
      construtorDeQuemEuBloqueei(semBanco, CHAMADOR, 3, 20).parameters,
      ['pessoa', CHAMADOR, CHAMADOR, 20, 40],
    );
  });

  void it('A OMISSAO QUE IMPORTA -- `bloqueio_entre` NAO aparece na consulta', () => {
    const sql = sqlDaPagina();
    assert.ok(
      !sql.includes('bloqueio_entre'),
      'a consulta passou a usar `bloqueio_entre`, que é SIMÉTRICA: a lista passaria a ' +
        'devolver também quem bloqueou quem chama, que é o oráculo "ela te bloqueou" — ' +
        `e descobrir que foi bloqueado é o que gera retaliação.\n${sql}`,
    );
    assert.ok(
      !/where[\s\S]*"b"\."blocked_user_id"\s*=\s*\$/.test(sql),
      `o \`WHERE\` passou a comparar \`blocked_user_id\` com quem chama: é a metade ` +
        `simétrica escrita à mão, e o dano é o mesmo.\n${sql}`,
    );
  });

  void it('ISCA POR DESLIGAMENTO -- a versao simetrica NAO passaria nos dois casos acima', () => {
    const simetrica = semBanco
      .selectFrom('user_blocks as b')
      .innerJoin('users as u', 'u.id', 'b.blocked_user_id')
      .select('u.public_ref as public_ref')
      .where((eb) =>
        eb.or([
          eb('b.blocker_user_id', '=', CHAMADOR),
          eb('b.blocked_user_id', '=', CHAMADOR),
        ]),
      )
      .compile().sql;
    assert.ok(
      /"b"\."blocked_user_id"\s*=\s*\$/.test(simetrica),
      'a isca precisa ser uma consulta simétrica de verdade, senão ela não mede nada',
    );
  });

  void it('a conta DESABILITADA nao vem, e e a decisao do cliente de 17/10', () => {
    const sql = sqlDaPagina();
    assert.match(sql, /conta_habilitada\(u\.id\)/, sql);
    assert.match(sql, /conta_habilitada\(\$\d::uuid\)/, sql);
  });

  void it('a ocultacao por denuncia NAO entra, e a divergencia e deliberada', () => {
    assert.ok(
      !sqlDaPagina().includes('perfil_ocultado_para_quem_denunciou'),
      'a linha de quem eu bloqueei E denunciei sumiu da lista: o bloqueio dela fica sem volta',
    );
  });

  void it('a ORDEM e fixa e tem desempate: pagina nao perde linha entre duas chamadas', () => {
    const sql = sqlDaPagina();
    assert.match(sql, /order by "b"\."created_at" desc, "u"\."public_ref" asc/, sql);
    assert.match(sql, /limit \$\d offset \$\d/, sql);
  });

  void it('NENHUMA COLUNA DE PET, DE ENDERECO NEM DE FOTO e selecionada', () => {
    const sql = sqlDaPagina();
    for (const proibida of [
      'photo_image_id',
      'photo_url',
      'pets',
      'city',
      'neighbourhood',
      'birth_date',
      'email',
      'phone',
      'user_showcase_images',
      'user_connections',
    ]) {
      assert.ok(!sql.includes(proibida), `\`${proibida}\` entrou na consulta da lista\n${sql}`);
    }
    assert.ok(!/select[\s\S]*"u"\."id" as/.test(sql), `\`users.id\` passou a ser projetado\n${sql}`);
  });

  void it('a CONTAGEM usa a MESMA clausula `WHERE` da pagina', () => {
    const contagem = construtorDaContagemDeQuemEuBloqueei(semBanco, CHAMADOR).sql;
    assert.match(contagem, /where "b"\."blocker_user_id" = \$1/, contagem);
    assert.match(contagem, /conta_habilitada\(u\.id\)/, contagem);
    assert.ok(!contagem.includes('bloqueio_entre'), contagem);
  });
});
