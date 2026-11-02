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
  /**
   * 01/11/2026: era `challenge`. Sem verificador do desafio, `challenge`
   * degenera em recusa (ADR-0020, camada 2) — e recusa em leitura pública é
   * porta fechada em quem não atacou nada. `ip` é FAIXA /24, e não endereço.
   * OBSERVA até o cliente decidir; nota de 01/11/2026 em `api/openapi.yaml`.
   */
  rateLimit: [{ dimension: ['ip'], limit: 60, window: '1h', onExceed: 'log_and_alert' }],
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
