/**
 * `/v1/admin/directory/suggestions/...`: a FILA DE REVISAO das indicacoes do
 * `Perto` (18/10/2026).
 *
 * ## Por que estas rotas nao mexem na borda
 *
 * Elas comecam com `/admin`, e o bloco do host administrativo do `Caddyfile`
 * repassa `/v1/admin/*` inteiro -- nao ha rota a acrescentar. **Foi exatamente
 * o contrario que fez a taxonomia da Loja responder 404 no painel**: uma
 * operacao fora de `/v1/admin` precisa de `handle` explicito na borda, e sem
 * ele o painel chama um endereco que a borda nao serve. Nada aqui sai de
 * `/v1/admin`, de proposito.
 *
 * ## O que NAO esta aqui, porque ja aconteceu antes
 *
 * Estas rotas so sobem dentro de `escoparRotasAdministrativas`: a guarda confere
 * superficie, cookie de sessao, `Origin`, `X-CSRF-Token` e o papel antes de
 * qualquer gancho daqui. **Nenhuma escrita pede reautenticacao** (ADR-0027 item
 * 23). Papel, trilha e teto sao copiados do contrato, e
 * `rotas-registradas-contra-o-contrato` os compara; o schema do corpo tambem vem
 * do contrato, pelo `operationId`.
 *
 * `vigiarParametrosDasRotas` instala `schema.querystring` a partir do contrato:
 * a validacao de `review_status`, `page` e `limit` nao esta neste arquivo.
 *
 * ## Nenhum `ETag` nas duas leituras
 *
 * A decisao nao e edicao campo a campo: decidir o que ja foi decidido responde
 * `400 suggestion_not_pending`, que e a resposta certa, e nao um conflito de
 * versao. As outras duas filas do painel tambem nao tem `If-Match`.
 *
 * **A aprovacao devolve o `ETag` DA ENTRADA**, no cabecalho: o painel pula da
 * fila para o formulario da entrada, e sem ele a primeira edicao gastaria uma
 * leitura so para descobrir a versao.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type { RevisaoDaIndicacao } from '../../domain/fila-de-indicacoes.js';
import type {
  AprovacaoDaIndicacao,
  FilaDeIndicacoes,
  RecusaDaIndicacao,
} from '../../application/fila-de-indicacoes.js';

/** D52: 120 escritas em 10 minutos por conta, somadas todas as escritas administrativas. */
const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarIndicacoes = defineRoute({
  operationId: 'listAdminDirectorySuggestions',
  method: 'get',
  path: '/admin/directory/suggestions',
  effects: [],
  adminRoles: ADMIN,
  // Contagem de REQUISICOES, aplicada pela borda, e nao `rows_returned`: o teto
  // por linhas e da leitura de PESSOA (D56), e esta fila nao le pessoa -- a
  // autoria da indicacao nunca sai do servidor. Mesma forma da fila da
  // plaquinha, que tambem nao le pessoa.
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeLerIndicacao = defineRoute({
  operationId: 'getAdminDirectorySuggestion',
  method: 'get',
  path: '/admin/directory/suggestions/:suggestionRef',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeAprovarIndicacao = defineRoute({
  operationId: 'approveAdminDirectorySuggestion',
  method: 'post',
  path: '/admin/directory/suggestions/:suggestionRef/approval',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.directory_suggestion.approved', resourceKind: 'directory_suggestion' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeRecusarIndicacao = defineRoute({
  operationId: 'declineAdminDirectorySuggestion',
  method: 'post',
  path: '/admin/directory/suggestions/:suggestionRef/decline',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.directory_suggestion.declined', resourceKind: 'directory_suggestion' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export interface DependenciasDasRotasDaFilaDeIndicacoes {
  readonly fila: FilaDeIndicacoes;
  readonly contrato: Contrato;
}

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 50;

/** `admin:`, e nao `account:`: um balde do painel e um do app nunca dividem chave (ADR-0027 item 20.2). */
const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

function referencia(request: FastifyRequest): string {
  return (request.params as Record<string, string>)['suggestionRef'] ?? '';
}

interface QueryDaFila {
  readonly review_status?: RevisaoDaIndicacao;
  readonly page?: number;
  readonly limit?: number;
}

export function registrarRotasDaFilaDeIndicacoes(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaFilaDeIndicacoes,
): void {
  const { fila, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(
    app,
    rotaDeListarIndicacoes,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaFila;
      const pagina = await fila.listar({
        reviewStatus: query.review_status,
        page: query.page ?? PAGINA_INICIAL,
        limit: query.limit ?? TAMANHO_PADRAO,
      });
      return reply.send(pagina);
    },
  );

  registrarRota(app, rotaDeLerIndicacao, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await fila.ler(referencia(request)));
  });

  registrarRota(
    app,
    rotaDeAprovarIndicacao,
    { schema: { body: corpoDe(contrato, rotaDeAprovarIndicacao.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { etagDaEntrada, ...corpo } = await fila.aprovar(
        atorAdministrativoDe(request),
        referencia(request),
        request.body as AprovacaoDaIndicacao,
      );
      // O `ETag` e DA ENTRADA, e nao da indicacao: e com ele que o painel edita
      // a entrada em seguida, sem uma segunda leitura.
      return reply.header('ETag', etagDaEntrada).send(corpo);
    },
  );

  registrarRota(
    app,
    rotaDeRecusarIndicacao,
    { schema: { body: corpoDe(contrato, rotaDeRecusarIndicacao.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(
        await fila.recusar(
          atorAdministrativoDe(request),
          referencia(request),
          request.body as RecusaDaIndicacao,
        ),
      );
    },
  );
}
