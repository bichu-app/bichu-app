/** Os tres numeros de uma versao, ja lidos. */
export interface Versao {
  readonly maior: number;
  readonly menor: number;
  readonly correcao: number;
}

/**
 * Teto por componente, e ele e o MESMO do `pattern` do contrato
 * (`[1-9][0-9]{0,3}`): quatro digitos.
 */
const MAIOR_COMPONENTE = 9999;

/** Le `MAIOR.MENOR.CORRECAO`. */
export function lerVersao(bruta: string | null | undefined): Versao | undefined {
  if (typeof bruta !== 'string') return undefined;
  const partes = bruta.split('.');
  if (partes.length !== 3) return undefined;
  const numeros: number[] = [];
  for (const parte of partes) {
    if (!/^(?:0|[1-9][0-9]{0,3})$/.test(parte)) return undefined;
    const numero = Number(parte);
    if (!Number.isInteger(numero) || numero < 0 || numero > MAIOR_COMPONENTE) return undefined;
    numeros.push(numero);
  }
  return { maior: numeros[0] ?? 0, menor: numeros[1] ?? 0, correcao: numeros[2] ?? 0 };
}

/** Compara duas versoes ja lidas. */
export function compararLidas(a: Versao, b: Versao): number {
  if (a.maior !== b.maior) return a.maior - b.maior;
  if (a.menor !== b.menor) return a.menor - b.menor;
  return a.correcao - b.correcao;
}

/** Compara duas versoes em texto. */
export function compararVersoes(
  a: string | null | undefined,
  b: string | null | undefined,
): number | undefined {
  const lidaA = lerVersao(a);
  const lidaB = lerVersao(b);
  if (lidaA === undefined || lidaB === undefined) return undefined;
  return compararLidas(lidaA, lidaB);
}
