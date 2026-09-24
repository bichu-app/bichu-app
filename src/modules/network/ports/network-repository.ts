/**
 * A porta da secao `Rede`.
 *
 * Tres leituras, e sao exatamente as tres do contrato: a agenda, o encontro e o
 * ponto do encontro. **Nao ha escrita aqui.** A escrita de evento nasce no
 * backoffice, em `/v1/admin/network/*` (ADR-0027), com porta propria. Porta que
 * declara o que ainda nao existe vira metodo vazio em todo dobre de teste.
 *
 * Check-in e galeria sairam desta versao por decisao do cliente (ADR-0027
 * 12.4). O desenho anterior esta na branch `guarda/rede-checkin-galeria`.
 *
 * **As tres leituras compartilham o predicado de visibilidade**
 * (`publication_status IN ('published', 'cancelled')`), e ele mora na clausula
 * `WHERE` de cada consulta, nunca num `if` de quem chama (ADR-0021).
 */
import type { EncontroDaRede, PontoDoEncontro } from '../domain/encontro-da-rede.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * O recorte no tempo da agenda.
 *
 * `upcoming` e o default no contrato e **isso importa**: a lista abre com o que
 * ainda vai acontecer. `all` existe e nao e o default.
 */
export type RecorteNoTempo = 'upcoming' | 'past' | 'all';

/**
 * As ordens que a rota aceita. `proximos` e crescente, `recentes` e decrescente.
 *
 * **Nao ha ordem por distancia.** O encontro pode ter ponto, mas o ponto so sai
 * em resposta autenticada e a agenda e publica: ordenar por distancia nela
 * revelaria, pela ordem, onde o encontro esta. O ADR-0027 nao abriu essa porta,
 * e ela nao aparece desabilitada.
 */
export type OrdemDaAgenda = 'proximos' | 'recentes';

export interface RecorteDaAgenda {
  /** O termo de busca. Procura em titulo e resumo, **no servidor**. */
  readonly q?: string | undefined;
  /** A cidade DIGITADA, nunca uma coordenada (ADR-0006). */
  readonly city?: string | undefined;
  readonly when: RecorteNoTempo;
  readonly sort: OrdemDaAgenda;
  /**
   * O instante que separa passado de futuro, injetado pelo `Clock`, para que o
   * recorte de `when` e o rotulo `status` concordem.
   */
  readonly agora: Instant;
  /** 1-based, como o contrato a declara. */
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDaAgenda {
  readonly itens: readonly EncontroDaRede[];
  /** O total do RECORTE, nao o da tabela. */
  readonly total: number;
}

/** O que a leitura do ponto devolve para um encontro visivel. */
export interface LocalDoEncontro {
  /** Nulo quando o encontro nao tem ponto marcado, e a ausencia e estado normal. */
  readonly ponto: PontoDoEncontro | null;
}

export interface NetworkRepository {
  listarAgenda(recorte: RecorteDaAgenda): Promise<PaginaDaAgenda>;
  /**
   * O encontro. `undefined` quando ele nao existe **ou nao e visivel**
   * (`pending_review`, `removed`), e os casos sao o mesmo caso de proposito:
   * distinguir contaria a um estranho que aquele `slug` existiu.
   */
  buscarEncontro(slug: string): Promise<EncontroDaRede | undefined>;
  /**
   * O ponto do encontro, sob a MESMA regra de visibilidade de `buscarEncontro`
   * (ADR-0027 12.5). `undefined` e o 404, com o mesmo corpo; `{ ponto: null }`
   * e o encontro visivel sem ponto marcado.
   *
   * Quem chama ja precisa estar autenticado, e isso e da borda: a porta nao
   * recebe o chamador porque a resposta nao depende de quem ele e -- qualquer
   * tutor autenticado ve o mesmo ponto.
   */
  buscarLocalDoEncontro(slug: string): Promise<LocalDoEncontro | undefined>;
}
