// O VISUALIZADOR DE IMAGEM, MEDIDO NO PROPRIO WIDGET.
//
// `app/lib/widgets/visualizador_de_imagem.dart` tem **tres** consumidores
// previstos e e por isso que esta rede de protecao mora aqui, e nao na tela de
// nenhum deles:
//
// 1. a **capa do encontro da Rede** (`telas/rede/encontro_da_rede.dart`,
//    `feat/foto-do-evento-ampliada`, 20/10/2026) -- foi quem o criou;
// 2. a **foto principal do profissional** (`telas/perto/pagina_do_local.dart`,
//    22/10/2026) -- foi quem pediu o carrossel;
// 3. a **vitrine de fotos do perfil** (`telas/perfil/vitrine_de_fotos.dart`),
//    que hoje abre UMA foto por celula e foi pedida em 22/10/2026 com
//    navegacao: *"as fotos tem que ser clicaveis para expandir/aumentar, e ter
//    o botao para andar para um lado e para a outra foto"*.
//
// **Uma isca que vivesse na tela do profissional nao protegeria a vitrine.**
// Quem for ligar a vitrine ao visualizador precisa de um arquivo que reprove
// quando a NAVEGACAO quebrar, sem depender de uma tela que nao e dela -- e e
// este.
//
// ## O QUE ESTE ARQUIVO NAO AFIRMA
//
// **Nada aqui foi visto em aparelho, e nenhum caso olha pixel.** Teste de
// widget nao baixa imagem: o `flutter_test` troca o cliente HTTP por um que
// responde 400 a tudo, entao toda `Image.network` desta arvore cai no
// `errorBuilder`. Isso nao e limitacao -- e o que faz o caso do estado de
// falha ser real em vez de simulado. O resto e medido na ARVORE: quantas
// paginas existem, qual URL cada uma pediu, e o que o contador diz.

import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/visualizador_de_imagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const String foto1 = 'https://midia.bichu.app/showcase-photo/card/111.jpeg';
const String foto2 = 'https://midia.bichu.app/showcase-photo/card/222.jpeg';
const String foto3 = 'https://midia.bichu.app/showcase-photo/card/333.jpeg';

/// Uma tela com um botao que abre o visualizador, que e a forma como as tres
/// superficies o usam: `Navigator.push` a partir de um toque.
///
/// **Com rota empilhada, e nao com o visualizador na raiz**: o `Fechar` dele e
/// `maybePop`, e na raiz ele nao teria para onde voltar -- o caso das saidas
/// passaria sem medir saida nenhuma.
Future<void> abrirO(
  WidgetTester tester, {
  required List<String> urls,
  int inicial = 0,
  String? textoAlternativo,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      // `BichuTheme.claro` e obrigatorio, e nao enfeite: `BichuColors.of`
      // REPROVA fora dele (*"toda tela do Bichu precisa estar sob
      // BichuTheme"*), e o visualizador pinta o fundo com `scrim` e as tarjas
      // com `surface`. Um `MaterialApp` pelado derruba os casos deste arquivo
      // por motivo de ambiente, e nao por defeito do widget.
      theme: BichuTheme.claro,
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => VisualizadorDeImagem.abrirVarias(
                context,
                urls: urls,
                inicial: inicial,
                textoAlternativo: textoAlternativo,
              ),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
}

/// As URLs que as `Image` montadas de fato pediram, **desembrulhando o
/// `ResizeImage`** quando houver.
///
/// O visualizador NAO passa `cacheWidth` de proposito -- ampliar o que foi
/// decodificado no tamanho da tela amplia o borrao --, entao aqui o provedor e
/// um `NetworkImage` cru. A funcao aceita os dois para que, se alguem
/// acrescentar `cacheWidth`, o caso de ampliacao reprove pela razao certa em
/// vez de estourar num `cast`.
List<String> urlsPedidas(WidgetTester tester) {
  final urls = <String>[];
  for (final e in find.byType(Image).evaluate()) {
    final p = (e.widget as Image).image;
    if (p is NetworkImage) urls.add(p.url);
    if (p is ResizeImage) {
      final interno = p.imageProvider;
      if (interno is NetworkImage) urls.add(interno.url);
    }
  }
  return urls;
}

/// A foto DESENHADA dentro do visualizador, e so a dela.
///
/// Escopado em `VisualizadorDeImagem` de proposito: nas telas que o empilham a
/// rota de baixo continua montada, e um `find.byType(Image)` solto acharia
/// tambem a imagem da ficha -- que nao se move e aprovaria o caso no lugar
/// errado.
Finder fotoDoVisualizador() => find
    .descendant(
      of: find.byType(VisualizadorDeImagem),
      matching: find.byType(Image),
    )
    .first;

void main() {
  // -------------------------------------------------------------------------
  group('UMA foto: amplia, e NAO e carrossel', () {
    testWidgets('nenhum `PageView`, nenhuma seta e nenhum contador', (
      tester,
    ) async {
      await abrirO(tester, urls: const <String>[foto1]);

      // ANCORA: o visualizador abriu. Sem ela os `findsNothing` abaixo
      // passariam por nao haver tela.
      expect(find.byType(VisualizadorDeImagem), findsOneWidget);
      expect(urlsPedidas(tester), <String>[foto1]);

      expect(
        find.byType(PageView),
        findsNothing,
        reason: 'REPROVA: uma foto virou carrossel. Carrossel de um elemento '
            'promete navegação e não tem para onde ir: a pessoa arrasta, nada '
            'acontece, e conclui que a tela travou. A regra é a de '
            '`widgets/carrossel_de_fotos.dart`, que a escreveu primeiro.',
      );
      expect(find.byTooltip(VisualizadorDeImagem.rotuloDeAnterior), findsNothing);
      expect(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima), findsNothing);
      expect(find.textContaining(' de '), findsNothing);
    });

    testWidgets('a ampliacao existe: `InteractiveViewer` com teto de 4x', (
      tester,
    ) async {
      await abrirO(tester, urls: const <String>[foto1]);
      final viewer = tester.widget<InteractiveViewer>(
        find.byType(InteractiveViewer),
      );
      expect(viewer.maxScale, VisualizadorDeImagem.ampliacaoMaxima);
      expect(viewer.minScale, 1);
    });

    testWidgets('a pessoa NAO fica presa: o `Fechar` volta', (tester) async {
      await abrirO(tester, urls: const <String>[foto1]);
      final fechar = find.byTooltip(VisualizadorDeImagem.rotuloDeFechar);
      expect(fechar, findsOneWidget);
      await tester.tap(fechar);
      await tester.pumpAndSettle();
      expect(
        find.byType(VisualizadorDeImagem),
        findsNothing,
        reason: 'REPROVA: o `Fechar` não fechou. Ele é a alternativa de '
            'ponteiro único que o SC 2.5.1 exige -- ampliar por pinça é gesto '
            'de caminho, e quem não pinça não pode ficar sem saída.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // A ISCA DO COMPONENTE, e ela e o motivo deste arquivo existir.
  //
  // DESLIGAR PARA VER REPROVAR: em
  // `lib/widgets/visualizador_de_imagem.dart`, faca `_ir` devolver antes de
  // animar (`void _ir(int para) { if (true) return; ... }`).
  //
  // **MEDIDO: reprovam TRES casos, e o resto do arquivo fica verde** (14
  // passando, 3 reprovando). Os tres sao `a seta avanca, e o contador
  // acompanha`, `a seta volta` e `ISCA — nas pontas a seta NAO responde` -- o
  // terceiro entra porque ele TOCA na seta para chegar na ultima foto antes de
  // conferir que ela desabilita, e sem navegacao ele nunca chega. Os outros 14
  // medem estrutura (quantas paginas existem, que URL cada uma pediu, as
  // saidas) e continuam passando, que e como se sabe que esta isca aponta para
  // a NAVEGACAO e nao para a montagem.
  //
  // A previsao original desta prosa era "dois casos", e a execucao disse tres.
  // O numero esta corrigido aqui porque uma isca cuja prosa erra a contagem
  // ensina a proxima pessoa a achar que uma das reprovas e ruido.
  //
  // DESLIGAR TAMBEM: trocar `if (urls.length == 1)` por `if (urls.isNotEmpty)`
  // derruba o grupo inteiro -- duas fotos passariam a desenhar so a primeira.
  group('MAIS DE UMA foto: carrossel ampliavel, com setas e contador', () {
    testWidgets('tres fotos: `PageView`, contador `1 de 3` e as duas setas', (
      tester,
    ) async {
      await abrirO(tester, urls: const <String>[foto1, foto2, foto3]);

      expect(
        find.byType(PageView),
        findsOneWidget,
        reason: 'REPROVA: mais de uma foto não virou carrossel.',
      );
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 0, total: 3)),
        findsOneWidget,
        reason: 'REPROVA: o carrossel não diz em qual foto a pessoa está. '
            'Contador ESCRITO, e não pontinhos: ponto aceso em oito fotos não '
            'diz qual.',
      );
      expect(find.byTooltip(VisualizadorDeImagem.rotuloDeAnterior), findsOneWidget);
      expect(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima), findsOneWidget);

      // CARREGA SOB DEMANDA: `PageView.builder` monta a pagina quando ela
      // entra em cena, e `Image.network` que nao foi montada **nao abre
      // requisicao**. Abrir a vitrine do perfil com nove fotos nao pode baixar
      // nove derivadas INTEIRAS (aqui nao ha `cacheWidth`, de proposito).
      expect(
        urlsPedidas(tester),
        <String>[foto1],
        reason: 'REPROVA: o carrossel pediu ${urlsPedidas(tester).length} '
            'imagens ao abrir. Com `PageView.builder` e '
            '`allowImplicitScrolling` no padrão só a página visível é '
            'montada; a vitrine do perfil tem até NOVE fotos, e estas páginas '
            'decodificam a derivada inteira.',
      );
    });

    testWidgets('a seta avanca, e o contador acompanha', (tester) async {
      await abrirO(tester, urls: const <String>[foto1, foto2, foto3]);

      await tester.tap(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima));
      await tester.pumpAndSettle();

      expect(
        find.text(VisualizadorDeImagem.contador(atual: 1, total: 3)),
        findsOneWidget,
        reason: 'REPROVA: a seta não paginou. Seta que não anda é promessa de '
            'destino -- e é exatamente o que a vitrine do perfil pediu: '
            '*"o botao para andar para um lado e para a outra foto"*.',
      );
      expect(
        urlsPedidas(tester),
        contains(foto2),
        reason: 'REPROVA: o contador mudou e a imagem não. Medir só o contador '
            'aprovaria um número que anda sozinho.',
      );
    });

    testWidgets('a seta volta', (tester) async {
      await abrirO(tester, urls: const <String>[foto1, foto2, foto3], inicial: 2);
      expect(find.text(VisualizadorDeImagem.contador(atual: 2, total: 3)),
          findsOneWidget);

      await tester.tap(find.byTooltip(VisualizadorDeImagem.rotuloDeAnterior));
      await tester.pumpAndSettle();

      expect(
        find.text(VisualizadorDeImagem.contador(atual: 1, total: 3)),
        findsOneWidget,
        reason: 'REPROVA: a seta de voltar não paginou.',
      );
    });

    testWidgets('o arrasto tambem pagina: a seta nao e o unico caminho', (
      tester,
    ) async {
      await abrirO(tester, urls: const <String>[foto1, foto2]);
      await tester.drag(find.byType(PageView), const Offset(-500, 0));
      await tester.pumpAndSettle();
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 1, total: 2)),
        findsOneWidget,
        reason: 'REPROVA: o arrasto horizontal não paginou. A seta é a '
            'ALTERNATIVA de ponteiro único; ela não substitui o gesto.',
      );
    });

    testWidgets('cada pagina amplia, e nao so a primeira', (tester) async {
      await abrirO(tester, urls: const <String>[foto1, foto2]);
      await tester.tap(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima));
      await tester.pumpAndSettle();
      expect(
        find.byType(InteractiveViewer),
        findsWidgets,
        reason: 'REPROVA: a segunda foto não é ampliável. O pedido é '
            '*"clicaveis para expandir/aumentar"* para TODAS, e um carrossel '
            'que só amplia a capa amplia a foto que a pessoa já viu grande.',
      );
    });

    testWidgets('ISCA — nas pontas a seta NAO responde', (tester) async {
      // Botao que nao faz nada e indistinguivel de botao que nao recebeu o
      // toque, e a pessoa toca de novo. `onPressed: null` e o que o leitor de
      // tela anuncia como desabilitado.
      await abrirO(tester, urls: const <String>[foto1, foto2]);

      final anterior = tester.widget<IconButton>(
        find.ancestor(
          of: find.byIcon(Icons.chevron_left),
          matching: find.byType(IconButton),
        ).first,
      );
      expect(
        anterior.onPressed,
        isNull,
        reason: 'REPROVA: na PRIMEIRA foto a seta de voltar está habilitada e '
            'não tem para onde ir.',
      );

      await tester.tap(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima));
      await tester.pumpAndSettle();

      final proxima = tester.widget<IconButton>(
        find.ancestor(
          of: find.byIcon(Icons.chevron_right),
          matching: find.byType(IconButton),
        ).first,
      );
      expect(
        proxima.onPressed,
        isNull,
        reason: 'REPROVA: na ÚLTIMA foto a seta de avançar está habilitada.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('o INDICE INICIAL: a tela abre na foto que a pessoa tocou', () {
    // Ele existe para a VITRINE, que e uma grade de ate nove celulas: tocar na
    // setima e abrir na primeira faria a pessoa paginar seis vezes para ver o
    // que ela acabou de tocar.
    //
    // DESLIGAR PARA VER REPROVAR: em `_CarrosselAmpliavel`, troque
    // `initialPage: widget.inicial` por `initialPage: 0`. O primeiro caso
    // deste grupo reprova.
    testWidgets('abre na terceira de tres', (tester) async {
      await abrirO(
        tester,
        urls: const <String>[foto1, foto2, foto3],
        inicial: 2,
      );
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 2, total: 3)),
        findsOneWidget,
        reason: 'REPROVA: o visualizador abriu numa foto diferente da pedida.',
      );
      expect(urlsPedidas(tester), <String>[foto3]);
    });

    testWidgets('ISCA — indice fora da faixa nao estoura, e cai na primeira', (
      tester,
    ) async {
      // Quem chama e uma grade que pode ter mudado de tamanho entre a pintura
      // e o toque. **Estourar aqui seria tela vermelha no gesto mais comum da
      // vitrine.**
      await abrirO(tester, urls: const <String>[foto1, foto2], inicial: 9);
      expect(tester.takeException(), isNull);
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 0, total: 2)),
        findsOneWidget,
        reason: 'REPROVA: índice fora da faixa não caiu na primeira foto.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('ISCA — sem imagem nenhuma, nenhuma rota e empilhada', () {
    // A guarda mora no visualizador, e nao em cada chamador, porque o defeito
    // que ela impede e o que o cliente nao pode ver: alvo de toque que abre
    // uma tela preta. **Quem desenha o alvo tambem confere** -- esta e o
    // cinto, nao o freio.
    //
    // DESLIGAR PARA VER REPROVAR: em `abrirVarias`, apague o
    // `if (limpas.isEmpty) return ...`. Os tres casos reprovam.
    testWidgets('lista vazia', (tester) async {
      await abrirO(tester, urls: const <String>[]);
      expect(find.byType(VisualizadorDeImagem), findsNothing);
    });

    testWidgets('lista com string vazia e com espacos', (tester) async {
      await abrirO(tester, urls: const <String>['', '   ']);
      expect(
        find.byType(VisualizadorDeImagem),
        findsNothing,
        reason: 'REPROVA: `Image.network("")` LANÇA. Uma URL em branco na '
            'lista derrubaria a tela ampliada inteira, e branco é o que chega '
            'de uma derivada ainda em processamento.',
      );
    });

    testWidgets('as brancas saem e as boas ficam: duas de tres', (
      tester,
    ) async {
      await abrirO(tester, urls: const <String>[foto1, '  ', foto2]);
      expect(find.byType(VisualizadorDeImagem), findsOneWidget);
      expect(
        tester
            .widget<VisualizadorDeImagem>(find.byType(VisualizadorDeImagem))
            .urls,
        <String>[foto1, foto2],
        reason: 'REPROVA: a URL em branco entrou na lista, ou arrastou as '
            'boas com ela. Uma derivada em processamento no meio da vitrine '
            'não pode apagar as outras oito.',
      );
      // E com duas validas ele é carrossel, nao ampliacao de uma: a contagem
      // que decide e a de DEPOIS da limpeza.
      expect(find.text(VisualizadorDeImagem.contador(atual: 0, total: 2)),
          findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  group('o texto alternativo', () {
    testWidgets('presente vira nome acessivel da imagem', (tester) async {
      await abrirO(
        tester,
        urls: const <String>[foto1],
        textoAlternativo: 'Fachada da clínica',
      );
      final imagem = tester.widget<Image>(find.byType(Image).first);
      expect(imagem.semanticLabel, 'Fachada da clínica');
      expect(imagem.excludeFromSemantics, isFalse);
    });

    testWidgets('ISCA — ausente TIRA a imagem da arvore, e nao inventa nome', (
      tester,
    ) async {
      // Imagem com nome acessivel vazio e imagem que o leitor de tela anuncia
      // sem dizer nada: uma parada de foco muda.
      await abrirO(tester, urls: const <String>[foto1]);
      final imagem = tester.widget<Image>(find.byType(Image).first);
      expect(imagem.semanticLabel, isNull);
      expect(
        imagem.excludeFromSemantics,
        isTrue,
        reason: 'REPROVA: imagem sem texto alternativo continua na árvore de '
            'acessibilidade, como parada de foco muda.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('a imagem que nao carrega', () {
    testWidgets('ISCA — cai no `errorBuilder` e a tela continua de pe', (
      tester,
    ) async {
      // No `flutter_test` TODA requisicao de imagem responde 400: a falha
      // deste caso e o comportamento padrao do ambiente, e nao um duble.
      //
      // DESLIGAR PARA VER REPROVAR: tire o `errorBuilder` de `_QuadroDaFoto`.
      // A excecao de carga sobe para o `FlutterError` e este caso reprova com
      // ela na saida.
      await abrirO(tester, urls: const <String>[foto1, foto2]);
      await tester.pumpAndSettle();

      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: a falha de carga subiu como exceção. Com '
            '`errorBuilder` no lugar, `Image` desenha o estado de falha em vez '
            'de reportar.',
      );
      // E o aviso tem PALAVRA, e nao e um retangulo cinza: quem tocou esta
      // olhando, e quadrado vazio nao diz se a tela errada abriu.
      expect(find.text('Não conseguimos carregar a foto.'), findsWidgets);
      // O `Fechar` e as setas continuam la: a saida nao depende da foto.
      expect(find.byTooltip(VisualizadorDeImagem.rotuloDeFechar), findsOneWidget);
      expect(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima), findsOneWidget);
    });
  });
  // -------------------------------------------------------------------------
  // A IMAGEM FICA FIXA (26/10/2026), e o arrasto NAO a leva embora.
  //
  // Pedido do cliente, literal: *"tem um bug quando amplia a foto dos eventos
  // e dos estabelecimentos, o usuario consegue arrastar a imagem para varias
  // posicoes, a imagem deve ficar fixa e so mudar de foto caso tenha mais do
  // que uma cadastrada."*
  //
  // O DEFEITO ERA `boundaryMargin: EdgeInsets.all(double.infinity)` com
  // `panEnabled` no padrao, que e `true`. `InteractiveViewer` **nao tem volta
  // elastica**: o comentario que estava no codigo dizia *"a imagem ampliada
  // pode ser arrastada para fora da moldura e volta sozinha"*, e essa frase
  // era falsa. Com moldura infinita, um arrasto de UM dedo na foto nem
  // ampliada estacionava a imagem onde a pessoa largou -- e ela ficava torta
  // ate alguem fechar a tela.
  //
  // POR QUE A MEDIDA E A POSICAO DESENHADA, e nao uma propriedade so:
  // `localToGlobal` atravessa o `Transform` que o `InteractiveViewer` aplica,
  // entao `getTopLeft` ANDA quando o enquadramento anda. E o sintoma que o
  // cliente viu com o dedo, e nao um nome de campo que pode mudar.
  //
  // DESLIGAR PARA VER REPROVAR: em `_ImagemAmpliavelState.build`, de
  // `lib/widgets/visualizador_de_imagem.dart`, tire a linha
  // `panEnabled: false` -- ou devolva `boundaryMargin` para
  // `EdgeInsets.all(double.infinity)`.
  group('A IMAGEM FICA FIXA: o arrasto nao a tira de lugar', () {
    testWidgets('UMA foto: o arrasto diagonal nao move a imagem', (
      tester,
    ) async {
      await abrirO(tester, urls: const <String>[foto1]);

      // ANCORA: ha UMA foto desenhada dentro do visualizador. Sem ela, um
      // `getTopLeft` que nao acha nada ESTOURA em vez de aprovar no vazio --
      // mas a ancora diz, na saida, que a tela certa estava aberta.
      final foto = fotoDoVisualizador();
      expect(foto, findsOneWidget);

      final antes = tester.getTopLeft(foto);
      await tester.drag(find.byType(InteractiveViewer), const Offset(-137, -151));
      await tester.pumpAndSettle();
      final depois = tester.getTopLeft(foto);

      expect(
        depois,
        antes,
        reason: 'REPROVA: a foto ampliada ANDOU com o arrasto -- saiu de '
            '$antes e parou em $depois. O cliente pediu o contrário em '
            '26/10/2026: *"o usuario consegue arrastar a imagem para varias '
            'posicoes, a imagem deve ficar fixa"*. `InteractiveViewer` não '
            'tem volta elástica: onde o dedo larga, ali ela fica.',
      );
    });

    // GUARDA, E NAO ISCA PROVADA -- dito com o nome para ninguem se enganar.
    //
    // **Este caso PASSA tambem na base defeituosa**, medido em 26/10/2026:
    // dentro do `PageView` nenhum arrasto que se conseguiu construir movia a
    // imagem, nem na vertical nem direto no `InteractiveViewer`. O
    // `Scrollable` do carrossel ganha a arena de gestos e o arrasto nunca
    // chega ao ampliador. Ou seja: **o defeito do cliente vive na arvore de
    // UMA foto**, que e justamente a que as tres telas produzem hoje.
    //
    // Ele fica porque e a barreira do dia em que uma galeria de verdade acender
    // o carrossel -- mas nao conta como prova de nada, e nenhum numero deste
    // arquivo deve ser lido como se contasse.
    testWidgets('GUARDA — no carrossel o arrasto vertical nao move a imagem', (
      tester,
    ) async {
      await abrirO(tester, urls: const <String>[foto1, foto2]);

      final foto = fotoDoVisualizador();
      expect(foto, findsOneWidget);

      final antes = tester.getTopLeft(foto);
      await tester.drag(find.byType(PageView), const Offset(0, -190));
      await tester.pumpAndSettle();

      expect(
        tester.getTopLeft(foto),
        antes,
        reason: 'REPROVA: dentro do carrossel a foto andou na vertical. A '
            'queixa do cliente é a mesma nas duas árvores, porque as duas '
            'passam pelo MESMO `_ImagemAmpliavel`.',
      );
      // E nao paginou: arrasto vertical nao e troca de foto.
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 0, total: 2)),
        findsOneWidget,
        reason: 'REPROVA: o arrasto VERTICAL trocou de foto.',
      );
    });

    testWidgets('o mecanismo esta no `InteractiveViewer`, e em TODOS eles', (
      tester,
    ) async {
      // A propriedade, DEPOIS do comportamento: ela diz POR QUE a imagem ficou
      // parada, e pega o caso em que alguem acerta uma arvore e esquece a
      // outra. `findsWidgets` nao bastaria -- aqui cada um e conferido.
      await abrirO(tester, urls: const <String>[foto1, foto2, foto3]);

      final visualizadores =
          tester.widgetList<InteractiveViewer>(find.byType(InteractiveViewer));
      expect(
        visualizadores,
        isNotEmpty,
        reason: 'REPROVA: não há `InteractiveViewer` na árvore -- a ampliação '
            'sumiu, e o caso abaixo aprovaria no vazio.',
      );
      for (final v in visualizadores) {
        expect(
          v.panEnabled,
          isFalse,
          reason: 'REPROVA: o arrasto de um dedo voltou a mover a imagem.',
        );
        expect(
          v.boundaryMargin,
          EdgeInsets.zero,
          reason: 'REPROVA: a moldura voltou a ser infinita. Com moldura '
              'infinita a imagem pode parar em qualquer lugar e não volta: '
              '`InteractiveViewer` não tem volta elástica.',
        );
      }
    });

    testWidgets('o toque duplo continua ampliando: fixa nao e imovel', (
      tester,
    ) async {
      // A imagem fica FIXA, e nao proibida de ampliar. O toque duplo e a
      // alternativa de ponteiro unico da pinca (SC 2.5.1) e e ele que leva a
      // pessoa ao canto que ela quer ver de perto -- continua sendo o caminho
      // depois do conserto, e sem este caso o conserto poderia ter matado a
      // ampliacao inteira sem ninguem notar.
      await abrirO(tester, urls: const <String>[foto1]);
      final foto = fotoDoVisualizador();
      // **`getSize` NAO serve aqui, e isso custou uma reprovacao falsa em
      // 26/10/2026**: ele devolve o tamanho de LAYOUT, que o `Transform` do
      // `InteractiveViewer` nao toca -- 800x600 antes e 800x600 depois de
      // ampliar 2,5x. A extensao PINTADA e a diferenca entre dois pontos
      // globais, e `localToGlobal` atravessa o `Transform`.
      final antes = tester.getBottomRight(foto) - tester.getTopLeft(foto);

      await tester.tap(find.byType(InteractiveViewer));
      // 50 ms: acima do `kDoubleTapMinTime` (40 ms) e bem abaixo do
      // `kDoubleTapTimeout` (300 ms), escrito em numero para o caso nao
      // depender de uma constante de gestos importada so por ele.
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.byType(InteractiveViewer));
      await tester.pumpAndSettle();

      final depois = tester.getBottomRight(foto) - tester.getTopLeft(foto);
      expect(
        depois.dx,
        greaterThan(antes.dx),
        reason: 'REPROVA: o toque duplo não amplia mais -- a foto pintava '
            '${antes.dx} de largura e continua pintando ${depois.dx}. Travar '
            'o arrasto não pode ter levado a ampliação junto: ela é o pedido '
            'de 20/10/2026, *"a foto principal deve ser clicada e '
            'ampliada"*, e depois do conserto o toque duplo é o ÚNICO jeito '
            'de reenquadrar.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // CONTROLE POSITIVO DA TROCA DE FOTO (26/10/2026).
  //
  // **Sem este caso o conserto do arrasto poderia ter matado a navegacao e
  // nenhuma asercao negativa acusaria.** Os casos acima provam que a imagem
  // NAO anda; este prova que a FOTO troca quando ha mais de uma -- que e a
  // segunda metade literal do pedido, *"so mudar de foto caso tenha mais do
  // que uma cadastrada"*.
  //
  // Ele mede os DOIS caminhos (seta e arrasto horizontal) e mede a URL
  // DESENHADA, e nao so o contador: um numero que anda sozinho aprovaria um
  // carrossel que nao troca de imagem.
  group('CONTROLE POSITIVO — com DUAS fotos a troca funciona', () {
    testWidgets('a seta troca a foto DESENHADA, e nao so o contador', (
      tester,
    ) async {
      await abrirO(tester, urls: const <String>[foto1, foto2]);
      expect(urlsPedidas(tester), <String>[foto1]);

      await tester.tap(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima));
      await tester.pumpAndSettle();

      expect(
        urlsPedidas(tester),
        contains(foto2),
        reason: 'CONTROLE POSITIVO REPROVOU: a seta não troca mais a foto. Se '
            'este caso reprova junto com os de imagem fixa, o conserto do '
            'arrasto levou a navegação embora.',
      );
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 1, total: 2)),
        findsOneWidget,
      );
    });

    testWidgets('o arrasto HORIZONTAL troca a foto desenhada', (tester) async {
      await abrirO(tester, urls: const <String>[foto1, foto2]);

      await tester.drag(find.byType(PageView), const Offset(-500, 0));
      await tester.pumpAndSettle();

      expect(
        urlsPedidas(tester),
        contains(foto2),
        reason: 'CONTROLE POSITIVO REPROVOU: o arrasto horizontal não pagina '
            'mais. Travar o arrasto da IMAGEM não pode ter travado o do '
            'carrossel -- o gesto do cliente é o mesmo dedo, e é a diferença '
            'entre "a imagem fica fixa" e "a tela travou".',
      );
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 1, total: 2)),
        findsOneWidget,
      );
    });
  });
}
