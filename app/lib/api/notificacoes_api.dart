import 'api_client.dart';
import 'modelos_notificacao.dart';

/// As SEIS operacoes `tags: [me]` da CAIXA DE NOTIFICACOES, mais a leitura do
/// COMUNICADO -- a pagina intermediaria do unico tipo sem destino natural.
class NotificacoesApi {
  const NotificacoesApi(this._api);

  final ApiClient _api;

  static const String _caminho = '/me/notifications';

  /// O teto de `limit` no contrato, e o default da pagina.
  static const int tamanhoDaPagina = 30;

  /// `GET /v1/me/notifications` (`listNotifications`).
  Future<PaginaDaCaixa> listar({
    int pagina = 1,
    int tamanho = tamanhoDaPagina,
  }) async {
    final json = await _api.get(
      _caminho,
      query: <String, String>{'page': '$pagina', 'limit': '$tamanho'},
    );
    return PaginaDaCaixa.doJson(json);
  }

  /// `GET /v1/me/notifications/count` (`getNotificationCount`) -- o numero do
  /// sino.
  Future<ContagemDeAvisos> contar() async {
    final json = await _api.get('$_caminho/count');
    return ContagemDeAvisos.doJson(json);
  }

  /// `POST /v1/me/notifications/seen` (`markNotificationsListSeen`) -- a lista
  /// foi aberta.
  Future<void> marcarListaVista() async {
    await _api.post('$_caminho/seen');
  }

  /// `POST /v1/me/notifications/read-all` (`markAllNotificationsRead`).
  Future<int> marcarTodasComoLidas() async {
    final json = await _api.post('$_caminho/read-all');
    return json['marked'] as int? ?? 0;
  }

  /// `POST /v1/me/notifications/{notificationRef}/read`
  /// (`markNotificationRead`) -- o item foi aberto.
  Future<void> marcarComoLido(String ref) async {
    await _api.post('$_caminho/${Uri.encodeComponent(ref)}/read');
  }

  /// `POST /v1/me/notifications/{notificationRef}/dismiss`
  /// (`dismissNotification`) -- o "x" da linha, pedido pelo cliente em
  /// 20/10/2026.
  Future<void> dispensar(String ref) async {
    await _api.post('$_caminho/${Uri.encodeComponent(ref)}/dismiss');
  }

  /// `GET /v1/me/broadcasts/{broadcastRef}` (`getMyBroadcast`) -- o comunicado
  /// COM O CORPO.
  Future<ComunicadoDoBichu> buscarComunicado(String ref) async {
    final json = await _api.get('/me/broadcasts/${Uri.encodeComponent(ref)}');
    return ComunicadoDoBichu.doJson(json);
  }
}
