/**
 * Erro de aplicação, com o tipo do contrato junto.
 *
 * A regra do contrato (RFC 9457) é que **o cliente decide por `type`**. Para que
 * isso seja verdade, o `type` precisa nascer no lugar onde a regra falhou, e não
 * ser deduzido do status HTTP na borda: dois problemas diferentes respondem 409,
 * e um mapeamento por status faria a tela tratar os dois igual.
 *
 * **O status não é mais argumento de quem constrói o erro.** Ele vem de
 * `STATUS_DO_PROBLEMA`, gerado de `x-problem-types` de `api/openapi.yaml`, onde
 * cada tipo tem um único status possível. Enquanto os dois eram escolhidos
 * separadamente, dava para escrever `forbidden` com 401 — e estava escrito, em
 * dois caminhos, empilhando "sua senha não confere", "seu token venceu" e "este
 * recurso não é seu" num tipo só. Um app que trata os três pelo mesmo caminho
 * ou desloga quem não precisava, ou deixa de deslogar quem precisava.
 */
import type { NextAction, ProblemFieldError, ProblemType } from './problem.js';
import { STATUS_DO_PROBLEMA } from './problem.js';

interface AppErrorOptions {
  readonly detail?: string;
  readonly nextAction?: NextAction;
  readonly errors?: readonly ProblemFieldError[];
  readonly retryAfterSeconds?: number;
  /** Contexto interno para o log. **Nunca** vai para a resposta. */
  readonly cause?: unknown;
  /**
   * Divergência conhecida, e a única: `GET /v1/health` declara resposta **503**
   * no contrato, e `x-problem-types` não tem nenhum tipo com status 503 — o mais
   * próximo, `internal`, é 500. Enquanto o contrato não ganhar o tipo, a sonda
   * continua respondendo 503, porque trocá-la por 500 mudaria como o balanceador
   * e o orquestrador tiram o serviço de rotação.
   *
   * O tipo é o literal `503`, e não `number`, de propósito: esta porta serve
   * para uma coisa só e não dá para reabrir por ela o erro que este arquivo
   * acabou de fechar. Único uso: `problemas.sondaIndisponivel()`, abaixo.
   */
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
  }
}

/**
 * Os construtores abaixo existem para que o título de cada tipo fique num lugar
 * só. Texto de erro repetido em quatro chamadas diverge, e a divergência
 * aparece como duas telas diferentes para o mesmo problema.
 *
 * O texto segue a regra do UX: diz o que houve e o que fazer, e não usa as
 * palavras "erro", "inválido", "falhou" nem "ops" (BICHUS-31, critério 3).
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

  senhaFraca: (errors: readonly ProblemFieldError[]): AppError =>
    new AppError('weak-password', 'Escolha uma senha mais longa', {
      detail: 'A senha precisa de pelo menos 10 caracteres. Uma frase que só você lembra funciona bem.',
      errors,
    }),

  /**
   * E-mail ou senha não conferem. Corpo idêntico para e-mail inexistente e
   * senha errada: a resposta não revela se a conta existe, e o caminho de
   * verificação roda nos dois casos para que o tempo também não revele
   * (docs/04-seguranca.md 7.1).
   *
   * O tipo é `invalid-credentials`, e a tela mantém a pessoa onde ela está para
   * corrigir os campos. Enquanto isto era `forbidden`, o app não tinha como
   * distinguir deste caso um token vencido nem um recurso alheio.
   */
  credencialRecusada: (): AppError =>
    new AppError('invalid-credentials', 'E-mail ou senha não conferem', {
      detail: 'Confira os dois campos e tente de novo. Se esqueceu a senha, dá para criar uma nova.',
    }),

  sessaoExpirada: (): AppError =>
    new AppError('token-expired', 'Entre de novo', {
      detail: 'Sua sessão terminou.',
      nextAction: 'sign_in',
    }),

  /** Sem token, token ausente ou assinatura que não confere. Manda entrar. */
  naoAutenticado: (): AppError =>
    new AppError('unauthenticated', 'Entre para continuar', { nextAction: 'sign_in' }),

  /**
   * Autenticado e sem permissão sobre **este** recurso. Só 403.
   *
   * Recurso de **outro tutor** não passa por aqui: ele responde 404, porque
   * confirmar a existência de um pet alheio já é vazamento.
   */
  semPermissao: (detail?: string): AppError =>
    new AppError('forbidden', 'Esta ação não é sua', detail === undefined ? {} : { detail }),

  /** A sessão continua valendo; falta a janela de reautenticação. */
  reautenticacaoNecessaria: (): AppError =>
    new AppError('reauthentication-required', 'Confirme sua senha', {
      detail: 'Esta ação não pode ser desfeita, então pedimos a senha de novo.',
    }),

  naoEncontrado: (): AppError => new AppError('not-found', 'Não encontramos isso'),

  /**
   * O texto **não normaliza para um código**: tamanho diferente de 26 depois da
   * normalização, ou caractere fora do alfabeto de Crockford. É erro de
   * digitação, e a tela pede para conferir e digitar de novo.
   *
   * Separado de `tagCodeNaoEncontrado` de propósito. Para quem está na rua com
   * um animal no colo, a diferença entre "confira o que você digitou" e "não
   * encontramos este código" é útil, e não vaza nada: os dois casos contam
   * igualmente para o limite de tentativas inválidas.
   */
  tagCodeMalformado: (): AppError =>
    new AppError('tag-code-malformed', 'Confira o código da plaquinha', {
      detail: 'O código tem 26 caracteres. Confira e digite de novo, com ou sem os hífens.',
    }),

  /**
   * Teto de pets por conta. É o sentido verdadeiro de `pet-limit-reached`, que
   * até 18/09 era emprestado pelo teto de tags — ver `tetoDeTagsAtivas` logo
   * abaixo, que agora tem tipo próprio.
   *
   * O texto não oferece "apague um pet para caber outro": excluir um cadastro
   * para criar outro é um conselho ruim, e quem tem vinte animais de verdade
   * (protetor independente, lar temporário) precisa de atendimento, não de uma
   * escolha entre dois animais.
   */
  tetoDePetsDaConta: (): AppError =>
    new AppError('pet-limit-reached', 'Você chegou ao limite de pets desta conta', {
      detail: 'São 20 por conta. Se você cuida de mais que isso, fale com a gente.',
    }),

  /**
   * 410. Token de uso único expirado, já usado ou que nunca existiu.
   *
   * **Os três casos são a mesma resposta, e isso é a regra.** Distinguir
   * "expirou" de "não existe" contaria a um estranho que aquele token existiu —
   * e quem está tentando adivinhar token é justamente quem se beneficia de
   * saber quando chegou perto.
   *
   * Tipo próprio desde 18/09: as duas operações declaram **410** no contrato e
   * o único slug parecido (`token-expired`) é **401**, de token de acesso. Um
   * app que decidisse por `type` trataria "o link do e-mail venceu" como "sua
   * sessão caiu" e mandaria a pessoa fazer login — que é exatamente o que ela
   * não consegue, porque está tentando recuperar a senha.
   */
  tokenDeVerificacaoVencido: (): AppError =>
    new AppError('verification-token-expired', 'Este link não vale mais', {
      detail: 'Ele pode ter expirado ou já ter sido usado. Peça um novo.',
    }),

  /**
   * 415. Tipo de arquivo que não abrimos.
   *
   * Existe como tipo próprio desde 18/09: quatro operações já respondiam 415 e
   * a lista fechada não tinha nenhum slug com esse significado, então o corpo do
   * problema saía com um `type` fora da lista — exatamente o que ela existe para
   * impedir.
   *
   * O texto não lista os formatos aceitos de propósito: quem chegou aqui
   * escolheu um arquivo no próprio aparelho, e "converta para JPEG" não é uma
   * instrução que se cumpra com o animal no colo. A tela oferece escolher outra.
   */
  tipoDeMidiaNaoAceito: (): AppError =>
    new AppError('unsupported-media-type', 'Esse arquivo a gente não abre', {
      detail: 'Escolha outra foto, tirada pela câmera ou salva na galeria.',
    }),

  /**
   * 409. O cliente confirmou um envio cujos bytes nunca chegaram.
   *
   * O caso real é a rede caindo no meio do envio de 10 MB, que é a rede de quem
   * está na rua procurando o próprio animal. Sem este estado, a confirmação
   * criaria uma foto `processing` que nunca sai de lá: um cartão de pet
   * carregando para sempre, que ninguém sabe explicar nem consertar.
   */
  envioNaoChegou: (): AppError =>
    new AppError('upload-not-received', 'A foto não chegou', {
      detail: 'O envio não completou. Tente de novo — o cadastro não se perde.',
    }),

  /**
   * Teto de cinco tags ativas por pet (ADR-0004). O tutor revoga uma e emite
   * outra; não há caminho de aumento por autoatendimento.
   *
   * O tipo próprio foi criado no contrato em 18/09, que é onde a correção
   * pertencia: até ali este teto respondia `pet-limit-reached`, e um app que
   * decidisse por `type` tratava "cinco plaquinhas neste pet" como "limite de
   * pets da conta" — dois tetos diferentes, com saídas diferentes, e a saída
   * oferecida era a errada. A divergência estava documentada aqui e virou
   * urgente quando `createPet` passou a usar `pet-limit-reached` no sentido
   * verdadeiro: os dois responderiam o mesmo tipo.
   */
  tetoDeTagsAtivas: (): AppError =>
    new AppError('tag-limit-reached', 'Você já tem cinco plaquinhas ativas', {
      detail: 'São cinco por pet. Desative uma que não usa mais para emitir outra.',
    }),

  /** Normalizou para um código bem formado que não existe. Diferente de revogado. */
  tagCodeNaoEncontrado: (): AppError =>
    new AppError('tag-code-not-found', 'Não encontramos este código', {
      detail: 'Não há plaquinha com este código. Confira os caracteres e tente de novo.',
    }),

  /**
   * **Tag revogada responde 410, nunca 404** (ADR-0004). São duas telas porque
   * são dois problemas, e quem está com um animal no colo não pode chegar a um
   * beco sem saída: o `next_action` é o caminho alternativo, e ele é o motivo
   * pelo qual este tipo existe separado de `not-found`.
   *
   * O texto é o mesmo para todos os motivos de revogação, inclusive óbito e
   * exclusão. Ninguém precisa descobrir a morte de um animal por uma página web,
   * e distinguir os motivos entregaria estado de conta alheia a um estranho.
   */
  tagRevogada: (): AppError =>
    new AppError('tag-revoked', 'Tag desativada', {
      detail: 'Esta tag foi desativada pelo tutor.',
      nextAction: 'register_stray_found_report',
    }),

  limiteDeChamadas: (retryAfterSeconds: number): AppError =>
    new AppError('rate-limited', 'Tente de novo em instantes', {
      detail: 'Recebemos muitos pedidos deste aparelho em pouco tempo.',
      retryAfterSeconds,
    }),

  interno: (cause?: unknown): AppError =>
    new AppError('internal', 'Não foi possível concluir agora', {
      detail: 'Tente de novo em alguns instantes.',
      ...(cause === undefined ? {} : { cause }),
    }),

  /**
   * Sonda de saúde reprovando. **Único ponto do sistema que responde um status
   * fora da tabela do contrato**, pela divergência descrita em
   * `AppErrorOptions.statusDeIndisponibilidade`.
   */
  sondaIndisponivel: (): AppError =>
    new AppError('internal', 'Serviço indisponível no momento', {
      statusDeIndisponibilidade: 503,
    }),
};
