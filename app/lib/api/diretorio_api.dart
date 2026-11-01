import '../formato/cep.dart';
import 'api_client.dart';
import 'modelos_diretorio.dart';

/// `GET /v1/directory/entries` (`listDirectoryEntries`) — o diretorio de
/// `Perto`.
class DiretorioApi {
  const DiretorioApi(this._api);

  final ApiClient _api;

  /// Uma pagina do diretorio, com o [recorte] pedido.
  Future<PaginaDoDiretorio> listar([
    RecorteDoDiretorio recorte = const RecorteDoDiretorio(),
  ]) async {
    final json = await _api.get('/directory/entries', query: recorte.query);
    return PaginaDoDiretorio.doJson(json);
  }

  /// Uma pagina do diretorio **SEM CONTA** (`listPublicDirectoryEntries`).
  Future<PaginaDoDiretorio> listarPublico([
    RecorteDoDiretorio recorte = const RecorteDoDiretorio(),
  ]) async {
    final json = await _api.get(
      '/public/directory-entries',
      query: recorte.queryPublica,
      exigeToken: false,
    );
    return PaginaDoDiretorio.doJson(json);
  }

  /// O caminho de `suggestDirectoryEntry`, exposto para a fila offline.
  static const String caminhoDaSugestao = '/directory/suggestions';

  /// `POST /v1/media/directory-suggestion-logo-intents`
  /// (`createDirectorySuggestionLogoUploadIntent`), com conta.
  Future<Map<String, dynamic>> intencaoDeLogotipoDaIndicacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) {
    return _api.post(
      '/media/directory-suggestion-logo-intents',
      corpo: <String, dynamic>{
        'content_type': tipoDeConteudo,
        'byte_size': tamanhoEmBytes,
      },
    );
  }

  /// `POST /v1/media/directory-suggestion-photo-intents`
  /// (`createDirectorySuggestionPhotoUploadIntent`), com conta.
  ///
  /// **NAO e a rota do logotipo, e a diferenca nao e arrumacao.** O logotipo e
  /// a marca -- 512 quadrado, minima 256 -- e a foto do estabelecimento e a
  /// faixa do topo da ficha -- 1280 x 720, minima 600. Duas geometrias, duas
  /// minimas, dois propositos (`directory_suggestion_logo` e
  /// `directory_suggestion_photo`), e por isso duas rotas.
  ///
  /// **Uma chamada POR FOTO**, e a tela chama ate quatro vezes: nao existe
  /// autorizacao "de quatro imagens", porque cada assinatura e uma autorizacao
  /// de escrita independente.
  Future<Map<String, dynamic>> intencaoDeFotoDoEstabelecimento({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) {
    return _api.post(
      caminhoDaIntencaoDeFoto,
      corpo: <String, dynamic>{
        'content_type': tipoDeConteudo,
        'byte_size': tamanhoEmBytes,
      },
    );
  }

  /// O caminho de `createDirectorySuggestionPhotoUploadIntent`.
  static const String caminhoDaIntencaoDeFoto =
      '/media/directory-suggestion-photo-intents';

  /// O corpo de `suggestDirectoryEntry`, montado num lugar so.
  static Map<String, dynamic> corpoDaSugestao({
    required String nome,
    required AtividadeDoDiretorio atividade,
    required TipoDeEntidade tipoDeEntidade,
    required String cidade,
    required String uf,
    required TipoDeContatoPublico tipoDeContato,
    required String contato,
    String? bairro,
    String? cep,
    String? recado,
    String? logoUploadId,
    List<String>? fotosDoEstabelecimento,
  }) {
    final cepDoContrato = cep == null ? null : cepParaOContrato(cep);
    return <String, dynamic>{
      'display_name': nome,
      'kind': atividade.codigo,
      'entity_kind': tipoDeEntidade.codigo,
      'city': cidade,
      'state': uf,
      if (bairro != null && bairro.isNotEmpty) 'neighborhood': bairro,
      'postal_code': ?cepDoContrato,
      'public_contact': <String, dynamic>{
        'kind': tipoDeContato.codigo,
        'value': contato,
      },
      if (recado != null && recado.isNotEmpty) 'note': recado,
      if (logoUploadId != null && logoUploadId.isNotEmpty)
        'logo_upload_id': logoUploadId,
      if (fotosDoEstabelecimento != null && fotosDoEstabelecimento.isNotEmpty)
        'photo_upload_ids': fotosDoEstabelecimento,
    };
  }

  /// `POST /v1/directory/suggestions` (`suggestDirectoryEntry`), com conta.
  Future<ReciboDaSugestao> sugerir(
    Map<String, dynamic> corpo, {
    String? idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDaSugestao,
      corpo: corpo,
      idempotencyKey: idempotencyKey,
    );
    return ReciboDaSugestao.doJson(json);
  }

  /// `GET /v1/directory/suggestions` (`listMyDirectorySuggestions`), com conta.
  Future<PaginaDasMinhasIndicacoes> minhasIndicacoes({
    int pagina = 1,
    int tamanho = 20,
    EstadoDaSugestao? estado,
  }) async {
    final json = await _api.get(
      caminhoDaSugestao,
      query: <String, String>{
        if (estado != null) 'state': estado.codigo,
        'page': '$pagina',
        'limit': '$tamanho',
      },
    );
    return PaginaDasMinhasIndicacoes.doJson(json);
  }

  /// `GET /v1/directory/entries/{slug}` (`getDirectoryEntry`) — a pagina do
  /// local.
  Future<DetalheDoLocal> detalhar(String slug) async {
    final json = await _api.get('/directory/entries/${Uri.encodeComponent(slug)}');
    return DetalheDoLocal.doJson(json);
  }

  /// `GET /v1/directory/entries/{slug}/reviews` (`listDirectoryEntryReviews`) —
  /// as avaliacoes que outras pessoas escreveram.
  Future<PaginaDeAvaliacoes> avaliacoes(
    String slug, {
    OrdemDasAvaliacoes ordem = OrdemDasAvaliacoes.recentes,
    int pagina = 1,
    int limite = 10,
  }) async {
    final json = await _api.get(
      '/directory/entries/${Uri.encodeComponent(slug)}/reviews',
      query: <String, String>{
        'sort': ordem.codigo,
        'page': '$pagina',
        'limit': '$limite',
      },
    );
    return PaginaDeAvaliacoes.doJson(json);
  }

  /// `PUT /v1/directory/entries/{slug}/reviews/me`
  /// (`putMyDirectoryEntryReview`) — grava a minha avaliacao, **ou atualiza a
  /// que eu ja escrevi**.
  Future<AvaliacaoGravada> gravarMinhaAvaliacao(
    String slug, {
    required int nota,
    String? texto,
  }) async {
    final json = await _api.put(
      '/directory/entries/${Uri.encodeComponent(slug)}/reviews/me',
      corpo: corpoDaAvaliacao(nota: nota, texto: texto),
    );
    return AvaliacaoGravada.doJson(json);
  }

  /// `DELETE /v1/directory/entries/{slug}/reviews/me`
  /// (`deleteMyDirectoryEntryReview`) — apaga a minha avaliacao deste local.
  Future<void> apagarMinhaAvaliacao(String slug) async {
    await _api.delete(
      '/directory/entries/${Uri.encodeComponent(slug)}/reviews/me',
    );
  }

  /// `POST /v1/directory/entries/{slug}/reviews/{reviewRef}/reports`
  /// (`reportDirectoryEntryReview`) — denuncia uma avaliacao para a moderacao.
  Future<void> denunciarAvaliacao(
    String slug,
    String referenciaDaAvaliacao, {
    required MotivoDaDenuncia motivo,
    String? detalhe,
  }) async {
    await _api.post(
      '/directory/entries/${Uri.encodeComponent(slug)}'
      '/reviews/${Uri.encodeComponent(referenciaDaAvaliacao)}/reports',
      corpo: corpoDaDenuncia(motivo: motivo, detalhe: detalhe),
    );
  }
}
