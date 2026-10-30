/** O rótulo de área que sai em **superfície pública**: "Bairro, Cidade". */
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
