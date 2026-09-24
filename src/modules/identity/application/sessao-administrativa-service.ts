/**
 * Casos de uso da sessao do backoffice (ADR-0027 itens 2, 5 e 8).
 *
 * Este servico e tambem a `PortaDaSessaoAdministrativa` que a guarda do
 * prefixo `/v1/admin` usa: `conferir`, `registrarRecusa` e
 * `consumirReautenticacao`. A guarda nao sabe o que e conta, papel ou banco;
 * este arquivo nao sabe o que e HTTP.
 *
 * ## Toda escrita vai com a trilha, na mesma transacao
 *
 * Abrir, encerrar, encerrar todas, rotacionar e abrir janela passam por
 * `EscritaAuditada.executar`: se a trilha nao grava, a sessao nao existe (D49).
 * Os eventos que nao acompanham escrita nenhuma (login recusado, recusa da
 * guarda sem revogacao) vao pela trilha comum, que nao derruba o pedido.
 */
import { hashDeToken } from '../../../shared/crypto/digest.js';
import { problemas } from '../../../shared/http/errors.js';
import type { EscopoDeReautenticacaoAdministrativa } from '../../../shared/http/route-definition.js';
import type {
  ContextoDaGuarda,
  MotivoDaRecusaDaGuarda,
  PortaDaSessaoAdministrativa,
  SessaoAdministrativaConferida,
} from '../../../shared/http/superficie-administrativa.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { comoData, comoIso, type Clock } from '../../../shared/time/clock.js';
import type { AbsoluteUrl, Instant, TokenHash, UserId } from '../../../shared/types/brands.js';
import type { AuditEvent, AuditLog, EscritaAuditada } from '../../audit/ports/audit-log.js';
import { normalizarEmail } from '../domain/email.js';
import { consumirTempoDeVerificacao, verificarSenha } from '../domain/password.js';
import {
  abreSessaoAdministrativa,
  avaliarSessao,
  derivarTokenAntiCsrf,
  etiquetaDaSessao,
  inatividadeRenovada,
  instanteDaSenha,
  JANELA_DE_REAUTENTICACAO_ADMINISTRATIVA_EM_MS,
  papeisDoPainel,
  prazosDeNovaSessao,
  precisaRenovarUso,
} from '../domain/sessao-administrativa.js';
import { instanteDeRevogacao } from '../domain/session.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { ListaDeSenhasVazadas } from '../ports/lista-de-senhas-vazadas.js';
import type { Mailer } from '../ports/mailer.js';
import type { SessaoAdministrativaRepository } from '../ports/sessao-administrativa-repository.js';
import {
  NOTA_MINIMA_DO_CAPTCHA_ADMINISTRATIVO,
  type VerificadorDeCaptcha,
} from '../ports/verificador-de-captcha.js';
import type { RegistrarOcorrencia } from './dependencies.js';

/** A acao do reCAPTCHA que o documento `/entrar` declara ao colher o token. */
export const ACAO_DO_CAPTCHA_ADMINISTRATIVO = 'admin_login';

/** Validade do link "nao fui eu" do aviso de sessao aberta: a mesma do aviso de reuso. */
const VALIDADE_DO_NAO_FUI_EU_EM_MS = 7 * 24 * 60 * 60 * 1000;

export interface DependenciasDaSessaoAdministrativa {
  readonly sessoes: SessaoAdministrativaRepository;
  readonly identidade: Pick<
    IdentityRepository,
    'buscarCredencialLocalPorEmail' | 'buscarContaPorId' | 'registrarLogin' | 'criarTokenDeVerificacao'
  >;
  readonly escrita: EscritaAuditada;
  readonly trilha: AuditLog;
  readonly captcha: VerificadorDeCaptcha;
  readonly senhasVazadas: ListaDeSenhasVazadas;
  readonly mailer: Mailer;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly hmacDeIp: (ip: string | undefined) => Buffer | null;
  readonly baseDaWeb: AbsoluteUrl;
  readonly registrarOcorrencia: RegistrarOcorrencia;
}

export interface EntradaDoLoginAdministrativo {
  readonly email: string;
  readonly password: string;
  readonly captchaToken: string | undefined;
}

/** O corpo de `AdminSession`, campo a campo como o contrato o declara. */
export interface VisaoDaSessaoAdministrativa {
  readonly display_name: string;
  readonly roles: string[];
  readonly csrf_token: string;
  readonly idle_expires_at: string;
  readonly absolute_expires_at: string;
}

export interface SessaoAberta {
  /** O valor do cookie. Existe aqui e no `Set-Cookie`, e em lugar nenhum mais. */
  readonly valorDoCookie: string;
  readonly visao: VisaoDaSessaoAdministrativa;
}

export interface JanelaAberta {
  readonly valorDoCookie: string;
  readonly reauthToken: string;
  readonly expiresIn: number;
  readonly scope: EscopoDeReautenticacaoAdministrativa;
  readonly csrfToken: string;
}

type ContextoDaRequisicao = ContextoDaGuarda;

export function criarSessaoAdministrativaService(deps: DependenciasDaSessaoAdministrativa) {
  const metadataDaSessao = (etiqueta: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    ...extra,
    surface: 'admin',
    session: etiqueta,
  });

  /** Login recusado: vai para a trilha comum, porque nao ha escrita a acompanhar. */
  async function registrarLoginRecusado(
    contexto: ContextoDaRequisicao,
    motivo: string,
    userId: UserId | undefined,
  ): Promise<void> {
    const evento: AuditEvent =
      userId === undefined
        ? { actorKind: 'anonymous', actorIp: contexto.ip, correlationId: contexto.correlationId,
            action: 'admin.session.denied', resourceKind: 'admin_session',
            metadata: { surface: 'admin', reason: motivo } }
        : { actorKind: 'user', actorUserId: userId, actorIp: contexto.ip, correlationId: contexto.correlationId,
            action: 'admin.session.denied', resourceKind: 'admin_session', resourceId: userId,
            metadata: { surface: 'admin', reason: motivo } };
    await deps.trilha.record(evento);
  }

  function visao(
    displayName: string | null,
    papeis: readonly string[],
    valorDoCookie: string,
    idleExpiresAt: Instant,
    absoluteExpiresAt: Instant,
  ): VisaoDaSessaoAdministrativa {
    return {
      // `display_name` e obrigatorio no contrato e a coluna aceita nulo; cadeia
      // vazia e o valor honesto de "a conta nao tem nome", e o e-mail nao pode
      // entrar no lugar (D51).
      display_name: displayName ?? '',
      roles: papeisDoPainel(papeis),
      csrf_token: derivarTokenAntiCsrf(valorDoCookie),
      idle_expires_at: comoIso(idleExpiresAt),
      absolute_expires_at: comoIso(absoluteExpiresAt),
    };
  }

  /**
   * D46: o dono da conta recebe um e-mail a cada sessao aberta, com o link
   * "nao fui eu" que ja existe (`disavowSessionAlert`). Ele empurra
   * `sessions_invalid_before`, que a guarda le a cada requisicao.
   *
   * Falha do envio nao desfaz o login: a sessao ja esta aberta e gravada com a
   * trilha. Mas nao some: sai no log com a correlacao.
   */
  async function avisarSessaoAberta(
    userId: UserId,
    email: string,
    agora: Instant,
    contexto: ContextoDaRequisicao,
  ): Promise<void> {
    try {
      const tokenBruto = deps.ids.opaqueToken();
      await deps.identidade.criarTokenDeVerificacao({
        id: deps.ids.uuidv7(),
        userId,
        proposito: 'session_disavow',
        tokenHash: hashDeToken(tokenBruto).toString('base64') as TokenHash,
        enviadoPara: email,
        expiraEm: (agora + VALIDADE_DO_NAO_FUI_EU_EM_MS) as Instant,
        ipHmac: deps.hmacDeIp(contexto.ip),
      });
      const base = deps.baseDaWeb.replace(/\/$/, '');
      await deps.mailer.enviar({
        para: email,
        assunto: 'Uma sessão do painel do Bichu foi aberta com a sua conta',
        corpo:
          `Uma sessão do painel administrativo do Bichu foi aberta com a sua conta em ` +
          `${comoIso(agora)} (UTC).\n\n` +
          'Se foi você, não precisa fazer nada.\n\n' +
          'Se não foi, abra este link. Ele encerra na hora todas as sessões da conta, ' +
          'sem pedir senha:\n\n' +
          `${base}/nao-fui-eu?token=${tokenBruto}\n\n` +
          'Depois, troque a senha em "Esqueci minha senha" e avise o responsável pelo painel.',
      });
    } catch (erro) {
      deps.registrarOcorrencia(
        { evento: 'admin.session.notice_failed', correlationId: contexto.correlationId, err: String(erro) },
        'aviso de sessao administrativa aberta nao saiu',
      );
    }
  }

  const porta: PortaDaSessaoAdministrativa = {
    async conferir(valorDoCookie) {
      const agora = deps.clock.now();
      const tokenHash = hashDeToken(valorDoCookie);
      const armazenada = await deps.sessoes.buscarPorHash(tokenHash);
      if (armazenada === undefined) throw problemas.naoAutenticado();

      const conta = await deps.identidade.buscarContaPorId(armazenada.userId);
      if (conta === undefined || conta.status !== 'active') throw problemas.sessaoDoPainelVencida();
      if (avaliarSessao(armazenada, conta.sessionsInvalidBefore, agora) !== 'valida') {
        throw problemas.sessaoDoPainelVencida();
      }

      const papeis = await deps.sessoes.papeisDaConta(armazenada.userId);
      let idleExpiresAt = armazenada.idleExpiresAt;
      if (precisaRenovarUso(armazenada.lastSeenAt, agora)) {
        idleExpiresAt = inatividadeRenovada(agora, armazenada.absoluteExpiresAt);
        await deps.sessoes.renovarUso(armazenada.id, agora, idleExpiresAt);
      }

      return {
        sessionId: armazenada.id,
        userId: armazenada.userId,
        displayName: conta.displayName,
        papeis,
        csrfTokenHash: armazenada.csrfTokenHash,
        etiqueta: etiquetaDaSessao(tokenHash),
        instanteDaSenha: comoData(armazenada.createdAt),
        idleExpiresAt: comoData(idleExpiresAt),
        absoluteExpiresAt: comoData(armazenada.absoluteExpiresAt),
      };
    },

    async registrarRecusa(sessao, motivo: MotivoDaRecusaDaGuarda, contexto) {
      deps.registrarOcorrencia(
        { evento: 'admin.guard.denied', motivo, correlationId: contexto.correlationId },
        'ALERTA: a guarda administrativa recusou uma conta identificada',
      );
      const evento: AuditEvent = {
        actorKind: 'user',
        actorUserId: sessao.userId,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'admin.guard.denied',
        resourceKind: 'admin_session',
        resourceId: sessao.sessionId,
        metadata: metadataDaSessao(sessao.etiqueta, { reason: motivo }),
      };

      // D38: a conta que perdeu TODO papel que abre o painel perde as sessoes
      // administrativas. A que tem papel de painel e nao tem o da operacao so e
      // recusada nesta requisicao.
      if (motivo === 'role_missing' && !abreSessaoAdministrativa(sessao.papeis)) {
        const agora = deps.clock.now();
        await deps.escrita.executar(async (trx) => {
          const revogadas = await deps.sessoes.revogarTodasDaConta(trx, sessao.userId, 'role_removed', agora);
          return {
            resultado: undefined,
            evento: { ...evento, metadata: { ...evento.metadata, revoked_sessions: revogadas } },
          };
        });
        return;
      }
      await deps.trilha.record(evento);
    },

    async consumirReautenticacao(sessao, escopo, tokenApresentado) {
      if (tokenApresentado === undefined || tokenApresentado === '') {
        throw problemas.reautenticacaoNecessaria();
      }
      const consumida = await deps.sessoes.consumirJanela({
        tokenHash: hashDeToken(tokenApresentado),
        sessionId: sessao.sessionId,
        userId: sessao.userId,
        escopo,
        agora: deps.clock.now(),
      });
      if (!consumida) throw problemas.reautenticacaoNecessaria();
    },
  };

  return {
    ...porta,

    /**
     * `POST /v1/admin/auth/login`, na ordem do contrato depois do teto: desafio,
     * senha (com o hash de descarte), papel, base de vazadas, sessao.
     *
     * Conta inexistente, senha errada, conta sem papel `admin` e conta que nao
     * esta ativa respondem o MESMO 401, e as quatro passam pela derivacao da
     * senha: o login nao conta a ninguem quem e administrador (T3, D44).
     */
    async entrar(entrada: EntradaDoLoginAdministrativo, contexto: ContextoDaRequisicao): Promise<SessaoAberta> {
      const nota = await deps.captcha.avaliar(entrada.captchaToken, ACAO_DO_CAPTCHA_ADMINISTRATIVO);
      if (nota === undefined || nota < NOTA_MINIMA_DO_CAPTCHA_ADMINISTRATIVO) {
        deps.registrarOcorrencia(
          { evento: 'admin.session.captcha_rejected', nota: nota ?? null, correlationId: contexto.correlationId },
          'ALERTA: login administrativo recusado pelo desafio',
        );
        await registrarLoginRecusado(contexto, 'captcha', undefined);
        throw problemas.captchaRecusado();
      }

      const credencial = await deps.identidade.buscarCredencialLocalPorEmail(normalizarEmail(entrada.email));
      if (credencial === undefined) {
        await consumirTempoDeVerificacao(entrada.password);
        await registrarLoginRecusado(contexto, 'unknown_account', undefined);
        throw problemas.credencialRecusada();
      }
      if (!(await verificarSenha(entrada.password, credencial.passwordPhc))) {
        await registrarLoginRecusado(contexto, 'bad_password', credencial.userId);
        throw problemas.credencialRecusada();
      }

      const conta = await deps.identidade.buscarContaPorId(credencial.userId);
      const papeis = await deps.sessoes.papeisDaConta(credencial.userId);
      if (conta === undefined || conta.status !== 'active' || !abreSessaoAdministrativa(papeis)) {
        await registrarLoginRecusado(contexto, 'not_admin_or_inactive', credencial.userId);
        throw problemas.credencialRecusada();
      }

      // D43. So depois da senha certa: a recusa aqui diz que a senha confere,
      // e so o dono dela (ou quem ja a tem) chega a ver este corpo.
      if ((await deps.senhasVazadas.contem(entrada.password)) === true) {
        await registrarLoginRecusado(contexto, 'breached_password', conta.id);
        throw problemas.senhaDoPainelVazada();
      }

      const agora = deps.clock.now();
      const valorDoCookie = deps.ids.opaqueToken();
      const tokenHash = hashDeToken(valorDoCookie);
      const prazos = prazosDeNovaSessao(instanteDaSenha(agora, conta.sessionsInvalidBefore));
      const id = deps.ids.uuidv7();
      const etiqueta = etiquetaDaSessao(tokenHash);

      await deps.escrita.executar(async (trx) => {
        await deps.sessoes.criar(trx, {
          id,
          userId: conta.id,
          tokenHash,
          csrfTokenHash: hashDeToken(derivarTokenAntiCsrf(valorDoCookie)),
          createdAt: prazos.createdAt,
          lastSeenAt: agora,
          idleExpiresAt: prazos.idleExpiresAt,
          absoluteExpiresAt: prazos.absoluteExpiresAt,
          userAgent: contexto.userAgent,
          ipHmac: deps.hmacDeIp(contexto.ip),
        });
        return {
          resultado: undefined,
          evento: {
            actorKind: 'user',
            actorUserId: conta.id,
            actorIp: contexto.ip,
            correlationId: contexto.correlationId,
            action: 'admin.session.opened',
            resourceKind: 'admin_session',
            resourceId: id,
            metadata: metadataDaSessao(etiqueta),
          },
        };
      });

      await deps.identidade.registrarLogin(credencial.identityId, agora);
      await avisarSessaoAberta(conta.id, conta.email, agora, contexto);

      return {
        valorDoCookie,
        visao: visao(conta.displayName, papeis, valorDoCookie, prazos.idleExpiresAt, prazos.absoluteExpiresAt),
      };
    },

    /** `GET /v1/admin/session`. O anti-CSRF e recalculado do cookie, nunca lido de lugar nenhum. */
    visaoDaSessao(sessao: SessaoAdministrativaConferida, valorDoCookie: string): VisaoDaSessaoAdministrativa {
      return visao(
        sessao.displayName,
        sessao.papeis,
        valorDoCookie,
        sessao.idleExpiresAt.getTime() as Instant,
        sessao.absoluteExpiresAt.getTime() as Instant,
      );
    },

    async sair(sessao: SessaoAdministrativaConferida, contexto: ContextoDaRequisicao): Promise<void> {
      const agora = deps.clock.now();
      await deps.escrita.executar(async (trx) => {
        await deps.sessoes.revogar(trx, sessao.sessionId, 'logout', agora);
        return {
          resultado: undefined,
          evento: {
            actorKind: 'user',
            actorUserId: sessao.userId,
            actorIp: contexto.ip,
            correlationId: contexto.correlationId,
            action: 'admin.session.closed',
            resourceKind: 'admin_session',
            resourceId: sessao.sessionId,
            metadata: metadataDaSessao(sessao.etiqueta),
          },
        };
      });
    },

    /**
     * `POST /v1/admin/auth/logout-all`: empurra `sessions_invalid_before`, que a
     * guarda le a cada requisicao, e revoga as linhas vivas. As duas coisas e o
     * evento numa transacao so.
     */
    async sairDeTodas(sessao: SessaoAdministrativaConferida, contexto: ContextoDaRequisicao): Promise<void> {
      const agora = deps.clock.now();
      const conta = await deps.identidade.buscarContaPorId(sessao.userId);
      if (conta === undefined) throw problemas.sessaoDoPainelVencida();
      const barreira = instanteDeRevogacao(agora, conta.sessionsInvalidBefore);
      await deps.escrita.executar(async (trx) => {
        await deps.sessoes.empurrarBarreira(trx, sessao.userId, barreira, agora);
        const revogadas = await deps.sessoes.revogarTodasDaConta(trx, sessao.userId, 'logout', agora);
        return {
          resultado: undefined,
          evento: {
            actorKind: 'user',
            actorUserId: sessao.userId,
            actorIp: contexto.ip,
            correlationId: contexto.correlationId,
            action: 'admin.session.all_closed',
            resourceKind: 'admin_session',
            resourceId: sessao.sessionId,
            metadata: metadataDaSessao(sessao.etiqueta, { revoked_sessions: revogadas }),
          },
        };
      });
    },

    /**
     * `POST /v1/admin/auth/reauth` (D40): confere a senha, ROTACIONA a sessao
     * (identificador e anti-CSRF novos, mesmo instante da senha, mesmo teto) e
     * abre uma janela de 5 minutos, uso unico, presa a sessao nova.
     */
    async reautenticar(
      sessao: SessaoAdministrativaConferida,
      senha: string,
      escopo: EscopoDeReautenticacaoAdministrativa,
      contexto: ContextoDaRequisicao,
    ): Promise<JanelaAberta> {
      const conta = await deps.identidade.buscarContaPorId(sessao.userId);
      if (conta === undefined) throw problemas.sessaoDoPainelVencida();
      const credencial = await deps.identidade.buscarCredencialLocalPorEmail(conta.email);
      const confere = credencial !== undefined && (await verificarSenha(senha, credencial.passwordPhc));
      if (!confere) {
        if (credencial === undefined) await consumirTempoDeVerificacao(senha);
        await registrarLoginRecusado(contexto, 'reauth_bad_password', sessao.userId);
        throw problemas.credencialRecusada();
      }

      const agora = deps.clock.now();
      const valorDoCookie = deps.ids.opaqueToken();
      const tokenHash = hashDeToken(valorDoCookie);
      const novaId = deps.ids.uuidv7();
      const reauthToken = deps.ids.opaqueToken();
      const absoluteExpiresAt = sessao.absoluteExpiresAt.getTime() as Instant;

      await deps.escrita.executar(async (trx) => {
        const revogou = await deps.sessoes.revogar(trx, sessao.sessionId, 'rotated', agora);
        // Outra requisicao rotacionou ou encerrou esta sessao no meio do
        // caminho: nada e gravado, e quem chegou depois entra de novo.
        if (!revogou) throw problemas.sessaoDoPainelVencida();
        await deps.sessoes.criar(trx, {
          id: novaId,
          userId: sessao.userId,
          tokenHash,
          csrfTokenHash: hashDeToken(derivarTokenAntiCsrf(valorDoCookie)),
          createdAt: sessao.instanteDaSenha.getTime() as Instant,
          lastSeenAt: agora,
          idleExpiresAt: inatividadeRenovada(agora, absoluteExpiresAt),
          absoluteExpiresAt,
          userAgent: contexto.userAgent,
          ipHmac: deps.hmacDeIp(contexto.ip),
        });
        await deps.sessoes.criarJanela(trx, {
          id: deps.ids.uuidv7(),
          sessionId: novaId,
          userId: sessao.userId,
          escopo,
          tokenHash: hashDeToken(reauthToken),
          emitidaEm: agora,
          expiraEm: (agora + JANELA_DE_REAUTENTICACAO_ADMINISTRATIVA_EM_MS) as Instant,
        });
        return {
          resultado: undefined,
          evento: {
            actorKind: 'user',
            actorUserId: sessao.userId,
            actorIp: contexto.ip,
            correlationId: contexto.correlationId,
            action: 'admin.session.reauthenticated',
            resourceKind: 'admin_session',
            resourceId: novaId,
            metadata: metadataDaSessao(sessao.etiqueta, { scope: escopo, new_session: etiquetaDaSessao(tokenHash) }),
          },
        };
      });

      return {
        valorDoCookie,
        reauthToken,
        expiresIn: JANELA_DE_REAUTENTICACAO_ADMINISTRATIVA_EM_MS / 1000,
        scope: escopo,
        csrfToken: derivarTokenAntiCsrf(valorDoCookie),
      };
    },
  };
}

export type SessaoAdministrativaService = ReturnType<typeof criarSessaoAdministrativaService>;
