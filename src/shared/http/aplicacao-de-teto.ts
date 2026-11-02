import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { OnExceed, RateLimitEntry, RouteDefinition } from './route-definition.js';
import type { RateLimitStore } from '../ports/rate-limit-store.js';
import { ehJanelaVitalicia, janelaEmSegundos } from './rate-limit.js';
import { problemas, type AppError } from './errors.js';
import { hmacDeEnderecoIp } from '../crypto/digest.js';

/** As dimensões declaradas no contrato. */
export const DIMENSOES_CONHECIDAS = [
  'ip',
  'ip_24',
  'origin',
  'account',
  'code',
  'pet',
  /**
   * O CASO, que é a dimensão do reenvio do alerta (`resendLostCaseAlert`, um por
   * caso a cada 24 h).
   */
  'case',
  'email',
  'token_family',
  'finder_identity',
  /**
   * BICHUS-43. O par (conversa, participante), que é a dimensão em que o teto de 30
   * mensagens por hora conta.
   */
  'conversation_participant',
  'found_report',
  /**
   * **Presença de busca por texto, e NÃO o termo digitado.** Esta é a única dimensão
   * da lista cujo valor não identifica ninguém, e a diferença decide se o teto serve
   * para alguma coisa.
   */
  'q',
  /** BICHUS-41. O token do achador sem conta, que é a única identidade dele. */
  'finder_token',
  /** BICHUS-41. O alvo da denúncia, que é o par (conversa, papel denunciado). */
  'report_target',
] as const;

/** O valor que a dimensão `q` põe no balde quando há busca. */
export const MARCA_DE_BUSCA = 'busca';

export type Dimensao = (typeof DIMENSOES_CONHECIDAS)[number];

/** Dimensões que saem da requisição crua, sem conhecer domínio nem credencial. */
export const DIMENSOES_GENERICAS = ['ip', 'ip_24', 'origin', 'q'] as const;

export type DimensaoEspecifica = Exclude<Dimensao, (typeof DIMENSOES_GENERICAS)[number]>;

/** Resolve o valor de uma dimensão a partir da requisição. */
export type ResolvedorDeDimensao = (
  request: FastifyRequest,
  sigilo: Sigilo,
) => string | undefined | Promise<string | undefined>;

/** O que um resolvedor usa para não gravar identificador pessoal em claro. */
export interface Sigilo {
  /** HMAC com a chave de pseudonimização de borda, em base64url. */
  hmac(valor: string): string;
}

export type Resolvedores = Partial<Record<Dimensao, ResolvedorDeDimensao>>;

export interface DependenciasDoTeto {
  readonly contador: RateLimitStore;
  /** SEC-010: o endereço nunca vira chave de balde em claro. */
  readonly hmacDeIp: (ip: string | undefined) => Buffer | null;
  /** HMAC de um identificador qualquer, com a MESMA chave (`IP_HMAC_KEY`). */
  readonly hmacDeValor: (valor: string) => string;
  readonly log: (evento: Record<string, unknown>, mensagem: string) => void;
}

/**
 * Monta as dependências do teto a partir do contador e da chave de
 * pseudonimização.
 */
export function dependenciasDoTeto(entrada: {
  readonly contador: RateLimitStore;
  readonly chaveDeHmac: Buffer;
  readonly log: (evento: Record<string, unknown>, mensagem: string) => void;
}): DependenciasDoTeto {
  return {
    contador: entrada.contador,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, entrada.chaveDeHmac),
    hmacDeValor: (valor) =>
      createHmac('sha256', entrada.chaveDeHmac).update(valor, 'utf8').digest('base64url'),
    log: entrada.log,
  };
}

function ehContagemDeRequisicoes(entrada: RateLimitEntry): boolean {
  return entrada.counts === undefined || entrada.counts === 'requests';
}

export interface EntradaNaoAplicavel {
  readonly operationId: string;
  readonly entrada: RateLimitEntry;
  readonly motivo: string;
}

/** O que NÃO é aplicado, e por quê. */
export function inventariarNaoAplicaveis(
  rota: RouteDefinition,
): readonly EntradaNaoAplicavel[] {
  const fora: EntradaNaoAplicavel[] = [];
  for (const entrada of rota.rateLimit ?? []) {
    if (!ehContagemDeRequisicoes(entrada)) {
      fora.push({
        operationId: rota.operationId,
        entrada,
        motivo:
          entrada.counts === 'rows_returned'
            ? "counts: 'rows_returned' conta linhas devolvidas; a porta RateLimitStore conta requisições, e o teto é aplicado no caso de uso da operação"
            : `counts: '${String(entrada.counts)}' conta valores distintos, e a porta RateLimitStore conta requisições`,
      });
      continue;
    }
    if (entrada.when !== undefined) {
      fora.push({
        operationId: rota.operationId,
        entrada,
        motivo: `when: '${entrada.when}' condiciona o teto ao estado do pet, que é juízo de domínio e não da borda`,
      });
    }
  }
  return fora;
}

/** Entradas que este arquivo de fato aplica. */
export function entradasAplicaveis(rota: RouteDefinition): readonly RateLimitEntry[] {
  return (rota.rateLimit ?? []).filter(
    (entrada) => ehContagemDeRequisicoes(entrada) && entrada.when === undefined,
  );
}

/** Quando cada entrada pode ser aplicada. */
export type FaseDoTeto = 'entrada' | 'corpo';

const GENERICAS: ReadonlySet<string> = new Set<string>(DIMENSOES_GENERICAS);

export function faseDa(entrada: RateLimitEntry): FaseDoTeto {
  return entrada.dimension.every((nome) => GENERICAS.has(nome)) ? 'entrada' : 'corpo';
}

function sigiloDe(deps: DependenciasDoTeto): Sigilo {
  return { hmac: (valor) => deps.hmacDeValor(valor) };
}

function primeiroValor(bruto: unknown): string | undefined {
  if (typeof bruto === 'string' && bruto !== '') return bruto;
  return undefined;
}

/** Resolvedores das dimensões genéricas. */
export function resolvedoresGenericos(deps: DependenciasDoTeto): Resolvedores {
  const hmac = (valor: string | undefined): string | undefined => {
    const digerido = deps.hmacDeIp(valor);
    return digerido === null ? undefined : digerido.toString('base64url');
  };
  return {
    ip: (request) => hmac(request.ip),
    /**
     * **O rótulo do /24 vai por `hmacDeValor`, e NÃO por `hmacDeIp`.**
     *
     * `hmacDeIp` reduz o que recebe com `reduzirEnderecoIp` antes de digerir, e
     * `198.18.100.0/24` não é endereço: a função cai no ramo final e devolve a
     * constante `'desconhecido'`. Passando por ali, TODO /24 do produto virava
     * a MESMA chave, e o teto de `ip_24` deixava de ser por faixa para ser um
     * balde global da operação -- o `ip_24` de 30/h do cadastro era um teto de
     * 30 cadastros por hora no produto inteiro, e não por faixa.
     *
     * Medido na suíte de integração: a 31a conta de apoio era recusada, cada
     * uma vindo de um /24 diferente. Ficava invisível porque as entradas de
     * `ip_24` declaram `challenge` ou `log_and_alert`, que não recusavam nada.
     *
     * `hmacDeValor` usa a MESMA chave de pseudonimização e não reduz de novo,
     * então a faixa continua fora do balde em claro (SEC-010) e cada /24 ganha
     * a chave que o nome da dimensão promete.
     */
    ip_24: (request) => {
      const ip = request.ip;
      if (typeof ip !== 'string' || !ip.includes('.')) return undefined;
      const partes = ip.split('.');
      if (partes.length !== 4) return undefined;
      return deps.hmacDeValor(
        `ip24:${partes[0] ?? ''}.${partes[1] ?? ''}.${partes[2] ?? ''}.0/24`,
      );
    },
    origin: (request) => primeiroValor(request.headers['origin']),
    q: (request) => {
      const busca = (request.query as { q?: unknown } | undefined)?.q;
      return typeof busca === 'string' && busca.trim() !== '' ? MARCA_DE_BUSCA : undefined;
    },
  };
}

/** A chave do balde. Ela precisa identificar a POLÍTICA, e não só a dimensão. */
export function montarChave(
  operationId: string,
  entrada: RateLimitEntry,
  valores: readonly string[],
): string {
  const sufixo = entrada.appliesTo === undefined ? '' : `:${entrada.appliesTo}`;
  const janela = entrada.window.trim();
  const dono = entrada.bucket === undefined ? operationId : `bucket:${entrada.bucket}`;
  const politica = `${janela}:${String(entrada.limit)}:${entrada.onExceed}`;
  return `${dono}:${entrada.dimension.join('+')}@${politica}${sufixo}|${valores.join('|')}`;
}

/**
 * O que a ação de `on_exceed` faz com a requisição que ESTOUROU o teto.
 *
 * A fonte é a coluna "Aceita e grava?" da tabela de `on_exceed` em
 * `info.description` de `api/openapi.yaml`: a ação que aceita e grava só muda o
 * que se registra, notifica, agrupa, enfileira ou serve do cache — a requisição
 * é atendida. A ação que NÃO aceita tira do chamador o que ele pediu.
 */
export type SemanticaDoExcesso = 'recusa' | 'observa';

/**
 * A classificação das ações, uma a uma, contra aquela tabela.
 *
 * **O `Record<OnExceed, …>` é o portão de compilação:** ação nova no vocabulário
 * sem classificação aqui não compila, e por isso não consegue nascer como
 * liberação silenciosa. Era exatamente esse o defeito — `on_exceed` declarado e
 * não implementado virava "pode passar" sem nada acusar.
 */
export const SEMANTICA_DO_EXCESSO: Readonly<Record<OnExceed, SemanticaDoExcesso>> = {
  /** "responde do cache": o chamador recebe resposta, de outra fonte. */
  serve_cache: 'observa',
  /**
   * "sim, com desafio reCAPTCHA v3 na proxima carga" — MAS a requisição sem
   * `X-Captcha-Token` não tem carga seguinte onde o desafio caiba, e o contrato
   * fecha a lacuna: **`challenge` degenera em `deny_429` com `Retry-After`
   * naquela requisicao** (ADR-0020, camada 2). Logo, recusa — condicionada ao
   * cabeçalho, e é `temCaptcha` quem lê a condição.
   */
  challenge: 'recusa',
  log_and_alert: 'observa',
  group_notification: 'observa',
  notify_once_and_review: 'observa',
  notify_owner: 'observa',
  /** "sim, **nao notifica ninguem**, e abre revisao humana": aceita e grava. */
  hold_for_review: 'observa',
  accept_and_deduplicate: 'observa',
  /** "sim, o recurso e criado"; o que fica retido é o disparo, não o pedido. */
  accept_and_defer_dispatch: 'observa',
  raise_queue_priority: 'observa',
  /** "**nao**: recusa com `Retry-After`". */
  deny_429: 'recusa',
};

/**
 * As ações que recusam e que ESTE arquivo sabe recusar.
 *
 * O conjunto existe para ser comparado com `SEMANTICA_DO_EXCESSO` em
 * `conferirAcoesDeExcesso`: enquanto os dois lados concordam, nenhuma rota
 * declara freio que a borda não aplica.
 */
export const ACOES_QUE_RECUSAM_IMPLEMENTADAS: ReadonlySet<OnExceed> = new Set<OnExceed>([
  'deny_429',
  'challenge',
]);

/** O cabeçalho do desafio antiabuso, como o contrato o declara. */
export const CABECALHO_DE_CAPTCHA = 'x-captcha-token';

/** Há desafio respondido nesta requisição? */
function temCaptcha(request: FastifyRequest): boolean {
  const apresentado = request.headers[CABECALHO_DE_CAPTCHA];
  return typeof apresentado === 'string' && apresentado.trim() !== '';
}

/**
 * `on_exceed` decide o que acontece ao estourar.
 *
 * `deny_429` recusa sempre. `challenge` recusa QUANDO não há desafio para pedir:
 * é a degeneração do ADR-0020, e a razão dela está escrita no contrato —
 * "desafiar quem nao tem como responder e recusar sem dizer quando voltar".
 * Havendo `X-Captcha-Token`, o desafio tem onde ser cobrado e o pedido é
 * atendido (camada 1). As demais ações aceitam e gravam, então não recusam.
 */
function recusa(entrada: RateLimitEntry, request: FastifyRequest): boolean {
  if (SEMANTICA_DO_EXCESSO[entrada.onExceed] !== 'recusa') return false;
  if (entrada.onExceed === 'challenge') return !temCaptcha(request);
  return true;
}

/**
 * Reprova a SUBIDA quando a rota declara freio que a borda não aplica.
 *
 * O portão de compilação acima cobre a ação que ninguém classificou; este cobre
 * a ação classificada como `recusa` que ninguém implementou. Reprova nomeando a
 * rota e a ação, porque "não consegui aplicar" nunca é "aprovei".
 */
export function conferirAcoesDeExcesso(
  rota: RouteDefinition,
  implementadas: ReadonlySet<OnExceed> = ACOES_QUE_RECUSAM_IMPLEMENTADAS,
): void {
  for (const entrada of entradasAplicaveis(rota)) {
    if (SEMANTICA_DO_EXCESSO[entrada.onExceed] !== 'recusa') continue;
    if (!implementadas.has(entrada.onExceed)) {
      throw new Error(
        `Rota ${rota.operationId}: \`on_exceed: '${entrada.onExceed}'\` recusa, segundo a tabela ` +
          'de `on_exceed` do contrato, e a borda nao sabe aplicar essa recusa. Teto declarado e ' +
          'nao aplicado seria liberacao silenciosa: implemente a recusa em `aplicacao-de-teto.ts` ' +
          'e inclua a acao em `ACOES_QUE_RECUSAM_IMPLEMENTADAS`, ou declare uma acao que observa.',
      );
    }
    if (entrada.onExceed === 'challenge' && rota.noChallenge === true) {
      throw new Error(
        `Rota ${rota.operationId}: \`on_exceed: 'challenge'\` numa operacao com ` +
          '`x-no-challenge: true`. Chamada em segundo plano nao tem quem responda ao desafio, ' +
          'entao o challenge degenera em recusa e o efeito real e a sessao morrer em silencio ' +
          '(contrato, tabela de `on_exceed`). Essas operacoes levam `log_and_alert`.',
      );
    }
  }
}

export interface ResultadoDaAplicacao {
  /** Quando presente, a requisição precisa ser recusada com este erro. */
  readonly erro?: AppError;
}

function erroDeTeto(entrada: RateLimitEntry, segundos: number | undefined): AppError {
  if (ehJanelaVitalicia(entrada.window)) return problemas.limiteSemReabertura();
  return problemas.limiteDeChamadas(segundos ?? 1);
}

/** Aplica as entradas que contam TODA requisição. */
export async function aplicarNaEntrada(
  rota: RouteDefinition,
  request: FastifyRequest,
  resolvedores: Resolvedores,
  deps: DependenciasDoTeto,
  fase: FaseDoTeto,
): Promise<ResultadoDaAplicacao> {
  for (const entrada of entradasAplicaveis(rota)) {
    if (faseDa(entrada) !== fase) continue;
    const valores = await resolverValores(entrada, request, resolvedores, sigiloDe(deps));
    if (valores === undefined) continue;
    const chave = montarChave(rota.operationId, entrada, valores);
    const janela = janelaEmSegundos(entrada.window);

    if (entrada.appliesTo === 'invalid_attempts') {
      const decisao = await deps.contador.peek(chave, entrada.limit, janela);
      if (!decisao.allowed) {
        deps.log(
          { operation_id: rota.operationId, dimension: entrada.dimension, on_exceed: entrada.onExceed },
          'teto de tentativas invalidas atingido',
        );
        if (recusa(entrada, request)) return { erro: erroDeTeto(entrada, decisao.retryAfterSeconds) };
      }
      continue;
    }

    const decisao = await deps.contador.hit(chave, entrada.limit, janela);
    if (!decisao.allowed) {
      deps.log(
        { operation_id: rota.operationId, dimension: entrada.dimension, on_exceed: entrada.onExceed },
        'teto de chamada atingido',
      );
      if (recusa(entrada, request)) return { erro: erroDeTeto(entrada, decisao.retryAfterSeconds) };
    }
  }
  return {};
}

/** Conta a tentativa que se revelou INVÁLIDA, depois do fato. */
export async function contarTentativaInvalida(
  rota: RouteDefinition,
  request: FastifyRequest,
  resolvedores: Resolvedores,
  deps: DependenciasDoTeto,
): Promise<void> {
  for (const entrada of entradasAplicaveis(rota)) {
    if (entrada.appliesTo !== 'invalid_attempts') continue;
    const valores = await resolverValores(entrada, request, resolvedores, sigiloDe(deps));
    if (valores === undefined) continue;
    await deps.contador.hit(
      montarChave(rota.operationId, entrada, valores),
      entrada.limit,
      janelaEmSegundos(entrada.window),
    );
  }
}

async function resolverValores(
  entrada: RateLimitEntry,
  request: FastifyRequest,
  resolvedores: Resolvedores,
  sigilo: Sigilo,
): Promise<readonly string[] | undefined> {
  const valores: string[] = [];
  for (const nome of entrada.dimension) {
    const resolvedor = resolvedores[nome as Dimensao];
    if (resolvedor === undefined) return undefined;
    const valor = await resolvedor(request, sigilo);
    if (valor === undefined || valor === '') return undefined;
    valores.push(valor);
  }
  return valores;
}
