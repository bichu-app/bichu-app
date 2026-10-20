/**
 * BICHUS-278 -- quantos casos de perdido entraram na lista publica DEPOIS de um
 * instante.
 *
 * ## POR QUE ESTA PORTA EXISTE, e por que ela e deste modulo e nao do outro
 *
 * O contador da aba `Pets` e do modulo `sections`, que nao tem tabela de
 * perdido nenhuma. A primeira versao resolvia isso importando
 * `construtorDaListagemPublicaDePerdidos` direto de
 * `lostfound/adapters/persistence/`, e **a fronteira de modulo reprovou, com
 * razao**: modulo so conversa com modulo por porta, e um `sections` que
 * alcanca o `adapters` de tres outros modulos e um `sections` que passa a
 * quebrar quando qualquer um dos tres mexe na persistencia.
 *
 * Com a porta aqui, a contagem mora **ao lado da listagem com que ela tem de
 * concordar** -- que e melhor do que o desenho anterior e nao so mais legal: a
 * implementacao reusa `construtorDaListagemPublicaDePerdidos` sem atravessar
 * fronteira nenhuma, e quem mexer nos predicados de publicacao ve a contagem no
 * mesmo arquivo.
 */
import type { Instant } from '../../../shared/types/brands.js';

export interface RecorteDePerdidosNovos {
  /**
   * O instante do marcador de "ja vi", ou **indefinido quando a conta nunca viu
   * a area**.
   *
   * Indefinido e "conta tudo", e e a AUSENCIA do predicado de tempo -- nao um
   * `> epoch`, que pareceria o mesmo e carregaria uma comparacao por linha.
   * Mesma mecanica de `cidade` e `janela` em `RecorteDePerdidos`.
   */
  readonly desde?: Instant | undefined;
  /** A cidade DIGITADA, nunca coordenada (ADR-0006). Ausente = sem recorte. */
  readonly cidade?: string | undefined;
  readonly agora: Instant;
}

export interface ContagemDePerdidosNovos {
  contar(recorte: RecorteDePerdidosNovos): Promise<number>;
}
