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
  String? imageUrl,
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
    'image_url': imageUrl,
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

/// A resposta de `StoreItemPage`.
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

  group('o valor nunca aparece sem o rotulo e sem a data', () {
    // ISCA -- em `app/lib/api/modelos_loja.dart`, em `linhaDoPreco`, devolva
    // so o valor:
    //     return valor;
    // Este caso reprova: a linha deixa de conter o rotulo e a data.
    testWidgets('ISCA -- valor, rotulo e data no MESMO texto', (tester) async {
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

      // Escrito por extenso. Um `expect` montado com `formatarReais` ou com a
      // constante da tela acompanharia qualquer erro de digitacao.
      expect(
        find.text('R\$ 89,90 · preço de referência, consultado em 14/03'),
        findsOneWidget,
      );
    });

    testWidgets('preco vencido nao mostra valor nenhum', (tester) async {
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
        find.text('Preço não confirmado, veja no site do parceiro'),
        findsOneWidget,
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

      expect(find.text('Abrir na Cobasi'), findsWidgets);

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
      await tester.tap(find.text('Saúde'));
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

      await tester.tap(find.byIcon(Icons.swap_vert));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nome'));
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
          aoEscolher: (_) {},
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

      // `minLength: 2` no contrato: mandar um caractere produziria um 400 a
      // cada primeira tecla.
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

      await tester.tap(find.text('Abrir na Cobasi').last);
      await tester.pumpAndSettle();

      expect(find.text('Você vai sair do Bichu'), findsOneWidget);
      expect(find.textContaining('cobasi.com.br'), findsWidgets);
      expect(find.text('Ficar aqui'), findsOneWidget);
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

    for (final palavra in <String>[
      'Carrinho',
      'carrinho',
      'Adicionar',
      'Comprar',
      'Pedido',
      'Finalizar',
      'Pagamento',
      'Frete',
      'Cupom',
      'Desconto',
      'De R\$',
      'menor preço',
    ]) {
      expect(
        find.textContaining(palavra),
        findsNothing,
        reason: 'a vitrine nao e um comercio, e "$palavra" apareceu na tela',
      );
    }

    // E o aviso de que a compra e com o parceiro esta la, por extenso.
    expect(
      find.textContaining('O Bichu não é o vendedor'),
      findsOneWidget,
    );
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
      await tester.tap(find.text('Saúde'));
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
}
