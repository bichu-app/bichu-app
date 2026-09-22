/**
 * A memória do disparo: quem foi avisado, quando, e quantos.
 *
 * ## Por que esta porta existe, em uma frase
 *
 * Dois dos sete critérios do ADR-0006 são perguntas sobre o **passado** — o
 * teto de fadiga (*"não recebeu mais de 3 alertas nas últimas 24 h"*) e o
 * disparo por caso por dia (*"o caso não mandou alerta nas últimas 24 h"*) — e
 * passado que ninguém grava não se deduz. Sem esta porta, uma consulta de
 * alcance ignoraria os dois e devolveria um número errado com cara de certo.
 *
 * ## `contextoDoCaso` não devolve `CasoGravado`, e a diferença é coordenada
 *
 * `CasoGravado` é a forma que a resposta HTTP usa, e ela **não carrega
 * coordenada** de propósito ("a resposta nunca traz coordenada", cabeçalho de
 * `lost-case-service.ts`). O disparo precisa do ponto para centrar o raio, e
 * pedir isso a `CasoGravado` significaria acrescentar latitude e longitude a um
 * objeto que é serializado para o aparelho do tutor — um campo que passaria a
 * existir para vazar depois. São duas leituras do mesmo caso com finalidades
 * diferentes, e elas têm formas diferentes.
 *
 * ## O que esta porta deliberadamente não faz
 *
 * Não decide quem recebe: isso é `AlcanceDoAlerta`, e ela é a única. Não envia:
 * isso é `PushSender`, em `notifications`. E não guarda coordenada, distância,
 * token nem texto do aviso — o raciocínio inteiro está no cabeçalho da migração
 * `20260922000004_disparo-do-alerta.sql`, e o resumo é que a distância ordena a
 * consulta e é descartada, porque gravada ela seria uma trilateração pronta.
 */
import type { EstadoDoDisparo } from '../domain/disparo-do-alerta.js';
import type { CentroDoAlcance } from '../domain/previa-do-alcance.js';
import type { CaseId, Instant, UserId } from '../../../shared/types/brands.js';

export interface DisparoGravado {
  readonly id: string;
  readonly caso: CaseId;
  readonly estado: EstadoDoDisparo;
  /** O número real de destinatários. `null` em tudo que não é `computed`. */
  readonly destinatarios: number | null;
  readonly raioEmMetros: number;
  readonly tetoAtingido: boolean;
  readonly pedidoEm: Date;
  /** `null` enquanto `queued`. O critério 7 conta a partir daqui. */
  readonly enviadoEm: Date | null;
}

/**
 * O que o disparo precisa saber do caso — e nada além disso.
 *
 * `fotoKey` é chave de objeto e não URL: quem monta a URL pública é quem
 * conhece o hostname de mídia, e uma URL gravada ou carregada longe dali
 * carrega o domínio do dia em que foi escrita (é a mesma razão de o link de
 * compartilhar ser montado na leitura).
 */
export interface ContextoDoCaso {
  readonly caso: CaseId;
  /** O tutor, que nunca se alerta a si mesmo (critério 5 do ADR-0006). */
  readonly tutor: UserId;
  /** Ausente quando o caso nasceu só com área: sem centro não há raio. */
  readonly centro: CentroDoAlcance | undefined;
  /**
   * O bairro, que é o **teto** de precisão geográfica do aviso.
   *
   * Critério 3 da BICHUS-18: o push traz o bairro e nunca o ponto exato nem
   * coordenada. A porteira de `conteudo-do-push.ts` confere isso de novo antes
   * de serializar, e as duas guardas são de propósito.
   */
  readonly bairro: string | null;
  readonly nomeDoPet: string;
  readonly especie: string | null;
  /** O `share_token`: a única chave do caso que sai daqui (ADR-0010, item 6). */
  readonly tokenPublico: string;
  readonly fotoKey: string | null;
  /** Caso já encerrado não alerta ninguém: o animal voltou, ou a busca acabou. */
  readonly aberto: boolean;
}

export interface NovoDisparo {
  readonly id: string;
  readonly caso: CaseId;
  readonly raioEmMetros: number;
  /** `queued` ou `no_location`. Ver `estadoInicialDoDisparo`. */
  readonly estado: EstadoDoDisparo;
  readonly pedidoEm: Instant;
}

export interface ConclusaoDoDisparo {
  readonly id: string;
  /** `computed` ou `unavailable`. */
  readonly estado: EstadoDoDisparo;
  readonly tetoAtingido: boolean;
  /**
   * As contas avisadas. Vazio é um desfecho legítimo: `computed` com zero
   * destinatários é "não há ninguém num raio de 5 km", e é o que a BICHUS-20
   * existe para dizer em vez de esconder.
   */
  readonly avisados: readonly UserId[];
  readonly enviadoEm: Instant;
}

export interface RegistroDeDisparos {
  /**
   * Cria a linha do disparo no estado de partida.
   *
   * Síncrono com a abertura do caso, e não dentro do worker, porque a resposta
   * de `POST /pets/{petId}/lost-cases` declara `alert` e ela precisa dizer a
   * verdade já: `queued` quando há raio, `no_location` quando não há.
   */
  abrir(entrada: NovoDisparo): Promise<DisparoGravado>;

  /**
   * O último disparo do caso, para a resposta e para o critério 7.
   *
   * **Um método e não dois.** "Qual o estado do alerta deste caso?" e "este
   * caso já disparou nas últimas 24 h?" são a mesma leitura, e separá-las
   * abriria a chance de uma passar a olhar `requested_at` enquanto a outra olha
   * `dispatched_at` — que são instantes diferentes e dariam respostas
   * diferentes à mesma pergunta.
   */
  ultimoDoCaso(caso: CaseId): Promise<DisparoGravado | null>;

  /**
   * O último disparo que de fato **saiu** deste caso, para o critério 7.
   *
   * Separado de `ultimoDoCaso` porque um disparo enfileirado e nunca enviado
   * não gastou o direito de ninguém: se a leitura fosse a do último disparo
   * qualquer, um `queued` de ontem bloquearia o alerta de hoje sem nunca ter
   * avisado uma única pessoa.
   */
  ultimoEnvioDoCaso(caso: CaseId): Promise<Instant | null>;

  /** O que o disparo precisa do caso. `null` quando o caso não existe. */
  contextoDoCaso(caso: CaseId): Promise<ContextoDoCaso | null>;

  /**
   * Fecha o disparo e grava quem foi avisado, **numa transação**.
   *
   * As duas escritas juntas porque metade delas é pior que nenhuma: o total sem
   * a lista faria o teto de fadiga dar de graça três alertas a quem já recebeu,
   * e a lista sem o total deixaria a métrica sem numerador. É o caso literal da
   * regra de transação explícita onde há mais de uma escrita relacionada.
   */
  concluir(entrada: ConclusaoDoDisparo): Promise<void>;
}
