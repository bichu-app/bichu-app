// O AVISO DE QUE FALTA ENTRAR, **NO MOMENTO DO TOQUE**.
//
// Pedido do cliente de 20/10/2026, literal: *"adicione uma informacao, quando
// o usuario estiver deslogado e tentar clicar para ver detalhes de algum
// conteudo, como por exemplo os eventos, que ele precisa estar logado para ver
// mais informacoes"*.
//
// E a correcao do pedido de 19/10, no mesmo dia: *"eu nao pedi pra voce
// remover, eu pedi para remover o clique para o usuario nnao conseguir acessar
// a pagina de detalhes e pedi pra voce resumir a listagem com foto, titulo do
// evento"*.
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO MEDE, E O QUE ELE DELIBERADAMENTE NAO MEDE
// ---------------------------------------------------------------------------
// MEDE o toque: o que acontece no dedo de quem nao tem conta, nas quatro
// superficies em que isso mudou (o cartao de evento, a pagina de um pet, a de
// um achado e a de uma pessoa), e o que acontece depois de a pessoa entrar.
//
// NAO mede o que a pagina do encontro mostra depois de aberta: isso e de
// `test/rede/encontro_da_rede_test.dart`, com 14 casos. E nao mede o estado de
// deslogado das SECOES: isso e de `test/telas/estado_de_deslogado_test.dart`,
// da entrega de 19/10.
//
// ---------------------------------------------------------------------------
// COMO ESTE ARQUIVO EVITA SER UM PORTAO CEGO
// ---------------------------------------------------------------------------
// Onze portoes cegos foram achados nesta rodada, e quatro das formas deles
// atacariam este arquivo em particular:
//
// 1. **Medir o estado logado achando que mede o deslogado.** Cada caso chama
//    `abrirOApp` UMA vez e declara a sessao com `exigirEstadoDeSessao` ANTES de
//    olhar a tela. `pumpWidget` do mesmo tipo REAPROVEITA o `State`, entao um
//    segundo `abrirOApp` no mesmo caso mediria a tela do primeiro.
// 2. **`findsNothing` sobre o que a tela nao diz mais.** Todo `findsNothing`
//    daqui tem CONTRAPESO no mesmo grupo: um caso em que a MESMA busca acha.
// 3. **Passar por 404.** O caso que mede "a pagina abriu" afirma o CONTEUDO
//    (o nome do pet, o titulo do evento), e nao so a rota: uma rota ausente
//    faria tudo responder 404 e a tela ficaria vazia, verde por nada.
// 4. **Afirmar a volta sem provar o mecanismo.** A isca (e) tem contrapeso: o
//    MESMO login, a partir de um convite SEM endereco de volta, cai em
//    `/pets`. Sem ele, o caso da volta passaria no dia em que o login
//    passasse a nunca sair do lugar.

import 'dart:convert';

import 'package:bichu/api/modelos.dart';
import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/intencao/intencao_pendente.dart';
import 'package:bichu/intencao/leitura_como_intencao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/sessao/controlador_de_sessao.dart';
import 'package:bichu/telas/rede/cartao_do_encontro.dart';
import 'package:bichu/telas/rede/encontro_da_rede.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/convite_para_entrar.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';
// `exigirEstadoDeSessao` mora no arquivo da entrega de 19/10, e e importada e
// nao copiada de proposito: ela e a guarda que declara E confere o estado de
// sessao, e duas copias dela divergiriam.
import 'estado_de_deslogado_test.dart' show exigirEstadoDeSessao;

const String _petId = '3f1d7a9e-0000-7000-8000-000000000001';
const String _achadoId = '9a2b4c6d-0000-7000-8000-000000000009';
const String _apelido = 'marina-vet';
const String _slugDoEvento = 'passeio-no-parque';
const String _tituloDoEvento = 'Passeio no parque';
const String _tokenDoCaso = 'Tok3nPubl1co';
const String _slugDoProduto = 'racao-premium';

/// O 401 que o servidor manda de verdade, **com `next_action`**.
///
/// Medido na homologacao em 20/10/2026, sem token, nas tres rotas de detalhe
/// desta frente: `GET /v1/pets/{id}`, `GET /v1/found-reports/{id}` e
/// `GET /v1/people/{handle}` respondem
/// `{"type":".../problems/unauthenticated","status":401,...,`
/// `"next_action":"sign_in"}`.
http.Response _semConta() => problema(
      'unauthenticated',
      401,
      extra: const <String, dynamic>{'next_action': 'sign_in'},
    );

/// Um 500 **sem `next_action`**: servidor fora de verdade.
///
/// E o contrapeso de todo `findsNothing` deste arquivo.
http.Response _servidorFora() => http.Response(
      jsonEncode(const <String, dynamic>{
        'type': 'https://api.bichu.app/problems/internal',
        'title': 'Nao foi possivel concluir',
        'status': 500,
      }),
      500,
      headers: const <String, String>{
        'content-type': 'application/problem+json; charset=utf-8',
      },
    );

Map<String, dynamic> _achado() => const <String, dynamic>{
      'id': _achadoId,
      'origin': 'stray_report',
      'status': 'open',
      'created_at': '2026-10-18T04:23:12Z',
      'found_at': '2026-10-18T04:23:12Z',
      'area_label': 'Vila Gertrudes, São Paulo',
    };

Map<String, dynamic> _pessoa() => const <String, dynamic>{
      'handle': _apelido,
      'public_ref': 'AbCdEfGhIjKlMnOpQrStUv',
      'display_name': 'Marina',
      'pets_count': 3,
      'connections_count': 12,
      'connection_state': 'none',
      'showcase_visible': false,
      'showcase': <dynamic>[],
    };

Map<String, dynamic> _evento({String status = 'upcoming'}) =>
    <String, dynamic>{
      'slug': _slugDoEvento,
      'title': _tituloDoEvento,
      'summary': 'Caminhada tranquila, aberta a quem quiser chegar.',
      'visibility': 'public',
      'status': status,
      'starts_at': '2026-10-25T13:00:00.000Z',
      'ends_at': '2026-10-25T16:00:00.000Z',
      'time_zone': 'America/Sao_Paulo',
      'place': const <String, dynamic>{
        'place_name': 'Parque Villa-Lobos',
        'neighborhood': 'Alto de Pinheiros',
        'city': 'São Paulo',
        'state': 'SP',
      },
      'admission': const <String, dynamic>{'kind': 'free'},
      'cover_image_url': null,
      'cover_banner_url': null,
      'images': const <dynamic>[],
      'accepted_sizes': const <dynamic>[],
      'amenities': const <dynamic>[],
      'bring_items': const <dynamic>[],
      'dog_age': null,
      'fenced_off_leash_area': null,
      'vaccination_required': null,
      'instagram_handle': null,
      'instagram_url': null,
      'notes': null,
      'ticket_url': null,
    };

Map<String, dynamic> _paginaDeEventos({String status = 'upcoming'}) =>
    <String, dynamic>{
      'items': <Map<String, dynamic>>[_evento(status: status)],
      'page': 1,
      'limit': 20,
      'total': 1,
      'effective_sort': 'proximos',
      'effective_when': 'proximos',
      'applied_filters': const <String, dynamic>{},
    };

Map<String, dynamic> _perdidoDaLista() => const <String, dynamic>{
      'share_token': _tokenDoCaso,
      'pet_display_name': 'Toddy',
      'species': 'dog',
      'breed_label': 'Spitz Alemão',
      'size': 'P',
      'primary_color': 'Preto',
      'lost_since': '2026-10-17T03:00:00.000Z',
      'area_label': 'Vila Gertrudes, São Paulo',
      'photo_url': null,
      'share_url': 'https://bichu.app/p/$_tokenDoCaso',
    };

Map<String, dynamic> _casoPublico() => const <String, dynamic>{
      'share_token': _tokenDoCaso,
      'pet_display_name': 'Toddy',
      'species': 'dog',
      'breed_label': 'Spitz Alemão',
      'size': 'P',
      'primary_color': 'Preto',
      'lost_since': '2026-10-17T03:00:00.000Z',
      'last_seen_at': '2026-10-17T03:00:00.000Z',
      'area_label': 'Vila Gertrudes, São Paulo',
      'photo_url': null,
      'description': null,
      'care_notes': null,
      'can_report_sighting': true,
    };

Map<String, dynamic> _produto() => const <String, dynamic>{
      'slug': _slugDoProduto,
      'title': 'Ração premium',
      'summary': 'Para cães adultos.',
      'category': 'food',
      'category_label': 'Alimentação',
      'image_url': null,
      'images': <dynamic>[],
      'target_url': 'https://parceiro.exemplo/racao-premium',
      'partner': <String, dynamic>{
        'slug': 'parceiro',
        'name': 'Parceiro',
        'host': 'parceiro.exemplo',
      },
      'tags': <dynamic>[],
      'price_line': null,
      'price_state': 'unavailable',
      'price_checked_at': null,
    };

/// A rede do app, com as rotas que CADA caso declara.
///
/// **404 no resto, e nunca 200 vazio**: um caso que dependa de uma chamada nao
/// declarada aqui precisa falhar alto, e nao passar por uma lista vazia que
/// parece um estado legitimo.
Future<http.Response> Function(http.Request) _rede(
  Map<String, http.Response Function(http.Request)> rotas, {
  /// O que as rotas de LEITURA desta frente respondem. Nulo deixa cada uma
  /// com o que [rotas] disser.
  http.Response Function(http.Request)? detalhe,
  List<http.Request>? vistas,
}) {
  return (req) async {
    vistas?.add(req);
    final chave = '${req.method} ${req.url.path}';
    if (rotas.containsKey(chave)) return rotas[chave]!(req);
    if (detalhe != null &&
        (chave == 'GET /v1/pets/$_petId' ||
            chave == 'GET /v1/found-reports/$_achadoId' ||
            chave == 'GET /v1/people/$_apelido')) {
      return detalhe(req);
    }
    // As rotas que o app pede sozinho ao abrir, e que nenhum caso daqui mede.
    switch (chave) {
      case 'GET /v1/public/reference-data':
        return json200(referenciaDeTeste());
      case 'GET /v1/public/lost-pets':
        return json200(const <String, dynamic>{
          'items': <dynamic>[],
          'page': 1,
          'limit': 20,
          'total': 0,
        });
      case 'GET /v1/network/events':
        return json200(const <String, dynamic>{
          'items': <dynamic>[],
          'page': 1,
          'limit': 20,
          'total': 0,
          'effective_sort': 'proximos',
          'effective_when': 'proximos',
          'applied_filters': <String, dynamic>{},
        });
      case 'POST /v1/me/conversations-seen':
        return http.Response('', 204);
    }
    return problema('not-found', 404);
  };
}

/// Os textos do convite, lidos da ARVORE e nao das constantes.
List<String> _frasesDoConvite(WidgetTester tester) {
  final convite = find.byType(ConviteParaEntrar);
  expect(
    convite,
    findsOneWidget,
    reason: 'REPROVA: nao ha `ConviteParaEntrar` na tela.',
  );
  return tester
      .widgetList<Text>(
        find.descendant(of: convite, matching: find.byType(Text)),
      )
      .map((Text t) => t.data ?? '')
      .where((String s) => s.isNotEmpty)
      .toList(growable: false);
}

/// A saida do app, de mentira: guarda o que foi para o navegador do aparelho.
///
/// Existe por causa da isca (d4). Sem ela o caso da `Loja` nao tinha como
/// provar que o toque no cartao LEVA ao parceiro -- ele so conseguia provar
/// que nenhum convite aparecia, e isso ficava verde com o toque trocado por
/// uma folha (medido: a isca (d4) passou cega na primeira versao).
class _SaidaDeTeste extends SaidaDoApp {
  final List<Uri> links = <Uri>[];

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async =>
      true;

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async =>
      true;

  @override
  Future<bool> abrirLink(Uri link) async {
    links.add(link);
    return true;
  }

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async => true;
}

/// Uma tela de celular (400 dp) bem **alta**: a pagina do encontro inteira
/// fica montada, e o caso le as secoes sem depender da rolagem.
///
/// Sem ela, `find.text('Sobre o evento')` nao acha o que o `ListView` nao
/// construiu -- e o caso reprovaria dizendo que a pagina nao abriu, pelo
/// motivo errado. Mesma razao do `telaAlta` de
/// `test/rede/fixtures_da_rede.dart`.
void _telaAlta(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(400, 4000);
  addTearDown(tester.view.reset);
}

/// O endereco em que o roteador esta AGORA.
String _rotaAgora(WidgetTester tester) =>
    GoRouter.of(tester.element(find.byType(Scaffold).first)).state.uri.toString();

/// Toca no cartao do evento na agenda da `Rede`.
Future<void> _tocarNoCartaoDoEvento(WidgetTester tester) async {
  final alvo = find.descendant(
    of: find.byType(CartaoDoEncontro),
    matching: find.text(_tituloDoEvento),
  );
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
  await tester.tap(alvo);
  await tester.pumpAndSettle();
}

/// A sessao do contrato que `POST /auth/login` devolve.
Map<String, dynamic> _sessaoDoContrato() => const <String, dynamic>{
      'access_token': 'at-1',
      'refresh_token': 'rt-1',
      'expires_in': 900,
      'user': <String, dynamic>{
        'id': 'usr_1',
        'email': 'marina@exemplo.com.br',
        'email_verified': true,
        'pending_profile_fields': <String>[],
        'can_open_lost_case': true,
      },
    };

/// Preenche C.2 e entra.
Future<void> _entrarNaConta(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField).at(0), 'marina@exemplo.com.br');
  await tester.enterText(find.byType(TextField).at(1), 'uma frase curta');
  await tester.tap(find.widgetWithText(FilledButton, 'Entrar').last);
  await tester.pumpAndSettle();
}

void main() {
  // =========================================================================
  group('ISCA (a): deslogado, tocar o conteúdo MOSTRA a informação — e não um '
      'erro nem silêncio', () {
    // MECANISMO, duas metades:
    //   1. o ramo `_tocarNoCartao` de `rede/agenda_da_rede.dart`, que abre a
    //      folha quando `logado` e falso. Desligado (chamando sempre
    //      `TelaDoEncontro.abrir`), o caso (a1) reprova;
    //   2. o ramo `faltaConta(falha)` de `achado/tela_do_achado.dart`,
    //      `pessoa/tela_perfil_de_pessoa.dart` e `pet/tela_detalhe_do_pet.dart`
    //      (a fase `semConta`). Desligados, as tres telas voltam a desenhar
    //      `FaixaDeAviso` de ERRO com texto VAZIO -- o catalogo devolve
    //      `texto: ''` para `unauthenticated` desde 18/10 -- e um `Atualizar`
    //      ou `Tentar de novo` ao lado. Atualizar nao resolve um 401.

    testWidgets('(a1) o toque no cartão de evento abre a folha com o convite, '
        'e NÃO abre a página', (tester) async {
      await abrirOApp(
        tester,
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/network/events': (_) => json200(_paginaDeEventos()),
          'GET /v1/network/events/$_slugDoEvento': (_) => json200(_evento()),
        }),
      );
      await abrirAAba(tester, 'Rede');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      // A ancora positiva: o cartao existe e a agenda esta na tela. Sem ela
      // todo o resto deste caso mediria uma tela em branco.
      expect(find.byType(CartaoDoEncontro), findsOneWidget);
      expect(_rotaAgora(tester), '/rede');

      await _tocarNoCartaoDoEvento(tester);

      // (1) A INFORMACAO APARECEU, e e a do catalogo -- nao houve silencio.
      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(find.text('Entre para ver este evento'), findsOneWidget);
      expect(
        _frasesDoConvite(tester).join(' | '),
        contains('Entre para ver o endereço no mapa'),
      );
      // AS DUAS PORTAS de quem nunca entrou.
      expect(find.widgetWithText(BotaoPrimario, 'Entrar'), findsOneWidget);
      expect(find.text('Criar conta'), findsOneWidget);

      // (2) E NAO E ERRO.
      expect(
        find.byType(FaixaDeAviso),
        findsNothing,
        reason: 'REPROVA: a folha do toque esta desenhando faixa de aviso. '
            'Sem conta nao e erro.',
      );

      // (3) E A PAGINA NAO ABRIU. Medido na ROTA e no CONTEUDO: a rota prova
      // que nao houve navegacao, e a ausencia do `Sobre o evento` prova que
      // nao e so a URL que ficou igual.
      expect(
        _rotaAgora(tester),
        '/rede',
        reason: 'REPROVA: o toque navegou. Deslogado ele tem de informar, '
            'nao levar.',
      );
      expect(find.text('Sobre o evento'), findsNothing);
    });

    testWidgets('(a2) a página de um pet mostra o convite, e nenhuma faixa de '
        'erro', (tester) async {
      await abrirOApp(tester, rede: _rede(
        const <String, http.Response Function(http.Request)>{},
        detalhe: (_) => _semConta(),
      ));
      await irPara(tester, Rotas.detalheDoPetDe(_petId));

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(find.text('Esta página é de um pet'), findsOneWidget);
      expect(
        find.byType(FaixaDeAviso),
        findsNothing,
        reason: 'REPROVA: a pagina do pet esta desenhando a faixa de erro do '
            '401 -- com frase VAZIA, porque o catalogo devolve `` para '
            '`unauthenticated`.',
      );
      expect(
        find.text('Atualizar'),
        findsNothing,
        reason: 'REPROVA: ha um `Atualizar` na tela. Recarregar sai '
            'igualmente sem conta e volta o mesmo 401.',
      );
    });

    testWidgets('(a3) a página de um achado mostra o convite, e nenhuma faixa '
        'de erro', (tester) async {
      await abrirOApp(tester, rede: _rede(
        const <String, http.Response Function(http.Request)>{},
        detalhe: (_) => _semConta(),
      ));
      await irPara(tester, Rotas.achadoDe(_achadoId));

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(find.text('Esta página é de um achado'), findsOneWidget);
      expect(find.byType(FaixaDeAviso), findsNothing);
      expect(find.text('Tentar de novo'), findsNothing);
      // E O TEXTO NAO PROMETE CONTA PARA REGISTRAR: registrar achado nao
      // exige conta (`security: [bearerAuth, {}]`), e prometer o contrario
      // afastaria quem esta com o animal no colo.
      expect(
        _frasesDoConvite(tester).join(' | '),
        contains('Entre para acompanhar'),
      );
    });

    testWidgets('(a4) o perfil de uma pessoa mostra o convite, e nenhuma '
        'faixa de erro', (tester) async {
      await abrirOApp(tester, rede: _rede(
        const <String, http.Response Function(http.Request)>{},
        detalhe: (_) => _semConta(),
      ));
      await irPara(tester, '/pessoa/$_apelido');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(
        find.text('Esta página é de uma pessoa da comunidade'),
        findsOneWidget,
      );
      expect(find.byType(FaixaDeAviso), findsNothing);
      expect(find.text('Tentar de novo'), findsNothing);
      // E O APELIDO NAO APARECE no convite: perfil oculto, bloqueado e
      // inexistente respondem o mesmo 404 de proposito, e repetir o apelido
      // confirmaria a existencia da pessoa a quem ainda nao pode saber.
      expect(
        _frasesDoConvite(tester).join(' | '),
        isNot(contains(_apelido)),
      );
    });

    testWidgets('(a-contrapeso) com 500 as TRÊS páginas voltam a mostrar '
        'faixa de erro com Atualizar', (tester) async {
      // **Sem este caso os tres de cima sao vacuos.** Eles provariam apenas
      // que as palavras `Atualizar` e `Tentar de novo` nao existem mais em
      // lugar nenhum do app, o que ficaria verde se alguem apagasse a faixa de
      // erro do produto inteiro. Aqui a MESMA busca tem de achar.
      await abrirOApp(tester, rede: _rede(
        const <String, http.Response Function(http.Request)>{},
        detalhe: (_) => _servidorFora(),
      ));

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      for (final (rota, rotulo) in <(String, String)>[
        (Rotas.detalheDoPetDe(_petId), 'Atualizar'),
        (Rotas.achadoDe(_achadoId), 'Tentar de novo'),
        ('/pessoa/$_apelido', 'Tentar de novo'),
      ]) {
        await irPara(tester, rota);
        expect(
          find.byType(ConviteParaEntrar),
          findsNothing,
          reason: 'REPROVA: um 500 nao e falta de conta. Trocar a tela de '
              'quem esta logada por um convite para entrar porque o servidor '
              'caiu diria a ela que a conta dela nao existe. Rota: $rota',
        );
        expect(
          find.byType(FaixaDeAviso),
          findsWidgets,
          reason: 'a faixa de erro desapareceu em $rota: os `findsNothing` '
              'dos casos (a2) a (a4) passariam por vazio',
        );
        expect(find.text(rotulo), findsWidgets, reason: 'em $rota');
      }
    });
  });

  // =========================================================================
  group('ISCA (b): logado, o MESMO conteúdo não mostra a informação', () {
    // MECANISMO: o mesmo dos casos (a). Com sessao, `faltaConta` e falso e o
    // ramo `logado` de `_tocarNoCartao` leva a pagina. Um convite que
    // aparecesse aqui seria o defeito simetrico: cobrar conta de quem tem uma.

    testWidgets('(b1) o toque no cartão de evento ABRE a página, e não a folha',
        (tester) async {
      _telaAlta(tester);
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/network/events': (_) => json200(_paginaDeEventos()),
          'GET /v1/network/events/nearby': (_) => json200(const <String, dynamic>{
                'items': <dynamic>[],
                'page': 1,
                'limit': 20,
                'total': 0,
                'effective_sort': 'proximos',
                'effective_when': 'proximos',
                'applied_filters': <String, dynamic>{},
              }),
          'GET /v1/network/events/$_slugDoEvento': (_) => json200(_evento()),
          'GET /v1/network/events/$_slugDoEvento/location': (_) =>
              json200(const <String, dynamic>{
                'point': null,
                'street_address': null,
              }),
        }),
      );
      await abrirAAba(tester, 'Rede');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.logado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(CartaoDoEncontro), findsOneWidget);
      await _tocarNoCartaoDoEvento(tester);

      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: a folha com o convite abriu para quem TEM conta.',
      );
      // **O CONTEUDO, e nao so a rota.** Uma rota ausente faria tudo
      // responder 404 e a tela ficaria vazia -- verde por nada.
      expect(_rotaAgora(tester), '/rede/encontros/$_slugDoEvento');
      expect(find.text('Sobre o evento'), findsOneWidget);
      expect(
        find.text('Caminhada tranquila, aberta a quem quiser chegar.'),
        findsOneWidget,
      );
    });

    testWidgets('(b2) as TRÊS páginas carregam com conta, e nenhuma mostra o '
        'convite',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/pets/$_petId': (_) => json200(petDoContrato(id: _petId)),
          'GET /v1/found-reports/$_achadoId': (_) => json200(_achado()),
          'GET /v1/people/$_apelido': (_) => json200(_pessoa()),
        }),
      );

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.logado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      // **O CONTEUDO DE CADA UMA, e nao so a ausencia do convite.** Uma rota
      // ausente faria tudo responder 404: as tres telas ficariam sem convite
      // e sem conteudo, e o caso passaria por nada.
      for (final (rota, marca) in <(String, String)>[
        (Rotas.detalheDoPetDe(_petId), 'Nina'),
        (Rotas.achadoDe(_achadoId), 'Vila Gertrudes, São Paulo'),
        ('/pessoa/$_apelido', 'Marina'),
      ]) {
        await irPara(tester, rota);
        expect(
          find.byType(ConviteParaEntrar),
          findsNothing,
          reason: 'REPROVA: $rota pediu conta a quem tem uma.',
        );
        expect(
          find.textContaining(marca),
          findsWidgets,
          reason: 'a tela de $rota nao carregou: o `findsNothing` acima '
              'passaria por vazio',
        );
      }
    });
  });

  // =========================================================================
  group('ISCA (c): e-mail pendente recebe a mensagem de CONFIRMAR, nunca a de '
      'criar conta', () {
    // MECANISMO: **nenhuma tela desta frente pergunta pelo e-mail.** A regua e
    // SESSAO, decidida pelo `next_action` do corpo da resposta, e nao
    // `podeCriarNaComunidade` (sessao E e-mail confirmado).
    //
    // ISCA, e ela vai no RENDER e nao no ramo de falha -- medido: sabotar
    // `if (faltaConta(falha))` nao reprova nada, porque com e-mail pendente a
    // resposta e 200 e aquele ramo nem e alcancado. Em
    // `pet/tela_detalhe_do_pet.dart`, no comeco de `_corpo()`, acrescente
    //     if (!(Escopo.of(context).sessao.usuario?.emailVerificado ?? false)) {
    //       return const Padding(
    //         padding: EdgeInsets.all(BichuEspaco.e4),
    //         child: ConviteParaEntrar(secao: SecaoComConta.paginaDoPet),
    //       );
    //     }
    // Este caso reprova em `REPROVA: quem tem conta com e-mail pendente
    // recebeu um convite para ENTRAR`. **E o defeito que a entrega de 19/10
    // consertou**: oferecer "crie sua conta" a quem ja tem uma.
    //
    // **E o servidor concede a leitura a esta pessoa.** Medido em 20/10/2026
    // com uma conta descartavel recem-criada, sem o e-mail confirmado:
    // `GET /v1/pets/{id}` responde **404** (nao e o pet dela) e nao 401 -- a
    // rota de leitura ACEITA o token de quem tem pendencia.

    testWidgets('(c) com e-mail pendente a página carrega, e quem fala de '
        'e-mail é o aviso de cadastro', (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(
          emailVerificado: false,
          pendencias: const <PendenciaDeCadastro>[
            PendenciaDeCadastro.verificacaoDeEmail,
          ],
        ),
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/pets/$_petId': (_) => json200(petDoContrato(id: _petId)),
          'GET /v1/pets': (_) => json200(const <String, dynamic>{
                'items': <dynamic>[],
              }),
        }),
      );
      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.logado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      // (1) A ANCORA DO ESTADO, e ela vem PRIMEIRO -- antes de empilhar
      // qualquer pagina. Ela prova duas coisas: que o estado de e-mail
      // pendente esta de fato valendo neste caso (sem isto os `findsNothing`
      // abaixo passariam com uma conta normal), e que o caminho de confirmar
      // existe e e OUTRO -- a faixa de `Pets`, com `Reenviar` ao lado.
      //
      // **A ordem nao e preferencia.** A pagina do pet e empilhada SOBRE a
      // casca e cobre a barra de abas: medir a aba depois faria `abrirAAba`
      // nao achar o slot, e o caso reprovaria pelo motivo errado.
      await abrirAAba(tester, 'Pets');
      expect(
        find.text('Confirme seu e-mail'),
        findsOneWidget,
        reason: 'o aviso de cadastro incompleto nao esta na tela: o caso nao '
            'estaria medindo o estado de e-mail pendente',
      );
      expect(find.text('Reenviar'), findsOneWidget);

      // (2) E A PAGINA DO PET CARREGA: o servidor concede a leitura a quem
      // tem pendencia, e o app nao inventa um muro que ele nao tem.
      await irPara(tester, Rotas.detalheDoPetDe(_petId));
      expect(find.text('Nina'), findsWidgets);
      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: quem tem conta com e-mail pendente recebeu um '
            'convite para ENTRAR. Ela ja esta dentro.',
      );
      expect(
        find.text('Criar conta'),
        findsNothing,
        reason: 'REPROVA: a tela ofereceu `Criar conta` a quem ja tem uma. E '
            'exatamente o defeito que a frente de 19/10 consertou.',
      );
    });
  });

  // =========================================================================
  group('ISCA (d): o conteúdo público continua abrindo SEM conta', () {
    // **E a regressao mais cara desta frente, e e por isso que ha uma isca por
    // tela publica.** Medido na homologacao em 20/10/2026, sem token:
    // `GET /v1/public/lost-pets` 200, `GET /v1/public/lost-cases/{token}` 200,
    // `GET /v1/network/events` 200 (com `total` e os MESMOS 23 campos com e
    // sem conta), `GET /v1/store/items` 200 e
    // `GET /v1/store/items/{slug}` 200.
    //
    // MECANISMO: a ausencia de muro. Qualquer `ConviteParaEntrar` ou folha
    // acrescentado nestas quatro superficies reprova aqui.

    testWidgets('(d1) a lista pública de pets perdidos abre e o cartão leva ao '
        'caso, sem conta', (tester) async {
      await abrirOApp(
        tester,
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/public/lost-pets': (_) => json200(<String, dynamic>{
                'items': <Map<String, dynamic>>[_perdidoDaLista()],
                'page': 1,
                'limit': 20,
                'total': 1,
              }),
          'GET /v1/public/lost-cases/$_tokenDoCaso': (_) =>
              json200(_casoPublico()),
        }),
      );
      await abrirAAba(tester, 'Pets');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.text('Toddy'), findsWidgets);
      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: ha muro na lista publica de pets perdidos. E por ela '
            'que a vizinhanca acha o pet.',
      );

      await tocar(tester, find.text('Toddy').first);
      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: o toque no cartao de pet perdido pediu conta. A '
            'rota responde 200 sem conta de proposito.',
      );
      expect(_rotaAgora(tester), '/p/$_tokenDoCaso');
    });

    testWidgets('(d2) a página pública do caso abre por link, sem conta',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/public/lost-cases/$_tokenDoCaso': (_) =>
              json200(_casoPublico()),
        }),
      );
      await irPara(tester, '/p/$_tokenDoCaso');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsNothing);
      expect(find.textContaining('Toddy'), findsWidgets);
    });

    testWidgets('(d3) a agenda da Rede mostra os eventos sem conta: só o '
        'DETALHE pede entrar', (tester) async {
      await abrirOApp(
        tester,
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/network/events': (_) => json200(_paginaDeEventos()),
        }),
      );
      await abrirAAba(tester, 'Rede');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      // A LISTA CONTINUA VISIVEL, e isso e a metade que a folha protege: um
      // convite de tela cheia aqui esconderia conteudo que o servidor
      // entrega sem conta.
      expect(find.byType(CartaoDoEncontro), findsOneWidget);
      expect(find.text(_tituloDoEvento), findsOneWidget);
      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: a agenda publica virou um muro. `/v1/network/events` '
            'responde 200 sem conta, e trocar a lista por um convite seria o '
            'contrario do produto.',
      );
    });

    testWidgets('(d4) a vitrine da Loja abre e o cartão leva ao parceiro, sem '
        'conta', (tester) async {
      // **A SAIDA DE MENTIRA E O QUE FAZ ESTE CASO VALER.** A primeira versao
      // dele so olhava a tela depois de carregar, e passou CEGA quando eu
      // troquei `sairDaLoja` por uma folha de convite na isca: o convite
      // aparecia DEPOIS do toque, e o caso nunca tocava. Agora ele toca e
      // cobra o destino.
      final saida = _SaidaDeTeste();
      SaidaDoApp.atual = saida;
      addTearDown(SaidaDoApp.restaurar);

      await abrirOApp(
        tester,
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/store/items': (_) => json200(<String, dynamic>{
                'items': <Map<String, dynamic>>[_produto()],
                'page': 1,
                'limit': 20,
                'total': 1,
              }),
        }),
      );
      await abrirAAba(tester, 'Loja');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.text('Ração premium'), findsWidgets);
      // A saida para o parceiro esta oferecida no cartao, e ela e o unico
      // desfecho dele.
      expect(find.text('Compre agora'), findsWidgets);
      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: ha muro na vitrine da Loja. `/v1/store/items` '
            'responde 200 sem conta.',
      );

      // O TOQUE **NO CARTAO**, e o destino dele.
      //
      // **No TITULO e nao no botao `Compre agora`, e a diferenca foi medida:**
      // os dois chamam `sairDaLoja`, mas por handlers DIFERENTES -- o
      // `onTap` do `InkWell` do cartao e o `onPressed` do botao. Com o caso
      // tocando no botao, a isca que sabota o `onTap` do cartao passava CEGA.
      // O cliente pediu o aviso no toque do CONTEUDO, e o conteudo e o cartao.
      await tocar(tester, find.text('Ração premium').first);
      expect(
        saida.links.map((Uri u) => u.toString()).toList(),
        <String>['https://parceiro.exemplo/racao-premium'],
        reason: 'REPROVA: o toque na Loja nao saiu para o parceiro. Se ele '
            'passou a pedir conta, a vitrine ganhou um muro que o servidor '
            'nao tem.',
      );
      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: o toque na Loja pediu conta.',
      );
    });

    testWidgets('(d-contrapeso) a aba Comunidade, que exige conta DE VERDADE, '
        'continua com o convite de tela cheia', (tester) async {
      // **Sem este caso os quatro de cima sao vacuos.** Eles provariam apenas
      // que `ConviteParaEntrar` nao existe mais em lugar nenhum do app. Aqui a
      // MESMA busca tem de achar -- e e o lugar certo dela: o diretorio
      // responde 401 `sign_in`, o muro e do SERVIDOR, e e a LISTA inteira que
      // nao pode ser lida.
      await abrirOApp(
        tester,
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/directory/entries': (_) => _semConta(),
        }),
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(find.text('Quem atende bem, perto de você'), findsOneWidget);
    });
  });

  // =========================================================================
  group('ISCA (e): depois de entrar, a pessoa volta ao conteúdo que tocou', () {
    // MECANISMO: `intencao/leitura_como_intencao.dart` mais o `rotaDeVolta` do
    // convite. Desligado (passando `rotaDeVolta: null` em
    // `agenda_da_rede.dart`), o login leva a `/pets` -- que e exatamente o que
    // o contrapeso deste grupo mede, e e o comportamento que havia antes desta
    // frente.

    testWidgets('(e1) tocar no evento, entrar, e cair NA PÁGINA do evento',
        (tester) async {
      _telaAlta(tester);
      var logado = false;
      final envelope = await abrirOApp(
        tester,
        rede: (req) async {
          final chave = '${req.method} ${req.url.path}';
          if (chave == 'POST /v1/auth/login') {
            logado = true;
            return json200(_sessaoDoContrato());
          }
          if (chave == 'GET /v1/network/events') {
            return json200(_paginaDeEventos());
          }
          if (chave == 'GET /v1/network/events/nearby') {
            return json200(const <String, dynamic>{
              'items': <dynamic>[],
              'page': 1,
              'limit': 20,
              'total': 0,
              'effective_sort': 'proximos',
              'effective_when': 'proximos',
              'applied_filters': <String, dynamic>{},
            });
          }
          if (chave == 'GET /v1/network/events/$_slugDoEvento') {
            return json200(_evento());
          }
          if (chave == 'GET /v1/network/events/$_slugDoEvento/location') {
            return logado
                ? json200(const <String, dynamic>{
                    'point': null,
                    'street_address': null,
                  })
                : _semConta();
          }
          if (chave == 'GET /v1/public/reference-data') {
            return json200(referenciaDeTeste());
          }
          if (chave == 'GET /v1/public/lost-pets') {
            return json200(const <String, dynamic>{
              'items': <dynamic>[],
              'page': 1,
              'limit': 20,
              'total': 0,
            });
          }
          return problema('not-found', 404);
        },
      );
      await abrirAAba(tester, 'Rede');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      await _tocarNoCartaoDoEvento(tester);
      expect(find.byType(ConviteParaEntrar), findsOneWidget);

      // O ENVELOPE AINDA NAO FOI GRAVADO: ele nasce no toque em `Entrar`, e
      // nao ao abrir a folha. Quem fecha a folha sem entrar nao deixa rastro.
      expect(
        await envelope.ler(),
        isNull,
        reason: 'REPROVA: abrir a folha ja guardou uma intencao. Quem desiste '
            'nao pediu nada.',
      );

      await tester.tap(find.widgetWithText(BotaoPrimario, 'Entrar'));
      await tester.pumpAndSettle();

      // (1) A INTENCAO DE LEITURA ESTA NO DISCO, com a ACAO e o ALVO certos.
      final guardado = await envelope.ler();
      expect(guardado, isNotNull);
      final lido = IntencaoPendente.deJson(
        Map<String, dynamic>.from(jsonDecode(guardado!) as Map),
      );
      expect(lido.acao, AcaoDeIntencao.verConteudo);
      expect(lido.alvo, '/rede/encontros/$_slugDoEvento');
      expect(lido.telaDeRetorno, telaDeUxDaLeitura);

      // (2) A FOLHA FECHOU e a tela de entrar esta na frente. Sem o `pop` do
      // `emFolha`, C.2 nasceria atras da folha.
      expect(_rotaAgora(tester), Rotas.entrar);
      expect(find.byType(ConviteParaEntrar), findsNothing);

      await _entrarNaConta(tester);

      // (3) A PESSOA VOLTOU AO CONTEUDO, e o conteudo esta na tela.
      expect(
        _rotaAgora(tester),
        '/rede/encontros/$_slugDoEvento',
        reason: 'REPROVA: depois de entrar a pessoa nao voltou ao evento que '
            'ela tocou.',
      );
      expect(find.text('Sobre o evento'), findsOneWidget);
      expect(find.byType(TelaDoEncontro), findsOneWidget);

      // (4) E O ENVELOPE MORREU (regra 7 de 8.3). Mantido, a leitura
      // aconteceria de novo no proximo login dentro das 24 horas.
      expect(
        await envelope.ler(),
        anyOf(isNull, isEmpty),
        reason: 'REPROVA: o envelope de leitura sobreviveu a execucao.',
      );
    });

    testWidgets('(e-contrapeso) o MESMO login, a partir de um convite SEM '
        'endereço de volta, cai em /pets', (tester) async {
      // **Sem este caso o (e1) seria vacuo.** Ele passaria no dia em que o
      // login passasse a nunca sair do lugar -- e nao e disso que a volta
      // depende. Aqui o convite e o da aba `Comunidade`, que **nao** passa
      // `rotaDeVolta` (o muro e da lista, e voltar para uma lista que continua
      // recusando nao seria voltar a nada), e o destino e a secao de
      // aterrissagem, como era antes desta frente.
      final envelope = await abrirOApp(
        tester,
        rede: (req) async {
          final chave = '${req.method} ${req.url.path}';
          if (chave == 'POST /v1/auth/login') {
            return json200(_sessaoDoContrato());
          }
          if (chave == 'GET /v1/directory/entries') return _semConta();
          if (chave == 'GET /v1/public/reference-data') {
            return json200(referenciaDeTeste());
          }
          if (chave == 'GET /v1/public/lost-pets') {
            return json200(const <String, dynamic>{
              'items': <dynamic>[],
              'page': 1,
              'limit': 20,
              'total': 0,
            });
          }
          if (chave == 'GET /v1/network/events') {
            return json200(const <String, dynamic>{
              'items': <dynamic>[],
              'page': 1,
              'limit': 20,
              'total': 0,
              'effective_sort': 'proximos',
              'effective_when': 'proximos',
              'applied_filters': <String, dynamic>{},
            });
          }
          if (chave == 'GET /v1/pets') {
            return json200(const <String, dynamic>{'items': <dynamic>[]});
          }
          return problema('not-found', 404);
        },
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      await tester.tap(find.widgetWithText(BotaoPrimario, 'Entrar'));
      await tester.pumpAndSettle();

      expect(
        await envelope.ler(),
        isNull,
        reason: 'REPROVA: o convite da secao guardou intencao de leitura. Ele '
            'nao recebe `rotaDeVolta`, e sem ela nao ha nada a guardar.',
      );

      await _entrarNaConta(tester);
      expect(
        _rotaAgora(tester),
        Rotas.pets,
        reason: 'o destino sem envelope deixou de ser a secao de '
            'aterrissagem: o caso (e1) passaria por acidente',
      );
    });

    testWidgets('(e2) a intenção de LEITURA não sobrescreve um rascunho já '
        'guardado', (tester) async {
      // A regra 1 de 8.3 diz que a intencao nova substitui a anterior, e para
      // duas ESCRITAS isso esta certo. Para uma leitura, nao: quem tem um
      // `Marcar como perdido` meio preenchido e toca num link de evento
      // perderia o que digitou para ganhar uma volta de leitura. Perder uma
      // volta e barato; perder o rascunho e o defeito que o envelope existe
      // para evitar.
      //
      // ISCA: em `widgets/convite_para_entrar.dart`, apague o
      //     if (await guarda.pendente() == null)
      // e guarde sempre. Este caso reprova na acao do envelope.
      final rascunho = IntencaoPendente(
        acao: AcaoDeIntencao.marcarPerdido,
        alvo: _petId,
        telaDeRetorno: 'F3.1',
        criadaEm: DateTime.now(),
        rascunho: RascunhoDaIntencao(
          campos: const <String, Object?>{'bairro': 'Vila Gertrudes'},
        ),
      );
      final envelope = DepositoDeIntencaoEmMemoria();
      await envelope.gravar(jsonEncode(rascunho.paraJson()));

      await abrirOApp(
        tester,
        envelope: envelope,
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/network/events': (_) => json200(_paginaDeEventos()),
        }),
      );
      await abrirAAba(tester, 'Rede');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      await _tocarNoCartaoDoEvento(tester);
      await tester.tap(find.widgetWithText(BotaoPrimario, 'Entrar'));
      await tester.pumpAndSettle();

      final guardado = await envelope.ler();
      expect(guardado, isNotNull);
      final lido = IntencaoPendente.deJson(
        Map<String, dynamic>.from(jsonDecode(guardado!) as Map),
      );
      expect(
        lido.acao,
        AcaoDeIntencao.marcarPerdido,
        reason: 'REPROVA: a intencao de LEITURA engoliu o rascunho de '
            '`marcar_perdido`. A pessoa perdeu o que digitou.',
      );
      expect(lido.rascunho.campos['bairro'], 'Vila Gertrudes');
    });
  });

  // =========================================================================
  group('o cartão não ganhou informação ao ganhar o toque', () {
    // **Esta e a metade que a volta do clique poderia ter quebrado calada.** O
    // cartao e `foto + titulo` por decisao do cliente de 19/10 (*"apenas a
    // foto e o titulo do evento"*), confirmada em 20/10 (*"pedi pra voce
    // resumir a listagem com foto, titulo do evento"*). Ha isca equivalente em
    // `test/rede/agenda_da_rede_test.dart`; esta existe porque foi ESTA frente
    // que mexeu no cartao, e um portao proprio reprova no diff que o causou.
    //
    // ISCA: em `cartao_do_encontro.dart`, acrescente qualquer `Text` -- a
    // data, o lugar, o resumo. Este caso reprova na contagem.

    testWidgets('UM nó de texto no cartão de um evento que vai acontecer',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/network/events': (_) => json200(_paginaDeEventos()),
        }),
      );
      await abrirAAba(tester, 'Rede');

      expect(find.byType(CartaoDoEncontro), findsOneWidget);
      final textos = tester
          .widgetList<Text>(
            find.descendant(
              of: find.byType(CartaoDoEncontro),
              matching: find.byType(Text),
            ),
          )
          .map((Text t) => t.data ?? '')
          .where((String s) => s.isNotEmpty)
          .toList(growable: false);
      expect(
        textos,
        <String>[_tituloDoEvento],
        reason: 'REPROVA: o cartao escreve mais do que o titulo.',
      );
    });

    testWidgets('DOIS nós no cancelado: a palavra e o título, e nada mais',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _rede(<String, http.Response Function(http.Request)>{
          'GET /v1/network/events': (_) =>
              json200(_paginaDeEventos(status: 'cancelled')),
        }),
      );
      await abrirAAba(tester, 'Rede');

      final textos = tester
          .widgetList<Text>(
            find.descendant(
              of: find.byType(CartaoDoEncontro),
              matching: find.byType(Text),
            ),
          )
          .map((Text t) => t.data ?? '')
          .where((String s) => s.isNotEmpty)
          .toList(growable: false);
      expect(textos, <String>['Cancelado', _tituloDoEvento]);
    });
  });
}
