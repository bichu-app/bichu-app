/** Fila de trabalho do domínio. */
import type { Instant } from '../types/brands.js';

export type JobKind =
  | 'alert.dispatch'
  | 'alert.resend'
  | 'case.reminder'
  | 'case.transfer_consummate'
  | 'media.process_upload'
  /**
   * ADR-0027 item 10: a imagem de catalogo enviada pelo painel (item da Loja,
   * encontro da Rede).
   */
  | 'media.process_catalog_image'
  /**
   * A higiene da foto do ACHADO: conferir os bytes e reescrever a imagem sem
   * metadado nenhum, porque o EXIF de foto de celular carrega coordenada de GPS e
   * aquele caminho nao passava por worker nenhum.
   */
  | 'media.sanitize_found_photo'
  | 'media.purge_expired'
  | 'email.send'
  | 'push.send'
  /**
   * O aviso ao TUTOR de que alguem escaneou a plaquinha do pet dele
   * (`tags/ports/aviso-ao-tutor.ts`).
   */
  | 'tag.scan_notify'
  | 'match.recompute'
  /**
   * ADR-0027 item 17: o push de pedido aprovado para encontro privado, so com o
   * titulo.
   */
  | 'network.join_request_approved';

export interface JobRecord<P = unknown> {
  readonly id: string;
  readonly kind: JobKind;
  readonly payload: P;
  readonly runAt: Instant;
  readonly attempts: number;
  readonly maxAttempts: number;
}

/** O que a varredura de órfãos encontrou e o que ela fez com cada linha. */
export interface TrabalhoRecuperado {
  readonly id: string;
  readonly kind: JobKind;
  readonly payload: unknown;
  /** Quantas vezes o processo morreu segurando este trabalho, contando esta. */
  readonly orfandades: number;
  /** `true` quando virou `failed` e não volta mais. */
  readonly desistiu: boolean;
}

export interface CriteriosDeOrfandade {
  /** Quanto tempo de `running` sem sinal de vida é órfão. */
  readonly prazoEmMs: number;
  /** Quantas orfandades o mesmo trabalho pode acumular antes de ser final. */
  readonly tetoDeOrfandade: number;
  /** Teto de linhas por varredura, para uma passada não virar uma transação longa. */
  readonly limite: number;
}

export interface JobQueue {
  /** `payload` só com identificador. */
  enqueue<P>(kind: JobKind, payload: P, runAt?: Instant): Promise<string>;
  /** Reserva até `limit` itens prontos, com trava de linha. */
  claim(limit: number): Promise<readonly JobRecord[]>;
  complete(id: string): Promise<void>;
  fail(id: string, error: string, retryAt?: Instant): Promise<void>;
  /**
   * Devolve à fila o que ficou `running` além do prazo, e declara final o que já foi
   * recuperado vezes demais.
   */
  recuperarOrfaos(criterios: CriteriosDeOrfandade): Promise<readonly TrabalhoRecuperado[]>;
}
