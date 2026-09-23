/**
 * Rotas da transferencia de pet (BICHUS-66).
 *
 * Cinco operacoes, duas superficies: tres exigem conta, duas vivem no `/public`
 * porque o tutor que precisa desfazer pode estar em outro aparelho, deslogado,
 * com o app desinstalado -- e o momento de desfazer a operacao mais destrutiva
 * do produto nao e o momento de pedir login.
 *
 * O `operationId` de cada rota e o mesmo do contrato, e `effects`/`rateLimit`
 * **espelham** `api/openapi.yaml`: rota com efeito e sem teto nao compila
 * (`shared/http/route-definition.ts`).
 *
 * ## O teto do convite, que e o caminho de abuso obvio
 *
 * `startPetTransfer` manda e-mail para um endereco escolhido por quem chama.
 * Sem teto, uma conta manda convite para mil enderecos e o Bichu vira remetente
 * de spam com reputacao propria. O teto de 5 por conta em 24 h vem do contrato,
 * e a dimensao e `account` e nao `ip`: quem abusa tem conta, e o IP de um
 * celular em rede movel e compartilhado com o bairro inteiro.
 *
 * As duas rotas publicas tem teto por `ip` com `log_and_alert` em vez de
 * `deny_429`, e isso tambem vem do contrato: recusar o cancelamento de um pet
 * transferido por engano porque o vizinho estourou o balde seria a protecao
 * trabalhando contra quem ela protege.
 *
 * ## A resposta e montada campo a campo
 *
 * Nunca por espalhamento do objeto do dominio. `TransferenciaGravada` carrega
 * `recipientEmail` **em claro** -- e um `...transferencia` publicaria o endereco
 * de outra pessoa no primeiro dia. A mascara e montada aqui, e a lista explicita
 * faz a decisao de expor ser sempre uma decisao.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import type { Clock } from '../../../../shared/ports/index.js';
import { mascararEmail } from '../../domain/janela-da-transferencia.js';
import type { PetTransferService } from '../../application/pet-transfer-service.js';
import type {
  TransferId,
  TransferenciaGravada,
  TransferenciaPorTokenDeCancelamento,
} from '../../ports/transfer-repository.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';

export const rotaDeInicioDaTransferencia = defineRoute({
  operationId: 'startPetTransfer',
  method: 'post',
  path: '/pets/:petId/transfer',
  // `verifies_secret` porque a operacao consome a janela de reautenticacao, e
  // `notifies` porque ela manda e-mail para um endereco escolhido por quem
  // chama. Os dois espelham `x-effects` do contrato.
  effects: ['notifies', 'verifies_secret'],
  rateLimit: [{ dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' }],
  // A MARCA, E SO A MARCA. Quem valida `X-Reauth-Token` e o mecanismo da
  // historia de reautenticacao, que esta sendo construida agora. Declarar aqui e
  // o que faz o portao conferir esta rota contra `x-reauth-scope` do contrato;
  // escrever uma segunda verificacao seria a segunda definicao da mesma regra.
  reauthScope: 'pet_transfer',
});

export const rotaDeCancelamentoDaTransferencia = defineRoute({
  operationId: 'cancelPetTransfer',
  method: 'post',
  path: '/pets/transfers/:transferId/cancel',
  effects: ['notifies'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
  // Sem `reauthScope`, e a ausencia e a decisao: o que exige senha e
  // transferir, nao desistir.
});

export const rotaDeAceiteDaTransferencia = defineRoute({
  operationId: 'acceptPetTransfer',
  method: 'post',
  path: '/pets/transfers/accept',
  effects: ['verifies_secret', 'notifies'],
  rateLimit: [
    { dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['ip'],
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

export const rotaDaTransferenciaPorToken = defineRoute({
  operationId: 'getTransferByCancelToken',
  method: 'get',
  path: '/public/transfers/:cancelToken',
  effects: [],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 30, window: '1h', onExceed: 'log_and_alert' }],
});

export const rotaDeCancelamentoPorToken = defineRoute({
  operationId: 'cancelTransferByToken',
  method: 'post',
  path: '/public/transfers/:cancelToken/cancel',
  effects: ['irreversible_write', 'notifies'],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 10, window: '1h', onExceed: 'log_and_alert' }],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeTransferencia {
  readonly transferencias: PetTransferService;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
  readonly idempotencia: Idempotencia;
  readonly clock: Clock;
}

/** A visao do tutor. `PetTransfer` do contrato, campo a campo. */
function comoRespostaDaTransferencia(t: TransferenciaGravada): Record<string, unknown> {
  return {
    id: t.id,
    pet_id: t.petId,
    status: t.status,
    // MASCARADO, SEMPRE. O endereco em claro existe na linha porque o aceite
    // precisa compara-lo; ele nunca atravessa a borda.
    recipient_email_masked: mascararEmail(t.recipientEmail),
    expires_at: t.inviteExpiresAt.toISOString(),
    accepted_at: t.acceptedAt === null ? null : t.acceptedAt.toISOString(),
    effective_at: t.effectiveAt === null ? null : t.effectiveAt.toISOString(),
    cancelled_at: t.cancelledAt === null ? null : t.cancelledAt.toISOString(),
  };
}

/**
 * A visao publica. `TransferCancelView`, e o contrato e explicito sobre o que
 * NAO esta aqui: sem `pet_id`, sem `transfer_id` e sem o e-mail do
 * destinatario. Quem tem o link e o tutor atual, que ja sabe para quem
 * transferiu, e imprimir o endereco de outra pessoa numa pagina publica nao
 * acrescenta nada a decisao dele (ADR-0010).
 */
function comoVisaoDeCancelamento(
  t: TransferenciaPorTokenDeCancelamento,
): Record<string, unknown> {
  return {
    pet_display_name: t.petDisplayName,
    // `podeCancelar` ja recusou o que nao tem instante, entao o nulo aqui nao
    // acontece. O `??` e para o compilador, e a data vazia seria visivel na
    // tela se algum dia acontecesse -- melhor que `null` num campo obrigatorio.
    effective_at: (t.effectiveAt ?? t.requestedAt).toISOString(),
    requested_at: t.requestedAt.toISOString(),
  };
}

function donoAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeTransferencia,
): Promise<{ userId: UserId; correlationId: string; ip: string | undefined }> {
  return memoDaRequisicao(request, 'transferencias:dono', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId, correlationId: request.id, ip: request.ip };
  });
}

/** Quem nao apresentou credencial valida nao tem balde de conta: a recusa e 401. */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeTransferencia,
): Promise<string | undefined> {
  try {
    return (await donoAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

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

export function registrarRotasDeTransferencia(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeTransferencia,
): void {
  registrarRota(
    app,
    rotaDeInicioDaTransferencia,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeInicioDaTransferencia.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const { petId } = request.params as { petId: string };
      const corpo = request.body as { recipient_email: string };
      const t = await deps.transferencias.iniciar(
        petId as PetId,
        corpo.recipient_email,
        chamador,
      );
      // 202 e nao 201: o que terminou foi o PEDIDO, e o convite ainda precisa
      // ser aceito. Um 201 prometeria um recurso pronto.
      return reply.status(202).send(comoRespostaDaTransferencia(t));
    },
  );

  registrarRota(
    app,
    rotaDeCancelamentoDaTransferencia,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const { transferId } = request.params as { transferId: string };
      const t = await deps.transferencias.cancelarPeloTutor(transferId as TransferId, chamador);
      return reply.status(200).send(comoRespostaDaTransferencia(t));
    },
  );

  registrarRota(
    app,
    rotaDeAceiteDaTransferencia,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeAceiteDaTransferencia.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const corpo = request.body as { token: string };
      const t = await deps.transferencias.aceitar(corpo.token, chamador);
      return reply.status(200).send(comoRespostaDaTransferencia(t));
    },
  );

  registrarRota(
    app,
    rotaDaTransferenciaPorToken,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { cancelToken } = request.params as { cancelToken: string };
      const t = await deps.transferencias.verPorTokenDeCancelamento(cancelToken);
      return reply.status(200).send(comoVisaoDeCancelamento(t));
    },
  );

  registrarRota(
    app,
    rotaDeCancelamentoPorToken,
    {
      // A marca que o portao de subida confere contra o contrato, que declara
      // `Idempotency-Key` nesta operacao. Ela nao faz a idempotencia acontecer
      // -- quem faz e `executarComIdempotencia`, abaixo --, ela faz a
      // divergencia entre os dois ser impossivel de passar batida.
      config: { idempotencia: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { cancelToken } = request.params as { cancelToken: string };

      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(
            deps.contrato,
            rotaDeCancelamentoPorToken.operationId,
          ),
          chaveDoCabecalho: request.headers['idempotency-key'],
          // NAO HA CONTA AQUI, e e o ponto da rota. O escopo da chave e o
          // RESUMO do token ao portador: a chave de quem tem um token nunca
          // devolve o resultado de outra transferencia, e o token em claro nao
          // vira coluna de `idempotency_keys`.
          donoOuToken: hashDeToken(cancelToken).toString('base64'),
          endpoint: `${rotaDeCancelamentoPorToken.method.toUpperCase()} ${rotaDeCancelamentoPorToken.path}`,
          // A TRANSFERENCIA ENTRA NA CHAVE, pelo RESUMO do token e nao por ele.
          // Hoje `donoOuToken` acima ja e derivado deste mesmo token, entao as
          // duas travas dizem a mesma coisa -- e e exatamente por isso que esta
          // precisa existir: a de cima e coincidencia desta rota (a unica sem
          // conta), e no dia em que o escopo virar a conta de quem cancela, o
          // corpo canonico continua sendo `null` para TODA transferencia.
          parametrosDeCaminho: { cancelToken: hashDeToken(cancelToken).toString('base64') },
          corpo: null,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => {
          await deps.transferencias.cancelarPorToken(cancelToken);
          return { status: 204, body: null };
        },
      );

      return reply.status(resposta.status).send(resposta.body ?? undefined);
    },
  );
}
