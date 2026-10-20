// A agenda da `Rede` no desenho novo (design system 24.14 a 24.17, UX 28.7.4).
//
// Todo esperado esta escrito por extenso, com acento: nenhum `expect` compara
// o texto renderizado com a constante que o produz.

import 'package:bichu/telas/rede/agenda_da_rede.dart';
import 'package:bichu/telas/rede/cartao_do_encontro.dart';
import 'package:bichu/telas/rede/pecas_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart' show SemanticsNode;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
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
      expect(find.text('1 evento · Mais recente primeiro'), findsOneWidget);
      expect(find.byIcon(Icons.swap_vert), findsNothing);
    });
  });

  // ---------------------------------------------------------------------
  // O CARTAO: FOTO E TITULO, E NADA MAIS (cliente, 19/10/2026)
  // ---------------------------------------------------------------------
  //
  // **TRES CASOS SAIRAM DAQUI**, porque mediam o que o cartao deixou de
  // mostrar: `público: data, horário no fuso do evento, lugar e valor`,
  // `ISCA -- teaser privado: só título, data e o selo Privado` e
  // `cancelado: o nome acessível começa por "Cancelado:"`. O que entrou no
  // lugar deles mede o cartao NOVO -- e mede pela CONTAGEM de filhos, e nao
  // por `findsNothing` sobre literais.
  group('cartões: a foto e o título, e nada mais', () {
    // POR QUE A CONTAGEM, E NAO UM `findsNothing` POR LITERAL.
    //
    // Um caso montado como
    //     expect(find.textContaining('outubro'), findsNothing);
    // passaria com a tela EM BRANCO, com o cartao fora da arvore, com a
    // resposta vazia e com a agenda em estado de falha. Esta e a familia de
    // defeito que o repositorio inteiro ja pagou: dez portoes cegos numa
    // rodada. Aqui a medida e positiva e fechada -- o titulo TEM de estar, a
    // imagem TEM de estar, e o numero de `Text` DENTRO do cartao tem de ser
    // exatamente 1. Um campo que voltasse, qualquer que fosse, quebraria a
    // contagem sem o caso precisar saber o nome dele.
    int textosNoCartao(WidgetTester tester) => find
        .descendant(
          of: find.byType(CartaoDoEncontro),
          matching: find.byType(Text),
        )
        .evaluate()
        .length;

    testWidgets(
        'ISCA -- público com capa: um Text só, e ele é o título', (tester) async {
      // ISCA: em `cartao_do_encontro.dart`, acrescente ao `Padding` do titulo
      // qualquer linha de volta -- por exemplo
      //     Text(e is EncontroPublico ? e.resumo : ''),
      // Este caso reprova em `textosNoCartao`, que passa de 1 para 2, SEM
      // precisar conhecer o campo que voltou.
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
              images: <Map<String, dynamic>>[
                imagem('https://midia.bichu.app/rede/capa.jpg', 'A praça'),
              ],
            ),
          ],
        ),
        logado: false,
      );

      // (1) O CARTAO ESTA NA ARVORE. Sem esta linha, tudo abaixo mediria o
      // nada e aprovaria.
      expect(find.byType(CartaoDoEncontro), findsOneWidget);

      // (2) O TITULO ESTA ESCRITO.
      expect(find.text('Passeio matinal na Benedito Calixto'), findsOneWidget);

      // (3) A FOTO ESTA DESENHADA, com a derivada do cartao.
      final imagens = find.descendant(
        of: find.byType(CartaoDoEncontro),
        matching: find.byType(Image),
      );
      expect(imagens, findsOneWidget);
      // `ResizeImage`, e nao `NetworkImage` solto: e `cacheWidth` que o
      // embrulha, e o embrulho E a prova de que ele esta sendo passado. Sem
      // ele, a derivada de 1024 x 576 custa 2.359.296 bytes decodificados por
      // cartao, e a agenda monta os 20 da pagina de uma vez.
      final provedor = tester.widget<Image>(imagens).image;
      expect(
        provedor,
        isA<ResizeImage>(),
        reason: 'REPROVA: a capa do cartao voltou a ser decodificada no '
            'tamanho do arquivo. `cacheWidth` e o que limita o custo em '
            'memoria, e sao 20 cartoes por pagina.',
      );
      final redimensionada = provedor as ResizeImage;
      expect(
        (redimensionada.imageProvider as NetworkImage).url,
        'https://midia.bichu.app/rede/capa.jpg',
      );
      // A largura pedida ao decodificador e a PINTADA, em pixeis do aparelho:
      // nunca a do arquivo.
      final larguraPintada = tester
          .getRect(find.descendant(
            of: find.byType(CartaoDoEncontro),
            matching: find.byType(Image),
          ))
          .width;
      final fator = tester.view.devicePixelRatio;
      expect(redimensionada.width, (larguraPintada * fator).round());

      // (4) E O CARTAO TEM UM `Text` SO. Esta e a assercao que nao envelhece:
      // ela reprova por qualquer campo que volte, nomeado ou nao.
      expect(
        textosNoCartao(tester),
        1,
        reason: 'REPROVA: o cartao do evento voltou a escrever mais do que o '
            'titulo. O cliente pediu "apenas a foto e o titulo do evento, sem '
            'informações adicionais" em 19/10/2026.',
      );
    });

    testWidgets('ISCA -- teaser privado: o banner da marca e o título',
        (tester) async {
      // ISCA: em `cartao_do_encontro.dart`, troque
      //     url: e is EncontroPublico ? e.urlDaCapa : null,
      // por `url: 'https://midia.bichu.app/x.jpg'`. O teaser passa a baixar
      // uma imagem que o contrato nao manda e este caso reprova no `Image`.
      await abrirRede(
        tester,
        rede: redeComAgenda(proximos: <Map<String, dynamic>>[teaserPrivado()]),
        logado: false,
      );

      expect(find.byType(CartaoDoEncontro), findsOneWidget);
      expect(find.text('Clube dos border collies'), findsOneWidget);
      // Sem capa: o banner da marca e PINTADO, e nao baixado.
      expect(find.byType(Image), findsNothing);
      expect(
        find.descendant(
          of: find.byType(CartaoDoEncontro),
          matching: find.byType(BannerDaMarca),
        ),
        findsOneWidget,
      );
      expect(textosNoCartao(tester), 1);
    });

    testWidgets(
        'ISCA -- cancelado desenha IGUAL: nenhum selo, nenhum distintivo',
        (tester) async {
      // ISCA: em `cartao_do_encontro.dart`, embrulhe o `Text` do titulo num
      // `Column` com `DistintivoDeSituacao` -- ou qualquer coisa que a
      // situacao faca aparecer. Este caso reprova na contagem.
      //
      // **ISTO E CONSEQUENCIA MEDIDA, e nao desenho pedido:** o cliente pediu
      // "sem informações adicionais", e o distintivo `Cancelado` era uma
      // delas. Um evento cancelado ficou indistinguivel na lista.
      await abrirRede(
        tester,
        rede: redeComAgenda(
          proximos: <Map<String, dynamic>>[
            encontroPublico(status: 'cancelled', title: 'Manhã dos labradores'),
          ],
        ),
        logado: false,
      );

      expect(find.byType(CartaoDoEncontro), findsOneWidget);
      expect(find.text('Manhã dos labradores'), findsOneWidget);
      expect(textosNoCartao(tester), 1);
    });

    testWidgets(
        'ISCA -- o cartão NÃO abre nada: nenhum InkWell e nenhuma rota de '
        'detalhe de evento', (tester) async {
      // ISCA (duas metades, e as duas reprovam aqui):
      //   1. em `cartao_do_encontro.dart`, embrulhe o `Container` num
      //      `InkWell(onTap: () {})`. A primeira metade reprova.
      //   2. em `rotas.dart`, devolva `encontros/:slug` ao ramo da `Rede`.
      //      A segunda metade reprova no `GoRouter`.
      await abrirRede(
        tester,
        rede: redeComAgenda(
          proximos: <Map<String, dynamic>>[encontroPublico()],
        ),
        logado: false,
      );
      expect(find.byType(CartaoDoEncontro), findsOneWidget);

      // (1) NENHUM CONTROLE DENTRO DO CARTAO. Medido DENTRO do cartao, e nao
      // na tela: a `AppBar` e a barra de abas tem controles proprios, e
      // contar a tela inteira mediria o app em volta.
      for (final tipo in <Finder>[
        find.byType(InkWell),
        find.byType(GestureDetector),
      ]) {
        expect(
          find.descendant(of: find.byType(CartaoDoEncontro), matching: tipo),
          findsNothing,
          reason: 'REPROVA: o cartao do evento voltou a ser tocavel. Nao ha '
              'pagina de detalhe para ele abrir desde 19/10/2026.',
        );
      }

      // (2) E O NO QUE FALA O EVENTO NAO E BOTAO.
      //
      // Medido pelo ROTULO e nao pela subarvore do widget: `getSemantics`
      // sobe ate o no mais proximo, que e o da lista inteira, e contar botoes
      // ali mediria a barra de abas junto -- foi assim que a primeira versao
      // deste caso achou dois botoes que nao eram do cartao.
      //
      // Ate 19/10/2026 o cartao publicava um no com `button: true` e
      // `label: nomeAcessivel` -- uma string que COMECA pelo titulo. Entao
      // procurar o titulo no rotulo acha o no certo nas duas versoes, e so na
      // antiga ele e botao. **As duas assercoes importam**: a primeira prova
      // que ha no com o titulo (sem ela a segunda passaria com a arvore
      // vazia), e a segunda prova que ele e conteudo.
      final semantica = tester.ensureSemantics();
      final comOTitulo = <SemanticsNode>[];
      void colher(SemanticsNode n) {
        if (n.label.contains('Passeio matinal na Benedito Calixto')) {
          comOTitulo.add(n);
        }
        n.visitChildren((f) {
          colher(f);
          return true;
        });
      }

      colher(tester.getSemantics(find.byType(Scaffold).last));
      expect(
        comOTitulo,
        isNotEmpty,
        reason: 'a arvore semantica nao tem no nenhum com o titulo do evento: '
            'a assercao seguinte passaria por vazio',
      );
      for (final n in comOTitulo) {
        expect(
          n.flagsCollection.isButton,
          isFalse,
          reason: 'REPROVA: o no que anuncia o evento ainda e um botao. Nao '
              'ha pagina de detalhe para ele abrir desde 19/10/2026.',
        );
      }
      semantica.dispose();

      // (3) E A ROTA NAO EXISTE. Esta e a metade que o `InkWell` nao cobre:
      // um link direto, um `push` de outra tela ou um `deep link` chegariam
      // na tela de detalhe sem passar pelo cartao.
      final contexto = tester.element(find.byType(AgendaDaRede));
      final roteador = GoRouter.of(contexto);
      expect(
        roteador.configuration.findMatch(
          Uri.parse('/rede/encontros/$slugPublico'),
        ).routes,
        isEmpty,
        reason: 'REPROVA: `/rede/encontros/<slug>` voltou a casar com uma '
            'rota. A tela de detalhe do evento saiu em 19/10/2026 e a rota '
            'saiu com ela -- rota orfa leva a pagina de erro, e nao a nada.',
      );
    });
  });

  group('distância pela região cadastrada', () {
    // **DOIS CASOS SAIRAM DESTE GRUPO** com a linha de distancia do cartao:
    // `ISCA -- a distância nunca aparece em privado` (que media
    // `CartaoDoEncontro.distanciaVisivel`, metodo que nao existe mais) e
    // `encerrado e cancelado não mostram distância`. Os tres filtros que
    // aquele metodo aplicava -- privado nunca, encerrado nunca, cancelado
    // nunca -- viraram UM: ninguem mostra distancia.
    //
    // O caso abaixo FICOU e trocou de alvo: ele media a linha na tela e
    // agora mede a PERGUNTA, que continua saindo e continua sem coordenada.
    testWidgets(
        'ISCA -- a pergunta de distância continua saindo, sem coordenada, e '
        'a distância NÃO é pintada', (tester) async {
      // ISCA: em `agenda_da_rede.dart`, acrescente `lat` e `lon` a
      // `queryDePerto`. Este caso reprova no laco de chaves proibidas.
      //
      // A pergunta nao e desperdicio: e a resposta dela que revela se ha
      // regiao cadastrada, e e isso que decide se `Mais perto` e `Distância`
      // aparecem na barra -- o caso seguinte mede esse par.
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

      // E A RESPOSTA NAO VIRA TEXTO. Ancorado no cartao que ESTA na arvore
      // com a medida de 1200 m na resposta: sem a primeira linha, o
      // `findsNothing` abaixo passaria com a tela em branco.
      expect(find.byType(CartaoDoEncontro), findsWidgets);
      expect(
        find.textContaining('da sua região'),
        findsNothing,
        reason: 'REPROVA: a linha de distancia voltou ao cartao. O cliente '
            'pediu so a foto e o titulo em 19/10/2026.',
      );
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
      expect(find.byIcon(Icons.swap_vert), findsNothing);
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      expect(find.text('Distância'), findsNothing);
    });

    testWidgets('Mais perto troca a lista para listNearbyNetworkEvents',
        (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede);

      // A ordem mora DENTRO da folha de filtros desde 17/10.
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Mais perto'));
      await tester.tap(find.text('Mais perto'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aplicar'));
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
      await tester.tap(find.byIcon(Icons.tune));
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

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pago'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();
      expect(
        rede.chamadasA('GET /v1/network/events').last.url.queryParameters['admission'],
        'paid',
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Grande'));
      await tester.tap(find.text('Grande'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();

      final q = rede.chamadasA('GET /v1/network/events').last.url.queryParameters;
      expect(q['size'], 'G');
      expect(q['admission'], 'paid');
    });

    testWidgets('Hoje manda when=today', (tester) async {
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede, logado: false);
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hoje'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aplicar'));
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
      // **A PILULA SAIU DO CARTAO** (cliente, 19/10/2026: "sem informações
      // adicionais"). Ate aqui este caso media `Pedido enviado` duas vezes e
      // `Pedido aprovado` uma. Agora ele mede o contrario -- e mede ANCORADO
      // nos tres cartoes, porque um `findsNothing` sozinho passaria com a aba
      // vazia, que e exatamente o que o estado de `Meus pedidos` virou.
      expect(find.byType(CartaoDoEncontro), findsNWidgets(3));
      for (final pilula in <String>['Pedido enviado', 'Pedido aprovado']) {
        expect(
          find.text(pilula),
          findsNothing,
          reason: 'REPROVA: a pilula do pedido voltou ao cartao.',
        );
      }

      final tela = textoDaTela(tester).toLowerCase();
      for (final proibido in <String>['recusad', 'não aprovado', 'negad']) {
        expect(tela, isNot(contains(proibido)));
      }

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      expect(find.text('Situação do pedido'), findsOneWidget);
      expect(find.text('Enviado'), findsOneWidget);
      expect(find.text('Aprovado'), findsOneWidget);
      expect(find.text('Recusado'), findsNothing);
      // `listMyNetworkEventJoinRequests` nao aceita `admission` nem `size`.
      expect(find.text('Valor'), findsNothing);
      expect(find.text('Porte do cão'), findsNothing);
    });

    testWidgets('busca e Situação do pedido vão a join-requests', (tester) async {
      final rede = redeComAgenda(
        pedidos: paginaDePedidos(<Map<String, dynamic>>[
          <String, dynamic>{
            'event': teaserPrivado(),
            'state': 'requested',
            'requested_at': '2026-09-28T12:00:00Z',
          },
        ]),
      );
      await abrirRede(tester, rede: rede);
      await tester.tap(find.widgetWithText(Tab, 'Meus pedidos'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'border');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();
      var q = rede.chamadasA('GET /v1/network/join-requests').last.url.queryParameters;
      expect(q['q'], 'border');

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aprovado'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();
      q = rede.chamadasA('GET /v1/network/join-requests').last.url.queryParameters;
      expect(q['state'], 'approved');
      expect(q['q'], 'border');
      expect(q['sort'], 'proximos');
      for (final proibido in <String>['admission', 'size', 'max_km', 'city']) {
        expect(q.containsKey(proibido), isFalse);
      }
    });

    testWidgets('vazio de Meus pedidos', (tester) async {
      await abrirRede(tester, rede: redeComAgenda());
      await tester.tap(find.widgetWithText(Tab, 'Meus pedidos'));
      await tester.pumpAndSettle();
      expect(find.text('Nenhum pedido ainda'), findsOneWidget);
      expect(find.text('Seus pedidos aparecem aqui.'), findsOneWidget);
    });
  });

  group('estados da lista', () {
    testWidgets('vazio sem recorte: a barra não aparece', (tester) async {
      await abrirRede(
        tester,
        rede: redeComAgenda(proximos: <Map<String, dynamic>>[]),
        logado: false,
      );
      expect(find.text('A Rede ainda não tem eventos'), findsOneWidget);
      expect(
        find.text('Aparecem aqui assim que forem criados.'),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.tune), findsNothing);
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
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      expect(find.text('Nenhum evento com “agility”'), findsOneWidget);
      expect(
        find.text('Tente outra palavra, outro período ou menos filtros.'),
        findsOneWidget,
      );
      expect(find.text('0 eventos · Data mais próxima'), findsOneWidget);
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
        find.text('Não conseguimos carregar os eventos agora.'),
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

      await tester.ensureVisible(find.text('Carregar mais eventos'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Carregar mais eventos'));
      await tester.pumpAndSettle();

      final lista = rede.chamadasA('GET /v1/network/events');
      expect(lista.last.url.queryParameters['page'], '2');
      expect(find.text('Mostrando 1 a 25 de 25'), findsOneWidget);
      expect(find.text('Carregar mais eventos'), findsNothing);
      // Os cinco novos nao tinham medida: a proxima pagina de distancias sai.
      final perto = rede.chamadasA('GET /v1/network/events/nearby');
      expect(perto, hasLength(2));
      expect(perto.last.url.queryParameters['page'], '2');
    });

    testWidgets('falha na página seguinte: os cartões ficam e Tentar de novo',
        (tester) async {
      await abrirRede(tester, rede: redePaginada(segundaFalha: true), logado: false);
      await tester.ensureVisible(find.text('Carregar mais eventos'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Carregar mais eventos'));
      await tester.pumpAndSettle();
      expect(find.text('Não conseguimos carregar mais eventos agora.'), findsOneWidget);
      expect(find.text('Tentar de novo'), findsOneWidget);
      expect(find.text('Mostrando 1 a 20 de 25'), findsOneWidget);
    });
  });

  group('busca', () {
    testWidgets(
        'ISCA -- digitar nao pergunta nada; a lupa pergunta uma vez e nao '
        'repete as distâncias', (tester) async {
      // A ESPERA DE 300 ms SAIU, e com ela a razao de existir dela.
      //
      // Ate 17/10 a agenda perguntava 300 ms depois da ultima tecla, e este
      // caso media a espera. O cliente decidiu que nada se aplica sozinho, e
      // a busca passou a sair no toque: nao ha mais pergunta por tecla para o
      // teto de 300 por hora contar.
      //
      // ISCA: em `BichuField`, dentro de `CampoDeBuscaDaListagem`, troque
      // `aoMudar: null` por `aoMudar: (t) => busca.aoAplicar(t)`. Cada tecla
      // vira pergunta e este caso reprova na contagem.
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede);
      final antes = rede.chamadasA('GET /v1/network/events').length;
      final pertoAntes = rede.chamadasA('GET /v1/network/events/nearby').length;

      final campo = find.byType(TextField).first;
      for (final t in <String>['a', 'ag', 'agi', 'agil', 'agility']) {
        await tester.enterText(campo, t);
        await tester.pump(const Duration(milliseconds: 400));
      }
      // Cinco teclas, nenhuma pergunta: a espera nao existe mais porque a
      // pergunta nao sai da tecla.
      expect(rede.chamadasA('GET /v1/network/events'), hasLength(antes));

      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      final depois = rede.chamadasA('GET /v1/network/events');
      expect(depois, hasLength(antes + 1));
      expect(depois.last.url.queryParameters['q'], 'agility');
      // As distancias nao dependem do termo: nenhuma pergunta nova.
      expect(rede.chamadasA('GET /v1/network/events/nearby'), hasLength(pertoAntes));
    });

    testWidgets('um caractere so: a lupa nao habilita e diz o que falta',
        (tester) async {
      // `minLength: 2` no contrato. Antes isto era um `setState` que engolia
      // a tecla em silencio; agora e estado do controle, e o motivo vai no
      // nome acessivel -- quem usa leitor de tela nao ve o botao apagado.
      final rede = redeComAgenda();
      await abrirRede(tester, rede: rede, logado: false);
      final antes = rede.chamadasA('GET /v1/network/events').length;

      await tester.enterText(find.byType(TextField).first, 'a');
      await tester.pumpAndSettle();

      expect(find.byTooltip('Buscar, faltam 1 letra'), findsOneWidget);
      await tester.tap(find.byTooltip('Buscar, faltam 1 letra'));
      await tester.pumpAndSettle();
      expect(rede.chamadasA('GET /v1/network/events'), hasLength(antes));
    });

    testWidgets('o rotulo saiu do topo do campo e virou a dica DENTRO dele',
        (tester) async {
      // Pedido do cliente de 17/10: *"Tire o texto do app buscar encontro
      // (opcional), coloque o texto no placeholder do campo buscar"*.
      await abrirRede(tester, rede: redeComAgenda(), logado: false);

      expect(find.text('Buscar evento (opcional)'), findsNothing);
      final campo = tester.widget<TextField>(find.byType(TextField).first);
      expect(campo.decoration?.hintText, 'Buscar evento');
    });

    testWidgets('sem rotulo visivel o campo CONTINUA tendo nome acessivel',
        (tester) async {
      // A dica desaparece na primeira letra digitada. Se ela fosse o unico
      // nome do campo, o campo ficaria mudo exatamente quando ha conteudo
      // para revisar (SC 3.3.2 e SC 4.1.2).
      final handle = tester.ensureSemantics();
      await abrirRede(tester, rede: redeComAgenda(), logado: false);

      await tester.enterText(find.byType(TextField).first, 'agility');
      await tester.pumpAndSettle();

      expect(
        find.bySemanticsLabel(RegExp('Buscar evento')),
        findsWidgets,
        reason: 'REPROVA: o campo de busca com texto digitado nao tem nome '
            'acessivel. A dica sumiu junto com o rotulo visivel.',
      );
      handle.dispose();
    });

    testWidgets('a busca espera o toque e o campo fica ACIMA das abas',
        (tester) async {
      // Pedido do cliente de 17/10: *"coloque o campo de busca acima do texto
      // e das abas proximos e encerrados"*.
      //
      // **O TEXTO DO MEIO SAIU EM 18/10/2026**, por pedido do mesmo cliente
      // (*"remova os textos ... 'os eventos de quem tem pet aqui perto de
      // você.'"*). A ordem que ele pediu em 17/10 era busca, texto, abas; com
      // o texto fora, o que resta a provar e busca acima das abas -- e e isso
      // que este caso mede agora, sem deixar de medir a ordem.
      await abrirRede(tester, rede: redeComAgenda(), logado: false);

      final campo = tester.getTopLeft(find.byType(TextField).first);
      final abas = tester.getTopLeft(find.byType(TabBar));

      expect(
        campo.dy,
        lessThan(abas.dy),
        reason: 'REPROVA: o campo de busca nao esta acima das abas.',
      );
      expect(
        find.text('Os eventos de quem tem pet aqui perto de você.'),
        findsNothing,
        reason: 'REPROVA: a linha de apoio da `Rede` voltou ao corpo. O '
            'cliente a removeu nominalmente em 18/10/2026.',
      );
    });

    testWidgets('as abas FICAM quando a barra nao e desenhada', (tester) async {
      // A armadilha de ter subido a busca: se as abas tivessem ido para
      // dentro da `BarraDeListagem`, elas sumiriam no estado em que a barra
      // nao nasce -- e quem estivesse em `Encerrados` ficaria preso.
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (_) =>
            json200(pagina(const <Map<String, dynamic>>[])),
      });
      await abrirRede(tester, rede: rede, logado: false);

      expect(find.byType(TextField), findsNothing);
      expect(find.widgetWithText(Tab, 'Próximos'), findsOneWidget);
      expect(find.widgetWithText(Tab, 'Encerrados'), findsOneWidget);
    });
  });

  group('os outros filtros do contrato', () {
    Future<Map<String, String>> escolher(
      WidgetTester tester,
      RedeDeTeste rede,
      String opcao, {
      String caminho = 'GET /v1/network/events',
    }) async {
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text(opcao).last);
      await tester.tap(find.text(opcao).last);
      await tester.pumpAndSettle();
      // O `Aplicar` e o unico caminho com efeito desde 17/10.
      await tester.tap(find.text('Aplicar'));
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
      expect(find.text('Não conseguimos carregar os eventos agora.'), findsOneWidget);
    });
  });
}
