// F2.1 — Leitor de QR. A cunha do produto: escanear a plaquinha.
//
// A ISCA de cada caso esta dita no proprio caso. As tres que mais importam:
//
// 1. Se alguem devolver a barra de topo a esta aba, o primeiro caso reprova.
//    A ausencia dela e desenho, e nao esquecimento: F2.1 e a aba `Escanear` e
//    a navegacao dela e a barra inferior.
// 2. Se `Digitar o código` deixar de existir em algum estado, ou deixar de ser
//    anunciavel, os casos do meio reprovam. A camera **nunca** e o unico
//    caminho: o caminho de quem nao consegue escanear nao pode estar escondido
//    atras do fracasso do caminho principal.
// 3. Se alguem trocar a decisao por `type` por uma decisao por status, o
//    ultimo grupo reprova. `tag-code-malformed` (400) e `tag-code-not-found`
//    (404) dizem coisas diferentes a quem esta na rua com um animal no colo, e
//    o `title` que o servidor manda nestes casos e enganoso de proposito.

import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  Future<http.Response> semServidor(http.Request _) async {
    // O backend nao tem `GET /v1/tags/{code}` ainda. O teste nao inventa uma
    // resposta de sucesso para essa rota: quando ele precisa de uma resposta,
    // ele manda a que o CONTRATO declara para aquele caso.
    return http.Response('', 404);
  }

  Future<void> abrirAAbaEscanear(
    WidgetTester tester, {
    required EstadoDaPermissao permissao,
    Future<http.Response> Function(http.Request)? rede,
  }) async {
    await abrirOApp(
      tester,
      rede: rede ?? semServidor,
      camera: CameraDeTeste(permissao),
    );
    await tester.tap(find.widgetWithText(NavigationDestination, 'Escanear'));
    await tester.pumpAndSettle();
  }

  testWidgets('a aba Escanear nao leva barra de topo, e mantem a de baixo',
      (tester) async {
    await abrirAAbaEscanear(
      tester,
      permissao: EstadoDaPermissao.concedida,
    );

    expect(
      find.byType(AppBar),
      findsNothing,
      reason: 'REPROVA: F2.1 ganhou uma barra de topo. Ela e a aba Escanear; '
          'a navegacao dela e a barra inferior, e uma barra de topo seria uma '
          'segunda navegacao concorrendo com a primeira.',
    );
    expect(
      find.byType(NavigationBar),
      findsOne,
      reason: 'REPROVA: a barra inferior sumiu. Sem ela a tela fica sem '
          'navegacao nenhuma, que e o defeito que o cliente encontrou nas '
          'telas de conta.',
    );
  });

  testWidgets('com a camera concedida, o visor aparece e a digitacao continua '
      'visivel', (tester) async {
    await abrirAAbaEscanear(tester, permissao: EstadoDaPermissao.concedida);

    expect(find.text('Aponte para o QR da coleira'), findsOne);

    // **A camera nunca e o unico caminho.** Se este `expect` reprovar, a saida
    // por digitacao ficou escondida atras do sucesso do scan.
    expect(
      find.text(TextosDoCadastro.digitarOCodigo),
      findsOne,
      reason: 'REPROVA: `Digitar o código` sumiu do visor. Ele precisa estar '
          'presente em TODOS os estados e alcancavel por teclado e por leitor '
          'de tela.',
    );
    exigirRotuloAnunciavel(
      tester,
      TextosDoCadastro.digitarOCodigo,
      na: 'F2.1, visor',
    );
  });

  testWidgets('sem camera no aparelho, Digitar o codigo vira acao principal '
      'com 64 dp', (tester) async {
    // `indisponivel` nao e recusa: e ausencia de recurso. Mandar a pessoa para
    // os ajustes procurar uma permissao que nao existe seria pior que nao
    // dizer nada.
    await abrirAAbaEscanear(tester, permissao: EstadoDaPermissao.indisponivel);

    final principal = find.widgetWithText(
      BotaoPrimario,
      TextosDoCadastro.digitarOCodigo,
    );
    expect(
      principal,
      findsOne,
      reason: 'REPROVA: com a camera fora, `Digitar o código` continuou '
          'secundario. A acao principal e a que resolve, e nao a que a tela '
          'preferia.',
    );

    final alvo = tamanhoDoAlvo(tester, principal);
    expect(
      alvo.height,
      greaterThanOrEqualTo(pisoCritico),
      reason: 'REPROVA: alvo de ${alvo.height} dp. O piso critico e '
          '$pisoCritico dp: pessoa em pe, com um animal em um dos bracos, '
          'usando o polegar da outra mao.',
    );
    exigirRotuloAnunciavel(
      tester,
      TextosDoCadastro.digitarOCodigo,
      na: 'F2.1, sem camera',
    );
  });

  testWidgets('permissao negada permanentemente oferece os ajustes, e nao um '
      'pedido que nao abre dialogo', (tester) async {
    final camera = CameraDeTeste(EstadoDaPermissao.negadaPermanentemente);
    await abrirOApp(tester, rede: semServidor, camera: camera);
    await tester.tap(find.widgetWithText(NavigationDestination, 'Escanear'));
    await tester.pumpAndSettle();

    expect(find.text('O Bichu precisa da câmera para ler o QR'), findsOne);

    final ajustes = find.text(TextosDoCadastro.abrirOsAjustes);
    expect(
      ajustes,
      findsOne,
      reason: 'REPROVA: o terceiro estado de permissao nao tem caminho. '
          'Pedir de novo NAO abre dialogo nenhum depois da recusa permanente; '
          'sem o caminho para os ajustes, a pessoa toca num botao que nunca '
          'mais vai responder.',
    );
    await tester.tap(ajustes);
    await tester.pumpAndSettle();
    expect(camera.abriuAjustes, isTrue);
  });

  group('o erro do codigo decide por type, e nunca por status', () {
    Future<void> digitarEEnviar(WidgetTester tester, String codigo) async {
      await tester.tap(
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.digitarOCodigo),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, codigo);
      await tester.tap(find.widgetWithText(BotaoPrimario, 'Continuar'));
      await tester.pumpAndSettle();
    }

    testWidgets('tag-code-malformed manda conferir o que foi digitado',
        (tester) async {
      await abrirAAbaEscanear(
        tester,
        permissao: EstadoDaPermissao.indisponivel,
        rede: (_) async => problema('tag-code-malformed', 400),
      );
      await digitarEEnviar(tester, 'BCH-7K2M-91Q');

      expect(
        find.textContaining('Confira o código'),
        findsOne,
        reason: 'REPROVA: 400 deixou de ser erro de digitacao. Para quem esta '
            'na rua, "confira o que voce digitou" e "nao encontramos este '
            'codigo" sao respostas diferentes, e a diferenca e util.',
      );
      // A saida comum as quatro telas de falha: quem esta com um animal agora
      // nao precisa do codigo.
      expect(find.text(MensagensDeErro.registrarAchado), findsOne);
    });

    testWidgets('tag-code-not-found diz que o codigo nao e de nenhuma tag',
        (tester) async {
      await abrirAAbaEscanear(
        tester,
        permissao: EstadoDaPermissao.indisponivel,
        rede: (_) async => problema('tag-code-not-found', 404),
      );
      await digitarEEnviar(tester, 'BCH-7K2M-91QD');

      expect(
        find.textContaining('não é de nenhuma tag do Bichu'),
        findsOne,
        reason: 'REPROVA: 404 caiu no texto de erro de digitacao. Os dois '
            'tipos tem status diferente hoje, mas a decisao e por `type`: no '
            'dia em que dois tipos dividirem um status, quem decidiu por '
            'status erra calado.',
      );
      expect(
        find.textContaining('Confira o código'),
        findsNothing,
        reason: 'REPROVA: a tela mostrou os dois textos, ou o errado dos dois.',
      );
    });

    testWidgets('o texto do servidor nao decide nada', (tester) async {
      // O `title` que `problema()` manda e enganoso de proposito. Se a tela
      // passar a exibi-lo, este caso reprova -- e e exatamente a mudanca que
      // passa despercebida num diff.
      await abrirAAbaEscanear(
        tester,
        permissao: EstadoDaPermissao.indisponivel,
        rede: (_) async => problema('tag-code-not-found', 404),
      );
      await digitarEEnviar(tester, 'BCH-7K2M-91QD');

      expect(
        find.textContaining('Nao foi possivel concluir'),
        findsNothing,
        reason: 'REPROVA: a tela exibiu o `title` do servidor. O texto do '
            'servidor pode ser reescrito a qualquer momento; o comportamento '
            'e o texto de tela nao podem mudar junto.',
      );
    });
  });
}
