import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type { Instant } from '../../../shared/types/brands.js';
import type {
  DecisaoDaModeracao,
  EstadoDaFila,
  ItemDaFila,
  OrigemDaDenuncia,
  OrigemDecidivel,
} from '../domain/fila-de-moderacao.js';

export interface RecorteDaFila {
  /** Sem filtro, a fila aberta. */
  readonly estado?: EstadoDaFila | undefined;
  /** Sem filtro, todas as origens. */
  readonly origem?: OrigemDaDenuncia | undefined;
  readonly page: number;
  readonly limit: number;
}

/** A pagina da fila, com a contagem do aviso do menu. */
export interface PaginaDaFila {
  readonly itens: readonly ItemDaFila[];
  readonly total: number;
  readonly pendentes: number;
}

/** O retrato do alvo ANTES da remocao, para o `before` da trilha. */
export interface AlvoRemovido {
  /** O `id` INTERNO do alvo, que e o `resourceId` da trilha (ADR-0027 item 8). */
  readonly id: string;
  /** A nota, quando o alvo e avaliacao. */
  readonly notaAntes: number | null;
}

/**
 * A transacao da DECISAO. Toda assinatura aqui pede `OrigemDecidivel`, e nao
 * `OrigemDaDenuncia`: as tres origens que o contrato declara e `src/` nao
 * decide (`profile`, `photo`, `publication`) nao chegam a este ponto, e e o
 * compilador que garante -- nao um comentario.
 */
export interface TransacaoDaModeracao {
  /**
   * O item com trava de linha nas denuncias dele. `null` quando o alvo nao
   * existe -- inclusive quando ele NAO PODE existir, como `targetRef` sem
   * forma de UUID na origem `conversation`.
   */
  itemPorAlvo(origem: OrigemDecidivel, targetRef: string): Promise<ItemDaFila | null>;

  /** Esconde o conteudo: **exclusao logica, nunca `DELETE`**. */
  removerConteudo(
    origem: OrigemDecidivel,
    targetRef: string,
    motivo: string,
    agora: Instant,
  ): Promise<AlvoRemovido | null>;

  /**
   * Marca com a decisao **todas as denuncias abertas daquele alvo**, e devolve
   * quantas foram, com o carimbo que gravou.
   */
  resolverDenuncias(
    origem: OrigemDecidivel,
    targetRef: string,
    decisao: DecisaoDaModeracao,
    motivo: string,
    agora: Instant,
  ): Promise<{ readonly quantidade: number; readonly decididaEm: Date }>;

  /** O ULTIMO passo de toda escrita, na MESMA transacao (ADR-0027 item 8). */
  registrarNaTrilha(evento: AuditEvent): Promise<void>;
}

export interface FilaDeModeracaoRepository {
  emTransacao<T>(trabalho: (tx: TransacaoDaModeracao) => Promise<T>): Promise<T>;
  listar(recorte: RecorteDaFila): Promise<PaginaDaFila>;
  /** A LEITURA, que responde pelas CINCO origens da visao. */
  itemPorAlvo(origem: OrigemDaDenuncia, targetRef: string): Promise<ItemDaFila | null>;
}
