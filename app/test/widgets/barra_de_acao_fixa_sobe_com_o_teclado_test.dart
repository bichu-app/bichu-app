// ISCA (D) do COMPONENTE: `BarraDeAcaoFixa` sobe com o teclado, e **nao cobra
// espaco de quem nao tem teclado**.
//
// ## Por que o conserto mora no componente
//
// O cliente achou o mesmo defeito duas vezes no iPhone dele em 20/10/2026: no
// leitor de QR (*"o teclado vem aberto e sobrepoe os botoes embaixo"*) e em
// `Meus dados` (*"o teclado vem aberto o que impede de clicar no botao de
// salvar"*). A causa nao e de nenhuma das duas telas: o
// `_ScaffoldLayout.performLayout` ancora a `bottomNavigationBar` em
// `size.height` -- a altura inteira da tela -- e so o `body` recebe o recuo do
// teclado.
//
// Na primeira ocorrencia o recuo foi posto na tela, para nao mexer num arquivo
// que todas usam. Com a segunda a conta inverteu: **13 telas** trazem esta
// barra junto com campo de texto, e cada tela nova herdaria o defeito.
//
// ## Os dois casos sao um par, e nenhum deles vale sozinho
//
// O primeiro cobra o conserto: com o teclado na frente, a barra sobe. O
// segundo e o CONTRAPESO, e ele existe porque a correcao mais obvia -- reservar
// altura, ou recuar por um numero -- viraria espaco morto nas **10 telas** que
// usam esta barra SEM campo de texto. O recuo e `viewInsets.bottom`, que e zero
// onde nao ha teclado; nao ha condicional a escrever, e o segundo caso e quem
// garante que ninguem escreva uma.

import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/barra_de_acao_fixa.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  /// A barra no slot de verdade: `Scaffold.bottomNavigationBar`.
  ///
  /// **O slot nao e detalhe de cenario.** O `Scaffold` zera `viewInsets` para
  /// o `body` (`removeBottomInset: _resizeToAvoidBottomInset`) e **nao** zera
  /// para este slot: e de la que a barra consegue ler o teclado. Montar a
  /// barra solta mediria outro widget.
  Future<void> montar(WidgetTester tester, {required bool comCampo}) async {
    await tester.pumpWidget(
      MaterialApp(
        // O tema do app, e nao o do Material: `BichuColors` vive no
        // `ThemeData` e o componente estoura sem ele, de proposito.
        theme: BichuTheme.claro,
        home: Scaffold(
          body: comCampo
              ? const TextField(key: ValueKey<String>('campo'))
              : const Center(child: Text('nada que abra teclado')),
          bottomNavigationBar: BarraDeAcaoFixa(
            acoes: <Widget>[
              FilledButton(onPressed: () {}, child: const Text('Concluir')),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// A CAIXA PINTADA da barra, e nao o widget inteiro.
  ///
  /// A diferenca e o conserto: o recuo do teclado e o `Padding` RAIZ de
  /// [BarraDeAcaoFixa], entao o retangulo do widget vai do topo da barra ate
  /// o chao da tela nos dois estados -- medir ele daria 600 dp sempre, e o
  /// caso ficaria verde com a barra atras do teclado (medido: foi o primeiro
  /// resultado deste arquivo). O `SafeArea` e o primeiro filho dentro da
  /// caixa pintada, e o fundo dela termina onde ele termina.
  Finder caixaPintada() => find.descendant(
    of: find.byType(BarraDeAcaoFixa),
    matching: find.byType(SafeArea),
  );

  double alturaDaTela(WidgetTester tester) =>
      tester.view.physicalSize.height / tester.view.devicePixelRatio;

  testWidgets('com o teclado aberto, a barra sobe para CIMA dele', (
    tester,
  ) async {
    await montar(tester, comCampo: true);

    final antes = tester.getRect(caixaPintada());
    expect(
      antes.bottom,
      closeTo(alturaDaTela(tester), 0.5),
      reason:
          'REPROVA ANTES DA MEDICAO: sem teclado a barra ja nao estava '
          'encostada no chao da tela, entao "ela subiu" nao mediria o efeito '
          'do teclado.',
    );

    tester.view.viewInsets = const FakeViewPadding(bottom: 800);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();

    final teclado =
        tester.view.viewInsets.bottom / tester.view.devicePixelRatio;
    final chaoVisivel = alturaDaTela(tester) - teclado;
    final depois = tester.getRect(caixaPintada());

    expect(
      depois.bottom,
      lessThanOrEqualTo(chaoVisivel + 0.5),
      reason:
          'REPROVA: a barra de acao ($depois) termina abaixo do chao visivel '
          '($chaoVisivel dp) com o teclado aberto -- ela esta ATRAS do teclado, '
          'e a acao primaria da tela nao da para tocar. Foi medido duas vezes '
          'no aparelho do cliente em 20/10/2026, e a terceira medicao, no '
          'gabarito de 800x600 dp: `Continuar` ocupava 460..524 dp com o chao '
          'visivel em 333,3. O recuo e `EdgeInsets.only(bottom: '
          'MediaQuery.viewInsetsOf(context).bottom)`, no `build` desta barra -- '
          'o `Scaffold` nao o da.',
    );
  });

  testWidgets(
    'CONTRAPESO: a tela SEM campo de texto nao ganha um dp de recuo',
    (tester) async {
      await montar(tester, comCampo: false);

      expect(
        tester.view.viewInsets.bottom,
        0,
        reason:
            'REPROVA POR VAZIO: havia teclado anunciado numa tela sem campo de '
            'texto, entao este caso nao estaria medindo o estado que ele '
            'descreve.',
      );

      final caixa = tester.getRect(caixaPintada());
      expect(
        caixa.bottom,
        closeTo(alturaDaTela(tester), 0.5),
        reason:
            'REPROVA: a barra saiu do chao da tela numa tela que nao abre '
            'teclado ($caixa, tela de ${alturaDaTela(tester)} dp). Sao 10 as '
            'telas que usam esta barra SEM campo de texto, e um recuo por '
            'numero fixo -- ou altura reservada "para quando o teclado subir" '
            '-- custaria espaco morto em todas elas. O recuo tem de ser '
            '`viewInsets.bottom`, que e zero exatamente aqui: quem nao abre '
            'teclado nao paga nada pelo conserto de quem abre.',
      );
    },
  );
}
