/** O token de registro do aparelho, como o SDK do app o entregou. */
export type TokenDeAparelho = string;

/** Prioridade de entrega. Alta acorda o aparelho; normal espera a próxima janela. */
export type PrioridadeDePush = 'alta' | 'normal';

/** A mensagem, já reduzida ao que pode aparecer numa tela bloqueada. */
export interface MensagemDePush {
  readonly token: TokenDeAparelho;

  /** Título e corpo: o que a pessoa lê sem desbloquear o aparelho. */
  readonly titulo: string;
  readonly corpo: string;

  /** O que o app recebe junto, para saber onde abrir. */
  readonly dados: Readonly<Record<string, string>>;

  /** Agrupa no aparelho: uma chave, uma notificação visível. */
  readonly chaveDeAgrupamento: string;

  /**
   * Quanto tempo o transporte pode segurar a mensagem para um aparelho desligado, em
   * segundos.
   */
  readonly validadeEmSegundos: number;

  readonly prioridade: PrioridadeDePush;

  /** A foto do pet, quando houver. */
  readonly imagemUrl?: string | undefined;
}

/** Os dois desfechos de um envio aceito pelo transporte. */
export type ResultadoDoEnvio =
  /** O transporte aceitou. É tudo o que se pode afirmar daqui. */
  | 'aceito'
  /** O token não existe mais: app desinstalado, dados limpos, token rotacionado. */
  | 'aparelho-sumiu';

/** A falha que todo adaptador precisa produzir, em vez do erro do transporte. */
export class PushNaoEnviadoError extends Error {
  /** `true` = falha do caminho (rede, cota, transporte fora do ar). */
  readonly retentavel: boolean;

  /** Rótulo curto e estável, para contar sem depender do texto. */
  readonly motivo: string;

  constructor(motivo: string, retentavel: boolean, explicacao: string) {
    super(`Push não enviado (${motivo}). ${explicacao}`);
    this.name = 'PushNaoEnviadoError';
    this.motivo = motivo;
    this.retentavel = retentavel;
  }
}

export interface PushSender {
  /** Manda uma mensagem para um aparelho. */
  enviar(mensagem: MensagemDePush): Promise<ResultadoDoEnvio>;

  /** De onde as mensagens saem, para o log de subida. */
  readonly transporte: string;
}
