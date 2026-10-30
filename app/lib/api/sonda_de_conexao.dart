import 'falhas.dart';
import 'api_client.dart';

/// A SONDA DA ABERTURA: *da para falar com o servidor agora?*
class SondaDeConexao {
  const SondaDeConexao(this._api);

  final ApiClient _api;

  static const String caminho = '/health';

  /// `true` quando ha um servidor do outro lado.
  Future<bool> servidorRespondeu() async {
    try {
      await _api.get(caminho, exigeToken: false);
      return true;
    } on FalhaDeConexao {
      return false;
    } on FalhaDeTempo {
      return false;
    } on FalhaDaApi catch (falha) {
      return falha.problem.status < 500;
    } on Object {
      return true;
    }
  }
}
