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
  instanteDeEmissaoDoAcesso,
  prazosDeNovaFamilia,
  prazosDeRotacao,
  segundosRestantes,
  tokenFoiRevogado,
} from '../domain/session.js';
import type {
  CamposDoPerfil,
  Conta,
  MotivoDeRevogacao,
} from '../ports/identity-repository.js';

import type { ContextoDaRequisicao, DependenciasDeIdentidade } from './dependencies.js';
import { projetarSessao, type ParDeTokens, type SessionView } from './session-view.js';

/**
 * Os motivos que derrubam a conta INTEIRA — os gatilhos do SEC-006.
 *
 * `rotation`, `reuse_detected` e `logout` ficam de fora porque valem para UMA
 * família. O tipo é estreito de propósito: `logout` aqui apagaria da trilha a
 * diferença entre sair de um aparelho e derrubar a conta, que é a distinção que
 * a emenda 1 do ADR-0002 existe para fixar.
 */
type MotivoDeRevogacaoEmMassa = Extract<
  MotivoDeRevogacao,
  'logout_all' | 'password_changed' | 'account_deleted'
>;

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

/** Quanto vale cada token. Os números vêm das histórias, não daqui. */
const VALIDADE_EM_MS: Record<'email_verify' | 'password_reset', number> = {
  // 24 h (BICHUS-79 critério 6): o e-mail pode ser lido no dia seguinte.
  email_verify: 24 * 60 * 60 * 1000,
  // 30 min (BICHUS-77 critério 4): é uma credencial de troca de senha, e a
  // janela curta é a diferença entre uma caixa de entrada vazada ontem servir
  // ou não servir hoje.
  password_reset: 30 * 60 * 1000,
};

export function criarAuthService(deps: DependenciasDeIdentidade) {
  /**
   * Gera o token, guarda o HASH, e manda o valor em claro pelo e-mail.
   *
   * O valor em claro existe **só nesta função e no corpo da mensagem**. Ele não
   * é devolvido, não é registrado, não vai para a trilha e não passa pela fila
   * — é o critério 11 das duas histórias, e é por isso que o envio acontece
   * aqui dentro e não depois.
   *
   * O link é montado na hora do envio a partir de `baseDaWeb`, e nunca
   * guardado: um link gravado carrega o domínio do dia em que foi escrito, e
   * este e-mail é lido horas depois (§11.1 proibição 9).
   */
  async function emitirEEnviarToken(
    userId: UserId,
    email: string,
    proposito: 'email_verify' | 'password_reset',
    contexto: ContextoDaRequisicao,
  ): Promise<void> {
    const agora = deps.clock.now();
    // 256 bits de CSPRNG.
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
    const mensagem =
      proposito === 'email_verify'
        ? {
            para: email,
            assunto: 'Confirme seu e-mail no Bichu',
            corpo:
              `Confirme seu e-mail para liberar o aviso de pet perdido:\n\n` +
              `${base}/verificar-email?token=${tokenBruto}\n\n` +
              `O link vale por 24 horas. Se você não criou uma conta no Bichu, ignore esta mensagem.`,
          }
        : {
            para: email,
            assunto: 'Redefinir sua senha do Bichu',
            corpo:
              `Para escolher uma senha nova, abra:\n\n` +
              `${base}/redefinir-senha?token=${tokenBruto}\n\n` +
              `O link vale por 30 minutos e só pode ser usado uma vez.\n` +
              `Se não foi você que pediu, ignore — a sua senha continua a mesma.`,
          };

    await deps.mailer.enviar(mensagem);

    // O evento nasce AQUI, e não no transporte (BICHUS-147 critério 2). Foi a
    // ausência dele em homologação, diante de um 201, que provou que o caminho
    // nem tinha sido percorrido — e o transporte de log registrava, enquanto o
    // de SMTP não registra nada. Prova de disparo que depende de qual
    // transporte está ligado não prova disparo.
    //
    // `tokenBruto` NÃO entra aqui, e a ausência é o critério 7: o valor em
    // claro existe nesta função e no corpo da mensagem, e em nenhum outro
    // lugar. Registrar "o e-mail saiu" com o link dentro transformaria o log em
    // cópia da credencial, legível por quem investiga qualquer outra coisa.
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

  /**
   * O envio de verificação do CADASTRO, e o que ele engole.
   *
   * O envio é do servidor, dentro de `cadastrar` (BICHUS-147). Ele não é do
   * app depois do 201: `registerUser` já declara `x-effects: [notifies]` no
   * contrato, o reenvio tem teto de 3 por hora e gastá-lo na ida deixaria sem
   * remédio justamente quem errou o endereço, e cliente novo não herda a
   * memória de chamar.
   *
   * **A falha do envio não derruba a conta que nasceu** (critério 3). A conta
   * existe, a sessão abre, o par de tokens volta — e a falha fica no log com o
   * `correlation_id`, que é o que liga o 201 daquela pessoa ao e-mail que não
   * saiu. Propagar aqui devolveria 500 para quem já tem conta criada e sessão
   * aberta: o app mostraria erro de cadastro sobre um cadastro que deu certo, e
   * a pessoa tentaria de novo para colher um 409.
   *
   * O `catch` engole o erro mas **não o silencia**: sem o registro, o e-mail
   * que não sai vira exatamente o defeito que esta issue corrige, com a
   * diferença de ninguém conseguir provar.
   */
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

  /**
   * Emite o par de tokens de uma **família nova**. Usado no cadastro e no login,
   * que são os dois momentos em que a senha foi de fato verificada — e é dessa
   * verificação que o teto absoluto de 180 dias começa a contar.
   *
   * É aqui, e **só aqui**, que a emissão do token de acesso espera a virada do
   * segundo quando a conta acabou de ter as sessões invalidadas (BICHUS-132).
   * A senha recém-verificada é o que justifica o empurrão: depois de uma
   * redefinição, a senha nova só está na mão de quem a escolheu.
   *
   * `renovar` NÃO recebe o mesmo tratamento, e a ausência é a decisão. Lá o que
   * se apresenta é um refresh, não a senha — e quem tomou a conta está
   * justamente renovando em laço no instante em que a vítima troca a senha. Dar
   * o empurrão ali devolveria a ele a janela de um segundo que o arredondamento
   * de `tokenFoiRevogado` existe para tirar. Depois de uma redefinição a pessoa
   * legítima não renova: a família dela caiu junto, e o caminho dela é entrar.
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

    // A espera da virada do segundo mora aqui, e não no domínio: quem sabe QUAL
    // conta está entrando é o caso de uso. O domínio só faz a conta — ele não
    // pode ler relógio, e não precisa: `agora` já chega injetado.
    //
    // Nada mais se move junto. Os prazos do refresh, a trilha e a projeção
    // continuam em `agora`: o que muda é o `iat` de UM token, em até um segundo,
    // e só no login logo depois de uma redefinição de senha.
    const emitidoEm = instanteDeEmissaoDoAcesso(agora, conta.sessionsInvalidBefore);
    const acesso = deps.assinador.emitir(conta.id, emitidoEm, deps.ids.uuidv7());
    return {
      accessToken: acesso.token,
      expiresInSeconds: acesso.expiresInSeconds,
      refreshToken,
      refreshExpiresAt: prazos.expiresAt,
    };
  }

  /**
   * As DUAS metades da revogação em massa, num lugar só. Ver o comentário de
   * `invalidarTodasAsSessoes`, que é a porta pública desta função.
   *
   * Existe como função interna, e não como chamada repetida em cada gatilho,
   * porque quatro cópias de "revoga e empurra" são quatro chances de alguém
   * mexer numa e esquecer das outras três — que é exatamente como a redefinição
   * de senha ficou empurrando a barreira sem revogar família nenhuma.
   */
  async function derrubarTodasAsSessoes(
    userId: UserId,
    motivo: MotivoDeRevogacaoEmMassa,
    contexto: ContextoDaRequisicao,
    agora: Instant,
  ): Promise<void> {
    const familiasCaidas = await deps.repositorio.revogarTodasAsFamilias(userId, motivo, agora);
    await deps.repositorio.invalidarSessoes(userId, agora);
    await deps.trilha.record({
      actorKind: 'user',
      actorUserId: userId,
      actorIp: contexto.ip,
      correlationId: contexto.correlationId,
      action: 'auth.sessions_revoked',
      resourceKind: 'user',
      resourceId: userId,
      metadata: { reason: motivo, revoked_families: familiasCaidas },
    });
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

      // O e-mail de verificação sai DAQUI, e depois da consulta de unicidade
      // (critério 6): se o envio viesse antes de `criarContaLocal`, um POST com
      // o endereço de outra pessoa faria este serviço mandar e-mail para ela.
      // Sem esta linha a conta fica com `email_verified_at` nulo para sempre, e
      // sem contato verificado o tutor não marca o pet como perdido
      // (BICHUS-73) — era este o defeito de BICHUS-147.
      await enviarVerificacaoDoCadastro(conta, contexto);

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

    // --- Verificação de e-mail e redefinição de senha --------------------

    /**
     * Pede o link de verificação. Responde **sempre** 202.
     *
     * Conta inexistente, conta já verificada e conta de outra pessoa produzem a
     * mesma resposta: qualquer diferença aqui é um oráculo de existência de
     * e-mail, consultável sem conta nenhuma.
     */
    async solicitarVerificacaoDeEmail(
      email: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const conta = await deps.repositorio.buscarContaPorEmail(normalizarEmail(email));
      // Sai em silêncio: não existe, ou já está verificada. As duas viram 202.
      if (conta === undefined || conta.emailVerifiedAt !== null) return;

      await emitirEEnviarToken(conta.id, conta.email, 'email_verify', contexto);
    },

    /**
     * Confirma o e-mail. O token é consumido **atomicamente**.
     *
     * `undefined` cobre inexistente, expirado e já consumido, e os três viram
     * 410 — distinguir contaria a um estranho se aquele token existiu.
     */
    async confirmarVerificacaoDeEmail(
      tokenBruto: string,
      contexto: ContextoDaRequisicao,
    ): Promise<UserId> {
      const agora = deps.clock.now();
      const consumido = await deps.repositorio.consumirTokenDeVerificacao(
        comoTokenHash(tokenBruto),
        'email_verify',
        agora,
      );
      if (consumido === undefined) throw problemas.tokenDeVerificacaoVencido();

      await deps.repositorio.marcarEmailVerificado(consumido.userId, agora);
      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: consumido.userId,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.email_verified',
        resourceKind: 'user',
        resourceId: consumido.userId,
      });
      return consumido.userId;
    },

    /**
     * Pede o link de redefinição. Responde **sempre** 202 (critério 2).
     *
     * Funciona inclusive com a conta em bloqueio temporário por falhas de login
     * (critério 10): recusar aqui trancaria para fora justamente o titular que
     * está tentando recuperar o acesso — e quem causou o bloqueio foi o
     * atacante.
     */
    async solicitarRedefinicaoDeSenha(
      email: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const conta = await deps.repositorio.buscarContaPorEmail(normalizarEmail(email));
      if (conta === undefined) return;
      await emitirEEnviarToken(conta.id, conta.email, 'password_reset', contexto);
    },

    /** Só confere, sem consumir. Serve à página antes do formulário. */
    async conferirTokenDeRedefinicao(tokenBruto: string): Promise<void> {
      const valido = await deps.repositorio.conferirTokenDeVerificacao(
        comoTokenHash(tokenBruto),
        'password_reset',
        deps.clock.now(),
      );
      if (valido === undefined) throw problemas.tokenDeVerificacaoVencido();
    },

    /**
     * Redefine a senha.
     *
     * **A ordem das três primeiras linhas é o critério 12**, e não estilo: a
     * senha é validada ANTES de o token ser consumido. Consumir primeiro
     * gastaria o único link que a pessoa tem porque ela digitou uma senha curta
     * — e ela teria que pedir outro e-mail para tentar de novo.
     */
    async confirmarRedefinicaoDeSenha(
      tokenBruto: string,
      senhaNova: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const hash = comoTokenHash(tokenBruto);

      // 1. O token existe? (sem consumir)
      const pendente = await deps.repositorio.conferirTokenDeVerificacao(hash, 'password_reset', agora);
      if (pendente === undefined) throw problemas.tokenDeVerificacaoVencido();

      // 2. A senha serve? Recusar aqui NÃO gasta o token.
      const problemasDaSenha = validarSenha(senhaNova, { email: pendente.enviadoPara });
      if (problemasDaSenha.length > 0) throw problemas.senhaFraca(problemasDaSenha);

      // 3. Agora sim, atomicamente. Entre 1 e 3 outra requisição pode ter
      //    consumido, e é por isso que 3 confere de novo em vez de confiar em 1.
      const consumido = await deps.repositorio.consumirTokenDeVerificacao(hash, 'password_reset', agora);
      if (consumido === undefined) throw problemas.tokenDeVerificacaoVencido();

      const credencial = await deps.repositorio.buscarCredencialLocalPorEmail(consumido.enviadoPara);
      if (credencial === undefined) throw problemas.tokenDeVerificacaoVencido();
      await deps.repositorio.regravarCredencial(
        credencial.identityId,
        await gerarHashDeSenha(senhaNova),
        agora,
      );

      // Critério 9: TODO token pendente cai junto. Um link de redefinição
      // emitido antes da troca continuaria valendo depois dela, e é por ele
      // que quem tomou a conta volta.
      await deps.repositorio.invalidarTokensPendentes(consumido.userId, agora);
      // Critério 5: todas as sessões e todos os refresh. As DUAS metades
      // (BICHUS-125): a barreira derruba o token de acesso em menos de um
      // segundo, e a revogação das famílias mata o refresh copiado antes da
      // troca. Até aqui só a barreira era empurrada, e as linhas de
      // `refresh_tokens` seguiam vivas até vencerem por inatividade.
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

      // Critério 7: avisar o endereço da conta. Se a troca não foi o titular,
      // este e-mail é a única chance dele de descobrir hoje.
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

    /**
     * Os cinco gatilhos do SEC-006 passam por aqui, e ela faz **duas** coisas.
     *
     * 1. Revoga **todas as famílias de refresh** da conta. É o efeito: sem ele
     *    as linhas seguem vivas no banco até vencerem por inatividade.
     * 2. Empurra `sessions_invalid_before`. É a barreira: derruba o token de
     *    **acesso** já emitido em menos de um segundo, sem esperar o `exp`.
     *
     * **Nenhuma das duas substitui a outra**, e a ordem não é estilo. A
     * revogação vem primeiro porque, entre os dois passos, um refresh copiado
     * que chegasse a `renovar()` rotacionaria e receberia um token de acesso com
     * `iat = agora` — depois da barreira, portanto imune a ela. Com a revogação
     * primeiro, esse refresh já encontra `revokedAt` preenchido. A barreira lida
     * por `renovar()` (BICHUS-77) é rede de proteção para o caso de esta ordem
     * ser desfeita; ela não é motivo para prescindir da revogação.
     *
     * Idempotente: chamada com a conta já sem sessão nenhuma, revoga zero linhas
     * e grava o evento assim mesmo. O evento é do **pedido**, não do efeito.
     */
    async invalidarTodasAsSessoes(
      userId: UserId,
      motivo: MotivoDeRevogacaoEmMassa,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      await derrubarTodasAsSessoes(userId, motivo, contexto, deps.clock.now());
    },

    /**
     * "Sair de todos os aparelhos" — o segundo verbo da emenda 1 do ADR-0002.
     *
     * É o remédio de quem perdeu o aparelho, e o único que fecha a janela de até
     * 15 minutos que o logout comum deixa aberta de propósito.
     *
     * A conta **é a do token**, nunca do corpo do pedido: derrubar a conta de
     * outra pessoa não pode ser possível nem com o identificador dela na mão
     * (ADR-0021 — a autorização vai na cláusula, não num `if` de papel).
     *
     * Quem pediu também cai, e isso é o desenho: o aparelho de onde o pedido
     * saiu é um dos "todos". A tela avisa e o app reautentica.
     */
    async sairDeTodosOsAparelhos(
      autenticado: Autenticado,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const conta = autenticado.conta;
      await derrubarTodasAsSessoes(conta.id, 'logout_all', contexto, deps.clock.now());

      // Se quem pediu não foi o titular, este e-mail é a única chance de ele
      // descobrir hoje. Mesmo raciocínio do aviso da redefinição de senha.
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

    /**
     * Troca a senha de quem está autenticado, conferindo a senha atual.
     *
     * A senha atual é conferida aqui — e não via `X-Reauth-Token` — porque é o
     * que o contrato declara em `changePassword`: a operação leva
     * `verifies_secret` e `current_password` no corpo, e **não** leva
     * `reauth: []`. Trocar isso é mexer no contrato público, e não é desta
     * história.
     *
     * A ordem das linhas é a mesma da redefinição, pelo mesmo motivo: a senha
     * nova é validada **antes** de a atual ser conferida? Não — aqui é o
     * inverso, e de propósito. A senha atual vem primeiro porque, enquanto ela
     * não for conferida, quem está do outro lado pode ser o invasor: devolver
     * "sua senha nova é fraca" a quem não provou saber a senha atual entrega
     * informação sobre a política a quem não tinha direito a ela, e gasta CPU de
     * hash a pedido de qualquer um com um token de acesso.
     */
    async trocarSenha(
      autenticado: Autenticado,
      senhaAtual: string,
      senhaNova: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const conta = autenticado.conta;
      const credencial = await deps.repositorio.buscarCredencialLocalPorEmail(conta.email);

      // Conta sem senha local (só provedor externo, no futuro) e senha errada
      // recebem a MESMA recusa. Distinguir diria a quem tomou o token de acesso
      // se aquela conta tem senha — e é por aí que ele decide onde insistir.
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

      // Mesmo par da redefinição: link pendente cai junto, senão quem tomou a
      // conta volta por um `password_reset` pedido antes da troca.
      await deps.repositorio.invalidarTokensPendentes(conta.id, agora);
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

    segundosAteExpirar: (ate: Instant, agora: Instant) => segundosRestantes(agora, ate),
  };
}

export type AuthService = ReturnType<typeof criarAuthService>;
export { AppError };
