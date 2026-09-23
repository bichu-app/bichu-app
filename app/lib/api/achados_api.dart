import 'api_client.dart';
import 'envio_de_foto.dart';
import 'modelos_achado.dart';
import 'modelos_localizacao.dart';
import 'modelos_pet.dart';

/// As operacoes de achado avulso do contrato (`tags: [found]`).
///
/// Escrita contra `api/openapi.yaml`, que e a autoridade. O backend das quatro
/// rotas existe (`src/modules/found/`), e esta classe **nao** foi escrita
/// contra ele: onde os dois divergirem, quem esta errado e o codigo, e nao o
/// documento.
///
/// ## O corpo sai por uma funcao propria, e o motivo e a fila
///
/// [corpoDeRegistro] existe separada de [registrar] porque o mesmo corpo tem
/// dois destinos: a rede, agora, e **a fila offline**, quando nao ha sinal. Se
/// a fila montasse um corpo proprio, o achado enfileirado na rua poderia sair
/// diferente do que sairia com sinal, e a diferenca so apareceria no dia em
/// que alguem mexesse num dos dois. O mesmo vale para [caminhoDeRegistro].
class AchadosApi implements IntencaoDeFotoDeAchado {
  const AchadosApi(this._api);

  final ApiClient _api;

  /// O caminho de `createStrayFoundReport`, relativo a `/v1`.
  ///
  /// Caminho e nao URL: a fila offline grava o caminho e a base vem da
  /// configuracao na hora do envio. Uma URL gravada carregaria o ambiente do
  /// dia em que a acao foi enfileirada.
  static const String caminhoDeRegistro = '/found-reports';

  /// `StrayFoundReportInput`, campo a campo como o contrato o declara.
  ///
  /// **Os quatro obrigatorios entram sempre; o resto so entra preenchido.**
  /// Mandar `breed_code: null` num corpo de criacao seria dizer "a raca e
  /// nula" onde o contrato le "nao informado", e o `anyOf` do `onde` recusaria
  /// um objeto vazio.
  ///
  /// **`photo_upload_id` nao entra, e a ausencia e leitura do contrato, nao
  /// esquecimento.** Para existir um `upload_id` de foto de achado e preciso
  /// chamar `createFoundReportPhotoUploadIntent`, que exige `found_report_id`
  /// no corpo: nao ha valor valido para este campo ANTES da chamada que o
  /// recebe. A foto vem depois, sempre, e e isso que o criterio 4 descreve.
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
      // UTC: o servidor recusa data no futuro comparando com o relogio dele, e
      // um instante sem fuso seria lido como local do servidor.
      'found_at': achadoEm.toUtc().toIso8601String(),
      // `location`, `area`, ou as duas. O `anyOf` do contrato exige **ao menos
      // uma**, e nao no maximo uma: quem concedeu o GPS e digitou o bairro
      // manda as duas, e e assim que o achado aparece com rotulo de area sem
      // ninguem ter convertido coordenada em nome de bairro.
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
  ///
  /// A chave de idempotencia e **obrigatoria e vem de fora**. Ela vem de fora
  /// porque o reenvio -- pela fila offline ou pelo `Tentar de novo` da tela --
  /// precisa usar **a chave da primeira tentativa** (criterio 13 da
  /// BICHUS-31). Gerada aqui dentro, cada reenvio seria um achado novo, e a
  /// mesma tutora receberia a mesma sugestao tres vezes.
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

  /// `GET /found-reports/{foundReportId}` (`getFoundReport`).
  ///
  /// **A autorizacao esta na clausula `WHERE` do servidor, e a resposta de
  /// "nao e seu" e 404** (ADR-0021): um 403 confirmaria que aquele
  /// identificador e um achado de verdade. O app nao tenta distinguir "nao
  /// existe" de "nao e seu", e **nao deve**: distinguir as duas confirmaria a
  /// existencia do registro para quem nao e o dono.
  Future<AchadoRegistrado> buscar(String achadoId) async {
    final json = await _api.get('/found-reports/${Uri.encodeComponent(achadoId)}');
    return AchadoRegistrado.doJson(json);
  }
  /// `POST /media/found-report-photo-intents`.
  ///
  /// **O `found_report_id` e obrigatorio no corpo, e isso fixa a ordem.** O
  /// aviso do achado tem de existir antes de a foto poder subir: nao ha valor
  /// valido para `photo_upload_id` de `StrayFoundReportInput` antes desta
  /// chamada, porque e ela quem o emite. Registrar primeiro e subir depois nao
  /// e escolha de implementacao, e o unico caminho que o contrato deixa.
  ///
  /// Limites proprios, mais estreitos que os do tutor (SEC-009): tres fotos por
  /// aviso, para sempre, e 2 MB por foto. O estouro responde 429, e nao 400.
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
