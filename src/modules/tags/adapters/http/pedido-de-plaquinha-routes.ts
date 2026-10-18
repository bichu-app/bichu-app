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
import type { Contrato } from '../../../../shared/http/contract.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { EnderecoDeEntrega, PedidoDoTutor } from '../../ports/pedido-de-plaquinha.js';
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

/** O corpo, como o schema do contrato ja o validou. */
interface CorpoDoPedido {
  readonly delivery_address: {
    readonly recipient_name: string;
    readonly recipient_phone: string;
    readonly postal_code: string;
    readonly street: string;
    readonly street_number: string;
    readonly complement?: string;
    readonly neighborhood: string;
    readonly city: string;
    readonly state: string;
  };
  readonly notes?: string;
}

/**
 * O endereco do corpo para o do dominio.
 *
 * A UNICA transformacao e o CEP, e ela e de formato e nao de conteudo: o
 * contrato ja exige oito digitos, e `replace` aqui existe para o dia em que
 * um cliente mande `01311-000` -- guardar o mesmo endereco com e sem hifen
 * daria duas linhas diferentes para o mesmo lugar. **Nada mais e tocado**: o
 * CEP nao completa bairro, a UF nao deduz cidade e nada e geocodificado
 * (ADR-0006).
 */
function comoEnderecoDeEntrega(corpo: CorpoDoPedido): EnderecoDeEntrega {
  const endereco = corpo.delivery_address;
  return {
    destinatario: endereco.recipient_name.trim(),
    // Ja em E.164 quando chega: o schema do contrato cobra
    // `^\+55\d{10,11}$`, e o app converte antes de enviar.
    telefone: endereco.recipient_phone.trim(),
    cep: endereco.postal_code.replace(/\D/gu, ''),
    logradouro: endereco.street.trim(),
    numero: endereco.street_number.trim(),
    complemento:
      endereco.complement === undefined || endereco.complement.trim() === ''
        ? null
        : endereco.complement.trim(),
    bairro: endereco.neighborhood.trim(),
    cidade: endereco.city.trim(),
    uf: endereco.state.trim().toUpperCase(),
  };
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
    // Sempre nulo hoje: nao ha coluna nem escrita. Sai EXPLICITAMENTE nulo e
    // nao omitido, porque omitir faria o app distinguir "sem rastreio" de
    // "campo que sumiu" -- a mesma decisao de `complement` na fila do painel.
    tracking_code: pedido.codigoDeRastreio,
    notes: pedido.observacao,
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
        comoEnderecoDeEntrega(corpo),
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
