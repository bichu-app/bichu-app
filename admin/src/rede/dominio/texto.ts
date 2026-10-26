/**
 * Contagem de texto do painel, na forma em que o servidor conta.
 *
 * Mora SOZINHO, sem nenhum `import`, de proposito: a prova de que esta contagem
 * concorda com a do servidor (`errosDeTexto` em
 * `src/modules/network/domain/escrita-do-encontro.ts`) e cobrada pela suite da
 * RAIZ, em `src/modules/network/domain/paridade-com-o-backoffice.test.ts`, que
 * importa este arquivo. Um `import` aqui -- de `./tipos.ts`, do React, de
 * qualquer coisa -- arrastaria a resolucao `bundler` e a extensao `.ts` do
 * painel para dentro do `tsc` da raiz, que roda em `nodenext`, e a prova
 * deixaria de compilar. Se precisar de ajuda de outro modulo, a dependencia vai
 * no chamador, nao aqui.
 *
 * Saiu de `formulario.ts` em 23/10/2026 por esse motivo, e `formulario.ts`
 * reexporta as duas para quem ja as importava de la.
 */

/**
 * Tamanho como o servidor conta (`errosDeTexto`: `[...valor.trim()].length`) e
 * como o banco guarda: code points, e nao unidades UTF-16. Um emoji conta 1, e
 * um acento combinado (e + U+0301) conta 2, igual la.
 */
export function tamanhoComoOServidor(t: string): number {
  return [...t.trim()].length;
}

/** O texto cortado em `max` code points, sem partir um par substituto ao meio. */
export function cortarEmCodePoints(t: string, max: number): string {
  const cp = [...t];
  return cp.length <= max ? t : cp.slice(0, max).join('');
}
