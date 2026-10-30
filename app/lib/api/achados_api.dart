import 'api_client.dart';
import 'envio_de_foto.dart';
import 'modelos_achado.dart';
import 'modelos_localizacao.dart';
import 'modelos_pet.dart';

/// As operacoes de achado avulso do contrato (`tags: [found]`).
class AchadosApi implements IntencaoDeFotoDeAchado {
  const AchadosApi(this._api);

  final ApiClient _api;

  /// O caminho de `createStrayFoundReport`, relativo a `/v1`.
  static const String caminhoDeRegistro = '/found-reports';

  /// `StrayFoundReportInput`, campo a campo como o contrato o declara.
  static Map<String, dynamic> corpoDeRegistro({
    required Especie especie,
    required Porte porte,
    required DateTime achadoEm,
    required Onde onde,
    Sexo? sexo,
    String? racaCodigo,
    String? corCodigo,
    String? versaoDaReferencia,
    String? observacao,
    String? shareToken,
  }) {
    String? semVazio(String? valor) {
      final limpo = valor?.trim();
      return (limpo == null || limpo.isEmpty) ? null : limpo;
    }

    final raca = semVazio(racaCodigo);
    final cor = semVazio(corCodigo);
    final versao = semVazio(versaoDaReferencia);
    final notas = semVazio(observacao);
    final token = semVazio(shareToken);

    return <String, dynamic>{
      'species': especie.valor,
      'size': porte.valor,
      'found_at': achadoEm.toUtc().toIso8601String(),
      ...onde.noAchado,
      'sex': ?sexo?.valor,
      'breed_code': ?raca,
      'primary_color_code': ?cor,
      'ref_data_version': ?versao,
      'notes': ?notas,
      'share_token': ?token,
    };
  }

  /// `POST /found-reports` (`createStrayFoundReport`).
  Future<AchadoRegistrado> registrar({
    required Map<String, dynamic> corpo,
    required String idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDeRegistro,
      corpo: corpo,
      idempotencyKey: idempotencyKey,
    );
    return AchadoRegistrado.doJson(json);
  }

  /// `GET /found-reports` (`listMyFoundReports`): **os meus achados**.
  Future<PaginaDeAchados> listarMeus({String? cursor, int limite = 20}) async {
    final json = await _api.get(
      caminhoDeRegistro,
      query: <String, String>{
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        'limit': '$limite',
      },
    );
    return PaginaDeAchados.doJson(json);
  }

  /// `GET /found-reports/{foundReportId}` (`getFoundReport`).
  Future<AchadoRegistrado> buscar(String achadoId) async {
    final json = await _api.get('/found-reports/${Uri.encodeComponent(achadoId)}');
    return AchadoRegistrado.doJson(json);
  }
  /// `POST /media/found-report-photo-intents`.
  @override
  Future<Map<String, dynamic>> intencaoDeFotoDoAchado({
    required String foundReportId,
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) {
    return _api.post(
      '/media/found-report-photo-intents',
      corpo: <String, dynamic>{
        'found_report_id': foundReportId,
        'content_type': tipoDeConteudo,
        'byte_size': tamanhoEmBytes,
      },
    );
  }
}
