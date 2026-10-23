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
 * - **Nenhuma operação que devolva a LISTA de conexões de alguém**, nem do
 *   próprio dono. Isto continua verdadeiro **depois** da emenda do cliente de
 *   22/10/2026, e a razão é de fronteira: a lista das próprias conexões existe
 *   (`listMyConnections`), mas ela é **do módulo**, servida por
 *   `ConnectionsRepository.conexoes` à rota dele. **Nenhum outro módulo a
 *   alcança**, porque esta porta — a única que os outros enxergam — não a
 *   oferece. Quem precisasse dela de fora teria de **acrescentar método neste
 *   arquivo**, que é o lugar onde alguém vê.
 * - **Nenhuma busca de pessoas, nenhuma sugestão, nenhuma enumeração.**
 * - **Nenhum `UserId` em saída.** Os métodos recebem contas e devolvem
 *   `boolean`, `number` ou estado de aresta.
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
import type { EstadoNoApp } from '../domain/conexao.js';

/**
 * **O estado da aresta, REEXPORTADO pela porta** — e a reexportação é a
 * fronteira funcionando, não conveniência.
 *
 * `src/architecture.rules.mjs` deixa `people` conversar com `connections`
 * **só** por este arquivo, e o `eslint` reprova `people` importando
 * `connections/domain` (medido em 22/10/2026: as duas bancadas da busca
 * reprovaram em `arquitetura/fronteira-de-modulo` ao nomear `EstadoNoApp`
 * direto do domínio). Quem consome [LeitorDeConexao.estadosPorApelido] precisa
 * nomear o tipo do que recebe; sem esta linha, nomeá-lo seria furar a
 * fronteira — ou a porta devolveria `string`, que é pior.
 */
export type { EstadoNoApp };
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

  /**
   * **A aresta VIVA entre os dois, projetada do ponto de vista de quem olha** —
   * ou `undefined` quando não há nenhuma.
   *
   * Existe para a fatia G (o perfil de outra pessoa), que precisa de três
   * estados e não de um booleano: quem não é conexão, quem tem pedido pendente
   * (nos dois sentidos) e quem é conexão aceita desenham telas diferentes, e o
   * `ref` é o que deixa a tela aceitar, cancelar ou desfazer sem uma segunda
   * leitura.
   *
   * **Nenhum `UserId` sai**, como nos dois métodos acima: o que sai é o estado
   * e o `ref` da ARESTA. E não há como pedir "as arestas de alguém" — o
   * argumento é um par, e a resposta é no máximo uma.
   *
   * `undefined` funde, de propósito, "nunca houve nada", "o pedido expirou" e
   * "a recusa ainda está em descanso". É a mesma fusão do 204 de `encerrar`:
   * um valor próprio para recusado seria o *"ela recusou você"* que o desenho
   * não dá. Quem chama projeta os três como `none`.
   */
  arestaVivaEntre(
    quemOlha: UserId,
    outro: UserId,
    agora: Instant,
  ): Promise<ArestaVivaDoPar | undefined>;

  /**
   * **O estado da aresta entre `quemOlha` e CADA um destes apelidos**, numa
   * consulta só. Apelido sem aresta viva simplesmente **não aparece no mapa**.
   *
   * ## Por que ela existe: o botão errado na busca
   *
   * O cliente relatou, por escrito: *"após eu ter aceito, ainda aparece para
   * solicitar conexão a um usuário que ja foi adicionado e aceito"*. A causa era
   * estrutural — `PersonSearchResult` omitia `connection_state` de propósito,
   * porque *"numa lista, vinte estados por requisição são o material de que uma
   * lista de conexões se faz do lado de fora"*. **Esse argumento caiu em
   * 22/10/2026**, e caiu pela decisão do próprio cliente: com
   * `listMyConnections` autorizada, o dono já obtém o conjunto das suas conexões
   * por uma rota legítima, então devolvê-lo recortado nos resultados da busca
   * **dele** não entrega nada novo.
   *
   * ## Três coisas que esta porta garante, e nenhuma é disciplina de quem chama
   *
   * 1. **Só o par com `quemOlha`.** O estado é entre quem olha e cada apelido, e
   *    não há forma de perguntar a relação entre duas OUTRAS pessoas. Isto não
   *    abre a lista de conexões de terceiro: quem chama já sabe quem são as
   *    próprias conexões, e as de mais ninguém.
   * 2. **A recusa continua silenciosa.** O estado sai de `estadoNoApp`, a MESMA
   *    função de [arestaVivaEntre], e não de uma segunda regra escrita em SQL:
   *    recusado se projeta como `pending_sent` para quem pediu enquanto a
   *    validade corre, e desaparece depois — indistinguível de um pedido que
   *    ninguém respondeu. **Não existe `declined` no vocabulário de saída.**
   * 3. **Nenhum `UserId` e nenhum `ref` de aresta.** A chave do mapa é o
   *    **apelido**, que quem chama já tinha na mão para perguntar. O `ref` fica
   *    fora de propósito: ele é o que deixa desfazer, e desfazer mora no perfil
   *    de uma pessoa — não numa lista que se rola com o polegar.
   *
   * **UMA consulta para a página inteira**, e não uma por pessoa: a Emenda 3 do
   * ADR-0010 registra, para a foto na conversa, que perguntar a aresta por item
   * seriam vinte idas ao banco por rolada. O mesmo vale aqui, e é por isso que o
   * argumento é uma lista e não um apelido.
   */
  estadosPorApelido(
    quemOlha: UserId,
    apelidos: readonly string[],
    agora: Instant,
  ): Promise<ReadonlyMap<string, EstadoNoApp>>;
}

/** O que [LeitorDeConexao.arestaVivaEntre] devolve: estado e `ref` da ARESTA. */
export interface ArestaVivaDoPar {
  readonly estado: EstadoNoApp;
  /** O `ref` da aresta. **Da aresta, nunca de uma pessoa.** */
  readonly ref: string;
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
