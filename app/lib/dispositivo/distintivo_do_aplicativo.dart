/// O CAMINHO DO NUMERO NO ICONE DO APLICATIVO -- construido, e INERTE.
library;

/// O que aconteceu com o pedido de pintar o numero no icone.
enum ResultadoDoDistintivo {
  /// Pintado. **Nenhuma implementacao devolve isto hoje**, e nao e descuido:
  /// ver a lista de quatro no cabecalho deste arquivo.
  aplicado,

  /// O caminho recebeu o numero e **nao pintou**.
  naoAplicado,
}

/// A porta. Uma implementacao, e ela nao acende.
abstract interface class DistintivoDoAplicativo {
  /// Recebe a contagem, devolve o que aconteceu de verdade.
  ResultadoDoDistintivo definir(int naoLidas);
}

/// A implementacao de hoje: recebe o numero e **nao faz nada com ele**.
final class DistintivoInerte implements DistintivoDoAplicativo {
  const DistintivoInerte();

  @override
  ResultadoDoDistintivo definir(int naoLidas) => ResultadoDoDistintivo.naoAplicado;
}
