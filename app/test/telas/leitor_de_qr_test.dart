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
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
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

  /// Abre o leitor **pela porta primaria**, que e a de `Pets` (UX 27.5.6).
  ///
  /// Nao e mais uma aba: `Escanear` pedia 71,57 dp num slot de 64,0 e saiu da
  /// barra na BICHUS-164. O caminho continua sendo um toque a partir da secao
  /// de aterrissagem, e e por ele que estes casos entram -- entrar montando a
  /// tela solta esconderia justamente o defeito de a porta sumir.
  Future<void> abrirOLeitor(
    WidgetTester tester, {
    required EstadoDaPermissao permissao,
    Future<http.Response> Function(http.Request)? rede,
  }) async {
    await abrirOApp(
      tester,
      rede: rede ?? semServidor,
      camera: CameraDeTeste(permissao),
    );
    await tester.tap(find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
    await tester.pumpAndSettle();
  }

  testWidgets('o leitor nao leva barra de topo NEM barra de abas, e ainda '
      'assim tem saida', (tester) async {
    await abrirOLeitor(tester, permissao: EstadoDaPermissao.concedida);

    expect(
      find.byType(AppBar),
      findsNothing,
      reason: 'REPROVA: F2.1 ganhou uma barra de topo. O visor ocupa a tela '
          'inteira e o design system 11.11 lista o leitor de camera entre as '
          'telas de tarefa unica, sem barra.',
    );
    expect(
      find.byType(NavigationBar),
      findsNothing,
      reason: 'REPROVA: o leitor ainda mostra a barra de abas. O 11.11 diz '
          'que ela nao aparece no leitor de camera, e a BICHUS-164 tirou '
          '`Escanear` da barra justamente por isso.',
    );

    // **A consequencia de tirar a barra, e a razao deste caso existir.**
    // Enquanto era aba, a saida do leitor ERA a barra inferior: tocar em
    // outra aba saia daqui. Sem a barra, uma tela sem saida e o beco da
    // BICHUS-157. A saida precisa existir, e precisa levar de volta.
    final saida = find.byTooltip('Fechar');
    expect(
      saida,
      findsOneWidget,
      reason: 'REPROVA: o leitor ficou sem barra de abas E sem saida. Quem '
          'entrou nao tem como sair sem o gesto do sistema, e no iOS por link '
          'direto nao ha nem gesto.',
    );

    await tester.tap(saida);
    await tester.pumpAndSettle();
    expect(
      find.byType(NavigationBar),
      findsOneWidget,
      reason: 'REPROVA: fechar o leitor nao devolveu a casca de abas.',
    );
  });

  // OS QUATRO ESTADOS DE PERMISSAO ABREM A MESMA TELA, e isso e o conserto de
  // 22/09 e nao uma regressao.
  //
  // O que a BICHUS-54 desenhou (visor com a permissao concedida, explicacao e
  // caminho para os ajustes com ela negada) pressupoe que exista um leitor
  // atras da permissao. Nao existe: a BICHUS-54 esta em `To Do` e a BICHUS-161
  // declarou por escrito que o leitor estava fora do escopo dela. Enquanto for
  // assim, ramificar por permissao produz duas promessas falsas -- um visor
  // que nao le, e um `Abrir os ajustes` que libera uma camera que continua sem
  // ler.
  //
  // O loop nos quatro valores e deliberado: ele reprova no dia em que alguem
  // reintroduzir um ramo por permissao sem repor o leitor junto.
  //
  // **Os tres estados de permissao continuam implementados e medidos**, na
  // tela que de fato usa a camera: `test/telas/cadastrar_foto_test.dart`, F1.4.
  for (final permissao in EstadoDaPermissao.values) {
    testWidgets('a permissao `${permissao.name}` nao muda a tela: ela diz que '
        'a leitura nao existe e oferece digitar', (tester) async {
      final camera = CameraDeTeste(permissao);
      await abrirOApp(tester, rede: semServidor, camera: camera);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
      await tester.pumpAndSettle();

      expect(
        find.text(TelaLeitorDeQr.tituloSemLeitura),
        findsOne,
        reason: 'REPROVA: com a permissao `${permissao.name}` a tela deixou '
            'de dizer que a leitura por camera nao existe. Nao ha leitor de '
            'QR neste build, e a tela nao pode sugerir o contrario em '
            'permissao nenhuma.',
      );

      // **`Digitar o código` e a acao PRINCIPAL nos quatro.** A acao principal
      // e a que resolve, e nao a que a tela preferia.
      final principal = find.widgetWithText(
        BotaoPrimario,
        TextosDoCadastro.digitarOCodigo,
      );
      expect(
        principal,
        findsOne,
        reason: 'REPROVA: `Digitar o código` nao e a acao principal com a '
            'permissao `${permissao.name}`. Ele e o unico caminho que '
            'funciona, e o caminho que funciona nao fica em segundo plano.',
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
        na: 'F2.1, permissao ${permissao.name}',
      );

      // A tela NAO manda aos ajustes do sistema, e nem toca na porta da
      // camera. Mandar alguem liberar a camera para depois descobrir que o app
      // nao le e o mesmo defeito com outra roupa.
      expect(
        find.text(TextosDoCadastro.abrirOsAjustes),
        findsNothing,
        reason: 'REPROVA: a tela oferece os ajustes do sistema. Liberar a '
            'camera nao destrava leitura nenhuma enquanto a BICHUS-54 nao '
            'existir, e o convite vira a segunda promessa que o app nao '
            'cumpre.',
      );
      expect(camera.abriuAjustes, isFalse);
    });
  }

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
      await abrirOLeitor(
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
      await abrirOLeitor(
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
      await abrirOLeitor(
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
