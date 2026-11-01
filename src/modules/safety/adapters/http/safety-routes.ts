import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { AlvoDaDenuncia } from '../../domain/motivos-da-denuncia.js';
import { O_QUE_O_DENUNCIANTE_RECEBE } from '../../domain/o-denunciado-nao-e-avisado.js';
import { comoIso } from '../../../../shared/time/clock.js';
import type { PessoaQueEuBloqueei } from '../../ports/safety-repository.js';
import type { AutorDoAto, SegurancaDaComunidade } from '../../application/seguranca-da-comunidade.js';

export interface DependenciasDasRotasDeSeguranca {
  readonly seguranca: SegurancaDaComunidade;
  readonly autenticador: { autenticar(token: string): Promise<{ userId: UserId }> };
}

/** **A LISTA DE QUEM EU BLOQUEEI** (19/10/2026), e é a ÚNICA leitura da fatia. */
export const rotaDeQuemEuBloqueei = defineRoute({
  operationId: 'listMyBlocks',
  method: 'get',
  path: '/me/blocks',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

/** **60 por dia**, e o teto é generoso de propósito. */
export const rotaDeBloquear = defineRoute({
  operationId: 'blockUser',
  method: 'post',
  path: '/users/:userRef/blocks',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '24h', onExceed: 'deny_429' }],
});

export const rotaDeDesbloquear = defineRoute({
  operationId: 'unblockUser',
  method: 'delete',
  path: '/users/:userRef/blocks',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '24h', onExceed: 'deny_429' }],
});

/** Denúncia de PERFIL: **5 por dia**, e é o teto mais apertado dos três. */
export const rotaDeDenunciarPerfil = defineRoute({
  operationId: 'reportUserProfile',
  method: 'post',
  path: '/users/:userRef/reports',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' },
    { bucket: 'community_report', dimension: ['account'], limit: 20, window: '24h', onExceed: 'deny_429' },
  ],
});

/**
 * Denúncia de FOTO: só o teto total, e a diferença em relação ao perfil é
 * deliberada — quem abre uma galeria encontra várias fotos de uma vez, e um teto
 * de cinco a faria escolher quais denunciar.
 */
export const rotaDeDenunciarFoto = defineRoute({
  operationId: 'reportPhoto',
  method: 'post',
  path: '/photos/:photoRef/reports',
  effects: [],
  rateLimit: [
    { bucket: 'community_report', dimension: ['account'], limit: 20, window: '24h', onExceed: 'deny_429' },
  ],
});

export const rotaDeDenunciarPublicacao = defineRoute({
  operationId: 'reportPublication',
  method: 'post',
  path: '/publications/:publicationRef/reports',
  effects: [],
  rateLimit: [
    { bucket: 'community_report', dimension: ['account'], limit: 20, window: '24h', onExceed: 'deny_429' },
  ],
});

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

function tokenDaRequisicao(request: FastifyRequest): string | undefined {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) return undefined;
  const token = cabecalho.slice('Bearer '.length).trim();
  return token === '' ? undefined : token;
}

function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeSeguranca,
): Promise<UserId> {
  return memoDaRequisicao(request, 'seguranca:chamador', async () => {
    const token = tokenDaRequisicao(request);
    if (token === undefined) throw problemas.naoAutenticado();
    return (await deps.autenticador.autenticar(token)).userId;
  });
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeSeguranca,
): Promise<string | undefined> {
  try {
    return await chamadorAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

async function autorDoAto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeSeguranca,
): Promise<AutorDoAto> {
  return {
    userId: await chamadorAutenticado(request, deps),
    correlationId: request.id,
    ip: request.ip,
  };
}

const CAMPO_E_CODIGO: Record<AlvoDaDenuncia, { field: string; code: string; message: string }> = {
  profile: {
    field: 'userRef',
    code: 'own_profile',
    message: 'Este perfil é seu. Para mudá-lo, edite os seus dados.',
  },
  photo: {
    field: 'photoRef',
    code: 'own_photo',
    message: 'Esta foto é sua. Para tirá-la do ar, remova-a.',
  },
  publication: {
    field: 'publicationRef',
    code: 'own_publication',
    message: 'Esta publicação é sua. Para tirá-la do ar, apague-a.',
  },
};

const SEM_CACHE = 'private, no-store';

const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 20;

function paginaPedida(request: FastifyRequest): { page: number; limit: number } {
  const consulta = (request.query ?? {}) as Record<string, unknown>;
  const inteiro = (valor: unknown): number | undefined => {
    const n = Number(valor);
    return Number.isInteger(n) && n >= 1 ? n : undefined;
  };
  const limite = inteiro(consulta['limit']) ?? LIMITE_PADRAO;
  return {
    page: inteiro(consulta['page']) ?? 1,
    limit: limite > LIMITE_MAXIMO ? LIMITE_MAXIMO : limite,
  };
}

/** Uma linha como `BlockedPerson` a declara: **QUATRO chaves, e nenhuma quinta**. */
export function comoRespostaDoBloqueio(pessoa: PessoaQueEuBloqueei): Record<string, unknown> {
  return {
    public_ref: pessoa.publicRef,
    handle: pessoa.handle,
    display_name: pessoa.displayName,
    blocked_at: comoIso(pessoa.bloqueadoEm),
  };
}

export function registrarRotasDeSeguranca(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeSeguranca,
): void {
  const porConta = {
    resolvedores: { account: (request: FastifyRequest) => contaDoTeto(request, deps) },
  };

  registrarRota(
    app,
    rotaDeQuemEuBloqueei,
    porConta,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const autor = await autorDoAto(request, deps);
      const pagina = paginaPedida(request);
      const lista = await deps.seguranca.quemEuBloqueei(autor, pagina);
      return reply
        .status(200)
        .header('Cache-Control', SEM_CACHE)
        .send({
          items: lista.items.map(comoRespostaDoBloqueio),
          total: lista.total,
          page: pagina.page,
          limit: pagina.limit,
        });
    },
  );

  registrarRota(app, rotaDeBloquear, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
    const autor = await autorDoAto(request, deps);
    const desfecho = await deps.seguranca.bloquear(autor, parametro(request, 'userRef'));

    if (desfecho === 'ausente') throw problemas.naoEncontrado();
    if (desfecho === 'eu_mesmo') {
      throw problemas.validacao([
        { field: 'userRef', code: 'own_profile', message: 'Este perfil é seu.' },
      ]);
    }

    return reply.status(204).send();
  });

  registrarRota(app, rotaDeDesbloquear, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
    const autor = await autorDoAto(request, deps);
    const desfecho = await deps.seguranca.desbloquear(autor, parametro(request, 'userRef'));
    if (desfecho === 'ausente') throw problemas.naoEncontrado();
    return reply.status(204).send();
  });

  const denuncias = [
    { rota: rotaDeDenunciarPerfil, alvo: 'profile', parametro: 'userRef' },
    { rota: rotaDeDenunciarFoto, alvo: 'photo', parametro: 'photoRef' },
    { rota: rotaDeDenunciarPublicacao, alvo: 'publication', parametro: 'publicationRef' },
  ] as const satisfies readonly { rota: unknown; alvo: AlvoDaDenuncia; parametro: string }[];

  for (const { rota, alvo, parametro: nomeDoParametro } of denuncias) {
    registrarRota(app, rota, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
      const autor = await autorDoAto(request, deps);
      const desfecho = await deps.seguranca.denunciar(
        autor,
        alvo,
        parametro(request, nomeDoParametro),
        request.body,
      );

      if (desfecho.tipo === 'invalida') throw problemas.validacao(desfecho.erros);
      if (desfecho.tipo === 'ausente') throw problemas.naoEncontrado();
      if (desfecho.tipo === 'eu_mesmo') throw problemas.validacao([CAMPO_E_CODIGO[alvo]]);

      return reply.status(202).send(O_QUE_O_DENUNCIANTE_RECEBE);
    });
  }
}
