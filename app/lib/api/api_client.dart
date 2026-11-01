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
class ApiClient {
  ApiClient({
    required this.config,
    http.Client? cliente,
    this.tokenDeAcesso,
    this.tempoLimite = const Duration(seconds: 20),
  }) : _cliente = cliente ?? http.Client();

  final AppConfig config;
  final http.Client _cliente;

  /// De onde sai o `Authorization: Bearer`.
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

  /// `GET` que devolve o corpo **e o `ETag`**.
  Future<({Map<String, dynamic> corpo, String? etag})> getComEtag(
    String caminho, {
    Map<String, String>? query,
    bool exigeToken = true,
  }) async {
    final resposta = await _trocar(
      'GET',
      caminho,
      query: query,
      exigeToken: exigeToken,
    );
    final corpo = _lerResposta(resposta);
    final etag = resposta.headers['etag'];
    return (corpo: corpo, etag: etag);
  }

  /// `POST`.
  Future<Map<String, dynamic>> post(
    String caminho, {
    Object? corpo,
    String? idempotencyKey,
    String? ifMatch,
    bool exigeToken = true,
  }) {
    return _enviar(
      'POST',
      caminho,
      corpo: corpo,
      idempotencyKey: idempotencyKey,
      ifMatch: ifMatch,
      exigeToken: exigeToken,
    );
  }

  /// `PATCH`.
  Future<Map<String, dynamic>> patch(
    String caminho, {
    Object? corpo,
    String? ifMatch,
    bool exigeToken = true,
  }) {
    return _enviar(
      'PATCH',
      caminho,
      corpo: corpo,
      ifMatch: ifMatch,
      exigeToken: exigeToken,
    );
  }

  /// `PUT`, **e sem `Idempotency-Key`**.
  Future<Map<String, dynamic>> put(
    String caminho, {
    Object? corpo,
    String? ifMatch,
    bool exigeToken = true,
  }) {
    return _enviar(
      'PUT',
      caminho,
      corpo: corpo,
      ifMatch: ifMatch,
      exigeToken: exigeToken,
    );
  }

  Future<Map<String, dynamic>> delete(
    String caminho, {
    String? ifMatch,
    bool exigeToken = true,
  }) {
    return _enviar('DELETE', caminho, ifMatch: ifMatch, exigeToken: exigeToken);
  }

  /// Baixa o corpo binario de uma rota **autenticada desta API**.
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
  static String novaChaveDeIdempotencia() => _uuidV4();

  void fechar() => _cliente.close();

  Future<Map<String, dynamic>> _enviar(
    String metodo,
    String caminho, {
    Object? corpo,
    Map<String, String>? query,
    String? idempotencyKey,
    String? ifMatch,
    bool exigeToken = true,
  }) async {
    return _lerResposta(
      await _trocar(
        metodo,
        caminho,
        corpo: corpo,
        query: query,
        idempotencyKey: idempotencyKey,
        ifMatch: ifMatch,
        exigeToken: exigeToken,
      ),
    );
  }

  Future<http.Response> _trocar(
    String metodo,
    String caminho, {
    Object? corpo,
    Map<String, String>? query,
    String? idempotencyKey,
    String? ifMatch,
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
    if (ifMatch != null) {
      cabecalhos['If-Match'] = ifMatch;
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

    return resposta;
  }

  Future<http.Response> _enviarELerOCorpo(http.BaseRequest requisicao) {
    return () async {
      final fluxo = await _cliente.send(requisicao);
      return http.Response.fromStream(fluxo);
    }()
        .timeout(tempoLimite);
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

  /// O endereco absoluto de um caminho **desta** API.
  Uri enderecoDe(String caminho) => _url(caminho, null);

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
