// F2.1 — moldura de leitura e camera andam JUNTAS. Nunca uma sem a outra.
//
// O ACHADO, em aparelho fisico, 22/09/2026. Com a permissao de camera
// concedida, esta tela desenhava fundo preto de borda a borda, uma moldura
// branca de 240 x 240 e `Aponte para o QR da coleira`. **Nenhum widget de
// camera existia na arvore**, e nenhum plugin de leitura existia no
// `pubspec.yaml`: a pessoa apontava o aparelho para a coleira e esperava um
// quadrado preto que nunca ia ler nada.
//
// POR QUE ESTE ARQUIVO MEDE GEOMETRIA, E NAO TEXTO. A suite ja tinha oito
// casos nesta tela, e todos passaram com a mentira de pe, porque todos
// perguntavam se o caminho alternativo existia: "`Digitar o código` esta
// presente", "o alvo tem 64 dp", "o erro decide por `type`". Todos continuam
// verdes com um visor falso desenhado por cima -- o campo de digitar existe
// **e** a tela mente, ao mesmo tempo.
//
// O que a pessoa le como "a camera esta ligada" nao e uma frase: e a figura.
// Um quadrado grande com contorno e o vocabulario visual de visor, em qualquer
// app. Este arquivo mede a figura na arvore de render, sem depender de qual
// palavra alguem escreveu dentro.
//
// -- A INVERSAO (BICHUS-54, 22/09/2026) --------------------------------------
//
// A versao anterior deste arquivo proibia a moldura em todos os casos, e o
// ultimo grupo dizia por escrito por que: "no dia em que a BICHUS-54 entrar
// com um preview de verdade, a proibicao inverte de sinal -- a moldura passa a
// ser obrigatoria --, e uma isca que nao percebesse a virada continuaria
// reprovando a tela certa. Inverta as iscas em vez de apagar esta linha."
//
// A BICHUS-54 entrou. As iscas foram invertidas, e **nenhuma linha foi
// apagada**: o que se descobriu ao inverter e que a regra nunca foi "nao
// desenhe moldura". A regra sempre foi **moldura e camera andam juntas**, e a
// versao anterior era o caso particular dela num build em que a camera nao
// existia. Escrita assim, a regra nao precisa ser invertida de novo: ela ja
// cobre os dois lados, e `exigirQueAndemJuntas` roda nos dois sentidos no
// mesmo arquivo, sem depender de qual deles e o mundo de hoje.
//
// As duas direcoes, e as duas reprovam:
//  - camera ligada e moldura ausente    -> REPROVA (a tela nao diz onde apontar);
//  - moldura desenhada sem camera atras -> REPROVA (o defeito da BICHUS-220).

import 'dart:io';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/dispositivo/leitor_de_qr.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'area_segura_do_aparelho_test.dart' show Aparelho, aparelho;

Future<http.Response> _semServidor(http.Request _) async =>
    http.Response('', 404);

/// Toda caixa com tamanho desenhada sob [raiz], em ordem de arvore.
List<RenderBox> caixasSob(WidgetTester tester, Finder raiz) {
  final saida = <RenderBox>[];
  void visitar(RenderObject no) {
    if (no is RenderBox && no.hasSize) saida.add(no);
    no.visitChildren(visitar);
  }

  visitar(tester.renderObject(raiz));
  return saida;
}

/// Se [caixa] tem a forma de uma janela de leitura.
///
/// **Quadrada e grande, com contorno visivel.** Os tres juntos, e nao cada um
/// sozinho: um cartao quadrado pequeno e um cartao, uma caixa grande sem
/// contorno e um fundo, e so a combinacao diz "aponte aqui dentro". A faixa
/// nao esta colada nos 240 dp que estavam la: uma moldura de 180 ou de 300
/// dp diz a mesma coisa para quem olha, e uma isca presa ao numero antigo
/// aceitaria a mesma mentira redesenhada.
bool pareceJanelaDeLeitura(RenderBox caixa) {
  if (caixa is! RenderDecoratedBox) return false;
  final decoracao = caixa.decoration;
  if (decoracao is! BoxDecoration) return false;
  final contorno = decoracao.border;
  if (contorno == null || contorno.dimensions == EdgeInsets.zero) return false;
  final tamanho = caixa.size;
  final menor = tamanho.shortestSide;
  if (menor < 120) return false;
  return tamanho.width / tamanho.height >= 0.8 &&
      tamanho.width / tamanho.height <= 1.25;
}

/// Se [cor] e escura o bastante para ser lida como "a camera esta apagada".
///
/// `computeLuminance` e a luminancia relativa da WCAG, a mesma conta que o
/// portao de contraste do design system usa. Preto puro da 0; o `surface`
/// claro do app passa de 0,9. O corte em 0,05 deixa passar qualquer superficie
/// do tema e pega o preto de visor.
///
/// **`cor.a > 0.9` continua sendo a condicao, e depois da BICHUS-54 ela virou
/// a parte que importa.** O escurecimento que a tela desenha HOJE sobre a
/// imagem da camera e translucido (alfa 0x8A): ele da contraste a moldura e
/// deixa os quadros aparecerem. Uma camada opaca no mesmo lugar seria a tela
/// preta da BICHUS-220 de volta, agora com uma camera funcionando escondida
/// atras dela -- a mesma figura, o mesmo engano, e um `MobileScanner` na
/// arvore para o portao de camera ficar verde.
bool eFundoDeVisor(Color cor) => cor.a > 0.9 && cor.computeLuminance() < 0.05;

/// Toda superficie de leitura viva na arvore, **so as que declaram leitor**.
///
/// O marcador sozinho nao bastaria: um duble que se declarasse superficie sem
/// ter leitor por tras seria a mesma mentira com outra roupa. Por isso o filtro
/// e por `embarcado`, e nao por tipo.
List<SuperficieDeLeituraAoVivo> superficiesVivas(WidgetTester tester) {
  return find
      .byType(SuperficieDeLeituraAoVivo)
      .evaluate()
      .map((e) => e.widget as SuperficieDeLeituraAoVivo)
      .where((s) => s.embarcado)
      .toList();
}

/// **A regra, nos dois sentidos, num lugar so.**
///
/// Ela nao pergunta "ha moldura?" nem "ha camera?": pergunta se as duas
/// respostas batem. E por ela ser uma pergunta de coerencia, e nao uma
/// proibicao, que este arquivo nao vai precisar ser invertido de novo quando
/// alguem mexer na tela.
void exigirQueAndemJuntas(WidgetTester tester, {required bool comCamera}) {
  final janelas = caixasSob(tester, find.byType(TelaLeitorDeQr))
      .where(pareceJanelaDeLeitura)
      .map((c) => c.size)
      .toList();
  final vivas = superficiesVivas(tester);
  final instrucao = find.text(TelaLeitorDeQr.instrucaoDoVisor);

  if (comCamera) {
    expect(
      vivas,
      isNotEmpty,
      reason: 'REPROVA: a tela deveria estar lendo e nao pendurou nenhuma '
          '`SuperficieDeLeituraAoVivo` com leitor atras. Sem ela, o que vem '
          'abaixo e moldura sobre coisa nenhuma.',
    );
    expect(
      janelas,
      isNotEmpty,
      reason: 'REPROVA: a camera esta ligada e a tela nao desenha janela de '
          'leitura nenhuma. E o criterio 1 da BICHUS-54: a moldura e o que '
          'diz onde apontar. Sem ela a pessoa nao sabe a que distancia nem em '
          'que pedaco da tela o codigo precisa cair, e um leitor sem alvo e '
          'um leitor que so funciona por sorte.',
    );
    expect(
      instrucao,
      findsOne,
      reason: 'REPROVA: ha visor e a tela nao manda apontar para lugar '
          'nenhum. A frase do criterio 1 acompanha a moldura; ela so era '
          'proibida enquanto nao havia o que apontar.',
    );
    return;
  }

  expect(
    vivas,
    isEmpty,
    reason: 'REPROVA: nao ha leitor neste caso e mesmo assim a arvore tem uma '
        'superficie de leitura viva. O marcador so pode existir quando ha '
        'leitura de verdade acontecendo atras dele.',
  );
  expect(
    janelas,
    isEmpty,
    reason: 'REPROVA: a tela desenha ${janelas.length} moldura(s) de leitura '
        '($janelas) e **nao ha camera nenhuma atras delas**. Quadrado grande '
        'com contorno e o que a pessoa le como visor: ela aponta o aparelho '
        'para a coleira e espera. Este e o defeito exato que o cliente achou '
        'em aparelho fisico em 22/09/2026 (BICHUS-220).',
  );
  expect(
    instrucao,
    findsNothing,
    reason: 'REPROVA: a tela manda apontar o aparelho para a coleira e nao '
        'tem o que apontar.',
  );
}

void main() {
  Future<void> abrirOLeitor(
    WidgetTester tester, {
    required EstadoDaPermissao permissao,
    required LeitorDeQr leitor,
  }) async {
    await abrirOApp(
      tester,
      rede: _semServidor,
      camera: CameraDeTeste(permissao),
      leitorDeQr: leitor,
    );
    await tester.tap(find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
    await tester.pumpAndSettle();
  }

  // -- DIRECAO 1: COM CAMERA, A MOLDURA E OBRIGATORIA -----------------------
  //
  // A permissao CONCEDIDA e a condicao do achado original: era so nela que o
  // visor falso aparecia. Ela continua em todos os casos deste grupo, agora
  // como a condicao em que o visor de verdade **tem** de aparecer.
  //
  // Os aparelhos entram porque a medida e geometrica: uma moldura empurrada
  // para fora da area segura continua sendo uma moldura, e um recorte de
  // sistema nao pode ser o que decide se a isca enxerga.
  group('com camera atras, a moldura e OBRIGATORIA', () {
    for (final a in <Aparelho>[Aparelho.iphone, Aparelho.android]) {
      testWidgets('a tela desenha o visor e diz onde apontar (${a.nome})',
          (tester) async {
        aparelho(tester, a);
        await abrirOLeitor(
          tester,
          permissao: EstadoDaPermissao.concedida,
          leitor: LeitorDeQrDeTeste(),
        );

        exigirQueAndemJuntas(tester, comCamera: true);
      });
    }

    testWidgets('a tela PEDIU o visor a porta, e nao desenhou um sozinha',
        (tester) async {
      // A contrapartida de `exigirQueAndemJuntas`: a superficie viva podia,
      // em tese, ser montada pela propria tela com um `embarcado: true`
      // escrito a mao. O contador mora na PORTA, e so ela o incrementa.
      final leitor = LeitorDeQrDeTeste();
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.concedida,
        leitor: leitor,
      );

      expect(
        leitor.vezesQuePediuOVisor,
        greaterThan(0),
        reason: 'REPROVA: a tela montou a figura de visor sem nunca chamar '
            '`LeitorDeQr.visor()`. A moldura veio de algum lugar que nao e a '
            'camera.',
      );
    });

    testWidgets('o escurecimento sobre a camera nao e opaco', (tester) async {
      // A meia-volta que a inversao deixaria passar se ninguem olhasse: com
      // `MobileScanner` na arvore, uma camada PRETA por cima dele satisfaria
      // qualquer portao que so pergunte "ha camera?" -- e a pessoa continuaria
      // olhando para um quadrado preto. O que a BICHUS-220 mediu era a figura,
      // e a figura continua proibida.
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.concedida,
        leitor: LeitorDeQrDeTeste(),
      );

      final tela = tester.getSize(find.byType(TelaLeitorDeQr));
      final area = tela.width * tela.height;
      final opacas = <String>[];

      for (final caixa in caixasSob(tester, find.byType(TelaLeitorDeQr))) {
        final fracao = (caixa.size.width * caixa.size.height) / area;
        if (fracao < 0.5) continue;
        if (caixa is RenderDecoratedBox) {
          final d = caixa.decoration;
          final cor = d is BoxDecoration ? d.color : null;
          if (cor != null && eFundoDeVisor(cor)) {
            opacas.add('${caixa.size} em $cor');
          }
        }
      }
      // `ColoredBox` -- que e o que `Container(color:)` tambem monta -- nao
      // produz um `RenderDecoratedBox`, e o visor antigo usava exatamente ele.
      // A varredura acima sozinha nao o veria. O escurecimento de HOJE tambem
      // e um `ColoredBox`, e passa por ser translucido, nao por ser invisivel
      // a esta busca.
      for (final pintada in find.byType(ColoredBox).evaluate()) {
        final widget = pintada.widget as ColoredBox;
        final caixa = pintada.renderObject! as RenderBox;
        final fracao = (caixa.size.width * caixa.size.height) / area;
        if (fracao >= 0.5 && eFundoDeVisor(widget.color)) {
          opacas.add('${caixa.size} em ${widget.color}');
        }
      }

      expect(
        opacas,
        isEmpty,
        reason: 'REPROVA: a tela pinta ${opacas.join(" | ")} OPACO sobre '
            'metade ou mais da area. Ha camera na arvore e ela nao aparece: e '
            'a tela preta da BICHUS-220 de volta, agora com um leitor de '
            'verdade escondido atras dela. O escurecimento que da contraste a '
            'moldura precisa deixar os quadros passarem.',
      );
    });
  });

  // -- DIRECAO 2: SEM CAMERA, A MOLDURA CONTINUA PROIBIDA -------------------
  //
  // Este grupo e a versao anterior deste arquivo, inteira, e ele e o que
  // impede a inversao de virar uma licenca. Desligar a camera tem de fazer a
  // moldura sumir: se ela sobreviver ao desligamento, ela nunca dependeu da
  // camera, e o `mobile_scanner` no `pubspec.yaml` passou a ser um alibi.
  group('sem camera atras, a moldura continua PROIBIDA', () {
    for (final a in <Aparelho>[Aparelho.iphone, Aparelho.android]) {
      testWidgets('build sem leitor: nenhuma figura de visor (${a.nome})',
          (tester) async {
        aparelho(tester, a);
        // A permissao e CONCEDIDA de proposito. O aparelho nao le, e uma tela
        // que decidisse so pela permissao desenharia o visor aqui -- que e o
        // caso em que o macOS e a web caem.
        await abrirOLeitor(
          tester,
          permissao: EstadoDaPermissao.concedida,
          leitor: LeitorDeQrDeTeste(embarcado: false),
        );

        exigirQueAndemJuntas(tester, comCamera: false);
      });
    }

    testWidgets('permissao negada: nenhuma figura de visor', (tester) async {
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.negada,
        leitor: LeitorDeQrDeTeste(),
      );

      exigirQueAndemJuntas(tester, comCamera: false);
    });

    testWidgets('permissao negada de vez: nenhuma figura de visor',
        (tester) async {
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.negadaPermanentemente,
        leitor: LeitorDeQrDeTeste(),
      );

      exigirQueAndemJuntas(tester, comCamera: false);
    });

    testWidgets('a tela DIZ o que nao existe, e oferece o que existe',
        (tester) async {
      // A metade positiva. Sem ela, apagar a tela inteira passaria nas iscas
      // de cima: nao desenhar visor nenhum e facil demais, e uma tela muda
      // tambem deixa a pessoa sem saber o que fazer.
      await abrirOLeitor(
        tester,
        permissao: EstadoDaPermissao.concedida,
        leitor: LeitorDeQrDeTeste(embarcado: false),
      );

      expect(find.text(TelaLeitorDeQr.tituloSemLeitura), findsOne);
      expect(find.text(TelaLeitorDeQr.explicacaoSemLeitura), findsOne);
      expect(
        find.text(TextosDoCadastro.digitarOCodigo),
        findsOne,
        reason: 'REPROVA: a tela diz o que nao da para fazer e nao oferece o '
            'que da. Dizer so a ausencia e um beco com boas maneiras.',
      );

      // E o caminho que ela oferece precisa CHEGAR no campo. Um botao honesto
      // que nao abre nada seria a mentira seguinte.
      await tocar(tester, find.text(TextosDoCadastro.digitarOCodigo));
      expect(
        find.byType(TextField),
        findsOne,
        reason: 'REPROVA: `${TextosDoCadastro.digitarOCodigo}` nao abriu o '
            'campo. A entrada manual e o caminho de igual valor da BICHUS-54, '
            'e e o unico que funciona neste aparelho.',
      );
    });
  });

  group('a premissa desta isca, verificada e nao acreditada', () {
    test('ha um plugin de leitura de QR no `pubspec.yaml`', () {
      // ESTE CASO NAO PROTEGE A TELA: ele protege os casos acima.
      //
      // Os casos de cima EXIGEM a moldura porque ha camera. O dia em que
      // alguem tirar o plugin do `pubspec.yaml` e o dia em que a exigencia
      // deixa de ter fundamento, e eles passariam a cobrar uma moldura que
      // nao pode mais ter nada atras -- exatamente o erro que a versao
      // anterior deste arquivo previu, com o sinal trocado.
      //
      // A lista e a MESMA de antes, e ela agora erra para o outro lado: um
      // pacote de leitura fora dela derruba este caso mesmo com a tela certa.
      // E o lado seguro: o alarme ruidoso manda alguem ler este comentario, e
      // o contrario -- as molduras continuarem exigidas em silencio depois de
      // o leitor sair -- e que nao pode acontecer.
      const pacotesDeLeitura = <String>[
        'mobile_scanner',
        'qr_code_scanner',
        'ai_barcode_scanner',
        'google_mlkit_barcode_scanning',
        'flutter_barcode_scanner',
      ];
      final pubspec = File('pubspec.yaml').readAsStringSync();
      final achados =
          pacotesDeLeitura.where((p) => pubspec.contains(p)).toList();

      expect(
        achados,
        isNotEmpty,
        reason: 'REPROVA: nenhum pacote de leitura de QR no `pubspec.yaml`. '
            'Os casos acima exigem a moldura PORQUE ha camera; sem leitor, a '
            'exigencia vira a promessa que a BICHUS-220 veio tirar da tela. '
            'Se a remocao e proposital, inverta as iscas de volta em vez de '
            'apagar esta linha -- `exigirQueAndemJuntas` ja roda nos dois '
            'sentidos, e o que muda e qual deles a tela vive.',
      );
    });

    test('o `pubspec.yaml` foi mesmo lido', () {
      // Verificacao que nao consegue verificar precisa reprovar. O caso acima
      // ficaria verde por engano se o arquivo nao estivesse onde ele procura,
      // e e assim que um portao promete o que nao entrega.
      final pubspec = File('pubspec.yaml');
      expect(
        pubspec.existsSync(),
        isTrue,
        reason: 'REPROVA: `${pubspec.absolute.path}` nao existe. O caso acima '
            'nao teve o que conferir, e ficar verde assim e pior que nao '
            'existir.',
      );
      expect(pubspec.readAsStringSync(), contains('name: bichu'));
    });
  });
}
