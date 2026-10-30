import 'api_client.dart';

/// A duvida que o tutor manda pelo botao `Ajuda` do menu do usuario.
class AjudaApi {
  const AjudaApi(this._api);

  final ApiClient _api;

  /// `POST /v1/me/help-requests` -- grava a duvida na fila do painel.
  Future<void> mandarDuvida(String assunto, String texto) async {
    await _api.post(
      '/me/help-requests',
      corpo: <String, dynamic>{'subject': assunto.trim(), 'body': texto.trim()},
    );
  }
}
