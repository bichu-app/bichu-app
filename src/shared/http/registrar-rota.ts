/**
 * Registro de rota. **É aqui que o teto de chamada passa a existir.**
 *
 * ## O que este arquivo troca
 *
 * Antes: `app.post(rota.path, handler)`. O objeto de `defineRoute` chegava
 * inteiro à borda e só a sua propriedade `path` era consumida. O `rateLimit`
 * ficava declarado, obrigatório por tipo, e **nunca lido** — a declaração e a
 * aplicação eram dois atos ligados por uma string.
 *
 * Agora: `registrarRota(app, rota, opcoes, handler)`. Quem registra passa a
 * rota inteira, e é o registro que instala os ganchos que aplicam os tetos
 * declarados nela. Não existe passo a lembrar, porque não existe passo.
 *
 * ## As três coisas que deixam de ser exprimíveis
 *
 * 1. **Registrar sem aplicar.** O portão `varrer-registro-direto` reprova
 *    qualquer `app.get/post/put/patch/delete(` fora deste arquivo, e ele tem
 *    isca própria — uma varredura que não acusa o caso plantado reprova a si
 *    mesma.
 * 2. **Registrar sem contador.** O contador chega pelo decorador
 *    `tetoDeChamada`, que `criarServidor` instala e cujo tipo é obrigatório nas
 *    opções do servidor. Um `FastifyInstance` sem ele derruba o registro na
 *    subida, nomeando o que falta — não em produção, na primeira requisição.
 * 3. **Declarar uma dimensão e não resolvê-la.** `ip`, `ip_24` e `origin` saem
 *    da requisição crua e o registro resolve sozinho. As demais (`account`,
 *    `email`, `code`, `pet`, `token_family`, `finder_identity`) o autor da rota
 *    precisa fornecer, e a falta é **erro de compilação**: o tipo
 *    `ResolvedoresExigidos` extrai as dimensões da própria tupla declarada em
 *    `defineRoute`.
 *
 * ## Ordem dos ganchos, que é onde está a parte que importa
 *
 * ```
 * onRequest      teto das dimensões de requisição crua  <- 429 sai daqui
 * onRequest      os ganchos da própria rota (ex.: conferência de assinatura)
 * preValidation  teto das dimensões que precisam do corpo ou da credencial
 * handler
 * onError        marca a tentativa como inválida, pelo `type` do problema
 * onResponse     conta a inválida (`applies_to: invalid_attempts`)
 * ```
 *
 * O teto genérico vem **antes** do gancho da rota, e não é detalhe de estilo: a
 * conferência de assinatura do webhook é deliberadamente cara (tempo constante),
 * e o critério 3 da BICHUS-178 exige que a chamada recusada por teto não chegue
 * a ser conferida. Se este arquivo inverter as duas linhas, o teto continua
 * respondendo 429 e deixa de proteger do que ele existe para proteger.
 */
import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
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
} from './superficie-administrativa.js';
import type { ProblemType } from './problem.js';
import type { RateLimitEntry, ReauthScope, RouteDefinition } from './route-definition.js';

/**
 * O cabeçalho da segunda credencial, como o contrato o declara no esquema de
 * segurança `reauth`. Em minúsculas porque é assim que o Fastify normaliza.
 */
export const CABECALHO_DE_REAUTENTICACAO = 'x-reauth-token';

/**
 * Quem sabe se a janela de reautenticação vale, e a consome.
 *
 * Assinatura e não objeto: o que o registro precisa é de uma função, e o módulo
 * `identity` é quem a fornece. `shared/http` continua sem conhecer o serviço de
 * identidade — a dependência anda na direção certa, como a do contador de teto.
 *
 * Recusa **lançando** `AppError('reauthentication-required')`. Devolver um
 * booleano deixaria o chamador esquecer de olhar, que é a forma do defeito que
 * este arquivo inteiro existe para eliminar.
 */
export type VerificadorDeReautenticacao = (
  request: FastifyRequest,
  escopo: ReauthScope,
) => Promise<void>;

declare module 'fastify' {
  interface FastifyInstance {
    /** Instalado por `criarServidor`. Ver `OpcoesDoServidor.teto`. */
    tetoDeChamada?: DependenciasDoTeto;
    /**
     * Instalado por `criarServidor` quando `OpcoesDoServidor.reautenticacao`
     * vem preenchido. Rota que declara `reauthScope` num servidor sem ele
     * **não sobe**, e o motivo sai escrito.
     */
    reautenticacao?: VerificadorDeReautenticacao;
  }
  interface FastifyRequest {
    /**
     * Marcada em `onError` quando o problema é recusa de credencial. Lida em
     * `onResponse`, que é o único gancho que roda sempre.
     */
    tentativaInvalida?: true;
  }
}

/**
 * Os tipos de problema que significam **credencial recusada**, e só eles.
 *
 * `applies_to: invalid_attempts` conta a tentativa que se revelou inválida. A
 * tentação é contar todo 4xx, e ela está errada de um jeito caro: o webhook do
 * Postmark faz 600 chamadas legítimas por hora, e um punhado delas com um
 * `RecordType` que ainda não classificamos responde **400**. Contar esses 400
 * gastaria o teto de 20 inválidas com tráfego legítimo e passaria a recusar o
 * provedor — o oposto do que o teto existe para fazer.
 *
 * Então a decisão é pelo `type` do problema, que é vocabulário fechado do
 * contrato, e não pelo status. `tag-revoked` fica **fora** de propósito: quem
 * escaneia uma plaquinha revogada acertou um código real, e isso é resolução
 * bem-sucedida de uma tag morta, não tentativa inválida.
 */
export const TIPOS_DE_TENTATIVA_INVALIDA: ReadonlySet<ProblemType> = new Set<ProblemType>([
  'unauthenticated',
  'invalid-credentials',
  'token-expired',
  'forbidden',
  'tag-code-malformed',
  'tag-code-not-found',
  'verification-token-expired',
]);

/** As dimensões que aparecem na tupla `rateLimit` da rota, como união literal. */
type DimensoesDeclaradas<T extends RouteDefinition> = T extends {
  readonly rateLimit: readonly RateLimitEntry[];
}
  ? T['rateLimit'][number]['dimension'][number]
  : never;

type DimensaoGenerica = (typeof DIMENSOES_GENERICAS)[number];

/** O que a rota precisa resolver: tudo que ela declara e o registro não sabe. */
type DimensoesExigidas<T extends RouteDefinition> = Exclude<
  DimensoesDeclaradas<T>,
  DimensaoGenerica
>;

/**
 * Obrigatório quando a rota declara alguma dimensão específica; ausente quando
 * não declara nenhuma. `[X] extends [never]` (e não `X extends never`) porque a
 * forma simples distribui sobre a união e responde a pergunta errada.
 */
type ResolvedoresExigidos<T extends RouteDefinition> = [DimensoesExigidas<T>] extends [never]
  ? { readonly resolvedores?: undefined }
  : { readonly resolvedores: Readonly<Record<DimensoesExigidas<T>, ResolvedorDeDimensao>> };

export type OpcoesDeRegistro<T extends RouteDefinition> = ResolvedoresExigidos<T> & {
  /** Schema do Fastify, como antes. O corpo continua saindo do contrato. */
  readonly schema?: RouteShorthandOptions['schema'];
  readonly config?: RouteShorthandOptions['config'];
  /** Ganchos da própria rota. Rodam DEPOIS do teto das dimensões genéricas. */
  readonly onRequest?: readonly onRequestAsyncHookHandler[];
  /**
   * Ganchos de `preValidation` da própria rota. Rodam DEPOIS do teto das
   * dimensões que dependem do corpo ou da credencial, pela mesma razão que
   * `onRequest`: o critério 3 da BICHUS-178 exige que a chamada recusada por
   * teto não chegue a executar trabalho da rota.
   *
   * Existe porque duas operações do contrato declaram `requestBody` com
   * `required: false` e precisam de `corpoAusenteEhCorpoVazio` aqui
   * (`fix/logout-sem-revogacao`, `c62ac0e`). Sem este campo, `app.route`
   * receberia só `[tetoDoCorpo]` e o gancho da rota sumiria em silêncio — a
   * chamada legítima sem corpo voltaria a levar 400 `body must be object`.
   */
  readonly preValidation?: readonly preValidationHookHandler[];
};

export type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/**
 * O que a subida precisa dizer em voz alta: as entradas declaradas que este
 * mecanismo **não** aplica. Acumula por processo, e `api.ts` imprime a lista.
 *
 * Lista de exceção que ninguém vê é lista que cresce, e é a própria forma do
 * defeito que esta história conserta: uma proteção que se acredita existir.
 */
const naoAplicadas: EntradaNaoAplicavel[] = [];

export function inventarioDoQueNaoEAplicado(): readonly EntradaNaoAplicavel[] {
  return naoAplicadas;
}

/** Só para teste: o inventário é por processo e um cenário não herda o outro. */
export function zerarInventario(): void {
  naoAplicadas.length = 0;
}

/**
 * O método declarado, no vocabulário do framework.
 *
 * Tabela e não `toUpperCase()`: a tabela é exaustiva por tipo, então acrescentar
 * um método a `RouteBase` sem acrescentá-lo aqui não compila. Com a conversão de
 * texto, o método novo chegaria ao framework como uma cadeia qualquer e falharia
 * na subida, que é tarde demais para algo que o compilador sabia.
 */
const METODOS = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
} as const satisfies Record<RouteDefinition['method'], string>;

/**
 * Os membros do servidor que **registram rota**, e que ninguém fora deste
 * arquivo pode alcançar.
 *
 * `Extract<keyof FastifyInstance, ...>` e não uma união solta: um nome que o
 * framework não tenha some do `Omit` abaixo em silêncio, e o `RegistradorDeRotas`
 * voltaria a expor o método. A lista é conferida contra a do framework.
 */
type MetodoDeRegistro = Extract<
  keyof FastifyInstance,
  'get' | 'head' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'all' | 'route'
>;

/**
 * O servidor **sem a porta dos fundos**. É o tipo que todo módulo de rota
 * recebe, e o que `escoparRotas` entrega.
 *
 * Por que isto existe, e por que não bastava o portão de código-fonte: o portão
 * acusa depois, na suíte, e acusa porque alguém lembrou de mantê-lo afiado. O
 * tipo acusa no editor, na hora, e **não tem furo de nome de variável** — um
 * parâmetro chamado `escopo`, `app` ou `xpto` simplesmente não tem `.post` para
 * chamar. Foi por um nome de variável que a versão anterior do portão deixou
 * passar o registro clandestino de `api.ts`.
 *
 * Tudo que não registra rota continua aqui: `register`, `addHook`, `listen`,
 * `close`, `decorate`, `log`, `inject`. Quem precisa do servidor inteiro é
 * `registrarRota`, e ele mora neste arquivo.
 */
export type RegistradorDeRotas = Omit<FastifyInstance, MetodoDeRegistro>;

/**
 * Abre um escopo prefixado e entrega ao chamador um servidor **sem** os métodos
 * de registro.
 *
 * `app.register((escopo, ...) => ...)` do framework tipa `escopo` como o
 * servidor inteiro, e era exatamente ali — dentro do escopo `/v1`, onde as seis
 * famílias de rotas entram — que `escopo.post(...)` compilava sem que nada
 * acusasse. Passando por aqui, o mesmo `escopo.post(...)` deixa de compilar.
 */
export async function escoparRotas(
  app: RegistradorDeRotas,
  prefixo: string,
  montar: (registrador: RegistradorDeRotas) => void,
): Promise<void> {
  const plugin: FastifyPluginCallback = (escopo, _opcoes, pronto) => {
    // O erro de registro (a fronteira administrativa, o verificador que falta)
    // vai para `pronto`: lancado aqui dentro, ele nao chegaria a `ready()` e o
    // carregador esperaria o `pronto` que nunca vem, ate estourar o tempo.
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

/**
 * O portão da segunda credencial, e **ele nasce da declaração da rota**.
 *
 * `rota.reauthScope` é o mesmo `x-reauth-scope` do contrato, e
 * `rotas-registradas-contra-o-contrato.test.ts` cobra a equivalência nos dois
 * sentidos: operação com `reauth: []` cuja rota não declara o escopo reprova, e
 * rota que declara um escopo que o contrato não exige também.
 *
 * Isso é o que torna "esqueci de exigir a senha" inexprimível. Não existe passo
 * a lembrar no manipulador: quem escreve a rota declara a finalidade, e o
 * registro instala a conferência. `Desativar a tag` não pode entrar sem ela.
 *
 * Servidor sem o decorador derruba o registro **na subida**, e não na primeira
 * requisição destrutiva. Uma rota destrutiva que subisse sem verificador seria
 * uma rota destrutiva sem senha, e o silêncio é exatamente o desfecho que este
 * arquivo recusa.
 */
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

/**
 * A rota administrativa so sobe dentro do escopo da guarda, e o escopo so
 * aceita rota administrativa (ADR-0027 item 7). Sao as quatro formas de uma
 * rota escapar da guarda, e cada uma derruba a subida com o motivo:
 *
 * 1. rota com `/admin/` no caminho, ou com declaracao administrativa, fora do
 *    escopo: ela seria servida sem guarda nenhuma;
 * 2. rota do escopo sem `/admin/` no caminho: o contrato nao a conhece ali;
 * 3. rota do escopo sem `adminRoles` nem `adminPublic`: a guarda nao teria
 *    papel contra o que conferir, e conferir contra lista vazia recusa tudo ou,
 *    escrito do jeito errado, aprova tudo;
 * 4. escrita do escopo sem `audit`, ou leitura com `audit`: GET nao muda estado
 *    (ADR-0027 item 3), e escrita administrativa sem trilha e o estado que D49
 *    proibe.
 */
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
  // `adminPublic` e a guarda sem sessao. Ela vale por lista fechada, e nao por
  // quem lembrou de declarar: uma terceira rota sem sessao e decisao de
  // arquitetura, nao de registro.
  if (rota.adminPublic === true && !OPERACOES_ADMINISTRATIVAS_SEM_SESSAO.includes(rota.operationId)) {
    falha(
      `adminPublic fora da lista fechada de operacoes sem sessao (${OPERACOES_ADMINISTRATIVAS_SEM_SESSAO.join(', ')})`,
    );
  }
  if (rota.method === 'get' && rota.audit !== undefined) falha('GET administrativo nao muda estado e nao declara audit');
  if (rota.method !== 'get' && rota.audit === undefined) falha('escrita administrativa sem audit (D49)');
}

/**
 * O portao de `X-Admin-Reauth-Token`, nascido da declaracao da rota, no mesmo
 * lugar e pelo mesmo motivo de `portaoDeReautenticacao`: esquecer de exigir a
 * senha deixa de ser exprimivel.
 */
function portaoDeReautenticacaoAdministrativa(
  rota: RouteDefinition,
  superficie: OpcoesDaSuperficieAdministrativa | undefined,
): onRequestAsyncHookHandler | undefined {
  const escopo = rota.adminReauthScope;
  if (escopo === undefined || superficie === undefined) return undefined;
  return async (request) => {
    const apresentado = request.headers[CABECALHO_DE_REAUTENTICACAO_ADMINISTRATIVA];
    await superficie.sessoes.consumirReautenticacao(
      sessaoAdministrativaDe(request),
      escopo,
      typeof apresentado === 'string' ? apresentado : undefined,
      contextoDaGuarda(request),
    );
  };
}

/**
 * Registra a rota e liga os tetos dela.
 *
 * `rota.method` finalmente é consumido: era o único campo do objeto, junto com
 * `path`, que a borda lia — e ainda assim o método era repetido à mão em
 * `app.post(...)`. Agora a declaração é a única fonte dos dois.
 */
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
  // A marca da rota de 405 e so de `fecharMetodosDaSuperficie`: numa rota
  // comum ela a tiraria da conferencia de subida contra o contrato.
  if (opcoes.config !== undefined && 'metodoNaoPermitido' in opcoes.config) {
    throw new Error(
      `Rota ${rota.operationId}: \`config.metodoNaoPermitido\` e reservada a rota de 405 do painel, ` +
        'e numa rota comum ela a esconderia da conferencia de subida contra o contrato.',
    );
  }
  const portaoDeReauth = portaoDeReautenticacao(app, rota);
  const portaoDeReauthAdministrativa = portaoDeReautenticacaoAdministrativa(rota, superficie);
  // O corpo administrativo e FECHADO de verdade: o Ajv do Fastify apaga o campo
  // desconhecido em silencio (`removeAdditional`), e numa escrita do painel isso
  // e responder 200 a um campo que nao foi gravado. O guarda roda antes do Ajv.
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

  // A ÚNICA reabertura do tipo largo em todo o `src/`, e ela está no arquivo
  // que o portão autoriza. `RegistradorDeRotas` é o mesmo objeto com os métodos
  // de registro escondidos; aqui eles voltam, porque é aqui que se registra.
  (app as FastifyInstance).route({
    method: METODOS[rota.method],
    url: rota.path,
    ...(opcoes.schema === undefined ? {} : { schema: opcoes.schema }),
    // A declaracao inteira vai para `config`: e dali que a guarda do escopo
    // administrativo le o papel minimo da operacao.
    config: { ...(opcoes.config ?? {}), rotaDeclarada: rota },
    // A ordem é a do cabeçalho deste arquivo, com o portão da segunda
    // credencial entre o teto e os ganchos da rota: a chamada recusada por teto
    // não chega a custar a leitura do banco que a conferência da janela faz, e
    // nenhum gancho da rota roda antes de a senha ter sido conferida.
    onRequest: [
      tetoDeEntrada,
      ...(portaoDeReauth === undefined ? [] : [portaoDeReauth]),
      ...(portaoDeReauthAdministrativa === undefined ? [] : [portaoDeReauthAdministrativa]),
      ...(opcoes.onRequest ?? []),
    ],
    preValidation: [tetoDoCorpo, ...corpoFechado, ...(opcoes.preValidation ?? [])],
    onError: (request, _reply, erro, pronto) => {
      if (erro instanceof AppError && TIPOS_DE_TENTATIVA_INVALIDA.has(erro.problemType)) {
        request.tentativaInvalida = true;
      }
      pronto();
    },
    // Depois da resposta ter saído: contar não pode atrasar quem já foi
    // recusado, e a contagem que atrasa a resposta vira o próprio custo que o
    // teto existe para evitar.
    onResponse: async (request) => {
      if (request.tentativaInvalida !== true) return;
      try {
        await contarTentativaInvalida(rota, request, resolvedores, deps);
      } catch (erro) {
        // Falha ao contar não derruba nada (a resposta já saiu), mas também não
        // some: um contador que para de contar é o teto voltando a não existir.
        deps.log(
          { operation_id: rota.operationId, err: String(erro) },
          'nao foi possivel contar a tentativa invalida',
        );
      }
    },
    handler,
  });
}

/** Os metodos declarados por caminho, em cada escopo administrativo. */
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
 *
 * Sem isto o `GET` do "nao fui eu" responderia 404, que e a resposta de "esta
 * rota nao existe": o painel, a borda e quem investiga um log leriam a coisa
 * errada, e a regra "so por POST" ficaria implicita. Chamado por
 * `escoparRotasAdministrativas` depois de todas as rotas do escopo, porque so
 * entao se sabe o que cada caminho declara.
 *
 * A rota de 405 nao tem `rotaDeclarada`, entao a guarda do escopo faz so as
 * duas primeiras conferencias: sem `X-Internal-Surface` continua 404 (D33), e
 * com `Authorization` continua 401 (D36). A superficie nao se revela a quem nao
 * veio pela borda administrativa.
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
      // A marca que `vigiarParametrosDasRotas` le para nao cobrar operacao do
      // contrato de uma rota que so existe para recusar o metodo.
      config: { metodoNaoPermitido: true },
      handler: async (_request, reply) => {
        void reply.header('Allow', permitidos);
        throw problemas.metodoNaoPermitido();
      },
    });
  }
}
