// O carrossel de fotos do cartao de listagem (17/10/2026).
//
// ## O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
//
// **Arrastar a foto abrindo a tela que o TOQUE abre.** O carrossel mora dentro
// do `InkWell` do cartao da vitrine, e ali dois gestos cobrem a mesma area: o
// arrasto horizontal do `PageView` e o toque do cartao. Se a arena de gestos
// resolver para o lado errado, cada tentativa de ver a segunda foto joga a
// pessoa para outra tela -- e ela nunca ve a galeria.
//
// E o erro classico deste desenho, e e o primeiro teste daqui.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bichu/api/modelos_loja.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/carrossel_de_fotos.dart';

/// `n` fotos com texto alternativo escrito.
List<ImagemDoProduto> fotos(int n, {bool comTexto = true}) {
  return List<ImagemDoProduto>.generate(
    n,
    (i) => ImagemDoProduto(
      url: 'https://img-hml.bichu.app/store/card/foto-$i.webp',
      textoAlternativo: comTexto ? 'Foto $i do produto' : null,
    ),
  );
}

/// O carrossel **dentro de um `InkWell`**, que e exatamente como o cartao da
/// vitrine o monta. Sem este embrulho o teste nao exercita a disputa de gestos,
/// que e o que importa aqui.
///
/// `aoTocarNoCartao` conta as vezes que o toque do cartao disparou.
Widget cartaoDeMentira({
  required List<ImagemDoProduto> galeria,
  required VoidCallback aoTocarNoCartao,
  String titulo = 'Bola Pop',
}) {
  return MaterialApp(
    theme: BichuTheme.claro,
    home: Scaffold(
      body: Center(
        child: SizedBox(
          width: 360,
          child: Material(
            child: InkWell(
              onTap: aoTocarNoCartao,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    CarrosselDeFotos(
                      fotos: galeria,
                      titulo: titulo,
                      altura: 160,
                    ),
                    const Text('Bola Pop'),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  group('arrastar NAO dispara o toque do cartao', () {
    testWidgets('o arrasto horizontal pagina a foto e o cartao NAO abre', (
      tester,
    ) async {
      var toques = 0;
      await tester.pumpWidget(
        cartaoDeMentira(galeria: fotos(4), aoTocarNoCartao: () => toques++),
      );

      expect(find.text('Foto 1 de 4'), findsNothing);

      // O arrasto comeca SOBRE o carrossel, que e onde a disputa existe.
      await tester.drag(find.byType(PageView), const Offset(-300, 0));
      await tester.pumpAndSettle();

      // **A afirmacao que este arquivo existe para fazer.**
      expect(
        toques,
        0,
        reason:
            'o arrasto sobre o carrossel disparou o onTap do cartao: o '
            'reconhecedor de toque do InkWell venceu a arena, e cada tentativa '
            'de ver a proxima foto vai abrir outra tela',
      );
    });

    testWidgets('o TOQUE sem arrasto continua abrindo o cartao', (tester) async {
      // A outra metade: o carrossel nao pode COMER o toque do cartao. Um
      // `PageView` que engolisse o toque deixaria o cartao inteiro morto, e o
      // teste de cima passaria por motivo errado.
      var toques = 0;
      await tester.pumpWidget(
        cartaoDeMentira(galeria: fotos(4), aoTocarNoCartao: () => toques++),
      );

      await tester.tap(find.byType(PageView));
      await tester.pumpAndSettle();

      expect(toques, 1);
    });

    testWidgets('tocar na seta avanca a foto e NAO abre o cartao', (
      tester,
    ) async {
      var toques = 0;
      await tester.pumpWidget(
        cartaoDeMentira(galeria: fotos(4), aoTocarNoCartao: () => toques++),
      );

      await tester.tap(find.byTooltip('Próxima foto'));
      await tester.pumpAndSettle();

      expect(
        toques,
        0,
        reason:
            'a seta e filha do cartao e precisa consumir o proprio toque, como '
            'o botao `Abrir na <parceiro>` ja faz',
      );
    });
  });

  group('com UMA foto nao e carrossel', () {
    testWidgets('sem PageView, sem indicador e sem setas', (tester) async {
      await tester.pumpWidget(
        cartaoDeMentira(galeria: fotos(1), aoTocarNoCartao: () {}),
      );

      expect(find.byType(PageView), findsNothing);
      expect(find.byTooltip('Próxima foto'), findsNothing);
      expect(find.byTooltip('Foto anterior'), findsNothing);
      // A foto continua desenhada: o que sai e o aparato de navegacao.
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('sem foto nenhuma o bloco nao ocupa espaco', (tester) async {
      await tester.pumpWidget(
        cartaoDeMentira(
          galeria: const <ImagemDoProduto>[],
          aoTocarNoCartao: () {},
        ),
      );

      expect(find.byType(PageView), findsNothing);
      expect(find.byType(Image), findsNothing);
    });
  });

  group('o indicador e curto', () {
    testWidgets('ate cinco fotos sao pontos, e nao contador', (tester) async {
      // A semantica e ligada ANTES de montar: ligada depois, a arvore ja foi
      // construida sem ela e a consulta nao acha rotulo nenhum -- o teste
      // reprovaria por vazio, e nao pelo que afirma.
      final semantica = tester.ensureSemantics();
      await tester.pumpWidget(
        cartaoDeMentira(galeria: fotos(5), aoTocarNoCartao: () {}),
      );

      expect(find.text('1 de 5'), findsNothing);
      // O no semantico diz o numero mesmo quando a tela mostra pontos.
      expect(find.bySemanticsLabel('Foto 1 de 5'), findsOneWidget);
      semantica.dispose();
    });

    testWidgets('acima de cinco vira "1 de 8"', (tester) async {
      await tester.pumpWidget(
        cartaoDeMentira(galeria: fotos(8), aoTocarNoCartao: () {}),
      );

      expect(find.text('1 de 8'), findsOneWidget);
    });
  });

  group('as setas nas pontas ficam visiveis e desabilitadas', () {
    testWidgets('na primeira foto o `anterior` nao aciona', (tester) async {
      await tester.pumpWidget(
        cartaoDeMentira(galeria: fotos(3), aoTocarNoCartao: () {}),
      );

      // Visivel, e nao escondida: controle que some muda a largura do bloco a
      // cada pagina e faz o indicador pular de lugar.
      // `byTooltip` acha o `RawTooltip`, e nao o botao: o alvo e procurado
      // pelo icone dele.
      final anterior = find.widgetWithIcon(IconButton, Icons.chevron_left);
      expect(find.byTooltip('Foto anterior'), findsOneWidget);
      expect(tester.widget<IconButton>(anterior).onPressed, isNull);
      expect(
        tester
            .widget<IconButton>(
              find.widgetWithIcon(IconButton, Icons.chevron_right),
            )
            .onPressed,
        isNotNull,
      );
    });
  });

  group('cada foto tem nome acessivel', () {
    testWidgets('o texto do painel quando ha', (tester) async {
      await tester.pumpWidget(
        cartaoDeMentira(galeria: fotos(3), aoTocarNoCartao: () {}),
      );

      expect(
        tester.widget<Image>(find.byType(Image)).semanticLabel,
        'Foto 0 do produto',
      );
    });

    testWidgets('a reserva com o NOME DO PRODUTO quando nao ha', (
      tester,
    ) async {
      // `StoreItemImage.alt_text` e anulavel. Imagem com nome vazio e imagem
      // que o leitor de tela anuncia sem dizer nada, que e pior que a reserva.
      await tester.pumpWidget(
        cartaoDeMentira(
          galeria: fotos(3, comTexto: false),
          aoTocarNoCartao: () {},
          titulo: 'Bola Pop',
        ),
      );

      expect(
        tester.widget<Image>(find.byType(Image)).semanticLabel,
        'Foto de Bola Pop',
      );
    });
  });

  group('carrega sob demanda', () {
    testWidgets('oito fotos nao montam oito `Image`', (tester) async {
      // O PESO, afirmado em teste e nao em comentario: `PageView.builder` so
      // constroi a pagina em cena. Um `Image.network` que nao foi montado nao
      // abre requisicao, e e isso que mantem a primeira pintura de uma pagina
      // cheia no peso de hoje (medido: ate 9,8 MB contra ate 78 MB).
      await tester.pumpWidget(
        cartaoDeMentira(galeria: fotos(8), aoTocarNoCartao: () {}),
      );

      expect(find.byType(Image), findsOneWidget);
    });
  });
}
