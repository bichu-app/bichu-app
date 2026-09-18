import 'api_client.dart';
import 'modelos_pet.dart';

/// As operacoes de `/v1/pets`, `/v1/media` e `/v1/public/reference-data` do
/// contrato.
///
/// **Nenhuma rota desta classe existe no servidor ainda.** Ela e escrita
/// contra `api/openapi.yaml`, e nao contra uma implementacao: e o contrato que
/// e a entrada. Enquanto o servidor nao responder, toda chamada daqui termina
/// em `FalhaDeConexao` ou num `Problem` de 404, e as telas ja tratam os dois.
/// Nenhum caminho devolve resposta falsa para a tela ficar bonita.
class PetsApi {
  const PetsApi(this._api);

  final ApiClient _api;

  /// `GET /public/reference-data`.
  ///
  /// Aberta: nao exige token. E cacheavel por 24 h no contrato, e o cache
  /// ainda nao existe aqui -- a tela trata a falha de carregamento com a saida
  /// escrita em F1.3 (cadastrar sem raca e escolher depois em `Editar`).
  Future<DadosDeReferencia> dadosDeReferencia() async {
    final json = await _api.get('/public/reference-data', exigeToken: false);
    return DadosDeReferencia.doJson(json);
  }

  /// `POST /pets`.
  ///
  /// **Raca sao dois campos, e a regra do contrato e que eles nao convivem.**
  /// [breedFreeText] so e aceito com [breedCode] em `outro_dog`, `outro_cat`
  /// ou `outro_other`; enviado junto de uma raca da lista, a resposta e
  /// `validation-failed`. Esta funcao **nao corrige** a combinacao errada: a
  /// autoridade e do servidor, e um cliente que "arruma" o corpo antes de
  /// enviar esconde o defeito da tela que o produziu. Quem impede o erro e a
  /// tela, fazendo o campo livre existir so com a opcao de saida escolhida.
  ///
  /// [refDataVersion] e a versao da lista **que o cliente tinha em maos**, e
  /// nao a corrente do servidor. Sem ela, o servidor grava a corrente no
  /// momento da escrita, que responde "qual e a lista de hoje" e nao "de qual
  /// lista este pet foi escolhido".
  ///
  /// A chave de idempotencia e obrigatoria: um reenvio depois de
  /// [FalhaDeTempo] pode cair num pet que ja foi criado, e sem a chave o tutor
  /// termina com dois cadastros do mesmo animal.
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

  /// `POST /pets/{petId}/tags`.
  ///
  /// **A unica resposta do contrato que traz o codigo em claro.** O valor nao
  /// e persistido em lugar nenhum deste app: ele vive na memoria da tela F1.6
  /// e morre com ela. Para reimprimir, o caminho e `qr.png`, e nao um codigo
  /// guardado.
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

  /// `POST /media/pet-photo-intents`.
  ///
  /// Caminho novo (ADR-0016): o `pet_id` saiu do caminho e entrou no corpo. O
  /// backend nunca recebe os bytes -- ele assina a requisicao de upload para o
  /// armazenamento, e o cliente **le** o campo `method` em vez de presumir a
  /// forma.
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
  ///
  /// E **esta** chamada que enfileira o processamento, e nao a chegada dos
  /// bytes no armazenamento: o produto nao depende de notificacao de bucket.
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
}

/// As operacoes publicas de `/v1/tags` do contrato.
class TagsApi {
  const TagsApi(this._api);

  final ApiClient _api;

  /// `GET /tags/{code}`.
  ///
  /// **Publica: a posse do codigo e a credencial.** Vai com token quando ha
  /// um, porque e o token que faz o servidor responder `viewer: owner` e o app
  /// abrir o modo dono; sem token a resposta e a mesma, com `viewer:
  /// anonymous`. O corpo **nao cresce** na presenca do token.
  ///
  /// Os quatro desfechos de erro decidem por `type` e nunca por status:
  /// `tag-code-malformed` (400), `tag-code-not-found` (404), `tag-revoked`
  /// (410, com `next_action`) e `rate-limited` (429).
  Future<TagResolvida> resolver(String codigo) async {
    final json = await _api.get('/tags/${Uri.encodeComponent(codigo)}');
    return TagResolvida.doJson(json);
  }
}
