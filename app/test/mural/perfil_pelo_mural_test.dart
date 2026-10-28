// **O MURAL ABRE O PERFIL DE QUEM PUBLICOU.**
//
// Cliente, 22/10/2026: *"Inclua um link que seja o usuario a pagina do
// perfil"*, e *"inclua o icone do perfil/foto do usuario nas mensagens"*.
//
// ===========================================================================
// O DEFEITO QUE ESTES CASOS GUARDAM
// ===========================================================================
// O app linkava o autor em CINCO superficies -- a conversa, os pedidos de
// conexao, a busca de pessoas, `Minhas conexoes` e a leitura de QR -- e **no
// Mural nao**. O cartao e o comentario desenhavam `MarcaDaPessoa` e
// `NomeComSelo` sem toque nenhum, e o comentario de `_FotoDoAutor` dizia que a
// ausencia era DELIBERADA.
//
// **A razao alegada era o APELIDO NULO**, e ela era boa: `Rotas.perfilDe`
// enderecca pelo apelido, `AutorDaPublicacao.apelido` e anulavel, e um circulo
// que se anuncia como botao e nao leva a lugar nenhum e o toque sem desfecho que
// o criterio 2 da BICHUS-62 proibe. O mesmo comentario dizia o preco de ligar o
// toque: *"quem trouxer o toque para o perfil traz com ele o estado de apelido
// nulo"*.
//
// **Entao sao DOIS casos por superficie, e nao um**: o toque que navega, e o
// apelido nulo que NAO quebra a tela e simplesmente nao linka. Um portao que
// medisse so o primeiro seria atendido por um `InkWell` incondicional -- que e
// exatamente o defeito que a prosa de `_FotoDoAutor` previa.
//
// ===========================================================================
// A BANCADA MONTA UM `GoRouter` DE VERDADE
// ===========================================================================
// O destino e `context.push(Rotas.perfilDe(apelido))`, e a unica forma de
// provar que o toque NAVEGA e deixar o roteador resolver o endereco. A rota de
// perfil deste arquivo pinta o apelido que recebeu: assim o caso prova nao so
// que navegou, mas que navegou para a PESSOA CERTA -- um `push` com o apelido
// trocado passaria num caso que so conferisse "saiu do Mural".

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/mural_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/mural/comentarios_da_publicacao.dart';
import 'package:bichu/telas/mural/porta_do_perfil_do_autor.dart';
import 'package:bichu/telas/mural/tela_do_mural.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/marca_da_pessoa.dart';
import 'package:bichu/widgets/selo_de_validado.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';

const String _refDaPublicacao = 'AaBbCcDdEeFfGgHhIiJjK1';
const String _refDoComentario = 'CcDdEeFfGgHhIiJjKkLlM1';
const String _apelidoDoAutor = 'marina-vet';
const String _apelidoDoComentarista = 'joana';

/// A publicacao, com o `handle` do autor sob controle do caso.
///
/// **`handle` ausente e o estado que importa**: nao e erro nem lista vazia --
/// e a pessoa que nao tem apelido, e e ela que decide se o toque nasce.
Map<String, dynamic> _publicacao({String? handle = _apelidoDoAutor}) {
  return <String, dynamic>{
    'ref': _refDaPublicacao,
    'body': 'o Bidu no parque',
    'created_at': '2026-10-20T12:00:00.000Z',
    'image': null,
    'like_count': 0,
    'comment_count': 0,
    'liked_by_me': false,
    'author': <String, dynamic>{
      'handle': handle,
      'display_name': 'Marina',
      'photo_icon_url': null,
      'contact_channel_verified': true,
    },
    'mine': false,
  };
}

Map<String, dynamic> _comentario({String? handle = _apelidoDoComentarista}) {
  return <String, dynamic>{
    'ref': _refDoComentario,
    'body': 'que lindo!',
    'created_at': '2026-10-20T12:01:00.000Z',
    'author': <String, dynamic>{
      'handle': handle,
      'display_name': 'Joana',
      'photo_icon_url': null,
      'contact_channel_verified': false,
    },
    'mine': false,
  };
}

/// 404 em qualquer rota que o caso nao declare: resposta generosa esconderia
/// uma chamada que a tela nao devia fazer.
Future<http.Response> Function(http.Request) _rede({
  required Map<String, dynamic> publicacao,
  List<Map<String, dynamic>> comentarios = const <Map<String, dynamic>>[],
}) {
  return (req) async {
    final String caminho = req.url.path;
    if (caminho == '/v1/timeline' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[publicacao],
        'next_cursor': null,
      });
    }
    if (caminho == '/v1/me/publications' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[],
        'next_cursor': null,
      });
    }
    if (caminho == '/v1/publications/$_refDaPublicacao/comments' &&
        req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': comentarios,
        'next_cursor': null,
        'comment_count': comentarios.length,
      });
    }
    return http.Response(jsonEncode(<String, dynamic>{}), 404);
  };
}

ApiClient _cliente(Future<http.Response> Function(http.Request) rede) {
  AppConfig.limparParaTeste();
  return ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
    cliente: MockClient(rede),
    tokenDeAcesso: () async => 'token-de-medicao',
  );
}

/// O texto que a rota de perfil pinta. **Carrega o apelido** de proposito.
String _marcaDoPerfil(String? apelido) => 'PERFIL ABERTO: $apelido';

/// Monta a arvore sob um `GoRouter` com a rota de perfil de verdade.
Future<void> _montar(WidgetTester tester, Widget inicial) async {
  tester.view.physicalSize = const Size(420, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final roteador = GoRouter(
    initialLocation: '/',
    routes: <RouteBase>[
      GoRoute(path: '/', builder: (_, _) => inicial),
      GoRoute(
        path: Rotas.perfilDePessoa,
        builder: (_, estado) => Scaffold(
          body: Text(
            _marcaDoPerfil(estado.pathParameters[Rotas.parametroDoApelido]),
          ),
        ),
      ),
    ],
  );
  addTearDown(roteador.dispose);
  await tester.pumpWidget(
    MaterialApp.router(theme: BichuTheme.claro, routerConfig: roteador),
  );
  await tester.pumpAndSettle();
}

Future<void> _montarOCartao(
  WidgetTester tester, {
  String? handle = _apelidoDoAutor,
}) async {
  final api = _cliente(_rede(publicacao: _publicacao(handle: handle)));
  await _montar(
    tester,
    Scaffold(
      body: SingleChildScrollView(
        child: CorpoDoMural(leitura: MuralApi(api), interacao: MuralApi(api)),
      ),
    ),
  );
}

Future<void> _montarOsComentarios(
  WidgetTester tester, {
  String? handle = _apelidoDoComentarista,
}) async {
  final api = _cliente(
    _rede(
      publicacao: _publicacao(),
      comentarios: <Map<String, dynamic>>[_comentario(handle: handle)],
    ),
  );
  await _montar(
    tester,
    ComentariosDaPublicacao(
      ref: _refDaPublicacao,
      interacao: MuralApi(api),
      minhaPublicacao: false,
    ),
  );
}

/// Quantos widgets de TOQUE a porta de `dentroDe` monta.
///
/// **Descendentes de `PortaDoPerfilDoAutor`**, e nao `find.byType` solto: o
/// cartao tem outros controles (o coracao, o `⋮`, `Comentar`), e um finder
/// solto contaria os deles e ficaria verde sem a porta existir.
///
/// **CONTA OS DOIS TIPOS, e isso nao e excesso:** a porta monta `InkWell` na
/// foto e `GestureDetector(excludeFromSemantics: true)` no nome -- duas formas,
/// porque embrulhar `NomeComSelo` em semantica de botao FUNDE o nome e o selo
/// num no so (medido; ver o doc de `PortaDoPerfilDoAutor.rotulo`). Um portao
/// que contasse so `InkWell` daria ZERO no nome **mesmo com o toque ligado**, e
/// a afirmacao de ausencia do caso sem apelido passaria no vazio.
int _toquesDaPorta(WidgetTester tester, Finder dentroDe) {
  final Finder aPorta = find.ancestor(
    of: dentroDe,
    matching: find.byType(PortaDoPerfilDoAutor),
  );
  return find
          .descendant(of: aPorta, matching: find.byType(InkWell))
          .evaluate()
          .length +
      find
          .descendant(of: aPorta, matching: find.byType(GestureDetector))
          .evaluate()
          .length;
}

void main() {
  group('(1) o cartao do Mural: a foto e o nome abrem o perfil', () {
    testWidgets('ISCA: tocar no NOME abre o perfil do autor', (tester) async {
      await _montarOCartao(tester);

      // ANCORA antes do toque: sem o nome na arvore o `tap` lancaria, e um
      // caso que explode nao e um caso que mede.
      expect(
        find.byType(NomeComSelo),
        findsOneWidget,
        reason: 'REPROVA: o cartao nao pintou o nome do autor, entao nao ha o '
            'que tocar.',
      );
      // **O TOQUE VAI NO TEXTO, e nao em `find.byType(NomeComSelo)`.** O nome
      // e curto, o `Flexible` do widget deixa folga a direita, e o CENTRO do
      // flex cai fora da propria caixa: `tap` avisou *"would not hit test on
      // the specified widget"* e o caso passou ASSIM MESMO, porque o toque caiu
      // noutro alvo que tambem navegava. Teste que passa por acidente nao prova
      // nada -- e `find.text` e o que a pessoa de fato encosta.
      final nome = find.descendant(
        of: find.byType(NomeComSelo),
        matching: find.text('Marina'),
      );
      expect(
        nome,
        findsOneWidget,
        reason: 'REPROVA: o nome do autor nao esta dentro de `NomeComSelo`.',
      );

      // **O CONTRAPONTO DA AUSENCIA, medido AQUI**: com apelido a porta monta
      // toque. Sem esta linha, o `findsNothing` do caso sem apelido poderia
      // estar verde porque o contador NAO ENXERGA a forma que a porta usa.
      expect(
        _toquesDaPorta(tester, find.byType(NomeComSelo)),
        greaterThan(0),
        reason: 'REPROVA: COM apelido a porta do nome nao monta toque nenhum, '
            'e entao o caso sem apelido nao prova nada: ele mediria a cegueira '
            'do contador e nao a ausencia do controle.',
      );
      expect(
        _toquesDaPorta(tester, find.byType(MarcaDaPessoa)),
        greaterThan(0),
        reason: 'REPROVA: COM apelido a porta da foto nao monta toque nenhum.',
      );

      await tester.tap(nome);
      await tester.pumpAndSettle();

      expect(
        find.text(_marcaDoPerfil(_apelidoDoAutor)),
        findsOneWidget,
        reason: 'REPROVA: tocar no nome do autor nao abriu o perfil dele. O '
            'cliente pediu o link em 22/10/2026, e o Mural era a unica das '
            'seis superficies de autor que nao linkava.',
      );
    });

    testWidgets('ISCA: tocar na FOTO abre o perfil do autor', (tester) async {
      await _montarOCartao(tester);

      final foto = find.byType(MarcaDaPessoa);
      expect(
        foto,
        findsOneWidget,
        reason: 'REPROVA: o cartao nao pintou a foto do autor.',
      );

      await tester.tap(foto);
      await tester.pumpAndSettle();

      expect(
        find.text(_marcaDoPerfil(_apelidoDoAutor)),
        findsOneWidget,
        reason: 'REPROVA: tocar na foto do autor nao abriu o perfil dele.',
      );
    });

    testWidgets(
      'CONTROLE POSITIVO: SEM APELIDO a tela NAO quebra e NAO linka',
      (tester) async {
        // Este e o caso que o comentario de `_FotoDoAutor` exigia de quem
        // ligasse o toque. Ele e o contrapeso dos dois acima: um `InkWell`
        // incondicional passaria naqueles e REPROVARIA aqui.
        await _montarOCartao(tester, handle: null);

        // 1. A TELA CONTINUA INTEIRA -- e esta e a metade que "nao quebra"
        //    significa. Sem estas tres linhas, uma tela que explodisse na
        //    montagem deixaria o `findsNothing` abaixo verde por vazio.
        expect(
          find.byType(MarcaDaPessoa),
          findsOneWidget,
          reason: 'REPROVA: sem apelido a foto do autor desapareceu. O toque '
              'nao nasce; o DESENHO continua.',
        );
        expect(
          find.byType(NomeComSelo),
          findsOneWidget,
          reason: 'REPROVA: sem apelido o nome do autor desapareceu.',
        );
        expect(
          find.text('o Bidu no parque'),
          findsOneWidget,
          reason: 'REPROVA: sem apelido o cartao parou de pintar a publicacao.',
        );

        // 2. E NAO HA PORTA. `PortaDoPerfilDoAutor` continua na arvore (ela
        //    devolve o filho cru), e o que NAO pode existir e o `InkWell`.
        expect(
          _toquesDaPorta(tester, find.byType(MarcaDaPessoa)),
          0,
          reason: 'REPROVA: a foto de um autor SEM APELIDO virou controle. '
              '`Rotas.perfilDe` precisa do apelido: o toque abriria `/pessoa/` '
              'sem pessoa, e um controle que se anuncia e nao leva a lugar '
              'nenhum e o toque sem desfecho que o criterio 2 da BICHUS-62 '
              'proibe.',
        );
        expect(
          _toquesDaPorta(tester, find.byType(NomeComSelo)),
          0,
          reason: 'REPROVA: o nome de um autor SEM APELIDO virou controle.',
        );
      },
    );
  });

  group('(2) o comentario: a MESMA regra, e por isso a mesma porta', () {
    testWidgets('ISCA: tocar no nome do comentarista abre o perfil dele', (
      tester,
    ) async {
      await _montarOsComentarios(tester);

      // O nome do COMENTARISTA, e nao o do autor da publicacao: a folha de
      // comentarios nao pinta o cartao, entao ha um `NomeComSelo` so.
      expect(
        find.byType(NomeComSelo),
        findsOneWidget,
        reason: 'REPROVA: a folha de comentarios nao pintou o nome do '
            'comentarista.',
      );
      // No TEXTO, pela mesma medicao do caso do cartao.
      final nome = find.descendant(
        of: find.byType(NomeComSelo),
        matching: find.text('Joana'),
      );
      expect(nome, findsOneWidget);

      await tester.tap(nome);
      await tester.pumpAndSettle();

      expect(
        find.text(_marcaDoPerfil(_apelidoDoComentarista)),
        findsOneWidget,
        reason: 'REPROVA: tocar no nome do comentarista nao abriu o perfil '
            'dele. O pedido do cliente fala de `comentarios` com o mesmo '
            'literal com que fala de `posts`.',
      );
    });

    testWidgets('ISCA: tocar na foto do comentarista abre o perfil dele', (
      tester,
    ) async {
      await _montarOsComentarios(tester);
      await tester.tap(find.byType(MarcaDaPessoa));
      await tester.pumpAndSettle();
      expect(
        find.text(_marcaDoPerfil(_apelidoDoComentarista)),
        findsOneWidget,
        reason: 'REPROVA: tocar na foto do comentarista nao abriu o perfil '
            'dele.',
      );
    });

    testWidgets(
      'CONTROLE POSITIVO: comentarista SEM APELIDO nao quebra e nao linka',
      (tester) async {
        await _montarOsComentarios(tester, handle: null);

        expect(
          find.byType(MarcaDaPessoa),
          findsOneWidget,
          reason: 'REPROVA: sem apelido a foto do comentarista desapareceu.',
        );
        expect(
          find.text('que lindo!'),
          findsOneWidget,
          reason: 'REPROVA: sem apelido a folha parou de pintar o comentario.',
        );
        expect(
          _toquesDaPorta(tester, find.byType(MarcaDaPessoa)),
          0,
          reason: 'REPROVA: a foto de um comentarista SEM APELIDO virou '
              'controle.',
        );
        expect(
          _toquesDaPorta(tester, find.byType(NomeComSelo)),
          0,
          reason: 'REPROVA: o nome de um comentarista SEM APELIDO virou '
              'controle.',
        );
      },
    );
  });
}
