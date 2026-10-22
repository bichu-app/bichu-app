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
 * ## O endereco de entrega, e por que o corpo agora e obrigatorio
 *
 * O cliente decidiu em 17/10 que o endereco entra. Com isso o `requestBody`
 * deixou de ser `required: false` -- sem corpo nao ha endereco --, e o gancho
 * `corpoAusenteEhCorpoVazio` saiu daqui: ele existia para o POST de um toque,
 * que nao e mais um caminho valido.
 *
 * **Quem recusa campo faltando e o schema do contrato**, aplicado pelo Ajv do
 * Fastify. Isso nao e detalhe de implementacao: o 400 que ele produz nomeia o
 * campo em `errors[].field`, e e dai que o formulario tira o "falta o CEP" em
 * vez de um "nao foi possivel" generico. Validacao escrita a mao aqui
 * responderia a mesma coisa de um jeito que diverge do contrato.
 *
 * **O endereco nao volta na resposta** e **nao entra em log nenhum**. A unica
 * coisa que este arquivo faz com ele e normalizar o CEP e passar adiante.
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
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { PedidoDoTutor } from '../../ports/pedido-de-plaquinha.js';
import {
  comoEnderecoDeEntrega,
  type DeliveryAddressDoContrato,
} from './endereco-de-entrega-no-contrato.js';
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

/**
 * `GET /v1/pets/{petId}/tag-requests`: a leitura da pagina de acompanhamento.
 *
 * **Sem teto proprio.** E leitura da PROPRIA conta, barata (duas consultas
 * por indice, lista curta por construcao) e sem dado de terceiro -- o teto de
 * `requestCollarTag` existe porque cada pedido vira trabalho fisico de
 * alguem, e ler o proprio pedido nao vira trabalho de ninguem. O balde da
 * borda continua valendo.
 *
 * **Sem `x-audit`**: nao e leitura de pessoa (D55/D56). Quem le e o dono do
 * pet, sobre o proprio pet.
 */
export const rotaDeLerPedidosDePlaquinhaDoPet = defineRoute({
  operationId: 'listCollarTagRequests',
  method: 'get',
  path: '/pets/:petId/tag-requests',
  effects: [],
});

export interface DependenciasDoPedidoDePlaquinha {
  readonly pedidos: PedidoDePlaquinhaService;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
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

/** O corpo, como o schema do contrato ja o validou. */
interface CorpoDoPedido {
  readonly delivery_address: DeliveryAddressDoContrato;
  readonly notes?: string;
}

/**
 * `CollarTagRequest` como o contrato o declara.
 *
 * **`ref` SAI, e nenhum UUID sai** (ADR-0010 item 6). Ele entrou em 18/10 com
 * a pagina de acompanhamento: e o numero que a pessoa tem para falar sobre o
 * pedido dela, e e o MESMO `ref` da fila do painel -- nao ha identificador
 * novo. O pet continua sendo o do caminho da requisicao.
 */
function comoCollarTagRequest(pedido: PedidoDoTutor): Record<string, unknown> {
  // **Sem endereco.** Ele e dado pessoal, quem o enviou acabou de digita-lo, e
  // devolve-lo seria uma copia a mais numa resposta que nao precisa dela.
  return {
    ref: pedido.ref,
    status: pedido.status,
    requested_at: pedido.solicitadoEm.toISOString(),
    decided_at: pedido.decididoEm === null ? null : pedido.decididoEm.toISOString(),
    notes: pedido.observacao,
    // A ENTREGA, que e o que a pagina privada do aplicativo desenha. Sai aqui
    // porque esta e uma leitura DO DONO -- quem chama acabou de se autenticar e
    // o `WHERE` do repositorio ja exigiu `pets.owner_user_id = <chamador>`.
    //
    // **Nenhum destes quatro sai em superficie sem conta.** A resolucao publica
    // da tag (`resolveTag`) nao os projeta, e nao passa por aqui.
    //
    // COSTURA DA MESCLA 18/10: `tracking_code` estava declarado DUAS vezes
    // neste literal -- a frente do aplicativo o escrevia com o comentario
    // "sempre nulo hoje: nao ha coluna nem escrita", e a do painel o escrevia
    // de novo quatro linhas abaixo depois de criar a coluna. Chave repetida em
    // literal e o ultimo valor que vence, entao o comportamento ja era o do
    // painel; o que sobrava era um `no-dupe-keys` e um comentario que mentia.
    // Ficou UMA, a do painel.
    delivery_state: pedido.passoDaEntrega,
    tracking_code: pedido.codigoDeRastreio,
    shipped_at: pedido.despachadoEm === null ? null : pedido.despachadoEm.toISOString(),
    delivered_at: pedido.entregueEm === null ? null : pedido.entregueEm.toISOString(),
  };
}

export function registrarRotaDePedidoDePlaquinha(
  app: RegistradorDeRotas,
  deps: DependenciasDoPedidoDePlaquinha,
): void {
  const corpo = corpoDe(deps.contrato, rotaDePedidoDePlaquinha.operationId);
  registrarRota(
    app,
    rotaDePedidoDePlaquinha,
    {
      // O schema do contrato, e e ele quem nomeia o campo que falta no 400.
      schema: { body: corpo },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      // O corpo e FECHADO no contrato (`CollarTagRequestInput` e
      // `DeliveryAddress` declaram os dois `additionalProperties: false`), e sem
      // este guarda o Ajv do Fastify APAGAVA o campo desconhecido em silencio:
      // medido em 18/10, `delivery_address` com um `cpf` dentro respondia 200.
      // Responder sucesso a dado pessoal que ninguem gravou e o pior desfecho
      // possivel desta rota. `registrarRota` instala o guarda sozinho so na
      // superficie administrativa, entao aqui ele entra a mao -- mesma forma de
      // `directory-suggestion-routes.ts`.
      preValidation: [recusarCampoDesconhecido(corpo, rotaDePedidoDePlaquinha.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const corpo = request.body as CorpoDoPedido;
      const pedido = await deps.pedidos.pedir(
        petIdDoCaminho(request),
        conta,
        comoEnderecoDeEntrega(corpo.delivery_address),
        corpo.notes ?? null,
      );
      return reply.status(200).send(comoCollarTagRequest(pedido));
    },
  );

  registrarRota(
    app,
    rotaDeLerPedidosDePlaquinhaDoPet,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const pedidos = await deps.pedidos.listarDoPet(petIdDoCaminho(request), conta);
      return reply.send({ items: pedidos.map(comoCollarTagRequest) });
    },
  );
}
