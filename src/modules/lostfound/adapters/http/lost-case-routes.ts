/** Rotas do caso de perdido. */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { corpoSemPadroes } from '../../../../shared/http/sem-padroes.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type {
  CasoComAlerta,
  LostCaseService,
  PreviaDoCaso,
} from '../../application/lost-case-service.js';
import {
  decodificarCursorDeCandidato,
  limiteEfetivoDeCandidatos,
} from '../../domain/paginacao-de-candidatos.js';
import {
  centroDe,
  RAIO_DO_ALERTA_EM_METROS,
  type CentroDoAlcance,
} from '../../domain/previa-do-alcance.js';
import { rotuloDaArea } from '../../domain/abertura-do-caso.js';
import { linksDoCaso } from '../../domain/projecao-publica-do-caso.js';
import type { DisponibilidadeDaPagina } from '../../ports/disponibilidade-da-pagina.js';
import type { DisparoGravado } from '../../ports/registro-de-disparos.js';
import type {
  CandidatoDoCaso,
  CasoGravado,
  DecisaoDoCandidato,
  DesfechoDoCaso,
  CanalDoReencontro,
  PaginaDeCandidatos,
} from '../../ports/lost-case-repository.js';
import type { AbsoluteUrl, CaseId, Instant, PetId, UserId } from '../../../../shared/types/brands.js';

export const rotaDeAberturaDeCaso = defineRoute({
  operationId: 'openLostCase',
  method: 'post',
  path: '/pets/:petId/lost-cases',
  effects: ['notifies', 'expensive_query', 'human_work'],
  rateLimit: [
    { dimension: ['account'], limit: 5, window: '24h', onExceed: 'accept_and_defer_dispatch' },
    { dimension: ['account'], limit: 20, window: '24h', onExceed: 'hold_for_review' },
  ],
});

/** A prévia do alcance (`previewLostCaseReach`, F3.2). */
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

/** A correção de onde e quando (`updateLostCase`). */
export const rotaDeAtualizacaoDoCaso = defineRoute({
  operationId: 'updateLostCase',
  method: 'patch',
  path: '/lost-cases/:caseId',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/** O reenvio do alerta (`resendLostCaseAlert`). */
export const rotaDeReenvioDoAlerta = defineRoute({
  operationId: 'resendLostCaseAlert',
  method: 'post',
  path: '/lost-cases/:caseId/alerts',
  effects: ['notifies', 'expensive_query'],
  rateLimit: [{ dimension: ['case'], limit: 1, window: '24h', onExceed: 'deny_429' }],
});

/** A lista de correspondências (`listLostCaseCandidates`). */
export const rotaDeCandidatosDoCaso = defineRoute({
  operationId: 'listLostCaseCandidates',
  method: 'get',
  path: '/lost-cases/:caseId/candidates',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 120, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeEncerramento = defineRoute({
  operationId: 'closeLostCase',
  method: 'post',
  path: '/lost-cases/:caseId/close',
  effects: ['notifies'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/** A REABERTURA do caso encerrado por engano (`reopenLostCase`). */
export const rotaDeReabertura = defineRoute({
  operationId: 'reopenLostCase',
  method: 'post',
  path: '/lost-cases/:caseId/reopen',
  effects: ['notifies'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/** A decisão humana sobre uma correspondência (BICHUS-86, critérios 4, 5 e 12). */
export const rotaDaDecisaoDoCandidato = defineRoute({
  operationId: 'decideLostCaseCandidate',
  method: 'post',
  path: '/lost-cases/:caseId/candidates/:candidateId/decision',
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
  /** O interruptor das páginas públicas do site (`site_page_availability`). */
  readonly paginas: DisponibilidadeDaPagina;
}

/** O `petId` do caminho, ou `undefined` quando ele não veio utilizável. */
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

/** `account` para o teto de abertura de caso. */
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

/** A data de "visto pela última vez", vinda como ISO. */
function instanteDeVistoPorUltimo(bruto: unknown, agora: Instant): Instant {
  const ms = typeof bruto === 'string' ? Date.parse(bruto) : Number.NaN;
  if (Number.isNaN(ms)) {
    throw problemas.validacao([
      { field: 'last_seen_at', code: 'invalid', message: 'Data inválida.' },
    ]);
  }
  if (ms > Number(agora) + 60_000) {
    throw problemas.validacao([
      { field: 'last_seen_at', code: 'in_future', message: 'Essa data ainda não chegou.' },
    ]);
  }
  return ms as Instant;
}

/** O `caseId` do caminho, ou `undefined` quando ele não veio utilizável. */
function caseIdDoCaminho(request: FastifyRequest): CaseId | undefined {
  const { caseId } = request.params as { caseId?: unknown };
  if (typeof caseId !== 'string' || caseId === '') return undefined;
  return caseId as CaseId;
}

/** A janela da lista de candidatos. */
function paginaDeCandidatosDaQuery(request: FastifyRequest): PaginaDeCandidatos {
  const { cursor, limit } = request.query as { cursor?: string; limit?: number | string };
  const posicao = decodificarCursorDeCandidato(cursor);
  return {
    limit: limiteEfetivoDeCandidatos(limit === undefined ? undefined : Number(limit)),
    ...(posicao === undefined ? { depoisDe: undefined } : { depoisDe: posicao }),
  };
}

/** `AlertDispatch`, a partir da linha do disparo. */
function comoRespostaDoAlerta(
  caso: CasoGravado,
  alerta: DisparoGravado | null,
): Record<string, unknown> {
  if (alerta === null) {
    return {
      reach_status: caso.hasLocation ? 'queued' : 'no_location',
      recipients_total: null,
      radius_m: RAIO_DO_ALERTA_EM_METROS,
      dispatched_at: null,
    };
  }
  return {
    reach_status: alerta.estado,
    recipients_total: alerta.destinatarios,
    radius_m: alerta.raioEmMetros,
    dispatched_at: alerta.enviadoEm === null ? null : alerta.enviadoEm.toISOString(),
  };
}

/** Quais endereços públicos deste caso podem SAIR na resposta. */
interface LinksQuePodemSair {
  readonly caso: boolean;
  readonly cartaz: boolean;
}

/** O corpo de `LostCase`, lendo o interruptor das páginas antes de montá-lo. */
async function corpoDoCaso(
  deps: DependenciasDasRotasDeCaso,
  casoComAlerta: CasoComAlerta,
): Promise<Record<string, unknown>> {
  const [caso, cartaz] = await Promise.all([
    deps.paginas.estaPublicada('lost_case'),
    deps.paginas.estaPublicada('poster'),
  ]);
  return comoRespostaDoCaso(casoComAlerta, deps.baseDaWeb, { caso, cartaz });
}

function comoRespostaDoCaso(
  { caso, alerta }: CasoComAlerta,
  baseDaWeb: AbsoluteUrl,
  publicados: LinksQuePodemSair,
): Record<string, unknown> {
  const links = linksDoCaso(baseDaWeb, caso.shareToken);
  return {
    id: caso.id,
    pet_id: caso.petId,
    status: caso.status,
    opened_at: caso.openedAt.toISOString(),
    last_seen_at: caso.lastSeenAt.toISOString(),
    area_label: caso.areaLabel,
    has_location: caso.hasLocation,
    description: caso.description,
    alert: comoRespostaDoAlerta(caso, alerta),
    candidate_count: 0,
    unread_message_count: 0,
    ...(publicados.caso ? { share_url: links.shareUrl } : {}),
    ...(publicados.cartaz ? { poster_url: links.posterUrl } : {}),
    reopen_deadline: caso.reopenDeadline === null ? null : caso.reopenDeadline.toISOString(),
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

/** O centro do raio, vindo da consulta. */
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

/** `LostCaseReachPreview`, campo a campo como o contrato declara. */
function comoRespostaDaPrevia(previa: PreviaDoCaso): Record<string, unknown> {
  return {
    reach_status: previa.estadoDoAlcance,
    reachable_tutors: previa.tutoresAlcancaveis,
    radius_m: previa.raioEmMetros,
    area_label: previa.rotuloDaArea,
    blockers: previa.bloqueios,
  };
}

/** `MatchCandidate`, campo a campo como o contrato declara. */
function comoRespostaDoCandidato(candidato: CandidatoDoCaso): Record<string, unknown> {
  return {
    id: candidato.id,
    found_report: {
      id: candidato.achado.id,
      origin: candidato.achado.origin,
      status: candidato.achado.status,
      ...(candidato.achado.especie === null ? {} : { species: candidato.achado.especie }),
      ...(candidato.achado.porte === null ? {} : { size: candidato.achado.porte }),
      area_label: rotuloDaArea({
        city: candidato.achado.cidade ?? undefined,
        neighborhood: candidato.achado.bairro ?? undefined,
      }),
      found_at: candidato.achado.achadoEm.toISOString(),
      photo_url: null,
      notes: candidato.achado.observacao,
      conversation_id: null,
      created_at: candidato.achado.criadoEm.toISOString(),
    },
    score: candidato.score,
    matched_attributes: candidato.atributosQuePontuaram,
    distance_m: candidato.distanciaEmMetros,
    link_origin: candidato.linkOrigin,
    strategy_version: candidato.versaoDaEstrategia,
    status: candidato.status,
    created_at: candidato.criadoEm.toISOString(),
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
          parametrosDeCaminho: { petId },
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => ({
          status: 201,
          body: await corpoDoCaso(
            deps,
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
    return reply.status(200).send(await corpoDoCaso(deps, caso));
  });

  /** `PATCH /v1/lost-cases/:caseId`. */
  registrarRota(
    app,
    rotaDeAtualizacaoDoCaso,
    {
      schema: {
        body: corpoSemPadroes(corpoDe(deps.contrato, rotaDeAtualizacaoDoCaso.operationId)),
      },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const caseId = caseIdDoCaminho(request);
      if (caseId === undefined) throw problemas.naoEncontrado();

      const corpo = request.body as {
        last_seen_at: string;
        last_seen_location?: { lat: number; lon: number };
        last_seen_area?: { city: string; neighborhood?: string; state?: string };
        description?: string;
        share_to_public_list?: boolean;
      };

      const caso = await deps.casos.atualizar(
        caseId,
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
      );
      return reply.status(200).send(await corpoDoCaso(deps, caso));
    },
  );

  /** `POST /v1/lost-cases/:caseId/alerts` — 202, e não 201. */
  registrarRota(
    app,
    rotaDeReenvioDoAlerta,
    {
      resolvedores: {
        case: (request) => caseIdDoCaminho(request),
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const caseId = caseIdDoCaminho(request);
      if (caseId === undefined) throw problemas.naoEncontrado();

      const disparo = await deps.casos.reenviarAlerta(caseId, chamador);
      return reply.status(202).send({
        reach_status: disparo.estado,
        recipients_total: disparo.destinatarios,
        radius_m: disparo.raioEmMetros,
        dispatched_at: disparo.enviadoEm === null ? null : disparo.enviadoEm.toISOString(),
      });
    },
  );

  /** `GET /v1/lost-cases/:caseId/candidates` — a lista que faltava. */
  registrarRota(
    app,
    rotaDeCandidatosDoCaso,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const caseId = caseIdDoCaminho(request);
      if (caseId === undefined) throw problemas.naoEncontrado();

      const pagina = await deps.casos.candidatos(
        caseId,
        chamador,
        paginaDeCandidatosDaQuery(request),
      );
      return reply.status(200).send({
        items: pagina.items.map(comoRespostaDoCandidato),
        next_cursor: pagina.nextCursor,
      });
    },
  );

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
      return reply.status(200).send(await corpoDoCaso(deps, caso));
    },
  );

  /** `POST /v1/lost-cases/:caseId/reopen` — o desfazer do encerramento. */
  registrarRota(
    app,
    rotaDeReabertura,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const caseId = caseIdDoCaminho(request);
      if (caseId === undefined) throw problemas.naoEncontrado();

      const caso = await deps.casos.reabrir(caseId, chamador);
      return reply.status(200).send(await corpoDoCaso(deps, caso));
    },
  );

  registrarRota(
    app,
    rotaDaDecisaoDoCandidato,
    {
      schema: { body: corpoDe(deps.contrato, rotaDaDecisaoDoCandidato.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const { caseId, candidateId } = request.params as {
        caseId?: string;
        candidateId?: string;
      };
      if (typeof caseId !== 'string' || caseId === '') throw problemas.naoEncontrado();
      if (typeof candidateId !== 'string' || candidateId === '') {
        throw problemas.naoEncontrado();
      }

      const corpo = request.body as { decision: DecisaoDoCandidato };
      const decidido = await deps.casos.decidirCandidato(
        caseId as CaseId,
        candidateId,
        corpo.decision,
        chamador,
      );
      return reply.status(200).send(comoRespostaDoCandidato(decidido));
    },
  );
}
