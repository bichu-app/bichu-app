// A listagem publica de perdidos na aba `Pets`, e a lista dos meus achados.
//
// Os casos marcados ISCA sao os que precisam REPROVAR com o mecanismo
// desligado. Cada um diz, no proprio corpo, qual arquivo mexer e o que
// observar.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante
// que o produz** nos casos de microcopy: o esperado esta escrito por extenso,
// com acento e pontuacao, e trocar a microcopy reprova -- que e o ponto.

import 'package:bichu/api/modelos.dart';
import 'package:bichu/telas/perdido/cartao_do_perdido.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A massa, no formato exato do contrato
// ---------------------------------------------------------------------------

const String tokenDeMel = 'k3J9-share-token-opaco-0001';
const String uuidHostil = '018f3a2b-0000-7000-8000-0000000000cc';

/// Um perdido como `PublicLostPet` o declara.
///
/// O parametro [comUuidHostil] acrescenta `pet_id`, `case_id` e `owner_user_id`
/// ao corpo -- campos que o contrato diz que esta projecao "nunca deve
/// possuir". Serve a isca de UUID: um cliente que fizesse `...json` em vez de
/// ler campo a campo passaria os tres para a tela.
Map<String, dynamic> perdidoDoContrato({
  String shareToken = tokenDeMel,
  String nome = 'Mel',
  String especie = 'dog',
  String porte = 'P',
  String? raca = 'Poodle',
  String? cor = 'Caramelo',
  String? area = 'Vila Mariana, São Paulo',
  String? foto = 'https://midia.teste/pets/abc/thumb/f00d.webp',
  required String vistoEm,
  bool comUuidHostil = false,
}) {
  return <String, dynamic>{
    'share_token': shareToken,
    'pet_display_name': nome,
    'species': especie,
    'size': porte,
    'breed_label': raca,
    'primary_color': cor,
    'area_label': area,
    'lost_since': vistoEm,
    'photo_url': foto,
    'share_url': 'https://web.teste/p/$shareToken',
    if (comUuidHostil) ...<String, dynamic>{
      'pet_id': uuidHostil,
      'case_id': uuidHostil,
      'owner_user_id': uuidHostil,
    },
  };
}

/// A resposta de `PublicLostPetPage`.
Map<String, dynamic> paginaDePerdidos(
  List<Map<String, dynamic>> itens, {
  int? total,
  int pagina = 1,
  int limite = 20,
  Map<String, String> filtros = const <String, String>{},
}) {
  return <String, dynamic>{
    'items': itens,
    'page': pagina,
    'limit': limite,
    'total': total ?? itens.length,
    'applied_filters': filtros,
  };
}

/// Um achado como `FoundReport` o declara.
Map<String, dynamic> achadoDoContrato({
  required String id,
  String origem = 'stray_report',
  String status = 'open',
  String? area = 'Vila Mariana, São Paulo',
  String achadoEm = '2026-10-16T10:00:00.000Z',
}) {
  return <String, dynamic>{
    'id': id,
    'origin': origem,
    'status': status,
    'area_label': area,
    'found_at': achadoEm,
    'photo_url': null,
    'notes': null,
    'conversation_id': null,
    'created_at': achadoEm,
  };
}

/// Vinte e cinco perdidos distintos, com nome e token numerados.
///
/// **Vinte e cinco, e nao cinco.** O teto do contrato e `limit: 20`, entao so
/// acima de vinte existe um item que a pagina 1 nao alcanca -- e e so ai que a
/// paginacao quebrada reprova.
List<Map<String, dynamic>> vinteECincoPerdidos() {
  return <Map<String, dynamic>>[
    for (var i = 1; i <= 25; i++)
      perdidoDoContrato(
        shareToken: 'token-opaco-$i',
        nome: 'Perdido $i',
        vistoEm: '2026-10-1${i % 8}T12:00:00.000Z',
      ),
  ];
}

// ---------------------------------------------------------------------------
// As redes
// ---------------------------------------------------------------------------

/// A rede que atende a listagem publica e **404 em qualquer outra rota**.
///
/// 404 no resto, e nao 200 vazio: um caso que dependa de uma chamada nao
/// declarada aqui precisa falhar alto, e nao passar por acidente.
Future<http.Response> Function(http.Request) redeDosPerdidos(
  Map<String, dynamic> corpo, {
  List<http.Request>? pedidos,
  int status = 200,
}) {
  return (req) async {
    if (req.url.path == '/v1/public/lost-pets' && req.method == 'GET') {
      pedidos?.add(req);
      if (status != 200) return problema('rate-limited', status);
      return json200(corpo);
    }
    return problema('not-found', 404);
  };
}

/// A rede que **pagina de verdade**: recorta a massa por `page` e `limit`.
///
/// Ela nao devolve um corpo fixo. Um duble que responde a mesma pagina para
/// qualquer `page` deixaria passar o defeito que estes casos existem para
/// pegar: a tela pode nunca pedir a pagina 2 e o teste nao perceberia.
Future<http.Response> Function(http.Request) redeQuePaginaPerdidos(
  List<Map<String, dynamic>> massa, {
  required List<Uri> urls,
}) {
  return (req) async {
    if (req.url.path != '/v1/public/lost-pets' || req.method != 'GET') {
      return problema('not-found', 404);
    }
    urls.add(req.url);
    final pedido = req.url.queryParameters;
    final pagina = int.parse(pedido['page'] ?? '1');
    final limite = int.parse(pedido['limit'] ?? '20');
    final inicio = (pagina - 1) * limite;
    final fatia = inicio >= massa.length
        ? const <Map<String, dynamic>>[]
        : massa.sublist(
            inicio,
            inicio + limite > massa.length ? massa.length : inicio + limite,
          );
    return json200(
      paginaDePerdidos(fatia, total: massa.length, pagina: pagina, limite: limite),
    );
  };
}

/// A rede dos meus achados, com o detalhe de cada um.
///
/// `getFoundReport` responde **404 e nunca 403** para id que nao esta na lista:
/// e o ADR-0021, e e o contrapeso do caso "so os meus".
Future<http.Response> Function(http.Request) redeDosAchados(
  List<Map<String, dynamic>> meus, {
  List<http.Request>? pedidos,
  String? proximoCursor,
}) {
  return (req) async {
    if (req.url.path == '/v1/found-reports' && req.method == 'GET') {
      pedidos?.add(req);
      return json200(<String, dynamic>{
        'items': meus,
        'next_cursor': proximoCursor,
      });
    }
    if (req.url.path.startsWith('/v1/found-reports/') && req.method == 'GET') {
      final id = req.url.pathSegments.last;
      final meu = meus.where((a) => a['id'] == id);
      if (meu.isEmpty) return problema('not-found', 404);
      return json200(meu.first);
    }
    return problema('not-found', 404);
  };
}

// ---------------------------------------------------------------------------
// Atalhos de navegacao
// ---------------------------------------------------------------------------

RegiaoDeReferencia get regiaoDeSaoPaulo => const RegiaoDeReferencia(
      bairro: 'Vila Mariana',
      cidade: 'São Paulo',
      uf: 'SP',
    );

/// Abre a aba `Pets` com conta e regiao cadastrada.
///
/// A regiao nao e enfeite: `city` e `required` em `listPublicLostPets`, e
/// `Me.reference_area.city` e a UNICA fonte de cidade deste app.
Future<void> abrirPets(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  RegiaoDeReferencia? regiao,
  bool logado = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado
        ? depositoLogado(regiaoDeReferencia: regiao ?? regiaoDeSaoPaulo)
        : null,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
  await tester.pumpAndSettle();
}

Future<void> abrirMeusAchados(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  bool logado = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado ? depositoLogado() : null,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
  await tester.pumpAndSettle();
  final porta = find.text('Meus achados');
  await tester.ensureVisible(porta);
  await tester.pumpAndSettle();
  await tester.tap(porta);
  await tester.pumpAndSettle();
}

/// Os nomes dos cartoes, **na ordem em que a tela os desenhou**.
///
/// Lidos da arvore montada, e nao da resposta: e a ordem da TELA que importa, e
/// ler da resposta provaria que o JSON esta ordenado.
List<String> perdidosNaTela(WidgetTester tester) {
  return <String>[
    for (final c in find.byType(CartaoDoPerdido).evaluate())
      (c.widget as CartaoDoPerdido).perdido.nome,
  ];
}

/// Todo texto que a arvore pinta, achatado. Serve a isca de UUID.
List<String> textosNaTela(WidgetTester tester) {
  final textos = <String>[];
  for (final e in find.byType(Text).evaluate()) {
    final w = e.widget as Text;
    final t = w.data ?? w.textSpan?.toPlainText();
    if (t != null) textos.add(t);
  }
  return textos;
}

/// O padrao de um UUID, em qualquer caixa.
final RegExp umUuid = RegExp(
  r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
);

void main() {
  // -------------------------------------------------------------------------
  // 1. A LISTA MOSTRA PET PERDIDO DE VERDADE (isca a)
  // -------------------------------------------------------------------------
  group('a aba Pets mostra a listagem publica de perdidos', () {
    testWidgets(
      'ISCA: cada perdido vira um cartao com nome, bairro e quando foi visto',
      (tester) async {
        // DESLIGANDO: troque `const ListaDePerdidos()` em
        // `lib/telas/abas.dart` pelo `EstadoVazio` "em construcao" que estava
        // nessa linha. Este caso reprova por nao achar cartao nenhum.
        await abrirPets(
          tester,
          rede: redeDosPerdidos(
            paginaDePerdidos(<Map<String, dynamic>>[
              perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
              perdidoDoContrato(
                shareToken: 'token-opaco-0002',
                nome: 'Frajola',
                especie: 'cat',
                raca: null,
                cor: 'Preto e branco',
                area: 'Pinheiros, São Paulo',
                foto: null,
                vistoEm: '2026-10-10T12:00:00.000Z',
              ),
            ]),
          ),
        );

        expect(perdidosNaTela(tester), <String>['Mel', 'Frajola']);
        expect(find.text('Mel'), findsOneWidget);
        // O bairro, por extenso, do jeito que o servidor o mandou.
        expect(find.text('Vila Mariana, São Paulo'), findsOneWidget);
        expect(find.text('Pinheiros, São Paulo'), findsOneWidget);
        // A linha de atributos do 11.3, separada por " · ".
        expect(find.text('Cão · Poodle · Pequeno · Caramelo'), findsOneWidget);
        // Raca ausente SOME da linha, e nao vira travessao.
        expect(find.text('Gato · Pequeno · Preto e branco'), findsOneWidget);
        // E a linha que diz quando. O texto e relativo quando e recente.
        expect(
          find.textContaining('Visto por último'),
          findsNWidgets(2),
          reason: 'REPROVA: o cartao nao diz quando o pet foi visto, que e '
              'metade do que decide se vale olhar.',
        );
      },
    );

    testWidgets('CONTRAPESO: lista vazia nao quebra, e leva UMA linha',
        (tester) async {
      await abrirPets(
        tester,
        rede: redeDosPerdidos(paginaDePerdidos(const <Map<String, dynamic>>[])),
      );
      expect(find.byType(CartaoDoPerdido), findsNothing);
      expect(
        find.text('Nenhum pet perdido na sua região agora.'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('ISCA: `city` vai na consulta, e SEM cabecalho de autenticacao',
        (tester) async {
      // DESLIGANDO: troque `exigeToken: false` por `true` em
      // `lib/api/perdidos_api.dart`. O cabecalho aparece e este caso reprova.
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      expect(pedidos, hasLength(1));
      expect(pedidos.single.url.queryParameters['city'], 'São Paulo');
      expect(pedidos.single.url.queryParameters['period'], '30d');
      expect(pedidos.single.url.queryParameters['limit'], '20');
      expect(
        pedidos.single.headers.containsKey('Authorization'),
        isFalse,
        reason: 'REPROVA: a listagem publica mandou credencial. A rota declara '
            '`security: []`, e token vencido passaria a derrubar a tela de '
            'quem mais precisa dela.',
      );
    });

    testWidgets('a paginacao e por PAGINA, e `Carregar mais` traz a seguinte',
        (tester) async {
      final urls = <Uri>[];
      await abrirPets(
        tester,
        rede: redeQuePaginaPerdidos(vinteECincoPerdidos(), urls: urls),
      );
      expect(perdidosNaTela(tester), hasLength(20));
      final botao = find.text('Carregar mais');
      expect(botao, findsOneWidget);
      await tester.ensureVisible(botao);
      await tester.pumpAndSettle();
      await tester.tap(botao);
      await tester.pumpAndSettle();
      expect(perdidosNaTela(tester), hasLength(25));
      expect(urls.map((u) => u.queryParameters['page']), <String>['1', '2']);
      // E o `Carregar mais` SAI quando a lista acaba.
      expect(find.text('Carregar mais'), findsNothing);
      expect(find.text('25 pets perdidos na região.'), findsOneWidget);
    });

    testWidgets('sem cidade cadastrada, a tela diz UMA linha e nao pergunta nada',
        (tester) async {
      // A rota e publica, mas `city` e obrigatoria e a unica fonte de cidade
      // deste app e `Me.reference_area`. Sem ela a tela nao inventa cidade.
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        rede: redeDosPerdidos(
          paginaDePerdidos(const <Map<String, dynamic>>[]),
          pedidos: pedidos,
        ),
        regiao: const RegiaoDeReferencia(bairro: 'Vila Mariana'),
      );
      expect(
        find.text(
          'Cadastre sua região no perfil para ver os pets perdidos por perto.',
        ),
        findsOneWidget,
      );
      expect(
        pedidos,
        isEmpty,
        reason: 'REPROVA: a tela chamou a rota sem cidade, e o servidor '
            'responderia 400.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. NENHUM UUID INTERNO NA LISTAGEM PUBLICA (isca b)
  // -------------------------------------------------------------------------
  group('a listagem publica nao mostra nem navega por UUID interno', () {
    testWidgets('ISCA: com `pet_id` e `case_id` no corpo, nada disso pinta',
        (tester) async {
      // DESLIGANDO: faca `PerdidoPublico.doJson` copiar o mapa inteiro, ou
      // acrescente um `Text(json['pet_id'])` ao cartao. Este caso reprova.
      await abrirPets(
        tester,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(
              vistoEm: '2026-10-16T12:00:00.000Z',
              comUuidHostil: true,
            ),
          ]),
        ),
      );
      final comUuid = textosNaTela(tester).where(umUuid.hasMatch).toList();
      expect(
        comUuid,
        isEmpty,
        reason: 'REPROVA: UUID interno na tela publica (ADR-0010 item 6). '
            'Achados: $comUuid',
      );
    });

    testWidgets('a chave do cartao e o `share_token`, que nao e UUID',
        (tester) async {
      await abrirPets(
        tester,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(
              vistoEm: '2026-10-16T12:00:00.000Z',
              comUuidHostil: true,
            ),
          ]),
        ),
      );
      final cartao =
          find.byType(CartaoDoPerdido).evaluate().single.widget as CartaoDoPerdido;
      expect(cartao.perdido.shareToken, tokenDeMel);
      expect(umUuid.hasMatch(cartao.perdido.shareToken), isFalse);
      // E o cartao NAO promete toque: `/pets/:petId` e endereçada por UUID
      // interno, e a tela do caso publico por token e do SITE, nao do app.
      expect(
        cartao.aoTocar,
        isNull,
        reason: 'REPROVA: o cartao publico ganhou toque. Se o destino for '
            '`/pets/:petId`, ele carrega UUID interno; se for outro, confira '
            'que ele existe antes de prometer.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. `cacheWidth` PELO TAMANHO PINTADO (isca d)
  // -------------------------------------------------------------------------
  group('a foto da lista nao custa 4 MiB por cartao', () {
    testWidgets('ISCA: `cacheWidth` presente, pela largura que a tela pinta',
        (tester) async {
      // DESLIGANDO: apague `cacheWidth` de `lib/widgets/imagem_da_rede.dart`.
      // O provedor deixa de ser `ResizeImage` e este caso reprova.
      await abrirPets(
        tester,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
        ),
      );

      final imagens = find
          .descendant(
            of: find.byType(CartaoDoPerdido),
            matching: find.byType(Image),
          )
          .evaluate();
      expect(
        imagens,
        hasLength(1),
        reason: 'REPROVA: a foto do perdido nao esta na arvore.',
      );

      final imagem = imagens.single.widget as Image;
      final provedor = imagem.image;
      expect(
        provedor,
        isA<ResizeImage>(),
        reason: 'REPROVA: a imagem foi decodificada no tamanho do ARQUIVO. A '
            'derivada `thumb` custa 133 KiB por cartao assim, e quem apontar a '
            'lista para a `card` de 1024 px passa a pagar 4,42 MiB por cartao '
            '-- 88 MiB numa pagina de vinte.',
      );

      final esperado = (BichuMolduraDeTeste.larguraFotoSm *
              tester.view.devicePixelRatio)
          .round();
      expect(
        (provedor as ResizeImage).width,
        esperado,
        reason: 'REPROVA: `cacheWidth` nao e a largura PINTADA em pixeis do '
            'aparelho. Esperado $esperado.',
      );
      expect(
        provedor.height,
        isNull,
        reason: 'REPROVA: fixar a altura tambem distorce a foto, porque a '
            'derivada nao tem a proporcao da moldura.',
      );
    });

    testWidgets('sem foto pronta, a moldura fica e NAO ha `Image` na arvore',
        (tester) async {
      // Ausencia e decisao de quem chama: `ImagemDaRede` recebe `url` nao
      // anulavel de proposito, e `Image.network('')` lanca.
      await abrirPets(
        tester,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z', foto: null),
          ]),
        ),
      );
      expect(find.byType(CartaoDoPerdido), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(CartaoDoPerdido),
          matching: find.byType(ImagemDaRede),
        ),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  });

  // -------------------------------------------------------------------------
  // 4. OS MEUS ACHADOS, E SO OS MEUS (isca c)
  // -------------------------------------------------------------------------
  group('Perfil > Meus achados consome a operacao que ja existia', () {
    testWidgets('ISCA: a lista mostra os achados desta conta, com credencial',
        (tester) async {
      // DESLIGANDO: apague o `ItemDeMenu` de `Meus achados` do `AbaPerfil` em
      // `lib/telas/abas.dart`, ou o metodo `listarMeus` de
      // `lib/api/achados_api.dart`. Este caso reprova.
      final pedidos = <http.Request>[];
      await abrirMeusAchados(
        tester,
        rede: redeDosAchados(
          <Map<String, dynamic>>[
            achadoDoContrato(id: '018f3a2b-0000-7000-8000-00000000a001'),
            achadoDoContrato(
              id: '018f3a2b-0000-7000-8000-00000000a002',
              status: 'closed',
              area: null,
              achadoEm: '2026-10-02T10:00:00.000Z',
            ),
          ],
          pedidos: pedidos,
        ),
      );

      expect(find.text('Em análise'), findsOneWidget);
      expect(find.text('Encerrado'), findsOneWidget);
      expect(find.text('Achado em 16/10/2026'), findsOneWidget);
      // `area_label` nulo vira o rotulo DO CLIENTE, e nao um bairro.
      expect(find.text('Região não informada'), findsOneWidget);
      expect(find.text('Você registrou 2 achados.'), findsOneWidget);

      expect(pedidos, hasLength(1));
      expect(pedidos.single.url.path, '/v1/found-reports');
      expect(
        pedidos.single.headers['Authorization'],
        'Bearer token-de-teste',
        reason: 'REPROVA: a lista do proprio relator foi pedida sem '
            'credencial. A autorizacao esta no `WHERE` do servidor, e sem '
            'token nao ha dono a comparar.',
      );
      // E NADA de filtro de dono no cliente: autorizacao do lado errado do fio.
      expect(
        pedidos.single.url.queryParameters.keys,
        <String>['limit'],
      );
    });

    testWidgets('CONTRAPESO: achado de outra conta responde 404, e a tela nao '
        'afirma que ele existe', (tester) async {
      // 404 e nunca 403 (ADR-0021): um 403 confirmaria que aquele id e um
      // achado de verdade.
      await abrirMeusAchados(
        tester,
        rede: redeDosAchados(<Map<String, dynamic>>[
          achadoDoContrato(id: '018f3a2b-0000-7000-8000-00000000a001'),
        ]),
      );
      expect(find.text('Você registrou 1 achado.'), findsOneWidget);
      // O cartao leva ao detalhe que JA existia.
      await tester.tap(find.text('Em análise'));
      await tester.pumpAndSettle();
      expect(
        find.text('Em análise'),
        findsNothing,
        reason: 'REPROVA: o toque no cartao nao abriu o detalhe do achado.',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('CONTRAPESO: lista vazia leva UMA linha', (tester) async {
      await abrirMeusAchados(
        tester,
        rede: redeDosAchados(const <Map<String, dynamic>>[]),
      );
      expect(
        find.text('Você ainda não registrou nenhum achado.'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('a paginacao e por CURSOR, e o cursor vem do servidor',
        (tester) async {
      final pedidos = <http.Request>[];
      await abrirMeusAchados(
        tester,
        rede: redeDosAchados(
          <Map<String, dynamic>>[
            achadoDoContrato(id: '018f3a2b-0000-7000-8000-00000000a001'),
          ],
          pedidos: pedidos,
          proximoCursor: 'cursor-opaco-2',
        ),
      );
      final botao = find.text('Carregar mais');
      expect(botao, findsOneWidget);
      await tester.ensureVisible(botao);
      await tester.pumpAndSettle();
      await tester.tap(botao);
      await tester.pumpAndSettle();
      expect(pedidos, hasLength(2));
      expect(
        pedidos.last.url.queryParameters['cursor'],
        'cursor-opaco-2',
        reason: 'REPROVA: a pagina seguinte foi pedida sem o cursor que o '
            'servidor devolveu. Com deslocamento, item novo entre as duas '
            'chamadas faz a pagina 2 repetir ou pular achado.',
      );
      expect(
        pedidos.last.url.queryParameters.containsKey('page'),
        isFalse,
        reason: 'REPROVA: `listMyFoundReports` nao aceita `page`.',
      );
    });
  });
}

/// A largura de `foto/sm`, copiada do widget para o teste poder calcular o
/// `cacheWidth` esperado sem importar o arquivo de desenho inteiro.
///
/// **Copia consciente**, e a unica deste arquivo: `BichuMoldura` mora em
/// `lib/widgets/moldura.dart` e e publico, mas ler a constante de la faria o
/// caso comparar o valor com ele mesmo -- que e exatamente o defeito que o
/// cabecalho deste arquivo recusa. Se o desenho mudar de 56 dp, este numero
/// reprova e alguem le a tabela do 5.4 de novo.
abstract final class BichuMolduraDeTeste {
  static const double larguraFotoSm = 56;
}
