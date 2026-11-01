import 'api_client.dart';
import 'falhas.dart';
import 'modelos_conversa.dart';
import 'problem.dart';

/// As operacoes da conversa mediada que o app consome (`tags:
/// [conversations]`).
class ConversasApi {
  const ConversasApi(this._api);

  final ApiClient _api;

  /// O limite que o app pede.
  static const int limitePadrao = 20;

  /// O limite da LISTA de conversas: **dez**.
  static const int limiteDaLista = 10;

  /// `GET /v1/conversations` (`listConversations`) -- as minhas conversas.
  Future<PaginaDeConversas> listar({
    String? cursor,
    int limite = limiteDaLista,
    String? termo,
  }) async {
    final buscado = termo?.trim();
    final json = await _api.get(
      '/conversations',
      query: <String, String>{
        'limit': '$limite',
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        if (buscado != null && buscado.isNotEmpty) 'q': buscado,
      },
    );
    return _ler(() => PaginaDeConversas.doJson(json));
  }

  /// `GET /v1/conversations/{conversationId}` (`getConversation`) -- a conversa
  /// e as mensagens dela.
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
      throw const FormatException(
        'resposta de conversa fora do contrato: `id` ou `status` ausente, '
        'ou `status` com valor que este build nao conhece',
      );
    }
    return conversa;
  }

  /// `POST /v1/conversations/{conversationId}/messages`
  /// (`postConversationMessage`).
  Future<MensagemDaConversa> enviar(
    String conversaId,
    String texto, {
    String? fotoUploadId,
  }) async {
    final json = await _api.post(
      '${_caminho(conversaId)}/messages',
      corpo: <String, dynamic>{
        'body': texto,
        if (fotoUploadId != null && fotoUploadId.isNotEmpty)
          'photo_upload_id': fotoUploadId,
      },
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
  Future<void> marcarListaVista() async {
    try {
      await _api.post('/me/conversations-seen');
    } on FalhaDeChamada {
      // Ver o doc acima. Nao relanca.
    }
  }

  /// Le uma resposta, e resposta fora do contrato sai como `FormatException`.
  static T _ler<T>(T Function() ler) {
    try {
      return ler();
    } on TypeError catch (erro) {
      throw FormatException('resposta da conversa fora do contrato: $erro');
    }
  }

  static String _caminho(String conversaId) =>
      '/conversations/${Uri.encodeComponent(conversaId)}';
}

/// A recusa que diz **"a foto ainda nao esta pronta"**, e nao "a foto nao
/// serve".
bool fotoAindaNaoEstaPronta(Problem problem) {
  const List<String> candidatos = <String>[
    'photo-not-ready',
    'upload-not-ready',
    'photo-processing',
  ];
  for (final slug in candidatos) {
    if (problem.tipoUri.endsWith('/$slug')) return true;
  }
  return problem.tipo == ProblemTipo.precondicaoNecessaria ||
      problem.tipo == ProblemTipo.precondicaoFalhou;
}

/// A recusa DEFINITIVA da foto anexada: os bytes nao servem.
bool fotoFoiRecusadaPeloServidor(Problem problem) {
  return problem.tipoUri.endsWith('/photo-rejected');
}
