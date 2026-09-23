import 'api_client.dart';
import 'modelos_loja.dart';

/// `GET /v1/store/items` (`listStoreItems`) — a vitrine da `Loja`.
///
/// **Ela NAO exige conta, e a divergencia em relacao a [DiretorioApi] e
/// deliberada.** `Perto` exige conta porque `phone_e164` e `distance_m` sao o
/// conteudo util dela, e o portao de contrato publico reprova os dois em
/// operacao alcancavel sem conta. A Loja nao tem nenhum dos dois: um item e
/// titulo, resumo, imagem, preco de referencia e o link publico do parceiro,
/// tudo ja publicado no site dele.
///
/// O criterio 24 da BICHUS-185 pede a operacao publica por extenso, e a
/// BICHUS-189 repete o motivo: a Loja e navegavel deslogado. Por isso [listar]
/// passa `exigeToken: false` -- uma vitrine que so abre depois de criar conta
/// e o oposto do que uma vitrine faz.
///
/// ## A busca EXISTE aqui, e existe no servidor
///
/// `q` entrou no contrato desta rota, entao a tela declara
/// `AlcanceDaBusca.servidor`. A diferenca em relacao a `Perto` nao e de
/// capricho: la o parametro nao existe, e filtrar em memoria os itens da
/// pagina seria uma busca que funciona com 10 registros e mente com 200.
/// **Nenhuma dimensao nova de teto entrou por causa disto** -- a rota conta por
/// `ip`, que ja e dimensao generica.
class LojaApi {
  const LojaApi(this._api);

  final ApiClient _api;

  /// Uma pagina da vitrine, com o [recorte] pedido.
  ///
  /// **Nao trata falha e nao devolve pagina vazia quando a chamada quebra.**
  /// Quem chama precisa distinguir "a vitrine esta vazia" de "nao consegui
  /// perguntar": um `catch` que devolvesse lista vazia produziria o estado
  /// vazio que parece sucesso.
  Future<PaginaDaLoja> listar([
    RecorteDaLoja recorte = const RecorteDaLoja(),
  ]) async {
    final json = await _api.get(
      '/store/items',
      query: recorte.query,
      exigeToken: false,
    );
    return PaginaDaLoja.doJson(json);
  }
}
