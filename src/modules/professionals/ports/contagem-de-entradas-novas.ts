/**
 * BICHUS-278 -- quantas entradas entraram no diretorio DEPOIS de um instante.
 *
 * Porta deste modulo pela mesma razao das outras duas: a fronteira de modulo
 * reprova quem alcanca `adapters` alheio, e a contagem mora ao lado da listagem
 * com que ela tem de concordar.
 *
 * ## "RECOMENDADO" E A ENTRADA NO DIRETORIO, e a decisao e do cliente
 *
 * 20/10/2026, nas palavras dele: *"Todo profissional que passa pela moderacao e
 * entra no Perto conta como recomendado pela comunidade -- porque ele so chega
 * la se alguem o indicou"*. O sinal e a PUBLICACAO, e e por isso que **nao ha
 * coluna de destaque, ranking nem selo**: o dado ja existia.
 */
import type { Instant } from '../../../shared/types/brands.js';
import type { UserId } from '../../../shared/types/brands.js';

export interface RecorteDeEntradasNovas {
  /**
   * Quem chama. **Nao e filtro:** o construtor da listagem o exige para a
   * ordenacao por distancia, e esta contagem nao ordena. Ele entra para o
   * recorte ser o MESMO objeto da listagem.
   */
  readonly chamador: UserId;
  /** O marcador de "ja vi", ou indefinido quando a conta nunca viu a sub-aba. */
  readonly desde?: Instant | undefined;
  readonly agora: Instant;
}

export interface ContagemDeEntradasNovas {
  contar(recorte: RecorteDeEntradasNovas): Promise<number>;
}
