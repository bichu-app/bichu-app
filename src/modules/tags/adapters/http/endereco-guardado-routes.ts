/**
 * As duas rotas de `/v1/me/delivery-address`: o endereco de entrega guardado na
 * conta.
 *
 * ## A autorizacao, com a data e as palavras dele
 *
 * **O cliente decidiu em 21/10/2026**, escolhendo esta opcao entre tres:
 *
 *     "Endereco guardado de verdade -- um endereco de entrega salvo na conta,
 *      reusado em todo pedido e editavel num lugar so."
 *
 * O motivo e que a pessoa nao redigite nove campos a cada pedido de plaquinha.
 *
 * ## ESTE E O ENDERECO RESIDENCIAL. SO O DONO LE.
 *
 * As duas rotas exigem `bearerAuth` **sem alternativa vazia**, e o unico
 * `user_id` que alcanca o `WHERE` e o do portador do token: nao existe caminho
 * de codigo neste arquivo que receba identificador de terceiro. E por isso que
 * endereco de outra conta nao e 403 -- **ele nao existe** (ADR-0021).
 *
 * **O caminho e singular e nao carrega identificador** (ADR-0010 item 6):
 * `user_delivery_addresses` tem `user_id` como chave primaria e nao tem coluna
 * `id`, entao nao ha identificador interno para por em rota.
 *
 * **Nenhuma lista.** Nao ha operacao de listagem deste endereco, aqui nem em
 * lugar nenhum do contrato, e nao ha superficie sem conta que o projete. As
 * duas afirmacoes sao cobradas por
 * `src/tools/endereco-guardado-nao-sai-em-publico.test.ts`, com isca.
 *
 * **Nao entra na trilha de auditoria** (`effects: []`, sem `x-audit`): a MESMA
 * regra que a `20261017000012` fixou para o endereco do pedido. Guardar o
 * proprio endereco nao e leitura de pessoa (D55/D56) -- quem le e o dono, sobre
 * si.
 *
 * **Nao confundir com `/me/location` nem com `Me.reference_area`:**
 *
 *     `/me/location`        coordenada do APARELHO, quantizada, para raio
 *     `Me.reference_area`   CEP/bairro/cidade/UF, alimenta DISTANCIA e o aviso
 *                           de cadastro incompleto -- e nao tem logradouro
 *     isto aqui             a RESIDENCIA. So o dono le. Nunca distancia.
 *
 * Por residencia em `reference_area` vazaria residencia para calculo de
 * distancia, e e por isso que a tabela e nova em vez de aquela ter sido
 * alargada.
 *
 * ## `GET` devolve `null`, e nao 404
 *
 * A mesma forma de `getMyLocation`, e pelo mesmo motivo: "nunca guardei" e um
 * estado normal da conta e nao recurso ausente -- e e o estado de TODA conta no
 * dia em que esta rota entrar no ar. Com `null`, o formulario da plaquinha se
 * comporta exatamente como antes dela existir.
 *
 * ## `PUT` e nao `PATCH`, e este e o UNICO lugar que escreve
 *
 * O endereco inteiro vem junto: trocar de casa troca os nove campos de uma vez,
 * e uma escrita parcial deixaria a conta numa mistura de duas casas -- rua nova
 * com bairro antigo chega no lugar errado sem nada ter dado erro.
 *
 * **`requestCollarTag` NAO escreve aqui.** Editar o endereco dentro do pedido
 * muda aquele pedido e nao mexe no que esta guardado. Mudar o guardado em
 * silencio, a partir de um formulario de pedido, e a classe de defeito que so
 * aparece meses depois -- quando a plaquinha chega no endereco de antes.
 *
 * ## Nao ha `DELETE`, e a ausencia e deliberada
 *
 * Nao porque faltou tempo: **nao ha apagamento por prazo nem por botao nesta
 * frente.** A decisao do cliente de 17/10/2026 e *"voce so deve apagar as
 * informacoes, caso o usuario remova o pet ou delete a conta"*, e quem apaga e
 * o `ON DELETE CASCADE` de `user_id`. Oferecer um `DELETE` seria abrir uma
 * porta que a decisao nao abriu; quem quiser trocar o endereco usa o `PUT`.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { EnderecoGuardadoRepository } from '../../ports/endereco-guardado.js';
import {
  comoDeliveryAddress,
  comoEnderecoDeEntrega,
  type DeliveryAddressDoContrato,
} from './endereco-de-entrega-no-contrato.js';

export const rotaDoMeuEnderecoDeEntrega = defineRoute({
  operationId: 'getMyDeliveryAddress',
  method: 'get',
  path: '/me/delivery-address',
  // Sem efeito declarado e sem `x-audit`: e leitura do PROPRIO dono sobre si,
  // e nao leitura de pessoa (D55/D56). O endereco nao entra na trilha.
  effects: [],
});

export const rotaDeGuardarMeuEnderecoDeEntrega = defineRoute({
  operationId: 'putMyDeliveryAddress',
  method: 'put',
  path: '/me/delivery-address',
  effects: [],
  // O teto e de conveniencia e nao de abuso: guardar o proprio endereco nao
  // vira trabalho de ninguem (ao contrario do PEDIDO da plaquinha, que e 3 por
  // dia porque cada um vira trabalho fisico de alguem). 30 por hora e o balde
  // que impede laco de cliente defeituoso sem atrapalhar quem corrige a rua
  // tres vezes seguidas.
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDoEnderecoGuardado {
  readonly enderecos: EnderecoGuardadoRepository;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
}

/** O corpo, como o schema do contrato (`DeliveryAddress`) ja o validou. */
type CorpoDoEnderecoGuardado = DeliveryAddressDoContrato;

/**
 * MEMOIZADA por requisicao, pelo mesmo motivo das rotas de localizacao: o teto
 * por `account` precisa do dono antes do handler, e o handler precisa do mesmo
 * dono. Sem a memoria, cada `PUT` verificaria a assinatura do token e leria
 * `users` duas vezes.
 */
function contaDoChamador(
  request: FastifyRequest,
  deps: DependenciasDoEnderecoGuardado,
): Promise<UserId> {
  return memoDaRequisicao(request, 'endereco-guardado:chamador', async () => {
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
  deps: DependenciasDoEnderecoGuardado,
): Promise<string | undefined> {
  try {
    return await contaDoChamador(request, deps);
  } catch {
    return undefined;
  }
}

export function registrarRotasDoEnderecoGuardado(
  app: RegistradorDeRotas,
  deps: DependenciasDoEnderecoGuardado,
): void {
  registrarRota(
    app,
    rotaDoMeuEnderecoDeEntrega,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const endereco = await deps.enderecos.doChamador(conta);
      // `null` e nao 404: ver o cabecalho do arquivo.
      return reply.status(200).send(endereco === null ? null : comoDeliveryAddress(endereco));
    },
  );

  const corpo = corpoDe(deps.contrato, rotaDeGuardarMeuEnderecoDeEntrega.operationId);
  registrarRota(
    app,
    rotaDeGuardarMeuEnderecoDeEntrega,
    {
      // O schema do contrato, e e ele quem nomeia o campo que falta no 400 --
      // e dai que o formulario tira o "falta o CEP" em vez de um "nao foi
      // possivel" generico.
      schema: { body: corpo },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      // O corpo e FECHADO no contrato (`DeliveryAddress` declara
      // `additionalProperties: false`), e sem este guarda o Ajv do Fastify
      // APAGA o campo desconhecido em silencio -- medido em 18/10 na rota do
      // pedido, onde um `cpf` dentro de `delivery_address` respondia 200.
      // Responder sucesso a dado pessoal que ninguem gravou e o pior desfecho
      // possivel de uma rota que guarda endereco residencial.
      preValidation: [
        recusarCampoDesconhecido(corpo, rotaDeGuardarMeuEnderecoDeEntrega.operationId),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const guardado = await deps.enderecos.guardar(
        conta,
        comoEnderecoDeEntrega(request.body as CorpoDoEnderecoGuardado),
      );
      return reply.status(200).send(comoDeliveryAddress(guardado));
    },
  );
}
