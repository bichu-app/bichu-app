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
import 'package:bichu/sessao/cidade_escolhida.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
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
  DepositoDaCidade? depositoDaCidade,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado
        ? depositoLogado(regiaoDeReferencia: regiao ?? regiaoDeSaoPaulo)
        : null,
    depositoDaCidade: depositoDaCidade,
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
  // A PORTA DA CONTA E A FOTO DA BARRA DE TOPO (uniao de 18/10/2026).
  // Este ajudante nasceu num ramo anterior a saida de `Perfil` da barra de
  // baixo e tocava o slot que nao existe mais. `irParaAConta` e a mesma
  // porta que os outros dezesseis arquivos usam; o caso prova o mesmo.
  await irParaAConta(tester);
  final porta = find.text('Meus achados');
  await tester.ensureVisible(porta);
  await tester.pumpAndSettle();
  await tester.tap(porta);
  await tester.pumpAndSettle();
}

/// Abre a folha de filtro, digita [cidade] no campo `Cidade` e toca `Aplicar`.
///
/// O caminho de ENTRADA depende do estado: sem lista, a barra nao nasce
/// (`desenha` responde falso com `total: 0`) e a porta e o botao
/// `Escolher cidade` do corpo; com lista, e o icone `Icons.tune` do slot unico
/// de acao da barra de topo. Este atalho tenta os dois, e e isso que o torna
/// capaz de medir os dois estados com um caso cada.
Future<void> escolherCidade(WidgetTester tester, String cidade) async {
  final botao = find.text('Escolher cidade');
  if (botao.evaluate().isNotEmpty) {
    await tester.ensureVisible(botao);
    await tester.pumpAndSettle();
    await tester.tap(botao);
  } else {
    // O GATILHO DE FILTRO MORA NO CORPO, e nao na `AppBar` (uniao de
    // 18/10/2026). Este ajudante nasceu antes da decisao do cliente de levar
    // busca, filtro e ordenacao para o topo do CORPO da listagem; procurar
    // dentro da `AppBar` passou a nao achar nada. O caso prova o mesmo: que
    // existe UM caminho ate a folha de filtro.
    final icone = find.byIcon(Icons.tune);
    expect(
      icone,
      findsOneWidget,
      reason: 'REPROVA: nao ha caminho nenhum para a folha de filtro. Sem ele '
          'quem quer trocar de cidade nao tem como.',
    );
    await tester.tap(icone);
  }
  await tester.pumpAndSettle();

  expect(
    find.text('Cidade'),
    findsOneWidget,
    reason: 'REPROVA: a folha nao tem campo de cidade. Deslogado ele e a UNICA '
        'fonte de cidade, e sem ele a rota nao e chamada.',
  );

  // **DENTRO DA FOLHA, e nao `find.byType(TextField).first`.** Com a lista
  // cheia o campo de BUSCA tambem e um `TextField`, e vem antes na arvore: a
  // primeira versao deste atalho digitava a cidade no campo de busca, o
  // `Aplicar` ficava desabilitado por nao haver mudanca, e o caso reprovava
  // dizendo que trocar de cidade nao chama a rota -- pelo motivo errado.
  final campo = find.descendant(
    of: find.byType(BottomSheet),
    matching: find.byType(TextField),
  );
  expect(
    campo,
    findsOneWidget,
    reason: 'REPROVA: a folha tem zero ou mais de um campo de texto, e este '
        'atalho nao sabe em qual digitar.',
  );
  await tester.enterText(campo, cidade);
  await tester.pumpAndSettle();

  final aplicar = find.text('Aplicar');
  await tester.ensureVisible(aplicar);
  await tester.pumpAndSettle();
  await tester.tap(aplicar);
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
          'Escolha uma cidade para ver os pets perdidos por perto.',
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
  // 1-B. A CIDADE DIGITADA (autorizada pelo cliente em 18/10/2026)
  // -------------------------------------------------------------------------
  group('a cidade e digitavel, e deslogado ela e a unica fonte', () {
    testWidgets('ISCA: DESLOGADO, a cidade digitada chama a rota e desenha a '
        'lista', (tester) async {
      // DESLIGANDO: tire `campos:` de `_controleDeFiltro()` em
      // `lib/telas/perdido/lista_de_perdidos.dart`, ou o bloco
      // `for (final campo in widget.campos)` da folha em
      // `lib/widgets/barra_de_listagem.dart`. Este caso reprova por nao achar
      // o campo `Cidade`.
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        logado: false,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );

      // Antes de digitar, NADA foi pedido: sem cidade a rota nao e chamada.
      expect(
        pedidos,
        isEmpty,
        reason: 'REPROVA: a tela chamou a rota sem cidade, e o servidor '
            'responderia 400.',
      );
      expect(find.byType(CartaoDoPerdido), findsNothing);

      await escolherCidade(tester, 'Campinas');

      expect(pedidos, hasLength(1));
      expect(pedidos.single.url.queryParameters['city'], 'Campinas');
      expect(
        pedidos.single.headers.containsKey('Authorization'),
        isFalse,
        reason: 'REPROVA: a listagem publica mandou credencial numa rota que '
            'declara `security: []`.',
      );
      expect(find.text('Mel'), findsOneWidget);
    });

    testWidgets('ISCA: LOGADO, o padrao e a regiao E a pessoa pode trocar',
        (tester) async {
      // DESLIGANDO: troque a ordem do `??` em `_cidadeEmUso`
      // (`lib/telas/perdido/lista_de_perdidos.dart`), para a regiao ganhar da
      // digitada. O segundo pedido volta a `São Paulo` e este caso reprova --
      // que e exatamente o "nao force a regiao do perfil" do pedido.
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
      expect(
        pedidos.first.url.queryParameters['city'],
        'São Paulo',
        reason: 'REPROVA: o padrao de quem tem conta deixou de ser '
            '`Me.reference_area.city`.',
      );

      await escolherCidade(tester, 'Campinas');

      expect(pedidos, hasLength(2));
      expect(
        pedidos.last.url.queryParameters['city'],
        'Campinas',
        reason: 'REPROVA: trocar a cidade na folha nao mudou a chamada. Quem '
            'esta em viagem, ou procurando na cidade vizinha, ficou preso na '
            'regiao do perfil.',
      );
      // E a pagina volta para a 1: o recorte e outro.
      expect(pedidos.last.url.queryParameters['page'], '1');
    });

    testWidgets('ISCA: DESLOGADO, a cidade GUARDADA no aparelho e usada sem '
        'redigitar', (tester) async {
      // DESLIGANDO: tire `_cidadeDoAparelho` de `_cidadeEmUso`, ou o
      // `_carregar()` do fim de `_lerOAparelho`, em
      // `lib/telas/perdido/lista_de_perdidos.dart`. Este caso reprova por
      // nenhuma chamada ter saido.
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        logado: false,
        depositoDaCidade: DepositoDaCidadeEmMemoria(conteudo: 'Campinas'),
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      expect(
        pedidos,
        hasLength(1),
        reason: 'REPROVA: a cidade guardada no aparelho nao foi usada, e o '
            'visitante teria de redigitar a cada abertura.',
      );
      expect(pedidos.single.url.queryParameters['city'], 'Campinas');
      expect(find.text('Mel'), findsOneWidget);
    });

    testWidgets('LOGADO: a regiao GANHA da cidade guardada no aparelho',
        (tester) async {
      // A precedencia e: digitada > regiao > guardada. Quem tem conta com
      // regiao abre na regiao, e nao na cidade da ultima busca.
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        depositoDaCidade: DepositoDaCidadeEmMemoria(conteudo: 'Campinas'),
        rede: redeDosPerdidos(
          paginaDePerdidos(const <Map<String, dynamic>>[]),
          pedidos: pedidos,
        ),
      );
      expect(pedidos, isNotEmpty);
      for (final p in pedidos) {
        expect(
          p.url.queryParameters['city'],
          'São Paulo',
          reason: 'REPROVA: a cidade guardada no aparelho passou por cima da '
              'regiao cadastrada.',
        );
      }
    });

    testWidgets('ISCA: o armazenamento FALHANDO nao derruba a tela',
        (tester) async {
      // `DepositoDaCidadeQueFalha` estoura nas duas pontas: e o aparelho com
      // armazenamento bloqueado, o perfil restrito e o build sem o plugin
      // registrado. A tela tem de abrir normalmente, com o campo vazio.
      //
      // DESLIGANDO: apague o `try`/`on Object` de `CidadeEscolhida.ler` em
      // `lib/sessao/cidade_escolhida.dart`. A excecao escapa pelo
      // `addPostFrameCallback` e este caso reprova.
      await abrirPets(
        tester,
        logado: false,
        depositoDaCidade: const DepositoDaCidadeQueFalha(),
        rede: redeDosPerdidos(paginaDePerdidos(const <Map<String, dynamic>>[])),
      );
      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: a leitura do aparelho derrubou a secao em que o '
            'aplicativo ABRE.',
      );
      expect(
        find.text('Escolha uma cidade para ver os pets perdidos por perto.'),
        findsOneWidget,
      );
      // E o caminho para escolher a cidade esta la, mesmo com o aparelho
      // mudo: a conveniencia falhou, a funcao nao.
      await escolherCidade(tester, 'Campinas');
      expect(tester.takeException(), isNull);
    });

    testWidgets('ISCA: `Aplicar` NAO habilita com a cidade abaixo do piso',
        (tester) async {
      // DESLIGANDO: tire o `if (!_camposServem) return false;` de `_mudou`, em
      // `lib/widgets/barra_de_listagem.dart`. O `Aplicar` habilita, a rota e
      // chamada sem cidade valida e volta 400 -- a pessoa leria falha de
      // servidor onde falta um dado dela.
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        logado: false,
        rede: redeDosPerdidos(
          paginaDePerdidos(const <Map<String, dynamic>>[]),
          pedidos: pedidos,
        ),
      );
      await tester.tap(find.text('Escolher cidade'));
      await tester.pumpAndSettle();

      // Um caractere so: abaixo do `minLength: 2` do contrato. O campo e o da
      // FOLHA, pelo mesmo motivo de `escolherCidade`.
      await tester.enterText(
        find.descendant(
          of: find.byType(BottomSheet),
          matching: find.byType(TextField),
        ),
        'C',
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Escreva o nome da cidade, com dois caracteres ou mais.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Aplicar'))
            .onPressed,
        isNull,
        reason: 'REPROVA: o `Aplicar` habilitou com a cidade abaixo do piso do '
            'contrato.',
      );
      expect(pedidos, isEmpty);
    });

    testWidgets('o estado (UF) NAO vai no pedido, porque a rota nao o declara',
        (tester) async {
      // MEDIDO em 18/10/2026 contra `api/openapi.yaml`: `listPublicLostPets`
      // declara `city`, `neighborhood`, `species`, `size`, `period`, `q`,
      // `page` e `limit`, e **nao** `state`. `listDirectoryEntries` declara
      // (`UF, duas letras`), entao o padrao existe no contrato -- so nao nesta
      // operacao. Desenhar um seletor de UF seria controle sem desfecho.
      //
      // Este caso e o registro executavel da medicao: no dia em que o contrato
      // ganhar `state`, ele reprova e alguem liga as duas pontas.
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        logado: false,
        rede: redeDosPerdidos(
          paginaDePerdidos(const <Map<String, dynamic>>[]),
          pedidos: pedidos,
        ),
      );
      await escolherCidade(tester, 'Campinas');
      expect(pedidos, hasLength(1));
      expect(
        pedidos.single.url.queryParameters.containsKey('state'),
        isFalse,
        reason: 'REPROVA: a tela mandou `state` numa operacao que nao o '
            'declara.',
      );
      expect(
        find.text('Estado'),
        findsNothing,
        reason: 'REPROVA: ha um seletor de estado na folha, e a rota nao aceita '
            'estado. Controle cujo valor nao tem para onde ir e controle sem '
            'desfecho.',
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
      // **A LISTA SERVE, E O DETALHE 404.** Ate 19/10 este caso passava a
      // MESMA lista para os dois caminhos de `redeDosAchados`, e aquele
      // ajudante devolve 200 no detalhe quando o id esta na lista -- entao o
      // 404 que da o nome ao caso nunca acontecia. Ele passava por outro
      // motivo: media "saimos da lista" por `Em análise` ter desaparecido, e
      // a tela do achado nao mostrava estado nenhum. Quando ela passou a
      // mostrar o estado do servidor (`Em análise` para `open`), o proxy caiu
      // -- e a queda revelou que o caso media navegacao, e nao autorizacao.
      final listaSoNaListagem = redeDosAchados(<Map<String, dynamic>>[
        achadoDoContrato(id: '018f3a2b-0000-7000-8000-00000000a001'),
      ]);
      await abrirMeusAchados(
        tester,
        rede: (req) async {
          if (req.url.path.startsWith('/v1/found-reports/')) {
            return problema('not-found', 404);
          }
          return listaSoNaListagem(req);
        },
      );
      expect(find.text('Você registrou 1 achado.'), findsOneWidget);
      // O cartao leva ao detalhe que JA existia.
      await tester.tap(find.text('Em análise'));
      await tester.pumpAndSettle();
      expect(
        find.text(TextosDoAchado.naoEncontrado),
        findsOneWidget,
        reason:
            'REPROVA: o toque no cartao nao abriu o detalhe, ou o detalhe nao '
            'disse "${TextosDoAchado.naoEncontrado}" diante do 404. A mesma '
            'frase vale para "nao existe" e para "nao e seu" (ADR-0021): duas '
            'frases diferentes confirmariam, a quem nao e o dono, qual dos '
            'dois identificadores existe.',
      );
      expect(
        find.text('Em análise'),
        findsNothing,
        reason:
            'REPROVA: a tela mostra o estado de um achado que o servidor '
            'respondeu como ausente -- ou continuamos na lista.',
      );
      expect(
        find.text(TextosDoAchado.tituloDeQuemFoiAvisado),
        findsNothing,
        reason:
            'REPROVA: meia tela desenhada sobre uma ausencia ja conta que o '
            'registro existe.',
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
