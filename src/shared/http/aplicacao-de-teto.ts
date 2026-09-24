/**
 * Aplicação do teto de chamada declarado em `x-rate-limit`.
 *
 * ## O defeito que este arquivo fecha
 *
 * Até 21/09/2026 **nenhuma rota aplicava teto**. A porta `RateLimitStore`
 * existia, as três implementações existiam, `defineRoute` obrigava toda rota
 * com efeito a DECLARAR `rateLimit` sob pena de erro de compilação, e o
 * contrato declarava os tetos em 80 operações. E `hit()` não era chamado em
 * lugar nenhum fora de teste.
 *
 * **Por que o mecanismo que obriga a declarar nunca chegou ao que aplica** — e
 * esta é a resposta que impede o defeito de voltar: `defineRoute` é uma
 * restrição de TIPO sobre um objeto, e o tipo garante que a propriedade
 * `rateLimit` exista. Ele não tem como garantir que alguém a LEIA. O registro
 * era `app.post(rota.path, handler)`, que consome `rota.path` e mais nada: a
 * declaração e a aplicação eram dois atos separados, ligados só por uma string.
 * O teto ficava declarado no objeto e o objeto passava inteiro pela borda sem
 * ninguém abrir. Nenhum portão pegava, porque o portão da esteira lê
 * `api/openapi.yaml` e nunca abre `src/`.
 *
 * A correção, do ADR-0016 emenda 1: *"o defeito não é que alguém esqueceu de
 * chamar `hit()`: é que era possível esquecer."* Por isso a aplicação não é uma
 * chamada que o autor da rota faz — é o próprio registro da rota
 * (`registrar-rota.ts`), e uma rota registrada sem os seus tetos deixa de ser
 * exprimível.
 *
 * ## O que este arquivo aplica, e o que ele RECUSA aplicar em silêncio
 *
 * `counts: 'requests'` (o padrão) é contagem de requisições, e é o que a porta
 * `hit()` sabe fazer. `counts: 'distinct_identities'` e `'distinct_emails'`
 * contam VALORES DISTINTOS, que é outro algoritmo e outra estrutura; `when:`
 * condiciona o teto ao estado do pet, que é juízo de domínio. Nenhum dos dois é
 * exprimível pela porta de hoje.
 *
 * Aplicar os que dá e calar sobre os que não dá seria repetir exatamente o
 * defeito que este arquivo conserta, uma camada abaixo. Então:
 * `inventariarNaoAplicaveis` devolve cada entrada não aplicada, com o motivo, e
 * a subida IMPRIME a lista. O que não vale, vale dito.
 */
import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { RateLimitEntry, RouteDefinition } from './route-definition.js';
import type { RateLimitStore } from '../ports/rate-limit-store.js';
import { ehJanelaVitalicia, janelaEmSegundos } from './rate-limit.js';
import { problemas, type AppError } from './errors.js';
import { hmacDeEnderecoIp } from '../crypto/digest.js';

/**
 * As dimensões declaradas no contrato. Onze, e não as seis que a BICHUS-178
 * lista: `ip_24`, `origin`, `pet` e `found_report` também são declaradas hoje,
 * e `conversation_participant` entrou com a BICHUS-43.
 *
 * A lista cresce quando uma rota que declara a dimensão passa a existir, e não
 * quando o contrato passa a declará-la: uma dimensão aqui sem rota que a use
 * seria um nome que nada resolve, e `registrar-rota.ts` deixaria de acusar a
 * falta do resolvedor em tempo de compilação para justamente essa.
 */
export const DIMENSOES_CONHECIDAS = [
  'ip',
  'ip_24',
  'origin',
  'account',
  'code',
  'pet',
  'email',
  'token_family',
  'finder_identity',
  /**
   * BICHUS-43. O par (conversa, participante), que é a dimensão em que o teto
   * de 30 mensagens por hora conta. Não é `account`: duas conversas da mesma
   * pessoa são dois baldes, senão quem está combinando a devolução de dois
   * animais ao mesmo tempo seria recusado por estar usando o produto.
   */
  'conversation_participant',
  // BICHUS-35. O teto de três fotos por aviso do achador (SEC-009) é por AVISO e
  // não por conta: a mesma pessoa pode registrar vários achados, e um teto por
  // conta faria o segundo animal da noite ficar sem foto nenhuma.
  'found_report',
] as const;

export type Dimensao = (typeof DIMENSOES_CONHECIDAS)[number];

/**
 * Dimensões que saem da requisição crua, sem conhecer domínio nem credencial.
 * Estas o registro resolve sozinho; as demais o autor da rota precisa fornecer,
 * e a falta é erro de compilação (ver `registrar-rota.ts`).
 */
export const DIMENSOES_GENERICAS = ['ip', 'ip_24', 'origin'] as const;

export type DimensaoEspecifica = Exclude<Dimensao, (typeof DIMENSOES_GENERICAS)[number]>;

/**
 * Resolve o valor de uma dimensão a partir da requisição.
 *
 * Devolver `undefined` significa "esta requisição não tem esta dimensão" — por
 * exemplo, `email` numa requisição sem corpo. Nesse caso a entrada é PULADA, e
 * isso é correto: contar todo mundo num balde `email=undefined` juntaria
 * pessoas que não têm relação nenhuma.
 */
export type ResolvedorDeDimensao = (
  request: FastifyRequest,
  sigilo: Sigilo,
) => string | undefined | Promise<string | undefined>;

/**
 * O que um resolvedor usa para não gravar identificador pessoal em claro.
 *
 * A chave do balde vai para `rate_limit_counters.bucket_key`, no Postgres. Ela
 * é lida por quem opera o banco, viaja em despejo de diagnóstico e **sobrevive
 * à exclusão da conta**. `email`, `code` e `finder_identity` em claro ali
 * desfazem a promessa de privacidade num lugar onde ninguém vai procurá-la —
 * o mesmo argumento que o SEC-010 faz para o IP, e que vale igual para os
 * demais identificadores.
 *
 * `account` e `pet` são exceção declarada: são UUID interno, que já é o que a
 * tabela de trilha guarda, e trocá-los por um resumo tornaria impossível
 * responder "qual conta bateu no teto" numa investigação. O ADR-0010 proíbe
 * UUID interno em **saída pública**, e `bucket_key` não sai em resposta nenhuma.
 */
export interface Sigilo {
  /** HMAC com a chave de pseudonimização de borda, em base64url. */
  hmac(valor: string): string;
}

export type Resolvedores = Partial<Record<Dimensao, ResolvedorDeDimensao>>;

export interface DependenciasDoTeto {
  readonly contador: RateLimitStore;
  /**
   * SEC-010: o endereço nunca vira chave de balde em claro. O balde viaja para
   * o Postgres em `rate_limit_counters.bucket_key`, é lido por quem opera o
   * banco e sobrevive à exclusão da conta — o IP em claro ali desfaz a promessa
   * num lugar onde ninguém vai procurá-la.
   */
  readonly hmacDeIp: (ip: string | undefined) => Buffer | null;
  /**
   * HMAC de um identificador qualquer, com a MESMA chave (`IP_HMAC_KEY`).
   *
   * A chave é de pseudonimização de borda e não é específica de IP: um segundo
   * segredo com o mesmo propósito seria mais uma variável obrigatória para
   * alguém esquecer, e o modo de falha do esquecimento aqui é gravar o valor em
   * claro — que é justamente o que se quer impedir.
   */
  readonly hmacDeValor: (valor: string) => string;
  readonly log: (evento: Record<string, unknown>, mensagem: string) => void;
}

/**
 * Monta as dependências do teto a partir do contador e da chave de
 * pseudonimização.
 *
 * Existe para que `api.ts` e todo cenário de teste montem o MESMO objeto. Um
 * teste que montasse o seu próprio `hmacDeValor` estaria exercitando outra chave
 * de balde que a produção, e o teste passaria sobre um mecanismo que não é o que
 * roda.
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

/** `counts` que a porta sabe contar. Os demais são inventariados, não aplicados. */
function ehContagemDeRequisicoes(entrada: RateLimitEntry): boolean {
  return entrada.counts === undefined || entrada.counts === 'requests';
}

export interface EntradaNaoAplicavel {
  readonly operationId: string;
  readonly entrada: RateLimitEntry;
  readonly motivo: string;
}

/**
 * O que NÃO é aplicado, e por quê. A subida imprime isto.
 *
 * Lista de exceção que ninguém vê é lista que cresce — e, pior, é exatamente a
 * forma do defeito original: uma proteção que se acredita existir.
 */
export function inventariarNaoAplicaveis(
  rota: RouteDefinition,
): readonly EntradaNaoAplicavel[] {
  const fora: EntradaNaoAplicavel[] = [];
  for (const entrada of rota.rateLimit ?? []) {
    if (!ehContagemDeRequisicoes(entrada)) {
      fora.push({
        operationId: rota.operationId,
        entrada,
        motivo: `counts: '${String(entrada.counts)}' conta valores distintos, e a porta RateLimitStore conta requisições`,
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

/**
 * Quando cada entrada pode ser aplicada.
 *
 * O Fastify não parseia o corpo antes de `onRequest`, então uma entrada por
 * `email` (que sai do corpo) simplesmente não tem o que ler ali. E uma entrada
 * por `ip` precisa ser aplicada em `onRequest`, antes de tudo: é isso que faz o
 * 21º pedido inválido ao webhook ser recusado **sem que a assinatura seja
 * conferida**, porque a conferência dele também mora em `onRequest`.
 *
 * Por isso duas fases, decididas pela própria dimensão e não por escolha de
 * quem escreve a rota:
 *
 * - `entrada` — todas as dimensões saem da requisição crua (`ip`, `ip_24`,
 *   `origin`). Roda em `onRequest`, antes de parsear qualquer byte;
 * - `corpo` — alguma dimensão precisa do corpo ou da credencial (`account`,
 *   `email`, `token_family`, `code`, `pet`, `finder_identity`,
 *   `conversation_participant`). Roda em
 *   `preValidation`, que é depois do parse e **antes** da validação de schema:
 *   corpo malformado também consome o teto, e não vira um caminho de graça.
 */
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

/**
 * Resolvedores das dimensões genéricas.
 *
 * `ip_24` é a faixa /24, e ela existe porque **teto por IP puro é armadilha no
 * Brasil**: o CGNAT das operadoras agrupa muita gente atrás de poucos
 * endereços. A faixa é derivada do endereço já reduzido e depois passa pelo
 * mesmo HMAC — uma faixa em claro é tão identificadora quanto o endereço para
 * quem tem a tabela de alocação.
 */
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
  };
}

/**
 * A chave do balde. A dimensão entra no nome para que dois tetos não se somem.
 *
 * **A janela entra pelo mesmo motivo, e a falta dela era um defeito de relógio.**
 * `postConversationMessage` declara duas entradas na MESMA dimensão
 * (`conversation_participant`): 30 por hora e 200 por 24 h. Sem a janela no
 * nome, as duas montavam a mesma `bucketKey`. O contador ainda separava os
 * baldes pelo início da janela — até o instante em que os dois inícios
 * coincidem, que é **toda madrugada entre 00:00 e 01:00 UTC** (21h no Brasil,
 * horário de pico). Nessa hora as duas entradas passavam a incrementar o mesmo
 * balde, duas vezes por requisição, e o teto de 30 recusava na 16ª.
 *
 * O sintoma é raro e volta todo dia, que é o pior formato: some antes de alguém
 * conseguir olhar. Encontrado porque a suíte deste repositório reprovou às
 * 00:03 UTC com "a 16ª foi recusada cedo demais".
 *
 * Trocar a chave **zera os contadores uma vez**, no deploy. É o custo certo: o
 * contador antigo estava somando entradas que não deviam se somar.
 */
export function montarChave(
  operationId: string,
  entrada: RateLimitEntry,
  valores: readonly string[],
): string {
  const sufixo = entrada.appliesTo === undefined ? '' : `:${entrada.appliesTo}`;
  const janela = entrada.window.trim();
  // O balde compartilhado entra NO LUGAR da operacao, e so ele (D52): a chave
  // passa a ser (balde, dimensao, janela, valor), e todas as operacoes que
  // declaram o mesmo balde somam no mesmo contador. Com `bucket:` como prefixo
  // proprio, nenhum `operationId` consegue colidir com um balde.
  const dono = entrada.bucket === undefined ? operationId : `bucket:${entrada.bucket}`;
  return `${dono}:${entrada.dimension.join('+')}@${janela}${sufixo}|${valores.join('|')}`;
}

/**
 * `on_exceed` decide o que acontece ao estourar, e só `deny_429` recusa.
 *
 * Os demais são observação ou trabalho de domínio (`serve_cache`,
 * `notify_owner`, `group_notification`, ...) e NÃO viram 429: transformar
 * `log_and_alert` em recusa mudaria a política declarada no contrato, que é a
 * fonte do número e do comportamento.
 *
 * `challenge` também não recusa aqui. Não há quem responda ao desafio hoje, e
 * a rota que não pode recebê-lo já declara `noChallenge`. Tratá-lo como 429
 * seria endurecer o cadastro e o login além do que o contrato promete.
 */
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
 *
 * **Qual dos dois construtores depende da janela, não do número.** Janela
 * `lifetime` não reabre, e `decisao.retryAfterSeconds` ali é o teto de formato
 * de 24 h de `rate-limit.ts` — obedecê-lo no texto faria a resposta prometer
 * uma reabertura que não acontece.
 */
function erroDeTeto(entrada: RateLimitEntry, segundos: number | undefined): AppError {
  if (ehJanelaVitalicia(entrada.window)) return problemas.limiteSemReabertura();
  return problemas.limiteDeChamadas(segundos ?? 1);
}

/**
 * Aplica as entradas que contam TODA requisição.
 *
 * Roda antes do handler. Entrada com `appliesTo: 'invalid_attempts'` não é
 * contada aqui — ela é só CONSULTADA, porque incrementá-la na entrada contaria
 * a tentativa válida junto e o critério 8 da BICHUS-178 existe para impedir
 * isso.
 */
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
      // CONSULTA, não incremento. É isto que faz o 21º pedido inválido receber
      // 429 **sem que a assinatura seja conferida**: quando o balde já está no
      // teto, a recusa acontece antes de qualquer trabalho caro.
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

/**
 * Conta a tentativa que se revelou INVÁLIDA, depois do fato.
 *
 * Chamada pelo registro quando o handler (ou um hook) recusa a requisição. A
 * tentativa válida nunca chega aqui, e é isso que o critério 8 cobra.
 */
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

/**
 * Resolve todos os valores da dimensão composta.
 *
 * Basta um componente ausente para a entrada inteira ser pulada: um par
 * `['ip', 'code']` com `code` indefinido não é "o teto de IP", é outro teto.
 */
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
