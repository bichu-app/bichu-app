import 'api_client.dart';
import 'falhas.dart';
import 'modelos_rede.dart';

/// As operacoes da secao `Rede` que o app consome (`tags: [network]`).
class RedeApi {
  const RedeApi(this._api);

  final ApiClient _api;

  /// O caminho de `createNetworkEvent`, exposto para a fila offline.
  static const String caminhoDeCriacao = '/network/events';

  /// O corpo de `createNetworkEvent`, montado num lugar so.
  static Map<String, dynamic> corpoDeCriacao({
    required String titulo,
    required String resumo,
    required String nomeDoLugar,
    required String bairro,
    required String cidade,
    required String uf,
    required DateTime comecaEm,
    DateTime? terminaEm,
    String? observacoes,
    List<String>? imagens,
  }) {
    return <String, dynamic>{
      'title': titulo,
      'summary': resumo,
      'place': <String, dynamic>{
        'place_name': nomeDoLugar,
        'neighborhood': bairro,
        'city': cidade,
        'state': uf,
      },
      'starts_at': comecaEm.toUtc().toIso8601String(),
      if (terminaEm != null) 'ends_at': terminaEm.toUtc().toIso8601String(),
      if (observacoes != null && observacoes.isNotEmpty)
        'notes': observacoes,
      // **`image_upload_ids`, e NUNCA `cover_image`.** O aplicativo novo manda
      // a lista inclusive com uma imagem so; mandar os dois e `400`
      // (`code: cover_and_images_both_sent`), porque duas formas de dizer qual
      // e a capa no mesmo corpo e o defeito, e nao uma conveniencia. Quem e a
      // capa e a POSICAO na lista.
      //
      // `cover_image` continua no contrato porque o APK que esta no aparelho
      // agora e o unico que o manda -- tira-lo seria
      // `request-property-removed`. Esta funcao e do aplicativo NOVO.
      //
      // **SO QUANDO HA PELO MENOS UMA, e nunca `[]` nem `null`**: o esquema e
      // `minItems: 1`.
      if (imagens != null && imagens.isNotEmpty) 'image_upload_ids': imagens,
    };
  }

  /// `POST /v1/media/network-event-cover-intents`
  /// (`createNetworkEventCoverUploadIntent`), com conta.
  Future<Map<String, dynamic>> intencaoDeCapaDoEncontro({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) {
    return _api.post(
      '/media/network-event-cover-intents',
      corpo: <String, dynamic>{
        'content_type': tipoDeConteudo,
        'byte_size': tamanhoEmBytes,
      },
    );
  }

  /// `POST /v1/network/events` (`createNetworkEvent`), com conta.
  Future<EncontroPublico> criar(
    Map<String, dynamic> corpo, {
    String? idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDeCriacao,
      corpo: corpo,
      idempotencyKey: idempotencyKey,
    );
    return _ler(() {
      final encontro = EncontroDaRede.doJson(json);
      if (encontro is! EncontroPublico) {
        throw const FormatException(
          'createNetworkEvent devolveu encontro que nao e publico; o encontro '
          'da comunidade e sempre publico pelo contrato',
        );
      }
      return encontro;
    });
  }

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
  Future<PaginaPorPerto> listarPorPerto(Map<String, String> query) async {
    final json = await _api.get('/network/events/nearby', query: query);
    return _ler(() => PaginaPorPerto.doJson(json));
  }

  /// `GET /v1/network/events/{eventSlug}` (`getNetworkEvent`).
  Future<EncontroDaRede> detalhar(String slug) async {
    final json = await _api.get(_caminho(slug), exigeToken: false);
    return _ler(() => EncontroDaRede.doJson(json));
  }

  /// `GET /v1/network/events/{eventSlug}/location` (`getNetworkEventLocation`),
  /// com conta.
  Future<LocalizacaoDoEncontro> localizacao(String slug) async {
    final json = await _api.get('${_caminho(slug)}/location');
    return _ler(() => LocalizacaoDoEncontro.doJson(json));
  }

  /// `GET /v1/network/events/{eventSlug}/private-details`
  /// (`getNetworkEventPrivateDetails`).
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
  /// (`requestToJoinNetworkEvent`).
  Future<PedidoDeParticipacao> pedir(String slug) async {
    final json = await _api.post('${_caminho(slug)}/join-request');
    return _ler(() => PedidoDeParticipacao.doJson(json));
  }

  /// `GET /v1/network/events/{eventSlug}/join-request`
  /// (`getMyNetworkEventJoinRequest`).
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

  /// `POST /v1/network/events/{eventSlug}/cancellation` (`cancelNetworkEvent`),
  /// com conta.
  Future<EncontroPublico> cancelar(
    String slug, {
    required String ifMatch,
    required String nota,
  }) async {
    final json = await _api.post(
      '${_caminho(slug)}/cancellation',
      corpo: <String, dynamic>{'note': nota},
      ifMatch: ifMatch,
    );
    return _ler(() {
      final encontro = EncontroDaRede.doJson(json);
      if (encontro is! EncontroPublico) {
        throw const FormatException(
          'cancelNetworkEvent devolveu encontro que nao e publico; o encontro '
          'da comunidade e sempre publico pelo contrato',
        );
      }
      return encontro;
    });
  }

  /// `GET /v1/network/my-events` (`listMyNetworkEvents`), com conta.
  Future<PaginaDeMeusEncontros> meusEncontros({int pagina = 1, int limite = 20}) async {
    final json = await _api.get(
      '/network/my-events',
      query: <String, String>{'page': '$pagina', 'limit': '$limite'},
    );
    return _ler(() => PaginaDeMeusEncontros.doJson(json));
  }

  /// `GET /v1/network/my-events/{eventSlug}` (`getMyNetworkEvent`), com conta.
  Future<MeuEncontroComVersao?> meuEncontro(String slug) async {
    try {
      final resposta = await _api.getComEtag(_caminhoDoMeu(slug));
      return _ler<MeuEncontroComVersao>(
        () => MeuEncontroComVersao(
          encontro: MeuEncontro.doJson(resposta.corpo),
          etag: resposta.etag,
        ),
      );
    } on FalhaDaApi catch (falha) {
      if (falha.problem.status == 404) return null;
      rethrow;
    }
  }

  /// `GET /v1/network/join-requests` (`listMyNetworkEventJoinRequests`).
  Future<PaginaDeMeusPedidos> meusPedidos(Map<String, String> query) async {
    final json = await _api.get('/network/join-requests', query: query);
    return _ler(() => PaginaDeMeusPedidos.doJson(json));
  }

  /// Le uma resposta, e resposta fora do contrato sai como `FormatException`.
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

  /// O caminho da leitura do DONO.
  static String _caminhoDoMeu(String slug) =>
      '/network/my-events/${Uri.encodeComponent(slug)}';
}
