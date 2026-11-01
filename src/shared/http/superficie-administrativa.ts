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

/** O cabecalho que so a borda de `admin.bichu.app` define (D33). */
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
 * As UNICAS operacoes do prefixo que dispensam sessao, por lista fechada (ADR-0027
 * itens 7 e 20.5): o login, que ainda nao tem sessao, e o "nao fui eu", que existe
 * justamente para quem pode ter perdido a dela.
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
  /** SHA-256 do token anti-CSRF da sessao. */
  readonly csrfTokenHash: Buffer;
  /** Oito primeiros bytes do hash da sessao, em hexadecimal: o que vai na trilha. */
  readonly etiqueta: string;
  /** O instante da senha (`created_at`). */
  readonly instanteDaSenha: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export interface ContextoDaGuarda {
  readonly correlationId: string;
  readonly ip: string | undefined;
  readonly userAgent: string | undefined;
}

/** Por que a guarda recusou uma conta ja identificada. */
export type MotivoDaRecusaDaGuarda = 'origin_mismatch' | 'csrf_mismatch' | 'role_missing' | 'account_disabled';

/** O que a guarda precisa do modulo `admin-access`. */
export interface PortaDaSessaoAdministrativa {
  /**
   * Confere o valor do cookie no banco: existe, nao revogada, dentro dos dois
   * prazos, posterior a `admin_accounts.sessions_invalid_before`.
   */
  conferir(valorDoCookie: string, contexto: ContextoDaGuarda): Promise<SessaoAdministrativaConferida>;
  /** A guarda recusou uma conta identificada. */
  registrarRecusa(
    sessao: SessaoAdministrativaConferida,
    motivo: MotivoDaRecusaDaGuarda,
    contexto: ContextoDaGuarda,
  ): Promise<void>;
  /** Confere e CONSOME `X-Admin-Reauth-Token` para o escopo, preso a esta sessao. */
  consumirReautenticacao(
    sessao: SessaoAdministrativaConferida,
    escopo: EscopoDeReautenticacaoAdministrativa,
    tokenApresentado: string | undefined,
    contexto: ContextoDaGuarda,
  ): Promise<ReautenticacaoConsumida | void>;
}

/** O consumo de uma janela de reautenticacao, com o caminho de volta. */
export interface ReautenticacaoConsumida {
  devolver(): Promise<void>;
}

export interface OpcoesDaSuperficieAdministrativa {
  /**
   * `ADMIN_ORIGIN`, a origem exata do painel (em producao, o host `admin.bichu.app`
   * com esquema https).
   */
  readonly origem: string;
  readonly sessoes: PortaDaSessaoAdministrativa;
}

declare module 'fastify' {
  interface FastifyInstance {
    superficieAdministrativa?: OpcoesDaSuperficieAdministrativa;
  }
  interface FastifyRequest {
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

/** O valor do cookie da sessao, lido do cabecalho `Cookie` cru. */
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
 * `Max-Age`**.
 */
export function cookieDaSessao(valor: string): string {
  return `${COOKIE_DA_SESSAO_ADMINISTRATIVA}=${valor}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

/** O `Set-Cookie` que apaga o cookie no logout. */
export function cookieQueApagaASessao(): string {
  return `${COOKIE_DA_SESSAO_ADMINISTRATIVA}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

/** A sessao que a guarda pendurou. */
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

/** A declaracao da rota, que `registrarRota` pendura em `config.rotaDeclarada`. */
export function rotaDeclaradaDe(request: FastifyRequest): RouteDefinition | undefined {
  return (request.routeOptions.config as { rotaDeclarada?: RouteDefinition }).rotaDeclarada;
}

function criarGuarda(opcoes: OpcoesDaSuperficieAdministrativa): onRequestAsyncHookHandler {
  return async (request) => {
    if (request.headers[CABECALHO_DA_SUPERFICIE] !== VALOR_DA_SUPERFICIE_ADMINISTRATIVA) {
      throw problemas.naoEncontrado();
    }
    if (request.headers.authorization !== undefined) throw problemas.naoAutenticado();

    const rota = rotaDeclaradaDe(request);
    if (rota === undefined) {
      return;
    }
    const inseguro = !METODOS_SEGUROS.has(request.method);
    const origemConfere = request.headers.origin === opcoes.origem;

    if (rota.adminPublic === true) {
      if (inseguro && !origemConfere) throw problemas.proibidoNoPainel();
      return;
    }

    const valor = lerCookieDaSessao(request.headers.cookie);
    if (valor === undefined) throw problemas.naoAutenticado();
    const contexto = contextoDaGuarda(request);
    const sessao = await opcoes.sessoes.conferir(valor, contexto);
    request.sessaoAdministrativa = sessao;

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

    if (!papelConfere(rota, sessao)) {
      await opcoes.sessoes.registrarRecusa(sessao, 'role_missing', contexto);
      throw problemas.proibidoNoPainel();
    }
  };
}

/**
 * Abre o escopo das rotas administrativas **dentro** do escopo `/v1` e instala a
 * guarda nele.
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
  void app.register(plugin);
}
