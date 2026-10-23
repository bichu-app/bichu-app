/**
 * `/v1/admin/broadcasts/...`: o COMUNICADO -- o unico aviso do produto com
 * alcance total.
 *
 * ## Por que estas rotas nao mexem na borda
 *
 * Elas comecam com `/admin`, e o bloco do host administrativo do `Caddyfile`
 * repassa `/v1/admin/*` inteiro -- nao ha rota a acrescentar. Foi exatamente o
 * contrario que fez a taxonomia da Loja responder 404 no painel: uma operacao
 * fora de `/v1/admin` precisa de `handle` explicito na borda, e sem ele o
 * painel chama um endereco que a borda nao serve.
 *
 * ## O que NAO esta aqui, porque a guarda ja fez
 *
 * Estas rotas so sobem dentro de `escoparRotasAdministrativas`: a guarda
 * confere superficie, cookie de sessao, `Origin`, `X-CSRF-Token` e o PAPEL
 * antes de qualquer gancho daqui. Papel, trilha e teto sao copiados do
 * contrato, e `rotas-registradas-contra-o-contrato` os compara; o schema do
 * corpo tambem vem do contrato, pelo `operationId`.
 *
 * **Nenhuma escrita pede reautenticacao** (ADR-0027 emenda do item 23,
 * 07/10/2026), e o comunicado nao e excecao a isso -- o esquema `adminReauth`
 * existe no contrato e ZERO operacoes o declaram. A trava do comunicado e papel
 * fechado + trilha obrigatoria + teto diario, e a senha e o que ela nao tem.
 *
 * ## Nao existe `DELETE`, e a ausencia e a regra
 *
 * Comunicado disparado fica registrado. Nao ha rota de apagar neste arquivo,
 * nao ha no contrato, e nao ha coluna de exclusao na tabela.
 *
 * ## `getAdminBroadcastDispatchWindow` e `GET`, e nao recebe o rascunho
 *
 * A primeira forma dela era um `POST .../preview` que mandava titulo e corpo e
 * os devolvia. `portao-contrato-administrativo` (ADR-0027 item 7, regra 2) a
 * reprovou, e estava certo: ele exige `x-audit` de TODA operacao sob `/admin/`
 * de metodo nao seguro, porque sob `/admin` metodo nao seguro E escrita, e
 * "esta aqui nao escreve" e exatamente a afirmacao que um portao nao pode
 * aceitar na palavra de quem escreveu a rota.
 *
 * Dar trilha a uma pre-visualizacao gravaria uma linha por tecla digitada e
 * afogaria a trilha do disparo. A saida nao foi uma excecao ao portao: foi
 * notar que **o servidor nunca precisou do texto** -- alcance, quantos cabem
 * hoje e o teto nao dependem de uma letra do rascunho. Entao ela e `GET`, sem
 * corpo, o rascunho nao atravessa a rede, e a operacao e o que sempre foi: uma
 * leitura. A pre-visualizacao continua obrigatoria antes do disparo; ela so
 * deixou de precisar de uma ida ao servidor carregando o texto.
 *
 * Sem `x-audit` tambem pela regra 5: `GET` administrativo so tem trilha quando
 * e leitura de PESSOA auditada, e `would_reach` e uma CONTAGEM de contas e
 * nunca uma lista delas.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type { Comunicado, JanelaDeDisparo, PaginaDeComunicados } from '../../domain/comunicado.js';
import type { ComunicadosAdministrativos } from '../../application/comunicados-administrativos.js';

/** D52: 120 escritas em 10 minutos por conta, somadas todas as escritas administrativas. */
const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarComunicados = defineRoute({
  operationId: 'listAdminBroadcasts',
  method: 'get',
  path: '/admin/broadcasts',
  effects: [],
  adminRoles: ADMIN,
  // Contagem de REQUISICOES, e nao `rows_returned`: o teto por linhas e da
  // leitura de PESSOA (D56), e esta lista nao le pessoa -- ela le comunicados e
  // o nome de exibicao de contas de painel. Mesma forma da fila da plaquinha.
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeDispararComunicado = defineRoute({
  operationId: 'dispatchAdminBroadcast',
  method: 'post',
  path: '/admin/broadcasts',
  // `notifies` porque ele enche toda caixa, e `irreversible_write` porque nao
  // ha desfazer: as duas marcas sao o que faz o catalogo do ADR-0016 tratar
  // esta operacao como o que ela e.
  effects: ['notifies', 'irreversible_write'],
  adminRoles: ADMIN,
  audit: { action: 'admin.broadcast.dispatched', resourceKind: 'broadcast' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDaJanelaDeDisparo = defineRoute({
  operationId: 'getAdminBroadcastDispatchWindow',
  method: 'get',
  path: '/admin/broadcasts/dispatch-window',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDasRotasDeComunicado {
  readonly comunicados: ComunicadosAdministrativos;
  readonly contrato: Contrato;
}

interface CorpoDoRascunho {
  title: string;
  body: string;
}

interface QueryDaLista {
  readonly page?: number;
  readonly limit?: number;
}

/** `admin:`, e nao `account:`: um balde do painel e um do app nunca dividem chave (ADR-0027 item 20.2). */
const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

/**
 * Um comunicado, campo a campo, exatamente como `AdminBroadcast` o declara.
 *
 * **O `id` interno nao esta aqui** (ADR-0010), e `dispatched_by` e o NOME DE
 * EXIBICAO da conta de painel -- nao o e-mail e nao o UUID. A pergunta que a
 * tela responde e "quem mandou isto", e o nome a responde sem publicar
 * identificador.
 */
function comoResposta(c: Comunicado): Record<string, unknown> {
  return {
    ref: c.ref,
    title: c.titulo,
    body: c.corpo,
    dispatched_at: c.disparadoEm.toISOString(),
    dispatched_by: c.disparadoPor,
    recipients_total: c.destinatarios,
  };
}

function paginaComoResposta(p: PaginaDeComunicados): Record<string, unknown> {
  return {
    items: p.itens.map(comoResposta),
    page: p.pagina,
    limit: p.limite,
    total: p.total,
  };
}

function janelaComoResposta(j: JanelaDeDisparo): Record<string, unknown> {
  return {
    would_reach: j.alcancaria,
    remaining_today: j.restamHoje,
    daily_cap: j.tetoDiario,
  };
}

export function registrarRotasDeComunicado(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeComunicado,
): void {
  const { comunicados, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(
    app,
    rotaDeListarComunicados,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaLista;
      const pagina = await comunicados.listar({
        ...(query.page === undefined ? {} : { pagina: query.page }),
        ...(query.limit === undefined ? {} : { limite: query.limit }),
      });
      return reply.status(200).send(paginaComoResposta(pagina));
    },
  );

  registrarRota(
    app,
    rotaDaJanelaDeDisparo,
    { resolvedores },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const janela = await comunicados.janelaDeDisparo();
      return reply.status(200).send(janelaComoResposta(janela));
    },
  );

  registrarRota(
    app,
    rotaDeDispararComunicado,
    {
      schema: { body: corpoDe(contrato, rotaDeDispararComunicado.operationId) },
      resolvedores,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as CorpoDoRascunho;
      // `rotaDeDispararComunicado.audit` e o `x-audit` do contrato, e
      // `eventoAdministrativo` reprova acao que nao esteja em
      // `ACOES_ADMINISTRATIVAS`: um disparo sem trilha declarada nao sobe.
      const comunicado = await comunicados.disparar(
        rotaDeDispararComunicado.audit,
        atorAdministrativoDe(request),
        { titulo: corpo.title, corpo: corpo.body },
      );
      // 201: o comunicado passou a existir, e ele tem endereco proprio na
      // listagem. O teto diario sobe como 409 de dentro do servico.
      return reply.status(201).send(comoResposta(comunicado));
    },
  );
}
