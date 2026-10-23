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
 * posicao. (A frase que vinha aqui -- *"nao existe tabela de conexao entre
 * pessoas neste banco"* -- caducou na `20261018000030`: `user_connections`
 * existe, e e dela que `connection_requested` nasce. O que continua valendo e
 * a decisao: **post de amigo** nao entra no sino. Pedido de conexao e outra
 * coisa -- ele e dirigido a UMA pessoa e e acionavel, e e um por par.)
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
  /**
   * Alguem pediu conexao, e quem RECEBEU o pedido e avisado (cliente,
   * 22/10/2026: *"quando o usuario me adicionou, nao apareceu na notificacao
   * que eu tinha uma solicitacao de amizade"*).
   *
   * Entrou pela `20261020000018`, copiando a forma inteira de
   * `event_join_requested` -- gatilho na fonte, autor so para agrupar, destino
   * resolvido por `notificacao_destino`. **Nao ha o par do aceite**
   * (`event_join_decided` e o molde dele, e ele existe): o aviso de "sua
   * solicitacao foi aceita" depende de decisao do cliente que ainda nao voltou.
   */
  'connection_requested',
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

/**
 * Para onde o toque numa linha da caixa leva. Uniao FECHADA, e cada valor tem
 * tela que EXISTE -- destino sem tela seria toque morto.
 *
 * **`match_suggested` nao esta aqui, e a ausencia e medida**: nao existe tela
 * de confirmar candidato neste app, e o `destinoDe` do aplicativo ja manda o
 * push desse tipo para `mostrarNoApp` pelo mesmo motivo. A linha dele sai com
 * destino nulo e NAO oferece toque.
 *
 * Espelha `NotificationDestination` do contrato e os valores de
 * `notificacao_destino(text, uuid)` na migracao `20261020000011`. As tres
 * copias sao de proposito -- o banco e quem RESOLVE o destino, o contrato e
 * quem o declara, e aqui e onde o tipo impede um valor inventado de compilar.
 */
export const DESTINOS_DO_AVISO = [
  'pet',
  'found_report',
  'public_case',
  'network_event',
  'directory_suggestion',
  'collar_tag_request',
  'broadcast',
  /**
   * A tela *"Pedidos de conexao"* (`/conexoes/pedidos`), que existe desde
   * 18/10. A chave e `user_connections.ref` -- opaca, 22 caracteres
   * base64url --, e a tela e a LISTA e nao o item, como `directory_suggestion`
   * ja e: `rotas.dart` leva a lista e o `ref` viaja porque o contrato promete
   * que `destination` e `destination_ref` andam juntos.
   */
  'connection_request',
] as const;

export type DestinoDoAviso = (typeof DESTINOS_DO_AVISO)[number];

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
  /**
   * Para onde o toque leva, ou **nulo quando esta linha nao tem destino**.
   *
   * Nulo e estado NORMAL: `match_suggested` nao tem tela, e um destino pode
   * ter deixado de existir (pet excluido, encontro apagado). Nos dois casos a
   * linha fica sem toque, porque toque para tela inexistente e pior que toque
   * ausente.
   */
  readonly destino: DestinoDoAviso | null;
  /**
   * A chave do destino. Nula exatamente quando [destino] e nula.
   *
   * A forma depende do destino e **nao e sempre opaca**: `public_case` traz o
   * token do caso, `network_event` e `directory_suggestion` traem `slug` e
   * `ref`, e `pet`, `found_report` e `collar_tag_request` traem UUID interno.
   * O UUID e legitimo nesta superficie -- ela e autenticada e recortada pelo
   * dono, e o item 6 do ADR-0010 vale para a rota PUBLICA. O push nao usa esta
   * chave: ele segue com token publico.
   */
  readonly destinoRef: string | null;
}

/**
 * Um COMUNICADO como o dono da caixa o le -- a pagina intermediaria do unico
 * tipo de aviso sem destino natural.
 *
 * **Sem quem disparou e sem quantos receberam**: o primeiro e conta de painel e
 * nao dado de produto, e o segundo poria o tamanho da base na tela de uma
 * pessoa.
 */
export interface ComunicadoDaCaixa {
  readonly ref: string;
  readonly titulo: string;
  readonly corpo: string;
  readonly disparadoEm: Date;
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
