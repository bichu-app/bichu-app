import 'api_client.dart';
import 'falhas.dart';
import 'modelos_rede.dart';

/// As operacoes da secao `Rede` que o app consome (`tags: [network]`).
///
/// **A escrita da comunidade entrou em 17/10/2026** (ADR-0025 emenda 3): a
/// pessoa cria o proprio encontro por `createNetworkEvent`, e ele nasce
/// `published`, sem fila de revisao.
///
/// **O CANCELAMENTO FECHOU EM 19/10/2026, e em tres pedacos.** [cancelar]
/// existia desde a correcao do transporte (`ApiClient.post` passou a aceitar
/// `ifMatch`), e **nao tinha de onde tirar o valor**: nenhuma leitura da Rede
/// devolvia `ETag`, medido contra homologacao. Faltavam a FONTE da versao e o
/// CAMINHO ate ela. Os dois entraram aqui: [meuEncontro] le a versao
/// (`getMyNetworkEvent`, a unica leitura da secao que emite o cabecalho) e
/// [meusEncontros] e a lista do dono, que e por onde a pessoa chega ao proprio
/// encontro -- nada na agenda diz de quem o encontro e.
///
/// `updateNetworkEvent` continua **fora** desta classe: a tela de editar e de
/// outro despacho, e declarar o metodo antes dela seria codigo sem chamador.
///
/// ## AS SETE OPERACOES APOSENTADAS (19/10/2026)
///
/// Decisao do cliente, palavra por palavra: *"vamos deixar apenas os eventos
/// abertos por enquanto, no futuro analisamos a necessidade de ter eventos
/// privados tambem"*. Sete metodos desta classe **ficam declarados e nao tem
/// chamador nenhum no app**:
///
/// - [detalhar] (`getNetworkEvent`), [localizacao]
///   (`getNetworkEventLocation`) e [detalhesDoPrivado]
///   (`getNetworkEventPrivateDetails`): eram da pagina de detalhe do evento,
///   que saiu no mesmo dia, por outro pedido dele (*"sem informações
///   adicionais ou pagina de detalhes do evento"*);
/// - [pedir] (`requestToJoinNetworkEvent`), [meuPedido]
///   (`getMyNetworkEventJoinRequest`) e [desistir]
///   (`withdrawNetworkEventJoinRequest`): o pedido de participacao nascia
///   naquela pagina;
/// - [meusPedidos] (`listMyNetworkEventJoinRequests`): era a aba `Meus
///   pedidos` da agenda, que saiu com esta decisao.
///
/// **Ficam, e isto e deliberado.** Ele disse *"no futuro analisamos"*, e nao
/// "nunca": apagar os sete faria a proxima pessoa reescrever a leitura de
/// `NetworkEventJoinRequest` do zero, sem a prosa que explica por que a recusa
/// nao existe aqui. Quem as reabrir le o registro em
/// `api/rastreabilidade-backoffice-rede.yaml`, secao `contrato_sem_tela`, que
/// e onde o projeto ja declara operacao de contrato sem tela.
///
/// **O que NAO fica e caminho de tela ate elas.** Nenhum widget, nenhuma rota
/// e nenhum recorte da agenda chama qualquer uma das sete; `RecorteDaRede`
/// perdeu `visibilidade`, `estadoDoPedido` e `queryDePedidos` no mesmo
/// commit, e `queryDaAgenda` passou a fixar `visibility=public`.
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

  /// O caminho de `createNetworkEvent`, exposto para a fila offline.
  static const String caminhoDeCriacao = '/network/events';

  /// O corpo de `createNetworkEvent`, montado num lugar so.
  ///
  /// **Monta apenas os campos que `CommunityNetworkEventInput` aceita.** O que
  /// a operacao NAO aceita -- `visibility`, `admission`, `slug`, `point`,
  /// `street_address`, `ticket_url`, `instagram_url` e estado de publicacao --
  /// nao tem parametro aqui: o encontro da comunidade e sempre publico e
  /// gratuito, e um parametro para escolher seria um campo que o servidor
  /// recusa com `400` depois de a tela ter desenhado o controle.
  ///
  /// **Campo opcional ausente nao vira `null` no corpo: ele nao entra.** O
  /// esquema e `additionalProperties: false` e os defaults sao do servidor
  /// (`time_zone`, `accepted_sizes`, `dog_age`, `vaccination_required`,
  /// `fenced_off_leash_area`); mandar `null` em `ends_at` na CRIACAO nao e
  /// "sem fim previsto", e um tipo que o esquema nao declara.
  ///
  /// Datas em UTC com `Z`, como `format: date-time` pede. O fuso de exibicao e
  /// `time_zone`, separado, e o servidor o aplica.
  ///
  /// **A CAPA ENTRA AQUI, no MESMO corpo** (19/10/2026, pedido do cliente:
  /// *"a foto que eu estou falando para criar do evento e a da capa do
  /// evento"*). `CommunityNetworkEventInput.cover_image` e um
  /// `CommunityNetworkEventCoverInput`, e **ele exige os dois campos**:
  /// `upload_id` (do `createNetworkEventCoverUploadIntent`) e `alt_text`
  /// (`minLength: 2`, `maxLength: 150`), com a razao escrita no contrato --
  /// *"a imagem sem texto alternativo e a imagem que nao existe para quem usa
  /// leitor de tela"*.
  ///
  /// **Um caminho de confirmacao, e so um.** A capa e confirmada no mesmo
  /// `POST` que cria o encontro, como a foto da pessoa e confirmada no mesmo
  /// `PATCH /v1/me` do nome. Era o argumento que fez `FotoDoUsuario` ser
  /// removida: dois caminhos de confirmacao da mesma foto divergem na primeira
  /// edicao.
  ///
  /// Sem capa o campo **nao entra no corpo** (o esquema e
  /// `additionalProperties: false`, e `cover_image: null` so existe no PATCH,
  /// onde significa "tira a capa"); o encontro sem capa e estado normal, e
  /// `cover_image_url` sai nulo.
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
    String? capaUploadId,
    String? textoAlternativoDaCapa,
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
      // Os DOIS, ou nenhum: `CommunityNetworkEventCoverInput` declara
      // `required: [upload_id, alt_text]`. Mandar so o `upload_id` e um `400`
      // depois de a pessoa ter escolhido a foto e esperado o envio.
      if (capaUploadId != null &&
          capaUploadId.isNotEmpty &&
          textoAlternativoDaCapa != null &&
          textoAlternativoDaCapa.isNotEmpty)
        'cover_image': <String, dynamic>{
          'upload_id': capaUploadId,
          'alt_text': textoAlternativoDaCapa,
        },
    };
  }

  /// `POST /v1/media/network-event-cover-intents`
  /// (`createNetworkEventCoverUploadIntent`), com conta.
  ///
  /// **O corpo e `content_type` e `byte_size`, e nada mais.**
  /// `NetworkEventCoverIntentInput` e `additionalProperties: false` e **nao
  /// declara `purpose`**: o proposito (`network_event`) e fixado pela ROTA, e a
  /// razao esta escrita no proprio contrato -- *"deixar o cliente escolhe-lo
  /// seria deixa-lo pedir uma autorizacao de imagem de produto por uma rota do
  /// app"*.
  ///
  /// **Medido contra a homologacao em 19/10/2026** (commit `458cd005`): a
  /// intencao desta rota nasce no prefixo `events/`
  /// (`events/original/qdJO39PNSnUqeRFILHv8hA`), e a da vitrine no prefixo
  /// `people/` -- os dois prefixos sao a cara dos dois `purpose`, e e por isso
  /// que a troca de rota e visivel sem abrir o banco. No servidor,
  /// `kysely-network-repository.ts` grava `purpose: 'network_event'` literal.
  ///
  /// O enum de `content_type` desta rota **nao tem HEIC** (so `image/jpeg`,
  /// `image/png` e `image/webp`), ao contrario do da foto de pet e do da
  /// vitrine: quem chama recusa por `tiposDeFotoAceitosSemHeic` ANTES de
  /// enviar, em vez de pagar a subida para ouvir `400`.
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
  ///
  /// **Devolve o encontro criado, e ele JA esta em publico**: a resposta e
  /// `NetworkEventPublic`, a mesma forma de `getNetworkEvent`, e por isso a
  /// tela desenha o resultado com o que recebeu em vez de pedir de novo.
  ///
  /// Nao trata recusa: `contact-channel-unverified` e
  /// `community-event-limit-reached` sobem como `FalhaDaApi` e a tela os
  /// distingue por `ProblemTipo`. Um `catch` aqui apagaria justamente a
  /// diferenca entre "confirme seu e-mail" e "cancele um encontro".
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

  /// `POST /v1/network/events/{eventSlug}/cancellation`
  /// (`cancelNetworkEvent`), com conta.
  ///
  /// **Cancelar nao e apagar**: `status` vira `cancelled` e o encontro
  /// continua visivel na agenda ate o fim previsto, porque quem ia precisa
  /// descobrir que nao vai mais acontecer.
  ///
  /// [ifMatch] e o `ETag` da ultima leitura e e OBRIGATORIO pelo contrato.
  ///
  /// **A FONTE DELE AGORA EXISTE, e e [meuEncontro]** (`getMyNetworkEvent`,
  /// 19/10/2026). Era este o buraco: medido contra homologacao, nenhuma leitura
  /// da secao `Rede` devolvia `ETag` -- nem `listNetworkEvents`, nem
  /// `getNetworkEvent`, nem o `201` de `createNetworkEvent` --, e as unicas que
  /// o emitiam eram as duas ESCRITAS. Um valor que so a escrita entrega nao
  /// autoriza a PRIMEIRA escrita, e por isso o primeiro cancelamento era
  /// impossivel por construcao.
  ///
  /// Este metodo continua RECEBENDO o valor em vez de busca-lo: quem le a
  /// versao e a folha de confirmacao, no instante em que ela abre, e e aquela
  /// leitura que a pessoa esta confirmando. Buscar aqui dentro reliria o
  /// encontro DEPOIS de a pessoa ter decidido, e um `If-Match` sempre fresco
  /// nunca daria 412 -- a trava de concorrencia existiria e nao travaria nada.
  ///
  /// [nota] e o motivo e vai **so para a trilha**: o app nao mostra motivo de
  /// cancelamento (`CommunityNetworkEventCancellation`, 2 a 280 caracteres).
  ///
  /// Nao trata recusa, pela mesma razao de [criar]: `412`
  /// (`precondition-failed`, alguem salvou depois de voce ter lido), `428`
  /// (`precondition-required`, o app deixou de mandar a versao) e `404`
  /// (encontro de outra pessoa, que pela ADR-0021 NAO e 403) sobem como
  /// `FalhaDaApi` e quem chama os distingue por `ProblemTipo`. Os quatro
  /// caminhos foram medidos em homologacao.
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
  ///
  /// A lista do DONO: os encontros que esta conta criou. **A autoria mora na
  /// clausula `WHERE` do servidor** (ADR-0021) e nao ha parametro de autoria --
  /// nao existe forma de pedir a lista de outra pessoa. Por isso este metodo
  /// nao recebe conta nenhuma: quem decide e o token.
  ///
  /// Lista vazia e estado NORMAL (quem nunca criou encontro), e nao falha. Quem
  /// chama distingue as duas pelo tipo: `FalhaDeChamada` sobe.
  Future<PaginaDeMeusEncontros> meusEncontros({int pagina = 1, int limite = 20}) async {
    final json = await _api.get(
      '/network/my-events',
      query: <String, String>{'page': '$pagina', 'limit': '$limite'},
    );
    return _ler(() => PaginaDeMeusEncontros.doJson(json));
  }

  /// `GET /v1/network/my-events/{eventSlug}` (`getMyNetworkEvent`), com conta.
  ///
  /// **A FONTE DO `ETag` DA REDE.** Esta e a unica leitura da secao que emite o
  /// cabecalho, e e por isso que ela existe: sem ela [cancelar] nao tinha de
  /// onde tirar a versao que o `If-Match` exige.
  ///
  /// `null` no 404, que e o mesmo corpo para encontro inexistente, de outra
  /// pessoa, do painel e removido (ADR-0021, nunca 403): a tela trata os quatro
  /// como "este encontro nao esta mais na sua conta", que e verdade nos quatro.
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

  /// O caminho da leitura do DONO. Mesmo cuidado de [_caminho]: o `slug` vem da
  /// resposta do servidor e vai codificado.
  static String _caminhoDoMeu(String slug) =>
      '/network/my-events/${Uri.encodeComponent(slug)}';
}
