import type { EstadoDoDisparo } from '../domain/disparo-do-alerta.js';
import type { CentroDoAlcance } from '../domain/previa-do-alcance.js';
import type { CaseId, Instant, UserId } from '../../../shared/types/brands.js';

export interface DisparoGravado {
  readonly id: string;
  readonly caso: CaseId;
  readonly estado: EstadoDoDisparo;
  /** O número real de destinatários. */
  readonly destinatarios: number | null;
  readonly raioEmMetros: number;
  readonly tetoAtingido: boolean;
  readonly pedidoEm: Date;
  /** `null` enquanto `queued`. */
  readonly enviadoEm: Date | null;
}

/** O que o disparo precisa saber do caso — e nada além disso. */
export interface ContextoDoCaso {
  readonly caso: CaseId;
  /** O tutor, que nunca se alerta a si mesmo (critério 5 do ADR-0006). */
  readonly tutor: UserId;
  /** Ausente quando o caso nasceu só com área: sem centro não há raio. */
  readonly centro: CentroDoAlcance | undefined;
  /** O bairro, que é o **teto** de precisão geográfica do aviso. */
  readonly bairro: string | null;
  readonly nomeDoPet: string;
  readonly especie: string | null;
  /** O `share_token`: a única chave do caso que sai daqui (ADR-0010, item 6). */
  readonly tokenPublico: string;
  readonly fotoKey: string | null;
  /** Caso já encerrado não alerta ninguém: o animal voltou, ou a busca acabou. */
  readonly aberto: boolean;
}

export interface NovoDisparo {
  readonly id: string;
  readonly caso: CaseId;
  readonly raioEmMetros: number;
  /** `queued` ou `no_location`. */
  readonly estado: EstadoDoDisparo;
  readonly pedidoEm: Instant;
}

export interface ConclusaoDoDisparo {
  readonly id: string;
  /** `computed` ou `unavailable`. */
  readonly estado: EstadoDoDisparo;
  readonly tetoAtingido: boolean;
  /**
   * As contas avisadas. Vazio é um desfecho legítimo: `computed` com zero
   * destinatários é "não há ninguém num raio de 5 km", e é o que a BICHUS-20 existe
   * para dizer em vez de esconder.
   */
  readonly avisados: readonly UserId[];
  readonly enviadoEm: Instant;
}

export interface RegistroDeDisparos {
  /** Cria a linha do disparo no estado de partida. */
  abrir(entrada: NovoDisparo): Promise<DisparoGravado>;

  /** O último disparo do caso, para a resposta e para o critério 7. */
  ultimoDoCaso(caso: CaseId): Promise<DisparoGravado | null>;

  /** O último disparo que de fato **saiu** deste caso, para o critério 7. */
  ultimoEnvioDoCaso(caso: CaseId): Promise<Instant | null>;

  /** O que o disparo precisa do caso. */
  contextoDoCaso(caso: CaseId): Promise<ContextoDoCaso | null>;

  /** Fecha o disparo e grava quem foi avisado, **numa transação**. */
  concluir(entrada: ConclusaoDoDisparo): Promise<void>;
}
