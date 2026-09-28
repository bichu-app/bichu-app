/**
 * A guarda do prefixo `/v1/admin`, sem banco (BICHUS-259, ADR-0027 itens 2, 3
 * e 7). A sessao e um dublê da porta que o modulo de identidade entrega; o que
 * este arquivo prova e a ORDEM e a COBERTURA da guarda e da fronteira de
 * registro. A mesma matriz, contra Postgres e contra as rotas reais, esta em
 * `tests/integration/sessao-administrativa-pelo-http.test.ts` (P16).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hashDeToken } from '../crypto/digest.js';
import type { AbsoluteUrl, AdminAccountId } from '../types/brands.js';
import { problemas } from './errors.js';
import { escoparRotas, registrarRota, type RegistradorDeRotas } from './registrar-rota.js';
import { defineRoute, type RouteDefinition } from './route-definition.js';
import { criarServidor } from './server.js';
import {
  cookieDaSessao,
  escoparRotasAdministrativas,
  lerCookieDaSessao,
  sessaoAdministrativaDe,
  type MotivoDaRecusaDaGuarda,
  type PortaDaSessaoAdministrativa,
  type SessaoAdministrativaConferida,
} from './superficie-administrativa.js';
import { tetoDeTeste } from './teto-de-teste.js';

const ORIGEM = 'https://painel.exemplo.test';
const BASE = 'https://api.bichu.test/problems' as AbsoluteUrl;

// `adminPublic` so vale para as operacoes da lista fechada; a bancada usa o
// nome do login de verdade num caminho de teste.
const rotaDeEntrar = defineRoute({
  operationId: 'openAdminSession',
  method: 'post',
  path: '/admin/teste/entrar',
  effects: [],
  adminPublic: true,
  audit: { action: 'admin.session.opened', resourceKind: 'admin_session' },
});
const rotaDeLeitura = defineRoute({
  operationId: 'testeLer',
  method: 'get',
  path: '/admin/teste/leitura',
  effects: [],
  adminRoles: ['admin'],
});
const rotaDeEscrita = defineRoute({
  operationId: 'testeEscrever',
  method: 'post',
  path: '/admin/teste/escrita',
  effects: [],
  adminRoles: ['admin'],
  audit: { action: 'admin.store_item.created', resourceKind: 'store_item' },
});
const rotaSensivel = defineRoute({
  operationId: 'testeRetirar',
  method: 'post',
  path: '/admin/teste/sensivel',
  effects: [],
  adminRoles: ['admin'],
  adminReauthScope: 'store_item_retirement',
  audit: { action: 'admin.store_item.retired', resourceKind: 'store_item' },
});

const CORPO_FECHADO = {
  type: 'object',
  required: ['titulo'],
  additionalProperties: false,
  properties: { titulo: { type: 'string' } },
};

function sessao(token: string, csrf: string, papeis: readonly string[]): SessaoAdministrativaConferida {
  return {
    sessionId: `sessao-${token}`,
    adminAccountId: `usuario-${token}` as AdminAccountId,
    displayName: 'Operacao',
    papeis,
    csrfTokenHash: hashDeToken(csrf),
    etiqueta: '0011223344556677',
    instanteDaSenha: new Date(),
    idleExpiresAt: new Date(),
    absoluteExpiresAt: new Date(),
  };
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly recusas: MotivoDaRecusaDaGuarda[];
  readonly log: string[];
}

function bancada(rotasExtras: (adm: RegistradorDeRotas) => void = () => {}): Bancada {
  const recusas: MotivoDaRecusaDaGuarda[] = [];
  const log: string[] = [];
  const sessoes = new Map<string, SessaoAdministrativaConferida>([
    ['cookie-admin', sessao('admin', 'csrf-admin-0123456789abcdef0123456789', ['tutor', 'admin'])],
    ['cookie-outra', sessao('outra', 'csrf-outra-0123456789abcdef0123456789', ['admin'])],
    ['cookie-sem-papel', sessao('semPapel', 'csrf-sem-papel-0123456789abcdef012345', ['tutor'])],
  ]);
  const porta: PortaDaSessaoAdministrativa = {
    conferir: (valor) => {
      const achada = sessoes.get(valor);
      return achada === undefined ? Promise.reject(problemas.naoAutenticado()) : Promise.resolve(achada);
    },
    registrarRecusa: (_s, motivo) => {
      recusas.push(motivo);
      return Promise.resolve();
    },
    consumirReautenticacao: (_s, escopo, token) =>
      escopo === 'store_item_retirement' && token === 'janela-certa'
        ? Promise.resolve()
        : Promise.reject(problemas.reautenticacaoNecessaria()),
  };

  const app = criarServidor({
    problemBaseUrl: BASE,
    isProduction: false,
    teto: tetoDeTeste(),
    destinoDoLog: { write: (linha: string) => void log.push(linha) },
  });
  void escoparRotas(app, '/v1', (v1) => {
    escoparRotasAdministrativas(v1, { origem: ORIGEM, sessoes: porta }, (adm) => {
      registrarRota(adm, rotaDeEntrar, {}, async (request, reply) => {
        request.log.info({ headers: request.headers }, 'depuracao que alguem escreveria');
        void reply.header('set-cookie', cookieDaSessao('valor-do-cookie-novo-que-nao-pode-vazar'));
        reply.log.info({ headers: reply.getHeaders() }, 'depuracao da resposta');
        return reply.status(200).send({ ok: true });
      });
      registrarRota(adm, rotaDeLeitura, {}, async (request, reply) =>
        reply.status(200).send({ usuario: sessaoAdministrativaDe(request).adminAccountId }),
      );
      registrarRota(adm, rotaDeEscrita, { schema: { body: CORPO_FECHADO } }, async (_r, reply) =>
        reply.status(200).send({ gravado: true }),
      );
      registrarRota(adm, rotaSensivel, {}, async (_r, reply) => reply.status(200).send({ retirado: true }));
      rotasExtras(adm);
    });
  });
  return { app, recusas, log };
}

type Cabecalhos = Record<string, string>;

function cabecalhos(extra: Cabecalhos = {}): Cabecalhos {
  return { 'x-internal-surface': 'admin', ...extra };
}

const COM_SESSAO: Cabecalhos = { cookie: 'outro=1; __Host-bichu_adm=cookie-admin' };
const ESCRITA_CERTA: Cabecalhos = {
  ...COM_SESSAO,
  origin: ORIGEM,
  'x-csrf-token': 'csrf-admin-0123456789abcdef0123456789',
};

function tipoDe(corpo: string): string {
  const { type } = JSON.parse(corpo) as { type?: string };
  return (type ?? '').split('/').pop() ?? '';
}

void describe('guarda do prefixo /v1/admin', () => {
  void it('sem X-Internal-Surface responde 404, mesmo com sessao valida (D33)', async () => {
    const { app } = bancada();
    const resposta = await app.inject({ method: 'GET', url: '/v1/admin/teste/leitura', headers: COM_SESSAO });
    assert.equal(resposta.statusCode, 404);
  });

  void it('Authorization: Bearer responde 401, com ou sem cookie valido junto (D36)', async () => {
    const { app } = bancada();
    for (const extra of [{}, COM_SESSAO]) {
      const resposta = await app.inject({
        method: 'GET',
        url: '/v1/admin/teste/leitura',
        headers: cabecalhos({ ...extra, authorization: 'Bearer eyJ.um.jwt' }),
      });
      assert.equal(resposta.statusCode, 401);
      assert.equal(tipoDe(resposta.body), 'unauthenticated');
    }
  });

  void it('sem cookie, ou com cookie que nao e sessao, responde 401', async () => {
    const { app } = bancada();
    for (const extra of [{}, { cookie: '__Host-bichu_adm=inventado' }]) {
      const resposta = await app.inject({ method: 'GET', url: '/v1/admin/teste/leitura', headers: cabecalhos(extra) });
      assert.equal(resposta.statusCode, 401);
    }
  });

  void it('GET com sessao de admin passa, a rota enxerga a sessao, e a resposta nao vai para cache', async () => {
    const { app } = bancada();
    const resposta = await app.inject({ method: 'GET', url: '/v1/admin/teste/leitura', headers: cabecalhos(COM_SESSAO) });
    assert.equal(resposta.statusCode, 200);
    assert.deepEqual(JSON.parse(resposta.body), { usuario: 'usuario-admin' });
    assert.equal(resposta.headers['cache-control'], 'no-store');
  });

  void it('escrita sem Origin, com Origin de subdominio irmao, sem X-CSRF-Token ou com o de outra sessao: 403 (D39)', async () => {
    const { app, recusas } = bancada();
    const casos: Cabecalhos[] = [
      { ...ESCRITA_CERTA, origin: '' },
      { ...ESCRITA_CERTA, origin: 'https://exemplo.test' },
      { ...ESCRITA_CERTA, origin: 'https://hml.exemplo.test' },
      { ...ESCRITA_CERTA, 'x-csrf-token': '' },
      { ...ESCRITA_CERTA, 'x-csrf-token': 'csrf-outra-0123456789abcdef0123456789' },
    ];
    for (const caso of casos) {
      const limpo = Object.fromEntries(Object.entries(caso).filter(([, v]) => v !== ''));
      const resposta = await app.inject({
        method: 'POST',
        url: '/v1/admin/teste/escrita',
        headers: cabecalhos(limpo),
        payload: { titulo: 'x' },
      });
      assert.equal(resposta.statusCode, 403, `caso ${JSON.stringify(limpo)}`);
      assert.equal(tipoDe(resposta.body), 'forbidden');
    }
    assert.deepEqual(recusas, [
      'origin_mismatch',
      'origin_mismatch',
      'origin_mismatch',
      'csrf_mismatch',
      'csrf_mismatch',
    ]);
  });

  void it('conta sem o papel da operacao: 403, e a recusa vai para a trilha (D37)', async () => {
    const { app, recusas } = bancada();
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/admin/teste/leitura',
      headers: cabecalhos({ cookie: '__Host-bichu_adm=cookie-sem-papel' }),
    });
    assert.equal(resposta.statusCode, 403);
    assert.deepEqual(recusas, ['role_missing']);
  });

  void it('escrita certa passa, e campo fora do corpo fechado responde 400 em vez de ser apagado', async () => {
    const { app } = bancada();
    const certa = await app.inject({
      method: 'POST',
      url: '/v1/admin/teste/escrita',
      headers: cabecalhos(ESCRITA_CERTA),
      payload: { titulo: 'x' },
    });
    assert.equal(certa.statusCode, 200);

    const comExtra = await app.inject({
      method: 'POST',
      url: '/v1/admin/teste/escrita',
      headers: cabecalhos(ESCRITA_CERTA),
      payload: { titulo: 'x', published_at: '2026-01-01T00:00:00Z' },
    });
    assert.equal(comExtra.statusCode, 400);
    const corpo = JSON.parse(comExtra.body) as { errors?: { field: string; code: string }[] };
    assert.deepEqual(corpo.errors, [
      { field: 'published_at', code: 'unknown_field', message: 'Este campo não existe nesta operação, e não pode ser gravado.' },
    ]);
  });

  void it('o login dispensa sessao e continua exigindo Origin exato', async () => {
    const { app } = bancada();
    const semOrigin = await app.inject({ method: 'POST', url: '/v1/admin/teste/entrar', headers: cabecalhos() });
    assert.equal(semOrigin.statusCode, 403);
    const irmao = await app.inject({
      method: 'POST',
      url: '/v1/admin/teste/entrar',
      headers: cabecalhos({ origin: 'https://exemplo.test' }),
    });
    assert.equal(irmao.statusCode, 403);
    const certo = await app.inject({ method: 'POST', url: '/v1/admin/teste/entrar', headers: cabecalhos({ origin: ORIGEM }) });
    assert.equal(certo.statusCode, 200);
  });

  void it('operacao com adminReauthScope exige X-Admin-Reauth-Token do escopo (D40)', async () => {
    const { app } = bancada();
    const sem = await app.inject({ method: 'POST', url: '/v1/admin/teste/sensivel', headers: cabecalhos(ESCRITA_CERTA) });
    assert.equal(sem.statusCode, 401);
    assert.equal(tipoDe(sem.body), 'reauthentication-required');
    const com = await app.inject({
      method: 'POST',
      url: '/v1/admin/teste/sensivel',
      headers: cabecalhos({ ...ESCRITA_CERTA, 'x-admin-reauth-token': 'janela-certa' }),
    });
    assert.equal(com.statusCode, 200);
  });

  void it('nenhuma resposta do prefixo traz Access-Control-Allow-* (D34)', async () => {
    const { app } = bancada();
    for (const origin of ['https://evil.example', 'https://exemplo.test']) {
      for (const method of ['GET', 'POST', 'OPTIONS'] as const) {
        const resposta = await app.inject({
          method,
          url: '/v1/admin/teste/leitura',
          headers: cabecalhos({ ...COM_SESSAO, origin }),
        });
        const cors = Object.keys(resposta.headers).filter((nome) => nome.startsWith('access-control-'));
        assert.deepEqual(cors, [], `${method} com Origin ${origin}`);
      }
    }
  });

  void it('cookie, anti-CSRF, janela de reautenticacao e Set-Cookie nao aparecem em claro no log', async () => {
    const { app, log } = bancada();
    await app.inject({
      method: 'POST',
      url: '/v1/admin/teste/entrar',
      headers: cabecalhos({
        origin: ORIGEM,
        cookie: '__Host-bichu_adm=valor-do-cookie-que-nao-pode-vazar',
        'x-csrf-token': 'valor-do-csrf-que-nao-pode-vazar',
        'x-admin-reauth-token': 'valor-da-janela-que-nao-pode-vazar',
      }),
    });
    const tudo = log.join('');
    assert.ok(tudo.includes('depuracao que alguem escreveria'), 'o log de teste nao foi capturado');
    assert.ok(tudo.includes('depuracao da resposta'), 'o log da resposta nao foi capturado');
    for (const segredo of [
      'valor-do-cookie-que-nao-pode-vazar',
      'valor-do-csrf-que-nao-pode-vazar',
      'valor-da-janela-que-nao-pode-vazar',
      'valor-do-cookie-novo-que-nao-pode-vazar',
    ]) {
      assert.ok(!tudo.includes(segredo), `'${segredo}' saiu em claro no log`);
    }
  });
});

void describe('fronteira de registro do prefixo administrativo', () => {
  async function subir(montar: (app: RegistradorDeRotas) => void): Promise<unknown> {
    const app = criarServidor({ problemBaseUrl: BASE, isProduction: false, teto: tetoDeTeste(), destinoDoLog: { write: () => {} } });
    montar(app);
    try {
      await app.ready();
      return undefined;
    } catch (erro) {
      return erro;
    }
  }
  const nada = (_r: unknown, reply: { status(n: number): { send(): unknown } }): Promise<unknown> =>
    Promise.resolve(reply.status(204).send());

  void it('rota administrativa fora do escopo nao sobe', async () => {
    const erro = await subir((app) => {
      escoparRotas(app, '/v1', (v1) => registrarRota(v1, rotaDeLeitura, {}, nada as never)).catch(() => {});
    });
    assert.match(String(erro), /fora de escoparRotasAdministrativas/);
  });

  void it('rota com /admin/ no caminho e sem declaracao, fora do escopo, nao sobe', async () => {
    const semDeclaracao = defineRoute({ operationId: 'x', method: 'get', path: '/admin/esquecida', effects: [] });
    const erro = await subir((app) => {
      escoparRotas(app, '/v1', (v1) => registrarRota(v1, semDeclaracao, {}, nada as never)).catch(() => {});
    });
    assert.match(String(erro), /fora de escoparRotasAdministrativas/);
  });

  const noEscopo = (rota: RouteDefinition) => (app: RegistradorDeRotas) => {
    // O erro chega por `ready()`, em `subir`; aqui ele so e consumido para nao
    // virar rejeicao solta.
    escoparRotas(app, '/v1', (v1) => {
      escoparRotasAdministrativas(v1, { origem: ORIGEM, sessoes: {} as PortaDaSessaoAdministrativa }, (adm) =>
        registrarRota(adm, rota, {} as never, nada as never),
      );
    }).catch(() => {});
  };

  void it('rota do escopo sem adminRoles nem adminPublic nao sobe', async () => {
    const semPapel = defineRoute({ operationId: 'x', method: 'get', path: '/admin/sem-papel', effects: [] });
    assert.match(String(await subir(noEscopo(semPapel))), /adminRoles OU adminPublic/);
  });

  void it('adminPublic fora da lista fechada de operacoes sem sessao nao sobe', async () => {
    const semSessao = defineRoute({
      operationId: 'terceiraSemSessao', method: 'post', path: '/admin/sem-sessao', effects: [], adminPublic: true,
      audit: { action: 'admin.session.opened', resourceKind: 'admin_session' },
    });
    assert.match(String(await subir(noEscopo(semSessao))), /fora da lista fechada/);
  });

  void it('escrita do escopo sem audit nao sobe, e GET com audit tambem nao', async () => {
    const semTrilha = defineRoute({
      operationId: 'x', method: 'post', path: '/admin/sem-trilha', effects: [], adminRoles: ['admin'],
    });
    assert.match(String(await subir(noEscopo(semTrilha))), /sem audit/);
    const leituraComTrilha = defineRoute({
      operationId: 'y', method: 'get', path: '/admin/leitura', effects: [], adminRoles: ['admin'],
      audit: { action: 'admin.store_item.created', resourceKind: 'store_item' },
    });
    assert.match(String(await subir(noEscopo(leituraComTrilha))), /nao muda estado/);
  });

  void it('rota do escopo sem /admin/ no caminho nao sobe', async () => {
    const foraDoCaminho = defineRoute({
      operationId: 'x', method: 'get', path: '/me', effects: [], adminRoles: ['admin'],
    });
    assert.match(String(await subir(noEscopo(foraDoCaminho))), /sem \/admin\/ no caminho/);
  });

  void it('origem administrativa malformada nao sobe', () => {
    assert.throws(
      () =>
        escoparRotasAdministrativas(
          {} as RegistradorDeRotas,
          { origem: 'https://painel.exemplo.test/', sessoes: {} as PortaDaSessaoAdministrativa },
          () => {},
        ),
      /ADMIN_ORIGIN/,
    );
  });
});

void describe('lerCookieDaSessao', () => {
  void it('le so o nome exato, e o primeiro', () => {
    assert.equal(lerCookieDaSessao('a=1; __Host-bichu_adm=abc; __Host-bichu_adm=def'), 'abc');
    assert.equal(lerCookieDaSessao('bichu_adm=abc'), undefined);
    assert.equal(lerCookieDaSessao('__Host-bichu_adm='), undefined);
    assert.equal(lerCookieDaSessao(undefined), undefined);
  });
});
