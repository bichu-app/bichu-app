/**
 * **A única camada deste módulo que outro módulo enxerga** (ADR-0001,
 * docs/03-arquitetura.md §6), e ela é curta de propósito.
 *
 * `user_connections` é a tabela que diz **quem conhece quem**. Manter a
 * fronteira é o que garante que nenhum outro módulo a leia a não ser por aqui —
 * é a mesma razão de privacidade que fez `network` existir como módulo
 * (`network_event_checkins`).
 *
 * ## O que esta porta NÃO oferece, e não pode ganhar
 *
 * - **Nenhuma operação que devolva a LISTA de conexões de alguém.** Nem de
 *   terceiro, nem do próprio dono. Está no desenho (plano 4-B: *"Lista de
 *   conexões | nunca | nunca"*), e está aqui no código: não existe método que
 *   devolva um conjunto de pessoas. O que existe é **contagem** e o **predicado
 *   de par**.
 * - **Nenhuma busca de pessoas, nenhuma sugestão, nenhuma enumeração.**
 * - **Nenhum `UserId` em saída.** Os dois métodos recebem contas e devolvem
 *   `boolean` ou `number`.
 *
 * ## Quem consome
 *
 * - **Fatia G** (o perfil visto por quem ainda não é conexão) pergunta
 *   `estaConectado` para escolher entre a coluna do meio e a coluna de
 *   conectado da tabela 4-B.
 * - **Fatia J** (timeline) pergunta a mesma coisa para decidir se uma publicação
 *   alcança quem está lendo.
 * - **Fatia E** (bloquear e denunciar) chama `desfazerPorBloqueio` — ver
 *   `ConexaoSobBloqueio`.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';

export interface LeitorDeConexao {
  /**
   * **Estes dois estão conectados AGORA?**
   *
   * Simétrico: a ordem dos argumentos não muda a resposta, porque o par é
   * canônico no banco. Falso para pendente, para recusado, para expirado, para
   * conta desabilitada de qualquer um dos dois lados e para par bloqueado.
   *
   * É o predicado que todo dado de conectado atravessa: **sem aceite, falso**.
   */
  estaConectado(um: UserId, outro: UserId): Promise<boolean>;

  /**
   * Quantas conexões aceitas esta conta tem, contando os dois lados e só contas
   * habilitadas.
   *
   * Existe para o **sinal de confiança** (plano 4-B, linha "Sinais de confiança
   * (contagens)") e para a tela do próprio dono mostrar o teto. **Contagem não é
   * lista**: ela não diz quem, e é por isso que ela pode existir onde a lista
   * não pode.
   */
  contarConexoes(pessoa: UserId): Promise<number>;
}

/**
 * **O contrato com a fatia E.** O bloqueio é dela; o efeito sobre a conexão é
 * desta, e esta é a única escrita que o produz.
 *
 * O desenho (plano 4.1, *Bloquear com pedido pendente*): bloquear **apaga pedido
 * pendente nas duas direções e desfaz a conexão, em silêncio**. Bloqueio que
 * deixasse pedido vivo seria canal aberto por descuido.
 *
 * **Como E chama, e isto é o acordo:** dentro da mesma transação do `INSERT` em
 * `user_blocks`, E chama `desfazerPorBloqueio` com as duas contas. Se a chamada
 * falhar, o bloqueio falha junto — meio bloqueio é pior que nenhum, porque a
 * pessoa acreditaria estar protegida.
 *
 * **Três garantias desta ponta, para E não precisar saber nada daqui:**
 *
 * 1. **Idempotente.** Chamar de novo sobre um par já limpo devolve `0` e não
 *    falha. Desbloquear e bloquear outra vez funciona.
 * 2. **Silencioso.** Nenhum aviso a nenhum dos dois lados, nem ao bloqueado nem
 *    ao bloqueador: avisar o bloqueado é retaliação, e avisar o bloqueador é
 *    contar que havia um pedido que ele talvez não tenha visto.
 * 3. **Simétrico.** A ordem dos argumentos não importa; apaga as duas direções.
 *
 * **O que NÃO é desta ponta:** `user_blocks`, a ocultação de conteúdo ao
 * denunciante, a fila do administrador e o desbloqueio. Desbloquear **não**
 * devolve a conexão (plano 4.1), e por isso não há método de "refazer".
 */
export interface ConexaoSobBloqueio {
  /**
   * Apaga o pendente nas duas direções e desfaz a conexão do par. Devolve
   * quantas linhas saíram — `0`, `1`, e nunca mais que `1`, porque o par tem uma
   * linha só (`user_connections_um_par_uma_linha`).
   */
  desfazerPorBloqueio(um: UserId, outro: UserId, agora: Instant): Promise<number>;
}
