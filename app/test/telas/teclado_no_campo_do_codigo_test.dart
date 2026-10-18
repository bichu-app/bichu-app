// ISCA (D): o campo do codigo da plaquinha nao pode ser REMONTADO quando o
// teclado abre.
//
// ## O defeito que ela desliga
//
// O relato do cliente: *"ao clicar no input para digitar o codigo que
// encontrou um pet, ele nao esta abrindo o teclado"*.
//
// A causa nao e `readOnly`, nao e `enableInteractiveSelection`, nao e um
// `GestureDetector` comendo o toque e nao e a mascara -- `MascaraDoCodigoDaTag`
// e um `TextInputFormatter`, nao desenha nada e nao tem alvo de toque. A causa
// e o `if` que tirava DOIS filhos da lista quando o teclado subia:
//
//     if (!tecladoAberto) ...<Widget>[ _PlaquinhaDaMarca(), SizedBox(...) ],
//     BichuField(...)
//
// Nenhum filho tinha chave, entao o casamento de elementos e por POSICAO. Com
// o teclado fechado a lista e `[espaco, plaquinha, espaco, campo, ...]`; com
// ele aberto, `[espaco, campo, ...]`. Na posicao 1 o `_PlaquinhaDaMarca` virava
// `BichuField`, os tipos nao batiam, e o Flutter desmontava a subarvore do
// campo e montava outra. Com ela ia embora o `State` do `TextField` -- e com o
// `State`, a conexao de entrada de texto com a plataforma, que E o teclado.
//
// O efeito era circular: toque -> foco -> teclado sobe -> `viewInsets.bottom`
// passa de zero -> lista se reconstroi sem a plaquinha -> campo remontado ->
// conexao morta -> teclado desce -> `viewInsets` volta a zero -> plaquinha
// volta -> campo remontado de novo. O `FocusNode` e externo e sobrevive a
// tudo, entao o campo FICA com o foco e nenhum evento de mudanca de foco
// dispara -- e e so na mudanca de foco que o `EditableText` reabre a conexao.
// Foco sim, teclado nunca.
//
// Introduzido em `fdf0c20` (17/10/2026 23:05), que e o commit que pos a
// plaquinha acima do campo.
//
// ## Por que ela e prova por DESLIGAMENTO
//
// Teste de widget nao tem IME de verdade: nao da para perguntar ao sistema se
// o teclado subiu. O caso mede entao a CAUSA, que e observavel e e a unica
// coisa que mudou: a IDENTIDADE do elemento do campo atraves da troca de
// `viewInsets`. Se o elemento sobrevive, a conexao sobrevive, e o teclado fica.
// Se alguem devolver o `if` que tira filhos da lista, o elemento muda e o
// primeiro `expect` reprova.
//
// O segundo caso guarda o comportamento que o pedido do cliente de 17/10 pediu
// e que a correcao NAO pode ter desfeito: a plaquinha continua sumindo com o
// teclado aberto. Sem ele, "resolver" seria deixar a plaquinha sempre na tela.
//
// ESCRITA E NAO RODADA nesta entrega, por instrucao do cliente.

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/moldura.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  Future<http.Response> semServidor(http.Request _) async =>
      http.Response('', 404);

  /// Abre o leitor e vai para o campo de digitacao, pelo caminho de verdade.
  Future<void> abrirODigitar(WidgetTester tester) async {
    await abrirOApp(
      tester,
      rede: semServidor,
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
      leitorDeQr: LeitorDeQrDeTeste(),
    );
    // **A porta de escanear virou ICONE NA BARRA em 18/10/2026** (pedido
    // literal do cliente: "os itens de criacao, como evento e indicacao, ate o
    // escanear poderia ser icones na barra superior ... e nao fique esse botao
    // grande na pagina"). Em `Pets` ela e `AcaoDeCriarNaBarra` com
    // `Icons.qr_code_2` (`lib/telas/abas.dart`, linhas 119-122); o botao de
    // largura total com esse texto so sobrou no `Perfil` DESLOGADO. O
    // `widgetWithText(OutlinedButton, ...)` achava zero e o `tap` estourava.
    //
    // Dentro da `AppBar` de proposito: `Icons.qr_code_2` tambem aparece na
    // pagina do pet, e um `find.byIcon` solto ficaria verde com a barra vazia
    // -- o mesmo cuidado que `criar_e_icone_na_barra_test.dart` escreve.
    await irAoLeitorDeQr(tester);
    await tester.tap(find.text(TextosDoCadastro.digitarOCodigo).last);
    await tester.pumpAndSettle();
  }

  /// O teclado, como o sistema o anuncia a esta tela: `viewInsets.bottom`.
  ///
  /// E o MESMO numero que `_corpo()` le para decidir se a plaquinha fica. Medir
  /// por aqui e medir o gatilho real do defeito, e nao uma imitacao dele.
  Future<void> comTecladoAberto(WidgetTester tester, bool aberto) async {
    tester.view.viewInsets = aberto
        ? const FakeViewPadding(bottom: 800)
        : FakeViewPadding.zero;
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
  }

  /// O elemento do campo de texto. **Identidade, e nao presenca.**
  Element elementoDoCampo(WidgetTester tester) {
    final campo = find.byType(TextField);
    expect(
      campo,
      findsOneWidget,
      reason:
          'REPROVA ANTES DA MEDICAO: a tela de digitar o codigo nao tem um '
          'campo de texto. O caso mede a sobrevivencia do campo, e sem campo '
          'nao ha o que sobreviver.',
    );
    return tester.element(campo);
  }

  group('ISCA — o campo do codigo sobrevive a abertura do teclado', () {
    testWidgets('o MESMO elemento de campo atravessa o teclado subindo', (
      tester,
    ) async {
      await abrirODigitar(tester);

      final antes = elementoDoCampo(tester);
      await comTecladoAberto(tester, true);
      final depois = elementoDoCampo(tester);

      expect(
        identical(antes, depois),
        isTrue,
        reason:
            'REPROVA: o campo do codigo foi REMONTADO quando o teclado subiu. '
            'Era este o defeito do cliente ("nao esta abrindo o teclado"): com '
            'o elemento vai embora o `State` do `TextField` e, com ele, a '
            'conexao de entrada de texto -- que e o teclado. O `FocusNode` e '
            'externo e sobrevive, entao o campo continua COM foco e nenhum '
            'evento de mudanca de foco dispara para reabrir a conexao: foco '
            'sim, teclado nunca. A causa e tirar filhos de uma lista sem '
            'chave, que renumera as posicoes e troca o tipo do vizinho de '
            'cima. Mantenha o slot da plaquinha SEMPRE na lista.',
      );
    });

    testWidgets('e sobrevive tambem ao teclado descendo', (tester) async {
      await abrirODigitar(tester);

      await comTecladoAberto(tester, true);
      final comTeclado = elementoDoCampo(tester);
      await comTecladoAberto(tester, false);
      final semTeclado = elementoDoCampo(tester);

      expect(
        identical(comTeclado, semTeclado),
        isTrue,
        reason:
            'REPROVA: o campo foi remontado quando o teclado desceu. O defeito '
            'era CIRCULAR -- subia, remontava, caia, remontava --, e corrigir '
            'so um dos sentidos deixa o ciclo de pe.',
      );
    });

    testWidgets('a plaquinha continua saindo da tela com o teclado aberto', (
      tester,
    ) async {
      await abrirODigitar(tester);

      expect(
        find.byType(Moldura),
        findsWidgets,
        reason:
            'REPROVA ANTES DA MEDICAO: a plaquinha da marca sumiu da tela de '
            'digitar o codigo. Ela e o pedido do cliente de 17/10/2026, e o '
            'caso seguinte so tem sentido se ela existe.',
      );

      await comTecladoAberto(tester, true);

      expect(
        find.byType(Moldura),
        findsNothing,
        reason:
            'REPROVA: a plaquinha ficou na tela com o teclado aberto. Esta e '
            'uma tela em que a pessoa DIGITA: decoracao dividindo a altura '
            'util com o teclado empurra o campo para fora da dobra. O conserto '
            'do teclado nao pode ser deixar a plaquinha sempre visivel -- ele e '
            'manter o SLOT dela na lista e encolher o conteudo para nada.',
      );
    });
  });
}
