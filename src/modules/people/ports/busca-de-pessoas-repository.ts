/**
 * A porta da **busca de pessoas** (decisão do cliente de 20/10/2026).
 *
 * ## O que esta porta é, e por que ela existe separada da do perfil
 *
 * `PerfilDePessoaRepository` declara, no próprio cabeçalho, que não oferece
 * *"nenhuma busca, nenhuma listagem, nenhuma coleção de pessoas"*. Aquela frase
 * era verdadeira e deixou de ser, e a resposta certa não é reescrevê-la para
 * "exceto esta": é **uma porta nova**, que nasce dizendo o que a busca pode
 * fazer e o que ela não pode. A porta do perfil continua respondendo no máximo
 * **uma** pessoa, por um apelido que quem chama já tem na mão, e isso não
 * mudou.
 *
 * ## O recorte do resultado é LIMITE, e não escolha de tela
 *
 * [PessoaEncontrada] carrega **quatro** campos, e cada ausência tem dono:
 *
 * | Sai | Por quê |
 * |---|---|
 * | nome de exibição | emenda 2 do ADR-0010: *"ele pode ver nome"* |
 * | contagem de pets | emenda 2, que abriu a CONTAGEM do item 7 |
 * | contagem de conexões | emenda 2, o "sinal de confiança" do plano 4-B |
 * | apelido | é a referência pública da pessoa, e é o endereço do perfil |
 *
 * | **Não** sai | Por quê |
 * |---|---|
 * | **foto** | emenda 5 item 2: a foto não sai para quem **não** é conexão aceita — e resultado de busca é, por construção, lista de não-conexões |
 * | `public_ref` | ele existe em `PersonProfile` porque **aquela tela** hospeda denunciar e bloquear (as três operações são endereçadas por `userRef`). A busca não hospeda nenhuma das três, então aqui ele não tem dono — e referência pública sem uso é superfície de graça |
 * | qualquer UUID | ADR-0010 item 6 |
 * | cidade, bairro, telefone, e-mail, nascimento | o cliente não mencionou nenhum em 19/10 nem em 20/10, e os itens 1, 3 e 4 do ADR-0010 |
 * | `connection_state` | **não**, e a ausência é deliberada: ver abaixo |
 *
 * ## Por que o resultado NÃO traz o estado da conexão
 *
 * `PersonProfile` traz `connection_state`, e a busca não. A diferença não é
 * economia: o estado é por **par**, e trazê-lo numa lista de vinte pessoas
 * responderia vinte perguntas de relação por requisição — o que é exatamente o
 * material de que uma lista de conexões é feita, montada do lado de fora. Quem
 * toca um resultado abre o perfil, e é lá que o estado aparece, uma pessoa por
 * vez.
 *
 * ## A foto, e por que ela não é um `undefined` a preencher depois
 *
 * Não há campo de foto em [PessoaEncontrada], e não é omissão: a emenda 5 item 2
 * do ADR-0010 nega o rosto a quem não é conexão aceita. Resultado de busca é
 * lista de quem quem busca **não** conhece — se conhecesse, não precisaria
 * buscar. Um campo nulo aqui seria pior que a ausência, porque convidaria
 * alguém a preenchê-lo no dia em que a busca passasse a casar conexões também.
 *
 * ## O que esta porta NÃO oferece, e não pode ganhar
 *
 * - **Nenhuma leitura sem termo.** [buscar] exige `termo: string`, não
 *   `termo?: string`, e não existe variante que liste. "Listar todos" não é um
 *   caso degenerado desta porta: ele não é exprimível nela. Quem decide que não
 *   há busca a fazer é `termoDeBusca`, **antes** de chegar aqui, e nesse caso
 *   esta porta não é chamada.
 * - **Nenhuma ordenação por proximidade, por popularidade ou por "quem você
 *   talvez conheça".** Sugestão de quem conhecer é a enumeração servida pelo
 *   produto, e a `20261018000030` já a recusa nominalmente.
 * - **Nenhuma escrita.**
 */
import type { UserId } from '../../../shared/types/brands.js';

/**
 * Uma pessoa como a busca a entrega: **quatro campos, e nada mais**.
 *
 * É o mesmo princípio de `PessoaVisivel` — o tipo é onde o recorte vira
 * impossibilidade. Não há aqui campo de foto, de endereço, de pet nem de
 * estado da conexão para alguém copiar sem **acrescentar campo neste arquivo**.
 */
export interface PessoaEncontrada {
  /** O apelido. Referência pública, e o endereço do perfil. */
  readonly handle: string;
  /**
   * O nome de exibição, **anulável**: a coluna é anulável em `users`, e omitir
   * a pessoa por falta de nome a faria desaparecer da busca por um campo que
   * ela não preencheu. Quem desenha cai para `@handle`.
   */
  readonly displayName: string | null;
  /** Quantos pets, **e nada além do número** (emenda 2 do ADR-0010). */
  readonly petsCount: number;
  /** Quantas conexões aceitas. **O número, nunca a lista.** */
  readonly connectionsCount: number;
}

/** Uma página de resultados. Numerada, como as outras listagens da casa. */
export interface PaginaDeBuscaDePessoas {
  readonly itens: readonly PessoaEncontrada[];
  readonly total: number;
}

export interface BuscaDePessoasRepository {
  /**
   * As pessoas cujo **nome ou apelido** casam `termo`, vistas por `quemBusca`.
   *
   * `termo` é obrigatório e já veio aparado e conferido contra o piso de três
   * caracteres (`termoDeBusca`). Esta porta não tem como ser chamada sem termo,
   * e é isso que torna "listar todos" inexprimível em vez de proibido.
   *
   * **`quemBusca` é obrigatório porque toda autorização é a cláusula `WHERE`**
   * (ADR-0021): a consulta que devolveria quem desabilitou a conta, quem
   * bloqueou quem busca, quem foi bloqueado por ele ou quem ele denunciou **não
   * existe deste lado da porta**. Não há variante sem este argumento, e é essa
   * ausência — e não um filtro numa camada acima — que faz o recorte valer em
   * todo caminho novo.
   *
   * Lista vazia é a única resposta "negativa", e ela funde todos os motivos:
   * termo que não casa ninguém, e termo que só casaria gente que não existe
   * para quem busca. Distinguir os dois seria dizer *"existe alguém assim, mas
   * não para você"* — que é o oráculo que a busca não pode ser.
   */
  buscar(
    termo: string,
    quemBusca: UserId,
    pagina: number,
    limite: number,
  ): Promise<PaginaDeBuscaDePessoas>;
}
