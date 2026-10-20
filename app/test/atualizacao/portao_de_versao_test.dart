// ISCA — AS CINCO FORMAS DE FALHA LIBERAM O USO, UMA POR UMA.
//
// ====================================================================
// O QUE ESTE ARQUIVO GUARDA
// ====================================================================
//
// `VersaoApi` e a unica camada de API deste aplicativo que **nao lanca**, e a
// razao e que quem a consome pode FECHAR o produto. A regra que os casos
// abaixo guardam:
//
// > **`bloqueado` sai SOMENTE de um 200 cujo corpo diz `update_required`.**
// > Qualquer outra coisa -- falha de rede, prazo estourado, erro do servidor,
// > corpo fora do contrato, campo ausente, veredito desconhecido -- libera.
//
// **Por que CINCO casos e nao um.** Um unico caso de "deu erro, liberou"
// ficaria verde com quatro dos cinco caminhos quebrados: as cinco falhas
// chegam ao codigo por mecanismos DIFERENTES -- `SocketException`,
// `TimeoutException`, `FalhaDaApi`, `TypeError` de leitura de corpo, e um
// corpo valido sem o campo. Um `catch (FalhaDeChamada)`, por exemplo, pega
// tres e deixa passar a quarta: corpo 200 fora do contrato estoura fora da
// hierarquia de `FalhaDeChamada`, como o proprio `falhas.dart` registra.
//
// ====================================================================
// COMO ESTAS ISCAS FORAM PROVADAS (19/10/2026)
// ====================================================================
//
// Cada linha foi desligada no codigo de producao, esta bancada rodou e
// reprovou, e o arquivo foi restaurado. Linha de base: 33 casos, 0 reprovas.
// O que esta nesta tabela foi MEDIDO, nao deduzido.
//
// | o que foi desligado em `versao_api.dart` | reprovaram |
// |---|---|
// | `catch (Object)` virando `catch (FalhaDeChamada)` | 1 -- so (c4b) |
// | o `catch` removido (a falha sobe) | **7** |
// | `_vereditos[bruto] ?? liberado` virando `?? bloqueado` | 1 |
//
// A primeira linha e a mais informativa: `catch (FalhaDeChamada)` deixa passar
// **exatamente (c4b)** e nenhum outro. E a prova de que os cinco casos nao
// sao cinco redacoes do mesmo caso -- (c1), (c2) e (c3) sobem pela hierarquia
// declarada, (c4) e barrado pelo `is! String` sem lancar nada, e (c4b) estoura
// FORA da hierarquia, na leitura do corpo. Um caso so, de qualquer um dos
// cinco, ficaria verde com este defeito de pe.
//
// E no portao e na tela:
//
// | o que foi desligado | reprovaram |
// |---|---|
// | o estado inicial nascendo `bloqueado` em vez de `liberado` | 3 |
// | o bloqueio montando o `child` junto (`Stack` no lugar da troca) | 2 |
// | `plataformaDo` devolvendo `'android'` no caso `_` | 2 |
// | `PopScope(canPop: false)` virando `canPop: true` | 1 |
// | o bloqueio ganhando um `Agora nao` | 1 |
// | o botao aparecendo mesmo sem destino de loja | 1 |
//
// **UMA ISCA FOI CORRIGIDA POR ESTA MEDICAO, e o registro fica.** A primeira
// versao do caso do `PopScope` montava a tela como RAIZ do portao e mandava um
// `maybePop()`. Com `canPop: true` ele continuava VERDE: na raiz nao ha rota
// por baixo, entao nao havia o que popar e o caso nao media o `PopScope`
// nenhum -- ele media a troca de arvore, que outro caso ja mede. O caso foi
// reescrito para empilhar a tela SOBRE outra, que e o unico arranjo em que a
// trava pode falhar, e so entao `canPop: true` reprovou.

import 'dart:async';
import 'dart:io';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/versao_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/telas/atualizacao/aviso_de_versao_nova.dart';
import 'package:bichu/telas/atualizacao/portao_de_versao.dart';
import 'package:bichu/telas/atualizacao/tela_de_bloqueio_por_versao.dart';
import 'package:bichu/telas/atualizacao/textos_da_atualizacao.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

// ==========================================================================
// Os dobres de transporte. Um por FORMA de falha, e nao um generico.
// ==========================================================================

/// 200 com o corpo que o teste dita. Conta os envios: zero significa que o
/// caso mediu outra coisa que nao a chamada.
class _Responde extends http.BaseClient {
  _Responde(this.corpo, {this.status = 200, this.tipo = 'application/json'});

  final String corpo;
  final int status;
  final String tipo;
  int envios = 0;
  Uri? ultimaUri;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    envios += 1;
    ultimaUri = request.url;
    final bytes = corpo.codeUnits;
    return http.StreamedResponse(
      Stream<List<int>>.value(bytes),
      status,
      headers: <String, String>{'content-type': tipo},
      contentLength: bytes.length,
    );
  }
}

/// (c1) SEM REDE: o transporte nem conecta. E o que acontece no metro.
class _SemRede extends http.BaseClient {
  int envios = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    envios += 1;
    throw const SocketException('nenhuma rota para o host');
  }
}

/// (c2) TEMPO ESGOTADO: os cabecalhos chegam e o corpo nunca vem.
///
/// E a forma de falha que `ApiClient` converte em `FalhaDeTempo`, e ela e
/// diferente de (c1) de proposito: aqui a requisicao SAIU.
class _CabecalhoSemCorpo extends http.BaseClient {
  final StreamController<List<int>> _mudo = StreamController<List<int>>();
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

/// O servidor que so responde quando o TESTE manda.
///
/// Existe para a isca de "o portao nasce LIBERADO": com uma resposta imediata,
/// o `pumpAndSettle` ja aplicou o veredito e o primeiro quadro nao e
/// observavel. Aqui o caso pinta o aplicativo ANTES de a resposta existir, que
/// e o estado em que toda abertura comeca.
class _RespondeQuandoMandarem extends http.BaseClient {
  _RespondeQuandoMandarem(this.corpo);

  final String corpo;
  final Completer<void> _liberado = Completer<void>();
  int envios = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    envios += 1;
    await _liberado.future;
    final bytes = corpo.codeUnits;
    return http.StreamedResponse(
      Stream<List<int>>.value(bytes),
      200,
      headers: const <String, String>{'content-type': 'application/json'},
      contentLength: bytes.length,
    );
  }

  void responder() => _liberado.complete();
}

VersaoApi _apiCom(http.BaseClient cliente, {Duration? prazo}) {
  return VersaoApi(
    ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
      cliente: cliente,
      tempoLimite: prazo ?? const Duration(seconds: 20),
    ),
  );
}

const String _bloqueia = '{"verdict":"update_required","store_url":null}';
const String _recomenda = '{"verdict":"update_recommended","store_url":null}';
const String _loja = 'https://play.google.com/store/apps/details?id=app.bichu';

void main() {
  setUp(AppConfig.limparParaTeste);
  tearDown(SaidaDoApp.restaurar);

  // ========================================================================
  // (c) AS CINCO FORMAS DE FALHA LIBERAM — UMA POR UMA
  // ========================================================================

  group('(c) falha LIBERA, nas cinco formas', () {
    test('(c1) SEM REDE: a requisicao nem sai, e o veredito e liberado', () async {
      final transporte = _SemRede();
      final resposta = await _apiCom(transporte).consultar(
        plataforma: 'android',
        versao: '1.0.0',
      );
      expect(transporte.envios, 1, reason: 'o caso precisa ter TENTADO chamar');
      expect(resposta.veredito, VereditoDeVersao.liberado);
      expect(resposta.loja, isNull);
    });

    test('(c2) TEMPO ESGOTADO: o corpo nunca vem, e o veredito e liberado', () async {
      final transporte = _CabecalhoSemCorpo();
      final resposta = await _apiCom(
        transporte,
        prazo: const Duration(milliseconds: 50),
      ).consultar(plataforma: 'android', versao: '1.0.0');
      expect(transporte.envios, 1, reason: 'o caso precisa ter TENTADO chamar');
      expect(resposta.veredito, VereditoDeVersao.liberado);
      await transporte.fechar();
    });

    test('(c3) ERRO DO SERVIDOR (500): o veredito e liberado', () async {
      final transporte = _Responde(
        '{"type":"https://api/problems/internal","title":"erro"}',
        status: 500,
        tipo: 'application/problem+json',
      );
      final resposta = await _apiCom(transporte).consultar(
        plataforma: 'android',
        versao: '1.0.0',
      );
      expect(transporte.envios, 1);
      expect(resposta.veredito, VereditoDeVersao.liberado);
    });

    test('(c4) CORPO FORA DO CONTRATO: 200 com `verdict` que nao e texto', () async {
      // Esta e a forma que `catch (FalhaDeChamada)` NAO pega: nada falhou no
      // transporte, e o erro nasce na leitura do corpo.
      final transporte = _Responde('{"verdict":7,"store_url":"$_loja"}');
      final resposta = await _apiCom(transporte).consultar(
        plataforma: 'android',
        versao: '1.0.0',
      );
      expect(transporte.envios, 1);
      expect(resposta.veredito, VereditoDeVersao.liberado);
      expect(resposta.loja, isNull, reason: 'corpo que nao se entende nao da loja');
    });

    test('(c4b) CORPO FORA DO CONTRATO: 200 que nem e JSON de objeto', () async {
      final transporte = _Responde('isto nao e json');
      final resposta = await _apiCom(transporte).consultar(
        plataforma: 'android',
        versao: '1.0.0',
      );
      expect(transporte.envios, 1);
      expect(resposta.veredito, VereditoDeVersao.liberado);
    });

    test('(c5) CAMPO AUSENTE: 200 com corpo vazio, e o veredito e liberado', () async {
      final transporte = _Responde('{}');
      final resposta = await _apiCom(transporte).consultar(
        plataforma: 'android',
        versao: '1.0.0',
      );
      expect(transporte.envios, 1);
      expect(resposta.veredito, VereditoDeVersao.liberado);
    });

    test('ISCA DA ISCA: o MESMO transporte com 200 e `update_required` BLOQUEIA', () async {
      // Sem este caso, os seis acima passariam tambem num mundo em que
      // `consultar` devolvesse liberado SEMPRE -- que e o defeito oposto e
      // igualmente invisivel.
      final transporte = _Responde(_bloqueia);
      final resposta = await _apiCom(transporte).consultar(
        plataforma: 'android',
        versao: '1.0.0',
      );
      expect(resposta.veredito, VereditoDeVersao.bloqueado);
    });
  });

  group('o que nao se reconhece tambem libera', () {
    test('veredito DESCONHECIDO nao fecha o app', () async {
      // Um `verdict` novo que o servidor passe a mandar nao pode fechar um
      // binario que nao sabe o que ele significa.
      final resposta = await _apiCom(_Responde('{"verdict":"shut_it_down"}')).consultar(
        plataforma: 'android',
        versao: '1.0.0',
      );
      expect(resposta.veredito, VereditoDeVersao.liberado);
    });

    test('sem APP_VERSION no build a requisicao NEM SAI', () async {
      final transporte = _Responde(_bloqueia);
      for (final String? versao in <String?>[null, '']) {
        final resposta = await _apiCom(transporte).consultar(
          plataforma: 'android',
          versao: versao,
        );
        expect(resposta.veredito, VereditoDeVersao.liberado);
      }
      expect(transporte.envios, 0, reason: 'sem versao nao ha o que perguntar');
    });

    test('loja fora de `https` vira nula, e o botao nao aparece', () async {
      for (final String ruim in <String>[
        'http://play.google.com/x',
        'nao-e-url',
        '',
        'javascript:alert(1)',
      ]) {
        final resposta = await _apiCom(
          _Responde('{"verdict":"update_required","store_url":"$ruim"}'),
        ).consultar(plataforma: 'android', versao: '1.0.0');
        expect(resposta.veredito, VereditoDeVersao.bloqueado);
        expect(resposta.loja, isNull, reason: 'loja "$ruim" deveria virar nula');
      }
    });

    test('loja `https` valida chega inteira', () async {
      final resposta = await _apiCom(
        _Responde('{"verdict":"update_required","store_url":"$_loja"}'),
      ).consultar(plataforma: 'android', versao: '1.0.0');
      expect(resposta.loja, Uri.parse(_loja));
    });
  });

  group('o app manda a propria versao, e o servidor decide', () {
    test('a versao e a plataforma vao na query, e NADA mais', () async {
      final transporte = _Responde(_recomenda);
      await _apiCom(transporte).consultar(plataforma: 'android', versao: '1.4.2');
      final uri = transporte.ultimaUri;
      expect(uri, isNotNull);
      expect(uri!.path, '/v1/app/version-status');
      expect(uri.queryParameters, <String, String>{
        'platform': 'android',
        'version': '1.4.2',
      });
    });

    test('a plataforma sai de `defaultTargetPlatform`, e nem toda uma pergunta', () {
      expect(PortaoDeVersao.plataformaDo(TargetPlatform.android), 'android');
      expect(PortaoDeVersao.plataformaDo(TargetPlatform.iOS), 'ios');
      // Nao ha politica para as outras, e inventar uma cadeia receberia 400.
      expect(PortaoDeVersao.plataformaDo(TargetPlatform.linux), isNull);
      expect(PortaoDeVersao.plataformaDo(TargetPlatform.macOS), isNull);
      expect(PortaoDeVersao.plataformaDo(TargetPlatform.windows), isNull);
      expect(PortaoDeVersao.plataformaDo(TargetPlatform.fuchsia), isNull);
    });
  });

  // ========================================================================
  // O PORTAO: a tela de bloqueio e o aviso brando
  // ========================================================================

  group('o portao de versao', () {
    Widget sob(http.BaseClient transporte, {String? versao = '1.0.0'}) {
      return MaterialApp(
        theme: BichuTheme.claro,
        home: PortaoDeVersao(
          versaoApi: _apiCom(transporte),
          versaoDoApp: versao,
          child: const Scaffold(body: Text('o app inteiro')),
        ),
      );
    }

    // `variant`, e nao `setUp`/`tearDown` com
    // `debugDefaultTargetPlatformOverride`: a bancada confere as variaveis de
    // depuracao DENTRO do corpo do caso, antes do `tearDown`, e reprova com
    // "a foundation debug variable was changed by the test". Medido aqui: as
    // 15 primeiras versoes destes casos reprovaram exatamente assim.
    final android = TargetPlatformVariant.only(TargetPlatform.android);

    testWidgets(
      'ISCA CENTRAL: o portao NASCE liberado -- o app pinta ANTES da resposta',
      (tester) async {
        // A trava 2 do desenho, medida no primeiro quadro: enquanto a resposta
        // nao chegou, o aplicativo esta inteiro. Se o estado inicial fosse
        // `bloqueado` -- ou se houvesse tela de carregando --, toda abertura
        // sem rede pararia aqui, e o mecanismo trancaria o produto justamente
        // onde nao deveria opinar.
        final transporte = _RespondeQuandoMandarem(_bloqueia);
        await tester.pumpWidget(
          MaterialApp(
            theme: BichuTheme.claro,
            home: PortaoDeVersao(
              versaoApi: _apiCom(transporte),
              versaoDoApp: '1.0.0',
              child: const Scaffold(body: Text('o app inteiro')),
            ),
          ),
        );
        // UM quadro, e nada de `pumpAndSettle`: a resposta nao existe ainda.
        expect(transporte.envios, 1, reason: 'o portao precisa ter perguntado');
        expect(find.text('o app inteiro'), findsOneWidget,
            reason: 'o app tem de estar de pe ANTES de o veredito chegar');
        expect(find.byType(TelaDeBloqueioPorVersao), findsNothing);

        // E quando a resposta chega dizendo que nao serve, ai sim fecha.
        transporte.responder();
        await tester.pumpAndSettle();
        expect(find.byType(TelaDeBloqueioPorVersao), findsOneWidget);
        expect(find.text('o app inteiro'), findsNothing);
      },
      variant: android,
    );

    testWidgets('(c) sem rede, o app aparece e NAO ha bloqueio', (tester) async {
      await tester.pumpWidget(sob(_SemRede()));
      await tester.pumpAndSettle();
      expect(find.text('o app inteiro'), findsOneWidget);
      expect(find.byType(TelaDeBloqueioPorVersao), findsNothing);
    }, variant: android);

    testWidgets('(c) 500, o app aparece e NAO ha bloqueio', (tester) async {
      await tester.pumpWidget(sob(_Responde('{}', status: 500)));
      await tester.pumpAndSettle();
      expect(find.text('o app inteiro'), findsOneWidget);
      expect(find.byType(TelaDeBloqueioPorVersao), findsNothing);
    }, variant: android);

    testWidgets('(c) campo ausente, o app aparece e NAO ha bloqueio', (tester) async {
      await tester.pumpWidget(sob(_Responde('{}')));
      await tester.pumpAndSettle();
      expect(find.text('o app inteiro'), findsOneWidget);
      expect(find.byType(TelaDeBloqueioPorVersao), findsNothing);
    }, variant: android);

    testWidgets('(c) corpo fora do contrato, o app aparece e NAO ha bloqueio', (tester) async {
      await tester.pumpWidget(sob(_Responde('{"verdict":[1,2]}')));
      await tester.pumpAndSettle();
      expect(find.text('o app inteiro'), findsOneWidget);
      expect(find.byType(TelaDeBloqueioPorVersao), findsNothing);
    }, variant: android);

    testWidgets('(c) tempo esgotado, o app aparece e NAO ha bloqueio', (tester) async {
      final transporte = _CabecalhoSemCorpo();
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: PortaoDeVersao(
            versaoApi: _apiCom(transporte, prazo: const Duration(milliseconds: 50)),
            versaoDoApp: '1.0.0',
            child: const Scaffold(body: Text('o app inteiro')),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpAndSettle();
      expect(find.text('o app inteiro'), findsOneWidget);
      expect(find.byType(TelaDeBloqueioPorVersao), findsNothing);
      await transporte.fechar();
    }, variant: android);

    testWidgets('(e) mecanismo desligado (`supported`): o app aparece inteiro', (tester) async {
      await tester.pumpWidget(sob(_Responde('{"verdict":"supported","store_url":null}')));
      await tester.pumpAndSettle();
      expect(find.text('o app inteiro'), findsOneWidget);
      expect(find.byType(TelaDeBloqueioPorVersao), findsNothing);
      expect(find.byType(AvisoDeVersaoNova), findsNothing);
    }, variant: android);

    testWidgets('(a) `update_required`: o bloqueio ocupa a tela e o app SAI da arvore', (tester) async {
      await tester.pumpWidget(sob(_Responde(_bloqueia)));
      await tester.pumpAndSettle();
      expect(find.byType(TelaDeBloqueioPorVersao), findsOneWidget);
      // O app nao esta escondido atras: ele NAO esta na arvore.
      expect(find.text('o app inteiro'), findsNothing);
      expect(find.text(TextosDaAtualizacao.tituloDoBloqueio), findsOneWidget);
      expect(find.text(TextosDaAtualizacao.corpoDoBloqueio), findsOneWidget);
    }, variant: android);

    testWidgets('(a) o bloqueio NAO oferece "continuar assim" nem "agora nao"', (tester) async {
      await tester.pumpWidget(sob(_Responde(_bloqueia)));
      await tester.pumpAndSettle();
      expect(find.text(TextosDaAtualizacao.agoraNao), findsNothing);
      expect(find.byType(BackButton), findsNothing);
      expect(find.byType(AppBar), findsNothing);
    }, variant: android);

    testWidgets('(a) bloqueado, NAO HA ROTA a que voltar: o app saiu da arvore', (tester) async {
      // A primeira trava de "nao da para fechar", e ela e ESTRUTURAL: o
      // `child` -- o roteador inteiro do app -- nao esta montado. Nao ha pilha
      // de navegacao por tras do bloqueio, entao nao ha rota, deep link nem
      // gesto que alcance o app.
      //
      // Este caso NAO mede o `PopScope`, e dizer isso importa: montado como
      // raiz, `canPop: true` daria o mesmo resultado aqui, porque nao ha nada
      // para popar. Quem mede o `PopScope` e o caso do grupo abaixo, que monta
      // a tela SOBRE outra -- o arranjo em que ela seria contornavel.
      await tester.pumpWidget(sob(_Responde(_bloqueia)));
      await tester.pumpAndSettle();
      final NavigatorState navegador = tester.state(find.byType(Navigator));
      await navegador.maybePop();
      await tester.pumpAndSettle();
      expect(find.byType(TelaDeBloqueioPorVersao), findsOneWidget);
      expect(find.text('o app inteiro'), findsNothing);
    }, variant: android);

    testWidgets('SEM LOJA (hoje): nao ha botao, e a tela diz o que fazer', (tester) async {
      await tester.pumpWidget(sob(_Responde(_bloqueia)));
      await tester.pumpAndSettle();
      expect(find.text(TextosDaAtualizacao.irParaALoja), findsNothing,
          reason: 'botao que leva a lugar nenhum nao deve existir');
      expect(find.text(TextosDaAtualizacao.comoAtualizarSemLoja), findsOneWidget);
    }, variant: android);

    testWidgets('COM LOJA: o botao aparece e abre o link pela porta', (tester) async {
      final saida = _SaidaEspia();
      SaidaDoApp.atual = saida;
      await tester.pumpWidget(
        sob(_Responde('{"verdict":"update_required","store_url":"$_loja"}')),
      );
      await tester.pumpAndSettle();
      expect(find.text(TextosDaAtualizacao.comoAtualizarSemLoja), findsNothing);
      await tester.tap(find.text(TextosDaAtualizacao.irParaALoja));
      await tester.pumpAndSettle();
      expect(saida.abertos, <Uri>[Uri.parse(_loja)]);
    }, variant: android);

    testWidgets('(b) `update_recommended`: AVISA e NAO bloqueia', (tester) async {
      await tester.pumpWidget(sob(_Responde(_recomenda)));
      await tester.pumpAndSettle();
      expect(find.byType(AvisoDeVersaoNova), findsOneWidget);
      // A diferenca que importa: o app continua inteiro embaixo da faixa.
      expect(find.text('o app inteiro'), findsOneWidget);
      expect(find.byType(TelaDeBloqueioPorVersao), findsNothing);
    }, variant: android);

    testWidgets('(b) o aviso brando SAI com `Agora nao`, e o app fica', (tester) async {
      await tester.pumpWidget(sob(_Responde(_recomenda)));
      await tester.pumpAndSettle();
      await tester.tap(find.text(TextosDaAtualizacao.agoraNao));
      await tester.pumpAndSettle();
      expect(find.byType(AvisoDeVersaoNova), findsNothing);
      expect(find.text('o app inteiro'), findsOneWidget);
    }, variant: android);

    testWidgets('sem APP_VERSION o portao nem pergunta, e o app aparece', (tester) async {
      final transporte = _Responde(_bloqueia);
      await tester.pumpWidget(sob(transporte, versao: null));
      await tester.pumpAndSettle();
      expect(transporte.envios, 0);
      expect(find.text('o app inteiro'), findsOneWidget);
      expect(find.byType(TelaDeBloqueioPorVersao), findsNothing);
    }, variant: android);

    testWidgets('em plataforma sem politica o portao nem pergunta', (tester) async {
      final transporte = _Responde(_bloqueia);
      await tester.pumpWidget(sob(transporte));
      await tester.pumpAndSettle();
      expect(transporte.envios, 0);
      expect(find.text('o app inteiro'), findsOneWidget);
    }, variant: TargetPlatformVariant.only(TargetPlatform.linux));
  });

  group('a tela de bloqueio sozinha: o `PopScope` que ela carrega', () {
    // ====================================================================
    // POR QUE ESTE GRUPO EXISTE, E POR QUE ELE NAO E ZELO
    // ====================================================================
    //
    // No portao a tela e a RAIZ, e ali `PopScope` nao decide nada: nao ha rota
    // por baixo para voltar. Medido: com `canPop: true`, o caso
    // `(a) bloqueado, NAO HA ROTA a que voltar` continuava VERDE -- ou seja,
    // ele nao media o `PopScope`, e a trava estava afirmada e nao provada.
    //
    // O `PopScope` da tela e a segunda trava, e ela vale no arranjo em que a
    // tela e EMPILHADA sobre outra -- que e como qualquer reuso futuro dela
    // apareceria. Aqui ela e medida nesse arranjo, que e o unico em que ela
    // pode falhar.

    testWidgets('empilhada sobre outra tela, ela NAO sai com voltar', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(body: Text('a tela de baixo')),
        ),
      );
      final NavigatorState navegador = tester.state(find.byType(Navigator));
      unawaited(
        navegador.push(
          MaterialPageRoute<void>(
            builder: (_) => const TelaDeBloqueioPorVersao(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(TelaDeBloqueioPorVersao), findsOneWidget);
      expect(find.text('a tela de baixo'), findsNothing);

      // O caminho do botao de voltar e do gesto de borda do Android.
      await navegador.maybePop();
      await tester.pumpAndSettle();
      expect(find.byType(TelaDeBloqueioPorVersao), findsOneWidget,
          reason: 'o bloqueio saiu com um maybePop: `PopScope` nao esta travando');
      expect(find.text('a tela de baixo'), findsNothing);
    });

    testWidgets('ISCA DA ISCA: uma tela SEM `PopScope` sai com o mesmo gesto', (tester) async {
      // Sem este par, o caso acima passaria tambem num mundo em que
      // `maybePop()` nao fizesse nada em teste de widget.
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(body: Text('a tela de baixo')),
        ),
      );
      final NavigatorState navegador = tester.state(find.byType(Navigator));
      unawaited(
        navegador.push(
          MaterialPageRoute<void>(
            builder: (_) => const Scaffold(body: Text('uma tela comum')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('uma tela comum'), findsOneWidget);
      await navegador.maybePop();
      await tester.pumpAndSettle();
      expect(find.text('a tela de baixo'), findsOneWidget,
          reason: 'o `maybePop` precisa funcionar, senao o caso de cima nao mede nada');
    });
  });

  group('`APP_VERSION` entra pela configuracao do build', () {
    test('ausente e nula, e isso NAO derruba o arranque', () {
      final config = AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000');
      expect(config.versaoDoApp, isNull);
    });

    test('presente chega inteira, sem validacao local do formato', () {
      // Sem validacao local de proposito: o formato e cobrado pelo `pattern`
      // de `AppVersion` do contrato, e uma segunda definicao aqui divergiria.
      final config = AppConfig.carregar(
        apiBaseUrlDeTeste: 'http://localhost:3000',
        versaoDoAppDeTeste: '1.10.0',
      );
      expect(config.versaoDoApp, '1.10.0');
    });
  });
}

/// A porta de saida, espiada. O bloqueio nao fala com o aparelho: ele chama
/// [SaidaDoApp], que e o arranjo que `porta_nao_contornada_test.dart` exige.
class _SaidaEspia extends SaidaDoApp {
  final List<Uri> abertos = <Uri>[];

  @override
  Future<bool> abrirLink(Uri link) async {
    abertos.add(link);
    return true;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) =>
      throw UnimplementedError('este arquivo nao exercita mapas');

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) =>
      throw UnimplementedError('este arquivo nao exercita mapas');

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) =>
      throw UnimplementedError('este arquivo nao exercita calendario');

  @override
  Future<bool> compartilharTexto({
    required String texto,
    required String assunto,
  }) async {
    // Este arquivo nao fala de compartilhamento. Devolver `false` e o lado
    // escondido, e o dia em que alguem o chamar daqui o teste nao vai afirmar
    // que a folha abriu.
    return false;
  }
}
