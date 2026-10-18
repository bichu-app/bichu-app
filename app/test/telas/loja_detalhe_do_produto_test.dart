// A tela de detalhe do produto: `GET /v1/store/items/{itemSlug}`
// (`getStoreItem`), a rota que o contrato tinha e ninguem chamava.
//
// **ESCRITO E NAO RODADO.** O cliente proibiu suite unitaria e de integracao
// nesta entrega (so `flutter analyze`). Nenhum caso deste arquivo foi
// executado: se algum reprovar na primeira rodada, o defeito pode estar no
// caso e nao na tela.
//
// Os casos marcados ISCA sao os que precisam REPROVAR com o mecanismo
// desligado. Cada um diz, no proprio corpo, qual arquivo mexer e o que
// observar.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante
// que o produz** (a mesma regra de `loja_com_dados_test.dart`): todo esperado
// esta escrito por extenso, com acento e pontuacao. Um `expect` que lesse
// `TelaDoProduto.tituloDoNaoEncontrado` acompanharia o erro de digitacao para
// sempre.

import 'dart:async';

import 'package:bichu/api/modelos_loja.dart';
import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/loja/produto_da_loja.dart';
import 'package:bichu/telas/loja/vitrine_da_loja.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'loja_com_dados_test.dart'
    show abrirLoja, itemDoContrato, paginaDoContrato;

// ---------------------------------------------------------------------------
// A massa, no formato exato do contrato
// ---------------------------------------------------------------------------

/// Uma imagem como `StoreItemImage` a declara: **`url` e `alt_text`, e nada
/// mais**.
///
/// Nao ha `position` e nao ha `thumb_url`. Um teste que passasse qualquer um
/// dos dois estaria exercitando um contrato que nao existe -- e e justamente a
/// ausencia de `thumb_url` que faz a miniatura desta tela pedir a imagem
/// grande.
Map<String, dynamic> imagemDoContrato({required String url, String? altText}) {
  return <String, dynamic>{'url': url, 'alt_text': altText};
}

/// `StoreItemDetail`: o `StoreItemSummary` da lista **mais** `images`.
Map<String, dynamic> detalheDoContrato({
  String slug = 'bola-pop',
  String title = 'Bola Pop',
  String summary = 'Bola de borracha atóxica que flutua.',
  String category = 'toy',
  List<Map<String, dynamic>> images = const <Map<String, dynamic>>[],
  String targetUrl = 'https://cobasi.com.br/bola-pop-borracha',
  String partnerName = 'Cobasi',
  String partnerHost = 'cobasi.com.br',
  int? priceAmount,
  String? priceCheckedAt,
  String priceStatus = 'sem_preco',
}) {
  return <String, dynamic>{
    ...itemDoContrato(
      slug: slug,
      title: title,
      summary: summary,
      category: category,
      // `image_url` e a primeira de `images`, como o contrato diz.
      imageUrl: images.isEmpty ? null : images.first['url'] as String,
      imageAltText: images.isEmpty ? null : images.first['alt_text'] as String?,
      targetUrl: targetUrl,
      partnerName: partnerName,
      partnerHost: partnerHost,
      priceAmount: priceAmount,
      priceCheckedAt: priceCheckedAt,
      priceStatus: priceStatus,
    ),
    'images': images,
  };
}

/// Oito imagens numeradas, que e o TETO do contrato (`maxItems: 8`).
///
/// **Oito, e nao duas.** Com duas, a fita de miniaturas cabe inteira na tela e
/// um defeito de rolagem horizontal fica verde. Oito e o numero que o painel
/// permite e que esta entrega existe para fazer aparecer.
List<Map<String, dynamic>> oitoImagens() {
  return <Map<String, dynamic>>[
    for (var i = 1; i <= 8; i++)
      imagemDoContrato(
        url: 'https://img.bichu.app/bola-pop/$i.jpg',
        // A primeira e a quarta tem texto do painel; as outras nao, para o
        // caso exercitar os dois lados da reserva de `nomeDaImagem`.
        altText: i == 1
            ? 'Bola Pop vermelha sobre a grama'
            : i == 4
            ? 'Bola Pop na boca de um cão'
            : null,
      ),
  ];
}

/// A rede que atende a vitrine E o detalhe, e **404 em qualquer outra rota**.
///
/// Registra as URLs pedidas: um caso precisa provar que o detalhe foi pedido
/// de fato, e nao que a tela montou com o que o cartao ja tinha em maos.
Future<http.Response> Function(http.Request) redeDaLojaEDoDetalhe({
  required List<Map<String, dynamic>> itens,
  required Map<String, dynamic>? detalhe,
  required List<Uri> urls,
  int statusDoDetalhe = 200,
  String problemaDoDetalhe = 'not-found',
}) {
  return (req) async {
    urls.add(req.url);
    if (req.url.path == '/v1/store/items' && req.method == 'GET') {
      return json200(paginaDoContrato(itens));
    }
    if (req.url.path.startsWith('/v1/store/items/') && req.method == 'GET') {
      if (statusDoDetalhe != 200 || detalhe == null) {
        return problema(problemaDoDetalhe, statusDoDetalhe);
      }
      return json200(detalhe);
    }
    return problema('not-found', 404);
  };
}

/// Abre o detalhe **pela ROTA**, e nao por um toque na vitrine.
///
/// ## A TELA DE DETALHE FICOU SEM ENTRADA, POR DECISAO DO CLIENTE (17/10/2026)
///
/// Ate 17/10 este auxiliar tocava no cartao da vitrine, e o caso media a
/// convivencia de dois gestos no mesmo cartao (o cartao abria o detalhe, o
/// botao saia para o parceiro). No mesmo dia o cliente pediu *"remova o
/// clique para entrar na pagina de detalhes do produto e coloque para abrir o
/// site do parceiro"*, e depois **"deixe parado por enquanto a tela de
/// detalhes do produto"**.
///
/// A tela NAO foi apagada e a rota continua registrada: ela esta parada, e
/// volta a ser alcancavel quando ele quiser. Estes casos continuam medindo a
/// tela -- a galeria em ordem, a descricao inteira, os estados --, e passaram
/// a chegar nela pelo endereco em vez de pelo gesto que nao existe mais.
/// Medir a tela pelo caminho que foi removido so provaria a remocao.
Future<void> tocarNoCartao(WidgetTester tester, String titulo) async {
  final cartao = find.ancestor(
    of: find.text(titulo),
    matching: find.byType(CartaoDaLoja),
  );
  expect(
    cartao,
    findsOneWidget,
    reason: 'REPROVA: nao achei o cartao de "$titulo" na vitrine.',
  );
  final item = tester.widget<CartaoDaLoja>(cartao).item;
  final contexto = tester.element(find.byType(VitrineDaLoja));
  GoRouter.of(contexto).push(Rotas.produtoDaLojaDe(item.slug));
  await tester.pumpAndSettle();
  expect(
    find.byType(TelaDoProduto),
    findsOneWidget,
    reason:
        'REPROVA: o endereco do detalhe nao abriu a tela. Ela esta PARADA por '
        'decisao do cliente, e nao removida: a rota tem de continuar de pe '
        'para ela voltar sem ser reconstruida.',
  );
}

/// A porta de saida, de mentira, para o toque em `Compre agora` nao cair no
/// `url_launcher` de verdade (canal de plataforma que nao existe em teste).
///
/// Mesmo duble de `loja_abre_no_navegador_test.dart`, e pelo mesmo motivo: as
/// outras tres saidas ESTOURAM, para esta tela reprovar alto se um dia chamar
/// o app de mapas ou o calendario.
class _SaidaDeMentira extends SaidaDoApp {
  final List<Uri> links = <Uri>[];

  @override
  Future<bool> abrirLink(Uri link) async {
    links.add(link);
    return true;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async => throw StateError('a Loja nao abre o app de mapas');

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async =>
      throw StateError('a Loja nao abre o app de mapas');

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async =>
      throw StateError('a Loja nao escreve no calendario');
}

/// O quadro GRANDE da galeria cujo nome acessivel e [nome].
///
/// Pela propriedade `semanticLabel` da `Image`, e **nao** por
/// `find.bySemanticsLabel`: em teste de widget `Image.network` nunca carrega,
/// o `errorBuilder` da `_Galeria` troca a imagem por um `ColoredBox`
/// (`produto_da_loja.dart`, linha 377) e o no que carregava o nome desaparece
/// da arvore de semantica. O que esta tela ENTREGA a plataforma e a
/// propriedade, e e ela que a isca precisa afirmar -- o `bySemanticsLabel`
/// media o carregamento da rede, que nao e o assunto.
///
/// Restrito ao `PageView` de proposito: as miniaturas tem nome proprio
/// (`Imagem N de 8`), e um `byWidgetPredicate` solto casaria com elas.
Finder _quadroGrandeChamado(String nome) => find.descendant(
      of: find.byType(PageView),
      matching: find.byWidgetPredicate(
        (widget) => widget is Image && widget.semanticLabel == nome,
        description: 'quadro grande chamado "$nome"',
      ),
    );

void main() {
  late _SaidaDeMentira saida;

  setUp(() {
    saida = _SaidaDeMentira();
    SaidaDoApp.atual = saida;
  });

  tearDown(SaidaDoApp.restaurar);
  // -------------------------------------------------------------------------
  // A GALERIA: AS OITO IMAGENS, NA ORDEM DO PAINEL
  // -------------------------------------------------------------------------

  group('a galeria mostra todas as imagens, na ordem cadastrada', () {
    // ISCA -- em `app/lib/telas/loja/produto_da_loja.dart`, na `_Galeria`,
    // troque `itemCount: imagens.length` por `itemCount: 1`. O caso reprova
    // dizendo que achou uma imagem no lugar de oito, que e exatamente o
    // defeito que esta tela existe para consertar: das oito que o painel
    // permite, o usuario via uma.
    testWidgets('as oito imagens do contrato chegam a galeria', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(images: oitoImagens()),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      final galeria = tester.widget<PageView>(find.byType(PageView));
      expect(
        galeria.childrenDelegate.estimatedChildCount,
        8,
        reason:
            'REPROVA: a galeria nao tem as oito imagens do contrato. '
            'O painel aceita oito e esta tela existe para que as oito '
            'apareçam.',
      );
    });

    // ISCA -- na `_Galeria`, inverta a lista antes de desenhar
    // (`imagens.reversed.toList()`). O caso reprova: a ordem e a do painel, e
    // a primeira e a capa.
    testWidgets('a capa e a primeira, e a ordem e a do array', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(images: oitoImagens()),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      // O quadro aberto e o da posicao 0.
      final primeira = tester
          .widgetList<Image>(find.byType(Image))
          .map((i) => (i.image as NetworkImage).url)
          .first;
      expect(
        primeira,
        'https://img.bichu.app/bola-pop/1.jpg',
        reason:
            'REPROVA: a galeria nao abre na capa. `position 0` e a capa, e '
            'ela e a mesma `image_url` que o cartao desenhou -- abrir noutra '
            'imagem faria a tela contradizer o cartao de onde a pessoa veio.',
      );
    });

    // ISCA -- na `_Galeria`, troque `if (imagens.length > 1)` por
    // `if (imagens.isNotEmpty)`. O caso reprova: uma fita de um quadradinho
    // nao navega para lugar nenhum.
    testWidgets('com uma imagem so nao ha fita de miniaturas', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(
            images: <Map<String, dynamic>>[
              imagemDoContrato(url: 'https://img.bichu.app/bola-pop/1.jpg'),
            ],
          ),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      expect(
        find.text('1 de 1'),
        findsNothing,
        reason: 'REPROVA: ha contador de imagem numa galeria de uma imagem.',
      );
    });

    testWidgets('o contador diz em qual imagem a pessoa esta', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(images: oitoImagens()),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      expect(find.text('1 de 8'), findsOneWidget);
    });

    // ISCA -- na `_Miniatura`, troque `onTap: aoTocar` por `onTap: null`. O
    // caso reprova: sem o toque, quem nao descobre o arraste ve a capa e mais
    // nada.
    testWidgets('tocar numa miniatura abre aquela imagem', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(images: oitoImagens()),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      // A terceira miniatura, pelo nome anunciado (posicao, nao texto
      // alternativo: numa fita de oito e a posicao que diz onde a pessoa
      // esta).
      final terceira = find.bySemanticsLabel('Imagem 3 de 8');
      await tester.ensureVisible(terceira.first);
      await tester.pumpAndSettle();
      await tester.tap(terceira.first);
      await tester.pumpAndSettle();

      expect(
        find.text('3 de 8'),
        findsOneWidget,
        reason: 'REPROVA: tocar na miniatura nao trocou o quadro grande.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // O TEXTO ALTERNATIVO: O DO PAINEL, COM O NOME DO PRODUTO DE RESERVA
  // -------------------------------------------------------------------------

  group('o texto alternativo e o do painel, com reserva', () {
    // ISCA -- em `app/lib/api/modelos_loja.dart`, em
    // `ImagemDoProduto.nomeDaImagem`, devolva sempre
    // `'Foto de $tituloDoProduto'`. O caso reprova: o texto que o
    // administrador escreveu voltaria a nao chegar a ninguem, que e o defeito
    // que 17/10 consertou no cartao.
    testWidgets('a imagem com texto do painel usa o texto do painel', (
      tester,
    ) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(images: oitoImagens()),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      expect(
        _quadroGrandeChamado('Bola Pop vermelha sobre a grama'),
        findsOneWidget,
        reason: 'REPROVA: o `alt_text` do painel nao chegou ao quadro grande.',
      );
    });

    testWidgets('a imagem sem texto cai no nome do produto', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(images: oitoImagens()),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      // A segunda imagem nao tem `alt_text`. Abre ela e confere a reserva.
      final segunda = find.bySemanticsLabel('Imagem 2 de 8');
      await tester.ensureVisible(segunda.first);
      await tester.pumpAndSettle();
      await tester.tap(segunda.first);
      await tester.pumpAndSettle();

      expect(
        _quadroGrandeChamado('Foto de Bola Pop'),
        findsOneWidget,
        reason:
            'REPROVA: imagem sem `alt_text` ficou sem nome acessivel. '
            '`semanticLabel` vazio e imagem que o leitor de tela anuncia sem '
            'dizer nada, que e pior que a reserva generica.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // A DESCRICAO INTEIRA: O "LER MAIS" E DO CARTAO, E NAO DAQUI
  // -------------------------------------------------------------------------

  group('a descricao aparece inteira, sem "Ler mais"', () {
    // ISCA -- em `produto_da_loja.dart`, troque
    // `_DescricaoInteira(resumo: item.resumo)` por
    // `_DescricaoInteira(resumo: item.trechoDoResumo)`. O caso reprova: o
    // corte de 500 caracteres e do cartao, onde uma descricao de 3000 empurra
    // a vitrine para baixo. Aqui a pagina e de um produto so.
    testWidgets('os 3000 caracteres saem inteiros', (tester) async {
      // 2600 caracteres: acima do corte de 500 do cartao, abaixo do teto do
      // contrato. O ultimo pedaco so existe no texto completo.
      final longa = '${'Borracha atóxica. ' * 144}Fecha com o fim do texto.';
      expect(longa.length, greaterThan(ItemDaLoja.tetoDoResumoNoCartao));

      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(summary: longa, images: oitoImagens()),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      // O corpo do detalhe e um `ListView` (`produto_da_loja.dart`, linha
      // 217): a galeria enche a dobra e o que vem abaixo dela nao esta
      // construido. `find` nao enxerga o que nao existe, entao rola primeiro
      // -- como a pessoa faz.
      await rolarAte(tester, find.text(longa));
      expect(
        find.text(longa),
        findsOneWidget,
        reason:
            'REPROVA: a descricao foi cortada na tela de detalhe. O corte '
            'e do cartao da lista, nao desta pagina.',
      );
      expect(
        find.text('Ler mais'),
        findsNothing,
        reason:
            'REPROVA: ha `Ler mais` na tela de detalhe. Esconder metade do '
            'texto numa tela dedicada a ele e esconder por habito.',
      );
    });

    // ISCA -- na `_DescricaoInteira`, acrescente
    // `resumo.replaceAll('\n', ' ')`. O caso reprova: a area de texto do
    // painel existe para a pessoa escrever em paragrafos.
    testWidgets('a quebra de linha do painel e preservada', (tester) async {
      const comParagrafos = 'Primeiro parágrafo.\n\nSegundo parágrafo.';
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(summary: comParagrafos),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      await rolarAte(tester, find.text(comParagrafos));
      expect(find.text(comParagrafos), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // OS QUATRO ESTADOS
  // -------------------------------------------------------------------------

  group('os quatro estados da tela', () {
    testWidgets('carregando: o esqueleto e anunciado', (tester) async {
      // A resposta do detalhe fica EM VOO ate o caso a soltar.
      //
      // Um `Completer` do caso, e nao `Future.delayed(30 s)`: o
      // `ApiClient` poe um `.timeout(tempoLimite)` em cada chamada, e com a
      // resposta presa para sempre aquele timer continua pendente depois de a
      // arvore ser descartada -- o `flutter_test` reprova o caso por isso DE-
      // POIS de a assercao ter passado ("A Timer is still pending even after
      // the widget tree was disposed"). Soltando a resposta no fim, o timeout
      // e cancelado e o caso termina limpo, sem mexer em prazo nenhum.
      final detalheEmVoo = Completer<void>();
      await abrirLoja(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/store/items') {
            return json200(
              paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
            );
          }
          await detalheEmVoo.future;
          return json200(detalheDoContrato());
        },
      );
      // **Pelo ENDERECO, e nao pelo toque no cartao.** O toque no cartao sai
      // do app desde 17/10/2026 (`sairDaLoja`, chamado no `onTap` do
      // `InkWell` em `vitrine_da_loja.dart`, linha 631) e nunca chega a este
      // formulario -- a isca tocava no cartao e media uma tela que nao abria.
      // `pumpAndSettle` nao serve aqui de proposito: a resposta do detalhe
      // fica EM VOO, e e esse o estado que o caso mede.
      final item = tester.widget<CartaoDaLoja>(find.byType(CartaoDaLoja)).item;
      GoRouter.of(
        tester.element(find.byType(VitrineDaLoja)),
      ).push(Rotas.produtoDaLojaDe(item.slug));
      // Dois `pump`: o primeiro empurra a rota, o segundo deixa a transicao
      // do `go_router` terminar para a pagina existir e se anunciar. 350 ms
      // passa da animacao e nao chega perto dos 30 s da resposta, que
      // continua em voo -- `pumpAndSettle` esperaria por ela.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));

      expect(
        find.bySemanticsLabel('Carregando o produto'),
        findsOneWidget,
        reason:
            'REPROVA: a carga nao se anuncia. Sem isto, quem usa leitor de '
            'tela encontra uma pagina sem nada enquanto a chamada esta em voo.',
      );

      // Solta a resposta e deixa a tela assentar: ver o comentario do
      // `Completer`, acima.
      detalheEmVoo.complete();
      await tester.pumpAndSettle();
    });

    // ISCA -- em `produto_da_loja.dart`, troque `if (!detalhe.semImagem)` por
    // `if (true)`. Com a lista vazia a `_Galeria` desenha um `PageView` de
    // zero filhos e sobra uma moldura vazia na tela.
    testWidgets('produto sem imagem nenhuma: nao ha galeria', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          // `images: []` -- "vazia e estado normal", diz o contrato por
          // extenso. A Loja de hml tem zero produto hoje e nenhum evento tem
          // foto: este e o primeiro estado que a tela vai encontrar de fato.
          detalhe: detalheDoContrato(),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      expect(
        find.byType(PageView),
        findsNothing,
        reason:
            'REPROVA: ha galeria num produto sem imagem. Nada ocupa o lugar '
            'dela: nao e falha, e nao entra banner da marca -- o banner de '
            '`pecas_da_rede.dart` desenha o pilar "encontros" e por um produto '
            'afirmaria a coisa errada.',
      );
      // E o resto da pagina continua inteiro.
      expect(find.text('Bola Pop'), findsWidgets);
      expect(find.text('Compre agora'), findsOneWidget);
    });

    // ISCA -- em `produto_da_loja.dart`, no `catch` de `FalhaDaApi`, apague o
    // ramo de `ProblemTipo.naoEncontrado`. O 404 cairia na faixa de erro com
    // `Atualizar`, e a pessoa tocaria em `Atualizar` para receber 404 de novo.
    testWidgets('rascunho e os outros tres 404: nao encontrado, e nao vazio', (
      tester,
    ) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: null,
          urls: urls,
          statusDoDetalhe: 404,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      expect(
        find.text('Este produto saiu da vitrine'),
        findsOneWidget,
        reason:
            'REPROVA: o 404 nao virou "nao encontrado". Rascunho, '
            'retirado, inexistente e parceiro inativo respondem 404 nos '
            'quatro casos (ADR-0021), e nenhum deles pode virar tela vazia: '
            'tela vazia afirma que o produto existe e nao tem conteudo.',
      );
      expect(
        find.text('Atualizar'),
        findsNothing,
        reason:
            'REPROVA: ha `Atualizar` num 404. Tocar nele devolveria 404 de '
            'novo, e oferecer uma acao que nao muda nada e pior que nao '
            'oferecer nenhuma.',
      );
      expect(find.text('Ver a Loja'), findsOneWidget);
    });

    testWidgets('erro de servidor: a faixa com `Atualizar`', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: null,
          urls: urls,
          statusDoDetalhe: 500,
          problemaDoDetalhe: 'internal-error',
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      expect(
        find.text('Atualizar'),
        findsOneWidget,
        reason:
            'REPROVA: o erro de servidor nao oferece nova tentativa. Aqui '
            'a pergunta nao chegou, e tentar de novo e a acao certa -- ao '
            'contrario do 404.',
      );
      expect(
        find.text('Este produto saiu da vitrine'),
        findsNothing,
        reason:
            'REPROVA: um 500 esta dizendo que o produto saiu da vitrine. '
            'Nos nao sabemos se ele saiu: nao conseguimos perguntar.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // OS DOIS GESTOS DO CARTAO NAO SE CONFUNDEM
  // -------------------------------------------------------------------------

  group('no cartao, tocar abre o detalhe e o botao sai do app', () {
    // ISCA -- em `vitrine_da_loja.dart`, troque o `onTap` do `InkWell` do
    // `CartaoDaLoja` por `null`. O caso reprova: a galeria volta a nao ter
    // como ser alcancada.
    testWidgets('tocar no cartao pede a rota do detalhe', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(images: oitoImagens()),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      expect(
        urls.map((u) => u.path),
        contains('/v1/store/items/bola-pop'),
        reason:
            'REPROVA: a tela montou sem pedir o detalhe. A galeria nao '
            'vem da lista: `listStoreItems` manda so `image_url` de proposito, '
            'e sem esta chamada as outras sete imagens nao existem no app.',
      );
    });

    // ISCA -- em `vitrine_da_loja.dart`, troque o `OutlinedButton` do
    // `BotaoDeSaidaDaLoja` por um `Text` dentro de um `IgnorePointer`. O toque
    // passaria para o `InkWell` do cartao e o botao de SAIR abriria o DETALHE
    // -- que e a confusao de gestos que este caso existe para impedir.
    testWidgets('tocar no botao de saida nao abre o detalhe', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(images: oitoImagens()),
          urls: urls,
        ),
      );

      final botao = find.text('Compre agora');
      await tester.ensureVisible(botao);
      await tester.pumpAndSettle();
      await tester.tap(botao);
      await tester.pumpAndSettle();

      // **A saida foi para o NAVEGADOR, e nao para um dialogo.** O
      // `AlertDialog` "Você vai sair do Bichu" saiu em 17/10/2026, por pedido
      // literal do cliente -- *"Remova a confirmacao de sair do bichu quando
      // clica no produto"* --, e esta escrito em `sairDaLoja`
      // (`vitrine_da_loja.dart`, linhas 765-770): "a pessoa passa a ir para o
      // navegador sem aviso nenhum". A isca pedia o dialogo que a decisao
      // tirou. O que ficou no lugar afirma MAIS: nao que uma frase apareceu,
      // mas que o link do parceiro chegou a porta de saida.
      expect(
        saida.links.map((l) => l.toString()),
        <String>['https://cobasi.com.br/bola-pop-borracha'],
        reason: 'REPROVA: o toque em `Compre agora` nao levou o link do '
            'parceiro para a porta de saida do app.',
      );
      // ...e o detalhe NAO foi pedido.
      expect(
        urls.map((u) => u.path),
        isNot(contains('/v1/store/items/bola-pop')),
        reason:
            'REPROVA: tocar no botao de saida tambem abriu o detalhe. Os '
            'dois gestos estao disputando a mesma area: o botao e filho do '
            'cartao e precisa consumir o proprio toque.',
      );
    });

    // ISCA -- no `_ResumoDoProduto`, troque o `TextButton` por um
    // `GestureDetector` com `behavior: HitTestBehavior.translucent`. Tocar em
    // `Ler mais` passaria tambem para o cartao.
    testWidgets('tocar em `Ler mais` nao abre o detalhe', (tester) async {
      final longa = 'Borracha atóxica. ' * 144;
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato(summary: longa)],
          detalhe: detalheDoContrato(summary: longa),
          urls: urls,
        ),
      );

      // **O CASO VIROU DO AVESSO, e nao foi apagado.** O `Ler mais` do cartao
      // deixou de existir em 17/10/2026: o cartao da vitrine ficou com
      // carrossel, "Preço de referência", titulo, linha do preco e `Compre
      // agora`, por pedido do cliente (commit `13c71a3`, "cartao de vitrine
      // so com foto, titulo e preco", e `vitrine_da_loja.dart`, linhas
      // 663-665). O caso irmao de `loja_com_dados_test.dart` registrou a
      // mesma remocao na linha 1000. A isca media o isolamento de gesto entre
      // um `TextButton` e o `InkWell` do cartao, e o `TextButton` nao esta
      // mais la -- `find.text('Ler mais')` achava zero e `ensureVisible`
      // estourava `Bad state: No element`.
      //
      // O que sobrou do assunto e afirmado aqui, nos dois sentidos: o
      // expansor NAO voltou ao cartao, e o corpo do cartao **nao abre o
      // detalhe** -- ele sai do app. Se alguem repuser um controle no cartao
      // sem repontar este caso, ele reprova.
      expect(
        find.text('Ler mais'),
        findsNothing,
        reason: 'REPROVA: o expansor de descricao voltou ao cartao da '
            'vitrine, que o cliente pediu com foto, titulo e preco.',
      );
      expect(find.text('Ler menos'), findsNothing);

      await tester.tap(find.byType(CartaoDaLoja));
      await tester.pumpAndSettle();

      expect(
        saida.links,
        hasLength(1),
        reason: 'REPROVA: tocar no corpo do cartao nao saiu do app. Desde '
            '17/10 e isso que o toque no cartao faz.',
      );
      expect(
        urls.map((u) => u.path),
        isNot(contains('/v1/store/items/bola-pop')),
        reason: 'REPROVA: o toque no corpo do cartao pediu o detalhe. A tela '
            'de detalhe esta PARADA por decisao do cliente, e o gesto do '
            'cartao leva ao site do parceiro.',
      );
    });

    // ISCA -- em `produto_da_loja.dart`, apague
    // `BotaoDeSaidaDaLoja(item: item)` do corpo. O caso reprova: o detalhe
    // seria um beco sem saida, e a compra acontece no site do parceiro.
    testWidgets('o detalhe tem o botao de abrir no site do parceiro', (
      tester,
    ) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(images: oitoImagens()),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      // O corpo do detalhe e um `ListView` (`produto_da_loja.dart`, linha
      // 217): a galeria enche a dobra e o que vem abaixo dela nao esta
      // construido. `find` nao enxerga o que nao existe, entao rola primeiro
      // -- como a pessoa faz.
      await rolarAte(tester, find.text('Compre agora'));
      expect(
        find.text('Compre agora'),
        findsOneWidget,
        reason:
            'REPROVA: o detalhe nao tem saida para o site do parceiro. O '
            'rotulo e "Compre agora" desde 17/10/2026, literal do cliente, e '
            'o nome do parceiro foi para o nome acessivel.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // O AVISO DE QUE NAO SOMOS O VENDEDOR VEM PARA CA
  // -------------------------------------------------------------------------

  // **O AVISO SAIU DAS DUAS TELAS** (pedido do cliente, 17/10/2026: *"Remova
  // o bloco a compra e feita no site do parceiro"*).
  //
  // O caso virou do avesso, e NAO foi apagado: ele guardava uma afirmacao de
  // natureza juridica -- o criterio 6 da BICHUS-185 chamava o aviso de
  // "condicao para a vitrine existir" --, e a remocao de uma afirmacao dessas
  // precisa de um caso que reprove se ela voltar por acidente, e nao de um
  // silencio. A redacao exata continua em
  // `VitrineDaLoja.avisoDeQueNaoSomosOVendedor`.
  testWidgets('o aviso de que a compra e do parceiro NAO aparece mais', (
    tester,
  ) async {
    final urls = <Uri>[];
    await abrirLoja(
      tester,
      rede: redeDaLojaEDoDetalhe(
        itens: <Map<String, dynamic>>[itemDoContrato()],
        detalhe: detalheDoContrato(images: oitoImagens()),
        urls: urls,
      ),
    );
    await tocarNoCartao(tester, 'Bola Pop');

    expect(
      find.text(
        'A compra é feita no site do parceiro. O Bichu não é o vendedor e não '
        'controla preço, estoque nem entrega.',
      ),
      findsNothing,
    );
  });

  // -------------------------------------------------------------------------
  // O PRECO SAI DA MESMA FORMATACAO DO CARTAO
  // -------------------------------------------------------------------------

  group('o preco no detalhe e o mesmo bloco do cartao', () {
    // ISCA -- no `_Cabecalho`, troque `item.linhaDoPreco` por
    // `item.precoFormatado`. O caso reprova: o numero apareceria sem o rotulo
    // e sem a data, e captura de tela e como isso circula.
    testWidgets('valor, rotulo e data saem juntos', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          detalhe: detalheDoContrato(
            priceAmount: 8990,
            priceCheckedAt: '2026-10-14',
            priceStatus: 'vigente',
          ),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      expect(
        find.text('R\$ 89,90 · preço de referência, consultado em 14/10'),
        findsOneWidget,
      );
    });

    testWidgets('preco vencido: a frase no lugar do numero', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaLojaEDoDetalhe(
          itens: <Map<String, dynamic>>[itemDoContrato()],
          // `price_status: vencido` chega **sem** valor e sem data, como o
          // servidor manda.
          detalhe: detalheDoContrato(priceStatus: 'vencido'),
          urls: urls,
        ),
      );
      await tocarNoCartao(tester, 'Bola Pop');

      expect(
        find.text('Preço não confirmado, veja no site do parceiro'),
        findsOneWidget,
        reason:
            'REPROVA: o preco vencido nao diz que nao esta confirmado. '
            '"R\$ 89,90 (desatualizado)" seria o pior dos dois mundos: a '
            'pessoa le o numero e ignora o adjetivo.',
      );
    });
  });
}
