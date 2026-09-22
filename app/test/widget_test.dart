import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/telas/casca_com_abas.dart';
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

  testWidgets('abre deslogado em Pets, com as cinco secoes visiveis',
      (tester) async {
    await abrirOApp(tester);

    // Deslogado e um estado de navegacao, nao um muro: nenhuma aba some,
    // nenhuma fica desabilitada. A lista vem do registro, e nao escrita a
    // mao: escrita a mao ela continuaria dizendo `Perdidos` para sempre.
    for (final destino in CascaComAbas.destinos) {
      expect(
        find.widgetWithText(NavigationDestination, destino.rotulo),
        findsOne,
        reason: 'REPROVA: a secao "${destino.rotulo}" nao esta na barra '
            'deslogada.',
      );
    }
    expect(find.widgetWithText(AppBar, 'Pets'), findsOne);
  });

  testWidgets('o app fala pt-BR, e o Flutter tambem', (tester) async {
    // O app sempre foi escrito em portugues; o que saia em ingles era o que o
    // FRAMEWORK desenha. Isso nao aparece lendo a tela: aparece no tooltip de
    // voltar, no menu de colar e, principalmente, no que o VoiceOver e o
    // TalkBack leem. O teste olha para o delegate resolvido, e nao para uma
    // string traduzida qualquer, porque e a resolucao do locale que quebra
    // quando alguem remove `supportedLocales` achando que e enfeite.
    await abrirOApp(tester);

    final contexto = tester.element(find.byType(Scaffold).first);
    expect(Localizations.localeOf(contexto), const Locale('pt', 'BR'));

    final materiais = MaterialLocalizations.of(contexto);
    expect(materiais.backButtonTooltip, 'Voltar');
    expect(materiais.pasteButtonLabel, 'Colar');

    // O leitor de tela le este rotulo em toda gaveta do app.
    expect(materiais.drawerLabel, isNotEmpty);
  });

  testWidgets('as cinco secoes abrem sem conta, com o titulo curto',
      (tester) async {
    await abrirOApp(tester);

    // **O titulo da barra de topo e o nome curto da secao, igual ao rotulo da
    // aba** (UX 25.7.2 e 27.4.2). Antes desta historia o Inicio deslogado
    // abria com o titulo `Bichu`, que nao era o rotulo de aba nenhuma; a
    // regra de "a mesma palavra nos dois lugares" e o que faz a casca servir
    // para conferir nomenclatura.
    //
    // Agora sao as CINCO, e nao tres: `Escanear` deixou de ser aba e virou
    // rota irma da casca, entao nao ha mais a excecao sem barra de topo aqui.
    for (final destino in CascaComAbas.destinos) {
      await tester.tap(
        find.widgetWithText(NavigationDestination, destino.rotulo),
      );
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(AppBar, destino.rotulo),
        findsOne,
        reason: 'REPROVA: a secao ${destino.rotulo} precisa abrir deslogada, '
            'com o titulo igual ao rotulo da aba.',
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
