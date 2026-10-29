// O recorte e o reposicionamento da imagem: a GEOMETRIA e a FOLHA.
//
// ===========================================================================
// O PEDIDO, E O DEFEITO QUE ELE DESCREVE
// ===========================================================================
// Cliente, 29/10/2026, literal: *"precisamos implementar em todo sistema que
// tem upload de imagem ou foto, o recurso pro usuario fazer o crop e ajustar a
// posicao da imagem"*. E a origem, de 28/10: *"voce esta cropando no lugar
// errado"*.
//
// O recorte errado tinha endereco no codigo: `PreviaDaFoto.pontoFocal`, um
// `Alignment` FIXO -- `center` em oito telas e `Alignment(0, -1 / 3)` na edicao
// do pet, com a justificativa escrita de que a cabeca do animal fica no terco
// superior *"na foto tipica de tutor"*. Isso e um palpite sobre a foto de
// outra pessoa.
//
// ===========================================================================
// A ISCA CENTRAL, E POR QUE ELA TEM UM CONTROLE
// ===========================================================================
// "A posicao escolhida e a que sai no envio" e facil de medir mal: um caso que
// so conferisse que SAIU um retangulo passaria verde numa implementacao que
// ignorasse o arraste e devolvesse o centro -- que e EXATAMENTE o defeito
// relatado. Entao todo caso de posicao aqui compara o recorte escolhido com
// `EnquadramentoDaFoto.recorteDoCentro`, que e o recorte automatico de ANTES
// deste recurso, calculado pelo mesmo codigo sobre o mesmo arquivo.
//
// `recorteDoCentro` nao e usado em producao e esta no codigo so por isso: ele
// e o controle. Sem ele a afirmacao seria "saiu um retangulo"; com ele e
// "saiu um retangulo DIFERENTE do que saia antes, e na direcao que a pessoa
// arrastou".
//
// ===========================================================================
// COMO PROVAR QUE ESTE ARQUIVO REPROVA
// ===========================================================================
// Cada caso diz, no corpo, qual linha desligar. O grupo da FOLHA tem a prova
// mais forte: desligue a chamada de `ajustarAFoto` em qualquer uma das sete
// telas e o arquivo `test/telas/recorte_em_todo_upload_test.dart` reprova
// nominalmente naquele ponto de upload -- medido em 29/10/2026, revertendo as
// sete telas para `origin/development` e deixando a peca de pe.

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/recorte_de_imagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

import '../telas/ajuda_de_tela.dart';

/// Um retrato 1200 x 1600, como foto de celular.
///
/// **O retrato nao e detalhe:** o caso que importa e o de uma foto alta indo
/// para um destino quadrado ou para uma faixa 16:9, que e quando o recorte
/// automatico joga fora o topo e a base e fica com a barriga da foto.
EnquadramentoDaFoto retratoEm(Size janela) => EnquadramentoDaFoto(
      larguraDoArquivo: 1200,
      alturaDoArquivo: 1600,
      janela: janela,
    );

/// Bytes de uma imagem **DE VERDADE**, que decodifica.
///
/// `bytesDeFotoDeTeste` (em `ajuda_de_tela.dart`) e texto, de proposito: o que
/// os casos de ENVIO medem e se aqueles bytes chegaram ao armazenamento, e um
/// PNG valido so tornaria a busca mais dificil. Mas a folha de recorte
/// **decodifica** o arquivo, e com bytes que nao decodificam ela nao abre --
/// que e o caminho documentado de "vai como esta". Entao o recorte precisa dos
/// seus proprios bytes, e eles sao uma imagem.
///
/// O conteudo e uma faixa clara em cima e escura embaixo, para o caso poder
/// afirmar qual METADE sobrou no recorte, e nao so que um retangulo saiu.
Uint8List pngDeTeste({int largura = 1200, int altura = 1600}) {
  final imagem = img.Image(width: largura, height: altura);
  for (var y = 0; y < altura; y++) {
    final claro = y < altura / 2;
    for (var x = 0; x < largura; x++) {
      imagem.setPixelRgb(
        x,
        y,
        claro ? 240 : 20,
        claro ? 240 : 20,
        claro ? 240 : 20,
      );
    }
  }
  return Uint8List.fromList(img.encodePng(imagem));
}

void main() {
  // =========================================================================
  group('A GEOMETRIA: a posicao escolhida e um retangulo, e nao o centro', () {
    test(
        'CONTROLE POSITIVO — sem ajuste nenhum, o recorte E o automatico de '
        'antes', () {
      // Este caso e o que impede os de baixo de serem vacuos. Se o recorte
      // escolhido NUNCA coincidisse com o do centro, "diferente do centro"
      // seria verdade por acidente e nao por causa do arraste.
      final e = retratoEm(const Size(300, 300));
      expect(e.recorte, e.recorteDoCentro);
      expect(
        e.recorte,
        const RecorteDaFoto(x: 0, y: 200, largura: 1200, altura: 1200),
        reason: 'um 1:1 centrado num retrato 1200x1600 comeca em y=200',
      );
    });

    test(
        'ISCA — arrastar a imagem para CIMA move o recorte para BAIXO no '
        'arquivo', () {
      // ISCA: em `EnquadramentoDaFoto.recorte`
      // (`app/lib/widgets/recorte_de_imagem.dart`), apague os dois
      // `deslocamento.dx`/`deslocamento.dy` da conta. Isso restaura o recorte
      // automatico, o arquivo compila, a folha continua desenhando e
      // arrastando -- e este caso reprova pelo nome, porque o retangulo volta
      // a ser o do centro.
      final parado = retratoEm(const Size(300, 300));
      // Arrastar a imagem para cima: o dedo sobe, e quem sobe e a IMAGEM,
      // entao o que aparece na janela e a parte de BAIXO da foto.
      final arrastado = parado.arrastado(const Offset(0, -40));

      expect(
        arrastado.recorte,
        isNot(parado.recorteDoCentro),
        reason: 'arrastar e escolher; o centro e nao escolher',
      );
      expect(
        arrastado.recorte.y,
        greaterThan(parado.recorteDoCentro.y),
        reason: 'a imagem subiu, entao a janela passou a ver mais abaixo',
      );
      // E o tamanho NAO muda com o arraste: arrastar reposiciona, nao recorta
      // mais nem menos.
      expect(arrastado.recorte.largura, parado.recorte.largura);
      expect(arrastado.recorte.altura, parado.recorte.altura);
    });

    test('ISCA — arrastar para a ESQUERDA move o recorte para a DIREITA', () {
      // Com a janela 1:1 sobre um retrato, zoom 1 ja usa a largura inteira do
      // arquivo: nao ha para onde arrastar na horizontal, e o grudar tem de
      // dizer isso. Entao o caso horizontal precisa de ZOOM.
      final comZoom = retratoEm(const Size(300, 300)).comZoom(2);
      final paraEsquerda = comZoom.arrastado(const Offset(-60, 0));

      expect(
        paraEsquerda.recorte.x,
        greaterThan(comZoom.recorte.x),
        reason: 'a imagem foi para a esquerda, a janela ve mais a direita',
      );
    });

    test('o zoom encolhe o retangulo, que e o que recortar MAIS significa', () {
      final um = retratoEm(const Size(300, 300));
      final dois = um.comZoom(2);
      expect(dois.recorte.largura, (um.recorte.largura / 2).round());
      expect(dois.recorte.altura, (um.recorte.altura / 2).round());
      // E o zoom nao estica o retangulo para fora do arquivo.
      expect(dois.recorte.x + dois.recorte.largura, lessThanOrEqualTo(1200));
      expect(dois.recorte.y + dois.recorte.altura, lessThanOrEqualTo(1600));
    });

    test(
        'ISCA — o recorte NUNCA sai do arquivo, para arraste e zoom nenhum',
        () {
      // ISCA: em `EnquadramentoDaFoto.recorte`, apague o
      // `.grudadoEm(larguraDoArquivo, alturaDoArquivo)` do fim. O arquivo
      // compila e a folha funciona na mao, porque `grudado` ja segura o
      // arraste -- mas este caso reprova, porque ele varre tambem os
      // arredondamentos e os zooms que `grudado` nao cobre.
      //
      // Um recorte fora do arquivo nao estoura: ele produz FAIXA VAZIA na foto
      // enviada, que e o tipo de defeito que ninguem liga a causa.
      final janelas = <Size>[
        const Size(300, 300),
        const Size(300, 169),
        const Size(300, 330),
        const Size(331, 300),
      ];
      var conferidos = 0;
      for (final janela in janelas) {
        for (final zoom in <double>[1, 1.37, 2, 3.9, 4, 9]) {
          for (final dx in <double>[-9999, -73, 0, 73, 9999]) {
            for (final dy in <double>[-9999, -73, 0, 73, 9999]) {
              final r = retratoEm(janela)
                  .comZoom(zoom)
                  .arrastado(Offset(dx, dy))
                  .recorte;
              conferidos += 1;
              expect(r.x, greaterThanOrEqualTo(0), reason: '$janela $zoom');
              expect(r.y, greaterThanOrEqualTo(0), reason: '$janela $zoom');
              expect(r.largura, greaterThan(0), reason: '$janela $zoom');
              expect(r.altura, greaterThan(0), reason: '$janela $zoom');
              expect(r.x + r.largura, lessThanOrEqualTo(1200));
              expect(r.y + r.altura, lessThanOrEqualTo(1600));
            }
          }
        }
      }
      // A contagem vai junto do veredito: um filtro que nao casa nada devolve
      // zero de tudo e sai verde.
      expect(conferidos, 4 * 6 * 5 * 5);
    });

    test('o zoom nunca fica abaixo de 1, que e a imagem cobrindo a janela', () {
      final e = retratoEm(const Size(300, 300));
      expect(e.comZoom(0.1).zoom, 1);
      expect(e.comZoom(-5).zoom, 1);
      expect(e.comZoom(99).zoom, EnquadramentoDaFoto.zoomMaximo);
    });

    test('reiniciar volta ao enquadramento de abertura, e nao a um proximo',
        () {
      final partida = retratoEm(const Size(300, 300));
      final mexido = partida.comZoom(3).arrastado(const Offset(-200, 120));
      expect(mexido.reiniciado.zoom, 1);
      expect(mexido.reiniciado.deslocamento, Offset.zero);
      expect(mexido.reiniciado.recorte, partida.recorte);
    });

    test(
        'a janela no aspecto do PROPRIO arquivo, em zoom 1, nao recorta nada',
        () {
      // E o caso da foto na conversa: `FormatoDoRecorte.doProprioArquivo`.
      // Aqui o recorte tem de ser o arquivo todo, para que
      // `CameraEGaleria.recortarFoto` devolva a MESMA foto sem recodificar.
      final e = EnquadramentoDaFoto(
        larguraDoArquivo: 1200,
        alturaDoArquivo: 1600,
        janela: const Size(300, 400),
      );
      expect(e.recorte.cobreTudo(1200, 1600), isTrue);
      expect(e.recorte, const RecorteDaFoto.oArquivoInteiro(
        largura: 1200,
        altura: 1600,
      ));
    });

    test('trocar a janela PRESERVA o zoom e o arraste da pessoa', () {
      // Rotacao de tela e teclado abrindo trocam a largura disponivel.
      // Reiniciar ali jogaria fora o enquadramento por causa de um evento do
      // sistema.
      final antes =
          retratoEm(const Size(300, 300)).comZoom(2).arrastado(const Offset(0, -30));
      final depois = antes.copiaCom(janela: const Size(260, 260)).grudado;
      expect(depois.zoom, 2);
      expect(depois.deslocamento.dy, lessThan(0));
    });
  });

  // =========================================================================
  group('RecorteDaFoto: grudar e cobrir', () {
    test('grudadoEm traz a borda de baixo de volta para dentro', () {
      const fora = RecorteDaFoto(x: 0, y: 1500, largura: 1200, altura: 1200);
      final dentro = fora.grudadoEm(1200, 1600);
      expect(dentro.y, 400);
      expect(dentro.y + dentro.altura, 1600);
    });

    test('grudadoEm encolhe o retangulo maior que o arquivo', () {
      const gigante = RecorteDaFoto(x: 0, y: 0, largura: 9000, altura: 9000);
      final dentro = gigante.grudadoEm(1200, 1600);
      expect(dentro.largura, 1200);
      expect(dentro.altura, 1600);
    });

    test('cobreTudo e falso para qualquer recorte que corte algo', () {
      expect(
        const RecorteDaFoto.oArquivoInteiro(largura: 10, altura: 20)
            .cobreTudo(10, 20),
        isTrue,
      );
      expect(
        const RecorteDaFoto(x: 1, y: 0, largura: 9, altura: 20).cobreTudo(10, 20),
        isFalse,
      );
      expect(
        const RecorteDaFoto(x: 0, y: 0, largura: 10, altura: 19).cobreTudo(10, 20),
        isFalse,
      );
    });
  });

  // =========================================================================
  group('A FOLHA: o que a pessoa enquadrou e o que o botao devolve', () {
    testWidgets(
        'ISCA — `Usar esta imagem` devolve o retangulo ARRASTADO, e nao o do '
        'centro', (tester) async {
      // ISCA: em `FolhaDeRecorte`, troque o
      // `Navigator.of(context).pop(_enquadramento!.recorte)` por
      // `pop(_enquadramento!.recorteDoCentro)`. Compila, a folha desenha
      // igual, o arraste continua funcionando na tela -- e este caso reprova
      // pelo nome, porque o que atravessa o `pop` voltou a ser o centro.
      final folha = await abrirAFolha(tester, formato: FormatoDoRecorte.quadrado);
      expect(find.byType(FolhaDeRecorte), findsOneWidget);

      // Arrasta a IMAGEM para cima, dentro do palco.
      await tester.drag(oPalco, const Offset(0, -40));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(BotaoPrimario, 'Usar esta imagem'));
      await tester.pumpAndSettle();

      expect(folha.devolvido, isNotNull, reason: 'a folha devolve o recorte');
      expect(
        folha.devolvido!.y,
        greaterThan(oCentroPara(folha.devolvido!).y),
        reason: 'arrastar a imagem para cima tem de DESCER o recorte',
      );
      // E o controle do controle: sem arraste o recorte E o do centro, medido
      // no grupo da geometria. Os dois juntos e que fecham a afirmacao.
      expect(folha.devolvido!.largura, folha.devolvido!.altura,
          reason: 'a janela era 1:1, entao o recorte tambem e');
    });

    testWidgets('`Cancelar` devolve NULO, o mesmo nulo de nao escolher foto',
        (tester) async {
      final folha = await abrirAFolha(tester, formato: FormatoDoRecorte.quadrado);
      await tester.tap(find.widgetWithText(BotaoSecundario, 'Cancelar'));
      await tester.pumpAndSettle();
      expect(folha.fechou, isTrue, reason: 'a folha tem de ter fechado');
      expect(folha.devolvido, isNull);
    });

    testWidgets(
        'ISCA — o TECLADO move o enquadramento: arraste nao e o unico caminho',
        (tester) async {
      // WCAG 2.1 SC 2.1.1: toda funcao operavel por ponteiro tem de ter
      // caminho de teclado. Arrastar com o dedo nao e um caminho que todo
      // mundo tem.
      //
      // ISCA: em `_EstadoDaFolhaDeRecorte._teclado`, devolva
      // `KeyEventResult.ignored` antes do `switch` das setas. A folha
      // continua inteira ao toque e este caso reprova pelo nome.
      final folha = await abrirAFolha(tester, formato: FormatoDoRecorte.quadrado);
      for (var i = 0; i < 8; i++) {
        await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
        await tester.pump();
      }
      await tester.tap(find.widgetWithText(BotaoPrimario, 'Usar esta imagem'));
      await tester.pumpAndSettle();

      expect(
        folha.devolvido!.y,
        greaterThan(oCentroPara(folha.devolvido!).y),
        reason: 'as setas tem de mover o enquadramento como o dedo move',
      );
    });

    testWidgets('o ZOOM encolhe o recorte pelo controle, e nao so pela pinca',
        (tester) async {
      final folha = await abrirAFolha(tester, formato: FormatoDoRecorte.quadrado);
      final semZoom = EnquadramentoDaFoto(
        larguraDoArquivo: 1200,
        alturaDoArquivo: 1600,
        janela: const Size(300, 300),
      ).recorte;

      final controle = tester.widget<Slider>(find.byType(Slider));
      controle.onChanged!(2);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(BotaoPrimario, 'Usar esta imagem'));
      await tester.pumpAndSettle();

      expect(
        folha.devolvido!.largura,
        lessThan(semZoom.largura),
        reason: 'aproximar e recortar MAIS do arquivo',
      );
    });

    testWidgets(
        'ISCA — a folha NAO abre quando o arquivo nao decodifica, e a foto vai '
        'como esta', (tester) async {
      // O caminho real: formato sem decodificador nesta versao do sistema
      // (HEIC em Android antigo). Prender a pessoa numa folha vazia seria pior
      // que deixar a foto ir com o enquadramento de antes.
      //
      // E e esta linha que mantem verdes os casos de envio que JA EXISTIAM:
      // `bytesDeFotoDeTeste` e texto, nao imagem, e e ele que aqueles casos
      // procuram dentro do corpo que saiu.
      //
      // ISCA: em `ajustarAFoto`, troque o `return foto` do ramo
      // `imagem == null` por `return null`. Compila, nenhuma tela muda -- e
      // este caso reprova, junto com quase todo caso de envio deste
      // repositorio, porque a foto passaria a ser descartada.
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: fotoEscolhidaDeTeste,
      );
      FotoLocal? resultado;
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: Scaffold(
            body: Builder(
              builder: (contexto) => TextButton(
                onPressed: () async {
                  resultado = await ajustarAFoto(
                    contexto,
                    camera: camera,
                    foto: fotoEscolhidaDeTeste,
                    formato: FormatoDoRecorte.quadrado,
                  );
                },
                child: const Text('abrir'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('abrir'));
      await tester.pumpAndSettle();

      expect(find.byType(FolhaDeRecorte), findsNothing);
      expect(resultado, same(fotoEscolhidaDeTeste));
      expect(
        camera.vezesQueRecortou,
        0,
        reason: 'sem folha nao ha recorte a pedir',
      );
    });
  });

  // =========================================================================
  group('FormatoDoRecorte: cada forma e a do destino, e nao um palpite', () {
    test('os aspectos medidos', () {
      expect(FormatoDoRecorte.quadrado.aspecto, 1);
      expect(FormatoDoRecorte.circulo.aspecto, 1);
      expect(FormatoDoRecorte.circulo.circular, isTrue);
      // `proporcaoDaCapa` de `telas/rede/pecas_da_rede.dart`.
      expect(FormatoDoRecorte.capaDoEncontro.aspecto, 16 / 9);
      // `BichuMoldura.proporcao` e ALTURA por largura (1,1), entao o aspecto
      // da janela e o inverso -- a janela do pet e mais alta que larga.
      expect(FormatoDoRecorte.molduraDoPet.aspecto, closeTo(1 / 1.1, 1e-9));
      expect(FormatoDoRecorte.molduraDoPet.aspecto! < 1, isTrue);
      // A forma que segue o arquivo nao declara aspecto nenhum.
      expect(const FormatoDoRecorte.doProprioArquivo().aspecto, isNull);
    });
  });
}

/// O palco da folha: o `CustomPaint` que desenha a imagem e a janela.
///
/// Arrastar nele e o que a pessoa faz. Arrastar na folha inteira pegaria o
/// `Slider` ou um botao.
final Finder oPalco = find.descendant(
  of: find.byType(FolhaDeRecorte),
  matching: find.byType(CustomPaint),
);

/// O recorte do CENTRO para uma janela com a forma de [recorte].
///
/// O CONTROLE de todo caso de posicao: e o recorte automatico de antes deste
/// recurso, calculado pelo mesmo codigo sobre o mesmo arquivo. Sem ele, "saiu
/// um retangulo" passaria verde numa implementacao que ignorasse o arraste.
RecorteDaFoto oCentroPara(RecorteDaFoto recorte) => EnquadramentoDaFoto(
      larguraDoArquivo: 1200,
      alturaDoArquivo: 1600,
      janela: Size(recorte.largura.toDouble(), recorte.altura.toDouble()),
    ).recorteDoCentro;

/// O que a folha devolveu, e se ela chegou a fechar.
class ResultadoDaFolha {
  RecorteDaFoto? devolvido;
  bool fechou = false;
}

/// Abre [FolhaDeRecorte] numa arvore minima, pelo MESMO caminho da producao.
///
/// A imagem e decodificada em [WidgetTester.runAsync] porque
/// [abrirAImagemParaRecortar] faz trabalho assincrono de verdade -- o
/// decodificador do motor nao roda no relogio falso do teste.
Future<ResultadoDaFolha> abrirAFolha(
  WidgetTester tester, {
  required FormatoDoRecorte formato,
}) async {
  final camera = CameraDeTeste(
    EstadoDaPermissao.concedida,
    foto: fotoEscolhidaDeTeste,
    bytes: pngDeTeste(),
  );
  final imagem = await tester.runAsync(
    () => abrirAImagemParaRecortar(camera, fotoEscolhidaDeTeste),
  );
  // Nulo aqui seria o caso medindo a si mesmo: `pngDeTeste` E uma imagem.
  expect(imagem, isNotNull, reason: 'pngDeTeste tem de decodificar');

  final resultado = ResultadoDaFolha();
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: Builder(
          builder: (contexto) => TextButton(
            onPressed: () async {
              resultado.devolvido = await showModalBottomSheet<RecorteDaFoto>(
                context: contexto,
                isScrollControlled: true,
                builder: (_) => FolhaDeRecorte(
                  imagem: imagem!,
                  formato: formato,
                  titulo: 'Ajuste',
                ),
              );
              resultado.fechou = true;
            },
            child: const Text('abrir'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
  return resultado;
}
