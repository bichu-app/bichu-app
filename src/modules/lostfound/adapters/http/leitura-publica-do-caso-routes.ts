import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { LeituraPublicaDoCasoService } from '../../application/leitura-publica-do-caso.js';
import type { Autenticador } from './lost-case-routes.js';

export const rotaDoCasoPublico = defineRoute({
  operationId: 'getPublicLostCase',
  method: 'get',
  path: '/public/lost-cases/:shareToken',
  effects: [],
  /**
   * 01/11/2026: era `challenge`. Sem verificador do desafio, `challenge`
   * degenera em recusa (ADR-0020, camada 2), e esta é a página que o tutor
   * compartilha para achar o pet: recusar quem abriu o link derruba justamente
   * a divulgação. `ip` é FAIXA /24, e não endereço. OBSERVA até o cliente
   * decidir; nota de 01/11/2026 em `api/openapi.yaml`.
   */
  rateLimit: [{ dimension: ['ip'], limit: 120, window: '1h', onExceed: 'log_and_alert' }],
});

export const rotaDoCartaz = defineRoute({
  operationId: 'getLostCasePoster',
  method: 'get',
  path: '/public/lost-cases/:shareToken/poster',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 60, window: '1h', onExceed: 'serve_cache' }],
});

export interface DependenciasDaLeituraPublicaDoCaso {
  readonly leitura: LeituraPublicaDoCasoService;
  readonly autenticador: Autenticador;
}

function aplicarHigieneDaRotaPublica(reply: FastifyReply): void {
  void reply.header('X-Robots-Tag', 'noindex, nofollow');
  void reply.header('Referrer-Policy', 'no-referrer');
  void reply.header('Cache-Control', 'no-store');
}

function tokenDoCaminho(request: FastifyRequest): string {
  const { shareToken } = request.params as { shareToken?: unknown };
  if (typeof shareToken !== 'string' || shareToken === '') throw problemas.casoPublicoEncerrado();
  return shareToken;
}

async function chamadorOpcional(
  request: FastifyRequest,
  deps: DependenciasDaLeituraPublicaDoCaso,
): Promise<UserId | undefined> {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) return undefined;
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.naoAutenticado();
  return (await deps.autenticador.autenticar(token)).userId;
}

export function registrarRotasDaLeituraPublicaDoCaso(
  app: RegistradorDeRotas,
  deps: DependenciasDaLeituraPublicaDoCaso,
): void {
  registrarRota(app, rotaDoCasoPublico, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    aplicarHigieneDaRotaPublica(reply);
    const shareToken = tokenDoCaminho(request);
    const corpo = await deps.leitura.caso(shareToken, await chamadorOpcional(request, deps));
    return reply.status(200).send(corpo);
  });

  registrarRota(app, rotaDoCartaz, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    aplicarHigieneDaRotaPublica(reply);
    const corpo = await deps.leitura.cartaz(tokenDoCaminho(request));
    return reply.status(200).send(corpo);
  });
}
