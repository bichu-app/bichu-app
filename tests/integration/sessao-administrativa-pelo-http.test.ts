/**
 * **A sessao do backoffice e a guarda de `/v1/admin`, pela rota, contra
 * Postgres de verdade** (BICHUS-259; ADR-0027 itens 2, 3, 5, 7 e 8; provas
 * P16 e P17 e D35, D36, D37, D38, D39, D40, D42 e D44 de
 * `docs/04-seguranca.md`).
 *
 * ## P16: a matriz gerada do contrato
 *
 * Para TODA operacao `/admin/` do contrato que tem rota neste servidor, exceto
 * o login, seis tentativas: sem `X-Internal-Surface` (404), sem cookie (401),
 * `Bearer` valido de conta `admin` (401), sessao de conta `tutor` (403), sessao
 * cujo papel foi removido (403) e, nas escritas, sem `X-CSRF-Token` e com
 * `Origin` de subdominio irmao (403). **Reprova com zero operacoes.** A lista
 * sai do contrato e das rotas registradas, entao a operacao da `Loja` ou da
 * `Rede` que subir entra na matriz sem ninguem editar este arquivo.
 *
 * ## P17: a trilha na mesma transacao, por operacao
 *
 * Cada escrita administrativa deste servidor e executada e a linha da trilha e
 * exigida pela correlacao. Depois, um SEGUNDO servidor, identico mas com a
 * trilha transacional quebrada, prova que a falha da trilha desfaz a escrita:
 * o login nao deixa sessao, e o logout nao derruba a sessao.
 *
 * ## Iscas: ver o relatorio da BICHUS-259
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hashDeToken, hmacDeEnderecoIp } from '../../src/shared/crypto/digest.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import { carregarContrato, type Contrato } from '../../src/shared/http/contract.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import { escoparRotas, type RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import { escoparRotasAdministrativas } from '../../src/shared/http/superficie-administrativa.js';
import type { RouteDefinition } from '../../src/shared/http/route-definition.js';
import type { UserId } from '../../src/shared/types/brands.js';
import {
  criarEscritaAuditada,
  criarTrilhaDeAuditoria,
  criarTrilhaTransacional,
} from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import type { TrilhaTransacional } from '../../src/modules/audit/ports/audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarSessaoAdministrativaRepository } from '../../src/modules/identity/adapters/persistence/kysely-sessao-administrativa-repository.js';
import {
  criarVerificadorDeReautenticacao,
  registrarRotasDeIdentidade,
} from '../../src/modules/identity/adapters/http/routes.js';
import { registrarRotasDaSessaoAdministrativa } from '../../src/modules/identity/adapters/http/admin-session-routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import {
  criarSessaoAdministrativaService,
  type SessaoAdministrativaService,
} from '../../src/modules/identity/application/sessao-administrativa-service.js';
import { gerarHashDeSenha } from '../../src/modules/identity/domain/password.js';
import { derivarTokenAntiCsrf } from '../../src/modules/identity/domain/sessao-administrativa.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';
import { listaDeSenhasVazadasIndisponivel } from '../../src/modules/identity/ports/lista-de-senhas-vazadas.js';

const ORIGEM = 'https://painel.exemplo.test';
const IRMAO = 'https://exemplo.test';
const SENHA = 'uma frase longa que so a operacao conhece';
const CAPTCHA_BOM = 'token-de-captcha-que-o-duble-aprova-0123456789';

interface Servidor {
  readonly app: RegistradorDeRotas;
  readonly base: string;
  readonly sessoes: SessaoAdministrativaService;
  readonly rotasAdministrativas: RouteDefinition[];
}

let banco: { db: Db; close: () => Promise<void> };
let contrato: Contrato;
let principal: Servidor;
let comTrilhaQuebrada: Servidor;
let phc: string;
const contas: UserId[] = [];
const caixa: Mensagem[] = [];
let assinador: ReturnType<typeof criarTokenSigner>;

async function subir(trilhaQuebrada: boolean): Promise<Servidor> {
  const config = loadAppConfig();
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const trilha = criarTrilhaDeAuditoria({
    db, ids, clock: systemClock, ipHmacKey: config.ipHmacKey,
    onFailure: (erro) => console.error('trilha nao gravou:', erro),
  });
  const real = criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey });
  const quebrada: TrilhaTransacional = {
    recordIn: async (trx, evento) => {
      await real.recordIn(trx, evento);
      throw new Error('falha forcada da trilha (P17)');
    },
  };
  const repositorio = criarIdentityRepository(db, ids);
  const mailer: Mailer = { enviar: (m) => { caixa.push(m); return Promise.resolve(); } };

  const sessoes = criarSessaoAdministrativaService({
    sessoes: criarSessaoAdministrativaRepository(db),
    identidade: repositorio,
    escrita: criarEscritaAuditada({ db, trilha: trilhaQuebrada ? quebrada : real }),
    trilha,
    captcha: { avaliar: (token) => Promise.resolve(token === CAPTCHA_BOM ? 0.9 : undefined) },
    senhasVazadas: listaDeSenhasVazadasIndisponivel,
    mailer,
    ids,
    clock: systemClock,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    baseDaWeb: config.webBaseUrl,
    registrarOcorrencia: () => {},
  });

  const auth = criarAuthService({
    repositorio, assinador, trilha, ids, clock: systemClock, janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey), mailer,
    registrarOcorrencia: () => {}, baseDaWeb: config.webBaseUrl,
    avisarTitular: () => Promise.resolve(),
  });
  const deps = { auth, assinador, contrato, issuer: config.token.issuer, apiBaseUrl: config.apiBaseUrl };

  const rotasAdministrativas: RouteDefinition[] = [];
  const app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: false,
    teto: tetoDeTeste(),
    reautenticacao: criarVerificadorDeReautenticacao(deps),
    destinoDoLog: { write: () => {} },
  });
  app.addHook('onRoute', (opcoes) => {
    const rota = (opcoes.config as { rotaDeclarada?: RouteDefinition } | undefined)?.rotaDeclarada;
    if (rota !== undefined && rota.path.startsWith('/admin/')) rotasAdministrativas.push(rota);
  });
  await escoparRotas(app, '/v1', (v1) => {
    registrarRotasDeIdentidade(v1, deps);
    escoparRotasAdministrativas(v1, { origem: ORIGEM, sessoes }, (adm) => {
      registrarRotasDaSessaoAdministrativa(adm, { sessoes, contrato });
    });
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const endereco = app.server.address() as AddressInfo;
  return { app, base: `http://127.0.0.1:${String(endereco.port)}`, sessoes, rotasAdministrativas };
}

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown> | undefined;
  readonly cabecalhos: Headers;
}

async function chamar(
  servidor: Servidor,
  metodo: string,
  caminho: string,
  opcoes: { cabecalhos?: Record<string, string>; corpo?: unknown; ip?: string; semSuperficie?: boolean } = {},
): Promise<Resposta> {
  const cabecalhos: Record<string, string> = {
    accept: 'application/json',
    'x-forwarded-for': opcoes.ip ?? `198.51.100.${String(Math.floor(Math.random() * 250) + 1)}`,
    ...(opcoes.semSuperficie === true ? {} : { 'x-internal-surface': 'admin' }),
    ...opcoes.cabecalhos,
  };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  const resposta = await fetch(`${servidor.base}/v1${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    corpo: texto === '' ? undefined : (JSON.parse(texto) as Record<string, unknown>),
    cabecalhos: resposta.headers,
  };
}

function tipo(resposta: Resposta): string {
  const t = resposta.corpo?.['type'];
  return typeof t === 'string' ? (t.split('/').pop() ?? '') : '';
}

async function conta(papeis: readonly string[]): Promise<{ id: UserId; email: string }> {
  const email = `painel-${randomUUID().slice(0, 8)}@exemplo.invalid`;
  const ids = criarIdGenerator(() => systemClock.now());
  const criada = await criarIdentityRepository(banco.db, ids).criarContaLocal({
    email, displayName: 'Operacao', acceptedTermsVersion: undefined, passwordPhc: phc, agora: systemClock.now(),
  });
  assert.ok(criada !== undefined);
  contas.push(criada.id);
  for (const papel of papeis.filter((p) => p !== 'tutor')) {
    await banco.db.insertInto('user_roles').values({ user_id: criada.id, role: papel as 'admin' }).execute();
  }
  return { id: criada.id, email };
}

interface SessaoDeTeste {
  readonly cookie: string;
  readonly csrf: string;
  readonly id: string;
}

/**
 * Uma sessao gravada direto no banco, para a matriz: e a unica forma de ter
 * sessao de TUTOR (o login nunca a abre) e poupa uma derivacao de senha por
 * caso. O caminho do login e provado no seu proprio bloco.
 */
async function sessaoDireta(userId: UserId): Promise<SessaoDeTeste> {
  const valor = `sessao-${randomUUID()}-${randomUUID()}`;
  const agora = systemClock.now();
  const id = randomUUID();
  await banco.db.insertInto('admin_sessions').values({
    id,
    user_id: userId,
    token_hash: hashDeToken(valor),
    csrf_token_hash: hashDeToken(derivarTokenAntiCsrf(valor)),
    created_at: new Date(agora),
    last_seen_at: new Date(agora),
    idle_expires_at: new Date(agora + 30 * 60_000),
    absolute_expires_at: new Date(agora + 12 * 3_600_000),
  }).execute();
  return { cookie: `__Host-bichu_adm=${valor}`, csrf: derivarTokenAntiCsrf(valor), id };
}

function comSessao(sessao: SessaoDeTeste, extra: Record<string, string> = {}): Record<string, string> {
  return { cookie: sessao.cookie, origin: ORIGEM, 'x-csrf-token': sessao.csrf, ...extra };
}

async function entrar(servidor: Servidor, email: string, ip?: string): Promise<{ resposta: Resposta; sessao: SessaoDeTeste }> {
  const resposta = await chamar(servidor, 'POST', '/admin/auth/login', {
    cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM },
    corpo: { email, password: SENHA },
    ...(ip === undefined ? {} : { ip }),
  });
  const setCookie = resposta.cabecalhos.get('set-cookie') ?? '';
  const valor = /__Host-bichu_adm=([^;]+)/.exec(setCookie)?.[1] ?? '';
  return {
    resposta,
    sessao: { cookie: `__Host-bichu_adm=${valor}`, csrf: typeof resposta.corpo?.['csrf_token'] === 'string' ? resposta.corpo['csrf_token'] : '', id: '' },
  };
}

async function eventosDa(correlacao: string): Promise<string[]> {
  const linhas = await banco.db.selectFrom('audit.events').select('action')
    .where('correlation_id', '=', correlacao).execute();
  return linhas.map((l) => l.action);
}

before(async () => {
  const config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  contrato = carregarContrato(config.openapiSpecPath);
  assinador = criarTokenSigner(config.token);
  phc = await gerarHashDeSenha(SENHA);
  principal = await subir(false);
  comTrilhaQuebrada = await subir(true);
});

after(async () => {
  await principal?.app.close();
  await comTrilhaQuebrada?.app.close();
  for (const id of contas) await banco.db.deleteFrom('users').where('id', '=', id).execute();
  await banco?.close();
});

function caminhoDe(rota: RouteDefinition): string {
  return rota.path.replace(/:([^/]+)/g, 'x');
}

void describe('P16: a matriz da guarda, gerada do contrato (D33, D36, D37, D39)', () => {
  void it('toda operacao /admin/ com rota recusa as seis tentativas, e ha operacoes para conferir', async () => {
    const operacoes = [...contrato.operacoes.values()].filter(
      (op) => op.path.startsWith('/admin/') && op.operationId !== 'openAdminSession',
    );
    const rotas = principal.rotasAdministrativas.filter((rota) =>
      operacoes.some((op) => op.operationId === rota.operationId),
    );
    assert.ok(rotas.length > 0, 'a matriz tem zero operacoes: nada foi conferido');

    const falhas: string[] = [];
    const confere = (rota: RouteDefinition, caso: string, obtido: Resposta, esperado: number): void => {
      if (obtido.status !== esperado) falhas.push(`${rota.operationId} ${caso}: ${String(obtido.status)} (esperado ${String(esperado)})`);
    };

    for (const rota of rotas) {
      const metodo = rota.method.toUpperCase();
      const caminho = caminhoDe(rota);
      const escrita = rota.method !== 'get';
      const corpo = escrita ? {} : undefined;
      const admin = await conta(['admin']);

      const valida = await sessaoDireta(admin.id);
      confere(rota, 'sem X-Internal-Surface', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(valida), corpo, semSuperficie: true }), 404);
      confere(rota, 'sem cookie', await chamar(principal, metodo, caminho, { cabecalhos: { origin: ORIGEM }, corpo }), 401);

      const bearer = assinador.emitir(admin.id, systemClock.now(), randomUUID(), randomUUID()).token;
      confere(rota, 'Bearer de admin', await chamar(principal, metodo, caminho, { cabecalhos: { origin: ORIGEM, authorization: `Bearer ${bearer}` }, corpo }), 401);

      const tutor = await conta(['tutor']);
      confere(rota, 'cookie de tutor', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(await sessaoDireta(tutor.id)), corpo }), 403);

      if (escrita) {
        confere(rota, 'sem CSRF', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(valida, { 'x-csrf-token': '' }), corpo }), 403);
        confere(rota, 'Origin errado', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(valida, { origin: IRMAO }), corpo }), 403);
      }

      const removido = await conta(['admin']);
      const daRemovida = await sessaoDireta(removido.id);
      await banco.db.deleteFrom('user_roles').where('user_id', '=', removido.id).where('role', '=', 'admin').execute();
      confere(rota, 'papel removido', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(daRemovida), corpo }), 403);
    }

    assert.deepEqual(falhas, [], `a guarda deixou passar:\n${falhas.join('\n')}`);
  });
});

void describe('login administrativo (D35, D41, D44, D46)', () => {
  void it('abre a sessao com o cookie na forma exata de D35, e o corpo de AdminSession', async () => {
    const admin = await conta(['admin']);
    const antes = caixa.length;
    const { resposta } = await entrar(principal, admin.email);
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

    const setCookie = resposta.cabecalhos.get('set-cookie') ?? '';
    const partes = setCookie.split(';').map((p) => p.trim());
    assert.match(partes[0] ?? '', /^__Host-bichu_adm=[A-Za-z0-9_-]{43,}$/);
    assert.deepEqual(partes.slice(1).sort(), ['HttpOnly', 'Path=/', 'SameSite=Strict', 'Secure']);
    assert.ok(!/domain|expires|max-age/i.test(setCookie), `atributo proibido em ${setCookie}`);

    assert.deepEqual(Object.keys(resposta.corpo ?? {}).sort(), [
      'absolute_expires_at', 'csrf_token', 'display_name', 'idle_expires_at', 'roles',
    ]);
    assert.deepEqual(resposta.corpo?.['roles'], ['admin']);
    assert.equal(caixa.length, antes + 1, 'o aviso de sessao aberta nao saiu (D46)');
    assert.match(caixa.at(-1)?.corpo ?? '', /nao-fui-eu\?token=/);
  });

  void it('conta inexistente, senha errada e tutor com a senha certa: o MESMO 401', async () => {
    const tutor = await conta(['tutor']);
    const admin = await conta(['admin']);
    const pedir = (email: string, password: string): Promise<Resposta> =>
      chamar(principal, 'POST', '/admin/auth/login', {
        cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email, password },
      });
    const respostas = [
      await pedir(`ninguem-${randomUUID().slice(0, 6)}@exemplo.invalid`, SENHA),
      await pedir(admin.email, 'outra frase longa qualquer aqui'),
      await pedir(tutor.email, SENHA),
    ];
    const sem = respostas.map((r) => ({ status: r.status, type: tipo(r), title: r.corpo?.['title'], detail: r.corpo?.['detail'] }));
    assert.equal(sem[0]?.status, 401);
    assert.deepEqual(sem[1], sem[0]);
    assert.deepEqual(sem[2], sem[0]);
  });

  void it('sem X-Captcha-Token, ou com token que o verificador recusa: 403 captcha-rejected', async () => {
    const admin = await conta(['admin']);
    for (const cabecalhos of [{ origin: ORIGEM }, { origin: ORIGEM, 'x-captcha-token': 'recusado-pelo-duble-0123456789' }]) {
      const resposta = await chamar(principal, 'POST', '/admin/auth/login', { cabecalhos, corpo: { email: admin.email, password: SENHA } });
      assert.equal(resposta.status, 403);
      assert.equal(tipo(resposta), 'captcha-rejected');
    }
  });

  void it('D44: o bloqueio por e-mail vale igual para conta que existe e para e-mail que nao existe', async () => {
    const admin = await conta(['admin']);
    const inexistente = `ninguem-${randomUUID().slice(0, 6)}@exemplo.invalid`;
    const bloqueios: Resposta[] = [];
    for (const email of [admin.email, inexistente]) {
      for (let i = 0; i < 5; i += 1) {
        const r = await chamar(principal, 'POST', '/admin/auth/login', {
          cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email, password: 'errada errada errada' },
        });
        assert.equal(r.status, 401, `tentativa ${String(i + 1)} de ${email}`);
      }
      // A sexta, AGORA com a senha certa no caso da conta que existe: bloqueada igual.
      bloqueios.push(await chamar(principal, 'POST', '/admin/auth/login', {
        cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email, password: SENHA },
      }));
    }
    const [daConta, doInexistente] = bloqueios;
    assert.ok(daConta !== undefined && doInexistente !== undefined);
    assert.equal(daConta.status, 429);
    assert.ok(Number(daConta.cabecalhos.get('retry-after')) > 0, 'sem Retry-After');
    assert.deepEqual(
      { status: doInexistente.status, type: tipo(doInexistente), title: doInexistente.corpo?.['title'] },
      { status: daConta.status, type: tipo(daConta), title: daConta.corpo?.['title'] },
    );
  });

  void it('login com Origin de subdominio irmao: 403, e nenhuma sessao', async () => {
    const admin = await conta(['admin']);
    const resposta = await chamar(principal, 'POST', '/admin/auth/login', {
      cabecalhos: { origin: IRMAO, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email: admin.email, password: SENHA },
    });
    assert.equal(resposta.status, 403);
    const vivas = await banco.db.selectFrom('admin_sessions').select('id').where('user_id', '=', admin.id).execute();
    assert.equal(vivas.length, 0);
  });
});

void describe('ciclo da sessao (D38, D39, D40)', () => {
  void it('GET /admin/session devolve o mesmo csrf_token do login, e o F5 continua valendo', async () => {
    const admin = await conta(['admin']);
    const { resposta, sessao } = await entrar(principal, admin.email);
    const leitura = await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: sessao.cookie } });
    assert.equal(leitura.status, 200);
    assert.equal(leitura.corpo?.['csrf_token'], resposta.corpo?.['csrf_token']);
  });

  void it('o token anti-CSRF de OUTRA sessao nao serve (D39)', async () => {
    const a = await sessaoDireta((await conta(['admin'])).id);
    const b = await sessaoDireta((await conta(['admin'])).id);
    const resposta = await chamar(principal, 'POST', '/admin/auth/logout', { cabecalhos: comSessao(a, { 'x-csrf-token': b.csrf }) });
    assert.equal(resposta.status, 403);
  });

  void it('31 min sem uso e 12 h desde a senha derrubam a sessao (D38)', async () => {
    const admin = await conta(['admin']);
    const inativa = await sessaoDireta(admin.id);
    await banco.db.updateTable('admin_sessions').set({ idle_expires_at: new Date(Date.now() - 1_000) })
      .where('token_hash', '=', hashDeToken(inativa.cookie.split('=')[1] ?? '')).execute();
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: inativa.cookie } })).status, 401);

    const vencida = await sessaoDireta(admin.id);
    const hash = hashDeToken(vencida.cookie.split('=')[1] ?? '');
    const antes = new Date(Date.now() - 12 * 3_600_000 - 60_000);
    await banco.db.updateTable('admin_sessions')
      .set({
        created_at: antes,
        idle_expires_at: new Date(antes.getTime() + 12 * 3_600_000),
        absolute_expires_at: new Date(antes.getTime() + 12 * 3_600_000),
      })
      .where('token_hash', '=', hash).execute();
    const r = await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: vencida.cookie } });
    assert.equal(r.status, 401);
    assert.equal(tipo(r), 'token-expired');
  });

  void it('papel removido: 403 na proxima chamada, e zero sessoes vivas da conta depois (D38)', async () => {
    const admin = await conta(['admin']);
    const sessao = await sessaoDireta(admin.id);
    await sessaoDireta(admin.id);
    await banco.db.deleteFrom('user_roles').where('user_id', '=', admin.id).where('role', '=', 'admin').execute();
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: sessao.cookie } })).status, 403);
    const vivas = await banco.db.selectFrom('admin_sessions').select('id')
      .where('user_id', '=', admin.id).where('revoked_at', 'is', null).execute();
    assert.equal(vivas.length, 0);
  });

  void it('logout: 204, apaga o cookie, e o identificador deixa de valer', async () => {
    const admin = await conta(['admin']);
    const sessao = await sessaoDireta(admin.id);
    const correlacao = randomUUID();
    const r = await chamar(principal, 'POST', '/admin/auth/logout', { cabecalhos: comSessao(sessao, { 'x-correlation-id': correlacao }) });
    assert.equal(r.status, 204);
    assert.match(r.cabecalhos.get('set-cookie') ?? '', /__Host-bichu_adm=;.*Max-Age=0/);
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: sessao.cookie } })).status, 401);
    assert.deepEqual(await eventosDa(correlacao), ['admin.session.closed']);
  });

  void it('logout-all derruba as outras sessoes da conta e grava a trilha', async () => {
    const admin = await conta(['admin']);
    const uma = await sessaoDireta(admin.id);
    const outra = await sessaoDireta(admin.id);
    const correlacao = randomUUID();
    const r = await chamar(principal, 'POST', '/admin/auth/logout-all', { cabecalhos: comSessao(uma, { 'x-correlation-id': correlacao }) });
    assert.equal(r.status, 204);
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: outra.cookie } })).status, 401);
    assert.deepEqual(await eventosDa(correlacao), ['admin.session.all_closed']);
    // Quem entra de novo depois do "sair de todas" entra, e nao cai na barreira.
    const { resposta, sessao } = await entrar(principal, admin.email);
    assert.equal(resposta.status, 200);
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: sessao.cookie } })).status, 200);
  });

  void it('reauth: senha errada 401; certa rotaciona a sessao e abre a janela de um escopo (D40)', async () => {
    const admin = await conta(['admin']);
    const { resposta: login, sessao } = await entrar(principal, admin.email);

    const errada = await chamar(principal, 'POST', '/admin/auth/reauth', {
      cabecalhos: comSessao(sessao), corpo: { password: 'nao e esta a senha dela', scope: 'store_item_retirement' },
    });
    assert.equal(errada.status, 401);
    assert.equal(tipo(errada), 'invalid-credentials');

    const extra = await chamar(principal, 'POST', '/admin/auth/reauth', {
      cabecalhos: comSessao(sessao), corpo: { password: SENHA, scope: 'store_item_retirement', ttl: 9999 },
    });
    assert.equal(extra.status, 400, 'campo fora do corpo fechado precisa ser recusado, e nao apagado');

    const correlacao = randomUUID();
    const certa = await chamar(principal, 'POST', '/admin/auth/reauth', {
      cabecalhos: comSessao(sessao, { 'x-correlation-id': correlacao }), corpo: { password: SENHA, scope: 'store_item_retirement' },
    });
    assert.equal(certa.status, 200, JSON.stringify(certa.corpo));
    assert.equal(certa.corpo?.['expires_in'], 300);
    assert.equal(certa.corpo?.['scope'], 'store_item_retirement');
    assert.notEqual(certa.corpo?.['csrf_token'], sessao.csrf);
    assert.deepEqual(await eventosDa(correlacao), ['admin.session.reauthenticated']);

    // O identificador anterior deixou de valer (fixacao de sessao, D38).
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: sessao.cookie } })).status, 401);
    const setCookie = certa.cabecalhos.get('set-cookie') ?? '';
    const valor = /__Host-bichu_adm=([^;]+)/.exec(setCookie)?.[1] ?? '';
    const nova = await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: `__Host-bichu_adm=${valor}` } });
    assert.equal(nova.status, 200);
    // O teto de 12 horas nao renasce na reautenticacao.
    assert.equal(nova.corpo?.['absolute_expires_at'], login.corpo?.['absolute_expires_at']);

    // A janela: uso unico, um escopo, presa a sessao nova.
    const conferida = await principal.sessoes.conferir(valor, { correlationId: randomUUID(), ip: undefined, userAgent: undefined });
    const token = String(certa.corpo?.['reauth_token']);
    await assert.rejects(principal.sessoes.consumirReautenticacao(conferida, 'network_event_removal', token, contextoVazio()));
    await principal.sessoes.consumirReautenticacao(conferida, 'store_item_retirement', token, contextoVazio());
    await assert.rejects(principal.sessoes.consumirReautenticacao(conferida, 'store_item_retirement', token, contextoVazio()));
  });
});

function contextoVazio(): { correlationId: string; ip: undefined; userAgent: undefined } {
  return { correlationId: randomUUID(), ip: undefined, userAgent: undefined };
}


void describe('D42: conta dedicada nao entra pela porta do tutor', () => {
  void it('admin com a senha certa em /v1/auth/login: o mesmo 401 da senha errada', async () => {
    const admin = await conta(['admin']);
    const certa = await chamar(principal, 'POST', '/auth/login', { corpo: { email: admin.email, password: SENHA }, semSuperficie: true });
    const errada = await chamar(principal, 'POST', '/auth/login', { corpo: { email: admin.email, password: 'outra frase longa errada' }, semSuperficie: true });
    assert.equal(certa.status, 401);
    assert.deepEqual(
      { type: tipo(certa), title: certa.corpo?.['title'], detail: certa.corpo?.['detail'] },
      { type: tipo(errada), title: errada.corpo?.['title'], detail: errada.corpo?.['detail'] },
    );
  });

  void it('refresh do app de conta que ganhou papel: 401', async () => {
    const tutor = await conta(['tutor']);
    const login = await chamar(principal, 'POST', '/auth/login', { corpo: { email: tutor.email, password: SENHA }, semSuperficie: true });
    assert.equal(login.status, 200, JSON.stringify(login.corpo));
    await banco.db.insertInto('user_roles').values({ user_id: tutor.id, role: 'admin' }).execute();
    const renovar = await chamar(principal, 'POST', '/auth/refresh', {
      corpo: { refresh_token: login.corpo?.['refresh_token'] }, semSuperficie: true,
    });
    assert.equal(renovar.status, 401);
  });
});

void describe('P17: a trilha na mesma transacao, por operacao da sessao', () => {
  void it('toda escrita administrativa deste servidor grava a sua acao na trilha', async () => {
    const escritas = principal.rotasAdministrativas.filter((rota) => rota.method !== 'get');
    assert.ok(escritas.length > 0, 'nenhuma escrita administrativa registrada: P17 sem o que conferir');
    const admin = await conta(['admin']);
    const faltando: string[] = [];
    for (const rota of escritas) {
      const correlacao = randomUUID();
      let resposta: Resposta;
      if (rota.adminPublic === true) {
        resposta = await chamar(principal, 'POST', rota.path, {
          cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM, 'x-correlation-id': correlacao },
          corpo: { email: admin.email, password: SENHA },
        });
      } else {
        const corpo = rota.operationId === 'reauthenticateAdmin' ? { password: SENHA, scope: 'store_item_retirement' } : undefined;
        resposta = await chamar(principal, 'POST', rota.path, {
          cabecalhos: comSessao(await sessaoDireta(admin.id), { 'x-correlation-id': correlacao }), corpo,
        });
      }
      const acoes = await eventosDa(correlacao);
      if (resposta.status >= 300 || !acoes.includes(rota.audit?.action ?? '')) {
        faltando.push(`${rota.operationId}: ${String(resposta.status)} ${JSON.stringify(acoes)}`);
      }
    }
    assert.deepEqual(faltando, []);
  });

  void it('falha da trilha: o login nao deixa sessao, e o logout nao derruba a sessao', async () => {
    const admin = await conta(['admin']);
    const login = await chamar(comTrilhaQuebrada, 'POST', '/admin/auth/login', {
      cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email: admin.email, password: SENHA },
    });
    assert.equal(login.status, 500);
    const sessoes = await banco.db.selectFrom('admin_sessions').select('id').where('user_id', '=', admin.id).execute();
    assert.equal(sessoes.length, 0, 'a sessao ficou gravada sem a trilha');

    const viva = await sessaoDireta(admin.id);
    const logout = await chamar(comTrilhaQuebrada, 'POST', '/admin/auth/logout', { cabecalhos: comSessao(viva) });
    assert.equal(logout.status, 500);
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: viva.cookie } })).status, 200);
  });
});
