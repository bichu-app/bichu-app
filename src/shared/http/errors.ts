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
