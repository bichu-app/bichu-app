import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
  onSendAsyncHookHandler,
  preValidationHookHandler,
  RouteShorthandOptions,
} from 'fastify';

import {
  aplicarNaEntrada,
  contarTentativaInvalida,
  inventariarNaoAplicaveis,
  resolvedoresGenericos,
  type DependenciasDoTeto,
  type Dimensao,
  type EntradaNaoAplicavel,
  type ResolvedorDeDimensao,
  type Resolvedores,
  DIMENSOES_GENERICAS,
} from './aplicacao-de-teto.js';
import { AppError, problemas } from './errors.js';
import { recusarCampoDesconhecido } from './corpo-fechado.js';
import {
  CABECALHO_DE_REAUTENTICACAO_ADMINISTRATIVA,
  OPERACOES_ADMINISTRATIVAS_SEM_SESSAO,
  PREFIXO_ADMINISTRATIVO,
  contextoDaGuarda,
  sessaoAdministrativaDe,
  type OpcoesDaSuperficieAdministrativa,
  type ReautenticacaoConsumida,
} from './superficie-administrativa.js';
import type { ProblemType } from './problem.js';
import type { RateLimitEntry, ReauthScope, RouteDefinition } from './route-definition.js';

/**
 * O cabeçalho da segunda credencial, como o contrato o declara no esquema de
 * segurança `reauth`.
 */
export const CABECALHO_DE_REAUTENTICACAO = 'x-reauth-token';

/** Quem sabe se a janela de reautenticação vale, e a consome. */
export type VerificadorDeReautenticacao = (
  request: FastifyRequest,
  escopo: ReauthScope,
) => Promise<void>;

declare module 'fastify' {
  interface FastifyInstance {
    tetoDeChamada?: DependenciasDoTeto;
    reautenticacao?: VerificadorDeReautenticacao;
  }
  interface FastifyRequest {
    tentativaInvalida?: true;
    reautenticacaoConsumida?: ReautenticacaoConsumida | undefined;
  }
}

/** Os tipos de problema que significam **credencial recusada**, e só eles. */
export const TIPOS_DE_TENTATIVA_INVALIDA: ReadonlySet<ProblemType> = new Set<ProblemType>([
  'unauthenticated',
  'invalid-credentials',
  'token-expired',
  'forbidden',
  'tag-code-malformed',
  'tag-code-not-found',
  'verification-token-expired',
  'finder-link-invalid',
]);

type DimensoesDeclaradas<T extends RouteDefinition> = T extends {
  readonly rateLimit: readonly RateLimitEntry[];
}
  ? T['rateLimit'][number]['dimension'][number]
  : never;

type DimensaoGenerica = (typeof DIMENSOES_GENERICAS)[number];

type DimensoesExigidas<T extends RouteDefinition> = Exclude<
  DimensoesDeclaradas<T>,
  DimensaoGenerica
>;

type ResolvedoresExigidos<T extends RouteDefinition> = [DimensoesExigidas<T>] extends [never]
  ? { readonly resolvedores?: undefined }
  : { readonly resolvedores: Readonly<Record<DimensoesExigidas<T>, ResolvedorDeDimensao>> };

export type OpcoesDeRegistro<T extends RouteDefinition> = ResolvedoresExigidos<T> & {
  /** Schema do Fastify, como antes. */
  readonly schema?: RouteShorthandOptions['schema'];
  readonly config?: RouteShorthandOptions['config'];
  /** Ganchos da própria rota. */
  readonly onRequest?: readonly onRequestAsyncHookHandler[];
  /** Ganchos de `preValidation` da própria rota. */
  readonly preValidation?: readonly preValidationHookHandler[];
};

export type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

const naoAplicadas: EntradaNaoAplicavel[] = [];

export function inventarioDoQueNaoEAplicado(): readonly EntradaNaoAplicavel[] {
  return naoAplicadas;
}

/** Só para teste: o inventário é por processo e um cenário não herda o outro. */
export function zerarInventario(): void {
  naoAplicadas.length = 0;
}

const METODOS = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
} as const satisfies Record<RouteDefinition['method'], string>;

type MetodoDeRegistro = Extract<
  keyof FastifyInstance,
  'get' | 'head' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'all' | 'route'
>;

/** O servidor **sem a porta dos fundos**. */
export type RegistradorDeRotas = Omit<FastifyInstance, MetodoDeRegistro>;

/**
 * Abre um escopo prefixado e entrega ao chamador um servidor **sem** os métodos de
 * registro.
 */
export async function escoparRotas(
  app: RegistradorDeRotas,
  prefixo: string,
  montar: (registrador: RegistradorDeRotas) => void,
): Promise<void> {
  const plugin: FastifyPluginCallback = (escopo, _opcoes, pronto) => {
    try {
      montar(escopo);
    } catch (erro) {
      pronto(erro as Error);
      return;
    }
    pronto();
  };
  await app.register(plugin, { prefix: prefixo });
}

function tetoDe(app: RegistradorDeRotas): DependenciasDoTeto {
  const teto = app.tetoDeChamada;
  if (teto === undefined) {
    throw new Error(
      'Registro de rota sem contador de teto: o servidor não foi criado por ' +
        '`criarServidor({ teto })`, ou o decorador `tetoDeChamada` foi removido. ' +
        'Sem ele nenhuma rota aplicaria `x-rate-limit`, que é exatamente o defeito ' +
        'da BICHUS-178. Ver adr/ADR-0016, Emenda 1.',
    );
  }
  return teto;
}

function portaoDeReautenticacao(
  app: RegistradorDeRotas,
  rota: RouteDefinition,
): onRequestAsyncHookHandler | undefined {
  const escopo = rota.reauthScope;
  if (escopo === undefined) return undefined;

  const verificador = app.reautenticacao;
  if (verificador === undefined) {
    throw new Error(
      `A rota ${rota.operationId} declara reauthScope '${escopo}' e o servidor não tem o ` +
        'decorador `reautenticacao`: ele não foi criado por `criarServidor({ reautenticacao })`. ' +
        'Subir assim serviria uma operação destrutiva sem a segunda credencial que o contrato ' +
        'exige (BICHUS-48, esquema de segurança `reauth` de api/openapi.yaml).',
    );
  }

  return async (request) => {
    await verificador(request, escopo);
  };
}

function exigirFronteiraAdministrativa(
  rota: RouteDefinition,
  superficie: OpcoesDaSuperficieAdministrativa | undefined,
): void {
  const caminhoAdministrativo = rota.path.startsWith(PREFIXO_ADMINISTRATIVO);
  const declaraAdministrativa =
    rota.adminRoles !== undefined ||
    rota.adminPublic === true ||
    rota.audit !== undefined ||
    rota.adminReauthScope !== undefined;
  const falha = (motivo: string): never => {
    throw new Error(`Rota ${rota.operationId} (${rota.method.toUpperCase()} ${rota.path}): ${motivo} (ADR-0027 item 7).`);
  };

  if (superficie === undefined) {
    if (caminhoAdministrativo || declaraAdministrativa) {
      falha('rota administrativa registrada fora de escoparRotasAdministrativas; ela seria servida sem a guarda do prefixo');
    }
    return;
  }
  if (!caminhoAdministrativo) falha('rota sem /admin/ no caminho dentro do escopo administrativo');
  if ((rota.adminRoles === undefined) === (rota.adminPublic !== true)) {
    falha('rota do escopo administrativo precisa declarar adminRoles OU adminPublic, e so um dos dois');
  }
  if (rota.adminPublic === true && !OPERACOES_ADMINISTRATIVAS_SEM_SESSAO.includes(rota.operationId)) {
    falha(
      `adminPublic fora da lista fechada de operacoes sem sessao (${OPERACOES_ADMINISTRATIVAS_SEM_SESSAO.join(', ')})`,
    );
  }
  const contaLinhas = (rota.rateLimit ?? []).some((t) => t.counts === 'rows_returned');
  if (rota.method === 'get' && rota.audit !== undefined) {
    const verbo = rota.audit.action.split('.').pop() ?? '';
    if (rota.adminPublic === true || !['listed', 'read'].includes(verbo) || !contaLinhas) {
      falha('GET administrativo nao muda estado e nao declara audit, salvo leitura de dado pessoal auditada com sessao (verbo de leitura e teto por rows_returned, D55/D56)');
    }
  }
  if (rota.method === 'get' && contaLinhas && rota.audit === undefined) {
    falha('GET com teto por rows_returned e leitura de pessoa, e sem audit sairia sem trilha (D55)');
  }
  if (rota.method !== 'get' && rota.audit === undefined) falha('escrita administrativa sem audit (D49)');
}

function portaoDeReautenticacaoAdministrativa(
  rota: RouteDefinition,
  superficie: OpcoesDaSuperficieAdministrativa | undefined,
): onRequestAsyncHookHandler | undefined {
  const escopo = rota.adminReauthScope;
  if (escopo === undefined || superficie === undefined) return undefined;
  return async (request) => {
    const versao = request.headers['if-match'];
    if (versao === undefined || versao === '') {
      throw new AppError('precondition-required', 'Falta a versão que você leu');
    }
    const apresentado = request.headers[CABECALHO_DE_REAUTENTICACAO_ADMINISTRATIVA];
    const consumo = await superficie.sessoes.consumirReautenticacao(
      sessaoAdministrativaDe(request),
      escopo,
      typeof apresentado === 'string' ? apresentado : undefined,
      contextoDaGuarda(request),
    );
    if (consumo !== undefined) request.reautenticacaoConsumida = consumo;
  };
}

const DEVOLVEM_A_JANELA: ReadonlySet<number> = new Set([412, 428]);

function devolucaoDaReautenticacaoAdministrativa(
  rota: RouteDefinition,
  superficie: OpcoesDaSuperficieAdministrativa | undefined,
): onSendAsyncHookHandler | undefined {
  if (rota.adminReauthScope === undefined || superficie === undefined) return undefined;
  return async (request, reply, carga) => {
    const consumo = request.reautenticacaoConsumida;
    if (consumo === undefined || !DEVOLVEM_A_JANELA.has(reply.statusCode)) return carga;
    request.reautenticacaoConsumida = undefined;
    try {
      await consumo.devolver();
    } catch (erro) {
      request.log.error({ err: erro, operationId: rota.operationId }, 'a janela de reautenticacao nao foi devolvida');
    }
    return carga;
  };
}

/** Registra a rota e liga os tetos dela. */
export function registrarRota<const T extends RouteDefinition>(
  app: RegistradorDeRotas,
  rota: T,
  opcoes: OpcoesDeRegistro<T>,
  handler: Handler,
): void {
  const deps = tetoDe(app);
  const superficie = app.superficieAdministrativa;
  exigirFronteiraAdministrativa(rota, superficie);
  if (superficie !== undefined) anotarMetodoDaSuperficie(superficie, rota);
  if (opcoes.config !== undefined && 'metodoNaoPermitido' in opcoes.config) {
    throw new Error(
      `Rota ${rota.operationId}: \`config.metodoNaoPermitido\` e reservada a rota de 405 do painel, ` +
        'e numa rota comum ela a esconderia da conferencia de subida contra o contrato.',
    );
  }
  const portaoDeReauth = portaoDeReautenticacao(app, rota);
  const portaoDeReauthAdministrativa = portaoDeReautenticacaoAdministrativa(rota, superficie);
  const devolucaoDaReauth = devolucaoDaReautenticacaoAdministrativa(rota, superficie);
  const corpoDaRota = opcoes.schema?.body;
  const corpoFechado =
    superficie !== undefined && typeof corpoDaRota === 'object' && corpoDaRota !== null
      ? [recusarCampoDesconhecido(corpoDaRota as Record<string, unknown>, rota.operationId)]
      : [];
  naoAplicadas.push(...inventariarNaoAplicaveis(rota));

  const resolvedores: Resolvedores = {
    ...resolvedoresGenericos(deps),
    ...((opcoes.resolvedores ?? {}) as Partial<Record<Dimensao, ResolvedorDeDimensao>>),
  };

  const tetoDeEntrada: onRequestAsyncHookHandler = async (request) => {
    const { erro } = await aplicarNaEntrada(rota, request, resolvedores, deps, 'entrada');
    if (erro !== undefined) throw erro;
  };

  const tetoDoCorpo: onRequestAsyncHookHandler = async (request) => {
    const { erro } = await aplicarNaEntrada(rota, request, resolvedores, deps, 'corpo');
    if (erro !== undefined) throw erro;
  };

  (app as FastifyInstance).route({
    method: METODOS[rota.method],
    url: rota.path,
    ...(opcoes.schema === undefined ? {} : { schema: opcoes.schema }),
    config: { ...(opcoes.config ?? {}), rotaDeclarada: rota },
    onRequest: [
      tetoDeEntrada,
      ...(portaoDeReauth === undefined ? [] : [portaoDeReauth]),
      ...(portaoDeReauthAdministrativa === undefined ? [] : [portaoDeReauthAdministrativa]),
      ...(opcoes.onRequest ?? []),
    ],
    preValidation: [tetoDoCorpo, ...corpoFechado, ...(opcoes.preValidation ?? [])],
    ...(devolucaoDaReauth === undefined ? {} : { onSend: [devolucaoDaReauth] }),
    onError: (request, _reply, erro, pronto) => {
      if (erro instanceof AppError && TIPOS_DE_TENTATIVA_INVALIDA.has(erro.problemType)) {
        request.tentativaInvalida = true;
      }
      pronto();
    },
    onResponse: async (request) => {
      if (request.tentativaInvalida !== true) return;
      try {
        await contarTentativaInvalida(rota, request, resolvedores, deps);
      } catch (erro) {
        deps.log(
          { operation_id: rota.operationId, err: String(erro) },
          'nao foi possivel contar a tentativa invalida',
        );
      }
    },
    handler,
  });
}

const metodosDaSuperficie = new WeakMap<OpcoesDaSuperficieAdministrativa, Map<string, Set<string>>>();

function anotarMetodoDaSuperficie(superficie: OpcoesDaSuperficieAdministrativa, rota: RouteDefinition): void {
  const porCaminho = metodosDaSuperficie.get(superficie) ?? new Map<string, Set<string>>();
  metodosDaSuperficie.set(superficie, porCaminho);
  const metodos = porCaminho.get(rota.path) ?? new Set<string>();
  metodos.add(METODOS[rota.method]);
  porCaminho.set(rota.path, metodos);
}

const METODOS_QUE_O_PAINEL_PODE_RECEBER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * `405 method-not-allowed`, com `Allow`, para todo metodo que um caminho da
 * superficie administrativa NAO declara (ADR-0027 item 20.5).
 */
export function fecharMetodosDaSuperficie(
  app: RegistradorDeRotas,
  superficie: OpcoesDaSuperficieAdministrativa,
): void {
  for (const [caminho, declarados] of metodosDaSuperficie.get(superficie) ?? []) {
    const faltando = METODOS_QUE_O_PAINEL_PODE_RECEBER.filter((metodo) => !declarados.has(metodo));
    if (faltando.length === 0) continue;
    const permitidos = [...declarados].sort().join(', ');
    (app as FastifyInstance).route({
      method: faltando,
      url: caminho,
      config: { metodoNaoPermitido: true },
      handler: async (_request, reply) => {
        void reply.header('Allow', permitidos);
        throw problemas.metodoNaoPermitido();
      },
    });
  }
}
