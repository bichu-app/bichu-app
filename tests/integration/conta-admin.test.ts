/**
 * **O comando `conta-admin` contra Postgres de verdade** (ADR-0027 item 20.3,
 * fatia 5 do item 20.7; D43, D49, D61, D63).
 *
 * O caso de uso, o repositorio e a conferencia D63 sao os de producao; so o
 * terminal, a base de vazadas e o envio de e-mail sao trocados, porque um e
 * pty e os outros sao rede. A derivacao da senha e a real
 * (`gerarHashDeSenha`), e o hash gravado e conferido com a funcao do login
 * (`verificarSenha`).
 *
 * As senhas daqui sao valores de teste, gerados por execucao: nenhuma e de
 * conta real, e nenhuma sai deste processo.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hashDeToken } from '../../src/shared/crypto/digest.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { AdminAccountId } from '../../src/shared/types/brands.js';
import {
  criarContagemNaTrilha,
  criarEscritaAuditada,
  criarTrilhaDeAuditoria,
  criarTrilhaTransacional,
} from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import type { TrilhaTransacional } from '../../src/modules/audit/ports/audit-log.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { gerarHashDeSenha, verificarSenha } from '../../src/modules/identity/ports/senha.js';
import { criarComandoDeContas } from '../../src/modules/admin-access/adapters/persistence/kysely-comando-de-contas.js';
import { criarRepositorioDeContasAdministrativas } from '../../src/modules/admin-access/adapters/persistence/kysely-contas-administrativas.js';
import { criarSessaoAdministrativaRepository } from '../../src/modules/admin-access/adapters/persistence/kysely-sessao-administrativa-repository.js';
import { criarSessaoAdministrativaService } from '../../src/modules/admin-access/application/sessao-administrativa-service.js';
import {
  executarComandoContaAdmin,
  type Interacao,
  type SenhaDigitada,
} from '../../src/modules/admin-access/application/comando-conta-admin.js';
import { SAIDA, type PedidoDoComando } from '../../src/modules/admin-access/domain/comando-conta-admin.js';
import type { MensagemDoPainel } from '../../src/modules/admin-access/ports/aviso-por-email.js';
import { AppError } from '../../src/shared/http/errors.js';
import { conferenciaComContaDoApp } from '../../src/bin/conta-admin.js';

const TEMPO = { timeout: 60_000 };
/** Senha de teste, gerada nesta execucao. Tambem e a sentinela: nao pode aparecer em lugar nenhum. */
const SENHA = `teste-${randomBytes(12).toString('hex')}`;
const OUTRA = `teste-${randomBytes(12).toString('hex')}`;
const VAZADA = `teste-vazada-${randomBytes(8).toString('hex')}`;

let banco: { db: Db; close: () => Promise<void> };
let trilha: TrilhaTransacional;
const ids = criarIdGenerator(() => systemClock.now());
const contasDoPainel: string[] = [];
const contasDoApp: string[] = [];

function email(prefixo: string): string {
  return `${prefixo}-${randomUUID().slice(0, 8)}@exemplo.invalid`;
}

async function executar(
  pedido: PedidoDoComando,
  opcoes: { respostas?: string[]; senhas?: string[]; trilhaUsada?: TrilhaTransacional } = {},
) {
  const mostrado: string[] = [];
  const avisos: MensagemDoPainel[] = [];
  const respostas = [...(opcoes.respostas ?? ['sim'])];
  const senhas = [...(opcoes.senhas ?? [SENHA, SENHA])];
  const interacao: Interacao = {
    mostrar: (texto) => void mostrado.push(texto),
    perguntar: () => Promise.resolve(respostas.shift() ?? ''),
    perguntarSenha: (): Promise<SenhaDigitada> =>
      Promise.resolve({ bytes: Buffer.from(senhas.shift() ?? '', 'utf8'), excedeu: false }),
  };
  const codigo = await executarComandoContaAdmin(pedido, {
    contas: criarComandoDeContas({ db: banco.db, ids, trilha: opcoes.trilhaUsada ?? trilha }),
    senhasVazadas: { contem: (senha) => Promise.resolve(senha === VAZADA) },
    contaDoApp: conferenciaComContaDoApp(banco.db, ids),
    avisos: { enviar: (m) => { avisos.push(m); return Promise.resolve(); } },
    interacao,
    clock: systemClock,
    gerarHash: gerarHashDeSenha,
  });
  return { codigo, mostrado, avisos };
}

const criar = (endereco: string): PedidoDoComando => ({
  subcomando: 'criar', email: endereco, nome: 'Conta de teste', operador: 'integracao',
});
const sobre = (subcomando: 'redefinir-senha' | 'desativar' | 'reativar' | 'encerrar-sessoes', endereco: string): PedidoDoComando => ({
  subcomando, email: endereco, nome: undefined, operador: 'integracao',
});

async function conta(endereco: string) {
  return banco.db.selectFrom('admin_accounts').selectAll().where('email', '=', endereco).executeTakeFirst();
}

async function eventos(id: string) {
  return banco.db
    .selectFrom('audit.events')
    .select(['actor_kind', 'actor_user_id', 'actor_admin_id', 'action', 'resource_kind', 'before', 'after', 'metadata'])
    .where('resource_id', '=', id)
    .orderBy('occurred_at')
    .execute();
}

/** Uma sessao viva da conta, gravada direto: o login passaria por captcha e rede. */
async function sessaoViva(id: string): Promise<string> {
  const cookie = randomBytes(32).toString('base64url');
  const agora = Date.now();
  await banco.db.insertInto('admin_sessions').values({
    id: ids.uuidv7(),
    admin_account_id: id,
    token_hash: hashDeToken(cookie),
    csrf_token_hash: hashDeToken(`csrf-${cookie}`),
    created_at: new Date(agora),
    last_seen_at: new Date(agora),
    idle_expires_at: new Date(agora + 30 * 60_000),
    absolute_expires_at: new Date(agora + 12 * 60 * 60_000),
    user_agent: null,
    ip_hmac: null,
  }).execute();
  return cookie;
}

async function vivas(id: string): Promise<number> {
  const linhas = await banco.db.selectFrom('admin_sessions').select('id')
    .where('admin_account_id', '=', id).where('revoked_at', 'is', null).execute();
  return linhas.length;
}

function guarda() {
  const config = loadAppConfig();
  return criarSessaoAdministrativaService({
    sessoes: criarSessaoAdministrativaRepository(banco.db),
    contas: criarRepositorioDeContasAdministrativas(banco.db),
    escrita: criarEscritaAuditada({ db: banco.db, trilha }),
    trilha: criarTrilhaDeAuditoria({ db: banco.db, ids, clock: systemClock, ipHmacKey: config.ipHmacKey, onFailure: () => {} }),
    contagem: criarContagemNaTrilha(),
    captcha: { avaliar: () => Promise.resolve(undefined) },
    senhasVazadas: { contem: () => Promise.resolve(false) },
    avisos: { enviar: () => Promise.resolve() },
    ids,
    clock: systemClock,
    hmacDeIp: () => null,
    origemDoPainel: 'https://painel.exemplo.test',
    registrarOcorrencia: () => {},
  });
}

const contexto = { correlationId: randomUUID(), ip: undefined, userAgent: undefined };

before(() => {
  const config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  trilha = criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey });
});

after(async () => {
  if (contasDoPainel.length > 0) {
    await banco.db.deleteFrom('admin_accounts').where('email', 'in', contasDoPainel).execute();
  }
  if (contasDoApp.length > 0) await banco.db.deleteFrom('users').where('id', 'in', contasDoApp).execute();
  await banco.close();
});

void describe('conta-admin criar', TEMPO, () => {
  void it('grava a conta e a trilha na mesma transacao, com o hash do login, e avisa os administradores', async () => {
    const endereco = email('criar');
    contasDoPainel.push(endereco);
    const { codigo, mostrado, avisos } = await executar(criar(endereco));
    assert.equal(codigo, SAIDA.OK, mostrado.join('\n'));
    const linha = await conta(endereco);
    assert.ok(linha !== undefined);
    assert.equal(linha.status, 'active');
    assert.equal(linha.role, 'admin');
    assert.ok(await verificarSenha(SENHA, linha.password_phc), 'o hash nao confere com a funcao do login');
    const trilhaDaConta = await eventos(linha.id);
    assert.deepEqual(trilhaDaConta.map((e) => e.action), ['admin.account.created']);
    assert.equal(trilhaDaConta[0]?.actor_kind, 'system');
    assert.equal(trilhaDaConta[0]?.actor_user_id, null);
    assert.equal(trilhaDaConta[0]?.actor_admin_id, null);
    assert.equal(trilhaDaConta[0]?.resource_kind, 'admin_account');
    assert.deepEqual(
      { operator: (trilhaDaConta[0]?.metadata as Record<string, unknown>)['operator'], command: (trilhaDaConta[0]?.metadata as Record<string, unknown>)['command'] },
      { operator: 'integracao', command: 'conta-admin' },
    );
    assert.ok(avisos.some((a) => a.para === endereco), 'o dono do endereco novo nao foi avisado');
    assert.ok(!JSON.stringify({ mostrado, avisos, trilhaDaConta }).includes(SENHA), 'a senha apareceu');
  });

  void it('ISCA: falha forcada da trilha nao deixa conta (D49)', async () => {
    const endereco = email('sem-trilha');
    contasDoPainel.push(endereco);
    const quebrada: TrilhaTransacional = {
      recordIn: async (trx, evento) => {
        await trilha.recordIn(trx, evento);
        throw new Error('falha forcada da trilha');
      },
    };
    await assert.rejects(() => executar(criar(endereco), { trilhaUsada: quebrada }), /falha forcada da trilha/);
    assert.equal(await conta(endereco), undefined, 'a conta ficou sem a linha de trilha');
  });

  void it('ISCA: 14 caracteres e senha da lista de vazadas recusados, e nada gravado', async () => {
    for (const senha of ['catorze-carac', VAZADA]) {
      const endereco = email('recusa');
      contasDoPainel.push(endereco);
      const { codigo } = await executar(criar(endereco), { senhas: [senha, senha] });
      assert.equal(codigo, SAIDA.SENHA_RECUSADA);
      assert.equal(await conta(endereco), undefined);
    }
  });

  void it('ISCA D63: a mesma senha da conta do app de mesmo e-mail e recusada; senha diferente passa', async () => {
    const endereco = email('d63');
    contasDoPainel.push(endereco);
    const criada = await criarIdentityRepository(banco.db, ids).criarContaLocal({
      email: endereco, displayName: 'Tutora', acceptedTermsVersion: undefined,
      passwordPhc: await gerarHashDeSenha(SENHA), agora: systemClock.now(),
    });
    assert.ok(criada !== undefined);
    contasDoApp.push(criada.id);

    const igual = await executar(criar(endereco));
    assert.equal(igual.codigo, SAIDA.SENHA_RECUSADA);
    assert.ok(igual.mostrado.some((t) => /D63/.test(t)));
    assert.equal(await conta(endereco), undefined);

    const diferente = await executar(criar(endereco), { senhas: [OUTRA, OUTRA] });
    assert.equal(diferente.codigo, SAIDA.OK, diferente.mostrado.join('\n'));
  });
});

void describe('conta-admin redefinir-senha, desativar, reativar e encerrar-sessoes', TEMPO, () => {
  async function contaPronta(prefixo: string): Promise<{ endereco: string; id: AdminAccountId }> {
    const endereco = email(prefixo);
    contasDoPainel.push(endereco);
    assert.equal((await executar(criar(endereco))).codigo, SAIDA.OK);
    const linha = await conta(endereco);
    assert.ok(linha !== undefined);
    return { endereco, id: linha.id as AdminAccountId };
  }

  void it('redefinir-senha derruba a sessao viva, empurra a barreira e limpa o bloqueio', async () => {
    const { endereco, id } = await contaPronta('redefinir');
    await sessaoViva(id);
    await banco.db.updateTable('admin_accounts').set({ blocked_reason: 'failed_logins', blocked_at: new Date() })
      .where('id', '=', id).execute();
    const antes = (await conta(endereco))?.sessions_invalid_before.getTime() ?? 0;

    const { codigo } = await executar(sobre('redefinir-senha', endereco), { senhas: [OUTRA, OUTRA] });
    assert.equal(codigo, SAIDA.OK);
    const linha = await conta(endereco);
    assert.equal(linha?.blocked_reason, null);
    assert.equal(linha?.blocked_at, null);
    assert.ok((linha?.sessions_invalid_before.getTime() ?? 0) >= antes);
    assert.ok(await verificarSenha(OUTRA, linha?.password_phc ?? ''));
    assert.equal(await vivas(id), 0);
    const revogada = await banco.db.selectFrom('admin_sessions').select('revoked_reason')
      .where('admin_account_id', '=', id).executeTakeFirstOrThrow();
    assert.equal(revogada.revoked_reason, 'password_reset');
    assert.deepEqual((await eventos(id)).map((e) => e.action), ['admin.account.created', 'admin.account.password_reset']);
  });

  void it('desativar derruba a sessao; conta desativada com sessao que sobrou recebe 403 da guarda', async () => {
    const { endereco, id } = await contaPronta('desativar');
    const cookie = await sessaoViva(id);
    const g = guarda();
    const antes = await g.conferir(cookie, contexto);
    assert.equal(antes.adminAccountId, id);

    assert.equal((await executar(sobre('desativar', endereco))).codigo, SAIDA.OK);
    assert.equal((await conta(endereco))?.status, 'disabled');
    assert.equal(await vivas(id), 0);
    const depois = await g.conferir(cookie, contexto).catch((e: unknown) => e);
    assert.ok(depois instanceof AppError && depois.status === 401, 'a sessao derrubada ainda passou pela guarda');

    // Uma sessao que sobrevivesse (gravada depois, por fora do comando): a guarda recusa com 403.
    await new Promise((r) => setTimeout(r, 5));
    const sobrevivente = await sessaoViva(id);
    const recusada = await g.conferir(sobrevivente, contexto).catch((e: unknown) => e);
    assert.ok(recusada instanceof AppError && recusada.status === 403, String(recusada));
    assert.equal(await vivas(id), 0);
  });

  void it('reativar exige senha nova e volta a ativa; encerrar-sessoes derruba sem trocar a senha', async () => {
    const { endereco, id } = await contaPronta('reativar');
    assert.equal((await executar(sobre('desativar', endereco))).codigo, SAIDA.OK);
    const curta = await executar(sobre('reativar', endereco), { senhas: ['catorze-carac', 'catorze-carac'] });
    assert.equal(curta.codigo, SAIDA.SENHA_RECUSADA);
    assert.equal((await conta(endereco))?.status, 'disabled');

    assert.equal((await executar(sobre('reativar', endereco), { senhas: [OUTRA, OUTRA] })).codigo, SAIDA.OK);
    const ativa = await conta(endereco);
    assert.equal(ativa?.status, 'active');
    assert.equal(ativa?.disabled_at, null);
    assert.ok(await verificarSenha(OUTRA, ativa?.password_phc ?? ''));

    await sessaoViva(id);
    const phcAntes = ativa?.password_phc;
    assert.equal((await executar(sobre('encerrar-sessoes', endereco), { senhas: [] })).codigo, SAIDA.OK);
    assert.equal(await vivas(id), 0);
    assert.equal((await conta(endereco))?.password_phc, phcAntes);
    assert.deepEqual(
      (await eventos(id)).map((e) => e.action),
      ['admin.account.created', 'admin.account.disabled', 'admin.account.enabled', 'admin.account.sessions_closed'],
    );
  });

  void it('conta inexistente sai 3 e nada nasce', async () => {
    const endereco = email('ninguem');
    const { codigo } = await executar(sobre('desativar', endereco));
    assert.equal(codigo, SAIDA.CONTA_INEXISTENTE);
    assert.equal(await conta(endereco), undefined);
  });
});
