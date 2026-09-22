// Os termos e a privacidade vivem na F1.1, e em nenhuma outra tela.
//
// Decisao do cliente no teste em aparelho de 22/09/2026, nas palavras dele:
// "a pagina do perfil nao deve ter esse termos de uso e privacidade, apenas na
// pagina de cadastro".
//
// **Por que a varredura e por TEXTO e nao por widget.** O que havia no Perfil
// era um `TextButton` com `onPressed: null`. Um caso que procurasse esse
// widget especifico ficaria verde no dia em que alguem repusesse a linha como
// `ListTile`, como `_PortaDeSubDestino` ou como a frase com links da F1.1 --
// e as tres sao formas plausiveis de repor, porque a tela de termos e de outra
// historia e ela vai nascer. O que o cliente pediu foi que as palavras nao
// aparecam ali, entao e pelas palavras que se confere.
//
// O caso POSITIVO esta junto, e nao e enfeite: portao que reprova tudo some do
// CI tao rapido quanto portao que aprova tudo. Ele exige que as duas
// expressoes continuem na F1.1.

import 'dart:convert';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

/// As palavras que nao podem aparecer fora da F1.1, sem acento e em minuscula.
final RegExp _palavrasProibidas = RegExp('termo|privacidad');

/// Todo texto visivel da arvore montada, normalizado.
///
/// Junta `Text` e `RichText` porque a frase da F1.1 e `Text.rich`: uma
/// varredura que so olhasse `Text` nao enxergaria justamente a forma em que a
/// linha tem mais chance de voltar.
List<String> _textosDaTela(WidgetTester tester) {
  final achados = <String>[];
  for (final w in tester.widgetList<Text>(find.byType(Text))) {
    final t = w.data ?? w.textSpan?.toPlainText();
    if (t != null) achados.add(t);
  }
  for (final w in tester.widgetList<RichText>(find.byType(RichText))) {
    achados.add(w.text.toPlainText());
  }
  return achados;
}

String _semAcento(String v) {
  const de = 'áàâãäéèêëíìîïóòôõöúùûüç';
  const para = 'aaaaaeeeeiiiiooooouuuuc';
  final b = StringBuffer();
  for (final c in v.toLowerCase().runes) {
    final i = de.indexOf(String.fromCharCode(c));
    b.write(i < 0 ? String.fromCharCode(c) : para[i]);
  }
  return b.toString();
}

/// O que na tela montada fala de termos ou de privacidade.
List<String> _mencoes(WidgetTester tester) {
  return _textosDaTela(tester)
      .where((t) => _palavrasProibidas.hasMatch(_semAcento(t)))
      .toList();
}

/// As mencoes na tela INTEIRA, rolando ate o fim antes de concluir.
///
/// Sem rolar, esta varredura e um teste que se aprova sozinho: o corpo das
/// telas e `ListView`, que so constroi o que cabe na dobra, e `widgetList` nao
/// enxerga o que nao foi construido. Foi exatamente o que aconteceu na
/// primeira versao deste arquivo -- com a linha de termos REPOSTA no Perfil
/// logado, o caso ficou verde, porque ela caia abaixo da dobra. A prova de
/// que isto pega agora esta no commit: com a linha reposta, os dois casos
/// reprovam.
Future<List<String>> _mencoesRolando(WidgetTester tester) async {
  final achadas = <String>{..._mencoes(tester)};
  final lista = find.byType(Scrollable).first;

  // Rola em passos, acumulando a cada parada, ate a lista parar de andar.
  var anterior = -1.0;
  for (var i = 0; i < 40; i++) {
    final pos = tester.state<ScrollableState>(lista).position;
    if (pos.pixels == anterior) break;
    anterior = pos.pixels;
    await tester.drag(lista, const Offset(0, -300));
    await tester.pumpAndSettle();
    achadas.addAll(_mencoes(tester));
  }
  return achadas.toList();
}

void main() {
  setUp(AppConfig.limparParaTeste);

  Future<http.Response> Function(http.Request) redeVazia() {
    return (req) async {
      if (req.url.path == '/v1/pets' && req.method == 'GET') {
        return json200(<String, dynamic>{'items': <dynamic>[]});
      }
      return problema('not-found', 404);
    };
  }

  Future<void> abrirOPerfilCom(
    WidgetTester tester, {
    DepositoDeSessao? deposito,
  }) async {
    await abrirOApp(tester, rede: redeVazia(), deposito: deposito);
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
  }

  group('ISCA — o Perfil nao fala de termos nem de privacidade', () {
    // Os DOIS estados da aba, e nao so um: a linha estava nos dois, e um caso
    // que olhasse so o logado deixaria metade do defeito em pe.

    testWidgets('deslogado', (tester) async {
      await abrirOPerfilCom(tester);

      // Ancora: sem isto o caso ficaria verde se a aba deixasse de abrir e a
      // varredura passasse a olhar uma tela vazia.
      expect(
        find.widgetWithText(FilledButton, 'Entrar'),
        findsOneWidget,
        reason: 'A aba Perfil deslogada nao abriu; a varredura abaixo estaria '
            'olhando outra tela e passaria sem ter conferido nada.',
      );

      expect(
        await _mencoesRolando(tester),
        isEmpty,
        reason: 'REPROVA: os termos voltaram ao Perfil deslogado. O cliente '
            'pediu em 22/09/2026 que eles fiquem apenas na pagina de '
            'cadastro (F1.1).',
      );
    });

    testWidgets('logado', (tester) async {
      await abrirOPerfilCom(tester, deposito: depositoLogado());

      expect(
        find.text('marina@exemplo.com.br'),
        findsOneWidget,
        reason: 'A aba Perfil logada nao abriu; a varredura abaixo estaria '
            'olhando outra tela e passaria sem ter conferido nada.',
      );

      expect(
        await _mencoesRolando(tester),
        isEmpty,
        reason: 'REPROVA: os termos voltaram ao Perfil logado. O cliente '
            'pediu em 22/09/2026 que eles fiquem apenas na pagina de '
            'cadastro (F1.1).',
      );
    });
  });

  group('o caso positivo: a F1.1 continua com as duas expressoes', () {
    testWidgets('a pagina de cadastro fala de termos e de privacidade',
        (tester) async {
      await tester.pumpWidget(
        BichuApp(
          config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
          deposito: DepositoEmMemoria(),
          clienteHttp: MockClient(
            (_) async => http.Response(jsonEncode(<String, dynamic>{}), 404),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await irPara(tester, Rotas.criarConta);

      final mencoes = await _mencoesRolando(tester);
      expect(
        mencoes,
        isNotEmpty,
        reason: 'REPROVA ao contrario: a varredura nao acha as palavras nem '
            'onde elas DEVEM estar, entao ela nao esta enxergando texto '
            'nenhum e o "isEmpty" dos casos do Perfil nao prova nada.',
      );
      expect(
        mencoes.map(_semAcento).join(' '),
        allOf(contains('termos de uso'), contains('politica de privacidade')),
      );
    });
  });
}
