/// Os textos do bloqueio por versao minima e do aviso brando.
library;

/// Os textos do portao de versao.
abstract final class TextosDaAtualizacao {

  /// O titulo. Fala do aplicativo, e nao da pessoa.
  static const String tituloDoBloqueio = 'Precisamos atualizar o Bichu';

  /// A consequencia, em uma frase.
  static const String corpoDoBloqueio =
      'Esta versao do aplicativo parou de funcionar. Atualize para continuar '
      'cuidando dos seus pets.';

  /// A frase que SUBSTITUI o botao quando nao ha loja configurada.
  static const String comoAtualizarSemLoja =
      'A atualizacao ainda nao e distribuida por loja de aplicativos. Peca a '
      'versao nova a quem te enviou o Bichu.';

  /// O rotulo do botao, quando ha destino.
  static const String irParaALoja = 'Atualizar agora';

  /// A faixa do aviso brando.
  static const String avisoDeVersaoNova =
      'Ha uma versao nova do Bichu, com correcoes e melhorias.';

  /// A acao do aviso brando, quando ha destino.
  static const String atualizar = 'Atualizar';

  /// Dispensar o aviso brando.
  static const String agoraNao = 'Agora nao';

  /// O que o leitor de tela anuncia ao abrir o bloqueio.
  static const String semanticaDoBloqueio =
      'Atualizacao necessaria. Esta tela nao pode ser fechada.';
}
