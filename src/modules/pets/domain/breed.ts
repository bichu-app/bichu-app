/** Os únicos códigos que aceitam texto livre ao lado. */
export const CODIGOS_OUTRO = ['outro_dog', 'outro_cat', 'outro_other'] as const;

export type CodigoOutro = (typeof CODIGOS_OUTRO)[number];

export function ehCodigoOutro(codigo: string | null | undefined): codigo is CodigoOutro {
  return codigo !== null && codigo !== undefined && (CODIGOS_OUTRO as readonly string[]).includes(codigo);
}

export interface RacaInformada {
  readonly breedCode: string | null;
  readonly breedFreeText: string | null;
}

export type ProblemaDaRaca =
  /** Texto livre com raça da lista: duas respostas para uma pergunta. */
  | 'texto_livre_com_codigo_da_lista'
  /** Texto livre sem código nenhum: o `CHECK` do banco também recusa. */
  | 'texto_livre_sem_codigo'
  /** `outro_*` sem texto: o cadastro perde a única descrição que teria. */
  | 'codigo_outro_sem_texto';

/** Confere a combinação. Devolve `null` quando está válida. */
export function conferirRaca(raca: RacaInformada): ProblemaDaRaca | null {
  const temTexto = raca.breedFreeText !== null && raca.breedFreeText.trim() !== '';

  if (temTexto && raca.breedCode === null) return 'texto_livre_sem_codigo';
  if (temTexto && !ehCodigoOutro(raca.breedCode)) return 'texto_livre_com_codigo_da_lista';
  if (!temTexto && ehCodigoOutro(raca.breedCode)) return 'codigo_outro_sem_texto';
  return null;
}

/** O rótulo pronto para a tela. */
export function rotuloDaRaca(
  raca: RacaInformada,
  rotuloDaLista: string | null | undefined,
): string | null {
  if (ehCodigoOutro(raca.breedCode)) {
    const texto = raca.breedFreeText?.trim();
    return texto !== undefined && texto !== '' ? texto : null;
  }
  return rotuloDaLista ?? null;
}
