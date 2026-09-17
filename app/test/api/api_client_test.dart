import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/problem.dart';
import 'package:bichu/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  setUp(AppConfig.limparParaTeste);

  AppConfig config(String url) =>
      AppConfig.carregar(apiBaseUrlDeTeste: url);

  ApiClient clienteQueResponde(
    http.Response Function(http.Request) responder, {
    String url = 'http://localhost:3000',
    Future<String?> Function()? token,
  }) {
    return ApiClient(
      config: config(url),
      cliente: MockClient((req) async => responder(req)),
      tokenDeAcesso: token,
    );
  }

  group('a URL sai de API_BASE_URL', () {
    test('acrescenta /v1 e o caminho da operacao', () async {
      late Uri chamada;
      final api = clienteQueResponde((req) {
        chamada = req.url;
        return http.Response('{}', 200, headers: _json);
      });
      await api.get('/auth/logout');
      expect(chamada.toString(), 'http://localhost:3000/v1/auth/logout');
    });

    test('respeita host e porta do build, que e como o aparelho fisico '
        'alcanca a maquina de quem desenvolve', () async {
      late Uri chamada;
      final api = clienteQueResponde(
        (req) {
          chamada = req.url;
          return http.Response('{}', 200, headers: _json);
        },
        url: 'http://192.168.0.10:3000',
      );
      await api.get('/me');
      expect(chamada.toString(), 'http://192.168.0.10:3000/v1/me');
    });

    test('preserva um prefixo de caminho na base', () async {
      late Uri chamada;
      final api = clienteQueResponde(
        (req) {
          chamada = req.url;
          return http.Response('{}', 200, headers: _json);
        },
        url: 'https://api.bichu.app/',
      );
      await api.get('/me');
      expect(chamada.toString(), 'https://api.bichu.app/v1/me');
    });
  });

  group('cabecalhos', () {
    test('toda requisicao leva X-Correlation-Id, e ele muda a cada uma',
        () async {
      final vistos = <String>[];
      final api = clienteQueResponde((req) {
        vistos.add(req.headers['X-Correlation-Id']!);
        return http.Response('{}', 200, headers: _json);
      });
      await api.get('/me');
      await api.get('/me');
      expect(vistos, hasLength(2));
      expect(vistos.first, isNot(vistos.last));
    });

    test('o Bearer so aparece quando ha token', () async {
      String? comToken;
      String? semToken;

      final autenticado = clienteQueResponde(
        (req) {
          comToken = req.headers['Authorization'];
          return http.Response('{}', 200, headers: _json);
        },
        token: () async => 'abc123',
      );
      await autenticado.get('/me');

      final anonimo = clienteQueResponde((req) {
        semToken = req.headers['Authorization'];
        return http.Response('{}', 200, headers: _json);
      });
      await anonimo.get('/public/lost-pets', exigeToken: false);

      expect(comToken, 'Bearer abc123');
      expect(semToken, isNull);
    });

    test('Idempotency-Key so vai quando quem chama manda uma', () async {
      final chaves = <String?>[];
      final api = clienteQueResponde((req) {
        chaves.add(req.headers['Idempotency-Key']);
        return http.Response('{}', 201, headers: _json);
      });

      await api.post('/auth/login', corpo: <String, dynamic>{});
      await api.post(
        '/tags/ABC/found-reports',
        corpo: <String, dynamic>{},
        idempotencyKey: 'chave-da-primeira-tentativa',
      );

      expect(chaves.first, isNull);
      expect(chaves.last, 'chave-da-primeira-tentativa');
    });

    test('a chave gerada e unica por chamada', () {
      final a = ApiClient.novaChaveDeIdempotencia();
      final b = ApiClient.novaChaveDeIdempotencia();
      expect(a, isNot(b));
      expect(a, matches(RegExp(r'^[0-9a-f-]{36}$')));
    });
  });

  group('resposta de erro', () {
    test('problem+json vira FalhaDaApi com o type resolvido', () async {
      final api = clienteQueResponde(
        (req) => http.Response(
          jsonEncode(<String, dynamic>{
            'type': 'https://bichu.app/problems/email-already-registered',
            'title': 'E-mail ja cadastrado',
            'status': 409,
            'correlation_id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
          }),
          409,
          headers: <String, String>{
            'content-type': 'application/problem+json',
          },
        ),
      );

      await expectLater(
        api.post('/auth/register', corpo: <String, dynamic>{}),
        throwsA(
          isA<FalhaDaApi>().having(
            (f) => f.tipo,
            'tipo',
            ProblemTipo.emailJaCadastrado,
          ),
        ),
      );
    });

    test('o 429 carrega o Retry-After em segundos', () async {
      final api = clienteQueResponde(
        (req) => http.Response(
          jsonEncode(<String, dynamic>{
            'type': 'https://bichu.app/problems/rate-limited',
            'title': 'Muitas tentativas',
            'status': 429,
          }),
          429,
          headers: <String, String>{
            'content-type': 'application/problem+json',
            'retry-after': '600',
          },
        ),
      );

      await expectLater(
        api.post('/auth/login', corpo: <String, dynamic>{}),
        throwsA(
          isA<FalhaDaApi>().having(
            (f) => f.problem.tenteDepoisDe,
            'tenteDepoisDe',
            const Duration(minutes: 10),
          ),
        ),
      );
    });

    test('HTML de proxy num 502 nao quebra o app', () async {
      final api = clienteQueResponde(
        (req) => http.Response(
          '<html><body>502 Bad Gateway</body></html>',
          502,
          headers: <String, String>{'content-type': 'text/html'},
        ),
      );

      await expectLater(
        api.get('/me'),
        throwsA(
          isA<FalhaDaApi>()
              .having((f) => f.problem.status, 'status', 502)
              .having((f) => f.tipo, 'tipo', ProblemTipo.desconhecido),
        ),
      );
    });

    test('204 devolve corpo vazio, e nao explode ao decodificar', () async {
      final api = clienteQueResponde((req) => http.Response('', 204));
      expect(await api.post('/auth/logout'), isEmpty);
    });
  });
}

const Map<String, String> _json = <String, String>{
  'content-type': 'application/json',
};
