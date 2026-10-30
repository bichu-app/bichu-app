/** Nome da variável de ambiente, que é também o identificador do segredo. */
export type NomeDeSegredo = string;

/** A falha que todo adaptador precisa produzir, em vez do erro do provedor. */
export class SegredoIndisponivelError extends Error {
  readonly nome: NomeDeSegredo;

  constructor(nome: NomeDeSegredo, motivo: string) {
    super(`Segredo de runtime indisponível: ${nome}. ${motivo}`);
    this.name = 'SegredoIndisponivelError';
    this.nome = nome;
  }
}

export interface SecretProvider {
  /** O valor, verbatim, ou `SegredoIndisponivelError` com o nome dentro. */
  obter(nome: NomeDeSegredo): Promise<string>;

  /** De onde os valores vieram, para o log de subida. */
  readonly fonte: string;
}
