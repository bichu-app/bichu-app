import 'api_client.dart';
import 'falhas.dart';
import 'modelos_rede.dart';

/// As operacoes da secao `Rede` que o app consome (`tags: [network]`).
///
/// Nenhuma escrita de encontro: criar, editar e cancelar sao do backoffice
/// (`/admin/network/events`, ADR-0027). O que o app escreve e so o pedido de
/// participacao da propria conta, e a desistencia dele.
///
/// ## Quem leva token
///
/// - `listNetworkEvents` e `getNetworkEvent`: **sem token** (`exigeToken:
///   false`). O corpo e identico para qualquer chamador (ADR-0021); anexar a
///   sessao so a exporia a uma rota que nao precisa dela.
/// - `listNearbyNetworkEvents`, `getNetworkEventLocation`,
///   `getNetworkEventPrivateDetails` e as tres do pedido: **com token**, sem
///   alternativa vazia no contrato. Quem chama so chama com a pessoa logada;
///   sem sessao, a tela nem tenta, e por isso nao ha mapa para quem nao entrou.
///
/// ## Nenhuma chamada devolve lista vazia quando quebra
///
/// Falha sobe como `FalhaDeChamada`. Quem chama distingue "a Rede ainda nao
/// tem encontro" de "nao consegui perguntar". As excecoes sao os 404 que o
/// contrato declara como resposta normal ("sem pedido", "sem conteudo para
/// esta conta"), e so elas viram nulo aqui.
class RedeApi {
  const RedeApi(this._api);

  final ApiClient _api;

  /// `GET /v1/network/events` (`listNetworkEvents`).
  Future<PaginaDaRede> listar(Map<String, String> query) async {
    final json = await _api.get(
      '/network/events',
      query: query,
      exigeToken: false,
    );
    return _ler(() => PaginaDaRede.doJson(json));
  }

  /// `GET /v1/network/events/nearby` (`listNearbyNetworkEvents`).
  ///
  /// A posicao nao vai na requisicao: o servidor usa a regiao ja cadastrada
  /// (ADR-0027 12.14). Este metodo nao recebe coordenada, e o GPS do aparelho
  /// nao participa de nada na `Rede`.
  Future<PaginaPorPerto> listarPorPerto(Map<String, String> query) async {
    final json = await _api.get('/network/events/nearby', query: query);
    return _ler(() => PaginaPorPerto.doJson(json));
  }

  /// `GET /v1/network/events/{eventSlug}` (`getNetworkEvent`).
  Future<EncontroDaRede> detalhar(String slug) async {
    final json = await _api.get(_caminho(slug), exigeToken: false);
    return _ler(() => EncontroDaRede.doJson(json));
  }

  /// `GET /v1/network/events/{eventSlug}/location`
  /// (`getNetworkEventLocation`), com conta.
  Future<LocalizacaoDoEncontro> localizacao(String slug) async {
    final json = await _api.get('${_caminho(slug)}/location');
    return _ler(() => LocalizacaoDoEncontro.doJson(json));
  }

  /// `GET /v1/network/events/{eventSlug}/private-details`
  /// (`getNetworkEventPrivateDetails`).
  ///
  /// Nulo no 404, que o contrato usa para "a conta nao foi aprovada" com o
  /// mesmo corpo de "nao existe": nao ha corpo menor para quem nao foi
  /// aprovado, e a tela fica com o teaser.
  Future<DetalhesDoPrivado?> detalhesDoPrivado(String slug) async {
    try {
      final json = await _api.get('${_caminho(slug)}/private-details');
      return _ler<DetalhesDoPrivado>(() => DetalhesDoPrivado.doJson(json));
    } on FalhaDaApi catch (falha) {
      if (falha.problem.status == 404) return null;
      rethrow;
    }
  }

  /// `POST /v1/network/events/{eventSlug}/join-request`
  /// (`requestToJoinNetworkEvent`). Sem corpo. Idempotente no servidor.
  Future<PedidoDeParticipacao> pedir(String slug) async {
    final json = await _api.post('${_caminho(slug)}/join-request');
    return _ler(() => PedidoDeParticipacao.doJson(json));
  }

  /// `GET /v1/network/events/{eventSlug}/join-request`
  /// (`getMyNetworkEventJoinRequest`). Nulo no 404: sem pedido, inclusive o
  /// desistido.
  Future<PedidoDeParticipacao?> meuPedido(String slug) async {
    try {
      final json = await _api.get('${_caminho(slug)}/join-request');
      return _ler<PedidoDeParticipacao>(
        () => PedidoDeParticipacao.doJson(json),
      );
    } on FalhaDaApi catch (falha) {
      if (falha.problem.status == 404) return null;
      rethrow;
    }
  }

  /// `DELETE /v1/network/events/{eventSlug}/join-request`
  /// (`withdrawNetworkEventJoinRequest`).
  Future<PedidoDeParticipacao> desistir(String slug) async {
    final json = await _api.delete('${_caminho(slug)}/join-request');
    return _ler(() => PedidoDeParticipacao.doJson(json));
  }

  /// `GET /v1/network/join-requests` (`listMyNetworkEventJoinRequests`).
  Future<PaginaDeMeusPedidos> meusPedidos(Map<String, String> query) async {
    final json = await _api.get('/network/join-requests', query: query);
    return _ler(() => PaginaDeMeusPedidos.doJson(json));
  }

  /// Le uma resposta, e resposta fora do contrato sai como `FormatException`.
  ///
  /// Os modelos conferem tipo antes de ler, mas um campo de tipo inesperado
  /// ainda pode estourar `TypeError` num lugar que ninguem previu. As telas
  /// tratam `FormatException` como "resposta fora do contrato" (estado de
  /// falha com `Atualizar`); um `TypeError` escaparia desse tratamento e
  /// deixaria a tela girando.
  static T _ler<T>(T Function() ler) {
    try {
      return ler();
    } on TypeError catch (erro) {
      throw FormatException('resposta da Rede fora do contrato: $erro');
    }
  }

  /// O `slug` vem da resposta do servidor: vai codificado, como os ids das
  /// outras rotas do app.
  static String _caminho(String slug) =>
      '/network/events/${Uri.encodeComponent(slug)}';
}
