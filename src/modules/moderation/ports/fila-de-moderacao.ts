/** A porta da FILA DE MODERACAO do painel. */
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type { Instant } from '../../../shared/types/brands.js';
import type {
  DecisaoDaModeracao,
  EstadoDaFila,
  ItemDaFila,
  OrigemDaDenuncia,
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

export interface TransacaoDaModeracao {
  /** O item com trava de linha nas denuncias dele. */
  itemPorAlvo(origem: OrigemDaDenuncia, targetRef: string): Promise<ItemDaFila | null>;

  /** Esconde o conteudo: **exclusao logica, nunca `DELETE`**. */
  removerConteudo(
    origem: OrigemDaDenuncia,
    targetRef: string,
    motivo: string,
    agora: Instant,
  ): Promise<AlvoRemovido | null>;

  /**
   * Marca com a decisao **todas as denuncias abertas daquele alvo**, e devolve
   * quantas foram, com o carimbo que gravou.
   */
  resolverDenuncias(
    origem: OrigemDaDenuncia,
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
  itemPorAlvo(origem: OrigemDaDenuncia, targetRef: string): Promise<ItemDaFila | null>;
}
