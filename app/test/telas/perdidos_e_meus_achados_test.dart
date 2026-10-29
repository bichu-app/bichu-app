// A listagem publica de perdidos na aba `Pets`, e a lista dos meus achados.
//
// Os casos marcados ISCA sao os que precisam REPROVAR com o mecanismo
// desligado. Cada um diz, no proprio corpo, qual arquivo mexer e o que
// observar.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante
// que o produz** nos casos de microcopy: o esperado esta escrito por extenso,
// com acento e pontuacao, e trocar a microcopy reprova -- que e o ponto.

import 'package:bichu/telas/perfil/meus_achados.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/api/modelos.dart';
import 'package:bichu/sessao/cidade_escolhida.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/telas/perdido/cartao_do_perdido.dart';
import 'package:bichu/telas/perdido/lista_de_perdidos.dart';
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
  Localizacao? localizacao,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado
        ? depositoLogado(regiaoDeReferencia: regiao ?? regiaoDeSaoPaulo)
        : null,
    depositoDaCidade: depositoDaCidade,
    // **`LocalizacaoNaoEmbarcada` e o padrao, e isso mantem os casos
    // ANTERIORES medindo o que mediam**: sem aparelho, a resolucao devolve
    // `indisponivel`, cai para a reserva, e `city` nao entra na consulta. Quem
    // quer medir o caminho do GPS passa um dublê.
    localizacao: localizacao,
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
  // **ROLAR ATE A PORTA, e a razao e de 20/10/2026:** o menu da conta ganhou
  // quatro cabecalhos de grupo e um item (*"como o menu do perfil esta
  // crescendo, vamos separar os links por topicos/categorias"*), e
  // `Meus achados` -- o ultimo item do grupo `Bichos na rua` -- desceu abaixo
  // da dobra. `ListView` so constroi o que cabe: `ensureVisible` sozinho
  // estoura com `Bad state: No element`, porque nao ha elemento nenhum para
  // tornar visivel. Rolar e o que a pessoa faz.
  final porta = find.text(MeusAchados.titulo);
  await tester.scrollUntilVisible(porta, 200);
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
/// Abre a folha de filtro, entrega o VALOR do campo de cidade a [conferir] e
/// fecha a folha.
///
/// Existe desde 20/10/2026, e a razao e uma decisao do cliente: a caixa do
/// recorte sai da tela depois de a localizacao dar cidade (*"deve apenas
/// aparecer dentro do filtro a cidade selecionada"*). O unico lugar que diz
/// qual cidade esta valendo passou a ser este campo, e um caso que queira
/// afirmar isso precisa abrir a folha para ver.
///
/// **Fecha a folha no fim**, e isso nao e cortesia: a folha e modal, e deixa-la
/// aberta fariam os `expect` seguintes do caso medirem a tela por baixo dela.
Future<void> escolherCidadeAbrindoAFolha(
  WidgetTester tester,
  void Function(String? valorDoCampo) conferir,
) async {
  final icone = find.byIcon(Icons.tune);
  expect(
    icone,
    findsOneWidget,
    reason: 'REPROVA: nao ha caminho nenhum para a folha de filtro. Com a caixa '
        'do recorte fora da tela, ela e o UNICO lugar que diz e troca a cidade '
        '-- sem ela a pessoa fica com a lista recortada e sem controle.',
  );
  await tester.tap(icone);
  await tester.pumpAndSettle();
  final campo = find.descendant(
    of: find.byType(BottomSheet),
    matching: find.byType(TextField),
  );
  expect(campo, findsOneWidget);
  conferir(tester.widget<TextField>(campo).controller?.text);
  await tester.tapAt(const Offset(10, 10));
  await tester.pumpAndSettle();
}

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
        expect(find.text('Cachorro · Poodle · Pequeno · Caramelo'), findsOneWidget);
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
        // **DESLOGADO desde 19/10/2026**, e a troca e necessaria: com conta, a
        // cidade da regiao passou a RECORTAR (segunda reserva da cadeia), e
        // uma lista vazia com recorte aplicado diz a outra frase -- a do
        // recorte, nao a do vazio. Deslogado nao ha regiao e nao ha GPS, que e
        // o estado em que a frase do vazio e a verdadeira.
        logado: false,
        rede: redeDosPerdidos(paginaDePerdidos(const <Map<String, dynamic>>[])),
      );
      expect(find.byType(CartaoDoPerdido), findsNothing);
      // **SEM "na sua região"** desde 19/10/2026: sem cidade nenhuma, a frase
      // antiga afirmava um recorte geografico que o servidor nao aplicou.
      expect(find.text('Nenhum pet perdido agora.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
        'ISCA: a lista abre SEM `city` na consulta, e SEM cabecalho de autenticacao',
        (tester) async {
      // ISCA (a) no app, decisao do cliente de 19/10/2026: *"o campo cidade do
      // filtro da pagina pet nao deve ser obrigatorio"*.
      //
      // **ESTE CASO MUDOU DUAS VEZES EM 19/10, e vale registrar as duas.**
      // Ele exigia `city == 'São Paulo'` vindo de `Me.reference_area.city`
      // (`city` era `required`). Com a cidade virando opcional, ele passou a
      // exigir que NEM a regiao recortasse -- e com conta, porque a conta ter
      // regiao e nao recortar era o ponto. Depois o cliente pediu a cidade da
      // localizacao, e a regiao virou a SEGUNDA RESERVA da cadeia: com conta,
      // ela recorta de novo, e de proposito.
      //
      // Entao este caso virou o do VISITANTE DESLOGADO, que e quem nao tem
      // nenhuma das duas fontes -- e continua sendo a medida de que a lista
      // ABRE, sem cidade, para quem a vizinhanca precisa que a veja. Quem mede
      // a regiao recortando e `ISCA: sem GPS, a cidade da REGIAO e a segunda
      // reserva`, no grupo 1-C.
      //
      // DESLIGANDO: reponha a porta `if (cidade == null)` em `_carregar()` de
      // `lista_de_perdidos.dart` e este caso reprova pelo nome.
      //
      // O `exigeToken: false` continua medido na mesma chamada: troque-o por
      // `true` em `lib/api/perdidos_api.dart` e o cabecalho aparece.
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
      expect(
        pedidos.single.url.queryParameters.containsKey('city'),
        isFalse,
        reason: 'REPROVA: deslogado e sem GPS nao ha fonte de cidade nenhuma, '
            'e `city` nao pode ir na consulta.',
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
      //
      // **DESLOGADO desde 19/10/2026**: com conta, a cidade da regiao passou a
      // recortar (segunda reserva da cadeia) e o gatilho anunciaria "1 filtro
      // ativo" com razao. O que este caso mede e `period`, e deslogado e o
      // estado em que o recorte nasce de fato vazio.
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

    // **A ISCA `a regiao do perfil NAO recorta, nem para quem tem conta` SAIU
    // DAQUI EM 19/10/2026, e ela foi SUBSTITUIDA e nao apagada.**
    //
    // Ela media que `Me.reference_area.city` nao entrava na consulta de
    // abertura, e isso valeu por algumas horas: entre a cidade virar opcional
    // e o cliente pedir *"que voce pegue a cidade que o usuario esta pela
    // localizacao dele"*. Com a cadeia de reserva da emenda 1 do ADR-0006, a
    // regiao e a SEGUNDA reserva e recortar e o comportamento correto.
    //
    // Quem mede isso agora e `ISCA: sem GPS, a cidade da REGIAO e a segunda
    // reserva`, no grupo 1-C. O que NAO se perdeu: que a regiao nao se impoe
    // sobre a escolha da pessoa -- isso e a isca de APAGAR, logo abaixo, e a
    // de `Ver todas` no grupo 1-C.

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
  // 1-C. A CIDADE VEM DA LOCALIZACAO (cliente, 19/10/2026)
  // -------------------------------------------------------------------------
  //
  // Decisao dele: *"autorizar o gps, e trazer algum valor padrao em caso de
  // fallback"*, depois de pedir duas vezes *"que voce pegue a cidade que o
  // usuario esta pela localizacao dele e monte os pets cadastrados nessa
  // cidade"*. Emenda 1 do ADR-0006.
  //
  // **AS CINCO ISCAS DE RESERVA SAO CINCO CASOS, E NAO UM.** Elas parecem
  // redacoes do mesmo caso e nao sao: cada uma entra por um ponto diferente da
  // porta do aparelho, e desligar o mecanismo de uma deixa as outras quatro
  // verdes. Permissao negada para antes de medir; servico desligado para
  // depois da permissao e antes do ponto; geocoder ausente para depois do
  // ponto e antes da resolucao; teto estourado para DENTRO da resolucao; e sem
  // resultado para depois dela, com a chamada tendo dado certo e devolvido
  // nada. Uma so cobriria o primeiro ramo e aprovaria os outros quatro.
  group('a cidade vem da localizacao, com reserva que nao trava', () {
    /// O caminho principal: permissao concedida, cidade resolvida, lista
    /// recortada por ela -- e a tela DIZ de onde a cidade veio.
    ///
    /// DESLIGANDO: tire o `unawaited(_resolverACidade())` de `_agendarCarga()`
    /// em `lib/telas/perdido/lista_de_perdidos.dart`. Este caso reprova pelo
    /// nome: a segunda chamada nunca sai e `city` nunca aparece.
    testWidgets('ISCA: com permissao, a cidade do aparelho RECORTA a lista',
        (tester) async {
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await abrirPets(
        tester,
        logado: false,
        localizacao: porta,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );

      // DUAS chamadas: a primeira sem cidade (a reserva, que pinta na hora) e
      // a segunda com a cidade resolvida. A ordem e o ponto: a lista NAO
      // espera o GPS para aparecer.
      expect(pedidos, hasLength(2));
      expect(
        pedidos.first.url.queryParameters.containsKey('city'),
        isFalse,
        reason: 'REPROVA: a primeira carga esperou a resolucao. A lista tem de '
            'aparecer antes, com a reserva.',
      );
      expect(pedidos.last.url.queryParameters['city'], 'Sao Paulo');
      // E A TELA DIZ QUAL CIDADE ESTA VALENDO -- **no FILTRO, desde
      // 20/10/2026**.
      //
      // Este caso media a linha da caixa do recorte
      // (`Pets perdidos em Sao Paulo · da sua localização`), e ela nao existe
      // mais no desfecho bom: o cliente pediu *"remova essa box de localização
      // depois de aceito e funcionando, deve apenas aparecer dentro do filtro a
      // cidade selecionada"*. A caixa inteira sai quando ha cidade valendo e a
      // localizacao nao tem mais nada a oferecer (`_caixaDoRecorteAparece`).
      //
      // **O QUE SE PERDEU NA TROCA, escrito aqui porque e decisao e nao
      // descuido:** o rotulo `· da sua localização` era a PROVENIENCIA da
      // cidade, e o filtro mostra o nome sem ela. A cidade continua visivel e
      // continua trocavel; de onde ela veio deixou de ser dito. Foi decisao do
      // cliente de 20/10/2026, com o texto dele acima.
      await escolherCidadeAbrindoAFolha(tester, (campo) {
        expect(
          campo,
          'Sao Paulo',
          reason: 'REPROVA: a cidade foi derivada em silencio -- nem a caixa a '
              'diz (ela saiu por decisao de desenho) nem o filtro a mostra. '
              'Cidade derivada sem explicacao e pior que cidade nenhuma, e o '
              'filtro e o unico lugar que sobrou para dize-la.',
        );
      });
      expect(
        find.text('Pets perdidos em Sao Paulo · da sua localização'),
        findsNothing,
        reason: 'REPROVA: a caixa do recorte continua na tela depois de a '
            'localizacao ter dado cidade. Ver `_caixaDoRecorteAparece`.',
      );
    });

    /// ISCA (1 de 5): PERMISSAO NEGADA.
    ///
    /// DESLIGANDO: faca `_resolverACidade()` chamar `porta.pedir()` em vez de
    /// `porta.estado()`. O dublê concede, a cidade resolve, e este caso
    /// reprova -- que e o desenho que abre dialogo do sistema como efeito
    /// colateral de abrir a secao.
    testWidgets('ISCA 1/5: permissao NEGADA cai para a reserva, sem erro',
        (tester) async {
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.negada);
      await abrirPets(
        tester,
        logado: false,
        localizacao: porta,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      _reservaSemErro(tester, pedidos);
      expect(
        porta.vezesQuePediu,
        0,
        reason: 'REPROVA: a tela PEDIU a permissao sozinha. O pedido e um ato '
            'da pessoa, pelo botao -- nao efeito colateral de abrir a secao.',
      );
    });

    /// ISCA (2 de 5): GPS DESLIGADO nos ajustes, com a permissao concedida.
    ///
    /// Entra num ponto diferente da isca 1: a permissao PASSA, e a porta falha
    /// depois dela. Tratar isto como recusa mandaria a pessoa para a tela de
    /// permissao que ela ja concedeu.
    testWidgets('ISCA 2/5: GPS DESLIGADO cai para a reserva, sem erro',
        (tester) async {
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        logado: false,
        localizacao: LocalizacaoDeTeste(
          PermissaoDeLocalizacao.concedida,
          servico: false,
        ),
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      _reservaSemErro(tester, pedidos);
    });

    /// ISCA (3 de 5): GEOCODER AUSENTE no aparelho.
    ///
    /// Nao e exotico: `isPresent()` existe no pacote exatamente porque o
    /// geocoder do Android pode nao estar la -- AOSP sem Play Services, e
    /// paises onde o servico nao e oferecido. Entra DEPOIS do ponto.
    testWidgets('ISCA 3/5: geocoder AUSENTE cai para a reserva, sem erro',
        (tester) async {
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        logado: false,
        localizacao: LocalizacaoDeTeste(
          PermissaoDeLocalizacao.concedida,
          resultadoDaCidade: const CidadeNaoResolvida(
            MotivoDeNaoTerCidade.geocoderAusente,
          ),
        ),
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      _reservaSemErro(tester, pedidos);
    });

    /// ISCA (4 de 5): FALHA DO SERVICO DE PLATAFORMA.
    ///
    /// **Chamava-se `tetoDeUsoEstourado` ate 20/10/2026, e o nome mentia no
    /// iOS.** No Android e quase sempre o `PlatformException(IO_ERROR, ...)`
    /// que o README do pacote descreve como *"most of the times ... the rate
    /// limit has been reached"*. No iOS e QUALQUER `NSError` do `CLGeocoder`:
    /// o `CLGeocoderProxyApiDelegate.swift` do `geocoding_darwin` colapsa rede,
    /// cancelamento e "nao achei" num codigo unico. Entra DENTRO da resolucao,
    /// com geocoder presente e ponto na mao -- nenhuma das tres iscas acima
    /// passa por este ramo.
    testWidgets('ISCA 4/5: FALHA do servico cai para a reserva, sem erro',
        (tester) async {
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        logado: false,
        localizacao: LocalizacaoDeTeste(
          PermissaoDeLocalizacao.concedida,
          resultadoDaCidade: const CidadeNaoResolvida(
            MotivoDeNaoTerCidade.falhaDoServico,
          ),
        ),
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      _reservaSemErro(tester, pedidos);
    });

    /// ISCA (5 de 5): RESOLUCAO SEM RESULTADO.
    ///
    /// A chamada DEU CERTO e devolveu lugar sem nenhum campo de cidade (ver
    /// `cidadeDoLugar`): zona rural, distrito, mar aberto. E o unico dos cinco
    /// em que nada falhou -- e e por isso que ele nao e coberto por nenhum dos
    /// outros quatro.
    ///
    /// **Continuam sendo CINCO e nao nove**, e isso e decisao: dos nove
    /// motivos, `resolucaoSemResposta` nasce do `.timeout` da PROPRIA TELA e
    /// chega neste mesmo ramo (`if (!porToque) return;`) sem desviar em nada --
    /// um sexto caso aqui mediria o mesmo `return` com outro nome. Quem o mede
    /// de verdade e a isca do teto em
    /// `test/telas/o_botao_de_localizacao_nos_pets_test.dart`, onde o relogio
    /// anda. Os outros tres de permissao tem iscas 1 e 2 acima.
    testWidgets('ISCA 5/5: resolucao SEM RESULTADO cai para a reserva, sem erro',
        (tester) async {
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        logado: false,
        localizacao: LocalizacaoDeTeste(
          PermissaoDeLocalizacao.concedida,
          resultadoDaCidade: const CidadeNaoResolvida(
            MotivoDeNaoTerCidade.semResultado,
          ),
        ),
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      _reservaSemErro(tester, pedidos);
    });

    /// A RESERVA 2 da cadeia: sem GPS, a cidade da REGIAO recorta.
    ///
    /// Medido em homologacao: 3 de 47 contas tem `reference_city`. Ela cobre
    /// pouco, e cobre -- e e rotulo, nao geocodificacao.
    ///
    /// DESLIGANDO: tire `_cidadeDaRegiao` de `_cidadeEmUso` e este caso
    /// reprova pelo nome.
    testWidgets('ISCA: sem GPS, a cidade da REGIAO e a segunda reserva',
        (tester) async {
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        // Com conta, e a regiao e Sao Paulo (`regiaoDeSaoPaulo`).
        localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.negada),
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      expect(pedidos, isNotEmpty);
      expect(pedidos.first.url.queryParameters['city'], 'São Paulo');
      expect(
        find.textContaining('da sua região cadastrada'),
        findsOneWidget,
        reason: 'REPROVA: a tela nao disse que a cidade veio da regiao do '
            'perfil, e quem esta viajando nao entenderia o recorte.',
      );
      expect(tester.takeException(), isNull);
    });

    /// `Ver todas` TIRA a cidade derivada, e a escolha dela manda.
    ///
    /// DESLIGANDO: tire o `_pessoaMexeu = true` de `_verTodas()`. A cidade do
    /// aparelho volta a valer no quadro seguinte e este caso reprova.
    testWidgets('ISCA: `Ver todas` tira a cidade DERIVADA e ela nao volta',
        (tester) async {
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        logado: false,
        localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida),
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      expect(pedidos.last.url.queryParameters['city'], 'Sao Paulo');

      // **`Ver todas` MORA DENTRO DA CAIXA, e a caixa saiu no desfecho bom**
      // (cliente, 20/10/2026). O caminho que a pessoa tem agora e esvaziar a
      // cidade no filtro, e e ele que este caso exerce -- a decisao medida
      // continua a mesma: tirar a cidade derivada liga `_pessoaMexeu`, e ela
      // NAO volta sozinha.
      await escolherCidade(tester, '');

      expect(
        pedidos.last.url.queryParameters.containsKey('city'),
        isFalse,
        reason: 'REPROVA: esvaziar a cidade no filtro nao tirou a cidade do '
            'recorte.',
      );
      expect(find.text('Pets perdidos de todo o Brasil'), findsOneWidget);
    });

    /// A TERCEIRA RESERVA: a ultima cidade guardada neste aparelho.
    ///
    /// **Este caso existe porque `CidadeEscolhida` estava sem LEITOR.** A tela
    /// escrevia nela e ninguem lia -- deposito so de escrita, que e divida com
    /// aparencia de funcao. Ela voltou a ter dono como terceira reserva, e com
    /// rotulo PROPRIO: `da sua ultima busca`, e nunca `da sua localizacao`,
    /// porque uma cidade guardada semana passada pode ser de outra cidade
    /// inteira.
    ///
    /// DESLIGANDO: tire o `unawaited(_lerODeposito())` de `_agendarCarga()`,
    /// ou `_cidadeDaUltimaBusca` de `_cidadeEmUso`, em
    /// `lib/telas/perdido/lista_de_perdidos.dart`. Este caso reprova pelo
    /// nome.
    testWidgets('ISCA: a ultima cidade GUARDADA e a terceira reserva',
        (tester) async {
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        // Deslogado (sem regiao) e sem GPS: a guardada e a unica fonte.
        logado: false,
        localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.negada),
        depositoDaCidade: DepositoDaCidadeEmMemoria(conteudo: 'Campinas'),
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );
      expect(pedidos.last.url.queryParameters['city'], 'Campinas');
      expect(
        find.textContaining('da sua última busca'),
        findsOneWidget,
        reason: 'REPROVA: a tela nao disse que a cidade veio da ultima busca. '
            'Rotula-la como localizacao atual seria a cidade errada derivada '
            'em silencio.',
      );
      expect(tester.takeException(), isNull);
    });

    /// CONTRAPESO: a REGIAO ganha da guardada.
    ///
    /// Sem este caso, inverter a ordem dos dois elos passaria pela isca acima.
    /// Quem tem conta com regiao abre na regiao, e nao na cidade da ultima
    /// busca -- e a regiao e escolha declarada, a guardada e residuo.
    testWidgets('CONTRAPESO: a REGIAO do perfil ganha da cidade guardada',
        (tester) async {
      final pedidos = <http.Request>[];
      await abrirPets(
        tester,
        localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.negada),
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
          reason: 'REPROVA: a cidade guardada passou por cima da regiao '
              'cadastrada.',
        );
      }
    });

    /// ISCA: o armazenamento FALHANDO nao derruba a tela.
    ///
    /// `DepositoDaCidadeQueFalha` estoura nas duas pontas: e o aparelho com
    /// armazenamento bloqueado, o perfil restrito e o build sem o plugin
    /// registrado. A lista tem de aparecer igual -- e a falha acontece dentro
    /// de um `addPostFrameCallback`, onde excecao nao tem quem a pegue.
    ///
    /// DESLIGANDO: apague o `try`/`on Object` de `CidadeEscolhida.ler` em
    /// `lib/sessao/cidade_escolhida.dart`.
    testWidgets('ISCA: o armazenamento FALHANDO nao derruba a tela',
        (tester) async {
      await abrirPets(
        tester,
        logado: false,
        localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.negada),
        depositoDaCidade: const DepositoDaCidadeQueFalha(),
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
        ),
      );
      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: a leitura do aparelho derrubou a secao em que o '
            'aplicativo ABRE.',
      );
      expect(perdidosNaTela(tester), hasLength(1));
      expect(find.text('Pets perdidos de todo o Brasil'), findsOneWidget);
    });

    /// O ESPACO QUE `texto_para_busca` NAO ABSORVE, pelo caminho DIGITADO.
    ///
    /// `CidadeResolvida` normaliza o nome que vem da plataforma
    /// (`test/dispositivo/cidade_da_localizacao_test.dart`), e `cidadeLimpa`
    /// normaliza o que vem do DEDO -- os dois caminhos chegam no mesmo
    /// parametro `city`, e o banco nao perdoa nenhum dos dois.
    ///
    /// MEDIDO em 19/10/2026 contra `texto_para_busca`: `'São  Paulo'`
    /// normaliza para `'sao  paulo'` e **nao casa** com `'sao paulo'`. Sem o
    /// colapso, quem digita com dois espacos recebe lista VAZIA -- que nao
    /// acusa nada e parece defeito do servidor.
    ///
    /// DESLIGANDO: tire o `.replaceAll(RegExp(r'\s+'), ' ')` de `cidadeLimpa`
    /// em `lib/api/modelos_perdido.dart`. Este caso reprova pelo nome.
    testWidgets('ISCA: cidade digitada com espaco DUPLO vai limpa na consulta',
        (tester) async {
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
      await escolherCidade(tester, 'Sao  Paulo');
      expect(
        pedidos.last.url.queryParameters['city'],
        'Sao Paulo',
        reason: 'REPROVA: o espaco duplo chegou ao servidor. '
            '`texto_para_busca` absorve acento e caixa, e NAO absorve espaco: '
            'a consulta responderia vazio.',
      );
    });

    /// UMA resolucao por abertura, e nao uma por carga.
    ///
    /// A pergunta e de custo real: o servico de plataforma tem teto de uso, e
    /// a lista recarrega quando a cidade chega. Se a recarga disparasse outra
    /// resolucao, cada abertura gastaria duas -- e um recorte trocado na folha
    /// gastaria mais.
    testWidgets('ISCA: a resolucao acontece UMA vez por abertura da tela',
        (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await abrirPets(
        tester,
        logado: false,
        localizacao: porta,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
        ),
      );
      // **VOLTOU A UMA EM 22/10/2026, e a frente anterior previu isto por
      // escrito.** O comentario que estava aqui dizia: *"O numero volta a 1
      // quando esta tela adotar a peca compartilhada [...] ai a resolucao passa
      // a ser uma por abertura do APP, e nao uma por secao. Isso toca
      // `lista_de_perdidos.dart` e ficou FORA desta frente"*. Foi o que
      // aconteceu.
      //
      // Decisao do cliente, 22/10/2026: *"quando o usuario autorizar a
      // localizacao, em qualquer uma das paginas, voce deve utilizar ela para
      // todas as secoes"*; e, sobre onde, *"ele deve manter a localizacao na
      // sessao"*. A espera pelo aparelho mora agora em
      // `sessao/localizacao_da_sessao.dart`, uma por app: a aba `Eventos` do
      // arranque resolve, e esta tela **recebe a cidade ja resolvida sem tocar
      // no aparelho**.
      //
      // **ENTAO UM NAO E ECONOMIA DE GEOCODER -- e economia de MEDICAO DE
      // PONTO.** A nota anterior ja tinha conferido que a segunda chamada nao
      // ia ao servico de plataforma (`LocalizacaoPorGeolocator.
      // _cidadeGuardadaPara` devolve a cidade guardada dentro da celula de
      // ~100 m); o que era pago duas vezes era o fix de GPS, e era ele que
      // falhava na segunda secao e fazia a caixa `Usar minha localizacao`
      // voltar a aparecer para quem ja havia autorizado.
      //
      // **NAO "CONSERTE" ESTE NUMERO DE VOLTA PARA 2.** Duas resolucoes numa
      // abertura significa que o estado da sessao deixou de ser compartilhado,
      // e e o defeito que o cliente relatou. Quem cobra isso pelo nome e
      // `test/rede/localizacao_vale_para_todas_as_secoes_test.dart`.
      expect(
        porta.vezesQueResolveu,
        1,
        reason: 'REPROVA: a porta resolveu ${porta.vezesQueResolveu} vezes numa '
            'abertura, e o esperado e UMA -- a localizacao da sessao e '
            'compartilhada por todas as secoes desde 22/10/2026 (ver a nota '
            'acima). O que este caso continua cobrando '
            'e que a RECARGA que a cidade dispara nao dispare outra resolucao: '
            'tres ou mais significa que ela voltou a disparar.',
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

  // -------------------------------------------------------------------------
  group('`Usar minha localizacao` e um ATO DA PESSOA, e ele tem efeito', () {
    // **O DEFEITO QUE ESTE GRUPO FECHA, relatado pelo cliente em 20/10/2026:**
    // *"o botao de usar minha localizacao na secao do pets nao esta
    // funcionando"*.
    //
    // E nao estava: a guarda `_pessoaMexeu` de `_resolverEAplicar` valia para
    // os DOIS caminhos -- o automatico e o do toque --, e por isso o botao nao
    // fazia nada no UNICO estado em que ele e oferecido. A conta:
    // `_podeOferecerLocalizacao` so o oferece quando nao ha cidade do aparelho
    // **ou** `_pessoaMexeu`; quem ja tem cidade do aparelho e toca em
    // `Ver todas` cai no segundo caso, e ai a resolucao chegava, via
    // `_pessoaMexeu` ligado e voltava na primeira linha. Sem erro, sem faixa,
    // sem nada na tela.
    //
    // DESLIGAMENTO: em `_resolverEAplicar`, troque o ramo `if (porToque)` por
    // um `return` ou devolva a guarda `if (_pessoaMexeu) return;` para antes
    // dele. Este caso reprova com `city` nulo na ultima consulta.
    //
    // **O caso mede a CONSULTA e nao a tela**, de proposito: a linha do
    // recorte podia trocar de texto e a lista continuar com o recorte antigo,
    // que e o defeito visto pelo cliente. Quem diz o que a lista esta
    // mostrando e o `city` que saiu na requisicao.
    testWidgets('depois de `Ver todas`, o toque VOLTA a cidade do aparelho ao '
        'recorte', (tester) async {
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultadoDaCidade: CidadeResolvida('São Paulo'),
      );
      await abrirPets(
        tester,
        logado: false,
        localizacao: porta,
        rede: redeDosPerdidos(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
          ]),
          pedidos: pedidos,
        ),
      );

      // A abertura resolveu e a cidade do aparelho entrou no recorte.
      expect(
        pedidos.last.url.queryParameters['city'],
        'São Paulo',
        reason: 'PRE-CONDICAO: a abertura nao aplicou a cidade do aparelho.',
      );

      // ESVAZIAR A CIDADE NO FILTRO tira a cidade -- e e isto que liga
      // `_pessoaMexeu`. Era `Ver todas`, que mora DENTRO da caixa do recorte;
      // a caixa sai no desfecho bom desde 20/10/2026 (cliente), e com ela sai
      // esse botao. O estado que este caso precisa produzir e o mesmo.
      await escolherCidade(tester, '');
      expect(
        pedidos.last.url.queryParameters['city'],
        isNull,
        reason: 'PRE-CONDICAO: esvaziar a cidade no filtro nao tirou a cidade '
            'do recorte.',
      );

      // O botao tem de estar oferecido agora.
      expect(
        find.text(ListaDePerdidos.rotuloDeUsarLocalizacao),
        findsOneWidget,
        reason: 'PRE-CONDICAO: `Usar minha localizacao` nao esta na tela.',
      );

      await tester.tap(find.text(ListaDePerdidos.rotuloDeUsarLocalizacao));
      await tester.pumpAndSettle();

      expect(
        pedidos.last.url.queryParameters['city'],
        'São Paulo',
        reason: 'REPROVA: tocar em `Usar minha localizacao` nao trouxe a '
            'cidade do aparelho de volta ao recorte. A ultima consulta foi '
            '${pedidos.last.url.query}',
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

/// O desfecho que as CINCO iscas de reserva compartilham: **a lista aparece
/// igual, sem cidade no pedido, e sem erro na tela.**
///
/// Extraido porque as cinco medem o MESMO desfecho por CAMINHOS diferentes.
/// Repetir as tres assercoes cinco vezes convidaria a divergirem; o que nao se
/// extrai e o CAMINHO, que e o que faz de cada uma delas um caso proprio.
void _reservaSemErro(WidgetTester tester, List<http.Request> pedidos) {
  expect(
    pedidos, hasLength(1),
    reason: 'REPROVA: houve ${pedidos.length} chamada(s). Sem cidade resolvida '
        'ha UMA: a da reserva. Uma segunda quer dizer que a tela recarregou '
        'por causa de uma resolucao que nao deu em nada.',
  );
  expect(
    pedidos.single.url.queryParameters.containsKey('city'),
    isFalse,
    reason: 'REPROVA: `city` entrou na consulta sem a cidade ter sido '
        'resolvida.',
  );
  expect(perdidosNaTela(tester), hasLength(1));
  expect(find.text('Pets perdidos de todo o Brasil'), findsOneWidget);
  expect(
    tester.takeException(),
    isNull,
    reason: 'REPROVA: a reserva virou erro na tela. Nenhum dos oito motivos e '
        'excecao: os oito caem para a lista nacional.',
  );
}
