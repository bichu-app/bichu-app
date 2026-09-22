// F2.1 — a tela do leitor nao pode parecer uma camera enquanto nao for uma.
//
// O ACHADO, em aparelho fisico, 22/09/2026. Com a permissao de camera
// concedida, esta tela desenhava fundo preto de borda a borda, uma moldura
// branca de 240 x 240 e `Aponte para o QR da coleira`. **Nenhum widget de
// camera existia na arvore**, e nenhum plugin de leitura existe no
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
// Fundo escuro ocupando a tela e uma janela quadrada com contorno sao o
// vocabulario visual de visor, em qualquer app. Este arquivo mede os dois na
// arvore de render, sem depender de qual palavra alguem escreveu dentro.
//
// QUANDO ESTE ARQUIVO PRECISA MUDAR: quando a BICHUS-54 entrar e desenhar o
// preview de verdade. Ate la, `o app nao tem leitor` e uma propriedade
// verificavel, e o ultimo grupo a verifica no `pubspec.yaml` em vez de
// acreditar nela.

import 'dart:io';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
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
bool eFundoDeVisor(Color cor) => cor.a > 0.9 && cor.computeLuminance() < 0.05;

void main() {
  Future<void> abrirOLeitor(
    WidgetTester tester,
    EstadoDaPermissao permissao,
  ) async {
    await abrirOApp(
      tester,
      rede: _semServidor,
      camera: CameraDeTeste(permissao),
    );
    await tester.tap(find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
    await tester.pumpAndSettle();
  }

  // A permissao CONCEDIDA e a condicao do achado: era so nela que o visor
  // falso aparecia, e e por isso que ela esta em todos os casos deste grupo.
  // Os aparelhos entram porque a medida e geometrica: uma moldura empurrada
  // para fora da area segura continua sendo uma moldura, e um recorte de
  // sistema nao pode ser o que decide se a isca enxerga.
  for (final a in <Aparelho>[Aparelho.iphone, Aparelho.android]) {
    testWidgets('ISCA: nenhuma janela de leitura desenhada sem camera '
        '(${a.nome})', (tester) async {
      aparelho(tester, a);
      await abrirOLeitor(tester, EstadoDaPermissao.concedida);

      final janelas = caixasSob(tester, find.byType(TelaLeitorDeQr))
          .where(pareceJanelaDeLeitura)
          .map((c) => c.size)
          .toList();

      expect(
        janelas,
        isEmpty,
        reason: 'REPROVA: a tela desenha ${janelas.length} moldura(s) de '
            'leitura ($janelas) e **nao ha camera nenhuma atras delas**. '
            'Quadrado grande com contorno e o que a pessoa le como visor: ela '
            'aponta o aparelho para a coleira e espera. O leitor e a '
            'BICHUS-54, que esta em `To Do`; enquanto ela nao existir, esta '
            'tela oferece a digitacao e diz por que.',
      );
    });

    testWidgets('ISCA: nenhum fundo de visor ocupando a tela (${a.nome})',
        (tester) async {
      aparelho(tester, a);
      await abrirOLeitor(tester, EstadoDaPermissao.concedida);

      final tela = tester.getSize(find.byType(TelaLeitorDeQr));
      final area = tela.width * tela.height;
      final escuras = <String>[];

      for (final caixa in caixasSob(tester, find.byType(TelaLeitorDeQr))) {
        final fracao = (caixa.size.width * caixa.size.height) / area;
        if (fracao < 0.5) continue;
        if (caixa is RenderDecoratedBox) {
          final d = caixa.decoration;
          final cor = d is BoxDecoration ? d.color : null;
          if (cor != null && eFundoDeVisor(cor)) {
            escuras.add('${caixa.size} em $cor');
          }
        }
      }
      // `ColoredBox` -- que e o que `Container(color:)` tambem monta -- nao
      // produz um `RenderDecoratedBox`, e o visor antigo usava exatamente ele.
      // A varredura acima sozinha nao o veria.
      for (final pintada in find.byType(ColoredBox).evaluate()) {
        final widget = pintada.widget as ColoredBox;
        final caixa = pintada.renderObject! as RenderBox;
        final fracao = (caixa.size.width * caixa.size.height) / area;
        if (fracao >= 0.5 && eFundoDeVisor(widget.color)) {
          escuras.add('${caixa.size} em ${widget.color}');
        }
      }

      expect(
        escuras,
        isEmpty,
        reason: 'REPROVA: a tela pinta ${escuras.join(" | ")} sobre metade ou '
            'mais da area, e nao ha imagem de camera embaixo. Tela escura de '
            'borda a borda e a outra metade do vocabulario de visor: com a '
            'moldura ela diz "estou lendo", sem a moldura ela diz "a camera '
            'ainda nao abriu".',
      );
    });
  }

  testWidgets('ISCA: a instrucao do visor nao e desenhada sem visor',
      (tester) async {
    // A frase vem da constante da PROPRIA TELA, e nao de uma copia escrita
    // aqui: uma isca com a copia dela ficaria verde no dia em que alguem
    // repusesse o visor com o texto reescrito.
    await abrirOLeitor(tester, EstadoDaPermissao.concedida);

    expect(
      find.text(TelaLeitorDeQr.instrucaoDoVisor),
      findsNothing,
      reason: 'REPROVA: a tela manda apontar o aparelho para a coleira e nao '
          'tem o que apontar. E o criterio 1 da BICHUS-54, que pressupoe a '
          'camera desenhada atras da frase.',
    );
  });

  testWidgets('a tela DIZ o que nao existe, e oferece o que existe',
      (tester) async {
    // A metade positiva. Sem ela, apagar a tela inteira passaria nas iscas de
    // cima: nao desenhar visor nenhum e facil demais, e uma tela muda tambem
    // deixa a pessoa sem saber o que fazer.
    await abrirOLeitor(tester, EstadoDaPermissao.concedida);

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
          'campo. A entrada manual e o caminho de igual valor da BICHUS-54, e '
          'e o unico que funciona hoje.',
    );
  });

  group('a premissa desta isca, verificada e nao acreditada', () {
    test('nenhum plugin de leitura de QR no `pubspec.yaml`', () {
      // ESTE CASO NAO PROTEGE A TELA: ele protege os casos acima.
      //
      // Todos eles proibem a moldura PORQUE nao ha camera. No dia em que a
      // BICHUS-54 entrar com um preview de verdade, a proibicao inverte de
      // sinal -- a moldura passa a ser obrigatoria --, e uma isca que nao
      // percebesse a virada continuaria reprovando a tela certa.
      //
      // A lista de pacotes e uma lista, e ela erra para o lado seguro de
      // proposito: um pacote de leitura que nao esteja nela nao derruba este
      // caso, e as iscas de cima reprovam ruidosamente assim que a moldura
      // voltar. O contrario -- este caso mudar de sinal sozinho e as molduras
      // passarem a ser aceitas em silencio -- e que nao pode acontecer.
      const pacotesDeLeitura = <String>[
        'mobile_scanner',
        'qr_code_scanner',
        'ai_barcode_scanner',
        'google_mlkit_barcode_scanning',
        'flutter_barcode_scanner',
        'camera:',
      ];
      final pubspec = File('pubspec.yaml').readAsStringSync();
      final achados =
          pacotesDeLeitura.where((p) => pubspec.contains(p)).toList();

      expect(
        achados,
        isEmpty,
        reason: 'REPROVA, e a reprovacao e uma BOA NOTICIA: '
            '${achados.join(", ")} entrou no `pubspec.yaml`, o que sugere que '
            'a BICHUS-54 chegou. Este arquivo foi escrito para uma tela SEM '
            'leitor, e proibe a moldura de camera exatamente por isso. Com o '
            'preview de verdade na arvore, a moldura volta a ser obrigatoria: '
            'inverta as iscas em vez de apagar esta linha.',
      );
    });

    test('o `pubspec.yaml` foi mesmo lido', () {
      // Verificacao que nao consegue verificar precisa reprovar. O caso acima
      // fica verde por vazio se o arquivo nao estiver onde ele procura, e e
      // assim que um portao promete o que nao entrega.
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
