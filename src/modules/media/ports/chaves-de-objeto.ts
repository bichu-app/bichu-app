/**
 * A superfície pública de `media` para a construção de chave de objeto.
 *
 * ## Por que uma porta que reexporta funções puras, e não uma interface
 *
 * Módulo só enxerga `ports/` de outro módulo (§6), e `chave-de-objeto.ts` é
 * `media/domain`. O arranjo normal seria o módulo de fora declarar uma interface
 * e a composição injetar a implementação — foi o que eu escrevi primeiro, e
 * estava errado para este caso.
 *
 * O motivo é o ADR-0007, que diz literalmente que **a chave não é detalhe de
 * armazenamento: é parte do contrato.** Copiar os objetos para outro provedor
 * sem preservar a chave quebra toda URL de foto já compartilhada em cartaz e em
 * conversa. Uma chave, então, não é uma dependência que se troca por
 * configuração: ela é um valor com uma forma fixa, do mesmo tipo de um
 * identificador. Injetá-la por porta abriria a possibilidade de ligar uma
 * implementação diferente, e essa possibilidade é exatamente o que o ADR fecha.
 *
 * Então a porta existe para **declarar quais funções de chave são públicas** —
 * e são estas, não o arquivo inteiro. `comoObjectKey` e `chaveDaDerivada` ficam
 * de fora de propósito: a primeira é a porta de entrada da marca, que só `media`
 * atravessa, e a segunda produz a derivada pública, que só o worker grava.
 */
export {
  chaveDaFotoDoAchado,
  chaveDaFotoDoAchadorSemConta,
  chaveDoOriginal,
  ehTipoAceito,
  TIPOS_ACEITOS,
} from '../domain/chave-de-objeto.js';
export type { TipoAceito } from '../domain/chave-de-objeto.js';
