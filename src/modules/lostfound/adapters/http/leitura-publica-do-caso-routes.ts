/**
 * Rotas públicas do caso, pelo `share_token` (BICHUS-76): a página do caso
 * (`getPublicLostCase`) e o cartaz (`getLostCasePoster`). São as operações que o
 * site consome em `/p/{shareToken}` e `/cartaz/{shareToken}` (ADR-0024), e a
 * primeira é também o destino do toque no push do alerta.
 *
 * Três pontos desta fiação que não são detalhe:
 *
 * - **Os tetos são os do contrato, copiados dele.** Nenhuma das duas declara
 *   efeito, então o teto não é obrigatório por tipo; ele está aqui porque o
 *   contrato o declara, e `rotas-registradas-contra-o-contrato.test.ts` compara
 *   entrada por entrada. A dimensão é só `ip`, que o registro resolve sozinho.
 * - **Autenticação opcional só na página do caso.** O token de acesso serve para
 *   uma coisa: saber se quem chama é o tutor, e esconder dele o botão "vi este
 *   pet". Token presente e inválido RECUSA, pela mesma razão da rota da tag
 *   (`tag-routes.ts`, `chamadorOpcional`): rebaixar para anônimo esconderia do
 *   app que a sessão acabou. O cartaz ignora o cabeçalho, porque o papel é igual
 *   para todo mundo.
 * - **`Cache-Control: no-store` nas duas.** A página varia com quem chama, e um
 *   cache compartilhado que guardasse a versão do tutor serviria
 *   `can_report_sighting: false` ao vizinho. O cache de 60 s do ADR-0024 é do
 *   site, sobre o HTML que ele monta, e não desta resposta.
 */
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
  rateLimit: [{ dimension: ['ip'], limit: 120, window: '1h', onExceed: 'challenge' }],
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

/**
 * O token do caminho. Ausente vira o mesmo 410 do token desconhecido: as duas
 * operações não declaram 404, e segmento vazio é só mais um token que não leva
 * a caso nenhum.
 */
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
