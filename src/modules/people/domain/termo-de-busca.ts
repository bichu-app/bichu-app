/**
 * **O PISO DA BUSCA DE PESSOAS**, e ele não é preferência de produto.
 *
 * Decisão do cliente, 20/10/2026: *"mínimo de 3 caracteres"*, e *"campo vazio
 * nunca lista ninguém"*. As duas caem exatamente sobre um limite técnico que já
 * existia, e é por isso que elas são defensáveis sem ninguém ter de escolher um
 * número:
 *
 * - o índice da busca é **GIN trigrama** (`users_busca_por_nome` e
 *   `handles_busca_por_apelido`, migração `20261020000012`), e a
 *   `20260928000006` já registrou o motivo para o diretório: *"um padrão com
 *   menos de três caracteres não produz trigrama nenhum, e a consulta volta a
 *   varrer a tabela"*. Com menos de três caracteres não há busca barata —
 *   há varredura da tabela de contas inteira, por requisição;
 * - e uma consulta de um ou dois caracteres **casa quase todo mundo**, o que a
 *   torna uma listagem de pessoas com outro nome. O dano da busca de pessoas
 *   mora na enumeração, e a consulta curta é a forma mais barata dela.
 *
 * ## Lista vazia, e NUNCA erro
 *
 * Consulta curta devolve `undefined` aqui e **lista vazia** na borda, não 400.
 * É decisão do cliente e é o comportamento certo para uma tela em que a pessoa
 * digita: a busca é chamada a cada tecla, e `ma` seria um erro vermelho no meio
 * de alguém escrevendo `maria`. Erro é para pedido malformado, e dois
 * caracteres não são malformados — são incompletos.
 *
 * ## Por que o campo vazio não é o mesmo caso que o campo curto
 *
 * Em consequência os dois dão lista vazia, mas eles são medidos por iscas
 * separadas de propósito, porque a pressão futura sobre eles é diferente:
 *
 * - **campo curto** é alguém digitando, e o risco é alguém "melhorar" o piso
 *   para dois caracteres sem saber que o índice morre ali;
 * - **campo vazio** é a tela abrindo, e o risco é alguém "melhorar" a tela
 *   devolvendo **todos** — que é a listagem de pessoas que o desenho recusa, e
 *   que chegaria como uma conveniência e não como uma decisão. Não existe
 *   "listar todos": sem consulta, sem resultado.
 *
 * ## O que este arquivo NÃO faz
 *
 * **Não normaliza o termo.** Acento e caixa são resolvidos por
 * `texto_para_busca`, a função do banco, e a razão está escrita na
 * `20260928000006`: o índice é construído sobre uma expressão e o predicado
 * precisa ser a **mesma** expressão, então uma segunda normalização em
 * TypeScript divergiria da do índice — e divergiria **sem erro**, só ficando
 * lenta. Aqui só se apara espaço e se conta caractere.
 */

/**
 * O menor termo que o índice trigrama atende. **Três**, e o número é o do
 * índice e não um gosto — ver o cabeçalho.
 *
 * Exportado para que a isca afirme o piso pelo mesmo valor que a produção usa:
 * um teste que escrevesse `3` à mão passaria a medir outro número no dia em que
 * alguém mudasse este.
 */
export const MINIMO_DE_CARACTERES_DA_BUSCA = 3;

/**
 * O termo aparado, **ou `undefined` quando não há busca a fazer**.
 *
 * `undefined` cobre os três casos em que nenhuma consulta deve acontecer:
 * ausente, vazio (ou só espaço) e mais curto que o piso. Quem chama transforma
 * os três na **mesma** lista vazia, e nenhum deles vira erro.
 *
 * A contagem é feita **depois** de aparar: `'  ab  '` tem seis caracteres e dois
 * de termo, e é o termo que o índice vai ver.
 */
export function termoDeBusca(bruto: string | undefined): string | undefined {
  if (bruto === undefined) return undefined;
  const aparado = bruto.trim();
  if (aparado.length < MINIMO_DE_CARACTERES_DA_BUSCA) return undefined;
  return aparado;
}
