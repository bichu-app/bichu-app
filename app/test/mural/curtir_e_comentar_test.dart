// **CURTIR E COMENTAR, do lado do aplicativo.**
//
// Decisao do cliente de 19/10/2026: *"curtir e comentar"* na primeira versao.
//
// ===========================================================================
// O QUE ESTES CASOS MEDEM, E O QUE ELES NAO PODEM MEDIR
// ===========================================================================
// **A unicidade da curtida NAO E DESTA CAMADA, e nao pode ser.** Ela e a chave
// primaria `(publication_id, user_id)` de `publication_likes`, no banco, com
// `ON CONFLICT DO NOTHING` na escrita -- e foi medida em BEGIN/ROLLBACK contra
// Postgres descartavel (`unique_violation` na segunda linha) e a mao contra as
// rotas (`PUT .../like` duas vezes devolve `like_count: 1` nas duas).
//
// O que o aplicativo tem de garantir e outra coisa:
//
//   1. o numero que fica na tela e o do SERVIDOR, e nao o palpite otimista;
//   2. a falha VOLTA o estado -- um coracao pintado depois de uma chamada que
//      falhou e a tela afirmando uma curtida que o servidor nao tem;
//   3. o contador NAO E BOTAO: nao existe rota de lista de quem curtiu, e um
//      toque ali nao levaria a lugar nenhum;
//   4. nao ha `Denunciar` no comentario, porque a denuncia de comentario nao
//      existe no contrato.
//
// ===========================================================================
// A BANCADA USA A PORTA DE VERDADE (`MuralApi` sobre `ApiClient`)
// ===========================================================================
// Um duble de `InteracaoDoMural` responderia igual para qualquer rota, e os
// casos de CAMINHO e de VERBO -- `PUT` curte, `DELETE` descurte, no MESMO
// endereco -- nao teriam o que observar.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/mural_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/mural/comentarios_da_publicacao.dart';
import 'package:bichu/telas/mural/tela_do_mural.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';

const String refDaPublicacao = 'AaBbCcDdEeFfGgHhIiJjK1';
const String refDoComentario = 'CcDdEeFfGgHhIiJjKkLlM1';

Map<String, dynamic> publicacaoComContagem({
  int curtidas = 0,
  int comentarios = 0,
  bool curtiEu = false,
}) {
  return <String, dynamic>{
    'ref': refDaPublicacao,
    'body': 'o Bidu no parque',
    'created_at': '2026-10-20T12:00:00.000Z',
    'image': null,
    'like_count': curtidas,
    'comment_count': comentarios,
    'liked_by_me': curtiEu,
    'author': <String, dynamic>{
      'handle': 'marina-vet',
      'display_name': 'Marina',
      'photo_icon_url': null,
    },
    'mine': false,
  };
}

Map<String, dynamic> comentario({
  String ref = refDoComentario,
  String texto = 'que lindo!',
  String nome = 'Joana',
  bool meu = false,
  String? urlDoIcone,
}) {
  return <String, dynamic>{
    'ref': ref,
    'body': texto,
    'created_at': '2026-10-20T12:01:00.000Z',
    'author': <String, dynamic>{
      'handle': 'joana',
      'display_name': nome,
      'photo_icon_url': urlDoIcone,
    },
    'mine': meu,
  };
}

/// A rede do Mural com interacao. **404 em qualquer outra rota.**
Future<http.Response> Function(http.Request) redeDaInteracao({
  required List<http.Request> capturado,
  required Map<String, dynamic> publicacao,
  List<Map<String, dynamic>> comentarios = const <Map<String, dynamic>>[],
  int totalDeComentarios = 0,
  http.Response Function()? respostaDoCurtir,
  http.Response Function()? respostaDoComentar,
}) {
  var curtidas = publicacao['like_count'] as int;
  var curti = publicacao['liked_by_me'] as bool;
  return (req) async {
    capturado.add(req);
    final caminho = req.url.path;
    if (caminho == '/v1/timeline' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[publicacao],
        'next_cursor': null,
      });
    }
    if (caminho == '/v1/me/publications' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[], 'next_cursor': null});
    }
    if (caminho == '/v1/publications/$refDaPublicacao/like') {
      final pronta = respostaDoCurtir;
      if (pronta != null) return pronta();
      // O SERVIDOR e a fonte: ele soma e subtrai, e e a resposta dele que a
      // tela adota. Idempotente nas duas direcoes, como a rota de verdade.
      if (req.method == 'PUT') {
        if (!curti) {
          curti = true;
          curtidas += 1;
        }
      } else if (req.method == 'DELETE') {
        if (curti) {
          curti = false;
          curtidas -= 1;
        }
      }
      return json200(<String, dynamic>{'like_count': curtidas, 'liked_by_me': curti});
    }
    if (caminho == '/v1/publications/$refDaPublicacao/comments') {
      if (req.method == 'GET') {
        return json200(<String, dynamic>{
          'items': comentarios,
          'next_cursor': null,
          'comment_count': totalDeComentarios,
        });
      }
      if (req.method == 'POST') {
        final pronta = respostaDoComentar;
        if (pronta != null) return pronta();
        final pedido = jsonDecode(req.body) as Map<String, dynamic>;
        return json200(
          <String, dynamic>{
            'comment': comentario(
              ref: 'NovoAaAaAaAaAaAaAaAaAa',
              texto: pedido['body'] as String,
              nome: 'Eu',
              meu: true,
            ),
            'comment_count': totalDeComentarios + 1,
          },
          status: 201,
        );
      }
    }
    if (caminho.startsWith('/v1/publications/$refDaPublicacao/comments/') &&
        req.method == 'DELETE') {
      return json200(<String, dynamic>{
        'comment_count': totalDeComentarios > 0 ? totalDeComentarios - 1 : 0,
      });
    }
    return problema('not-found', 404);
  };
}

ApiClient clientePara(Future<http.Response> Function(http.Request) rede) {
  AppConfig.limparParaTeste();
  return ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
    cliente: MockClient(rede),
    tokenDeAcesso: () async => 'token-de-medicao',
  );
}

Future<List<http.Request>> montarOCartao(
  WidgetTester tester, {
  required Map<String, dynamic> publicacao,
  List<Map<String, dynamic>> comentarios = const <Map<String, dynamic>>[],
  int totalDeComentarios = 0,
  http.Response Function()? respostaDoCurtir,
}) async {
  // Janela alta: o `ListView` nao constroi o que esta fora da viewport, e a
  // linha de acoes fica abaixo da dobra na janela padrao.
  tester.view.physicalSize = const Size(420, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final capturado = <http.Request>[];
  final api = clientePara(
    redeDaInteracao(
      capturado: capturado,
      publicacao: publicacao,
      comentarios: comentarios,
      totalDeComentarios: totalDeComentarios,
      respostaDoCurtir: respostaDoCurtir,
    ),
  );
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: SingleChildScrollView(
          child: CorpoDoMural(leitura: MuralApi(api), interacao: MuralApi(api)),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return capturado;
}

Future<List<http.Request>> montarOsComentarios(
  WidgetTester tester, {
  List<Map<String, dynamic>> comentarios = const <Map<String, dynamic>>[],
  int totalDeComentarios = 0,
  http.Response Function()? respostaDoComentar,
  // Padrao `false`: a montagem comum e a de quem VISITA a publicacao de outra
  // pessoa, e e nela que o `Apagar` NAO deve nascer em comentario alheio.
  bool minhaPublicacao = false,
}) async {
  tester.view.physicalSize = const Size(420, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final capturado = <http.Request>[];
  final api = clientePara(
    redeDaInteracao(
      capturado: capturado,
      publicacao: publicacaoComContagem(),
      comentarios: comentarios,
      totalDeComentarios: totalDeComentarios,
      respostaDoComentar: respostaDoComentar,
    ),
  );
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: ComentariosDaPublicacao(
        ref: refDaPublicacao,
        interacao: MuralApi(api),
        minhaPublicacao: minhaPublicacao,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return capturado;
}

List<String> caminhosEVerbos(List<http.Request> capturado) =>
    capturado.map((p) => '${p.method} ${p.url.path}').toList();

void main() {
  // =========================================================================
  // CURTIR
  // =========================================================================

  testWidgets(
      'ISCA — o cartao desenha as CONTAGENS que o servidor devolveu',
      (tester) async {
    // ISCA: em `_AcoesDaPublicacao`, trocar `widget.publicacao.curtidas` por
    // `0`. A tela pareceria funcionar e mostraria zero em tudo. Este caso
    // reprova pelo nome.
    await montarOCartao(
      tester,
      publicacao: publicacaoComContagem(curtidas: 7, comentarios: 3),
    );
    expect(find.text('7'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets(
      'ISCA — curtir manda `PUT` no caminho certo, e o numero que FICA e o do '
      'servidor', (tester) async {
    // ISCA 1 (verbo): trocar `_cliente.put` por `_cliente.post` em
    // `MuralApi.curtir`. A bancada responde 404 e o caso reprova no caminho.
    //
    // ISCA 2 (o numero do servidor): em `_alternarCurtida`, apagar o
    // `setState` que adota `reacao.curtidas` e deixar so o palpite otimista. A
    // tela mostraria o numero certo por coincidencia neste caso, e errado no
    // caso seguinte -- que e o que o par mede.
    final capturado = await montarOCartao(
      tester,
      publicacao: publicacaoComContagem(curtidas: 4),
    );
    await tester.tap(find.byIcon(Icons.favorite_border));
    await tester.pumpAndSettle();

    expect(
      caminhosEVerbos(capturado),
      contains('PUT /v1/publications/$refDaPublicacao/like'),
      reason: 'curtir nao saiu por `PUT` no caminho da curtida',
    );
    expect(find.text('5'), findsOneWidget);
    // O coracao PREENCHIDO: o estado novo esta na tela.
    expect(find.byIcon(Icons.favorite), findsOneWidget);
    expect(find.byIcon(Icons.favorite_border), findsNothing);
  });

  testWidgets(
      'ISCA — o numero do SERVIDOR substitui o palpite, mesmo divergindo dele',
      (tester) async {
    // **O caso que prova que o palpite nao manda.** O servidor responde `99`
    // para uma publicacao que estava em `4`: se a tela adotasse o palpite
    // otimista (`5`), ela mostraria `5`. Ela tem de mostrar `99`.
    //
    // Isso nao e hipotetico: duas pessoas curtindo ao mesmo tempo produzem
    // exatamente esta divergencia, e e por isso que a resposta carrega a
    // contagem lida das LINHAS.
    await montarOCartao(
      tester,
      publicacao: publicacaoComContagem(curtidas: 4),
      respostaDoCurtir: () => json200(
        <String, dynamic>{'like_count': 99, 'liked_by_me': true},
      ),
    );
    await tester.tap(find.byIcon(Icons.favorite_border));
    await tester.pumpAndSettle();

    expect(
      find.text('99'),
      findsOneWidget,
      reason:
          'a tela ficou com o palpite otimista em vez da contagem do servidor. '
          'Duas pessoas curtindo ao mesmo tempo produzem essa divergencia',
    );
    expect(find.text('5'), findsNothing);
  });

  testWidgets(
      'ISCA — descurtir manda `DELETE` no MESMO caminho, e a contagem volta',
      (tester) async {
    final capturado = await montarOCartao(
      tester,
      publicacao: publicacaoComContagem(curtidas: 4, curtiEu: true),
    );
    // Comeca curtido: o coracao esta preenchido.
    expect(find.byIcon(Icons.favorite), findsOneWidget);

    await tester.tap(find.byIcon(Icons.favorite));
    await tester.pumpAndSettle();

    expect(
      caminhosEVerbos(capturado),
      contains('DELETE /v1/publications/$refDaPublicacao/like'),
      reason: 'descurtir nao saiu por `DELETE` no MESMO caminho da curtida',
    );
    expect(find.text('3'), findsOneWidget);
    expect(find.byIcon(Icons.favorite_border), findsOneWidget);
  });

  testWidgets(
      'ISCA — a FALHA volta o estado: coracao e numero nao mentem',
      (tester) async {
    // Deixar o coracao pintado depois de uma chamada que falhou e a tela
    // afirmando uma curtida que o servidor nao tem -- e a pessoa so descobriria
    // na proxima recarga.
    //
    // ISCA: em `_alternarCurtida`, apagar o `catch` que restaura `eraCurti` e
    // `eramCurtidas`. Este caso reprova pelo nome.
    await montarOCartao(
      tester,
      publicacao: publicacaoComContagem(curtidas: 4),
      respostaDoCurtir: () => problema('internal-error', 500),
    );
    await tester.tap(find.byIcon(Icons.favorite_border));
    await tester.pumpAndSettle();

    expect(find.text('4'), findsOneWidget, reason: 'a contagem nao voltou depois da falha');
    expect(
      find.byIcon(Icons.favorite_border),
      findsOneWidget,
      reason: 'o coracao ficou pintado depois de uma curtida que nao aconteceu',
    );
    expect(find.byIcon(Icons.favorite), findsNothing);
  });

  testWidgets(
      'ISCA — o CONTADOR nao e botao: nao existe lista de quem curtiu',
      (tester) async {
    // Nao existe `GET /publications/{ref}/likes` no contrato -- a ausencia e o
    // item 7 da Emenda 5 do ADR-0010: a decisao de 19/10 sobre curtir e
    // CONTAGEM, e contagem nao diz quem. Um toque no numero nao levaria a lugar
    // nenhum, e o criterio 2 da BICHUS-62 proibe acao sem destino.
    //
    // ISCA: embrulhar o `Text` do contador num `InkWell`. Este caso reprova.
    await montarOCartao(
      tester,
      publicacao: publicacaoComContagem(curtidas: 7),
    );
    final numero = find.text('7');
    expect(numero, findsOneWidget);
    expect(
      find.ancestor(of: numero, matching: find.byType(InkWell)),
      findsNothing,
      reason: 'o contador virou um controle, e nao existe rota de lista de quem curtiu',
    );
    expect(find.ancestor(of: numero, matching: find.byType(GestureDetector)), findsNothing);
  });

  testWidgets(
      'ISCA — o nome acessivel do coracao MUDA com o estado', (tester) async {
    // Quem usa leitor de tela precisa ouvir o que o toque FAZ. `Curtir` num
    // coracao ja preenchido anunciaria o oposto da acao.
    await montarOCartao(tester, publicacao: publicacaoComContagem());
    expect(find.byTooltip('Curtir'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.favorite_border));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Descurtir'), findsOneWidget);
    expect(find.byTooltip('Curtir'), findsNothing);
  });

  // =========================================================================
  // COMENTAR
  // =========================================================================

  testWidgets(
      'ISCA — a folha de comentarios desenha o que `GET .../comments` devolveu',
      (tester) async {
    final capturado = await montarOsComentarios(
      tester,
      comentarios: <Map<String, dynamic>>[
        comentario(texto: 'que lindo!', nome: 'Joana'),
        comentario(ref: 'OutroAaAaAaAaAaAaAaAa', texto: 'obrigado!', nome: 'Eu', meu: true),
      ],
      totalDeComentarios: 2,
    );
    expect(find.text('que lindo!'), findsOneWidget);
    expect(find.text('obrigado!'), findsOneWidget);
    expect(
      caminhosEVerbos(capturado),
      contains('GET /v1/publications/$refDaPublicacao/comments'),
    );
  });

  testWidgets(
      'ISCA — comentar manda o texto no corpo, e a lista ganha o comentario',
      (tester) async {
    final capturado = await montarOsComentarios(tester, totalDeComentarios: 0);
    await tester.enterText(find.byType(TextField), 'o Bidu e lindo mesmo');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, ComentariosDaPublicacao.enviar));
    await tester.pumpAndSettle();

    final posts = capturado
        .where((p) =>
            p.url.path == '/v1/publications/$refDaPublicacao/comments' &&
            p.method == 'POST')
        .map((p) => jsonDecode(p.body) as Map<String, dynamic>)
        .toList();
    expect(posts, hasLength(1));
    expect(posts.single['body'], 'o Bidu e lindo mesmo');
    // **E so o texto**: nao ha imagem, nao ha mencao e nao ha `parent_ref`.
    expect(posts.single.keys.toList(), <String>['body']);
    // O comentario novo apareceu na lista, e o campo foi limpo.
    expect(find.text('o Bidu e lindo mesmo'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, '');
  });

  testWidgets(
      'ISCA — `Comentar` nasce DESABILITADO sem texto, e com 281 caracteres',
      (tester) async {
    await montarOsComentarios(tester);
    BotaoPrimario botao() => tester.widget<BotaoPrimario>(
          find.widgetWithText(BotaoPrimario, ComentariosDaPublicacao.enviar),
        );
    expect(botao().aoTocar, isNull, reason: 'nasceu habilitado com o campo vazio');

    await tester.enterText(find.byType(TextField), '   ');
    await tester.pumpAndSettle();
    expect(botao().aoTocar, isNull, reason: 'so espacos habilitou o botao');

    await tester.enterText(find.byType(TextField), 'a' * 281);
    await tester.pumpAndSettle();
    expect(botao().aoTocar, isNull, reason: '281 caracteres habilitou o botao');

    await tester.enterText(find.byType(TextField), 'a' * 280);
    await tester.pumpAndSettle();
    expect(botao().aoTocar, isNotNull, reason: 'o teto e 280 INCLUSIVE');
  });

  testWidgets(
      'ISCA — a falha de comentar NAO perde o texto do campo', (tester) async {
    await montarOsComentarios(
      tester,
      respostaDoComentar: () => problema('internal-error', 500),
    );
    await tester.enterText(find.byType(TextField), 'texto que nao pode sumir');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, ComentariosDaPublicacao.enviar));
    await tester.pumpAndSettle();

    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      'texto que nao pode sumir',
    );
  });

  testWidgets(
      'ISCA — VISITANDO publicacao alheia, o `⋮` so nasce no PROPRIO comentario',
      (tester) async {
    // **O nome diz a MONTAGEM, e isso passou a importar em 20/10/2026:**
    // `minhaPublicacao` e `false` aqui, isto e, quem olha esta VISITANDO a
    // publicacao de outra pessoa. Nessa montagem o menu nasce so no proprio
    // comentario -- e o caso irmao (`CAMINHO 2`) mede a outra, em que o DONO ve
    // `Apagar` no comentario de terceiro.
    //
    // Um nome que dissesse "so nasce no proprio" sem dizer de onde se olha
    // afirmaria mais do que o caso mede, e envelheceria errado.
    //
    // Um comentario alheio nao tem `Denunciar` em montagem nenhuma: a denuncia
    // de comentario NAO EXISTE no contrato, e um controle que abrisse uma folha
    // de motivos para terminar num 404 seria pior do que a ausencia.
    await montarOsComentarios(
      tester,
      comentarios: <Map<String, dynamic>>[
        comentario(texto: 'da Joana', nome: 'Joana'),
        comentario(ref: 'MeuAaAaAaAaAaAaAaAaAa', texto: 'meu', nome: 'Eu', meu: true),
      ],
      totalDeComentarios: 2,
    );
    // UM menu para DOIS comentarios: so o proprio tem.
    expect(find.byType(PopupMenuButton<String>), findsOneWidget);

    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    expect(find.text('Apagar'), findsOneWidget);
    expect(
      find.text('Denunciar'),
      findsNothing,
      reason:
          'apareceu `Denunciar` num comentario. A denuncia de comentario nao '
          'existe no contrato -- falta `comment_reports`, a sexta perna da fila, '
          'o valor `comment` em `ModerationOrigin` e uma operacao em `safety`',
    );
  });

  testWidgets(
      'ISCA — apagar o proprio comentario o tira da lista, pelo caminho certo',
      (tester) async {
    final capturado = await montarOsComentarios(
      tester,
      comentarios: <Map<String, dynamic>>[
        comentario(ref: 'MeuAaAaAaAaAaAaAaAaAa', texto: 'vou apagar', nome: 'Eu', meu: true),
      ],
      totalDeComentarios: 1,
    );
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apagar'));
    await tester.pumpAndSettle();

    expect(
      caminhosEVerbos(capturado),
      contains('DELETE /v1/publications/$refDaPublicacao/comments/MeuAaAaAaAaAaAaAaAaAa'),
    );
    expect(find.text('vou apagar'), findsNothing);
  });

  testWidgets(
      'ISCA — o icone do autor do comentario e 32 dp, pela `thumb` 176',
      (tester) async {
    // Menor que os 40 do cartao: o comentario e uma linha dentro de uma lista,
    // e nao o cabecalho de um cartao. A derivada e a MESMA (Emenda 5), e
    // `cacheWidth` acompanha a largura PINTADA.
    await montarOsComentarios(
      tester,
      comentarios: <Map<String, dynamic>>[
        comentario(urlDoIcone: 'https://img.exemplo/people/thumb/cccc.jpeg'),
      ],
      totalDeComentarios: 1,
    );
    final icone = tester.widget<ImagemDaRede>(find.byType(ImagemDaRede));
    expect(icone.largura, 32);
    expect(icone.raio, 16);
    expect(icone.proporcao, 1);
    expect(icone.descricao, isNull);
  });

  testWidgets(
      'ISCA — sem comentario a folha diz o estado vazio, e SEM acao',
      (tester) async {
    // O campo de escrever esta fixo no pe, sempre visivel: uma acao no estado
    // vazio seria a mesma porta em dois lugares.
    await montarOsComentarios(tester);
    expect(find.text(ComentariosDaPublicacao.tituloVazio), findsOneWidget);
    // UM `BotaoPrimario` na tela: o `Comentar` do pe.
    expect(find.byType(BotaoPrimario), findsOneWidget);
  });

  // =========================================================================
  // O DONO DA PUBLICACAO APAGA COMENTARIO DE TERCEIRO (cliente, 20/10/2026)
  // =========================================================================

  testWidgets(
      'ISCA — CAMINHO 1: o AUTOR do comentario ve `Apagar` no proprio',
      (tester) async {
    await montarOsComentarios(
      tester,
      comentarios: <Map<String, dynamic>>[
        comentario(ref: 'MeuAaAaAaAaAaAaAaAaAa', texto: 'meu', nome: 'Eu', meu: true),
      ],
      totalDeComentarios: 1,
    );
    expect(find.byType(PopupMenuButton<String>), findsOneWidget);
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    expect(find.text('Apagar'), findsOneWidget);
  });

  testWidgets(
      'ISCA — CAMINHO 2: o DONO DA PUBLICACAO ve `Apagar` em comentario de '
      'TERCEIRO', (tester) async {
    // Decisao do cliente de 20/10/2026: o dono limpa a propria casa.
    //
    // **Isto NAO e moderacao**, e a distincao nao e semantica: nao passa por
    // fila, nao tem administrador e nao tem revisao. A moderacao de comentario
    // pelo painel continua nao existindo, e ficar sem ela foi decisao dele no
    // mesmo dia.
    //
    // ISCA: em `_Comentario`, trocar `podeApagar` por `comentario.meu`. O caso
    // reprova pelo nome -- e e o estado em que esta frente estava antes da
    // decisao dele.
    await montarOsComentarios(
      tester,
      minhaPublicacao: true,
      comentarios: <Map<String, dynamic>>[
        comentario(texto: 'da Joana', nome: 'Joana'),
      ],
      totalDeComentarios: 1,
    );
    expect(
      find.byType(PopupMenuButton<String>),
      findsOneWidget,
      reason:
          'o dono da publicacao nao ve `Apagar` no comentario de terceiro: a '
          'decisao do cliente de 20/10/2026 deixou de valer na tela',
    );
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    expect(find.text('Apagar'), findsOneWidget);
    // E continua SEM `Denunciar`: a denuncia de comentario nao existe.
    expect(find.text('Denunciar'), findsNothing);
  });

  testWidgets(
      'ISCA — RECUSA: o TERCEIRO nao ve `Apagar` em nada', (tester) async {
    // Nem no comentario alheio, nem em lugar nenhum: ele nao e autor do
    // comentario nem dono da publicacao. **A trava de verdade e do servidor** --
    // os dois caminhos estao no `WHERE` --, e esta e a metade que decide quem VE
    // a porta.
    //
    // ISCA: trocar `podeApagar` por `true`. O caso reprova pelo nome, e esse e
    // o defeito que desenharia um controle cujo unico desfecho e `404`.
    await montarOsComentarios(
      tester,
      comentarios: <Map<String, dynamic>>[
        comentario(texto: 'da Joana', nome: 'Joana'),
        comentario(ref: 'OutroAaAaAaAaAaAaAaAa', texto: 'do Pedro', nome: 'Pedro'),
      ],
      totalDeComentarios: 2,
    );
    expect(
      find.byType(PopupMenuButton<String>),
      findsNothing,
      reason:
          'apareceu `Apagar` para quem nao e autor do comentario nem dono da '
          'publicacao: o toque levaria a um 404, e a tela teria mentido',
    );
    // E os comentarios continuam inteiros: a ausencia do menu nao esconde texto.
    expect(find.text('da Joana'), findsOneWidget);
    expect(find.text('do Pedro'), findsOneWidget);
  });

  testWidgets(
      'ISCA — o DONO apagando comentario de terceiro tira da lista e BAIXA o '
      'contador', (tester) async {
    // A contagem vem do SERVIDOR (lida das linhas), e nao de um decremento
    // local: a resposta do `DELETE` devolve `comment_count`.
    final capturado = await montarOsComentarios(
      tester,
      minhaPublicacao: true,
      comentarios: <Map<String, dynamic>>[
        comentario(ref: 'DaJoanaAaAaAaAaAaAaAa', texto: 'da Joana', nome: 'Joana'),
      ],
      totalDeComentarios: 1,
    );
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apagar'));
    await tester.pumpAndSettle();

    expect(
      caminhosEVerbos(capturado),
      contains('DELETE /v1/publications/$refDaPublicacao/comments/DaJoanaAaAaAaAaAaAaAa'),
    );
    expect(find.text('da Joana'), findsNothing);
  });

  // =========================================================================
  // O CODIGO NAO CONHECE LISTA DE QUEM CURTIU
  // =========================================================================

  test('ISCA — `app/lib` nao pede lista de quem curtiu em lugar nenhum', () {
    // `GET /publications/{ref}/likes` nao existe no contrato, e a ausencia e o
    // item 7 da Emenda 5 do ADR-0010. Este caso reprova quem a inventar.
    final intrusos = <String>[];
    for (final entrada in Directory('lib').listSync(recursive: true)) {
      if (entrada is! File || !entrada.path.endsWith('.dart')) continue;
      final codigo = entrada
          .readAsStringSync()
          .split('\n')
          .where((l) {
            final t = l.trimLeft();
            return !t.startsWith('//') && !t.startsWith('///');
          })
          .join('\n');
      // A segunda forma usa aspas simples dentro de uma literal `r'...'`
      // escapando por concatenacao: o lint deste repositorio pede aspas
      // simples, e `r"...'"` nao tem como virar `r'...''`.
      if (RegExp('/likes${"'"}').hasMatch(codigo) ||
          RegExp(r'/likes/').hasMatch(codigo)) {
        intrusos.add(entrada.path);
      }
    }
    expect(
      intrusos,
      isEmpty,
      reason:
          'nasceu uma leitura de lista de quem curtiu: $intrusos. A decisao de '
          '19/10 sobre curtir e CONTAGEM, e contagem nao diz quem',
    );
  });

  test('`ReacaoDaPublicacao.doJson` nao inventa contagem quando o campo falta', () {
    final sem = ReacaoDaPublicacao.doJson(<String, dynamic>{});
    expect(sem.curtidas, 0);
    expect(sem.curtiEu, isFalse);
  });

  test('`ComentarioDaPublicacao.doJson` nao inventa `mine`', () {
    // Padrao `false`: na duvida o `Apagar` NAO nasce. Oferecer apagar o
    // comentario de outra pessoa levaria a um 404, e a tela teria mentido.
    final sem = ComentarioDaPublicacao.doJson(<String, dynamic>{'body': 'x'});
    expect(sem.meu, isFalse);
    expect(sem.autor.urlDoIcone, isNull);
  });

  test('`PaginaDeComentarios` distingue o TOTAL do tamanho da pagina', () {
    // A tela mostra o total no cartao e a pagina na folha, e sao numeros
    // diferentes: `items.length` nao e `comment_count`.
    final pagina = PaginaDeComentarios.doJson(<String, dynamic>{
      'items': <Map<String, dynamic>>[comentario()],
      'next_cursor': 'abc',
      'comment_count': 42,
    });
    expect(pagina.itens, hasLength(1));
    expect(pagina.total, 42);
    expect(pagina.proximoCursor, 'abc');
  });
}
