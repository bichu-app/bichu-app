/** O menor termo que o índice trigrama atende. */
export const MINIMO_DE_CARACTERES_DA_BUSCA = 3;

/** O termo aparado, **ou `undefined` quando não há busca a fazer**. */
export function termoDeBusca(bruto: string | undefined): string | undefined {
  if (bruto === undefined) return undefined;
  const aparado = bruto.trim();
  if (aparado.length < MINIMO_DE_CARACTERES_DA_BUSCA) return undefined;
  return aparado;
}
