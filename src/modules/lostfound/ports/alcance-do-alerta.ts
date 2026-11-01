import type { CentroDoAlcance } from '../domain/previa-do-alcance.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';

/** Uma conta que vai ser avisada, e por onde. */
export interface Destinatario {
  readonly usuario: UserId;
  readonly aparelhos: readonly string[];
}

export interface AlcanceCalculado {
  /** Ordenados por distância crescente e cortados em 500 (critério 9 da BICHUS-18). */
  readonly destinatarios: readonly Destinatario[];
  /** O corte aconteceu. Muda a leitura da métrica, e por isso é gravado. */
  readonly tetoAtingido: boolean;
}

export interface ConsultaDeAlcance {
  readonly centro: CentroDoAlcance;
  readonly raioEmMetros: number;
  /** O tutor do caso, que nunca se alerta a si mesmo (critério 5). */
  readonly excluir: UserId;
  /** O agora da consulta, injetado e não lido do banco. */
  readonly agora: Instant;
}

export interface AlcanceDoAlerta {
  /** Quem o alerta alcança, ou `null` se não foi possível calcular. */
  alcancaveis(consulta: ConsultaDeAlcance): Promise<AlcanceCalculado | null>;
}
