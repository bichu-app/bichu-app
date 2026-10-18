/**
 * A conversa mediada, como regra — sem servidor, sem banco e sem rede.
 *
 * ## O que o título da história decide, e este arquivo cumpre
 *
 * "Sem telefone e sem endereço." A conversa existe justamente para que o tutor
 * não precise publicar o número dele e o achador não precise dizer onde mora.
 * A consequência de desenho é a que está escrita aqui: **a projeção de cada
 * lado é montada campo a campo, e os campos possíveis são dois** — o papel e um
 * nome de exibição. Não existe neste arquivo, e não pode passar a existir, um
 * caminho por onde telefone, e-mail, endereço ou identificador de conta
 * atravesse de um lado para o outro. Se a mediação dependesse de alguém lembrar
 * de não incluir o campo, ela seria uma convenção; aqui ela é a única forma
 * exprimível.
 *
 * ## Por que o nome de exibição é cortado no primeiro termo
 *
 * `users.display_name` guarda o que a pessoa escreveu no cadastro, e a maioria
 * escreve o nome inteiro. O contrato promete, no schema de `participants`:
 * *"Primeiro nome ou apelido. **Nunca** sobrenome completo"*. Sobrenome é
 * identificação por outro caminho — com o bairro do escaneamento na mesma tela,
 * "Leandro Panegassi" e "Leandro" não são a mesma exposição. O corte acontece
 * aqui, no domínio, e não na consulta: a consulta muda quando alguém precisa de
 * outra coluna, e a promessa não pode mudar junto.
 */

/** Os dois lados humanos, mais o Bichu falando. */
export type Papel = 'tutor' | 'finder' | 'system';

/** Os três valores que o contrato declara em `Conversation.status`. */
export type EstadoDaConversa = 'open' | 'blocked' | 'closed';

export interface SinaisDeEstado {
  /** Encerramento próprio da conversa. */
  readonly encerradaEm: Date | null;
  /** Bloqueio, escrito pela BICHUS-40. */
  readonly bloqueadaEm: Date | null;
  /** O caso ligado deixou de estar aberto. Falso quando não há caso. */
  readonly casoEncerrado: boolean;
  /**
   * Um dos dois lados desabilitou a conta (17/10).
   *
   * Vem de `users.deleted_at` das duas pontas da conversa, lido pela consulta.
   * É `true` para QUALQUER dos dois lados, e a simetria é a decisão do cliente
   * lida por extenso: *"bloquear o chat para não enviar ou receber mais nenhuma
   * nova mensagem"*. "Não receber" só é alcançável travando quem ESCREVE, e
   * quem escreve é o outro participante -- um chat em que o lado ativo ainda
   * manda entrega mensagem a alguém que não está mais na plataforma.
   */
  readonly participanteDesabilitado: boolean;
}

/**
 * O estado, derivado. Não existe coluna `status`, e a ausência é deliberada:
 * duas fontes para "esta conversa acabou" divergem no primeiro caminho que
 * esquecer de atualizar uma delas.
 *
 * **`closed` ganha de `blocked` quando os dois valem**, e a ordem não é
 * arbitrária: o encerramento carrega a explicação que a pessoa precisa ler
 * (critério 8, "modo leitura com a explicação do encerramento"), e o bloqueio
 * já obteve o que ele existe para obter — ninguém mais escreve ali — por
 * qualquer um dos dois caminhos.
 */
export function estadoDaConversa(sinais: SinaisDeEstado): EstadoDaConversa {
  // PRIMEIRO DE TODOS, e por isso a conversa fica em modo leitura: conta
  // desabilitada é `closed` e não `blocked`, pelo mesmo critério 8 que a ordem
  // original já aplica -- `closed` é o estado que carrega explicação na tela, e
  // é exatamente isso que o outro lado precisa ler. `blocked` diria "alguém te
  // bloqueou", que é falso e é a informação que a política de
  // `problemas.conversaEncerrada()` existe para NÃO dar.
  //
  // Nada é escrito no banco para isto. `conversations.closed_at` continua nulo,
  // e o estado é DERIVADO de `users.deleted_at` a cada leitura: reativar a conta
  // devolve a conversa ao ar sem desfazer gravação nenhuma. Escrever `closed_at`
  // aqui exigiria um `closure_reason` novo (o CHECK da `20260922000012` só aceita
  // três) e seria uma marca a desfazer depois.
  if (sinais.participanteDesabilitado) return 'closed';
  if (sinais.encerradaEm !== null || sinais.casoEncerrado) return 'closed';
  if (sinais.bloqueadaEm !== null) return 'blocked';
  return 'open';
}

/** Só `open` aceita mensagem nova. Os outros dois são modo leitura. */
export function aceitaMensagem(estado: EstadoDaConversa): boolean {
  return estado === 'open';
}

/**
 * Primeiro termo do nome, ou o rótulo neutro quando não há nome.
 *
 * Corta em espaço e devolve no máximo 40 caracteres. Quem preencheu só o
 * apelido continua sendo chamado pelo apelido; quem preencheu o nome inteiro é
 * apresentado pelo primeiro nome, que é o que o contrato promete.
 */
export function primeiroNomeOuApelido(nome: string | null, padrao: string): string {
  const limpo = (nome ?? '').trim();
  if (limpo === '') return padrao;
  const primeiro = limpo.split(/\s+/u)[0] ?? '';
  if (primeiro === '') return padrao;
  return primeiro.slice(0, 40);
}

/** Como o contrato declara cada item de `participants`: dois campos, e só. */
export interface ParticipanteVisivel {
  readonly role: Exclude<Papel, 'system'>;
  readonly displayName: string;
}

export interface NomesDaConversa {
  /** `users.display_name` do tutor, como ele cadastrou. */
  readonly nomeDoTutor: string | null;
  /** `found_reports.finder_display_name`, opcional por desenho do produto. */
  readonly nomeDoAchador: string | null;
  /** `users.deleted_at` do tutor não é nulo (17/10). */
  readonly tutorDesabilitado: boolean;
  /** `users.deleted_at` do achador COM CONTA não é nulo (17/10). */
  readonly achadorDesabilitado: boolean;
}

/**
 * Os participantes, montados campo a campo.
 *
 * O objeto devolvido **não tem id**, e isso é a regra e não um esquecimento. O
 * item 7 do ADR-0010 proíbe qualquer coisa que permita agrupar os pets de um
 * mesmo tutor, e um identificador estável do tutor aqui faria exatamente isso:
 * duas plaquinhas escaneadas por duas pessoas diferentes passariam a ser
 * reconhecíveis como do mesmo dono. O primeiro nome não fecha essa porta
 * sozinho, e é por isso que ele é o teto e não o piso do que sai.
 */
export function participantesVisiveis(nomes: NomesDaConversa): readonly ParticipanteVisivel[] {
  // A DESPERSONALIZAÇÃO É AQUI, e ela não inventa nada: o lado desabilitado
  // entra como se nunca tivesse preenchido nome, e `primeiroNomeOuApelido` já
  // devolve o rótulo neutro que o produto usa desde sempre -- `Tutor` e
  // `Quem achou`. O cliente pediu o nome "que não identifique" junto do avatar
  // cinza, e este é o rótulo que o próprio sistema já escolheu para "sem nome".
  //
  // O NOME NÃO SAI DO BANCO ESCONDIDO POR UM `if` DE TELA: ele é substituído no
  // domínio, que é o único ponto por onde as DUAS vistas passam -- a do chamador
  // com conta (`conversation-service.ts`) e a do achador por token
  // (`conversa-do-achador.ts`). Despersonalizar em cada montagem de resposta
  // seria perder um dos dois caminhos, e o caminho do achador é justamente o que
  // não pede login.
  //
  // Sobre o AVATAR: não existe campo de foto de participante em consulta, DTO,
  // resposta nem contrato -- `Conversation.participants` tem dois campos, e a
  // descrição do contrato proíbe foto de perfil por extenso. Não há o que pintar
  // de cinza no servidor, e nada foi inventado aqui. Está no relatório.
  const tutor = nomes.tutorDesabilitado ? null : nomes.nomeDoTutor;
  const achador = nomes.achadorDesabilitado ? null : nomes.nomeDoAchador;
  return [
    { role: 'tutor', displayName: primeiroNomeOuApelido(tutor, 'Tutor') },
    { role: 'finder', displayName: primeiroNomeOuApelido(achador, 'Quem achou') },
  ];
}
