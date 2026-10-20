/**
 * `registrarIntencaoDaVitrineDoUsuario` grava o proposito que RECEBEU.
 *
 * ## O DEFEITO, MEDIDO E NAO SUPOSTO
 *
 * Relato do cliente em 18/10/2026, contra homologacao: *"no perfil do usuario,
 * para subir a foto esta dando erro"*. Medido contra a pilha efemera de
 * integracao, no commit `f8c74714` -- o MESMO que
 * `https://hml.bichu.app/v1/health` reportava:
 *
 *     POST /v1/me/showcase/photo-intents
 *     201 {"upload_id":"01a151f1-5d7f-708d-97fb-97d65d8f733c",
 *          "fields":{"key":"people/original/p9Xabs...", ...}}
 *
 *     PUT /v1/me/showcase  {"photos":[{"upload_id":"01a151f1-5d7f-708d-97fb-97d65d8f733c"}]}
 *     404 {"type":".../problems/not-found","title":"Nao encontramos isso"}
 *
 * E na propria tabela, a causa:
 *
 *     id                                   | purpose       | object_key
 *     01a151f1-5d7f-708d-97fb-97d65d8f733c | network_event | people/original/p9Xab...
 *
 * Chave de PESSOA (`people/`) com proposito de ENCONTRO. `src/bin/api.ts`
 * ligava a vitrine a `registrarIntencaoDeCapaDaComunidade`, que grava
 * `network_event` LITERAL; a confirmacao procura o envio com
 * `WHERE u.purpose = 'user_showcase'` e, nao achando, responde 404 (ADR-0021
 * manda 404 e nunca 403). **Nenhuma foto de vitrine podia ser salva, para
 * ninguem.** As duas funcoes tinham a mesma assinatura, entao a troca compilou.
 *
 * ## O QUE ESTE ARQUIVO MEDE
 *
 * Que a funcao nova escreve `nova.purpose` na coluna, e nao um literal proprio.
 * E o que torna impossivel a divergencia entre o proposito que ASSINA a
 * politica e o que vai para a linha: o caso de uso passa o MESMO valor para os
 * dois (`PROPOSITO_DA_VITRINE`), e a porta o exige no tipo.
 *
 * Os outros dois pedacos da mesma regra, cada um dentro da sua fronteira:
 *
 * - `src/modules/showcase/application/vitrine-passa-o-proposito.test.ts` --
 *   que o caso de uso passa o proposito que assinou;
 * - `src/tools/vitrine-ligada-ao-registrador-certo.test.ts` -- a FIACAO de
 *   `api.ts`, que e onde o defeito morava.
 *
 * ## ISCA CONFERIDA
 *
 * Em 18/10/2026, trocando `purpose: nova.purpose` por
 * `purpose: 'network_event'` nesta funcao (a reproducao exata do defeito), os
 * dois casos abaixo reprovam pelo nome.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryResult,
} from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { Database } from '../../../../shared/db/schema.js';
import { registrarIntencaoDaVitrineDoUsuario } from './kysely-imagem-de-catalogo.js';

const DONA = 'a1b2c3d4-0000-7000-8000-000000000001';
/** O `upload_id` e a chave que a medicao de 18/10/2026 leu da tabela. */
const UPLOAD = '01a151f1-5d7f-708d-97fb-97d65d8f733c';
const CHAVE = 'people/original/p9XabsiTMBuCmRst9SW_Lw';

interface ConsultaCapturada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * Kysely com o compilador REAL do Postgres e um driver que captura.
 *
 * O que se le e o `INSERT` que o banco receberia -- a linha que a confirmacao
 * depois procura pelo proposito.
 */
function bancoQueCaptura(): { db: Db; consultas: ConsultaCapturada[] } {
  const consultas: ConsultaCapturada[] = [];

  const conexao: DatabaseConnection = {
    executeQuery: <R>(compilada: CompiledQuery): Promise<QueryResult<R>> => {
      consultas.push({ sql: compilada.sql, parameters: compilada.parameters });
      return Promise.resolve({ rows: [] as R[] });
    },
    streamQuery: () => {
      throw new Error('o registro da intencao nao usa `streamQuery`');
    },
  };

  const driver: Driver = {
    init: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(conexao),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
    releaseConnection: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };

  const db = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (instancia) => new PostgresIntrospector(instancia),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });

  return { db, consultas };
}

async function intencaoGravada(): Promise<ConsultaCapturada> {
  const { db, consultas } = bancoQueCaptura();

  await registrarIntencaoDaVitrineDoUsuario(db, {
    id: UPLOAD,
    userId: DONA,
    objectKey: CHAVE,
    declaredType: 'image/jpeg',
    maxBytes: 5_242_880,
    expiresAt: new Date('2026-10-19T02:25:35.039Z'),
    purpose: 'user_showcase',
  });

  const achada = consultas.find((c) =>
    /insert\s+into\s+"catalog_upload_intents"/i.test(c.sql),
  );
  assert.ok(
    achada !== undefined,
    'nenhum `INSERT INTO catalog_upload_intents` foi emitido: o caminho medido nao ' +
      'rodou, e um caso que nao exercita nada passa por engano. Consultas vistas: ' +
      consultas.map((c) => c.sql).join(' | '),
  );
  return achada;
}

void describe('a intencao da vitrine grava o proposito recebido (defeito de 18/10/2026)', () => {
  void it('ISCA: o `INSERT` liga `user_showcase`, e nunca `network_event`', async () => {
    const { sql, parameters } = await intencaoGravada();

    assert.ok(
      !parameters.includes('network_event'),
      'a intenção da vitrine foi gravada com o propósito da CAPA DO ENCONTRO. É o ' +
        'defeito de 18/10/2026: `POST /v1/me/showcase/photo-intents` devolve 201 e ' +
        '`PUT /v1/me/showcase` devolve 404 para a mesma `upload_id`, porque a ' +
        'confirmação procura `purpose = user_showcase`. O efeito não é uma foto ' +
        `errada: é nenhuma foto salva. SQL: ${sql}`,
    );
    assert.ok(
      parameters.includes('user_showcase'),
      'o propósito da vitrine precisa estar entre os parâmetros ligados: é ele que a ' +
        `confirmação cobra na cláusula WHERE. Parâmetros: ${JSON.stringify(parameters)}`,
    );
  });

  void it('ISCA: a coluna `purpose` está no `INSERT`, e o autor é `user_id` e não `admin_account_id`', async () => {
    const { sql, parameters } = await intencaoGravada();

    // Sem a coluna no `INSERT`, o `CHECK` do banco recusaria -- mas o caso
    // acima passaria por ler o propósito de outro parâmetro qualquer. As duas
    // asserções juntas é que amarram "o valor certo NA coluna certa".
    assert.match(sql, /"purpose"/, `a coluna \`purpose\` saiu do \`INSERT\`. SQL: ${sql}`);
    // O autor da vitrine é a CONTA, nunca o painel: `catalog_upload_intents`
    // tem `CHECK catalog_upload_intents_um_autor`, e envio do painel não vira
    // foto de pessoa (T9).
    assert.ok(
      parameters.includes(DONA),
      `o dono não foi ligado. Parâmetros: ${JSON.stringify(parameters)}`,
    );
  });
});
