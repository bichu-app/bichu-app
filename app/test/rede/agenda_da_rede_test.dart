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
    // **ERAM TRES ABAS, SAO DUAS** (cliente, 19/10/2026: *"vamos deixar
    // apenas os eventos abertos por enquanto, no futuro analisamos a
    // necessidade de ter eventos privados tambem"*).
    //
    // O caso `com conta: as três abas` SAIU, e o de sem conta trocou de
    // sentido: `Meus pedidos` nao faltava mais por falta de sessao -- ela nao
    // existe. Os dois casos abaixo medem pela CONTAGEM de `Tab`, e nao por um
    // `findsNothing` sobre o rotulo: `findsNothing` sozinho passaria com a
    // `TabBar` fora da arvore, e foi assim que o repositorio colecionou dez
    // portoes cegos numa rodada.
    for (final logado in <bool>[false, true]) {
      testWidgets(
          'ISCA -- duas abas, Próximos e Encerrados, '
          '${logado ? "com" : "sem"} conta', (tester) async {
        // ISCA: em `agenda_da_rede.dart`, devolva a linha
        //     if (logado) AbaDaRede.pedidos,
        // a `_abasVisiveis` e o valor `pedidos('Meus pedidos')` ao `enum`.
        // O caso com conta reprova na contagem (2 contra 3) E no rotulo.
        final rede = redeComAgenda();
        await abrirRede(tester, rede: rede, logado: logado);

        // (1) A `TabBar` ESTA na arvore, com DUAS abas. Esta e a assercao que
        // nao envelhece: uma aba nova, qualquer que seja o nome dela,
        // reprova aqui sem o caso precisar conhece-la.
        expect(
          find.byType(Tab),
          findsNWidgets(2),
          reason: 'REPROVA: a agenda nao tem exatamente duas abas. Eram tres '
              'ate 19/10/2026; `Meus pedidos` saiu com o evento privado.',
        );
        expect(find.widgetWithText(Tab, 'Próximos'), findsOneWidget);
        expect(find.widgetWithText(Tab, 'Encerrados'), findsOneWidget);
        expect(
          find.widgetWithText(Tab, 'Meus pedidos'),
          findsNothing,
          reason: 'REPROVA: a aba `Meus pedidos` voltou. Ela ficou sem origem '
              'quando a pagina de detalhe do evento saiu, e o cliente deu o '
              'veredito em 19/10/2026: so eventos abertos por enquanto.',
        );

        final lista = rede.chamadasA('GET /v1/network/events');
        expect(lista, isNotEmpty);
        expect(lista.last.url.queryParameters['when'], 'upcoming');
        if (!logado) {
          // Sem conta, nenhuma pergunta com token sai.
          expect(rede.chamadasA('GET /v1/network/events/nearby'), isEmpty);
          expect(lista.last.headers['Authorization'], isNull);
        }
      });
    }

    testWidgets(
        'ISCA -- nenhuma chamada do app vai a /network/join-requests',
        (tester) async {
      // ISCA: em `agenda_da_rede.dart`, devolva o ramo
      //     case AbaDaRede.pedidos:
      //       final p = await rede.meusPedidos(recorte.queryDePedidos);
      // (com o valor do `enum` e `RecorteDaRede.queryDePedidos`). Este caso
      // reprova no registro da rede assim que a aba for tocada -- e mesmo sem
      // toque, a aba voltar ja reprova o caso acima.
      //
      // **A rede de teste responde 404 em rota nao declarada**, e
      // `listMyNetworkEventJoinRequests` NAO esta declarada abaixo de
      // proposito: se alguem a chamar, a agenda cai na faixa de falha e as
      // duas assercoes finais acusam.
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (req) => json200(
              pagina(<Map<String, dynamic>>[encontroPublico()]),
            ),
        'GET /v1/network/events/nearby': (req) =>
            json200(paginaPorPerto(<Map<String, dynamic>>[])),
      });
      await abrirRede(tester, rede: rede);

      // **PASSA POR TODA ABA QUE EXISTIR, e nao pelas duas que eu espero.**
      // Esta e a diferenca que faz o caso valer: lido pelos rotulos que a
      // `TabBar` de fato publica, uma aba NOVA (ou a `Meus pedidos` de volta)
      // e visitada aqui sem o caso precisar ser editado -- e, se ela ler os
      // pedidos, a chamada proibida aparece no registro da rede.
      final rotulos = <String>[
        for (final e in find.byType(Tab).evaluate())
          ((e.widget as Tab).text ?? ''),
      ];
      expect(rotulos, isNotEmpty, reason: 'a `TabBar` nao esta na arvore');
      for (final rotulo in rotulos) {
        await tester.tap(find.widgetWithText(Tab, rotulo));
        await tester.pumpAndSettle();
      }
      await tester.tap(find.widgetWithText(Tab, 'Próximos'));
      await tester.pumpAndSettle();

      expect(
        rede.chamadasA('GET /v1/network/join-requests'),
        isEmpty,
        reason: 'REPROVA: o app voltou a ler `listMyNetworkEventJoinRequests`. '
            'A operacao continua no contrato, aposentada com data em '
            '`api/rastreabilidade-backoffice-rede.yaml`, e sem ninguem para '
            'alimenta-la: nenhuma tela cria pedido de participacao.',
      );
      // E a agenda nao caiu: se a chamada proibida tivesse saido e levado 404,
      // estas duas falhariam -- e e isso que torna o `isEmpty` acima nao
      // vacuo.
      expect(find.byType(CartaoDoEncontro), findsOneWidget);
      expect(find.text(AgendaDaRede.textoDaFalha), findsNothing);
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

    testWidgets(
        'ISCA -- público sem capa desenha o banner da marca, pintado e não '
        'baixado', (tester) async {
      // ISCA: em `pecas_da_rede.dart`, troque o
      //     if (endereco == null) return const AspectRatio(... BannerDaMarca())
      // por `Image.network(endereco ?? '')`. `Image.network('')` LANCA, e
      // este caso reprova na arvore.
      //
      // **Este caso media o TEASER PRIVADO ate 19/10/2026**, porque o teaser
      // era o unico encontro sem capa possivel. Ele trocou de massa, e nao de
      // mecanismo: o privado deixou de chegar a tela (ver o grupo
      // `so evento aberto`), e publico sem imagem e estado normal e frequente
      // -- `cover_image_url` e nulo enquanto a derivada nao existe.
      await abrirRede(
        tester,
        rede: redeComAgenda(
          proximos: <Map<String, dynamic>>[
            encontroPublico(title: 'Clube dos border collies'),
          ],
        ),
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

    // **A ISCA `ISCA -- cancelado desenha IGUAL: nenhum selo, nenhum
    // distintivo` MORREU, e nao foi afrouxada.** Ela cobrava o contrario
    // DISTO: que cancelado desenhasse igual a qualquer outro evento. Era
    // consequencia medida da entrega da manha, nao desenho pedido, e eu levei
    // a pergunta fechada ao cliente. Ele respondeu no mesmo dia -- a palavra
    // entra --, e a frase do motivo veio com a decisao: *um cartao limpo nao
    // vale alguem sair de casa para um evento que nao existe.*
    //
    // Os dois casos abaixo sao o substituto, e eles cobram MAIS do que o
    // antigo: a palavra existe em `cancelled`, NAO existe nos outros tres
    // estados, o cartao continua com exatamente um `Text` quando nao e
    // cancelado, e o leitor de tela diz as DUAS coisas.
    testWidgets(
        'ISCA -- cancelado tem a palavra, e o leitor de tela diz as DUAS '
        'coisas', (tester) async {
      // ISCA: em `cartao_do_encontro.dart`, apague o
      //     if (cancelado) ...<Widget>[ Text(rotuloDeCancelado), ... ]
      // do `Column`. A assercao (2) reprova. Apague em vez disso o ramo
      // `cancelado ? '$rotuloDeCancelado: ...'` de `nomeAcessivel`, e a (4)
      // reprova -- as duas metades sao independentes e cada uma tem a sua.
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

      // (1) O CARTAO ESTA NA ARVORE, com o titulo. Sem isto, tudo abaixo
      // mediria o nada.
      expect(find.byType(CartaoDoEncontro), findsOneWidget);
      expect(find.text('Manhã dos labradores'), findsOneWidget);

      // (2) A PALAVRA ESTA ESCRITA, DENTRO do cartao -- e nao em algum lugar
      // da tela, que incluiria a barra e as abas.
      expect(
        find.descendant(
          of: find.byType(CartaoDoEncontro),
          matching: find.text('Cancelado'),
        ),
        findsOneWidget,
        reason: 'REPROVA: o cartao de um evento cancelado nao diz que ele foi '
            'cancelado. Decisao do cliente de 19/10/2026: um cartao limpo nao '
            'vale alguem sair de casa para um evento que nao existe.',
      );

      // (3) E E UMA PALAVRA, E SO. Dois `Text` no cartao cancelado: a palavra
      // e o titulo. Esta contagem e o que reprova por um campo que volte --
      // data, lugar, resumo, selo -- sem o caso precisar conhecer o nome
      // dele. Foi ela que fez a isca da entrega da manha valer algo.
      expect(
        textosNoCartao(tester),
        2,
        reason: 'REPROVA: o cartao do cancelado escreve mais do que a palavra '
            'e o titulo. O cliente pediu UMA palavra, sem fundo, sem pilula e '
            'sem a data ou o lugar de volta.',
      );
      // E nenhum dos rotulos que a pilula antiga sabia desenhar voltou.
      for (final sumido in <String>['Acontecendo agora', 'Encerrado']) {
        expect(find.text(sumido), findsNothing);
      }

      // (4) E O LEITOR DE TELA DIZ AS DUAS COISAS, NUMA PARADA SO.
      //
      // Medido antes de escrever, e o primeiro desenho estava ERRADO:
      // `MergeSemantics` em volta da coluna publicava `label=Cancelado` e
      // COMIA o titulo -- a pessoa ouviria "Cancelado" sem saber de qual
      // evento. Por isso as duas assercoes abaixo, e por isso a primeira e
      // `contains` sobre a frase inteira: ja houve neste repositorio rotulo
      // de semantica VAZIO fazendo `isNot(contains())` passar vacuamente, e
      // um `expect(label, isNot(contains('...')))` sozinho aprovaria o
      // rotulo vazio e o rotulo sem titulo.
      final falado = rotulosSemanticos(tester);
      expect(
        falado,
        contains('Cancelado: Manhã dos labradores'),
        reason: 'REPROVA: o nome acessivel do cartao nao diz o cancelamento '
            'ANTES do nome do evento (UX 28.6). A lista falada nao pode '
            'anunciar como convite um encontro que nao vai acontecer.',
      );
      // E o titulo NAO aparece sozinho num segundo no: uma parada, nao duas.
      expect(
        find.bySemanticsLabel('Manhã dos labradores'),
        findsNothing,
        reason: 'REPROVA: o cartao publica dois nos para o mesmo evento. Quem '
            'navega por foco ouviria a palavra e o nome em paradas '
            'separadas.',
      );
      semantica.dispose();
    });

    testWidgets(
        'ISCA -- os outros TRES estados não têm palavra nenhuma, e o cartão '
        'fica com um Text só', (tester) async {
      // ISCA: em `cartao_do_encontro.dart`, troque
      //     if (cancelado) ...
      // por `if (true) ...`. Este caso reprova nos tres estados, na contagem
      // E na palavra.
      //
      // **Os tres juntos, e num caso so**: `upcoming`, `happening` e `ended`
      // sao os outros valores de `NetworkEventStatus`, e o que importa deles
      // aqui e a MESMA coisa -- nenhum ganha palavra. Um caso por estado
      // daria tres nomes para uma regra.
      final semantica = tester.ensureSemantics();
      for (final status in <String>['upcoming', 'happening', 'ended']) {
        await abrirRede(
          tester,
          rede: redeComAgenda(
            proximos: <Map<String, dynamic>>[
              encontroPublico(status: status, title: 'Manhã dos labradores'),
            ],
          ),
          logado: false,
        );

        // A ancora positiva, por estado: sem ela os `findsNothing` abaixo
        // passariam com a tela em branco ou em falha.
        expect(
          find.byType(CartaoDoEncontro),
          findsOneWidget,
          reason: 'o cartao de `$status` nao esta na arvore',
        );
        expect(find.text('Manhã dos labradores'), findsOneWidget);

        expect(
          textosNoCartao(tester),
          1,
          reason: 'REPROVA: o cartao de `$status` escreve mais do que o '
              'titulo. So `cancelled` ganha palavra.',
        );
        expect(
          find.text('Cancelado'),
          findsNothing,
          reason: 'REPROVA: o cartao de `$status` diz `Cancelado`. A palavra e '
              'exclusiva do estado cancelado -- dizer que um evento que vai '
              'acontecer foi cancelado e pior que nao dizer nada.',
        );
        // E o nome falado e o titulo CRU, sem prefixo de situacao.
        final falado = rotulosSemanticos(tester);
        expect(falado, contains('Manhã dos labradores'));
        expect(falado, isNot(contains('Cancelado')));
        await tester.pumpWidget(const SizedBox.shrink());
      }
      semantica.dispose();
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

  // =====================================================================
  // SO EVENTO ABERTO (cliente, 19/10/2026)
  // =====================================================================
  //
  // *"vamos deixar apenas os eventos abertos por enquanto, no futuro
  // analisamos a necessidade de ter eventos privados tambem"*.
  //
  // DUAS metades, e cada uma tem o seu caso: a agenda PEDE `visibility=public`
  // e, se um privado chegar apesar do pedido, ela o DESCARTA. A segunda nao
  // depende do servidor obedecer, e e por isso que ela existe -- um servidor
  // que ignore o parametro, ou uma versao do app contra um servidor mais
  // velho, nao podem pintar um evento privado na lista.
  group('só evento aberto', () {
    testWidgets('ISCA -- a agenda pede visibility=public em toda chamada',
        (tester) async {
      // ISCA: em `modelos_rede.dart`, em `RecorteDaRede.queryDaAgenda`,
      // apague a linha
      //     'visibility': VisibilidadeDoEncontro.publico.codigo,
      // Este caso reprova nas DUAS abas.
      final rede = redeComAgenda(
        encerrados: <Map<String, dynamic>>[encontroPublico(status: 'ended')],
      );
      await abrirRede(tester, rede: rede, logado: false);

      final emProximos = rede.chamadasA('GET /v1/network/events');
      expect(emProximos, isNotEmpty, reason: 'nada foi pedido: o caso mediria o nada');
      expect(
        emProximos.last.url.queryParameters['visibility'],
        'public',
        reason: 'REPROVA: a aba `Próximos` nao pede so eventos abertos.',
      );

      await tester.tap(find.widgetWithText(Tab, 'Encerrados'));
      await tester.pumpAndSettle();
      final emEncerrados = rede.chamadasA('GET /v1/network/events').last;
      expect(emEncerrados.url.queryParameters['when'], 'past');
      expect(
        emEncerrados.url.queryParameters['visibility'],
        'public',
        reason: 'REPROVA: a aba `Encerrados` nao pede so eventos abertos. Fixar '
            'o parametro em UM lugar (`queryDaAgenda`) existe exatamente para '
            'nenhuma das abas esquecer.',
      );
    });

    testWidgets(
        'ISCA -- um privado que chegue APESAR do pedido é descartado, e a '
        'lista continua de pé', (tester) async {
      // ISCA: em `modelos_rede.dart`, em `PaginaDaRede.doJson`, troque
      //     if (bruto is Map<String, dynamic> && bruto['visibility'] == 'public')
      // por `if (bruto is Map<String, dynamic>)`. Este caso reprova na
      // contagem de cartoes (2 contra 1) e no titulo do privado.
      //
      // A resposta abaixo DESOBEDECE o pedido de proposito: ela devolve um
      // teaser privado junto do publico. E o unico jeito de medir a segunda
      // metade -- com um servidor obediente, o descarte nunca roda e um
      // `findsNothing` sobre o titulo do privado passaria sem nada acontecer.
      await abrirRede(
        tester,
        logado: false,
        rede: redeComAgenda(
          proximos: <Map<String, dynamic>>[
            encontroPublico(title: 'Passeio aberto'),
            teaserPrivado(title: 'Clube fechado'),
          ],
        ),
      );

      // (1) O ABERTO ESTA NA TELA. Sem esta linha, (2) e (3) passariam com a
      // agenda em estado de falha ou em branco.
      expect(find.text('Passeio aberto'), findsOneWidget);

      // (2) UM CARTAO SO. A contagem e o que reprova por qualquer privado que
      // escape, sem o caso precisar conhecer o titulo dele.
      expect(
        find.byType(CartaoDoEncontro),
        findsOneWidget,
        reason: 'REPROVA: o evento privado da resposta virou cartao. A agenda '
            'pede `visibility=public`, mas pedir nao e garantir: '
            '`PaginaDaRede.doJson` tem de descartar o que nao e aberto.',
      );

      // (3) E O TITULO DELE NAO ESTA EM LUGAR NENHUM, nem no texto nem na
      // arvore falada.
      expect(find.text('Clube fechado'), findsNothing);
      expect(textoDaTela(tester), isNot(contains('Clube fechado')));

      // (4) E A AGENDA NAO CAIU. Descartar, e nao lancar: um privado na
      // resposta nao pode derrubar a lista inteira na faixa de falha.
      expect(find.text(AgendaDaRede.textoDaFalha), findsNothing);
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
        'Cidade',
        'Porte do cão',
        'Pequeno',
        'Gigante',
        'Distância',
        'Até 2 km',
      ]) {
        expect(find.text(t), findsWidgets, reason: 'falta "$t" na folha');
      }

      // **E OS DOIS GRUPOS QUE SAIRAM NAO VOLTARAM** (19/10/2026).
      // `Público ou privado` nao tem desfecho com so eventos abertos, e
      // `Situação do pedido` era da aba que saiu. Ancorado na folha ABERTA
      // -- as assercoes positivas acima provam que ela esta na arvore, e por
      // isso estes `findsNothing` nao sao vacuos.
      for (final sumido in <String>[
        'Público ou privado',
        'Privado',
        'Situação do pedido',
        'Enviado',
        'Aprovado',
      ]) {
        expect(
          find.text(sumido),
          findsNothing,
          reason: 'REPROVA: o grupo de filtro "$sumido" voltou a folha. '
              'Controle cujas opcoes dao a mesma lista e pior que controle '
              'nenhum (criterio 2 da BICHUS-62).',
        );
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

  // =====================================================================
  // O GRUPO `Meus pedidos` SAIU INTEIRO (cliente, 19/10/2026)
  // =====================================================================
  //
  // Os tres casos eram `ISCA -- lista os pedidos com a pílula do app, e
  // "recusado" não existe`, `busca e Situação do pedido vão a join-requests`
  // e `vazio de Meus pedidos`. Os tres mediam a aba, e a aba saiu: *"vamos
  // deixar apenas os eventos abertos por enquanto, no futuro analisamos a
  // necessidade de ter eventos privados tambem"*.
  //
  // **O QUE O PRIMEIRO PROTEGIA NAO FOI PERDIDO.** Ele existia para provar
  // que o app nunca mostra recusa -- o servidor manda `requested` para o
  // recusado (ADR-0027 12.11), e um `EstadoDoPedido.recusado` inventado
  // vazaria a decisao da equipe. Isso agora e impossivel por construcao:
  // `EstadoDoPedido` nao tem valor de recusa, nenhuma tela o desenha e o
  // portao de conformidade do app (`make verificar-conformidade-do-app`)
  // confere o `enum` valor por valor contra `NetworkEventJoinRequestState` do
  // contrato. Um valor a mais no `enum` reprova LA, sem depender desta tela.
  //
  // O que substitui os tres aqui e
  // `ISCA -- nenhuma chamada do app vai a /network/join-requests`, no grupo
  // `abas`: ele mede a ausencia do caminho, que e o que a decisao pediu.

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

    // **O CASO `Privado manda visibility=private e não pergunta distâncias`
    // SAIU** (19/10/2026): o grupo de filtro que o alimentava saiu, e o
    // parametro deixou de ser escolha. O que ele garantia -- que escolher
    // privado nao gastava a pergunta de distancias -- virou dispensavel: a
    // agenda nunca pede privado. O caso que mede o novo comportamento e
    // `ISCA -- a agenda pede visibility=public em toda chamada`, no grupo
    // `so evento aberto`.

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
        'sair da conta com a agenda aberta: a agenda volta sem token e sem '
        'distâncias, e as DUAS abas ficam', (tester) async {
      // **ESTE CASO MUDOU DE ALVO EM 19/10/2026.** Ele media `Meus pedidos`
      // sumindo ao sair da conta -- a terceira aba dependia da sessao. A aba
      // saiu do app, e o que sobrou de verdade para medir e o que sempre foi
      // o mais importante aqui: a agenda RECARREGA sem token e para de
      // perguntar distancias.
      //
      // A assercao das duas abas entrou no lugar da que saiu, e ela nao e
      // decorativa: a `TabBar` e refeita quando o numero de abas muda, e era
      // a sessao que mudava esse numero. Se alguem devolver a dependencia, o
      // controlador volta a ser recriado no logout e este caso acusa.
      final rede = redeComAgenda();
      rede.respostas['POST /v1/auth/logout'] = (_) => http.Response('', 204);
      await abrirRede(tester, rede: rede);
      expect(find.byType(Tab), findsNWidgets(2));
      // **Fica em `Próximos` de proposito.** O caso antigo tocava em `Meus
      // pedidos` antes de sair, porque era a aba que desaparecia; tocar em
      // `Encerrados` agora mudaria o `when` da recarga para `past` e a
      // assercao abaixo (`upcoming`) mediria outra coisa. A aba que importa
      // aqui e a que fica aberta.
      final contexto = tester.element(find.byType(TabBar));
      await Escopo.of(contexto).sessao.sair();
      await tester.pumpAndSettle();

      expect(
        find.byType(Tab),
        findsNWidgets(2),
        reason: 'REPROVA: o numero de abas mudou com a sessao. Desde '
            '19/10/2026 sao duas, com conta e sem.',
      );
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
    testWidgets(
        'ISCA -- um público com starts_at de outro tipo vira a faixa de falha',
        (tester) async {
      // ISCA: em `modelos_rede.dart`, em `EncontroPublico.doJson`, troque a
      // leitura de `starts_at` por algo que aceite qualquer tipo. A
      // `FormatException` deixa de subir e este caso reprova pelo texto.
      //
      // **ESTE CASO MEDIA UM TEASER PRIVADO ate 19/10/2026**, e trocou de
      // massa porque o privado nao e mais PARSEADO: `PaginaDaRede.doJson` o
      // descarta antes, pela chave `visibility` -- e o descarte deixaria este
      // caso verde por vazio, que e o pior desfecho possivel para ele. Agora
      // ele mede o mesmo mecanismo num encontro que a agenda de fato le.
      await abrirRede(
        tester,
        logado: false,
        rede: redeComAgenda(
          proximos: <Map<String, dynamic>>[
            <String, dynamic>{...encontroPublico(), 'starts_at': 20261004},
          ],
        ),
      );
      expect(
        find.text('Não conseguimos carregar os eventos agora.'),
        findsOneWidget,
        reason: 'REPROVA: resposta fora do contrato nao virou faixa de falha. '
            'Campo de tipo errado tem de parar a tela, e nao virar lista '
            'vazia com cara de "a Rede nao tem eventos".',
      );
    });
  });
}
