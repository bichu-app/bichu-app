import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import { projecaoDoPerfilPublico } from '../../domain/perfil-publico.js';
import type { LeituraDoPerfilPublico } from '../../ports/perfil-publico.js';

export const rotaDoPerfilPublico = defineRoute({
  operationId: 'getPublicPetBySlug',
  method: 'get',
  path: '/public/pets/:slug',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 60, window: '1h', onExceed: 'challenge' }],
});

export interface DependenciasDoPerfilPublico {
  readonly perfis: LeituraDoPerfilPublico;
  /** Onde as derivadas públicas da foto moram. */
  readonly baseDeMidia: AbsoluteUrl;
}

export function registrarRotaDoPerfilPublico(
  app: RegistradorDeRotas,
  deps: DependenciasDoPerfilPublico,
): void {
  registrarRota(app, rotaDoPerfilPublico, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    void reply.header('X-Robots-Tag', 'noindex, nofollow');
    void reply.header('Referrer-Policy', 'no-referrer');
    void reply.header('Cache-Control', 'no-store');

    const { slug } = request.params as { slug?: unknown };
    if (typeof slug !== 'string' || slug === '') throw problemas.naoEncontrado();

    const perfil = await deps.perfis.porSlug(slug);
    if (perfil === undefined) throw problemas.naoEncontrado();
    return reply.status(200).send(projecaoDoPerfilPublico(perfil, deps.baseDeMidia));
  });
}
