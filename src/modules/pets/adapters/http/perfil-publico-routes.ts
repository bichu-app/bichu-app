/**
 * `GET /v1/public/pets/{slug}` (`getPublicPetBySlug`, BICHUS-45): o perfil
 * público do pet, que o site consome em `/@{slug}` (ADR-0028).
 *
 * - **404 para os quatro casos, com o mesmo corpo:** slug inexistente, perfil
 *   desligado (o contrato manda), pet excluído e pet falecido ou arquivado. Quem
 *   decide é o `WHERE` do adaptador; aqui só se traduz ausência em 404.
 * - **O 301 de slug trocado não existe nesta entrega.** O contrato o declara, e
 *   não há onde o slug anterior esteja guardado: `pets.slug` é uma coluna só, e
 *   `updatePetPublicProfile`, a única operação que trocaria o slug, também não
 *   está implementada. Sem histórico, a rota não tem de onde tirar o `Location`.
 *   A divergência está registrada na entrega.
 * - **O teto é o do contrato**, `ip` 60/1h com `challenge`, e a dimensão `ip`
 *   o registro resolve sozinho.
 * - **Sem autenticação.** O contrato declara `security: []`, e o perfil é o
 *   mesmo para qualquer pessoa.
 */
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
  /** Onde as derivadas públicas da foto moram. O banco guarda só a chave. */
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
