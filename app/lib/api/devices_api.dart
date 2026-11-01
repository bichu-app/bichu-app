import '../dispositivo/avisos.dart';
import 'api_client.dart';

/// `POST /v1/me/devices` do contrato.
class DevicesApi {
  const DevicesApi(this._api);

  final ApiClient _api;

  /// Registra ou atualiza este aparelho.
  Future<void> registrar({
    required PlataformaDeAviso plataforma,
    required PermissaoDeAviso permissao,
    String? pushToken,
  }) async {
    await _api.post(
      '/me/devices',
      corpo: <String, dynamic>{
        'platform': _plataformaNoContrato(plataforma),
        'push_permission': _permissaoNoContrato(permissao),
        'push_token': pushToken,
      },
    );
  }

  static String _plataformaNoContrato(PlataformaDeAviso plataforma) {
    switch (plataforma) {
      case PlataformaDeAviso.android:
        return 'android';
      case PlataformaDeAviso.ios:
        return 'ios';
    }
  }

  static String _permissaoNoContrato(PermissaoDeAviso permissao) {
    switch (permissao) {
      case PermissaoDeAviso.concedida:
        return 'granted';
      case PermissaoDeAviso.negada:
        return 'denied';
      case PermissaoDeAviso.naoPedida:
      case PermissaoDeAviso.indisponivel:
        return 'not_asked';
    }
  }
}
