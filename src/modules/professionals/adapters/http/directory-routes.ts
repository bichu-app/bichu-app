/** `GET /v1/directory/entries` — a secao `Perto`. */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  projetarEnderecoComercial,
  projetarEntrada,
  projetarEntradaSemConta,
  urlDaDerivada,
  type TipoDeProfissional,
} from '../../domain/entrada-do-diretorio.js';
import {
  errosDeModeracaoDaAvaliacao,
  projetarAvaliacao,
  projetarPontuacao,
  validarDenuncia,
  validarEntradaDaAvaliacao,
  type OrdemDasAvaliacoes,
} from '../../domain/avaliacao-do-local.js';
import type { NivelDeVerificacao } from '../../domain/nivel-de-verificacao.js';
import type { DirectoryRepository, OrdemDoDiretorio } from '../../ports/directory-repository.js';
import {
  comoFamiliaDeSessao,
  type FamiliaDeSessao,
} from '../../../identity/ports/localizacao-de-referencia-repository.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { UserId } from '../../../../shared/types/brands.js';

/** O teto e o do contrato, copiado dele e nao escolhido aqui. */
export const rotaDoDiretorio = defineRoute({
  operationId: 'listDirectoryEntries',
  method: 'get',
  path: '/directory/entries',
  effects: ['expensive_query'],
  rateLimit: [
    { dimension: ['account'], limit: 120, window: '1h', onExceed: 'deny_429' },
    { dimension: ['account', 'q'], limit: 60, window: '1h', onExceed: 'deny_429' },
  ],
});

/** `GET /v1/public/directory-entries` -- A MESMA LISTA, SEM CONTA. */
export const rotaPublicaDoDiretorio = defineRoute({
  operationId: 'listPublicDirectoryEntries',
  method: 'get',
  path: '/public/directory-entries',
  effects: ['expensive_query'],
  rateLimit: [
    { dimension: ['ip'], limit: 120, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip'], limit: 600, window: '24h', onExceed: 'challenge' },
    { dimension: ['ip', 'q'], limit: 30, window: '1h', onExceed: 'challenge' },
  ],
});

/** Os mesmos defaults que o contrato declara. */
const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;
const ORDEM_PADRAO: OrdemDoDiretorio = 'distance';

/**
 * A ordem da rota publica, **e ela nao e um default**: nao ha `sort` no contrato
 * dela para a tela escolher.
 */
const ORDEM_SEM_CONTA: OrdemDoDiretorio = 'name';

export interface Autenticador {
  /**
   * `sid` e a familia de refresh que emitiu o token -- a SESSAO DE APARELHO do
   * ADR-0002, emenda 1, secao 2.
   */
  autenticar(token: string): Promise<{ userId: UserId; sid?: string | undefined }>;
}

/** Quem chama e de qual aparelho. */
export interface ChamadorDoDiretorio {
  readonly userId: UserId;
  readonly familia: FamiliaDeSessao | undefined;
}

export interface DependenciasDasRotasDoDiretorio {
  readonly diretorio: DirectoryRepository;
  readonly autenticador: Autenticador;
  readonly clock: Clock;
  /**
   * A URL publica de uma chave de derivada (18/10/2026, com a liberacao das imagens
   * do profissional no aplicativo).
   */
  readonly urlDeMidia: (chave: string) => string;
}

interface QueryDoDiretorio {
  readonly q?: string;
  readonly city?: string;
  readonly state?: string;
  readonly neighborhood?: string;
  readonly kind?: TipoDeProfissional;
  readonly verification_level?: NivelDeVerificacao;
  readonly sort?: OrdemDoDiretorio;
  readonly page?: number;
  readonly limit?: number;
}

/** A query da rota publica: a mesma, **menos `sort`**. */
type QueryPublicaDoDiretorio = Omit<QueryDoDiretorio, 'sort'>;

/** MEMOIZADA: o teto por `account` e o manipulador precisam do mesmo dono. */
export function identidadeDoChamador(
  request: FastifyRequest,
  deps: { readonly autenticador: Autenticador },
): Promise<ChamadorDoDiretorio> {
  return memoDaRequisicao(request, 'diretorio:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId, sid } = await deps.autenticador.autenticar(token);
    return {
      userId,
      familia: typeof sid === 'string' && sid !== '' ? comoFamiliaDeSessao(sid) : undefined,
    };
  });
}

/** So o dono, para quem nao mede distancia. */
export async function chamadorAutenticado(
  request: FastifyRequest,
  deps: { readonly autenticador: Autenticador },
): Promise<UserId> {
  return (await identidadeDoChamador(request, deps)).userId;
}

/** `account` para o teto. Sem credencial valida nao ha balde de conta. */
export async function contaDoTeto(
  request: FastifyRequest,
  deps: { readonly autenticador: Autenticador },
): Promise<string | undefined> {
  try {
    return await chamadorAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

/** O recorte que de fato valeu, para a tela poder escreve-lo. */
function filtrosAplicados(query: QueryDoDiretorio): Record<string, string> {
  const filtros: Record<string, string> = {};
  if (query.q !== undefined) filtros['q'] = query.q;
  if (query.city !== undefined) filtros['city'] = query.city;
  if (query.state !== undefined) filtros['state'] = query.state;
  if (query.neighborhood !== undefined) filtros['neighborhood'] = query.neighborhood;
  if (query.kind !== undefined) filtros['kind'] = query.kind;
  if (query.verification_level !== undefined) {
    filtros['verification_level'] = query.verification_level;
  }
  if (Object.keys(filtros).length === 0) filtros['scope'] = 'all';
  return filtros;
}

/** `GET /v1/directory/entries/{slug}` -- a pagina do local. */
export const rotaDoLocal = defineRoute({
  operationId: 'getDirectoryEntry',
  method: 'get',
  path: '/directory/entries/:slug',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDasAvaliacoes = defineRoute({
  operationId: 'listDirectoryEntryReviews',
  method: 'get',
  path: '/directory/entries/:slug/reviews',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** `PUT` e nao `POST`, e o metodo E a regra de produto. */
export const rotaDeGravarMinhaAvaliacao = defineRoute({
  operationId: 'putMyDirectoryEntryReview',
  method: 'put',
  path: '/directory/entries/:slug/reviews/me',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeApagarMinhaAvaliacao = defineRoute({
  operationId: 'deleteMyDirectoryEntryReview',
  method: 'delete',
  path: '/directory/entries/:slug/reviews/me',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

/** A denuncia. **20 por DIA**, e a janela de 24 h e deliberada. */
export const rotaDeDenunciarAvaliacao = defineRoute({
  operationId: 'reportDirectoryEntryReview',
  method: 'post',
  path: '/directory/entries/:slug/reviews/:reviewRef/reports',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '24h', onExceed: 'deny_429' }],
});

const TAMANHO_PADRAO_DAS_AVALIACOES = 10;
const ORDEM_PADRAO_DAS_AVALIACOES: OrdemDasAvaliacoes = 'recent';

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

interface QueryDasAvaliacoes {
  readonly sort?: OrdemDasAvaliacoes;
  readonly page?: number;
  readonly limit?: number;
}

export function registrarRotasDoDiretorio(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDoDiretorio,
): void {
  registrarRota(
    app,
    rotaDoDiretorio,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await identidadeDoChamador(request, deps);
      const query = (request.query ?? {}) as QueryDoDiretorio;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const sort = query.sort ?? ORDEM_PADRAO;

      const pagina = await deps.diretorio.listarPublicados({
        chamador: chamador.userId,
        familia: chamador.familia,
        agora: deps.clock.now(),
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.city === undefined ? {} : { city: query.city }),
        ...(query.state === undefined ? {} : { state: query.state }),
        ...(query.neighborhood === undefined ? {} : { neighborhood: query.neighborhood }),
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.verification_level === undefined
          ? {}
          : { verificationLevel: query.verification_level }),
        sort,
        page,
        limit,
      });

      const itens = pagina.itens.map((e) => projetarEntrada(e, deps.urlDeMidia)).map((entrada) =>
        pagina.distanciaDisponivel ? entrada : { ...entrada, distance_m: null },
      );

      return reply.send({
        items: itens,
        page,
        limit,
        total: pagina.total,
        distance_available: pagina.distanciaDisponivel,
        applied_filters: filtrosAplicados(query),
      });
    },
  );

  registrarRota(
    app,
    rotaPublicaDoDiretorio,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      void reply.header('X-Robots-Tag', 'noindex, nofollow');
      void reply.header('Referrer-Policy', 'no-referrer');
      void reply.header('Cache-Control', 'no-store');

      const query = (request.query ?? {}) as QueryPublicaDoDiretorio;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;

      const pagina = await deps.diretorio.listarPublicados({
        chamador: undefined,
        familia: undefined,
        agora: deps.clock.now(),
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.city === undefined ? {} : { city: query.city }),
        ...(query.state === undefined ? {} : { state: query.state }),
        ...(query.neighborhood === undefined ? {} : { neighborhood: query.neighborhood }),
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.verification_level === undefined
          ? {}
          : { verificationLevel: query.verification_level }),
        sort: ORDEM_SEM_CONTA,
        page,
        limit,
      });

      return reply.send({
        items: pagina.itens.map((e) => projetarEntradaSemConta(e, deps.urlDeMidia)),
        page,
        limit,
        total: pagina.total,
        distance_available: pagina.distanciaDisponivel,
        applied_filters: filtrosAplicados(query),
      });
    },
  );

  registrarRota(
    app,
    rotaDoLocal,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await identidadeDoChamador(request, deps);
      const local = await deps.diretorio.lerLocalPublicado(
        parametro(request, 'slug'),
        chamador.userId,
        chamador.familia,
        deps.clock.now(),
      );
      if (local === undefined) throw problemas.naoEncontrado();

      const entrada = projetarEntrada(local.entrada, deps.urlDeMidia);
      return reply.send({
        ...entrada,
        photo_url: urlDaDerivada(local.fotoPublicKey, deps.urlDeMidia),
        ...projetarEnderecoComercial(local.enderecoComercial),
        rating: projetarPontuacao(local.pontuacao),
        my_review_ref: local.refDaMinhaAvaliacao,
        can_review: local.podeAvaliar,
        review_blocked_reason: local.podeAvaliar ? null : 'unverified_channel',
      });
    },
  );

  registrarRota(
    app,
    rotaDasAvaliacoes,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const query = (request.query ?? {}) as QueryDasAvaliacoes;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO_DAS_AVALIACOES;

      const pagina = await deps.diretorio.listarAvaliacoes({
        slug: parametro(request, 'slug'),
        chamador,
        sort: query.sort ?? ORDEM_PADRAO_DAS_AVALIACOES,
        page,
        limit,
      });
      if (pagina === undefined) throw problemas.naoEncontrado();

      return reply.send({
        items: pagina.itens.map(projetarAvaliacao),
        page,
        limit,
        total: pagina.total,
      });
    },
  );

  registrarRota(
    app,
    rotaDeGravarMinhaAvaliacao,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);

      const { entrada, erros } = validarEntradaDaAvaliacao(request.body);
      if (entrada === undefined) throw problemas.validacao(erros);

      const reprovado = errosDeModeracaoDaAvaliacao(entrada.texto);
      if (reprovado.length > 0) {
        if (!(await deps.diretorio.temCanalVerificadoParaAvaliar(chamador))) {
          throw problemas.canalDeContatoNaoVerificadoParaAvaliar();
        }
        throw problemas.validacao([...reprovado]);
      }

      const gravada = await deps.diretorio.gravarMinhaAvaliacao(
        parametro(request, 'slug'),
        chamador,
        entrada,
        deps.clock.now(),
      );

      if (gravada === 'local-ausente') throw problemas.naoEncontrado();
      if (gravada === 'sem-canal-verificado') {
        throw problemas.canalDeContatoNaoVerificadoParaAvaliar();
      }

      return reply.send({
        review: projetarAvaliacao(gravada.avaliacao),
        created: gravada.criada,
        rating: projetarPontuacao(gravada.pontuacao),
      });
    },
  );

  registrarRota(
    app,
    rotaDeApagarMinhaAvaliacao,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const existe = await deps.diretorio.apagarMinhaAvaliacao(parametro(request, 'slug'), chamador);
      if (!existe) throw problemas.naoEncontrado();
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeDenunciarAvaliacao,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const { denuncia, erros } = validarDenuncia(request.body);
      if (denuncia === undefined) throw problemas.validacao(erros);

      const desfecho = await deps.diretorio.denunciarAvaliacao(
        parametro(request, 'slug'),
        parametro(request, 'reviewRef'),
        chamador,
        denuncia,
        deps.clock.now(),
      );

      if (desfecho === 'ausente') throw problemas.naoEncontrado();
      if (desfecho === 'propria') {
        throw problemas.validacao([
          {
            field: 'reviewRef',
            code: 'own_review',
            message: 'Esta avaliação é sua. Para tirá-la do ar, apague-a.',
          },
        ]);
      }

      return reply.status(202).send();
    },
  );
}
