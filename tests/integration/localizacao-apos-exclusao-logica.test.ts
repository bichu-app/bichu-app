/**
 * BICHUS-88 — a conta logicamente excluída sai do alcance pela LINHA, e não
 * pela consulta de quem lê.
 *
 * ## O que este arquivo prova, e por que a forma importa
 *
 * A defesa que existia antes desta correção morava em
 * `kysely-alcance-por-postgis.ts`: aquela consulta junta `users` e exige
 * `u.deleted_at IS NULL`. Ela funciona, e continua no lugar. Mas ela é a defesa
 * de **uma** consulta, e a tabela `user_reference_locations` existe justamente
 * para ser consultada por raio — o segundo consumidor é questão de tempo.
 *
 * Por isso **nenhuma consulta deste arquivo junta `users` e nenhuma menciona
 * `deleted_at`**. As consultas daqui são, de propósito, a consulta distraída que
 * alguém vai escrever amanhã: `ST_DWithin` sobre `user_reference_locations`,
 * sozinha, do jeito que a tabela convida a ser usada. Se o gatilho da migração
 * `20260922000006` sair, some a linha que faz essas consultas devolverem zero, e
 * estes casos reprovam — sem que ninguém precise ter lembrado de nada.
 *
 * É essa a diferença entre o que já existia e o que está aqui: a prova antiga
 * mede o texto de uma consulta (`sete-criterios-na-consulta.test.ts`, caso
 * "BICHUS-88"), e ela vale só para aquela consulta. Esta mede o banco.
 *
 * ## Por que não pode ser unitário
 *
 * O objeto sob teste é um gatilho de Postgres disparando sobre um `UPDATE`, e a
 * consequência é medida com `ST_DWithin` sobre `geography`. Nada disso existe
 * fora do banco: um dublê em memória devolveria a lista que eu escrevesse nele.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas são apagadas no `after`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarLocalizacaoDeReferenciaRepository } from '../../src/modules/identity/adapters/persistence/kysely-localizacao-de-referencia.js';
import { localizacaoAGravar } from '../../src/modules/identity/domain/localizacao-de-referencia.js';
import {
  comoFamiliaDeSessao,
  type LocalizacaoDeReferenciaRepository,
} from '../../src/modules/identity/ports/localizacao-de-referencia-repository.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const RAIO_DO_ALERTA_EM_METROS = 5000;

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/** Avenida Paulista, 1578 — o mesmo centro da BICHUS-92. */
const PAULISTA = { lat: -23.5614, lon: -46.656 };

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: LocalizacaoDeReferenciaRepository;

/**
 * SEC-021: a sessão de aparelho que os casos "de uma pessoa só" usam.
 *
 * A localização passou a ser do aparelho, então toda chamada carrega a família
 * de refresh. Os casos deste arquivo que falam da COLUNA e da CONSULTA — o tipo
 * geográfico, a ordem `(lon, lat)`, o `ST_DWithin`, o `CASCADE` — continuam
 * falando de uma pessoa com um aparelho só, e amarrá-los todos à mesma família
 * é o que mantém cada um medindo o que ele foi escrito para medir. Os casos que
 * PRECISAM de dois aparelhos chamam `repo` direto, com as duas famílias à
 * vista: um atalho que escondesse a família ali reprovaria pelo motivo errado.
 */
const APARELHO_UNICO = comoFamiliaDeSessao('018f3a2b-0000-7000-8000-00000000d001');

const aparelhoUnico = {
  gravar: (dono: UserId, localizacao: Parameters<LocalizacaoDeReferenciaRepository['gravar']>[2]) =>
    repo.gravar(dono, APARELHO_UNICO, localizacao),
  buscarValida: (dono: UserId, agora: Instant) => repo.buscarValida(dono, APARELHO_UNICO, agora),
  apagar: (dono: UserId) => repo.apagar(dono, APARELHO_UNICO),
};
const contasCriadas: UserId[] = [];

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `bichus88-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

/**
 * **A consulta distraída, e ela é o instrumento de medida deste arquivo.**
 *
 * Sem junção com `users`, sem `deleted_at`, sem nada além do que a tabela
 * oferece: é o que um consumidor novo de `user_reference_locations` escreve
 * quando quer "quem está perto daqui". Se esta consulta alcançar uma conta
 * excluída, o defeito da BICHUS-88 está de volta, independentemente do que
 * qualquer outra consulta do repositório faça.
 */
async function alcancadosPorConsultaDistraida(
  candidatos: readonly UserId[],
): Promise<readonly string[]> {
  const r = await cliente.query<{ user_id: string }>(
    `SELECT user_id
       FROM user_reference_locations
      WHERE user_id = ANY($1::uuid[])
        AND ST_DWithin(
              reference_point,
              ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
              $4
            )
      ORDER BY user_id`,
    [candidatos, PAULISTA.lon, PAULISTA.lat, RAIO_DO_ALERTA_EM_METROS],
  );
  return r.rows.map((linha) => linha.user_id);
}

/** A exclusão lógica do critério 12, como o banco a vê: um `UPDATE`. */
async function excluirLogicamente(dono: UserId): Promise<void> {
  await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [dono]);
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui
    // deixaria o painel verde sem nenhum gatilho ter disparado, que é o
    // desfecho exato que este arquivo existe para impedir.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede um gatilho de Postgres e uma ' +
        'consulta `ST_DWithin` sobre `geography`, e não tem versão em memória. Rode ' +
        '`npm run test:integration`, que sobe a pilha efêmera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  repo = criarLocalizacaoDeReferenciaRepository(db);

  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
});

void after(async () => {
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('BICHUS-88: entre a exclusão lógica e o expurgo, a linha não existe', () => {
  void it('a conta excluída deixa de casar com ST_DWithin, sem ninguém filtrar por deleted_at', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    // A medida só significa alguma coisa se o ANTES for positivo: sem isto, um
    // ponto gravado no lugar errado faria o DEPOIS passar por motivo nenhum.
    assert.deepEqual(
      await alcancadosPorConsultaDistraida([dono]),
      [dono],
      'a conta não casava com ST_DWithin nem ANTES da exclusão: a medição abaixo não ' +
        'provaria nada.',
    );

    await excluirLogicamente(dono);

    assert.deepEqual(
      await alcancadosPorConsultaDistraida([dono]),
      [],
      'a linha de localização da conta excluída AINDA casa com `ST_DWithin`. Esta consulta ' +
        'não junta `users` e não menciona `deleted_at` de propósito: ela é a consulta que ' +
        'alguém escreve amanhã. Se ela alcança a conta, a proteção voltou a morar na ' +
        'consulta de quem lê, que é o defeito da BICHUS-88.',
    );
  });

  void it('a conta excluída some da tabela, e não só do raio', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));
    await excluirLogicamente(dono);

    const r = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM user_reference_locations WHERE user_id = $1',
      [dono],
    );
    assert.equal(
      r.rows[0]?.n,
      '0',
      'a coordenada continua no banco depois do pedido de exclusão. O ADR-0010 diz que ' +
        'ela é "apagada ao excluir a conta", sem janela, e os 30 dias do expurgo são da ' +
        'conta, não dela.',
    );
  });

  void it('excluir uma conta não apaga a localização de outra', async () => {
    const some = await criarConta();
    const fica = await criarConta();
    await aparelhoUnico.gravar(some, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));
    await aparelhoUnico.gravar(fica, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    await excluirLogicamente(some);

    assert.deepEqual(
      await alcancadosPorConsultaDistraida([some, fica]),
      [fica],
      'o apagamento não foi escopado ao titular: um `DELETE` sem `WHERE user_id = NEW.id` ' +
        'esvazia a base de alerta inteira e nada mais no repositório acusaria isso.',
    );
  });

  void it('um UPDATE qualquer em users não apaga a localização', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    await cliente.query('UPDATE users SET email = $2 WHERE id = $1', [
      dono,
      `bichus88-renomeado-${dono}@${DOMINIO_DE_TESTE}`,
    ]);

    assert.deepEqual(
      await alcancadosPorConsultaDistraida([dono]),
      [dono],
      'o gatilho disparou fora da exclusão. Tutor ativo que troca o e-mail sairia da base ' +
        'de alerta sem nada avisar, que é a falha silenciosa mais cara possível aqui.',
    );
  });

  void it('escrever deleted_at = NULL numa conta viva não apaga a localização dela', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    // Este caso existe por causa de uma isca. Com a condição `WHEN` removida, os
    // outros casos deste arquivo continuavam verdes: `AFTER UPDATE OF
    // deleted_at` já não dispara num `UPDATE` que não atribui a coluna, e
    // reverter uma exclusão apaga uma linha que ela mesma já tinha apagado.
    // O que a condição guarda de verdade é ISTO: uma conta VIVA, com
    // localização, num `UPDATE` que atribui `deleted_at = NULL` — o que qualquer
    // atualizador genérico de perfil faz ao reescrever a linha inteira. Sem a
    // condição, o tutor sai da base de alerta ao salvar o perfil.
    await cliente.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [dono]);

    assert.deepEqual(
      await alcancadosPorConsultaDistraida([dono]),
      [dono],
      'a condição `WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)` saiu do ' +
        'gatilho: atribuir `deleted_at` sem excluir nada apagou a localização de uma conta ' +
        'viva. Tutor ativo sai da base de alerta sem nada avisar.',
    );
  });

  void it('a exclusão que volta atrás leva a localização de volta (critério 7)', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    // O critério 7 da BICHUS-88 é "ou tudo foi apagado, ou nada foi". O gatilho
    // é AFTER e roda dentro da transação de quem marcou a conta, então a
    // atomicidade não precisa de nada além disso — mas "não precisa" é uma
    // afirmação, e afirmação não reexecuta.
    await cliente.query('BEGIN');
    try {
      await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [dono]);
      assert.deepEqual(
        await alcancadosPorConsultaDistraida([dono]),
        [],
        'dentro da transação a linha deveria ter sumido',
      );
    } finally {
      await cliente.query('ROLLBACK');
    }

    assert.deepEqual(
      await alcancadosPorConsultaDistraida([dono]),
      [dono],
      'a exclusão falhou no meio e a conta ficou em estado parcial: viva, e sem a ' +
        'localização que ela nunca pediu para apagar.',
    );
  });

  void it('reverter deleted_at não ressuscita coordenada nenhuma', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    await excluirLogicamente(dono);
    await cliente.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [dono]);

    assert.deepEqual(
      await alcancadosPorConsultaDistraida([dono]),
      [],
      'a coordenada voltou sozinha depois de a conta ser reativada. Apagado é apagado: ' +
        'quem volta grava a localização de novo, como quem entra pela primeira vez.',
    );
  });
});

void describe('o gatilho está no catálogo, e é ele que faz o acima acontecer', () => {
  void it('o gatilho existe, é AFTER UPDATE em users e é por linha', async () => {
    const r = await cliente.query<{ definicao: string }>(
      `SELECT pg_get_triggerdef(t.oid) AS definicao
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'users'
          AND t.tgname = 'users_exclusao_logica_apaga_localizacao'
          AND NOT t.tgisinternal`,
    );
    const definicao = r.rows[0]?.definicao;
    assert.ok(
      definicao !== undefined,
      'o gatilho `users_exclusao_logica_apaga_localizacao` não está no banco. Sem ele a ' +
        'linha de localização sobrevive à exclusão lógica e volta a casar com ST_DWithin.',
    );
    assert.match(definicao, /AFTER UPDATE OF deleted_at ON public\.users/i, definicao);
    assert.match(definicao, /FOR EACH ROW/i, definicao);
    // Em pedaços, e não numa expressão só: o `pg_get_triggerdef` parenteriza a
    // condição do seu jeito (`WHEN (((old...) AND (new...)))`), e casar a
    // pontuação dele seria prender este caso a um detalhe de formatação do
    // Postgres em vez da regra.
    for (const parte of [/\bWHEN\b/i, /old\.deleted_at IS NULL/i, /new\.deleted_at IS NOT NULL/i]) {
      assert.match(
        definicao,
        parte,
        'a condição do gatilho mudou. Ela precisa disparar na ida (NULL -> não nulo) e só ' +
          `nela: sem a condição, reverter uma exclusão apagaria a localização de novo, e ` +
          `todo UPDATE de \`users\` pagaria a chamada. Definição atual:\n${definicao}`,
      );
    }
  });
});
