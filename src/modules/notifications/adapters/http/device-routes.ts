/**
 * As três rotas de `/v1/me/devices`.
 *
 * O contrato já as declarava antes desta história; o que faltava era a tabela e
 * a fiação. `effects`, `rateLimit` e `operationId` **espelham**
 * `api/openapi.yaml`.
 *
 * Quatro decisões que não são detalhe de fiação:
 *
 * - **A resposta é montada campo a campo**, nunca por espalhamento do objeto do
 *   domínio. É a única coisa que separa `push_token` do fio: `Aparelho` carrega
 *   o token porque o predicado de elegibilidade precisa dele, e um
 *   `...aparelho` publicaria a credencial de entrega de alguém na primeira vez
 *   que alguém achasse o espalhamento mais curto. `token-de-push-nao-vaza.test.ts`
 *   cobra isso pelo contrato e por este arquivo, com isca.
 * - **O corpo é validado pelo schema da própria especificação** (`corpoDe`).
 *   `DeviceRegistration` já fecha `platform` e `push_permission` em enumerações
 *   e limita o token a 512 caracteres. Escrever a mesma validação à mão criaria
 *   a segunda definição, que diverge na primeira mudança.
 * - **Nenhuma rota aqui é pública.** As três exigem `bearerAuth`, e o dono do
 *   token é o único `user_id` que chega ao `WHERE`. Não há caminho de código
 *   que receba o identificador de conta de um terceiro.
 * - **`DELETE` responde 404 e nunca 403** (ADR-0021). O serviço devolve
 *   `false` tanto para "não existe" quanto para "existe e é de outra conta",
 *   porque a segunda nunca chega a ser lida: o dono está no `WHERE`.
 *
 * ## Por que estas rotas moram em `notifications` e não em `identity`
 *
 * O caminho é `/me`, o que sugere `identity` — e a BICHUS-92 pôs a localização
 * lá com esse argumento. Aqui ele não vale: o que esta tabela guarda é o
 * **endereço de entrega do push**, e quem o consome é o alerta. Deixá-la em
 * `identity` obrigaria `notifications` a importar de `identity/ports` para
 * saber para onde mandar, invertendo a dependência — e a porta do envio
 * (`push-sender.ts`) já mora aqui pela mesma regra do §6: a porta é declarada
 * pelo módulo que a exige. O autenticador chega injetado, como em `tags`, e é
 * `api.ts` o único lugar que conhece os dois lados.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import { comoIso } from '../../../../shared/time/clock.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { Aparelho } from '../../domain/aparelho.js';
import type {
  ChamadorDoAparelho,
  RegistroDeAparelhosService,
} from '../../application/registro-de-aparelhos-service.js';

export const rotaDeListarAparelhos = defineRoute({
  operationId: 'listDevices',
  method: 'get',
  path: '/me/devices',
  effects: [],
});

export const rotaDeRegistrarAparelho = defineRoute({
  operationId: 'registerDevice',
  method: 'post',
  path: '/me/devices',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeRemoverAparelho = defineRoute({
  operationId: 'deleteDevice',
  method: 'delete',
  path: '/me/devices/:deviceId',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export interface AutenticadorDoAparelho {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeAparelho {
  readonly aparelhos: RegistroDeAparelhosService;
  readonly autenticador: AutenticadorDoAparelho;
  readonly contrato: Contrato;
}

interface CorpoDoRegistro {
  platform: 'android' | 'ios';
  push_token?: string | null;
  push_permission: 'granted' | 'denied' | 'not_asked';
  app_version?: string;
  os_version?: string;
}

/**
 * A resposta, campo a campo, exatamente como `Device` a declara.
 *
 * **Os campos que NÃO estão aqui são a parte que importa:** `push_token` (a
 * credencial de entrega) e `os_version` (que o contrato não declara na
 * resposta). Um `...aparelho` publicaria os dois, e o segundo é o aviso de que
 * o primeiro aconteceria — quem acrescenta um campo ao domínio não pensa na
 * borda, e por isso a borda não pode ser transparente.
 */
function comoResposta(aparelho: Aparelho): Record<string, unknown> {
  return {
    id: aparelho.id,
    platform: aparelho.plataforma,
    push_permission: aparelho.permissao,
    ...(aparelho.versaoDoApp === null ? {} : { app_version: aparelho.versaoDoApp }),
    last_seen_at: comoIso(aparelho.vistoEm),
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
 * MEMOIZADA por requisição, pelo mesmo motivo das rotas de localização: o teto
 * por `account` precisa do dono antes do handler, e o handler precisa do mesmo
 * dono. Sem a memória, cada `POST` verificaria RS256 e leria `users` duas vezes.
 */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeAparelho,
): Promise<ChamadorDoAparelho> {
  return memoDaRequisicao(request, 'aparelhos:chamador', async () => {
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
  deps: DependenciasDasRotasDeAparelho,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

/**
 * Campo opcional de texto do corpo, como o domínio o quer.
 *
 * O contrato declara `app_version` e `os_version` como opcionais; o domínio e a
 * coluna os querem como `null`. Converter num lugar só evita que metade do
 * código escreva `undefined` no banco e a outra metade `''`.
 */
function textoOuNulo(valor: string | undefined): string | null {
  return valor === undefined || valor === '' ? null : valor;
}

export function registrarRotasDeAparelho(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeAparelho,
): void {
  registrarRota(app, rotaDeListarAparelhos, {}, async (request, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const aparelhos = await deps.aparelhos.listar(chamador);
    return reply.status(200).send({ items: aparelhos.map(comoResposta) });
  });

  registrarRota(
    app,
    rotaDeRegistrarAparelho,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeRegistrarAparelho.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = request.body as CorpoDoRegistro;
      const aparelho = await deps.aparelhos.registrar(chamador, {
        plataforma: corpo.platform,
        // `?? null` cobre os dois jeitos de o contrato dizer "sem token": campo
        // ausente e `null` explícito. O app manda o primeiro na antessala e o
        // segundo quando o token expira sem ser renovado.
        pushToken: corpo.push_token ?? null,
        permissao: corpo.push_permission,
        versaoDoApp: textoOuNulo(corpo.app_version),
        versaoDoSistema: textoOuNulo(corpo.os_version),
      });
      // 200 e não 201: a operação é idempotente pelo token e o contrato declara
      // só `200`. Um 201 no primeiro registro e 200 nos seguintes obrigaria o
      // app a distinguir dois caminhos que fazem a mesma coisa.
      return reply.status(200).send(comoResposta(aparelho));
    },
  );

  registrarRota(
    app,
    rotaDeRemoverAparelho,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      // `deviceId` já chegou validado como UUID: `vigiarParametrosDasRotas`
      // instala `schema.params` a partir do contrato, e por isso a operação
      // precisa declarar 400 — malformado nunca chega até aqui.
      const { deviceId } = request.params as { deviceId: string };
      const removido = await deps.aparelhos.remover(chamador, deviceId);
      // 404 e nunca 403: ver o cabeçalho do arquivo.
      if (!removido) throw problemas.naoEncontrado();
      return reply.status(204).send();
    },
  );
}
