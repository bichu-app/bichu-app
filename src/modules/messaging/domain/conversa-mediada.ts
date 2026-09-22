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
  return [
    { role: 'tutor', displayName: primeiroNomeOuApelido(nomes.nomeDoTutor, 'Tutor') },
    { role: 'finder', displayName: primeiroNomeOuApelido(nomes.nomeDoAchador, 'Quem achou') },
  ];
}
