/**
 * A MODERACAO DE PALAVRAS dos textos que a comunidade escreve sobre
 * profissionais: a **indicacao** (`suggestDirectoryEntry`) e a **recomendacao**
 * com nota e texto (`putMyDirectoryEntryReview`).
 *
 * ## ONDE ESTA FUNCAO ESTA LIGADA HOJE, e a lista e a verdade e nao a intencao
 *
 * Esta secao existe porque este cabecalho **mentiu por um dia**. Ele afirmava
 * cobrir a indicacao e a recomendacao enquanto a chamada existia so na
 * indicacao: a recomendacao foi escrita em paralelo, a ligacao dela ficou para
 * depois e a prosa nao foi corrigida. Quem leu o cabecalho acreditou, que e
 * exatamente o modo de falhar que o resto deste arquivo tenta evitar. **Se
 * voce ligar esta funcao em mais um campo, acrescente a linha aqui na mesma
 * edicao.**
 *
 * - `modules/professionals/domain/sugestao-do-diretorio.ts` --
 *   `errosDaSugestao`: `display_name` e `note` da INDICACAO.
 * - `modules/professionals/domain/avaliacao-do-local.ts` --
 *   `errosDeModeracaoDaAvaliacao`, chamada pela borda em
 *   `adapters/http/directory-routes.ts`: o `body` da RECOMENDACAO.
 *
 * **E nenhum outro campo do produto**, e a ausencia nao e esquecimento: o
 * pedido do cliente de 18/10/2026 falou dos campos de indicacao e de
 * recomendacao de profissionais, e e so onde ela esta. Nome de pet, descricao
 * de achado, nome e descricao de evento, observacao de plaquinha e nome de
 * exibicao do usuario **nao passam por aqui**.
 *
 * ## A ORDEM, nas duas, e a mesma
 *
 * A trava de **canal de contato verificado** (`409
 * `contact-channel-unverified`) roda **antes** da moderacao nas duas
 * operacoes: na indicacao dentro de
 * `application/sugestao-do-diretorio.ts`, na recomendacao na borda. Quem nao
 * confirmou o e-mail ouve o que de fato falta, e nao um `400` sobre o texto.
 *
 * Pedido do cliente, 18/10/2026: os campos de indicacao e recomendacao de
 * profissionais nao podem aceitar xingamento, discriminacao "e tudo que possa
 * prejudicar a imagem do app".
 *
 * ## POR QUE A TRAVA E AQUI, NO SERVIDOR
 *
 * Um aviso no aplicativo e cortesia com quem digitou -- ele evita que a pessoa
 * perca o texto. **Ele nao e protecao.** A API e publica: qualquer um fala com
 * ela direto, sem passar pelo aplicativo, e um `curl` com o mesmo corpo
 * escreveria o que a tela recusou. A trava que vale e a desta funcao, chamada
 * no caminho de escrita, e e por isso que a prova de que ela funciona e
 * **chamar a rota direto**, e nao abrir a tela.
 *
 * ## POR QUE A RECUSA E NA HORA DA ESCRITA
 *
 * A indicacao vai para fila e passa por revisao do administrador. A
 * **recomendacao aparece na hora** -- decisao do cliente, no estilo da loja de
 * aplicativos. Para ela nao existe "o administrador ve antes": entre o teclado
 * e a tela de outra pessoa nao ha ninguem. Recusar depois, na revisao, nao
 * protegeria nada, porque o texto ja teria aparecido.
 *
 * **Isto nao substitui a remocao pelo administrador**, que continua existindo e
 * continua sendo a protecao de fundo. Esta funcao e a primeira barreira, nao a
 * ultima.
 *
 * ## O QUE A RECUSA NAO DIZ, e as tres ausencias sao requisito
 *
 * 1. **A mensagem nao devolve a palavra encontrada.** Devolve-la transformaria
 *    o `400` em confirmacao ("foi esta que voce escreveu") e, pior, em oraculo:
 *    quem quer descobrir a lista manda uma palavra por requisicao e le a
 *    resposta.
 * 2. **Nenhuma resposta de API devolve a lista**, nem contagem, nem categoria.
 * 3. **Nada disso vai para log.** Este arquivo nao registra nada: ele devolve
 *    `ProblemFieldError[]` e quem chama monta o `400`. Nao ha `console`, nao ha
 *    `logger`, nao ha evento de auditoria com o texto nem com a palavra.
 *
 * A mensagem diz **o que fazer**, em portugues, sem acusar a pessoa de nada.
 *
 * ## ISTO NAO E A PROVA DE CONTORNO, e nao deve ser vendido como se fosse
 *
 * Lista de palavras pega o xingamento escrito por extenso e desatento. Ela
 * **nao** pega:
 *
 * - **frase ofensiva sem palavra proibida** ("devia ser preso", "nao merece
 *   cuidar de animal", ironia, ameaca velada) -- e a forma mais comum de
 *   agressao em avaliacao, e nenhuma lista a alcanca;
 * - **palavra grudada em outra** (`vaitomarno...` numa unica palavra), porque o
 *   casamento e por token inteiro, de proposito: casar por pedaco e o que
 *   bloqueia a Clinica Pinto;
 * - **troca de caractere nao prevista** (`¢`, `ҽ`, cirilico que parece latino,
 *   emoji no meio da palavra);
 * - **flexao que nao esta na lista** (`foder` nao pega `fodendo`);
 * - **outro idioma**;
 * - **injuria racial**, que em portugues e feita de palavra reaproveitada -- a
 *   razao esta por extenso em `lista-de-moderacao.ts`.
 *
 * Quem quer escapar escapa. A protecao real continua sendo a **remocao pelo
 * administrador** e a **denuncia**.
 *
 * ## POR QUE ESTE ARQUIVO MORA EM `shared/`, e nao num modulo
 *
 * `professionals` (indicacao) e o caminho da recomendacao sao modulos
 * diferentes, e `arquitetura/fronteira-de-modulo` reprova um importar o
 * dominio do outro: foi essa regra que obrigou `ports/conferencias-de-texto.ts`
 * a existir, para a indicacao reusar o detector de contato da `Rede` sem
 * duplica-lo. `shared/` nao e modulo, entao os dois importam **a mesma
 * funcao** direto, sem porta e sem segunda copia. E a correcao de fundo que
 * `escrita-da-vitrine.ts` pediu desde a Loja, aplicada ao detector novo em vez
 * de criar mais um no lugar errado.
 *
 * ## COMO LIGAR (uma linha)
 *
 * Em cada campo de texto livre, concatene o resultado aos erros que a escrita
 * ja devolve: `...errosDeModeracao('body', corpo.body)`.
 *
 * **E acrescente o campo na lista do topo**, na mesma edicao. A lista e o que
 * o proximo leitor vai acreditar.
 */
import type { ProblemFieldError } from '../http/problem.js';
import { EXCECOES, PALAVRAS_RECUSADAS } from './lista-de-moderacao.js';

/**
 * O `code` da recusa.
 *
 * **Nao ha `code` existente que sirva.** `contact_or_payment_detected` e
 * `address_in_place_name` dizem outra coisa, e reusar um deles mandaria a
 * pessoa consertar telefone ou endereco num texto que nao tem nenhum dos dois
 * -- o defeito que `shared/url/endereco-completo.ts` registrou em 17/10 e que
 * custou um dia de procura no lugar errado.
 *
 * O `code` e valor livre no contrato (`FieldError.code` e `{ type: string }`,
 * sem `enum`), entao acrescentar este nao muda nenhum esquema.
 */
export const CODIGO_DA_MODERACAO = 'inappropriate_language';

/**
 * A mensagem. **Sem a palavra**, sem a lista, sem acusacao -- e dizendo o que
 * fazer.
 */
export const MENSAGEM_DA_MODERACAO =
  'Reescreva sem ofensa. Este texto vai aparecer para a comunidade, e aqui não ' +
  'entra palavra ofensiva, xingamento nem termo que discrimine alguém. Conte o que ' +
  'achou do atendimento com suas palavras: crítica negativa pode, ofensa não.';

/** Invisivel que se usa para partir uma palavra no meio sem a tela mostrar. */
const INVISIVEL = /[\u200b-\u200f\u2060-\u2064\ufeff\u00ad]/gu;

/**
 * As trocas de caractere obvias. Sem elas o filtro nao serve para nada:
 * `C@R4LH0` passaria.
 *
 * `@` entra aqui, e e o unico ponto em que ele some -- a conferencia de contato
 * e **outra funcao**, em `modules/network`, e ela olha o texto CRU. Esta
 * normalizacao nao a atravessa.
 */
const IMITA_LETRA: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
};

/** Separador que alguem poe DENTRO da palavra para quebra-la: `p.u.t.a`, `foda-se`. */
const SEPARADOR_INTERNO = /(?<=[a-z0-9])[.\-_*'`/|]+(?=[a-z0-9])/g;

/**
 * Tres ou mais caracteres soltos com o MESMO separador entre eles viram uma
 * palavra. E a mesma ideia de `normalizarParaConferencia`
 * (`modules/network/domain/escrita-do-encontro.ts`), que esta funcao **nao
 * importa** porque `shared/` nao pode depender de modulo -- a dependencia seria
 * ao contrario da que a fronteira permite.
 */
const SOLTOS = /(?<![a-z0-9])([a-z0-9])([\s.\-_*/|]+)(?:[a-z0-9]\2){1,}[a-z0-9](?![a-z0-9])/g;

/**
 * O texto na forma em que a lista e comparada: sem acento, sem maiuscula, sem
 * invisivel, sem troca de caractere, sem letra repetida e sem separador no meio
 * da palavra.
 *
 * Exportada porque e ela que a isca mede. Se a normalizacao mudar e um nome
 * proprio passar a colidir, e aqui que se ve.
 */
export function normalizarParaModeracao(texto: string): string {
  const semAcento = texto
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(INVISIVEL, '')
    .toLowerCase();
  // A ordem IMPORTA: juntar e tirar o separador vem ANTES da troca de
  // caractere, senao `c @ r 4 l h 0` chegaria a troca ainda partido em sete
  // pedacos e sairia inteiro.
  const juntado = semAcento
    .replace(SOLTOS, (m) => m.replace(/[^a-z0-9]/g, ''))
    .replace(SEPARADOR_INTERNO, '');
  // A troca de caractere so vale em palavra que TEM letra: `4040` continua
  // numero, e nao vira `aoao`. E a mesma precaucao de
  // `normalizarParaConferencia`, pelo mesmo motivo.
  const semImitacao = juntado.replace(/[a-z0-9@$]+/g, (palavra) =>
    /[a-z]/.test(palavra) ? palavra.replace(/[013457@$]/g, (c) => IMITA_LETRA[c] ?? c) : palavra,
  );
  // Letra repetida colapsa: `caraaalho` e `caralho`. Nenhuma palavra da lista
  // nem da excecao tem letra dobrada, entao colapsar nao pode esconder
  // nenhuma delas -- e a isca confere isso, varrendo as duas listas.
  return semImitacao.replace(/([a-z0-9])\1+/g, '$1');
}

/**
 * Os tokens do texto normalizado. **Token inteiro**, e e aqui que o limite de
 * palavra acontece: `reputacao` nao contem `puta` para esta funcao, e e por
 * isso que ela existe em vez de um `includes`.
 */
function tokens(normalizado: string): string[] {
  return normalizado.split(/[^a-z0-9]+/).filter((t) => t !== '');
}

/** O conjunto, com o plural em `s` resolvido na comparacao e nao na lista. */
function contem(conjunto: ReadonlySet<string>, token: string): boolean {
  if (conjunto.has(token)) return true;
  return token.endsWith('s') && conjunto.has(token.slice(0, -1));
}

/**
 * As duas listas entram **ja normalizadas**, e isto nao e detalhe.
 *
 * Primeiro porque quem edita a lista nao tem de saber a normalizacao de cor:
 * escrever `Otário` em vez de `otario` continua funcionando. Segundo, e e o
 * motivo que importa, porque o colapso de letra repetida vale dos dois lados --
 * `burro` normaliza para `buro`, e uma excecao guardada crua nunca casaria com
 * o texto normalizado. A excecao teria deixado de proteger em silencio, que e o
 * modo de falhar que este arquivo inteiro existe para evitar.
 */
const RECUSADAS = new Set(PALAVRAS_RECUSADAS.map((p) => normalizarParaModeracao(p)));
const PERMITIDAS = new Set(EXCECOES.map((p) => normalizarParaModeracao(p)));

/**
 * Verdadeiro quando o texto tem palavra recusada.
 *
 * **A excecao vence o bloqueio**: o token que esta em `EXCECOES` nem chega a ser
 * conferido contra a lista. A ordem e o desenho, e nao detalhe de
 * implementacao -- ela e o que garante que incluir `pinto` na lista por engano
 * nao derruba a Clinica Pinto.
 */
export function temPalavraRecusada(valor: string): boolean {
  return tokens(normalizarParaModeracao(valor)).some(
    (token) => !contem(PERMITIDAS, token) && contem(RECUSADAS, token),
  );
}

/**
 * A INTERFACE DO MODULO: os erros de campo de um texto livre, prontos para
 * entrar no `400` junto com os outros.
 *
 * Devolve lista (vazia ou de um) em vez de lancar, pelo mesmo motivo de todas
 * as conferencias do projeto: a tela marca os campos de uma vez, e nao um por
 * requisicao.
 *
 * **Nao confere tamanho.** Tamanho e das conferencias que ja existem
 * (`errosDeTexto`, `errosDeTextoDeUsuario`); duplicar aqui criaria a segunda
 * definicao de "tamanho certo", que e a que diverge.
 */
export function errosDeModeracao(campo: string, valor: string): ProblemFieldError[] {
  if (!temPalavraRecusada(valor)) return [];
  return [{ field: campo, code: CODIGO_DA_MODERACAO, message: MENSAGEM_DA_MODERACAO }];
}
