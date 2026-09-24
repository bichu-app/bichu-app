// ISCA — a acao primaria de C.2 e C.4 nao pode depender de rolagem.
//
// **O que este arquivo NAO faz, e por que.** Um caso que comparasse a ALTURA
// do botao com a altura da janela ficaria verde numa tela em que o botao esta
// na posicao certa e nao faz nada, e reprovaria por um dp de diferenca de
// fonte. Altura e o sintoma; o que importa e o comportamento: **quem abre a
// tela num aparelho pequeno, com o teclado aberto, consegue tocar na acao
// primaria sem rolar, e a acao acontece.**
//
// Por isso cada caso abaixo toca no botao SEM rolar e mede o efeito do outro
// lado -- a requisicao que saiu, ou a recusa que apareceu dentro da janela.
//
// O QUE FOI MEDIDO, E QUANDO (23/09/2026, quatro gabaritos do design system
// secao 13, teclado de 270 dp aberto, campos preenchidos):
//
//   tela                 gabarito     janela   botao em     faltava rolar
//   C.2 Entrar           320 x 568    234 dp   286..334 dp  100 dp
//   C.2 Entrar           360 x 640    306 dp   286..334 dp   28 dp
//   C.2 Entrar           375 x 667    333 dp   280..328 dp    0 dp
//   C.2 Entrar           412 x 915    581 dp   280..328 dp    0 dp
//   C.4 Enviar o link    320 x 568    234 dp   264..312 dp   78 dp
//   C.4 Enviar o link    360 x 640    306 dp   264..312 dp    6 dp
//
// E o numero que decidiu, que nao esta nessa tabela: **depois do 401**, com a
// faixa de recusa na tela, faltavam 360 dp em 320 x 568, 264 dp em 360 x 640 e
// 231 dp em 375 x 667 -- um gabarito em que a tela estava certa ate a pessoa
// errar a senha. Quem erra a senha e quem ja tem conta.
//
// Em 320 x 568 o `ListView` nao chegava a CONSTRUIR o botao das duas telas:
// ele nao estava na arvore, entao nao podia ser focado nem lido por leitor de
// tela, e nenhum portao deste repositorio pegava isso.
//
// A regra que os casos guardam:
//
// > **A acao primaria de uma tela de conta esta na arvore e e tocavel sem
// > rolagem nenhuma, no menor gabarito suportado, com o teclado aberto -- e a
// > recusa que ela produz aparece dentro da janela.**
import 'dart:convert';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// O menor gabarito suportado (design system, secao 13) com o teclado aberto.
///
/// 270 dp de teclado e a medida da casa, a mesma registrada em
/// `widgets/barra_de_acao_fixa.dart`. Em 320 x 568 sobram 234 dp de area
/// rolavel, que e onde as duas telas quebravam.
const Size _aparelhoPequeno = Size(320, 568);
const double _tecladoDp = 270;

void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String versao = '2026-09-17';

  /// Os caminhos de TODA requisicao que sair, na ordem.
  ///
  /// Uma lista, e nao a ultima: a pergunta dos casos e "a acao aconteceu", e
  /// uma variavel que guarda so a ultima nao distingue nenhuma de uma.
  late List<String> chamadas;

  void aparelhoPequenoComTeclado(WidgetTester tester) {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = _aparelhoPequeno;
    tester.view.viewInsets = const FakeViewPadding(bottom: _tecladoDp);
    addTearDown(tester.view.reset);
  }

  Future<void> abrir(
    WidgetTester tester,
    String rotulo,
    Future<http.Response> Function(http.Request) rede,
  ) async {
    chamadas = <String>[];
    AppConfig.limparParaTeste();
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(
          apiBaseUrlDeTeste: urlBase,
          versaoDosTermosDeTeste: versao,
        ),
        deposito: DepositoEmMemoria(),
        clienteHttp: MockClient((requisicao) {
          chamadas.add(requisicao.url.path);
          return rede(requisicao);
        }),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(rotulo));
    await tester.pumpAndSettle();
  }

  /// O que a janela mostra agora: da barra de titulo ate o topo do teclado.
  Rect janelaVisivel(WidgetTester tester) {
    return Rect.fromLTRB(
      0,
      0,
      _aparelhoPequeno.width,
      _aparelhoPequeno.height - _tecladoDp,
    );
  }

  /// Toca no botao **proibindo qualquer rolagem**.
  ///
  /// `warnIfMissed: false` nao esta aqui para tolerar o toque perdido: o
  /// `expect` acima ja exigiu que o botao exista, e o de baixo exige que a
  /// acao tenha acontecido. Sem ele, um botao atras da barra de gestos vira
  /// aviso e nao falha, e aviso ninguem le.
  Future<void> tocarSemRolar(WidgetTester tester, Finder alvo) async {
    expect(
      alvo,
      findsOneWidget,
      reason:
          'REPROVA: a acao primaria nao esta na arvore de widgets neste '
          'gabarito. O que nao e construido nao pode ser tocado, nao pode '
          'receber foco e nao pode ser lido por leitor de tela -- e e assim '
          'que uma tela fica sem saida aparente.',
    );
    await tester.tap(alvo, warnIfMissed: false);
    await tester.pumpAndSettle();
  }

  group('ISCA — C.2 Entrar: a acao primaria nao depende de rolagem', () {
    testWidgets(
      'no menor gabarito com o teclado aberto, o toque entra na rede',
      (tester) async {
        aparelhoPequenoComTeclado(tester);
        await abrir(
          tester,
          'Entrar',
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'type': 'https://bichu.app/problems/invalid-credentials',
              'title': 'Credencial invalida',
              'status': 401,
            }),
            401,
            headers: const <String, String>{
              'content-type': 'application/problem+json',
            },
          ),
        );

        await tester.enterText(
          find.byType(TextField).at(0),
          'marina@exemplo.com.br',
        );
        await tester.enterText(find.byType(TextField).at(1), 'uma frase longa');
        await tester.pumpAndSettle();

        await tocarSemRolar(
          tester,
          find.widgetWithText(FilledButton, 'Entrar'),
        );

        expect(
          chamadas.where((c) => c.endsWith('/auth/login')),
          isNotEmpty,
          reason:
              'REPROVA: o toque na acao primaria nao produziu tentativa de '
              'login nenhuma. Para quem esta na tela isso e indistinguivel de '
              'um botao quebrado, que foi como o cliente relatou.',
        );
      },
    );

    testWidgets('a recusa do servidor nasce DENTRO da janela', (tester) async {
      // O outro lado do botao ancorado: ele e alcancavel de qualquer ponto da
      // rolagem, entao a recusa pode nascer onde a pessoa nao esta olhando.
      // Recusar fora da tela e a versao silenciosa de nao responder.
      aparelhoPequenoComTeclado(tester);
      await abrir(
        tester,
        'Entrar',
        (_) async => http.Response(
          jsonEncode(<String, dynamic>{
            'type': 'https://bichu.app/problems/invalid-credentials',
            'title': 'Credencial invalida',
            'status': 401,
          }),
          401,
          headers: const <String, String>{
            'content-type': 'application/problem+json',
          },
        ),
      );

      await tester.enterText(
        find.byType(TextField).at(0),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(1), 'senha errada');
      await tester.pumpAndSettle();
      await tocarSemRolar(tester, find.widgetWithText(FilledButton, 'Entrar'));

      // Escrito por extenso, e nao pela constante que o produz: comparar o
      // texto da tela com a constante da tela e tautologia.
      final recusa = find.text('E-mail ou senha não conferem.');
      expect(
        recusa,
        findsOneWidget,
        reason: 'REPROVA: o 401 nao virou recusa visivel na tela.',
      );
      final caixa = tester.getRect(recusa);
      final janela = janelaVisivel(tester);
      expect(
        caixa.top,
        greaterThanOrEqualTo(janela.top),
        reason:
            'REPROVA: a recusa ficou ACIMA da area visivel. A pessoa tocou '
            'no botao e a tela respondeu num lugar que ela nao esta vendo.',
      );
      expect(
        caixa.bottom,
        lessThanOrEqualTo(janela.bottom),
        reason:
            'REPROVA: a recusa ficou atras do teclado. Mesma coisa que nao '
            'ter respondido.',
      );
    });
  });

  group('ISCA — C.4 Esqueci minha senha: a acao nao depende de rolagem', () {
    Future<void> abrirC4(
      WidgetTester tester,
      Future<http.Response> Function(http.Request) rede,
    ) async {
      await abrir(tester, 'Entrar', rede);
      await tester.tap(find.text('Esqueci minha senha'));
      await tester.pumpAndSettle();
    }

    testWidgets('no menor gabarito com o teclado aberto, o toque pede o link', (
      tester,
    ) async {
      aparelhoPequenoComTeclado(tester);
      await abrirC4(
        tester,
        (_) async => http.Response(
          '',
          204,
          headers: const <String, String>{'content-type': 'application/json'},
        ),
      );

      await tester.enterText(
        find.byType(TextField).at(0),
        'marina@exemplo.com.br',
      );
      await tester.pumpAndSettle();
      await tocarSemRolar(
        tester,
        find.widgetWithText(FilledButton, 'Enviar o link'),
      );

      expect(
        chamadas.where((c) => c.contains('password')),
        isNotEmpty,
        reason:
            'REPROVA: o toque em `Enviar o link` nao pediu redefinicao '
            'nenhuma. A tela mais funda dos tres desvios fica sem saida.',
      );
    });

    testWidgets('depois do pedido, a acao de reenviar continua sem rolagem', (
      tester,
    ) async {
      // A fase 2 troca a acao da barra, e uma troca que esquecesse a barra
      // devolveria o botao para dentro do conteudo sem ninguem notar.
      aparelhoPequenoComTeclado(tester);
      await abrirC4(
        tester,
        (_) async => http.Response(
          '',
          204,
          headers: const <String, String>{'content-type': 'application/json'},
        ),
      );

      await tester.enterText(
        find.byType(TextField).at(0),
        'marina@exemplo.com.br',
      );
      await tester.pumpAndSettle();
      await tocarSemRolar(
        tester,
        find.widgetWithText(FilledButton, 'Enviar o link'),
      );

      expect(
        find.textContaining('Reenviar em'),
        findsOneWidget,
        reason:
            'REPROVA: depois do pedido a tela nao oferece o reenvio, ou o '
            'oferece fora da arvore. O proximo passo esta na caixa de entrada '
            'da pessoa, e o unico caminho que sobra no app e reenviar.',
      );
      final caixa = tester.getRect(find.textContaining('Reenviar em'));
      expect(
        caixa.bottom,
        lessThanOrEqualTo(_aparelhoPequeno.height),
        reason: 'REPROVA: a acao de reenviar caiu fora da tela.',
      );
    });
  });

  group('ISCA — a tela nao volta a esconder a acao no conteudo', () {
    testWidgets('C.2 e C.4 nao tem acao preenchida dentro da rolagem', (
      tester,
    ) async {
      // Este e o unico caso ESTRUTURAL do arquivo, e ele existe porque o
      // defeito volta pela mesma porta: alguem acrescenta um botao no fim do
      // formulario e a tela fica com dois caminhos, um deles abaixo da dobra.
      //
      // **Ele roda no MAIOR gabarito e SEM teclado, de proposito.** No menor,
      // com o teclado aberto, um `ListView` com o botao dentro nem constroi o
      // botao -- e um caso que procurasse acao dentro da rolagem ficaria VERDE
      // exatamente na tela defeituosa, por nao achar o que nao foi construido.
      // Verificacao que nao consegue verificar precisa reprovar, nao aprovar.
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = const Size(412, 915);
      tester.view.viewInsets = FakeViewPadding.zero;
      addTearDown(tester.view.reset);

      await abrir(tester, 'Entrar', (_) async => http.Response('', 204));

      for (final tela in <String>['C.2 Entrar', 'C.4 Esqueci minha senha']) {
        if (tela.startsWith('C.4')) {
          await tester.tap(find.text('Esqueci minha senha'));
          await tester.pumpAndSettle();
        }
        final rolagem = find.byType(Scrollable);
        expect(
          rolagem,
          findsWidgets,
          reason:
              'REPROVA: nao ha rolagem nenhuma em $tela, entao este caso '
              'nao tem o que conferir. Portao sem alvo reprova, porque ficar '
              'verde por vazio e como esta classe de defeito passa.',
        );
        expect(
          find.descendant(
            of: rolagem.first,
            matching: find.byType(FilledButton),
          ),
          findsNothing,
          reason:
              'REPROVA: $tela voltou a ter acao preenchida dentro da '
              'rolagem. Botao no conteudo de um formulario de tela de conta '
              'fica abaixo da dobra em aparelho pequeno, e o que nao cabe o '
              'construtor preguicoso nem cria.',
        );
      }
    });
  });

  group('a faixa de recusa existe e e uma so', () {
    testWidgets('C.2 nao empilha faixas a cada toque', (tester) async {
      aparelhoPequenoComTeclado(tester);
      await abrir(
        tester,
        'Entrar',
        (_) async => http.Response(
          jsonEncode(<String, dynamic>{
            'type': 'https://bichu.app/problems/invalid-credentials',
            'title': 'Credencial invalida',
            'status': 401,
          }),
          401,
          headers: const <String, String>{
            'content-type': 'application/problem+json',
          },
        ),
      );
      await tester.enterText(
        find.byType(TextField).at(0),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(1), 'senha errada');
      await tester.pumpAndSettle();

      final botao = find.widgetWithText(FilledButton, 'Entrar');
      await tocarSemRolar(tester, botao);
      await tocarSemRolar(tester, botao);

      expect(
        find.byType(FaixaDeAviso),
        findsOneWidget,
        reason:
            'REPROVA: a tela acumulou faixas de recusa. Duas respostas '
            'para a mesma pergunta empurram o resto do formulario para fora '
            'da janela.',
      );
    });
  });
}
