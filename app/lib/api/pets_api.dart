import 'api_client.dart';
import 'modelos_pet.dart';

/// As operacoes de `/v1/pets`, `/v1/media` e `/v1/public/reference-data` do
/// contrato.
///
/// Ela e escrita contra `api/openapi.yaml`, e nao contra uma implementacao: e
/// o contrato que e a entrada. Onde o servidor ainda nao responde, a chamada
/// termina em `FalhaDeConexao` ou num `Problem` de 404, e as telas ja tratam
/// os dois. Nenhum caminho devolve resposta falsa para a tela ficar bonita.
///
/// **Esta linha dizia "nenhuma rota desta classe existe no servidor ainda", e
/// deixou de ser verdade.** `GET /pets/{petId}`, `PATCH /pets/{petId}` e
/// `DELETE /pets/{petId}` estao implementados em `src/modules/pets/` desde
/// antes da BICHUS-60 e da BICHUS-61 -- `pet-routes.ts` declara as tres,
/// `pet-service.ts` as atende e `kysely-pet-repository.ts` as grava. O
/// comentario ficou para tras e foi corrigido aqui em vez de repetido: um
/// aviso de "isto nao existe" sobre codigo que existe treina quem le a nao
/// acreditar no cabecalho.
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

  /// `GET /pets` (`operationId: listMyPets`).
  ///
  /// **Lista completa, sem paginacao.** O contrato fixa o teto em 20 pets por
  /// conta e por isso nao declara nem `limit` nem cursor: paginar aqui seria
  /// inventar parametro que a operacao nao tem.
  ///
  /// Devolve `items` tipado. Uma entrada que nao seja objeto e descartada, e
  /// uma que seja objeto e nao tenha `id` **estoura**: `Pet.doJson` le `id`
  /// sem `??`, de proposito. Pet sem identidade nao e pet degradado, e um
  /// cartao sem `id` seguiria para a tela de detalhe apontando para nada.
  ///
  /// O que esta funcao **nao** faz: nao trata falha e nao devolve lista vazia
  /// quando a chamada quebra. Quem chama precisa distinguir "voce nao tem pet"
  /// de "nao consegui perguntar", e um `catch` que devolvesse `[]` apagaria
  /// essa diferenca -- que e exatamente o estado vazio que parece sucesso.
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

  /// `GET /pets/{petId}` (`operationId: getPet`).
  ///
  /// **A autorizacao esta na clausula `WHERE` do servidor, e a resposta de
  /// "nao e seu" e 404** (ADR-0021; `pet-service.ts`, `buscar`). O app nao
  /// tenta distinguir "nao existe" de "nao e seu", e nao deve: distinguir as
  /// duas confirmaria a existencia do registro para quem nao e o dono. Quem
  /// chama trata o 404 como "este pet nao esta na sua conta", e nada mais.
  Future<Pet> buscarPet(String petId) async {
    final json = await _api.get('/pets/${Uri.encodeComponent(petId)}');
    return Pet.doJson(json);
  }

  /// `PATCH /pets/{petId}` (`operationId: updatePet`).
  ///
  /// **O verbo e `PATCH` e o comportamento e de substituicao inteira.** Nao e
  /// desatencao de quem escreveu: o contrato declara o corpo como um
  /// `PetInput` completo (`required: [name, species, size]`) e o repositorio
  /// grava TODAS as colunas a partir dele
  /// (`kysely-pet-repository.ts`, `atualizar`), com ausente e nulo tratados
  /// como a mesma coisa (`ouNulo`, em `pet-routes.ts`).
  ///
  /// A consequencia decide a assinatura desta funcao: **enviar so o que mudou
  /// apaga o resto.** Corrigir o nome de um pet com um corpo de um campo so
  /// zeraria cor, sexo, sinais particulares e cartao de manejo, no servidor,
  /// sem erro nenhum e sem nada no app acusando. Por isso todos os campos
  /// entram aqui, e por isso a tela de edicao carrega o pet inteiro antes de
  /// abrir: o que ela nao souber ler, ela apaga.
  ///
  /// **A regra de vazio tambem muda em relacao a [cadastrarPet].** La, campo
  /// vazio some do corpo, porque no cadastro "vazio" e "nao informado" sao a
  /// mesma coisa. Aqui nao: apagar o cartao de manejo e uma edicao legitima, e
  /// um campo que sumisse do corpo seria um campo que o tutor nao consegue
  /// esvaziar. Vazio vai como **`null` explicito**, que e o que o contrato
  /// declara anulavel e o que `ouNulo` transforma em coluna nula.
  ///
  /// Sem `Idempotency-Key`: o contrato nao o declara para esta operacao, e
  /// `ApiClient.patch` nao o aceita. Repetir um `PATCH` identico chega no
  /// mesmo estado, que e o que idempotencia significa aqui.
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
        // Os anulaveis vao SEMPRE, inclusive nulos. Ver o cabecalho: chave
        // ausente e chave nula significam a mesma coisa para o servidor, e o
        // que nao viaja e apagado de qualquer jeito. Mandar o nulo explicito
        // faz o corpo dizer o que a tela quis dizer.
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
  ///
  /// **Nao tem volta pela interface.** O contrato declara
  /// `x-effects: [irreversible_write]` e o teto de 10 por conta por dia. O
  /// registro continua existindo para a trilha (exclusao logica, `deleted_at`),
  /// e e por isso que o efeito e `irreversible_write` e nao `deletes` -- mas
  /// nada disso e desfazivel pelo tutor, e a tela nao pode sugerir que seja.
  ///
  /// **O que some junto e o que o texto da confirmacao precisa dizer:** o
  /// servidor revoga todas as tags do pet com `pet_deleted`, e a partir dali o
  /// codigo daquela plaquinha responde 410 para sempre (ADR-0004). O codigo
  /// **nao volta ao estoque e nao e reciclado**: "o codigo pertence ao pet e e
  /// imutavel; nao se edita, nao se transfere para outro pet, nao se reativa".
  ///
  /// **Nao exige `X-Reauth-Token`**, e isso e leitura do contrato e nao
  /// suposicao: `deletePet` declara `security: [bearerAuth]` sozinho, enquanto
  /// `revokePetTag` declara `bearerAuth` mais `reauth: []` com
  /// `x-reauth-scope: tag_revocation`. O paragrafo 11.9.1 do design system diz
  /// o mesmo do lado da tela: para as destruicoes que nao exigem
  /// reautenticacao nao ha campo nenhum, so as duas acoes, porque "friction
  /// inventada onde o contrato nao pede e friction que as pessoas aprendem a
  /// atravessar sem ler".
  Future<void> excluirPet(String petId) async {
    await _api.delete('/pets/${Uri.encodeComponent(petId)}');
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
