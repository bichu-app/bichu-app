import type { NextAction, ProblemFieldError, ProblemType } from './problem.js';
import { STATUS_DO_PROBLEMA } from './problem.js';

interface AppErrorOptions {
  readonly detail?: string;
  readonly nextAction?: NextAction;
  readonly errors?: readonly ProblemFieldError[];
  readonly retryAfterSeconds?: number;
  readonly cause?: unknown;
  readonly cabecalhos?: Readonly<Record<string, string>>;
  readonly statusDeIndisponibilidade?: 503;
}

export class AppError extends Error {
  readonly problemType: ProblemType;
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly nextAction: NextAction | undefined;
  readonly errors: readonly ProblemFieldError[] | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly cabecalhos: Readonly<Record<string, string>> | undefined;

  constructor(problemType: ProblemType, title: string, options: AppErrorOptions = {}) {
    super(`${problemType}: ${title}`, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.problemType = problemType;
    this.status = options.statusDeIndisponibilidade ?? STATUS_DO_PROBLEMA[problemType];
    this.title = title;
    this.detail = options.detail;
    this.nextAction = options.nextAction;
    this.errors = options.errors;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.cabecalhos = options.cabecalhos;
  }
}

/**
 * O prazo do 429 em palavras, a partir do **mesmo número** que vai no
 * `Retry-After`.
 */
export function prazoEmPalavras(segundos: number): string {
  const total = Math.max(1, Math.ceil(segundos));
  if (total < 60) return total === 1 ? '1 segundo' : `${total} segundos`;
  const minutos = Math.ceil(total / 60);
  if (minutos < 60) return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
  const horas = Math.ceil(minutos / 60);
  if (horas < 24) return horas === 1 ? '1 hora' : `${horas} horas`;
  const dias = Math.ceil(horas / 24);
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

/**
 * Os construtores abaixo existem para que o título de cada tipo fique num lugar
 * só.
 */
export const problemas = {
  validacao: (errors: readonly ProblemFieldError[], detail?: string): AppError =>
    new AppError('validation-failed', 'Confira os dados', {
      ...(detail === undefined ? {} : { detail }),
      errors,
    }),

  emailJaCadastrado: (): AppError =>
    new AppError('email-already-registered', 'E-mail já cadastrado', {
      detail: 'Existe uma conta com este e-mail. Entre em vez de criar outra.',
      nextAction: 'sign_in',
    }),

  /**
   * 422. A dimensao DECLARADA no pedido de envio de imagem de catalogo e menor que a
   * minima do proposito.
   */
  imagemPequenaDemais: (minima: { largura: number; altura: number }, errors: readonly ProblemFieldError[]): AppError =>
    new AppError('image-too-small', 'Essa imagem é pequena demais', {
      detail: `A imagem precisa ter pelo menos ${String(minima.largura)} x ${String(minima.altura)} pixels. Escolha outra.`,
      errors,
    }),

  senhaFraca: (errors: readonly ProblemFieldError[]): AppError =>
    new AppError('weak-password', 'Escolha uma senha mais longa', {
      detail: 'A senha precisa de pelo menos 10 caracteres. Uma frase que só você lembra funciona bem.',
      errors,
    }),

  /** E-mail ou senha não conferem. */
  credencialRecusada: (): AppError =>
    new AppError('invalid-credentials', 'E-mail ou senha não conferem', {
      detail: 'Confira os dois campos e tente de novo. Se esqueceu a senha, dá para criar uma nova.',
    }),

  /**
   * O mesmo 401 no painel (ADR-0027 D43, D61), SEM o convite a criar senha nova: a
   * conta do painel nao tem recuperacao por e-mail (item 20.4), e o `/entrar` ja
   * diz, em texto fixo, a quem pedir a redefinicao.
   */
  credencialDoPainelRecusada: (): AppError =>
    new AppError('invalid-credentials', 'E-mail ou senha não conferem', {
      detail: 'Confira os dois campos e tente de novo.',
    }),

  sessaoExpirada: (): AppError =>
    new AppError('token-expired', 'Entre de novo', {
      detail: 'Sua sessão terminou.',
      nextAction: 'sign_in',
    }),

  /**
   * O `refresh_token` apresentado no logout não existe, ou não é desta conta
   * (ADR-0002, emenda 1).
   */
  refreshNaoConfere: (): AppError =>
    new AppError('validation-failed', 'Confira os dados', {
      detail: 'Um ou mais campos não passaram na validação.',
      errors: [
        {
          field: 'refresh_token',
          code: 'unknown',
          message: 'Este refresh não pertence a esta sessão.',
        },
      ],
    }),

  /** Sem token, token ausente ou assinatura que não confere. */
  naoAutenticado: (): AppError =>
    new AppError('unauthenticated', 'Entre para continuar', { nextAction: 'sign_in' }),

  /** Autenticado e sem permissão sobre **este** recurso. */
  semPermissao: (detail?: string): AppError =>
    new AppError('forbidden', 'Esta ação não é sua', detail === undefined ? {} : { detail }),

  /** A sessão continua valendo; falta a janela de reautenticação. */
  reautenticacaoNecessaria: (): AppError =>
    new AppError('reauthentication-required', 'Confirme sua senha', {
      detail: 'Esta ação não pode ser desfeita, então pedimos a senha de novo.',
    }),

  naoEncontrado: (): AppError => new AppError('not-found', 'Não encontramos isso'),

  /**
   * A guarda do prefixo `/v1/admin` recusou: papel, `Origin` ou `X-CSRF-Token` (D37,
   * D39).
   */
  proibidoNoPainel: (): AppError => new AppError('forbidden', 'Você não tem permissão para isto'),

  /**
   * A sessao administrativa venceu, foi revogada ou e anterior a
   * `sessions_invalid_before`.
   */
  sessaoDoPainelVencida: (): AppError =>
    new AppError('token-expired', 'A sua sessão terminou', { nextAction: 'sign_in' }),

  /** ADR-0027 item 20.5: metodo que o caminho administrativo nao declara. */
  metodoNaoPermitido: (): AppError => new AppError('method-not-allowed', 'Este endereço não aceita este método'),

  /**
   * D41: `X-Captcha-Token` ausente, invalido ou com nota abaixo de 0,5 no login do
   * painel.
   */
  captchaRecusado: (): AppError =>
    new AppError('captcha-rejected', 'Não conseguimos confirmar este acesso', {
      detail: 'Tente de outra rede. Se continuar, fale com o responsável pelo painel.',
    }),

  /**
   * O texto **não normaliza para um código**: tamanho diferente de 26 depois da
   * normalização, ou caractere fora do alfabeto de Crockford.
   */
  tagCodeMalformado: (): AppError =>
    new AppError('tag-code-malformed', 'Confira o código da plaquinha', {
      detail: 'O código tem 16 caracteres. Confira e digite de novo, com ou sem os hífens.',
    }),

  /**
   * Teto de pets por conta. É o sentido verdadeiro de `pet-limit-reached`, que até
   * 18/09 era emprestado pelo teto de tags — ver `tetoDeTagsAtivas` logo abaixo, que
   * agora tem tipo próprio.
   */
  tetoDePetsDaConta: (): AppError =>
    new AppError('pet-limit-reached', 'Você chegou ao limite de pets desta conta', {
      detail: 'São 20 por conta. Se você cuida de mais que isso, fale com a gente.',
    }),

  /** 409. O teto de três comunicados por dia, já atingido. */
  tetoDiarioDeComunicados: (): AppError =>
    new AppError('broadcast-daily-cap-reached', 'Já saíram três comunicados hoje', {
      detail: 'O limite é de três por dia. O próximo pode ser enviado amanhã.',
    }),

  /** 409. Nenhum canal de contato verificado. */
  canalDeContatoNaoVerificado: (): AppError =>
    new AppError('contact-channel-unverified', 'Confirme seu e-mail para avisar a vizinhança', {
      detail: 'Sem um contato confirmado, quem achar seu pet não consegue falar com você.',
      nextAction: 'verify_email',
    }),

  /** 409. O pet não tem foto pronta. */
  petSemFoto: (): AppError =>
    new AppError('pet-photo-missing', 'Seu pet precisa de uma foto', {
      detail: 'É pela foto que alguém reconhece ele na rua. Escolha uma em que o rosto apareça bem.',
      nextAction: 'upload_pet_photo',
    }),

  /** 409. Este pet já tem um caso de perdido aberto. */
  petJaEstaPerdido: (): AppError =>
    new AppError('pet-already-lost', 'Este pet já está marcado como perdido', {
      detail: 'O caso continua aberto. Abra ele para ver o alcance e as mensagens.',
    }),

  /** 409. Este pet já tem transferência viva (BICHUS-66). */
  transferenciaEmAndamento: (): AppError =>
    new AppError('transfer-already-in-progress', 'Este pet já está sendo transferido', {
      detail: 'Cancele a transferência em andamento antes de começar outra.',
    }),

  /** 409. Não dá para transferir um pet com caso de perdido aberto. */
  transferenciaComCasoAberto: (): AppError =>
    new AppError('pet-already-lost', 'Encerre o caso antes de transferir', {
      detail: 'Este pet está marcado como perdido. A plaquinha precisa continuar funcionando até ele voltar.',
    }),

  /** 409. A transferência já se consumou, e cancelar deixou de ser o caminho. */
  transferenciaJaConsumada: (): AppError =>
    new AppError('transfer-already-effective', 'Esta transferência já se concluiu', {
      detail: 'O pet já está na conta da outra pessoa. Para tê-lo de volta, peça que ela transfira para você.',
    }),

  /**
   * 403. O token do convite é válido, mas quem o apresenta não é o destinatário — ou
   * não tem e-mail verificado.
   */
  transferenciaNaoEDestaConta: (): AppError =>
    new AppError('forbidden', 'Este convite não é para esta conta', {
      detail: 'Entre com a conta do e-mail que recebeu o convite, e confirme esse e-mail antes de aceitar.',
    }),

  /** 409. Teto de três casos abertos simultâneos na conta. */
  tetoDeCasosAbertos: (): AppError =>
    new AppError('open-case-limit-reached', 'Você já tem três casos abertos', {
      detail: 'Encerre um caso para abrir outro. Se um pet já voltou, marque o reencontro.',
    }),

  /**
   * 409. Nenhum canal de contato verificado, na proposta de encontro da `Rede`
   * (ADR-0025 emenda 3).
   */
  canalDeContatoNaoVerificadoParaEncontro: (): AppError =>
    new AppError('contact-channel-unverified', 'Confirme seu e-mail para propor um encontro', {
      detail: 'Um encontro sem quem responda por ele não vai ao ar. Confirme seu e-mail e tente de novo.',
      nextAction: 'verify_email',
    }),

  /** 409. Nenhum canal de contato verificado, na sugestão de entrada do `Perto`. */
  canalDeContatoNaoVerificadoParaSugestao: (): AppError =>
    new AppError('contact-channel-unverified', 'Confirme seu e-mail para sugerir um lugar', {
      detail: 'Uma sugestão fala de um estabelecimento que não pediu para aparecer. Confirme seu e-mail e tente de novo.',
      nextAction: 'verify_email',
    }),

  /** 409. Avaliar um local do diretório exige canal de contato verificado. */
  canalDeContatoNaoVerificadoParaAvaliar: (): AppError =>
    new AppError('contact-channel-unverified', 'Confirme seu e-mail para avaliar', {
      detail:
        'A avaliação aparece com o seu nome na página de um negócio real. Confirme seu e-mail e tente de novo.',
      nextAction: 'verify_email',
    }),

  /** 409. A conta já tem três encontros ativos (ADR-0025 emenda 3). */
  tetoDeEncontrosDaComunidade: (): AppError =>
    new AppError('community-event-limit-reached', 'Você já tem três encontros marcados', {
      detail: 'Cancele um, ou espere um deles acontecer, para marcar outro.',
    }),

  /** 400. A atestacao devolvida pelo aparelho nao foi verificada. */
  atestacaoDePasskeyRecusada: (): AppError =>
    new AppError('passkey-attestation-invalid', 'Não foi possível confirmar a credencial', {
      detail:
        'A resposta do aparelho não foi confirmada. Tente de novo ou continue sem credencial digital.',
    }),

  /** 409. Este `credential_id` ja existe. */
  passkeyJaCadastrada: (): AppError =>
    new AppError('passkey-already-registered', 'Este aparelho já está cadastrado', {
      detail: 'A credencial digital deste aparelho já existe nesta conta.',
    }),

  /** 409. Teto de credenciais ATIVAS por conta. */
  tetoDePasskeysDaConta: (teto: number): AppError =>
    new AppError('passkey-limit-reached', 'Limite de credenciais atingido', {
      detail: `Esta conta já tem ${String(teto)} credenciais ativas. Revogue uma para cadastrar outra.`,
    }),

  /** 401. O desafio expirou ou ja foi usado. */
  desafioDePasskeyVencido: (): AppError =>
    new AppError('token-expired', 'O desafio expirou', {
      detail: 'Comece de novo.',
    }),

  tokenDeVerificacaoVencido: (): AppError =>
    new AppError('verification-token-expired', 'Este link não vale mais', {
      detail: 'Ele pode ter expirado ou já ter sido usado. Peça um novo.',
    }),

  /** 415. Tipo de arquivo que não abrimos. */
  tipoDeMidiaNaoAceito: (): AppError =>
    new AppError('unsupported-media-type', 'Esse arquivo a gente não abre', {
      detail: 'Escolha outra foto, tirada pela câmera ou salva na galeria.',
    }),

  /** 409. O cliente confirmou um envio cujos bytes nunca chegaram. */
  envioNaoChegou: (): AppError =>
    new AppError('upload-not-received', 'A foto não chegou', {
      detail: 'O envio não completou. Tente de novo — o cadastro não se perde.',
    }),

  /** 409. A foto anexada à mensagem existe e a HIGIENE dela não terminou. */
  fotoAindaNaoEstaPronta: (): AppError =>
    new AppError('photo-not-ready', 'A foto ainda está sendo preparada', {
      detail: 'Falta pouco. Tente enviar de novo em alguns segundos.',
    }),

  /** 409. A higiene RECUSOU os bytes da foto anexada. */
  fotoRecusadaNaHigiene: (motivo: string): AppError =>
    new AppError('photo-rejected', 'Essa foto não pôde ser enviada', {
      detail: motivo.trim() === '' ? 'Escolha outra foto e tente de novo.' : motivo,
    }),

  /** Teto de cinco tags ativas por pet (ADR-0004). */
  tetoDeTagsAtivas: (): AppError =>
    new AppError('tag-limit-reached', 'Você já tem cinco plaquinhas ativas', {
      detail: 'São cinco por pet. Desative uma que não usa mais para emitir outra.',
    }),

  /** Normalizou para um código bem formado que não existe. */
  tagCodeNaoEncontrado: (): AppError =>
    new AppError('tag-code-not-found', 'Não encontramos este código', {
      detail: 'Não há plaquinha com este código. Confira os caracteres e tente de novo.',
    }),

  /** **Tag revogada responde 410, nunca 404** (ADR-0004). */
  tagRevogada: (): AppError =>
    new AppError('tag-revoked', 'Tag desativada', {
      detail: 'Esta tag foi desativada pelo tutor.',
      nextAction: 'register_stray_found_report',
    }),

  /** 410. A conversa mediada não aceita mais mensagem (BICHUS-43, critério 8). */
  conversaEncerrada: (): AppError =>
    new AppError('conversation-closed', 'Esta conversa está fechada', {
      detail: 'Ela continua aqui para você reler, mas não recebe mensagem nova.',
    }),

  /**
   * 401. O token do achador sem conta está ausente, malformado ou não corresponde a
   * aviso nenhum (`FinderLinkInvalid`, BICHUS-41).
   */
  linkDoAchadorInvalido: (): AppError =>
    new AppError('finder-link-invalid', 'Este link não vale', {
      detail: 'Confira se o endereço foi copiado inteiro.',
      nextAction: 'register_stray_found_report',
      cabecalhos: { 'WWW-Authenticate': 'Bearer' },
    }),

  /** 410. O token do achador existiu e venceu (`FinderAccessEnded`, BICHUS-41). */
  acessoDoAchadorVencido: (): AppError =>
    new AppError('conversation-closed', 'Esta conversa terminou', {
      detail: 'Este link não dá mais acesso à conversa.',
    }),

  /** 410. O aviso já foi encerrado, e não há mais o que acrescentar a ele. */
  avisoEncerrado: (): AppError =>
    new AppError('conversation-closed', 'Esse aviso já foi encerrado', {
      detail: 'O caso terminou, então não dá mais para acrescentar detalhes aqui.',
    }),

  /**
   * 410. O link público do caso (página ou cartaz) não leva mais a um caso aberto
   * (BICHUS-76).
   */
  casoPublicoEncerrado: (): AppError =>
    new AppError('lost-case-closed', 'Este caso não está mais aberto', {
      detail: 'Se você encontrou um animal, registre o achado para a vizinhança ver.',
      nextAction: 'register_stray_found_report',
    }),

  /** 410. O link público leva a um caso que terminou **porque o animal voltou**. */
  casoPublicoReencontrado: (): AppError =>
    new AppError('lost-case-reunited', 'Este pet já foi encontrado', {
      detail: 'Obrigado por se preocupar com ele. Ele já está em casa, e você não precisa mais se preocupar.',
    }),

  /** 410. A janela de reabertura do caso passou (`reopenLostCase`). */
  janelaDeReaberturaVencida: (): AppError =>
    new AppError('lost-case-closed', 'Este caso não dá mais para reabrir', {
      detail:
        'A reabertura vale por 7 dias depois do encerramento, e esse prazo já ' +
        'passou. Se o seu pet sumiu de novo, marque como perdido outra vez.',
    }),

  /** 429 de janela que REABRE. */
  limiteDeChamadas: (retryAfterSeconds: number): AppError => {
    const prazo = prazoEmPalavras(retryAfterSeconds);
    return new AppError('rate-limited', `Tente de novo em ${prazo}`, {
      detail:
        `Recebemos muitos pedidos como este em pouco tempo e pausamos os próximos por ${prazo}. ` +
        'Nada do que você já enviou se perdeu.',
      nextAction: 'retry_later',
      retryAfterSeconds,
    });
  },

  /**
   * 429 de teto que **não reabre** — a janela `lifetime` do contrato, hoje só em
   * `createFoundReportPhotoUploadIntent` (três fotos por aviso, SEC-009).
   */
  limiteSemReabertura: (): AppError =>
    new AppError('rate-limited', 'Você chegou ao total permitido', {
      detail:
        'Este total não reinicia com o tempo, então esperar não libera outro. ' +
        'Se você precisa de mais, fale com a gente.',
    }),

  /**
   * Os dois serviços públicos de CEP falharam, ou não responderam no prazo de 4 s
   * cada (`lookupAdminPostalCode`).
   */
  buscaDeCepIndisponivel: (): AppError =>
    new AppError('postal-code-lookup-unavailable', 'Não conseguimos consultar o CEP agora', {
      detail: 'Tente de novo, ou preencha o endereço à mão.',
    }),

  interno: (cause?: unknown): AppError =>
    new AppError('internal', 'Não foi possível concluir agora', {
      detail: 'Tente de novo em alguns instantes.',
      ...(cause === undefined ? {} : { cause }),
    }),

  /** Sonda de saúde reprovando. */
  sondaIndisponivel: (): AppError =>
    new AppError('internal', 'Serviço indisponível no momento', {
      statusDeIndisponibilidade: 503,
    }),
};
