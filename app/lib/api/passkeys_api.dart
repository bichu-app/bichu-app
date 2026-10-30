import 'api_client.dart';
import 'auth_api.dart';
import 'modelos.dart';
import 'modelos_passkey.dart';

/// As operacoes de `/v1/auth/passkey` do contrato (BICHUS-301).
class PasskeysApi {
  const PasskeysApi(this._api);

  final ApiClient _api;

  /// `POST /auth/passkey/registration/options`.
  Future<OpcoesDeCadastroDePasskey> comecarCadastro() async {
    final json = await _api.post('/auth/passkey/registration/options');
    return OpcoesDeCadastroDePasskey.doJson(json);
  }

  /// `POST /auth/passkey/registration`.
  Future<Passkey> concluirCadastro(
    CredencialCadastrada credencial, {
    String? rotulo,
  }) async {
    final json = await _api.post(
      '/auth/passkey/registration',
      corpo: credencial.paraOContrato(rotulo: rotulo),
    );
    return Passkey.doJson(json);
  }

  /// `POST /auth/passkey/authentication/options`.
  Future<OpcoesDeEntradaPorPasskey> comecarEntrada() async {
    final json = await _api.post(
      '/auth/passkey/authentication/options',
      exigeToken: false,
    );
    return OpcoesDeEntradaPorPasskey.doJson(json);
  }

  /// `POST /auth/passkey/authentication`.
  Future<Sessao> concluirEntrada(
    CredencialAssinada credencial, {
    bool continuarConectado = AuthApi.sessaoPersistentePorPadrao,
  }) async {
    final json = await _api.post(
      '/auth/passkey/authentication',
      exigeToken: false,
      corpo: credencial.paraOContrato(
        continuarConectado: continuarConectado,
      ),
    );
    return Sessao.doJson(json);
  }

  /// `GET /auth/passkeys`. **EXIGE SESSAO.**
  Future<List<Passkey>> listar() async {
    final json = await _api.get('/auth/passkeys');
    final itens = json['items'];
    if (itens is! List) return const <Passkey>[];
    return itens
        .whereType<Map<String, dynamic>>()
        .map(Passkey.doJson)
        .toList();
  }

  /// `DELETE /auth/passkeys/{passkeyId}`.
  Future<void> revogar(String passkeyId) async {
    await _api.delete('/auth/passkeys/${Uri.encodeComponent(passkeyId)}');
  }
}
