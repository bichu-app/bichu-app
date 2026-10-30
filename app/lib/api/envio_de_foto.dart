/// O caminho pelo qual os bytes de uma foto saem do aparelho.
library;

import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../dispositivo/camera_e_galeria.dart';
import 'falhas.dart';

/// `#/components/schemas/UploadIntent` do contrato.
class AutorizacaoDeEnvio {
  const AutorizacaoDeEnvio({
    required this.uploadId,
    required this.metodo,
    required this.url,
    this.campos = const <String, String>{},
    this.cabecalhos = const <String, String>{},
    this.expiraEm,
    this.maxBytes,
  });

  final String uploadId;

  /// `POST` ou `PUT`, como o servidor mandou.
  final String metodo;

  final Uri url;

  /// Campos do formulario assinado.
  final Map<String, String> campos;

  /// Cabecalhos assinados, enviados **sem alterar**.
  final Map<String, String> cabecalhos;

  final DateTime? expiraEm;
  final int? maxBytes;

  /// Le a resposta do contrato.
  factory AutorizacaoDeEnvio.doJson(Map<String, dynamic> json) {
    final url = json['url'];
    final uploadId = json['upload_id'];
    if (url is! String || url.isEmpty || uploadId is! String || uploadId.isEmpty) {
      throw FormatException(
        'A autorizacao de envio veio sem `url` ou sem `upload_id`. O contrato '
        'declara os dois como obrigatorios em `UploadIntent`.',
        json.toString(),
      );
    }
    final destino = Uri.tryParse(url);
    if (destino == null || !destino.hasScheme) {
      throw FormatException('`url` da autorizacao nao e um endereco', url);
    }
    return AutorizacaoDeEnvio(
      uploadId: uploadId,
      metodo: (json['method'] as String? ?? 'POST').toUpperCase(),
      url: destino,
      campos: _textos(json['fields']),
      cabecalhos: _textos(json['headers']),
      expiraEm: json['expires_at'] is String
          ? DateTime.tryParse(json['expires_at'] as String)
          : null,
      maxBytes: json['max_bytes'] as int?,
    );
  }

  static Map<String, String> _textos(Object? bruto) {
    if (bruto is! Map) return const <String, String>{};
    return <String, String>{
      for (final entrada in bruto.entries)
        '${entrada.key}': '${entrada.value}',
    };
  }
}

/// De quem e a foto: o que muda entre os tres consumidores, e so isso.
abstract class DestinoDaFoto {
  /// Pede as credenciais de upload ao servidor.
  Future<AutorizacaoDeEnvio> pedirAutorizacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  });

  /// O terceiro passo, quando ele existe.
  Future<void> confirmar(String uploadId);
}

/// A foto do pet: intencao com `pet_id`, e confirmacao.
class FotoDePet implements DestinoDaFoto {
  const FotoDePet({required this.api, required this.petId});

  /// `PetsApi`, injetada como interface estreita para esta classe nao puxar o
  /// modulo inteiro de pets para dentro do mecanismo de envio.
  final IntencaoEConfirmacaoDePet api;
  final String petId;

  @override
  Future<AutorizacaoDeEnvio> pedirAutorizacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) async {
    return AutorizacaoDeEnvio.doJson(
      await api.intencaoDeFotoDoPet(
        petId: petId,
        tipoDeConteudo: tipoDeConteudo,
        tamanhoEmBytes: tamanhoEmBytes,
      ),
    );
  }

  /// `POST /pets/{petId}/photos`.
  @override
  Future<void> confirmar(String uploadId) {
    return api.confirmarFotoDoPet(petId: petId, uploadId: uploadId);
  }
}

/// A foto do achado avulso: intencao com `found_report_id`, sem confirmacao.
class FotoDeAchado implements DestinoDaFoto {
  const FotoDeAchado({required this.api, required this.foundReportId});

  final IntencaoDeFotoDeAchado api;
  final String foundReportId;

  @override
  Future<AutorizacaoDeEnvio> pedirAutorizacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) async {
    return AutorizacaoDeEnvio.doJson(
      await api.intencaoDeFotoDoAchado(
        foundReportId: foundReportId,
        tipoDeConteudo: tipoDeConteudo,
        tamanhoEmBytes: tamanhoEmBytes,
      ),
    );
  }

  /// **Nao ha o que confirmar, e isso e do contrato e nao esquecimento.**
  @override
  Future<void> confirmar(String uploadId) async {}
}

/// Um destino que **envia os bytes e nao confirma nada** -- quem confirma e o
/// `Salvar` do formulario.
class EnvioParaConfirmarDepois implements DestinoDaFoto {
  EnvioParaConfirmarDepois({required this.pedir});

  /// A rota de intencao, passada como funcao.
  final Future<Map<String, dynamic>> Function({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) pedir;

  /// O identificador que o formulario vai confirmar, ou nulo enquanto os bytes
  /// nao chegaram.
  String? uploadId;

  @override
  Future<AutorizacaoDeEnvio> pedirAutorizacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) async {
    return AutorizacaoDeEnvio.doJson(
      await pedir(
        tipoDeConteudo: tipoDeConteudo,
        tamanhoEmBytes: tamanhoEmBytes,
      ),
    );
  }

  /// **Nao fala com a rede**, e guardar aqui e o contrato desta classe.
  @override
  Future<void> confirmar(String uploadId) async {
    this.uploadId = uploadId;
  }
}

/// O que `MeApi` precisa expor para a foto da propria pessoa.
abstract class IntencaoDeFotoDoUsuario {
  Future<Map<String, dynamic>> intencaoDeFotoDoUsuario({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  });
}

/// O que `PetsApi` precisa expor para ser um destino.
abstract class IntencaoEConfirmacaoDePet {
  Future<Map<String, dynamic>> intencaoDeFotoDoPet({
    required String petId,
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  });

  Future<void> confirmarFotoDoPet({
    required String petId,
    required String uploadId,
    bool comoPrincipal,
  });
}

/// O mesmo, do lado do achado.
abstract class IntencaoDeFotoDeAchado {
  Future<Map<String, dynamic>> intencaoDeFotoDoAchado({
    required String foundReportId,
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  });
}

/// Local: desfecho de uma tentativa de envio, decidido no aparelho.
enum DesfechoDoEnvio {
  /// Os bytes chegaram no armazenamento e a confirmacao (quando existe) saiu.
  enviada,

  /// Faltou rede em algum dos tres passos.
  semSinal,

  /// O servidor ou o armazenamento recusaram.
  recusada,
}

/// O mecanismo. Tres passos, tres consumidores, uma copia.
class EnvioDeFoto {
  EnvioDeFoto({
    required this.camera,
    http.Client? cliente,
    this.tempoLimite = const Duration(seconds: 60),
  }) : _cliente = cliente ?? http.Client();

  /// De onde saem os bytes. E a MESMA porta que escolheu a foto: ler o arquivo
  /// que o seletor produziu e trabalho do aparelho, e e o que permite o teste
  /// de widget exercitar o envio inteiro sem disco de aparelho.
  final CameraEGaleria camera;

  /// **Um cliente proprio, e nao o da [ApiClient].** Ele nao conhece o token da
  /// sessao, entao nao ha como a credencial sair junto dos bytes para um host
  /// que o servidor nomeou.
  final http.Client _cliente;

  /// Mais folgado que o da API de proposito: aqui sobe um arquivo de megabytes
  /// por rede de celular, e 20 s derrubaria envio que ia dar certo.
  final Duration tempoLimite;

  /// [aoProgredir] recebe **bytes do arquivo entregues ao socket**, e o total,
  /// a cada 64 KiB.
  Future<DesfechoDoEnvio> enviar({
    required FotoLocal foto,
    required DestinoDaFoto destino,
    ProgressoDeEnvio? aoProgredir,
  }) async {
    final Uint8List bytes;
    try {
      bytes = await camera.bytesDaFoto(foto);
    } on Object {
      return DesfechoDoEnvio.recusada;
    }
    if (bytes.isEmpty) return DesfechoDoEnvio.recusada;

    final AutorizacaoDeEnvio autorizacao;
    try {
      autorizacao = await destino.pedirAutorizacao(
        tipoDeConteudo: foto.tipoDeConteudo,
        tamanhoEmBytes: bytes.length,
      );
    } on FalhaDeConexao {
      return DesfechoDoEnvio.semSinal;
    } on FalhaDeTempo {
      return DesfechoDoEnvio.semSinal;
    } on Object {
      return DesfechoDoEnvio.recusada;
    }

    final subiu = await _subirOsBytes(
      autorizacao,
      bytes,
      foto.tipoDeConteudo,
      aoProgredir,
    );
    if (subiu != DesfechoDoEnvio.enviada) return subiu;

    try {
      await destino.confirmar(autorizacao.uploadId);
    } on FalhaDeConexao {
      return DesfechoDoEnvio.semSinal;
    } on FalhaDeTempo {
      return DesfechoDoEnvio.semSinal;
    } on Object {
      return DesfechoDoEnvio.recusada;
    }

    return DesfechoDoEnvio.enviada;
  }

  Future<DesfechoDoEnvio> _subirOsBytes(
    AutorizacaoDeEnvio autorizacao,
    Uint8List bytes,
    String tipoDeConteudo,
    ProgressoDeEnvio? aoProgredir,
  ) async {
    aoProgredir?.call(0, bytes.length);

    final http.BaseRequest requisicao;
    if (autorizacao.metodo == 'PUT') {
      requisicao = _CorpoMedido(
        'PUT',
        autorizacao.url,
        _emPedacos(bytes, aoProgredir),
        bytes.length,
      )..headers.addAll(autorizacao.cabecalhos);
    } else {
      requisicao = http.MultipartRequest('POST', autorizacao.url)
        ..fields.addAll(autorizacao.campos)
        ..files.add(
          http.MultipartFile(
            'file',
            _emPedacos(bytes, aoProgredir),
            bytes.length,
            filename: 'foto',
          ),
        );
    }

    late final http.StreamedResponse resposta;
    try {
      resposta = await _cliente.send(requisicao).timeout(tempoLimite);
    } on TimeoutException {
      return DesfechoDoEnvio.semSinal;
    } on http.ClientException {
      return DesfechoDoEnvio.semSinal;
    } on Object {
      return DesfechoDoEnvio.semSinal;
    }

    await resposta.stream.drain<void>();

    final status = resposta.statusCode;
    if (status >= 200 && status < 300) return DesfechoDoEnvio.enviada;
    return DesfechoDoEnvio.recusada;
  }

  void fechar() => _cliente.close();
}

/// Quantos bytes do ARQUIVO o cliente HTTP ja aceitou, de quantos no total.
typedef ProgressoDeEnvio = void Function(int enviados, int total);

/// Quanto o gerador entrega por vez.
const int _pedacoDoEnvio = 64 * 1024;

/// Os bytes do arquivo, em pedacos, **contando o que o socket ja aceitou**.
Stream<List<int>> _emPedacos(Uint8List bytes, ProgressoDeEnvio? aoProgredir) {
  if (bytes.isEmpty) return const Stream<List<int>>.empty();
  return _gerarPedacos(bytes, aoProgredir);
}

Stream<List<int>> _gerarPedacos(
  Uint8List bytes,
  ProgressoDeEnvio? aoProgredir,
) async* {
  final total = bytes.length;
  var inicio = 0;
  while (inicio < total) {
    final fim = math.min(inicio + _pedacoDoEnvio, total);
    yield Uint8List.sublistView(bytes, inicio, fim);
    inicio = fim;
    aoProgredir?.call(inicio, total);
  }
}

/// Uma requisicao cujo corpo e um FLUXO, para o caminho `PUT`.
class _CorpoMedido extends http.BaseRequest {
  _CorpoMedido(super.method, super.url, this._corpo, int tamanho) {
    contentLength = tamanho;
  }

  final Stream<List<int>> _corpo;

  @override
  http.ByteStream finalize() {
    super.finalize();
    return http.ByteStream(_corpo);
  }
}
