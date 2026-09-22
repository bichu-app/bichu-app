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

  /**
   * O `refresh_token` apresentado no logout não existe, ou não é desta conta
   * (ADR-0002, emenda 1).
   *
   * **Os dois casos respondem exatamente isto**, de propósito. Separá-los
   * transformaria `POST /v1/auth/logout` num oráculo: quem estivesse autenticado
   * numa conta qualquer poderia perguntar, um token por vez, se aquele texto é
   * um refresh vivo de alguém. É o mesmo raciocínio de `credencialRecusada`, que
   * não distingue conta inexistente de senha errada.
   *
   * É **400**, e não 401: a sessão de quem pede continua valendo — o que não
   * serve é o corpo. Responder 401 mandaria o app deslogar por causa de um campo
   * errado, que é o contrário do que a tela precisa fazer. E não é 204: um
   * logout que não revogou nada precisa ser erro visível, senão volta a ser
   * indistinguível de um que revogou.
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
  /**
   * O 400 da digitação. Desde a Emenda 1 do ADR-0004 ele cobre DOIS casos que a
   * pessoa não distingue e não precisa distinguir: tamanho errado e símbolo de
   * verificação que não bate. O segundo é novo e é o que tira o erro de
   * digitação do 404 — antes, um caractere trocado virava "esse código não é de
   * nenhuma tag do Bichu", que acusava a plaquinha quando a culpa era do dedo.
   *
   * O texto não diz "dígito de verificação". Quem está na rua com um animal no
   * colo precisa saber o que fazer, e o que fazer é o mesmo nos dois casos.
   */
  tagCodeMalformado: (): AppError =>
    new AppError('tag-code-malformed', 'Confira o código da plaquinha', {
      detail: 'O código tem 16 caracteres. Confira e digite de novo, com ou sem os hífens.',
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
   * 409. Nenhum canal de contato verificado.
   *
   * O bloqueio existe porque um caso sem canal alcançável produz **movimento e
   * nenhum reencontro**: o alerta sai para os vizinhos, o animal entra na lista
   * pública, quem o acha avisa — e o aviso cai no vazio. É pior que não ter
   * aberto, porque gastou a atenção de dezenas de pessoas.
   *
   * O `next_action` é o que salva a tela: sem ele, a pessoa em pânico leria
   * "verifique seu e-mail" sem um caminho para fazer isso agora.
   */
  canalDeContatoNaoVerificado: (): AppError =>
    new AppError('contact-channel-unverified', 'Confirme seu e-mail para avisar a vizinhança', {
      detail: 'Sem um contato confirmado, quem achar seu pet não consegue falar com você.',
      nextAction: 'verify_email',
    }),

  /**
   * 409. O pet não tem foto pronta.
   *
   * A foto é o que faz alguém reconhecer o animal na rua. Um alerta sem foto
   * pede que o vizinho reconheça "um cachorro caramelo de porte médio", que é
   * metade dos cachorros do Brasil.
   *
   * Vale também para a foto em `processing`: ela existe e ainda não serve — e
   * mandar o alerta antes de a derivada existir publicaria um cartaz sem
   * imagem.
   */
  petSemFoto: (): AppError =>
    new AppError('pet-photo-missing', 'Seu pet precisa de uma foto', {
      detail: 'É pela foto que alguém reconhece ele na rua. Escolha uma em que o rosto apareça bem.',
      nextAction: 'upload_pet_photo',
    }),

  /**
   * 409. Este pet já tem um caso de perdido aberto.
   *
   * O índice único parcial do banco (`lost_cases_um_aberto_por_pet`) é quem
   * impõe; este tipo existe para a tela dizer **"você já marcou"** com o
   * caminho para o caso que existe, em vez de "erro". Quem toca no botão duas
   * vezes é alguém em pânico, e a segunda vez costuma ser porque a primeira
   * pareceu não ter funcionado.
   */
  petJaEstaPerdido: (): AppError =>
    new AppError('pet-already-lost', 'Este pet já está marcado como perdido', {
      detail: 'O caso continua aberto. Abra ele para ver o alcance e as mensagens.',
    }),

  /**
   * 409. Este pet já tem transferência viva (BICHUS-66).
   *
   * O texto oferece a saída, porque ela existe e não é óbvia: o tutor cancela
   * a que está em andamento e começa de novo. Sem isso a tela diria "já existe"
   * e deixaria a pessoa sem o próximo passo.
   */
  transferenciaEmAndamento: (): AppError =>
    new AppError('transfer-already-in-progress', 'Este pet já está sendo transferido', {
      detail: 'Cancele a transferência em andamento antes de começar outra.',
    }),

  /**
   * 409. Não dá para transferir um pet com caso de perdido aberto.
   *
   * O tipo é `pet-already-lost`, que é literalmente "este pet já tem caso
   * aberto" — e é o fato. A transferência espera o reencontro: consumar no meio
   * de um caso revogaria a plaquinha da coleira justamente enquanto ela é a
   * única coisa ligando o animal ao tutor (ADR-0004).
   */
  transferenciaComCasoAberto: (): AppError =>
    new AppError('pet-already-lost', 'Encerre o caso antes de transferir', {
      detail: 'Este pet está marcado como perdido. A plaquinha precisa continuar funcionando até ele voltar.',
    }),

  /**
   * 409. A transferência já se consumou, e cancelar deixou de ser o caminho.
   *
   * Só a rota autenticada usa este tipo. A superfície pública do token responde
   * 410 sem distinguir os três casos, de propósito: ver o 410 de
   * `getTransferByCancelToken` no contrato.
   */
  transferenciaJaConsumada: (): AppError =>
    new AppError('transfer-already-effective', 'Esta transferência já se concluiu', {
      detail: 'O pet já está na conta da outra pessoa. Para tê-lo de volta, peça que ela transfira para você.',
    }),

  /**
   * 403. O token do convite é válido, mas quem o apresenta não é o
   * destinatário — ou não tem e-mail verificado.
   *
   * **403 e não 410**, e o contrato é explícito: o token não está errado, quem
   * apresenta é que não é o destinatário. Um 410 mandaria a pessoa certa, logada
   * na conta errada, pedir um convite novo que não resolveria nada.
   *
   * Os dois casos — outra conta e conta sem e-mail verificado — respondem
   * idêntico. Separá-los daria a quem tem o token uma pista sobre o cadastro do
   * destinatário.
   */
  transferenciaNaoEDestaConta: (): AppError =>
    new AppError('forbidden', 'Este convite não é para esta conta', {
      detail: 'Entre com a conta do e-mail que recebeu o convite, e confirme esse e-mail antes de aceitar.',
    }),

  /**
   * 409. Teto de três casos abertos simultâneos na conta.
   *
   * Separado de `pet-already-lost` porque a **saída é diferente**: lá a pessoa
   * abre o caso que já existe; aqui ela precisa encerrar um. Um app que
   * decidisse por `type` e tratasse os dois igual mandaria a pessoa para o
   * lugar errado.
   *
   * O teto tem razão de privacidade além de produto: a lista pública mostra
   * bairro e data, e uma conta sem limite entregaria a um observador uma série
   * de pontos no tempo e no espaço da mesma pessoa.
   */
  tetoDeCasosAbertos: (): AppError =>
    new AppError('open-case-limit-reached', 'Você já tem três casos abertos', {
      detail: 'Encerre um caso para abrir outro. Se um pet já voltou, marque o reencontro.',
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

  /**
   * 410. A conversa mediada não aceita mais mensagem (BICHUS-43, critério 8).
   *
   * **Uma resposta para os dois motivos**, encerrada e bloqueada, e isso é
   * deliberado: distinguir contaria a quem escreve que a outra pessoa o
   * bloqueou, e bloquear é a ação que alguém executa com medo. O texto do
   * encerramento — "o tutor marcou que o <nome> voltou para casa" — é do corpo
   * da conversa, que continua legível, e não deste problema.
   */
  conversaEncerrada: (): AppError =>
    new AppError('conversation-closed', 'Esta conversa está fechada', {
      detail: 'Ela continua aqui para você reler, mas não recebe mensagem nova.',
    }),

  /**
   * 410. O aviso já foi encerrado, e não há mais o que acrescentar a ele.
   *
   * O tipo é `conversation-closed` porque é o único 410 do vocabulário fechado do
   * contrato que significa "este canal terminou" — os outros dois são tag
   * revogada e token de uso único. O nome fala de conversa porque foi lá que ele
   * nasceu; o que ele diz ao cliente é a mesma coisa nos dois casos, e é o `type`
   * que a tela lê.
   *
   * **Não é 404.** O achado existe, é de quem está perguntando, e escondê-lo
   * faria a pessoa achar que perdeu o próprio relato.
   */
  avisoEncerrado: (): AppError =>
    new AppError('conversation-closed', 'Esse aviso já foi encerrado', {
      detail: 'O caso terminou, então não dá mais para acrescentar detalhes aqui.',
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
