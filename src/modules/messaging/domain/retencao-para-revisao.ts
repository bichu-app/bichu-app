/**
 * Os três tetos da rota de envio, e o que cada um faz.
 *
 * ## Por que dois deles não podem morar na borda
 *
 * `shared/http/aplicacao-de-teto.ts` aplica o que a porta `RateLimitStore` sabe
 * fazer: contar requisições e, quando `on_exceed` é `deny_429`, recusar. É o
 * teto certo para a primeira entrada desta rota, e é ele que responde 429 na 31ª
 * mensagem da hora.
 *
 * Os outros dois têm `on_exceed: hold_for_review`, que **não é recusa**. Reter
 * uma conversa para revisão humana é escrita de domínio, não decisão de borda:
 * a borda não conhece conversa, não conhece caso e não tem onde gravar a
 * marcação. Se `hold_for_review` virasse 429, a política declarada no contrato
 * mudaria de significado — e mudaria para pior, porque avisaria o golpista.
 *
 * E o terceiro, `counts: distinct_cases`, a borda **declara que não aplica**:
 * `inventariarNaoAplicaveis` o devolve com o motivo e a subida imprime a lista.
 * Isso está certo e é insuficiente. O critério 17 é explícito sobre o que se
 * conta, e contar a coisa errada aqui inverte a contramedida: uma conta que
 * manda trinta mensagens num caso só **não** dispara, e uma que manda uma
 * mensagem em três casos diferentes **dispara**. Quem sabe distinguir "caso" de
 * "mensagem" é este arquivo.
 *
 * ## Por que reter não notifica ninguém
 *
 * Os critérios 10 e 11 dizem "sem notificar ninguém", e o 11 diz por quê:
 * muitos tutores abordados pela mesma conta é o padrão nomeado do falso achador
 * em série, e avisar os tutores ali é ajudar o golpe a chegar — o golpista
 * descobre que foi marcado antes de a moderação olhar, e recomeça de outra
 * conta. A conversa retida continua respondendo `open` para os dois lados.
 */

/** Por que a conversa foi retida. Espelha o CHECK da migração. */
export type MotivoDeRetencao = 'message_volume' | 'serial_finder';

/** Limites do contrato, num lugar só. Mudá-los aqui sem mudar lá é divergência. */
export const TETO_DE_MENSAGENS_EM_24H = 200;
export const TETO_DE_CASOS_DISTINTOS_EM_24H = 3;

export interface ContagensDe24h {
  /**
   * Mensagens que ESTE participante mandou NESTA conversa nas últimas 24 h,
   * **incluindo a que está entrando**.
   */
  readonly mensagensDoParticipante: number;
  /**
   * Casos DISTINTOS em que esta conta escreveu nas últimas 24 h, **incluindo o
   * desta mensagem**. `undefined` quando quem escreve não tem conta: o token do
   * achador tem escopo de uma conversa só, então não há série a contar deste
   * lado — e é isso que o critério 7 da BICHUS-41 registra.
   *
   * O que se conta é CASO, e não mensagem: trinta mensagens num caso só valem
   * `1`, e três mensagens em três casos valem `3`. Contar a coisa errada aqui
   * inverte a contramedida (critério 17).
   */
  readonly casosDistintosDaConta: number | undefined;
}

/**
 * Decide se esta mensagem retém a conversa.
 *
 * **As duas comparações são deliberadamente diferentes, e a diferença vem do
 * texto dos critérios.**
 *
 * `message_volume` segue a aritmética do contador da borda: `hit()` aprova
 * enquanto a contagem for menor ou igual ao limite, então com `limit: 200` a
 * 200ª passa e a 201ª estoura. Os dois lugares precisam concordar sobre o mesmo
 * número, senão o mesmo `200` significa duas coisas no mesmo sistema.
 *
 * `serial_finder` **não** segue: o critério 17 desambigua com todas as letras —
 * *"uma que manda uma mensagem em três casos diferentes dispara"*. Três é o
 * gatilho, não o último valor tolerado. Onde o critério de aceite é explícito,
 * ele ganha da convenção do limitador, e esta é a linha que registra por quê.
 *
 * `serial_finder` ganha de `message_volume` quando os dois valem. Os dois levam
 * à mesma fila, mas o motivo é o que a pessoa da moderação lê primeiro, e
 * "abordou tutores de casos diferentes" é a acusação mais grave das duas.
 */
export function retencaoDestaMensagem(contagens: ContagensDe24h): MotivoDeRetencao | null {
  const casos = contagens.casosDistintosDaConta;
  if (casos !== undefined && casos >= TETO_DE_CASOS_DISTINTOS_EM_24H) return 'serial_finder';
  if (contagens.mensagensDoParticipante > TETO_DE_MENSAGENS_EM_24H) return 'message_volume';
  return null;
}
