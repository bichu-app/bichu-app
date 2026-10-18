import 'api_client.dart';
import 'falhas.dart';
import 'modelos_conversa.dart';

/// As operacoes da conversa mediada que o app consome (`tags: [conversations]`).
///
/// ---------------------------------------------------------------------------
/// ## O buraco que este arquivo fecha
///
/// O servidor tem a conversa mediada **no ar** desde antes desta historia:
/// `listConversations`, `getConversation` e `postConversationMessage`
/// respondem, a redacao de telefone e endereco vale nos dois sentidos, e a
/// conversa nasce do aviso da plaquinha. O que nao existia era o cliente: o
/// app **nao chamava nenhuma das tres**.
///
/// O codigo do servidor diz, por extenso, que a conversa e *"o unico lugar em
/// que o tutor le o que o achador escreve"* -- e esse lugar nao existia no
/// app. O recado de quem acha o pet era gravado, redigido, guardado, e
/// **ninguem podia ler**. E o buraco central do produto, e ele se fecha aqui e
/// nas duas telas de `telas/mensagens/`.
///
/// ---------------------------------------------------------------------------
/// ## Quem leva token
///
/// **As tres levam, e nao ha alternativa sem token.** O contrato declara
/// `security: [bearerAuth]` nas tres e **nenhuma aceita `finderToken`** -- o
/// achador sem conta tem as rotas dele (`/finder/conversation*`), que nao tem
/// id no caminho porque o token dele **e** o endereco. Esta classe nao as
/// chama: elas sao da BICHUS-41 e dependem da decisao sobre as paginas
/// publicas.
///
/// ## O 404 e o desenho, e nao um erro a contornar
///
/// Conversa de outra pessoa responde **404, nunca 403** (ADR-0021): um 403
/// confirmaria que aquele id existe. A autorizacao mora no `WHERE` da consulta
/// do servidor, e [buscar] **nao traduz o 404 em lista vazia** -- ele sobe
/// como [FalhaDaApi] e a tela diz "esta conversa nao esta disponivel". Engolir
/// o 404 faria a tela abrir vazia e girar.
///
/// ## O 410 tambem e o desenho
///
/// [enviar] recusa com `410 conversation-closed` em **tres** situacoes, e o
/// corpo e o mesmo nas tres: a conversa foi encerrada, ela foi bloqueada, ou a
/// **conta do outro lado foi desabilitada**. A fusao e deliberada -- distinguir
/// contaria a uma pessoa o que aconteceu com a conta de outra. A tela trata o
/// 410 com modo leitura e **sem caixa de texto**, e nao como defeito; ver
/// `conversaNaoAceitaMais`.
class ConversasApi {
  const ConversasApi(this._api);

  final ApiClient _api;

  /// O limite que o app pede. O contrato tem o teto; este e o pedido.
  static const int limitePadrao = 20;

  /// `GET /v1/conversations` (`listConversations`) -- as minhas conversas.
  ///
  /// **Cursor, e nunca deslocamento.** O contrato declara `cursor` e `limit`, e
  /// nao ha `offset` nem `page`: a lista e ordenada por tempo e uma mensagem
  /// nova empurraria tudo uma casa entre a pagina 1 e a pagina 2.
  ///
  /// `cursor` nulo pede a **primeira** pagina. Nao mandar a chave e diferente
  /// de mandar vazia: o servidor valida o cursor, e `cursor=` reprovaria com
  /// 400 na abertura da tela.
  Future<PaginaDeConversas> listar({
    String? cursor,
    int limite = limitePadrao,
  }) async {
    final json = await _api.get(
      '/conversations',
      query: <String, String>{
        'limit': '$limite',
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      },
    );
    return _ler(() => PaginaDeConversas.doJson(json));
  }

  /// `GET /v1/conversations/{conversationId}` (`getConversation`) -- a conversa
  /// e as mensagens dela.
  ///
  /// **404 sobe**, e nao vira nulo nem lista vazia: ver o cabecalho da classe.
  Future<Conversa> buscar(
    String conversaId, {
    String? cursor,
    int limite = limitePadrao,
  }) async {
    final json = await _api.get(
      _caminho(conversaId),
      query: <String, String>{
        'limit': '$limite',
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      },
    );
    final conversa = _ler(() => Conversa.doJson(json));
    if (conversa == null) {
      // `doJson` devolve nulo quando `status` ou `id` nao chegam, ou chegam
      // com valor que este build nao conhece. A tela trata `FormatException`
      // como "resposta fora do contrato"; devolver uma conversa `aberta`
      // inventada desenharia uma caixa de texto que o servidor recusaria.
      throw const FormatException(
        'resposta de conversa fora do contrato: `id` ou `status` ausente, '
        'ou `status` com valor que este build nao conhece',
      );
    }
    return conversa;
  }

  /// `POST /v1/conversations/{conversationId}/messages`
  /// (`postConversationMessage`).
  ///
  /// Devolve a mensagem **ja redigida pelo servidor**, com `redactions`
  /// preenchido: o telefone e o endereco que a pessoa escreveu saem do texto
  /// antes de a outra parte ler. A tela mostra o aviso a partir de
  /// `redactions`, para o remetente nao achar que o texto sumiu sozinho.
  ///
  /// **Nao manda `Idempotency-Key`.** O contrato declara o parametro como
  /// opcional nesta rota, e o app nao tem de onde tirar uma chave estavel: a
  /// mesma pessoa reenviando o mesmo texto de propósito e um caso real numa
  /// conversa, e deduplicar isso comeria a segunda mensagem dela. O reenvio
  /// depois de falha e um **toque da pessoa**, nunca um retry automatico --
  /// ver `TelaDaConversa`.
  Future<MensagemDaConversa> enviar(String conversaId, String texto) async {
    final json = await _api.post(
      '${_caminho(conversaId)}/messages',
      corpo: <String, dynamic>{'body': texto},
    );
    final mensagem = _ler(() => MensagemDaConversa.doJson(json));
    if (mensagem == null) {
      throw const FormatException(
        'resposta de mensagem fora do contrato: `sender_role`, `body` ou '
        '`created_at` ausente',
      );
    }
    return mensagem;
  }

  /// `POST /v1/me/conversations-seen` (`markMyConversationsSeen`).
  ///
  /// **Zera o contador do sino, e NAO marca conversa nenhuma como lida.**
  ///
  /// As duas coisas sao fatos diferentes -- "eu vi que tenho mensagens" e "eu
  /// li esta conversa" --, e e por isso que sao duas chamadas: quem abre a area
  /// para de ver o numero e continua vendo QUAL conversa guarda o recado. Uma
  /// chamada so apagaria a unica pista de onde esta o recado.
  ///
  /// **O aviso de plaquinha lida e o de achado NAO saem do contador por aqui.**
  /// Eles saem quando a conversa deles e aberta, e isso e decidido no servidor
  /// -- o app nao sabe quais sao, e nao precisa saber.
  ///
  /// **A falha e ENGOLIDA de proposito**, e e o unico lugar deste arquivo em
  /// que isso acontece: nao e dado da tela, e a pessoa nao pediu isto. Mostrar
  /// "nao conseguimos marcar como visto" em cima da lista que acabou de
  /// carregar seria um erro sobre uma operacao que ninguem executou. O numero
  /// continua aceso e a proxima abertura tenta de novo, que e o pior desfecho
  /// possivel -- e e aceitavel.
  Future<void> marcarListaVista() async {
    try {
      await _api.post('/me/conversations-seen');
    } on FalhaDeChamada {
      // Ver o doc acima. Nao relanca.
    }
  }

  /// Le uma resposta, e resposta fora do contrato sai como `FormatException`.
  ///
  /// Mesma razao de `RedeApi._ler`: os modelos conferem tipo antes de ler, mas
  /// um campo de tipo inesperado ainda pode estourar `TypeError` num lugar que
  /// ninguem previu, e um `TypeError` escaparia do tratamento das telas e
  /// deixaria a conversa girando.
  static T _ler<T>(T Function() ler) {
    try {
      return ler();
    } on TypeError catch (erro) {
      throw FormatException('resposta da conversa fora do contrato: $erro');
    }
  }

  /// O id vem da resposta do servidor: vai codificado, como nas outras rotas.
  static String _caminho(String conversaId) =>
      '/conversations/${Uri.encodeComponent(conversaId)}';
}
