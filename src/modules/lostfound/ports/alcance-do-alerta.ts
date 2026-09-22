/**
 * Quantos tutores o alerta alcança.
 *
 * ## O tipo carrega a regra, e não o comentário
 *
 * `contarAlcancaveis` devolve `number | null`, e **`null` significa "não foi
 * possível contar"**. Não existe valor de retorno que signifique "não sei" e
 * pareça um número: é por isso que o retorno é anulável em vez de `-1` ou `0`
 * com uma flag ao lado. Quem implementar esta porta só tem dois jeitos de
 * responder, e o compilador obriga quem consome a tratar os dois.
 *
 * ADR-0006 escreve a regra em uma frase: *"falha de cálculo não vira zero"*.
 *
 * ## Quem entra na conta
 *
 * Os sete critérios do ADR-0006, e nenhum a menos: localização conhecida,
 * capturada há 30 dias ou menos, dentro do raio por `ST_DWithin`, com ao menos
 * um aparelho com `push_permission = granted` e token válido, que não seja o
 * próprio tutor do caso, dentro do teto de fadiga de 3 alertas em 24 h, e com o
 * caso sem disparo nas últimas 24 h.
 *
 * O número desta porta é o **mesmo** que o disparo vai usar (critério 9 da
 * BICHUS-20). Duas contagens com critérios ligeiramente diferentes fariam a tela
 * prometer um alcance e o envio entregar outro, e ninguém acusaria.
 */
import type { CentroDoAlcance } from '../domain/previa-do-alcance.js';
import type { UserId } from '../../../shared/types/brands.js';

export interface AlcanceDoAlerta {
  /**
   * Conta os tutores alcançáveis, ou devolve `null` se não conseguir.
   *
   * @param excluir O tutor do caso, que nunca se alerta a si mesmo.
   */
  contarAlcancaveis(
    centro: CentroDoAlcance,
    raioEmMetros: number,
    excluir: UserId,
  ): Promise<number | null>;
}
