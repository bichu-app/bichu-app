/**
 * As rotas da sessao administrativa (ADR-0027 item 5), em `/v1/admin`.
 *
 * Nenhuma delas confere papel, `Origin` nem anti-CSRF: isso e da guarda do
 * prefixo, que le `adminRoles` daqui (`shared/http/superficie-administrativa.ts`).
 * O `effects`, o `rateLimit`, o `adminRoles`, o `audit` e o `adminPublic`
 * espelham `api/openapi.yaml`, e `rotas-registradas-contra-o-contrato.test.ts`
 * confere os cinco.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ResolvedorDeDimensao } from '../../../../shared/http/aplicacao-de-teto.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import {
  defineRoute,
  type EscopoDeReautenticacaoAdministrativa,
} from '../../../../shared/http/route-definition.js';
import {
  contextoDaGuarda,
  cookieDaSessao,
  cookieQueApagaASessao,
  lerCookieDaSessao,
  sessaoAdministrativaDe,
} from '../../../../shared/http/superficie-administrativa.js';
import { normalizarEmail } from '../../../identity/ports/senha.js';
import type { SessaoAdministrativaService } from '../../application/sessao-administrativa-service.js';

export const rotaDeLoginAdministrativo = defineRoute({
  operationId: 'openAdminSession',
  method: 'post',
  path: '/admin/auth/login',
  effects: ['verifies_secret', 'notifies'],
  adminPublic: true,
  audit: { action: 'admin.session.opened', resourceKind: 'admin_session' },
  rateLimit: [
    { dimension: ['email'], limit: 5, window: '15m', onExceed: 'deny_429', appliesTo: 'invalid_attempts' },
    { dimension: ['email'], limit: 10, window: '24h', onExceed: 'deny_429', appliesTo: 'invalid_attempts' },
    { dimension: ['ip'], limit: 20, window: '1h', onExceed: 'deny_429', appliesTo: 'invalid_attempts' },
    { dimension: ['ip_24'], limit: 50, window: '10m', onExceed: 'log_and_alert', appliesTo: 'invalid_attempts' },
  ],
});

export const rotaDaSessaoAdministrativa = defineRoute({
  operationId: 'getAdminSession',
  method: 'get',
  path: '/admin/session',
  effects: [],
  adminRoles: ['admin'],
});

export const rotaDeLogoutAdministrativo = defineRoute({
  operationId: 'closeAdminSession',
  method: 'post',
  path: '/admin/auth/logout',
  effects: [],
  adminRoles: ['admin'],
  audit: { action: 'admin.session.closed', resourceKind: 'admin_session' },
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeLogoutAdministrativoTotal = defineRoute({
  operationId: 'closeAllAdminSessions',
  method: 'post',
  path: '/admin/auth/logout-all',
  effects: ['irreversible_write'],
  adminRoles: ['admin'],
  audit: { action: 'admin.session.all_closed', resourceKind: 'admin_session' },
  rateLimit: [{ dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeReautenticacaoAdministrativa = defineRoute({
  operationId: 'reauthenticateAdmin',
  method: 'post',
  path: '/admin/auth/reauth',
  effects: ['verifies_secret'],
  adminRoles: ['admin'],
  audit: { action: 'admin.session.reauthenticated', resourceKind: 'admin_session' },
  rateLimit: [
    { dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' },
    { dimension: ['account'], limit: 5, window: '1h', onExceed: 'deny_429', appliesTo: 'invalid_attempts' },
  ],
});

/**
 * O "nao fui eu" do painel (D62). Sem sessao, como o login, e por isso na lista
 * fechada de operacoes sem sessao; `Origin` exato continua valendo pela guarda.
 * Teto por IP com `log_and_alert`, e nao `deny_429`: recusar trabalharia contra
 * quem a rota protege, e o token de 256 bits e a defesa real.
 */
export const rotaDoNaoFuiEuAdministrativo = defineRoute({
  operationId: 'disavowAdminSessionAlert',
  method: 'post',
  path: '/admin/auth/disavow',
  effects: ['verifies_secret', 'notifies', 'irreversible_write'],
  noChallenge: true,
  adminPublic: true,
  audit: { action: 'admin.session.disavowed', resourceKind: 'admin_account' },
  rateLimit: [{ dimension: ['ip'], limit: 10, window: '1h', onExceed: 'log_and_alert' }],
});

export interface DependenciasDasRotasDaSessaoAdministrativa {
  readonly sessoes: SessaoAdministrativaService;
  readonly contrato: Contrato;
}

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(`Operacao ${operationId} sem corpo application/json no contrato. Corrija a especificacao.`);
  }
  return schema;
}

/**
 * O e-mail do corpo, normalizado e em HMAC, como na rota de login do app. O
 * balde existe para e-mail que nao tem conta tambem: o bloqueio que so valesse
 * para conta existente contaria a quem testa quem tem conta (D44).
 */
const emailDoCorpo: ResolvedorDeDimensao = (request, sigilo) => {
  const corpo = (request.body ?? {}) as { email?: unknown };
  if (typeof corpo.email !== 'string' || corpo.email === '') return undefined;
  const normalizado = normalizarEmail(corpo.email);
  return normalizado === '' ? undefined : sigilo.hmac(`admin-email:${normalizado}`);
};

/**
 * A conta da sessao que a guarda conferiu. A guarda roda antes de todo teto da
 * rota. O prefixo `admin:` e o que impede um balde do painel e um do app de
 * dividirem chave, mesmo que um dia dois UUIDs coincidam (T18, item 20.2).
 */
const contaDaSessao: ResolvedorDeDimensao = (request) => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

export function registrarRotasDaSessaoAdministrativa(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaSessaoAdministrativa,
): void {
  registrarRota(
    app,
    rotaDeLoginAdministrativo,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeLoginAdministrativo.operationId) },
      resolvedores: { email: emailDoCorpo },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { email: string; password: string };
      const captcha = request.headers['x-captcha-token'];
      const aberta = await deps.sessoes.entrar(
        {
          email: corpo.email,
          password: corpo.password,
          captchaToken: typeof captcha === 'string' ? captcha : undefined,
        },
        contextoDaGuarda(request),
      );
      void reply.header('set-cookie', cookieDaSessao(aberta.valorDoCookie));
      return reply.status(200).send(aberta.visao);
    },
  );

  registrarRota(
    app,
    rotaDoNaoFuiEuAdministrativo,
    { schema: { body: corpoDe(deps.contrato, rotaDoNaoFuiEuAdministrativo.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { token: string };
      await deps.sessoes.desautorizar(corpo.token, contextoDaGuarda(request));
      return reply.status(204).send();
    },
  );

  registrarRota(app, rotaDaSessaoAdministrativa, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const valor = lerCookieDaSessao(request.headers.cookie);
    // A guarda ja conferiu este mesmo cookie; a ausencia aqui e fiacao quebrada.
    if (valor === undefined) throw new Error('GET /admin/session sem cookie depois da guarda');
    return reply.status(200).send(deps.sessoes.visaoDaSessao(sessaoAdministrativaDe(request), valor));
  });

  registrarRota(
    app,
    rotaDeLogoutAdministrativo,
    { resolvedores: { account: contaDaSessao } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await deps.sessoes.sair(sessaoAdministrativaDe(request), contextoDaGuarda(request));
      void reply.header('set-cookie', cookieQueApagaASessao());
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeLogoutAdministrativoTotal,
    { resolvedores: { account: contaDaSessao } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await deps.sessoes.sairDeTodas(sessaoAdministrativaDe(request), contextoDaGuarda(request));
      void reply.header('set-cookie', cookieQueApagaASessao());
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeReautenticacaoAdministrativa,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeReautenticacaoAdministrativa.operationId) },
      resolvedores: { account: contaDaSessao },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // O contrato aceita `scope` OU `scopes` (oneOf), e o Ajv ja recusou os
      // dois juntos e a lista repetida ou vazia.
      const corpo = request.body as {
        password: string;
        scope?: EscopoDeReautenticacaoAdministrativa;
        scopes?: EscopoDeReautenticacaoAdministrativa[];
      };
      const escopos = corpo.scopes ?? (corpo.scope === undefined ? [] : [corpo.scope]);
      const janela = await deps.sessoes.reautenticar(
        sessaoAdministrativaDe(request),
        corpo.password,
        escopos,
        contextoDaGuarda(request),
      );
      const [primeiro] = janela.tokens;
      if (primeiro === undefined) throw new Error('reautenticacao sem token: o servico recusa lista vazia');
      void reply.header('set-cookie', cookieDaSessao(janela.valorDoCookie));
      return reply.status(200).send({
        reauth_token: primeiro.reauthToken,
        expires_in: janela.expiresIn,
        scope: primeiro.scope,
        csrf_token: janela.csrfToken,
        tokens: janela.tokens.map((t) => ({ scope: t.scope, reauth_token: t.reauthToken })),
      });
    },
  );
}
