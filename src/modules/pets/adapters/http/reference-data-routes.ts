/**
 * `GET /v1/public/reference-data` — espécie, raça, porte e cor.
 *
 * Pública, sem conta, cacheável por 24 h. `ETag` é a própria versão do conjunto:
 * a lista só muda por migração, então o revalidador barato existe de graça e o
 * app deixa de rebaixar a mesma carga a cada abertura.
 *
 * A cor sai **rotulada em texto**. Amostra de cor sem nome é adivinhação sob
 * sol e para quem não distingue cores, e é por isso que `label` é obrigatório
 * em todo item e não há campo de valor hexadecimal nesta resposta.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota } from '../../../../shared/http/registrar-rota.js';
import type { ReferenceDataRepository } from '../../ports/reference-data-repository.js';

export const rotaDeDadosDeReferencia = defineRoute({
  operationId: 'getReferenceData',
  method: 'get',
  path: '/public/reference-data',
  // Nenhum efeito fora do processo: é leitura de lista fixa. O teto existe
  // assim mesmo, por decisão da política, e ao estourar serve do cache em vez
  // de recusar — recusar esta rota deixaria o cadastro sem sugestão nenhuma.
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 60, window: '1h', onExceed: 'serve_cache' }],
});

const CACHE_EM_SEGUNDOS = 86_400;

export function registrarRotasDeReferencia(
  app: FastifyInstance,
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

      if (request.headers['if-none-match'] === etag) {
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
