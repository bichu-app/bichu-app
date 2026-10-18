/**
 * `/v1/admin/directory/...`: a escrita administrativa do diretorio de `Perto`
 * (BICHUS-189; ADR-0027).
 *
 * ## O que NAO esta aqui, porque ja aconteceu antes
 *
 * Estas rotas so sobem dentro de `escoparRotasAdministrativas`: a guarda do
 * escopo confere superficie, cookie de sessao, `Origin`, `X-CSRF-Token` e o
 * papel de `adminRoles` antes de qualquer gancho daqui. **Nenhuma escrita daqui
 * pede reautenticacao** (decisao do cliente de 07/10/2026, ADR-0027 item 23), e
 * **nenhuma verificacao de papel mora aqui nem no caso de uso**.
 *
 * ## A declaracao e a do contrato
 *
 * Papel, trilha e teto sao copiados do contrato, e
 * `rotas-registradas-contra-o-contrato` os compara. O schema do corpo tambem
 * vem do contrato, pelo `operationId`: declarar um aqui criaria a segunda
 * definicao, que e a que diverge.
 *
 * ## A validacao de query nao esta aqui
 *
 * `vigiarParametrosDasRotas` instala `schema.querystring` a partir do contrato.
 * O `400` que ela produz esta declarado na operacao, e o portao de subida
 * reprova se sair de la.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Contrato } from '../../../../shared/http/contract.js';
import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type { DiretorioAdministrativo } from '../../application/diretorio-administrativo.js';
import type { TipoDeProfissional } from '../../domain/entrada-do-diretorio.js';
import type {
  CriacaoDaEntrada,
  EdicaoDaEntrada,
  StatusDaEntrada,
} from '../../domain/escrita-do-diretorio.js';
import type { OrdemDoDiretorioAdministrativo } from '../../ports/diretorio-administrativo.js';

/** D52: 120 escritas em 10 minutos por conta, somadas todas as escritas administrativas. */
const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarEntradas = defineRoute({
  operationId: 'listAdminDirectoryEntries',
  method: 'get',
  path: '/admin/directory/entries',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeCriarEntrada = defineRoute({
  operationId: 'createAdminDirectoryEntry',
  method: 'post',
  path: '/admin/directory/entries',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.directory_entry.created', resourceKind: 'directory_entry' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeLerEntrada = defineRoute({
  operationId: 'getAdminDirectoryEntry',
  method: 'get',
  path: '/admin/directory/entries/:entrySlug',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeAlterarEntrada = defineRoute({
  operationId: 'updateAdminDirectoryEntry',
  method: 'patch',
  path: '/admin/directory/entries/:entrySlug',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.directory_entry.updated', resourceKind: 'directory_entry' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export interface DependenciasDasRotasDoDiretorioAdministrativo {
  readonly diretorio: DiretorioAdministrativo;
  readonly contrato: Contrato;
}

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 50;
const ORDEM_PADRAO: OrdemDoDiretorioAdministrativo = 'name';

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        'no contrato, mas a rota espera um. Corrija a especificação, não o código.',
    );
  }
  return schema;
}

/** `admin:`, e nao `account:`: um balde do painel e um do app nunca dividem chave (ADR-0027 item 20.2). */
const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

function ifMatch(request: FastifyRequest): string | string[] | undefined {
  return request.headers['if-match'];
}

interface QueryDeEntradas {
  readonly q?: string;
  readonly kind?: TipoDeProfissional;
  readonly status?: StatusDaEntrada;
  readonly city?: string;
  readonly state?: string;
  readonly sort?: OrdemDoDiretorioAdministrativo;
  readonly page?: number;
  readonly limit?: number;
}

/**
 * O recorte que de fato valeu, para a tela poder escreve-lo.
 *
 * `scope: all` quando nada foi filtrado: "nada filtrado" e uma informacao, e um
 * objeto vazio faria a tela adivinhar a diferenca entre "sem filtro" e "filtro
 * que nao coube na resposta". Mesma forma da listagem publica.
 */
function filtrosAplicados(query: QueryDeEntradas): Record<string, string> {
  const aplicados: Record<string, string> = {};
  if (query.q !== undefined && query.q.trim() !== '') aplicados['q'] = query.q.trim();
  if (query.kind !== undefined) aplicados['kind'] = query.kind;
  if (query.status !== undefined) aplicados['status'] = query.status;
  if (query.city !== undefined && query.city.trim() !== '') aplicados['city'] = query.city.trim();
  if (query.state !== undefined && query.state.trim() !== '') aplicados['state'] = query.state.trim();
  if (Object.keys(aplicados).length === 0) aplicados['scope'] = 'all';
  return aplicados;
}

/**
 * `DELETE /v1/admin/directory/reviews/{reviewRef}` -- a moderacao da avaliacao.
 *
 * **Entra na MESMA fatia que a avaliacao, e nao depois.** A publicacao e
 * imediata (decisao do cliente de 18/10) e isto fala de negocio real com nome e
 * endereco: publicacao imediata sem caminho de remocao e uma funcionalidade que
 * nao se pode desligar.
 *
 * `DELETE` no metodo e EXCLUSAO LOGICA no banco, e as duas coisas nao se
 * contradizem: o que o cliente da API apaga e a PUBLICACAO. A linha fica,
 * porque o ADR-0011 manda a remocao ser registrada na trilha com o motivo.
 *
 * **O que o painel ainda NAO tem, e esta declarado para nao ser descoberto
 * depois:** nao ha operacao de LISTAR as denuncias nem as avaliacoes. O
 * administrador remove por `reviewRef`, que ele obtem pela leitura publica da
 * pagina do local. A fila de moderacao navegavel e a continuacao natural e nao
 * cabia aqui.
 */
export const rotaDeRemoverAvaliacao = defineRoute({
  operationId: 'removeAdminDirectoryReview',
  method: 'delete',
  path: '/directory/reviews/:reviewRef',
  effects: [],
  adminRoles: ['admin'],
  audit: { action: 'admin.directory_review.removed', resourceKind: 'professional_review' },
  rateLimit: [{ dimension: ['account'], limit: 120, window: '10m', onExceed: 'deny_429' }],
});

export function registrarRotasDoDiretorioAdministrativo(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDoDiretorioAdministrativo,
): void {
  const { diretorio, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(app, rotaDeListarEntradas, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as QueryDeEntradas;
    const pagina = await diretorio.listarEntradas({
      q: query.q,
      kind: query.kind,
      status: query.status,
      city: query.city,
      state: query.state,
      sort: query.sort ?? ORDEM_PADRAO,
      page: query.page ?? PAGINA_INICIAL,
      limit: query.limit ?? TAMANHO_PADRAO,
    });
    return reply.send({ ...pagina, applied_filters: filtrosAplicados(query) });
  });

  registrarRota(
    app,
    rotaDeCriarEntrada,
    { schema: { body: corpoDe(contrato, rotaDeCriarEntrada.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const criada = await diretorio.criarEntrada(
        atorAdministrativoDe(request),
        request.body as CriacaoDaEntrada,
      );
      return reply.status(201).header('ETag', criada.etag).send(criada.recurso);
    },
  );

  registrarRota(app, rotaDeLerEntrada, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const lida = await diretorio.lerEntrada(parametro(request, 'entrySlug'));
    return reply.header('ETag', lida.etag).send(lida.recurso);
  });

  registrarRota(
    app,
    rotaDeAlterarEntrada,
    { schema: { body: corpoDe(contrato, rotaDeAlterarEntrada.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const alterada = await diretorio.alterarEntrada(
        atorAdministrativoDe(request),
        parametro(request, 'entrySlug'),
        ifMatch(request),
        request.body as EdicaoDaEntrada,
      );
      return reply.header('ETag', alterada.etag).send(alterada.recurso);
    },
  );

  registrarRota(
    app,
    rotaDeRemoverAvaliacao,
    { schema: { body: corpoDe(contrato, rotaDeRemoverAvaliacao.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = (request.body ?? {}) as { reason?: unknown };
      await diretorio.removerAvaliacao(
        atorAdministrativoDe(request),
        parametro(request, 'reviewRef'),
        typeof corpo.reason === 'string' ? corpo.reason : '',
      );
      return reply.status(204).send();
    },
  );
}
