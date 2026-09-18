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
import {
  camposPendentesDoPerfil,
  podeAbrirCasoDePerdido,
} from '../../domain/completude-do-perfil.js';
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

  app.get(rotaDoMeuPerfil.path, async (request: FastifyRequest, reply: FastifyReply) => {
    const { conta } = await deps.auth.autenticar(tokenDoCabecalho(request));
    return reply.status(200).send(comoRespostaDoPerfil(await deps.auth.meuPerfil(conta.id)));
  });

  app.patch(
    rotaDeEdicaoDoPerfil.path,
    { schema: { body: corpoDe(deps.contrato, rotaDeEdicaoDoPerfil.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await deps.auth.autenticar(tokenDoCabecalho(request));
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

  app.post(
    rotaDeCadastro.path,
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

  app.post(
    rotaDeLogin.path,
    { schema: { body: corpoDe(deps.contrato, rotaDeLogin.operationId) } },
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

  app.post(
    rotaDeRenovacao.path,
    { schema: { body: corpoDe(deps.contrato, rotaDeRenovacao.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { refresh_token: string };
      const sessao = await deps.auth.renovar(corpo.refresh_token, contextoDe(request));
      return reply.status(200).send(sessao);
    },
  );

  app.post(rotaDeLogout.path, async (request: FastifyRequest, reply: FastifyReply) => {
    const autenticado: Autenticado = await deps.auth.autenticar(tokenDoCabecalho(request));
    const corpo = (request.body ?? {}) as { refresh_token?: string };
    await deps.auth.sair(autenticado, corpo.refresh_token, contextoDe(request));
    return reply.status(204).send();
  });
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
  app.get(rotaDoJwks.path, async (_request: FastifyRequest, reply: FastifyReply) => {
    // Cacheável por 1 hora, e quem consome deve rebuscar quando encontrar um
    // `kid` desconhecido, em vez de recusar.
    return reply
      .header('Cache-Control', 'public, max-age=3600')
      .send({ keys: deps.assinador.jwks() });
  });

  app.get(rotaDeDescoberta.path, async (_request: FastifyRequest, reply: FastifyReply) => {
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
