// ===========================================================================
// OS PADRÕES DE `PreviaDaFoto` SÃO O COMPORTAMENTO DE ANTES DOS PARÂMETROS
// ===========================================================================
//
// Em 21/10/2026 a peça ganhou três parâmetros, porque a edição da foto do pet
// era a NONA tela com foto escolhida e abria `dart:io` por conta própria dentro
// de `lib/telas` — furando o portão que a peça existe para não ser furado. O
// cliente recusou uma segunda peça: *"você não está criando um sistema de
// upload por cada recurso né? Você deveria estar reaproveitando esse codigo."*
//
// **A condição da extensão era que as OITO telas que já usavam a peça não
// mudassem uma linha**, e suíte verde não prova isso: as oito poderiam estar
// verdes com outro desenho, porque nenhuma delas afirma o ponto focal, o tipo
// da reserva de falha nem a existência do quadro próprio.
//
// Estes casos afirmam. Eles reprovam se um PADRÃO deixar de reproduzir o que a
// peça fazia antes dos parâmetros — e é por isso que eles olham a árvore
// renderizada, e não a assinatura do construtor: trocar um valor de padrão não
// muda assinatura nenhuma e não quebra compilação em lugar nenhum.
//
// DESLIGAR PARA VER REPROVAR, em `lib/widgets/previa_da_foto.dart`:
//   - `this.pontoFocal = Alignment.center` -> `Alignment(0, -1 / 3)`:
//     reprova `o ponto focal padrão é o centro`;
//   - `this.comInvolucroProprio = true` -> `false`:
//     reprova `o padrão desenha o quadro próprio`;
//   - `aoNaoAbrir?.call(context) ?? _texto(naoAbriu, ...)` -> só o `call`:
//     reprova `sem `aoNaoAbrir`, a falha é o texto de sempre`.

import 'dart:io';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Um arquivo que **existe de verdade**, e num `TMPDIR` durável.
///
/// Arquivo inexistente faria `Image.file` cair direto no `errorBuilder`, e os
/// casos do caminho felizmente desenhado mediriam o caminho de falha sem dizer.
late Directory _pasta;
late FotoLocal _foto;

Future<void> _montar(
  WidgetTester tester, {
  Alignment? pontoFocal,
  bool? comInvolucroProprio,
  WidgetBuilder? aoNaoAbrir,
  FotoLocal? foto,
  String? vazio,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: PreviaDaFoto(
          foto: foto ?? _foto,
          descricao: 'A foto escolhida',
          vazio: vazio,
          pontoFocal: pontoFocal ?? Alignment.center,
          comInvolucroProprio: comInvolucroProprio ?? true,
          aoNaoAbrir: aoNaoAbrir,
        ),
      ),
    ),
  );
  await tester.pump();
}

/// A MESMA chamada, mas **sem passar nenhum dos três**: é ela que mede o padrão.
Future<void> _montarComOsPadroes(WidgetTester tester, {String? vazio}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: PreviaDaFoto(
          foto: _foto,
          descricao: 'A foto escolhida',
          vazio: vazio,
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  setUpAll(() {
    _pasta = Directory.systemTemp.createTempSync('previa-padroes');
    final arquivo = File('${_pasta.path}/nina.jpg')
      ..writeAsBytesSync(<int>[0xFF, 0xD8, 0xFF, 0xD9]);
    _foto = FotoLocal(
      caminho: arquivo.path,
      tipoDeConteudo: 'image/jpeg',
      tamanhoEmBytes: arquivo.lengthSync(),
    );
  });

  tearDownAll(() => _pasta.deleteSync(recursive: true));

  group('ISCA — os padrões reproduzem o comportamento de antes dos parâmetros', () {
    testWidgets('o ponto focal padrão é o centro', (tester) async {
      await _montarComOsPadroes(tester);

      final imagem = tester.widget<Image>(find.byType(Image));
      expect(
        imagem.alignment,
        Alignment.center,
        reason:
            'REPROVA: o padrão de `pontoFocal` deixou de ser `Alignment.center`. '
            'As OITO telas que já usavam esta peça não passam `pontoFocal`, e '
            'um padrão diferente RECORTARIA a foto delas noutro lugar sem que '
            'nenhuma mudasse uma linha e sem quebrar compilação em lugar '
            'nenhum. O terço superior é pedido da edição do pet, e vale só '
            'onde ele é passado.',
      );
    });

    testWidgets('o padrão desenha o quadro próprio', (tester) async {
      await _montarComOsPadroes(tester);

      // O quadro é um `Container` com decoração; sem ele a peça devolve só a
      // imagem. A âncora é a DECORAÇÃO, e não a presença de um `Container`
      // qualquer, porque `Container` aparece em qualquer árvore.
      final comDecoracao = find.byWidgetPredicate(
        (w) => w is Container && w.decoration is BoxDecoration,
      );
      expect(
        comDecoracao,
        findsWidgets,
        reason:
            'REPROVA: o padrão de `comInvolucroProprio` deixou de ser `true`. '
            'As OITO telas contam com o quadro desta peça (fundo afundado, '
            'borda fina, raio `lg`): com o padrão invertido elas perderiam o '
            'quadro TODAS DE UMA VEZ, e nenhuma delas afirma que ele existe.',
      );

      // E o rótulo de leitor de tela vem com o quadro, porque é ele que rotula.
      expect(
        find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.label == 'A foto escolhida',
        ),
        findsWidgets,
        reason: 'REPROVA: o padrão deixou de rotular a imagem. Quem desenha o '
            'quadro é quem rotula.',
      );
    });

    testWidgets('sem `aoNaoAbrir`, a falha é o texto de sempre', (tester) async {
      // A RESERVA É MEDIDA PELO `errorBuilder`, e não por fazer o
      // decodificador falhar. Em teste de widget o carregamento de imagem não
      // chega ao disco, então um caso que apontasse para arquivo inexistente
      // mediria o AGENDAMENTO do Flutter e não o nosso padrão — e ficaria
      // verde por não achar nada, que é a pior forma de ficar verde.
      await _montarComOsPadroes(tester);

      final imagem = tester.widget<Image>(find.byType(Image));
      expect(
        imagem.errorBuilder,
        isNotNull,
        reason:
            'REPROVA: a peça deixou de passar `errorBuilder`. A política desta '
            'peça é `errorBuilder` SEMPRE: sem ele, formato que o aparelho não '
            'decodifica (HEIC em Android antigo) vira exceção vermelha no meio '
            'do formulário.',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: Scaffold(
            body: Builder(
              builder: (context) =>
                  imagem.errorBuilder!(context, Object(), null),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(
        find.text(PreviaDaFoto.naoAbriu),
        findsOneWidget,
        reason:
            'REPROVA: sem `aoNaoAbrir` a falha deixou de ser `naoAbriu`. As '
            'OITO telas não passam `aoNaoAbrir`, e a reserva delas é esse '
            'texto — um quadro vazio seria pior que o caminho do arquivo que '
            'esta peça veio substituir.',
      );
    });

    testWidgets('`aoNaoAbrir` passado VENCE o texto de sempre', (tester) async {
      // O contrapeso: sem ele, o caso acima ficaria verde com `aoNaoAbrir`
      // sendo ignorado, e a tela do pet mostraria um parágrafo de texto dentro
      // de uma moldura de 160 dp.
      await _montar(
        tester,
        aoNaoAbrir: (context) => const Text('a reserva da moldura'),
      );

      final imagem = tester.widget<Image>(find.byType(Image));
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: Scaffold(
            body: Builder(
              builder: (context) =>
                  imagem.errorBuilder!(context, Object(), null),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('a reserva da moldura'), findsOneWidget);
      expect(
        find.text(PreviaDaFoto.naoAbriu),
        findsNothing,
        reason: 'REPROVA: `aoNaoAbrir` foi ignorado e o texto de sempre ficou.',
      );
    });

    testWidgets('`comInvolucroProprio: false` devolve só a imagem', (tester) async {
      // O CONTRAPESO: sem ele, os casos acima ficariam verdes com o parâmetro
      // ignorado, e a tela do pet voltaria a ter duas bordas sem ninguém ver.
      await _montar(tester, comInvolucroProprio: false);

      expect(find.byType(Image), findsOneWidget);
      expect(
        find.byWidgetPredicate(
          (w) => w is Container && w.decoration is BoxDecoration,
        ),
        findsNothing,
        reason:
            'REPROVA: `comInvolucroProprio: false` continuou desenhando o '
            'quadro. Dentro de uma `Moldura` isso é uma SEGUNDA borda e cantos '
            'de outro raio por dentro dela.',
      );
      expect(
        find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.label == 'A foto escolhida',
        ),
        findsNothing,
        reason:
            'REPROVA: sem involucro próprio a peça continuou rotulando. Quem '
            'põe a moldura é quem rotula, e dois nós sobre a mesma imagem são '
            'duas paradas de foco para uma coisa só.',
      );
    });

    testWidgets('`pontoFocal` passado chega na imagem', (tester) async {
      // O contrapeso do primeiro caso: sem ele, `pontoFocal` poderia estar
      // sendo ignorado e o padrão pareceria correto.
      await _montar(tester, pontoFocal: const Alignment(0, -1 / 3));

      expect(
        tester.widget<Image>(find.byType(Image)).alignment,
        const Alignment(0, -1 / 3),
        reason: 'REPROVA: `pontoFocal` não chegou na imagem.',
      );
    });
  });
}
