import 'api_client.dart';
import 'modelos_notificacao.dart';

/// As SEIS operacoes `tags: [me]` da CAIXA DE NOTIFICACOES.
///
/// ---------------------------------------------------------------------------
/// ## As duas marcacoes sao SEPARADAS, e e isso que a tela promete
///
/// `markNotificationsListSeen` (`/me/notifications/seen`) zera o contador e
/// **nao marca nada como lido**. `markNotificationRead` marca UM item, e e o
/// que acontece quando a pessoa abre a linha. A separacao esta no contrato por
/// requisito, e e ela que torna "abrir a lista nao marca os itens"
/// verificavel: se as duas fossem a mesma chamada, a frase seria so uma
/// opiniao sobre o codigo.
///
/// `listNotifications` e `GET` e **nao zera nada**. Quem zera e o `POST`
/// acima, porque `GET` que escreve e `GET` que nao pode ser repetido nem
/// cacheado.
///
/// ## O NUMERO nao se calcula aqui
///
/// [contar] e a unica fonte do numero do sino. Esta classe nao soma `read` dos
/// itens carregados e nao deve passar a somar: uma contagem feita no aparelho
/// divergiria entre dois aparelhos da mesma pessoa -- em um deles a caixa foi
/// aberta e no outro nao --, e o numero certo e o que o servidor sabe. A
/// pagina ja traz `unread_total` para quem desenha a lista nao precisar de uma
/// segunda chamada.
///
/// ## Nenhuma delas trata falha
///
/// `400`, `401`, `404` e `429` sobem como `FalhaDeChamada`, e quem chama
/// decide o texto. Em especial, [listar] **nao devolve pagina vazia quando a
/// chamada quebra**: quem chama precisa distinguir "voce nao tem avisos" de
/// "nao consegui perguntar", e um `catch` que devolvesse lista vazia produzira
/// o estado vazio que parece sucesso -- e aqui ele diria, a quem tem trinta
/// avisos, que nao tem nenhum.
///
/// E `404` continua `404` (ADR-0021): aviso de outra conta responde `404` e
/// nunca `403`, porque a autorizacao e a propria clausula `WHERE` do servidor
/// e um `403` confirmaria que aquele `ref` existe.
///
/// ## Sem `Idempotency-Key`, e por que
///
/// Nenhum destes `POST` cria recurso: `seen` e `read` sao idempotentes por
/// definicao do contrato (chamar duas vezes deixa o mesmo estado e responde
/// `204` nas duas) e `read-all` tambem -- a segunda chamada marca zero. A
/// chave existe para a criacao que pode ser reenviada, e por aqui nao ha
/// nenhuma.
class NotificacoesApi {
  const NotificacoesApi(this._api);

  final ApiClient _api;

  static const String _caminho = '/me/notifications';

  /// O teto de `limit` no contrato, e o default da pagina. Escrito aqui para a
  /// tela nao repetir o numero.
  static const int tamanhoDaPagina = 30;

  /// `GET /v1/me/notifications` (`listNotifications`).
  ///
  /// A ordem e a do servidor, decrescente de quando o fato aconteceu, e a
  /// retencao e de 90 dias. Esta camada nao reordena e nao filtra: nao ha
  /// busca, filtro nem ordenacao nesta caixa, e um recorte em memoria seria a
  /// unica forma de mentir no `total`.
  Future<PaginaDaCaixa> listar({
    int pagina = 1,
    int tamanho = tamanhoDaPagina,
  }) async {
    final json = await _api.get(
      _caminho,
      query: <String, String>{'page': '$pagina', 'limit': '$tamanho'},
    );
    return PaginaDaCaixa.doJson(json);
  }

  /// `GET /v1/me/notifications/count` (`getNotificationCount`) -- o numero do
  /// sino.
  ///
  /// Operacao propria, e nao um campo de outra leitura, porque a barra de topo
  /// vive em toda tela e nao pode pagar uma pagina de 30 linhas para desenhar
  /// um numero.
  Future<ContagemDeAvisos> contar() async {
    final json = await _api.get('$_caminho/count');
    return ContagemDeAvisos.doJson(json);
  }

  /// `POST /v1/me/notifications/seen` (`markNotificationsListSeen`) -- a lista
  /// foi aberta.
  ///
  /// **Zera o contador e nao marca item nenhum.** Responde `204`, e por isso
  /// nao ha corpo para ler.
  Future<void> marcarListaVista() async {
    await _api.post('$_caminho/seen');
  }

  /// `POST /v1/me/notifications/read-all` (`markAllNotificationsRead`).
  ///
  /// Devolve quantas linhas foram marcadas. O numero existe para a tela poder
  /// dizer o que fez; ele **nao** e usado para calcular contador nenhum.
  Future<int> marcarTodasComoLidas() async {
    final json = await _api.post('$_caminho/read-all');
    return json['marked'] as int? ?? 0;
  }

  /// `POST /v1/me/notifications/{notificationRef}/read`
  /// (`markNotificationRead`) -- o item foi aberto.
  ///
  /// `Uri.encodeComponent` porque o `ref` vem da RESPOSTA do servidor e nao da
  /// tela: montar caminho com interpolacao crua e como um `ref` inesperado
  /// vira uma rota que nao existe.
  Future<void> marcarComoLido(String ref) async {
    await _api.post('$_caminho/${Uri.encodeComponent(ref)}/read');
  }

  /// `POST /v1/me/notifications/{notificationRef}/dismiss`
  /// (`dismissNotification`) -- o "x" da linha, pedido pelo cliente em
  /// 20/10/2026.
  ///
  /// **DISPENSAR NAO E MARCAR COMO LIDA, e esta classe nao encadeia as duas.**
  /// [marcarComoLido] tira o aviso do contador e o deixa na lista; esta tira a
  /// linha da LISTA e **nao** a marca como lida. Chamar as duas aqui faria o
  /// app perder a unica forma de limpar a lista sem afirmar que leu -- e
  /// dispensar sem ter lido e o caso comum, porque quem limpa a lista nao abre
  /// cada linha antes.
  ///
  /// **Dispensa a LINHA inteira**, inclusive quando ela resume varios avisos:
  /// o recorte do grupo e do servidor, pela mesma chave de agrupamento da
  /// listagem. Sem isso a linha agrupada voltaria na listagem seguinte com
  /// outro `ref`, e teria sumido da tela para reaparecer no recarregamento.
  ///
  /// Idempotente por contrato: dispensar duas vezes responde `204` nas duas.
  /// `Uri.encodeComponent` pela mesma razao de [marcarComoLido].
  Future<void> dispensar(String ref) async {
    await _api.post('$_caminho/${Uri.encodeComponent(ref)}/dismiss');
  }
}
