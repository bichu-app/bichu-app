import '../formato/cep.dart';
import 'api_client.dart';
import 'modelos_diretorio.dart';

/// `GET /v1/directory/entries` (`listDirectoryEntries`) — o diretorio de
/// `Perto`.
///
/// **Ela exige conta, e e isso que torna a resposta possivel.** O portao
/// `src/tools/portao-contrato-publico.ts` reprova `phone_e164` e `distance_m`
/// em qualquer operacao alcancavel sem conta, e reprova com razao: telefone
/// comercial e distancia sao o conteudo util do diretorio e numa rota publica
/// nao poderiam existir. Por isso [listar] **nao** passa `exigeToken: false`:
/// sem token a chamada volta 401, e esse e o desenho.
///
/// **A localizacao nao vai na requisicao.** A ordenacao por distancia usa a
/// localizacao de referencia que o servidor ja guarda (BICHUS-92). Coordenada
/// em URL vai para log de acesso, para o historico do aparelho e para o
/// cabecalho `Referer`. Nenhum parametro desta classe carrega ponto.
///
/// ## Busca por texto: **existe desde 30/09**
///
/// `q` entrou no contrato de `listDirectoryEntries` com `minLength: 3`, teto
/// proprio e indice GIN de trigrama do lado do servidor. Esta classe o repassa
/// por [RecorteDoDiretorio.query], e continua **nao filtrando em memoria**:
/// filtrar as 20 entradas da pagina carregada e uma busca que funciona com 10
/// registros e mente com 200. O alcance declarado na tela e
/// `AlcanceDaBusca.servidor` porque e o alcance REAL.
///
/// O portao de `app/test/telas/perto_com_dados_test.dart` cobra os dois
/// sentidos: sem `q` no contrato o campo nao pode existir na tela, e com `q`
/// no contrato o campo passa a ser obrigatorio.
///
class DiretorioApi {
  const DiretorioApi(this._api);

  final ApiClient _api;

  /// Uma pagina do diretorio, com o [recorte] pedido.
  ///
  /// **Nao trata falha e nao devolve pagina vazia quando a chamada quebra.**
  /// Quem chama precisa distinguir "nao ha profissional por aqui" de "nao
  /// consegui perguntar": um `catch` que devolvesse lista vazia produziria o
  /// estado vazio que parece sucesso.
  Future<PaginaDoDiretorio> listar([
    RecorteDoDiretorio recorte = const RecorteDoDiretorio(),
  ]) async {
    final json = await _api.get('/directory/entries', query: recorte.query);
    return PaginaDoDiretorio.doJson(json);
  }

  /// O caminho de `suggestDirectoryEntry`, exposto para a fila offline.
  static const String caminhoDaSugestao = '/directory/suggestions';

  /// O corpo de `suggestDirectoryEntry`, montado num lugar so.
  ///
  /// **O minimo que permite checar, e nada alem**: nome, atividade, cidade,
  /// bairro e CEP opcionais, um contato publico e um recado para quem revisa.
  /// Nao ha parametro de documento (CRMV, CNPJ) nem de pessoa fisica, e a
  /// ausencia e deliberada: documento e prova de quem o APRESENTA, mora em
  /// `entity_verifications` e pedi-lo aqui seria coletar o documento de um
  /// terceiro pela mao de um estranho.
  ///
  /// Sem coordenada e sem logradouro (ADR-0006): cidade, estado, bairro e CEP
  /// sao texto, nunca fonte de ponto. O CEP **nao** e convertido em coordenada
  /// em lugar nenhum -- `api/busca_de_cep.dart` ignora de proposito o
  /// `location.coordinates` que a BrasilAPI devolve.
  ///
  /// **`postal_code` entrou em 18/10/2026** ("pode armazenar o cep sim!"), e e
  /// guardado para a fila de revisao do painel -- nunca publicado: rua e CEP
  /// nao saem no `Perto` (ADR-0010 itens 4 e 5).
  static Map<String, dynamic> corpoDaSugestao({
    required String nome,
    required AtividadeDoDiretorio atividade,
    required String cidade,
    required String uf,
    required TipoDeContatoPublico tipoDeContato,
    required String contato,
    String? bairro,
    String? cep,
    String? recado,
  }) {
    // **O HIFEN MORRE AQUI, e esta linha e a fronteira.**
    //
    // A tela mostra `22041-001` desde 18/10 (a mascara que o cliente pediu) e
    // o contrato declara `^[0-9]{8}$`. Mandar `controlador.text` direto
    // produziria um `400` com a forma certa na tela -- a divergencia que passa
    // por todo portao, porque nenhum comparador de contrato olha o que o
    // campo guarda. `cepParaOContrato` e a UNICA tradutora, e ela mora com a
    // mascara: as duas regras ficam no mesmo arquivo e nao podem divergir.
    //
    // **`null` nao e recusa.** CEP pela metade apenas NAO VAI no corpo, em vez
    // de virar 400 para quem so parou de digitar: o campo e opcional, e nada
    // aqui pode transformar um opcional incompleto numa recusa.
    final cepDoContrato = cep == null ? null : cepParaOContrato(cep);
    return <String, dynamic>{
      'display_name': nome,
      'kind': atividade.codigo,
      'city': cidade,
      'state': uf,
      if (bairro != null && bairro.isNotEmpty) 'neighborhood': bairro,
      // `?` e nao `if (… != null)`: o `use_null_aware_elements` do analisador
      // cobra esta forma, e `flutter analyze` e o unico portao que roda nesta
      // entrega.
      'postal_code': ?cepDoContrato,
      'public_contact': <String, dynamic>{
        'kind': tipoDeContato.codigo,
        'value': contato,
      },
      if (recado != null && recado.isNotEmpty) 'note': recado,
    };
  }

  /// `POST /v1/directory/suggestions` (`suggestDirectoryEntry`), com conta.
  ///
  /// **Nao publica nada.** A resposta e um recibo com `state: pending`: a
  /// sugestao entrou na fila de revisao do painel, e e isso que a tela diz. Um
  /// texto de sucesso que sugerisse publicacao seria mentira sobre o nome de
  /// uma clinica real.
  ///
  /// Nao trata recusa: 400, 401 e 429 sobem como `FalhaDeChamada`, e a tela
  /// nomeia o campo recusado por `Problem.campo`.
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

  // -------------------------------------------------------------------------
  // A PAGINA DO LOCAL E AS AVALIACOES (18/10/2026)
  // -------------------------------------------------------------------------
  // As cinco operacoes que o pedido do cliente trouxe. **Nenhuma delas trata
  // falha**, pela mesma razao escrita em [listar]: quem chama precisa
  // distinguir "este local nao tem avaliacao" de "nao consegui perguntar", e
  // um `catch` que devolvesse pagina vazia produziria o estado zero "Ainda sem
  // avaliacoes" sobre um local com 128 -- o estado vazio que parece sucesso.
  //
  // O `slug` passa por `Uri.encodeComponent` em todas: ele vem da RESPOSTA do
  // servidor e nao da tela, e montar caminho com interpolacao crua e como um
  // slug inesperado vira uma rota que nao existe.

  /// `GET /v1/directory/entries/{slug}` (`getDirectoryEntry`) — a pagina do
  /// local.
  ///
  /// **Exige conta, e pelo mesmo motivo de [listar]** e nao por um motivo
  /// novo: ela devolve `phone_e164`, e `src/tools/portao-contrato-publico.ts`
  /// reprova esse campo em qualquer operacao alcancavel sem conta. Por isso
  /// nao ha `exigeToken: false` aqui, e nem poderia haver.
  ///
  /// **`slug` de rascunho, oculto ou removido responde 404 e nao 403**
  /// (ADR-0021): a autorizacao mora na clausula `WHERE`, e um 403
  /// confirmaria que aquele endereco existe. A tela trata o 404 como "nao
  /// encontramos", que e a verdade que quem chegou por link tem direito de
  /// saber.
  Future<DetalheDoLocal> detalhar(String slug) async {
    final json = await _api.get('/directory/entries/${Uri.encodeComponent(slug)}');
    return DetalheDoLocal.doJson(json);
  }

  /// `GET /v1/directory/entries/{slug}/reviews`
  /// (`listDirectoryEntryReviews`) — as avaliacoes que outras pessoas
  /// escreveram.
  ///
  /// **A minha tambem vem nesta lista**, marcada com `mine: true`, e nao num
  /// bloco separado do servidor: quem tira a minha do fluxo e poe o campo de
  /// edicao no lugar e a TELA. Isso evita a resposta em que a mesma avaliacao
  /// chega duas vezes.
  ///
  /// `limite` tem teto 20 no contrato e **padrao 10**, que e o padrao do
  /// contrato e nao um numero desta classe.
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
  ///
  /// **`PUT` e nao `POST`, e a escolha e a regra de produto escrita no
  /// metodo**: uma avaliacao por pessoa por local, que ela possa editar. Com
  /// `POST` o segundo envio seria 409 e a tela precisaria de um segundo
  /// caminho; com `PUT` o segundo envio **e** a edicao. Quem distingue os dois
  /// na resposta e `created`, e e dele que sai a frase da tela.
  ///
  /// **Nao trata recusa.** O 403 de `unverified_channel` e o 400 de
  /// `html_not_allowed` sobem como `FalhaDaApi` e a tela os nomeia: engoli-los
  /// aqui faria o texto da pessoa desaparecer sem explicacao.
  ///
  /// Sem `Idempotency-Key`, pela razao escrita em `ApiClient.put`.
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
  ///
  /// **So a minha, e o dono e resolvido na clausula `WHERE`**: esta rota nao
  /// aceita identificador de avaliacao nenhum, e nao existe caminho em que ela
  /// alcance a de outra pessoa. Apagar e do AUTOR, nunca do avaliado
  /// (ADR-0011): quem contesta denuncia, e quem remove e a moderacao.
  ///
  /// **Idempotente**: nao ter avaliacao e chamar isto devolve 204, nao 404. O
  /// 404 fica reservado para o local que nao existe ou nao esta publicado, e e
  /// por isso que um toque duplo no botao nao vira falha na tela.
  ///
  /// Devolve `void`: 204 nao tem corpo, e inventar um retorno aqui daria a
  /// tela um valor que ela teria de ignorar.
  Future<void> apagarMinhaAvaliacao(String slug) async {
    await _api.delete(
      '/directory/entries/${Uri.encodeComponent(slug)}/reviews/me',
    );
  }

  /// `POST /v1/directory/entries/{slug}/reviews/{reviewRef}/reports`
  /// (`reportDirectoryEntryReview`) — denuncia uma avaliacao para a moderacao.
  ///
  /// **A denuncia NAO esconde a avaliacao**, e isso e deliberado: se
  /// escondesse, uma denuncia seria todo o custo de apagar a avaliacao de um
  /// concorrente. Ela enfileira, e quem remove e o painel.
  ///
  /// **202 e nao 200**: o que a rota promete e que o pedido foi recebido, nao
  /// que alguem ja olhou. A tela nao pode escrever "analisamos" -- nao ha
  /// equipe de moderacao de plantao.
  ///
  /// **Denunciar duas vezes a mesma avaliacao nao duplica a fila e nao da
  /// erro**: a segunda chamada responde 202 e incrementa a contagem de
  /// repeticao. Erro aqui ensinaria a quem denuncia que ele ja denunciou, o
  /// que nao e informacao dele.
  ///
  /// `Idempotency-Key` fica de fora porque o servidor ja desduplica por
  /// (quem, avaliacao): uma chave aqui seria uma segunda desduplicacao, com
  /// janela diferente, sobre algo que nao cria recurso novo.
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
