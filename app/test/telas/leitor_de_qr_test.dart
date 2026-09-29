// F2.1 — Leitor de QR. A cunha do produto: escanear a plaquinha.
//
// A ISCA de cada caso esta dita no proprio caso. As que mais importam:
//
// 1. Se alguem devolver a barra de topo a esta tela, o primeiro caso reprova.
//    A ausencia dela e desenho: o design system 11.11 lista o leitor de camera
//    entre as telas de tarefa unica.
// 2. Se `Digitar o código` deixar de existir em algum estado, ou deixar de ser
//    anunciavel, os casos do meio reprovam. A camera **nunca** e o unico
//    caminho: quem negou a permissao, esta no escuro ou tem a lente arranhada
//    chega ao mesmo lugar pelo mesmo esforco.
// 3. Se a tela pedir a permissao **na montagem**, o caso do contador reprova.
//    No iOS o dialogo aparece uma vez so na vida do app; gasta-lo antes de a
//    pessoa tocar em nada e um estrago que nenhum texto de tela desfaz.
// 4. Se alguem trocar a decisao por `type` por uma decisao por status, o
//    ultimo grupo reprova. `tag-code-malformed` (400) e `tag-code-not-found`
//    (404) dizem coisas diferentes a quem esta na rua com um animal no colo, e
//    o `title` que o servidor manda nestes casos e enganoso de proposito.
//
// A GEOMETRIA do visor (ha camera atras da moldura?) NAO e medida aqui: ela
// mora em `leitor_nao_finge_camera_test.dart`, que a mede nos dois sentidos.

import 'dart:io';
import 'dart:ui' show Tristate;

import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/dispositivo/leitor_de_qr.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
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

  /// O QR que a plaquinha de verdade carrega: `{base}/t/{codigo}`.
  const String codigoImpresso = '7K2MQ1D4B8NV3XZ0';
  const String qrDaPlaquinha = 'https://bichu.app/t/$codigoImpresso';

  /// Abre o leitor **pela porta primaria**, que e a de `Pets` (UX 27.5.6).
  ///
  /// Nao e mais uma aba: `Escanear` pedia 71,57 dp num slot de 64,0 e saiu da
  /// barra na BICHUS-164. O caminho continua sendo um toque a partir da secao
  /// de aterrissagem, e e por ele que estes casos entram -- entrar montando a
  /// tela solta esconderia justamente o defeito de a porta sumir.
  Future<void> abrirOLeitor(
    WidgetTester tester, {
    required EstadoDaPermissao permissao,
    LeitorDeQr? leitor,
    CameraDeTeste? camera,
    Future<http.Response> Function(http.Request)? rede,
  }) async {
    await abrirOApp(
      tester,
      rede: rede ?? semServidor,
      camera: camera ?? CameraDeTeste(permissao),
      leitorDeQr: leitor ?? LeitorDeQrDeTeste(),
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
    // BICHUS-157.
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

  // -- OS QUATRO ESTADOS DE PERMISSAO ---------------------------------------
  //
  // Eles voltaram a decidir a tela com a BICHUS-54, e agora podem: ate aqui
  // ramificar por permissao produzia duas promessas falsas, porque nao havia
  // leitor atras dela. Ha. Liberar a camera destrava leitura de verdade.
  //
  // O que NAO muda em nenhum dos quatro: `Digitar o código` existe, e
  // alcancavel por leitor de tela, e tem alvo de toque. Nos tres em que a
  // camera nao le, ele e a acao PRINCIPAL.
  group('a camera nunca e o unico caminho, nos quatro estados', () {
    for (final permissao in EstadoDaPermissao.values) {
      testWidgets('`${permissao.name}`: digitar o codigo existe e e '
          'anunciavel', (tester) async {
        await abrirOLeitor(tester, permissao: permissao);

        final digitar = find.text(TextosDoCadastro.digitarOCodigo);
        expect(
          digitar,
          findsOne,
          reason: 'REPROVA: com a permissao `${permissao.name}` a tela nao '
              'oferece a entrada manual. Ela e o caminho de igual valor da '
              'BICHUS-54, e nao o plano B do fracasso da camera.',
        );

        // O alvo e o CONTROLE, e nao a caixa do texto dentro dele: o polegar
        // acerta o botao. Medir `find.text` daria os 20 dp da linha de texto e
        // reprovaria a tela certa.
        final controle = find
            .ancestor(
              of: digitar,
              matching: find.byWidgetPredicate((w) => w is ButtonStyleButton),
            )
            .first;
        final alvo = tamanhoDoAlvo(tester, controle);
        expect(
          alvo.height,
          greaterThanOrEqualTo(pisoMinimo),
          reason: 'REPROVA: alvo de ${alvo.height} dp com a permissao '
              '`${permissao.name}`. Pessoa em pe, com um animal em um dos '
              'bracos, usando o polegar da outra mao.',
        );
        exigirRotuloAnunciavel(
          tester,
          TextosDoCadastro.digitarOCodigo,
          na: 'F2.1, permissao ${permissao.name}',
        );

        // E ele precisa CHEGAR no campo. Um botao que nao abre nada seria a
        // mentira seguinte.
        await tocar(tester, controle);
        expect(
          find.byType(TextField),
          findsOne,
          reason: 'REPROVA: `${TextosDoCadastro.digitarOCodigo}` nao abriu o '
              'campo com a permissao `${permissao.name}`.',
        );
      });
    }

    testWidgets('concedida: a camera le, e digitar fica em segundo plano '
        'SEM sumir', (tester) async {
      await abrirOLeitor(tester, permissao: EstadoDaPermissao.concedida);

      expect(
        find.text(TelaLeitorDeQr.instrucaoDoVisor),
        findsOne,
        reason: 'REPROVA: a camera esta liberada e a tela nao mostra o visor.',
      );
      expect(
        find.widgetWithText(
          BotaoPrimario,
          TextosDoCadastro.digitarOCodigo,
        ),
        findsNothing,
        reason: 'REPROVA: com a camera lendo, `Digitar o código` virou a acao '
            'principal. A acao principal e a que resolve, e aqui quem resolve '
            'e a camera -- promover a alternativa por cima dela e dizer a '
            'pessoa que o caminho que ela escolheu nao e o certo.',
      );
      expect(
        find.text(TelaLeitorDeQr.tituloSemLeitura),
        findsNothing,
        reason: 'REPROVA: a tela diz que o aparelho nao le, e ele esta lendo.',
      );
    });

    testWidgets('negada: a explicacao aparece e DIGITAR vira a acao principal',
        (tester) async {
      await abrirOLeitor(tester, permissao: EstadoDaPermissao.negada);

      expect(find.text(TelaLeitorDeQr.tituloPermissaoNegada), findsOne);
      expect(find.text(TelaLeitorDeQr.explicacaoPermissaoNegada), findsOne);

      // Criterio 4, ao pe da letra.
      final principal = find.widgetWithText(
        BotaoPrimario,
        TextosDoCadastro.digitarOCodigo,
      );
      expect(
        principal,
        findsOne,
        reason: 'REPROVA: com a camera negada, `Digitar o código` nao e a '
            'acao principal. Ele e o unico caminho que funciona, e o caminho '
            'que funciona nao fica em segundo plano.',
      );
      final alvo = tamanhoDoAlvo(tester, principal);
      expect(
        alvo.height,
        greaterThanOrEqualTo(pisoCritico),
        reason: 'REPROVA: alvo de ${alvo.height} dp. O piso critico e '
            '$pisoCritico dp.',
      );

      // Ha caminho de volta, e ele diz o que vai fazer antes de fazer.
      expect(find.text(TelaLeitorDeQr.ligarACamera), findsOne);
    });

    testWidgets('negada: o dialogo do sistema NAO e gasto na montagem',
        (tester) async {
      // A ISCA QUE NENHUM TEXTO DE TELA ENXERGA. No iOS o pedido de camera e
      // irreversivel: negado uma vez, so pelos Ajustes. Uma tela que pede na
      // montagem queima essa chance antes de a pessoa ler por que o app
      // precisa da camera -- e o app fica sem camera para sempre, sem ninguem
      // ter decidido isso.
      //
      // E a mesma regra que a BICHUS-24 pos na antessala de notificacao, e o
      // mesmo tipo de contador que a sustenta la.
      final camera = CameraDeTeste(
        EstadoDaPermissao.negada,
        depoisDePedir: EstadoDaPermissao.concedida,
      );
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.negada,
        camera: camera,
      );

      expect(
        camera.vezesQuePediu,
        0,
        reason: 'REPROVA: a tela pediu a permissao ${camera.vezesQuePediu} '
            'vez(es) **so por ter aberto**. No iOS o dialogo aparece uma vez '
            'na vida do app; gasta-lo antes de a pessoa tocar em nada tira '
            'dela a unica chance que existe.',
      );
      expect(
        camera.vezesQueConsultouEstado,
        greaterThan(0),
        reason: 'REPROVA: a tela nem consultou o estado. Consultar nao abre '
            'dialogo, e sem consultar ela nao tem como escolher o que '
            'mostrar.',
      );

      // E quando a pessoa toca, aí sim -- e a camera liga de verdade.
      await tocar(tester, find.text(TelaLeitorDeQr.ligarACamera));
      expect(camera.vezesQuePediu, 1);
      expect(
        find.text(TelaLeitorDeQr.instrucaoDoVisor),
        findsOne,
        reason: 'REPROVA: a permissao foi concedida e a tela nao abriu o '
            'visor. O toque que gasta o dialogo do sistema precisa entregar o '
            'que prometeu.',
      );
    });

    testWidgets('negada de vez: o caminho e os ajustes, e ele funciona',
        (tester) async {
      final camera = CameraDeTeste(EstadoDaPermissao.negadaPermanentemente);
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.negadaPermanentemente,
        camera: camera,
      );

      expect(
        find.text(TextosDoCadastro.abrirOsAjustes),
        findsOne,
        reason: 'REPROVA: negada permanentemente e o unico estado em que '
            'pedir de novo NAO abre dialogo. Sem o caminho dos ajustes a '
            'pessoa fica sem nenhum, e ela nem sabe que foi isso que houve.',
      );
      expect(
        find.text(TelaLeitorDeQr.ligarACamera),
        findsNothing,
        reason: 'REPROVA: a tela oferece um controle que abriria um dialogo '
            'que o sistema nao mostra mais. Toque que nao faz nada e pior que '
            'controle ausente.',
      );

      await tocar(tester, find.text(TextosDoCadastro.abrirOsAjustes));
      expect(
        camera.abriuAjustes,
        isTrue,
        reason: 'REPROVA: `Abrir os ajustes` nao abriu os ajustes.',
      );
      expect(camera.vezesQuePediu, 0);
    });

    testWidgets('indisponivel: nao manda aos ajustes procurar o que nao '
        'existe', (tester) async {
      final camera = CameraDeTeste(EstadoDaPermissao.indisponivel);
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.indisponivel,
        camera: camera,
      );

      expect(find.text(TelaLeitorDeQr.tituloSemLeitura), findsOne);
      expect(
        find.text(TextosDoCadastro.abrirOsAjustes),
        findsNothing,
        reason: 'REPROVA: nao ha permissao a conceder (controle parental, '
            'politica de dispositivo, ou aparelho sem camera) e a tela manda '
            'a pessoa aos ajustes. Ela vai percorrer o sistema atras de uma '
            'chave que nao esta la.',
      );
      expect(camera.abriuAjustes, isFalse);
    });

    testWidgets('build sem leitor: a permissao concedida nao inventa camera',
        (tester) async {
      // macOS, web e o teste de widget. A permissao esta liberada e nao ha
      // leitor: decidir so pela permissao abriria um visor sobre nada.
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.concedida,
        leitor: LeitorDeQrDeTeste(embarcado: false),
      );

      expect(find.text(TelaLeitorDeQr.tituloSemLeitura), findsOne);
      expect(find.text(TelaLeitorDeQr.instrucaoDoVisor), findsNothing);
    });
  });

  // -- ACESSIBILIDADE MEDIDA NO APP MONTADO --------------------------------
  //
  // O achado: quatro widgets do produto se anunciavam como botao **sem acao de
  // toque** (`btn=true tap=false`), `Copiar o código` entre eles. Quem usa
  // leitor de tela ouve "botão", tenta ativar, e nada acontece -- o leitor de
  // tela nao tem como saber que aquilo e so uma etiqueta com cara de controle.
  //
  // Nenhuma verificacao de texto, de layout ou de rotulo pega isso: os quatro
  // TINHAM rotulo. A pergunta e outra, e ela so tem resposta na arvore de
  // SEMANTICA do app montado -- `hasFlag(isButton)` contra
  // `hasAction(SemanticsAction.tap)`.
  group('nenhum falso botao na arvore de semantica (btn=true tap=false)', () {
    /// Todo no que se declara botao e **nao** aceita toque.
    List<String> falsosBotoes(WidgetTester tester) {
      final achados = <String>[];
      void visitar(SemanticsNode no) {
        final dados = no.getSemanticsData();
        final marcas = dados.flagsCollection;
        final ehBotao = marcas.isButton;
        final aceitaToque = dados.hasAction(SemanticsAction.tap);
        final desabilitado = marcas.isEnabled == Tristate.isFalse;
        // Controle DESABILITADO e outra coisa: ele se anuncia como
        // desabilitado, e o leitor de tela diz isso. O defeito e o que se diz
        // ativo e nao responde.
        if (ehBotao && !aceitaToque && !desabilitado) {
          achados.add('"${dados.label}"');
        }
        no.visitChildren((filho) {
          visitar(filho);
          return true;
        });
      }

      // A raiz de semantica nao pendura no `rootPipelineOwner`: ela mora num
      // dono FILHO dele. Procurar so no de cima devolve `null`, e um caso que
      // tratasse isso como "nao ha falso botao" ficaria verde sem ter olhado.
      SemanticsNode? raiz;
      void procurarADono(PipelineOwner dono) {
        raiz ??= dono.semanticsOwner?.rootSemanticsNode;
        dono.visitChildren(procurarADono);
      }

      procurarADono(tester.binding.rootPipelineOwner);
      if (raiz == null) {
        fail(
          'REPROVA: a arvore de semantica nao existe. Sem ela este caso nao '
          'tem o que varrer, e ficar verde por ausencia e o defeito que ele '
          'existe para pegar.',
        );
      }
      visitar(raiz!);
      return achados;
    }

    for (final permissao in EstadoDaPermissao.values) {
      testWidgets('estado `${permissao.name}`', (tester) async {
        final handle = tester.ensureSemantics();
        try {
          await abrirOLeitor(tester, permissao: permissao);
          final falsos = falsosBotoes(tester);
          expect(
            falsos,
            isEmpty,
            reason: 'REPROVA: ${falsos.join(", ")} se anuncia(m) como botao e '
                'nao aceita(m) toque (`btn=true tap=false`) em F2.1 com a '
                'permissao `${permissao.name}`. Quem usa VoiceOver ou '
                'TalkBack ouve "botão", ativa, e nada acontece -- WCAG 2.1 '
                'SC 4.1.2.',
          );
        } finally {
          handle.dispose();
        }
      });
    }

    testWidgets('e tambem na tela de sem conexao, onde `Copiar o código` mora',
        (tester) async {
      // `Copiar o código` era um dos quatro achados do produto. Nesta tela ele
      // so existe depois de a resolucao cair por falta de rede, e por isso o
      // caso precisa CHEGAR la em vez de montar a tela solta.
      final handle = tester.ensureSemantics();
      try {
        final leitor = LeitorDeQrDeTeste();
        await abrirOLeitor(
          tester,
          permissao: EstadoDaPermissao.concedida,
          leitor: leitor,
          rede: (_) async => throw const SocketException('sem rede'),
        );
        leitor.ler(qrDaPlaquinha);
        await tester.pump();
        await tester.pump();

        expect(
          find.text(TextosDoCadastro.copiarOCodigo),
          findsOne,
          reason: 'REPROVA: o caso nao chegou na tela de sem conexao, entao '
              'nao mediu nada.',
        );
        final falsos = falsosBotoes(tester);
        expect(
          falsos,
          isEmpty,
          reason: 'REPROVA: ${falsos.join(", ")} se anuncia(m) como botao sem '
              'aceitar toque na tela de sem conexao de F2.1.',
        );
      } finally {
        handle.dispose();
      }
    });
  });

  // -- O QUE A CAMERA LE ----------------------------------------------------
  group('o que chega pela camera', () {
    testWidgets('um QR que nao e do Bichu e recusado SEM SAIR DA CAMERA',
        (tester) async {
      // Criterio 3. A recusa e local: um QR de outra origem nao gasta uma ida
      // e volta de rede, e a pessoa ja esta apontando para a proxima
      // plaquinha quando o aviso some.
      var chamou = 0;
      final leitor = LeitorDeQrDeTeste();
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.concedida,
        leitor: leitor,
        rede: (_) async {
          chamou += 1;
          return problema('tag-code-not-found', 404);
        },
      );

      leitor.ler('https://exemplo.com.br/promocao');
      await tester.pump();

      expect(find.text(TelaLeitorDeQr.naoEDoBichu), findsOne);
      expect(
        chamou,
        0,
        reason: 'REPROVA: a tela mandou ao servidor um texto que nem forma de '
            'codigo do Bichu tem. Quem esta na rua paga isso em segundos e em '
            'dados moveis, e a resposta ja era conhecida antes de sair.',
      );
      expect(
        find.text(TelaLeitorDeQr.instrucaoDoVisor),
        findsOne,
        reason: 'REPROVA: a tela saiu da camera para dizer que o QR nao era '
            'do Bichu. O criterio 3 e explicito: **sem sair da camera**.',
      );

      // E o aviso e efemero: some sozinho, sem exigir um toque de quem esta
      // com o aparelho apontado para uma coleira.
      await tester.pump(TelaLeitorDeQr.duracaoDoAvisoEfemero);
      await tester.pumpAndSettle();
      expect(find.text(TelaLeitorDeQr.naoEDoBichu), findsNothing);
      expect(find.text(TelaLeitorDeQr.instrucaoDoVisor), findsOne);
    });

    testWidgets('um QR da plaquinha vai ao servidor com o codigo, e so ele',
        (tester) async {
      String? caminhoChamado;
      final leitor = LeitorDeQrDeTeste();
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.concedida,
        leitor: leitor,
        rede: (requisicao) async {
          caminhoChamado = requisicao.url.path;
          return problema('tag-code-not-found', 404);
        },
      );

      leitor.ler(qrDaPlaquinha);
      await tester.pumpAndSettle();

      expect(
        caminhoChamado,
        contains(codigoImpresso),
        reason: 'REPROVA: a tela mandou ao servidor algo que nao e o codigo '
            'extraido do QR (foi `$caminhoChamado`). O que viaja e o codigo, '
            'e nao a URL inteira.',
      );
      expect(find.textContaining('não é de nenhuma tag do Bichu'), findsOne);
    });

    testWidgets('a camera existe e NAO le: a tela diz e promove a digitacao',
        (tester) async {
      // O caso sem erro nenhum: codigo borrado, tag riscada, pouca luz, lente
      // arranhada. Nada falhou -- e justamente por isso a tela nao pode ficar
      // muda, nem acusar.
      await abrirOLeitor(tester, permissao: EstadoDaPermissao.concedida);

      expect(
        find.text(TelaLeitorDeQr.aindaProcurando),
        findsNothing,
        reason: 'REPROVA: a tela ja desiste antes de dar tempo de enquadrar. '
            'Quem acabou de abrir a camera esta com o aparelho no ar.',
      );

      await tester.pump(TelaLeitorDeQr.esperaAteAOfertaManual);
      await tester.pumpAndSettle();

      expect(
        find.text(TelaLeitorDeQr.aindaProcurando),
        findsOne,
        reason: 'REPROVA: passaram '
            '${TelaLeitorDeQr.esperaAteAOfertaManual.inSeconds} s sem leitura '
            'e a tela nao disse nada. A pessoa esta segurando o aparelho '
            'sobre um animal que se mexe, sem saber se o app esta vivo.',
      );
      expect(
        find.widgetWithText(
          BotaoPrimario,
          TextosDoCadastro.digitarOCodigo,
        ),
        findsOne,
        reason: 'REPROVA: a camera nao esta lendo e a entrada manual continua '
            'em segundo plano. Quem tem a lente arranhada chega ao mesmo '
            'lugar pelo mesmo esforco -- e isso quer dizer que o caminho que '
            'funciona sobe.',
      );
      expect(
        find.text(TelaLeitorDeQr.instrucaoDoVisor),
        findsOne,
        reason: 'REPROVA: a tela desligou a camera para oferecer a digitacao. '
            'Nada falhou: o proximo quadro ainda pode ler, e desistir por '
            'conta propria joga fora o caminho principal.',
      );
    });
  });

  group('o erro do codigo decide por type, e nunca por status', () {
    /// 16 simbolos, com hifen como a plaquinha imprime.
    ///
    /// Eram 10 e 11 simbolos ate 28/09, e passavam porque a tela mandava
    /// qualquer texto nao vazio ao servidor. Com a conferencia de forma local
    /// (o truncamento silencioso que o cliente achou), um codigo curto para no
    /// app e o desfecho que estes casos medem nunca chega da rede.
    const String bemFormado = 'BCH7-K2M9-1QDX-4N2Z';

    Future<void> digitarEEnviar(WidgetTester tester, String codigo) async {
      await tocar(tester, find.text(TextosDoCadastro.digitarOCodigo));
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
      await digitarEEnviar(tester, bemFormado);

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
      await digitarEEnviar(tester, bemFormado);

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
      await digitarEEnviar(tester, bemFormado);

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
