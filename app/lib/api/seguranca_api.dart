import 'api_client.dart';
import 'modelos_seguranca.dart';

/// As SEIS operacoes de bloquear e denunciar (`tags: [safety]` do contrato).
class SegurancaApi {
  const SegurancaApi(this._api);

  final ApiClient _api;

  /// `GET /v1/me/blocks` -- **a lista de quem EU bloqueei**.
  Future<PaginaDeBloqueados> bloqueados({int pagina = 1, int limite = 20}) async {
    final json = await _api.get(
      '/me/blocks',
      query: <String, String>{'page': '$pagina', 'limit': '$limite'},
    );
    return PaginaDeBloqueados.doJson(json);
  }

  /// `POST /v1/users/{userRef}/blocks`.
  Future<void> bloquear(String refDaPessoa) async {
    await _api.post('/users/$refDaPessoa/blocks');
  }

  /// `DELETE /v1/users/{userRef}/blocks`.
  Future<void> desbloquear(String refDaPessoa) async {
    await _api.delete('/users/$refDaPessoa/blocks');
  }

  /// `POST /v1/users/{userRef}/reports` -- a denuncia de PERFIL.
  Future<void> denunciarPerfil(String refDaPessoa, String motivo, {String? relato}) async {
    await _api.post('/users/$refDaPessoa/reports', corpo: _corpo(motivo, relato));
  }

  /// `POST /v1/photos/{photoRef}/reports` -- a denuncia de FOTO.
  Future<void> denunciarFoto(String chaveDaFoto, String motivo, {String? relato}) async {
    await _api.post('/photos/$chaveDaFoto/reports', corpo: _corpo(motivo, relato));
  }

  /// `POST /v1/publications/{publicationRef}/reports` -- a denuncia de
  /// PUBLICACAO, no proprio cartao.
  Future<void> denunciarPublicacao(String refDaPublicacao, String motivo, {String? relato}) async {
    await _api.post('/publications/$refDaPublicacao/reports', corpo: _corpo(motivo, relato));
  }

  static Map<String, dynamic> _corpo(String motivo, String? relato) {
    final limpo = relato?.trim();
    return <String, dynamic>{
      'reason': motivo,
      if (limpo != null && limpo.isNotEmpty) 'detail': limpo,
    };
  }
}
