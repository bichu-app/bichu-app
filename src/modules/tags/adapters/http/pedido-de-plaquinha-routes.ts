/**
 * `POST /v1/pets/{petId}/tag-requests`: o tutor pede a plaquinha da coleira.
 *
 * O destino que o botao `Fazer a tag da coleira` nunca teve. Ate aqui ele era
 * `aoTocar: null` em `app/lib/telas/pet/tela_pet_cadastrado.dart`, e nao por
 * defeito: a rota nao existia, e o criterio da BICHUS-62 proibe acao sem
 * destino.
 *
 * **Solicitar nao e emitir.** Emitir e `issuePetTag`, que cria o codigo
 * irreversivel (ADR-0004); esta rota pede o plastico, e nao toca em `pet_tags`.
 *
 * O teto e de **3 por conta por dia**. Cada pedido vira trabalho fisico de
 * alguem, e um teto alto aqui transformaria a fila do painel em porta de
 * abuso; 3 e o numero que o projeto ja usa para acao de peso. Ele e aplicado
 * pelo registro da rota, pelo mecanismo de `aplicacao-de-teto.ts`, e nao por
 * contador escrito aqui.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { corpoAusenteEhCorpoVazio } from '../../../../shared/http/corpo-opcional.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { PedidoDoTutor } from '../../ports/pedido-de-plaquinha.js';
import type { PedidoDePlaquinhaService } from '../../application/pedido-de-plaquinha-service.js';

export const rotaDePedidoDePlaquinha = defineRoute({
  operationId: 'requestCollarTag',
  method: 'post',
  path: '/pets/:petId/tag-requests',
  // Sem efeito declarado: o pedido nao revela credencial, nao notifica e nao
  // cria o que nao se desfaz -- quem decide a fila pode recusar, e um pedido
  // recusado nao deixa plaquinha no mundo.
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 3, window: '24h', onExceed: 'deny_429' }],
});

export interface DependenciasDoPedidoDePlaquinha {
  readonly pedidos: PedidoDePlaquinhaService;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
}

/**
 * Schema de corpo tirado da propria especificacao, como nas outras rotas deste
 * modulo. Validacao escrita a mao em paralelo a spec e a segunda definicao que
 * diverge.
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

async function contaDoChamador(
  request: FastifyRequest,
  deps: DependenciasDoPedidoDePlaquinha,
): Promise<UserId> {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
    throw problemas.naoAutenticado();
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.naoAutenticado();
  const autenticado = await deps.autenticador.autenticar(token);
  return autenticado.userId;
}

function petIdDoCaminho(request: FastifyRequest): PetId {
  const { petId } = request.params as { petId: string };
  return petId as PetId;
}

/** `account` para o teto. Sem credencial valida nao ha balde de conta. */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDoPedidoDePlaquinha,
): Promise<string | undefined> {
  try {
    return await contaDoChamador(request, deps);
  } catch {
    return undefined;
  }
}

/**
 * `CollarTagRequest` como o contrato o declara. **Sem `ref` e sem UUID**: o
 * identificador opaco serve ao caminho do painel, e o pet e o do caminho da
 * requisicao (ADR-0010 item 6).
 */
function comoCollarTagRequest(pedido: PedidoDoTutor): Record<string, unknown> {
  return {
    status: pedido.status,
    requested_at: pedido.solicitadoEm.toISOString(),
    notes: pedido.observacao,
  };
}

export function registrarRotaDePedidoDePlaquinha(
  app: RegistradorDeRotas,
  deps: DependenciasDoPedidoDePlaquinha,
): void {
  registrarRota(
    app,
    rotaDePedidoDePlaquinha,
    {
      schema: { body: corpoDe(deps.contrato, rotaDePedidoDePlaquinha.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      // Pedir a plaquinha sem escrever nada e o caminho comum, e o contrato
      // declara o corpo `required: false`. Sem este gancho a linha de cima
      // faria o pedido de um toque responder 400 `body must be object`.
      preValidation: [
        corpoAusenteEhCorpoVazio(deps.contrato, rotaDePedidoDePlaquinha.operationId),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const corpo = (request.body ?? {}) as { notes?: string };
      const pedido = await deps.pedidos.pedir(
        petIdDoCaminho(request),
        conta,
        corpo.notes ?? null,
      );
      return reply.status(200).send(comoCollarTagRequest(pedido));
    },
  );
}
