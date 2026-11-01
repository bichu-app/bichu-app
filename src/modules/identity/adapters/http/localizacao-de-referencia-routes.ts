import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { comoIso } from '../../../../shared/time/clock.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { LocalizacaoDeReferencia } from '../../domain/localizacao-de-referencia.js';
import { comoFamiliaDeSessao } from '../../ports/localizacao-de-referencia-repository.js';
import type {
  ChamadorDaLocalizacao,
  LocalizacaoDeReferenciaService,
} from '../../application/localizacao-de-referencia-service.js';

export const rotaDaMinhaLocalizacao = defineRoute({
  operationId: 'getMyLocation',
  method: 'get',
  path: '/me/location',
  effects: [],
});

export const rotaDeInformarLocalizacao = defineRoute({
  operationId: 'putMyLocation',
  method: 'put',
  path: '/me/location',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeApagarLocalizacao = defineRoute({
  operationId: 'deleteMyLocation',
  method: 'delete',
  path: '/me/location',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export interface AutenticadorDaLocalizacao {
  /**
   * `sid` é opcional aqui porque é opcional no token: o ADR-0002, emenda 1, seção 2,
   * acrescentou o campo a tokens que já circulavam sem ele, e o verificador aceita
   * os dois — "aceita o token SEM `sid`: é o que já está no aparelho das pessoas".
   */
  autenticar(token: string): Promise<{ userId: UserId; sid?: string | undefined }>;
}

export interface DependenciasDaLocalizacao {
  readonly localizacao: LocalizacaoDeReferenciaService;
  readonly autenticador: AutenticadorDaLocalizacao;
  readonly contrato: Contrato;
}

interface CorpoDaLocalizacao {
  lat: number;
  lon: number;
  source: 'device_gps' | 'map_pin';
}

function comoResposta(localizacao: LocalizacaoDeReferencia): Record<string, unknown> {
  return {
    lat: localizacao.lat,
    lon: localizacao.lon,
    precision_m: localizacao.precisaoEmMetros,
    source: localizacao.origem,
    captured_at: comoIso(localizacao.capturadaEm),
    expires_at: comoIso(localizacao.expiraEm),
  };
}

function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDaLocalizacao,
): Promise<ChamadorDaLocalizacao> {
  return memoDaRequisicao(request, 'localizacao:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId, sid } = await deps.autenticador.autenticar(token);
    if (typeof sid !== 'string' || sid === '') throw problemas.sessaoExpirada();
    return {
      userId,
      familia: comoFamiliaDeSessao(sid),
      correlationId: request.id,
      ip: request.ip,
    };
  });
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDaLocalizacao,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

export function registrarRotasDeLocalizacao(
  app: RegistradorDeRotas,
  deps: DependenciasDaLocalizacao,
): void {
  registrarRota(
    app,
    rotaDaMinhaLocalizacao,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const localizacao = await deps.localizacao.atual(chamador);
      return reply.status(200).send(localizacao === null ? null : comoResposta(localizacao));
    },
  );

  registrarRota(
    app,
    rotaDeInformarLocalizacao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeInformarLocalizacao.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = request.body as CorpoDaLocalizacao;
      const gravada = await deps.localizacao.informar(
        chamador,
        { lat: corpo.lat, lon: corpo.lon },
        corpo.source,
      );
      return reply.status(200).send(comoResposta(gravada));
    },
  );

  registrarRota(
    app,
    rotaDeApagarLocalizacao,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      await deps.localizacao.esquecer(chamador);
      return reply.status(204).send();
    },
  );
}
