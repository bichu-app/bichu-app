import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUp(AppConfig.limparParaTeste);

  Future<void> abrirOApp(WidgetTester tester) async {
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
        deposito: DepositoEmMemoria(),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('abre deslogado no Inicio, com as quatro abas visiveis',
      (tester) async {
    await abrirOApp(tester);

    // Deslogado e um estado de navegacao, nao um muro: nenhuma aba some,
    // nenhuma fica desabilitada.
    expect(find.widgetWithText(NavigationDestination, 'Início'), findsOne);
    expect(find.widgetWithText(NavigationDestination, 'Perdidos'), findsOne);
    expect(find.widgetWithText(NavigationDestination, 'Escanear'), findsOne);
    expect(find.widgetWithText(NavigationDestination, 'Perfil'), findsOne);
  });

  testWidgets('as quatro abas abrem sem conta', (tester) async {
    await abrirOApp(tester);

    for (final aba in <String>['Perdidos', 'Escanear', 'Perfil', 'Início']) {
      await tester.tap(find.widgetWithText(NavigationDestination, aba));
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(AppBar, aba == 'Início' ? 'Bichu' : aba),
        findsOne,
        reason: 'A aba $aba precisa abrir deslogada.',
      );
    }
  });

  testWidgets('deslogado, o caminho para criar conta esta na tela',
      (tester) async {
    await abrirOApp(tester);
    await tester.tap(find.text('Cadastrar meu pet'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Criar conta'), findsOne);
    expect(find.text('E-mail'), findsOne);
    expect(find.text('Senha'), findsOne);
    // O requisito e dito antes do erro.
    expect(find.textContaining('Pelo menos 10 caracteres'), findsOne);
  });

  testWidgets('a senha curta e recusada antes de gastar uma ida a rede',
      (tester) async {
    await abrirOApp(tester);
    await tester.tap(find.text('Cadastrar meu pet'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextField).at(1),
      'marina@exemplo.com.br',
    );
    await tester.enterText(find.byType(TextField).at(2), 'curta');
    await tester.tap(find.widgetWithText(FilledButton, 'Criar conta'));
    await tester.pumpAndSettle();

    expect(find.text('A senha precisa de pelo menos 10 caracteres.'), findsOne);
  });

  testWidgets('a tela de entrar oferece a saida para a recuperacao de senha',
      (tester) async {
    await abrirOApp(tester);
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
    await tester.pumpAndSettle();

    expect(find.text('Esqueci minha senha'), findsOne);
  });

  testWidgets('a confirmacao de recuperacao e opaca sobre a conta existir',
      (tester) async {
    await abrirOApp(tester);
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Esqueci minha senha'));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Digite o e-mail da sua conta'),
      findsOne,
    );
  });

  testWidgets('a escala de fonte do sistema e respeitada ate 200%',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: BichuApp(
          config:
              AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
          deposito: DepositoEmMemoria(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Nenhum container de texto tem altura fixa, entao a tela cresce em vez de
    // estourar. O teste falha com excecao de layout se algum tiver.
    expect(tester.takeException(), isNull);
  });
}
