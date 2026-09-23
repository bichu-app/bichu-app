// ISCA — o prazo do `ApiClient` cobre a RESPOSTA INTEIRA, e nao o aperto de mao.
//
// **O que este arquivo guarda, e por que nao e "existe um timeout".** Uma
// verificacao que so confirmasse `tempoLimite != null`, ou que medisse o
// caminho em que o servidor nao aceita a conexao, fica VERDE com o defeito
// inteiro de pe -- que foi exatamente o estado do repositorio ate 22/09/2026.
//
// O defeito: `_cliente.send(requisicao).timeout(tempoLimite)` aplica o prazo
// ao `Future` que completa quando os **cabecalhos** chegam.
// `http.Response.fromStream(fluxo)`, que le o corpo, vinha depois e **fora**
// do prazo. Uma resposta que abre e nao fecha -- portal cativo, proxy que
// segura o corpo, conexao que morre com os cabecalhos ja entregues --
// pendurava a chamada para sempre: sem `FalhaDeTempo`, sem excecao, sem
// mensagem. A tela que esperava por ela girava ate a pessoa desistir.
//
// Medido antes da correcao, com `tempoLimite` de 2 s: 6 s depois a chamada
// seguia viva e nenhum erro tinha sido levantado.
//
// A regra que os casos abaixo guardam:
//
// > **Nenhuma chamada do `ApiClient` pode durar mais que `tempoLimite`.**
// > Estourar o prazo e `FalhaDeTempo`, sempre -- inclusive quando o que falta
// > e o corpo, e nao a conexao.

import 'dart:async';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/falhas.dart';
import 'package:bichu/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

/// Os cabecalhos chegam **na hora**; o corpo nunca vem.
///
/// E o formato da falha que o prazo antigo nao enxergava: do ponto de vista do
/// `send()` a requisicao foi um sucesso, e o `Future` que ficou pendurado e o
/// da leitura.
class _CabecalhoSemCorpo extends http.BaseClient {
  final StreamController<List<int>> _mudo = StreamController<List<int>>();

  /// Quantas vezes o cliente foi acionado. Zero significa que o caso mediu
  /// outra coisa que nao a chamada.
  int envios = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    envios += 1;
    return http.StreamedResponse(
      _mudo.stream,
      200,
      headers: const <String, String>{'content-type': 'application/json'},
    );
  }

  Future<void> fechar() => _mudo.close();
}

/// Cabecalhos e corpo normais, para o contraste.
class _RespostaInteira extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final bytes = <int>[123, 125]; // {}
    return http.StreamedResponse(
      Stream<List<int>>.value(bytes),
      200,
      headers: const <String, String>{'content-type': 'application/json'},
      contentLength: bytes.length,
    );
  }
}

void main() {
  setUp(AppConfig.limparParaTeste);

  const Duration prazo = Duration(seconds: 2);

  ApiClient clientePara(http.BaseClient cliente) {
    return ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
      cliente: cliente,
      tempoLimite: prazo,
    );
  }

  test(
    'ISCA — o corpo que nunca chega vira FalhaDeTempo dentro do prazo',
    () async {
      final rede = _CabecalhoSemCorpo();
      final api = clientePara(rede);
      final relogio = Stopwatch()..start();

      Object? capturado;
      try {
        await api.post(
          '/auth/register',
          corpo: const <String, dynamic>{'email': 'a@b.co'},
          exigeToken: false,
        );
      } on Object catch (erro) {
        capturado = erro;
      }
      relogio.stop();
      await rede.fechar();

      expect(
        rede.envios,
        1,
        reason: 'O caso nao chegou a chamar a rede: ele esta medindo outra '
            'coisa que nao a chamada.',
      );
      expect(
        capturado,
        isA<FalhaDeTempo>(),
        reason: 'REPROVA: a resposta abriu e nao fechou, e a chamada NAO '
            'estourou o prazo. Este e o estado em que a tela gira para sempre: '
            'sem FalhaDeTempo nao ha mensagem, nao ha saida e o `finally` da '
            'tela nunca roda. Se o prazo voltou a cobrir so '
            '`_cliente.send(...)`, e este o defeito.',
      );
      expect(
        relogio.elapsed,
        lessThan(prazo * 5),
        reason: 'A chamada terminou, mas muito depois do prazo declarado. O '
            'prazo precisa ser o orcamento da resposta inteira.',
      );
    },
    timeout: const Timeout(Duration(seconds: 30)),
  );

  test('a resposta que chega inteira NAO vira FalhaDeTempo', () async {
    // O outro sentido da isca. Sem ele, um `throw FalhaDeTempo` incondicional
    // passaria no caso de cima e a verificacao valeria nada.
    final api = clientePara(_RespostaInteira());
    await expectLater(
      api.post('/auth/register', exigeToken: false),
      completion(isEmpty),
    );
  });
}
