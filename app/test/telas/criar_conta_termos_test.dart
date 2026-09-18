import 'dart:convert';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// F1.1 — os termos: a versao aceita sai no corpo, e as duas expressoes abrem.
///
/// Os dois defeitos que este arquivo trava sao do mesmo tipo: **nada quebrava**.
/// A chave `accepted_terms_version` simplesmente nao ia no corpo, e a frase dos
/// termos simplesmente nao abria nada. Sem teste, os dois voltam sem que
/// nenhuma tela pare de funcionar.
void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String versao = '2026-09-17';

  http.Response sessaoCriada() {
    return http.Response(
      jsonEncode(<String, dynamic>{
        'access_token': 'a',
        'refresh_token': 'r',
        'expires_in': 900,
        'user': <String, dynamic>{
          'id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
          'email': 'marina@exemplo.com.br',
          'email_verified': false,
        },
      }),
      201,
      headers: <String, String>{'content-type': 'application/json'},
    );
  }

  Future<void> abrirCriarConta(
    WidgetTester tester, {
    required http.Client cliente,
    String? versaoDosTermos,
    String? urlDosTermos,
    String? urlDaPrivacidade,
  }) async {
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(
          apiBaseUrlDeTeste: urlBase,
          versaoDosTermosDeTeste: versaoDosTermos,
          urlDosTermosDeTeste: urlDosTermos,
          urlDaPrivacidadeDeTeste: urlDaPrivacidade,
        ),
        deposito: DepositoEmMemoria(),
        clienteHttp: cliente,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cadastrar meu pet'));
    await tester.pumpAndSettle();
  }

  group('a versao dos termos aceitos chega ao servidor', () {
    testWidgets('o cadastro envia accepted_terms_version', (tester) async {
      // Isto e onus da prova, nao tela: o backend so grava
      // `accepted_terms_at` quando o campo chega. Sem ele, a pessoa aceita os
      // termos e nao fica registro de QUAL versao ela aceitou.
      Map<String, dynamic>? corpo;
      await abrirCriarConta(
        tester,
        versaoDosTermos: versao,
        cliente: MockClient((req) async {
          corpo = jsonDecode(req.body) as Map<String, dynamic>;
          return sessaoCriada();
        }),
      );

      await tester.enterText(
        find.byType(TextField).at(1),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(2), 'uma frase longa');
      await tester.tap(find.widgetWithText(FilledButton, 'Criar conta'));
      await tester.pumpAndSettle();

      expect(
        corpo?['accepted_terms_version'],
        versao,
        reason: 'A chave sumiu do corpo em silencio, como antes: o parametro '
            'existia em AuthApi.criarConta e nenhum chamador o passava.',
      );
    });

    testWidgets('sem versao declarada a chave nao vai, e nada finge que foi',
        (tester) async {
      // O identificador da versao e "o arquivo versionado no repositorio, nao
      // v1 digitado a mao" (docs/04-seguranca.md 6.6), e esse arquivo nao
      // existe. Enquanto nao existir, e melhor nao gravar do que gravar prova
      // de aceite a um documento inventado.
      Map<String, dynamic>? corpo;
      await abrirCriarConta(
        tester,
        cliente: MockClient((req) async {
          corpo = jsonDecode(req.body) as Map<String, dynamic>;
          return sessaoCriada();
        }),
      );

      await tester.enterText(
        find.byType(TextField).at(1),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(2), 'uma frase longa');
      await tester.tap(find.widgetWithText(FilledButton, 'Criar conta'));
      await tester.pumpAndSettle();

      expect(corpo?.containsKey('accepted_terms_version'), isFalse);
    });
  });

  group('a escolha de continuar conectado chega ao servidor', () {
    // ADR-0019. Antes dele `RegisterRequest` nao tinha o campo: a pessoa
    // marcava a caixa, criava a conta, e a escolha morria no aparelho. Como
    // `POST /auth/register` ja emite sessao, nao existia a opcao de nao
    // decidir: a janela de inatividade se aplicava de qualquer jeito, e a
    // padrao vencia em silencio.
    Future<Map<String, dynamic>?> cadastrar(
      WidgetTester tester, {
      required bool marcar,
    }) async {
      Map<String, dynamic>? corpo;
      await abrirCriarConta(
        tester,
        cliente: MockClient((req) async {
          corpo = jsonDecode(req.body) as Map<String, dynamic>;
          return sessaoCriada();
        }),
      );
      if (marcar) {
        await tester.tap(find.text('Continuar conectado neste aparelho'));
        await tester.pumpAndSettle();
      }
      await tester.enterText(
        find.byType(TextField).at(1),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(2), 'uma frase longa');
      await tester.tap(find.widgetWithText(FilledButton, 'Criar conta'));
      await tester.pumpAndSettle();
      return corpo;
    }

    testWidgets('marcada, o cadastro envia stay_signed_in true',
        (tester) async {
      expect((await cadastrar(tester, marcar: true))?['stay_signed_in'], true);
    });

    testWidgets('desmarcada, o campo vai explicitamente false',
        (tester) async {
      // Enviar mesmo quando falso: sem isso a omissao e a escolha "nao" ficam
      // indistinguiveis no servidor.
      final corpo = await cadastrar(tester, marcar: false);
      expect(corpo?.containsKey('stay_signed_in'), isTrue);
      expect(corpo?['stay_signed_in'], false);
    });
  });

  group('a linha de termos', () {
    /// Os spans da frase de termos que sao links de verdade.
    List<TextSpan> linksDaFrase(WidgetTester tester) {
      final rich = tester.widgetList<RichText>(find.byType(RichText)).where(
        (r) {
          final span = r.text;
          return span is TextSpan &&
              (span.toPlainText()).contains('Ao criar a conta');
        },
      ).single;

      final encontrados = <TextSpan>[];
      (rich.text as TextSpan).visitChildren((span) {
        if (span is TextSpan && span.recognizer is TapGestureRecognizer) {
          encontrados.add(span);
        }
        return true;
      });
      return encontrados;
    }

    testWidgets('as duas expressoes sao links, com nome acessivel proprio',
        (tester) async {
      await abrirCriarConta(
        tester,
        cliente: MockClient((_) async => sessaoCriada()),
        urlDosTermos: 'https://bichu.app/termos',
        urlDaPrivacidade: 'https://bichu.app/privacidade',
      );

      final links = linksDaFrase(tester);
      expect(
        links.map((s) => s.text).toList(),
        <String>['termos de uso', 'política de privacidade'],
        reason: 'A pessoa aceita dois documentos que nao consegue abrir.',
      );

      for (final link in links) {
        // Nome acessivel proprio: quem navega por lista de links ouve so o
        // nome, fora da frase. "aqui" e "leia mais" nao servem.
        expect(link.semanticsLabel, link.text);
        // Cor nao pode ser o unico indicador de link (WCAG SC 1.4.1).
        expect(link.style?.decoration, TextDecoration.underline);
      }
    });

    testWidgets('sem URL configurada a expressao nao vira link morto',
        (tester) async {
      // Link que nao abre nada e pior que texto: parece que funcionou.
      await abrirCriarConta(
        tester,
        cliente: MockClient((_) async => sessaoCriada()),
      );
      expect(linksDaFrase(tester), isEmpty);
    });

    testWidgets('a frase fica ACIMA do botao, e nao no fim da tela',
        (tester) async {
      // Uma regra que se aceita ao apertar um botao precisa estar legivel
      // antes do aperto, e nao abaixo da dobra. Ela estava depois do botao e
      // depois de "Ja tenho conta".
      await abrirCriarConta(
        tester,
        cliente: MockClient((_) async => sessaoCriada()),
      );

      final frase = tester.getTopLeft(
        find.textContaining('Ao criar a conta', findRichText: true),
      );
      final botao = tester.getTopLeft(
        find.widgetWithText(FilledButton, 'Criar conta'),
      );
      expect(frase.dy, lessThan(botao.dy));
    });
  });
}
