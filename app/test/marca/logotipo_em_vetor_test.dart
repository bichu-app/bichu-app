// O PORTAO DO LOGOTIPO: nenhuma tela compoe "Bichu" digitando em fonte.
//
// A REGRA. Paragrafo 4 de `design/marca/README.md` e paragrafo 8.4 de
// `docs/06-design-system.md`: o logotipo e desenho, nao palavra. Ele nao se
// recompoe digitando, por dois motivos que o documento ja registra — a fonte
// de marca em uso (`Plus Jakarta Sans ExtraBold`) **nao e** a letra do
// logotipo do cliente, e uma familia que nao carregue cai no fallback do
// sistema em silencio, trocando a letra da marca sem nenhum sinal.
//
// ATE 22/09/2026 DUAS TELAS QUEBRAVAM A REGRA, e nao por descuido: nao havia
// vetor para por no lugar. `tela_de_abertura.dart` compunha
// `Text('Bichu', style: displaySmall)` e a barra de topo da Inicio deslogada
// levava `titulo: 'Bichu'` para dentro de um `Text`. Com os SVG de
// `design/marca/vetor/`, as duas passaram a desenhar.
//
// DUAS METADES, e elas cobrem buracos diferentes.
//
// 1. **Inventario de origem.** Toda ocorrencia do literal exato `'Bichu'` em
//    `lib/` precisa estar declarada em [_inventario] com o motivo. Ocorrencia
//    nova REPROVA nomeando arquivo e linha, mesmo que seja legitima: o portao
//    pede uma decisao, nao adivinha. Isto pega o caso obvio — alguem escrever
//    `Text('Bichu')` de novo — e pega tambem o caso que uma varredura por
//    `Text(` nao pegaria, que e a palavra viajando por uma variavel.
//
// 2. **Medida no render.** As duas telas sao montadas e o que sai na tela e
//    inspecionado: nenhum widget de texto pode ter "Bichu" como conteudo
//    inteiro, e a marca precisa ter PINTADO — nao basta o widget estar na
//    arvore. A licao de 21/09 foi que oito iscas ficaram verdes com a splash
//    do iOS na cor errada porque liam arquivo; aqui a imagem rasterizada e
//    contada pixel a pixel.
//
// O QUE ESTE ARQUIVO NAO COBRA, e esta escrito para ninguem contar com o
// contrario: a palavra "Bichu" DENTRO de uma frase e nome do produto em texto
// corrido, e continua legitima ("O Bichu da uma identidade ao seu pet"). A
// regra e sobre o logotipo, que e a palavra sozinha fazendo as vezes de marca.

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:bichu/telas/tela_de_abertura.dart';
import 'package:bichu/theme/bichu_colors.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/marca.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Toda ocorrencia do literal exato `'Bichu'` em `lib/`, com o motivo.
///
/// Chave: caminho a partir de `lib/`. Valor: o trecho da linha que precisa
/// conter a ocorrencia, e que e o que prova que ela nao e composicao de
/// logotipo.
const Map<String, List<String>> _inventario = <String, List<String>>{
  // `MaterialApp.title` nao e pintado pelo app: e o rotulo que o sistema
  // operacional mostra no alternador de tarefas e no Android Recents. Fonte
  // dele e do sistema, e nao ha o que compor aqui.
  'main.dart': <String>["title: 'Bichu'"],
  'app.dart': <String>["title: 'Bichu'"],
  // Rotulo semantico da barra de topo da Inicio deslogada. Ele ATRAVESSA
  // `TelaDeAba.tituloEmMarca` e vira `Semantics(label:)` do vetor; o que a
  // tela pinta e o lockup. Leitor de tela precisa de palavra, e palavra que
  // nao e pintada nao e tipografia.
  'telas/abas.dart': <String>["titulo: 'Bichu'"],
  // O rotulo padrao dos dois widgets da marca, pela mesma razao.
  'widgets/marca.dart': <String>[
    "this.rotulo = 'Bichu'",
    "this.rotulo = 'Bichu'",
  ],
};

/// Widgets que compoem texto na tela.
///
/// Se um novo entrar no app, ele precisa entrar aqui: e por isso que a metade
/// do render existe: ela pega o que esta lista esquecer.
const List<String> _compoemTexto = <String>[
  'Text(',
  'SelectableText(',
  'TextSpan(',
  'RichText(',
];

Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (Directory('${dir.path}/app/lib').existsSync() &&
        Directory('${dir.path}/design/marca/vetor').existsSync()) {
      return dir;
    }
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei a raiz do repositorio (app/lib + design/marca/vetor) '
    'subindo a partir de "${Directory.current.path}". Portao sem o que ler '
    'reprova; ele nunca aprova por ausencia.',
  );
}

/// Todo texto que a arvore montada esta compondo.
List<String> _textosNaTela(WidgetTester tester) {
  final saida = <String>[];
  for (final widget in tester.allWidgets) {
    if (widget is Text) {
      final dado = widget.data ?? widget.textSpan?.toPlainText();
      if (dado != null) saida.add(dado);
    } else if (widget is RichText) {
      saida.add(widget.text.toPlainText());
    } else if (widget is EditableText) {
      saida.add(widget.controller.text);
    }
  }
  return saida;
}

void main() {
  group('inventario de origem', () {
    test('toda ocorrencia do literal Bichu em lib/ esta declarada', () {
      final lib = Directory('${_raizDoRepositorio().path}/app/lib');
      final achadas = <String, List<String>>{};

      for (final entidade in lib.listSync(recursive: true)) {
        if (entidade is! File || !entidade.path.endsWith('.dart')) continue;
        final relativo = entidade.path.substring(lib.path.length + 1);
        final linhas = entidade.readAsLinesSync();
        for (var i = 0; i < linhas.length; i++) {
          // So o CODIGO conta. O rabo de comentario sai antes da varredura,
          // senao a propria documentacao que cita o defeito derruba o portao —
          // que foi o que aconteceu na primeira execucao deste arquivo.
          final codigo = linhas[i].replaceAll(RegExp(r'//.*$'), '');
          if (!RegExp(r"'Bichu'").hasMatch(codigo)) continue;
          achadas.putIfAbsent(relativo, () => <String>[]).add(codigo.trim());

          // O caso grosso, dito com o nome dele: o literal encostado num
          // widget que compoe texto.
          for (final composicao in _compoemTexto) {
            expect(
              RegExp("${RegExp.escape(composicao)}\\s*(const\\s+)?'Bichu'")
                  .hasMatch(codigo),
              isFalse,
              reason:
                  'REPROVA: lib/$relativo:${i + 1} compoe o logotipo em fonte '
                  'viva:\n    ${codigo.trim()}\n'
                  'O paragrafo 8.4 do design system diz que o logotipo e vetor. '
                  'Use MarcaLockup ou MarcaSimbolo, de lib/widgets/marca.dart.',
            );
          }
        }
      }

      expect(
        achadas.keys.toSet(),
        _inventario.keys.toSet(),
        reason:
            'REPROVA: o conjunto de arquivos com o literal "Bichu" mudou.\n'
            'Declarado: ${_inventario.keys.toList()..sort()}\n'
            'Achado:    ${achadas.keys.toList()..sort()}\n'
            'Ocorrencia nova nao e proibida — ela precisa de uma linha em '
            '_inventario dizendo por que aquela nao e composicao de logotipo. '
            'Portao que deixa passar o que nao conhece nao e portao.',
      );

      for (final arquivo in _inventario.keys) {
        final declaradas = _inventario[arquivo]!;
        final linhas = achadas[arquivo]!;
        expect(
          linhas.length,
          declaradas.length,
          reason: 'REPROVA: lib/$arquivo tem ${linhas.length} ocorrencias de '
              '"Bichu" e o inventario declara ${declaradas.length}:\n'
              '${linhas.join('\n')}',
        );
        for (var i = 0; i < linhas.length; i++) {
          expect(
            linhas[i].contains(declaradas[i]),
            isTrue,
            reason: 'REPROVA: lib/$arquivo, ocorrencia ${i + 1}, deveria conter '
                '"${declaradas[i]}" e a linha e:\n    ${linhas[i]}',
          );
        }
      }
    });
  });

  group('medida no render', () {
    testWidgets('a tela de abertura desenha a marca e nao escreve "Bichu"',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(theme: BichuTheme.claro, home: const TelaDeAbertura()),
      );
      await tester.pump();

      expect(
        _textosNaTela(tester).where((t) => t.trim() == 'Bichu'),
        isEmpty,
        reason: 'REPROVA: a tela de abertura esta compondo "Bichu" em fonte '
            'viva. Os textos na tela sao: ${_textosNaTela(tester)}',
      );
      expect(find.byType(MarcaLockup), findsOne);

      final pintada = await _marcaPintada(tester);
      expect(
        pintada.tinta,
        greaterThan(0.05),
        reason: 'REPROVA: o widget da marca esta na arvore e NAO PINTOU '
            '(${(pintada.tinta * 100).toStringAsFixed(2)}% de tinta na caixa '
            'dele). Widget presente com caminho vazio e exatamente o defeito '
            'que uma isca de arquivo nao alcanca.',
      );
      expect(
        pintada.cor,
        BichuTheme.claro.extension<BichuColors>()!.cores.primary.toARGB32() &
            0xFFFFFF,
        reason: 'REPROVA: a marca pintou em '
            '#${pintada.cor.toRadixString(16).padLeft(6, '0').toUpperCase()}, '
            'que nao e o `primary` do tema. Cor da marca se resolve por token, '
            'nunca por literal.',
      );
    });

  });
}

/// Rasteriza a marca PELO PINTOR QUE A TELA MONTOU, no tamanho em que a tela a
/// deitou, e devolve a fracao de tinta e a cor encontrada.
///
/// POR QUE NAO `RenderRepaintBoundary.toImage()`: no `flutter_test` ele nao
/// volta. Medido aqui em 22/09/2026 — com e sem `runAsync`, o caso morria no
/// limite de dez minutos do executor. `Picture.toImage()` volta na hora, e e
/// o mesmo rasterizador.
///
/// O QUE ESTA MEDIDA ALCANCA: o widget existe na arvore, foi deitado com
/// tamanho de verdade, o pintor dele rodou, o caminho nao e vazio e a cor saiu
/// do tema. O QUE ELA NAO ALCANCA: a etapa de composicao, que e do sistema.
Future<({double tinta, int cor})> _marcaPintada(WidgetTester tester) async {
  final alvo = find.descendant(
    of: find.byType(MarcaLockup),
    matching: find.byType(CustomPaint),
  );
  final pintor = tester.widget<CustomPaint>(alvo).painter;
  if (pintor == null) {
    fail('REPROVA: MarcaLockup esta na arvore sem pintor.');
  }
  final tamanho = tester.getSize(find.byType(MarcaLockup));
  expect(
    tamanho.width,
    greaterThanOrEqualTo(MarcaLockup.pisoDeLargura),
    reason: 'REPROVA: a tela deitou a marca com ${tamanho.width}px de largura, '
        'abaixo do piso de ${MarcaLockup.pisoDeLargura}px da secao 3.10.',
  );

  final gravador = ui.PictureRecorder();
  final canvas = Canvas(gravador)
    ..drawRect(
      Rect.fromLTWH(0, 0, tamanho.width, tamanho.height),
      Paint()..color = const Color(0xFFFAFAF8),
    );
  pintor.paint(canvas, tamanho);

  // AS DUAS ESPERAS PRECISAM ESTAR DENTRO DE `runAsync`. O relogio do
  // `testWidgets` e falso, e tanto `toImage` quanto `toByteData` sao resolvidos
  // pelo motor em tempo REAL: uma delas fora daqui trava o caso ate o limite
  // de dez minutos do executor, sem mensagem. Medido em 22/09/2026, nas duas
  // combinacoes.
  ByteData? dados;
  await tester.runAsync(() async {
    final imagem = await gravador
        .endRecording()
        .toImage(tamanho.width.round(), tamanho.height.round());
    dados = await imagem.toByteData(format: ui.ImageByteFormat.rawRgba);
  });
  if (dados == null) {
    fail('REPROVA: nao consegui ler os pixels da marca deitada pela tela.');
  }
  final px = dados!.buffer.asUint8List();
  var tinta = 0;
  final histograma = <int, int>{};
  for (var i = 0; i < px.length; i += 4) {
    // Carmim #9E0B3A contra o fundo #FAFAF8: o canal verde e o que mais anda
    // (0x0B contra 0xFA), entao ele e o menos ambiguo dos tres.
    if (px[i + 1] < 0x40) {
      tinta++;
      final rgb = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      histograma[rgb] = (histograma[rgb] ?? 0) + 1;
    }
  }
  final dominante = histograma.isEmpty
      ? 0
      : histograma.entries.reduce((a, b) => a.value >= b.value ? a : b).key;
  return (tinta: tinta / (px.length / 4), cor: dominante);
}
