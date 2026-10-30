import 'api_client.dart';
import 'modelos_loja.dart';

/// `GET /v1/store/items` (`listStoreItems`) — a vitrine da `Loja`.
class LojaApi {
  const LojaApi(this._api);

  final ApiClient _api;

  /// Uma pagina da vitrine, com o [recorte] pedido.
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

  /// `GET /v1/store/items/{itemSlug}` (`getStoreItem`) — o detalhe do produto.
  Future<DetalheDoProduto> detalhar(String slug) async {
    final json = await _api.get(
      '/store/items/${Uri.encodeComponent(slug)}',
      exigeToken: false,
    );
    return DetalheDoProduto.doJson(json);
  }

  /// `GET /v1/store/taxonomy` (`getStoreTaxonomy`) — o vocabulario dos DOIS
  /// niveis da categoria.
  Future<TaxonomiaDaLoja> taxonomia() async {
    final json = await _api.get('/store/taxonomy', exigeToken: false);
    return TaxonomiaDaLoja.doJson(json);
  }
}
