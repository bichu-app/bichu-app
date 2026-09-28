import 'dart:convert';

import 'package:bichu/api/auth_api.dart';
import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';

/// "Continuar conectado" deixou de ser escolha e virou comportamento padrao.
///
/// Decisao do cliente no teste em aparelho de 22/09/2026: _"Retire o checkbox
/// de manter conectado e traga isso como um comportamento padrao, tanto na
/// tela de cadastro, quanto na tela de login."_
///
/// **Sao DUAS afirmacoes, e uma sozinha nao fecha o pedido.** Apagar a caixa
/// sem mudar o valor enviado deixaria `stay_signed_in: false` valendo em
/// silencio -- a janela de inatividade voltaria aos 30 dias, a pessoa seria
/// deslogada, e nao haveria nenhuma caixa na tela para ela culpar. E mudar o
/// valor sem apagar a caixa deixaria um controle que nao controla nada. Por
/// isso cada tela e conferida nos dois sentidos:
///
/// 1. **o corpo enviado carrega `stay_signed_in: true`**;
/// 2. **a escolha nao voltou a tela** -- nem como caixa, nem como texto.
///
/// As duas telas, e nao uma: o cliente nomeou as duas, e um caso que olhasse
/// so o login deixaria metade do pedido por fazer.
void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String versaoDosTermos = '2026-09-17';

  http.Response sessaoAberta(int status) {
    return http.Response(
      jsonEncode(<String, dynamic>{
        'access_token': 'a',
        'refresh_token': 'r',
        'expires_in': 900,
        'user': <String, dynamic>{
          'id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
          'email': 'marina@exemplo.com.br',
          'email_verified': true,
        },
      }),
      status,
      headers: <String, String>{'content-type': 'application/json'},
    );
  }

  late Map<String, Map<String, dynamic>> corpos;

  Future<void> abrir(WidgetTester tester, String rota) async {
    corpos = <String, Map<String, dynamic>>{};
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(
          apiBaseUrlDeTeste: urlBase,
          versaoDosTermosDeTeste: versaoDosTermos,
        ),
        deposito: DepositoEmMemoria(),
        // EM MEMORIA, sempre. O padrao do app e
        // `DepositoDeIntencaoEmArquivo`, que chama
        // `getApplicationDocumentsDirectory()` -- canal de plataforma que nao
        // existe em teste de widget. Canal sem tratador nao lanca excecao:
        // ele simplesmente nunca responde, e o `pumpAndSettle` depois do
        // login espera para sempre. Custou uma execucao travada aqui tambem,
        // porque `entrar` executa a intencao pendente logo apos abrir a
        // sessao.
        depositoDeIntencao: DepositoDeIntencaoEmMemoria(),
        clienteHttp: MockClient((req) async {
          if (req.url.path.endsWith('/auth/register')) {
            corpos['register'] = jsonDecode(req.body) as Map<String, dynamic>;
            return sessaoAberta(201);
          }
          if (req.url.path.endsWith('/auth/login')) {
            corpos['login'] = jsonDecode(req.body) as Map<String, dynamic>;
            return sessaoAberta(200);
          }
          return http.Response('{}', 404);
        }),
      ),
    );
    await tester.pumpAndSettle();
    await irPara(tester, rota);
  }

  /// Todo texto montado na tela, para a varredura da escolha que nao pode
  /// voltar.
  List<String> textos(WidgetTester tester) {
    final achados = <String>[];
    for (final w in tester.widgetList<Text>(find.byType(Text))) {
      final t = w.data ?? w.textSpan?.toPlainText();
      if (t != null) achados.add(t.toLowerCase());
    }
    for (final w in tester.widgetList<RichText>(find.byType(RichText))) {
      achados.add(w.text.toPlainText().toLowerCase());
    }
    return achados;
  }

  void exigirQueAEscolhaNaoVoltou(WidgetTester tester, {required String na}) {
    // Pelas PALAVRAS, e nao pelo widget: a escolha pode voltar como caixa,
    // como interruptor (`Switch`) ou como duas opcoes, e as tres sao formas
    // plausiveis. O que o cliente mandou sumir foi a pergunta.
    final proibidas = RegExp('continuar conectado|manter conectado|'
        'permanecer conectado|lembrar de mim|continuar logado');
    final achadas = textos(tester).where(proibidas.hasMatch).toList();
    expect(
      achadas,
      isEmpty,
      reason: 'REPROVA: a escolha de manter conectado voltou a $na. O cliente '
          'pediu em 22/09/2026 que ela saisse das duas telas e virasse '
          'comportamento padrao.',
    );
  }

  group('ISCA — a sessao persistente vale por padrao no CADASTRO', () {
    testWidgets('o corpo carrega stay_signed_in true', (tester) async {
      await abrir(tester, Rotas.criarConta);

      await tester.enterText(
        find.byType(TextField).at(1),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(2), 'uma frase longa');
      // A unica caixa da F1.1 e a do aceite dos termos. Marca-la e o que
      // libera o cadastro; ela nao tem nada a ver com a sessao.
      //
      // A caixa continua dentro da rolagem, num formulario mais alto que a
      // janela do teste, entao ela vem para a janela antes do toque -- que e
      // o que uma pessoa faz. O BOTAO nao precisa disso desde 23/09/2026:
      // ele mora na barra fixa do rodape.
      await tester.ensureVisible(find.byType(Checkbox));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Checkbox));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Criar conta'));
      await tester.pumpAndSettle();

      expect(
        corpos['register'],
        isNotNull,
        reason: 'O cadastro nao saiu; a afirmacao abaixo nao teria o que '
            'olhar e passaria sobre um nulo.',
      );
      expect(
        corpos['register']?['stay_signed_in'],
        isTrue,
        reason: 'REPROVA: a caixa saiu da tela e o padrao NAO veio junto. O '
            'cadastro continua pedindo a janela de 30 dias, e a pessoa vai '
            'ser deslogada sem ter nenhuma caixa na tela para culpar.',
      );
    });

    testWidgets('a escolha nao voltou a tela', (tester) async {
      await abrir(tester, Rotas.criarConta);
      exigirQueAEscolhaNaoVoltou(tester, na: 'tela de cadastro');

      // Uma caixa so, e ela e a do aceite: duas caixas nesta tela seriam o
      // sinal de que a de manter conectado voltou com outro texto.
      expect(find.byType(Checkbox), findsOneWidget);
      expect(
        tester.widget<Checkbox>(find.byType(Checkbox)).semanticLabel,
        'Aceitar os termos',
      );
    });
  });

  group('ISCA — a sessao persistente vale por padrao no LOGIN', () {
    testWidgets('o corpo carrega stay_signed_in true', (tester) async {
      await abrir(tester, Rotas.entrar);

      await tester.enterText(
        find.byType(TextField).at(0),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(1), 'uma frase longa');
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();

      expect(
        corpos['login'],
        isNotNull,
        reason: 'O login nao saiu; a afirmacao abaixo nao teria o que olhar.',
      );
      expect(
        corpos['login']?['stay_signed_in'],
        isTrue,
        reason: 'REPROVA: a caixa saiu da tela de login e o padrao NAO veio '
            'junto.',
      );
    });

    testWidgets('a escolha nao voltou a tela, e nao ha caixa nenhuma',
        (tester) async {
      await abrir(tester, Rotas.entrar);
      exigirQueAEscolhaNaoVoltou(tester, na: 'tela de login');
      expect(
        find.byType(Checkbox),
        findsNothing,
        reason: 'REPROVA: apareceu caixa de selecao na tela de login. A unica '
            'que existia era a de manter conectado, e ela saiu.',
      );
    });
  });

  group('o valor mora num lugar so', () {
    test('as duas telas leem a MESMA constante', () {
      // Duas constantes, uma por tela, divergem: ja aconteceu com
      // `stay_signed_in`, que existia duplicado em `RegisterRequest` e
      // `LoginRequest` e carregou "7 e 90 dias" depois de a secao 7.5 ter
      // passado para 30 e 180 (ADR-0019). Este caso e o que faz um `false`
      // escrito a mao em qualquer uma das telas aparecer: as iscas acima
      // reprovam, e esta linha diz onde consertar.
      expect(AuthApi.sessaoPersistentePorPadrao, isTrue);
    });
  });
}
