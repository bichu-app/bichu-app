import 'api_client.dart';
import 'modelos_caso.dart';

/// As operacoes de caso de perdido do contrato (`tags: [lost]`).
class CasosApi {
  const CasosApi(this._api);

  final ApiClient _api;

  /// `GET /pets/{petId}/lost-case-preview` (`previewLostCaseReach`).
  Future<PreviaDoAlcance> previaDoAlcance(String petId) async {
    final json = await _api.get('/pets/$petId/lost-case-preview');
    return PreviaDoAlcance.doJson(json);
  }

  /// O caminho de `openLostCase`, relativo a `/v1`.
  static String caminhoDeAbertura(String petId) => '/pets/$petId/lost-cases';

  /// `LostCaseInput`, campo a campo como o contrato declara.
  static Map<String, dynamic> corpoDeAbertura({
    required DateTime vistoEm,
    required AreaDoAvistamento area,
    String? descricao,
    bool compartilharNaListaPublica = true,
  }) {
    return <String, dynamic>{
      'last_seen_at': vistoEm.toUtc().toIso8601String(),
      'last_seen_area': area.paraJson(),
      if (descricao != null && descricao.trim().isNotEmpty)
        'description': descricao.trim(),
      'share_to_public_list': compartilharNaListaPublica,
    };
  }

  /// `POST /pets/{petId}/lost-cases` (`openLostCase`).
  Future<CasoDePerdido> abrirCaso({
    required String petId,
    required Map<String, dynamic> corpo,
    required String idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDeAbertura(petId),
      corpo: corpo,
      idempotencyKey: idempotencyKey,
    );
    return CasoDePerdido.doJson(json);
  }

  /// `GET /lost-cases/{caseId}` (`getLostCase`).
  Future<CasoDePerdido> buscarCaso(String caseId) async {
    final json = await _api.get('/lost-cases/$caseId');
    return CasoDePerdido.doJson(json);
  }

  /// `GET /lost-cases/{caseId}/candidates` (`listLostCaseCandidates`).
  Future<PaginaDeCandidatos> candidatos(
    String caseId, {
    String? cursor,
    int? limite,
  }) async {
    final json = await _api.get(
      '/lost-cases/$caseId/candidates',
      query: <String, String>{
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        if (limite != null) 'limit': limite.toString(),
      },
    );
    return PaginaDeCandidatos.doJson(json);
  }

  /// `PATCH /lost-cases/{caseId}` (`updateLostCase`).
  Future<CasoDePerdido> corrigirOndeEQuando({
    required String caseId,
    required Map<String, dynamic> corpo,
  }) async {
    final json = await _api.patch('/lost-cases/$caseId', corpo: corpo);
    return CasoDePerdido.doJson(json);
  }

  /// `POST /lost-cases/{caseId}/alerts` (`resendLostCaseAlert`).
  Future<DisparoDoAlerta> reenviarAlerta(String caseId) async {
    final json = await _api.post('/lost-cases/$caseId/alerts');
    return DisparoDoAlerta.doJson(json);
  }

  /// `POST /lost-cases/{caseId}/close` (`closeLostCase`).
  Future<CasoDePerdido> encerrarCaso({
    required String caseId,
    required DesfechoDoCaso desfecho,
    CanalDoReencontro? canal,
    String? observacao,
  }) async {
    final json = await _api.post(
      '/lost-cases/$caseId/close',
      corpo: <String, dynamic>{
        'outcome': desfecho.valor,
        if (canal != null) 'reunion_channel': canal.valor,
        if (observacao != null && observacao.trim().isNotEmpty)
          'note': observacao.trim(),
      },
    );
    return CasoDePerdido.doJson(json);
  }

  /// `POST /lost-cases/{caseId}/reopen` (`reopenLostCase`).
  Future<CasoDePerdido> reabrirCaso(String caseId) async {
    final json = await _api.post('/lost-cases/$caseId/reopen');
    return CasoDePerdido.doJson(json);
  }
}
