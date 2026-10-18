/**
 * A CAIXA DE NOTIFICACOES, como o dominio a enxerga.
 *
 * Este arquivo nao conhece banco, HTTP nem framework (regra de camada de
 * `src/architecture.rules.mjs`): ele diz o que um aviso E, e as duas regras que
 * nao sao de apresentacao -- quais tipos nunca agrupam e quais atravessam o
 * zero do contador.
 *
 * **As duas listas existem em DOIS lugares de proposito**: aqui e na migracao
 * `20261018000020`, nas funcoes `notificacao_nunca_agrupa(text)` e
 * `notificacao_persiste_no_contador(text)`. A duplicacao e deliberada e tem
 * isca: o banco e quem APLICA as regras (o agrupamento e a contagem sao SQL), e
 * o dominio precisa das mesmas listas para o teste de desligamento poder
 * afirmar que elas nao divergiram. `caixa.test.ts` compara as duas.
 */

/**
 * Os tipos de aviso que a caixa mostra. Uniao fechada pelo mesmo motivo de
 * `ProblemType`: tipo inventado no meio do codigo nao compila.
 *
 * **Os dois que NAO estao aqui, e as ausencias sao medidas e nao esquecimento:**
 *
 * - **evento movido**: nao existe coluna que registre a mudanca de lugar ou de
 *   hora. `starts_at` e o endereco mudam em cima da linha, e a unica memoria do
 *   movimento e a trilha de auditoria (`admin.network_event.relocated`), que e
 *   registro forense de ator administrativo e nao fonte de produto.
 * - **caso devolvido**: a linha existe (`closure_outcome: reunited`), mas nao
 *   tem destinatario de SINO -- quem fecha o caso e o proprio tutor, e para os
 *   vizinhos a noticia e de terceiro e informativa, quer dizer, Petline.
 *
 * E **`friend_post` nao existe e nao vai existir aqui**: post de amigo e da
 * Petline, por decisao de desenho -- 150 conexoes a uma publicacao por semana
 * dariam cerca de 21 avisos por dia, e o aviso da plaquinha chegaria na 22a
 * posicao. (Medido de passagem: nao existe tabela de conexao entre pessoas
 * neste banco, entao a Petline tambem nao tem de onde sair ainda.)
 */
export const TIPOS_DE_AVISO = [
  'tag_scanned',
  'found_reported',
  'match_suggested',
  'neighborhood_alert',
  'event_join_requested',
  'event_join_decided',
  'event_cancelled',
  'suggestion_decided',
  'tag_request_updated',
  'broadcast',
] as const;

export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

/**
 * Os tipos que NUNCA se juntam a outro no agrupamento por (tipo, autor, dia).
 *
 * Cada um deles e um ANIMAL e uma ACAO distintos: "2 avisos de plaquinha"
 * esconde qual pet foi escaneado, e e justamente o pet que a pessoa precisa
 * saber.
 */
export const TIPOS_QUE_NUNCA_AGRUPAM: readonly TipoDeAviso[] = ['tag_scanned', 'found_reported'];

/**
 * Os tipos que continuam contando depois de a lista ter sido vista.
 *
 * Abrir a lista zera o numero de todo o resto; estes dois so saem do contador
 * quando o ITEM e aberto. A razao e o custo de passar batido -- os dois dizem
 * que ha um pet na rua agora, e esse e o unico custo irreversivel da caixa.
 *
 * Lista SEPARADA de `TIPOS_QUE_NUNCA_AGRUPAM`, com os mesmos valores hoje: sao
 * duas regras com duas razoes, e juntar as duas faria a proxima mudanca de uma
 * delas mexer calada na outra.
 */
export const TIPOS_QUE_PERSISTEM_NO_CONTADOR: readonly TipoDeAviso[] = [
  'tag_scanned',
  'found_reported',
];

/** Uma linha da caixa, ja agrupada. */
export interface AvisoDaCaixa {
  /** Identificador opaco. **Nao e UUID** (ADR-0010). */
  readonly ref: string;
  readonly tipo: TipoDeAviso;
  /** Nome do pet, titulo do encontro, nome indicado. Nulo quando nao ha assunto. */
  readonly assunto: string | null;
  /** Quando o FATO aconteceu, e nao quando a linha nasceu. */
  readonly aconteceuEm: Date;
  /** O item foi ABERTO. Ver a lista nao marca nada. */
  readonly lido: boolean;
  /** Quantos avisos esta linha resume. Sempre 1 para os que nunca agrupam. */
  readonly agrupados: number;
}

export interface PaginaDaCaixa {
  readonly itens: readonly AvisoDaCaixa[];
  readonly pagina: number;
  readonly limite: number;
  /** Total de LINHAS ja agrupadas, e nao de avisos. */
  readonly total: number;
  /** Avisos nao abertos. O mesmo numero do sino. */
  readonly naoLidos: number;
}

/** A pagina da caixa e de 30 por decisao de desenho, e o contrato a limita a isso. */
export const LIMITE_PADRAO_DA_CAIXA = 30;
