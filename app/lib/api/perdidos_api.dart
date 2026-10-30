import 'api_client.dart';
import 'modelos_perdido.dart';

/// A operação pública de perdidos do contrato (`tags: [public]`).
class PerdidosApi {
  const PerdidosApi(this._api);

  final ApiClient _api;

  /// O caminho de `listPublicLostPets`, relativo a `/v1`.
  static const String caminho = '/public/lost-pets';

  /// `GET /public/lost-pets` (`listPublicLostPets`).
  Future<PaginaDePerdidos> listar(RecorteDePerdidos recorte) async {
    final json = await _api.get(
      caminho,
      query: recorte.query,
      exigeToken: false,
    );
    return PaginaDePerdidos.doJson(json);
  }

  /// O caminho de `getPublicLostCase`, relativo a `/v1`.
  static String caminhoDoCaso(String shareToken) =>
      '/public/lost-cases/${Uri.encodeComponent(shareToken)}';

  /// `GET /public/lost-cases/{shareToken}` (`getPublicLostCase`).
  Future<CasoPerdidoPublico> buscarCaso(String shareToken) async {
    final json = await _api.get(caminhoDoCaso(shareToken));
    return CasoPerdidoPublico.doJson(json);
  }
}
