// ISCA (D): a pagina de digitar o codigo da plaquinha abre SEM teclado, e com
// o teclado aberto nenhum botao de acao fica inalcancavel.
//
// ## O defeito que ela desliga
//
// O relato do cliente, medido no iPhone dele em 20/10/2026: *"quando abre a
// pagina para digitar o codigo do pet, no ios o teclado vem aberto e sobrepoe
// os botoes embaixo, traga essa pagina, sem selecionar o input para nao ter
// esse problema"*.
//
// Sao DUAS coisas, e o cliente descreveu uma e propos a outra:
//
//  1. **O gatilho**, que e o que ele propos tirar: `_irParaDigitacao` pedia o
//     foco do campo no mesmo instante em que trocava o estado para
//     `digitando`. A pagina abria com o teclado ja subindo, sem ninguem ter
//     tocado em nada.
//  2. **A causa**, que e o que ele descreveu: a barra de acao fica ATRAS do
//     teclado. `_ScaffoldLayout.performLayout` ancora a `bottomNavigationBar`
//     em `size.height` -- a altura inteira da tela -- e so o `body` recebe o
//     recuo do teclado. Tirar o foco automatico nao conserta isto: no primeiro
//     toque no campo o teclado sobe e `Continuar` desaparece por tras dele
//     exatamente como antes.
//
// Por isso ha dois casos de direcoes diferentes, e nenhum dos dois cobre o
// outro: com o foco automatico de volta o primeiro reprova; com a barra
// ancorada no chao de novo o segundo reprova.
//
// ## O que esta isca NAO proibe, e e deliberado
//
// Os outros DOIS `requestFocus()` desta tela sao de RECUPERACAO, e eles ficam:
//
//  * `_enviarODigitado`, quando a forma do codigo nao fecha (vazio, tamanho
//    diferente, caractere de fora). O terceiro caso daqui o guarda.
//  * `_voltarAoCampo`, quando o servidor recusa o codigo com 404. Guardado
//    desde a BICHUS-153 em `codigo_digitado_nao_acusa_a_plaquinha_test.dart`,
//    no caso "devolve o foco ao campo SEM limpar o que foi digitado".
//
// Nos dois a pessoa JA esta digitando e precisa continuar de onde parou.
// Remove-los trocaria o incomodo do cliente por um pior: errar o codigo e ter
// de tocar o campo de novo a cada tentativa, na calcada, com o animal de
// alguem no colo.

import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/barra_de_acao_fixa.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  Future<http.Response> semServidor(http.Request _) async =>
      http.Response('', 404);

  /// Abre o leitor pela porta de verdade e toca `Digitar o código`.
  ///
  /// Pelo caminho, e nao montando a tela solta: o que o cliente mediu foi o
  /// que acontece depois de andar daqui.
  Future<void> abrirAPaginaDeDigitar(WidgetTester tester) async {
    await abrirOApp(tester, rede: semServidor);
    await irAoLeitorDeQr(tester);
    await tester.tap(
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.digitarOCodigo),
    );
    await tester.pumpAndSettle();
  }

  /// O `TextField` do codigo, lido da arvore montada.
  TextField campoDoCodigo(WidgetTester tester) {
    final campo = find.byType(TextField);
    expect(
      campo,
      findsWidgets,
      reason:
          'REPROVA ANTES DA MEDICAO: a pagina de digitar o codigo nao tem '
          'campo de texto. Sem campo nao ha foco a medir, e o caso ficaria '
          'verde olhando para nada.',
    );
    return tester.widget<TextField>(campo.first);
  }

  /// Poe o teclado na tela do jeito que o sistema o anuncia: `viewInsets`.
  ///
  /// E o MESMO numero que a tela le para recuar a barra e para esconder a
  /// plaquinha. Medir por aqui e medir o gatilho real, e nao uma imitacao.
  Future<void> comTecladoAberto(WidgetTester tester) async {
    tester.view.viewInsets = const FakeViewPadding(bottom: 800);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
  }

  group('a pagina de digitar o codigo abre sem o teclado', () {
    testWidgets('o campo MONTA SEM FOCO quando a pagina abre', (tester) async {
      await abrirAPaginaDeDigitar(tester);

      expect(
        campoDoCodigo(tester).focusNode?.hasFocus,
        isFalse,
        reason:
            'REPROVA: o campo do codigo abriu JA COM FOCO. Com foco o teclado '
            'sobe sozinho, e foi isso que o cliente mediu no iPhone dele: '
            '"quando abre a pagina para digitar o codigo do pet, no ios o '
            'teclado vem aberto e sobrepoe os botoes embaixo". `_irParaDigitacao` '
            'nao pede foco -- os dois pedidos que ficaram na tela sao de '
            'RECUPERACAO (forma recusada e 404), e nao de abertura.',
      );
    });

    testWidgets('e o teclado NAO e pedido a plataforma na abertura', (
      tester,
    ) async {
      await abrirAPaginaDeDigitar(tester);

      expect(
        tester.testTextInput.isVisible,
        isFalse,
        reason:
            'REPROVA: a tela pediu o teclado a plataforma sem ninguem ter '
            'tocado no campo. Este caso mede o pedido em si, e nao o foco: '
            'sao duas coisas diferentes e o defeito do cliente e esta.',
      );
    });
  });

  group('com o teclado aberto, nenhum botao de acao fica inalcancavel', () {
    testWidgets('`Continuar` e as demais acoes continuam dentro da area '
        'visivel', (tester) async {
      await abrirAPaginaDeDigitar(tester);
      await comTecladoAberto(tester);

      final alturaDaTela =
          tester.view.physicalSize.height / tester.view.devicePixelRatio;
      final teclado =
          tester.view.viewInsets.bottom / tester.view.devicePixelRatio;
      final chaoVisivel = alturaDaTela - teclado;

      expect(
        teclado,
        greaterThan(0),
        reason:
            'REPROVA POR VAZIO: o teclado nao entrou na medicao, entao '
            '"nao cobre" nao prova nada -- o caso ficaria verde com a barra '
            'ancorada no chao.',
      );

      final acoes = find.descendant(
        of: find.byType(BarraDeAcaoFixa),
        matching: find.byWidgetPredicate(
          (Widget w) => w is BotaoPrimario || w is TextButton,
        ),
      );
      expect(
        acoes,
        findsWidgets,
        reason:
            'REPROVA ANTES DA MEDICAO: nao ha botao nenhum na barra de acao '
            'desta pagina. Sem botao nao ha alcance a medir.',
      );

      for (final Element elemento in acoes.evaluate()) {
        final Rect caixa = tester.getRect(find.byWidget(elemento.widget));
        expect(
          caixa.bottom,
          lessThanOrEqualTo(chaoVisivel + 0.5),
          reason:
              'REPROVA: um botao da barra de acao ($caixa) termina abaixo do '
              'chao visivel ($chaoVisivel dp) com o teclado aberto -- ele esta '
              'ATRAS do teclado e nao da para tocar. E o defeito que o cliente '
              'mediu: "o teclado ... sobrepoe os botoes embaixo". O `Scaffold` '
              'nao levanta a `bottomNavigationBar`: ele a ancora em '
              '`size.height` e recua so o `body`. Quem pede o recuo e o '
              '`Padding` em volta da `BarraDeAcaoFixa` no `build` da tela, com '
              '`MediaQuery.viewInsetsOf` lido ACIMA do `Scaffold`.',
        );
      }
    });
  });

  group('o foco de RECUPERACAO continua de pe', () {
    testWidgets('forma recusada DEVOLVE o foco ao campo', (tester) async {
      await abrirAPaginaDeDigitar(tester);

      // Codigo curto de proposito: a tela confere a forma ANTES de gastar a
      // viagem, e e esse ramo que pede o foco de volta.
      await tester.enterText(find.byType(TextField).first, 'BCH7K2M9');
      await tester.pumpAndSettle();

      // TIRA O FOCO ANTES, e nao e cerimonia: `enterText` deixa o campo
      // focado, e um `hasFocus` medido depois disso daria verde mesmo sem
      // `requestFocus()` nenhum -- mediria o foco que o proprio caso pos ali.
      // No aparelho a pessoa perde o foco do mesmo jeito: ela toca `Continuar`
      // e o teclado desce.
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      expect(
        campoDoCodigo(tester).focusNode?.hasFocus,
        isFalse,
        reason:
            'REPROVA POR VAZIO: o campo continuou focado depois de o foco ter '
            'sido retirado, entao o `hasFocus` la embaixo nao mediria o efeito '
            'do botao.',
      );

      await tester.tap(find.widgetWithText(BotaoPrimario, 'Continuar'));
      await tester.pumpAndSettle();

      expect(
        find.text(MensagensDeErro.codigoComTamanhoDiferente(8)),
        findsWidgets,
        reason:
            'REPROVA ANTES DA MEDICAO: a tela nao recusou a forma do codigo '
            'curto, entao o caso nao chegou ao ramo que devolve o foco.',
      );
      expect(
        campoDoCodigo(tester).focusNode?.hasFocus,
        isTrue,
        reason:
            'REPROVA: a forma foi recusada e o foco NAO voltou ao campo. Este '
            '`requestFocus()` nao e o da abertura -- aqui a pessoa ja esta '
            'digitando, e tirar o foco aqui a obriga a tocar o campo de novo a '
            'cada tentativa, na calcada e com uma mao so. O pedido do cliente '
            'de 20/10 era sobre a ABERTURA da pagina, e so sobre ela.',
      );
    });
  });
}
