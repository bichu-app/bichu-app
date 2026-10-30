/** Os quatro desfechos de avisar um aparelho, e nenhum deles é exceção. */
export type ResultadoDaEntrega =
  /** O transporte aceitou. É tudo o que se pode afirmar daqui. */
  | 'aceito'
  /** A linha sumiu, perdeu o token ou perdeu a permissão entre a lista e o envio. */
  | 'semEndereco'
  /** O token estava morto; o aparelho foi revogado agora. */
  | 'aparelhoSumiu'
  /** Falha do caminho. Não derruba o disparo: o próximo aparelho é tentado. */
  | 'falhou';

export interface AvisoDeVizinhanca {
  readonly aparelhoId: string;
  readonly nomeDoPet: string;
  /** O **código** da espécie (`dog`, `cat`, `other`), e não a palavra. */
  readonly especieCodigo: string | null;
  /**
   * O bairro, e o **teto** de precisão geográfica do aviso (critério 3 da
   * BICHUS-18).
   */
  readonly bairro: string | null;
  /** O `share_token`: a única chave do caso que sai daqui (ADR-0010, item 6). */
  readonly tokenPublico: string;
  readonly imagemUrl: string | undefined;
}

export interface EntregaDoAlerta {
  /** Avisa um aparelho. **Não estoura**: o desfecho é o retorno. */
  avisar(aviso: AvisoDeVizinhanca): Promise<ResultadoDaEntrega>;
}
