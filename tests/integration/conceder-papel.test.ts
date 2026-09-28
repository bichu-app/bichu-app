/**
 * **O comando de papel contra Postgres de verdade** (BICHUS-260; ADR-0027 D42,
 * D43, D49 e D51).
 *
 * O servico e o repositorio sao os de producao; so o terminal e a base de
 * vazadas sao trocados, porque um e pty e o outro e rede. A derivacao da senha
 * e a real (`gerarHashDeSenha`), e o hash gravado e conferido com a funcao do
 * login (`verificarSenha`): e isso que prova "o mesmo esquema do login".
 *
 * O que so o banco responde:
 *
 * 1. conceder grava `admin`, empurra `sessions_invalid_before` e grava
 *    `authz.role_granted` com `actor_kind = 'system'` na MESMA transacao;
 * 2. rodar de novo nao grava segundo evento nem empurra a barreira (idempotente
 *    pelo estado);
 * 3. revogar apaga o papel, revoga a sessao do painel com `role_removed` e
 *    grava `authz.role_revoked`;
 * 4. e-mail sem conta sai diferente de zero e nenhuma linha de `users` nasce;
 * 5. falha da trilha desfaz o papel (D49);
 * 6. `--criar-conta` grava so `admin` (conta dedicada, sem `tutor`), o hash
 *    confere com a senha, e a sentinela nao aparece em nenhuma linha da
 *    trilha nem da credencial.
 *
 * ## Iscas (BICHUS-260, 23/09/2026, node 22.23.2, pilha efemera)
 *
 * Registradas na entrega: cada uma neutralizada no codigo e o caso que
 * reprovou. Ver `.jarvis/entregas.md`.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { UserId } from '../../src/shared/types/brands.js';
import { criarTrilhaTransacional } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import type { TrilhaTransacional } from '../../src/modules/audit/ports/audit-log.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarRepositorioDePapeis } from '../../src/modules/identity/adapters/persistence/kysely-repositorio-de-papeis.js';
import {
  executarPedidoDePapel,
  type Interacao,
  type SenhaDigitada,
} from '../../src/modules/identity/application/conceder-papel.js';
import { SAIDA, type PedidoDePapel } from '../../src/modules/identity/domain/concessao-de-papel.js';
import { gerarHashDeSenha, verificarSenha } from '../../src/modules/identity/domain/password.js';

const SENTINELA = `SENTINELA-integracao-${randomUUID().slice(0, 8)}`;
const TEMPO = { timeout: 60_000 };

let banco: { db: Db; close: () => Promise<void> };
let trilha: TrilhaTransacional;
const ids = criarIdGenerator(() => systemClock.now());
const contasCriadas: string[] = [];

function email(prefixo: string): string {
  return `${prefixo}-${randomUUID().slice(0, 8)}@exemplo.invalid`;
}

function interacao(respostas: string[], senhas: string[] = []) {
  const mostrado: string[] = [];
  const falsa: Interacao = {
    mostrar: (texto) => {
      mostrado.push(texto);
    },
    perguntar: () => Promise.resolve(respostas.shift() ?? ''),
    perguntarSenha: (): Promise<SenhaDigitada> =>
      Promise.resolve({ bytes: Buffer.from(senhas.shift() ?? '', 'utf8'), excedeu: false }),
  };
  return { falsa, mostrado };
}

function pedido(campos: Partial<PedidoDePapel> & { email: string }): PedidoDePapel {
  return { acao: 'conceder', papel: 'admin', criarConta: false, operador: 'integracao', ...campos };
}

async function executar(p: PedidoDePapel, respostas: string[], senhas: string[] = [], trilhaUsada = trilha) {
  const { falsa, mostrado } = interacao(respostas, senhas);
  const codigo = await executarPedidoDePapel(p, {
    repositorio: criarRepositorioDePapeis({ db: banco.db, ids, trilha: trilhaUsada }),
    senhasVazadas: { contem: () => Promise.resolve(false) },
    interacao: falsa,
    clock: systemClock,
    gerarHash: gerarHashDeSenha,
  });
  return { codigo, mostrado };
}

async function contaDeTutor(endereco: string): Promise<UserId> {
  const criada = await criarIdentityRepository(banco.db, ids).criarContaLocal({
    email: endereco,
    displayName: 'tutor',
    acceptedTermsVersion: undefined,
    passwordPhc: '$pbkdf2-sha512$i=1$c2Fs$aGFzaA',
    agora: systemClock.now(),
  });
  assert.ok(criada !== undefined, 'a conta de teste nao foi criada');
  contasCriadas.push(criada.id);
  return criada.id;
}

async function papeis(userId: string): Promise<string[]> {
  const linhas = await banco.db.selectFrom('user_roles').select('role').where('user_id', '=', userId).execute();
  return linhas.map((l) => l.role).sort();
}

async function eventos(userId: string) {
  return banco.db
    .selectFrom('audit.events')
    .select(['actor_kind', 'actor_user_id', 'action', 'resource_kind', 'before', 'after', 'metadata'])
    .where('resource_id', '=', userId)
    .orderBy('occurred_at')
    .execute();
}

async function barreira(userId: string): Promise<number> {
  const linha = await banco.db
    .selectFrom('users')
    .select('sessions_invalid_before')
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  return linha.sessions_invalid_before.getTime();
}

before(() => {
  const config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  trilha = criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey });
});

after(async () => {
  if (contasCriadas.length > 0) await banco.db.deleteFrom('users').where('id', 'in', contasCriadas).execute();
  await banco.close();
});

void describe('conceder e revogar admin em conta existente', TEMPO, () => {
  void it('concede, empurra a barreira e grava role_granted com ator system; de novo nao regrava', async () => {
    const endereco = email('conceder');
    const conta = await contaDeTutor(endereco);
    const barreiraAntes = await barreira(conta);

    const primeira = await executar(pedido({ email: endereco }), ['sim']);
    assert.equal(primeira.codigo, SAIDA.OK, primeira.mostrado.join('\n'));
    assert.deepEqual(await papeis(conta), ['admin', 'tutor']);
    assert.ok((await barreira(conta)) > barreiraAntes, 'a barreira das sessoes moveis nao andou (D42)');

    const gravados = await eventos(conta);
    const concessoes = gravados.filter((e) => e.action === 'authz.role_granted');
    assert.equal(concessoes.length, 1);
    const evento = concessoes[0];
    assert.ok(evento !== undefined);
    assert.equal(evento.actor_kind, 'system');
    assert.equal(evento.actor_user_id, null);
    assert.equal(evento.resource_kind, 'user');
    assert.deepEqual(evento.before, { roles: ['tutor'] });
    assert.deepEqual(evento.after, { roles: ['admin', 'tutor'] });
    const metadata = evento.metadata as Record<string, unknown>;
    assert.equal(metadata['operator'], 'integracao');
    assert.equal(metadata['role'], 'admin');
    assert.equal(metadata['surface'], 'command');

    const barreiraDepois = await barreira(conta);
    const segunda = await executar(pedido({ email: endereco }), []);
    assert.equal(segunda.codigo, SAIDA.OK);
    assert.equal((await eventos(conta)).filter((e) => e.action === 'authz.role_granted').length, 1);
    assert.equal(await barreira(conta), barreiraDepois, 'a segunda concessao empurrou a barreira');
  });

  void it('revoga, derruba a sessao do painel com role_removed e grava role_revoked', async () => {
    const endereco = email('revogar');
    const conta = await contaDeTutor(endereco);
    assert.equal((await executar(pedido({ email: endereco }), ['sim'])).codigo, SAIDA.OK);

    const agora = Date.now();
    const sessao = ids.uuidv7();
    await banco.db
      .insertInto('admin_sessions')
      .values({
        id: sessao,
        user_id: conta,
        token_hash: createHash('sha256').update(randomBytes(32)).digest(),
        csrf_token_hash: createHash('sha256').update(randomBytes(32)).digest(),
        created_at: new Date(agora),
        last_seen_at: new Date(agora),
        idle_expires_at: new Date(agora + 30 * 60_000),
        absolute_expires_at: new Date(agora + 60 * 60_000),
      })
      .execute();

    const { codigo, mostrado } = await executar(pedido({ email: endereco, acao: 'revogar' }), ['sim']);
    assert.equal(codigo, SAIDA.OK, mostrado.join('\n'));
    assert.deepEqual(await papeis(conta), ['tutor']);

    const linha = await banco.db
      .selectFrom('admin_sessions')
      .select(['revoked_at', 'revoked_reason'])
      .where('id', '=', sessao)
      .executeTakeFirstOrThrow();
    assert.equal(linha.revoked_reason, 'role_removed');

    const revogacoes = (await eventos(conta)).filter((e) => e.action === 'authz.role_revoked');
    assert.equal(revogacoes.length, 1);
    assert.equal(revogacoes[0]?.actor_kind, 'system');
    assert.equal((revogacoes[0]?.metadata as Record<string, unknown>)['admin_sessions_revoked'], 1);

    // Idempotente: revogar de novo nao grava nada.
    assert.equal((await executar(pedido({ email: endereco, acao: 'revogar' }), [])).codigo, SAIDA.OK);
    assert.equal((await eventos(conta)).filter((e) => e.action === 'authz.role_revoked').length, 1);
  });

  void it('isca: e-mail sem conta sai diferente de zero e nenhuma conta nasce', async () => {
    const endereco = email('inexistente');
    const { codigo } = await executar(pedido({ email: endereco }), ['sim']);
    assert.equal(codigo, SAIDA.CONTA_INEXISTENTE);
    assert.notEqual(codigo, 0);
    const linhas = await banco.db.selectFrom('users').select('id').where('email', '=', endereco).execute();
    assert.deepEqual(linhas, []);
  });

  void it('isca: falha da trilha desfaz a concessao (D49)', async () => {
    const endereco = email('trilha-falha');
    const conta = await contaDeTutor(endereco);
    const quebrada: TrilhaTransacional = {
      recordIn: () => Promise.reject(new Error('trilha indisponivel')),
    };
    await assert.rejects(executar(pedido({ email: endereco }), ['sim'], [], quebrada), /trilha indisponivel/);
    assert.deepEqual(await papeis(conta), ['tutor'], 'o papel ficou gravado sem trilha');
  });
});

void describe('--criar-conta', TEMPO, () => {
  void it('isca da sentinela: conta dedicada so com admin, hash do login, e a senha em lugar nenhum', async () => {
    const endereco = email('dedicada');
    const senha = `${SENTINELA} frase longa de teste`;
    const { codigo, mostrado } = await executar(pedido({ email: endereco, criarConta: true }), ['sim'], [senha, senha]);
    assert.equal(codigo, SAIDA.OK, mostrado.join('\n'));

    const conta = await banco.db
      .selectFrom('users')
      .select(['id', 'email_verified_at'])
      .where('email', '=', endereco)
      .executeTakeFirstOrThrow();
    contasCriadas.push(conta.id);
    assert.equal(conta.email_verified_at, null);
    assert.deepEqual(await papeis(conta.id), ['admin'], 'a conta dedicada nao pode ter tutor (D42)');

    const credencial = await banco.db
      .selectFrom('local_credentials')
      .innerJoin('user_identities', 'user_identities.id', 'local_credentials.identity_id')
      .select('local_credentials.password_phc')
      .where('user_identities.user_id', '=', conta.id)
      .executeTakeFirstOrThrow();
    assert.ok(await verificarSenha(senha, credencial.password_phc), 'o hash nao confere com a funcao do login');
    assert.ok(!credencial.password_phc.includes(SENTINELA));

    const gravados = await eventos(conta.id);
    assert.deepEqual(gravados.map((e) => e.action), ['auth.account_created', 'authz.role_granted']);
    assert.ok(gravados.every((e) => e.actor_kind === 'system'));
    assert.ok(!JSON.stringify(gravados).includes(SENTINELA), 'a senha apareceu na trilha');
    assert.ok(!mostrado.join('\n').includes(SENTINELA), 'a senha apareceu numa mensagem');
  });

  void it('isca: senha curta nao cria conta', async () => {
    const endereco = email('curta');
    const { codigo } = await executar(pedido({ email: endereco, criarConta: true }), ['sim'], ['curta', 'curta']);
    assert.equal(codigo, SAIDA.SENHA_RECUSADA);
    const linhas = await banco.db.selectFrom('users').select('id').where('email', '=', endereco).execute();
    assert.deepEqual(linhas, []);
  });
});
