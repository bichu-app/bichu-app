/**
 * A porta da FILA DE MODERACAO do painel.
 *
 * ## A autorizacao mora no `WHERE`, e por isso ela nao esta aqui
 *
 * **Nenhum metodo recebe "ver denuncia de conta desabilitada".** O predicado
 * (`denuncia_de_avaliacao_com_denunciante_ativo` e
 * `denuncia_de_conversa_com_denunciante_ativo`, migracao `20261018000009`)
 * esta na clausula `WHERE` de cada uma das TRES consultas do adaptador, e nao
 * e parametro: um parametro poderia chegar errado uma vez, e um `if` depois da
 * leitura responderia `403` onde o ADR-0021 manda `404`. Para esta porta,
 * denuncia de conta desabilitada simplesmente nao existe.
 *
 * ## NAO HA `apagar` NEM `desabilitarConta`, E AS DUAS AUSENCIAS SAO A REGRA
 *
 * Nada e apagado de verdade: as duas escritas desta porta sao `UPDATE`.
 * `removerConteudo` esconde (`status = 'removed'` na avaliacao,
 * `moderation_removed_at` na conversa) e `resolverDenuncias` marca a decisao --
 * **a linha da denuncia FICA**, com a decisao e o motivo, e o `down` da
 * `20261018000009` recusa a propria descida justamente para que ela continue.
 *
 * E nao ha nenhum metodo que toque `users`: desabilitar conta e outro poder, e
 * ele nao entra nesta fila.
 */
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

/**
 * A pagina da fila, com a contagem do aviso do menu.
 *
 * `pendentes` IGNORA o recorte de proposito: o numero do item da navegacao
 * responde "quanto trabalho esta esperando", e nao "quantas linhas esta pagina
 * trouxe". Ele e a TERCEIRA consulta do adaptador a filtrar conta desabilitada
 * -- a listagem e a leitura sao as outras duas --, porque filtrar em um lugar
 * so faz o painel dizer "1 pendente" sobre fila vazia, defeito que a fila da
 * Rede ja produziu.
 */
export interface PaginaDaFila {
  readonly itens: readonly ItemDaFila[];
  readonly total: number;
  readonly pendentes: number;
}

/** O retrato do alvo ANTES da remocao, para o `before` da trilha. */
export interface AlvoRemovido {
  /** O `id` INTERNO do alvo, que e o `resourceId` da trilha (ADR-0027 item 8). */
  readonly id: string;
  /** A nota, quando o alvo e avaliacao. Explica o efeito na media do local. */
  readonly notaAntes: number | null;
}

export interface TransacaoDaModeracao {
  /**
   * O item com trava de linha nas denuncias dele.
   *
   * `null` quando o alvo nao existe, quando nao ha denuncia nenhuma dele, e
   * quando a conta de quem denunciou esta desabilitada -- os tres respondem o
   * mesmo `404` (ADR-0021).
   */
  itemPorAlvo(origem: OrigemDaDenuncia, targetRef: string): Promise<ItemDaFila | null>;

  /**
   * Esconde o conteudo: **exclusao logica, nunca `DELETE`**.
   *
   * `null` quando o alvo nao existe OU quando ele ja estava fora do ar -- e o
   * motivo da primeira remocao e de quem auditar, entao sobrescreve-lo
   * apagaria a decisao que valeu. Mesma escolha de `removerAvaliacao`.
   */
  removerConteudo(
    origem: OrigemDaDenuncia,
    targetRef: string,
    motivo: string,
    agora: Instant,
  ): Promise<AlvoRemovido | null>;

  /**
   * Marca com a decisao **todas as denuncias abertas daquele alvo**, e devolve
   * quantas foram, com o carimbo que gravou.
   *
   * Todas, e nao uma: o item da fila e o ALVO, e nao existe decidir "esta
   * denuncia sim, aquela nao" sobre o mesmo conteudo. `quantidade: 0` quer
   * dizer que alguem chegou primeiro, e a rota responde `404`.
   *
   * `decididaEm` volta daqui, e nao e montado pelo caso de uso: `new Date` e
   * proibido em `application/` (`arquitetura/injectableClock`, e com razao --
   * o caso de uso recebe `Instant` pela porta `Clock`). O adaptador e quem
   * converte, e e tambem quem de fato grava o valor.
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
