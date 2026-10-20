/**
 * BICHUS-278 -- o marcador de "ja vi" de cada area com contador.
 *
 * **E a UNICA tabela deste modulo** (`section_list_views`, migracao
 * `20261020000001`). As tres CONTAGENS nao moram aqui: cada uma e porta do
 * modulo que tem a tabela -- `lostfound`, `network` e `professionals` --, porque
 * modulo so conversa com modulo por porta e porque a contagem tem de ficar ao
 * lado da listagem com que ela precisa concordar.
 *
 * O que sobra para este modulo e o que e genuinamente dele: **o instante em que
 * a conta viu cada area**, e a composicao dos tres numeros num objeto so.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { SecaoComContador } from '../../../shared/db/schema.js';

export type { SecaoComContador };

export interface MarcadoresDeSecao {
  /**
   * Os instantes de "ja vi" desta conta, por area. Area ausente do resultado =
   * **nunca viu**, e nesse estado todo conteudo conta como novo.
   *
   * A autorizacao esta no `WHERE` e nao em filtro de memoria (ADR-0021): a
   * unica conta que chega aqui e a do token.
   */
  ler(chamador: UserId): Promise<Partial<Record<SecaoComContador, Instant>>>;

  /** Idempotente: chamar duas vezes deixa o mesmo estado, com o instante novo. */
  marcarVista(chamador: UserId, secao: SecaoComContador, agora: Instant): Promise<void>;
}
