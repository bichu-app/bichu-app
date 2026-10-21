// AS ISCAS DO ARRANQUE QUE NAO ESPERA.
//
// ===========================================================================
// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA NAO DEIXAR VOLTAR
// ===========================================================================
//
// Em 20/10/2026 o cliente trocou o esquema do Xcode para Release e o app parou
// de abrir no iPhone: *"nao sai do splashscreen"*. Perguntado se havia circulo
// girando, respondeu *"esta completamente parada"*, e descreveu *"fundo bordo
// com detalhes em amarelo"*.
//
// Essa descricao e o diagnostico inteiro, porque ela identifica QUAL tela
// estava na frente. O `LaunchScreen.storyboard` do iOS e bordo (#9E0B3A, o
// 1x1 de `LaunchBackground`) com o bichinho em creme, e **nao tem indicador
// nenhum**. A nossa `TelaDeAbertura` e branca (`cores.surface`, #FAFAF8),
// tem a palavra "Bichu" desenhada e tem um `CircularProgressIndicator`
// girando. Sem rodinha e sem palavra: o que estava na tela era o storyboard
// NATIVO, ou seja **`runApp` nunca foi chamado**.
//
// O unico `await` antes do `runApp` era `Firebase.initializeApp`. Ele estava
// dentro de um `try/catch`, e o `catch` nunca o pegou -- porque
// **`try/catch` nao pega travamento**: um `Future` que nunca completa tambem
// nunca lanca. Era a terceira via, nem "push desligado" nem "tela de
// configuracao ausente": arranque parado antes do primeiro quadro.
//
// Nao foi regressao de codigo. `main.dart`, `deposito_de_sessao.dart` e
// `controlador_de_sessao.dart` estao IDENTICOS entre `fb3a0fba` (o build que
// abriu) e `1ff67840` (o que travou). O que mudou foi o estado da instalacao:
// instalacao nova faz registro de primeira execucao (Firebase Installations,
// obter o FID), que e ida a rede; instalacao com FID em cache volta na hora.
//
// ===========================================================================
// POR QUE O DUBLE NUNCA COMPLETA, E POR QUE ISSO E O PONTO
// ===========================================================================
//
// **Um duble que ATRASA nao mede nada aqui.** Com `Future.delayed` o caso
// passa com o `await` cru de volta -- basta o teste esperar um pouco mais, e
// o defeito volta verde. O unico duble que separa conserto de enfeite e o que
// **nunca** completa: com ele, o primeiro quadro so existe se houver teto.
//
// Conferido na marra antes de comitar: removendo o `.timeout` de `_avisos`,
// o caso `ISCA: o primeiro quadro desenha com o push pendurado para sempre`
// reprova pelo nome.
//
// ===========================================================================
// O QUE ESTE ARQUIVO NAO MEDE
// ===========================================================================
//
// Ele mede que `desenhar` (que em producao e `runApp`) **e chamado**, e com
// qual arvore. Ele nao MONTA a `BichuApp`, e isso e deliberado: montar
// dispara `getApplicationDocumentsDirectory()` e os canais de plataforma dos
// depositos em arquivo, que em teste de widget nunca respondem -- o
// `pumpAndSettle` penduraria para sempre, que e ironicamente o mesmo formato
// de defeito que este arquivo cobra.

import 'dart:async';

import 'package:bichu/api/auth_api.dart';
import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/modelos.dart';
import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/main.dart';
import 'package:bichu/sessao/controlador_de_sessao.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String _urlBase = 'https://exemplo.test';

AppConfig _config() => AppConfig.carregar(apiBaseUrlDeTeste: _urlBase);

/// Um deposito de sessao que **nunca** responde.
///
/// Ele e o chaveiro que o iOS com provisionamento gratuito pode ser: aceita a
/// chamada e nao devolve. `Completer` sem `complete` e a unica forma honesta
/// de escrever isso -- qualquer atraso finito mediria outra coisa.
class _ChaveiroQueNuncaResponde implements DepositoDeSessao {
  final Completer<Sessao?> _nunca = Completer<Sessao?>();

  @override
  Future<Sessao?> ler() => _nunca.future;

  @override
  Future<void> gravar(Sessao sessao) async {}

  @override
  Future<void> apagar() async {}
}

/// Um deposito de sessao que **lanca**, como a `PlatformException` do Keychain.
class _ChaveiroQueRecusa implements DepositoDeSessao {
  @override
  Future<Sessao?> ler() async =>
      throw StateError('o chaveiro recusou a leitura');

  @override
  Future<void> gravar(Sessao sessao) async {}

  @override
  Future<void> apagar() async {}
}

ControladorDeSessao _controlador(DepositoDeSessao deposito) {
  final api = ApiClient(
    config: _config(),
    cliente: MockClient((_) async => http.Response('{}', 200)),
  );
  final controlador = ControladorDeSessao(
    auth: AuthApi(api),
    deposito: deposito,
  );
  addTearDown(controlador.dispose);
  addTearDown(api.fechar);
  return controlador;
}

void main() {
  setUp(AppConfig.limparParaTeste);
  tearDown(AppConfig.limparParaTeste);

  group('O PUSH NAO SEGURA O PRIMEIRO QUADRO', () {
    testWidgets(
      'ISCA: o primeiro quadro desenha com o push pendurado para sempre',
      (tester) async {
        // NUNCA completado. Nao e atraso: e ausencia de resposta.
        final pendurado = Completer<void>();
        addTearDown(() {
          if (!pendurado.isCompleted) pendurado.complete();
        });

        Widget? desenhado;
        unawaited(
          arrancar(
            desenhar: (tela) => desenhado = tela,
            inicializarPush: () => pendurado.future,
            carregarConfig: _config,
          ),
        );

        // Antes do teto nao ha quadro, e isso e esperado: o teto e curto, nao
        // zero. O que nao pode e nunca haver quadro.
        await tester.pump(Duration.zero);
        expect(
          desenhado,
          isNull,
          reason: 'antes do teto o arranque ainda esta esperando',
        );

        await tester.pump(tetoDoArranqueDoPush + const Duration(seconds: 1));

        expect(
          desenhado,
          isA<BichuApp>(),
          reason: 'o push pendurado para sempre NAO pode impedir o primeiro '
              'quadro -- sem teto, aqui o app fica no LaunchScreen nativo',
        );
      },
    );

    testWidgets(
      'o push que estoura o teto e indistinguivel do que falha: '
      'AvisosNaoEmbarcados com motivo',
      (tester) async {
        final pendurado = Completer<void>();
        addTearDown(() {
          if (!pendurado.isCompleted) pendurado.complete();
        });

        Widget? desenhado;
        unawaited(
          arrancar(
            desenhar: (tela) => desenhado = tela,
            inicializarPush: () => pendurado.future,
            carregarConfig: _config,
          ),
        );
        await tester.pump(tetoDoArranqueDoPush + const Duration(seconds: 1));

        final app = desenhado! as BichuApp;
        expect(app.avisos, isA<AvisosNaoEmbarcados>());
        expect(
          (app.avisos! as AvisosNaoEmbarcados).motivo,
          isNotEmpty,
          reason: 'o desfecho precisa ser explicito, e nao um silencio',
        );
      },
    );

    testWidgets(
      'REGUA: o push que sobe a tempo continua entregando AvisosPorFirebase',
      (tester) async {
        Widget? desenhado;
        unawaited(
          arrancar(
            desenhar: (tela) => desenhado = tela,
            inicializarPush: () async {},
            carregarConfig: _config,
          ),
        );
        await tester.pump(Duration.zero);

        final app = desenhado! as BichuApp;
        expect(app.avisos, isA<AvisosPorFirebase>());
      },
    );
  });

  group('A SESSAO SEMPRE SAI DE `carregando`', () {
    testWidgets(
      'ISCA: a sessao sai de carregando com o chaveiro pendurado para sempre',
      (tester) async {
        final controlador = _controlador(_ChaveiroQueNuncaResponde());
        expect(controlador.estado, EstadoDaSessao.carregando);

        unawaited(controlador.iniciar());
        await tester.pump(tetoDaLeituraDaSessao + const Duration(seconds: 1));

        expect(
          controlador.estado,
          EstadoDaSessao.deslogado,
          reason: 'o chaveiro que nao responde NAO pode deixar a pessoa presa '
              'na TelaDeAbertura -- `carregando` sem saida e splash sem saida',
        );
      },
    );

    testWidgets(
      'ISCA: o chaveiro que LANCA deixa o app deslogado, e nao parado',
      (tester) async {
        final controlador = _controlador(_ChaveiroQueRecusa());

        await controlador.iniciar();
        await tester.pump(Duration.zero);

        expect(
          controlador.estado,
          EstadoDaSessao.deslogado,
          reason: 'PlatformException do Keychain e o caso esperado com '
              'provisionamento gratuito, e ela subia sem ninguem pegar',
        );
      },
    );
  });
}
