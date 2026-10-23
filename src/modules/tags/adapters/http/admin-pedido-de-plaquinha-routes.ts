/**
 * `/v1/admin/tag-requests`: a fila dos pedidos da plaquinha da coleira.
 *
 * ## O LADO DO BACKEND ESTA AQUI; A TELA DO PAINEL NAO
 *
 * A sessao Backoffice e dona do painel. Estas tres operacoes sao exatamente o
 * que ela precisa chamar, e nada neste arquivo desenha nada.
 *
 * ## O que NAO esta aqui, porque a guarda do escopo ja fez
 *
 * Estas rotas so sobem dentro de `escoparRotasAdministrativas`, e a guarda roda
 * antes de qualquer gancho delas: `X-Internal-Surface` (404), recusa de
 * `Authorization` (401), sessao em cookie (401), `Origin` e `X-CSRF-Token` em
 * metodo nao seguro (403) e o papel de `adminRoles` (403). **Nenhuma
 * verificacao de papel mora aqui nem no caso de uso** (ADR-0027 item 7).
 *
 * ## O ENDERECO SAI AQUI, e so aqui
 *
 * Desde a decisao do cliente de 17/10, a fila devolve o endereco de entrega:
 * e o que o administrador le para enviar a plaquinha. E o unico dado pessoal
 * destas respostas, e por isso:
 *
 * - **so nesta superficie**. Nenhuma resposta sem conta o projeta, e o app nao
 *   o recebe de volta (`CollarTagRequest` nao tem endereco);
 * - **nunca na trilha**. `x-audit` das duas escritas registra `status` e
 *   `ref`, e o caso de uso nao copia campo nenhum de endereco para
 *   `audit.events`;
 * - **nunca geocodificado** (ADR-0006). O que sai e o que o tutor digitou.
 *
 * **Nenhum PERFIL do solicitante sai destas respostas**: nem e-mail, nem
 * telefone, nem UUID, nem identificador estavel. O nome que aparece e
 * `delivery_address.recipient_name`, quem recebe a encomenda, e nao uma
 * leitura de conta -- a unica leitura de conta do backoffice v1 segue sendo a
 * fila de pedidos de encontro (D53 a D57), e e por isso que o `GET` daqui
 * continua sem `x-audit` e sem teto por `rows_returned` (D55/D56).
 *
 * A fila tambem **nao traz o codigo da plaquinha**, que e credencial ao
 * portador (ADR-0004).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type {
  DecisaoDoPedidoDePlaquinha,
  PaginaDaFilaDePlaquinhas,
  PassoAlcancavelDoPedido,
  PassoDaEntrega,
  PedidoNaFilaDePlaquinhas,
} from '../../ports/pedido-de-plaquinha.js';
import { comoDeliveryAddress } from './endereco-de-entrega-no-contrato.js';
import type { FilaDePlaquinhasAdministrativa } from '../../application/pedido-de-plaquinha-service.js';

/** D52: 120 escritas em 10 minutos por conta, somadas todas as escritas do painel. */
const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarPedidosDePlaquinha = defineRoute({
  operationId: 'listAdminCollarTagRequests',
  method: 'get',
  path: '/admin/tag-requests',
  effects: [],
  adminRoles: ADMIN,
  // Contagem de REQUISICOES, aplicada pela borda. Nao e `rows_returned`: o
  // teto por linhas e da leitura de pessoa, e esta fila nao le pessoa.
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeAtenderPedidoDePlaquinha = defineRoute({
  operationId: 'fulfillAdminCollarTagRequest',
  method: 'post',
  path: '/admin/tag-requests/:requestRef/fulfillment',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.collar_tag_request.fulfilled', resourceKind: 'collar_tag_request' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeRecusarPedidoDePlaquinha = defineRoute({
  operationId: 'declineAdminCollarTagRequest',
  method: 'post',
  path: '/admin/tag-requests/:requestRef/decline',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.collar_tag_request.declined', resourceKind: 'collar_tag_request' },
  rateLimit: [BALDE_DE_ESCRITA],
});

/**
 * A leitura de UM pedido, para a tela de entrega.
 *
 * Sem `x-audit` e sem teto por `rows_returned`, como a listagem irma e pelo
 * mesmo motivo: esta superficie nao le PESSOA -- o nome que sai e o de quem
 * recebe a encomenda, dentro do endereco. A unica leitura de conta do
 * backoffice v1 segue sendo a fila de pedidos de encontro (D53 a D57).
 */
export const rotaDeLerPedidoDePlaquinha = defineRoute({
  operationId: 'getAdminCollarTagRequest',
  method: 'get',
  path: '/admin/tag-requests/:requestRef',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/**
 * A ATUALIZACAO DA ENTREGA: passo e codigo de rastreio numa escrita so.
 *
 * `POST` em sub-recurso de acao, e nao `PATCH`: as outras duas escritas desta
 * fila sao `/fulfillment` e `/decline`, e esta e a terceira irma delas. Um
 * `PATCH` aqui faria o painel falar dois dialetos com a mesma fila.
 */
export const rotaDeAtualizarEntregaDaPlaquinha = defineRoute({
  operationId: 'updateAdminCollarTagRequestDelivery',
  method: 'post',
  path: '/admin/tag-requests/:requestRef/delivery',
  effects: [],
  adminRoles: ADMIN,
  audit: {
    action: 'admin.collar_tag_request.delivery_updated',
    resourceKind: 'collar_tag_request',
  },
  rateLimit: [BALDE_DE_ESCRITA],
});

export interface DependenciasDaFilaDePlaquinhas {
  readonly fila: FilaDePlaquinhasAdministrativa;
  /**
   * De onde sai o schema do corpo da atualizacao de entrega. Validacao escrita
   * a mao em paralelo a spec e a segunda definicao, e e ela que diverge.
   */
  readonly contrato: Contrato;
}

/** O schema do corpo, tirado do proprio contrato pelo `operationId`. */

const PAGINA_INICIAL = 1;
/** 50, e nao 100: o mesmo tamanho da outra fila do painel. */
const TAMANHO_PADRAO = 50;

const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  // `admin:`, e nao `account:`: um balde do painel e um do app nunca dividem
  // chave (ADR-0027 item 20.2).
  return conta === undefined ? undefined : `admin:${conta}`;
};

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

interface QueryDaFila {
  readonly status?: DecisaoDoPedidoDePlaquinha;
  /** O passo da entrega. COMBINA com `status`: os dois sao eixos diferentes. */
  readonly delivery_state?: PassoDaEntrega;
  readonly page?: number;
  readonly limit?: number;
}

/** O corpo de `updateAdminCollarTagRequestDelivery`, como o schema o validou. */
interface CorpoDaEntrega {
  readonly delivery_state: PassoAlcancavelDoPedido;
  /**
   * Ausente, texto ou `null`, e os tres sao pedidos diferentes -- manter, definir
   * e apagar. `undefined` e ausente e NAO e o mesmo que `null`, e e por isso que
   * este campo nao ganha valor padrao em lugar nenhum do caminho.
   */
  readonly tracking_code?: string | null;
}

/**
 * `AdminCollarTagRequest` como o contrato o declara.
 *
 * `id` NAO entra: ele e o UUID interno, serve a trilha e nada mais. O que o
 * painel usa no caminho e `ref`.
 */
function comoAdminCollarTagRequest(pedido: PedidoNaFilaDePlaquinhas): Record<string, unknown> {
  return {
    ref: pedido.ref,
    pet: { display_name: pedido.petNome, species: pedido.petEspecie },
    // `DeliveryAddress` como o contrato o declara, pela MESMA traducao que a
    // rota do tutor e a do endereco guardado usam
    // (`endereco-de-entrega-no-contrato.ts`). Eram nove linhas copiadas aqui;
    // com o endereco guardado da conta (cliente, 21/10/2026) elas seriam a
    // terceira copia, e nove campos copiados a mao em tres lugares divergem
    // pelo campo que alguem esquece num dos lados. `complement` continua
    // saindo explicitamente nulo e nao omitido, e a razao esta na funcao.
    delivery_address: comoDeliveryAddress(pedido.endereco),
    notes: pedido.observacao,
    status: pedido.status,
    requested_at: pedido.solicitadoEm.toISOString(),
    decided_at: pedido.decididoEm === null ? null : pedido.decididoEm.toISOString(),
    // A ENTREGA. `delivery_state` nunca e nulo (a coluna e `NOT NULL`); os dois
    // carimbos saem explicitamente nulos, e nao omitidos, pela mesma razao de
    // `complement`: omitir faria o painel distinguir "nao aconteceu" de "campo
    // que sumiu".
    delivery_state: pedido.passoDaEntrega,
    tracking_code: pedido.codigoDeRastreio,
    shipped_at: pedido.despachadoEm === null ? null : pedido.despachadoEm.toISOString(),
    delivered_at: pedido.entregueEm === null ? null : pedido.entregueEm.toISOString(),
  };
}

function comoPagina(
  pagina: PaginaDaFilaDePlaquinhas,
  page: number,
  limit: number,
): Record<string, unknown> {
  return {
    items: pagina.itens.map(comoAdminCollarTagRequest),
    page,
    limit,
    total: pagina.total,
  };
}

export function registrarRotasDaFilaDePlaquinhas(
  app: RegistradorDeRotas,
  deps: DependenciasDaFilaDePlaquinhas,
): void {
  const { fila, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(
    app,
    rotaDeListarPedidosDePlaquinha,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaFila;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const pagina = await fila.listar({
        status: query.status,
        passoDaEntrega: query.delivery_state,
        page,
        limit,
      });
      return reply.send(comoPagina(pagina, page, limit));
    },
  );

  registrarRota(
    app,
    rotaDeLerPedidoDePlaquinha,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const pedido = await fila.ler(parametro(request, 'requestRef'));
      return reply.send(comoAdminCollarTagRequest(pedido));
    },
  );

  registrarRota(
    app,
    rotaDeAtualizarEntregaDaPlaquinha,
    {
      schema: { body: corpoDe(contrato, rotaDeAtualizarEntregaDaPlaquinha.operationId) },
      resolvedores,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as CorpoDaEntrega;
      const atualizado = await fila.atualizarEntrega(
        rotaDeAtualizarEntregaDaPlaquinha.audit,
        atorAdministrativoDe(request),
        parametro(request, 'requestRef'),
        corpo.delivery_state,
        // `tracking_code` e repassado COMO VEIO -- ausente, texto ou `null`. Um
        // `?? null` aqui transformaria "manter" em "apagar", e marcar a chegada
        // limparia o rastreio que ja estava la.
        corpo.tracking_code,
      );
      return reply.send(comoAdminCollarTagRequest(atualizado));
    },
  );

  registrarRota(
    app,
    rotaDeAtenderPedidoDePlaquinha,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const atendido = await fila.atender(
        rotaDeAtenderPedidoDePlaquinha.audit,
        atorAdministrativoDe(request),
        parametro(request, 'requestRef'),
      );
      return reply.send(comoAdminCollarTagRequest(atendido));
    },
  );

  registrarRota(
    app,
    rotaDeRecusarPedidoDePlaquinha,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const recusado = await fila.recusar(
        rotaDeRecusarPedidoDePlaquinha.audit,
        atorAdministrativoDe(request),
        parametro(request, 'requestRef'),
      );
      return reply.send(comoAdminCollarTagRequest(recusado));
    },
  );
}
