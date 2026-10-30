import 'api_client.dart';
import 'modelos_conexao.dart';

/// As operações da conexão entre pessoas que o app consome (`tags:
/// [connections]`).
class ConexoesApi {
  const ConexoesApi(this._api);

  final ApiClient _api;

  static const String caminhoDoPedido = '/connections';

  /// `requestConnection`. **O corpo é um convite.**
  Future<Conexao> pedir({
    required String tokenDoConvite,
    required String idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDoPedido,
      corpo: <String, dynamic>{'invite_token': tokenDoConvite},
      idempotencyKey: idempotencyKey,
    );
    return Conexao.doJson(json);
  }

  /// `requestConnection` **pela aba `Usuários`**: o corpo é um apelido.
  Future<Conexao> pedirPorApelido({
    required String apelido,
    required String idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDoPedido,
      corpo: <String, dynamic>{'handle': apelido},
      idempotencyKey: idempotencyKey,
    );
    return Conexao.doJson(json);
  }

  /// `listMyConnections`: **as PRÓPRIAS conexões aceitas** (cliente,
  /// 22/10/2026).
  Future<PaginaDeConexoes> listarConexoes({int pagina = 1, int limite = 20}) async {
    final json = await _api.get(
      '/connections',
      query: <String, String>{'page': '$pagina', 'limit': '$limite'},
    );
    return PaginaDeConexoes.doJson(json);
  }

  /// `listMyConnectionRequests`.
  Future<PaginaDePedidosDeConexao> pedidos({
    CaixaDePedidos caixa = CaixaDePedidos.recebidos,
    int pagina = 1,
    int limite = 20,
  }) async {
    final json = await _api.get(
      '/connections/requests',
      query: <String, String>{
        'direction': caixa.codigo,
        'page': '$pagina',
        'limit': '$limite',
      },
    );
    return PaginaDePedidosDeConexao.doJson(json);
  }

  /// `getMyConnectionSummary`.
  Future<ResumoDeConexoes> resumo() async {
    return ResumoDeConexoes.doJson(await _api.get('/connections/summary'));
  }

  /// `acceptConnection`. **Sem aceite não há conexão.**
  Future<Conexao> aceitar(String ref) async {
    return Conexao.doJson(await _api.post('/connections/$ref/acceptance'));
  }

  /// `endConnection`: recusar, cancelar ou desfazer — **as três**.
  Future<void> encerrar(String ref) async {
    await _api.delete('/connections/$ref');
  }
}
