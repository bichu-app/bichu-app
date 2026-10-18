/**
 * A porta da CAIXA DE NOTIFICACOES.
 *
 * **Toda operacao recebe o dono como primeiro parametro, e nao ha nenhuma que
 * nao o receba.** Isso nao e estilo: a autorizacao desta superficie e a propria
 * clausula `WHERE`, e uma assinatura que permitisse "listar sem dono" abriria
 * um caminho para a caixa de outra conta existir no tipo antes de existir no
 * codigo.
 *
 * O adaptador que a implementa NAO monta as consultas: ele chama as funcoes SQL
 * da migracao `20261018000020`. O motivo esta escrito la -- duas das fontes do
 * aviso sao alcancadas por coluna marcada com "NUNCA sai do servidor", e
 * `portao-colunas-que-nao-saem.ts` reprova o nome literal delas em qualquer
 * `.ts` de `src/`, inclusive em comentario.
 */
import type { UserId } from '../../../shared/types/brands.js';
import type { PaginaDaCaixa } from '../domain/caixa.js';

export interface CaixaDeNotificacoes {
  /** Uma pagina da caixa, ja agrupada. Conta desabilitada devolve pagina vazia. */
  listar(usuario: UserId, pagina: number, limite: number): Promise<PaginaDaCaixa>;

  /** O numero do sino. Conta desabilitada devolve zero. */
  contar(usuario: UserId): Promise<number>;

  /**
   * Marca UM aviso como lido. Devolve `false` tanto para "nao existe" quanto
   * para "existe e e de outra conta", porque a segunda nunca chega a ser lida:
   * o dono esta no `WHERE`. A rota responde 404 nos dois casos, e NUNCA 403
   * (ADR-0021) -- um 403 confirmaria que o `ref` existe.
   */
  marcarLida(usuario: UserId, ref: string): Promise<boolean>;

  /** "Marcar todas como lidas". Devolve quantas foram. */
  marcarTodasLidas(usuario: UserId): Promise<number>;

  /**
   * A lista foi aberta: zera o NUMERO sem marcar item nenhum.
   *
   * Operacao propria e nao efeito de `listar` porque `listar` serve um `GET`, e
   * `GET` que escreve e `GET` que nao pode ser repetido nem cacheado. A
   * separacao e o que torna "abrir a lista nao marca os itens" verificavel.
   */
  listaVista(usuario: UserId): Promise<void>;
}
