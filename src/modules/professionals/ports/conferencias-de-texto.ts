/**
 * As conferencias de texto que este modulo **nao reimplementa**, recebidas como
 * porta.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';

export interface ConferenciasDeTexto {
  /**
   * Tamanho, controle bidirecional (`code: bidi_control`) e D59 (`code:
   * contact_or_payment_detected`) em texto que a pessoa escreve.
   */
  errosDeTextoDeUsuario(
    campo: string,
    valor: string,
    minimo: number,
    maximo: number,
  ): ProblemFieldError[];

  /**
   * O handle do Instagram a partir de `@usuario`, `usuario` ou da URL do perfil, em
   * minusculas -- ou `null` quando nao da para tirar um handle valido (o padrao do
   * Instagram: 1 a 30 de letra, digito, ponto e sublinhado).
   */
  handleDoInstagram(valor: string): string | null;
}
