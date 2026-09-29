/**
 * A consulta da leitura pública do caso não lê dado do tutor, e o SQL compilado
 * prova isso.
 *
 * O teste HTTP (`adapters/http/leitura-publica-do-caso.test.ts`) prova que a
 * resposta não carrega o que não deve. Ele não enxerga esta camada: com dublê no
 * lugar da porta, uma consulta que passasse a juntar `users` e selecionar
 * `email` continuaria verde lá, e o dado estaria a um `...linha` de sair. Aqui se
 * lê a lista de colunas do SQL que o adaptador de fato compila, com o compilador
 * do Postgres e sem banco (mesmo instrumento de
 * `pets/adapters/persistence/autorizacao-na-clausula-where.test.ts`).
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
import type { UserId } from '../../../../shared/types/brands.js';
import { construtorDaLeituraPublicaDoCaso } from './kysely-leitura-publica-do-caso.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const TOKEN = 'k3J9-share-token-opaco-0001';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** O trecho entre `select` e o primeiro `from`: o que a consulta devolve. */
function listaDeSaida(sql: string): string {
  const achado = /^select\s+([\s\S]*?)\s+from\s+"lost_cases"/i.exec(sql);
  assert.ok(achado !== null, `não achei a lista de saída. SQL compilado: ${sql}`);
  return achado[1] ?? '';
}

/**
 * Colunas que não podem ser SAÍDA desta consulta. `owner_user_id` fica de fora
 * desta lista porque ele aparece, legitimamente, dentro da comparação que vira
 * `do_chamador`; o caso próprio abaixo cobra que ele só apareça assim.
 */
const SAIDAS_PROIBIDAS: readonly RegExp[] = [
  /"lost_cases"\."id"/,
  /"pets"\."id"/,
  /"pet_id"/,
  /"last_seen_point"/,
  /"last_seen_state"/,
  /"microchip_number"/,
  /"sinpatinhas_id"/,
  /"original_key"/,
  /"users"/,
  /"email/,
  /"phone/,
];

void describe('a leitura pública do caso não seleciona dado do tutor nem id interno', () => {
  for (const [rotulo, chamador] of [
    ['anônimo', undefined],
    ['autenticado', CHAMADOR],
  ] as const) {
    void it(`com chamador ${rotulo}, a lista de saída não tem coluna proibida`, () => {
      const { sql } = construtorDaLeituraPublicaDoCaso(semBanco, TOKEN, chamador).compile();
      const saida = listaDeSaida(sql);
      for (const proibida of SAIDAS_PROIBIDAS) {
        assert.doesNotMatch(saida, proibida, `coluna proibida na saída. SQL compilado: ${sql}`);
      }
    });

    void it(`com chamador ${rotulo}, a consulta não junta \`users\``, () => {
      const { sql } = construtorDaLeituraPublicaDoCaso(semBanco, TOKEN, chamador).compile();
      assert.doesNotMatch(sql, /"users"/, `SQL compilado: ${sql}`);
    });
  }

  void it('o dono só aparece como comparação com o chamador, e vira um booleano', () => {
    const compilada = construtorDaLeituraPublicaDoCaso(semBanco, TOKEN, CHAMADOR).compile();
    const saida = listaDeSaida(compilada.sql);
    const ocorrencias = saida.match(/"owner_user_id"/g) ?? [];
    assert.equal(ocorrencias.length, 1, `SQL compilado: ${compilada.sql}`);
    const comparacao = /"lost_cases"\."owner_user_id"\s*=\s*\$(\d+)\)?\s+as\s+"do_chamador"/.exec(saida);
    assert.ok(comparacao !== null, `o dono saiu da comparação. SQL compilado: ${compilada.sql}`);
    assert.equal(compilada.parameters[Number(comparacao[1]) - 1], CHAMADOR);
  });

  void it('com chamador anônimo, o dono nem aparece na consulta', () => {
    const { sql } = construtorDaLeituraPublicaDoCaso(semBanco, TOKEN, undefined).compile();
    assert.doesNotMatch(sql, /owner_user_id/, `SQL compilado: ${sql}`);
  });

  void it('o WHERE é o token, ligado ao token, e mais nada que restrinja por dono', () => {
    const compilada = construtorDaLeituraPublicaDoCaso(semBanco, TOKEN, CHAMADOR).compile();
    const where = /\swhere\s([\s\S]*)$/i.exec(compilada.sql)?.[1] ?? '';
    const predicado = /"lost_cases"\."share_token"\s*=\s*\$(\d+)/.exec(where);
    assert.ok(predicado !== null, `o token saiu do WHERE. SQL compilado: ${compilada.sql}`);
    assert.equal(compilada.parameters[Number(predicado[1]) - 1], TOKEN);
    assert.doesNotMatch(where, /owner_user_id/, `SQL compilado: ${compilada.sql}`);
  });
});
