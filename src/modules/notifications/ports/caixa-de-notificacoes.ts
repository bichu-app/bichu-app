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
   * DISPENSA a LINHA -- o "x" (cliente, 20/10/2026): ela sai da LISTA e do
   * CONTADOR, e **continua nao lida**.
   *
   * **Dispensa o GRUPO inteiro, e nao so o item do `ref`.** A caixa agrupa por
   * (tipo, autor, dia) e o `ref` de uma linha agrupada e o do item mais novo;
   * dispensar so ele deixaria os outros de pe e a linha voltaria na proxima
   * listagem com outro `ref`. A unidade da dispensa e a linha que a pessoa ve,
   * que e a mesma unidade que `agrupados` descreve. Quem aplica a regra e
   * `notificacao_dispensar(uuid, text)`, com a mesma chave de grupo da
   * listagem.
   *
   * Operacao propria e nao um parametro de [marcarLida], porque os dois eixos
   * sao independentes nos DOIS sentidos: dispensar nao marca como lida (e
   * dispensar sem ter lido e o caso comum -- quem limpa a lista nao abre cada
   * linha), e marcar como lida nao dispensa. Um unico metodo com bandeira
   * forcaria uma ordem entre os dois eventos que o produto nao tem.
   *
   * Devolve `false` para "nao existe" e para "existe e e de outra conta", pelo
   * mesmo motivo de [marcarLida]: o dono esta no `WHERE`, a segunda nunca
   * chega a ser lida, e a rota responde 404 nos dois casos e NUNCA 403
   * (ADR-0021).
   */
  dispensar(usuario: UserId, ref: string): Promise<boolean>;

  /**
   * A lista foi aberta: zera o NUMERO sem marcar item nenhum.
   *
   * Operacao propria e nao efeito de `listar` porque `listar` serve um `GET`, e
   * `GET` que escreve e `GET` que nao pode ser repetido nem cacheado. A
   * separacao e o que torna "abrir a lista nao marca os itens" verificavel.
   */
  listaVista(usuario: UserId): Promise<void>;
}
