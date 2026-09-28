/**
 * **A sessao do backoffice e a guarda de `/v1/admin`, pela rota, contra
 * Postgres de verdade** (ADR-0027 itens 2, 3, 5, 7, 8 e 20; provas P16, P17 e
 * P21 e D35, D36, D37, D38, D39, D40, D42, D43 e D44 de `docs/04-seguranca.md`).
 *
 * A conta do painel mora em `admin_accounts` (item 20), e este arquivo a cria
 * la. Conta do app, quando aparece, e de `users`, e e a outra porta.
 *
 * ## P16: a matriz gerada do contrato
 *
 * Para TODA operacao `/admin/` do contrato que tem rota neste servidor, exceto
 * as que dispensam sessao, as tentativas: sem `X-Internal-Surface` (404), sem
 * cookie (401), `Bearer` valido de conta do app (401), sessao de conta
 * desativada (403) e, nas escritas, sem `X-CSRF-Token` e com `Origin` de
 * subdominio irmao (403). **Reprova com zero operacoes.** A lista sai do
 * contrato e das rotas registradas, entao a operacao da `Loja` ou da `Rede`
 * que subir entra na matriz sem ninguem editar este arquivo.
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
import { randomBytes, randomUUID } from 'node:crypto';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hashDeToken, hmacDeEnderecoIp } from '../../src/shared/crypto/digest.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import { carregarContrato, type Contrato } from '../../src/shared/http/contract.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import { escoparRotas, type RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import {
  OPERACOES_ADMINISTRATIVAS_SEM_SESSAO,
  escoparRotasAdministrativas,
} from '../../src/shared/http/superficie-administrativa.js';
import { defineRoute, type RouteDefinition } from '../../src/shared/http/route-definition.js';
import { registrarRota } from '../../src/shared/http/registrar-rota.js';
import type { AdminAccountId, UserId } from '../../src/shared/types/brands.js';
import {
  criarEscritaAuditada,
  criarTrilhaDeAuditoria,
  criarTrilhaTransacional,
} from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import type { TrilhaTransacional } from '../../src/modules/audit/ports/audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarSessaoAdministrativaRepository } from '../../src/modules/admin-access/adapters/persistence/kysely-sessao-administrativa-repository.js';
import { criarRepositorioDeContasAdministrativas } from '../../src/modules/admin-access/adapters/persistence/kysely-contas-administrativas.js';
import {
  criarVerificadorDeReautenticacao,
  registrarRotasDeIdentidade,
} from '../../src/modules/identity/adapters/http/routes.js';
import { registrarRotasDaSessaoAdministrativa } from '../../src/modules/admin-access/adapters/http/admin-session-routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import {
  criarSessaoAdministrativaService,
  type SessaoAdministrativaService,
} from '../../src/modules/admin-access/application/sessao-administrativa-service.js';
import { gerarHashDeSenha } from '../../src/modules/identity/ports/senha.js';
import { derivarTokenAntiCsrf } from '../../src/modules/admin-access/domain/sessao-administrativa.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';
import type { ListaDeSenhasVazadas } from '../../src/modules/identity/ports/lista-de-senhas-vazadas.js';

const ORIGEM = 'https://painel.exemplo.test';
const IRMAO = 'https://exemplo.test';
const SENHA = 'uma frase longa que so a operacao conhece';
/** A dubla da base de vazadas diz que ESTA senha vazou, e nada sabe das outras. */
const SENHA_VAZADA = 'uma frase longa que ja apareceu num vazamento';
const vazadas: ListaDeSenhasVazadas = {
  contem: (senha) => Promise.resolve(senha === SENHA_VAZADA ? true : 'desconhecido'),
};
const CAPTCHA_BOM = 'token-de-captcha-que-o-duble-aprova-0123456789';

/**
 * Duas operacoes sensiveis de TESTE, fora do contrato, cada uma exigindo um
 * escopo: e o par "mover o encontro" e "trocar o acesso" que o painel grava
 * junto. As rotas reais sao da `Rede`, em outra branch; o portao de
 * `X-Admin-Reauth-Token` e o mesmo para qualquer rota que declare o escopo.
 */
const rotaDeTesteMover = defineRoute({
  operationId: 'testeMoverEncontro',
  method: 'post',
  path: '/admin/teste/mover',
  effects: [],
  adminRoles: ['admin'],
  adminReauthScope: 'network_event_relocation',
  audit: { action: 'admin.network_event.relocated', resourceKind: 'network_event' },
});
const rotaDeTesteAcesso = defineRoute({
  operationId: 'testeTrocarAcesso',
  method: 'post',
  path: '/admin/teste/acesso',
  effects: [],
  adminRoles: ['admin'],
  adminReauthScope: 'network_event_access_change',
  audit: { action: 'admin.network_event.updated', resourceKind: 'network_event' },
});

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
let phcVazada: string;
const contasDoApp: UserId[] = [];
const contasDoPainel: AdminAccountId[] = [];
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
    contas: criarRepositorioDeContasAdministrativas(db),
    escrita: criarEscritaAuditada({ db, trilha: trilhaQuebrada ? quebrada : real }),
    trilha,
    captcha: { avaliar: (token: string | undefined) => Promise.resolve(token === CAPTCHA_BOM ? 0.9 : undefined) },
    senhasVazadas: vazadas,
    avisos: mailer,
    ids,
    clock: systemClock,
    hmacDeIp: (ip: string | undefined) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    origemDoPainel: ORIGEM,
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
      registrarRota(adm, rotaDeTesteMover, {}, async (_r, reply) => reply.status(204).send());
      registrarRota(adm, rotaDeTesteAcesso, {}, async (_r, reply) => reply.status(204).send());
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
    // A faixa /24 muda a cada chamada, e nao so o ultimo octeto: o HMAC de IP
    // reduz o endereco a /24 antes de virar chave de balde (SEC-010), entao
    // `198.51.100.x` era UM balde so, e as tentativas invalidas do arquivo
    // inteiro somavam no teto de 20 por hora do login.
    'x-forwarded-for': opcoes.ip ?? `10.${String(Math.floor(Math.random() * 250) + 1)}.${String(Math.floor(Math.random() * 250) + 1)}.7`,
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

/**
 * Uma conta do PAINEL, gravada em `admin_accounts`. O hash e o de uma senha de
 * teste gerada aqui; nenhuma senha real passa por este arquivo.
 */
async function contaDoPainel(
  opcoes: { email?: string; phc?: string } = {},
): Promise<{ id: AdminAccountId; email: string }> {
  const email = opcoes.email ?? `painel-${randomUUID().slice(0, 8)}@exemplo.invalid`;
  const id = randomUUID() as AdminAccountId;
  await banco.db.insertInto('admin_accounts').values({
    id,
    email,
    display_name: 'Operacao',
    password_phc: opcoes.phc ?? phc,
    password_updated_at: new Date(),
  }).execute();
  contasDoPainel.push(id);
  return { id, email };
}

/** Uma conta do APP, em `users`, pela porta do app. E a outra porta, e nunca abre o painel. */
async function contaDoApp(opcoes: { email?: string; phc?: string } = {}): Promise<{ id: UserId; email: string }> {
  const email = opcoes.email ?? `app-${randomUUID().slice(0, 8)}@exemplo.invalid`;
  const ids = criarIdGenerator(() => systemClock.now());
  const criada = await criarIdentityRepository(banco.db, ids).criarContaLocal({
    email, displayName: 'Tutora', acceptedTermsVersion: undefined, passwordPhc: opcoes.phc ?? phc, agora: systemClock.now(),
  });
  assert.ok(criada !== undefined);
  contasDoApp.push(criada.id);
  return { id: criada.id, email };
}

async function desativar(id: AdminAccountId): Promise<void> {
  await banco.db.updateTable('admin_accounts').set({ status: 'disabled', disabled_at: new Date() })
    .where('id', '=', id).execute();
}

async function sessoesVivas(id: AdminAccountId): Promise<number> {
  const vivas = await banco.db.selectFrom('admin_sessions').select('id')
    .where('admin_account_id', '=', id).where('revoked_at', 'is', null).execute();
  return vivas.length;
}

/**
 * Um link "nao fui eu" gravado direto, com um token de teste de 43 caracteres
 * (a forma de 256 bits em base64url que o contrato exige).
 */
async function avisoDireto(
  adminAccountId: AdminAccountId,
  opcoes: { expiraEmMs?: number } = {},
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await banco.db.insertInto('admin_session_alerts').values({
    id: randomUUID(),
    admin_account_id: adminAccountId,
    session_id: null,
    token_hash: hashDeToken(token),
    expires_at: new Date(Date.now() + (opcoes.expiraEmMs ?? 7 * 24 * 3_600_000)),
  }).execute();
  return token;
}

/** Espera o envio que o servico dispara sem `await` (o aviso de senha vazada). */
async function esperarCaixa(condicao: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condicao(); i += 1) await new Promise((r) => setTimeout(r, 20));
}

interface SessaoDeTeste {
  readonly cookie: string;
  readonly csrf: string;
  readonly id: string;
}

/**
 * Uma sessao gravada direto no banco, para a matriz: poupa uma derivacao de
 * senha por caso. O caminho do login e provado no seu proprio bloco.
 */
async function sessaoDireta(adminAccountId: AdminAccountId): Promise<SessaoDeTeste> {
  const valor = `sessao-${randomUUID()}-${randomUUID()}`;
  // Nunca antes da barreira da conta, como o login faz (`instanteDaSenha`):
  // depois de um "sair de todas" a barreira fica ate um segundo a frente do
  // relogio, e uma sessao gravada com `agora` nasceria revogada.
  const { sessions_invalid_before: barreira } = await banco.db.selectFrom('admin_accounts')
    .select('sessions_invalid_before').where('id', '=', adminAccountId).executeTakeFirstOrThrow();
  const agora = Math.max(systemClock.now(), barreira.getTime());
  const id = randomUUID();
  await banco.db.insertInto('admin_sessions').values({
    id,
    admin_account_id: adminAccountId,
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
  phcVazada = await gerarHashDeSenha(SENHA_VAZADA);
  principal = await subir(false);
  comTrilhaQuebrada = await subir(true);
});

after(async () => {
  await principal?.app.close();
  await comTrilhaQuebrada?.app.close();
  for (const id of contasDoApp) await banco.db.deleteFrom('users').where('id', '=', id).execute();
  for (const id of contasDoPainel) await banco.db.deleteFrom('admin_accounts').where('id', '=', id).execute();
  await banco?.close();
});

function caminhoDe(rota: RouteDefinition): string {
  return rota.path.replace(/:([^/]+)/g, 'x');
}

void describe('P16: a matriz da guarda, gerada do contrato (D33, D36, D37, D39)', () => {
  void it('toda operacao /admin/ com rota recusa as seis tentativas, e ha operacoes para conferir', async () => {
    const operacoes = [...contrato.operacoes.values()].filter(
      (op) => op.path.startsWith('/admin/') && !OPERACOES_ADMINISTRATIVAS_SEM_SESSAO.includes(op.operationId),
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
      const admin = await contaDoPainel();

      const valida = await sessaoDireta(admin.id);
      confere(rota, 'sem X-Internal-Surface', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(valida), corpo, semSuperficie: true }), 404);
      confere(rota, 'sem cookie', await chamar(principal, metodo, caminho, { cabecalhos: { origin: ORIGEM }, corpo }), 401);

      const tutora = await contaDoApp();
      const bearer = assinador.emitir(tutora.id, systemClock.now(), randomUUID(), randomUUID()).token;
      // Com o cookie VALIDO junto: sem ele o 401 viria da falta de cookie, e o
      // caso aprovaria com a recusa do Bearer desligada (a isca mostrou isso).
      confere(rota, 'Bearer do app', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(valida, { authorization: `Bearer ${bearer}` }), corpo }), 401);

      if (escrita) {
        confere(rota, 'sem CSRF', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(valida, { 'x-csrf-token': '' }), corpo }), 403);
        confere(rota, 'Origin errado', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(valida, { origin: IRMAO }), corpo }), 403);
      }

      const desativada = await contaDoPainel();
      const daDesativada = await sessaoDireta(desativada.id);
      await desativar(desativada.id);
      confere(rota, 'conta desativada', await chamar(principal, metodo, caminho, { cabecalhos: comSessao(daDesativada), corpo }), 403);
    }

    assert.deepEqual(falhas, [], `a guarda deixou passar:\n${falhas.join('\n')}`);
  });
});

void describe('login administrativo (D35, D41, D44, D46)', () => {
  void it('abre a sessao com o cookie na forma exata de D35, e o corpo de AdminSession', async () => {
    const admin = await contaDoPainel();
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
    // D62: o token vai no FRAGMENTO de uma pagina do proprio painel, nunca na
    // consulta (que chega a log de borda e a `Referer`).
    assert.match(caixa.at(-1)?.corpo ?? '', new RegExp(`${ORIGEM}/nao-fui-eu#t=[A-Za-z0-9_-]{43}`));
    assert.doesNotMatch(caixa.at(-1)?.corpo ?? '', /\?token=/);
    const avisos = await banco.db.selectFrom('admin_session_alerts').select('id')
      .where('admin_account_id', '=', admin.id).execute();
    assert.equal(avisos.length, 1, 'o link do aviso nao ficou gravado em admin_session_alerts');
  });

  void it('conta inexistente, senha errada e conta desativada com a senha certa: o MESMO 401', async () => {
    const desativada = await contaDoPainel();
    await desativar(desativada.id);
    const admin = await contaDoPainel();
    const pedir = (email: string, password: string): Promise<Resposta> =>
      chamar(principal, 'POST', '/admin/auth/login', {
        cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email, password },
      });
    const respostas = [
      await pedir(`ninguem-${randomUUID().slice(0, 6)}@exemplo.invalid`, SENHA),
      await pedir(admin.email, 'outra frase longa qualquer aqui'),
      await pedir(desativada.email, SENHA),
    ];
    const sem = respostas.map((r) => ({ status: r.status, type: tipo(r), title: r.corpo?.['title'], detail: r.corpo?.['detail'] }));
    assert.equal(sem[0]?.status, 401);
    assert.deepEqual(sem[1], sem[0]);
    assert.deepEqual(sem[2], sem[0]);
  });

  void it('sem X-Captcha-Token, ou com token que o verificador recusa: 403 captcha-rejected', async () => {
    const admin = await contaDoPainel();
    for (const cabecalhos of [{ origin: ORIGEM }, { origin: ORIGEM, 'x-captcha-token': 'recusado-pelo-duble-0123456789' }]) {
      const resposta = await chamar(principal, 'POST', '/admin/auth/login', { cabecalhos, corpo: { email: admin.email, password: SENHA } });
      assert.equal(resposta.status, 403);
      assert.equal(tipo(resposta), 'captcha-rejected');
    }
  });

  void it('D44: o bloqueio por e-mail vale igual para conta que existe e para e-mail que nao existe', async () => {
    const admin = await contaDoPainel();
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
    // O titulo traz o prazo ("Tente de novo em 49 segundos"), e as duas
    // respostas saem com um segundo de diferenca perto do fim da janela: o
    // numero sai da comparacao, e o resto do corpo precisa ser identico.
    const semPrazo = (r: Resposta): string => String(r.corpo?.['title']).replace(/\d+/g, 'N');
    const prazo = (r: Resposta): number => Number(/\d+/.exec(String(r.corpo?.['title']))?.[0] ?? NaN);
    assert.deepEqual(
      { status: doInexistente.status, type: tipo(doInexistente), title: semPrazo(doInexistente) },
      { status: daConta.status, type: tipo(daConta), title: semPrazo(daConta) },
    );
    // A faixa aceita e de um segundo, e so para baixo: o segundo pedido vem
    // depois do primeiro. Prazo maior, ou mais de um segundo mais curto, seria
    // balde diferente, que e o que o caso existe para pegar.
    const diferenca = prazo(daConta) - prazo(doInexistente);
    assert.ok(diferenca === 0 || diferenca === 1, `prazos ${String(prazo(daConta))} e ${String(prazo(doInexistente))}`);
  });

  void it('login com Origin de subdominio irmao: 403, e nenhuma sessao', async () => {
    const admin = await contaDoPainel();
    const resposta = await chamar(principal, 'POST', '/admin/auth/login', {
      cabecalhos: { origin: IRMAO, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email: admin.email, password: SENHA },
    });
    assert.equal(resposta.status, 403);
    const vivas = await banco.db.selectFrom('admin_sessions').select('id').where('admin_account_id', '=', admin.id).execute();
    assert.equal(vivas.length, 0);
  });

  void it('D43: senha certa e vazada responde o MESMO 401 da senha errada, e avisa todos os administradores', async () => {
    // A isca que reprova se o `403 password-reset-required` voltar: ele dizia a
    // quem testa listas de vazamento que o e-mail e de administrador e que a
    // senha confere (UX 30.5, decisao de seguranca de 28/09).
    const outra = await contaDoPainel();
    const vazou = await contaDoPainel({ phc: phcVazada });
    const pedir = (password: string): Promise<Resposta> =>
      chamar(principal, 'POST', '/admin/auth/login', {
        cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM, 'x-correlation-id': randomUUID() },
        corpo: { email: vazou.email, password },
      });
    const antes = caixa.length;
    const certaVazada = await pedir(SENHA_VAZADA);
    const errada = await pedir('outra frase longa qualquer aqui');
    const corpo = (r: Resposta) => ({ status: r.status, type: tipo(r), title: r.corpo?.['title'], detail: r.corpo?.['detail'] });
    assert.equal(certaVazada.status, 401, `a senha vazada teve resposta propria: ${JSON.stringify(certaVazada.corpo)}`);
    assert.deepEqual(corpo(certaVazada), corpo(errada));
    assert.equal(await sessoesVivas(vazou.id), 0, 'a senha vazada abriu sessao');

    const razao = await banco.db.selectFrom('audit.events').select(['metadata', 'resource_id'])
      .where('action', '=', 'admin.session.denied').where('resource_id', '=', vazou.id).execute();
    assert.ok(
      razao.some((l) => (l.metadata as { reason?: string } | null)?.reason === 'breached_password'),
      'a trilha nao registrou a recusa por senha vazada',
    );
    await esperarCaixa(() => caixa.slice(antes).filter((m) => /precisa trocar a senha/.test(m.assunto)).length >= 2);
    const avisos = caixa.slice(antes).filter((m) => /precisa trocar a senha/.test(m.assunto));
    const para = new Set(avisos.map((m) => m.para));
    assert.ok(para.has(outra.email) && para.has(vazou.email), `o aviso nao foi a todos: ${[...para].join(', ')}`);
    assert.ok(avisos.every((m) => /conta-admin redefinir-senha/.test(m.corpo) && !/https?:\/\//.test(m.corpo)),
      'o aviso de senha vazada precisa mandar ao comando, e nao a um link');
  });
});

void describe('ciclo da sessao (D38, D39, D40)', () => {
  void it('GET /admin/session devolve o mesmo csrf_token do login, e o F5 continua valendo', async () => {
    const admin = await contaDoPainel();
    const { resposta, sessao } = await entrar(principal, admin.email);
    const leitura = await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: sessao.cookie } });
    assert.equal(leitura.status, 200);
    assert.equal(leitura.corpo?.['csrf_token'], resposta.corpo?.['csrf_token']);
  });

  void it('o token anti-CSRF de OUTRA sessao nao serve (D39)', async () => {
    const a = await sessaoDireta((await contaDoPainel()).id);
    const b = await sessaoDireta((await contaDoPainel()).id);
    const resposta = await chamar(principal, 'POST', '/admin/auth/logout', { cabecalhos: comSessao(a, { 'x-csrf-token': b.csrf }) });
    assert.equal(resposta.status, 403);
  });

  void it('31 min sem uso e 12 h desde a senha derrubam a sessao (D38)', async () => {
    const admin = await contaDoPainel();
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

  void it('conta desativada: 403 na proxima chamada, e zero sessoes vivas da conta depois (D38)', async () => {
    // Ate 28/09 este caso removia o papel `admin` de `user_roles`. O papel
    // agora e `admin_accounts.role`, que so aceita `admin`, e o que tira a
    // pessoa do painel e desativar a conta (item 20.1).
    const admin = await contaDoPainel();
    const sessao = await sessaoDireta(admin.id);
    await sessaoDireta(admin.id);
    await desativar(admin.id);
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: sessao.cookie } })).status, 403);
    assert.equal(await sessoesVivas(admin.id), 0);
    const motivos = await banco.db.selectFrom('admin_sessions').select('revoked_reason')
      .where('admin_account_id', '=', admin.id).execute();
    assert.deepEqual([...new Set(motivos.map((m) => m.revoked_reason))], ['account_disabled']);
  });

  void it('logout: 204, apaga o cookie, e o identificador deixa de valer', async () => {
    const admin = await contaDoPainel();
    const sessao = await sessaoDireta(admin.id);
    const correlacao = randomUUID();
    const r = await chamar(principal, 'POST', '/admin/auth/logout', { cabecalhos: comSessao(sessao, { 'x-correlation-id': correlacao }) });
    assert.equal(r.status, 204);
    assert.match(r.cabecalhos.get('set-cookie') ?? '', /__Host-bichu_adm=;.*Max-Age=0/);
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: sessao.cookie } })).status, 401);
    assert.deepEqual(await eventosDa(correlacao), ['admin.session.closed']);
  });

  void it('logout-all derruba as outras sessoes da conta e grava a trilha', async () => {
    const admin = await contaDoPainel();
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
    const admin = await contaDoPainel();
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
    assert.deepEqual(certa.corpo?.['tokens'], [{ scope: 'store_item_retirement', reauth_token: certa.corpo?.['reauth_token'] }]);
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

void describe('D40: dois escopos com uma senha so (mover e trocar acesso juntos)', () => {
  async function reautenticar(sessao: SessaoDeTeste, corpo: Record<string, unknown>): Promise<{ resposta: Resposta; nova: SessaoDeTeste }> {
    const resposta = await chamar(principal, 'POST', '/admin/auth/reauth', { cabecalhos: comSessao(sessao), corpo: { password: SENHA, ...corpo } });
    const valor = /__Host-bichu_adm=([^;]+)/.exec(resposta.cabecalhos.get('set-cookie') ?? '')?.[1] ?? '';
    const csrf = typeof resposta.corpo?.['csrf_token'] === 'string' ? resposta.corpo['csrf_token'] : '';
    return { resposta, nova: { cookie: `__Host-bichu_adm=${valor}`, csrf, id: '' } };
  }
  const tokenDe = (r: Resposta, escopo: string): string => {
    const lista = (r.corpo?.['tokens'] ?? []) as { scope: string; reauth_token: string }[];
    return lista.find((t) => t.scope === escopo)?.reauth_token ?? '';
  };

  void it('uma reautenticacao com dois escopos, e as duas operacoes em sequencia passam', async () => {
    const admin = await contaDoPainel();
    const { sessao } = await entrar(principal, admin.email);
    const { resposta, nova } = await reautenticar(sessao, {
      scopes: ['network_event_relocation', 'network_event_access_change'],
    });
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const mover = tokenDe(resposta, 'network_event_relocation');
    const acesso = tokenDe(resposta, 'network_event_access_change');
    assert.ok(mover !== '' && acesso !== '' && mover !== acesso, JSON.stringify(resposta.corpo));
    assert.equal(resposta.corpo?.['reauth_token'], mover, 'reauth_token precisa ser o do primeiro escopo pedido');

    const primeira = await chamar(principal, 'POST', '/admin/teste/mover', { cabecalhos: comSessao(nova, { 'x-admin-reauth-token': mover }) });
    const segunda = await chamar(principal, 'POST', '/admin/teste/acesso', { cabecalhos: comSessao(nova, { 'x-admin-reauth-token': acesso }) });
    assert.equal(primeira.status, 204, JSON.stringify(primeira.corpo));
    assert.equal(segunda.status, 204, JSON.stringify(segunda.corpo));
    // Uso unico, cada um.
    const deNovo = await chamar(principal, 'POST', '/admin/teste/mover', { cabecalhos: comSessao(nova, { 'x-admin-reauth-token': mover }) });
    assert.equal(deNovo.status, 401);
  });

  void it('isca: o token de um escopo nao abre a operacao do outro, nem depois de gasto o certo', async () => {
    const admin = await contaDoPainel();
    const { sessao } = await entrar(principal, admin.email);
    const { resposta, nova } = await reautenticar(sessao, {
      scopes: ['network_event_relocation', 'network_event_access_change'],
    });
    const mover = tokenDe(resposta, 'network_event_relocation');
    const acesso = tokenDe(resposta, 'network_event_access_change');
    const trocado = await chamar(principal, 'POST', '/admin/teste/acesso', { cabecalhos: comSessao(nova, { 'x-admin-reauth-token': mover }) });
    assert.equal(trocado.status, 401, 'o token de mover abriu a troca de acesso');
    assert.equal(tipo(trocado), 'reauthentication-required');
    const trocado2 = await chamar(principal, 'POST', '/admin/teste/mover', { cabecalhos: comSessao(nova, { 'x-admin-reauth-token': acesso }) });
    assert.equal(trocado2.status, 401, 'o token de acesso abriu o mover');
    // A tentativa errada nao gastou os tokens certos.
    assert.equal((await chamar(principal, 'POST', '/admin/teste/mover', { cabecalhos: comSessao(nova, { 'x-admin-reauth-token': mover }) })).status, 204);
  });

  void it('o caso do defeito: duas reautenticacoes seguidas deixam a primeira janela presa a sessao revogada', async () => {
    // Documenta por que `scopes` existe. Se um dia isto passar a dar 204, a
    // rotacao deixou de revogar a sessao anterior, que e outro defeito (D38).
    const admin = await contaDoPainel();
    const { sessao } = await entrar(principal, admin.email);
    const um = await reautenticar(sessao, { scope: 'network_event_relocation' });
    const dois = await reautenticar(um.nova, { scope: 'network_event_access_change' });
    const primeira = await chamar(principal, 'POST', '/admin/teste/mover', {
      cabecalhos: comSessao(dois.nova, { 'x-admin-reauth-token': String(um.resposta.corpo?.['reauth_token']) }),
    });
    assert.equal(primeira.status, 401);
  });

  void it('escopo repetido, tres escopos, lista vazia, ou scope e scopes juntos: 400', async () => {
    const admin = await contaDoPainel();
    const sessao = await sessaoDireta(admin.id);
    for (const corpo of [
      { scopes: ['network_event_relocation', 'network_event_relocation'] },
      { scopes: ['network_event_relocation', 'network_event_access_change', 'store_item_retirement'] },
      { scopes: [] },
      { scope: 'network_event_relocation', scopes: ['network_event_access_change'] },
      {},
    ]) {
      const r = await chamar(principal, 'POST', '/admin/auth/reauth', { cabecalhos: comSessao(sessao), corpo: { password: SENHA, ...corpo } });
      assert.equal(r.status, 400, `${JSON.stringify(corpo)} -> ${String(r.status)}`);
    }
  });
});

function contextoVazio(): { correlationId: string; ip: undefined; userAgent: undefined } {
  return { correlationId: randomUUID(), ip: undefined, userAgent: undefined };
}


void describe('D62: "nao fui eu" do painel, POST /v1/admin/auth/disavow', () => {
  const desautorizar = (corpo: unknown, cabecalhos: Record<string, string> = { origin: ORIGEM }): Promise<Resposta> =>
    chamar(principal, 'POST', '/admin/auth/disavow', { cabecalhos, corpo });
  const corpoDoProblema = (r: Resposta) => ({
    status: r.status, type: tipo(r), title: r.corpo?.['title'], detail: r.corpo?.['detail'],
  });

  void it('token do e-mail de sessao aberta: 204, zero sessoes vivas, bloqueio, e o login seguinte recusa', async () => {
    const admin = await contaDoPainel();
    const colega = await contaDoPainel();
    const antes = caixa.length;
    const { sessao } = await entrar(principal, admin.email);
    await sessaoDireta(admin.id);
    const token = /nao-fui-eu#t=([A-Za-z0-9_-]{43})/.exec(caixa.slice(antes).at(-1)?.corpo ?? '')?.[1];
    assert.ok(token !== undefined, 'o e-mail de sessao aberta nao trouxe o token no fragmento');

    const correlacao = randomUUID();
    const r = await desautorizar({ token }, { origin: ORIGEM, 'x-correlation-id': correlacao });
    assert.equal(r.status, 204, JSON.stringify(r.corpo));
    assert.equal(await sessoesVivas(admin.id), 0);
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: sessao.cookie } })).status, 401);
    const conta = await banco.db.selectFrom('admin_accounts').select(['blocked_reason', 'blocked_at'])
      .where('id', '=', admin.id).executeTakeFirstOrThrow();
    assert.equal(conta.blocked_reason, 'disavowed');
    assert.deepEqual(await eventosDa(correlacao), ['admin.session.disavowed']);
    const motivos = await banco.db.selectFrom('admin_sessions').select('revoked_reason')
      .where('admin_account_id', '=', admin.id).execute();
    assert.deepEqual([...new Set(motivos.map((m) => m.revoked_reason))], ['disavowed']);

    // Todos os administradores ativos sao avisados, mandando ao comando.
    const avisos = caixa.slice(antes).filter((m) => /bloqueada pelo/.test(m.assunto));
    const para = new Set(avisos.map((m) => m.para));
    assert.ok(para.has(admin.email) && para.has(colega.email), `o aviso nao foi a todos: ${[...para].join(', ')}`);
    assert.ok(avisos.every((m) => /conta-admin redefinir-senha/.test(m.corpo)));

    // O login seguinte, com a senha CERTA, recebe o mesmo 401 da senha errada:
    // um corpo proprio para conta bloqueada diria a quem tem a senha que ela
    // confere (mesma regra da senha vazada, D43).
    const certa = await entrar(principal, admin.email);
    const errada = await chamar(principal, 'POST', '/admin/auth/login', {
      cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email: admin.email, password: 'outra frase longa errada aqui' },
    });
    assert.equal(certa.resposta.status, 401);
    assert.deepEqual(corpoDoProblema(certa.resposta), corpoDoProblema(errada));
    assert.equal(await sessoesVivas(admin.id), 0);
  });

  void it('token reusado, vencido e inexistente: o mesmo 410', async () => {
    const admin = await contaDoPainel();
    const usado = await avisoDireto(admin.id);
    assert.equal((await desautorizar({ token: usado })).status, 204);
    const vencido = await avisoDireto((await contaDoPainel()).id, { expiraEmMs: -1_000 });
    const respostas = [
      await desautorizar({ token: usado }),
      await desautorizar({ token: vencido }),
      await desautorizar({ token: randomBytes(32).toString('base64url') }),
    ].map(corpoDoProblema);
    assert.equal(respostas[0]?.status, 410);
    assert.deepEqual(respostas[1], respostas[0]);
    assert.deepEqual(respostas[2], respostas[0]);
  });

  void it('sem Origin, ou com Origin de subdominio irmao: 403, e nada acontece', async () => {
    const admin = await contaDoPainel();
    const token = await avisoDireto(admin.id);
    const viva = await sessaoDireta(admin.id);
    assert.equal((await desautorizar({ token }, {})).status, 403);
    assert.equal((await desautorizar({ token }, { origin: IRMAO })).status, 403);
    assert.equal((await desautorizar({ token }, { origin: 'https://bichu.app' })).status, 403);
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: viva.cookie } })).status, 200);
    // O token continua valendo: a recusa por Origin nao o gastou.
    assert.equal((await desautorizar({ token })).status, 204);
  });

  void it('GET responde 405 com Allow: POST, e sem X-Internal-Surface continua 404', async () => {
    const r = await chamar(principal, 'GET', '/admin/auth/disavow');
    assert.equal(r.status, 405);
    assert.equal(r.cabecalhos.get('allow'), 'POST');
    assert.equal(tipo(r), 'method-not-allowed');
    assert.equal((await chamar(principal, 'GET', '/admin/auth/disavow', { semSuperficie: true })).status, 404);
  });

  void it('token fora da forma, ou campo a mais: 400', async () => {
    assert.equal((await desautorizar({ token: 'curto' })).status, 400);
    assert.equal((await desautorizar({ token: randomBytes(32).toString('base64url'), extra: 1 })).status, 400);
  });
});

void describe('P21 (a): as duas portas nao se cruzam (D42, forma de 28/09)', () => {
  const corpoDoProblema = (r: Resposta) => ({
    status: r.status, type: tipo(r), title: r.corpo?.['title'], detail: r.corpo?.['detail'],
  });
  const loginDoPainel = (email: string, password: string): Promise<Resposta> =>
    chamar(principal, 'POST', '/admin/auth/login', {
      cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email, password },
    });
  const loginDoApp = (email: string, password: string): Promise<Resposta> =>
    chamar(principal, 'POST', '/auth/login', { corpo: { email, password }, semSuperficie: true });

  void it('credencial valida do app no login do painel: 401 identico ao da senha errada', async () => {
    const tutora = await contaDoApp();
    const certaDoApp = await loginDoPainel(tutora.email, SENHA);
    const errada = await loginDoPainel(tutora.email, 'outra frase longa errada aqui');
    assert.equal(certaDoApp.status, 401, JSON.stringify(certaDoApp.corpo));
    assert.deepEqual(corpoDoProblema(certaDoApp), corpoDoProblema(errada));
  });

  void it('credencial valida do painel no login do app: 401 identico ao da senha errada', async () => {
    const admin = await contaDoPainel();
    const certaDoPainel = await loginDoApp(admin.email, SENHA);
    const errada = await loginDoApp(admin.email, 'outra frase longa errada aqui');
    assert.equal(certaDoPainel.status, 401, JSON.stringify(certaDoPainel.corpo));
    assert.deepEqual(corpoDoProblema(certaDoPainel), corpoDoProblema(errada));
  });

  void it('mesma pessoa, mesmo e-mail nas duas tabelas, senhas diferentes: cada porta aceita so a sua', async () => {
    const email = `mesma-${randomUUID().slice(0, 8)}@exemplo.invalid`;
    await contaDoApp({ email, phc: phcVazada });
    await contaDoPainel({ email });
    // A senha do app aqui e a que a dubla chama de vazada so para ter um
    // segundo hash pronto; na porta do app a base de vazadas nao recusa login.
    assert.equal((await loginDoPainel(email, SENHA)).status, 200, 'a senha do painel nao abriu o painel');
    assert.equal((await loginDoPainel(email, SENHA_VAZADA)).status, 401, 'a senha do app abriu o painel');
    assert.equal((await loginDoApp(email, SENHA_VAZADA)).status, 200, 'a senha do app nao abriu o app');
    assert.equal((await loginDoApp(email, SENHA)).status, 401, 'a senha do painel abriu o app');
  });
});

void describe('P17: a trilha na mesma transacao, por operacao da sessao', () => {
  void it('toda escrita administrativa deste servidor grava a sua acao na trilha', async () => {
    const escritas = principal.rotasAdministrativas.filter(
      (rota) => rota.method !== 'get' && contrato.operacoes.has(rota.operationId),
    );
    assert.ok(escritas.length > 0, 'nenhuma escrita administrativa registrada: P17 sem o que conferir');
    const admin = await contaDoPainel();
    const faltando: string[] = [];
    for (const rota of escritas) {
      const correlacao = randomUUID();
      let resposta: Resposta;
      if (rota.operationId === 'disavowAdminSessionAlert') {
        // Conta propria: o "nao fui eu" bloqueia, e as outras escritas do laco
        // nao podem depender de um bloqueio que nao era delas.
        const alvo = await contaDoPainel();
        resposta = await chamar(principal, 'POST', rota.path, {
          cabecalhos: { origin: ORIGEM, 'x-correlation-id': correlacao },
          corpo: { token: await avisoDireto(alvo.id) },
        });
        const acoes = await eventosDa(correlacao);
        if (resposta.status !== 204 || !acoes.includes(rota.audit?.action ?? '')) {
          faltando.push(`${rota.operationId}: ${String(resposta.status)} ${JSON.stringify(acoes)}`);
        }
        // O ator e anonimo: quem tem o link provou ter a caixa de entrada, e
        // nao ser o titular (D62). A conta vai como recurso.
        const linhas = await banco.db.selectFrom('audit.events')
          .select(['actor_kind', 'actor_admin_id', 'actor_user_id', 'resource_id'])
          .where('correlation_id', '=', correlacao).execute();
        if (!linhas.every((l) => l.actor_kind === 'anonymous' && l.actor_admin_id === null && l.resource_id === alvo.id)) {
          faltando.push(`${rota.operationId}: ator ${JSON.stringify(linhas)}`);
        }
        continue;
      }
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
      // O ator e a conta do PAINEL, na coluna dela: nunca `actor_user_id`
      // (apendice A.5). O login e a unica escrita cujo ator ainda nao tinha
      // sessao, e mesmo ele grava o administrador que acabou de entrar.
      const atores = await banco.db.selectFrom('audit.events')
        .select(['actor_kind', 'actor_admin_id', 'actor_user_id', 'action'])
        .where('correlation_id', '=', correlacao).where('action', '=', rota.audit?.action ?? '').execute();
      for (const ator of atores) {
        if (ator.actor_kind !== 'admin' || ator.actor_admin_id !== admin.id || ator.actor_user_id !== null) {
          faltando.push(`${rota.operationId}: ator ${JSON.stringify(ator)}`);
        }
      }
    }
    assert.deepEqual(faltando, []);
  });

  void it('falha da trilha: o login nao deixa sessao, e o logout nao derruba a sessao', async () => {
    const admin = await contaDoPainel();
    const login = await chamar(comTrilhaQuebrada, 'POST', '/admin/auth/login', {
      cabecalhos: { origin: ORIGEM, 'x-captcha-token': CAPTCHA_BOM }, corpo: { email: admin.email, password: SENHA },
    });
    assert.equal(login.status, 500);
    const sessoes = await banco.db.selectFrom('admin_sessions').select('id').where('admin_account_id', '=', admin.id).execute();
    assert.equal(sessoes.length, 0, 'a sessao ficou gravada sem a trilha');

    const viva = await sessaoDireta(admin.id);
    const logout = await chamar(comTrilhaQuebrada, 'POST', '/admin/auth/logout', { cabecalhos: comSessao(viva) });
    assert.equal(logout.status, 500);
    assert.equal((await chamar(principal, 'GET', '/admin/session', { cabecalhos: { cookie: viva.cookie } })).status, 200);
  });
});
