// O link do produto abre no NAVEGADOR DO APARELHO, e so quando da.
//
// Pedido do cliente, literal: "O link do produto deve abrir externamente no app
// atraves do browser do usuario".
//
// Este arquivo cobra as quatro coisas que o pedido implica, e nenhuma delas
// estava coberta antes:
//
// 1. A saida passa pela porta `SaidaDoApp`, que e quem escolhe
//    `LaunchMode.externalApplication`. Antes a tela chamava `launchUrl` direto,
//    e por isso NAO ERA OBSERVAVEL em teste: o modo de abertura era uma
//    afirmacao de comentario, e um `LaunchMode.inAppWebView` no lugar dele
//    passaria verde para sempre.
// 2. O destino e `https`, ou o botao nao existe. `target_url` e dado
//    CADASTRADO, e `launchUrl` abre o que o sistema souber abrir.
// 3. Quando o aparelho nao abre, a pessoa ve UMA linha.
// 4. A URL continua saindo como o servidor a mandou, sem identificador de
//    pessoa (consequencia 3 da BICHUS-185). O caso que ja existia em
//    `loja_com_dados_test.dart` media isso lendo o modelo; aqui se mede o que
//    de fato foi para a porta.
//
// Os casos marcados ISCA precisam REPROVAR com o mecanismo desligado, e cada um
// diz no corpo qual arquivo mexer.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante que
// o produz.** A frase da falha esta por extenso, com acento: um `expect` que
// lesse `VitrineDaLoja.falhaAoAbrirOLink` acompanharia um erro de digitacao
// para sempre.

import 'package:bichu/api/modelos_loja.dart';
import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'loja_com_dados_test.dart' show abrirLoja, itemDoContrato, paginaDoContrato, redeDaVitrine;

/// A porta de saida, de mentira: guarda o que foi pedido e deixa escolher se
/// abriu.
///
/// So `abrirLink` e exercitada aqui. Os outros tres metodos lancam em vez de
/// devolver um valor morno: se a vitrine um dia chamar o app de mapas ou o
/// calendario, este arquivo reprova em vez de ficar calado.
class _SaidaDeMentira extends SaidaDoApp {
  final List<Uri> links = <Uri>[];

  /// O que `launchUrl` devolveu. `false` e o caso real de aparelho sem
  /// navegador que responda ao esquema.
  bool abre = true;

  @override
  Future<bool> abrirLink(Uri link) async {
    links.add(link);
    return abre;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async =>
      throw StateError('a vitrine da Loja nao abre o app de mapas');

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async =>
      throw StateError('a vitrine da Loja nao abre o app de mapas');

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async =>
      throw StateError('a vitrine da Loja nao escreve no calendario');
}

/// Abre a vitrine com um item so e confirma a saida no dialogo.
///
/// O dialogo e parte do requisito (a pessoa sabe antes de sair), entao ele e
/// atravessado e nao contornado: um teste que chamasse `_sair` direto mediria
/// um caminho que o dedo da pessoa nao percorre.
Future<void> _tocarEConfirmar(
  WidgetTester tester, {
  required String targetUrl,
}) async {
  await abrirLoja(
    tester,
    rede: redeDaVitrine(
      paginaDoContrato(<Map<String, dynamic>>[
        itemDoContrato(targetUrl: targetUrl),
      ]),
    ),
  );
  await tester.tap(find.text('Abrir na Cobasi').last);
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(TextButton, 'Abrir na Cobasi'));
  await tester.pumpAndSettle();
}

void main() {
  late _SaidaDeMentira saida;

  setUp(() {
    saida = _SaidaDeMentira();
    SaidaDoApp.atual = saida;
  });

  tearDown(SaidaDoApp.restaurar);

  // -------------------------------------------------------------------------
  // 1. A SAIDA PASSA PELA PORTA, E E ELA QUE ABRE FORA
  // -------------------------------------------------------------------------

  group('o link vai para o navegador do aparelho', () {
    // ISCA -- em `vitrine_da_loja.dart`, em `_BotaoDeSaida._sair`, volte a
    // chamar `launchUrl(destino, mode: LaunchMode.externalApplication)` em vez
    // de `SaidaDoApp.atual.abrirLink(destino)`. Este caso reprova: nada chega a
    // porta, e `saida.links` fica vazia. E e exatamente por isso que a chamada
    // direta nao servia -- ela nao e observavel.
    testWidgets('ISCA -- o destino chega a porta de saida', (tester) async {
      await _tocarEConfirmar(
        tester,
        targetUrl: 'https://cobasi.com.br/bola-pop-borracha',
      );

      expect(saida.links, hasLength(1));
      expect(saida.links.single.toString(), 'https://cobasi.com.br/bola-pop-borracha');
    });

    // O modo externo e escolhido DENTRO de `SaidaDoAparelho.abrirLink`, num
    // lugar so para as tres saidas do app. Este caso cobra a fronteira: a tela
    // nao nomeia modo nenhum, e trocar o modo e mexer na porta -- onde a
    // mudanca aparece para a Rede e para a Loja no mesmo diff.
    testWidgets('a tela nao escolhe o modo de abertura', (tester) async {
      await _tocarEConfirmar(
        tester,
        targetUrl: 'https://cobasi.com.br/bola-pop-borracha',
      );

      expect(saida.links, hasLength(1));
    });

    // Consequencia 3 da BICHUS-185, medida no que FOI PARA A PORTA e nao no
    // modelo: o app nao ACRESCENTA nada.
    //
    // **O esperado e a igualdade com o que o servidor mandou, e nao
    // "sem query".** Query e fragmento sao do parceiro e passaram a ser
    // aceitos em 17/10 -- um `expect(queryParameters, isEmpty)` aqui mediria a
    // regra antiga e reprovaria o link de verdade do cliente.
    //
    // ISCA -- em `_BotaoDeSaida._sair`, troque por
    //     SaidaDoApp.atual.abrirLink(destino.replace(queryParameters: {'u': 'tutor@exemplo.com'}))
    // Este caso reprova.
    testWidgets('ISCA -- o app nao acrescenta nada a URL', (tester) async {
      const doServidor =
          'https://www.cobasi.com.br/racao-granplus-performance-caes-senior-frango-e-peru-31197673/p?idsku=1197673';
      await _tocarEConfirmar(tester, targetUrl: doServidor);

      final saiu = saida.links.single;
      expect(saiu.toString(), doServidor);
      expect(saiu.userInfo, isEmpty);
    });

    // O link EXATO que bloqueou o cliente em 17/10. Esta aqui com a URL por
    // extenso, e nao montada por helper: e o caso concreto que se quer ver
    // verde, e um helper esconderia justamente o `?idsku=` que era o problema.
    testWidgets('o link do cliente abre', (tester) async {
      const doCliente =
          'https://www.cobasi.com.br/racao-granplus-performance-caes-senior-frango-e-peru-31197673/p?idsku=1197673';
      await _tocarEConfirmar(tester, targetUrl: doCliente);

      expect(saida.links.single.toString(), doCliente);
    });
  });

  // -------------------------------------------------------------------------
  // 2. SO `https`, E A RECUSA E NO MODELO
  // -------------------------------------------------------------------------

  group('o destino so sai quando e https', () {
    // ISCA -- em `modelos_loja.dart`, em `ItemDaLoja.destinoExterno`, apague a
    // linha `if (u.scheme != 'https') return null;`. Os seis casos abaixo
    // reprovam, e o `intent:` e o que mostra o custo: um registro de catalogo
    // passa a conseguir disparar outro aplicativo no aparelho da pessoa.
    for (final recusado in <String>[
      'http://cobasi.com.br/bola-pop',
      'javascript:alert(1)',
      'intent://scan/#Intent;scheme=zxing;end',
      'tel:+5511999999999',
      'file:///etc/passwd',
      'market://details?id=com.exemplo',
    ]) {
      test('ISCA -- `$recusado` nao vira destino', () {
        final item = ItemDaLoja.doJson(itemDoContrato(targetUrl: recusado));
        expect(item.destinoExterno, isNull);
      });
    }

    // Query e fragmento PASSAM. Ate 17/10 o servidor os recusava na escrita e o
    // app nunca via um; agora ve, e recusar aqui faria o link gravado nao abrir.
    for (final aceito in <String>[
      'https://www.cobasi.com.br/racao-granplus-performance-caes-senior-frango-e-peru-31197673/p?idsku=1197673',
      'https://cobasi.com.br/bola-pop?cor=azul&tamanho=g',
      'https://cobasi.com.br/bola-pop#descricao',
      'https://loja.cobasi.com.br/bola-pop',
    ]) {
      test('`$aceito` vira destino', () {
        final item = ItemDaLoja.doJson(itemDoContrato(targetUrl: aceito));
        expect(item.destinoExterno?.toString(), aceito);
      });
    }

    test('o https do parceiro vira destino', () {
      final item = ItemDaLoja.doJson(
        itemDoContrato(targetUrl: 'https://cobasi.com.br/bola-pop-borracha'),
      );
      expect(item.destinoExterno?.scheme, 'https');
      expect(item.destinoExterno?.host, 'cobasi.com.br');
    });

    test('https sem host nao vira destino', () {
      // `https:///bola-pop` da `isAbsolute` verdadeiro e `host` vazio: sem o
      // caso explicito, um destino sem site passaria para `launchUrl`.
      final item = ItemDaLoja.doJson(itemDoContrato(targetUrl: 'https:///bola-pop'));
      expect(item.destinoExterno, isNull);
    });

    test('destino em branco nao vira destino', () {
      final item = ItemDaLoja.doJson(itemDoContrato(targetUrl: '   '));
      expect(item.destinoExterno, isNull);
    });

    // ISCA -- em `vitrine_da_loja.dart`, em `CartaoDaLoja.build`, troque o
    // `if (item.destinoExterno case final Uri destino)` por um `_BotaoDeSaida`
    // incondicional. Este caso reprova: o botao volta a aparecer para um
    // produto cujo link nao da para abrir.
    testWidgets('ISCA -- sem destino utilizavel o botao nao e desenhado', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(targetUrl: 'intent://scan/#Intent;scheme=zxing;end'),
          ]),
        ),
      );

      // O cartao continua la -- o produto e navegavel, so nao tem saida.
      expect(find.text('Bola Pop'), findsOneWidget);
      expect(find.text('Abrir na Cobasi'), findsNothing);
      // E nao ha mensagem de erro no lugar do botao: a pessoa nao tem o que
      // fazer a respeito, e o lugar do conserto e o painel.
      expect(find.textContaining('Não conseguimos'), findsNothing);
    });

    testWidgets('com destino https o botao e desenhado', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(targetUrl: 'https://cobasi.com.br/bola-pop-borracha'),
          ]),
        ),
      );

      expect(find.text('Abrir na Cobasi'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // 3. O APARELHO NAO ABRIU: UMA LINHA, E A LISTA FICA
  // -------------------------------------------------------------------------

  group('quando o aparelho nao abre o link', () {
    // ISCA -- em `_BotaoDeSaida._sair`, apague o `if (abriu) return;` e o
    // `showSnackBar` abaixo dele. Este caso reprova: o toque passa a nao
    // produzir nada, e e o pior desfecho possivel -- a pessoa toca, nada
    // acontece, e ela nao sabe se o toque pegou.
    testWidgets('ISCA -- a pessoa ve uma linha', (tester) async {
      saida.abre = false;

      await _tocarEConfirmar(
        tester,
        targetUrl: 'https://cobasi.com.br/bola-pop-borracha',
      );

      expect(find.text('Não conseguimos abrir o link.'), findsOneWidget);
    });

    testWidgets('a vitrine fica onde estava', (tester) async {
      saida.abre = false;

      await _tocarEConfirmar(
        tester,
        targetUrl: 'https://cobasi.com.br/bola-pop-borracha',
      );

      // Nao ha tela de erro, nao ha faixa que apague a lista e nao ha nova
      // tentativa: o cartao continua desenhado, com o botao.
      expect(find.text('Bola Pop'), findsOneWidget);
      expect(find.text('Abrir na Cobasi'), findsOneWidget);
    });

    testWidgets('quando abre, nao ha mensagem nenhuma', (tester) async {
      await _tocarEConfirmar(
        tester,
        targetUrl: 'https://cobasi.com.br/bola-pop-borracha',
      );

      expect(find.text('Não conseguimos abrir o link.'), findsNothing);
    });

    // O dialogo e a ultima chance de desistir, e desistir nao abre nada.
    testWidgets('“Ficar aqui” nao abre o navegador', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
        ),
      );

      await tester.tap(find.text('Abrir na Cobasi').last);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Ficar aqui'));
      await tester.pumpAndSettle();

      expect(saida.links, isEmpty);
    });
  });
}
