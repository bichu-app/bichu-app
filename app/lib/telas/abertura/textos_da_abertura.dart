/// Os textos do recado de abertura sem conexao.
library;

/// Os textos da abertura sem conexao.
abstract final class TextosDaAbertura {
  /// O titulo. **Nao afirma de quem e a culpa**, porque a sonda nao sabe: sem
  /// internet no aparelho e servidor fora chegam aqui pelo mesmo caminho (ver
  /// `SondaDeConexao.servidorRespondeu`).
  static const String tituloSemConexao = 'Não conseguimos abrir o Bichu';

  /// O QUE FAZER, e so isso (cliente, 28/10/2026).
  static const String corpoSemConexao =
      'Confira sua conexão com a internet e tente de novo.';

  /// A acao primaria: perguntar outra vez.
  static const String tentarDeNovo = 'Tentar de novo';

  /// A SAIDA, e ela nao e enfeite.
  static const String seguirSemInternet = 'Usar sem internet';

  /// O que o leitor de tela anuncia ao abrir o recado.
  static const String semanticaSemConexao =
      'Não foi possível falar com o servidor. Você pode tentar de novo ou '
      'seguir usando o aplicativo sem internet.';
}
