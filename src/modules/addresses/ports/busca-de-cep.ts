/** O endereco de um CEP: quatro campos de texto, e nada mais. */
export interface EnderecoDoCep {
  /**
   * O logradouro. **Vazio quando o CEP e de cidade inteira** (CEP "geral") e nao de
   * uma rua -- e isso nao e erro, e o que aquele CEP significa.
   */
  readonly street: string;
  /** O bairro. Vazio pelo mesmo motivo de `street`. */
  readonly neighborhood: string;
  readonly city: string;
  /** A UF, duas letras maiusculas. */
  readonly state: string;
}

/** O desfecho de uma busca, decidido no servidor. */
export type RespostaDaBuscaDeCep =
  | { readonly desfecho: 'encontrado'; readonly endereco: EnderecoDoCep }
  /** O CEP nao existe em nenhuma das bases consultadas. */
  | { readonly desfecho: 'naoEncontrado' }
  /** Os servicos falharam, ou demoraram demais. */
  | { readonly desfecho: 'indisponivel' };

export interface BuscaDeCep {
  /** O endereco do CEP, ou o motivo de nao ter vindo. */
  buscar(cep: string): Promise<RespostaDaBuscaDeCep>;
}
