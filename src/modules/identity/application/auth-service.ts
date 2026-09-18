/**
 * Casos de uso de conta e sessão.
 *
 * Orquestra portas e não conhece HTTP: o que sai daqui são objetos, e quem os
 * transforma em resposta é o adaptador. É isso que permite testar a regra de
 * rotação e a de reuso sem subir servidor nem banco.
 */
import { hashDeToken } from '../../../shared/crypto/digest.js';
import { AppError, problemas } from '../../../shared/http/errors.js';
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
  prazosDeNovaFamilia,
  prazosDeRotacao,
  segundosRestantes,
  tokenFoiRevogado,
} from '../domain/session.js';
import type { CamposDoPerfil, Conta } from '../ports/identity-repository.js';
import type { ContextoDaRequisicao, DependenciasDeIdentidade } from './dependencies.js';
import { projetarSessao, type ParDeTokens, type SessionView } from './session-view.js';

export interface EntradaDeCadastro {
  readonly email: string;
  readonly password: string;
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
}

function comoTokenHash(valor: string): TokenHash {
  return hashDeToken(valor).toString('base64') as TokenHash;
}

export function criarAuthService(deps: DependenciasDeIdentidade) {
  /**
   * Emite o par de tokens de uma **família nova**. Usado no cadastro e no login,
   * que são os dois momentos em que a senha foi de fato verificada — e é dessa
   * verificação que o teto absoluto de 180 dias começa a contar.
   */
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
      expiresAt: prazos.expiresAt,
      absoluteExpiresAt: prazos.absoluteExpiresAt,
      staySignedIn: continuarConectado,
      userAgent: contexto.userAgent,
      ipHmac: deps.hmacDeIp(contexto.ip),
    });

    const acesso = deps.assinador.emitir(conta.id, agora, deps.ids.uuidv7());
    return {
      accessToken: acesso.token,
      expiresInSeconds: acesso.expiresInSeconds,
      refreshToken,
      refreshExpiresAt: prazos.expiresAt,
    };
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
      const errosDeSenha = validarSenha(entrada.password, {
        email,
        displayName: entrada.displayName,
      });
      if (errosDeSenha.length > 0) throw problemas.senhaFraca(errosDeSenha);

      const passwordPhc = await gerarHashDeSenha(entrada.password);
      const conta = await deps.repositorio.criarContaLocal({
        email,
        displayName: entrada.displayName,
        acceptedTermsVersion: entrada.acceptedTermsVersion,
        passwordPhc,
        agora,
      });

      if (conta === undefined) {
        // SEC-003 diz que o cadastro não deve revelar se um e-mail tem conta. O
        // contrato, porém, fixa 409 `email-already-registered` nesta operação, e
        // contrato é decisão tomada: implemento o 409 e registro a divergência
        // em vez de reinterpretar.
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
      return projetarSessao(conta, par, agora);
    },

    async entrar(entrada: EntradaDeLogin, contexto: ContextoDaRequisicao): Promise<SessionView> {
      const agora = deps.clock.now();
      const email = normalizarEmail(entrada.email);
      const credencial = await deps.repositorio.buscarCredencialLocalPorEmail(email);

      if (credencial === undefined) {
        // A derivação acontece MESMO sem usuário, com os mesmos parâmetros. Sem
        // isso, a diferença entre "não achei" e "derivei 210.000 iterações" é um
        // oráculo de enumeração de centenas de milissegundos, que anula a
        // resposta 401 idêntica que o contrato especificou.
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

      // Rehash transparente. Guardar os parâmetros junto do hash só vale alguma
      // coisa se alguém os usar; sem isto o formato PHC é documentação.
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
      return projetarSessao(conta, par, agora);
    },

    /**
     * Rotação obrigatória: cada refresh vale **uma** vez.
     *
     * Apresentar um token já consumido revoga a família inteira, avisa a vítima
     * e responde 401. É assim que o roubo de token é detectado, e a revogação
     * sozinha não basta: a pessoa interpretaria como "o app me deslogou".
     */
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
          });
        }
        throw problemas.sessaoExpirada();
      }

      if (armazenado.expiresAt <= agora) throw problemas.sessaoExpirada();
      // Teto absoluto desde a autenticação com senha. A rotação empurra a
      // inatividade e **não** empurra este: sem ele, um refresh roubado e usado
      // a cada seis dias viveria para sempre.
      if (armazenado.absoluteExpiresAt <= agora) throw problemas.sessaoExpirada();

      const conta = await deps.repositorio.buscarContaPorId(armazenado.userId);
      if (conta === undefined) throw problemas.sessaoExpirada();

      // "Continuar conectado" é escolha feita na autenticação com senha e
      // carregada pela família. Ela vem da linha gravada, nunca do corpo do
      // pedido de renovação: senão o cliente promoveria a própria sessão de 30
      // para 180 dias, e a escolha deixaria de ser do usuário.
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
          expiresAt: prazos.expiresAt,
          absoluteExpiresAt: prazos.absoluteExpiresAt,
          staySignedIn: armazenado.staySignedIn,
          userAgent: contexto.userAgent,
          ipHmac: deps.hmacDeIp(contexto.ip),
        },
        agora,
      );
      // Perdeu a corrida para outro pedido do mesmo aparelho. Não é reuso, e
      // tratar como reuso derrubaria a sessão de um usuário legítimo com sinal
      // instável — o cenário mais comum deste produto.
      if (!rotacionou) throw problemas.sessaoExpirada();

      const acesso = deps.assinador.emitir(conta.id, agora, deps.ids.uuidv7());
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
      );
    },

    /** Encerra a sessão daquele aparelho, revogando a família apresentada. */
    async sair(
      autenticado: Autenticado,
      refreshApresentado: string | undefined,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      let familia: string | undefined;

      if (refreshApresentado !== undefined) {
        const armazenado = await deps.repositorio.buscarRefreshPorHash(
          comoTokenHash(refreshApresentado),
        );
        // A família só é revogada se pertencer a quem está pedindo. Sem esta
        // conferência, um token de outra conta apresentado aqui derrubaria a
        // sessão alheia.
        if (armazenado !== undefined && armazenado.userId === autenticado.conta.id) {
          familia = armazenado.familyId;
          await deps.repositorio.revogarFamilia(familia, 'logout', agora);
        }
      }

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: autenticado.conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.logout',
        resourceKind: 'refresh_family',
        ...(familia === undefined ? {} : { resourceId: familia }),
      });
    },

    /**
     * Verifica o token de acesso e, **em toda requisição**, confere o `iat`
     * contra `sessions_invalid_before` (SEC-006). A consulta ao banco já está no
     * caminho porque autorização e auditoria são nossas; é ela que faz a
     * revogação valer em menos de um segundo em vez de em até 15 minutos.
     */
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

      return { conta, jti: resultado.claims.jti };
    },

    /**
     * O perfil da conta, com o que falta e o que isso impede.
     *
     * `pending_profile_fields` e `can_open_lost_case` são **derivados aqui** e
     * não guardados: são função do estado da conta, e uma coluna que os
     * guardasse seria uma segunda fonte que envelhece na primeira verificação
     * de e-mail que alguém esquecer de propagar.
     */
    async meuPerfil(userId: UserId): Promise<Conta> {
      const conta = await deps.repositorio.buscarContaPorId(userId);
      if (conta === undefined) throw problemas.naoAutenticado();
      return conta;
    },

    /**
     * Atualiza o perfil. **Não aceita e-mail** (SEC-003).
     *
     * A ausência não é esquecimento: aceitar `email` aqui faria a resposta
     * revelar se um endereço já tem conta — o erro de unicidade viraria um
     * oráculo de existência consultável por qualquer pessoa logada, que é
     * exatamente o que o fluxo separado de troca de e-mail evita.
     */
    async atualizarMeuPerfil(
      userId: UserId,
      campos: CamposDoPerfil,
      contexto: ContextoDaRequisicao,
    ): Promise<Conta> {
      const agora = deps.clock.now();
      const conta = await deps.repositorio.atualizarPerfil(userId, campos, agora);
      if (conta === undefined) throw problemas.naoAutenticado();

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: userId,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'profile.updated',
        resourceKind: 'user',
        resourceId: userId,
        // O QUE mudou, nunca o valor: telefone e endereço são justamente o que a
        // trilha não pode guardar (docs/04-seguranca.md 9).
        metadata: { campos: Object.keys(campos).filter((c) => campos[c as keyof CamposDoPerfil] !== undefined) },
      });

      return conta;
    },

    /** Empurra `sessions_invalid_before`. Usada pelos cinco gatilhos do SEC-006. */
    async invalidarTodasAsSessoes(
      userId: UserId,
      motivo: 'logout' | 'password_changed' | 'account_deleted',
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      await deps.repositorio.invalidarSessoes(userId, agora);
      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: userId,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.sessions_revoked',
        resourceKind: 'user',
        resourceId: userId,
        metadata: { reason: motivo },
      });
    },

    segundosAteExpirar: (ate: Instant, agora: Instant) => segundosRestantes(agora, ate),
  };
}

export type AuthService = ReturnType<typeof criarAuthService>;
export { AppError };
