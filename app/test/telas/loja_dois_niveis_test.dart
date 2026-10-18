// A categoria da `Loja` em DOIS NIVEIS, na tela e no modelo.
//
// Decisao do cliente, literal, de 17/10/2026: "dois niveis, com subcategorias
// como a petlove". Antes dela o cartao da vitrine **nao mostrava categoria
// nenhuma** -- o campo chegava na resposta e nao aparecia em lugar nenhum da
// tela --, e o filtro oferecia seis opcoes que vinham de um `enum` deste
// binario.
//
// Este arquivo cobra as cinco coisas que a decisao implica:
//
// 1. O cartao ESCREVE a classificacao, nos dois niveis, com os rotulos que o
//    SERVIDOR mandou -- e nao com um mapa deste binario, que faria renomear
//    uma categoria exigir um APK.
// 2. Produto sem subcategoria nao ganha separador solto nem linha vazia: o
//    segundo nivel e opcional e isso e estado normal.
// 3. O filtro de subcategoria **so existe dentro de uma categoria**, e nao
//    aparece para categoria cuja arvore ainda nao foi levantada (gato,
//    passaro, peixe e outros, em 17/10).
// 4. Trocar a categoria LIMPA a subcategoria, e o recorte que vai para a rota
//    nao tem o par incoerente.
// 5. Quando o vocabulario nao chega, a vitrine **carrega igual**: o grupo de
//    filtro nao nasce, e o rotulo do cartao continua vindo do item.
//
// Os casos marcados ISCA precisam REPROVAR com o mecanismo desligado, e cada
// um diz no corpo qual arquivo mexer.
//
// Nenhum `expect` aqui compara texto renderizado com a constante que o produz:
// as frases estao por extenso, com acento.

import 'package:bichu/api/modelos_loja.dart';
import 'package:bichu/telas/loja/vitrine_da_loja.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'loja_com_dados_test.dart'
    show abrirLoja, itemDoContrato, paginaDoContrato, redeDaVitrine, taxonomiaDoContrato;

/// A rede que atende a vitrine e o vocabulario, e registra as URLs pedidas.
Future<http.Response> Function(http.Request) redeComVocabulario(
  Map<String, dynamic> corpo, {
  required List<Uri> urls,
  bool vocabularioResponde = true,
}) {
  return (req) async {
    if (req.url.path == '/v1/store/taxonomy' && req.method == 'GET') {
      if (!vocabularioResponde) return problema('not-found', 404);
      return json200(taxonomiaDoContrato());
    }
    if (req.url.path == '/v1/store/items' && req.method == 'GET') {
      urls.add(req.url);
      return json200(corpo);
    }
    return problema('not-found', 404);
  };
}

void main() {
  // -------------------------------------------------------------------------
  // 1 e 2: O CARTAO ESCREVE A CLASSIFICACAO
  // -------------------------------------------------------------------------

  group('o cartao mostra categoria e subcategoria', () {
    // ISCA -- em `app/lib/telas/loja/vitrine_da_loja.dart`, dentro de
    // `CartaoDaLoja.build`, apague o bloco `if (item.linhaDaClassificacao ...)`.
    // O `expect` abaixo reprova, e e exatamente o estado em que a tela estava
    // antes de 17/10: o dado chegava e nao aparecia.
    testWidgets('ISCA -- os dois niveis aparecem, separados por ponto medio', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(
              category: 'food',
              categoryLabel: 'Rações',
              subcategory: 'racao_seca',
              subcategoryLabel: 'Ração seca',
            ),
          ]),
        ),
      );

      expect(find.text('Rações · Ração seca'), findsOneWidget);
    });

    testWidgets('produto sem subcategoria mostra so a categoria, sem separador solto', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(category: 'bed', categoryLabel: 'Camas e casinhas'),
          ]),
        ),
      );

      expect(find.text('Camas e casinhas'), findsOneWidget);
      expect(find.textContaining('Camas e casinhas ·'), findsNothing);
    });

    testWidgets('o rotulo e o do SERVIDOR, e nao o que este binario carrega', (tester) async {
      // `food` se chamava "Alimentação" neste binario antes de 17/10. O
      // servidor manda "Rações", e e isso que a tela escreve: um mapa em
      // codigo aqui faria a renomeacao de uma categoria exigir um APK.
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(category: 'food', categoryLabel: 'Rações'),
          ]),
        ),
      );

      expect(find.text('Rações'), findsOneWidget);
      expect(find.text('Alimentação'), findsNothing);
    });

    testWidgets('sem `category_label` na resposta, o rotulo cai para o mapa legado', (tester) async {
      // Servidor mais antigo que o aplicativo -- aparelho que atualizou antes
      // do deploy. A linha nao desaparece: ela usa o rotulo que este binario
      // carrega, e so para os seis codigos que existiam antes.
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(category: 'toy', categoryLabel: null),
          ]),
        ),
      );

      expect(find.text('Brinquedo'), findsOneWidget);
    });

    testWidgets('ISCA -- codigo NOVO sem rotulo nao vira codigo cru na tela', (tester) async {
      // `treats` nao esta no mapa legado deste binario. Sem rotulo da resposta
      // a linha simplesmente nao e desenhada: "treats" na tela nao e um rotulo
      // e parece defeito.
      //
      // Para ver reprovar, em `modelos_loja.dart` troque o `null` final de
      // `rotuloDaCategoria` por `codigo`.
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(category: 'treats', categoryLabel: null),
          ]),
        ),
      );

      expect(find.text('treats'), findsNothing);
      // E o cartao continua inteiro: o titulo esta la.
      expect(find.text('Bola Pop'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // 3, 4 e 5: O FILTRO EM DOIS NIVEIS
  // -------------------------------------------------------------------------

  group('o filtro oferece o segundo nivel dentro do primeiro', () {
    testWidgets('a subcategoria so aparece depois de a categoria ser escolhida', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeComVocabulario(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
          urls: urls,
        ),
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();

      // Antes de escolher a categoria, o grupo do segundo nivel nao existe.
      expect(find.text('Categoria'), findsOneWidget);
      expect(find.text('Subcategoria'), findsNothing);

      await tester.tap(find.text('Rações'));
      await tester.pumpAndSettle();
      expect(urls.last.queryParameters['category'], 'food');

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();

      // Agora ele existe, com as subcategorias DE `food`, e so elas.
      expect(find.text('Subcategoria'), findsOneWidget);
      expect(find.text('Ração seca'), findsOneWidget);
      expect(find.text('Ração úmida'), findsOneWidget);
      // `vermifugos` e de `health`: oferecer as 83 de uma vez devolveria a
      // pessoa ao problema que os dois niveis existem para resolver.
      expect(find.text('Vermífugos'), findsNothing);

      await tester.tap(find.text('Ração seca'));
      await tester.pumpAndSettle();

      expect(urls.last.queryParameters['category'], 'food');
      expect(urls.last.queryParameters['subcategory'], 'racao_seca');
    });

    testWidgets('categoria sem arvore levantada nao oferece o segundo nivel', (tester) async {
      // `bed` sai do vocabulario com `subcategories: []`, que e o estado de 11
      // das 14 categorias em 17/10 -- a arvore lida foi a de CACHORRO. Um grupo
      // de filtro vazio pareceria defeito.
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeComVocabulario(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
          urls: urls,
        ),
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Camas e casinhas'));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      expect(find.text('Subcategoria'), findsNothing);
    });

    testWidgets('ISCA -- trocar a categoria LIMPA a subcategoria do recorte', (tester) async {
      // O par incoerente nao chega a rota: `food` + `vermifugos` devolveria
      // lista vazia e a pessoa nao saberia explicar por que.
      //
      // Para ver reprovar, em `modelos_loja.dart`, em `RecorteDaLoja.com`,
      // troque o ramo `if (trocouCategoria)` por
      // `subcategoriaNova = subcategoria ?? this.subcategoria;`.
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeComVocabulario(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
          urls: urls,
        ),
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rações'));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ração seca'));
      await tester.pumpAndSettle();
      expect(urls.last.queryParameters['subcategory'], 'racao_seca');

      // Troca de categoria: a subcategoria some do recorte.
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Medicamentos'));
      await tester.pumpAndSettle();

      expect(urls.last.queryParameters['category'], 'health');
      expect(urls.last.queryParameters['subcategory'], isNull);
    });

    testWidgets('sem vocabulario, a vitrine carrega e o filtro nao oferece categoria', (tester) async {
      // A falha do vocabulario nao e falha da tela: a lista aparece, o cartao
      // continua com o rotulo que o ITEM trouxe, e nenhuma faixa de erro fala
      // de uma lista que a pessoa nao pediu.
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeComVocabulario(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(category: 'food', categoryLabel: 'Rações'),
          ]),
          urls: urls,
          vocabularioResponde: false,
        ),
      );

      expect(find.byType(CartaoDaLoja), findsOneWidget);
      expect(find.text('Rações'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      expect(find.text('Categoria'), findsNothing);
      expect(find.text('Subcategoria'), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  // O MODELO, SEM TELA
  // -------------------------------------------------------------------------

  group('o vocabulario e o recorte, no modelo', () {
    test('a taxonomia aninha a subcategoria dentro da categoria', () {
      final taxonomia = TaxonomiaDaLoja.doJson(taxonomiaDoContrato());
      expect(taxonomia.categorias.map((c) => c.codigo), <String>['food', 'health', 'bed']);
      expect(taxonomia.subcategoriasDe('food').map((s) => s.codigo),
          <String>['racao_seca', 'racao_umida']);
      // Sem categoria escolhida NAO sao todas: sao nenhuma.
      expect(taxonomia.subcategoriasDe(null), isEmpty);
      expect(taxonomia.subcategoriasDe('bed'), isEmpty);
    });

    test('resposta sem `categories` e FormatException, e nao vocabulario vazio', () {
      // Vocabulario vazio em silencio faria o filtro desaparecer sem ninguem
      // saber que a resposta estava fora do contrato.
      expect(
        () => TaxonomiaDaLoja.doJson(<String, dynamic>{}),
        throwsA(isA<FormatException>()),
      );
    });

    test('a subcategoria conta como grupo de filtro proprio', () {
      const recorte = RecorteDaLoja(categoria: 'food', subcategoria: 'racao_seca');
      expect(recorte.quantidadeDeFiltros, 2);
      expect(recorte.temRecorte, isTrue);
    });

    test('limpar a categoria limpa a subcategoria junto', () {
      const recorte = RecorteDaLoja(categoria: 'food', subcategoria: 'racao_seca');
      final limpo = recorte.com(limparCategoria: true);
      expect(limpo.categoria, isNull);
      expect(limpo.subcategoria, isNull);
      expect(limpo.quantidadeDeFiltros, 0);
    });

    test('a query leva os dois niveis, e omite o que nao ha', () {
      const comOsDois = RecorteDaLoja(categoria: 'food', subcategoria: 'racao_seca');
      expect(comOsDois.query['category'], 'food');
      expect(comOsDois.query['subcategory'], 'racao_seca');

      const soCategoria = RecorteDaLoja(categoria: 'food');
      expect(soCategoria.query.containsKey('subcategory'), isFalse);
    });

    test('a linha da classificacao e UMA string, e nao dois campos', () {
      // Dois getters separados permitiriam desenhar so o segundo nivel, e
      // "Ração seca" sozinho nao diz de que categoria e.
      final item = ItemDaLoja.doJson(itemDoContrato(
        category: 'food',
        categoryLabel: 'Rações',
        subcategory: 'racao_seca',
        subcategoryLabel: 'Ração seca',
      ));
      expect(item.linhaDaClassificacao, 'Rações · Ração seca');

      final semSegundo = ItemDaLoja.doJson(itemDoContrato(
        category: 'food',
        categoryLabel: 'Rações',
      ));
      expect(semSegundo.linhaDaClassificacao, 'Rações');
    });

    test('rotulo de subcategoria sem o CODIGO dela nao e usado', () {
      // Seria um segundo nivel que a lista nao sabe filtrar de volta.
      final item = ItemDaLoja.doJson(itemDoContrato(
        category: 'food',
        categoryLabel: 'Rações',
        subcategoryLabel: 'Ração seca',
      ));
      expect(item.subcategoria, isNull);
      expect(item.rotuloDaSubcategoria, isNull);
      expect(item.linhaDaClassificacao, 'Rações');
    });

    test('ISCA DO APK PUBLICADO: campo desconhecido na resposta nao estoura o parse', () {
      // Medido em 17/10 contra o `modelos_loja.dart` de `722039f`, que e o do
      // APK no bolso do cliente: `doJson` le so chave conhecida, e codigo de
      // categoria desconhecido cai em nulo em vez de lancar. Este caso guarda
      // a MESMA propriedade no binario novo, para a proxima resposta ganhar
      // campo sem derrubar a aba.
      final comCampoDoFuturo = <String, dynamic>{
        ...itemDoContrato(),
        'campo_que_ainda_nao_existe': 'qualquer coisa',
      };
      expect(() => ItemDaLoja.doJson(comCampoDoFuturo), returnsNormally);
    });
  });
}
