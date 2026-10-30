/** Casos de uso da sessao do backoffice (ADR-0027 itens 2, 5, 8 e 20). */
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
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { AuditEvent, AuditLog, ContagemNaTrilha, EscritaAuditada } from '../../audit/ports/audit-log.js';
import type { ListaDeSenhasVazadas } from '../../identity/ports/lista-de-senhas-vazadas.js';
import {
  consumirTempoDeVerificacao,
  gerarHashDeSenha,
  normalizarEmail,
  precisaDeRehash,
  verificarSenha,
} from '../../identity/ports/senha.js';
import {
  abreSessaoAdministrativa,
  avaliarSessao,
  derivarTokenAntiCsrf,
  etiquetaDaSessao,
  inatividadeRenovada,
  instanteDaBarreira,
  instanteDaSenha,
  JANELA_DE_REAUTENTICACAO_ADMINISTRATIVA_EM_MS,
  papeisDoPainel,
  prazosDeNovaSessao,
  precisaRenovarUso,
  VALIDADE_DO_NAO_FUI_EU_EM_MS,
} from '../domain/sessao-administrativa.js';
import { MOTIVO_DA_FALHA_QUE_CONTA, atingiuOBloqueio, inicioDaJanela } from '../domain/bloqueio-por-falhas.js';
import type { AvisoPorEmail } from '../ports/aviso-por-email.js';
import type { ContaAdministrativa, RepositorioDeContasAdministrativas } from '../ports/repositorio-de-contas-administrativas.js';
import type { SessaoAdministrativaRepository } from '../ports/sessao-administrativa-repository.js';
import {
  NOTA_MINIMA_DO_CAPTCHA_ADMINISTRATIVO,
  type VerificadorDeCaptcha,
} from '../ports/verificador-de-captcha.js';

/** A acao do reCAPTCHA que o documento `/entrar` declara ao colher o token. */
export const ACAO_DO_CAPTCHA_ADMINISTRATIVO = 'admin_login';

/** Uma linha de log estruturado. */
export type RegistrarOcorrencia = (dados: Record<string, unknown>, mensagem: string) => void;

export interface DependenciasDaSessaoAdministrativa {
  readonly sessoes: SessaoAdministrativaRepository;
  readonly contas: RepositorioDeContasAdministrativas;
  readonly escrita: EscritaAuditada;
  readonly trilha: AuditLog;
  /**
   * A contagem duravel das falhas de login, lida da trilha (D44: 10 em 24 h
   * bloqueiam).
   */
  readonly contagem: ContagemNaTrilha;
  readonly captcha: VerificadorDeCaptcha;
  readonly senhasVazadas: ListaDeSenhasVazadas;
  readonly avisos: AvisoPorEmail;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly hmacDeIp: (ip: string | undefined) => Buffer | null;
  /** `ADMIN_ORIGIN`, a origem exata do painel. */
  readonly origemDoPainel: string;
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
  /** Um token por escopo pedido, na ordem do pedido, todos presos a sessao nova. */
  readonly tokens: readonly { readonly scope: EscopoDeReautenticacaoAdministrativa; readonly reauthToken: string }[];
  readonly expiresIn: number;
  readonly csrfToken: string;
}

/** Quantos escopos uma reautenticacao abre de uma vez. */
export const MAXIMO_DE_ESCOPOS_POR_REAUTENTICACAO = 2;

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
    contaAlvo: AdminAccountId | undefined,
  ): Promise<void> {
    await deps.trilha.record({
      actorKind: 'anonymous',
      actorIp: contexto.ip,
      correlationId: contexto.correlationId,
      action: 'admin.session.denied',
      resourceKind: contaAlvo === undefined ? 'admin_session' : 'admin_account',
      ...(contaAlvo === undefined ? {} : { resourceId: contaAlvo }),
      metadata: { surface: 'admin', reason: motivo },
    });
  }

  /** Senha errada de conta que existe (D44). */
  async function registrarSenhaErrada(conta: ContaAdministrativa, contexto: ContextoDaRequisicao): Promise<void> {
    const agora = deps.clock.now();
    const bloqueou = await deps.escrita.executar(async (trx) => {
      await deps.contas.travarParaContarFalhas(trx, conta.id);
      const anteriores = await deps.contagem.contarNaJanela(trx, {
        action: 'admin.session.denied',
        resourceId: conta.id,
        motivo: MOTIVO_DA_FALHA_QUE_CONTA,
        desde: inicioDaJanela(agora),
      });
      const bloqueia = conta.blockedReason === null && atingiuOBloqueio(anteriores);
      if (bloqueia) await deps.contas.bloquear(trx, conta.id, 'failed_logins', agora);
      return {
        resultado: bloqueia,
        evento: {
          actorKind: 'anonymous',
          actorIp: contexto.ip,
          correlationId: contexto.correlationId,
          action: 'admin.session.denied',
          resourceKind: 'admin_account',
          resourceId: conta.id,
          metadata: {
            surface: 'admin',
            reason: MOTIVO_DA_FALHA_QUE_CONTA,
            ...(bloqueia ? { blocked: 'failed_logins' } : {}),
          },
        },
      };
    });
    if (!bloqueou) return;
    deps.registrarOcorrencia(
      { evento: 'admin.account.blocked_failed_logins', conta: conta.id, correlationId: contexto.correlationId },
      'ALERTA: conta do painel bloqueada por dez falhas de login em 24 horas',
    );
    void avisarTodosOsAdministradores(
      {
        assunto: 'Uma conta do painel do Bichu foi bloqueada por tentativas de senha',
        corpo:
          `Em ${comoIso(agora)} (UTC) a conta de ${conta.displayName} chegou a dez tentativas de senha ` +
          'errada em 24 horas, e está bloqueada. As sessões já abertas continuam; novas entradas são ' +
          'recusadas.\n\n' +
          'Para liberar, o responsável pelo painel precisa rodar `conta-admin redefinir-senha` no ' +
          'servidor, com a pessoa digitando a senha nova. Não existe link de redefinição.\n\n' +
          'Se não foi a própria pessoa errando a senha, alguém está tentando entrar com o e-mail dela.',
      },
      { evento: 'admin.account.block_notice_failed', conta: conta.id, correlationId: contexto.correlationId },
    );
  }

  function visao(
    displayName: string,
    papeis: readonly string[],
    valorDoCookie: string,
    idleExpiresAt: Instant,
    absoluteExpiresAt: Instant,
  ): VisaoDaSessaoAdministrativa {
    return {
      display_name: displayName,
      roles: papeisDoPainel(papeis),
      csrf_token: derivarTokenAntiCsrf(valorDoCookie),
      idle_expires_at: comoIso(idleExpiresAt),
      absolute_expires_at: comoIso(absoluteExpiresAt),
    };
  }

  /**
   * D43, forma de 28/09: a senha certa que esta numa base de vazadas NAO tem
   * resposta propria.
   */
  function avisarSenhaVazada(conta: ContaAdministrativa, agora: Instant, contexto: ContextoDaRequisicao): void {
    void avisarTodosOsAdministradores(
      {
        assunto: 'Uma conta do painel do Bichu precisa trocar a senha',
        corpo:
          `Em ${comoIso(agora)} (UTC) alguém entrou no painel administrativo do Bichu com a senha ` +
          `certa da conta de ${conta.displayName}, e essa senha aparece em vazamentos de outros ` +
          'sites. Por isso ela não é mais aceita, e o acesso foi recusado.\n\n' +
          'A senha precisa ser redefinida pelo responsável pelo painel, no servidor, com o comando ' +
          '`conta-admin redefinir-senha`. Não existe link de redefinição.\n\n' +
          'Se não foi a própria pessoa que tentou entrar, a senha dela está com outra pessoa.',
      },
      { evento: 'admin.session.breach_notice_failed', conta: conta.id, correlationId: contexto.correlationId },
    );
  }

  /** Um e-mail para CADA administrador ativo (D46, D61, D62). */
  async function avisarTodosOsAdministradores(
    mensagem: { readonly assunto: string; readonly corpo: string },
    ocorrencia: Record<string, unknown>,
  ): Promise<void> {
    try {
      const naoReceberam: string[] = [];
      for (const destino of await deps.contas.listarAtivas()) {
        try {
          await deps.avisos.enviar({ para: destino.email, ...mensagem });
        } catch {
          naoReceberam.push(destino.id);
        }
      }
      if (naoReceberam.length > 0) {
        deps.registrarOcorrencia({ ...ocorrencia, naoReceberam }, 'aviso do painel nao chegou a todos os administradores');
      }
    } catch (erro) {
      deps.registrarOcorrencia({ ...ocorrencia, err: String(erro) }, 'aviso do painel aos administradores nao saiu');
    }
  }

  /**
   * D46: o dono da conta recebe um e-mail a cada sessao aberta, com o link "nao fui
   * eu" do proprio painel (D62).
   */
  async function avisarSessaoAberta(
    conta: ContaAdministrativa,
    sessionId: string,
    agora: Instant,
    contexto: ContextoDaRequisicao,
  ): Promise<void> {
    try {
      const tokenBruto = deps.ids.opaqueToken();
      await deps.sessoes.criarAviso({
        id: deps.ids.uuidv7(),
        adminAccountId: conta.id,
        sessionId,
        tokenHash: hashDeToken(tokenBruto),
        expiraEm: (agora + VALIDADE_DO_NAO_FUI_EU_EM_MS) as Instant,
      });
      const base = deps.origemDoPainel.replace(/\/$/, '');
      await deps.avisos.enviar({
        para: conta.email,
        assunto: 'Uma sessão do painel do Bichu foi aberta com a sua conta',
        corpo:
          `Uma sessão do painel administrativo do Bichu foi aberta com a sua conta em ` +
          `${comoIso(agora)} (UTC).\n\n` +
          'Se foi você, não precisa fazer nada.\n\n' +
          'Se não foi, abra este link. Ele encerra na hora todas as sessões da conta e ' +
          'bloqueia novas entradas, sem pedir senha:\n\n' +
          `${base}/nao-fui-eu#t=${tokenBruto}\n\n` +
          'Depois, fale com o responsável pelo backoffice para redefinir a senha.',
      });
    } catch (erro) {
      deps.registrarOcorrencia(
        { evento: 'admin.session.notice_failed', correlationId: contexto.correlationId, err: String(erro) },
        'aviso de sessao administrativa aberta nao saiu',
      );
    }
  }

  function eventoDoAdmin(
    sessao: SessaoAdministrativaConferida,
    contexto: ContextoDaRequisicao,
    dados: Pick<AuditEvent, 'action' | 'resourceKind' | 'resourceId' | 'metadata'>,
  ): AuditEvent {
    return {
      actorKind: 'admin',
      actorAdminId: sessao.adminAccountId,
      actorIp: contexto.ip,
      correlationId: contexto.correlationId,
      ...dados,
    };
  }

  const porta: PortaDaSessaoAdministrativa = {
    async conferir(valorDoCookie, contexto) {
      const agora = deps.clock.now();
      const tokenHash = hashDeToken(valorDoCookie);
      const encontrada = await deps.sessoes.contaParaAGuarda(tokenHash);
      if (encontrada === undefined) throw problemas.naoAutenticado();
      const { sessao: armazenada, conta } = encontrada;

      if (avaliarSessao(armazenada, conta.sessionsInvalidBefore, agora) !== 'valida') {
        throw problemas.sessaoDoPainelVencida();
      }

      const conferida: SessaoAdministrativaConferida = {
        sessionId: armazenada.id,
        adminAccountId: conta.id,
        displayName: conta.displayName,
        papeis: [conta.papel],
        csrfTokenHash: armazenada.csrfTokenHash,
        etiqueta: etiquetaDaSessao(tokenHash),
        instanteDaSenha: comoData(armazenada.createdAt),
        idleExpiresAt: comoData(armazenada.idleExpiresAt),
        absoluteExpiresAt: comoData(armazenada.absoluteExpiresAt),
      };

      if (conta.status !== 'active') {
        await porta.registrarRecusa(conferida, 'account_disabled', contexto);
        throw problemas.proibidoNoPainel();
      }

      let idleExpiresAt = armazenada.idleExpiresAt;
      if (precisaRenovarUso(armazenada.lastSeenAt, agora)) {
        idleExpiresAt = inatividadeRenovada(agora, armazenada.absoluteExpiresAt);
        await deps.sessoes.renovarUso(armazenada.id, agora, idleExpiresAt);
      }
      return { ...conferida, idleExpiresAt: comoData(idleExpiresAt) };
    },

    async registrarRecusa(sessao, motivo: MotivoDaRecusaDaGuarda, contexto) {
      deps.registrarOcorrencia(
        { evento: 'admin.guard.denied', motivo, correlationId: contexto.correlationId },
        'ALERTA: a guarda administrativa recusou uma conta identificada',
      );
      const evento = eventoDoAdmin(sessao, contexto, {
        action: 'admin.guard.denied',
        resourceKind: 'admin_session',
        resourceId: sessao.sessionId,
        metadata: metadataDaSessao(sessao.etiqueta, { reason: motivo }),
      });

      const revogacao =
        motivo === 'account_disabled'
          ? 'account_disabled'
          : motivo === 'role_missing' && !abreSessaoAdministrativa(sessao.papeis)
            ? 'account_invalidated'
            : undefined;
      if (revogacao !== undefined) {
        const agora = deps.clock.now();
        await deps.escrita.executar(async (trx) => {
          const revogadas = await deps.sessoes.revogarTodasDaConta(trx, sessao.adminAccountId, revogacao, agora);
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
      const consumidaEm = deps.clock.now();
      const id = await deps.sessoes.consumirJanela({
        tokenHash: hashDeToken(tokenApresentado),
        sessionId: sessao.sessionId,
        adminAccountId: sessao.adminAccountId,
        escopo,
        agora: consumidaEm,
      });
      if (id === undefined) throw problemas.reautenticacaoNecessaria();
      return {
        devolver: async () => {
          await deps.sessoes.devolverJanela({
            id,
            sessionId: sessao.sessionId,
            consumidaEm,
            agora: deps.clock.now(),
          });
        },
      };
    },
  };

  return {
    ...porta,

    /**
     * `POST /v1/admin/auth/login`, na ordem do contrato depois do teto: desafio, senha
     * (com o hash de descarte), conta ativa, base de vazadas, sessao.
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

      const consultaAVazadas = deps.senhasVazadas
        .contem(entrada.password)
        .catch((): 'desconhecido' => 'desconhecido');

      const conta = await deps.contas.buscarPorEmail(normalizarEmail(entrada.email));
      if (conta === undefined) {
        await consumirTempoDeVerificacao(entrada.password);
        await consultaAVazadas;
        await registrarLoginRecusado(contexto, 'unknown_account', undefined);
        throw problemas.credencialDoPainelRecusada();
      }
      const confere = await verificarSenha(entrada.password, conta.passwordPhc);
      const vereditoDaBase = await consultaAVazadas;
      const vazada = vereditoDaBase === true;
      if (!confere) {
        await registrarSenhaErrada(conta, contexto);
        throw problemas.credencialDoPainelRecusada();
      }
      if (conta.status !== 'active' || !abreSessaoAdministrativa([conta.papel])) {
        await registrarLoginRecusado(contexto, 'inactive_account', conta.id);
        throw problemas.credencialDoPainelRecusada();
      }
      if (conta.blockedReason !== null) {
        await registrarLoginRecusado(contexto, `blocked_${conta.blockedReason}`, conta.id);
        throw problemas.credencialDoPainelRecusada();
      }

      const agora = deps.clock.now();
      if (vazada) {
        await registrarLoginRecusado(contexto, 'breached_password', conta.id);
        avisarSenhaVazada(conta, agora, contexto);
        throw problemas.credencialDoPainelRecusada();
      }

      if (precisaDeRehash(conta.passwordPhc)) {
        await deps.contas.regravarSenha(conta.id, await gerarHashDeSenha(entrada.password), agora);
      }

      const valorDoCookie = deps.ids.opaqueToken();
      const tokenHash = hashDeToken(valorDoCookie);
      const prazos = prazosDeNovaSessao(instanteDaSenha(agora, conta.sessionsInvalidBefore));
      const id = deps.ids.uuidv7();
      const etiqueta = etiquetaDaSessao(tokenHash);

      await deps.escrita.executar(async (trx) => {
        await deps.sessoes.criar(trx, {
          id,
          adminAccountId: conta.id,
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
            actorKind: 'admin',
            actorAdminId: conta.id,
            actorIp: contexto.ip,
            correlationId: contexto.correlationId,
            action: 'admin.session.opened',
            resourceKind: 'admin_session',
            resourceId: id,
            metadata: metadataDaSessao(
              etiqueta,
              vereditoDaBase === 'desconhecido' ? { breach_check: 'unavailable' } : {},
            ),
          },
        };
      });

      await deps.contas.registrarLogin(conta.id, agora);
      if (vereditoDaBase === 'desconhecido') {
        deps.registrarOcorrencia(
          { evento: 'admin.session.breach_check_unavailable', conta: conta.id, correlationId: contexto.correlationId },
          'login administrativo sem conferencia da base de senhas vazadas (base fora do ar)',
        );
      }
      await avisarSessaoAberta(conta, id, agora, contexto);

      return {
        valorDoCookie,
        visao: visao(conta.displayName, [conta.papel], valorDoCookie, prazos.idleExpiresAt, prazos.absoluteExpiresAt),
      };
    },

    /** `POST /v1/admin/auth/disavow` (D62). */
    async desautorizar(tokenBruto: string, contexto: ContextoDaRequisicao): Promise<void> {
      const agora = deps.clock.now();
      const alvo = await deps.escrita.executar(async (trx) => {
        const aviso = await deps.sessoes.travarAvisoValido(trx, hashDeToken(tokenBruto), agora);
        if (aviso === undefined) throw problemas.tokenDeVerificacaoVencido();
        const conta = await deps.contas.buscarPorId(aviso.adminAccountId);
        if (conta === undefined) throw problemas.tokenDeVerificacaoVencido();
        const revogadas = await deps.sessoes.revogarTodasDaConta(trx, conta.id, 'disavowed', agora);
        await deps.contas.empurrarBarreira(trx, conta.id, instanteDaBarreira(agora, conta.sessionsInvalidBefore));
        await deps.contas.bloquear(trx, conta.id, 'disavowed', agora);
        await deps.sessoes.consumirAviso(trx, aviso.id, agora);
        return {
          resultado: conta,
          evento: {
            actorKind: 'anonymous',
            actorIp: contexto.ip,
            correlationId: contexto.correlationId,
            action: 'admin.session.disavowed',
            resourceKind: 'admin_account',
            resourceId: conta.id,
            metadata: { surface: 'admin', revoked_sessions: revogadas },
          },
        };
      });

      await avisarTodosOsAdministradores(
        {
          assunto: 'Uma conta do painel do Bichu foi bloqueada pelo "não fui eu"',
          corpo:
            `Em ${comoIso(agora)} (UTC) alguém com acesso ao e-mail de ${alvo.displayName} usou o link ` +
            '"não fui eu" do aviso de sessão aberta. Todas as sessões dessa conta foram encerradas, e ' +
            'ela está bloqueada.\n\n' +
            'Para liberar, o responsável pelo painel precisa rodar `conta-admin redefinir-senha` no ' +
            'servidor, com a pessoa digitando a senha nova. Não existe link de redefinição.',
        },
        { evento: 'admin.session.disavow_notice_failed', conta: alvo.id, correlationId: contexto.correlationId },
      );
    },

    /** `GET /v1/admin/session`. */
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
          evento: eventoDoAdmin(sessao, contexto, {
            action: 'admin.session.closed',
            resourceKind: 'admin_session',
            resourceId: sessao.sessionId,
            metadata: metadataDaSessao(sessao.etiqueta),
          }),
        };
      });
    },

    /**
     * `POST /v1/admin/auth/logout-all`: empurra
     * `admin_accounts.sessions_invalid_before`, que a guarda le a cada requisicao, e
     * revoga as linhas vivas.
     */
    async sairDeTodas(sessao: SessaoAdministrativaConferida, contexto: ContextoDaRequisicao): Promise<void> {
      const agora = deps.clock.now();
      const conta = await deps.contas.buscarPorId(sessao.adminAccountId);
      if (conta === undefined) throw problemas.sessaoDoPainelVencida();
      const barreira = instanteDaBarreira(agora, conta.sessionsInvalidBefore);
      await deps.escrita.executar(async (trx) => {
        await deps.contas.empurrarBarreira(trx, sessao.adminAccountId, barreira);
        const revogadas = await deps.sessoes.revogarTodasDaConta(trx, sessao.adminAccountId, 'logout', agora);
        return {
          resultado: undefined,
          evento: eventoDoAdmin(sessao, contexto, {
            action: 'admin.session.all_closed',
            resourceKind: 'admin_session',
            resourceId: sessao.sessionId,
            metadata: metadataDaSessao(sessao.etiqueta, { revoked_sessions: revogadas }),
          }),
        };
      });
    },

    /**
     * `POST /v1/admin/auth/reauth` (D40): confere a senha, ROTACIONA a sessao
     * (identificador e anti-CSRF novos, mesmo instante da senha, mesmo teto) e abre
     * uma janela de 5 minutos por escopo pedido, cada uma de uso unico e presa a
     * sessao nova.
     */
    async reautenticar(
      sessao: SessaoAdministrativaConferida,
      senha: string,
      escopos: readonly EscopoDeReautenticacaoAdministrativa[],
      contexto: ContextoDaRequisicao,
    ): Promise<JanelaAberta> {
      if (
        escopos.length === 0 ||
        escopos.length > MAXIMO_DE_ESCOPOS_POR_REAUTENTICACAO ||
        new Set(escopos).size !== escopos.length
      ) {
        throw new Error(`reautenticacao administrativa com escopos invalidos: ${JSON.stringify(escopos)}`);
      }
      const conta = await deps.contas.buscarPorId(sessao.adminAccountId);
      const confere = conta !== undefined && (await verificarSenha(senha, conta.passwordPhc));
      if (!confere) {
        if (conta === undefined) await consumirTempoDeVerificacao(senha);
        await deps.trilha.record(
          eventoDoAdmin(sessao, contexto, {
            action: 'admin.session.denied',
            resourceKind: 'admin_session',
            resourceId: sessao.sessionId,
            metadata: metadataDaSessao(sessao.etiqueta, { reason: 'reauth_bad_password' }),
          }),
        );
        throw problemas.credencialDoPainelRecusada();
      }

      const agora = deps.clock.now();
      const valorDoCookie = deps.ids.opaqueToken();
      const tokenHash = hashDeToken(valorDoCookie);
      const novaId = deps.ids.uuidv7();
      const tokens = escopos.map((scope) => ({ scope, reauthToken: deps.ids.opaqueToken() }));
      const absoluteExpiresAt = sessao.absoluteExpiresAt.getTime() as Instant;

      await deps.escrita.executar(async (trx) => {
        const revogou = await deps.sessoes.revogar(trx, sessao.sessionId, 'rotated', agora);
        if (!revogou) throw problemas.sessaoDoPainelVencida();
        await deps.sessoes.criar(trx, {
          id: novaId,
          adminAccountId: sessao.adminAccountId,
          tokenHash,
          csrfTokenHash: hashDeToken(derivarTokenAntiCsrf(valorDoCookie)),
          createdAt: sessao.instanteDaSenha.getTime() as Instant,
          lastSeenAt: agora,
          idleExpiresAt: inatividadeRenovada(agora, absoluteExpiresAt),
          absoluteExpiresAt,
          userAgent: contexto.userAgent,
          ipHmac: deps.hmacDeIp(contexto.ip),
        });
        for (const { scope, reauthToken } of tokens) {
          await deps.sessoes.criarJanela(trx, {
            id: deps.ids.uuidv7(),
            sessionId: novaId,
            adminAccountId: sessao.adminAccountId,
            escopo: scope,
            tokenHash: hashDeToken(reauthToken),
            emitidaEm: agora,
            expiraEm: (agora + JANELA_DE_REAUTENTICACAO_ADMINISTRATIVA_EM_MS) as Instant,
          });
        }
        return {
          resultado: undefined,
          evento: eventoDoAdmin(sessao, contexto, {
            action: 'admin.session.reauthenticated',
            resourceKind: 'admin_session',
            resourceId: novaId,
            metadata: metadataDaSessao(sessao.etiqueta, { scopes: escopos, new_session: etiquetaDaSessao(tokenHash) }),
          }),
        };
      });

      return {
        valorDoCookie,
        tokens,
        expiresIn: JANELA_DE_REAUTENTICACAO_ADMINISTRATIVA_EM_MS / 1000,
        csrfToken: derivarTokenAntiCsrf(valorDoCookie),
      };
    },
  };
}

export type SessaoAdministrativaService = ReturnType<typeof criarSessaoAdministrativaService>;
