/** `GET /v1/public/reference-data` — espécie, raça, porte e cor. */
import { casaIfNoneMatch } from '../../../../shared/http/if-match.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { ReferenceDataRepository } from '../../ports/reference-data-repository.js';

export const rotaDeDadosDeReferencia = defineRoute({
  operationId: 'getReferenceData',
  method: 'get',
  path: '/public/reference-data',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 60, window: '1h', onExceed: 'serve_cache' }],
});

const CACHE_EM_SEGUNDOS = 86_400;

export function registrarRotasDeReferencia(
  app: RegistradorDeRotas,
  repositorio: ReferenceDataRepository,
): void {
  registrarRota(
    app,
    rotaDeDadosDeReferencia,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dados = await repositorio.carregar();
      const etag = `"${dados.version}"`;

      void reply.header('Cache-Control', `public, max-age=${CACHE_EM_SEGUNDOS}`);
      void reply.header('ETag', etag);

      if (casaIfNoneMatch(request.headers['if-none-match'], etag)) {
        return reply.status(304).send();
      }

      return reply.send({
        version: dados.version,
        species: dados.species.map((item) => ({ code: item.code, label: item.label })),
        breeds: dados.breeds.map((item) => ({
          code: item.code,
          label: item.label,
          species: item.species,
        })),
        colors: dados.colors.map((item) => ({ code: item.code, label: item.label })),
        sizes: dados.sizes.map((item) => ({
          code: item.code,
          label: item.label,
          weight_hint: item.weightHint,
        })),
      });
    },
  );
}
