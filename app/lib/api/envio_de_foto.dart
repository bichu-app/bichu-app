/// O caminho pelo qual os bytes de uma foto saem do aparelho.
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../dispositivo/camera_e_galeria.dart';
import 'falhas.dart';
import 'problem.dart';

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

/// POR QUE o envio não terminou — o que [DesfechoDoEnvio] não distingue.
///
/// ## O defeito que este enum existe para não repetir
///
/// Em 30/10/2026 o envio de foto ficou bloqueado em homologação e **três
/// rodadas de diagnóstico foram gastas na hipótese errada**. A razão foi esta
/// tela: [DesfechoDoEnvio.recusada] cobria QUATRO causas diferentes — arquivo
/// ilegível, arquivo vazio, **a nossa própria rota de intenção recusando**, e
/// o armazenamento recusando. A frase na tela dizia "a foto não foi aceita", o
/// que aponta para o armazenamento, e o diagnóstico foi para a assinatura V4.
///
/// A assinatura estava certa. O custo de não distinguir: uma chave HMAC
/// rotacionada sem motivo, e a chave antiga quase desativada — o que teria
/// derrubado a exibição de fotos inteira, porque o leitor de mídia ainda a
/// usava.
///
/// **A frase para a pessoa pode continuar simples.** O que não pode continuar
/// é o CAMINHO ser indistinguível para quem depura: a recusa da nossa API e a
/// do armazenamento são defeitos em lugares opostos do sistema.
enum MotivoDoDesfecho {
  /// Os bytes chegaram e o envio terminou.
  entregue,

  /// `bytesDaFoto` estourou: o arquivo não abre ou sumiu do aparelho. O
  /// sistema limpa o diretório temporário da câmera quando falta espaço, e o
  /// recorte escreve justamente ali.
  arquivoIlegivel,

  /// O arquivo abriu com zero byte — seletor interrompido no meio da cópia.
  arquivoVazio,

  /// **A NOSSA rota de intenção recusou**, e o status e o código estão em
  /// [DiagnosticoDoEnvio.status] e [DiagnosticoDoEnvio.codigo]. 415 é tipo
  /// fora da lista; 422, dimensão declarada pequena; 429, teto de chamadas.
  /// Nada disto é problema do armazenamento.
  intencaoRecusadaPelaApi,

  /// A intenção não saiu: sem conexão ou prazo esgotado.
  intencaoSemRede,

  /// **O ARMAZENAMENTO recusou**, com o status em
  /// [DiagnosticoDoEnvio.status]. 403 é política ou assinatura; 400 costuma
  /// ser campo do formulário fora das condições.
  armazenamentoRecusou,

  /// O envio dos bytes não completou: sem conexão, prazo, ou falha de cliente.
  armazenamentoSemRede,

  /// A confirmação falhou depois de os bytes subirem.
  confirmacaoRecusada,

  /// A confirmação não saiu por rede.
  confirmacaoSemRede,
}

/// O desfecho COM a causa, para o registro do aparelho e para os casos.
@immutable
class DiagnosticoDoEnvio {
  const DiagnosticoDoEnvio({
    required this.desfecho,
    required this.motivo,
    this.status,
    this.codigo,
    this.corpo,
    this.camposDoFormulario,
    this.tipoDaParteDoArquivo,
  });

  final DesfechoDoEnvio desfecho;
  final MotivoDoDesfecho motivo;

  /// O status HTTP de QUEM recusou, quando houve resposta.
  final int? status;

  /// O `type` do problema, quando quem recusou foi a nossa API.
  final String? codigo;

  /// **O CORPO de quem recusou, recortado.** O que o `drain` jogava fora.
  ///
  /// Um 403 do armazenamento não diz nada no status: as causas são política
  /// expirada, assinatura errada, credencial sem permissão no bucket e
  /// condição da política violada — quatro defeitos em lugares diferentes, e o
  /// número é o mesmo nos quatro. O corpo é onde elas se separam: o XML do
  /// Google traz `<Code>` e `<Message>`, e numa política de POST ele **nomeia a
  /// condição**, do tipo `Policy condition failed: ["eq", "$Content-Type",
  /// "image/jpeg"]`.
  ///
  /// Em 30/10/2026 o envio ficou parado em 403 por horas com o corpo sendo
  /// descartado em [EnvioDeFoto] por `resposta.stream.drain<void>()`. O status
  /// sozinho mandou o diagnóstico para a assinatura, que estava certa.
  final String? corpo;

  /// Os nomes dos campos do formulário **na ordem em que foram para o fio**.
  ///
  /// Metade de um 403 de política de POST é esta lista: o armazenamento recusa
  /// QUALQUER campo que a política não declare, e exige `file` por último. Sem
  /// a lista, a pergunta "o app manda campo a mais?" só se responde com
  /// captura de pacote, que não existe no aparelho do cliente.
  ///
  /// Só os NOMES, nunca os valores: `policy` e `x-goog-signature` são
  /// assinados e não têm o que esconder, mas valor de campo no registro é
  /// hábito que um dia carrega o que não devia.
  final List<String>? camposDoFormulario;

  /// O `content-type` da PARTE DO ARQUIVO do multipart.
  ///
  /// Separado do campo `Content-Type` do formulário de propósito: eles são
  /// dois valores distintos no mesmo envio, e um 403 que diverge de condição
  /// `["eq", "$Content-Type", ...]` não diz qual dos dois errou.
  final String? tipoDaParteDoArquivo;

  /// Uma linha só, para o registro do aparelho.
  ///
  /// É o que permite ler o caminho sem depurador acoplado: `adb logcat` ou o
  /// console do Xcode mostram qual das causas foi, e o status de quem recusou.
  String get linha {
    final partes = <String>[
      'BICHU envio: ${desfecho.name}',
      'motivo=${motivo.name}',
      if (status != null) 'status=$status',
      if (codigo != null) 'codigo=$codigo',
      if (camposDoFormulario != null)
        'campos=${camposDoFormulario!.join(',')}',
      if (tipoDaParteDoArquivo != null)
        'tipoDaParte=$tipoDaParteDoArquivo',
      if (corpo != null) 'corpo=${corpo!}',
    ];
    return partes.join(' ');
  }

  @override
  String toString() => linha;
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

  final http.Client _cliente;

  /// Mais folgado que o da API de proposito: aqui sobe um arquivo de megabytes
  /// por rede de celular, e 20 s derrubaria envio que ia dar certo.
  final Duration tempoLimite;

  static String? _identificadorDoProblema(Problem problema) {
    final slug = problema.tipo.slug;
    return slug.isNotEmpty ? slug : (problema.tipoUri.isEmpty ? null : problema.tipoUri);
  }

  /// O desfecho da ÚLTIMA chamada de [enviar], com a causa.
  ///
  /// Existe porque [DesfechoDoEnvio] tem três valores e o caminho tem nove —
  /// ver [MotivoDoDesfecho] para o que custou não distinguir. As telas
  /// continuam decidindo a frase pelo desfecho; quem depura lê aqui.
  DiagnosticoDoEnvio? get ultimoDiagnostico => _ultimoDiagnostico;
  DiagnosticoDoEnvio? _ultimoDiagnostico;

  DesfechoDoEnvio _anotar(
    DesfechoDoEnvio desfecho,
    MotivoDoDesfecho motivo, {
    int? status,
    String? codigo,
    String? corpo,
    List<String>? camposDoFormulario,
    String? tipoDaParteDoArquivo,
  }) {
    final diagnostico = DiagnosticoDoEnvio(
      desfecho: desfecho,
      motivo: motivo,
      status: status,
      codigo: codigo,
      corpo: corpo,
      camposDoFormulario: camposDoFormulario,
      tipoDaParteDoArquivo: tipoDaParteDoArquivo,
    );
    _ultimoDiagnostico = diagnostico;
    if (motivo != MotivoDoDesfecho.entregue) debugPrint(diagnostico.linha);
    return desfecho;
  }

  /// [aoProgredir] recebe **bytes do arquivo entregues ao socket**, e o total,
  /// a cada 64 KiB.
  Future<DesfechoDoEnvio> enviar({
    required FotoLocal foto,
    required DestinoDaFoto destino,
    ProgressoDeEnvio? aoProgredir,
  }) async {
    _ultimoDiagnostico = null;
    final Uint8List bytes;
    try {
      bytes = await camera.bytesDaFoto(foto);
    } on Object {
      return _anotar(
        DesfechoDoEnvio.recusada,
        MotivoDoDesfecho.arquivoIlegivel,
      );
    }
    if (bytes.isEmpty) {
      return _anotar(DesfechoDoEnvio.recusada, MotivoDoDesfecho.arquivoVazio);
    }

    final AutorizacaoDeEnvio autorizacao;
    try {
      autorizacao = await destino.pedirAutorizacao(
        tipoDeConteudo: foto.tipoDeConteudo,
        tamanhoEmBytes: bytes.length,
      );
    } on FalhaDeConexao {
      return _anotar(
        DesfechoDoEnvio.semSinal,
        MotivoDoDesfecho.intencaoSemRede,
      );
    } on FalhaDeTempo {
      return _anotar(
        DesfechoDoEnvio.semSinal,
        MotivoDoDesfecho.intencaoSemRede,
      );
    } on FalhaDaApi catch (falha) {
      return _anotar(
        DesfechoDoEnvio.recusada,
        MotivoDoDesfecho.intencaoRecusadaPelaApi,
        status: falha.problem.status,
        codigo: _identificadorDoProblema(falha.problem),
      );
    } on Object {
      return _anotar(
        DesfechoDoEnvio.recusada,
        MotivoDoDesfecho.intencaoRecusadaPelaApi,
      );
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
      return _anotar(
        DesfechoDoEnvio.semSinal,
        MotivoDoDesfecho.confirmacaoSemRede,
      );
    } on FalhaDeTempo {
      return _anotar(
        DesfechoDoEnvio.semSinal,
        MotivoDoDesfecho.confirmacaoSemRede,
      );
    } on FalhaDaApi catch (falha) {
      return _anotar(
        DesfechoDoEnvio.recusada,
        MotivoDoDesfecho.confirmacaoRecusada,
        status: falha.problem.status,
        codigo: _identificadorDoProblema(falha.problem),
      );
    } on Object {
      return _anotar(
        DesfechoDoEnvio.recusada,
        MotivoDoDesfecho.confirmacaoRecusada,
      );
    }

    return _anotar(DesfechoDoEnvio.enviada, MotivoDoDesfecho.entregue);
  }

  Future<DesfechoDoEnvio> _subirOsBytes(
    AutorizacaoDeEnvio autorizacao,
    Uint8List bytes,
    String tipoDeConteudo,
    ProgressoDeEnvio? aoProgredir,
  ) async {
    aoProgredir?.call(0, bytes.length);

    final http.BaseRequest requisicao;
    List<String>? camposNoFio;
    String? tipoDaParte;
    if (autorizacao.metodo == 'PUT') {
      requisicao = _CorpoMedido(
        'PUT',
        autorizacao.url,
        _emPedacos(bytes, aoProgredir),
        bytes.length,
      )..headers.addAll(autorizacao.cabecalhos);
    } else {
      final arquivo = http.MultipartFile(
        'file',
        _emPedacos(bytes, aoProgredir),
        bytes.length,
        filename: 'foto',
      );
      final multipart = http.MultipartRequest('POST', autorizacao.url)
        ..fields.addAll(autorizacao.campos)
        ..files.add(arquivo);
      camposNoFio = <String>[
        ...multipart.fields.keys,
        ...multipart.files.map((a) => a.field),
      ];
      tipoDaParte = '${arquivo.contentType}';
      requisicao = multipart;
    }

    late final http.StreamedResponse resposta;
    try {
      resposta = await _cliente.send(requisicao).timeout(tempoLimite);
    } on TimeoutException {
      return _anotar(
        DesfechoDoEnvio.semSinal,
        MotivoDoDesfecho.armazenamentoSemRede,
      );
    } on http.ClientException {
      return _anotar(
        DesfechoDoEnvio.semSinal,
        MotivoDoDesfecho.armazenamentoSemRede,
      );
    } on Object {
      return _anotar(
        DesfechoDoEnvio.semSinal,
        MotivoDoDesfecho.armazenamentoSemRede,
      );
    }

    final status = resposta.statusCode;
    if (status >= 200 && status < 300) {
      await resposta.stream.drain<void>();
      return DesfechoDoEnvio.enviada;
    }

    final corpo = await _recortarOCorpo(resposta);

    return _anotar(
      DesfechoDoEnvio.recusada,
      MotivoDoDesfecho.armazenamentoRecusou,
      status: status,
      corpo: corpo,
      camposDoFormulario: camposNoFio,
      tipoDaParteDoArquivo: tipoDaParte,
    );
  }

  static Future<String?> _recortarOCorpo(http.StreamedResponse resposta) async {
    try {
      final bruto = await resposta.stream.bytesToString();
      final numaLinha = bruto.replaceAll(RegExp(r'\s+'), ' ').trim();
      if (numaLinha.isEmpty) return null;
      return numaLinha.length <= _caracteresDoCorpoRecusado
          ? numaLinha
          : numaLinha.substring(0, _caracteresDoCorpoRecusado);
    } on Object {
      return null;
    }
  }

  void fechar() => _cliente.close();
}

/// Quantos bytes do ARQUIVO o cliente HTTP ja aceitou, de quantos no total.
typedef ProgressoDeEnvio = void Function(int enviados, int total);

const int _pedacoDoEnvio = 64 * 1024;

const int _caracteresDoCorpoRecusado = 300;

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
