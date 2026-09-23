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
  instanteDeRevogacao,
  prazosDeNovaFamilia,
  prazosDeRotacao,
  refreshFoiRevogado,
  segundosRestantes,
  tokenFoiRevogado,
} from '../domain/session.js';
import type {
  CamposDoPerfil,
  Conta,
  MotivoDeRevogacao,
  PropositoDoToken,
} from '../ports/identity-repository.js';
import type { ReauthScope } from '../../../shared/http/route-definition.js';
import {
  expiracaoDaJanela,
  JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS,
} from '../domain/reautenticacao.js';

import type { ContextoDaRequisicao, DependenciasDeIdentidade } from './dependencies.js';
import { projetarSessao, type ParDeTokens, type SessionView } from './session-view.js';
import type { Mensagem } from '../ports/mailer.js';
import { comoIso } from '../../../shared/time/clock.js';

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
  'logout_all' | 'password_changed' | 'account_deleted' | 'not_me'
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
const VALIDADE_EM_MS: Record<PropositoDoToken, number> = {
  // 24 h (BICHUS-79 critério 6): o e-mail pode ser lido no dia seguinte.
  email_verify: 24 * 60 * 60 * 1000,
  // 24 h também, e pelo mesmo motivo do `email_verify`: o ato é o mesmo, que é
  // provar alcance a um endereço, e quem acabou de errar uma letra no cadastro
  // pode só abrir aquela caixa no dia seguinte. A janela curta do
  // `password_reset` protege contra caixa de entrada vazada ontem; aqui ela não
  // protegeria de nada, porque quem pede a troca com a sessão tomada controla o
  // endereço novo e abre o link no mesmo minuto. O que defende esta operação é
  // o aviso que sai para o endereço ANTIGO no instante do pedido, e não um
  // prazo apertado que só atinge quem é dono da conta de verdade.
  email_change: 24 * 60 * 60 * 1000,
  // 30 min (BICHUS-77 critério 4): é uma credencial de troca de senha, e a
  // janela curta é a diferença entre uma caixa de entrada vazada ontem servir
  // ou não servir hoje.
  password_reset: 30 * 60 * 1000,
  // 7 dias (BICHUS-215). Mais longo que os outros dois de propósito: quem
  // recebe este aviso pode estar sem o aparelho, sem a caixa de entrada à mão,
  // ou pode simplesmente não ter entendido na primeira leitura o que aconteceu.
  // O que a janela expõe é pequeno — o link só derruba sessão, e derrubar
  // sessão de quem já não deveria estar lá é o resultado desejado, não o dano.
  session_disavow: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Trinta dias entre a exclusão lógica e o expurgo (ADR-0010, e a descrição de
 * `deleteMyAccount` no contrato). O número está aqui e no worker lê daqui: duas
 * cópias dele seriam duas promessas de prazo que divergem sem ninguém notar.
 */
export const PRAZO_DE_EXPURGO_EM_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * O corpo de cada e-mail que carrega um token, num lugar só.
 *
 * Fora do factory porque não depende de nenhuma dependência injetada: é função
 * dos argumentos e de mais nada, e isso a torna testável sem bancada.
 *
 * O endereço de destino da troca é o endereço NOVO, e o link vai só para ele.
 * O aviso ao endereço antigo é outra mensagem, montada em
 * {@link montarAvisoDeTrocaAoEnderecoAntigo}, e sai no mesmo pedido.
 */
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

/**
 * O aviso que sai para o endereço ANTIGO, e a razão de ele existir.
 *
 * Trocar o e-mail é o gesto clássico de tomada de conta: quem toma a sessão
 * troca o endereço e captura a conta pela recuperação de senha. O endereço
 * antigo é a única testemunha que sobra, e por isso este aviso sai no instante
 * do PEDIDO e não depois da troca — depois é tarde, porque a essa altura a
 * recuperação de senha já aponta para o invasor.
 *
 * O endereço novo vai no corpo por extenso. Ele não é segredo de ninguém: esta
 * mensagem só chega a quem já é dono do endereço da conta, e é lendo QUAL
 * endereço foi pedido que a pessoa reconhece o que não pediu.
 */
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

/**
 * O segundo aviso ao endereço antigo: a troca ACONTECEU.
 *
 * O primeiro aviso sai no pedido e é o que dá tempo de reagir. Este sai na
 * conclusão e fecha o par, porque sem ele o endereço antigo fica sabendo que
 * alguém PEDIU e nunca se a troca valeu — e "pediram" sem desfecho é o tipo de
 * aviso que a pessoa aprende a ignorar.
 *
 * Ele é a última mensagem que este endereço recebe da conta: daqui em diante a
 * recuperação de senha passa pelo endereço novo.
 */
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
    proposito: PropositoDoToken,
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
    const mensagem = montarMensagemDoToken(proposito, email, tokenBruto, base);

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
   * Manda um aviso e **não deixa a falha dele derrubar a operação**.
   *
   * O engolir é deliberado e tem um caso concreto atrás: o endereço antigo pode
   * ser justamente o que não entrega — é a conta com `email_deliverable: false`,
   * que é quem mais precisa trocar de e-mail. Propagar a falha aqui faria o
   * aviso ao endereço morto **bloquear a troca**, e a pessoa que digitou o
   * endereço errado no cadastro ficaria sem saída de novo, que é exatamente o
   * defeito que esta operação existe para fechar.
   *
   * O que a falha não pode ser é silenciosa: sem o registro, um aviso que parou
   * de sair vira a tomada de conta sem testemunha.
   */
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

  /**
   * A outra metade de {@link solicitarTrocaDeEmail}: o token de troca foi
   * apresentado, e agora a conta muda de endereço.
   *
   * Lê a conta ANTES de escrever porque o endereço antigo precisa ser conhecido
   * depois da troca — é para ele que sai o aviso de conclusão, e depois do
   * `UPDATE` ele não existe mais em lugar nenhum.
   */
  async function concluirTrocaDeEmail(
    hash: TokenHash,
    agora: Instant,
    contexto: ContextoDaRequisicao,
  ): Promise<UserId> {
    const consumido = await deps.repositorio.consumirTokenDeVerificacao(
      hash,
      'email_change',
      agora,
    );
    // Inexistente, vencido, já consumido e de outro propósito viram o mesmo
    // 410: distinguir contaria a um estranho se aquele token existiu.
    if (consumido === undefined) throw problemas.tokenDeVerificacaoVencido();

    const antes = await deps.repositorio.buscarContaPorId(consumido.userId);
    if (antes === undefined) throw problemas.tokenDeVerificacaoVencido();

    const atualizada = await deps.repositorio.concluirTrocaDeEmail(
      consumido.userId,
      consumido.enviadoPara,
      agora,
    );

    // `undefined` aqui é o endereço que ganhou dono no meio do caminho, ou o
    // pedido que foi substituído por outro. Os dois viram o MESMO 410 do token
    // vencido — um 409 contaria a quem tem o link que aquele endereço passou a
    // existir, que é o oráculo que o SEC-003 fecha no cadastro.
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

    return consumido.userId;
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
  /**
   * A barreira que a conta tem AGORA, que é o outro lado da conta de
   * {@link instanteDeRevogacao}.
   *
   * Conta ausente devolve 0, e isso não é fallback silencioso: 0 faz o empurrão
   * sumir e a revogação gravar `agora`, que é o comportamento de sempre. O único
   * caminho que chega aqui sem conta é a exclusão de conta, em que a linha de
   * `users` já saiu — e ali não há token novo para alcançar.
   */
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
      // A REGRESSAO QUE NASCE DO ENCONTRO DE DOIS CONSERTOS CERTOS, e esta
      // linha e o conserto dela.
      //
      // SEC-006 faz a revogacao gravar `instanteDeRevogacao`, que numa segunda
      // revogacao dentro do mesmo segundo fica ate 1 s A FRENTE do relogio. A
      // BICHUS-77 faz `renovar()` recusar todo refresh com
      // `issuedAt < sessions_invalid_before`. Juntas: o refresh emitido no <=1 s
      // seguinte a uma revogacao dupla nasceria com `issuedAt = agora`, ja
      // abaixo da barreira, e a pessoa cairia na PRIMEIRA renovacao -- logo
      // depois de trocar a senha, que e o gesto com que ela acabou de retomar a
      // conta. Fecha em vez de abrir, mas e regressao de disponibilidade.
      //
      // `max` e NAO `Math.ceil`: a assimetria entre os dois lados e deliberada.
      // `tokenFoiRevogado` arredonda para o segundo porque o `iat` do JWT e
      // truncado; `refreshFoiRevogado` compara milissegundo com milissegundo e
      // o empate sobrevive de proposito. Arredondar aqui mataria esse empate --
      // e ha um caso em `session.test.ts` cobrando exatamente isso.
      issuedAt: Math.max(agora, conta.sessionsInvalidBefore) as Instant,
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
    // `sid` e a familia que acabou de nascer (ADR-0002, emenda 1): o token de
    // acesso passa a dizer de qual sessao ele veio.
    const acesso = deps.assinador.emitir(conta.id, emitidoEm, deps.ids.uuidv7(), familyId);
    return {
      accessToken: acesso.token,
      expiresInSeconds: acesso.expiresInSeconds,
      refreshToken,
      refreshExpiresAt: prazos.expiresAt,
    };
  }

  /**
   * As TRÊS metades da revogação em massa, num lugar só. Ver o comentário de
   * `invalidarTodasAsSessoes`, que é a porta pública desta função.
   *
   * Eram duas até 23/09, e a terceira é o SEC-019: revogar a credencial não
   * apagava o endereço de entrega do push. O comentário do terceiro passo, lá
   * embaixo, tem o caso inteiro.
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
    // A barreira sai de `instanteDeRevogacao` e não de `agora` cru (SEC-006):
    // duas revogações dentro do MESMO segundo deixariam vivo exatamente o token
    // emitido entre as duas, porque `instanteDeEmissaoDoAcesso` o datou na
    // virada do segundo seguinte à primeira barreira. Esta é a única gravação
    // de `sessions_invalid_before` em massa que existe, e é aqui que a conta é
    // feita -- os quatro gatilhos da BICHUS-125 herdam a correção por passarem
    // por este lugar.
    await deps.repositorio.invalidarSessoes(
      userId,
      instanteDeRevogacao(agora, await barreiraAtualDe(userId)),
      agora,
    );
    // O TERCEIRO PASSO, e ele é o SEC-019.
    //
    // Revogar credencial e apagar endereço de entrega eram tratados aqui como
    // a mesma palavra, e não são. Até 23/09 os seis caminhos que passam por
    // esta função derrubavam a sessão e deixavam `user_devices` intacta, com
    // `push_token` e `push_permission = granted`: quem teve o telefone levado
    // usava "Sair de todos os aparelhos", via as sessões caírem, e o aparelho
    // roubado continuava sendo destinatário válido de alerta de pet perdido —
    // com nome do animal e região dentro da notificação.
    //
    // ELE VEM DEPOIS DA BARREIRA, e a ordem não é estilo: `invalidarSessoes` é
    // o que fecha a janela de 15 minutos do token de acesso e é sensível a
    // tempo. Nada em push a afeta, e pôr uma chamada de rede ao banco de
    // aparelhos antes dela atrasaria a única metade que corre contra o relógio.
    //
    // A FALHA PROPAGA, e é deliberado: os passos 1 e 2 já estão duráveis,
    // repetir a operação inteira é idempotente, e o estado residual de uma
    // falha aqui ("sessão morta, push vivo") é exatamente o estado de hoje —
    // agora visível como erro em vez de silencioso. Um `catch` mudo com
    // resposta de sucesso seria a falha silenciosa que este repositório já
    // registrou cinco vezes.
    const aparelhosRemovidos = await deps.removerPushDaConta(userId);
    await deps.trilha.record({
      actorKind: 'user',
      actorUserId: userId,
      actorIp: contexto.ip,
      correlationId: contexto.correlationId,
      action: 'auth.sessions_revoked',
      resourceKind: 'user',
      resourceId: userId,
      // `devices_removed` soma-se a `revoked_families` e não a substitui: são
      // dois subsistemas, e um evento que só contasse famílias voltaria a
      // deixar "o endereço de entrega saiu?" sem resposta em lugar nenhum.
      metadata: {
        reason: motivo,
        revoked_families: familiasCaidas,
        devices_removed: aparelhosRemovidos,
      },
    });
  }


  /**
   * O aviso que NÃO pode derrubar o efeito que ele anuncia.
   *
   * Medido em 22/09 na forma irmã desta: "sair de todos os aparelhos" abortava
   * antes de o e-mail sair, e quem tinha perdido o aparelho ficava sem o
   * remédio **e** sem o aviso. A lição não é mudar o e-mail de lugar — ele
   * precisa vir depois, porque anuncia o que já aconteceu. É que a falha dele
   * não pode desfazer, nem esconder, o que já está gravado no banco.
   *
   * O `catch` engole e **não silencia**: sem o registro, um SMTP fora do ar
   * vira uma revogação que ninguém soube que aconteceu, que é o defeito de
   * detecção silenciosa outra vez, um nível acima.
   */
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
     * A família a que um token de renovação pertence, **sem consumi-lo**.
     *
     * Existe para o teto `token_family` de 10/min da renovação, que é aplicado
     * antes do handler (`registrarRota`). O teto precisa da família, e a família
     * só se conhece depois de uma leitura por hash — não há como deduzi-la do
     * token, que é opaco e rotaciona a cada uso. Contar pelo token em vez da
     * família daria um balde novo a cada renovação legítima e o teto nunca
     * fecharia, que é o mesmo que não existir.
     *
     * O preço é uma leitura a mais no caminho de renovação. É o preço de contar
     * a coisa certa, e a alternativa (contar pelo resumo do token apresentado)
     * parece funcionar e não conta nada.
     *
     * Devolve `undefined` para token desconhecido: um token que não existe não
     * tem família, e inventar um balde comum para todos eles juntaria vítimas de
     * expiração com quem está martelando valores aleatórios. Quem cobre esse
     * caso é a entrada `ip` / `invalid_attempts` da mesma rota.
     */
    async familiaDoRefresh(refreshApresentado: string): Promise<string | undefined> {
      const armazenado = await deps.repositorio.buscarRefreshPorHash(
        comoTokenHash(refreshApresentado),
      );
      return armazenado?.familyId;
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
            ipHmac: deps.hmacDeIp(contexto.ip),
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

      // SEC-006 do lado do refresh. Sem esta comparação a troca de senha não
      // expulsava ninguém: ela empurrava `sessions_invalid_before`, `autenticar()`
      // lia a coluna e `renovar()` não — então quem tinha o refresh copiado
      // pedia um token de acesso novo, com `iat = agora`, e passava pela
      // barreira. A vítima fazia o único gesto que o produto oferece contra
      // quem tomou a conta, e quem tomou a conta continuava dentro.
      //
      // Vem ANTES de `rotacionar`, e a ordem é a regra: recusar depois deixaria
      // a linha sucessora gravada com `issued_at` posterior à barreira, e o
      // refresh recusado desta vez passaria na próxima.
      //
      // A recusa é `sessaoExpirada()`, a MESMA de token desconhecido, consumido,
      // revogado e vencido. É de propósito: um corpo ou um status próprio aqui
      // transformaria a rota num oráculo que conta a um estranho, de posse de um
      // refresh qualquer, que aquela conta trocou a senha há pouco — que é a
      // informação de quem está procurando uma conta para atacar de novo.
      if (refreshFoiRevogado(armazenado.issuedAt, conta.sessionsInvalidBefore)) {
        // A tentativa negada é o sinal mais útil da trilha, e ela é interna: o
        // que sai pela resposta continua indistinguível de um refresh vencido.
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
          issuedAt: agora,
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

      // A renovacao continua na MESMA familia, entao o `sid` do token novo e o
      // da familia rotacionada, e nao um valor novo.
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
      );
    },

    /**
     * Encerra a sessão **daquele aparelho**, revogando no servidor a família de
     * refresh apresentada (ADR-0002, emenda 1).
     *
     * Três decisões desta função, e nenhuma delas é detalhe:
     *
     * **O refresh é obrigatório.** Ele já não pode ser `undefined` na
     * assinatura, e a ausência já foi recusada com 400 pela validação de
     * contrato antes de chegar aqui. Enquanto ela era aceita, sair sem
     * apresentar nada devolvia 204 sem ter revogado coisa alguma, e a família
     * ficava viva até vencer por inatividade — um refresh já copiado renovava
     * por até 180 dias contra uma pessoa que acredita ter saído.
     *
     * **Refresh desconhecido e refresh de outra conta recebem a MESMA recusa.**
     * A conferência de dono existe para impedir que um token alheio apresentado
     * aqui derrube a sessão de outra pessoa; responder diferente nos dois casos
     * transformaria esta rota num oráculo que conta se um token existe em algum
     * lugar. É a mesma razão de `credencialRecusada` e de
     * `verification-token-expired` terem corpo idêntico para causas diferentes.
     *
     * **`invalidarSessoes` não é chamada aqui, e a ausência é a decisão.**
     * `users.sessions_invalid_before` é por pessoa, não por sessão: empurrá-la
     * no logout comum derrubaria os outros aparelhos da mesma conta e tornaria
     * esta operação idêntica a "sair de todos os aparelhos", que precisa
     * continuar significando outra coisa — é o remédio de quem teve o aparelho
     * levado. A consequência aceita, e declarada no contrato, é que o token de
     * acesso já emitido sobrevive até o `exp`, no máximo 15 minutos, sem poder
     * ser renovado.
     *
     * Idempotente: `revogarFamilia` só alcança o que ainda não fora revogado, e
     * a busca por hash devolve a linha mesmo revogada. Repetir responde 204.
     */
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

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: autenticado.conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.logout',
        resourceKind: 'refresh_family',
        resourceId: familia,
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
      const hash = comoTokenHash(tokenBruto);

      // Os dois propósitos entram pela MESMA porta, e é o token que diz qual
      // deles é. O valor em claro é opaco: quem abre o link não escolhe rota, e
      // uma segunda operação pública para a troca seria um segundo lugar onde
      // errar a mesma coisa. A consulta por `email_verify` não escreve nada
      // quando o token é de troca — `purpose` está no `WHERE` —, então tentar
      // na ordem não gasta o token do outro propósito.
      const verificacao = await deps.repositorio.consumirTokenDeVerificacao(
        hash,
        'email_verify',
        agora,
      );

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
        return verificacao.userId;
      }

      return await concluirTrocaDeEmail(hash, agora, contexto);
    },

    /**
     * Pede a troca do e-mail da conta. Responde **sempre** 202.
     *
     * ## O que decide o desenho é o título: "com confirmação no endereço novo"
     *
     * A troca NÃO vale aqui. O que esta operação faz é declarar uma intenção em
     * `pending_email` e mandar um link para o endereço novo. Enquanto ele não
     * for aberto, `users.email` não muda — e é isso que impede que quem tomou a
     * sessão troque o endereço e capture a conta pela recuperação de senha, que
     * é o gesto clássico de tomada de conta.
     *
     * ## Qual e-mail vale entre pedir e confirmar
     *
     * O ANTIGO, para tudo: entrar, recuperar senha, receber aviso. `pending_email`
     * não entra em nenhuma cláusula de busca do repositório, e essa ausência é a
     * regra — um `OR pending_email = $1` em `buscarCredencialLocalPorEmail`
     * daria login pelo endereço não confirmado e tornaria esta confirmação
     * decorativa.
     *
     * ## O aviso ao endereço antigo sai AQUI, no pedido
     *
     * Antes do link, e não depois da troca. Depois é tarde: a essa altura a
     * recuperação de senha já aponta para o invasor, e o endereço antigo é a
     * única testemunha que a conta tem. O texto é o MESMO nos dois ramos abaixo,
     * porque variar com a existência do endereço novo transformaria a caixa de
     * entrada do titular num oráculo.
     *
     * ## O endereço novo já pertencer a outra conta não aparece na resposta
     *
     * O ramo existe — não emitimos token nem gravamos `pending_email` —, mas ele
     * não muda nem o status, nem o corpo, nem o que o endereço antigo recebe. É
     * a mesma opacidade que o SEC-003 exige do cadastro: aceitar a troca em
     * `PATCH /me` foi recusado justamente porque o erro de unicidade viraria um
     * oráculo de existência consultável por qualquer pessoa logada.
     */
    async solicitarTrocaDeEmail(
      userId: UserId,
      novoEmailBruto: string,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const conta = await deps.repositorio.buscarContaPorId(userId);
      if (conta === undefined) return;

      // Normalizar ANTES de conferir, nunca depois: a normalização pode
      // produzir caractere proibido a partir de ponto de código que passaria
      // na conferência (`normalizacao-nao-pode-vir-depois.test.ts`).
      const novoEmail = normalizarEmail(novoEmailBruto);

      // Segunda barreira de forma do produto, e a primeira fora do cadastro.
      // O endereço aqui é DIGITADO por quem chama, ao contrário do que as
      // outras mensagens usam, que vem do banco e já passou por aqui uma vez.
      // A regra é a de `gramatica-de-endereco.ts`, lida também pelo fio.
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

      // Pedir o endereço que a conta já usa não é troca, e não gasta e-mail
      // nenhum. Sair aqui não conta nada a ninguém: quem chama já sabe qual é o
      // próprio endereço, porque ele vem em `GET /v1/me`.
      if (novoEmail === normalizarEmail(conta.email)) return;

      // O aviso à testemunha sai PRIMEIRO, e sai igual nos dois ramos.
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
        // Nada é gravado e nada é enviado ao endereço novo. Mandar qualquer
        // coisa para ele entregaria a quem tem a sessão um jeito de usar o
        // nosso servidor para sondar endereços alheios.
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
        // Mesma decisão do cadastro: a falha de envio não vira 500 numa
        // operação que o contrato declara como sempre 202. O que ela não pode
        // ser é invisível.
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
      await deps.repositorio.cancelarTrocaDeEmailPendente(consumido.userId, agora);
      // Critério 5: todas as sessões e todos os refresh. As DUAS metades
      // (BICHUS-125): a barreira derruba o token de acesso em menos de um
      // segundo, e a revogação das famílias mata o refresh copiado antes da
      // troca. Até aqui só a barreira era empurrada, e as linhas de
      // `refresh_tokens` seguiam vivas até vencerem por inatividade.
      //
      // A barreira que `derrubarTodasAsSessoes` grava não é `agora` cru: ela
      // passa por `instanteDeRevogacao` (SEC-006), que alcança também o token
      // que `instanteDeEmissaoDoAcesso` datou à frente do relógio numa
      // revogação anterior do MESMO segundo.
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
     * **Abre a janela de reautenticação.** A única operação do sistema que
     * confere a senha de alguém já autenticado (critério 10 da BICHUS-48).
     *
     * O desenho concentra por três razões, e as três são o motivo de ela
     * existir em vez de cada operação destrutiva pedir a senha do seu jeito: a
     * senha trafega para **um** endpoint; o teto contra força bruta existe em
     * **um** lugar; e `DELETE /me` não precisa de corpo.
     *
     * ## A senha errada não diz nada além de "não confere"
     *
     * Conta sem credencial local e senha errada recebem a **mesma** recusa, e o
     * mesmo tempo de CPU. Hoje toda conta deste produto tem senha — `provider`
     * aceita `google`, `apple` e `keycloak` na restrição do banco e **nenhum
     * caminho de `src/` cria identidade com esses valores**, medido em 22/09. A
     * simetria não é para hoje: ela é o que faz o primeiro provedor externo
     * entrar sem transformar esta rota num oráculo de "aquela conta tem senha
     * local?", que é a pergunta que decide onde o ataque insiste.
     *
     * Não há resposta diferente para conta inexistente porque não existe esse
     * caso: quem chega aqui já apresentou um token de acesso válido.
     */
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
        // O hash de descarte roda quando não há credencial: sem ele a diferença
        // entre "não derivei nada" e "derivei 210.000 iterações" é um oráculo de
        // centenas de milissegundos.
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
        // `invalid-credentials`, que é um dos tipos que `registrarRota` conta
        // como tentativa inválida: é assim que o teto de 5 por hora do contrato
        // passa a valer sem ninguém precisar chamar o contador.
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

    /**
     * **Consome a janela, ou recusa.** É o que a borda chama antes de deixar
     * qualquer das seis operações destrutivas rodar.
     *
     * Lança `reautenticacaoNecessaria` (401, `reauthentication-required`) em
     * todos os casos de recusa, e o corpo é idêntico nos seis. O motivo
     * distinguido vai para a trilha: dizer "o escopo era outro" ou "essa janela
     * já foi usada" descreve a máquina para quem a está atacando, e quem
     * apresentou a janela certa nunca vê nenhuma dessas mensagens.
     *
     * A ausência do cabeçalho e um cabeçalho que não serve são o **mesmo** 401,
     * e isso é o critério 11: o app abre a folha de senha sem perder o que a
     * pessoa estava fazendo, e ele não precisa de dois caminhos para isso.
     */
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


    /**
     * `DELETE /v1/me` — a exclusão de conta, gatilho 3 do SEC-006.
     *
     * ## O que ela é, e o que ela não é
     *
     * Ela **não apaga linha nenhuma**. O contrato diz o que ela faz, e a
     * palavra está lá: *"Exclusão lógica imediata, expurgo definitivo em 30
     * dias"*. O apagamento físico é {@link expurgarContasExcluidas}, no worker,
     * e é ele que dispara as cascatas do banco. Responder 202 e não 204 é
     * exatamente isso: o pedido foi aceito e o efeito completo tem prazo.
     *
     * ## A ORDEM, que não é estilo
     *
     * A revogação vem **antes** da marcação, e o cenário (1) do SEC-006 é o
     * motivo literal: *"a pessoa exclui a conta e o atacante que tomou a sessão
     * continua lendo conversas e exportando dados por mais 15 minutos"*. Se a
     * marcação viesse primeiro e a revogação falhasse, o estado resultante
     * seria o pior possível — conta marcada como excluída, com sessão viva
     * dentro dela. Na ordem escrita aqui, a falha da revogação aborta sem ter
     * marcado nada, e a falha da marcação deixa a pessoa deslogada de uma conta
     * que ainda existe: ela entra de novo e repete. As duas falhas são
     * recuperáveis; a ordem inversa tem uma que não é.
     *
     * O e-mail é o último, e a falha dele é **isolada**. O remédio já aconteceu
     * e está gravado; deixar uma indisponibilidade do SMTP devolver 500 sobre
     * uma exclusão consumada faria a pessoa repetir o gesto mais destrutivo do
     * produto achando que ele não tinha funcionado.
     *
     * ## Reautenticação
     *
     * O contrato declara `x-reauth-scope: account_deletion` e a rota declara o
     * mesmo escopo. **A verificação não é implementada aqui**, e não é
     * esquecimento: ela é a BICHUS-48, que ainda não foi mesclada. Enquanto as
     * duas branches não se encontrarem, o que protege esta rota é o token de
     * acesso e o teto de 3 por 24 h.
     */
    async excluirMinhaConta(
      autenticado: Autenticado,
      contexto: ContextoDaRequisicao,
    ): Promise<void> {
      const agora = deps.clock.now();
      const conta = autenticado.conta;

      await derrubarTodasAsSessoes(conta.id, 'account_deleted', contexto, agora);

      const consequencias = await deps.repositorio.registrarPedidoDeExclusao(conta.id, agora);

      // Link de redefinição ou de verificação emitido antes do pedido
      // continuaria valendo depois dele, e é por ele que se volta a uma conta
      // que a pessoa acredita ter fechado. Mesmo critério 9 da BICHUS-77.
      await deps.repositorio.invalidarTokensPendentes(conta.id, agora);

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: conta.id,
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'privacy.account_deletion_requested',
        resourceKind: 'user',
        resourceId: conta.id,
        // Sem e-mail, sem nome e sem coordenada: a trilha sobrevive ao expurgo
        // de propósito, e o que sobrevive não pode reconstituir o perfil que a
        // exclusão existe para apagar (ADR-0010, cabeçalho de `audit-log.ts`).
        metadata: {
          tags_revoked: consequencias?.tagsRevogadas ?? 0,
          already_requested: consequencias === undefined,
          purge_after: comoIso((agora + PRAZO_DE_EXPURGO_EM_MS) as Instant),
        },
      });

      await avisarSemDerrubarOEfeito(
        {
          para: conta.email,
          assunto: 'Sua conta do Bichu foi excluida',
          corpo:
            'Recebemos o seu pedido de exclusao e a sua conta ja foi desativada: ' +
            'as sessoes foram encerradas em todos os aparelhos e as plaquinhas dos ' +
            'seus pets pararam de responder.\n\n' +
            'Os dados serao apagados definitivamente em 30 dias.\n\n' +
            'Se nao foi voce que pediu, responda esta mensagem agora: dentro desse ' +
            'prazo ainda da para desfazer.',
        },
        { evento: 'account.deletion_requested', correlationId: contexto.correlationId },
      );
    },

    /**
     * O "Nao fui eu" — gatilho 4 do SEC-006, e o único alcançável sem conta.
     *
     * ## De onde ele é acionado, e por que não pede login
     *
     * Do link do e-mail de reuso de refresh. Quem lê aquele e-mail pode ser
     * justamente quem **perdeu** a conta: o invasor já trocou o que precisava
     * trocar, ou o aparelho ficou com outra pessoa. Um botão que exija login é
     * inútil para ela, e o produto já resolveu esse mesmo problema uma vez, em
     * `cancelTransferByToken`: a operação existe para desfazer, e pedir
     * credencial para desfazer é a proteção trabalhando contra quem ela
     * protege.
     *
     * ## A ORDEM, e por que o token é gasto DEPOIS
     *
     * Uso único antes do efeito é a regra certa para efeito **não idempotente**
     * — uma redefinição de senha aplicada duas vezes são duas senhas. Esta não
     * é: revogar as sessões duas vezes tem o mesmo resultado de revogar uma,
     * porque `derrubarTodasAsSessoes` é idempotente e `sessions_invalid_before`
     * só anda para a frente. Com o efeito idempotente, a ordem pode ser
     * escolhida pelo modo de falhar — e gastar o token antes faria uma falha
     * passageira do banco queimar o único remédio da vítima, que não tem como
     * pedir outro link (quem dispara o aviso é o invasor).
     *
     * Por isso: confere sem consumir, revoga, e só então consome. A corrida de
     * dois cliques revoga duas vezes, que é o mesmo que uma, e o segundo recebe
     * 410.
     *
     * ## O que ele NÃO faz
     *
     * Não troca a senha. Quem tem o link não provou ser o titular, e uma troca
     * de senha a partir daqui trancaria o titular para fora usando exatamente o
     * link que existe para protegê-lo. O e-mail seguinte convida a redefinir
     * pelo fluxo que exige a caixa de entrada.
     */
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
      // Inexistente, vencido e já usado respondem igual. Distinguir contaria a
      // um estranho que aquele token existiu, e esta rota é pública.
      if (alvo === undefined) throw problemas.tokenDeVerificacaoVencido();

      await derrubarTodasAsSessoes(alvo.userId, 'not_me', contexto, agora);
      await deps.repositorio.consumirTokenDeVerificacao(hash, 'session_disavow', agora);

      // Um segundo evento, e ele registra a PROVENIÊNCIA que o primeiro não
      // consegue registrar. `derrubarTodasAsSessoes` grava `auth.sessions_revoked`
      // com `actorKind: 'user'`, porque a porta da trilha exige o titular quando
      // o ator é uma conta. Aqui quem agiu provou ter a caixa de entrada e NÃO
      // provou ser o titular, e `anonymous` é a única forma honesta de escrever
      // isso. Quem investigar precisa conseguir distinguir uma revogação pedida
      // de dentro da conta de uma pedida por um link.
      await deps.trilha.record({
        actorKind: 'anonymous',
        actorIp: contexto.ip,
        correlationId: contexto.correlationId,
        action: 'auth.session_disavowed',
        resourceKind: 'user',
        resourceId: alvo.userId,
      });

      // Redefinição pendente emitida por quem tomou a conta é a porta de
      // volta, e ela sobreviveria a esta revogação sem esta linha.
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
