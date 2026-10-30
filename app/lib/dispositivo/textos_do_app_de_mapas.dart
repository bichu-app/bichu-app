/// A microcopia da saida para o app de mapas do aparelho, **numa fonte so**.
library;

/// Os textos da saida para o app de mapas.
abstract final class TextosDoAppDeMapas {
  /// O rotulo do toque que abre um ENDERECO POR EXTENSO no app de mapas.
  static const String rotuloDoEndereco = 'Abrir no mapa';

  /// O rotulo do botao que abre um PONTO (latitude e longitude) no app de
  /// mapas, sob a area de mapa estatico do encontro da Rede.
  static const String rotuloDoPonto = 'Abrir no app de mapas';

  /// Quando o app de mapas nao abre -- por qualquer motivo.
  static const String falhaAoAbrir = 'Não conseguimos abrir o app de mapas.';
}
