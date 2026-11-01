import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import {
  registrarRota,
  CABECALHO_DE_REAUTENTICACAO,
  type RegistradorDeRotas,
  type VerificadorDeReautenticacao,
} from '../../../../shared/http/registrar-rota.js';
import type { ReauthScope } from '../../../../shared/http/route-definition.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { normalizarEmail } from '../../domain/email.js';
import type { ResolvedorDeDimensao } from '../../../../shared/http/aplicacao-de-teto.js';
import type { Conta, FotoDoPerfil } from '../../ports/identity-repository.js';
import { projetarMeuPerfil } from '../../domain/resposta-do-perfil.js';
import { problemas } from '../../../../shared/http/errors.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { corpoAusenteEhCorpoVazio } from '../../../../shared/http/corpo-opcional.js';
import type { AuthService, Autenticado } from '../../application/auth-service.js';
import type { ContextoDaRequisicao } from '../../application/dependencies.js';
import type { TokenSigner } from '../../ports/token-signer.js';

export const rotaDeCadastro = defineRoute({
  operationId: 'registerUser',
  method: 'post',
  path: '/auth/register',
  effects: ['notifies', 'verifies_secret'],
  rateLimit: [
    { dimension: ['ip'], limit: 5, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip_24'], limit: 30, window: '1h', onExceed: 'challenge' },
    {
      dimension: ['origin'],
      counts: 'distinct_emails',
      limit: 50,
      window: '24h',
      onExceed: 'log_and_alert',
    },
  ],
});

export const rotaDeLogin = defineRoute({
  operationId: 'login',
  method: 'post',
  path: '/auth/login',
  effects: ['verifies_secret'],
  rateLimit: [
    { dimension: ['email'], limit: 5, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip'], limit: 10, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip_24'], limit: 100, window: '1h', onExceed: 'log_and_alert' },
  ],
});

export const rotaDeRenovacao = defineRoute({
  operationId: 'refreshSession',
  method: 'post',
  path: '/auth/refresh',
  effects: ['verifies_secret'],
  noChallenge: true,
  rateLimit: [
    { dimension: ['token_family'], limit: 10, window: '1m', onExceed: 'deny_429' },
    {
      dimension: ['ip'],
      appliesTo: 'invalid_attempts',
      limit: 500,
      window: '1h',
      onExceed: 'log_and_alert',
    },
    { dimension: ['ip'], limit: 2000, window: '1h', onExceed: 'log_and_alert' },
  ],
});

export const rotaDeLogout = defineRoute({
  operationId: 'logout',
  method: 'post',
  path: '/auth/logout',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/**
 * O outro verbo. Ver a emenda 1 do ADR-0002: `logout` é este aparelho,
 * `logout-all` é a conta inteira.
 */
export const rotaDeLogoutTotal = defineRoute({
  operationId: 'logoutAllDevices',
  method: 'post',
  path: '/auth/logout-all',
  effects: ['notifies'],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' }],
  reauthScope: 'session_revocation',
});

/**
 * A operação que abre a janela, e a única do sistema que confere a senha de alguém
 * já autenticado (critério 10 da BICHUS-48).
 */
export const rotaDeReautenticacao = defineRoute({
  operationId: 'reauthenticate',
  method: 'post',
  path: '/auth/reauth',
  effects: ['verifies_secret'],
  rateLimit: [
    { dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['account'],
      limit: 5,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

export const rotaDeTrocaDeSenha = defineRoute({
  operationId: 'changePassword',
  method: 'put',
  path: '/auth/password',
  effects: ['verifies_secret', 'notifies'],
  rateLimit: [
    { dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['account'],
      limit: 5,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

export const rotaDoMeuPerfil = defineRoute({
  operationId: 'getMe',
  method: 'get',
  path: '/me',
  effects: [],
});

export const rotaDeEdicaoDoPerfil = defineRoute({
  operationId: 'updateMe',
  method: 'patch',
  path: '/me',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/** O teto é de CONTA, 5 por 24 horas, e espelha `api/openapi.yaml`. */
export const rotaDeTrocaDeEmail = defineRoute({
  operationId: 'requestEmailChange',
  method: 'post',
  path: '/me/email-change',
  effects: ['notifies'],
  reauthScope: 'email_change',
  rateLimit: [{ dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' }],
});

export const rotaDePedidoDeVerificacao = defineRoute({
  operationId: 'requestEmailVerification',
  method: 'post',
  path: '/auth/email-verification',
  effects: ['notifies'],
  rateLimit: [
    { dimension: ['account'], limit: 3, window: '1h', onExceed: 'deny_429' },
    { dimension: ['ip'], limit: 10, window: '1h', onExceed: 'challenge' },
  ],
});

/** Confirmar o e-mail pelo token do link. */
export const rotaDeConfirmacaoDeEmail = defineRoute({
  operationId: 'confirmEmailVerification',
  method: 'post',
  path: '/auth/email-verification/confirm',
  effects: ['verifies_secret'],
  rateLimit: [
    {
      dimension: ['ip'],
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

export const rotaDePedidoDeRedefinicao = defineRoute({
  operationId: 'requestPasswordReset',
  method: 'post',
  path: '/auth/password-reset',
  effects: ['notifies'],
  rateLimit: [
    { dimension: ['email'], limit: 3, window: '1h', onExceed: 'deny_429' },
    { dimension: ['ip'], limit: 10, window: '1h', onExceed: 'challenge' },
  ],
});

/** Definir a senha nova pelo token do link. */
export const rotaDeConfirmacaoDeRedefinicao = defineRoute({
  operationId: 'confirmPasswordReset',
  method: 'post',
  path: '/auth/password-reset/confirm',
  effects: ['verifies_secret', 'notifies', 'irreversible_write'],
  rateLimit: [
    {
      dimension: ['ip'],
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

/** Diz se o link de redefinição ainda vale. */
export const rotaDeConferenciaDeRedefinicao = defineRoute({
  operationId: 'checkPasswordResetToken',
  method: 'get',
  path: '/public/password-reset/:token',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 30, window: '1h', onExceed: 'log_and_alert' }],
});

/** A exclusão de conta. Teto de 3 por 24 h, que é o do contrato. */
export const rotaDeExclusaoDaConta = defineRoute({
  operationId: 'deleteMyAccount',
  method: 'delete',
  path: '/me',
  effects: ['irreversible_write', 'verifies_secret', 'notifies'],
  reauthScope: 'account_deletion',
  rateLimit: [{ dimension: ['account'], limit: 3, window: '24h', onExceed: 'deny_429' }],
});

/** O "Não fui eu", e ele é a única rota de revogação sem conta do produto. */
export const rotaDoNaoFuiEu = defineRoute({
  operationId: 'disavowSessionAlert',
  method: 'post',
  path: '/public/session-alerts/:alertToken/disavow',
  effects: ['verifies_secret', 'notifies', 'irreversible_write'],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 10, window: '1h', onExceed: 'log_and_alert' }],
});

export const rotaDoJwks = defineRoute({
  operationId: 'jwks',
  method: 'get',
  path: '/.well-known/jwks.json',
  effects: [],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 600, window: '1h', onExceed: 'log_and_alert' }],
});

export const rotaDeDescoberta = defineRoute({
  operationId: 'openidConfiguration',
  method: 'get',
  path: '/.well-known/openid-configuration',
  effects: [],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 600, window: '1h', onExceed: 'log_and_alert' }],
});

export interface DependenciasDasRotas {
  readonly auth: AuthService;
  readonly assinador: TokenSigner;
  readonly contrato: Contrato;
  readonly issuer: string;
  readonly apiBaseUrl: string;
  /** A URL publica de uma chave de derivada (18/10/2026, com a foto do perfil). */
  readonly urlDeMidia: (chave: string) => string;
}

function aplicarHigieneDeTokenNaUrl(reply: FastifyReply): void {
  void reply.header('X-Robots-Tag', 'noindex, nofollow');
  void reply.header('Referrer-Policy', 'no-referrer');
  void reply.header('Cache-Control', 'no-store');
}

function contextoDe(request: FastifyRequest): ContextoDaRequisicao {
  return {
    correlationId: request.id,
    ip: request.ip,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
  };
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
    throw problemas.naoAutenticado();
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.naoAutenticado();
  return token;
}

const emailDoCorpo: ResolvedorDeDimensao = (request, sigilo) => {
  const corpo = (request.body ?? {}) as { email?: unknown };
  if (typeof corpo.email !== 'string' || corpo.email === '') return undefined;
  const normalizado = normalizarEmail(corpo.email);
  return normalizado === '' ? undefined : sigilo.hmac(`email:${normalizado}`);
};

function autenticado(request: FastifyRequest, deps: DependenciasDasRotas): Promise<Autenticado> {
  return memoDaRequisicao(request, 'identity:autenticado', () =>
    deps.auth.autenticar(tokenDoCabecalho(request)),
  );
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotas,
): Promise<string | undefined> {
  try {
    return (await autenticado(request, deps)).conta.id;
  } catch {
    return undefined;
  }
}

export function registrarRotasDeIdentidade(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotas,
): void {
  const comoRespostaDoPerfil = (conta: Conta, foto: FotoDoPerfil | null): Record<string, unknown> =>
    projetarMeuPerfil(conta, foto, deps.urlDeMidia);

  registrarRota(
    app,
    rotaDePedidoDeVerificacao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDePedidoDeVerificacao.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      preValidation: [
        corpoAusenteEhCorpoVazio(deps.contrato, rotaDePedidoDeVerificacao.operationId),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = (request.body ?? {}) as { email?: string };
      const cabecalho = request.headers.authorization;

      let email = corpo.email;
      if (typeof cabecalho === 'string' && cabecalho.startsWith('Bearer ')) {
        const { conta } = await deps.auth.autenticar(tokenDoCabecalho(request));
        email = conta.email;
      }

      if (email !== undefined && email !== '') {
        await deps.auth.solicitarVerificacaoDeEmail(email, contextoDe(request));
      }
      return reply.status(202).send();
    },
  );

  registrarRota(
    app,
    rotaDeConfirmacaoDeEmail,
    { schema: { body: corpoDe(deps.contrato, rotaDeConfirmacaoDeEmail.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.body as { token: string };
      const sessao = await deps.auth.confirmarVerificacaoDeEmail(token, contextoDe(request));
      return reply.status(200).send(sessao);
    },
  );

  registrarRota(
    app,
    rotaDePedidoDeRedefinicao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDePedidoDeRedefinicao.operationId) },
      resolvedores: { email: emailDoCorpo },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email } = request.body as { email: string };
      await deps.auth.solicitarRedefinicaoDeSenha(email, contextoDe(request));
      return reply.status(202).send();
    },
  );

  registrarRota(app, rotaDeConferenciaDeRedefinicao, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    aplicarHigieneDeTokenNaUrl(reply);
    const { token } = request.params as { token: string };
    await deps.auth.conferirTokenDeRedefinicao(token);
    return reply.status(200).send({ valid: true });
  });

  registrarRota(
    app,
    rotaDeConfirmacaoDeRedefinicao,
    { schema: { body: corpoDe(deps.contrato, rotaDeConfirmacaoDeRedefinicao.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { token: string; new_password: string };
      await deps.auth.confirmarRedefinicaoDeSenha(corpo.token, corpo.new_password, contextoDe(request));
      return reply.status(204).send();
    },
  );

  registrarRota(app, rotaDoMeuPerfil, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const { conta } = await autenticado(request, deps);
    const [perfil, foto] = await Promise.all([
      deps.auth.meuPerfil(conta.id),
      deps.auth.minhaFoto(conta.id),
    ]);
    return reply.status(200).send(comoRespostaDoPerfil(perfil, foto));
  });

  registrarRota(
    app,
    rotaDeEdicaoDoPerfil,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeEdicaoDoPerfil.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const corpo = request.body as {
        display_name?: string;
        handle?: unknown;
        phone_e164?: string;
        photo_upload_id?: string | null;
        reference_area?: {
          postal_code?: string;
          neighborhood?: string;
          city?: string;
          state?: string;
        };
      };

      if (corpo.photo_upload_id !== undefined) {
        await deps.auth.exigirNomeJaCadastrado(conta.id, corpo.display_name);
        await deps.auth.trocarMinhaFoto(conta.id, corpo.photo_upload_id, contextoDe(request));
      }

      const area = corpo.reference_area;
      const atualizada = await deps.auth.atualizarMeuPerfil(
        conta.id,
        {
          ...(corpo.display_name === undefined ? {} : { displayName: corpo.display_name }),
          ...(corpo.handle === undefined ? {} : { handle: corpo.handle as string }),
          ...(corpo.phone_e164 === undefined ? {} : { phoneE164: corpo.phone_e164 }),
          ...(area?.postal_code === undefined ? {} : { referencePostalCode: area.postal_code }),
          ...(area?.neighborhood === undefined ? {} : { referenceNeighborhood: area.neighborhood }),
          ...(area?.city === undefined ? {} : { referenceCity: area.city }),
          ...(area?.state === undefined ? {} : { referenceState: area.state }),
        },
        contextoDe(request),
      );

      return reply
        .status(200)
        .send(comoRespostaDoPerfil(atualizada, await deps.auth.minhaFoto(conta.id)));
    },
  );

  registrarRota(
    app,
    rotaDeTrocaDeEmail,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeTrocaDeEmail.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const { new_email } = request.body as { new_email: string };

      await deps.auth.solicitarTrocaDeEmail(conta.id, new_email, contextoDe(request));

      return reply.status(202).send();
    },
  );

  registrarRota(
    app,
    rotaDeCadastro,
    { schema: { body: corpoDe(deps.contrato, rotaDeCadastro.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as {
        email: string;
        password: string;
        birth_date?: unknown;
        handle?: unknown;
        display_name?: string;
        accepted_terms_version?: string;
      };
      const sessao = await deps.auth.cadastrar(
        {
          email: corpo.email,
          password: corpo.password,
          birthDate: corpo.birth_date,
          handle: corpo.handle,
          displayName: corpo.display_name,
          acceptedTermsVersion: corpo.accepted_terms_version,
        },
        contextoDe(request),
      );
      return reply.status(201).send(sessao);
    },
  );

  registrarRota(
    app,
    rotaDeLogin,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeLogin.operationId) },
      resolvedores: { email: emailDoCorpo },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { email: string; password: string; stay_signed_in?: boolean };
      const sessao = await deps.auth.entrar(
        {
          email: corpo.email,
          password: corpo.password,
          staySignedIn: corpo.stay_signed_in === true,
        },
        contextoDe(request),
      );
      return reply.status(200).send(sessao);
    },
  );

  registrarRota(
    app,
    rotaDeRenovacao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeRenovacao.operationId) },
      resolvedores: {
        token_family: async (request) => {
          const corpo = (request.body ?? {}) as { refresh_token?: string };
          if (typeof corpo.refresh_token !== 'string' || corpo.refresh_token === '') {
            return undefined;
          }
          return deps.auth.familiaDoRefresh(corpo.refresh_token);
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { refresh_token: string };
      const sessao = await deps.auth.renovar(corpo.refresh_token, contextoDe(request));
      return reply.status(200).send(sessao);
    },
  );

  registrarRota(
    app,
    rotaDeLogout,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeLogout.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      const corpo = request.body as { refresh_token: string };
      await deps.auth.sair(sessao, corpo.refresh_token, contextoDe(request));
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeLogoutTotal,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      await deps.auth.sairDeTodosOsAparelhos(sessao, contextoDe(request));
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeReautenticacao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeReautenticacao.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      const corpo = request.body as { password: string; scope: ReauthScope };
      const janela = await deps.auth.reautenticar(
        sessao,
        corpo.password,
        corpo.scope,
        contextoDe(request),
      );
      return reply.status(200).send({
        reauth_token: janela.reauthToken,
        expires_in: janela.expiresIn,
        scope: janela.scope,
      });
    },
  );

  registrarRota(
    app,
    rotaDeExclusaoDaConta,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      await deps.auth.excluirMinhaConta(sessao, contextoDe(request));
      return reply.status(202).send();
    },
  );

  registrarRota(
    app,
    rotaDoNaoFuiEu,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      aplicarHigieneDeTokenNaUrl(reply);
      const { alertToken } = request.params as { alertToken: string };
      await deps.auth.recusarSessaoAvisada(alertToken, contextoDe(request));
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeTrocaDeSenha,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeTrocaDeSenha.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      const corpo = request.body as { current_password: string; new_password: string };
      await deps.auth.trocarSenha(
        sessao,
        corpo.current_password,
        corpo.new_password,
        contextoDe(request),
      );
      return reply.status(204).send();
    },
  );
}

/**
 * O verificador que `criarServidor` instala, e que `registrarRota` chama em toda
 * rota que declara `reauthScope`.
 */
export function criarVerificadorDeReautenticacao(
  deps: DependenciasDasRotas,
): VerificadorDeReautenticacao {
  return async (request: FastifyRequest, escopo: ReauthScope): Promise<void> => {
    const sessao: Autenticado = await autenticado(request, deps);
    const cabecalho = request.headers[CABECALHO_DE_REAUTENTICACAO];
    const apresentado = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
    await deps.auth.consumirReautenticacao(sessao, apresentado, escopo, contextoDe(request));
  };
}

/**
 * Rotas de descoberta, fora do prefixo `/v1`: quem as consulta não é o nosso app,
 * e sim o sistema operacional ou uma biblioteca, que espera encontrá-las na raiz
 * do host da API.
 */
export function registrarRotasDeDescoberta(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotas,
): void {
  registrarRota(app, rotaDoJwks, {}, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .header('Cache-Control', 'public, max-age=3600')
      .send({ keys: deps.assinador.jwks() });
  });

  registrarRota(app, rotaDeDescoberta, {}, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.header('Cache-Control', 'public, max-age=3600').send({
      issuer: deps.issuer,
      jwks_uri: `${deps.apiBaseUrl}${rotaDoJwks.path}`,
      token_endpoint: `${deps.apiBaseUrl}/v1${rotaDeLogin.path}`,
      id_token_signing_alg_values_supported: ['RS256'],
      grant_types_supported: ['password', 'refresh_token'],
      response_types_supported: ['token'],
    });
  });
}
