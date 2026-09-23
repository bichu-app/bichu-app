import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'falhas.dart';
import 'problem.dart';

/// A camada de acesso a API.
///
/// Tres coisas ela faz e nenhuma outra: monta a URL a partir de
/// `API_BASE_URL`, carrega os cabecalhos que o contrato exige, e converte
/// qualquer resposta de erro no formato unico ([Problem], RFC 9457).
///
/// O que ela **nao** faz, de proposito: nao decide texto de tela, nao guarda
/// token e nao tem fila offline. A fila local e persistida em disco e o reenvio
/// com a mesma `Idempotency-Key` sao da BICHU-26.
class ApiClient {
  ApiClient({
    required this.config,
    http.Client? cliente,
    this.tokenDeAcesso,
    this.tempoLimite = const Duration(seconds: 20),
  }) : _cliente = cliente ?? http.Client();

  final AppConfig config;
  final http.Client _cliente;

  /// De onde sai o `Authorization: Bearer`. Nulo quando deslogado, e isso e
  /// um estado normal: o app e navegavel sem conta.
  final Future<String?> Function()? tokenDeAcesso;

  final Duration tempoLimite;

  static const String _versaoDaApi = 'v1';

  /// `GET`, que nunca leva `Idempotency-Key`.
  Future<Map<String, dynamic>> get(
    String caminho, {
    Map<String, String>? query,
    bool exigeToken = true,
  }) {
    return _enviar('GET', caminho, query: query, exigeToken: exigeToken);
  }

  /// `POST`.
  ///
  /// [idempotencyKey] e obrigatoria em toda operacao de criacao com efeito
  /// colateral que possa ser reenviada. Repetir a mesma chave dentro de 24 h
  /// devolve a resposta original em vez de executar de novo, e e isso que
  /// impede o tutor de receber o mesmo aviso varias vezes.
  Future<Map<String, dynamic>> post(
    String caminho, {
    Object? corpo,
    String? idempotencyKey,
    bool exigeToken = true,
  }) {
    return _enviar(
      'POST',
      caminho,
      corpo: corpo,
      idempotencyKey: idempotencyKey,
      exigeToken: exigeToken,
    );
  }

  Future<Map<String, dynamic>> patch(
    String caminho, {
    Object? corpo,
    bool exigeToken = true,
  }) {
    return _enviar('PATCH', caminho, corpo: corpo, exigeToken: exigeToken);
  }

  Future<Map<String, dynamic>> delete(
    String caminho, {
    bool exigeToken = true,
  }) {
    return _enviar('DELETE', caminho, exigeToken: exigeToken);
  }

  /// Baixa o corpo binario de uma rota **autenticada desta API**.
  ///
  /// Existe porque `Image.network` **nao manda cabecalho nenhum**: ele abre um
  /// `HttpClient` proprio, por fora desta camada, e por ali nao passa
  /// `Authorization`. A rota da imagem do QR e `bearerAuth` no contrato e esta
  /// marcada `reveals_credential`; pela `Image.network` ela responde 401 e a
  /// tela nao mostra QR algum.
  ///
  /// **O endereco vem do corpo de uma resposta, e por isso ele e conferido.**
  /// `qr_png_url` e montado pelo servidor. Mandar o `Bearer` para qualquer host
  /// que um campo de resposta nomear entrega a credencial da sessao no primeiro
  /// dia em que esse campo apontar para outro lugar. So a **mesma origem** de
  /// `API_BASE_URL` (esquema, host e porta) recebe o cabecalho; qualquer outra
  /// e recusada com [FalhaDeEnderecoRecusado] **antes** de a requisicao sair.
  ///
  /// Recusa tambem resposta que nao seja imagem: um corpo JSON devolvido com
  /// 200 por um portal cativo no meio do caminho viraria bytes quebrados no
  /// decodificador, e o erro apareceria como falha de imagem e nao como falha
  /// de rede.
  Future<Uint8List> baixarImagem(String endereco) async {
    final uri = Uri.tryParse(endereco);
    final base = config.apiBaseUrl;
    if (uri == null ||
        !uri.hasScheme ||
        uri.scheme != base.scheme ||
        uri.host != base.host ||
        uri.port != base.port) {
      throw FalhaDeEnderecoRecusado(endereco);
    }

    final cabecalhos = <String, String>{
      'Accept': 'image/png',
      'X-Correlation-Id': _uuidV4(),
    };
    final token = await tokenDeAcesso?.call();
    if (token != null && token.isNotEmpty) {
      cabecalhos['Authorization'] = 'Bearer $token';
    }

    final requisicao = http.Request('GET', uri)..headers.addAll(cabecalhos);

    late final http.Response resposta;
    try {
      resposta = await _enviarELerOCorpo(requisicao);
    } on TimeoutException {
      throw FalhaDeTempo(tempoLimite);
    } on SocketException catch (e) {
      throw FalhaDeConexao(e);
    } on http.ClientException catch (e) {
      throw FalhaDeConexao(e);
    } on HandshakeException catch (e) {
      throw FalhaDeConexao(e);
    }

    final status = resposta.statusCode;
    final esperar = _retryAfter(resposta.headers['retry-after']);
    if (status < 200 || status >= 300) {
      throw FalhaDaApi(_problem(resposta, status, esperar));
    }

    final tipo = resposta.headers['content-type'] ?? '';
    if (!tipo.trim().toLowerCase().startsWith('image/') ||
        resposta.bodyBytes.isEmpty) {
      throw FalhaDaApi(Problem.semCorpo(status, tenteDepoisDe: esperar));
    }
    return resposta.bodyBytes;
  }

  /// Gera uma chave de idempotencia nova.
  ///
  /// Quem reenvia uma acao da fila **nao** chama isto: reenvio usa a chave da
  /// primeira tentativa, e trocar a chave no reenvio derruba a garantia
  /// inteira.
  static String novaChaveDeIdempotencia() => _uuidV4();

  void fechar() => _cliente.close();

  // ------------------------------------------------------------------------

  Future<Map<String, dynamic>> _enviar(
    String metodo,
    String caminho, {
    Object? corpo,
    Map<String, String>? query,
    String? idempotencyKey,
    bool exigeToken = true,
  }) async {
    final uri = _url(caminho, query);
    final correlationId = _uuidV4();
    final cabecalhos = <String, String>{
      'Accept': 'application/json, application/problem+json',
      'X-Correlation-Id': correlationId,
    };

    if (corpo != null) {
      cabecalhos['Content-Type'] = 'application/json; charset=utf-8';
    }
    if (idempotencyKey != null) {
      cabecalhos['Idempotency-Key'] = idempotencyKey;
    }
    if (exigeToken) {
      final token = await tokenDeAcesso?.call();
      if (token != null && token.isNotEmpty) {
        cabecalhos['Authorization'] = 'Bearer $token';
      }
    }

    final requisicao = http.Request(metodo, uri)..headers.addAll(cabecalhos);
    if (corpo != null) {
      requisicao.body = jsonEncode(corpo);
    }

    late final http.Response resposta;
    try {
      resposta = await _enviarELerOCorpo(requisicao);
    } on TimeoutException {
      throw FalhaDeTempo(tempoLimite);
    } on SocketException catch (e) {
      throw FalhaDeConexao(e);
    } on http.ClientException catch (e) {
      throw FalhaDeConexao(e);
    } on HandshakeException catch (e) {
      throw FalhaDeConexao(e);
    }

    return _lerResposta(resposta);
  }

  /// Manda a requisicao e le o corpo INTEIRO, sob **um** prazo so.
  ///
  /// O prazo cobre as duas metades de proposito, e essa e a correcao: antes
  /// ele vivia em `_cliente.send(...).timeout(tempoLimite)` e cobria apenas
  /// ate os CABECALHOS chegarem. `http.Response.fromStream` ficava de fora, e
  /// resposta que abre e nao fecha -- portal cativo, proxy que segura o corpo,
  /// conexao que morre com os cabecalhos ja entregues -- pendurava a chamada
  /// **para sempre**, sem `FalhaDeTempo` e sem mensagem. A tela que esperava
  /// por ela ficava girando sem saida, que e o estado que este app nao pode
  /// ter. Medido: com `tempoLimite` de 2 s, a chamada seguia viva depois de
  /// 6 s. A isca esta em `test/api/prazo_cobre_o_corpo_test.dart`.
  ///
  /// [tempoLimite] passa a ser o orcamento de **uma resposta inteira**, e nao
  /// o de um aperto de mao: e o que a tela promete a quem toca no botao.
  Future<http.Response> _enviarELerOCorpo(http.BaseRequest requisicao) {
    return Future<http.Response>(() async {
      final fluxo = await _cliente.send(requisicao);
      return http.Response.fromStream(fluxo);
    }).timeout(tempoLimite);
  }

  Map<String, dynamic> _lerResposta(http.Response resposta) {
    final status = resposta.statusCode;
    final esperar = _retryAfter(resposta.headers['retry-after']);

    if (status >= 200 && status < 300) {
      if (status == 204 || resposta.bodyBytes.isEmpty) {
        return const <String, dynamic>{};
      }
      final decodificado = jsonDecode(utf8.decode(resposta.bodyBytes));
      if (decodificado is Map<String, dynamic>) return decodificado;
      return <String, dynamic>{'data': decodificado};
    }

    throw FalhaDaApi(_problem(resposta, status, esperar));
  }

  Problem _problem(http.Response resposta, int status, Duration? esperar) {
    final tipoDeConteudo = resposta.headers['content-type'] ?? '';
    if (!tipoDeConteudo.contains('json') || resposta.bodyBytes.isEmpty) {
      // Um proxy no meio do caminho devolve HTML num 502. Nao e motivo para o
      // app travar: vira um Problem sintetico e a tela mostra o texto de
      // servidor fora, que e o certo para o momento.
      return Problem.semCorpo(status, tenteDepoisDe: esperar);
    }
    try {
      final json = jsonDecode(utf8.decode(resposta.bodyBytes));
      if (json is! Map<String, dynamic>) {
        return Problem.semCorpo(status, tenteDepoisDe: esperar);
      }
      return Problem.doJson(json, status: status, tenteDepoisDe: esperar);
    } on FormatException {
      return Problem.semCorpo(status, tenteDepoisDe: esperar);
    }
  }

  Uri _url(String caminho, Map<String, String>? query) {
    final limpo = caminho.startsWith('/') ? caminho.substring(1) : caminho;
    final base = config.apiBaseUrl;
    final segmentos = <String>[
      ...base.pathSegments.where((s) => s.isNotEmpty),
      _versaoDaApi,
      ...limpo.split('/').where((s) => s.isNotEmpty),
    ];
    return base.replace(
      pathSegments: segmentos,
      queryParameters: (query == null || query.isEmpty) ? null : query,
    );
  }

  static Duration? _retryAfter(String? valor) {
    if (valor == null) return null;
    final segundos = int.tryParse(valor.trim());
    if (segundos == null || segundos < 0) return null;
    return Duration(seconds: segundos);
  }

  static final Random _aleatorio = Random.secure();

  static String _uuidV4() {
    final bytes = List<int>.generate(16, (_) => _aleatorio.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
        '${hex.substring(20)}';
  }
}
