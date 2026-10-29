// ISCA DA BICHUS-278 (28/10/2026): O CONTADOR NA LINHA DO MENU.
//
// Decisao do cliente de 28/10/2026, e ela RESPONDE a pergunta fechada 1 do
// `design/prototipos/menu-unificado/DESENHO.md` -- que o protovipo deixou
// aberta de proposito. O desenho dizia *"a linha `Conexões` do menu continua
// sem contador, porque o contador foi pedido na aba"*, e listava isso como
// *"a maior fragilidade"* da decisao. O cliente escolheu a opcao (a): o numero
// aparece **na aba E na linha do menu**.
//
// **E CODIGO NOVO, e nao mudanca de lugar.** `ItemDeMenu` tinha quatro
// parametros (`rotulo`, `apoio`, `critico`, `aoTocar`) e NENHUM deles pinta
// numero; nenhuma das doze linhas daquele menu pintava numero ou icone. Esta
// isca cobra a capacidade nova no componente, e nao na tela: a tela e so o
// primeiro uso dela.
//
// **POR QUE ZERO NAO VIRA PASTILHA** (regra herdada do desenho, secao 3.1):
// *"pastilha com zero e um aviso que afirma que nao ha aviso"*. O caso
// `zero nao pinta` existe para que a forma mais facil de "consertar" o numero
// -- pintar o que o servidor mandou, qualquer que seja -- reprove.
library;

import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Uma linha de menu sozinha, com o tema do app.
///
/// Sem `Escopo` e sem roteador: o que se mede aqui e o COMPONENTE, e um caso
/// que precisasse do app inteiro mediria a tela por acidente.
Future<void> _umaLinha(
  WidgetTester tester, {
  int? contador,
  String? rotuloDoContador,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: ItemDeMenu(
          rotulo: 'Conexões',
          contador: contador,
          rotuloDoContador: rotuloDoContador,
          aoTocar: () {},
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('ItemDeMenu leva contador (cliente, 28/10/2026)', () {
    testWidgets('com contador, a linha pinta o numero', (tester) async {
      await _umaLinha(
        tester,
        contador: 3,
        rotuloDoContador: '3 pedidos esperando você',
      );

      expect(
        find.text('3'),
        findsOneWidget,
        reason: 'REPROVA: a linha `Conexões` nao pintou o 3. Sem o numero '
            'aqui, quem nao abre Conexões depende so da notificacao -- e foi '
            'por isso que o cliente pediu o contador no menu TAMBEM, em '
            '28/10/2026.',
      );
    });

    testWidgets('ZERO nao pinta pastilha', (tester) async {
      await _umaLinha(
        tester,
        contador: 0,
        rotuloDoContador: 'nenhum pedido esperando você',
      );

      expect(
        find.text('0'),
        findsNothing,
        reason: 'REPROVA: a linha pintou `0`. Pastilha com zero e um aviso '
            'que afirma que nao ha aviso (DESENHO.md, secao 3.1): com zero '
            'pedidos a pastilha SOME, e nao vira um zero.',
      );
    });

    testWidgets('sem contador, a linha e a de sempre', (tester) async {
      await _umaLinha(tester);

      // Nenhum digito: as outras seis linhas do menu continuam sem numero, e
      // um contador que aparecesse por omissao faria todas diferentes.
      expect(
        find.byType(ItemDeMenu),
        findsOneWidget,
        reason: 'REPROVA: a linha sem contador nao montou.',
      );
      expect(
        find.textContaining(RegExp(r'\d')),
        findsNothing,
        reason: 'REPROVA: uma linha SEM contador pintou digito. O parametro e '
            'opcional, e omitir e o estado das outras seis linhas do menu.',
      );
    });

    testWidgets(
      'o leitor de tela OUVE o numero, e numa parada so',
      (tester) async {
        await _umaLinha(
          tester,
          contador: 3,
          rotuloDoContador: '3 pedidos esperando você',
        );

        // `ItemDeMenu` embrulha a linha num `Semantics(excludeSemantics: true)`
        // com rotulo composto -- ver a prosa do componente. Se o numero nao
        // entrar NESSE rotulo, ele e pintado e nao e anunciado: quem usa
        // leitor de tela ouve `Conexões` e nao fica sabendo que ha tres
        // pedidos esperando, que e exatamente a pessoa para quem o contador do
        // menu foi pedido.
        final linha = tester.widget<ItemDeMenu>(find.byType(ItemDeMenu));
        expect(
          linha.rotuloAcessivel,
          contains('3 pedidos esperando você'),
          reason: 'REPROVA: o rotulo acessivel da linha nao carrega o que o '
              'numero QUER DIZER. Pintar `3` sem anuncia-lo deixa o contador '
              'invisivel para quem usa leitor de tela.',
        );
        expect(
          linha.rotuloAcessivel,
          startsWith('Conexões'),
          reason: 'REPROVA: o rotulo acessivel deixou de comecar pelo nome do '
              'destino. O numero e apoio, e nao o nome do controle.',
        );
      },
    );
  });
}
