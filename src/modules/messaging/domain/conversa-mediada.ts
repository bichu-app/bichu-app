/** Os dois lados humanos, mais o Bichu falando. */
export type Papel = 'tutor' | 'finder' | 'system';

/** Os três valores que o contrato declara em `Conversation.status`. */
export type EstadoDaConversa = 'open' | 'blocked' | 'closed';

export interface SinaisDeEstado {
  /** Encerramento próprio da conversa. */
  readonly encerradaEm: Date | null;
  /** Bloqueio, escrito pela BICHUS-40. */
  readonly bloqueadaEm: Date | null;
  /** O caso ligado deixou de estar aberto. */
  readonly casoEncerrado: boolean;
  /** Um dos dois lados desabilitou a conta (17/10). */
  readonly participanteDesabilitado: boolean;
}

/**
 * O estado, derivado. Não existe coluna `status`, e a ausência é deliberada: duas
 * fontes para "esta conversa acabou" divergem no primeiro caminho que esquecer de
 * atualizar uma delas.
 */
export function estadoDaConversa(sinais: SinaisDeEstado): EstadoDaConversa {
  if (sinais.participanteDesabilitado) return 'closed';
  if (sinais.encerradaEm !== null || sinais.casoEncerrado) return 'closed';
  if (sinais.bloqueadaEm !== null) return 'blocked';
  return 'open';
}

/** Só `open` aceita mensagem nova. */
export function aceitaMensagem(estado: EstadoDaConversa): boolean {
  return estado === 'open';
}

/** Primeiro termo do nome, ou o rótulo neutro quando não há nome. */
export function primeiroNomeOuApelido(nome: string | null, padrao: string): string {
  const limpo = (nome ?? '').trim();
  if (limpo === '') return padrao;
  const primeiro = limpo.split(/\s+/u)[0] ?? '';
  if (primeiro === '') return padrao;
  return primeiro.slice(0, 40);
}

/** Como o contrato declara cada item de `participants`. */
export interface ParticipanteVisivel {
  readonly role: Exclude<Papel, 'system'>;
  readonly displayName: string;
  /**
   * O apelido deste participante, **só quando ele é o OUTRO lado E é conexão aceita
   * de quem chama**.
   */
  readonly handle: string | null;
  /** A CHAVE da derivada `thumb` da foto deste participante, pela mesma regra. */
  readonly photoKey: string | null;
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
  /**
   * **De que lado está quem chama.** Sai da consulta (`papel_do_chamador`), e não de
   * um `if`.
   */
  readonly papelDoChamador: Exclude<Papel, 'system'>;
  /**
   * O apelido do OUTRO lado, **já recortado pela cláusula `WHERE` da consulta**
   * (conexão aceita, par não bloqueado, as duas contas habilitadas).
   */
  readonly apelidoDoOutro: string | null;
  /** A chave da derivada `thumb` da foto do OUTRO lado, pela mesma regra. */
  readonly chaveDaFotoDoOutro: string | null;
}

/** Os participantes, montados campo a campo. */
export function participantesVisiveis(nomes: NomesDaConversa): readonly ParticipanteVisivel[] {
  const tutor = nomes.tutorDesabilitado ? null : nomes.nomeDoTutor;
  const achador = nomes.achadorDesabilitado ? null : nomes.nomeDoAchador;
  const doOutro = (papel: Exclude<Papel, 'system'>) =>
    papel === nomes.papelDoChamador
      ? { handle: null, photoKey: null }
      : { handle: nomes.apelidoDoOutro, photoKey: nomes.chaveDaFotoDoOutro };
  return [
    {
      role: 'tutor',
      displayName: primeiroNomeOuApelido(tutor, 'Tutor'),
      ...doOutro('tutor'),
    },
    {
      role: 'finder',
      displayName: primeiroNomeOuApelido(achador, 'Quem achou'),
      ...doOutro('finder'),
    },
  ];
}

/** O teto da prévia da última mensagem, em caracteres. */
export const TETO_DA_PREVIA = 140;

/** A prévia da última mensagem, para a linha da lista. */
export function previaDaMensagem(corpo: string): string | null {
  const limpo = corpo.replace(/\s+/gu, ' ').trim();
  if (limpo === '') return null;
  if (limpo.length <= TETO_DA_PREVIA) return limpo;
  return `${limpo.slice(0, TETO_DA_PREVIA - 1).trimEnd()}…`;
}

/** O que a barra de topo pinta no sino. */
export function selarContador(naoLidas: number): string | null {
  if (naoLidas <= 0) return null;
  return naoLidas > 9 ? '9+' : String(naoLidas);
}
