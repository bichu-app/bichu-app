import 'api_client.dart';
import 'modelos_pessoa.dart';

/// As operações das pessoas que não são a própria conta (`tags: [people]` do
/// contrato): o **perfil** e a **busca**.
class PessoasApi {
  const PessoasApi(this._api);

  final ApiClient _api;

  /// `getPersonProfile`.
  Future<PerfilDePessoa> perfil(String apelido) async {
    return PerfilDePessoa.doJson(await _api.get('/people/$apelido'));
  }

  /// O piso de caracteres da busca, **e ele não é gosto**.
  static const int minimoDaBusca = 3;

  /// `searchPeople` — **e ela NÃO é chamada abaixo de [minimoDaBusca]**.
  Future<PaginaDeBuscaDePessoas> buscar(
    String termo, {
    int pagina = 1,
    int limite = 20,
  }) async {
    final limpo = termo.trim();
    if (limpo.length < minimoDaBusca) return PaginaDeBuscaDePessoas.semBusca;
    final json = await _api.get(
      '/people',
      query: <String, String>{
        'q': limpo,
        'page': '$pagina',
        'limit': '$limite',
      },
    );
    return PaginaDeBuscaDePessoas.doJson(json);
  }
}
