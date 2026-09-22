/**
 * Quem o alerta alcança — e, por consequência, quantos.
 *
 * ## Um método só, e é essa a decisão do arquivo
 *
 * A porta tinha `contarAlcancaveis`, que devolvia um número. Ela passa a ter
 * `alcancaveis`, que devolve **a lista**, e a contagem deixa de ser uma
 * pergunta que o banco responde: ela é `destinatarios.length`.
 *
 * O motivo é a BICHUS-20 inteira. Se "quantos" e "quem" saírem de duas
 * consultas, elas divergem — não no dia em que forem escritas, e sim no dia em
 * que alguém acrescentar um critério a uma e esquecer a outra. A tela diria
 * "12 vizinhos vão receber" e o disparo mandaria para 9, e **nenhum teste
 * acusaria**, porque cada consulta está certa sozinha. Com um método só, a
 * divergência deixa de ser exprimível: não há segunda consulta para divergir.
 *
 * É o critério 9 da BICHUS-20 escrito no tipo em vez de em prosa: *"o número da
 * tela é o número real de destinatários, e é o mesmo que o disparo vai usar"*.
 *
 * ## O teto de 500 entra na contagem, e isso é deliberado
 *
 * O corte é de 500 depois de ordenar por distância (critério 9 da BICHUS-18).
 * Uma região com 900 elegíveis produz 500 destinatários, e `reachable_tutors`
 * diz **500** — não 900. Um `COUNT(*)` sem teto diria 900 e o disparo mandaria
 * para 500, que é a mesma classe de mentira que o zero inventado.
 * `tetoAtingido` diz que houve corte, para quem lê a métrica meses depois saber
 * que 500 com corte e 500 sem corte são fatos diferentes.
 *
 * ## `null` continua significando "não foi possível"
 *
 * ADR-0006, em uma frase: *"falha de cálculo não vira zero"*. Lista vazia e
 * `null` são coisas diferentes, e o tipo obriga quem consome a tratar as duas:
 * lista vazia vira `computed` com zero ("não há ninguém num raio de 5 km"),
 * `null` vira `unavailable` ("não conseguimos calcular").
 *
 * ## Quem entra na lista
 *
 * Os **seis** critérios do ADR-0006 que são perguntas sobre UMA PESSOA:
 * localização conhecida, capturada há 30 dias ou menos, dentro do raio por
 * `ST_DWithin`, com ao menos um aparelho com `push_permission = granted` e
 * token, que não seja o próprio tutor do caso, e dentro do teto de fadiga de
 * 3 alertas em 24 h.
 *
 * O sétimo — *"o caso não mandou alerta nas últimas 24 h"* — **não está aqui**,
 * e a ausência é a parte que precisa estar escrita: ele não é filtro sobre
 * pessoas. Aplicá-lo como `WHERE` faria a consulta devolver zero linhas quando
 * o caso já disparou hoje, e zero linhas viraria `computed: 0` — "não há
 * ninguém por perto" no lugar de "este caso já avisou a vizinhança hoje". São
 * fatos opostos, e a pessoa precisa saber qual dos dois é. Ele mora em
 * `RegistroDeDisparos.ultimoDisparoDoCaso`, que é pergunta sobre o CASO.
 */
import type { CentroDoAlcance } from '../domain/previa-do-alcance.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';

/**
 * Uma conta que vai ser avisada, e por onde.
 *
 * `aparelhos` são **identificadores**, nunca tokens. O token é resolvido no
 * instante do envio por `enderecoDeEnvio` (BICHUS-91), e o motivo está escrito
 * lá: entre a leitura da lista e o envio a pessoa pode sair da conta, remover o
 * aparelho pelo Perfil ou o FCM pode ter recusado o token para outra mensagem.
 * Uma lista que carregasse os tokens mandaria para aparelho já revogado, e
 * nenhuma forma de marcar a linha conserta isso — só reler no momento de usar.
 */
export interface Destinatario {
  readonly usuario: UserId;
  readonly aparelhos: readonly string[];
}

export interface AlcanceCalculado {
  /**
   * Ordenados por distância crescente e cortados em 500 (critério 9 da
   * BICHUS-18). A ordem importa porque o corte é por ela: quando sobra alerta
   * para 500 de 900, quem fica são os mais perto, que são os que têm chance de
   * ver o animal na rua.
   */
  readonly destinatarios: readonly Destinatario[];
  /** O corte aconteceu. Muda a leitura da métrica, e por isso é gravado. */
  readonly tetoAtingido: boolean;
}

export interface ConsultaDeAlcance {
  readonly centro: CentroDoAlcance;
  readonly raioEmMetros: number;
  /** O tutor do caso, que nunca se alerta a si mesmo (critério 5). */
  readonly excluir: UserId;
  /**
   * O agora da consulta, injetado e não lido do banco.
   *
   * Dois critérios dependem dele — a validade de 30 dias e o teto de fadiga de
   * 24 h — e os dois são janelas móveis. Com `now()` dentro do SQL não haveria
   * como um teste pôr o relógio num instante escolhido, e janela que só se
   * exercita esperando 24 h é janela que ninguém exercita.
   */
  readonly agora: Instant;
}

export interface AlcanceDoAlerta {
  /**
   * Quem o alerta alcança, ou `null` se não foi possível calcular.
   *
   * Um método, uma consulta. Ver o cabeçalho.
   */
  alcancaveis(consulta: ConsultaDeAlcance): Promise<AlcanceCalculado | null>;
}
