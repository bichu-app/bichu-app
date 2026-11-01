import type { UserId } from '../../../shared/types/brands.js';

/** O tipo do trabalho na fila, o mesmo de `JobKind` (`shared/ports/job-queue.ts`). */
export const TRABALHO_DE_AVISO_AO_TUTOR = 'tag.scan_notify' as const;

/** O que a entrega precisa saber, lido no instante do envio. */
export interface AvisoAoTutorParaEntrega {
  readonly donoUserId: UserId;
  readonly nomeDoPet: string;
  /** O pet esta marcado como perdido? */
  readonly casoAberto: boolean;
  /** O `share_token` do caso aberto, quando ha um. */
  readonly tokenPublicoDoCaso: string | null;
}

export interface LeituraDoAvisoAoTutor {
  /**
   * `null` quando o aviso nao existe mais, nao veio de plaquinha, ou o pet foi
   * excluido: nada a avisar, e isso e desfecho e nao falha.
   */
  avisoDoAchado(foundReportId: string): Promise<AvisoAoTutorParaEntrega | null>;
}

export interface ResultadoDoAvisoAoTutor {
  readonly aceitos: number;
  readonly falhos: number;
  readonly semAparelho: boolean;
}

export interface EntregaDoAvisoAoTutor {
  /** Nao estoura: um aparelho que falha nao pode derrubar o aviso dos outros. */
  avisar(aviso: AvisoAoTutorParaEntrega): Promise<ResultadoDoAvisoAoTutor>;
}

/** O endereco de e-mail do tutor, para a rede de seguranca. */
export interface EnderecoDeEmailDoTutor {
  emailVerificadoDe(conta: UserId): Promise<string | undefined>;
}
