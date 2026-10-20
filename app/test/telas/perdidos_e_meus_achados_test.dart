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
import 'package:bichu/telas/perdido/cartao_do_perdido.dart';
import 'package:bichu/telas/perdido/tela_do_caso_publico.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
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

/// O rotulo do campo de cidade na folha, **como ele aparece desde 19/10/2026**.
///
/// `BichuField` escreve `"<rotulo> (opcional)"` quando `opcional` e verdadeiro
/// (`lib/widgets/bichu_field.dart`), e o campo de cidade passou a ser opcional
/// por decisao do cliente. Entao o rotulo visivel mudou de `Cidade` para
/// `Cidade (opcional)` **sem ninguem escrever esse texto** -- ele e derivado.
///
/// Vale como medida: o texto na tela e a prova de que `obrigatorio` saiu de
/// `_campoDaCidade`. Reponha `obrigatorio: true` e todo caso que usa este
/// ajudante reprova por nao achar o rotulo.
const String rotuloDoCampoDeCidade = 'Cidade (opcional)';

/// Abre a folha de filtro, digita [cidade] no campo de cidade e toca `Aplicar`.
///
/// **A porta e UMA desde 19/10/2026**: o icone `Icons.tune` do slot de acao. O
/// botao `Escolher cidade` do corpo nao existe mais -- ele era a saida da fase
/// `semCidade`, e a fase saiu com a obrigatoriedade da cidade. A barra tambem
/// nasce sempre agora: a lista abre com itens em vez de esperar uma cidade.
Future<void> escolherCidade(WidgetTester tester, String cidade) async {
  final icone = find.byIcon(Icons.tune);
  expect(
    icone,
    findsOneWidget,
    reason: 'REPROVA: nao ha caminho nenhum para a folha de filtro. Sem ele '
        'quem quer trocar de cidade nao tem como.',
  );
  await tester.tap(icone);
  await tester.pumpAndSettle();

  expect(
    find.text(rotuloDoCampoDeCidade),
    findsOneWidget,
    reason: 'REPROVA: a folha nao tem o campo de cidade com o rotulo '
        '"$rotuloDoCampoDeCidade". Se o rotulo voltou a ser "Cidade" sem o '
        'sufixo, `obrigatorio: true` voltou a `_campoDaCidade` e esvaziar o '
        'campo deixou de ser um recorte valido.',
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
      // **SEM "na sua região"** desde 19/10/2026: a lista abre sem cidade, e a
      // frase antiga afirmava um recorte geografico que o servidor nao aplicou.
      expect(find.text('Nenhum pet perdido agora.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
        'ISCA: a lista abre SEM `city` na consulta, e SEM cabecalho de autenticacao',
        (tester) async {
      // ISCA (a) no app, decisao do cliente de 19/10/2026: *"o campo cidade do
      // filtro da pagina pet nao deve ser obrigatorio"*.
      //
      // **Este caso media o contrario ate hoje**: ele exigia
      // `queryParameters['city'] == 'São Paulo'`, vindo de
      // `Me.reference_area.city`. A conta deste teste CONTINUA tendo regiao em
      // Sao Paulo (`abrirPets` usa `regiaoDeSaoPaulo`), e e isso que torna o
      // caso forte: a regiao existe e NAO recorta mais. Abrir filtrado pela
      // regiao de quem tem conta e a reclamacao de 18/10 um nivel acima.
      //
      // DESLIGANDO: reponha a precedencia de cidade em `lista_de_perdidos.dart`
      // (`_cidadeEmUso`/`_cidadeDaRegiao`) e este caso reprova pelo nome.
      //
      // O `exigeToken: false` continua medido na mesma chamada: troque-o por
      // `true` em `lib/api/perdidos_api.dart` e o cabecalho aparece.
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
        pedidos.single.url.queryParameters.containsKey('city'),
        isFalse,
        reason: 'REPROVA: a lista abriu recortada por uma cidade que ninguem '
            'escolheu. `city` nao pode ir na consulta de abertura, nem vindo '
            'da regiao do perfil.',
      );
      // E os 20 ultimos: o `limit` do contrato, e a pagina 1.
      expect(pedidos.single.url.queryParameters['limit'], '20');
      expect(pedidos.single.url.queryParameters['page'], '1');
      expect(
        pedidos.single.headers.containsKey('Authorization'),
        isFalse,
        reason: 'REPROVA: a listagem publica mandou credencial. A rota declara '
            '`security: []`, e token vencido passaria a derrubar a tela de '
            'quem mais precisa dela.',
      );
    });

    testWidgets(
        'ISCA: a pagina de pets abre SEM FILTRO NENHUM, e sem `period`',
        (tester) async {
      // PEDIDO DO CLIENTE, 18/10/2026: *"a pagina de pets nao deve trazer
      // nenhum item do filtro por padrao, como esta atualmente por ultimos 30
      // dias"*.
      //
      // DESLIGANDO: em `lib/api/modelos_perdido.dart`, volte
      // `this.janela = JanelaDePerdidos.trintaDias` no construtor de
      // `RecorteDePerdidos` (ou faca `JanelaDePerdidos.de` devolver
      // `trintaDias` no lugar de nulo). As DUAS medidas deste caso reprovam:
      // `period=30d` reaparece na consulta e o gatilho volta a se chamar
      // "Filtrar, 1 filtro ativo" na primeira abertura.
      //
      // **Ele mede a CONSULTA e o NOME do controle, e nao um texto de apoio.**
      // O que o cliente ve e um filtro que ninguem escolheu ja valendo; as
      // duas medidas sao as duas caras disso -- o recorte que foi pedido ao
      // servidor e o estado que a tela anuncia.
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
        pedidos.single.url.queryParameters.containsKey('period'),
        isFalse,
        reason: 'REPROVA: a pagina de pets mandou `period='
            '${pedidos.single.url.queryParameters['period']}` sem ninguem '
            'ter escolhido janela. Quem decide o que fazer com a ausencia e o '
            'servidor, pelo `default` da rota -- o app parou de escolher '
            'por ele.',
      );

      // O gatilho de recorte se chama pelo VERBO e so: sem "1 filtro ativo",
      // porque nao ha filtro ativo. Esta e a forma de medir o distintivo sem
      // depender de um literal que pode mudar de palavra: o nome com estado
      // tem a palavra "ativo" dentro, e o sem estado nao tem.
      final gatilho = find.byType(GatilhoDeRecorteNoCorpo);
      expect(
        gatilho,
        findsOneWidget,
        reason: 'REPROVA: a pagina de pets abriu sem o gatilho de filtro. Sem '
            'ele as medidas abaixo seriam sobre um controle que nao existe.',
      );
      // O `Tooltip` e DESCENDENTE do gatilho (ele o constroi), e nao
      // ancestral: `GatilhoDeRecorteNoCorpo` e quem envolve o botao.
      final nome = tester
          .widget<Tooltip>(
            find.descendant(of: gatilho, matching: find.byType(Tooltip)),
          )
          .message;
      expect(
        nome,
        'Filtrar',
        reason: 'REPROVA: o gatilho de filtro da pagina de pets abriu se '
            'chamando "$nome". Com filtro nenhum aplicado o nome e o verbo e '
            'so -- qualquer estado no nome quer dizer que algo foi filtrado '
            'sem ninguem pedir.',
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
      // **SEM "na região"**, pelo mesmo motivo do vazio: a lista abre sem
      // cidade e o total conta o que o recorte de fato tem.
      expect(find.text('25 pets perdidos.'), findsOneWidget);
    });

    testWidgets(
        'ISCA: sem cidade cadastrada a lista CARREGA igual, e nao pede nada',
        (tester) async {
      // **ESTE CASO MEDIA O OPOSTO ATE 19/10/2026.** Ele se chamava "sem cidade
      // cadastrada, a tela diz UMA linha e nao pergunta nada" e exigia
      // `pedidos` VAZIO, com o comentario *"a tela chamou a rota sem cidade, e
      // o servidor responderia 400"* -- que era verdade: `city` era `required`.
      //
      // Agora a conta tem regiao SEM cidade (so bairro), que e o estado de
      // quem preencheu o perfil pela metade, e **a lista tem de aparecer
      // igual**. Era exatamente o beco: conta incompleta via uma linha e um
      // botao em vez da lista.
      //
      // DESLIGANDO: reponha a porta `if (cidade == null)` em `_carregar()` de
      // `lib/telas/perdido/lista_de_perdidos.dart` e este caso reprova pelo
      // nome -- a rota deixa de ser chamada e os cartoes nao pintam.
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
        regiao: const RegiaoDeReferencia(bairro: 'Vila Mariana'),
      );
      expect(
        pedidos,
        hasLength(1),
        reason: 'REPROVA: a tela nao chamou a rota. Sem cidade obrigatoria nao '
            'ha mais o que esperar antes de listar.',
      );
      expect(
        pedidos.single.url.queryParameters.containsKey('city'),
        isFalse,
      );
      expect(perdidosNaTela(tester), hasLength(1));
      // E NAO ha mais a linha nem o botao que a substituiam.
      expect(
        find.text('Escolha uma cidade para ver os pets perdidos por perto.'),
        findsNothing,
      );
      expect(find.text('Escolher cidade'), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  // 1-B. A CIDADE E UM FILTRO OPCIONAL (cliente, 19/10/2026)
  // -------------------------------------------------------------------------
  //
  // ESTE GRUPO SE CHAMAVA "a cidade e digitavel, e deslogado ela e a unica
  // fonte", e media a PRECEDENCIA de tres fontes de cidade: a digitada, a
  // `Me.reference_area.city` e a ultima guardada no aparelho
  // (`CidadeEscolhida`). Sete casos, e a maior parte deles afirmava que a lista
  // NAO carrega antes de haver cidade -- *"a tela chamou a rota sem cidade, e o
  // servidor responderia 400"*.
  //
  // A decisao do cliente de 19/10/2026 (*"o campo cidade do filtro da pagina
  // pet nao deve ser obrigatorio, mas devemos filtrar pelos 20 ultimos pets
  // cadastrados e deixar que ele altere os filtros manualmente"*) retirou a
  // obrigatoriedade, e com ela a precedencia inteira: qualquer uma das tres
  // fontes, aplicada na abertura, faria a pagina abrir FILTRADA por uma cidade
  // que ninguem escolheu. O que fica medido aqui e o que sobrou, e e o que ele
  // pediu: a cidade e um filtro como os outros, da para POR e da para TIRAR.
  //
  // O que saiu de teste junto, e por que nao e perda de cobertura:
  //
  // - os casos da cidade guardada no aparelho e da regiao ganhando dela nao
  //   tem mais mecanismo a medir. `CidadeEscolhida` continua existindo, com
  //   `test/sessao/cidade_escolhida_test.dart` inteiro em cima dela; o que
  //   deixou de existir e o LEITOR dela nesta tela.
  // - o caso do armazenamento falhando media que a leitura do aparelho nao
  //   derrubava a tela. Sem leitura nenhuma, nao ha o que derrubar -- e o
  //   `try`/`on Object` de `CidadeEscolhida.ler` continua coberto no arquivo
  //   proprio dela.
  group('a cidade e um filtro opcional, e da para por e tirar', () {
    testWidgets('ISCA: DESLOGADO, a lista abre SEM cidade e ja desenha',
        (tester) async {
      // **ESTE CASO MEDIA O OPOSTO**: ele exigia `pedidos` vazio antes de
      // digitar, com o motivo *"sem cidade a rota nao e chamada"*. Agora a
      // primeira coisa que a secao faz, deslogada e sem nada guardado, e
      // chamar a rota sem `city` e pintar cartao.
      //
      // DESLIGANDO: reponha a porta `if (cidade == null)` em `_carregar()` de
      // `lib/telas/perdido/lista_de_perdidos.dart`.
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
      expect(
        pedidos,
        hasLength(1),
        reason: 'REPROVA: deslogado e sem cidade, a tela nao chamou a rota. '
            'E quem nao tem conta que a vizinhanca precisa que veja a lista.',
      );
      expect(pedidos.single.url.queryParameters.containsKey('city'), isFalse);
      expect(
        pedidos.single.headers.containsKey('Authorization'),
        isFalse,
        reason: 'REPROVA: a listagem publica mandou credencial numa rota que '
            'declara `security: []`.',
      );
      expect(find.text('Mel'), findsOneWidget);
    });

    testWidgets('ISCA (e): digitar uma cidade RECORTA, e a pagina volta para 1',
        (tester) async {
      // ISCA (e) do briefing: o filtro muda o recorte. No app isso se mede na
      // CONSULTA que sai -- `applied_filters` e medido no servidor, em
      // `src/modules/lostfound/adapters/http/listagem-publica-de-perdidos.test.ts`.
      //
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
      expect(pedidos, hasLength(1));

      await escolherCidade(tester, 'Campinas');

      expect(pedidos, hasLength(2));
      expect(pedidos.last.url.queryParameters['city'], 'Campinas');
      expect(pedidos.last.url.queryParameters['page'], '1');
      expect(find.text('Mel'), findsOneWidget);
    });

    testWidgets(
        'ISCA: a regiao do perfil NAO recorta, nem para quem tem conta',
        (tester) async {
      // O caso antigo exigia o contrario -- `city == 'São Paulo'` vindo de
      // `Me.reference_area.city`, com o motivo *"o padrao de quem tem conta
      // deixou de ser Me.reference_area.city"*. A conta deste caso continua
      // tendo regiao em Sao Paulo, e e isso que o torna forte: a regiao esta
      // la, legivel, e nao entra na consulta.
      //
      // DESLIGANDO: reponha `_cidadeDaRegiao` na cidade do recorte em
      // `lib/telas/perdido/lista_de_perdidos.dart`.
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        rede: redeDosPerdidos(
          paginaDePerdidos(const <Map<String, dynamic>>[]),
          pedidos: pedidos,
        ),
      );
      expect(pedidos, isNotEmpty);
      for (final p in pedidos) {
        expect(
          p.url.queryParameters.containsKey('city'),
          isFalse,
          reason: 'REPROVA: a regiao do perfil voltou a recortar a lista de '
              'abertura. Abrir filtrado pelo que ninguem escolheu e a '
              'reclamacao de 18/10 um nivel acima.',
        );
      }
    });

    testWidgets('ISCA: APAGAR a cidade no filtro volta a mostrar todas',
        (tester) async {
      // O caminho de volta, e ele e a metade do pedido que mais facilmente
      // ficaria de fora: *"deixar que ele altere os filtros manualmente"*.
      //
      // DESLIGANDO (duas formas, as duas medidas em 19/10/2026):
      //   1. reponha `obrigatorio: true` em `_campoDaCidade`
      //      (`lista_de_perdidos.dart`): o `Aplicar` nao habilita com o campo
      //      vazio e o terceiro pedido nunca sai;
      //   2. troque o sentinela de `cidade` em `RecorteDePerdidos.copiar`
      //      (`lib/api/modelos_perdido.dart`) por `cidade ?? this.cidade`:
      //      passar nulo volta a ser indistinguivel de nao passar nada, e a
      //      cidade anterior continua valendo.
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
      await escolherCidade(tester, 'Campinas');
      expect(pedidos.last.url.queryParameters['city'], 'Campinas');

      // Agora APAGA o campo e aplica de novo.
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.descendant(
          of: find.byType(BottomSheet),
          matching: find.byType(TextField),
        ),
        '',
      );
      await tester.pumpAndSettle();
      final aplicar = find.widgetWithText(FilledButton, 'Aplicar');
      expect(
        tester.widget<FilledButton>(aplicar).onPressed,
        isNotNull,
        reason: 'REPROVA: o `Aplicar` nao habilita com a cidade VAZIA. Esvaziar '
            'o campo e um recorte valido desde 19/10/2026, e e o unico caminho '
            'de volta para "todas as cidades".',
      );
      await tester.tap(aplicar);
      await tester.pumpAndSettle();

      expect(pedidos, hasLength(3));
      expect(
        pedidos.last.url.queryParameters.containsKey('city'),
        isFalse,
        reason: 'REPROVA: apagar a cidade nao a tirou da consulta.',
      );
    });

    testWidgets('CONTRAPESO: `Aplicar` NAO habilita com a cidade abaixo do piso',
        (tester) async {
      // Omitir e geografia aberta; mandar UM caractere e 400. Os dois nao sao
      // a mesma coisa, e sem este caso a isca de cima (campo vazio habilita)
      // justificaria habilitar com qualquer coisa.
      //
      // DESLIGANDO: tire o `if (!_camposServem) return false;` de `_mudou`, em
      // `lib/widgets/barra_de_listagem.dart`.
      //
      // **A LISTA AQUI TEM ITEM, e nao e detalhe.** Com `paginaDePerdidos([])`
      // a barra NAO NASCE -- `BarraDeListagem.desenha` e
      // `total != 0 || _recorteAtivo`, e os dois sao falsos numa lista vazia
      // sem recorte. Este caso media com lista vazia enquanto a porta para a
      // folha era o botao `Escolher cidade` do corpo, que existia justamente
      // nesse estado; sem a fase `semCidade` a porta e so o gatilho da barra.
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
      final antes = pedidos.length;
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();

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
      expect(pedidos, hasLength(antes));
    });

    testWidgets('o estado (UF) NAO vai no pedido, porque a rota nao o declara',
        (tester) async {
      // MEDIDO em 18/10/2026 contra `api/openapi.yaml`, e reconferido em
      // 19/10: `listPublicLostPets` declara `city`, `neighborhood`, `species`,
      // `size`, `period`, `q`, `page` e `limit`, e **nao** `state`.
      // `listDirectoryEntries` declara (`UF, duas letras`), entao o padrao
      // existe no contrato -- so nao nesta operacao. Desenhar um seletor de UF
      // seria controle sem desfecho.
      //
      // A CONSEQUENCIA FICOU MAIOR em 19/10, e vale dita: sem `state`, quem
      // digita `Campinas` recebe as tres Campinas do pais. Antes isso valia
      // para quem digitava; agora a lista ABRE nacional, entao a ambiguidade de
      // cidade so aparece para quem filtra -- e continua sem seletor de UF.
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
      await escolherCidade(tester, 'Campinas');
      // **DOIS pedidos agora, e nao um**: a lista ja carrega na abertura, e o
      // segundo e o da cidade digitada. O `pedidos.single` que estava aqui
      // estourava `Bad state: Too many elements` -- e `state` tem de estar
      // fora dos DOIS, nao so do ultimo.
      expect(pedidos, hasLength(2));
      for (final p in pedidos) {
        expect(
          p.url.queryParameters.containsKey('state'),
          isFalse,
          reason: 'REPROVA: a tela mandou `state` numa operacao que nao o '
              'declara.',
        );
      }
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
      // **O CARTAO PASSOU A PROMETER TOQUE** (cliente, 18/10/2026: *"quando o
      // pet esta perdido, deve ter uma pagina interna do pet"*). O que estava
      // aqui era `expect(cartao.aoTocar, isNull)` com o motivo escrito ao lado:
      // *"se for outro, confira que ele existe antes de prometer"*. O destino
      // agora existe -- `TelaDoCasoPublico`, sobre `getPublicLostCase` --, e o
      // que este caso continua cobrando e a OUTRA metade da mesma frase: que o
      // endereco **nao carrega UUID interno**.
      //
      // DESLIGANDO: troque o destino de `lista_de_perdidos.dart` por
      // `Rotas.detalheDoPetDe(...)` com qualquer id. Este caso reprova.
      expect(
        cartao.aoTocar,
        isNotNull,
        reason: 'REPROVA: o cartao da listagem de perdidos voltou a nao levar '
            'a lugar nenhum. O cliente pediu a pagina interna do pet perdido, '
            'e sem toque no cartao ela nao tem porta.',
      );
      await tocar(tester, find.byType(CartaoDoPerdido));

      final pagina = find.byType(TelaDoCasoPublico);
      expect(
        pagina,
        findsOneWidget,
        reason: 'REPROVA: o toque no cartao nao abriu a pagina publica do '
            'caso. Sem ela os `expect` abaixo nao medem nada.',
      );
      final token = tester.widget<TelaDoCasoPublico>(pagina).shareToken;
      expect(
        token,
        tokenDeMel,
        reason: 'REPROVA: a pagina nao foi enderecada pelo `share_token` do '
            'cartao.',
      );
      expect(
        umUuid.hasMatch(token),
        isFalse,
        reason: 'REPROVA: o endereco da pagina publica carrega UUID interno '
            '(ADR-0010, item 6). `PublicLostPet` nao traz `pet_id` nem '
            '`case_id` de proposito -- o contrato diz que ela "nunca deve '
            'possuir" --, e a chave deste caminho e o token opaco.',
      );
      final enderecos = textosNaTela(tester).where(umUuid.hasMatch).toList();
      expect(
        enderecos,
        isEmpty,
        reason: 'REPROVA: UUID interno na pagina publica do caso. '
            'Achados: $enderecos',
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
