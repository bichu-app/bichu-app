import 'api_client.dart';
import 'envio_de_foto.dart';
import 'modelos_pet.dart';

/// As operacoes de `/v1/pets`, `/v1/media` e `/v1/public/reference-data` do
/// contrato.
class PetsApi implements IntencaoEConfirmacaoDePet {
  const PetsApi(this._api);

  final ApiClient _api;

  /// `GET /public/reference-data`.
  Future<DadosDeReferencia> dadosDeReferencia() async {
    final json = await _api.get('/public/reference-data', exigeToken: false);
    return DadosDeReferencia.doJson(json);
  }

  /// `GET /pets` (`operationId: listMyPets`).
  Future<List<Pet>> listarMeusPets() async {
    final json = await _api.get('/pets');
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException(
        'GET /pets respondeu sem `items`. O contrato declara o campo como '
        'obrigatorio (api/openapi.yaml, listMyPets).',
      );
    }
    return itens
        .whereType<Map<String, dynamic>>()
        .map(Pet.doJson)
        .toList(growable: false);
  }

  /// `POST /pets`.
  Future<Pet> cadastrarPet({
    required String nome,
    required Especie especie,
    required Porte porte,
    required String idempotencyKey,
    String? breedCode,
    String? breedFreeText,
    String? refDataVersion,
    String? corPrincipalCodigo,
    String? segundaCorCodigo,
    Sexo? sexo,
    String? sinaisParticulares,
    String? cuidados,
  }) async {
    final json = await _api.post(
      '/pets',
      idempotencyKey: idempotencyKey,
      corpo: <String, dynamic>{
        'name': nome,
        'species': especie.valor,
        'size': porte.valor,
        if (breedCode != null && breedCode.isNotEmpty) 'breed_code': breedCode,
        if (breedFreeText != null && breedFreeText.isNotEmpty)
          'breed_free_text': breedFreeText,
        if (refDataVersion != null && refDataVersion.isNotEmpty)
          'ref_data_version': refDataVersion,
        if (corPrincipalCodigo != null && corPrincipalCodigo.isNotEmpty)
          'primary_color_code': corPrincipalCodigo,
        if (segundaCorCodigo != null && segundaCorCodigo.isNotEmpty)
          'secondary_color_code': segundaCorCodigo,
        if (sexo != null) 'sex': sexo.valor,
        if (sinaisParticulares != null && sinaisParticulares.isNotEmpty)
          'distinctive_marks': sinaisParticulares,
        if (cuidados != null && cuidados.isNotEmpty) 'care_notes': cuidados,
      },
    );
    return Pet.doJson(json);
  }

  /// `GET /pets/{petId}` (`operationId: getPet`).
  Future<Pet> buscarPet(String petId) async {
    final json = await _api.get('/pets/${Uri.encodeComponent(petId)}');
    return Pet.doJson(json);
  }

  /// `PATCH /pets/{petId}` (`operationId: updatePet`).
  Future<Pet> atualizarPet({
    required String petId,
    required String nome,
    required Especie especie,
    required Porte porte,
    String? breedCode,
    String? breedFreeText,
    String? refDataVersion,
    String? corPrincipalCodigo,
    String? segundaCorCodigo,
    Sexo? sexo,
    String? sinaisParticulares,
    String? cuidados,
  }) async {
    String? semVazio(String? valor) {
      if (valor == null) return null;
      final limpo = valor.trim();
      return limpo.isEmpty ? null : limpo;
    }

    final json = await _api.patch(
      '/pets/${Uri.encodeComponent(petId)}',
      corpo: <String, dynamic>{
        'name': nome,
        'species': especie.valor,
        'size': porte.valor,
        'breed_code': semVazio(breedCode),
        'breed_free_text': semVazio(breedFreeText),
        'ref_data_version': semVazio(refDataVersion),
        'primary_color_code': semVazio(corPrincipalCodigo),
        'secondary_color_code': semVazio(segundaCorCodigo),
        'sex': sexo?.valor,
        'distinctive_marks': semVazio(sinaisParticulares),
        'care_notes': semVazio(cuidados),
      },
    );
    return Pet.doJson(json);
  }

  /// `DELETE /pets/{petId}` (`operationId: deletePet`).
  Future<void> excluirPet(String petId) async {
    await _api.delete('/pets/${Uri.encodeComponent(petId)}');
  }

  /// `GET /pets/{petId}/tags` (`operationId: listPetTags`).
  Future<List<TagDoPet>> listarTags(String petId) async {
    final json = await _api.get('/pets/${Uri.encodeComponent(petId)}/tags');
    final itens = json['items'];
    if (itens is! List) return const <TagDoPet>[];
    return itens
        .whereType<Map<String, dynamic>>()
        .map(TagDoPet.doJson)
        .toList(growable: false);
  }

  /// O endereco de `GET /pets/{petId}/tags/{tagId}/qr.png`.
  String enderecoDaImagemDoQr({required String petId, required String tagId}) {
    return _api
        .enderecoDe(
          '/pets/${Uri.encodeComponent(petId)}'
          '/tags/${Uri.encodeComponent(tagId)}/qr.png',
        )
        .toString();
  }

  /// `POST /pets/{petId}/tags`.
  Future<TagEmitida> emitirTag({
    required String petId,
    required String idempotencyKey,
  }) async {
    final json = await _api.post(
      '/pets/$petId/tags',
      idempotencyKey: idempotencyKey,
    );
    return TagEmitida.doJson(json);
  }

  /// `POST /pets/{petId}/tag-requests`.
  Future<PedidoDePlaquinha> solicitarPlaquinha({
    required String petId,
    required EnderecoDeEntrega endereco,
    String? observacao,
  }) async {
    final json = await _api.post(
      '/pets/${Uri.encodeComponent(petId)}/tag-requests',
      corpo: <String, dynamic>{
        'delivery_address': endereco.paraJson(),
        if (observacao != null && observacao.isNotEmpty) 'notes': observacao,
      },
    );
    return PedidoDePlaquinha.doJson(json);
  }

  /// `GET /pets/{petId}/delivery-address` (`getPetDeliveryAddress`).
  Future<EnderecoDeEntrega?> lerEnderecoDoPet(String petId) async {
    final json = await _api.get(
      '/pets/${Uri.encodeComponent(petId)}/delivery-address',
    );
    if (json.isEmpty) return null;
    if (json.length == 1 && json.containsKey('data') && json['data'] == null) {
      return null;
    }
    return EnderecoDeEntrega.doJson(json);
  }

  /// `PUT /pets/{petId}/delivery-address` (`putPetDeliveryAddress`).
  Future<EnderecoDeEntrega> salvarEnderecoDoPet(
    String petId,
    EnderecoDeEntrega endereco,
  ) async {
    final json = await _api.put(
      '/pets/${Uri.encodeComponent(petId)}/delivery-address',
      corpo: endereco.paraJson(),
    );
    return EnderecoDeEntrega.doJson(json)!;
  }

  /// `GET /pets/{petId}/tag-requests`: os pedidos da plaquinha deste pet.
  Future<List<PedidoDePlaquinha>> listarPedidosDePlaquinha(String petId) async {
    final json = await _api.get(
      '/pets/${Uri.encodeComponent(petId)}/tag-requests',
    );
    final itens = json['items'];
    if (itens is! List) return const <PedidoDePlaquinha>[];
    return itens
        .whereType<Map<String, dynamic>>()
        .map(PedidoDePlaquinha.doJson)
        .toList(growable: false);
  }

  /// `POST /media/pet-photo-intents`.
  @override
  Future<Map<String, dynamic>> intencaoDeFotoDoPet({
    required String petId,
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) {
    return _api.post(
      '/media/pet-photo-intents',
      corpo: <String, dynamic>{
        'pet_id': petId,
        'content_type': tipoDeConteudo,
        'byte_size': tamanhoEmBytes,
      },
    );
  }

  /// `POST /pets/{petId}/photos`.
  @override
  Future<void> confirmarFotoDoPet({
    required String petId,
    required String uploadId,
    bool comoPrincipal = true,
  }) async {
    await _api.post(
      '/pets/$petId/photos',
      corpo: <String, dynamic>{
        'upload_id': uploadId,
        'set_as_primary': comoPrincipal,
      },
    );
  }

  /// `DELETE /pets/{petId}/photos/{photoId}`.
  Future<void> excluirFotoDoPet({
    required String petId,
    required String photoId,
  }) async {
    await _api.delete(
      '/pets/${Uri.encodeComponent(petId)}'
      '/photos/${Uri.encodeComponent(photoId)}',
    );
  }
}

/// As operacoes publicas de `/v1/tags` do contrato.
class TagsApi {
  const TagsApi(this._api);

  final ApiClient _api;

  /// `GET /tags/{code}`.
  Future<TagResolvida> resolver(String codigo) async {
    final json = await _api.get('/tags/${Uri.encodeComponent(codigo)}');
    return TagResolvida.doJson(json);
  }

  /// `GET /tags/{code}/owner-context` — os identificadores da PROPRIA tag.
  Future<ContextoDoDonoDaTag> contextoDoDono(String codigo) async {
    final json = await _api.get(
      '/tags/${Uri.encodeComponent(codigo)}/owner-context',
    );
    return ContextoDoDonoDaTag.doJson(json);
  }

  /// O caminho de `POST /tags/{code}/found-reports`, num lugar so.
  static String caminhoDoAviso(String codigo) =>
      '/tags/${Uri.encodeComponent(codigo)}/found-reports';

  /// `POST /tags/{code}/found-reports` -- **avisar o tutor**.
  Future<AvisoDoAchadorCriado> avisarOTutor(
    String codigo, {
    required String idempotencyKey,
    String? recadoDoAchador,
    DateTime? achadoEm,
  }) async {
    final json = await _api.post(
      caminhoDoAviso(codigo),
      corpo: corpoDoAviso(
        recadoDoAchador: recadoDoAchador,
        achadoEm: achadoEm,
      ),
      idempotencyKey: idempotencyKey,
    );
    return AvisoDoAchadorCriado.doJson(json);
  }

  /// O corpo do aviso, **separado para a fila offline gravar o mesmo**.
  static Map<String, dynamic> corpoDoAviso({
    String? recadoDoAchador,
    DateTime? achadoEm,
  }) {
    final recado = recadoDoAchador?.trim();
    return <String, dynamic>{
      if (achadoEm != null) 'found_at': achadoEm.toUtc().toIso8601String(),
      if (recado != null && recado.isNotEmpty) 'client_note': recado,
    };
  }
}
