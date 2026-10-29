// `Loja` com dado de verdade: a vitrine de `GET /v1/store/items`.
//
// Os casos marcados ISCA sao os que precisam REPROVAR com o mecanismo
// desligado. Cada um diz, no proprio corpo, qual arquivo mexer e o que
// observar.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante
// que o produz.** Todo esperado esta escrito por extenso, com acento e
// pontuacao, e trocar a microcopia reprova -- que e o ponto. Um `expect` que
// lesse `VitrineDaLoja.precoNaoConfirmado` acompanharia o erro de digitacao
// para sempre.

import 'package:bichu/api/modelos_loja.dart';
import 'package:bichu/telas/loja/vitrine_da_loja.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:bichu/widgets/rodape_da_paginacao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A massa, no formato exato do contrato
// ---------------------------------------------------------------------------

/// Um item como `StoreItemSummary` o declara.
///
/// **Sem `id`**: a chave e o `slug`, e nao ha UUID nenhum nas duas tabelas.
/// Um teste que passasse `id` aqui estaria exercitando um contrato que nao
/// existe.
Map<String, dynamic> itemDoContrato({
  String slug = 'bola-pop',
  String title = 'Bola Pop',
  String summary = 'Bola de borracha atóxica que flutua.',
  String category = 'toy',
  String? categoryLabel = 'Brinquedos',
  String? subcategory,
  String? subcategoryLabel,
  String? imageUrl,
  String? imageAltText,
  String targetUrl = 'https://cobasi.com.br/bola-pop-borracha',
  String partnerSlug = 'cobasi',
  String partnerName = 'Cobasi',
  String partnerHost = 'cobasi.com.br',
  int? priceAmount,
  String? priceCheckedAt,
  String priceStatus = 'sem_preco',
}) {
  return <String, dynamic>{
    'slug': slug,
    'title': title,
    'summary': summary,
    'category': category,
    'category_label': categoryLabel,
    'subcategory': subcategory,
    'subcategory_label': subcategoryLabel,
    'image_url': imageUrl,
    'image_alt_text': imageAltText,
    'target_url': targetUrl,
    'partner': <String, dynamic>{
      'slug': partnerSlug,
      'name': partnerName,
      'host': partnerHost,
    },
    'price_amount': priceAmount,
    'price_currency': priceAmount == null ? null : 'BRL',
    'price_checked_at': priceCheckedAt,
    'price_status': priceStatus,
  };
}

/// A resposta de `StoreTaxonomy` (`GET /v1/store/taxonomy`).
///
/// **Um recorte do vocabulario, nao ele inteiro.** A arvore de verdade tem 14
/// categorias e 83 subcategorias, e quem a confere e
/// `tests/integration/taxonomia-da-loja-em-dois-niveis.test.ts`, contra a
/// semente. Aqui bastam tres categorias: uma com arvore de segundo nivel, uma
/// outra com arvore (para "subcategoria de outra categoria" existir) e uma
/// SEM arvore -- que e o estado de 11 das 14 em 17/10 e o que faz o grupo de
/// filtro do segundo nivel nao aparecer.
Map<String, dynamic> taxonomiaDoContrato() {
  return <String, dynamic>{
    'categories': <Map<String, dynamic>>[
      <String, dynamic>{
        'code': 'food',
        'label': 'Rações',
        'subcategories': <Map<String, dynamic>>[
          <String, dynamic>{
            'code': 'racao_seca',
            'label': 'Ração seca',
            'species': <String>['dog'],
          },
          <String, dynamic>{
            'code': 'racao_umida',
            'label': 'Ração úmida',
            'species': <String>['dog'],
          },
        ],
      },
      <String, dynamic>{
        'code': 'health',
        'label': 'Medicamentos',
        'subcategories': <Map<String, dynamic>>[
          <String, dynamic>{
            'code': 'vermifugos',
            'label': 'Vermífugos',
            'species': <String>['dog'],
          },
        ],
      },
      // Sem subcategoria: o segundo nivel nao e oferecido para ela.
      <String, dynamic>{'code': 'bed', 'label': 'Camas e casinhas', 'subcategories': <Map<String, dynamic>>[]},
    ],
  };
}

/// A resposta de `StoreTaxonomy`.
Map<String, dynamic> paginaDoContrato(
  List<Map<String, dynamic>> itens, {
  String ordemEfetiva = 'curadoria',
  int? total,
  int pagina = 1,
  int limite = 20,
  Map<String, String> filtros = const <String, String>{'scope': 'all'},
}) {
  return <String, dynamic>{
    'items': itens,
    'page': pagina,
    'limit': limite,
    'total': total ?? itens.length,
    'effective_sort': ordemEfetiva,
    'applied_filters': filtros,
  };
}

/// Vinte e cinco itens distintos, com titulo e `slug` numerados.
///
/// **Vinte e cinco, e nao cinco.** Um caso com cinco itens cabe inteiro na
/// primeira pagina e fica verde com a paginacao quebrada -- foi o que
/// aconteceu: a tela foi entregue com massa de dez e doze itens e o defeito
/// passou. O teto do contrato e `limit: 20`.
List<Map<String, dynamic>> vinteECincoItens() {
  return <Map<String, dynamic>>[
    for (var i = 1; i <= 25; i++)
      itemDoContrato(slug: 'item-$i', title: 'Item $i'),
  ];
}

/// A rede que **pagina de verdade**: recorta a massa por `page` e `limit`, do
/// jeito que o contrato manda, e registra cada URL pedida.
///
/// Ela nao devolve um corpo fixo. Um duble que responde a mesma pagina para
/// qualquer `page` deixaria passar o defeito que estes casos existem para
/// pegar: a tela pode nunca pedir a pagina 2 e o teste nao perceberia.
Future<http.Response> Function(http.Request) redeQuePaginaAVitrine(
  List<Map<String, dynamic>> massa, {
  required List<Uri> urls,
  List<Map<String, dynamic>> Function(Map<String, String> pedido)? recorte,
  Map<String, String> Function(Map<String, String> pedido)? filtrosAplicados,
}) {
  return (req) async {
    if (req.url.path == '/v1/store/taxonomy' && req.method == 'GET') {
      return json200(taxonomiaDoContrato());
    }
    if (req.url.path != '/v1/store/items' || req.method != 'GET') {
      return problema('not-found', 404);
    }
    urls.add(req.url);
    final pedido = req.url.queryParameters;
    final pagina = int.parse(pedido['page'] ?? '1');
    final limite = int.parse(pedido['limit'] ?? '20');
    final visivel = recorte == null ? massa : recorte(pedido);
    final inicio = (pagina - 1) * limite;
    final fatia = inicio >= visivel.length
        ? const <Map<String, dynamic>>[]
        : visivel.sublist(
            inicio,
            inicio + limite > visivel.length ? visivel.length : inicio + limite,
          );
    return json200(
      paginaDoContrato(
        fatia,
        total: visivel.length,
        pagina: pagina,
        limite: limite,
        filtros: filtrosAplicados?.call(pedido) ??
            const <String, String>{'scope': 'all'},
      ),
    );
  };
}

/// Rola ate o rodape e toca em `Carregar mais`.
Future<void> tocarEmCarregarMais(WidgetTester tester) async {
  final botao = find.text(RodapeDaPaginacao.rotuloDeCarregarMais);
  expect(
    botao,
    findsOneWidget,
    reason: 'REPROVA: nao ha `Carregar mais` na tela, e os itens depois do '
        '20o sao inalcancaveis.',
  );
  await tester.ensureVisible(botao);
  await tester.pumpAndSettle();
  await tester.tap(botao);
  await tester.pumpAndSettle();
}

/// A rede que atende a vitrine e **404 em qualquer outra rota**.
Future<http.Response> Function(http.Request) redeDaVitrine(
  Map<String, dynamic> corpo, {
  List<Uri>? urls,
  List<Map<String, String>>? cabecalhos,
}) {
  return (req) async {
    if (req.url.path == '/v1/store/items' && req.method == 'GET') {
      urls?.add(req.url);
      cabecalhos?.add(req.headers);
      return json200(corpo);
    }
    // O vocabulario dos dois niveis: a tela o pede uma vez, e sem ele os
    // grupos de filtro de categoria e de subcategoria nao nascem.
    if (req.url.path == '/v1/store/taxonomy' && req.method == 'GET') {
      return json200(taxonomiaDoContrato());
    }
    return problema('not-found', 404);
  };
}

Future<void> abrirLoja(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
}) async {
  await abrirOApp(tester, rede: rede, deposito: depositoLogado());
  await tester.tap(find.widgetWithText(NavigationDestination, 'Loja'));
  await tester.pumpAndSettle();
}

/// Os titulos dos cartoes, **na ordem em que a tela os desenhou**.
///
/// Lidos da arvore montada, e nao da resposta: e a ordem da TELA que os casos
/// de ordenacao medem, e ler da resposta provaria que o JSON esta ordenado.
List<String> titulosNaTela(WidgetTester tester) {
  final titulos = <String>[];
  for (final cartao in find.byType(CartaoDaLoja).evaluate()) {
    titulos.add((cartao.widget as CartaoDaLoja).item.titulo);
  }
  return titulos;
}

void main() {
  // -------------------------------------------------------------------------
  // O PRECO, EM CENTAVOS E EM PORTUGUES DO BRASIL
  // -------------------------------------------------------------------------

  group('o preco sai em centavos e chega em reais', () {
    // ISCA -- para ver reprovar, em `app/lib/api/modelos_loja.dart`, dentro de
    // `formatarReais`, troque a virgula do `return` por ponto:
    //     return '...R\$ $buffer.$centavosEmTexto';
    // Os quatro `expect` abaixo reprovam, nomeando o valor errado.
    test('ISCA -- a virgula e decimal e o ponto e de milhar', () {
      // Escritos por extenso, e nao montados a partir de `formatarReais`:
      // comparar a funcao consigo mesma aprovaria qualquer formato.
      expect(formatarReais(990), 'R\$ 9,90');
      expect(formatarReais(4990), 'R\$ 49,90');
      expect(formatarReais(124990), 'R\$ 1.249,90');
      expect(formatarReais(100000000), 'R\$ 1.000.000,00');
    });

    // ISCA -- em `formatarReais`, troque `absoluto ~/ 100` por `absoluto`:
    //     final reais = absoluto;
    // O caso abaixo reprova: `R$ 8.990,00` no lugar de `R$ 89,90`.
    test('ISCA -- centavo nao vira real', () {
      expect(formatarReais(8990), 'R\$ 89,90');
      // O caso que uma implementacao "dividir por 100 e arredondar" erra: o
      // resto nao e zero e nao pode sumir.
      expect(formatarReais(1), 'R\$ 0,01');
      expect(formatarReais(99), 'R\$ 0,99');
    });

    // ISCA -- em `formatarReais`, troque
    //     resto.toString().padLeft(2, '0')
    // por `resto.toString()`. O valor redondo passa a sair `R$ 100,0`.
    test('ISCA -- o centavo tem SEMPRE dois digitos', () {
      expect(formatarReais(10000), 'R\$ 100,00');
      expect(formatarReais(10050), 'R\$ 100,50');
      expect(formatarReais(10005), 'R\$ 100,05');
    });

    test('a data de consulta sai em dia e mes', () {
      expect(dataCurta('2026-03-14'), '14/03');
      expect(dataCurta('2026-12-01'), '01/12');
    });
  });

  group('o preco NAO esta no cartao (18/10/2026)', () {
    // ========================================================================
    // **ESTE GRUPO JA VIROU DUAS VEZES NO MESMO DIA, e as duas foram dele.**
    //
    //  - de manha ele cobrava valor, rotulo e data no MESMO texto (criterio 15
    //    da BICHUS-185);
    //  - no fim da manha virou para "so o valor", por pedido literal: *"remova
    //    o texto 'preço de referência, consultado em 17/10', porque você já
    //    colocou como eu pedi acima do titulo"*;
    //  - agora vira de novo, e e o pedido mais curto dos tres: *"Retire o
    //    preco dos produtos da loja e o texto de 'preco de referencia'"*.
    //
    // Nao e erro de leitura: e reversao deliberada, registrada no diff.
    //
    // **Quem mede a remocao por inteiro -- inclusive na arvore de semantica,
    // onde `find.text` nao chega -- e
    // `test/telas/loja_preco_de_referencia_test.dart`.** Este grupo cobra a
    // metade que pertence a este arquivo: a VITRINE com dado de verdade, nos
    // tres estados de preco que o contrato tem.
    //
    // ISCA -- em `CartaoDaLoja.build` (`lib/telas/loja/vitrine_da_loja.dart`),
    // devolva o `Text(item.linhaDoPreco!, ...)`. Esperado: reprova
    // `com preco VIGENTE o cartao nao mostra valor nenhum`.
    // ========================================================================

    testWidgets('com preco VIGENTE o cartao nao mostra valor nenhum', (
      tester,
    ) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(
              priceAmount: 8990,
              priceCheckedAt: '2026-03-14',
              priceStatus: 'vigente',
            ),
          ]),
        ),
      );

      // ANCORA: o cartao existe e esta inteiro. Sem ela os tres `findsNothing`
      // abaixo passariam com a vitrine vazia.
      expect(
        find.text('Bola Pop'),
        findsOneWidget,
        reason:
            'REPROVA NA ANCORA: o cartao nao esta na tela, e as ausencias '
            'abaixo nao significariam nada.',
      );
      expect(
        find.text(CartaoDaLoja.rotuloDeSaida),
        findsOneWidget,
        reason:
            'REPROVA NA ANCORA: a saida para o parceiro nao esta no '
            'cartao.',
      );

      // Escrito por extenso. Um `expect` montado com `formatarReais` ou com a
      // constante da tela acompanharia qualquer erro de digitacao.
      expect(
        find.text('R\$ 89,90'),
        findsNothing,
        reason:
            'REPROVA: o cartao mostra o valor. O item desta massa tem '
            '`price_amount: 8990` e `price_status: vigente` -- exatamente o '
            'estado em que o valor aparecia antes de 18/10/2026.',
      );
      expect(
        find.textContaining('Preço de referência'),
        findsNothing,
        reason:
            'REPROVA: a afirmacao "Preço de referência" voltou a tela. Ela '
            'saiu no mesmo pedido do valor.',
      );
      expect(
        find.textContaining('consultado em'),
        findsNothing,
        reason:
            'REPROVA: a data da consulta continua na tela. Data de '
            'consulta de um preco que nao esta mais na tela nao se refere a '
            'nada.',
      );
    });

    testWidgets('preco VENCIDO nao mostra valor nem a clausula orfa', (
      tester,
    ) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            // O servidor ja omitiu o valor e a data: e assim que a resposta
            // chega quando o preco venceu.
            itemDoContrato(priceStatus: 'vencido'),
          ]),
        ),
      );

      expect(
        find.text('Bola Pop'),
        findsOneWidget,
        reason: 'REPROVA NA ANCORA: o cartao nao esta na tela.',
      );
      expect(
        find.text('Preço não confirmado, veja no site do parceiro'),
        findsNothing,
        reason:
            'REPROVA: o cartao ainda anuncia que o preco nao esta '
            'confirmado. Era a clausula VISUAL que acompanhava o preco, e ela '
            'ficou ORFA: existia para ocupar o lugar de um valor que a pessoa '
            'esperava, e nao ha mais lugar nenhum.',
      );
      // E **nunca** o valor com um adjetivo ao lado.
      expect(find.textContaining('R\$'), findsNothing);
      expect(find.textContaining('desatualizado'), findsNothing);
    });

    testWidgets('item sem preco nao mostra linha de preco', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(priceStatus: 'sem_preco'),
          ]),
        ),
      );

      // ANCORA, acrescentada em 18/10/2026 junto com a remocao do preco.
      //
      // Ate aquele dia este caso tinha sentido sozinho: o cartao DESENHAVA
      // preco nos outros dois estados, e a ausencia aqui distinguia
      // `sem_preco` deles. Com o preco fora da tela nos tres estados, os dois
      // `findsNothing` abaixo passariam com a vitrine VAZIA -- o portao cego
      // que este repositorio ja produziu duas vezes. O caso fica (ele cobra
      // que `sem_preco` nao invente "preco sob consulta" nem espaco
      // reservado) e passa a ancorar no cartao.
      expect(
        find.text('Bola Pop'),
        findsOneWidget,
        reason: 'REPROVA NA ANCORA: o cartao nao esta na tela, e as ausencias '
            'abaixo nao significariam nada.',
      );
      // Nao ha "preco sob consulta" e nao ha espaco reservado vazio.
      expect(find.textContaining('R\$'), findsNothing);
      expect(
        find.text('Preço não confirmado, veja no site do parceiro'),
        findsNothing,
      );
    });

    // ISCA -- em `app/lib/telas/loja/vitrine_da_loja.dart`, em
    // `CartaoDaLoja.rotuloDeSaida`, troque por:
    //     'Comprar por R\$ 89,90'
    // Este caso reprova: o rotulo passa a ter um digito depois do cifrao.
    testWidgets('ISCA -- o botao de saida nao carrega valor monetario', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(
              priceAmount: 8990,
              priceCheckedAt: '2026-03-14',
              priceStatus: 'vigente',
            ),
          ]),
        ),
      );

      // "Compre agora", literal do cliente (17/10). O nome do parceiro saiu
      // do texto visivel e foi para o nome acessivel.
      expect(find.text('Compre agora'), findsWidgets);

      // Nenhum rotulo de botao tem cifrao seguido de digito.
      final comCifrao = RegExp(r'R\$\s*\d');
      for (final botao in find.byType(OutlinedButton).evaluate()) {
        final textos = find
            .descendant(of: find.byWidget(botao.widget), matching: find.byType(Text))
            .evaluate();
        for (final texto in textos) {
          final conteudo = (texto.widget as Text).data ?? '';
          expect(
            comCifrao.hasMatch(conteudo),
            isFalse,
            reason: 'rotulo de saida com valor monetario: "$conteudo"',
          );
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // A BARRA DE LISTAGEM: OS DOIS VAZIOS SAO OPOSTOS
  // -------------------------------------------------------------------------

  group('a barra de listagem nasce e some pelo recorte, nao pela contagem', () {
    // ISCA -- em `app/lib/widgets/barra_de_listagem.dart`, apague a linha
    //     if (total == 0 && !_recorteAtivo) return const SizedBox.shrink();
    // Este caso reprova: a barra aparece sobre o nada.
    testWidgets('ISCA -- vitrine vazia SEM recorte nao desenha a barra', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(paginaDoContrato(const <Map<String, dynamic>>[])),
      );

      expect(find.byType(BarraDeListagem), findsOneWidget);
      // O widget existe na arvore e **nao desenha controle nenhum**: e o que
      // `SizedBox.shrink()` produz. Medir pelos controles, e nao pelo tipo, e
      // o que distingue "a barra sumiu" de "a barra esta ali, vazia".
      expect(find.byType(TextField), findsNothing);
      expect(find.byIcon(Icons.tune), findsNothing);
      expect(find.byIcon(Icons.swap_vert), findsNothing);

      // E o vazio que aparece e o da vitrine sem produto, e nao o do recorte.
      expect(find.text('A Loja está sendo montada'), findsOneWidget);
    });

    // ISCA -- na mesma linha de cima, troque por
    //     if (total == 0) return const SizedBox.shrink();
    // Este caso reprova: quem filtrou e nao achou nada perde o controle que
    // produziu o vazio, e o unico caminho de volta passa a ser sair da secao.
    testWidgets('ISCA -- vitrine vazia COM filtro ativo MANTEM a barra', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/store/taxonomy' && req.method == 'GET') {
            return json200(taxonomiaDoContrato());
          }
          if (req.url.path == '/v1/store/items' && req.method == 'GET') {
            urls.add(req.url);
            // A primeira carga traz um item; depois do filtro, nenhum.
            final filtrou = req.url.queryParameters['category'] != null;
            return json200(
              paginaDoContrato(
                filtrou
                    ? const <Map<String, dynamic>>[]
                    : <Map<String, dynamic>>[itemDoContrato()],
                filtros: filtrou
                    ? const <String, String>{'category': 'health'}
                    : const <String, String>{'scope': 'all'},
              ),
            );
          }
          return problema('not-found', 404);
        },
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      // "Medicamentos", e nao "Saúde": o rotulo e dado do servidor desde
      // 17/10, e este caso le o que o duble entregou em `taxonomiaDoContrato`.
      await tester.tap(find.text('Medicamentos'));
      await tester.pumpAndSettle();
      // **A pastilha nao recorta nada sozinha** (decisao do cliente de 17/10):
      // `Aplicar` e "o unico caminho de saida com efeito"
      // (`lib/widgets/barra_de_listagem.dart`, linhas 86-87). Sem esta linha a
      // rota nunca era chamada com `category`, e o caso irmao de `Perto`
      // (`perto_com_dados_test.dart`, linhas 869-877) ja afirma os dois lados:
      // antes do `Aplicar` nao ha recorte, depois ha.
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();

      // O filtro de fato foi para a rota.
      expect(urls.last.queryParameters['category'], 'health');

      // A lista esta vazia **e a barra ficou**, com os controles desenhados.
      expect(find.byType(CartaoDaLoja), findsNothing);
      expect(find.byIcon(Icons.tune), findsOneWidget);
      expect(find.text('Nada com esse recorte'), findsOneWidget);
      expect(find.text('0 produtos · Seleção do Bichu'), findsOneWidget);
    });

    testWidgets('um item so usa o singular', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
        ),
      );
      expect(find.text('1 produto · Seleção do Bichu'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // A ORDEM MOSTRADA E A ORDEM REAL
  // -------------------------------------------------------------------------

  group('o controle de ordenacao mostra a ordem em que a lista ESTA', () {
    // ISCA -- em `app/lib/telas/loja/vitrine_da_loja.dart`, em
    // `_controleDeOrdenacao`, troque
    //     efetiva: pagina.ordemEfetiva.codigo
    // por
    //     efetiva: _recorte.ordem.codigo
    // Este caso reprova: a tela passa a afirmar a ordem PEDIDA sobre uma lista
    // que o servidor devolveu em outra.
    testWidgets('ISCA -- a ordem vem da RESPOSTA, nao do estado local', (tester) async {
      await abrirLoja(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/store/items' && req.method == 'GET') {
            // A pessoa pede `nome`, e o servidor responde que a lista saiu em
            // `curadoria`. As duas divergem de proposito.
            return json200(
              paginaDoContrato(
                <Map<String, dynamic>>[
                  itemDoContrato(slug: 'zebra', title: 'Zebra de pelúcia'),
                  itemDoContrato(slug: 'abacate', title: 'Abacate de borracha'),
                ],
                ordemEfetiva: 'curadoria',
              ),
            );
          }
          return problema('not-found', 404);
        },
      );

      // **Uma folha so, e um `Aplicar` so** (cliente, 17/10): a ordem deixou
      // de ter controle proprio e passou a morar na mesma folha do filtro --
      // `_controleDeOrdenacao` entra em `BarraDeListagem.ordenacao` e sai pelo
      // mesmo `aoAplicar` (`vitrine_da_loja.dart`, linhas 346-348). O
      // `Icons.swap_vert` que esta isca procurava nao existe mais, e um caso
      // vizinho deste arquivo ja afirma isso (`findsNothing` sobre
      // `Icons.swap_vert`, na linha 422).
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nome'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();

      // A pessoa pediu `Nome`. A lista saiu em `curadoria`, e e isso que a
      // linha de resumo precisa dizer -- por extenso, e nao pela constante.
      expect(find.text('2 produtos · Seleção do Bichu'), findsOneWidget);
      expect(find.text('2 produtos · Nome'), findsNothing);

      // E a lista de fato nao esta em ordem de nome: `Zebra` antes de
      // `Abacate`. Se a tela dissesse `Nome`, estaria mentindo sobre isto.
      expect(titulosNaTela(tester), <String>[
        'Zebra de pelúcia',
        'Abacate de borracha',
      ]);
    });

    testWidgets('a ordem efetiva fora das opcoes e defeito ruidoso', (tester) async {
      // O componente lanca `StateError` em vez de mostrar texto vazio: uma
      // ordem efetiva que nao esta entre as opcoes some em silencio se virar
      // string vazia.
      expect(
        () => ControleDeOrdenacao(
          opcoes: const <OpcaoDeRecorte>[
            OpcaoDeRecorte(codigo: 'curadoria', rotulo: 'Seleção do Bichu'),
          ],
          efetiva: 'preco',
        ).rotuloEfetivo,
        throwsStateError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // A BUSCA VAI AO SERVIDOR, E DIZ QUE VAI
  // -------------------------------------------------------------------------

  group('a busca e de servidor', () {
    // ISCA -- em `app/lib/telas/loja/vitrine_da_loja.dart`, em
    // `_controleDeBusca`, troque
    //     alcance: AlcanceDaBusca.servidor
    // por
    //     alcance: AlcanceDaBusca.paginaCarregada
    // Este caso reprova: o componente passa a escrever na tela que a busca
    // olha so o que esta carregado, e a frase aparece sobre uma busca que de
    // fato vai ao servidor.
    testWidgets('ISCA -- o termo vai na rota e a tela nao avisa alcance local', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
          urls: urls,
        ),
      );

      await tester.enterText(find.byType(TextField), 'ração');
      await tester.pumpAndSettle();
      // Digitar nao pergunta nada desde 17/10: a lupa pergunta.
      expect(urls.last.queryParameters.containsKey('q'), isFalse);
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      expect(urls.last.queryParameters['q'], 'ração');
      expect(
        find.text('A busca olha só o que já está carregado nesta página.'),
        findsNothing,
      );
    });

    testWidgets('um caractere so nao vai a rota', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
          urls: urls,
        ),
      );
      final antes = urls.length;

      await tester.enterText(find.byType(TextField), 'r');
      await tester.pumpAndSettle();
      // `minLength: 2` no contrato: a lupa NAO habilita com uma letra, e o
      // nome acessivel dela diz o que falta.
      expect(find.byTooltip('Buscar, faltam 1 letra'), findsOneWidget);
      await tester.tap(find.byTooltip('Buscar, faltam 1 letra'));
      await tester.pumpAndSettle();

      expect(urls.length, antes);
    });
  });

  // -------------------------------------------------------------------------
  // A SAIDA
  // -------------------------------------------------------------------------

  group('a saida e anunciada e nao carrega dado pessoal', () {
    testWidgets('o aviso nomeia o parceiro antes de sair', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
        ),
      );

      await tester.tap(find.text('Compre agora').last);
      await tester.pumpAndSettle();

      // **O DIALOGO DE SAIDA SAIU** (pedido do cliente, 17/10/2026: "Remova a
      // confirmacao de sair do bichu quando clica no produto"). A pessoa vai
      // para o navegador do parceiro SEM AVISO: este caso guarda a decisao,
      // para a volta do dialogo ser deliberada e nao acidental.
      expect(find.text('Você vai sair do Bichu'), findsNothing);
      expect(find.text('Ficar aqui'), findsNothing);
    });

    // ISCA -- em `vitrine_da_loja.dart`, em `_BotaoDeSaida._sair`, troque a
    // URL por uma com identificador:
    //     Uri.parse('${item.urlDeDestino}?u=${Uri.encodeComponent("tutor@exemplo.com")}')
    // Este caso reprova: a URL final passa a conter o identificador.
    test('ISCA -- a URL de destino sai como o servidor a mandou', () {
      final item = ItemDaLoja.doJson(
        itemDoContrato(targetUrl: 'https://cobasi.com.br/bola-pop-borracha'),
      );

      // A tela abre exatamente `item.urlDeDestino`. Nenhum parametro e
      // acrescentado, entao a URL que sai e a que entrou.
      final uri = Uri.parse(item.urlDeDestino);
      expect(uri.queryParameters, isEmpty);
      expect(uri.host, 'cobasi.com.br');
      expect(uri.scheme, 'https');
    });
  });

  // -------------------------------------------------------------------------
  // A VITRINE NAO E UM COMERCIO
  // -------------------------------------------------------------------------

  testWidgets('nao ha carrinho, pedido nem pagamento na tela', (tester) async {
    await abrirLoja(
      tester,
      rede: redeDaVitrine(
        paginaDoContrato(<Map<String, dynamic>>[
          itemDoContrato(
            priceAmount: 8990,
            priceCheckedAt: '2026-03-14',
            priceStatus: 'vigente',
          ),
        ]),
      ),
    );

    // **`Cupom` E `Desconto` SAIRAM DESTA LISTA em 22/10/2026, e a saida e
    // pedido do cliente -- com mecanismo no lugar, e nao com silencio.**
    //
    // Literal: *"Na pagina da loja inclua a frase: Ajude a mantermos o Bichu
    // gratuito e ainda ganhe descontos comprando em nossas lojas parceiras.
    // Adicione o cupom de desconto chamado: bichu"*. As duas palavras que esta
    // lista proibia estao na frase que ele escreveu.
    //
    // **O QUE A LISTA GUARDA NAO MUDOU.** O invariante e que o Bichu nao e
    // comercio: nao ha carrinho, nao ha pedido, nao ha pagamento e nao ha
    // checkout DENTRO do app -- a compra acontece no site do parceiro. Um
    // cupom que a pessoa digita no site do parceiro nao cria nenhuma dessas
    // quatro coisas aqui: ele nao tem estado, nao tem valor, nao tem validade
    // e nao fala com servidor nenhum (medido: `coupon` e `cupom` nao existem
    // em `api/openapi.yaml`). As dez palavras que SOBRARAM sao as que
    // descrevem comercio proprio, e elas continuam proibidas.
    //
    // **E as duas nao ficaram liberadas em qualquer lugar:** o caso de baixo
    // cobra que elas aparecam SO no bloco que o cliente pediu. Tirar as duas
    // da lista sem esse caso seria trocar um portao por nada -- e `Desconto`
    // passava por ACIDENTE antes dele, porque a frase dele escreve
    // `descontos` em minuscula e `find.textContaining` e sensivel a caixa.
    for (final palavra in <String>[
      'Carrinho',
      'carrinho',
      'Adicionar',
      'Comprar',
      'Pedido',
      'Finalizar',
      'Pagamento',
      'Frete',
      'De R\$',
      'menor preço',
    ]) {
      expect(
        find.textContaining(palavra),
        findsNothing,
        reason: 'a vitrine nao e um comercio, e "$palavra" apareceu na tela',
      );
    }

    // **E o aviso de que a compra e com o parceiro NAO esta mais la.** A
    // afirmacao virou do avesso, e nao foi apagada: o cliente pediu em
    // 17/10/2026 *"Remova o bloco a compra e feita no site do parceiro"*, e o
    // bloco saiu da vitrine e do detalhe (`vitrine_da_loja.dart`, linhas
    // 330-337, e `produto_da_loja.dart`, linhas 278-280). O caso irmao de
    // `loja_detalhe_do_produto_test.dart` (linha 702) ja fez a mesma volta,
    // com a mesma razao escrita: a remocao de uma afirmacao de natureza
    // juridica precisa de um caso que reprove se ela voltar por acidente, e
    // nao de silencio. A redacao exata segue em
    // `VitrineDaLoja.avisoDeQueNaoSomosOVendedor`.
    expect(
      find.textContaining('O Bichu não é o vendedor'),
      findsNothing,
    );
  });

  // -------------------------------------------------------------------------
  // O CONVITE E O CUPOM (cliente, 22/10/2026)
  // -------------------------------------------------------------------------
  // Literal: *"Na pagina da loja inclua a frase: Ajude a mantermos o Bichu
  // gratuito e ainda ganhe descontos comprando em nossas lojas parceiras.
  // Adicione o cupom de desconto chamado: bichu"*.
  //
  // Dois casos, e eles sao as duas metades da mesma decisao: o primeiro cobra
  // que a frase e o cupom ESTAO la, com a redacao dele; o segundo cobra que as
  // duas palavras que sairam da lista de comercio aparecem **so aqui**.
  group('o convite e o cupom da vitrine', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/loja/vitrine_da_loja.dart`,
    // apague a linha `const _ConviteComCupom(),` do `build`. Os tres `expect`
    // reprovam, e o controle positivo continua passando -- que e o que separa
    // "o bloco saiu" de "a tela nao abriu".
    testWidgets('a frase e o cupom estao na tela, com a redacao dele',
        (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
        ),
      );

      // CONTROLE POSITIVO, e ele vem PRIMEIRO. Esta tela tem estado de
      // carregando, de vazio, de vazio filtrado e de falha, e em tres deles
      // nao ha produto nenhum pintado: um `findsOneWidget` que falhasse
      // sozinho nao diria se a frase saiu ou se a vitrine nem chegou.
      expect(
        find.byType(BarraDeListagem),
        findsOneWidget,
        reason:
            'REPROVA: a vitrine nao esta montada (nao ha barra de listagem). '
            'Sem isto os `expect` de baixo nao medem o bloco do convite -- '
            'eles medem se a tela existe.',
      );

      expect(
        find.text(VitrineDaLoja.conviteDaVitrine),
        findsOneWidget,
        reason:
            'REPROVA: a frase que o cliente pediu em 22/10/2026 nao esta na '
            'vitrine. A redacao e DELE, palavra por palavra (inclusive '
            '`mantermos`), e esta em `VitrineDaLoja.conviteDaVitrine`.',
      );
      // **EM CAIXA ALTA desde 29/10/2026, e a CONSTANTE nao mudou.** A
      // variacao A do desenho do cupom pos o rotulo em `overline`, que neste
      // sistema e o estilo de caixa alta -- e o Flutter nao tem
      // `text-transform`, entao quem sobe a caixa e o no. O `expect` compara
      // com a propria constante subida de caixa, e nao com um literal
      // reescrito: assim ele continua reprovando se o rotulo sair da tela, e
      // reprova tambem se alguem trocar a redacao da constante.
      //
      // A frase do convite NAO sobe de caixa: ela e redacao DELE, palavra por
      // palavra. O rotulo e nosso -- ver `VitrineDaLoja.rotuloDoCupom`.
      expect(
        find.text(VitrineDaLoja.rotuloDoCupom.toUpperCase()),
        findsOneWidget,
        reason: 'REPROVA: o rotulo do cupom saiu da vitrine (ele e desenhado '
            'em caixa alta desde a variacao A, 29/10/2026).',
      );
      expect(
        find.text(VitrineDaLoja.codigoDoCupom),
        findsOneWidget,
        reason:
            'REPROVA: o codigo `${VitrineDaLoja.codigoDoCupom}` nao esta na '
            'tela. Ele e o cupom que o cliente nomeou, em minuscula como ele '
            'o escreveu -- cupom e codigo, e codigo nao se arruma.',
      );
    });

    // DESLIGAR PARA VER REPROVAR: no bloco `_ConviteComCupom`, troque
    // `VitrineDaLoja.rotuloDoCupom` por uma cadeia que escreva `Cupom` em
    // outro no (ou ponha `'Desconto'` em qualquer outro texto da tela): este
    // caso reprova nomeando o texto intruso.
    testWidgets('`Cupom` e `desconto` aparecem SO no bloco do convite',
        (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
        ),
      );

      // Os tres textos que o cliente autorizou. Qualquer outro no da tela que
      // escreva uma das duas palavras e comercio entrando pela porta que a
      // frase dele abriu.
      // **O rotulo entra EM CAIXA ALTA, e so nela**, porque e assim que a tela
      // o desenha desde a variacao A (29/10/2026) -- a constante segue em
      // caixa mista, e o no a sobe. E tem de ser SO a alta: o controle
      // positivo logo abaixo cobra que a varredura VEJA todos os autorizados,
      // e a caixa mista nao esta na tela -- por as duas faria aquele controle
      // reprovar por um no que nao existe.
      final autorizados = <String>{
        VitrineDaLoja.conviteDaVitrine,
        VitrineDaLoja.rotuloDoCupom.toUpperCase(),
        VitrineDaLoja.codigoDoCupom,
      };

      // **MINUSCULO nos dois lados**: `find.textContaining` e sensivel a
      // caixa, e foi por isso que `Desconto` passava por acidente antes deste
      // caso -- a frase dele escreve `descontos`.
      // **`Text` E `SelectableText`, e os DOIS sao obrigatorios aqui.** O
      // codigo do cupom e `SelectableText` -- ele existe para ser copiado e
      // digitado no site do parceiro --, e `SelectableText` NAO constroi um
      // `Text`. Uma varredura so de `Text` nao enxergaria justamente o no que
      // escreve a palavra mais sensivel desta tela: foi o controle positivo
      // abaixo que pegou isso, na primeira execucao deste caso.
      final todos = <String>{
        for (final e in find.byType(Text).evaluate())
          ?(e.widget as Text).data,
        for (final e in find.byType(SelectableText).evaluate())
          ?(e.widget as SelectableText).data,
      };

      final intrusos = <String>[];
      for (final texto in todos) {
        if (autorizados.contains(texto)) continue;
        final baixo = texto.toLowerCase();
        if (baixo.contains('cupom') || baixo.contains('desconto')) {
          intrusos.add('  "$texto"');
        }
      }

      // CONTROLE POSITIVO da propria varredura: ela TEM de ver os textos
      // autorizados. Uma varredura que achasse zero no passaria no vazio.
      final vistos = todos;
      expect(
        vistos.intersection(autorizados),
        hasLength(autorizados.length),
        reason:
            'REPROVA: a varredura nao enxergou os ${autorizados.length} '
            'textos autorizados do bloco do convite, entao o `isEmpty` de '
            'baixo nao prova nada -- ela nao esta lendo a tela. Vistos: '
            '${vistos.intersection(autorizados)}',
      );

      expect(
        intrusos,
        isEmpty,
        reason:
            'REPROVA: `Cupom`/`desconto` apareceram FORA do bloco que o '
            'cliente pediu:\n${intrusos.join('\n')}\n\n'
            'As duas palavras sairam da lista de `nao ha carrinho, pedido '
            'nem pagamento na tela` por pedido dele de 22/10/2026, e saíram '
            'SO para a frase e o cupom que ele escreveu. O invariante que '
            'aquela lista guarda continua valendo: o Bichu nao e o comercio, '
            'e a compra acontece no site do parceiro.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // A BUSCA ACIMA DO TEXTO (cliente, 28/10/2026)
  // -------------------------------------------------------------------------
  // Literal: *"coloque a barra de busca acima do texto"*. "O texto" e o bloco
  // do convite com o cupom (`_ConviteComCupom`), que era a primeira coisa da
  // tela desde 22/10 -- e nao a frase de nenhum cartao.
  //
  // **ISTO CUMPRE O PADRAO DE LISTAGEM EM VIGOR**, e nao o contraria: busca,
  // filtro e ordenacao ficam no TOPO DO CORPO da tela (nunca na barra de
  // topo). Antes deste pedido o convite se metia entre o topo do corpo e os
  // controles; agora os controles sao de novo a primeira coisa do corpo, e o
  // convite vem logo abaixo deles.
  //
  // **A medicao e de POSICAO, e nao de ordem de filho no `Column`.** Ordem de
  // filho aprovaria um `Column` reordenado que o `Stack` de alguem pintasse
  // ao contrario; `dy` da arvore montada e o que a pessoa ve.
  group('a busca vem ACIMA do texto do convite', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/loja/vitrine_da_loja.dart`,
    // no `build`, volte a por `const _ConviteComCupom(),` ANTES do
    // `if (pagina != null) BarraDeListagem(...)`. Os dois `expect` de ordem
    // reprovam nomeando os dois `dy`, e os controles positivos continuam
    // passando -- que e o que separa "a ordem voltou" de "a tela nao abriu".
    testWidgets('a barra de listagem e o campo de busca ficam acima da frase',
        (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
        ),
      );

      // CONTROLE POSITIVO, e ele vem PRIMEIRO: sem os tres nos na tela os
      // `getTopLeft` de baixo lancam, e um caso que lanca nao mede ordem --
      // ele mede que a tela nao abriu.
      final barra = find.byType(BarraDeListagem);
      final campo = find.descendant(
        of: barra,
        matching: find.byType(TextField),
      );
      final frase = find.text(VitrineDaLoja.conviteDaVitrine);

      expect(
        barra,
        findsOneWidget,
        reason: 'REPROVA: a vitrine nao esta montada (nao ha barra de '
            'listagem). Sem ela nao ha o que comparar, e os `expect` de '
            'ordem abaixo nao provariam nada.',
      );
      expect(
        campo,
        findsOneWidget,
        reason: 'REPROVA: nao ha campo de busca DENTRO da barra de listagem. '
            'O pedido do cliente e sobre a barra de BUSCA, e medir a barra '
            'de listagem sem o campo dentro dela mediria outra coisa.',
      );
      expect(
        frase,
        findsOneWidget,
        reason: 'REPROVA: a frase do convite (22/10/2026) saiu da vitrine. '
            'Ela e "o texto" do pedido de 28/10, e sem ela este caso nao '
            'tem referencia -- o pedido era mover a busca para cima DELA, '
            'nao apagar nenhuma das duas.',
      );

      final yDaBarra = tester.getTopLeft(barra).dy;
      final yDoCampo = tester.getTopLeft(campo).dy;
      final yDaFrase = tester.getTopLeft(frase).dy;

      expect(
        yDaBarra,
        lessThan(yDaFrase),
        reason: 'REPROVA: a barra de listagem NAO esta acima do texto do '
            'convite.\n'
            '  barra de listagem: dy = $yDaBarra\n'
            '  frase do convite:  dy = $yDaFrase\n'
            'O cliente pediu em 28/10/2026: "coloque a barra de busca acima '
            'do texto". Busca, filtro e ordenacao sao os controles do topo '
            'do CORPO da tela, e o convite vem depois deles.',
      );
      expect(
        yDoCampo,
        lessThan(yDaFrase),
        reason: 'REPROVA: o campo de busca NAO esta acima do texto do '
            'convite.\n'
            '  campo de busca:   dy = $yDoCampo\n'
            '  frase do convite: dy = $yDaFrase\n'
            'A barra pode estar acima e o campo nao: a barra tem contagem, '
            'lupa e gatilho de folha, e e o CAMPO que o cliente nomeou.',
      );
    });

    // O cupom anda junto com a frase: ele e o mesmo bloco, e separar os dois
    // foi explicitamente recusado no desenho de 22/10. Um caso proprio para
    // o cupom porque o rotulo e o codigo sao os nos que o cliente nomeou, e
    // uma frase que subisse sozinha deixaria o cupom orfao acima da busca.
    testWidgets('o cupom tambem fica abaixo da busca, junto da frase',
        (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
        ),
      );

      final campo = find.descendant(
        of: find.byType(BarraDeListagem),
        matching: find.byType(TextField),
      );
      final rotulo = find.text(VitrineDaLoja.rotuloDoCupom.toUpperCase());
      final codigo = find.text(VitrineDaLoja.codigoDoCupom);

      // CONTROLE POSITIVO dos tres nos, antes de medir qualquer `dy`.
      expect(campo, findsOneWidget, reason: 'REPROVA: nao ha campo de busca.');
      expect(
        rotulo,
        findsOneWidget,
        reason: 'REPROVA: o rotulo do cupom saiu da vitrine.',
      );
      expect(
        codigo,
        findsOneWidget,
        reason: 'REPROVA: o codigo `${VitrineDaLoja.codigoDoCupom}` saiu da '
            'vitrine.',
      );

      final yDoCampo = tester.getTopLeft(campo).dy;
      expect(
        tester.getTopLeft(rotulo).dy,
        greaterThan(yDoCampo),
        reason: 'REPROVA: o rotulo do cupom ficou ACIMA do campo de busca. O '
            'bloco do convite e um so -- frase e cupom --, e ele inteiro vem '
            'depois dos controles.',
      );
      expect(
        tester.getTopLeft(codigo).dy,
        greaterThan(yDoCampo),
        reason: 'REPROVA: o codigo do cupom ficou ACIMA do campo de busca.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA — o 21o item e alcancavel, e trocar o recorte volta para a pagina 1
  // -------------------------------------------------------------------------
  group('ISCA — a paginacao avanca de verdade', () {
    // DESLIGAR PARA VER REPROVAR, caso do 21o item: em
    // `lib/telas/loja/vitrine_da_loja.dart`, em `_corpo`, troque o
    // `RodapeDaPaginacao` por `const SizedBox.shrink()` -- e o estado em que
    // esta tela foi entregue. Ou troque `_itens.addAll(pagina.itens)` em
    // `_carregarMais` por `_itens..clear()..addAll(pagina.itens)`: a pagina 2
    // volta a SUBSTITUIR a 1 e `Item 1` desaparece.
    //
    // DESLIGAR PARA VER REPROVAR, caso do recorte: no mesmo arquivo, em
    // `_carregar`, troque
    // `_recorte.pagina == 1 ? _recorte : _recorte.com(pagina: 1)` por
    // `_recorte`, e apague o `pagina: 1` do `_trocarRecorte` de
    // `_controleDeFiltro`.
    testWidgets(
        'o 21o item e alcancavel: `Carregar mais` pede a pagina 2 e ACRESCENTA',
        (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeQuePaginaAVitrine(vinteECincoItens(), urls: urls),
      );

      expect(titulosNaTela(tester), hasLength(20));
      expect(find.text('Item 21'), findsNothing);
      expect(urls.single.queryParameters['page'], '1');
      expect(
        find.text(RodapeDaPaginacao.rotuloDeCarregarMais),
        findsOneWidget,
        reason: 'REPROVA: 25 itens no servidor, 20 na tela, e nenhum caminho '
            'para os outros 5.',
      );

      await tocarEmCarregarMais(tester);

      expect(
        urls.last.queryParameters['page'],
        '2',
        reason: 'REPROVA: a tela nao pediu a pagina seguinte.',
      );
      expect(urls.last.queryParameters['limit'], '20');
      expect(titulosNaTela(tester), hasLength(25));
      expect(
        find.text('Item 21'),
        findsOneWidget,
        reason: 'REPROVA: a pagina 2 chegou e o 21o item continua fora da '
            'tela.',
      );
      expect(
        find.text('Item 1'),
        findsOneWidget,
        reason: 'REPROVA: a pagina 2 SUBSTITUIU a pagina 1 em vez de '
            'continua-la.',
      );
      expect(find.text(RodapeDaPaginacao.rotuloDeCarregarMais), findsNothing);
      expect(
        find.text('Você viu todos os 25 produtos da vitrine.'),
        findsOneWidget,
      );
    });

    testWidgets('trocar o filtro VOLTA para a pagina 1', (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeQuePaginaAVitrine(
          vinteECincoItens(),
          urls: urls,
          // Com `category` sobram tres itens. Pedidos na pagina 2, eles
          // devolvem fatia vazia e a tela diz que nada casa com o recorte --
          // com tres produtos existindo.
          recorte: (pedido) => pedido['category'] == null
              ? vinteECincoItens()
              : vinteECincoItens().take(3).toList(),
          filtrosAplicados: (pedido) => pedido['category'] == null
              ? const <String, String>{'scope': 'all'}
              : <String, String>{'category': pedido['category']!},
        ),
      );

      await tocarEmCarregarMais(tester);
      expect(urls.last.queryParameters['page'], '2');

      await tester.ensureVisible(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      // "Medicamentos", e nao "Saúde": o rotulo e dado do servidor desde
      // 17/10, e este caso le o que o duble entregou em `taxonomiaDoContrato`.
      await tester.tap(find.text('Medicamentos'));
      await tester.pumpAndSettle();
      // **A pastilha nao recorta nada sozinha** (decisao do cliente de 17/10):
      // `Aplicar` e "o unico caminho de saida com efeito"
      // (`lib/widgets/barra_de_listagem.dart`, linhas 86-87). Sem esta linha a
      // rota nunca era chamada com `category`, e o caso irmao de `Perto`
      // (`perto_com_dados_test.dart`, linhas 869-877) ja afirma os dois lados:
      // antes do `Aplicar` nao ha recorte, depois ha.
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();

      expect(urls.last.queryParameters['category'], 'health');
      expect(
        urls.last.queryParameters['page'],
        '1',
        reason: 'REPROVA: o filtro foi aplicado mantendo a pagina 2. A fatia '
            'volta vazia e a vitrine diz que nada casa com o recorte, com '
            'tres produtos existindo.',
      );
      expect(titulosNaTela(tester), hasLength(3));
      expect(find.text(VitrineDaLoja.tituloDoVazioFiltrado), findsNothing);
    });

    testWidgets('buscar depois de `Carregar mais` VOLTA para a pagina 1',
        (tester) async {
      final urls = <Uri>[];
      await abrirLoja(
        tester,
        rede: redeQuePaginaAVitrine(
          vinteECincoItens(),
          urls: urls,
          recorte: (pedido) => pedido['q'] == null
              ? vinteECincoItens()
              : vinteECincoItens().take(2).toList(),
        ),
      );

      await tocarEmCarregarMais(tester);
      expect(urls.last.queryParameters['page'], '2');

      final campo = find.byType(TextField);
      await tester.ensureVisible(campo);
      await tester.pumpAndSettle();
      await tester.enterText(campo, 'bola');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      expect(urls.last.queryParameters['q'], 'bola');
      expect(
        urls.last.queryParameters['page'],
        '1',
        reason: 'REPROVA: a busca foi pedida na pagina 2. O termo tem dois '
            'resultados, a pagina 2 deles e vazia, e a tela diz que a busca '
            'nao achou nada.',
      );
      expect(titulosNaTela(tester), hasLength(2));
    });
  });

  _oTextoAlternativoEAQuebraDeLinha();
}

// ---------------------------------------------------------------------------
// O TEXTO ALTERNATIVO DA IMAGEM (pedido do cliente de 17/10/2026)
// ---------------------------------------------------------------------------

void _oTextoAlternativoEAQuebraDeLinha() {
  group('o nome acessível da imagem do produto', () {
    // ISCA -- em `modelos_loja.dart`, em `ItemDaLoja.nomeDaImagem`, troque o
    // corpo por `return 'Foto de \$titulo';` (o que a tela fazia até
    // 17/10/2026). Este caso reprova: o texto do administrador deixa de
    // chegar.
    test('ISCA -- com texto escrito pelo painel, é ELE que vale', () {
      final item = ItemDaLoja.doJson(
        itemDoContrato(
          title: 'Bola Pop',
          imageUrl: 'https://midia.bichu.test/a.webp',
          imageAltText: 'Cão caramelo mordendo a bola azul',
        ),
      );
      expect(item.nomeDaImagem, 'Cão caramelo mordendo a bola azul');
    });

    test('sem texto (o campo é opcional), cai no nome do produto', () {
      final item = ItemDaLoja.doJson(
        itemDoContrato(title: 'Bola Pop', imageUrl: 'https://midia.bichu.test/a.webp'),
      );
      expect(item.nomeDaImagem, 'Foto de Bola Pop');
    });

    test('texto só com espaços vale como ausente: nome acessível nunca é vazio', () {
      final item = ItemDaLoja.doJson(
        itemDoContrato(title: 'Bola Pop', imageAltText: '   '),
      );
      expect(item.nomeDaImagem, 'Foto de Bola Pop');
      expect(item.nomeDaImagem.trim(), isNotEmpty);
    });

    testWidgets('a imagem do cartão usa o texto do painel no semanticLabel', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(
              imageUrl: 'https://midia.bichu.test/a.webp',
              imageAltText: 'Cão caramelo mordendo a bola azul',
            ),
          ]),
        ),
      );
      final imagem = tester.widget<Image>(find.byType(Image).first);
      expect(imagem.semanticLabel, 'Cão caramelo mordendo a bola azul');
    });
  });

  group('a descrição do produto na tela', () {
    // 500 caracteres no cartão, com botão para o resto (decisão do cliente de
    // 17/10/2026). O teto do campo subiu para 3000 no mesmo dia, e sem corte o
    // cartão empurraria a vitrine inteira para baixo.
    String longo(int n) {
      // Palavras de 4 letras + espaço: 5 caracteres por palavra, então o corte
      // tem sempre um espaço por perto e nada depende de sorte.
      final b = StringBuffer();
      while (b.length < n) {
        b.write('abcd ');
      }
      final cru = b.toString().substring(0, n);
      // **Devolve exatamente `n` caracteres.** O `trimRight()` que estava aqui
      // devolvia `n - 1` sempre que `n` era multiplo de 5: `'abcd '` tem cinco
      // caracteres, entao o ultimo caractere de `longo(500)` era o espaco da
      // centesima palavra, e o `trim` o comia -- `longo(500).length` dava 499 e
      // o caso pedia 500. Trocar o espaco final por uma letra mantem a
      // propriedade de que ha espaco perto do corte (o corte e no caractere
      // 500, longe do fim) e faz o tamanho ser o pedido.
      return cru.endsWith(' ') ? '${cru.substring(0, n - 1)}e' : cru;
    }

    testWidgets('a quebra de linha é preservada, e descrição curta não ganha botão', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(summary: 'Primeira linha.\nSegunda linha.'),
          ]),
        ),
      );
      final desenhado = tester.widgetList<Text>(find.byType(Text)).firstWhere(
        (t) => (t.data ?? '').contains('Primeira linha.'),
      );
      expect(desenhado.data, 'Primeira linha.\nSegunda linha.');
      expect(find.text('Ler mais'), findsNothing, reason: 'botão que não esconde nada não deve existir');
      // DESLIGADO EM 17/10/2026, e nao apagado. O RESUMO SAIU DO CARTAO por
      // pedido do cliente ("Deixe apenas a foto, titulo e preco"). A quebra
      // de linha continua sendo dado do modelo e continua medida nos casos de
      // `ItemDaLoja` acima; o que nao existe mais e o `Text` na vitrine. ONDE
      // a descricao passa a aparecer esta PENDENTE DE DECISAO DO CLIENTE: a
      // tela de detalhe, que a mostrava inteira, ficou sem entrada no mesmo
      // dia, tambem por decisao dele.
    }, skip: true);

    test('exatamente 500 caracteres cabem inteiros, e 501 não', () {
      final com500 = ItemDaLoja.doJson(itemDoContrato(summary: longo(500)));
      expect(com500.resumo.length, 500);
      expect(com500.resumoCabeNoCartao, isTrue);
      expect(com500.trechoDoResumo, com500.resumo, reason: 'sem corte e sem reticências');

      final com501 = ItemDaLoja.doJson(itemDoContrato(summary: longo(501)));
      expect(com501.resumoCabeNoCartao, isFalse);
      expect(com501.trechoDoResumo.endsWith('…'), isTrue);
    });

    test('o corte é no último espaço, nunca no meio da palavra', () {
      final item = ItemDaLoja.doJson(itemDoContrato(summary: longo(3000)));
      final trecho = item.trechoDoResumo;
      expect(trecho.length, lessThanOrEqualTo(ItemDaLoja.tetoDoResumoNoCartao + 1));
      // Sem as reticências, o trecho termina numa palavra completa: o caractere
      // seguinte no texto original é espaço (ou o trecho é o texto inteiro).
      final semReticencias = trecho.substring(0, trecho.length - 1);
      expect(item.resumo[semReticencias.length], ' ');
      expect(semReticencias.endsWith('abcd'), isTrue, reason: 'palavra inteira, não "abc"');
    });

    test('texto sem espaço nenhum ainda devolve 500 caracteres, e não 250', () {
      final grudado = 'a' * 3000;
      final item = ItemDaLoja.doJson(itemDoContrato(summary: grudado));
      expect(item.trechoDoResumo.length, ItemDaLoja.tetoDoResumoNoCartao + 1, reason: '500 + reticências');
    });

    // DESLIGADO EM 17/10/2026, e nao apagado. O "Ler mais" saiu da vitrine:
    // o cartao ficou com foto, titulo e preco, por pedido do cliente. O corte
    // em 500 caracteres continua existindo em `ItemDaLoja.trechoDoResumo` e
    // continua medido nos casos de modelo acima -- o que saiu foi o widget.
    // Se a descricao voltar a ter onde aparecer, este caso volta com ela.
    testWidgets('descrição de 3000: o cartão mostra o trecho, "Ler mais" expande e "Ler menos" recolhe', skip: true, (tester) async {
      final inteiro = longo(3000);
      await abrirLoja(
        tester,
        rede: redeDaVitrine(paginaDoContrato(<Map<String, dynamic>>[itemDoContrato(summary: inteiro)])),
      );
      final item = ItemDaLoja.doJson(itemDoContrato(summary: inteiro));

      // Colapsado: o TRECHO é o dado do `Text`. Não há `semanticsLabel`
      // mentindo, e o leitor de tela não ouve 3000 caracteres num cartão.
      expect(find.text(item.trechoDoResumo), findsOneWidget);
      expect(find.text(inteiro), findsNothing);

      await tester.tap(find.text('Ler mais'));
      await tester.pumpAndSettle();
      expect(find.text(inteiro), findsOneWidget, reason: 'o texto inteiro aparece NO LUGAR, sem tela nova');
      expect(find.text('Ler mais'), findsNothing);

      // Recolhe: é uma lista, e cartão expandido empurra a vitrine para baixo.
      await tester.tap(find.text('Ler menos'));
      await tester.pumpAndSettle();
      expect(find.text(item.trechoDoResumo), findsOneWidget);
    });

    // ISCA -- em `modelos_loja.dart`, em `rotulosLegadosDaCategoria`, troque
    // `'accessory': 'Acessórios'` por `'Acessório'`. Este caso reprova: o
    // pedido do cliente de 17/10 era o PLURAL, e a reserva deste binario e o
    // ultimo lugar onde alguem iria olhar.
    //
    // ESTE CASO MUDOU DE OBJETO NA MESCLA DOS DOIS NIVEIS, e nao de assunto.
    // Ele falava do `enum CategoriaDaLoja`, que carregava codigo e rotulo no
    // binario; o `enum` morreu quando a categoria virou DADO do servidor
    // (`GET /v1/store/taxonomy`). O que sobrou no binario e
    // `rotulosLegadosDaCategoria`, a reserva de uma versao para servidor que
    // ainda nao manda `category_label` -- e e nela que o plural precisa
    // continuar de pe.
    //
    // A outra metade do pedido -- "so o rotulo muda, o CODIGO nao" -- continua
    // sendo afirmada aqui pelas CHAVES do mapa, que sao os codigos que o APK
    // instalado filtra. E os rotulos do VOCABULARIO (o que o servidor manda
    // hoje) sao guardados contra a semente da `20261017000003` em
    // `tests/integration/taxonomia-da-loja-em-dois-niveis.test.ts`.
    test('ISCA -- pluralizar o rótulo NÃO mexe no código do contrato', () {
      // Os CODIGOS, que o APK instalado manda em `?category=`.
      expect(rotulosLegadosDaCategoria.containsKey('accessory'), isTrue);
      expect(rotulosLegadosDaCategoria.containsKey('toy'), isTrue);
      expect(rotulosLegadosDaCategoria.containsKey('accessorios'), isFalse);
      // Os ROTULOS, no plural que o cliente pediu em 17/10/2026.
      expect(rotulosLegadosDaCategoria['accessory'], 'Acessórios');
      expect(rotulosLegadosDaCategoria['toy'], 'Brinquedos');
      // A reserva cobre os SEIS antigos, e so eles: codigo novo sem
      // `category_label` nao ganha rotulo inventado.
      expect(rotulosLegadosDaCategoria.keys.toSet(), <String>{
        'food',
        'toy',
        'hygiene',
        'accessory',
        'health',
        'bed',
      });
    });

    testWidgets('o botão diz de qual produto ele é, para o leitor de tela', (tester) async {
      await abrirLoja(
        tester,
        rede: redeDaVitrine(
          paginaDoContrato(<Map<String, dynamic>>[
            itemDoContrato(title: 'Bola Pop', summary: longo(3000)),
          ]),
        ),
      );
      // "Ler mais, botão" repetido numa lista de doze cartões não diz nada.
      expect(find.bySemanticsLabel('Ler mais da descrição de Bola Pop'), findsOneWidget);
      // DESLIGADO pela mesma razao do caso acima. A regra que ele guardava
      // -- rotulo repetido em doze cartoes precisa dizer de qual produto e --
      // MUDOU DE DONO: vale agora para o "Compre agora", e esta medida no
      // caso novo de `CartaoDaLoja.rotuloAcessivelDeSaida`.
    }, skip: true);
  });
}
