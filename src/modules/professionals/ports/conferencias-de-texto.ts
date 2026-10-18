/**
 * As conferencias de texto que este modulo **nao reimplementa**, recebidas como
 * porta.
 *
 * ## Por que isto e uma porta, e nao um `import`
 *
 * O detector de D59 (contato e pagamento) e a leitura de handle do Instagram
 * existem, e sao os de `modules/network/domain`:
 * `errosDeTextoDeUsuario` (`encontro-da-comunidade.ts`) e `handleDoInstagram`
 * (`escrita-do-encontro.ts`). Eles sao a MESMA regra que vale aqui -- a
 * sugestao do diretorio tambem e texto que a comunidade escreve e que ninguem
 * olha antes da fila.
 *
 * `arquitetura/fronteira-de-modulo` reprova importa-los daqui, e reprova com
 * razao: modulo so conversa com modulo por porta. **Medido**, com o import
 * escrito num arquivo deste modulo:
 *
 *     error  Import de 'professionals' para 'network/domain'.
 *            Módulo só conversa com módulo por porta.
 *
 * As duas saidas erradas eram escrever um segundo detector aqui (passa a haver
 * dois, e eles divergem calados -- a Loja ja registrou essa mesma renuncia em
 * `escrita-da-vitrine.ts`, por este mesmo motivo) e desligar a regra por
 * comentario de supressao. A terceira, que e esta, e declarar a porta e deixar
 * `src/bin/api.ts` passar a funcao de verdade: a composicao mora fora de
 * `src/modules/`, onde a fronteira nao se aplica, e o detector continua tendo
 * uma unica implementacao.
 *
 * **A correcao de fundo e mover o detector para `shared/`**, e ela esta
 * registrada em `escrita-da-vitrine.ts` desde a Loja. Enquanto ela nao
 * acontecer, esta porta e o jeito de reusar sem duplicar.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';

export interface ConferenciasDeTexto {
  /**
   * Tamanho, controle bidirecional (`code: bidi_control`) e D59
   * (`code: contact_or_payment_detected`) em texto que a pessoa escreve.
   *
   * E `errosDeTextoDeUsuario` de `modules/network/domain/encontro-da-comunidade.ts`,
   * sem adaptacao: a assinatura e a dela.
   */
  errosDeTextoDeUsuario(
    campo: string,
    valor: string,
    minimo: number,
    maximo: number,
  ): ProblemFieldError[];

  /**
   * O handle do Instagram a partir de `@usuario`, `usuario` ou da URL do
   * perfil, em minusculas -- ou `null` quando nao da para tirar um handle
   * valido (o padrao do Instagram: 1 a 30 de letra, digito, ponto e sublinhado).
   *
   * E `handleDoInstagram` de `modules/network/domain/escrita-do-encontro.ts`.
   * **Nao e `errosDoInstagram`**, e a escolha esta explicada em
   * `domain/sugestao-do-diretorio.ts`: aquela exige a URL completa, e o
   * contrato desta operacao pede o perfil com `@`.
   */
  handleDoInstagram(valor: string): string | null;
}
