/**
 * O EXPURGO NÃO EXPURGA MAIS NADA, e esta função é inócua de propósito.
 *
 * ## A decisão, literal, de 17/10
 *
 * > *"Mantenha a foto e não delete os dados do usuário, apenas desabilite na
 * > plataforma e filtro as páginas para que esse usuário não seja mais
 * > encontrado em nenhuma pagina ou funcionalidade"*
 *
 * Com ela, a metade destrutiva do desenho antigo deixa de existir. O que
 * sobrevive é a primeira metade, inteira e imediata: `DELETE /v1/me` marca
 * `users.deleted_at`, derruba as sessões, revoga as plaquinhas e invalida os
 * links pendentes. A conta fica **desabilitada**, e o que a faz desaparecer do
 * produto é cláusula de consulta, não ausência de linha.
 *
 * ## Por que a função continua existindo, em vez de ser apagada
 *
 * Porque a composição que a chama mora em `src/bin/worker.ts`, que neste momento
 * é de outra branch e não pode ser tocado aqui. A assinatura e as quatro chaves
 * de {@link DependenciasDoExpurgo} são preservadas **exatamente** para que o
 * `worker.ts` do tronco continue compilando e continue chamando — e a chamada
 * agora não faz nada. Isto é código inócuo e declarado, não código morto
 * esquecido: no dia em que o `worker.ts` puder ser editado, a chamada e este
 * arquivo saem juntos, e o registro de que isso falta está no relatório que
 * acompanhou esta branch.
 *
 * Nenhuma dependência é usada, e nenhuma é lida. Em particular
 * `apagarObjetosDaConta` **não é chamada**: era ela que apagava os objetos do
 * balde (SEC-020), e manter a foto foi pedido por escrito.
 *
 * ## O que esta função NÃO é
 *
 * Ela não é o apagamento sob pedido formal do titular (LGPD, art. 18, VI). Esse
 * apagamento **não existe mais em código**, e passa a ser procedimento
 * administrativo; a emenda de ADR que registra isso foi entregue junto desta
 * branch. Ler esta função como "o expurgo roda e falha" seria ler errado: ela
 * roda e, por decisão do cliente, não tem nada para fazer.
 *
 * ## O que foi desfeito, em voz alta
 *
 * - O `DELETE FROM users` (`expurgarConta`) saiu do repositório de identidade.
 *   Não há mais nenhum `DELETE FROM users` em `src/`.
 * - A chamada a `apagarObjetosDaConta` saiu daqui. `chavesDaConta` e
 *   `criarApagadorDeObjetosDaConta` continuam existindo porque `worker.ts` os
 *   importa, e ficaram sem nenhum chamador que apague.
 * - A ordem "objeto primeiro, linha depois" do SEC-020 deixou de ter objeto e
 *   deixou de ter linha.
 */
import type { Clock } from '../../../shared/time/clock.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';

export interface DependenciasDoExpurgo {
  /**
   * Não usado. `contasAExpurgar` continua na porta porque é uma LEITURA, e é
   * ela que o procedimento administrativo de apagamento sob pedido vai precisar
   * para listar candidatas. Nada aqui a chama.
   */
  readonly repositorio: Pick<IdentityRepository, 'contasAExpurgar'>;
  /** Não usado. Nenhum evento é gravado, porque nenhum fato acontece. */
  readonly trilha: AuditLog;
  /** Não usado. */
  readonly clock: Clock;
  /**
   * Não usado, e é o ponto inteiro desta mudança: era esta função que apagava
   * os arquivos do balde. A foto fica.
   */
  readonly apagarObjetosDaConta: (dono: UserId) => Promise<number>;
}

export interface ResultadoDoExpurgo {
  readonly examinadas: number;
  readonly expurgadas: number;
  readonly falhas: number;
}

/**
 * Devolve três zeros, sem tocar banco nem balde.
 *
 * Os zeros não são "nada vencido": são "nada é apagado". O `worker.ts` só
 * registra a rodada quando `examinadas > 0 || falhas > 0`, então o silêncio no
 * log é consequência deste retorno e não de uma falha calada.
 */
// `Promise.resolve` e não `async`: a função não tem nada para esperar, e um
// `async` sem `await` reprova no `require-await`. Ela segue devolvendo
// `Promise` porque `worker.ts` faz `await` nela.
export function expurgarContasExcluidas(
  deps: DependenciasDoExpurgo,
): Promise<ResultadoDoExpurgo> {
  // `void` e não `_deps`: a função precisa manter o parâmetro para a chamada de
  // `worker.ts` continuar válida, e esta linha diz ao leitor -- e ao linter --
  // que ignorá-lo é a intenção, não o esquecimento.
  void deps;
  return Promise.resolve({ examinadas: 0, expurgadas: 0, falhas: 0 });
}
