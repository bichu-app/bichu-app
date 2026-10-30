/** `GET /v1/app/version-status` (`getAppVersionStatus`): o veredito de versao. */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { vereditoPara } from '../../application/veredito-de-versao.js';
import type { LeituraDaPoliticaDeVersao, PlataformaDoApp } from '../../ports/politica-de-versao.js';

export const rotaDoVereditoDeVersao = defineRoute({
  operationId: 'getAppVersionStatus',
  method: 'get',
  path: '/app/version-status',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDoVereditoDeVersao {
  readonly politica: LeituraDaPoliticaDeVersao;
}

/** A query string, com os tipos do contrato. */
interface QueryDaVersao {
  readonly platform?: PlataformaDoApp | undefined;
  readonly version?: string | undefined;
}

export function registrarRotaDoVereditoDeVersao(
  app: RegistradorDeRotas,
  deps: DependenciasDoVereditoDeVersao,
): void {
  registrarRota(
    app,
    rotaDoVereditoDeVersao,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      void reply.header('Cache-Control', 'no-store');

      const query = (request.query ?? {}) as QueryDaVersao;
      const plataforma = query.platform;
      if (plataforma === undefined) {
        return reply.status(200).send({ verdict: 'supported', store_url: null });
      }

      const politica = await deps.politica.politicaDe(plataforma);
      const veredito = vereditoPara(query.version, politica);
      return reply
        .status(200)
        .send({ verdict: veredito.verdict, store_url: veredito.storeUrl });
    },
  );
}
