/**
 * A FILA DAS DUVIDAS, lida pelo painel (29/10/2026).
 *
 * E a **porta de saida** de `POST /v1/me/help-requests`. Sem ela a duvida e
 * gravada e nenhum humano a alcanca -- e esta casa ja entregou uma
 * funcionalidade inteira assim: o passkey teve servidor, contrato, entitlement
 * e digital no lugar, **nenhuma porta de interface**, e o banco com zero
 * credenciais. Nenhum portao acusou, porque nenhum portao pergunta se alguem
 * consegue chegar.
 *
 * `effects`, `rateLimit`, `adminRoles` e `operationId` **espelham**
 * `api/openapi.yaml`, e `rotas-registradas-contra-o-contrato` compara os dois.
 *
 * ## NADA DO AUTOR SAI DAQUI
 *
 * O contrato afirma em TRES lugares que `listAdminNetworkJoinRequests` e *"a
 * unica leitura de pessoa do backoffice v1"*, coberta pelo RA-01 com as
 * decisoes D53 a D57 do cliente (23/09). A fila de plaquinhas repete a
 * afirmacao e se abstem.
 *
 * Entao `comoResposta` monta a duvida campo a campo, e **nao ha campo de
 * pessoa para montar**: a porta `DuvidasDeAjuda` nem devolve o autor, entao
 * projeta-lo aqui nao seria um descuido possivel -- seria preciso mudar a
 * porta e a consulta antes. A fronteira esta no tipo, e nao so neste
 * comentario.
 *
 * ## SEM `x-audit`, E A AUSENCIA E POR REGRA
 *
 * `listAdminNetworkJoinRequests` e, pelo proprio texto dela, **a unica
 * operacao `GET` administrativa com `x-audit`, e a excecao e deliberada** --
 * ela existe porque aquela operacao le PESSOA (D55). Esta nao le. Por isso o
 * teto conta REQUISICOES e nao `rows_returned`: o par `x-audit` +
 * `counts: rows_returned` e cobrado junto pelo portao de contrato
 * administrativo (regras 5 e 6), e declarar um sem o outro reprova.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { DuvidaNaFila, PaginaDaFila } from '../../ports/duvidas-de-ajuda.js';
import type { FilaDeAjudaAdministrativa } from '../../application/fila-de-ajuda-service.js';

const ADMIN = ['admin'] as const;

const PAGINA_INICIAL = 1;
/** 50, como as outras duas filas do painel. */
const TAMANHO_PADRAO = 50;

export const rotaDeListarDuvidasDeAjuda = defineRoute({
  operationId: 'listAdminHelpRequests',
  method: 'get',
  path: '/admin/help-requests',
  effects: [],
  adminRoles: ADMIN,
  // Contagem de REQUISICOES, aplicada pela borda. Nao e `rows_returned`: o
  // teto por linhas e da leitura de PESSOA (D56), e esta fila nao le pessoa.
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDasRotasDaFilaDeAjuda {
  readonly fila: FilaDeAjudaAdministrativa;
}

interface QueryDaFila {
  page?: number | string;
  limit?: number | string;
}

/**
 * Le um inteiro da consulta, e **nao confia na coercao do framework**.
 *
 * Em producao `vigiarParametrosDasRotas` instala `schema.querystring` a partir
 * do contrato, e o Ajv converte `'3'` em `3` antes do handler. Mas o tipo
 * `number` que a interface acima declarava era uma AFIRMACAO sobre isso, e ela
 * e falsa em todo caminho que nao passe pelo esquema -- um teste, uma bancada,
 * um `inject` direto. Medido: sem o guarda, `page=3` chega como `'3'`, e o
 * resto da rota continuava "funcionando" por coercao de JavaScript, com
 * `(`'3'` - 1) * `'10'`` dando 20 por acidente.
 *
 * Acidente que funciona e o pior dos dois mundos: ele passa no caso feliz e
 * quebra no dia em que alguem escrever `limite.toFixed()`. A conversao aqui e
 * explicita, e o padrao volta quando o valor nao e numero.
 */
function inteiroDaConsulta(valor: number | string | undefined, padrao: number): number {
  if (valor === undefined) return padrao;
  const numero = typeof valor === 'number' ? valor : Number.parseInt(valor, 10);
  return Number.isFinite(numero) ? numero : padrao;
}

/**
 * A resposta, campo a campo e nunca por espalhamento.
 *
 * Espalhar (`...duvida`) faria qualquer campo novo da porta escorrer para a
 * resposta sem ninguem decidir -- e o campo que um dia alguem acrescentaria
 * ali e justamente o do autor.
 */
function comoResposta(duvida: DuvidaNaFila): Record<string, unknown> {
  return {
    ref: duvida.ref,
    subject: duvida.assunto,
    body: duvida.texto,
    created_at: new Date(duvida.criadaEm).toISOString(),
  };
}

function comoPagina(
  pagina: PaginaDaFila,
  page: number,
  limit: number,
): Record<string, unknown> {
  return {
    items: pagina.itens.map(comoResposta),
    page,
    limit,
    total: pagina.total,
  };
}

const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  // `admin:`, e nao `account:`: um balde do painel e um do app nunca dividem
  // chave (ADR-0027 item 20.2).
  return conta === undefined ? undefined : `admin:${conta}`;
};

export function registrarRotasDaFilaDeAjuda(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaFilaDeAjuda,
): void {
  registrarRota(
    app,
    rotaDeListarDuvidasDeAjuda,
    { resolvedores: { account: contaDoTeto } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // `page` e `limit` chegam validados: `vigiarParametrosDasRotas` instala
      // `schema.querystring` a partir do contrato, entao `limit=0` e
      // `limit=101` sao 400 antes do handler.
      const query = (request.query ?? {}) as QueryDaFila;
      const page = inteiroDaConsulta(query.page, PAGINA_INICIAL);
      const limit = inteiroDaConsulta(query.limit, TAMANHO_PADRAO);
      const pagina = await deps.fila.listar(page, limit);
      return reply.send(comoPagina(pagina, page, limit));
    },
  );
}
