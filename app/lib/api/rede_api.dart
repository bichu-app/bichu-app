import 'api_client.dart';
import 'falhas.dart';
import 'modelos_rede.dart';

/// As operacoes da secao `Rede` que o app consome (`tags: [network]`).
///
/// **A escrita da comunidade entrou em 17/10/2026** (ADR-0025 emenda 3): a
/// pessoa cria o proprio encontro por `createNetworkEvent`, e ele nasce
/// `published`, sem fila de revisao. Editar e cancelar o proprio existem no
/// contrato (`updateNetworkEvent` e `cancelNetworkEvent`) e **nao estao aqui**:
/// os dois exigem `If-Match`, e `ApiClient.patch` nao envia cabecalho hoje.
/// Declarar os metodos sem o cabecalho produziria 428 em toda chamada, que e
/// pior que a ausencia -- ver o relato da entrega.
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
    };
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
