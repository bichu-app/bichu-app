import { hashDeToken } from '../../../shared/crypto/digest.js';
import { AppError, problemas } from '../../../shared/http/errors.js';
import { verificarDataDeNascimento } from '../../../shared/idade/idade-minima.js';
import { verificarApelido } from '../../../shared/apelido/apelido.js';
import type { Instant, OpaqueToken, TokenHash, UserId } from '../../../shared/types/brands.js';
import { emailTemFormaValida, normalizarEmail } from '../domain/email.js';
import {
  consumirTempoDeVerificacao,
  gerarHashDeSenha,
  precisaDeRehash,
  verificarSenha,
} from '../domain/password.js';
import { validarSenha } from '../domain/password-policy.js';
import {
  instanteDeEmissaoDoAcesso,
  instanteDeRevogacao,
  prazosDeNovaFamilia,
  prazosDeRotacao,
  refreshFoiRevogado,
  segundosRestantes,
  tokenFoiRevogado,
} from '../domain/session.js';
import type {
  CamposDoPerfil,
  FotoDoPerfil,
  Conta,
  MotivoDeRevogacao,
  PropositoDoToken,
} from '../ports/identity-repository.js';
import { EnvioDeFotoNaoServe } from '../ports/identity-repository.js';
import type { ReauthScope } from '../../../shared/http/route-definition.js';
import {
  expiracaoDaJanela,
  JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS,
} from '../domain/reautenticacao.js';

import { comoFamiliaDeSessao } from '../ports/localizacao-de-referencia-repository.js';
import type { ContextoDaRequisicao, DependenciasDeIdentidade } from './dependencies.js';
import { projetarSessao, type ParDeTokens, type SessionView } from './session-view.js';
import { projetarFotoDoPerfil, type FotoProjetada } from '../domain/resposta-do-perfil.js';
import type { Mensagem } from '../ports/mailer.js';
import { comoIso } from '../../../shared/time/clock.js';

type MotivoDeRevogacaoEmMassa = Extract<
  MotivoDeRevogacao,
  'logout_all' | 'password_changed' | 'account_deleted' | 'not_me'
>;

const LIMITE_DO_NOME = 80;

function nomeDeExibicaoAparado(bruto: string | null | undefined): string {
  const aparado = (bruto ?? '').trim();
  if (aparado.length === 0) {
    throw problemas.validacao([
      { field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' },
    ]);
  }
  if (aparado.length > LIMITE_DO_NOME) {
    throw problemas.validacao([
      {
        field: 'display_name',
        code: 'too_long',
        message: `Use no máximo ${LIMITE_DO_NOME} caracteres no nome.`,
      },
    ]);
  }
  return aparado;
}

export interface EntradaDeCadastro {
  readonly email: string;
  readonly password: string;
  /** A data de nascimento como ela chegou, **sem conferir nada ainda**. */
  readonly birthDate: unknown;
  /** O apelido (`@`) como ele chegou, **sem conferir nada ainda**. */
  readonly handle?: unknown;
  readonly displayName?: string | undefined;
  readonly acceptedTermsVersion?: string | undefined;
}

export interface EntradaDeLogin {
  readonly email: string;
  readonly password: string;
  readonly staySignedIn: boolean;
}

export interface Autenticado {
  readonly conta: Conta;
  readonly jti: string;
  /**
   * A família de refresh que emitiu este token de acesso — o `sid` do ADR-0002,
   * emenda 1, seção 2.
   */
  readonly sid?: string | undefined;
}

function comoTokenHash(valor: string): TokenHash {
  return hashDeToken(valor) as TokenHash;
}

const VALIDADE_EM_MS: Record<PropositoDoToken, number> = {
  email_verify: 24 * 60 * 60 * 1000,
  email_change: 24 * 60 * 60 * 1000,
  password_reset: 30 * 60 * 1000,
  session_disavow: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Trinta dias entre a exclusão lógica e o expurgo (ADR-0010, e a descrição de
 * `deleteMyAccount` no contrato).
 */
export const PRAZO_DE_EXPURGO_EM_MS = 30 * 24 * 60 * 60 * 1000;

function montarMensagemDoToken(
  proposito: PropositoDoToken,
  email: string,
  tokenBruto: string,
  base: string,
): Mensagem {
  if (proposito === 'email_verify') {
    return {
      para: email,
      assunto: 'Confirme seu e-mail no Bichu',
      corpo:
        `Confirme seu e-mail para liberar o aviso de pet perdido:\n\n` +
        `${base}/verificar-email?token=${tokenBruto}\n\n` +
        `O link vale por 24 horas. Se você não criou uma conta no Bichu, ignore esta mensagem.`,
    };
  }

  if (proposito === 'email_change') {
    return {
      para: email,
      assunto: 'Confirme seu novo e-mail no Bichu',
      corpo:
        `Alguém pediu para passar a usar este endereço na conta do Bichu.\n\n` +
        `Para confirmar, abra:\n\n` +
        `${base}/verificar-email?token=${tokenBruto}\n\n` +
        `O link vale por 24 horas e só pode ser usado uma vez. Até você abrir, ` +
        `a conta continua usando o endereço anterior.\n` +
        `Se não foi você que pediu, ignore esta mensagem — nada muda.`,
    };
  }

  return {
    para: email,
    assunto: 'Redefinir sua senha do Bichu',
    corpo:
      `Para escolher uma senha nova, abra:\n\n` +
      `${base}/redefinir-senha?token=${tokenBruto}\n\n` +
      `O link vale por 30 minutos e só pode ser usado uma vez.\n` +
      `Se não foi você que pediu, ignore — a sua senha continua a mesma.`,
  };
}

/** O aviso que sai para o endereço ANTIGO, e a razão de ele existir. */
export function montarAvisoDeTrocaAoEnderecoAntigo(
  enderecoAntigo: string,
  enderecoNovo: string,
): Mensagem {
  return {
    para: enderecoAntigo,
    assunto: 'Pediram para trocar o e-mail da sua conta no Bichu',
    corpo:
      `Alguém pediu para a sua conta do Bichu passar a usar este endereço:\n\n` +
      `${enderecoNovo}\n\n` +
      `A troca só vale depois que esse endereço for confirmado. Até lá, a conta ` +
      `continua neste e-mail, e é por ele que a recuperação de senha passa.\n\n` +
      `Se não foi você, troque a sua senha agora: isso derruba as sessões abertas ` +
      `e cancela o pedido.`,
  };
}

/** O segundo aviso ao endereço antigo: a troca ACONTECEU. */
export function montarAvisoDeTrocaConcluida(
  enderecoAntigo: string,
  enderecoNovo: string,
): Mensagem {
  return {
    para: enderecoAntigo,
    assunto: 'O e-mail da sua conta no Bichu foi trocado',
    corpo:
      `A sua conta do Bichu passou a usar este endereço:\n\n` +
      `${enderecoNovo}\n\n` +
      `Esta é a última mensagem que enviamos para o endereço anterior. A partir ` +
      `de agora, entrar e recuperar a senha passam pelo endereço novo.\n\n` +
      `Se não foi você, fale com a gente agora: quem controla o e-mail da conta ` +
      `controla a recuperação de senha.`,
  };
}

export function criarAuthService(deps: DependenciasDeIdentidade) {
  async function fotoDaSessao(dono: UserId): Promise<FotoProjetada | null> {
    return projetarFotoDoPerfil(await deps.repositorio.fotoDoPerfil(dono), deps.urlDeMidia);
  }

  async function emitirEEnviarToken(
    userId: UserId,
    email: string,
    proposito: PropositoDoToken,
    contexto: ContextoDaRequisicao,
  ): Promise<void> {
    const agora = deps.clock.now();
    const tokenBruto = deps.ids.opaqueToken();

    await deps.repositorio.criarTokenDeVerificacao({
      id: deps.ids.uuidv7(),
      userId,
      proposito,
      tokenHash: comoTokenHash(tokenBruto),
      enviadoPara: email,
      expiraEm: (agora + VALIDADE_EM_MS[proposito]) as Instant,
      ipHmac: deps.hmacDeIp(contexto.ip),
    });

    const base = deps.baseDaWeb.replace(/\/$/, '');
    const mensagem = montarMensagemDoToken(proposito, email, tokenBruto, base);

    await deps.mailer.enviar(mensagem);

    deps.registrarOcorrencia(
      {
        evento: 'email.send',
        proposito,
        userId,
        correlationId: contexto.correlationId,
      },
      'e-mail transacional enviado',
    );
  }

  async function enviarVerificacaoDoCadastro(
    conta: Conta,
    contexto: ContextoDaRequisicao,
  ): Promise<void> {
    try {
      await emitirEEnviarToken(conta.id, conta.email, 'email_verify', contexto);
    } catch (erro) {
      deps.registrarOcorrencia(
        {
          evento: 'email.send_failed',
          proposito: 'email_verify',
          userId: conta.id,
          correlationId: contexto.correlationId,
          motivo: erro instanceof Error ? erro.message : String(erro),
        },
        'o e-mail de verificação do cadastro não saiu; a conta e a sessão seguem de pé',
      );
    }
  }

  async function avisarSemDerrubar(
    mensagem: Mensagem,
    userId: UserId,
    contexto: ContextoDaRequisicao,
    evento: string,
  ): Promise<void> {
    try {
      await deps.mailer.enviar(mensagem);
      deps.registrarOcorrencia(
        { evento: 'email.send', proposito: evento, userId, correlationId: contexto.correlationId },
        'e-mail transacional enviado',
      );
    } catch (erro) {
      deps.registrarOcorrencia(
        {
          evento: 'email.send_failed',
          proposito: evento,
          userId,
          correlationId: contexto.correlationId,
          motivo: erro instanceof Error ? erro.message : String(erro),
        },
        'o aviso de troca de e-mail não saiu; a operação seguiu',
      );
    }
  }

  async function concluirTrocaDeEmail(
    hash: TokenHash,
    agora: Instant,
    contexto: ContextoDaRequisicao,
  ): Promise<Conta> {
    const consumido = await deps.repositorio.consumirTokenDeVerificacao(
      hash,
      'email_change',
      agora,
    );
    if (consumido === undefined) throw problemas.tokenDeVerificacaoVencido();

    const antes = await deps.repositorio.buscarContaPorId(consumido.userId);
    if (antes === undefined) throw problemas.tokenDeVerificacaoVencido();

    const atualizada = await deps.repositorio.concluirTrocaDeEmail(
      consumido.userId,
      consumido.enviadoPara,
      agora,
    );

    if (atualizada === undefined) throw problemas.tokenDeVerificacaoVencido();

    await avisarSemDerrubar(
      montarAvisoDeTrocaConcluida(antes.email, atualizada.email),
      consumido.userId,
      contexto,
      'email_change_done',
    );

    await deps.trilha.record({
      actorKind: 'user',
      actorUserId: consumido.userId,
      actorIp: contexto.ip,
      correlationId: contexto.correlationId,
      action: 'auth.email_changed',
      resourceKind: 'user',
      resourceId: consumido.userId,
    });

    return atualizada;
  }

  async function barreiraAtualDe(userId: UserId): Promise<Instant> {
    const conta = await deps.repositorio.buscarContaPorId(userId);
    return conta?.sessionsInvalidBefore ?? (0 as Instant);
  }

  async function abrirSessao(
    conta: Conta,
    continuarConectado: boolean,
    contexto: ContextoDaRequisicao,
    agora: Instant,
  ): Promise<ParDeTokens> {
    const prazos = prazosDeNovaFamilia(agora, deps.janelas, continuarConectado);
    const refreshToken: OpaqueToken = deps.ids.opaqueToken();
    const familyId = deps.ids.uuidv7();

    await deps.repositorio.gravarRefresh({
      id: deps.ids.uuidv7(),
      userId: conta.id,
      familyId,
      tokenHash: comoTokenHash(refreshToken),
      issuedAt: Math.max(agora, conta.sessionsInvalidBefore) as Instant,
      expiresAt: prazos.expiresAt,
      absoluteExpiresAt: prazos.absoluteExpiresAt,
      staySignedIn: continuarConectado,
      userAgent: contexto.userAgent,
      ipHmac: deps.hmacDeIp(contexto.ip),
    });

    const emitidoEm = instanteDeEmissaoDoAcesso(agora, conta.sessionsInvalidBefore);
    const acesso = deps.assinador.emitir(conta.id, emitidoEm, deps.ids.uuidv7(), familyId);
    return {
      accessToken: acesso.token,
      expiresInSeconds: acesso.expiresInSeconds,
      refreshToken,
      refreshExpiresAt: prazos.expiresAt,
    };
  }

  async function derrubarTodasAsSessoes(
    userId: UserId,
    motivo: MotivoDeRevogacaoEmMassa,
    contexto: ContextoDaRequisicao,
    agora: Instant,
  ): Promise<void> {
    const familiasCaidas = await deps.repositorio.revogarTodasAsFamilias(userId, motivo, agora);
    await deps.repositorio.invalidarSessoes(
      userId,
      instanteDeRevogacao(agora, await barreiraAtualDe(userId)),
      agora,
    );
    const aparelhosRemovidos =
      motivo === 'account_deleted' ? 0 : await deps.removerPushDaConta(userId);
    await deps.trilha.record({
      actorKind: 'user',
      actorUserId: userId,
      actorIp: contexto.ip,
      correlationId: contexto.correlationId,
      action: 'auth.sessions_revoked',
      resourceKind: 'user',
      resourceId: userId,
      metadata: {
        reason: motivo,
        revoked_families: familiasCaidas,
        devices_removed: aparelhosRemovidos,
      },
    });
  }

  async function avisarSemDerrubarOEfeito(
    mensagem: Mensagem,
    contexto: { readonly evento: string; readonly correlationId: string },
  ): Promise<void> {
    try {
      await deps.mailer.enviar(mensagem);
      deps.registrarOcorrencia(
        { evento: contexto.evento, correlationId: contexto.correlationId, enviado: true },
        'aviso de seguranca enviado',
      );
    } catch (erro: unknown) {
      deps.registrarOcorrencia(
        {
          evento: contexto.evento,
          correlationId: contexto.correlationId,
          enviado: false,
          erro: erro instanceof Error ? erro.message : String(erro),
        },
        'aviso de seguranca NAO saiu; o efeito no banco esta feito',
      );
    }
  }

  async function exigirNomeJaCadastrado(
    userId: UserId,
    nomeNoCorpo: string | null | undefined,
  ): Promise<void> {
    if (nomeNoCorpo !== undefined) return;
    const antes = await deps.repositorio.buscarContaPorId(userId);
    if (antes === undefined) throw problemas.naoAutenticado();
    if ((antes.displayName ?? '').trim().length === 0) {
      throw problemas.validacao([
        {
          field: 'display_name',
          code: 'required',
          message: 'Diga como você quer ser chamado para continuar.',
        },
      ]);
    }
  }

  return {
    async cadastrar(
      entrada: EntradaDeCadastro,
      contexto: ContextoDaRequisicao,
    ): Promise<SessionView> {
      const agora = deps.clock.now();
      const email = normalizarEmail(entrada.email);

      if (!emailTemFormaValida(email)) {
        throw problemas.validacao([
          { field: 'email', code: 'format', message: 'Confira o endereço de e-mail.' },
        ]);
      }

      const displayName = nomeDeExibicaoAparado(entrada.displayName);
      const birthDate = verificarDataDeNascimento(entrada.birthDate, agora);

      const apelidoVeio =
        typeof entrada.handle === 'string' && entrada.handle.trim().length > 0;
      const handle = apelidoVeio ? verificarApelido(entrada.handle) : undefined;
      const errosDeSenha = validarSenha(entrada.password, {
        email,
        displayName,
      });
      if (errosDeSenha.length > 0) throw problemas.senhaFraca(errosDeSenha);

      const passwordPhc = await gerarHashDeSenha(entrada.password);
      const conta = await deps.repositorio.criarContaLocal({
        email,
        birthDate,
        handle,
        displayName,
        acceptedTermsVersion: entrada.acceptedTermsVersion,
        passwordPhc,
        agora,
      });

      if (conta === undefined) {
        throw problemas.emailJaCadastrado();
      }

      const par = await abrirSessao(conta, false, contexto, agora);
      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.account_created',
        resourceKind: 'user',
        resourceId: conta.id,
      });

      await enviarVerificacaoDoCadastro(conta, contexto);

      return projetarSessao(conta, par, agora, await fotoDaSessao(conta.id));
    },

    async entrar(entrada: EntradaDeLogin, contexto: ContextoDaRequisicao): Promise<SessionView> {
      const agora = deps.clock.now();
      const email = normalizarEmail(entrada.email);
      const credencial = await deps.repositorio.buscarCredencialLocalPorEmail(email);

      if (credencial === undefined) {
        await consumirTempoDeVerificacao(entrada.password);
        await deps.trilha.record({
          actorKind: 'anonymous',
          actorIp: contexto.ip,
          correlationId: contexto.correlationId,
          action: 'auth.login_failed',
          resourceKind: 'user',
          metadata: { reason: 'unknown_account' },
        });
        throw problemas.credencialRecusada();
      }

      const senhaConfere = await verificarSenha(entrada.password, credencial.passwordPhc);
      if (!senhaConfere) {
        await deps.trilha.record({
          actorKind: 'user',
          actorUserId: credencial.userId,
          actorIp: contexto.ip,
          correlationId: contexto.correlationId,
          action: 'auth.login_failed',
          resourceKind: 'user',
          resourceId: credencial.userId,
          metadata: { reason: 'bad_password' },
        });
        throw problemas.credencialRecusada();
      }

      const conta = await deps.repositorio.buscarContaPorId(credencial.userId);
      if (conta === undefined) throw problemas.credencialRecusada();

      if (precisaDeRehash(credencial.passwordPhc)) {
        const novo = await gerarHashDeSenha(entrada.password);
        await deps.repositorio.regravarCredencial(credencial.identityId, novo, agora);
        await deps.trilha.record({
          actorKind: 'user',
          actorUserId: conta.id,
          actorIp: contexto.ip,
          correlationId: contexto.correlationId,
          action: 'auth.password_rehashed',
          resourceKind: 'user',
          resourceId: conta.id,
        });
      }

      await deps.repositorio.registrarLogin(credencial.identityId, agora);
      const par = await abrirSessao(conta, entrada.staySignedIn, contexto, agora);

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.login_succeeded',
        resourceKind: 'user',
        resourceId: conta.id,
        metadata: { stay_signed_in: entrada.staySignedIn },
      });
      return projetarSessao(conta, par, agora, await fotoDaSessao(conta.id));
    },

    async entrarComCredencialDigital(
      userId: UserId,
      continuarConectado: boolean,
      contexto: ContextoDaRequisicao,
    ): Promise<SessionView> {
      const agora = deps.clock.now();
      const conta = await deps.repositorio.buscarContaPorId(userId);
      if (conta === undefined) throw problemas.credencialRecusada();

      const par = await abrirSessao(conta, continuarConectado, contexto, agora);
      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.login_succeeded',
        resourceKind: 'user',
        resourceId: conta.id,
        metadata: { stay_signed_in: continuarConectado, method: 'passkey' },
      });
      return projetarSessao(conta, par, agora, await fotoDaSessao(conta.id));
    },

    async familiaDoRefresh(refreshApresentado: string): Promise<string | undefined> {
      const armazenado = await deps.repositorio.buscarRefreshPorHash(
        comoTokenHash(refreshApresentado),
      );
      return armazenado?.familyId;
    },

    async renovar(
      refreshApresentado: string,
      contexto: ContextoDaRequisicao,
    ): Promise<SessionView> {
      const agora = deps.clock.now();
      const armazenado = await deps.repositorio.buscarRefreshPorHash(
        comoTokenHash(refreshApresentado),
      );
      if (armazenado === undefined) throw problemas.sessaoExpirada();

      const jaConsumido = armazenado.rotatedToId !== null;
      if (jaConsumido || armazenado.revokedAt !== null) {
        if (jaConsumido) {
          await deps.repositorio.revogarFamilia(armazenado.familyId, 'reuse_detected', agora);
          await deps.trilha.record({
            actorKind: 'user',
            actorUserId: armazenado.userId,
            actorIp: contexto.ip,
            correlationId: contexto.correlationId,
            action: 'auth.refresh_reuse_detected',
            resourceKind: 'refresh_family',
            resourceId: armazenado.familyId,
          });
          await deps.avisarTitular({
            tipo: 'refresh_reuse_detected',
            userId: armazenado.userId,
            ocorridoEm: agora,
            correlationId: contexto.correlationId,
            ipHmac: deps.hmacDeIp(contexto.ip),
          });
        }
        throw problemas.sessaoExpirada();
      }

      if (armazenado.expiresAt <= agora) throw problemas.sessaoExpirada();
      if (armazenado.absoluteExpiresAt <= agora) throw problemas.sessaoExpirada();

      const conta = await deps.repositorio.buscarContaPorId(armazenado.userId);
      if (conta === undefined) throw problemas.sessaoExpirada();

      if (refreshFoiRevogado(armazenado.issuedAt, conta.sessionsInvalidBefore)) {
        await deps.trilha.record({
          actorKind: 'user',
          actorUserId: armazenado.userId,
          actorIp: contexto.ip,
          correlationId: contexto.correlationId,
          action: 'auth.refresh_rejected_revoked_session',
          resourceKind: 'refresh_family',
          resourceId: armazenado.familyId,
        });
        throw problemas.sessaoExpirada();
      }

      const prazos = prazosDeRotacao(
        agora,
        deps.janelas,
        armazenado.absoluteExpiresAt,
        armazenado.staySignedIn,
      );
      const novoRefresh: OpaqueToken = deps.ids.opaqueToken();

      const rotacionou = await deps.repositorio.rotacionar(
        armazenado.id,
        {
          id: deps.ids.uuidv7(),
          userId: conta.id,
          familyId: armazenado.familyId,
          tokenHash: comoTokenHash(novoRefresh),
          issuedAt: agora,
          expiresAt: prazos.expiresAt,
          absoluteExpiresAt: prazos.absoluteExpiresAt,
          staySignedIn: armazenado.staySignedIn,
          userAgent: contexto.userAgent,
          ipHmac: deps.hmacDeIp(contexto.ip),
        },
        agora,
      );
      if (!rotacionou) throw problemas.sessaoExpirada();

      const acesso = deps.assinador.emitir(
        conta.id,
        agora,
        deps.ids.uuidv7(),
        armazenado.familyId,
      );
      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.session_refreshed',
        resourceKind: 'refresh_family',
        resourceId: armazenado.familyId,
      });

      return projetarSessao(
        conta,
        {
          accessToken: acesso.token,
          expiresInSeconds: acesso.expiresInSeconds,
          refreshToken: novoRefresh,
          refreshExpiresAt: prazos.expiresAt,
        },
        agora,
        await fotoDaSessao(conta.id),
      );
    },

    async sair(
      autenticado: Autenticado,
      refreshApresentado: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const armazenado = await deps.repositorio.buscarRefreshPorHash(
        comoTokenHash(refreshApresentado),
      );
      if (armazenado === undefined || armazenado.userId !== autenticado.conta.id) {
        throw problemas.refreshNaoConfere();
      }

      const familia = armazenado.familyId;
      await deps.repositorio.revogarFamilia(familia, 'logout', agora);

      const localizacoesApagadas = await deps.apagarLocalizacaoDaSessao(
        autenticado.conta.id,
        comoFamiliaDeSessao(familia),
      );

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: autenticado.conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.logout',
        resourceKind: 'refresh_family',
        resourceId: familia,
        metadata: { locations_removed: localizacoesApagadas },
      });
    },

    async autenticar(tokenBruto: string): Promise<Autenticado> {
      const agora = deps.clock.now();
      const resultado = deps.assinador.verificar(tokenBruto, agora);
      if (!resultado.ok) {
        throw resultado.motivo === 'expirado' ? problemas.sessaoExpirada() : problemas.naoAutenticado();
      }

      const conta = await deps.repositorio.buscarContaPorId(resultado.claims.sub);
      if (conta === undefined) throw problemas.naoAutenticado();
      if (conta.status !== 'active') throw problemas.naoAutenticado();
      if (tokenFoiRevogado(resultado.claims.iat, conta.sessionsInvalidBefore)) {
        throw problemas.sessaoExpirada();
      }

      return {
        conta,
        jti: resultado.claims.jti,
        ...(typeof resultado.claims.sid === 'string' ? { sid: resultado.claims.sid } : {}),
      };
    },

    async meuPerfil(userId: UserId): Promise<Conta> {
      const conta = await deps.repositorio.buscarContaPorId(userId);
      if (conta === undefined) throw problemas.naoAutenticado();
      return conta;
    },

    async atualizarMeuPerfil(
      userId: UserId,
      campos: CamposDoPerfil,
      contexto: ContextoDaRequisicao,
    ): Promise<Conta> {
      const agora = deps.clock.now();

      const campaNome = campos.displayName;
      const camposParaGravar: CamposDoPerfil = {
        ...campos,
        ...(campaNome === undefined
          ? {}
          : { displayName: nomeDeExibicaoAparado(campaNome) }),
        ...(campos.handle === undefined
          ? {}
          : { handle: verificarApelido(campos.handle) }),
      };

      await exigirNomeJaCadastrado(userId, campaNome);

      const conta = await deps.repositorio.atualizarPerfil(userId, camposParaGravar, agora);
      if (conta === undefined) throw problemas.naoAutenticado();

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: userId,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'profile.updated',
        resourceKind: 'user',
        resourceId: userId,
        metadata: { campos: Object.keys(campos).filter((c) => campos[c as keyof CamposDoPerfil] !== undefined) },
      });

      return conta;
    },

    exigirNomeJaCadastrado,

    async minhaFoto(userId: UserId): Promise<FotoDoPerfil | null> {
      return deps.repositorio.fotoDoPerfil(userId);
    },

    async trocarMinhaFoto(
      userId: UserId,
      uploadId: string | null,
      contexto: ContextoDaRequisicao,
    ): Promise<Conta> {
      const agora = deps.clock.now();
      let conta: Conta | undefined;
      try {
        conta = await deps.repositorio.trocarFotoDoPerfil(userId, uploadId, agora);
      } catch (erro) {
        if (erro instanceof EnvioDeFotoNaoServe) {
          throw problemas.validacao([
            {
              field: 'photo_upload_id',
              code: 'upload_not_usable',
              message: 'Essa imagem não serve para esta conta. Envie-a de novo.',
            },
          ]);
        }
        throw erro;
      }
      if (conta === undefined) throw problemas.naoAutenticado();

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: userId,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'profile.updated',
        resourceKind: 'user',
        resourceId: userId,
        metadata: { campos: ['photo'], photo: uploadId !== null },
      });

      return conta;
    },

    async solicitarVerificacaoDeEmail(
      email: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const conta = await deps.repositorio.buscarContaPorEmail(normalizarEmail(email));
      if (conta === undefined || conta.emailVerifiedAt !== null) return;

      await emitirEEnviarToken(conta.id, conta.email, 'email_verify', contexto);
    },

    async confirmarVerificacaoDeEmail(
      tokenBruto: string,
      contexto: ContextoDaRequisicao,
    ): Promise<SessionView> {
      const agora = deps.clock.now();
      const hash = comoTokenHash(tokenBruto);

      const verificacao = await deps.repositorio.consumirTokenDeVerificacao(
        hash,
        'email_verify',
        agora,
      );

      let conta: Conta;
      let proposito: PropositoDoToken;

      if (verificacao !== undefined) {
        await deps.repositorio.marcarEmailVerificado(verificacao.userId, agora);
        await deps.trilha.record({
          actorKind: 'user',
          actorUserId: verificacao.userId,
          actorIp: contexto.ip,
          correlationId: contexto.correlationId,
          action: 'auth.email_verified',
          resourceKind: 'user',
          resourceId: verificacao.userId,
        });

        const atualizada = await deps.repositorio.buscarContaPorId(verificacao.userId);
        if (atualizada === undefined) throw problemas.tokenDeVerificacaoVencido();
        conta = atualizada;
        proposito = 'email_verify';
      } else {
        conta = await concluirTrocaDeEmail(hash, agora, contexto);
        proposito = 'email_change';
      }

      const par = await abrirSessao(conta, false, contexto, agora);
      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.session_opened_by_email_link',
        resourceKind: 'user',
        resourceId: conta.id,
        metadata: { purpose: proposito },
      });

      return projetarSessao(conta, par, agora, await fotoDaSessao(conta.id));
    },

    async solicitarTrocaDeEmail(
      userId: UserId,
      novoEmailBruto: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const conta = await deps.repositorio.buscarContaPorId(userId);
      if (conta === undefined) return;

      const novoEmail = normalizarEmail(novoEmailBruto);

      if (!emailTemFormaValida(novoEmail)) {
        deps.registrarOcorrencia(
          {
            evento: 'email_change.refused',
            userId,
            correlationId: contexto.correlationId,
            motivo: 'forma de endereço recusada',
          },
          'pedido de troca de e-mail recusado na borda do domínio',
        );
        return;
      }

      if (novoEmail === normalizarEmail(conta.email)) return;

      await avisarSemDerrubar(
        montarAvisoDeTrocaAoEnderecoAntigo(conta.email, novoEmail),
        userId,
        contexto,
        'email_change_requested',
      );

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: userId,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.email_change_requested',
        resourceKind: 'user',
        resourceId: userId,
      });

      const jaTemDono = await deps.repositorio.buscarContaPorEmail(novoEmail);
      if (jaTemDono !== undefined) {
        deps.registrarOcorrencia(
          {
            evento: 'email_change.refused',
            userId,
            correlationId: contexto.correlationId,
            motivo: 'endereço novo já pertence a uma conta viva',
          },
          'pedido de troca de e-mail encerrado sem token; a resposta não muda',
        );
        return;
      }

      await deps.repositorio.registrarPedidoDeTrocaDeEmail(userId, novoEmail, agora);

      try {
        await emitirEEnviarToken(userId, novoEmail, 'email_change', contexto);
      } catch (erro) {
        deps.registrarOcorrencia(
          {
            evento: 'email.send_failed',
            proposito: 'email_change',
            userId,
            correlationId: contexto.correlationId,
            motivo: erro instanceof Error ? erro.message : String(erro),
          },
          'o link de confirmação da troca não saiu; o pedido ficou registrado',
        );
      }
    },

    async solicitarRedefinicaoDeSenha(
      email: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const conta = await deps.repositorio.buscarContaPorEmail(normalizarEmail(email));
      if (conta === undefined) return;
      await emitirEEnviarToken(conta.id, conta.email, 'password_reset', contexto);
    },

    async conferirTokenDeRedefinicao(tokenBruto: string): Promise<void> {
      const valido = await deps.repositorio.conferirTokenDeVerificacao(
        comoTokenHash(tokenBruto),
        'password_reset',
        deps.clock.now(),
      );
      if (valido === undefined) throw problemas.tokenDeVerificacaoVencido();
    },

    async confirmarRedefinicaoDeSenha(
      tokenBruto: string,
      senhaNova: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const hash = comoTokenHash(tokenBruto);

      const pendente = await deps.repositorio.conferirTokenDeVerificacao(hash, 'password_reset', agora);
      if (pendente === undefined) throw problemas.tokenDeVerificacaoVencido();

      const problemasDaSenha = validarSenha(senhaNova, { email: pendente.enviadoPara });
      if (problemasDaSenha.length > 0) throw problemas.senhaFraca(problemasDaSenha);

      const consumido = await deps.repositorio.consumirTokenDeVerificacao(hash, 'password_reset', agora);
      if (consumido === undefined) throw problemas.tokenDeVerificacaoVencido();

      const credencial = await deps.repositorio.buscarCredencialLocalPorEmail(consumido.enviadoPara);
      if (credencial === undefined) throw problemas.tokenDeVerificacaoVencido();
      await deps.repositorio.regravarCredencial(
        credencial.identityId,
        await gerarHashDeSenha(senhaNova),
        agora,
      );

      await deps.repositorio.invalidarTokensPendentes(consumido.userId, agora);
      await deps.repositorio.cancelarTrocaDeEmailPendente(consumido.userId, agora);
      await derrubarTodasAsSessoes(consumido.userId, 'password_changed', contexto, agora);

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: consumido.userId,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.password_reset_completed',
        resourceKind: 'user',
        resourceId: consumido.userId,
      });

      await deps.mailer.enviar({
        para: consumido.enviadoPara,
        assunto: 'Sua senha do Bichu foi alterada',
        corpo:
          'A senha da sua conta no Bichu acabou de ser alterada.\n\n' +
          'Se foi você, não precisa fazer nada.\n\n' +
          'Se não foi, peça uma nova senha agora mesmo pelo aplicativo: ' +
          'quem fez isso entrou com um link enviado para este endereço.',
      });
    },

    async invalidarTodasAsSessoes(
      userId: UserId,
      motivo: MotivoDeRevogacaoEmMassa,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      await derrubarTodasAsSessoes(userId, motivo, contexto, deps.clock.now());
    },

    async sairDeTodosOsAparelhos(
      autenticado: Autenticado,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const conta = autenticado.conta;
      await derrubarTodasAsSessoes(conta.id, 'logout_all', contexto, deps.clock.now());

      await deps.mailer.enviar({
        para: conta.email,
        assunto: 'Suas sessoes do Bichu foram encerradas',
        corpo:
          'Todas as sessoes da sua conta no Bichu acabaram de ser encerradas, ' +
          'em todos os aparelhos.\n\n' +
          'Se foi voce, basta entrar de novo.\n\n' +
          'Se nao foi, troque a sua senha agora mesmo: quem fez isso estava ' +
          'dentro da sua conta.',
      });
    },

    async reautenticar(
      autenticado: Autenticado,
      senha: string,
      escopo: ReauthScope,
      contexto: ContextoDaRequisicao,
    ): Promise<{ reauthToken: OpaqueToken; expiresIn: number; scope: ReauthScope }> {
      const agora = deps.clock.now();
      const conta = autenticado.conta;
      const credencial = await deps.repositorio.buscarCredencialLocalPorEmail(conta.email);

      if (credencial === undefined || !(await verificarSenha(senha, credencial.passwordPhc))) {
        if (credencial === undefined) await consumirTempoDeVerificacao(senha);
        await deps.trilha.record({
          actorKind: 'user',
          actorUserId: conta.id,
          actorIp: contexto.ip,
          correlationId: contexto.correlationId,
          action: 'auth.reauth_refused',
          resourceKind: 'user',
          resourceId: conta.id,
          metadata: { scope: escopo },
        });
        throw problemas.credencialRecusada();
      }

      const tokenBruto: OpaqueToken = deps.ids.opaqueToken();
      await deps.repositorio.criarJanelaDeReautenticacao({
        id: deps.ids.uuidv7(),
        userId: conta.id,
        escopo,
        acessoJti: autenticado.jti,
        tokenHash: comoTokenHash(tokenBruto),
        emitidaEm: agora,
        expiraEm: expiracaoDaJanela(agora),
        ipHmac: deps.hmacDeIp(contexto.ip),
      });

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.reauth_granted',
        resourceKind: 'user',
        resourceId: conta.id,
        metadata: { scope: escopo },
      });

      return {
        reauthToken: tokenBruto,
        expiresIn: JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS,
        scope: escopo,
      };
    },

    async consumirReautenticacao(
      autenticado: Autenticado,
      tokenApresentado: string | undefined,
      escopo: ReauthScope,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const conta = autenticado.conta;

      const registrarRecusa = async (motivo: string): Promise<never> => {
        await deps.trilha.record({
          actorKind: 'user',
          actorUserId: conta.id,
          actorIp: contexto.ip,
          correlationId: contexto.correlationId,
          action: 'auth.reauth_window_refused',
          resourceKind: 'user',
          resourceId: conta.id,
          metadata: { scope: escopo, reason: motivo },
        });
        throw problemas.reautenticacaoNecessaria();
      };

      if (tokenApresentado === undefined || tokenApresentado === '') {
        return registrarRecusa('ausente');
      }

      const resultado = await deps.repositorio.consumirJanelaDeReautenticacao({
        tokenHash: comoTokenHash(tokenApresentado),
        userId: conta.id,
        escopoExigido: escopo,
        acessoJti: autenticado.jti,
        barreiraDaConta: conta.sessionsInvalidBefore,
        agora,
      });

      if (!resultado.consumida) return registrarRecusa(resultado.motivo);

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.reauth_window_used',
        resourceKind: 'user',
        resourceId: conta.id,
        metadata: { scope: escopo },
      });
    },

    async trocarSenha(
      autenticado: Autenticado,
      senhaAtual: string,
      senhaNova: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const conta = autenticado.conta;
      const credencial = await deps.repositorio.buscarCredencialLocalPorEmail(conta.email);

      if (credencial === undefined) {
        await consumirTempoDeVerificacao(senhaAtual);
        throw problemas.credencialRecusada();
      }
      if (!(await verificarSenha(senhaAtual, credencial.passwordPhc))) {
        await deps.trilha.record({
          actorKind: 'user',
          actorUserId: conta.id,
          actorIp: contexto.ip,
          correlationId: contexto.correlationId,
          action: 'auth.password_change_refused',
          resourceKind: 'user',
          resourceId: conta.id,
        });
        throw problemas.credencialRecusada();
      }

      const problemasDaSenha = validarSenha(senhaNova, { email: conta.email });
      if (problemasDaSenha.length > 0) throw problemas.senhaFraca(problemasDaSenha);

      await deps.repositorio.regravarCredencial(
        credencial.identityId,
        await gerarHashDeSenha(senhaNova),
        agora,
      );

      await deps.repositorio.invalidarTokensPendentes(conta.id, agora);
      await deps.repositorio.cancelarTrocaDeEmailPendente(conta.id, agora);
      await derrubarTodasAsSessoes(conta.id, 'password_changed', contexto, agora);

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.password_changed',
        resourceKind: 'user',
        resourceId: conta.id,
      });

      await deps.mailer.enviar({
        para: conta.email,
        assunto: 'Sua senha do Bichu foi alterada',
        corpo:
          'A senha da sua conta no Bichu acabou de ser alterada, e todas as ' +
          'sessoes foram encerradas.\n\n' +
          'Se foi voce, e so entrar de novo com a senha nova.\n\n' +
          'Se nao foi, peca uma nova senha agora mesmo pelo aplicativo.',
      });
    },

    async excluirMinhaConta(
      autenticado: Autenticado,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const conta = autenticado.conta;

      await derrubarTodasAsSessoes(conta.id, 'account_deleted', contexto, agora);

      const consequencias = await deps.repositorio.registrarPedidoDeExclusao(conta.id, agora);

      await deps.repositorio.invalidarTokensPendentes(conta.id, agora);

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'privacy.account_deletion_requested',
        resourceKind: 'user',
        resourceId: conta.id,
        metadata: {
          tags_revoked: consequencias?.tagsRevogadas ?? 0,
          already_requested: consequencias === undefined,
          purge_after: comoIso((agora + PRAZO_DE_EXPURGO_EM_MS) as Instant),
        },
      });

      await avisarSemDerrubarOEfeito(
        {
          para: conta.email,
          assunto: 'Sua conta do Bichu foi desativada',
          corpo:
            'Recebemos o seu pedido e a sua conta ja foi desativada: as sessoes ' +
            'foram encerradas em todos os aparelhos, as plaquinhas dos seus pets ' +
            'pararam de responder e o seu perfil, os seus pets e os seus ' +
            'anuncios nao aparecem mais no Bichu.\n\n' +
            'Os seus dados ficam guardados e inacessiveis no aplicativo. Para pedir ' +
            'o apagamento definitivo, responda esta mensagem.\n\n' +
            'Se nao foi voce que pediu, responda tambem: da para reativar.',
        },
        { evento: 'account.deletion_requested', correlationId: contexto.correlationId },
      );
    },

    async recusarSessaoAvisada(
      tokenApresentado: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const hash = comoTokenHash(tokenApresentado);

      const alvo = await deps.repositorio.conferirTokenDeVerificacao(
        hash,
        'session_disavow',
        agora,
      );
      if (alvo === undefined) throw problemas.tokenDeVerificacaoVencido();

      await derrubarTodasAsSessoes(alvo.userId, 'not_me', contexto, agora);
      await deps.repositorio.consumirTokenDeVerificacao(hash, 'session_disavow', agora);

      await deps.trilha.record({
        actorKind: 'anonymous',
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.session_disavowed',
        resourceKind: 'user',
        resourceId: alvo.userId,
      });

      await deps.repositorio.invalidarTokensPendentes(alvo.userId, agora);

      await avisarSemDerrubarOEfeito(
        {
          para: alvo.enviadoPara,
          assunto: 'Encerramos tudo. Agora troque a sua senha',
          corpo:
            'Voce respondeu que nao reconhece o acesso, e nos encerramos todas as ' +
            'sessoes da sua conta, em todos os aparelhos.\n\n' +
            'Falta uma coisa, e ela e importante: escolha uma senha nova. Enquanto ' +
            'a senha atual valer, quem a conhece entra de novo.\n\n' +
            'Peca a troca pela tela de entrar, em "Esqueci minha senha".',
        },
        { evento: 'session.disavowed', correlationId: contexto.correlationId },
      );
    },

    segundosAteExpirar: (ate: Instant, agora: Instant) => segundosRestantes(agora, ate),
  };
}

export type AuthService = ReturnType<typeof criarAuthService>;
export { AppError };
