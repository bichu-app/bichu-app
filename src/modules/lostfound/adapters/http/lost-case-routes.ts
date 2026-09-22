/**
 * Rotas do caso de perdido.
 *
 * Três pontos desta fiação que não são detalhe:
 *
 * - **`openLostCase` passa por `executarComIdempotencia`.** O contrato declara
 *   `Idempotency-Key`, e o portão de subida derruba a aplicação se a rota
 *   divergir. O defeito que isso evita é o pior do módulo: a fila offline
 *   reenvia em rajada quando o sinal volta, e sem a máquina cada reenvio seria
 *   um alerta novo para os mesmos vizinhos.
 * - **A conversão de data acontece AQUI**, na borda. A camada de aplicação não
 *   constrói `Date`, e uma data malformada precisa virar `validation-failed`
 *   com o nome do campo antes de chegar ao serviço.
 * - **A resposta não tem coordenada.** Nem para o dono: ele já sabe onde o pet
 *   dele sumiu, e o campo só existiria para vazar depois — por um `console.log`
 *   de depuração, por uma captura de tela, por uma rota pública nova que
 *   reaproveite este montador.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { LostCaseService, PreviaDoCaso } from '../../application/lost-case-service.js';
import { centroDe, type CentroDoAlcance } from '../../domain/previa-do-alcance.js';
import type { CasoGravado, DesfechoDoCaso, CanalDoReencontro } from '../../ports/lost-case-repository.js';
import type { AbsoluteUrl, CaseId, Instant, PetId, UserId } from '../../../../shared/types/brands.js';

export const rotaDeAberturaDeCaso = defineRoute({
  operationId: 'openLostCase',
  method: 'post',
  path: '/pets/:petId/lost-cases',
  effects: ['notifies', 'expensive_query', 'human_work'],
  rateLimit: [
    // **O CASO SEMPRE ABRE.** O que é retido acima do teto é o DISPARO do
    // alerta, nunca a criação: portão aberto com três cães na casa e um evento
    // é acidente, não abuso, e recusar o terceiro caso seria o produto falhando
    // exatamente no dia em que ele existe para funcionar.
    { dimension: ['account'], limit: 5, window: '24h', onExceed: 'accept_and_defer_dispatch' },
    { dimension: ['account'], limit: 20, window: '24h', onExceed: 'hold_for_review' },
  ],
});

/**
 * A prévia do alcance (`previewLostCaseReach`, F3.2).
 *
 * **Os dois tetos são os do contrato, copiados dele e não escolhidos aqui.** A
 * operação declara `x-effects: [expensive_query]`, e com efeito não vazio
 * `defineRoute` torna a ausência de `rateLimit` erro de compilação. As duas
 * dimensões são específicas (`account` e `pet`), então `registrarRota` exige um
 * resolvedor para cada uma — também por tipo, também sem chance de esquecer.
 *
 * Por que `account` é a dimensão que RECUSA, e o que ela protege:
 *
 * - A rota é autenticada, então `account` existe e é exata. Teto por `ip` seria
 *   armadilha no Brasil, onde o CGNAT das operadoras põe muita gente atrás de
 *   poucos endereços: ele pegaria vizinhos inocentes e erraria o abusador.
 * - O que se protege é uma **consulta geoespacial de 5 km** sobre índice GiST,
 *   disparada por uma tela que a pessoa reabre enquanto decide. Trinta por hora
 *   cobre o uso legítimo mais folgado — abrir, fechar, voltar, tentar com outra
 *   posição — e ainda impede uma conta de virar gerador de carga no caminho mais
 *   caro do produto.
 * - `pet` com `serve_cache` **não recusa**: só `deny_429` recusa
 *   (`aplicacao-de-teto.ts`). Ele conta e alerta, e está aqui porque o contrato
 *   o declara — não porque a rota o tenha inventado.
 */
export const rotaDePreviaDoCaso = defineRoute({
  operationId: 'previewLostCaseReach',
  method: 'get',
  path: '/pets/:petId/lost-case-preview',
  effects: ['expensive_query'],
  rateLimit: [
    { dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' },
    { dimension: ['pet'], limit: 10, window: '1h', onExceed: 'serve_cache' },
  ],
});

export const rotaDoCaso = defineRoute({
  operationId: 'getLostCase',
  method: 'get',
  path: '/lost-cases/:caseId',
  effects: [],
});

export const rotaDeEncerramento = defineRoute({
  operationId: 'closeLostCase',
  method: 'post',
  path: '/lost-cases/:caseId/close',
  effects: ['notifies'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeCaso {
  readonly casos: LostCaseService;
  readonly autenticador: Autenticador;
  readonly idempotencia: Idempotencia;
  readonly contrato: Contrato;
  readonly clock: Clock;
  /** Base das páginas públicas: de onde saem o link de compartilhar e o cartaz. */
  readonly baseDaWeb: AbsoluteUrl;
}

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        `no contrato, mas a rota espera um. Corrija a especificação, não o código.`,
    );
  }
  return schema;
}

/**
 * O `petId` do caminho, ou `undefined` quando ele não veio utilizável.
 *
 * Devolve `undefined` em vez de lançar porque ele é lido em DOIS lugares com
 * significados diferentes: no resolvedor do teto, onde ausência significa "esta
 * entrada não se aplica e é pulada", e no handler, onde ela vira 404. Um
 * lançamento aqui recusaria a requisição de dentro de um gancho de teto, que é
 * o lugar errado para decidir isso.
 */
function petIdDoCaminho(request: FastifyRequest): PetId | undefined {
  const { petId } = request.params as { petId?: unknown };
  if (typeof petId !== 'string' || petId === '') return undefined;
  return petId as PetId;
}

/** MEMOIZADA: o teto por `account` e o handler precisam do mesmo dono. */
function donoAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeCaso,
): Promise<{ userId: UserId; correlationId: string; ip: string | undefined }> {
  return memoDaRequisicao(request, 'lostfound:dono', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId, correlationId: request.id, ip: request.ip };
  });
}

/**
 * `account` para o teto de abertura de caso.
 *
 * As duas entradas desta rota são `accept_and_defer_dispatch` e
 * `hold_for_review`, e **nenhuma das duas recusa**: o caso sempre abre. Estourar
 * o teto aqui registra e alerta, e é assim de propósito — portão aberto com três
 * cães e um evento é acidente, não abuso.
 */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeCaso,
): Promise<string | undefined> {
  try {
    return (await donoAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

/**
 * A data de "visto pela última vez", vinda como ISO.
 *
 * Recusa o que não é data E o que está no futuro: "visto pela última vez amanhã"
 * é erro de digitação ou de fuso, e gravado assim ele ordena a lista pública
 * errado e o cartaz sai com uma data que não aconteceu.
 */
function instanteDeVistoPorUltimo(bruto: unknown, agora: Instant): Instant {
  const ms = typeof bruto === 'string' ? Date.parse(bruto) : Number.NaN;
  if (Number.isNaN(ms)) {
    throw problemas.validacao([
      { field: 'last_seen_at', code: 'invalid', message: 'Data inválida.' },
    ]);
  }
  // Um minuto de folga para relógio de aparelho adiantado, que é comum.
  if (ms > Number(agora) + 60_000) {
    throw problemas.validacao([
      { field: 'last_seen_at', code: 'in_future', message: 'Essa data ainda não chegou.' },
    ]);
  }
  return ms as Instant;
}

function comoRespostaDoCaso(caso: CasoGravado, baseDaWeb: AbsoluteUrl): Record<string, unknown> {
  const base = baseDaWeb.replace(/\/$/, '');
  return {
    id: caso.id,
    pet_id: caso.petId,
    status: caso.status,
    opened_at: caso.openedAt.toISOString(),
    last_seen_at: caso.lastSeenAt.toISOString(),
    area_label: caso.areaLabel,
    // Falso quando o caso nasceu só com área. A tela usa isto para explicar por
    // que não houve alerta, em vez de deixar a seção de alcance vazia — que
    // parece defeito e faz a pessoa tocar de novo.
    has_location: caso.hasLocation,
    description: caso.description,
    alert: {
      // Sem worker de alerta nesta entrega. `no_location` e `queued` são os
      // dois valores honestos hoje; inventar `computed` com zero destinatários
      // diria "não há ninguém por perto" quando a verdade é "não calculamos".
      reach_status: caso.hasLocation ? 'queued' : 'no_location',
      recipients_total: null,
      radius_m: 5000,
      dispatched_at: null,
    },
    candidate_count: 0,
    unread_message_count: 0,
    share_url: `${base}/c/${caso.shareToken}`,
    poster_url: `${base}/cartaz/${caso.shareToken}`,
    closed_at: caso.closedAt === null ? null : caso.closedAt.toISOString(),
    resolution:
      caso.closureOutcome === null
        ? null
        : {
            outcome: caso.closureOutcome,
            reunion_channel: caso.closureChannel,
            note: caso.closureNote,
          },
  };
}

/**
 * O centro do raio, vindo da consulta.
 *
 * Validação explícita e não `schema.querystring` por um motivo concreto: o
 * tradutor de erro do servidor transforma `FST_ERR_VALIDATION` num
 * `validation-failed` com `field: ''`, e a tela que precisa dizer "essa posição
 * não parece do Brasil" ficaria sem saber qual dos dois campos recusou.
 *
 * As três recusas, e o que cada uma impede:
 *
 * - **Não é número.** `?lat=abc` viraria `NaN` e `NaN` atravessa comparação sem
 *   ninguém reclamar, virando um centro que o PostGIS recusa lá no fundo.
 * - **Um sem o outro.** Meia coordenada não é meio centro. Aceitá-la faria a
 *   rota escolher em silêncio entre ignorar o que a pessoa mandou e inventar o
 *   que faltou — e a resposta viria `no_location` como se nada tivesse chegado.
 * - **Fora da faixa do contrato.** Os limites são os declarados em
 *   `api/openapi.yaml` (lat de -34 a 6, lon de -74 a -32), que é o retângulo do
 *   Brasil. Coordenada trocada de ordem — o erro mais comum de quem monta a
 *   consulta à mão — cai fora dele e é recusada aqui, e não depois de rodar a
 *   consulta cara sobre um ponto no meio do oceano Índico.
 */
const FAIXA_DE_LATITUDE = { min: -34, max: 6 } as const;
const FAIXA_DE_LONGITUDE = { min: -74, max: -32 } as const;

function numeroDaConsulta(bruto: unknown, campo: string): number | undefined {
  if (bruto === undefined) return undefined;
  if (typeof bruto !== 'string' || bruto.trim() === '') {
    throw problemas.validacao([
      { field: campo, code: 'invalid', message: 'Precisa ser um número.' },
    ]);
  }
  const valor = Number(bruto);
  if (!Number.isFinite(valor)) {
    throw problemas.validacao([
      { field: campo, code: 'invalid', message: 'Precisa ser um número.' },
    ]);
  }
  return valor;
}

function naFaixa(valor: number, faixa: { min: number; max: number }, campo: string): void {
  if (valor < faixa.min || valor > faixa.max) {
    throw problemas.validacao([
      { field: campo, code: 'out_of_range', message: 'Essa posição não parece ser do Brasil.' },
    ]);
  }
}

function centroDaConsulta(request: FastifyRequest): CentroDoAlcance | undefined {
  const { lat: latBruta, lon: lonBruta } = request.query as { lat?: unknown; lon?: unknown };
  const lat = numeroDaConsulta(latBruta, 'lat');
  const lon = numeroDaConsulta(lonBruta, 'lon');

  if (lat === undefined && lon === undefined) return undefined;
  if (lat === undefined || lon === undefined) {
    throw problemas.validacao([
      {
        field: lat === undefined ? 'lat' : 'lon',
        code: 'required',
        message: 'Latitude e longitude vão juntas.',
      },
    ]);
  }

  naFaixa(lat, FAIXA_DE_LATITUDE, 'lat');
  naFaixa(lon, FAIXA_DE_LONGITUDE, 'lon');
  return centroDe(lat, lon);
}

/**
 * `LostCaseReachPreview`, campo a campo como o contrato declara.
 *
 * **Cinco campos, e nenhum a mais.** O que sai daqui não tem `pet_id`, não tem
 * `case_id` e não tem contagem de casos da conta — e a ausência do último é a
 * menos óbvia: o serviço lê `casosAbertosDaConta` para nada nesta rota, e
 * devolvê-lo "porque já está na mão" agruparia os pets do tutor numa resposta
 * que o contrato não declara. O ADR-0010 proíbe o agrupamento no item 7; o
 * portão de contrato, que só procura o que SUMIU, não veria a propriedade a
 * mais.
 */
function comoRespostaDaPrevia(previa: PreviaDoCaso): Record<string, unknown> {
  return {
    reach_status: previa.estadoDoAlcance,
    reachable_tutors: previa.tutoresAlcancaveis,
    radius_m: previa.raioEmMetros,
    area_label: previa.rotuloDaArea,
    blockers: previa.bloqueios,
  };
}

export function registrarRotasDeCasos(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeCaso,
): void {
  registrarRota(
    app,
    rotaDePreviaDoCaso,
    {
      resolvedores: {
        account: (request) => contaDoTeto(request, deps),
        // UUID interno em claro na chave do balde, pelo mesmo motivo declarado
        // em `aplicacao-de-teto.ts`: `rate_limit_counters.bucket_key` não sai em
        // resposta nenhuma, e o resumo tornaria impossível responder qual pet
        // bateu no teto numa investigação. O SEC-010 fala de IP, e o IP desta
        // rota nem chega a virar chave: a dimensão que recusa é `account`.
        pet: (request) => petIdDoCaminho(request),
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const petId = petIdDoCaminho(request);
      if (petId === undefined) throw problemas.naoEncontrado();

      const previa = await deps.casos.previa(petId, centroDaConsulta(request), chamador);
      return reply.status(200).send(comoRespostaDaPrevia(previa));
    },
  );

  registrarRota(
    app,
    rotaDeAberturaDeCaso,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeAberturaDeCaso.operationId) },
      config: { idempotencia: true },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const { petId } = request.params as { petId?: string };
      if (typeof petId !== 'string' || petId === '') throw problemas.naoEncontrado();

      const corpo = request.body as {
        last_seen_at: string;
        last_seen_location?: { lat: number; lon: number };
        last_seen_area?: { city: string; neighborhood?: string; state?: string };
        description?: string;
        share_to_public_list?: boolean;
      };

      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(deps.contrato, rotaDeAberturaDeCaso.operationId),
          chaveDoCabecalho: request.headers['idempotency-key'],
          donoOuToken: chamador.userId,
          endpoint: `${rotaDeAberturaDeCaso.method.toUpperCase()} ${rotaDeAberturaDeCaso.path}`,
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => ({
          status: 201,
          body: comoRespostaDoCaso(
            await deps.casos.abrir(
              petId as PetId,
              {
                lastSeenAt: instanteDeVistoPorUltimo(corpo.last_seen_at, deps.clock.now()),
                lat: corpo.last_seen_location?.lat,
                lon: corpo.last_seen_location?.lon,
                city: corpo.last_seen_area?.city,
                neighborhood: corpo.last_seen_area?.neighborhood,
                state: corpo.last_seen_area?.state,
                description: corpo.description,
                shareToPublicList: corpo.share_to_public_list,
              },
              chamador,
            ),
            deps.baseDaWeb,
          ),
        }),
      );

      return reply.status(resposta.status).send(resposta.body);
    },
  );

  registrarRota(app, rotaDoCaso, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await donoAutenticado(request, deps);
    const { caseId } = request.params as { caseId?: string };
    if (typeof caseId !== 'string' || caseId === '') throw problemas.naoEncontrado();
    const caso = await deps.casos.buscar(caseId as CaseId, chamador);
    return reply.status(200).send(comoRespostaDoCaso(caso, deps.baseDaWeb));
  });

  registrarRota(
    app,
    rotaDeEncerramento,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeEncerramento.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const { caseId } = request.params as { caseId?: string };
      if (typeof caseId !== 'string' || caseId === '') throw problemas.naoEncontrado();

      const corpo = request.body as {
        outcome: DesfechoDoCaso;
        reunion_channel?: CanalDoReencontro;
        note?: string;
      };

      const caso = await deps.casos.encerrar(
        caseId as CaseId,
        corpo.outcome,
        corpo.reunion_channel,
        corpo.note,
        chamador,
      );
      return reply.status(200).send(comoRespostaDoCaso(caso, deps.baseDaWeb));
    },
  );
}
