/**
 * `/v1/admin/moderation/reports`: a FILA DE MODERACAO do painel.
 *
 * ## TUDO SOB `/v1/admin`, E A BORDA NAO E TOCADA
 *
 * As quatro operacoes vivem debaixo do prefixo administrativo, e **nenhuma
 * rota publica muda**. Foi exatamente o contrario disso que deixou a taxonomia
 * da Loja dando 404 no painel: mexer na borda para acomodar uma tela nova
 * quebra o que ja estava de pe. O acrescimo e ADITIVO -- quatro `operationId`
 * novos, quatro caminhos novos, nenhum caminho existente alterado.
 *
 * ## O que NAO esta aqui, porque a guarda do escopo ja fez
 *
 * Estas rotas so sobem dentro de `escoparRotasAdministrativas`, e a guarda roda
 * antes de qualquer gancho delas: `X-Internal-Surface` (404), recusa de
 * `Authorization` (401), sessao em cookie (401), `Origin` e `X-CSRF-Token` em
 * metodo nao seguro (403) e o papel de `adminRoles` (403). **Nenhuma
 * verificacao de papel mora aqui nem no caso de uso** (ADR-0027 item 7).
 *
 * ## SEM `x-audit` NOS DOIS `GET`, e a ausencia e medida
 *
 * `x-audit` em `GET` administrativo e so da leitura de PESSOA, que anda junto
 * do teto por `rows_returned` (D55/D56). Esta fila **nao le pessoa**: nem o
 * denunciante nem o denunciado aparecem em campo nenhum da resposta -- nem
 * nome, nem UUID, nem a existencia de uma conta por tras. O que sai e o
 * CONTEUDO denunciado (quando ele e publicado), o motivo, a contagem e a data.
 * Mesma ausencia, e pelo mesmo motivo, da fila da plaquinha e da fila de
 * indicacao.
 *
 * ## O CONTEUDO DA CONVERSA NAO SAI, e isso e desenho
 *
 * `AdminModerationItem.content` e **nulo na origem `conversation`**. A conversa
 * mediada e privada entre duas pessoas, `conversation_messages.body` e texto
 * que elas trocaram esperando que ninguem mais lesse, e nada neste produto
 * autoriza o administrador a le-lo. O que a origem `conversation` entrega para
 * quem decide e `reason`, `detail` -- o relato que o denunciante escreveu, que
 * e o canal desenhado para isso e e por isso que ele aceita 1000 simbolos --,
 * `repeat_total` e o nome do pet em `subject`. **E uma limitacao real da fila,
 * declarada aqui e na migracao `20261018000009`.**
 *
 * ## NENHUMA ACAO SOBRE A CONTA DA PESSOA
 *
 * Nao ha operacao de desabilitar conta aqui, e nao ha caminho que leve a uma.
 * Isso e outro poder, com outro evento de trilha, e nao entra nesta fila.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type {
  FilaDeModeracao,
  MotivoDaDecisao,
} from '../../application/fila-de-moderacao.js';
import type { EstadoDaFila, OrigemDaDenuncia } from '../../domain/fila-de-moderacao.js';

/** D52: 120 escritas em 10 minutos por conta, somadas todas as escritas do painel. */
const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarDenuncias = defineRoute({
  operationId: 'listAdminModerationReports',
  method: 'get',
  path: '/admin/moderation/reports',
  effects: [],
  adminRoles: ADMIN,
  // Contagem de REQUISICOES, aplicada pela borda. Nao e `rows_returned`: o teto
  // por linhas e da leitura de pessoa, e esta fila nao le pessoa.
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeLerDenuncia = defineRoute({
  operationId: 'getAdminModerationReport',
  method: 'get',
  path: '/admin/moderation/reports/:origin/:targetRef',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/**
 * REMOVER O CONTEUDO: exclusao logica, com motivo obrigatorio.
 *
 * `POST` em sub-recurso de acao, e nao `DELETE`: **nada e apagado**, e um
 * `DELETE` diria o contrario do que a operacao faz. A irma `/dismissal` tem a
 * mesma forma, e as duas filas que servem de padrao no painel (`/fulfillment`,
 * `/decline`, `/approval`) tambem -- o painel fala um dialeto so.
 */
export const rotaDeRemoverConteudo = defineRoute({
  operationId: 'removeAdminModerationContent',
  method: 'post',
  path: '/admin/moderation/reports/:origin/:targetRef/removal',
  effects: [],
  adminRoles: ADMIN,
  audit: {
    action: 'admin.moderation_report.content_removed',
    resourceKind: 'moderation_report',
  },
  rateLimit: [BALDE_DE_ESCRITA],
});

/** DESCARTAR A DENUNCIA: tambem com motivo, e sem tocar o conteudo. */
export const rotaDeDescartarDenuncia = defineRoute({
  operationId: 'dismissAdminModerationReport',
  method: 'post',
  path: '/admin/moderation/reports/:origin/:targetRef/dismissal',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.moderation_report.dismissed', resourceKind: 'moderation_report' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export interface DependenciasDasRotasDeModeracao {
  readonly fila: FilaDeModeracao;
  /**
   * De onde sai o schema do corpo. Validacao escrita a mao em paralelo a spec e
   * a segunda definicao, e e ela que diverge.
   */
  readonly contrato: Contrato;
}

const PAGINA_INICIAL = 1;
/** 50, o mesmo tamanho das outras filas do painel. */
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

/**
 * A origem, como o contrato a validou.
 *
 * O `enum` do caminho e conferido pelo schema do contrato na borda, entao aqui
 * o valor ja e um dos declarados. O `as` e a travessia dessa fronteira, e nao
 * uma suposicao: origem fora do `enum` nao chega a este gancho.
 */
function origemDe(request: FastifyRequest): OrigemDaDenuncia {
  return parametro(request, 'origin') as OrigemDaDenuncia;
}

interface QueryDaFila {
  readonly state?: EstadoDaFila;
  readonly origin?: OrigemDaDenuncia;
  readonly page?: number;
  readonly limit?: number;
}

export function registrarRotasDaFilaDeModeracao(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeModeracao,
): void {
  const { fila, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(
    app,
    rotaDeListarDenuncias,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaFila;
      const pagina = await fila.listar({
        estado: query.state,
        origem: query.origin,
        page: query.page ?? PAGINA_INICIAL,
        limit: query.limit ?? TAMANHO_PADRAO,
      });
      return reply.send(pagina);
    },
  );

  registrarRota(
    app,
    rotaDeLerDenuncia,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const item = await fila.ler(origemDe(request), parametro(request, 'targetRef'));
      return reply.send(item);
    },
  );

  registrarRota(
    app,
    rotaDeRemoverConteudo,
    { schema: { body: corpoDe(contrato, rotaDeRemoverConteudo.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const item = await fila.remover(
        atorAdministrativoDe(request),
        origemDe(request),
        parametro(request, 'targetRef'),
        request.body as MotivoDaDecisao,
      );
      return reply.send(item);
    },
  );

  registrarRota(
    app,
    rotaDeDescartarDenuncia,
    { schema: { body: corpoDe(contrato, rotaDeDescartarDenuncia.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const item = await fila.descartar(
        atorAdministrativoDe(request),
        origemDe(request),
        parametro(request, 'targetRef'),
        request.body as MotivoDaDecisao,
      );
      return reply.send(item);
    },
  );
}
