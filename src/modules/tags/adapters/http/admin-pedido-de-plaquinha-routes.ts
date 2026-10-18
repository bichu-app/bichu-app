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
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type {
  DecisaoDoPedidoDePlaquinha,
  PaginaDaFilaDePlaquinhas,
  PedidoNaFilaDePlaquinhas,
} from '../../ports/pedido-de-plaquinha.js';
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

export interface DependenciasDaFilaDePlaquinhas {
  readonly fila: FilaDePlaquinhasAdministrativa;
}

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
  readonly page?: number;
  readonly limit?: number;
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
    // `DeliveryAddress` como o contrato o declara. `complement` sai
    // explicitamente nulo, e nao omitido: o schema o declara opcional, e
    // omitir faria o painel distinguir "sem complemento" de "campo que sumiu".
    delivery_address: {
      recipient_name: pedido.endereco.destinatario,
      recipient_phone: pedido.endereco.telefone,
      postal_code: pedido.endereco.cep,
      street: pedido.endereco.logradouro,
      street_number: pedido.endereco.numero,
      complement: pedido.endereco.complemento,
      neighborhood: pedido.endereco.bairro,
      city: pedido.endereco.cidade,
      state: pedido.endereco.uf,
    },
    notes: pedido.observacao,
    status: pedido.status,
    requested_at: pedido.solicitadoEm.toISOString(),
    decided_at: pedido.decididoEm === null ? null : pedido.decididoEm.toISOString(),
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
  const { fila } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(
    app,
    rotaDeListarPedidosDePlaquinha,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaFila;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const pagina = await fila.listar({ status: query.status, page, limit });
      return reply.send(comoPagina(pagina, page, limit));
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
