/**
 * Rotas da credencial digital (passkey). BICHUS-301.
 *
 * Arquivo próprio e não acrescentado a `routes.ts`, que já tem mil linhas: as
 * seis operações são uma frente inteira, e `_arvoreDasTelas` à parte, misturar
 * garantiria conflito de mescla com as outras duas sessões deste repositório em
 * toda alteração de conta.
 *
 * O `operationId` é o mesmo da especificação — é a chave de rastreio entre os
 * dois documentos —, e `effects` e `rateLimit` **espelham** `api/openapi.yaml`.
 * Rota com efeito e sem teto não compila.
 *
 * ## A GRAFIA DO CORPO DA RESPOSTA É DO CONTRATO, NUNCA DA BIBLIOTECA
 *
 * As quatro rotas que montam corpo à mão já escreviam `created_at` e
 * `last_used_at`. As DUAS de `options` não: elas faziam `reply.send()` do
 * retorno cru de `@simplewebauthn/server`, que é camelCase por natureza, e
 * emitiam `rpId`/`userVerification`/`pubKeyCredParams` onde o contrato declara
 * `rp_id`/`user_verification`/`pub_key_cred_params`. O app lia nulo e a falha
 * ficava indistinguível de "esta conta não tem passkey" — ver
 * `passkey-grafia.ts`, que faz a tradução, e `passkey-grafia.test.ts`, que
 * compara o corpo REAL destas duas rotas com o schema declarado.
 *
 * Nada neste projeto valida corpo de RESPOSTA contra a especificação, então a
 * regra aqui é de mão: **nenhuma destas seis rotas envia objeto que não foi
 * montado na grafia do contrato.**
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { AuthService, Autenticado } from '../../application/auth-service.js';
import type { PasskeyService } from '../../application/passkey-service.js';
import type { ContextoDaRequisicao } from '../../application/dependencies.js';
import {
  grafiaDasOpcoesDeCadastro,
  grafiaDasOpcoesDeEntrada,
} from './passkey-grafia.js';

export const rotaDeInicioDoCadastroDePasskey = defineRoute({
  operationId: 'beginPasskeyRegistration',
  method: 'post',
  path: '/auth/passkey/registration/options',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeConclusaoDoCadastroDePasskey = defineRoute({
  operationId: 'finishPasskeyRegistration',
  method: 'post',
  path: '/auth/passkey/registration',
  effects: ['verifies_secret'],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' }],
});

// REVISTO EM 28/10/2026, de uma entrada (`ip=30/1h`) para duas. O motivo inteiro
// está na `x-rate-limit` desta operação em `api/openapi.yaml`, e em resumo: esta
// porta não tem `requestBody`, não recebe e-mail e `allow_credentials` sai
// sempre vazia, então o risco dela é **esgotamento de recurso** e não
// enumeração — a faixa de `login` (`ip=10/1h`) apertava o lado errado, e com
// 30/h uma rede atrás de NAT estourava e o 429 caía em quem entra por SENHA.
//
// **A ORDEM DAS ENTRADAS IMPORTA.** `rotas-registradas-contra-o-contrato.test.ts`
// compara `x-rate-limit[i]` com `rateLimit[i]` por índice, não por conjunto:
// trocar a ordem aqui sem trocar no contrato reprova, e é de propósito.
export const rotaDeInicioDaEntradaPorPasskey = defineRoute({
  operationId: 'beginPasskeyAuthentication',
  method: 'post',
  path: '/auth/passkey/authentication/options',
  effects: [],
  rateLimit: [
    { dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' },
    { dimension: ['ip'], limit: 1500, window: '24h', onExceed: 'deny_429' },
  ],
});

export const rotaDeConclusaoDaEntradaPorPasskey = defineRoute({
  operationId: 'finishPasskeyAuthentication',
  method: 'post',
  path: '/auth/passkey/authentication',
  effects: ['verifies_secret'],
  rateLimit: [{ dimension: ['ip'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDaListaDePasskeys = defineRoute({
  operationId: 'listPasskeys',
  method: 'get',
  path: '/auth/passkeys',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeRevogacaoDePasskey = defineRoute({
  operationId: 'revokePasskey',
  method: 'delete',
  path: '/auth/passkeys/:passkeyId',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDasRotasDePasskey {
  readonly auth: AuthService;
  readonly passkeys: PasskeyService;
  readonly contrato: Contrato;
}

function contextoDe(request: FastifyRequest): ContextoDaRequisicao {
  return {
    correlationId: request.id,
    ip: request.ip,
    userAgent:
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
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
 * Autenticação MEMOIZADA por requisição, com a MESMA chave de `routes.ts`
 * (`identity:autenticado`).
 *
 * A chave compartilhada não é descuido: as duas famílias de rota autenticam a
 * mesma coisa, do mesmo cabeçalho, e uma chave própria aqui faria uma requisição
 * verificar RS256 e ler `users` duas vezes — dobrar a carga do banco para
 * aplicar um teto que existe para reduzir carga.
 */
function autenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDePasskey,
): Promise<Autenticado> {
  return memoDaRequisicao(request, 'identity:autenticado', () =>
    deps.auth.autenticar(tokenDoCabecalho(request)),
  );
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDePasskey,
): Promise<string | undefined> {
  // Engolir a falha é correto: quem não tem sessão não tem balde de conta, e a
  // recusa dele é 401 do handler, não 429.
  try {
    return (await autenticado(request, deps)).conta.id;
  } catch {
    return undefined;
  }
}

export function registrarRotasDePasskey(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDePasskey,
): void {
  registrarRota(
    app,
    rotaDeInicioDoCadastroDePasskey,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const opcoes = await deps.passkeys.comecarCadastro({
        id: conta.id,
        email: conta.email,
        displayName: conta.displayName,
      });
      return reply.status(200).send(grafiaDasOpcoesDeCadastro(opcoes));
    },
  );

  registrarRota(
    app,
    rotaDeConclusaoDoCadastroDePasskey,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeConclusaoDoCadastroDePasskey.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const corpo = request.body as { credential: unknown; label?: string };
      const gravada = await deps.passkeys.concluirCadastro(
        { id: conta.id, email: conta.email, displayName: conta.displayName },
        corpo,
      );
      return reply.status(201).send({
        id: gravada.id,
        label: gravada.label,
        created_at: new Date(gravada.criadaEm).toISOString(),
        last_used_at: gravada.usadaEm === null ? null : new Date(gravada.usadaEm).toISOString(),
      });
    },
  );

  registrarRota(
    app,
    rotaDeInicioDaEntradaPorPasskey,
    {},
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Não lê corpo nenhum, de propósito: a operação não recebe e-mail, para
      // não responder "esta conta tem passkey?" numa porta sem autenticação.
      const opcoes = await deps.passkeys.comecarEntrada();
      return reply.status(200).send(grafiaDasOpcoesDeEntrada(opcoes));
    },
  );

  registrarRota(
    app,
    rotaDeConclusaoDaEntradaPorPasskey,
    { schema: { body: corpoDe(deps.contrato, rotaDeConclusaoDaEntradaPorPasskey.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { credential: unknown; stay_signed_in?: boolean };
      // Dois passos, e a fronteira entre eles é a fronteira da confiança: o
      // primeiro VERIFICA e devolve de quem é a asserção; o segundo abre a
      // sessão. O `userId` nunca vem do pedido.
      const userId = await deps.passkeys.concluirEntrada(corpo);
      const sessao = await deps.auth.entrarComCredencialDigital(
        userId,
        // A escolha nasce desmarcada. Ausente é falso, nunca verdadeiro.
        corpo.stay_signed_in === true,
        contextoDe(request),
      );
      return reply.status(200).send(sessao);
    },
  );

  registrarRota(
    app,
    rotaDaListaDePasskeys,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const itens = await deps.passkeys.listar(conta.id);
      return reply.status(200).send({
        items: itens.map((p) => ({
          id: p.id,
          label: p.label,
          created_at: new Date(p.criadaEm).toISOString(),
          last_used_at: p.usadaEm === null ? null : new Date(p.usadaEm).toISOString(),
        })),
      });
    },
  );

  registrarRota(
    app,
    rotaDeRevogacaoDePasskey,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const { passkeyId } = request.params as { passkeyId: string };
      await deps.passkeys.revogar(conta.id, passkeyId);
      return reply.status(204).send();
    },
  );
}
