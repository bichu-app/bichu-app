/**
 * **A guarda do prefixo `/v1/admin`, uma vez so** (ADR-0027 itens 1, 2, 3 e 7;
 * D33, D36, D37 e D39 de `docs/04-seguranca.md`).
 *
 * ## O que ela confere, e em que ordem
 *
 * ```
 * 1. X-Internal-Surface: admin        ausente -> 404  (D33: rota esquecida na borda, porta direta)
 * 2. Authorization presente           -> 401          (D36: o Bearer do app nunca vale aqui, nem de admin)
 * 3. rota sem sessao (lista fechada)  Origin exato em metodo nao seguro, e acabou
 * 4. cookie __Host-bichu_adm          ausente/invalido/vencido -> 401   (D38, lido no banco)
 * 5. metodo nao seguro                Origin exato e X-CSRF-Token da sessao -> senao 403 (D39)
 * 6. papel                            a conta tem um dos `adminRoles` da rota? senao 403 (D37)
 * ```
 *
 * A ordem 1-2 vem antes de qualquer leitura de banco: a requisicao que nem
 * devia ter chegado aqui nao custa consulta. A 6 vem antes do manipulador, e
 * portanto antes de qualquer leitura do recurso: o 403 nao diz nada sobre ele.
 *
 * ## Onde ela mora, e por que isso e o controle
 *
 * `escoparRotasAdministrativas` abre o escopo e instala a guarda num gancho
 * `onRequest` do escopo, que o framework roda antes dos ganchos de cada rota.
 * `registrarRota` recusa, na subida: rota com `adminRoles`/`adminPublic` fora
 * deste escopo; rota deste escopo sem nenhum dos dois; e rota cujo caminho nao
 * comeca com `/admin/` (ou que comeca, fora dele). Rota administrativa sem
 * guarda deixa de ser exprimivel, e nao depende de alguem lembrar.
 *
 * ## O que ela NAO sabe
 *
 * Nada de sessao, conta ou papel e decidido aqui: isso e do modulo
 * `admin-access`, que entrega `PortaDaSessaoAdministrativa`. `shared/http`
 * continua sem conhecer dominio, na mesma direcao de dependencia do verificador
 * de reautenticacao do app.
 */
import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
} from 'fastify';

import { hashDeToken, iguaisEmTempoConstante } from '../crypto/digest.js';
import type { AdminAccountId } from '../types/brands.js';
import { problemas } from './errors.js';
import { fecharMetodosDaSuperficie, type RegistradorDeRotas } from './registrar-rota.js';
import type {
  EscopoDeReautenticacaoAdministrativa,
  PapelAdministrativo,
  RouteDefinition,
} from './route-definition.js';

/** O cabecalho que so a borda de `admin.bichu.app` define (D33). Minusculo, como o Fastify o entrega. */
export const CABECALHO_DA_SUPERFICIE = 'x-internal-surface';
export const VALOR_DA_SUPERFICIE_ADMINISTRATIVA = 'admin';
/** O nome do cookie e irreversivel na pratica (ADR-0027, consequencias). */
export const COOKIE_DA_SESSAO_ADMINISTRATIVA = '__Host-bichu_adm';
export const CABECALHO_ANTI_CSRF = 'x-csrf-token';
export const CABECALHO_DE_REAUTENTICACAO_ADMINISTRATIVA = 'x-admin-reauth-token';
/** O prefixo das operacoes administrativas no contrato (servidor `/v1`). */
export const PREFIXO_ADMINISTRATIVO = '/admin/';

const METODOS_SEGUROS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

/**
 * As UNICAS operacoes do prefixo que dispensam sessao, por lista fechada
 * (ADR-0027 itens 7 e 20.5): o login, que ainda nao tem sessao, e o "nao fui
 * eu", que existe justamente para quem pode ter perdido a dela.
 * `registrarRota` recusa `adminPublic` em qualquer outra, e
 * `portao-contrato-administrativo` recusa no contrato uma terceira operacao
 * sem `adminSession`.
 */
export const OPERACOES_ADMINISTRATIVAS_SEM_SESSAO: readonly string[] = [
  'openAdminSession',
  'disavowAdminSessionAlert',
];

/** A sessao que a guarda conferiu, pendurada na requisicao para a rota. */
export interface SessaoAdministrativaConferida {
  readonly sessionId: string;
  /** `admin_accounts.id`. Nunca um `UserId`: a conta do painel nao e conta do app. */
  readonly adminAccountId: AdminAccountId;
  readonly displayName: string;
  /** Os papeis da conta, lidos do banco NESTA requisicao (D37). */
  readonly papeis: readonly string[];
  /** SHA-256 do token anti-CSRF da sessao. O valor em claro nao fica guardado. */
  readonly csrfTokenHash: Buffer;
  /** Oito primeiros bytes do hash da sessao, em hexadecimal: o que vai na trilha. */
  readonly etiqueta: string;
  /** O instante da senha (`created_at`). A rotacao o herda; o teto conta dele. */
  readonly instanteDaSenha: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export interface ContextoDaGuarda {
  readonly correlationId: string;
  readonly ip: string | undefined;
  readonly userAgent: string | undefined;
}

/** Por que a guarda recusou uma conta ja identificada. Vai para a trilha, nunca para a resposta. */
export type MotivoDaRecusaDaGuarda = 'origin_mismatch' | 'csrf_mismatch' | 'role_missing' | 'account_disabled';

/**
 * O que a guarda precisa do modulo `admin-access`.
 *
 * Todas recusam **lancando** `AppError`. Devolver booleano deixaria o chamador
 * esquecer de olhar, que e a forma do defeito que a guarda existe para fechar.
 */
export interface PortaDaSessaoAdministrativa {
  /**
   * Confere o valor do cookie no banco: existe, nao revogada, dentro dos dois
   * prazos, posterior a `admin_accounts.sessions_invalid_before`. Renova a
   * inatividade (no maximo uma escrita por minuto). Recusa com 401; conta
   * desativada recusa com 403, depois de revogar as sessoes dela.
   */
  conferir(valorDoCookie: string, contexto: ContextoDaGuarda): Promise<SessaoAdministrativaConferida>;
  /**
   * A guarda recusou uma conta identificada. Grava `admin.guard.denied` na
   * trilha (ADR-0027 item 8). Conta desativada perde todas as sessoes
   * (`account_disabled`); quando o motivo e papel e a conta ja nao tem papel
   * NENHUM que abra sessao, elas sao revogadas com `account_invalidated` (D38).
   */
  registrarRecusa(
    sessao: SessaoAdministrativaConferida,
    motivo: MotivoDaRecusaDaGuarda,
    contexto: ContextoDaGuarda,
  ): Promise<void>;
  /**
   * Confere e CONSOME `X-Admin-Reauth-Token` para o escopo, preso a esta
   * sessao. Recusa com `401 reauthentication-required`.
   */
  consumirReautenticacao(
    sessao: SessaoAdministrativaConferida,
    escopo: EscopoDeReautenticacaoAdministrativa,
    tokenApresentado: string | undefined,
    contexto: ContextoDaGuarda,
  ): Promise<void>;
}

export interface OpcoesDaSuperficieAdministrativa {
  /** `ADMIN_ORIGIN`, a origem exata do painel (em producao, o host `admin.bichu.app` com esquema https). */
  readonly origem: string;
  readonly sessoes: PortaDaSessaoAdministrativa;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** So existe dentro do escopo aberto por `escoparRotasAdministrativas`. */
    superficieAdministrativa?: OpcoesDaSuperficieAdministrativa;
  }
  interface FastifyRequest {
    /** Preenchida pela guarda, antes de qualquer gancho da rota. */
    sessaoAdministrativa?: SessaoAdministrativaConferida;
  }
}

export function contextoDaGuarda(request: FastifyRequest): ContextoDaGuarda {
  const agente = request.headers['user-agent'];
  return {
    correlationId: request.id,
    ip: request.ip,
    userAgent: typeof agente === 'string' ? agente : undefined,
  };
}

/**
 * O valor do cookie da sessao, lido do cabecalho `Cookie` cru.
 *
 * Sem `@fastify/cookie`: e um nome so, lido num lugar so. O primeiro par com o
 * nome exato vence; o prefixo `__Host-` e o que impede um subdominio irmao de
 * plantar um segundo (RFC 6265bis).
 */
export function lerCookieDaSessao(cabecalho: string | undefined): string | undefined {
  if (cabecalho === undefined) return undefined;
  for (const par of cabecalho.split(';')) {
    const igual = par.indexOf('=');
    if (igual === -1) continue;
    if (par.slice(0, igual).trim() !== COOKIE_DA_SESSAO_ADMINISTRATIVA) continue;
    const valor = par.slice(igual + 1).trim();
    return valor === '' ? undefined : valor;
  }
  return undefined;
}

/**
 * O `Set-Cookie` da sessao, com a forma exata de D35: `__Host-`, `Path=/`,
 * `Secure`, `HttpOnly`, `SameSite=Strict`, **sem `Domain`, sem `Expires`, sem
 * `Max-Age`**. O cookie morre com o navegador; os prazos reais sao do servidor.
 * Nao ha variavel que desligue `Secure` (ADR-0027 item 2).
 */
export function cookieDaSessao(valor: string): string {
  return `${COOKIE_DA_SESSAO_ADMINISTRATIVA}=${valor}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

/** O `Set-Cookie` que apaga o cookie no logout. `Max-Age=0` aqui e remocao, nao prazo. */
export function cookieQueApagaASessao(): string {
  return `${COOKIE_DA_SESSAO_ADMINISTRATIVA}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

/** A sessao que a guarda pendurou. Rota do prefixo que chega aqui sem ela e defeito de fiacao. */
export function sessaoAdministrativaDe(request: FastifyRequest): SessaoAdministrativaConferida {
  const sessao = request.sessaoAdministrativa;
  if (sessao === undefined) {
    throw new Error(
      'Rota administrativa sem sessao conferida: ela nao passou pela guarda do prefixo. ' +
        'Registre-a por escoparRotasAdministrativas (src/shared/http/superficie-administrativa.ts).',
    );
  }
  return sessao;
}

/** O ator da trilha administrativa, na forma que `eventoAdministrativo` recebe. */
export function atorAdministrativoDe(request: FastifyRequest): {
  readonly adminAccountId: AdminAccountId;
  readonly ip: string | undefined;
  readonly correlationId: string;
  readonly sessao: string;
} {
  const sessao = sessaoAdministrativaDe(request);
  return { adminAccountId: sessao.adminAccountId, ip: request.ip, correlationId: request.id, sessao: sessao.etiqueta };
}

function tokenAntiCsrfConfere(request: FastifyRequest, sessao: SessaoAdministrativaConferida): boolean {
  const apresentado = request.headers[CABECALHO_ANTI_CSRF];
  if (typeof apresentado !== 'string' || apresentado === '') return false;
  return iguaisEmTempoConstante(hashDeToken(apresentado), sessao.csrfTokenHash);
}

function papelConfere(rota: RouteDefinition, sessao: SessaoAdministrativaConferida): boolean {
  const exigidos: readonly PapelAdministrativo[] = rota.adminRoles ?? [];
  return exigidos.some((papel) => sessao.papeis.includes(papel));
}

/**
 * A declaracao da rota, que `registrarRota` pendura em `config.rotaDeclarada`.
 * Lida por conversao, e nao por ampliacao de `FastifyContextConfig`: ampliar o
 * tipo o tornaria estrito para as outras rotas, que usam `config` para outra
 * coisa.
 */
export function rotaDeclaradaDe(request: FastifyRequest): RouteDefinition | undefined {
  return (request.routeOptions.config as { rotaDeclarada?: RouteDefinition }).rotaDeclarada;
}

function criarGuarda(opcoes: OpcoesDaSuperficieAdministrativa): onRequestAsyncHookHandler {
  return async (request) => {
    // 1. D33. 404 e nao 401: fora do host administrativo esta superficie nao existe.
    if (request.headers[CABECALHO_DA_SUPERFICIE] !== VALOR_DA_SUPERFICIE_ADMINISTRATIVA) {
      throw problemas.naoEncontrado();
    }
    // 2. D36. Qualquer `Authorization`, com ou sem cookie junto, e com JWT
    // valido de conta `admin` inclusive: o painel nunca manda este cabecalho.
    if (request.headers.authorization !== undefined) throw problemas.naoAutenticado();

    const rota = rotaDeclaradaDe(request);
    if (rota === undefined) {
      // So o 404 do framework chega aqui sem declaracao, e ele nao tem o que proteger.
      return;
    }
    const inseguro = !METODOS_SEGUROS.has(request.method);
    const origemConfere = request.headers.origin === opcoes.origem;

    // 3. O login e o "nao fui eu". Sem sessao para conferir, mas com Origin:
    // sem isso uma pagina de subdominio irmao faria login com a credencial que
    // ela tiver (login CSRF), ou derrubaria as sessoes de alguem com um token
    // que ela tenha visto passar.
    if (rota.adminPublic === true) {
      if (inseguro && !origemConfere) throw problemas.proibidoNoPainel();
      return;
    }

    // 4. A sessao, lida no banco a cada requisicao (D37, D38).
    const valor = lerCookieDaSessao(request.headers.cookie);
    if (valor === undefined) throw problemas.naoAutenticado();
    const contexto = contextoDaGuarda(request);
    const sessao = await opcoes.sessoes.conferir(valor, contexto);
    request.sessaoAdministrativa = sessao;

    // 5. D39, as duas camadas.
    if (inseguro) {
      if (!origemConfere) {
        await opcoes.sessoes.registrarRecusa(sessao, 'origin_mismatch', contexto);
        throw problemas.proibidoNoPainel();
      }
      if (!tokenAntiCsrfConfere(request, sessao)) {
        await opcoes.sessoes.registrarRecusa(sessao, 'csrf_mismatch', contexto);
        throw problemas.proibidoNoPainel();
      }
    }

    // 6. D37. Papel lido do banco agora, contra o papel minimo da operacao.
    if (!papelConfere(rota, sessao)) {
      await opcoes.sessoes.registrarRecusa(sessao, 'role_missing', contexto);
      throw problemas.proibidoNoPainel();
    }
  };
}

/**
 * Abre o escopo das rotas administrativas **dentro** do escopo `/v1` e instala
 * a guarda nele.
 *
 * O escopo nao acrescenta prefixo: as rotas declaram o caminho completo do
 * contrato (`/admin/auth/login`), que e o que o portao de contrato compara.
 */
export function escoparRotasAdministrativas(
  app: RegistradorDeRotas,
  opcoes: OpcoesDaSuperficieAdministrativa,
  montar: (registrador: RegistradorDeRotas) => void,
): void {
  if (!/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/.test(opcoes.origem) && !/^http:\/\/localhost(:\d{1,5})?$/.test(opcoes.origem)) {
    throw new Error(
      `ADMIN_ORIGIN '${opcoes.origem}' nao e uma origem exata (esquema, host e porta, sem caminho). ` +
        'A conferencia de Origin compara texto inteiro, e uma origem malformada recusaria tudo ' +
        'ou, pior, casaria com o que nao devia (D39).',
    );
  }
  const plugin: FastifyPluginCallback = (escopo, _opcoes, pronto) => {
    escopo.decorate('superficieAdministrativa', opcoes);
    escopo.addHook('onRequest', criarGuarda(opcoes));
    // Resposta administrativa nunca vai para cache intermediario (D48). A borda
    // repete o cabecalho; aqui ele vale tambem para quem chega pela porta direta.
    escopo.addHook('onSend', (_request: FastifyRequest, reply: FastifyReply, payload, feito) => {
      void reply.header('Cache-Control', 'no-store');
      feito(null, payload);
    });
    try {
      montar(escopo);
      fecharMetodosDaSuperficie(escopo, opcoes);
    } catch (erro) {
      pronto(erro as Error);
      return;
    }
    pronto();
  };
  // Sem `await`, de proposito: isto e chamado de dentro do `montar` sincrono de
  // `escoparRotas`, e esperar o registro de um filho dentro do pai que ainda
  // nao terminou de carregar trava o carregador. O erro de uma rota filha
  // (a fronteira de `registrarRota`) sobe por `app.ready()`/`listen()`.
  void app.register(plugin);
}
