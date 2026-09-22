/**
 * As três rotas de `/v1/me/location`.
 *
 * O contrato já as declarava antes desta história; o que faltava era a coluna e
 * a fiação. `effects`, `rateLimit` e `operationId` **espelham**
 * `api/openapi.yaml`, e nada no contrato mudou — o `oasdiff` não tem o que
 * comparar aqui, e essa é a forma certa de entregar quando a especificação já é
 * a fonte.
 *
 * Quatro decisões que não são detalhe de fiação:
 *
 * - **O corpo é validado pelo schema da própria especificação** (`corpoDe`).
 *   `UserLocationInput` já limita a caixa do Brasil (`lat` de -34 a 6, `lon` de
 *   -74 a -32) e fecha `source` em dois valores. Escrever a mesma validação à
 *   mão criaria a segunda definição, que diverge na primeira mudança. A caixa
 *   não é higiene teórica: sem ela, um `lat` de 51 grava Londres e entra na
 *   consulta de raio de um caso aberto em Recife.
 * - **A resposta é montada campo a campo**, nunca por espalhamento do objeto do
 *   domínio. `LocalizacaoDeReferencia` carrega hoje seis campos e amanhã o que
 *   o domínio precisar; um `...localizacao` publicaria cada campo novo por
 *   omissão, e é exatamente assim que uma coordenada mais precisa vazaria sem
 *   ninguém ter decidido nada.
 * - **`GET` devolve `null` e não 404** quando não há localização válida. O
 *   contrato declara `UserLocation` como `nullable`, e os dois casos que caem
 *   nesse `null` — nunca informou, e informou e venceu — são estados normais da
 *   conta, não recurso ausente. A tela distingue os dois pelo texto que os
 *   critérios 7 e 8 já escrevem.
 * - **Nenhuma rota aqui é pública.** As três exigem `bearerAuth`, e o dono do
 *   token é o único `user_id` que chega ao `WHERE`. É o que sustenta o critério
 *   11 ("nenhuma coordenada de nenhum usuário é devolvida a outro usuário"):
 *   não há caminho de código que receba um id de terceiro.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import { comoIso } from '../../../../shared/time/clock.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { LocalizacaoDeReferencia } from '../../domain/localizacao-de-referencia.js';
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
  autenticar(token: string): Promise<{ userId: UserId }>;
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

/**
 * A resposta, campo a campo, exatamente como `UserLocation` a declara.
 *
 * `lat` e `lon` aqui são os **quantizados**, porque é o que o domínio devolve e
 * é o que o banco guarda. Não existe caminho neste arquivo que alcance a
 * coordenada bruta: ela morre no corpo da requisição.
 */
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

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        `no contrato, mas a rota espera um. Corrija a especificação, não o código.`,
    );
  }
  return schema;
}

/**
 * MEMOIZADA por requisição, pelo mesmo motivo das rotas de pet: o teto por
 * `account` precisa do dono antes do handler, e o handler precisa do mesmo
 * dono. Sem a memória, cada `PUT` verificaria RS256 e leria `users` duas vezes.
 */
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
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId, correlationId: request.id, ip: request.ip };
  });
}

/**
 * `account` para o teto. Quem não apresentou credencial válida não tem balde de
 * conta — a recusa dele é o 401 do handler, e não um 429 que confundiria "sem
 * sessão" com "chamou demais".
 */
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
      // `null` e não 404: ver o cabeçalho do arquivo.
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
