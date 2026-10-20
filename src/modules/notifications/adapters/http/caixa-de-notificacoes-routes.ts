/**
 * As cinco rotas de `/v1/me/notifications` -- a CAIXA DE NOTIFICACOES, que e o
 * destino do toque no sino da barra superior.
 *
 * `effects`, `rateLimit` e `operationId` **espelham** `api/openapi.yaml`, e
 * `rotas-registradas-contra-o-contrato` compara os dois.
 *
 * ## Por que cinco rotas, e nao duas
 *
 * `listNotifications` e `markNotificationsListSeen` sao SEPARADAS, e e a
 * separacao que implementa o requisito: **abrir a lista zera o numero e os
 * itens continuam nao lidos**. Se a leitura zerasse o contador por efeito, nao
 * haveria como chamar uma sem a outra -- nem no app, nem num teste --, e a
 * regra deixaria de ser verificavel. Alem disso `GET` que escreve e `GET` que
 * nao pode ser repetido nem cacheado.
 *
 * `getNotificationCount` e rota propria pelo motivo oposto: a barra vive em
 * TODA tela e precisa so do numero. Fazer a barra chamar `listNotifications`
 * para desenhar um numero faria cada troca de tela baixar 30 linhas.
 *
 * ## A resposta e montada campo a campo
 *
 * Nunca por espalhamento. Dois campos existem no servidor e **nao podem sair**:
 * o `id` interno (ADR-0010) e o autor do aviso -- que existe so para agrupar, e
 * cuja saida poria na tela quem causou o aviso numa caixa que de proposito nao
 * tem autor nem avatar.
 *
 * ## Nenhuma rota aqui e publica
 *
 * As cinco exigem `bearerAuth`, e o dono do token e o unico `user_id` que chega
 * ao `WHERE`. `markNotificationRead` responde **404 e nunca 403** (ADR-0021).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Contrato } from '../../../../shared/http/contract.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { AvisoDaCaixa, PaginaDaCaixa } from '../../domain/caixa.js';
import type {
  CaixaDeNotificacoesService,
  ChamadorDaCaixa,
} from '../../application/caixa-de-notificacoes-service.js';

export const rotaDeListarNotificacoes = defineRoute({
  operationId: 'listNotifications',
  method: 'get',
  path: '/me/notifications',
  effects: [],
});

export const rotaDeContarNotificacoes = defineRoute({
  operationId: 'getNotificationCount',
  method: 'get',
  path: '/me/notifications/count',
  effects: [],
});

export const rotaDeListaVista = defineRoute({
  operationId: 'markNotificationsListSeen',
  method: 'post',
  path: '/me/notifications/seen',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 240, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeMarcarTodasLidas = defineRoute({
  operationId: 'markAllNotificationsRead',
  method: 'post',
  path: '/me/notifications/read-all',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeMarcarLida = defineRoute({
  operationId: 'markNotificationRead',
  method: 'post',
  path: '/me/notifications/:notificationRef/read',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export interface AutenticadorDaCaixa {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDaCaixa {
  readonly caixa: CaixaDeNotificacoesService;
  readonly autenticador: AutenticadorDaCaixa;
  readonly contrato: Contrato;
}

/**
 * Uma linha, campo a campo, exatamente como `NotificationItem` a declara.
 *
 * **Os campos que NAO estao aqui sao a parte que importa:** o `id` interno
 * (ADR-0010) e o autor do aviso. O autor existe no servidor so para agrupar por
 * (tipo, autor, dia); publicar nome ou identificador dele poria na tela quem
 * causou o aviso, numa caixa que nao tem autor nem avatar de proposito.
 */
function comoResposta(aviso: AvisoDaCaixa): Record<string, unknown> {
  return {
    ref: aviso.ref,
    kind: aviso.tipo,
    subject: aviso.assunto,
    // `.toISOString()` e nao `comoIso`: `comoIso` recebe `Instant` (numero) e
    // o que vem do banco e `Date`. Mesma forma de `decided_at` na fila de
    // indicacoes.
    occurred_at: aviso.aconteceuEm.toISOString(),
    read: aviso.lido,
    grouped_count: aviso.agrupados,
  };
}

function paginaComoResposta(pagina: PaginaDaCaixa): Record<string, unknown> {
  return {
    items: pagina.itens.map(comoResposta),
    page: pagina.pagina,
    limit: pagina.limite,
    total: pagina.total,
    unread_total: pagina.naoLidos,
  };
}

/**
 * MEMOIZADA por requisicao, pelo mesmo motivo das rotas de aparelho: o teto por
 * `account` precisa do dono antes do handler, e o handler precisa do mesmo
 * dono. Sem a memoria, cada `POST` verificaria a assinatura e leria `users`
 * duas vezes.
 */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaCaixa,
): Promise<ChamadorDaCaixa> {
  return memoDaRequisicao(request, 'caixa:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId };
  });
}

/**
 * `account` para o teto. Quem nao apresentou credencial valida nao tem balde de
 * conta -- a recusa dele e o 401 do handler, e nao um 429 que confundiria "sem
 * sessao" com "chamou demais".
 */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaCaixa,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

interface BuscaDaListagem {
  page?: number;
  limit?: number;
}

export function registrarRotasDaCaixaDeNotificacoes(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaCaixa,
): void {
  registrarRota(app, rotaDeListarNotificacoes, {}, async (request, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    // `page` e `limit` chegam validados: `vigiarParametrosDasRotas` instala
    // `schema.querystring` a partir do contrato, e e o contrato que limita
    // `limit` a 30.
    const busca = request.query as BuscaDaListagem;
    const pagina = await deps.caixa.listar(chamador, {
      ...(busca.page === undefined ? {} : { pagina: busca.page }),
      ...(busca.limit === undefined ? {} : { limite: busca.limit }),
    });
    return reply.status(200).send(paginaComoResposta(pagina));
  });

  registrarRota(app, rotaDeContarNotificacoes, {}, async (request, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const total = await deps.caixa.contar(chamador);
    return reply.status(200).send({ unread_total: total });
  });

  registrarRota(
    app,
    rotaDeListaVista,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      await deps.caixa.listaVista(chamador);
      // 204 e nao 200 com corpo: a resposta nao tem nada a dizer, e devolver o
      // contador novo aqui faria a tela acreditar num numero que ela acabou de
      // zerar -- a plaquinha e o achado ATRAVESSAM o zero, entao o numero
      // depois de "vista" nao e necessariamente zero.
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeMarcarTodasLidas,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const marcadas = await deps.caixa.marcarTodasLidas(chamador);
      return reply.status(200).send({ marked: marcadas });
    },
  );

  registrarRota(
    app,
    rotaDeMarcarLida,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const { notificationRef } = request.params as { notificationRef: string };
      // O servico lanca 404 quando o aviso nao e desta conta -- e NUNCA 403
      // (ADR-0021), porque um 403 confirmaria que o `ref` existe.
      await deps.caixa.marcarLida(chamador, notificationRef);
      return reply.status(204).send();
    },
  );
}
