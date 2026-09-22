/// As operacoes de `tags: [found]` do contrato que este build alcanca.
///
/// **Hoje ha uma so, e e deliberado.** A tela do achado avulso (F3.5,
/// BICHUS-35) nao existe neste app -- e `app/test/api/achado_aceita_o_que_da_
/// para_ver_test.dart` cobra por nome que ela continue nao existindo ate a
/// historia dela chegar. O que entra aqui agora e o unico pedaco que o
/// mecanismo de envio de foto precisa para servir aos DOIS consumidores em vez
/// de um: a rota de intencao de foto do achado.
///
/// Escrever o envio so para o pet criaria a segunda copia do mecanismo no dia
/// em que F3.5 chegar. Com esta rota em pe, o que F3.5 precisa fazer e montar
/// [FotoDeAchado] e chamar `EnvioDeFoto.enviar` -- nada de caminho novo de
/// bytes.
library;

import 'api_client.dart';
import 'envio_de_foto.dart';

class AchadosApi implements IntencaoDeFotoDeAchado {
  const AchadosApi(this._api);

  final ApiClient _api;

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
