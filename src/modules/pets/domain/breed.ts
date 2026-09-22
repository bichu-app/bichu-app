/**
 * A raça em dois campos.
 *
 * `breed_code` **compara**; `breed_free_text` **descreve**. São dois campos
 * porque são duas funções, e juntá-las obriga a escolher entre uma lista que
 * mente e um cruzamento que não cruza:
 *
 * - Lista fechada só: "Akita" vira "SRD" na hora do cadastro, e a ficha passa a
 *   descrever outro animal.
 * - Texto livre só: "vira-lata", "vira lata", "SRD" e "sem raça definida" são
 *   quatro textos para o mesmo animal. O cruzamento de perdido e achado deixa de
 *   funcionar **exatamente no caso mais comum do Brasil**, que é o único caso em
 *   que ele precisava funcionar.
 *
 * A regra que sustenta isso é uma só, e está no banco (`pets_texto_livre_so_com_
 * codigo_outro`) e aqui: **texto livre só é aceito com código `outro_*`**.
 * "Shih Tzu" no código e "poodle" no texto são duas respostas para a mesma
 * pergunta, e a divergência não tem como ser resolvida depois — nem por quem
 * lê a ficha, nem pelo cruzamento, nem pelo tutor seis meses adiante.
 *
 * A validação vive aqui, e não só na restrição do banco, porque a restrição
 * responde com violação de `CHECK` — um 500 — e a pessoa precisa de
 * `validation-failed` com o nome do campo.
 */

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

/**
 * Confere a combinação. Devolve `null` quando está válida.
 *
 * `codigo_outro_sem_texto` é o caso menos óbvio dos três e não é rigor: um pet
 * com `outro_dog` e sem texto é um cadastro que diz "a raça não está na lista" e
 * não diz qual é. Na ficha, no cartaz e no perfil público ele aparece sem raça
 * nenhuma — e quem cadastrou escolheu "outra" justamente para descrevê-la.
 */
export function conferirRaca(raca: RacaInformada): ProblemaDaRaca | null {
  const temTexto = raca.breedFreeText !== null && raca.breedFreeText.trim() !== '';

  if (temTexto && raca.breedCode === null) return 'texto_livre_sem_codigo';
  if (temTexto && !ehCodigoOutro(raca.breedCode)) return 'texto_livre_com_codigo_da_lista';
  if (!temTexto && ehCodigoOutro(raca.breedCode)) return 'codigo_outro_sem_texto';
  return null;
}

/**
 * O rótulo pronto para a tela.
 *
 * O cliente exibe este campo e **não precisa saber qual dos dois caminhos o
 * gerou** — é o que o contrato promete em `Pet.breed_label`. Resolver no
 * servidor é o que impede três telas (ficha, cartaz, perfil público) de
 * implementarem a mesma escolha de formas ligeiramente diferentes.
 */
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
