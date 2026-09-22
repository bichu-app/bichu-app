/**
 * Rotas de conta e sessão.
 *
 * Cada rota é declarada com `defineRoute`, e o `operationId` é o mesmo da
 * especificação — é a chave de rastreio entre os dois documentos. O `effects` e
 * o `rateLimit` **espelham** `api/openapi.yaml`; a política é de
 * `docs/04-seguranca.md` e não é redefinida aqui.
 *
 * Rota com efeito e sem teto **não compila** (`shared/http/route-definition.ts`).
 * Remover o `rateLimit` de qualquer bloco abaixo é erro de compilação, não
 * achado de revisão.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import {
  camposPendentesDoPerfil,
  podeAbrirCasoDePerdido,
} from '../../domain/completude-do-perfil.js';
import { normalizarEmail } from '../../domain/email.js';
import type { ResolvedorDeDimensao } from '../../../../shared/http/aplicacao-de-teto.js';
import type { Conta } from '../../ports/identity-repository.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { Contrato } from '../../../../shared/http/contract.js';
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
  // `challenge` não pode ser usado aqui: quem chama é o app em segundo plano, e
  // não há quem responda ao desafio. O efeito real não seria desafiar, seria a
  // sessão morrer em silêncio — e o usuário descobre no dia em que abre o app
  // com o pet sumido.
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
  // Revogar a própria sessão não alcança ninguém de fora do processo. O teto
  // existe assim mesmo, por decisão da política: a regra é piso, não teto.
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
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

export const rotaDeConfirmacaoDeEmail = defineRoute({
  operationId: 'confirmEmailVerification',
  method: 'post',
  path: '/auth/email-verification/confirm',
  effects: ['verifies_secret'],
  rateLimit: [{ dimension: ['ip'], limit: 20, window: '1h', onExceed: 'deny_429' }],
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

export const rotaDeConfirmacaoDeRedefinicao = defineRoute({
  operationId: 'confirmPasswordReset',
  method: 'post',
  path: '/auth/password-reset/confirm',
  effects: ['verifies_secret', 'notifies', 'irreversible_write'],
  rateLimit: [{ dimension: ['ip'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeConferenciaDeRedefinicao = defineRoute({
  operationId: 'checkPasswordResetToken',
  method: 'get',
  path: '/public/password-reset/:token',
  // Só lê. É a página do time web perguntando "vale a pena mostrar o
  // formulário?" antes de a pessoa digitar uma senha para um link morto.
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 60, window: '1h', onExceed: 'deny_429' }],
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
}

/**
 * Higiene da rota que carrega token na URL.
 *
 * O token de redefinição viaja no caminho porque ele vem de um link de e-mail,
 * e isso é inevitável. O que dá para impedir é que ele seja indexado, que vaze
 * pelo cabeçalho `Referer` para todo terceiro que a página carregar, e que
 * fique guardado em cache intermediário (critério 11: o token não aparece em
 * registro nenhum).
 */
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

/**
 * Schema de corpo tirado da própria especificação. Uma fonte só: schemas de
 * OpenAPI 3.1 são JSON Schema, e o Fastify valida com JSON Schema. Validação
 * escrita à mão em paralelo à spec é a segunda definição que diverge.
 */
function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        `no contrato, mas a rota espera um. Corrija a especificação, não o código.`,
    );
  }
  return schema;
}

/**
 * `email` para o teto, **resumido**, nunca em claro.
 *
 * O balde vai para `rate_limit_counters.bucket_key`, no Postgres: lido por quem
 * opera o banco, exportado em despejo de diagnóstico e sobrevivente à exclusão
 * da conta. Um endereço em claro ali é o mesmo problema que o SEC-010 descreve
 * para o IP, num lugar onde ninguém vai procurá-lo — e aqui é pior, porque a
 * lista de endereços que TENTARAM entrar inclui gente que nunca teve conta.
 *
 * A normalização vem do domínio (`normalizarEmail`) e não é escrita aqui: se o
 * teto normalizasse diferente do login, `A@x.com` e `a@x.com` cairiam em baldes
 * distintos e o teto de 5 por hora viraria 10 para quem alternasse a caixa.
 */
const emailDoCorpo: ResolvedorDeDimensao = (request, sigilo) => {
  const corpo = (request.body ?? {}) as { email?: unknown };
  if (typeof corpo.email !== 'string' || corpo.email === '') return undefined;
  const normalizado = normalizarEmail(corpo.email);
  return normalizado === '' ? undefined : sigilo.hmac(`email:${normalizado}`);
};

/**
 * Autenticação MEMOIZADA por requisição.
 *
 * O teto por `account` roda antes do handler e precisa saber de quem é a
 * sessão; o handler precisa da mesma coisa. Sem a memória, toda rota
 * autenticada passaria a verificar RS256 e ler `users` duas vezes — dobrar a
 * carga do banco para aplicar um teto que existe para reduzir carga.
 */
function autenticado(request: FastifyRequest, deps: DependenciasDasRotas): Promise<Autenticado> {
  return memoDaRequisicao(request, 'identity:autenticado', () =>
    deps.auth.autenticar(tokenDoCabecalho(request)),
  );
}

/**
 * `account` para o teto: o id da conta, ou `undefined` para quem não apresentou
 * credencial válida.
 *
 * Engolir a falha aqui é correto e não é atalho: quem não tem sessão não tem
 * balde de conta, e a recusa dele é 401 do handler, não 429. O que sustenta o
 * caso de quem martela sem credencial são as entradas por `ip` da mesma rota.
 *
 * O valor vai em claro na chave do balde, e essa é a exceção declarada do
 * `Sigilo`: é UUID interno, `bucket_key` não sai em resposta nenhuma, e o
 * resumo tornaria impossível responder "qual conta bateu no teto".
 */
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
  app: FastifyInstance,
  deps: DependenciasDasRotas,
): void {
  /**
   * O perfil como o contrato o declara, campo a campo.
   *
   * `pending_profile_fields` e `can_open_lost_case` são calculados na leitura, e
   * não guardados: são função do estado da conta. Uma coluna que os guardasse
   * seria uma segunda fonte, e ela envelheceria na primeira verificação de
   * e-mail que alguém esquecesse de propagar.
   *
   * `reference_area` sai **nula inteira** quando nenhum dos campos existe, em
   * vez de um objeto com quatro nulos: a tela distingue "não informou" de
   * "informou parcialmente", e quatro nulos dentro de um objeto parecem a
   * segunda coisa.
   */
  const comoRespostaDoPerfil = (conta: Conta): Record<string, unknown> => {
    const temArea =
      conta.referencePostalCode !== null ||
      conta.referenceNeighborhood !== null ||
      conta.referenceCity !== null ||
      conta.referenceState !== null;

    return {
      id: conta.id,
      email: conta.email,
      email_verified: conta.emailVerifiedAt !== null,
      pending_email: conta.pendingEmail,
      email_deliverable: conta.emailDeliverable,
      display_name: conta.displayName,
      phone_e164: conta.phoneE164,
      phone_verified: conta.phoneVerifiedAt !== null,
      reference_area: temArea
        ? {
            postal_code: conta.referencePostalCode,
            neighborhood: conta.referenceNeighborhood,
            city: conta.referenceCity,
            state: conta.referenceState,
          }
        : null,
      pending_profile_fields: camposPendentesDoPerfil(conta),
      can_open_lost_case: podeAbrirCasoDePerdido(conta),
      created_at: conta.createdAt.toISOString(),
    };
  };

  registrarRota(
    app,
    rotaDePedidoDeVerificacao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDePedidoDeVerificacao.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = (request.body ?? {}) as { email?: string };
      const cabecalho = request.headers.authorization;

      // A operação aceita conta OU e-mail no corpo. Com conta, o endereço vem
      // da sessão e o do corpo é ignorado: aceitar o do corpo deixaria alguém
      // logado disparar e-mail nosso para um endereço qualquer.
      let email = corpo.email;
      if (typeof cabecalho === 'string' && cabecalho.startsWith('Bearer ')) {
        const { conta } = await deps.auth.autenticar(tokenDoCabecalho(request));
        email = conta.email;
      }

      // 202 mesmo sem e-mail nenhum: a resposta não varia com a entrada.
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
      const userId = await deps.auth.confirmarVerificacaoDeEmail(token, contextoDe(request));
      const conta = await deps.auth.meuPerfil(userId);
      return reply.status(200).send(comoRespostaDoPerfil(conta));
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
      // SEMPRE 202, exista a conta ou não (critério 2). Qualquer diferença aqui
      // é um oráculo de existência de e-mail, consultável sem conta nenhuma.
      return reply.status(202).send();
    },
  );

  registrarRota(app, rotaDeConferenciaDeRedefinicao, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    aplicarHigieneDeTokenNaUrl(reply);
    const { token } = request.params as { token: string };
    await deps.auth.conferirTokenDeRedefinicao(token);
    // Corpo vazio de propósito: a página só precisa saber se vale mostrar o
    // formulário. Devolver o e-mail aqui entregaria o endereço a quem tivesse o
    // link — que é exatamente quem pode não ser o titular.
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
    return reply.status(200).send(comoRespostaDoPerfil(await deps.auth.meuPerfil(conta.id)));
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
        phone_e164?: string;
        reference_area?: {
          postal_code?: string;
          neighborhood?: string;
          city?: string;
          state?: string;
        };
      };

      // `undefined` é "não mexer". A área vem aninhada no contrato e achatada no
      // banco, e é aqui que a tradução acontece — o repositório não conhece a
      // forma do JSON e o contrato não conhece a forma da tabela.
      const area = corpo.reference_area;
      const atualizada = await deps.auth.atualizarMeuPerfil(
        conta.id,
        {
          ...(corpo.display_name === undefined ? {} : { displayName: corpo.display_name }),
          ...(corpo.phone_e164 === undefined ? {} : { phoneE164: corpo.phone_e164 }),
          ...(area?.postal_code === undefined ? {} : { referencePostalCode: area.postal_code }),
          ...(area?.neighborhood === undefined ? {} : { referenceNeighborhood: area.neighborhood }),
          ...(area?.city === undefined ? {} : { referenceCity: area.city }),
          ...(area?.state === undefined ? {} : { referenceState: area.state }),
        },
        contextoDe(request),
      );

      return reply.status(200).send(comoRespostaDoPerfil(atualizada));
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
        display_name?: string;
        accepted_terms_version?: string;
      };
      const sessao = await deps.auth.cadastrar(
        {
          email: corpo.email,
          password: corpo.password,
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
          // A escolha nasce desmarcada. Ausente é falso, nunca verdadeiro.
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
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      const corpo = (request.body ?? {}) as { refresh_token?: string };
      await deps.auth.sair(sessao, corpo.refresh_token, contextoDe(request));
      return reply.status(204).send();
    },
  );
}

/**
 * Rotas de descoberta, fora do prefixo `/v1`: quem as consulta não é o nosso
 * app, e sim o sistema operacional ou uma biblioteca, que espera encontrá-las na
 * raiz do host da API.
 */
export function registrarRotasDeDescoberta(
  app: FastifyInstance,
  deps: DependenciasDasRotas,
): void {
  registrarRota(app, rotaDoJwks, {}, async (_request: FastifyRequest, reply: FastifyReply) => {
    // Cacheável por 1 hora, e quem consome deve rebuscar quando encontrar um
    // `kid` desconhecido, em vez de recusar.
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
