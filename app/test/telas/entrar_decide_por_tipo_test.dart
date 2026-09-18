import 'dart:convert';

import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/api/problem.dart';
import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// C.2 — Entrar decide pelo `type`, e nunca pelo status.
///
/// **Por que este arquivo existe.** O contrato declara QUATRO tipos com status
/// 401: `invalid-credentials`, `unauthenticated`, `token-expired` e
/// `reauthentication-required` (api/openapi.yaml, `x-problem-types`). Um
/// `if (problem.status == 401)` acerta hoje, porque so o primeiro chega a esta
/// tela, e erra **calado** no dia em que outro chegar: a tela diria a pessoa
/// que a senha esta errada, e ela trocaria uma senha que estava certa.
///
/// O caminho certo e o errado se parecem no diff, entao a prova nao pode ser
/// uma frase. Cada teste abaixo e o caso que a verificacao **precisa
/// reprovar** se alguem voltar a decidir por status.
///
/// Os testes de tela passam pelo caminho inteiro (tela, `AuthApi`,
/// `ApiClient`, traducao de `Problem`) de proposito: um teste que so chamasse
/// `MensagensDeErro.deEntrar` continuaria verde no dia em que a tela parasse de
/// usa-la, que e exatamente a refatoracao que se quer pegar.
void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';

  http.Response problema(String slug, int status) {
    return http.Response(
      jsonEncode(<String, dynamic>{
        'type': 'https://api.bichu.app/problems/$slug',
        // `title` propositalmente MENTIROSO nos casos que nao sao credencial:
        // se a tela algum dia decidir pelo texto do servidor em vez do `type`,
        // este campo faz o teste falhar.
        'title': 'E-mail ou senha nao conferem',
        'status': status,
      }),
      status,
      headers: <String, String>{
        'content-type': 'application/problem+json; charset=utf-8',
      },
    );
  }

  FalhaDaApi falhaDe(String slug, int status) {
    return FalhaDaApi(
      Problem.doJson(
        <String, dynamic>{
          'type': 'https://api.bichu.app/problems/$slug',
          'title': 'E-mail ou senha nao conferem',
          'status': status,
        },
        status: status,
      ),
    );
  }

  group('o catalogo de mensagens separa os quatro 401', () {
    test('invalid-credentials e o unico que fala em credencial', () {
      final m = MensagensDeErro.deEntrar(falhaDe('invalid-credentials', 401));
      expect(m.texto, MensagensDeErro.credencialNaoConfere);
      // A saida para a recuperacao de senha vem junto: e onde a duvida nasce.
      expect(m.acao, MensagensDeErro.esqueciMinhaSenha);
    });

    test('unauthenticated NAO diz que a senha esta errada', () {
      // `POST /auth/login` e operacao aberta: se este tipo voltar do envio, o
      // defeito e nosso, e nao da senha de quem esta entrando.
      final m = MensagensDeErro.deEntrar(falhaDe('unauthenticated', 401));
      expect(m.texto, isNot(MensagensDeErro.credencialNaoConfere));
      expect(m.texto, MensagensDeErro.servidorFora);
      expect(m.acao, MensagensDeErro.tentarDeNovo);
    });

    test('token-expired NAO diz que a senha esta errada', () {
      final m = MensagensDeErro.deEntrar(falhaDe('token-expired', 401));
      expect(m.texto, isNot(MensagensDeErro.credencialNaoConfere));
      expect(m.texto, MensagensDeErro.sessaoExpirou);
    });

    test('reauthentication-required NAO diz que a senha esta errada', () {
      // Nao e esta tela: e a folha de confirmacao de senha da acao sensivel.
      final m = MensagensDeErro.deEntrar(
        falhaDe('reauthentication-required', 401),
      );
      expect(m.texto, isNot(MensagensDeErro.credencialNaoConfere));
    });

    test('403 forbidden nunca vira credencial recusada', () {
      final m = MensagensDeErro.deEntrar(falhaDe('forbidden', 403));
      expect(m.texto, isNot(MensagensDeErro.credencialNaoConfere));
    });

    test('um 401 de tipo que este build nao conhece tambem nao mente', () {
      // Versao antiga do app continua instalada por semanas e vai receber
      // `type` novo. Ela nao pode reagir a isso culpando a senha da pessoa.
      final m = MensagensDeErro.deEntrar(falhaDe('tipo-que-nao-existe', 401));
      expect(m.texto, isNot(MensagensDeErro.credencialNaoConfere));
    });

    test('sem conexao tem texto proprio, e promete o que e verdade', () {
      final m = MensagensDeErro.deEntrar(const FalhaDeConexao());
      expect(m.texto, MensagensDeErro.precisamosDeConexaoParaEntrar);
    });

    test('429 mantem a saida da recuperacao de senha', () {
      // Quem estourou o limite quase sempre nao lembra a senha: mandar esperar
      // sem o unico caminho que resolve e desenhar um beco.
      final m = MensagensDeErro.deEntrar(
        FalhaDaApi(
          Problem.semCorpo(429, tenteDepoisDe: const Duration(minutes: 3)),
        ),
      );
      expect(m.texto, contains('3 minutos'));
      expect(m.acao, MensagensDeErro.esqueciMinhaSenha);
    });
  });

  group('a tela usa o catalogo, e o caminho inteiro prova isso', () {
    Future<void> abrirEntrar(
      WidgetTester tester,
      http.Response Function() resposta,
    ) async {
      await tester.pumpWidget(
        BichuApp(
          config: AppConfig.carregar(apiBaseUrlDeTeste: urlBase),
          deposito: DepositoEmMemoria(),
          clienteHttp: MockClient((_) async => resposta()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();
    }

    Future<void> preencherEEnviar(WidgetTester tester) async {
      await tester.enterText(
        find.byType(TextField).at(0),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(1), 'uma frase curta');
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();
    }

    testWidgets('401 invalid-credentials mostra a credencial recusada',
        (tester) async {
      await abrirEntrar(tester, () => problema('invalid-credentials', 401));
      await preencherEEnviar(tester);

      expect(find.text(MensagensDeErro.credencialNaoConfere), findsOne);
      // Nada e apagado: o caso dominante e um caractere trocado.
      expect(find.text('marina@exemplo.com.br'), findsOne);
    });

    testWidgets('401 unauthenticated NAO mostra a credencial recusada',
        (tester) async {
      // Este e o caso que reprova quem voltar a decidir por status.
      await abrirEntrar(tester, () => problema('unauthenticated', 401));
      await preencherEEnviar(tester);

      expect(
        find.text(MensagensDeErro.credencialNaoConfere),
        findsNothing,
        reason: 'A tela decidiu pelo status 401 em vez do `type`. Quem ler '
            'esta mensagem vai trocar uma senha que estava certa.',
      );
      expect(find.text(MensagensDeErro.servidorFora), findsOne);
    });

    testWidgets('401 token-expired NAO mostra a credencial recusada',
        (tester) async {
      await abrirEntrar(tester, () => problema('token-expired', 401));
      await preencherEEnviar(tester);

      expect(find.text(MensagensDeErro.credencialNaoConfere), findsNothing);
      expect(find.text(MensagensDeErro.sessaoExpirou), findsOne);
    });
  });

  group('campo vazio nao vira ida a rede', () {
    testWidgets('enviar em branco nao chama o servidor e nao acusa credencial',
        (tester) async {
      // Enviar em branco devolvia "credencial nao confere", que e falso, e
      // ainda queimava uma das CINCO tentativas por e-mail antes de o desafio
      // antiabuso aparecer. A pessoa pagava duas vezes por um campo que ela
      // nem preencheu.
      var chamadas = 0;
      await tester.pumpWidget(
        BichuApp(
          config: AppConfig.carregar(apiBaseUrlDeTeste: urlBase),
          deposito: DepositoEmMemoria(),
          clienteHttp: MockClient((_) async {
            chamadas++;
            return problema('invalid-credentials', 401);
          }),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();

      expect(
        chamadas,
        0,
        reason: 'Campo vazio foi ao servidor e queimou uma tentativa.',
      );
      expect(find.text(MensagensDeErro.digiteSeuEmail), findsOne);
      expect(find.text(MensagensDeErro.digiteSuaSenha), findsOne);
      expect(find.text(MensagensDeErro.credencialNaoConfere), findsNothing);
    });

    testWidgets('e-mail sem arroba e recusado antes da rede', (tester) async {
      var chamadas = 0;
      await tester.pumpWidget(
        BichuApp(
          config: AppConfig.carregar(apiBaseUrlDeTeste: urlBase),
          deposito: DepositoEmMemoria(),
          clienteHttp: MockClient((_) async {
            chamadas++;
            return problema('invalid-credentials', 401);
          }),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).at(0), 'marina.exemplo');
      await tester.enterText(find.byType(TextField).at(1), 'uma frase curta');
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();

      expect(chamadas, 0);
      expect(find.text(MensagensDeErro.confiraOEmail), findsOne);
    });
  });
}
