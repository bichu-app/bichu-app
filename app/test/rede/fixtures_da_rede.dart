// As respostas da `Rede` como o CONTRATO as declara (`api/openapi.yaml`), e a
// rede de teste que as serve.
//
// NAO e arquivo de teste: nao termina em `_test.dart`, para a descoberta do
// `flutter test` nao roda-lo sozinho.
//
// Cada funcao monta um schema do contrato com os campos obrigatorios dele, com
// os NOMES dele. Quando o contrato muda um nome, o portao de conformidade
// (`make verificar-conformidade-do-app`) reprova os modelos; estas fixtures
// sao a outra metade, e o caso que as le quebra junto.


import 'package:bichu/telas/rede/cartao_do_encontro.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';

const String slugPublico = 'passeio-benedito-calixto';
const String slugPrivado = 'k7q2m9x4';

/// `NetworkEventPublic`.
Map<String, dynamic> encontroPublico({
  String slug = slugPublico,
  String title = 'Passeio matinal na Benedito Calixto',
  String summary = 'Volta tranquila pela praça, com parada na sombra.',
  String placeName = 'Praça Benedito Calixto',
  String neighborhood = 'Pinheiros',
  String city = 'São Paulo',
  String state = 'SP',
  String startsAt = '2026-10-03T12:00:00Z',
  String? endsAt = '2026-10-03T14:00:00Z',
  String timeZone = 'America/Sao_Paulo',
  String status = 'upcoming',
  List<Map<String, dynamic>> images = const <Map<String, dynamic>>[],
  String admissionKind = 'free',
  Map<String, dynamic>? price,
  List<String> acceptedSizes = const <String>['P', 'M', 'G', 'GG'],
  String dogAge = 'any',
  bool vaccinationRequired = true,
  bool fencedOffLeashArea = false,
  List<String> amenities = const <String>[],
  List<String> bringItems = const <String>[],
  String? notes,
}) {
  return <String, dynamic>{
    'slug': slug,
    'title': title,
    'summary': summary,
    'place': <String, dynamic>{
      'place_name': placeName,
      'neighborhood': neighborhood,
      'city': city,
      'state': state,
    },
    'starts_at': startsAt,
    'ends_at': endsAt,
    'time_zone': timeZone,
    'status': status,
    'visibility': 'public',
    'cover_image_url': images.isEmpty ? null : images.first['url'],
    'images': images,
    'admission': <String, dynamic>{'kind': admissionKind, 'price': price},
    'accepted_sizes': acceptedSizes,
    'dog_age': dogAge,
    'vaccination_required': vaccinationRequired,
    'fenced_off_leash_area': fencedOffLeashArea,
    'amenities': amenities,
    'bring_items': bringItems,
    'notes': notes,
  };
}

/// `NetworkEventPrivateTeaser`: cinco campos, e so cinco.
Map<String, dynamic> teaserPrivado({
  String slug = slugPrivado,
  String title = 'Clube dos border collies',
  String localDate = '2026-10-04',
  String status = 'upcoming',
}) {
  return <String, dynamic>{
    'slug': slug,
    'title': title,
    'local_date': localDate,
    'visibility': 'private',
    'status': status,
  };
}

/// `NetworkEventPrivateDetails`: o conteudo do privado, com sentinelas
/// (`ISCA-...`) em todo campo oculto, como a massa do P19 (ADR-0027 12.12).
Map<String, dynamic> detalhesDoPrivado({String status = 'upcoming'}) {
  final base = encontroPublico(
    slug: slugPrivado,
    title: 'Clube dos border collies',
    summary: 'ISCA-RESUMO treino leve de agilidade.',
    placeName: 'ISCA-LUGAR Parque Villa-Lobos',
    neighborhood: 'ISCA-BAIRRO',
    startsAt: '2026-10-04T11:00:00Z',
    endsAt: '2026-10-04T13:00:00Z',
    status: status,
    admissionKind: 'paid',
    price: <String, dynamic>{
      'amount': 3000,
      'currency': 'BRL',
      'unit': 'per_dog',
    },
    acceptedSizes: const <String>['M', 'G'],
    notes: 'ISCA-NOTA traga a carteira de vacinação.',
    images: <Map<String, dynamic>>[
      imagem('https://midia.bichu.app/rede/isca-capa.jpg', 'ISCA-ALT capa'),
    ],
  )..remove('visibility');
  return base;
}

Map<String, dynamic> imagem(String url, String alt) =>
    <String, dynamic>{'url': url, 'alt_text': alt};

/// `NetworkEventNearby`: o publico com `distance_m`.
Map<String, dynamic> porPerto(Map<String, dynamic> publico, int? metros) =>
    <String, dynamic>{...publico, 'distance_m': metros};

/// `NetworkEventPage`.
Map<String, dynamic> pagina(
  List<Map<String, dynamic>> itens, {
  String ordemEfetiva = 'proximos',
  String quandoEfetivo = 'upcoming',
  int? total,
}) {
  return <String, dynamic>{
    'items': itens,
    'page': 1,
    'limit': 20,
    'total': total ?? itens.length,
    'effective_sort': ordemEfetiva,
    'effective_when': quandoEfetivo,
    'applied_filters': <String, String>{'scope': 'all'},
  };
}

/// `NetworkEventNearbyPage`.
Map<String, dynamic> paginaPorPerto(
  List<Map<String, dynamic>> itens, {
  String ordemEfetiva = 'proximos',
}) {
  return <String, dynamic>{
    'items': itens,
    'page': 1,
    'limit': 20,
    'total': itens.length,
    'effective_sort': ordemEfetiva,
    'effective_when': 'upcoming',
    'applied_filters': <String, String>{'scope': 'all'},
  };
}

/// `MyNetworkEventJoinRequestPage`.
Map<String, dynamic> paginaDePedidos(List<Map<String, dynamic>> itens) {
  return <String, dynamic>{
    'items': itens,
    'page': 1,
    'limit': 20,
    'total': itens.length,
    'effective_sort': 'proximos',
    'applied_filters': <String, String>{'scope': 'all'},
  };
}

/// `NetworkEventJoinRequest`.
Map<String, dynamic> pedido(String estado) => <String, dynamic>{
      'state': estado,
      'requested_at': '2026-09-28T12:00:00Z',
    };

/// `NetworkEventLocation`.
Map<String, dynamic> localizacao({double? lat = -23.5617, double? lon = -46.6823}) =>
    <String, dynamic>{
      'point': lat == null ? null : <String, dynamic>{'lat': lat, 'lon': lon},
    };

/// Uma rede de teste da `Rede`, que registra toda chamada e responde por
/// tabela. Rota que a tabela nao tem responde o 404 do contrato.
class RedeDeTeste {
  RedeDeTeste(this.respostas);

  /// `'GET /v1/network/events'` -> resposta. A chave e metodo e caminho, sem
  /// query: a query fica registrada em [chamadas] para o caso conferir.
  final Map<String, http.Response Function(http.Request)> respostas;

  final List<http.Request> chamadas = <http.Request>[];

  List<http.Request> chamadasA(String metodoECaminho) => chamadas
      .where((r) => '${r.method} ${r.url.path}' == metodoECaminho)
      .toList();

  Future<http.Response> call(http.Request req) async {
    final chave = '${req.method} ${req.url.path}';
    final resposta = respostas[chave];
    if (chave.contains('/network/')) chamadas.add(req);
    if (resposta == null) return problema('not-found', 404);
    return resposta(req);
  }
}

http.Response Function(http.Request) sempre(Map<String, dynamic> corpo) =>
    (_) => json200(corpo);

http.Response Function(http.Request) naoEncontrado() =>
    (_) => problema('not-found', 404);

/// Abre o app e vai para a secao `Rede`.
Future<void> abrirRede(
  WidgetTester tester, {
  required RedeDeTeste rede,
  bool logado = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede.call,
    deposito: logado ? depositoLogado() : null,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
  await tester.pumpAndSettle();
}

/// Abre o primeiro cartao cujo titulo e [titulo].
Future<void> abrirCartao(WidgetTester tester, String titulo) async {
  // O cartao e mais alto que a tela de teste: toca-se no TITULO dele, que
  // esta dentro do mesmo `InkWell`.
  final alvo = find.descendant(
    of: find.byWidgetPredicate(
      (w) => w is CartaoDoEncontro && w.encontro.titulo == titulo,
    ),
    matching: find.text(titulo),
  );
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
  await tester.tap(alvo);
  await tester.pumpAndSettle();
}

/// Todo o texto visivel da tela, numa string so, para as iscas procurarem o
/// que NAO pode estar la.
String textoDaTela(WidgetTester tester) {
  final partes = <String>[];
  for (final e in find.byType(Text).evaluate()) {
    final t = e.widget as Text;
    partes.add(t.data ?? t.textSpan?.toPlainText() ?? '');
  }
  for (final e in find.byType(RichText).evaluate()) {
    partes.add((e.widget as RichText).text.toPlainText());
  }
  return partes.join('\n');
}

/// Os rotulos semanticos da tela da frente, para as iscas do leitor de tela.
///
/// **Exige `tester.ensureSemantics()` antes de montar o app**, e reprova se
/// a arvore vier vazia: uma isca que le uma arvore desligada aprovaria
/// qualquer coisa.
String rotulosSemanticos(WidgetTester tester) {
  final partes = <String>[];
  void visitar(SemanticsNode n) {
    partes
      ..add(n.label)
      ..add(n.hint)
      ..add(n.value);
    n.visitChildren((filho) {
      visitar(filho);
      return true;
    });
  }

  visitar(tester.getSemantics(find.byType(Scaffold).last));
  final texto = partes.where((p) => p.isNotEmpty).join('\n');
  expect(texto, isNotEmpty, reason: 'a arvore semantica veio vazia');
  return texto;
}

