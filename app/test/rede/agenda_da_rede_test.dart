// A agenda da `Rede` no desenho novo (design system 24.14 a 24.17, UX 28.7.4).
//
// Todo esperado esta escrito por extenso, com acento: nenhum `expect` compara
// o texto renderizado com a constante que o produz.

import 'package:bichu/telas/rede/cartao_do_encontro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:bichu/escopo.dart';

import '../telas/ajuda_de_tela.dart';
import 'fixtures_da_rede.dart';

/// Uma `NetworkEventPage` com `total` maior que a pagina.
Map<String, dynamic> paginaFixa(List<Map<String, dynamic>> itens, int total) =>
    pagina(itens, total: total);

RedeDeTeste redeComAgenda({
  List<Map<String, dynamic>>? proximos,
  List<Map<String, dynamic>>? encerrados,
  Map<String, dynamic>? porPertoCorpo,
  Map<String, dynamic>? pedidos,
}) {
  return RedeDeTeste(<String, http.Response Function(http.Request)>{
    'GET /v1/network/events': (req) {
      final quando = req.url.queryParameters['when'];
      if (quando == 'past') {
        return json200(
          pagina(
            encerrados ?? <Map<String, dynamic>>[],
            ordemEfetiva: 'recentes',
            quandoEfetivo: 'past',
          ),
        );
      }
      return json200(
        pagina(
          proximos ??
              <Map<String, dynamic>>[encontroPublico(), teaserPrivado()],
        ),
      );
    },
    'GET /v1/network/events/nearby': (req) => json200(
          porPertoCorpo ??
              paginaPorPerto(<Map<String, dynamic>>[
                porPerto(encontroPublico(), 1200),
              ]),
        ),
    'GET /v1/network/join-requests': (req) => json200(
          pedidos ?? paginaDePedidos(<Map<String, dynamic>>[]),
        ),
  });
}

void main() {
  group('abas', () {
    testWidgets('sem conta: Próximos e Encerrados, e Meus pedidos não existe',
        (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede, logado: false);

      expect(find.widgetWithText(Tab, 'Próximos'), findsOneWidget);
      expect(find.widgetWithText(Tab, 'Encerrados'), findsOneWidget);
      expect(find.widgetWithText(Tab, 'Meus pedidos'), findsNothing);

      final lista = rede.chamadasA('GET /v1/network/events');
      expect(lista, isNotEmpty);
      expect(lista.last.url.queryParameters['when'], 'upcoming');
      // Sem conta, nenhuma pergunta com token sai.
      expect(rede.chamadasA('GET /v1/network/events/nearby'), isEmpty);
      expect(lista.last.headers['Authorization'], isNull);
    });

    testWidgets('com conta: as três abas', (tester) async {
      await abrirRede(tester, rede: redeComAgenda());
      expect(find.widgetWithText(Tab, 'Próximos'), findsOneWidget);
      expect(find.widgetWithText(Tab, 'Meus pedidos'), findsOneWidget);
      expect(find.widgetWithText(Tab, 'Encerrados'), findsOneWidget);
    });

    testWidgets('Encerrados pede when=past e não tem botão de ordenar',
        (tester) async {
      final rede = redeComAgenda(
        encerrados: <Map<String, dynamic>>[
          encontroPublico(status: 'ended', title: 'Tarde dos filhotes'),
        ],
      );
      await abrirRede(tester, rede: rede);
      await tester.tap(find.widgetWithText(Tab, 'Encerrados'));
      await tester.pumpAndSettle();

      expect(
        rede.chamadasA('GET /v1/network/events').last.url.queryParameters['when'],
        'past',
      );
      expect(find.text('Tarde dos filhotes'), findsOneWidget);
      expect(find.text('1 encontro · Mais recente primeiro'), findsOneWidget);
      expect(find.byTooltip('Ordenar, Mais recente primeiro'), findsNothing);
    });
  });

  group('cartões', () {
    testWidgets('público: data, horário no fuso do evento, lugar e valor',
        (tester) async {
      await abrirRede(
        tester,
        rede: redeComAgenda(
          proximos: <Map<String, dynamic>>[
            encontroPublico(
              admissionKind: 'paid',
              price: <String, dynamic>{
                'amount': 1500,
                'currency': 'BRL',
                'unit': 'per_dog',
              },
            ),
          ],
        ),
        logado: false,
      );

      expect(find.text('Passeio matinal na Benedito Calixto'), findsOneWidget);
      // 12:00Z e 9h em America/Sao_Paulo, qualquer que seja o fuso do
      // aparelho de teste.
      expect(find.text('Sábado, 3 de outubro · Das 9h às 11h'), findsOneWidget);
      expect(find.text('Praça Benedito Calixto · Pinheiros'), findsOneWidget);
      expect(find.text('R\$ 15 por cão'), findsOneWidget);
      // Sem selo "Público": o normal não tem selo (UX 28.7.2).
      expect(find.text('Público'), findsNothing);
    });

    testWidgets('ISCA -- teaser privado: só título, data e o selo Privado',
        (tester) async {
      // ISCA: em `cartao_do_encontro.dart`, troque
      //     if (e is EncontroPublico) seloDeValor(e.entrada),
      // por um selo fixo `Gratuito` para os dois casos. Este caso reprova no
      // `expect` de `Gratuito`.
      await abrirRede(
        tester,
        rede: redeComAgenda(proximos: <Map<String, dynamic>>[teaserPrivado()]),
        logado: false,
      );

      expect(find.text('Clube dos border collies'), findsOneWidget);
      expect(find.text('Domingo, 4 de outubro'), findsOneWidget);
      expect(find.text('Privado'), findsOneWidget);
      expect(find.text('Gratuito'), findsNothing);
      // Sem capa: o banner da marca e pintado, nao baixado.
      expect(find.byType(Image), findsNothing);
      // Nenhum horario: o teaser nao tem.
      expect(textoDaTela(tester), isNot(contains('Das ')));
    });

    testWidgets('cancelado: o nome acessível começa por "Cancelado:"',
        (tester) async {
      final semantica = tester.ensureSemantics();
      await abrirRede(
        tester,
        rede: redeComAgenda(
          proximos: <Map<String, dynamic>>[
            encontroPublico(status: 'cancelled', title: 'Manhã dos labradores'),
          ],
        ),
        logado: false,
      );
      expect(find.text('Cancelado'), findsOneWidget);
      expect(
        find.bySemanticsLabel(RegExp(r'^Cancelado: Manhã dos labradores')),
        findsOneWidget,
      );
      semantica.dispose();
    });
  });

  group('distância pela região cadastrada', () {
    testWidgets(
        'com conta, a segunda pergunta é listNearbyNetworkEvents com '
        'sort=proximos, e o cartão público mostra a distância', (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede);

      final perto = rede.chamadasA('GET /v1/network/events/nearby');
      expect(perto, hasLength(1));
      expect(perto.single.url.queryParameters['sort'], 'proximos');
      // Nenhuma coordenada sai do aparelho: o servidor usa a regiao gravada.
      for (final chave in <String>['lat', 'lon', 'latitude', 'longitude']) {
        expect(perto.single.url.queryParameters.containsKey(chave), isFalse);
      }
      expect(perto.single.headers['Authorization'], startsWith('Bearer '));
      expect(find.text('A cerca de 1 km da sua região'), findsOneWidget);
    });

    testWidgets('ISCA -- a distância nunca aparece em privado', (tester) async {
      // ISCA: em `agenda_da_rede.dart`, troque
      //     distancia: e is EncontroPublico ? medidas[e.slug] : null,
      // por `distancia: medidas[e.slug]`, e em
      // `CartaoDoEncontro.distanciaVisivel` apague a linha
      //     if (encontro is! EncontroPublico) return null;
      // Este caso reprova: a resposta abaixo traz, fora do contrato, o
      // privado com medida.
      final rede = redeComAgenda(
        proximos: <Map<String, dynamic>>[teaserPrivado()],
        porPertoCorpo: paginaPorPerto(<Map<String, dynamic>>[
          <String, dynamic>{...teaserPrivado(), 'distance_m': 800},
        ]),
      );
      await abrirRede(tester, rede: rede);

      expect(find.text('Clube dos border collies'), findsOneWidget);
      expect(textoDaTela(tester), isNot(contains('da sua região')));
      final cartao = tester.widget<CartaoDoEncontro>(find.byType(CartaoDoEncontro));
      expect(
        CartaoDoEncontro.distanciaVisivel(cartao.encontro, 800),
        isNull,
      );
    });

    testWidgets('encerrado e cancelado não mostram distância', (tester) async {
      await abrirRede(
        tester,
        rede: redeComAgenda(
          proximos: <Map<String, dynamic>>[
            encontroPublico(status: 'cancelled'),
          ],
          porPertoCorpo: paginaPorPerto(<Map<String, dynamic>>[
            porPerto(encontroPublico(status: 'cancelled'), 1200),
          ]),
        ),
      );
      expect(textoDaTela(tester), isNot(contains('da sua região')));
    });

    testWidgets(
        'sem região cadastrada: nenhuma pergunta de distância, e Mais perto '
        'e Distância não existem', (tester) async {
      // ISCA: em `agenda_da_rede.dart`, troque `_temRegiao` por `true`. A
      // pergunta de distancias sai para a conta sem regiao e este caso
      // reprova no registro da rede.
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede, comRegiao: false);

      expect(rede.chamadasA('GET /v1/network/events/nearby'), isEmpty);
      expect(find.byTooltip('Ordenar, Data mais próxima'), findsNothing);
      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();
      expect(find.text('Distância'), findsNothing);
    });

    testWidgets('Mais perto troca a lista para listNearbyNetworkEvents',
        (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede);

      await tester.tap(find.byTooltip('Ordenar, Data mais próxima'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Mais perto usa a região do seu perfil. Os encontros sem mapa ficam '
          'no fim, e os privados saem da lista.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Mais perto'));
      await tester.pumpAndSettle();

      expect(
        rede
            .chamadasA('GET /v1/network/events/nearby')
            .last
            .url
            .queryParameters['sort'],
        'distancia',
      );
    });
  });

  group('filtros do contrato', () {
    testWidgets('Próximos oferece os grupos da §24.17.3', (tester) async {
      await abrirRede(tester, rede: redeComAgenda());
      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();

      for (final t in <String>[
        'Quando',
        'Hoje',
        'Este fim de semana',
        'Próximos 30 dias',
        'Valor',
        'Gratuito',
        'Pago',
        'Público ou privado',
        'Cidade',
        'Porte do cão',
        'Pequeno',
        'Gigante',
        'Distância',
        'Até 2 km',
      ]) {
        expect(find.text(t), findsWidgets, reason: 'falta "$t" na folha');
      }
    });

    testWidgets('Pago manda admission=paid e Porte manda size', (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede, logado: false);

      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pago'));
      await tester.pumpAndSettle();
      expect(
        rede.chamadasA('GET /v1/network/events').last.url.queryParameters['admission'],
        'paid',
      );

      await tester.tap(find.byTooltip('Filtrar, 1 filtro ativo'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Grande'));
      await tester.tap(find.text('Grande'));
      await tester.pumpAndSettle();
      final q = rede.chamadasA('GET /v1/network/events').last.url.queryParameters;
      expect(q['size'], 'G');
      expect(q['admission'], 'paid');
    });

    testWidgets('Hoje manda when=today', (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede, logado: false);
      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hoje'));
      await tester.pumpAndSettle();
      expect(
        rede.chamadasA('GET /v1/network/events').last.url.queryParameters['when'],
        'today',
      );
    });
  });

  group('Meus pedidos', () {
    testWidgets(
        'ISCA -- lista os pedidos com a pílula do app, e "recusado" não existe',
        (tester) async {
      // ISCA: em `modelos_rede.dart`, acrescente a `EstadoDoPedido`
      //     recusado('declined', 'Pedido não aprovado'),
      // e responda `declined` abaixo. O portao de conformidade reprova o
      // valor que o contrato nao tem, e este caso reprova pelo texto.
      final rede = redeComAgenda(
        pedidos: paginaDePedidos(<Map<String, dynamic>>[
          <String, dynamic>{
            'event': teaserPrivado(),
            'state': 'requested',
            'requested_at': '2026-09-28T12:00:00Z',
          },
          <String, dynamic>{
            'event': teaserPrivado(slug: 'p9w3z1', title: 'Caminhada das seis'),
            'state': 'approved',
            'requested_at': '2026-09-27T12:00:00Z',
          },
          // Fora do contrato: um servidor que vazasse a recusa. O app nao
          // tem para onde leva-la.
          <String, dynamic>{
            'event': teaserPrivado(slug: 'r4v8t2', title: 'Treino de faro'),
            'state': 'declined',
            'requested_at': '2026-09-26T12:00:00Z',
          },
        ]),
      );
      await abrirRede(tester, rede: rede);
      await tester.tap(find.widgetWithText(Tab, 'Meus pedidos'));
      await tester.pumpAndSettle();

      expect(rede.chamadasA('GET /v1/network/join-requests'), hasLength(1));
      expect(
        rede
            .chamadasA('GET /v1/network/join-requests')
            .single
            .url
            .queryParameters['sort'],
        'proximos',
      );
      expect(find.text('Pedido enviado'), findsNWidgets(2));
      expect(find.text('Pedido aprovado'), findsOneWidget);

      final tela = textoDaTela(tester).toLowerCase();
      for (final proibido in <String>['recusad', 'não aprovado', 'negad']) {
        expect(tela, isNot(contains(proibido)));
      }

      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();
      expect(find.text('Situação do pedido'), findsOneWidget);
      expect(find.text('Enviado'), findsOneWidget);
      expect(find.text('Aprovado'), findsOneWidget);
      expect(find.text('Recusado'), findsNothing);
      // `listMyNetworkEventJoinRequests` nao aceita `admission` nem `size`.
      expect(find.text('Valor'), findsNothing);
      expect(find.text('Porte do cão'), findsNothing);
    });

    testWidgets('vazio de Meus pedidos', (tester) async {
      await abrirRede(tester, rede: redeComAgenda());
      await tester.tap(find.widgetWithText(Tab, 'Meus pedidos'));
      await tester.pumpAndSettle();
      expect(find.text('Nenhum pedido ainda'), findsOneWidget);
      expect(
        find.text(
          'Quando você pedir para participar de um encontro privado, ele '
          'aparece aqui.',
        ),
        findsOneWidget,
      );
    });
  });

  group('estados da lista', () {
    testWidgets('vazio sem recorte: a barra não aparece', (tester) async {
      await abrirRede(
        tester,
        rede: redeComAgenda(proximos: <Map<String, dynamic>>[]),
        logado: false,
      );
      expect(find.text('A Rede ainda não tem encontros'), findsOneWidget);
      expect(
        find.text(
          'Os encontros da comunidade em praças e parques aparecem aqui assim '
          'que forem marcados.',
        ),
        findsOneWidget,
      );
      expect(find.byTooltip('Filtrar'), findsNothing);
    });

    testWidgets('vazio com busca: título com o termo e Limpar busca',
        (tester) async {
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (req) => json200(
              pagina(
                req.url.queryParameters['q'] == null
                    ? <Map<String, dynamic>>[encontroPublico()]
                    : <Map<String, dynamic>>[],
              ),
            ),
      });
      await abrirRede(tester, rede: rede, logado: false);
      await tester.enterText(find.byType(TextField).first, 'agility');
      await tester.pumpAndSettle();

      expect(find.text('Nenhum encontro com “agility”'), findsOneWidget);
      expect(
        find.text('Tente outra palavra, outro período ou menos filtros.'),
        findsOneWidget,
      );
      expect(find.text('0 encontros · Data mais próxima'), findsOneWidget);
      await tester.tap(find.text('Limpar busca'));
      await tester.pumpAndSettle();
      expect(find.text('Passeio matinal na Benedito Calixto'), findsOneWidget);
    });

    testWidgets('falha: a faixa com Atualizar', (tester) async {
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (_) => problema('internal-error', 500),
      });
      await abrirRede(tester, rede: rede, logado: false);
      expect(
        find.text('Não conseguimos carregar os encontros agora.'),
        findsOneWidget,
      );
      expect(find.text('Atualizar'), findsOneWidget);
    });
  });

  group('paginação', () {
    List<Map<String, dynamic>> encontros(int de, int ate) => <Map<String, dynamic>>[
          for (var i = de; i <= ate; i++)
            encontroPublico(slug: 'encontro-$i', title: 'Encontro $i'),
        ];

    RedeDeTeste redePaginada({bool segundaFalha = false}) {
      return RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (req) {
          final pagina = req.url.queryParameters['page'];
          if (pagina == '2') {
            if (segundaFalha) return problema('internal-error', 500);
            return json200(<String, dynamic>{
              ...paginaFixa(encontros(21, 25), 25),
              'page': 2,
            });
          }
          return json200(paginaFixa(encontros(1, 20), 25));
        },
        'GET /v1/network/events/nearby': (req) {
          final pagina = req.url.queryParameters['page'];
          final itens = pagina == '2' ? encontros(21, 25) : encontros(1, 20);
          return json200(<String, dynamic>{
            ...paginaPorPerto(<Map<String, dynamic>>[
              for (final e in itens) porPerto(e, 1500),
            ]),
            'page': int.parse(pagina ?? '1'),
            'total': 25,
          });
        },
      });
    }

    testWidgets(
        'ISCA -- Carregar mais pede a página 2 e soma os cartões, e as '
        'distâncias seguem a lista, não a página', (tester) async {
      // ISCA: em `RecorteDaRede.copiar`, ignore o parametro `pagina`. O
      // pedido da pagina 2 sai como pagina 1 e este caso reprova.
      final rede = redePaginada();
      await abrirRede(tester, rede: rede);
      expect(find.text('Mostrando 1 a 20 de 25'), findsOneWidget);
      expect(rede.chamadasA('GET /v1/network/events/nearby'), hasLength(1));

      await tester.ensureVisible(find.text('Carregar mais encontros'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Carregar mais encontros'));
      await tester.pumpAndSettle();

      final lista = rede.chamadasA('GET /v1/network/events');
      expect(lista.last.url.queryParameters['page'], '2');
      expect(find.text('Mostrando 1 a 25 de 25'), findsOneWidget);
      expect(find.text('Carregar mais encontros'), findsNothing);
      // Os cinco novos nao tinham medida: a proxima pagina de distancias sai.
      final perto = rede.chamadasA('GET /v1/network/events/nearby');
      expect(perto, hasLength(2));
      expect(perto.last.url.queryParameters['page'], '2');
    });

    testWidgets('falha na página seguinte: os cartões ficam e Tentar de novo',
        (tester) async {
      await abrirRede(tester, rede: redePaginada(segundaFalha: true), logado: false);
      await tester.ensureVisible(find.text('Carregar mais encontros'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Carregar mais encontros'));
      await tester.pumpAndSettle();
      expect(find.text('Não conseguimos carregar mais encontros.'), findsOneWidget);
      expect(find.text('Tentar de novo'), findsOneWidget);
      expect(find.text('Mostrando 1 a 20 de 25'), findsOneWidget);
    });
  });

  group('busca', () {
    testWidgets(
        'ISCA -- espera 300 ms, não pergunta com 1 caractere e não repete as '
        'distâncias', (tester) async {
      // ISCA: em `_controleDeBusca`, troque o `Timer(esperaDaBusca, ...)`
      // pela chamada direta de `_trocarRecorte`. Cada tecla vira pergunta e
      // este caso reprova na contagem.
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede);
      final antes = rede.chamadasA('GET /v1/network/events').length;
      final pertoAntes = rede.chamadasA('GET /v1/network/events/nearby').length;

      final campo = find.byType(TextField).first;
      await tester.enterText(campo, 'a');
      await tester.pump(const Duration(milliseconds: 400));
      expect(rede.chamadasA('GET /v1/network/events'), hasLength(antes));

      for (final t in <String>['ag', 'agi', 'agil', 'agility']) {
        await tester.enterText(campo, t);
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(rede.chamadasA('GET /v1/network/events'), hasLength(antes));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      final depois = rede.chamadasA('GET /v1/network/events');
      expect(depois, hasLength(antes + 1));
      expect(depois.last.url.queryParameters['q'], 'agility');
      // As distancias nao dependem do termo: nenhuma pergunta nova.
      expect(rede.chamadasA('GET /v1/network/events/nearby'), hasLength(pertoAntes));
    });
  });

  group('os outros filtros do contrato', () {
    Future<Map<String, String>> escolher(
      WidgetTester tester,
      RedeDeTeste rede,
      String opcao, {
      String caminho = 'GET /v1/network/events',
    }) async {
      await tester.tap(find.byTooltip(RegExp('^Filtrar')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text(opcao).last);
      await tester.tap(find.text(opcao).last);
      await tester.pumpAndSettle();
      return rede.chamadasA(caminho).last.url.queryParameters;
    }

    testWidgets('Este fim de semana e Próximos 30 dias', (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede, logado: false);
      expect((await escolher(tester, rede, 'Este fim de semana'))['when'], 'weekend');
      expect((await escolher(tester, rede, 'Próximos 30 dias'))['when'], 'next_30_days');
    });

    testWidgets('Cidade manda city com o rótulo de uma cidade já vista',
        (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede, logado: false);
      expect((await escolher(tester, rede, 'São Paulo'))['city'], 'São Paulo');
    });

    testWidgets('Privado manda visibility=private e não pergunta distâncias',
        (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede);
      final perto = rede.chamadasA('GET /v1/network/events/nearby').length;
      final q = await escolher(tester, rede, 'Privado');
      expect(q['visibility'], 'private');
      expect(rede.chamadasA('GET /v1/network/events/nearby'), hasLength(perto));
    });

    testWidgets('Até 5 km vai a listNearbyNetworkEvents, sem visibility',
        (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede);
      final q = await escolher(
        tester,
        rede,
        'Até 5 km',
        caminho: 'GET /v1/network/events/nearby',
      );
      expect(q['max_km'], '5');
      expect(q.containsKey('visibility'), isFalse);
    });
  });

  group('sessão', () {
    testWidgets(
        'sair da conta com a agenda aberta: Meus pedidos some e a agenda '
        'volta sem token e sem distâncias', (tester) async {
      final rede = redeComAgenda();
      rede.respostas['POST /v1/auth/logout'] = (_) => http.Response('', 204);
      await abrirRede(tester, rede: rede);
      expect(find.widgetWithText(Tab, 'Meus pedidos'), findsOneWidget);
      await tester.tap(find.widgetWithText(Tab, 'Meus pedidos'));
      await tester.pumpAndSettle();

      final contexto = tester.element(find.byType(TabBar));
      await Escopo.of(contexto).sessao.sair();
      await tester.pumpAndSettle();

      expect(find.widgetWithText(Tab, 'Meus pedidos'), findsNothing);
      final ultima = rede.chamadasA('GET /v1/network/events').last;
      expect(ultima.url.queryParameters['when'], 'upcoming');
      expect(ultima.headers['Authorization'], isNull);
      final perto = rede.chamadasA('GET /v1/network/events/nearby').length;
      await tester.enterText(find.byType(TextField).first, 'passeio');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(rede.chamadasA('GET /v1/network/events/nearby'), hasLength(perto));
    });
  });

  group('resposta fora do contrato', () {
    testWidgets('um teaser com local_date de outro tipo vira a faixa de falha',
        (tester) async {
      await abrirRede(
        tester,
        logado: false,
        rede: redeComAgenda(
          proximos: <Map<String, dynamic>>[
            <String, dynamic>{...teaserPrivado(), 'local_date': 20261004},
          ],
        ),
      );
      expect(find.text('Não conseguimos carregar os encontros agora.'), findsOneWidget);
    });
  });
}
