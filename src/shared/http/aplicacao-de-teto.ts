/** Aplicação do teto de chamada declarado em `x-rate-limit`. */
import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { RateLimitEntry, RouteDefinition } from './route-definition.js';
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

/** `counts` que a porta sabe contar. */
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
    ip_24: (request) => {
      const ip = request.ip;
      if (typeof ip !== 'string' || !ip.includes('.')) return undefined;
      const partes = ip.split('.');
      if (partes.length !== 4) return undefined;
      return hmac(`${partes[0] ?? ''}.${partes[1] ?? ''}.${partes[2] ?? ''}.0/24`);
    },
    origin: (request) => primeiroValor(request.headers['origin']),
    /**
     * **A marca constante, nunca o termo.** O raciocínio inteiro está na declaração de
     * `q` em `DIMENSOES_CONHECIDAS`; aqui fica a consequência que se lê no código:
     * `MARCA_DE_BUSCA` não depende de `busca`, então a chave do balde é a mesma para
     * todo termo, e variar o termo não zera contagem nenhuma.
     */
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

/** `on_exceed` decide o que acontece ao estourar, e só `deny_429` recusa. */
function recusa(entrada: RateLimitEntry): boolean {
  return entrada.onExceed === 'deny_429';
}

export interface ResultadoDaAplicacao {
  /** Quando presente, a requisição precisa ser recusada com este erro. */
  readonly erro?: AppError;
}

/**
 * O 429 sai pelo construtor canônico de `errors.ts`, e não por um `AppError`
 * montado aqui: título, `detail` e `type` do 429 já são contrato, e uma segunda
 * redação deles divergiria da primeira sem nada acusar.
 */
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
        if (recusa(entrada)) return { erro: erroDeTeto(entrada, decisao.retryAfterSeconds) };
      }
      continue;
    }

    const decisao = await deps.contador.hit(chave, entrada.limit, janela);
    if (!decisao.allowed) {
      deps.log(
        { operation_id: rota.operationId, dimension: entrada.dimension, on_exceed: entrada.onExceed },
        'teto de chamada atingido',
      );
      if (recusa(entrada)) return { erro: erroDeTeto(entrada, decisao.retryAfterSeconds) };
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

/** Resolve todos os valores da dimensão composta. */
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
