/**
 * O rótulo de área que sai em **superfície pública**: "Bairro, Cidade".
 *
 * ## Por que ele mora em `shared/` e não no domínio de quem o usa
 *
 * Ele nasceu em `lostfound/domain/abertura-do-caso.ts` (BICHUS-21) quando só o
 * caso de perdido precisava dele. Com o achado avulso (BICHUS-35) ele passou a
 * ser lido por dois módulos, e módulo não enxerga o domínio de outro módulo —
 * a fronteira da §6 da arquitetura é imposta por lint, não combinada.
 *
 * As saídas eram três: duplicar a função, declarar uma porta para uma função
 * pura de formatação, ou mover a definição para onde os dois a alcançam. As duas
 * primeiras são piores, e pelo mesmo motivo: **o caso de perdido e o achado
 * aparecem LADO A LADO na tela de possíveis correspondências.** Dois rótulos com
 * formatos diferentes para o mesmo tipo de lugar é o defeito que a duplicação
 * produz, e uma porta injetada só adianta a divergência para o dia em que alguém
 * ligar uma implementação diferente.
 *
 * `lostfound/domain/abertura-do-caso.ts` reexporta daqui, então `rotuloDaArea`
 * continua sendo o mesmo nome no mesmo lugar para quem já o importava.
 *
 * ## O que ele não faz, e isso é a regra
 *
 * **A coordenada nunca entra aqui** — nem arredondada. Ponto arredondado ainda é
 * ponto, e um arredondamento de 100 m no meio de um bairro residencial aponta
 * para o quarteirão. Bairro e cidade são o nível máximo de precisão pública que
 * o produto admite (ADR-0010), e a função lê **só** o texto que a pessoa digitou:
 * nada aqui deriva lugar de coordenada, que é o que o ADR-0006 proíbe.
 *
 * O parâmetro é um objeto com campos opcionais, e não dois argumentos, para que
 * acrescentar um campo de lugar não vire mudança de assinatura em dois módulos.
 */
export interface LugarEmTexto {
  readonly neighborhood?: string | undefined;
  readonly city?: string | undefined;
}

export function rotuloDaArea(onde: LugarEmTexto): string | null {
  const bairro = onde.neighborhood?.trim();
  const cidade = onde.city?.trim();
  if (bairro !== undefined && bairro !== '' && cidade !== undefined && cidade !== '') {
    return `${bairro}, ${cidade}`;
  }
  if (cidade !== undefined && cidade !== '') return cidade;
  if (bairro !== undefined && bairro !== '') return bairro;
  return null;
}
