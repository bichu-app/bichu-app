/**
 * As duas rotas de `/v1/pets/{petId}/delivery-address`: o endereco de entrega
 * guardado NO PET.
 *
 * ## As duas decisoes dele, com as datas e as palavras -- e a de 21/10 cai
 *
 * **21/10/2026**, escolhendo entre tres opcoes apresentadas:
 *
 *     "Endereco guardado de verdade -- um endereco de entrega salvo na CONTA,
 *      reusado em todo pedido e editavel num lugar so."
 *
 * **27/10/2026**, pedido dele:
 *
 *     "o endereco de entrega da plaquinha tem que estar dentro do cadastro do
 *      pet"
 *
 * e, com a frase de 21/10 posta na mesa, nomeada e datada:
 *
 *     "endereco um por pet"
 *
 * **A de 21/10 CAI e a de 27/10 vale.** Nao foi descuido dele: a decisao
 * anterior estava em maos quando a nova foi tomada. `endereco-guardado-routes.ts`
 * continua neste diretorio e **nao foi apagado** -- a decisao do cliente de
 * **26/10/2026** e *"nao apague nada"*, e foi daquela tabela que a migracao
 * `20261027000001` copiou o endereco para os pets de cada tutor. O que ele
 * perdeu foi o papel: **nenhum pedido de plaquinha le de `/me/delivery-address`.**
 *
 * ## ESTE E O ENDERECO RESIDENCIAL. So o tutor le.
 *
 * As duas rotas exigem `bearerAuth` **sem alternativa vazia**, e a autorizacao
 * nao esta aqui: ela mora na clausula `WHERE` do repositorio, num `JOIN` com
 * `pets` que compara `owner_user_id` com o portador do token. Pet de outra
 * pessoa **nao e 403 -- ele nao existe** (ADR-0021).
 *
 * **Nenhum identificador novo entra em caminho de rota** (ADR-0010 item 6):
 * `petId` e o mesmo de `/v1/pets/{petId}`, `/v1/pets/{petId}/tags` e
 * `/v1/pets/{petId}/tag-requests`. `pet_delivery_addresses` nao tem coluna `id`.
 *
 * **Nenhuma lista.** Nao ha operacao que devolva os enderecos de varios pets,
 * aqui nem em lugar nenhum do contrato, e nao ha superficie sem conta que o
 * projete -- `Pet` sai em `listMyPets` e o endereco **nao esta em `Pet`**,
 * exatamente por isso. As afirmacoes sao cobradas por
 * `src/tools/endereco-do-pet-nao-sai-em-publico.test.ts`, com isca.
 *
 * **Nao entra na trilha de auditoria** (`effects: []`, sem `x-audit`): a MESMA
 * regra que a `20261017000012` fixou para o endereco do pedido e a
 * `20261020000016` para o da conta. Guardar o proprio endereco nao e leitura de
 * pessoa (D55/D56) -- quem le e o tutor, sobre o pet dele.
 *
 * ## OS DOIS VAZIOS, e por que eles nao podem virar um
 *
 *     pet nao e seu / nao existe / excluido   ->  404  (nunca 403, ADR-0021)
 *     pet e seu e ainda nao tem endereco      ->  200 com corpo `null`
 *
 * O `null` e a mesma forma de `getMyDeliveryAddress` e de `getMyLocation`, e
 * pelo mesmo motivo: "este pet nunca teve endereco" e um estado normal do
 * cadastro e nao recurso ausente -- e e o estado de TODO pet cadastrado depois
 * da `20261027000001`. Nele o formulario da plaquinha abre vazio, como se
 * endereco guardado nao existisse.
 *
 * Juntar os dois num `null` so faria o aplicativo mostrar "sem endereco" para um
 * pet que nao e do chamador, e o 404 que a tela precisa desenhar sumiria.
 *
 * ## `PUT` e nao `PATCH`
 *
 * O endereco inteiro vem junto: trocar de casa troca os nove campos de uma vez,
 * e uma escrita parcial deixaria o pet numa mistura de duas casas -- rua nova com
 * bairro antigo chega no lugar errado sem nada ter dado erro.
 *
 * **Guardar no pet A nao toca o pet B, e nao toca o endereco da CONTA.** E o "um
 * por pet" que ele pediu.
 *
 * ## Nao ha `DELETE`, e a ausencia e deliberada
 *
 * Nao porque faltou tempo: **nao ha apagamento por prazo nem por botao nesta
 * frente.** A decisao do cliente de 17/10/2026 e *"voce so deve apagar as
 * informacoes, caso o usuario remova o pet ou delete a conta"*, e com o endereco
 * no pet os dois casos dessa frase sao o mesmo `ON DELETE CASCADE`. Oferecer um
 * `DELETE` seria abrir uma porta que a decisao nao abriu; quem quiser trocar o
 * endereco usa o `PUT`.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { EnderecoDoPetRepository } from '../../ports/endereco-do-pet.js';
import {
  comoDeliveryAddress,
  comoEnderecoDeEntrega,
  type DeliveryAddressDoContrato,
} from './endereco-de-entrega-no-contrato.js';

export const rotaDoEnderecoDeEntregaDoPet = defineRoute({
  operationId: 'getPetDeliveryAddress',
  method: 'get',
  path: '/pets/:petId/delivery-address',
  // Sem efeito declarado e sem `x-audit`: e leitura do PROPRIO tutor sobre o pet
  // dele, e nao leitura de pessoa (D55/D56). O endereco nao entra na trilha.
  effects: [],
});

export const rotaDeGuardarOEnderecoDoPet = defineRoute({
  operationId: 'putPetDeliveryAddress',
  method: 'put',
  path: '/pets/:petId/delivery-address',
  effects: [],
  // O teto e de conveniencia e nao de abuso, e e o MESMO de
  // `putMyDeliveryAddress`: guardar o proprio endereco nao vira trabalho de
  // ninguem, ao contrario do PEDIDO da plaquinha (3 por dia, porque cada um vira
  // trabalho fisico de alguem). 30 por hora e o balde que impede laco de cliente
  // defeituoso sem atrapalhar quem corrige a rua tres vezes seguidas.
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDoEnderecoDoPet {
  readonly enderecos: EnderecoDoPetRepository;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
}

/** O corpo, como o schema do contrato (`DeliveryAddress`) ja o validou. */
type CorpoDoEnderecoDoPet = DeliveryAddressDoContrato;

/**
 * MEMOIZADA por requisicao, pelo mesmo motivo de `endereco-guardado-routes.ts`:
 * o teto por `account` precisa do dono antes do handler, e o handler precisa do
 * mesmo dono. Sem a memoria, cada `PUT` verificaria a assinatura do token e
 * leria `users` duas vezes.
 */
function contaDoChamador(
  request: FastifyRequest,
  deps: DependenciasDoEnderecoDoPet,
): Promise<UserId> {
  return memoDaRequisicao(request, 'endereco-do-pet:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const autenticado = await deps.autenticador.autenticar(token);
    return autenticado.userId;
  });
}

/**
 * `account` para o teto. Quem nao apresentou credencial valida nao tem balde de
 * conta -- a recusa dele e o 401 do handler, e nao um 429 que confundiria "sem
 * sessao" com "chamou demais".
 */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDoEnderecoDoPet,
): Promise<string | undefined> {
  try {
    return await contaDoChamador(request, deps);
  } catch {
    return undefined;
  }
}

function petIdDoCaminho(request: FastifyRequest): PetId {
  const { petId } = request.params as { petId: string };
  return petId as PetId;
}

export function registrarRotasDoEnderecoDoPet(
  app: RegistradorDeRotas,
  deps: DependenciasDoEnderecoDoPet,
): void {
  registrarRota(
    app,
    rotaDoEnderecoDeEntregaDoPet,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const endereco = await deps.enderecos.doPetDoChamador(petIdDoCaminho(request), conta);
      // `undefined` e o PET, `null` e o ENDERECO. Ver o cabecalho: juntar os
      // dois faria a tela dizer "sem endereco" para pet de terceiro.
      if (endereco === undefined) throw problemas.naoEncontrado();
      return reply.status(200).send(endereco === null ? null : comoDeliveryAddress(endereco));
    },
  );

  const corpo = corpoDe(deps.contrato, rotaDeGuardarOEnderecoDoPet.operationId);
  registrarRota(
    app,
    rotaDeGuardarOEnderecoDoPet,
    {
      // O schema do contrato, e e ele quem nomeia o campo que falta no 400 -- e
      // dai que o formulario tira o "falta o CEP" em vez de um "nao foi
      // possivel" generico.
      schema: { body: corpo },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      // O corpo e FECHADO no contrato (`DeliveryAddress` declara
      // `additionalProperties: false`), e sem este guarda o Ajv do Fastify APAGA
      // o campo desconhecido em silencio -- medido em 18/10 na rota do pedido,
      // onde um `cpf` dentro de `delivery_address` respondia 200. Responder
      // sucesso a dado pessoal que ninguem gravou e o pior desfecho possivel de
      // uma rota que guarda endereco residencial.
      preValidation: [recusarCampoDesconhecido(corpo, rotaDeGuardarOEnderecoDoPet.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const guardado = await deps.enderecos.guardarNoPet(
        petIdDoCaminho(request),
        conta,
        comoEnderecoDeEntrega(request.body as CorpoDoEnderecoDoPet),
      );
      // Pet que nao e do chamador: 404, e nunca 403. A escrita nao tem caminho
      // de permissao proprio -- a tripla do `WHERE` e a mesma da leitura.
      if (guardado === undefined) throw problemas.naoEncontrado();
      return reply.status(200).send(comoDeliveryAddress(guardado));
    },
  );
}
