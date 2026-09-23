/// O caminho pelo qual os bytes de uma foto saem do aparelho.
///
/// ## O buraco que esta classe fecha
///
/// Ate 22/09/2026 **nao existia caminho de envio de bytes em lugar nenhum do
/// app**. `PetsApi.intencaoDeFotoDoPet` foi escrita na BICHUS-62 e nunca foi
/// chamada; F1.4 deixava a pessoa escolher a foto e ela morria no aparelho.
/// F1.6 chegava a dizer "a foto ainda esta sendo enviada" -- uma frase sobre
/// um envio que nao existia. A tela nao mentia por erro de texto: ela
/// anunciava o efeito de uma chamada que ninguem fazia.
///
/// O servidor estava pronto desde 21/09 (BICHUS-87): o backend **nunca recebe
/// os bytes**, ele assina a requisicao de upload para o armazenamento.
///
/// ## Um mecanismo, dois consumidores
///
/// A foto do pet e a foto do achado avulso sao a **mesma ideia**: pedir
/// autorizacao ao servidor, mandar os bytes para onde ele disser, confirmar
/// quando houver o que confirmar. O que muda entre as duas e so o primeiro
/// passo (qual rota emite a autorizacao) e o terceiro (se existe confirmacao),
/// e e por isso que esses dois passos sao [DestinoDaFoto] e o resto e daqui.
///
/// Escrever um envio para o pet e outro para o achado criaria a segunda copia
/// do mesmo mecanismo -- e a copia e o que diverge. Ler `method` em um lugar e
/// presumir `POST` no outro e o defeito que nasce dessa copia, e ele so
/// aparece no dia em que o provedor de armazenamento mudar.
///
/// ## A credencial da sessao NAO acompanha os bytes
///
/// O endereco do armazenamento vem do corpo de uma resposta e aponta, por
/// desenho, para **outro host**. [ApiClient.baixarImagem] recusa host diferente
/// justamente porque manda `Authorization`; aqui a regra e a outra metade da
/// mesma: esta classe tem um cliente HTTP proprio, **nao conhece o token** e
/// nao tem como anexa-lo. Os unicos cabecalhos que saem sao os que o servidor
/// assinou.
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../dispositivo/camera_e_galeria.dart';
import 'falhas.dart';

/// As credenciais de upload (`UploadIntent` do contrato).
///
/// **`method` e lido, nunca presumido.** O contrato declara `POST` com
/// `fields` (politica de formulario assinada, que e o caminho de hoje em MinIO
/// e S3) ou `PUT` com `headers` assinados, para o provedor que nao suportar
/// politica de POST. Um cliente que presume a forma quebra na troca de
/// provedor, que e configuracao do servidor e nao versao nova do app -- e
/// versao antiga do app nunca some do bolso de ninguem.
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

  /// Campos do formulario assinado. Presente quando [metodo] e `POST`.
  final Map<String, String> campos;

  /// Cabecalhos assinados, enviados **sem alterar**. Presente quando [metodo]
  /// e `PUT`.
  final Map<String, String> cabecalhos;

  final DateTime? expiraEm;
  final int? maxBytes;

  /// Le a resposta do contrato.
  ///
  /// **Reprova alto quando falta o essencial.** Uma autorizacao sem `url` ou
  /// sem `upload_id` nao tem como ser honrada, e seguir com ela produziria uma
  /// requisicao para `null` -- o formato de falha que nao aponta para a causa.
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
      // O `default` do contrato e POST, e e ele que vale quando o campo falta.
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

/// De quem e a foto: o que muda entre os dois consumidores, e so isso.
///
/// Duas implementacoes, e as duas existem porque o contrato tem duas rotas de
/// intencao com corpos diferentes ([FotoDePet] manda `pet_id`, [FotoDeAchado]
/// manda `found_report_id`). O envio dos bytes nao sabe qual das duas esta em
/// uso, e nao precisa saber.
abstract class DestinoDaFoto {
  /// Pede as credenciais de upload ao servidor.
  Future<AutorizacaoDeEnvio> pedirAutorizacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  });

  /// O terceiro passo, quando ele existe.
  ///
  /// Existe para o pet (`confirmPetPhoto`) e **nao existe para o achado**: a
  /// intencao do achado ja nasce amarrada ao aviso no servidor, e o contrato
  /// nao declara operacao de confirmacao nenhuma para ela. Um metodo que
  /// fingisse confirmar o achado inventaria uma rota.
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
  ///
  /// E **esta** chamada que enfileira o processamento, e nao a chegada dos
  /// bytes no armazenamento: o produto nao depende de notificacao de bucket.
  /// Pular este passo deixaria a foto no armazenamento e fora do pet.
  @override
  Future<void> confirmar(String uploadId) {
    return api.confirmarFotoDoPet(petId: petId, uploadId: uploadId);
  }
}

/// A foto do achado avulso: intencao com `found_report_id`, sem confirmacao.
///
/// ## A ordem e obrigatoria, e ela e do contrato
///
/// `createFoundReportPhotoUploadIntent` **exige `found_report_id` no corpo**.
/// `StrayFoundReportInput` declara `photo_upload_id`. As duas coisas juntas
/// dizem que **nao existe valor valido para `photo_upload_id` antes da chamada
/// que o recebe**: o aviso tem de ser registrado primeiro, e a foto sobe
/// depois, com o id que so entao existe.
///
/// Nao e limitacao deste app e nao tem contorno do lado de ca. Quem tentar a
/// ordem inversa nao tem o que colocar no campo.
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
  ///
  /// O servidor grava a intencao ja amarrada ao `found_report_id` no momento em
  /// que a emite (`registrarIntencaoDeFoto`), entao a foto pertence ao aviso
  /// desde antes de os bytes sairem. Nao existe `confirmFoundReportPhoto` no
  /// contrato, e chamar `confirmPetPhoto` aqui mandaria a foto de um achado
  /// para a lista de fotos de um pet.
  @override
  Future<void> confirmar(String uploadId) async {}
}

/// O que `PetsApi` precisa expor para ser um destino. Interface estreita, e
/// nao a classe: o mecanismo nao deve alcancar `cadastrarPet` nem `emitirTag`.
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

/// Como terminou o envio.
///
/// Tres desfechos e nao dois, pela mesma razao dos tres estados de permissao:
/// "nao subiu" junta duas situacoes que levam a telas diferentes. Sem sinal, a
/// pessoa tenta de novo daqui a pouco e funciona; recusada, tentar de novo
/// devolve a mesma recusa.
enum DesfechoDoEnvio {
  /// Os bytes chegaram no armazenamento e a confirmacao (quando existe) saiu.
  enviada,

  /// Faltou rede em algum dos tres passos. Tentar de novo resolve.
  semSinal,

  /// O servidor ou o armazenamento recusaram. Tentar de novo nao resolve
  /// sozinho: tipo nao aceito, tamanho acima do teto, autorizacao vencida,
  /// arquivo que sumiu do aparelho.
  recusada,
}

/// O mecanismo. Tres passos, dois consumidores, uma copia.
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

  /// **Um cliente proprio, e nao o da [ApiClient].** Ele nao conhece o token
  /// da sessao, entao nao ha como a credencial sair junto dos bytes para um
  /// host que o servidor nomeou.
  final http.Client _cliente;

  /// Mais folgado que o da API de proposito: aqui sobe um arquivo de
  /// megabytes por rede de celular, e 20 s derrubaria envio que ia dar certo.
  final Duration tempoLimite;

  Future<DesfechoDoEnvio> enviar({
    required FotoLocal foto,
    required DestinoDaFoto destino,
  }) async {
    final Uint8List bytes;
    try {
      bytes = await camera.bytesDaFoto(foto);
    } on Object {
      // O arquivo sumiu do aparelho entre a escolha e o envio: o sistema limpa
      // o diretorio temporario da camera quando falta espaco. Nao e falha de
      // rede e tentar de novo nao traz o arquivo de volta.
      return DesfechoDoEnvio.recusada;
    }
    if (bytes.isEmpty) return DesfechoDoEnvio.recusada;

    final AutorizacaoDeEnvio autorizacao;
    try {
      autorizacao = await destino.pedirAutorizacao(
        tipoDeConteudo: foto.tipoDeConteudo,
        // O tamanho medido AGORA, e nao o que a escolha anotou: a politica
        // assinada carrega um teto, e declarar um numero que nao e o dos bytes
        // faz o armazenamento recusar depois de o upload inteiro subir.
        tamanhoEmBytes: bytes.length,
      );
    } on FalhaDeConexao {
      return DesfechoDoEnvio.semSinal;
    } on FalhaDeTempo {
      return DesfechoDoEnvio.semSinal;
    } on Object {
      return DesfechoDoEnvio.recusada;
    }

    final subiu = await _subirOsBytes(autorizacao, bytes, foto.tipoDeConteudo);
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
  ) async {
    final http.BaseRequest requisicao;
    if (autorizacao.metodo == 'PUT') {
      // Os cabecalhos assinados vao **sem alterar**, inclusive `Content-Type`:
      // qualquer diferenca invalida a assinatura, e o armazenamento responde
      // 403 sem dizer qual campo.
      requisicao = http.Request('PUT', autorizacao.url)
        ..headers.addAll(autorizacao.cabecalhos)
        ..bodyBytes = bytes;
    } else {
      // Politica de formulario: os campos assinados primeiro, o arquivo por
      // ultimo. A ordem nao e estilo -- a politica de POST do S3 exige que
      // `file` seja o ultimo campo, e o que vier depois dele e ignorado.
      // `MultipartRequest` emite campos antes de arquivos, nesta ordem.
      //
      // O `Content-Type` do arquivo nao e anotado na parte: ele viaja como
      // campo assinado da politica, e uma segunda declaracao aqui seria a que
      // diverge.
      requisicao = http.MultipartRequest('POST', autorizacao.url)
        ..fields.addAll(autorizacao.campos)
        ..files.add(
          http.MultipartFile.fromBytes('file', bytes, filename: 'foto'),
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
      // `SocketException` e `HandshakeException` caem aqui: as tres sao
      // "a rede nao cooperou", e a pessoa nao tem o que fazer diferente.
      return DesfechoDoEnvio.semSinal;
    }

    // O corpo e drenado mesmo quando nao interessa: fluxo nao consumido
    // segura a conexao aberta ate o socket morrer.
    await resposta.stream.drain<void>();

    final status = resposta.statusCode;
    if (status >= 200 && status < 300) return DesfechoDoEnvio.enviada;
    // O armazenamento nao fala RFC 9457 e nao ha `type` para decidir. Recusa
    // e recusa: tipo fora da politica, tamanho acima do teto, autorizacao
    // vencida. Nenhuma delas melhora com insistencia imediata.
    return DesfechoDoEnvio.recusada;
  }

  void fechar() => _cliente.close();
}
