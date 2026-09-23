// ISCA — "carregando para sempre" nao pode ser um estado alcancavel.
//
// **O que este arquivo NAO faz, e por que.** Um caso que confirmasse "ao tocar
// no botao a tela mostra o indicador" fica VERDE com o defeito inteiro de pe:
// o indicador aparece igual quando ele nunca mais sai. Esse e o padrao que
// derrubou quase todo defeito grave deste projeto, e por isso os casos abaixo
// verificam o **efeito**: depois de a chamada terminar mal, a tela precisa ter
// SAIDO do carregando, ter dito alguma coisa e ter devolvido o botao.
//
// As duas formas de terminar mal, e sao formas diferentes:
//
// 1. **A resposta que nao vem.** O prazo do `ApiClient` estoura e vira
//    `FalhaDeTempo`. Guardado no nivel da camada por
//    `test/api/prazo_cobre_o_corpo_test.dart`; aqui o que se mede e o que a
//    TELA faz com isso.
// 2. **A resposta que vem fora do contrato.** 201 com outro formato faz
//    `Sessao.doJson` estourar `TypeError`, que **nao** e `FalhaDeChamada`.
//    Enquanto o `setState` que desliga o carregando morava so dentro do
//    `catch (FalhaDeChamada)`, este caminho girava para sempre com o erro
//    engolido.
//
// A regra que os casos guardam:
//
// > **Toda acao de tela que mostra carregando precisa sair dele, em qualquer
// > desfecho, e devolver um caminho a pessoa.**

import 'dart:async';
import 'dart:convert';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String versao = '2026-09-17';

  /// 201 com o corpo do contrato, trocado por outro formato.
  ///
  /// **Nao e um 500 disfarcado**: o status e de sucesso e o `content-type` e
  /// json, entao a camada de API entrega o mapa sem reclamar e quem estoura e
  /// o construtor do modelo, acima dela. E o caminho que o `catch` das telas
  /// nao enxergava.
  http.Response sucessoForaDoContrato() {
    return http.Response(
      jsonEncode(<String, dynamic>{'nada': 'aqui'}),
      201,
      headers: const <String, String>{'content-type': 'application/json'},
    );
  }

  Future<void> abrirTelaDeConta(
    WidgetTester tester,
    String rotulo,
    Future<http.Response> Function(http.Request) rede,
  ) async {
    AppConfig.limparParaTeste();
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(
          apiBaseUrlDeTeste: urlBase,
          versaoDosTermosDeTeste: versao,
        ),
        deposito: DepositoEmMemoria(),
        clienteHttp: MockClient(rede),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(rotulo));
    await tester.pumpAndSettle();
  }

  /// O que a pessoa precisa ter de volta depois de um desfecho ruim.
  ///
  /// Os tres sao fatos independentes e nenhum deles compara texto de tela com
  /// a constante que o produz -- comparar assim seria tautologia, e este
  /// repositorio ja teve tres casos assim no mesmo dia.
  Future<void> exigirSaidaDoCarregando(
    WidgetTester tester,
    String rotulo,
  ) async {
    expect(
      find.byType(CircularProgressIndicator),
      findsNothing,
      reason: 'REPROVA: a tela continua CARREGANDO depois de a chamada ter '
          'terminado. E o defeito que o cliente relatou em aparelho: ele toca '
          'no botao e o circulo nao para nunca.',
    );
    // A faixa de aviso cresce a lista e pode empurrar o botao para fora da
    // dobra, e `ListView` nao constroi o que nao cabe. Rolar primeiro e o que
    // a pessoa faz; sem isto o caso reprovaria por nao ACHAR o botao, que e
    // outro motivo que nao o do caso.
    final alvo = find.widgetWithText(FilledButton, rotulo);
    if (alvo.evaluate().isEmpty) {
      await tester.dragUntilVisible(
        alvo,
        find.byType(Scrollable).first,
        const Offset(0, -120),
      );
      await tester.pumpAndSettle();
    }
    expect(
      alvo,
      findsOneWidget,
      reason: 'REPROVA: o botao sumiu da tela depois do desfecho ruim. Sem '
          'ele a pessoa nao tem como tentar de novo.',
    );
    final botao = tester.widget<FilledButton>(alvo);
    expect(
      botao.onPressed,
      isNotNull,
      reason: 'REPROVA: a tela saiu do indicador e deixou o botao DESABILITADO. '
          'Sem indicador e sem botao a pessoa fica sem nenhum caminho, que e '
          'pior que o circulo girando -- ao menos o circulo parece estar '
          'fazendo alguma coisa.',
    );
    expect(
      find.byType(FaixaDeAviso),
      findsWidgets,
      reason: 'REPROVA: a tela saiu do carregando EM SILENCIO. Nada aconteceu, '
          'nada foi dito, e a pessoa toca de novo achando que o primeiro '
          'toque nao pegou.',
    );
  }

  Future<void> preencherCadastro(WidgetTester tester) async {
    await tester.enterText(
      find.byType(TextField).at(1),
      'marina@exemplo.com.br',
    );
    await tester.enterText(find.byType(TextField).at(2), 'uma frase longa');
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
  }

  group('ISCA — criar conta sempre sai do carregando', () {
    testWidgets('quando o servidor nao responde', (tester) async {
      final mudo = Completer<http.Response>();
      await abrirTelaDeConta(tester, 'Criar conta', (_) => mudo.future);
      await preencherCadastro(tester);

      await tester.tap(find.widgetWithText(FilledButton, 'Criar conta'));
      await tester.pump();
      // O indicador PRECISA estar la neste instante: sem isto o caso passaria
      // numa tela que nunca mostrou carregando nenhum, e nao estaria medindo
      // o que diz medir.
      expect(
        find.byType(CircularProgressIndicator),
        findsOneWidget,
        reason: 'O caso nao chegou a por a tela em carregando: ele esta '
            'medindo outra coisa.',
      );

      // Avanca o relogio MUITO alem do prazo do ApiClient (20 s).
      await tester.pump(const Duration(minutes: 5));
      await tester.pumpAndSettle();

      await exigirSaidaDoCarregando(tester, 'Criar conta');
      mudo.complete(http.Response('{}', 500));
    });

    testWidgets('quando o servidor responde 201 fora do contrato',
        (tester) async {
      await abrirTelaDeConta(
        tester,
        'Criar conta',
        (_) async => sucessoForaDoContrato(),
      );
      await preencherCadastro(tester);

      await tester.tap(find.widgetWithText(FilledButton, 'Criar conta'));
      await tester.pumpAndSettle();

      await exigirSaidaDoCarregando(tester, 'Criar conta');
      expect(
        tester.takeException(),
        isNotNull,
        reason: 'REPROVA: a tela saiu do carregando ENGOLINDO o erro. Um 201 '
            'fora do contrato quer dizer que o par app/servidor esta '
            'desencontrado, e isso precisa chegar a quem opera -- nao virar '
            'so uma frase na tela de uma pessoa.',
      );
    });
  });

  group('ISCA — entrar sempre sai do carregando', () {
    Future<void> preencherLogin(WidgetTester tester) async {
      await tester.enterText(
        find.byType(TextField).at(0),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(1), 'uma frase longa');
      await tester.pumpAndSettle();
    }

    testWidgets('quando o servidor nao responde', (tester) async {
      final mudo = Completer<http.Response>();
      await abrirTelaDeConta(tester, 'Entrar', (_) => mudo.future);
      await preencherLogin(tester);

      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      await tester.pump(const Duration(minutes: 5));
      await tester.pumpAndSettle();

      await exigirSaidaDoCarregando(tester, 'Entrar');
      mudo.complete(http.Response('{}', 500));
    });

    testWidgets('quando o servidor responde 200 fora do contrato',
        (tester) async {
      await abrirTelaDeConta(
        tester,
        'Entrar',
        (_) async => sucessoForaDoContrato(),
      );
      await preencherLogin(tester);

      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();

      await exigirSaidaDoCarregando(tester, 'Entrar');
      expect(tester.takeException(), isNotNull);
    });
  });
}
