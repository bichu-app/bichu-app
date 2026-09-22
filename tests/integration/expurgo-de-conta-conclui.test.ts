/**
 * A exclusão de conta pelo CAMINHO DO PRODUTO, do pedido ao expurgo, com massa
 * de verdade e `DELETE` de verdade.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE, SE JÁ HÁ UM PORTÃO DE CHAVE ESTRANGEIRA
 * ===========================================================================
 * `chave-estrangeira-contra-restricao.test.ts` prova que `DELETE FROM users`
 * conclui. Ele é indispensável e não é suficiente: ele apaga a conta **na mão**,
 * com SQL escrito no próprio caso. Nada ali passa por `excluirMinhaConta`, por
 * `registrarPedidoDeExclusao` ou por `expurgarContasExcluidas`, e nada ali
 * repara se o produto nunca chamar nenhuma das três.
 *
 * É exatamente a forma do defeito que a BICHUS-215 existe para fechar:
 * `invalidarTodasAsSessoes` era mecanismo escrito, testado e **sem chamador**,
 * e a suíte inteira ficava verde. Um portão que exercita o banco sem exercitar
 * o caminho prova o mecanismo, não o caminho.
 *
 * ===========================================================================
 * A AFIRMAÇÃO QUE DECIDE O TRABALHO
 * ===========================================================================
 * **A exclusão CONCLUI.** Não "foi chamada", não "não estourou o teste": a
 * linha de `users` deixa de existir, e o que era da pessoa vai junto.
 *
 * Um caso que afirmasse `assert.ok(repo.expurgarConta chamado)` fica verde com
 * um `23503` esperando na fila — e em 22/09 essa fila teve cinco ocorrências em
 * um dia. A quinta (migração `20260922000005`) só aparece quando a achadora
 * escreveu **numa conversa nascida do próprio aviso dela**: `users` cascateia
 * para `found_reports`, `found_reports` cascateia para `conversations`, e o
 * `SET NULL` de `conversation_messages.sender_user_id` revalidava
 * `conversation_id` contra um pai que a mesma instrução tinha acabado de levar.
 *
 * Por isso a massa daqui tem **pet, tag, foto, caso, aviso e conversa com
 * mensagem escrita pela própria pessoa**. Tirar a mensagem da massa faz o caso
 * passar sem nunca tocar o mecanismo.
 *
 * ===========================================================================
 * O CONTRAPESO
 * ===========================================================================
 * Dois casos afirmam o lado permissivo, e eles são o que impede este arquivo de
 * virar "apaga tudo":
 *
 * - conta com pedido de exclusão de **ontem** não é expurgada. Sem ele, a
 *   implementação mais simples que passa no caso principal é ignorar o prazo, e
 *   o prazo é a janela de socorro de quem clicou errado;
 * - a **trilha de auditoria sobrevive**. `audit.events` não referencia `users`
 *   de propósito (ADR-0010: 24 meses, obrigação legal), e é ela que torna o
 *   prazo verificável por quem audita de fora.
 *
 * Como rodar: `npm run test:integration`, de dentro do worktree.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { expurgarContasExcluidas } from '../../src/modules/identity/application/expurgar-contas-excluidas.js';
import { PRAZO_DE_EXPURGO_EM_MS } from '../../src/modules/identity/application/auth-service.js';
import type { AuditEvent, AuditLog } from '../../src/modules/audit/ports/audit-log.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = Date.parse('2026-09-22T12:00:00.000Z') as Instant;
const DEPOIS_DO_PRAZO = (AGORA + PRAZO_DE_EXPURGO_EM_MS + 60_000) as Instant;

const ACHADORA = '0192f3a1-7c2b-7e3d-9a10-2150000000a1' as UserId;
const DONA = '0192f3a1-7c2b-7e3d-9a10-2150000000a2' as UserId;
const PET_DA_ACHADORA = '0192f3a1-7c2b-7e3d-9a10-2150000000b1';
const PET_DA_DONA = '0192f3a1-7c2b-7e3d-9a10-2150000000b2';
const TAG = '0192f3a1-7c2b-7e3d-9a10-2150000000c1';
const INTENCAO = '0192f3a1-7c2b-7e3d-9a10-2150000000d1';
const FOTO = '0192f3a1-7c2b-7e3d-9a10-2150000000d2';
const CASO = '0192f3a1-7c2b-7e3d-9a10-2150000000e1';
const AVISO = '0192f3a1-7c2b-7e3d-9a10-2150000000f1';
const CONVERSA = '0192f3a1-7c2b-7e3d-9a10-215000000101';
const MENSAGEM = '0192f3a1-7c2b-7e3d-9a10-215000000102';

let cliente: Client;
let banco: DbHandle;
let db: Db;
let repo: ReturnType<typeof criarIdentityRepository>;

/** Trilha que só anota. O que o banco faz é o que este arquivo mede. */
function trilhaQueAnota(): AuditLog & { eventos: AuditEvent[] } {
  const eventos: AuditEvent[] = [];
  return {
    eventos,
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Falha ruidosa, nunca `skip`. Um arquivo que se pula sozinho por falta de
    // banco termina verde e ninguém desconfia — e o que ele deixa de conferir é
    // a única instrução deste produto que dispara a árvore de cascatas inteira.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo apaga uma conta de verdade e exige que ' +
        'a operação CONCLUA. Sem banco ele não confere nada, e passar verde sem conferir é ' +
        'o desfecho que ele existe para impedir. Rode `npm run test:integration`.',
    );
  }
  cliente = new Client({ connectionString: CONEXAO });
  await cliente.connect();
  banco = createDb(CONEXAO);
  db = banco.db;
  repo = criarIdentityRepository(db, criarIdGenerator(() => AGORA));
});

after(async () => {
  await banco?.close();
  await cliente?.end();
});

function codigoDoErro(erro: unknown): string {
  const codigo = (erro as { code?: unknown } | null)?.code;
  return typeof codigo === 'string' ? codigo : 'sem código';
}

/**
 * A massa: tudo o que a exclusão precisa atravessar, num SAVEPOINT.
 *
 * A conversa nasce do aviso da PRÓPRIA achadora e tem uma mensagem escrita por
 * ela. É essa combinação, e só ela, que exercita a quinta forma da classe de
 * 22/09 — sem a mensagem, ou com ela marcada como `system`, a exclusão conclui
 * mesmo com a declaração errada, e o caso vira decoração.
 */
async function comMassa(corpo: () => Promise<void>): Promise<void> {
  await cliente.query('BEGIN');
  try {
    await cliente.query(
      `insert into users (id, email, deleted_at, status, deletion_requested_at) values
         ($1, 'achadora@expurgo.test', null, 'active', null),
         ($2, 'dona@expurgo.test',     null, 'active', null)`,
      [ACHADORA, DONA],
    );
    await cliente.query(
      `insert into pets (id, owner_user_id, name, species_code, size_code) values
         ($1, $2, 'Rex', 'dog', 'M'),
         ($3, $4, 'Mel', 'dog', 'M')`,
      [PET_DA_ACHADORA, ACHADORA, PET_DA_DONA, DONA],
    );
    await cliente.query(
      `insert into pet_tags (id, pet_id, code_hash, code_suffix, code_ciphertext)
       values ($1, $2, sha256('expurgo'::bytea), 'EXP7', 'cifra-para-reimpressao')`,
      [TAG, PET_DA_ACHADORA],
    );
    await cliente.query(
      `insert into upload_intents
         (id, user_id, pet_id, kind, object_key, declared_type, max_bytes, expires_at)
       values ($1, $2, $3, 'pet_photo', 'expurgo/1', 'image/jpeg', 1000000,
               now() + interval '1 hour')`,
      [INTENCAO, ACHADORA, PET_DA_ACHADORA],
    );
    await cliente.query(
      `insert into pet_photos
         (id, pet_id, upload_intent_id, status, original_key, is_primary, created_at)
       values ($1, $2, $3, 'processing', 'expurgo/1', false, now())`,
      [FOTO, PET_DA_ACHADORA, INTENCAO],
    );
    await cliente.query(
      `insert into lost_cases (id, pet_id, owner_user_id, last_seen_at, last_seen_city, share_token)
       values ($1, $2, $3, now(), 'Sao Paulo', 'tok-do-caso-do-expurgo')`,
      [CASO, PET_DA_DONA, DONA],
    );
    // O aviso avulso é da ACHADORA, e fala do pet da DONA. É a pista que
    // atravessa pessoas, e é o que a pergunta aberta com o cliente decide.
    await cliente.query(
      `insert into found_reports
         (id, origin, reporter_user_id, found_at, species, size, found_city, retention_until)
       values ($1, 'stray_report', $2, now(), 'dog', 'M', 'Sao Paulo', now() + interval '90 days')`,
      [AVISO, ACHADORA],
    );
    await cliente.query(
      `insert into conversations (id, found_report_id, pet_id, case_id, tutor_user_id, finder_user_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [CONVERSA, AVISO, PET_DA_DONA, CASO, DONA, ACHADORA],
    );
    // A MENSAGEM DA PRÓPRIA ACHADORA. É esta linha que faz a quinta forma
    // aparecer: `sender_user_id` preenchido, numa conversa que a cascata do
    // aviso leva embora na mesma instrução.
    await cliente.query(
      `insert into conversation_messages (id, conversation_id, sender_role, sender_user_id, body)
       values ($1, $2, 'finder', $3, 'Achei ele na praca, esta bem')`,
      [MENSAGEM, CONVERSA, ACHADORA],
    );
    await corpo();
  } finally {
    await cliente.query('ROLLBACK');
  }
}

async function contar(sql: string, parametros: unknown[]): Promise<string> {
  const { rows } = await cliente.query<{ n: string }>(sql, parametros);
  return rows[0]?.n ?? 'consulta sem linha';
}

void describe('exclusão de conta pelo caminho do produto (BICHUS-215)', () => {
  void it('o pedido marca a conta, revoga as tags e NÃO apaga nada', async () => {
    await comMassa(async () => {
      const consequencias = await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      assert.deepEqual(consequencias, { tagsRevogadas: 1 });

      const { rows } = await cliente.query<{
        status: string;
        tem_deleted_at: boolean;
        tem_pedido: boolean;
        pets: string;
      }>(
        `select u.status,
                u.deleted_at is not null            as tem_deleted_at,
                u.deletion_requested_at is not null as tem_pedido,
                (select count(*) from pets where owner_user_id = u.id)::text as pets
           from users u where u.id = $1`,
        [ACHADORA],
      );
      // "Exclusão lógica imediata, expurgo definitivo em 30 dias" — as duas
      // metades da mesma frase do contrato. Um `DELETE` aqui tiraria a janela
      // de socorro de quem clicou errado.
      assert.deepEqual(rows[0], {
        status: 'deletion_requested',
        tem_deleted_at: true,
        tem_pedido: true,
        pets: '1',
      });
    });
  });

  void it('a tag revogada é estado COMPLETO e não guarda mais o código', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      const { rows } = await cliente.query<{
        status: string;
        motivo: string | null;
        tem_revoked_at: boolean;
        tem_cifra: boolean;
      }>(
        `select status, revocation_reason as motivo,
                revoked_at is not null      as tem_revoked_at,
                code_ciphertext is not null as tem_cifra
           from pet_tags where id = $1`,
        [TAG],
      );
      // A plaquinha está numa coleira, na rua, e resolve sem ninguém
      // autenticar. Trinta dias de QR vivo apontando para o pet de uma conta
      // excluída é o buraco que a exclusão existe para fechar. E o ADR-0004
      // manda apagar o texto cifrado guardado para reimpressão.
      assert.deepEqual(rows[0], {
        status: 'revoked',
        motivo: 'owner_request',
        tem_revoked_at: true,
        tem_cifra: false,
      });
    });
  });

  void it('o e-mail fica livre no mesmo instante: a pessoa pode voltar', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      // `users_email_unico_ativo` é parcial `WHERE deleted_at IS NULL`. Sem o
      // `deleted_at` na marcação, quem excluiu a conta ficaria impedido de
      // criar outra com o próprio endereço até o expurgo — 30 dias depois.
      await cliente.query(`insert into users (id, email) values ($1, 'achadora@expurgo.test')`, [
        '0192f3a1-7c2b-7e3d-9a10-215000000999',
      ]);
      assert.equal(
        await contar(
          `select count(*)::text as n from users where email = 'achadora@expurgo.test'`,
          [],
        ),
        '2',
      );
    });
  });

  void it('A EXCLUSÃO CONCLUI: o expurgo apaga a conta e tudo o que é dela', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      const trilha = trilhaQueAnota();
      let resultado;
      try {
        resultado = await expurgarContasExcluidas({
          repositorio: repo,
          trilha,
          clock: { now: () => DEPOIS_DO_PRAZO },
        });
      } catch (erro) {
        assert.fail(
          `o expurgo ESTOUROU com ${codigoDoErro(erro)}. É este o desfecho que a classe de ` +
            '22/09 produz: 23514 quando um CHECK proíbe o nulo que a FK manda pôr, 23502 ' +
            'quando a coluna é NOT NULL, 23503 quando um RESTRICT trava ou quando um SET ' +
            'NULL revalida contra um pai que a cascata já levou. Mensagem: ' +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }

      // A varredura engole a falha de uma conta para não represar a fila, e é
      // por isso que `falhas` precisa ser afirmado: sem esta linha, um 23503
      // viraria uma rodada silenciosa que conta zero expurgadas e segue.
      assert.deepEqual(
        resultado,
        { examinadas: 1, expurgadas: 1, falhas: 0 },
        'a rodada não expurgou a conta. Se `falhas` for 1, o `DELETE` estourou e a mensagem ' +
          'está no log do worker, com o código do Postgres.',
      );

      const { rows } = await cliente.query<Record<string, string>>(
        `select (select count(*) from users                 where id = $1)::text as conta,
                (select count(*) from pets                  where id = $2)::text as pet,
                (select count(*) from pet_tags              where id = $3)::text as tag,
                (select count(*) from pet_photos            where id = $4)::text as foto,
                (select count(*) from upload_intents        where id = $5)::text as intencao,
                (select count(*) from found_reports         where id = $6)::text as aviso,
                (select count(*) from conversations         where id = $7)::text as conversa,
                (select count(*) from conversation_messages where id = $8)::text as mensagem`,
        [ACHADORA, PET_DA_ACHADORA, TAG, FOTO, INTENCAO, AVISO, CONVERSA, MENSAGEM],
      );
      // Exclusão que conclui sem apagar não é exclusão: é a promessa quebrada
      // em silêncio, que é pior que a falha ruidosa.
      assert.deepEqual(rows[0], {
        conta: '0',
        pet: '0',
        tag: '0',
        foto: '0',
        intencao: '0',
        aviso: '0',
        conversa: '0',
        mensagem: '0',
      });
    });
  });

  void it('o que é da OUTRA pessoa sobrevive: o caso da dona continua de pé', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);
      await expurgarContasExcluidas({
        repositorio: repo,
        trilha: trilhaQueAnota(),
        clock: { now: () => DEPOIS_DO_PRAZO },
      });

      const { rows } = await cliente.query<{ dona: string; caso: string; pet: string }>(
        `select (select count(*) from users      where id = $1)::text as dona,
                (select count(*) from lost_cases where id = $2)::text as caso,
                (select count(*) from pets       where id = $3)::text as pet`,
        [DONA, CASO, PET_DA_DONA],
      );
      assert.deepEqual(
        rows[0],
        { dona: '1', caso: '1', pet: '1' },
        'a exclusão de uma conta apagou coisa de OUTRA pessoa. Isso é incidente, não defeito.',
      );
    });
  });

  void it('A PISTA DE OUTRA PESSOA SOME, e ninguém avisa a dona (estado de hoje)', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);
      await expurgarContasExcluidas({
        repositorio: repo,
        trilha: trilhaQueAnota(),
        clock: { now: () => DEPOIS_DO_PRAZO },
      });

      // Este caso AFIRMA o comportamento de hoje em vez de exigir outro, e é de
      // propósito: a pergunta "o que acontece com a pista quando quem a deu
      // exerce o direito de apagar a conta" está ABERTA com o cliente, com
      // recomendação de anonimizar. Enquanto a decisão não vem, o que o produto
      // faz é isto — a pista some junto, e a dona do pet não é avisada.
      //
      // Se um dia o aviso passar a sobreviver sem dono, este caso reprova e
      // quem fez a troca lê aqui por quê. É a única forma de a mudança de
      // política aparecer como mudança, e não como regressão.
      assert.equal(
        await contar(`select count(*)::text as n from found_reports where id = $1`, [AVISO]),
        '0',
        'a pista sobreviveu à exclusão de quem a deu. Se isso foi deliberado, a decisão do ' +
          'cliente chegou e este caso precisa ser reescrito com ela.',
      );
    });
  });

  void it('CONTRAPESO: conta excluída ONTEM não é expurgada; o prazo é a janela de socorro', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      const resultado = await expurgarContasExcluidas({
        repositorio: repo,
        trilha: trilhaQueAnota(),
        // Um dia depois do pedido, e não 31.
        clock: { now: () => (AGORA + 24 * 60 * 60 * 1000) as Instant },
      });

      // Sem este caso, a implementação mais simples que passa no caso principal
      // é ignorar o prazo — e o prazo é o que dá socorro a quem clicou errado e
      // a quem teve a conta tomada e excluída por outra pessoa.
      assert.deepEqual(resultado, { examinadas: 0, expurgadas: 0, falhas: 0 });
      assert.equal(
        await contar(`select count(*)::text as n from users where id = $1`, [ACHADORA]),
        '1',
      );
    });
  });

  void it('CONTRAPESO: conta VIVA nunca entra na varredura', async () => {
    await comMassa(async () => {
      const resultado = await expurgarContasExcluidas({
        repositorio: repo,
        trilha: trilhaQueAnota(),
        clock: { now: () => DEPOIS_DO_PRAZO },
      });

      // A cláusula é `deleted_at IS NOT NULL AND deleted_at <= $1`. Tirar a
      // primeira metade faria a varredura apagar toda conta criada há mais de
      // 30 dias, que é a base inteira.
      assert.equal(resultado.expurgadas, 0);
      assert.equal(
        await contar(`select count(*)::text as n from users where id in ($1, $2)`, [ACHADORA, DONA]),
        '2',
      );
    });
  });

  void it('a TRILHA sobrevive ao expurgo: é ela que torna o prazo verificável', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);
      const trilha = trilhaQueAnota();

      await expurgarContasExcluidas({
        repositorio: repo,
        trilha,
        clock: { now: () => DEPOIS_DO_PRAZO },
      });

      const evento = trilha.eventos.find((e) => e.action === 'privacy.account_purged');
      assert.ok(evento !== undefined, 'sem este evento ninguém consegue provar que a conta saiu');
      assert.equal(evento.resourceId, ACHADORA);
      assert.equal(evento.actorKind, 'system');
      // `audit.events` não referencia `users`, de propósito (ADR-0010: 24
      // meses, obrigação legal). O registro precisa poder sobreviver ao que ele
      // registra, e uma chave estrangeira aqui apagaria a prova junto com o
      // objeto da prova.
      assert.equal(
        await contar(
          `select count(*)::text as n from information_schema.table_constraints
            where constraint_schema = 'audit' and table_name = 'events'
              and constraint_type = 'FOREIGN KEY'`,
          [],
        ),
        '0',
      );
    });
  });
});
