// AS ISCAS da caixa de notificacoes (BICHUS-278, 18/10/2026).
//
// Cada grupo aqui e um PAR: a isca e o contrapeso. A isca prova que o defeito
// reprova; o contrapeso prova que o caso nao esta verde por vazio -- que a
// tela de fato desenha o caminho bom. Um arquivo com so a metade da isca
// passaria igual se a tela nao renderizasse nada.
//
// Os seis pares, e o que cada um pega:
//
//   (a) abrir a caixa chama `POST /seen` UMA vez e as linhas continuam
//       `Não lido` -- abrir a lista zera o numero e nao marca nada
//       contrapeso: a linha que o servidor manda com `read: true` aparece
//       como `Lido`, entao o rotulo nao esta preso em um dos dois
//   (b) o toque na linha chama `POST /{ref}/read` com o `ref` DAQUELA linha
//       contrapeso: sem toque nenhum, nenhuma marcacao de item acontece
//   (c) `Marcar todas como lidas` chama `POST /read-all`
//       contrapeso: sem o toque no botao, `read-all` nao e chamado
//   (d) `grouped_count: 3` mostra quantos avisos a linha resume
//       contrapeso: `tag_scanned` com `grouped_count: 1` nao mostra resumo
//       nenhum -- os dois tipos que nunca agrupam nao ganham rotulo de grupo
//   (e) nenhum identificador interno sai na tela nem em rotulo de semantica
//       contrapeso: o assunto que o servidor mandou APARECE
//   (f) a listagem que falha mostra a faixa com `Tentar de novo`, e NAO a
//       caixa vazia
//       contrapeso: a caixa de verdade vazia mostra a frase do vazio e
//       nenhuma faixa de erro
//   (g) o "x" chama `POST /{ref}/dismiss` com o `ref` DAQUELA linha, a linha
//       SAI da lista, e `read` NAO e chamado -- dispensar nao e ler
//       contrapeso: sem o toque no "x", `dismiss` nao e chamado de jeito
//       nenhum
//   (h) o outro sentido: o toque no CORPO chama `read` e NAO chama `dismiss`,
//       e a linha FICA na lista dizendo `Lido`
//   (i) o "x" que FALHA deixa a linha na lista e mostra a faixa -- a tela nao
//       afirma o que o servidor nao confirmou
//   (j) o toque numa linha COM destino marca como lido E NAVEGA para o
//       endereco que a porta da
//       contrapeso: a linha SEM destino marca como lido e NAO navega -- e o
//       `mostrarNoApp` de `match_suggested`, e nenhuma navegacao e tentada
//       com referencia nula
//
// A rede e sempre um `MockClient` explicito, e o caminho atravessado e o de
// verdade: tela -> `NotificacoesApi` -> `ApiClient` -> traducao de `Problem`.
// Nenhum caso usa um duble de tela que responda por conta propria, que e a
// forma de "o duble recusou" que este repositorio ja pagou tres vezes.
//
// Todo esperado esta escrito por extenso, com acento: nenhum `expect` compara
// o texto renderizado com a constante que o produz.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/notificacoes_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/notificacoes/caixa_de_notificacoes.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// ---------------------------------------------------------------------------
// OS REFS. Sao OPACOS e NAO sao UUID, como o contrato manda (ADR-0010): 20 a
// 32 caracteres de `^[A-Za-z0-9_-]+$`. A isca (e) procura por eles na tela.
// ---------------------------------------------------------------------------

const String refDaPlaquinha = 'avi_8Hk3Lm9Qr2Tv5Xz7Bd1Cf';
const String refDoEncontro = 'avi_4Nj6Pq8St0Uw2Yx4Ac6Ee';

/// Um UUID de verdade, para a isca (e) provar que **nenhum** identificador
/// interno escapa -- nem o opaco do contrato, nem um UUID que alguem venha a
/// pintar na linha um dia.
const String uuidQueNaoPodeAparecer = '0192f3a1-7b2c-7def-8a01-000000000001';

const String caminhoDaLista = '/v1/me/notifications';
const String caminhoDoVisto = '/v1/me/notifications/seen';
const String caminhoDeTodas = '/v1/me/notifications/read-all';

String caminhoDoLido(String ref) => '/v1/me/notifications/$ref/read';

String caminhoDoDispensado(String ref) =>
    '/v1/me/notifications/$ref/dismiss';

// ---------------------------------------------------------------------------
// FIXTURES, campo por campo do contrato
// ---------------------------------------------------------------------------

/// Um `NotificationItem` do contrato.
Map<String, dynamic> aviso({
  String ref = refDaPlaquinha,
  String tipo = 'tag_scanned',
  String? assunto = 'Tobias',
  String aconteceuEm = '2026-10-18T13:52:00.000Z',
  bool lido = false,
  int agrupados = 1,
  String? destino,
  String? destinoRef,
}) => <String, dynamic>{
  'ref': ref,
  'kind': tipo,
  'subject': assunto,
  'occurred_at': aconteceuEm,
  'read': lido,
  'grouped_count': agrupados,
  // **Os dois saem SEMPRE, nulos por padrao.** O contrato os declara sempre
  // presentes e anulaveis, e a fixture espelha isso: um corpo que os omitisse
  // mediria um servidor que este contrato nao descreve.
  'destination': destino,
  'destination_ref': destinoRef,
};

/// Um `NotificationPage` do contrato.
Map<String, dynamic> paginaDaCaixa(
  List<Map<String, dynamic>> itens, {
  int pagina = 1,
  int tamanho = 30,
  int? total,
  int naoLidos = 0,
}) => <String, dynamic>{
  'items': itens,
  'page': pagina,
  'limit': tamanho,
  'total': total ?? itens.length,
  'unread_total': naoLidos,
};

http.Response json200(Map<String, dynamic> corpo, {int status = 200}) =>
    http.Response(
      jsonEncode(corpo),
      status,
      headers: const <String, String>{
        'content-type': 'application/json; charset=utf-8',
      },
    );

/// O `204` das duas marcacoes, que respondem sem corpo.
http.Response semConteudo() => http.Response('', 204);

/// Um `Problem` do contrato.
///
/// O `title` e **deliberadamente enganoso**: se a tela passar a decidir pelo
/// texto do servidor em vez do `type`, o caso reprova.
http.Response problema(String slug, int status) => http.Response(
  jsonEncode(<String, dynamic>{
    'type': 'https://api.bichu.app/problems/$slug',
    'title': 'Nao foi possivel concluir',
    'status': status,
  }),
  status,
  headers: const <String, String>{
    'content-type': 'application/problem+json; charset=utf-8',
  },
);

// ---------------------------------------------------------------------------
// A BANCADA
// ---------------------------------------------------------------------------

/// O servidor de teste: rotas por `METODO /caminho`, e o registro das chamadas.
class ServidorDaCaixa {
  ServidorDaCaixa(this.respostas);

  final Map<String, http.Response Function(http.Request)> respostas;

  final List<http.Request> chamadas = <http.Request>[];

  List<http.Request> chamadasA(String metodoECaminho) => chamadas
      .where((r) => '${r.method} ${r.url.path}' == metodoECaminho)
      .toList();

  Future<http.Response> call(http.Request req) async {
    chamadas.add(req);
    final chave = '${req.method} ${req.url.path}';
    final resposta = respostas[chave];
    // O PADRAO E 404, e nao 200 vazio: e o que o servidor responde para aviso
    // que nao e do chamador (ADR-0021), e e o que mantem um stub que falta
    // RUIDOSO. Um 200 vazio aqui deixaria caso verde pelo motivo errado.
    if (resposta == null) return problema('not-found', 404);
    return resposta(req);
  }
}

NotificacoesApi apiDe(ServidorDaCaixa servidor) {
  AppConfig.limparParaTeste();
  return NotificacoesApi(
    ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'https://api.teste.bichu'),
      cliente: MockClient(servidor.call),
      tokenDeAcesso: () async => 'token-de-teste',
    ),
  );
}

/// Monta a caixa com um roteador de verdade, no endereco que ela exporta.
///
/// O roteador existe porque a tela e **irma da casca de abas** e carrega a
/// propria saida: montar o widget nu esconderia que `BarraDeConta` depende de
/// um `GoRouter` para saber se ha o que desempilhar.
Future<void> abrirACaixa(
  WidgetTester tester, {
  required ServidorDaCaixa servidor,
}) async {
  final api = apiDe(servidor);
  final roteador = GoRouter(
    initialLocation: RotasDaCaixa.caixa,
    routes: <RouteBase>[
      GoRoute(
        path: RotasDaCaixa.caixa,
        builder: (context, estado) => CaixaDeNotificacoes(notificacoes: api),
      ),
    ],
  );
  addTearDown(roteador.dispose);
  await tester.pumpWidget(
    MaterialApp.router(theme: BichuTheme.claro, routerConfig: roteador),
  );
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

/// Todo rotulo de semantica da tela: e saida tambem, e o ADR-0010 vale nela.
///
/// Le os `Semantics` da arvore de widgets, e nao a arvore de semantica
/// compilada: e nos `Semantics` que uma tela escreve os rotulos dela, e e por
/// um deles que um identificador escaparia. Junta `tooltip` tambem, que e o
/// rotulo acessivel do botao de sair.
String semanticaDaTela(WidgetTester tester) {
  final partes = <String>[];
  for (final e in find.byType(Semantics).evaluate()) {
    final s = e.widget as Semantics;
    final p = s.properties;
    partes.addAll(<String>[
      p.label ?? '',
      p.value ?? '',
      p.hint ?? '',
      p.tooltip ?? '',
    ]);
  }
  for (final e in find.byType(Tooltip).evaluate()) {
    partes.add((e.widget as Tooltip).message ?? '');
  }
  return partes.join('\n');
}

/// As rotas do caminho felizes: a pagina pedida, o `seen` e as duas marcacoes.
Map<String, http.Response Function(http.Request)> rotasDe(
  Map<String, dynamic> pagina, {
  List<String> refsQueMarcam = const <String>[refDaPlaquinha],
  List<String> refsQueDispensam = const <String>[refDaPlaquinha],
}) => <String, http.Response Function(http.Request)>{
  'GET $caminhoDaLista': (_) => json200(pagina),
  'POST $caminhoDoVisto': (_) => semConteudo(),
  'POST $caminhoDeTodas': (_) => json200(<String, dynamic>{'marked': 2}),
  for (final ref in refsQueMarcam)
    'POST ${caminhoDoLido(ref)}': (_) => semConteudo(),
  for (final ref in refsQueDispensam)
    'POST ${caminhoDoDispensado(ref)}': (_) => semConteudo(),
};

/// O "x" da linha de [ref].
///
/// Por `ValueKey`, e nao por `find.byTooltip`: toda linha tem um "x" com o
/// MESMO rotulo acessivel -- que e o certo para quem usa leitor de tela --, e
/// um localizador por texto acharia varios. A chave de widget nao e saida: ela
/// nao vai para `Text` nem para a arvore de semantica, e e por isso que ela
/// pode carregar o `ref` enquanto o `tooltip` nao pode (ADR-0010).
Finder fecharDaLinha(String ref) => find.byKey(ValueKey<String>('fechar:$ref'));

void main() {
  // -------------------------------------------------------------------------
  group('(a) abrir a caixa zera o numero e NAO marca os itens', () {
    testWidgets(
      'ISCA: abrir chama `POST /seen` uma vez so, nao marca item nenhum, e as '
      'linhas continuam nao lidas',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(ref: refDaPlaquinha, assunto: 'Tobias'),
              aviso(
                ref: refDoEncontro,
                tipo: 'event_cancelled',
                assunto: 'Encontro no parque',
              ),
            ], naoLidos: 2),
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          servidor.chamadasA('POST $caminhoDoVisto').length,
          1,
          reason: 'REPROVA: abrir a caixa precisa chamar '
              '`markNotificationsListSeen` exatamente uma vez -- e ela que '
              'zera o numero do sino. Zero chamadas deixa o sino aceso para '
              'sempre; duas sao a mesma abertura contada em dobro.',
        );
        expect(
          servidor.chamadasA('POST ${caminhoDoLido(refDaPlaquinha)}'),
          isEmpty,
          reason: 'REPROVA: abrir a lista NAO pode marcar item nenhum como '
              'lido. `Lido` e o item aberto, e nao a lista vista.',
        );
        expect(
          servidor.chamadasA('POST $caminhoDeTodas'),
          isEmpty,
          reason: 'REPROVA: abrir a caixa nao pode chamar '
              '`markAllNotificationsRead` -- aquilo e acao explicita de quem '
              'toca no botao.',
        );

        final texto = textoDaTela(tester);
        expect(
          texto,
          contains('Não lido'),
          reason: 'REPROVA: as linhas precisam continuar aparecendo como nao '
              'lidas depois de abrir a caixa. O numero caiu; os itens nao '
              'foram abertos.',
        );
        expect(
          texto,
          isNot(contains('Lido ·')),
          reason: 'REPROVA: nenhuma linha pode aparecer como lida depois de '
              'so abrir a caixa.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: a linha que o servidor manda com `read: true` aparece como '
      'lida',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(assunto: 'Tobias', lido: true),
            ]),
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        final texto = textoDaTela(tester);
        expect(
          texto,
          contains('Lido'),
          reason: 'REPROVA: o rotulo de estado nao pode estar preso em "nao '
              'lido" -- item que o servidor diz aberto aparece como lido. Sem '
              'este caso, a isca (a) passaria com uma tela que nunca escreve '
              '"Lido".',
        );
        expect(
          texto,
          isNot(contains('Não lido')),
          reason: 'REPROVA: a linha lida nao pode dizer as duas coisas.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(b) o toque na linha marca AQUELE item', () {
    testWidgets(
      'ISCA: tocar na linha chama `POST /{ref}/read` com o ref daquela linha',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(ref: refDaPlaquinha, assunto: 'Tobias'),
              aviso(
                ref: refDoEncontro,
                tipo: 'event_cancelled',
                assunto: 'Encontro no parque',
              ),
            ], naoLidos: 2),
            refsQueMarcam: const <String>[refDaPlaquinha, refDoEncontro],
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        await tester.tap(find.text('Encontro no parque'));
        await tester.pumpAndSettle();

        expect(
          servidor.chamadasA('POST ${caminhoDoLido(refDoEncontro)}').length,
          1,
          reason: 'REPROVA: o toque na linha precisa chamar '
              '`markNotificationRead` com o `ref` DAQUELA linha. E assim que '
              '"lido e o item aberto" existe de verdade.',
        );
        expect(
          servidor.chamadasA('POST ${caminhoDoLido(refDaPlaquinha)}'),
          isEmpty,
          reason: 'REPROVA: tocar numa linha nao pode marcar a outra -- o '
              '`ref` enviado precisa ser o da linha tocada, e nao o do '
              'primeiro item da pagina.',
        );
        expect(
          textoDaTela(tester),
          contains('Lido'),
          reason: 'REPROVA: depois do `204` a linha tocada precisa dizer que '
              'foi lida; o servidor confirmou aquele item.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: sem toque nenhum, nenhuma marcacao de item sai da tela',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(
                ref: refDoEncontro,
                tipo: 'event_cancelled',
                assunto: 'Encontro no parque',
              ),
            ], naoLidos: 1),
            refsQueMarcam: const <String>[refDoEncontro],
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          servidor.chamadasA('POST ${caminhoDoLido(refDoEncontro)}'),
          isEmpty,
          reason: 'REPROVA: a marcacao de item precisa vir DO TOQUE. Se ela '
              'sai so por desenhar a linha, a isca (b) passa e o requisito '
              '"abrir a lista nao marca os itens" esta quebrado.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(c) a acao explicita de marcar todas', () {
    testWidgets(
      'ISCA: `Marcar todas como lidas` chama `POST /read-all`',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(assunto: 'Tobias'),
            ], naoLidos: 1),
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          find.text('Marcar todas como lidas'),
          findsOneWidget,
          reason: 'REPROVA: a caixa precisa ter a acao explicita de marcar '
              'todas. Sem ela nao ha como limpar de verdade uma caixa grande, '
              'porque abrir a lista so derruba o numero.',
        );

        await tester.tap(find.text('Marcar todas como lidas'));
        await tester.pumpAndSettle();

        expect(
          servidor.chamadasA('POST $caminhoDeTodas').length,
          1,
          reason: 'REPROVA: o botao precisa chamar '
              '`markAllNotificationsRead` exatamente uma vez.',
        );
        expect(
          textoDaTela(tester),
          contains('Lido'),
          reason: 'REPROVA: depois de marcar todas, as linhas carregadas '
              'precisam dizer que foram lidas.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: sem o toque no botao, `read-all` nao e chamado',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(assunto: 'Tobias'),
            ], naoLidos: 1),
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          servidor.chamadasA('POST $caminhoDeTodas'),
          isEmpty,
          reason: 'REPROVA: `markAllNotificationsRead` precisa sair do toque '
              'no botao, e nao de desenhar a tela. Se ela sai sozinha, abrir '
              'a caixa marcaria tudo como lido -- o contrario do requisito.',
        );
        expect(
          textoDaTela(tester),
          contains('Não lido'),
          reason: 'REPROVA: sem o toque, a linha segue nao lida.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(d) agrupamento: a linha diz quantos avisos ela resume', () {
    testWidgets(
      'ISCA: `grouped_count: 3` mostra o numero de avisos resumidos',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(
                ref: refDoEncontro,
                tipo: 'neighborhood_alert',
                assunto: 'Vila Mariana',
                agrupados: 3,
              ),
            ], naoLidos: 3),
            refsQueMarcam: const <String>[refDoEncontro],
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          textoDaTela(tester),
          contains('Resume 3 avisos'),
          reason: 'REPROVA: a linha agrupada precisa dizer QUANTOS avisos ela '
              'resume. Sem o numero, tres avisos de bairro viram um e dois '
              'desaparecem sem ninguem saber.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: `tag_scanned` com `grouped_count: 1` nao mostra resumo '
      'nenhum',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(assunto: 'Tobias'),
            ], naoLidos: 1),
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        final texto = textoDaTela(tester);
        expect(
          texto,
          isNot(contains('Resume')),
          reason: 'REPROVA: `tag_scanned` e `found_reported` nunca agrupam, e '
              'linha de um aviso so nao pode ganhar rotulo de grupo -- '
              '"Resume 1 aviso" estaria em quase toda linha da caixa e nao '
              'distinguiria nada.',
        );
        expect(
          texto,
          contains('Plaquinha lida'),
          reason: 'REPROVA: o contrapeso precisa provar que a linha FOI '
              'desenhada; sem isto ele passaria com a tela em branco.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(e) nenhum identificador interno na tela nem na semantica', () {
    testWidgets(
      'ISCA: o `ref` do aviso nao aparece em texto nem em rotulo de semantica',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(ref: refDaPlaquinha, assunto: 'Tobias'),
              aviso(
                ref: refDoEncontro,
                tipo: 'event_join_requested',
                assunto: 'Encontro no parque',
                agrupados: 2,
              ),
            ], naoLidos: 3),
            refsQueMarcam: const <String>[refDaPlaquinha, refDoEncontro],
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        final texto = textoDaTela(tester);
        final semantica = semanticaDaTela(tester);

        for (final ref in <String>[refDaPlaquinha, refDoEncontro]) {
          expect(
            texto,
            isNot(contains(ref)),
            reason: 'REPROVA: o `ref` e identificador opaco e nao e texto de '
                'tela. Ele vai no caminho de `markNotificationRead`, e em '
                'nenhum outro lugar.',
          );
          expect(
            semantica,
            isNot(contains(ref)),
            reason: 'REPROVA: rotulo de leitor de tela TAMBEM e saida '
                '(ADR-0010). Um `ref` num `Semantics` escapa sem aparecer em '
                'nenhuma captura de tela.',
          );
        }

        final padraoDeUuid = RegExp(
          r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
          r'[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
        );
        expect(
          padraoDeUuid.hasMatch(texto),
          isFalse,
          reason: 'REPROVA: nenhum UUID pode aparecer na caixa. '
              '$uuidQueNaoPodeAparecer e o formato que esta tela nunca deve '
              'pintar.',
        );
        expect(
          padraoDeUuid.hasMatch(semantica),
          isFalse,
          reason: 'REPROVA: nenhum UUID pode aparecer em rotulo de semantica '
              'da caixa.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: o assunto que o servidor mandou APARECE na linha',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(assunto: 'Tobias'),
            ], naoLidos: 1),
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          textoDaTela(tester),
          contains('Tobias'),
          reason: 'REPROVA: o assunto vem pronto do servidor e e o que a '
              'linha e sobre. Sem este caso, a isca (e) passaria com uma tela '
              'que nao mostra nada -- "nenhum id na tela" e trivial numa tela '
              'vazia.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(f) a listagem que falha nao vira caixa vazia', () {
    testWidgets(
      'ISCA: a lista que falha mostra a faixa com `Tentar de novo`, e nao a '
      'frase do vazio',
      (tester) async {
        final servidor = ServidorDaCaixa(
          <String, http.Response Function(http.Request)>{
            'GET $caminhoDaLista': (_) => problema('internal-error', 500),
            'POST $caminhoDoVisto': (_) => semConteudo(),
          },
        );
        await abrirACaixa(tester, servidor: servidor);

        final texto = textoDaTela(tester);
        expect(
          texto,
          contains(
            'O Bichu está fora do ar por alguns minutos. Já estamos arrumando.',
          ),
          reason: 'REPROVA: a falha da listagem precisa dizer que nao deu para '
              'perguntar.',
        );
        expect(
          texto,
          contains('Tentar de novo'),
          reason: 'REPROVA: a faixa de falha precisa oferecer a saida -- '
              'falha sem acao e beco sem saida.',
        );
        expect(
          texto,
          isNot(contains('Você ainda não tem avisos.')),
          reason: 'REPROVA: falha NAO pode virar caixa vazia. Dizer "você '
              'ainda não tem avisos" a quem tem trinta e o estado vazio que '
              'parece sucesso.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: a caixa de verdade vazia mostra a frase do vazio e nenhuma '
      'faixa de erro',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(paginaDaCaixa(const <Map<String, dynamic>>[])),
        );
        await abrirACaixa(tester, servidor: servidor);

        final texto = textoDaTela(tester);
        expect(
          texto,
          contains('Você ainda não tem avisos.'),
          reason: 'REPROVA: caixa vazia nao fica em branco -- lista vazia sem '
              'nada e a tela que parece quebrada.',
        );
        expect(
          texto,
          isNot(contains('Tentar de novo')),
          reason: 'REPROVA: caixa vazia nao e falha, e nao pode mostrar a '
              'faixa de erro. Sem este caso, a isca (f) passaria com uma tela '
              'que grita falha o tempo todo.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('o padrao de listagem desta tela', () {
    testWidgets('ISCA: o arrasto para baixo REFAZ a busca', (tester) async {
      // =====================================================================
      // **ESTE CASO ERA O CONTRARIO ATE 18/10/2026, e a virada e do
      // cliente.** Ele dizia, com estas palavras: *"REPROVA: este app nao
      // tem puxar-para-atualizar em lugar nenhum, e nao e nesta tela que
      // ele nasce"*. A frase era verdadeira quando foi escrita.
      //
      // O cliente mandou o gesto para o app inteiro: *"Crie uma acao no
      // aplicativo de atualizar a pagina conforme o usuario puxa a pagina
      // para baixo"*. Quem ler este arquivo e achar que a regra antiga foi
      // quebrada por descuido esta lendo o commit errado.
      //
      // **A assercao e na BUSCA e nao no indicador.**
      // `find.byType(RefreshIndicator)` ficaria verde com `onRefresh`
      // vazio, com a fisica errada e com a busca nula -- a roda giraria e
      // nada seria perguntado ao servidor. Contar chamadas a
      // `GET $caminhoDaLista` e a unica afirmacao que nao sobrevive a isso.
      //
      // DESLIGAR: em `lib/telas/notificacoes/caixa_de_notificacoes.dart`,
      // troque `ArrastarParaAtualizar(aoAtualizar: _carregar, child:
      // _corpo())` por `_corpo()`. Esperado: este caso reprova dizendo
      // quantas chamadas houve antes e depois do gesto.
      // =====================================================================
      final servidor = ServidorDaCaixa(
        rotasDe(
          paginaDaCaixa(<Map<String, dynamic>>[
            aviso(assunto: 'Tobias'),
          ], naoLidos: 1),
        ),
      );
      await abrirACaixa(tester, servidor: servidor);

      // ANCORA: a caixa carregou. Sem ela, "duas chamadas" poderia ser
      // "duas falhas" em vez de "uma carga e uma recarga".
      expect(
        find.textContaining('Tobias'),
        findsWidgets,
        reason:
            'REPROVA NA ANCORA: a caixa nao desenhou o aviso, e o caso '
            'mediria o arrasto sobre uma tela vazia.',
      );
      final antes = servidor.chamadasA('GET $caminhoDaLista').length;
      expect(
        antes,
        1,
        reason:
            'REPROVA NA ANCORA: abrir a caixa pediu a lista $antes '
            'vezes, e nao uma.',
      );

      // `fling` e nao `drag`: o `RefreshIndicator` so dispara quando o
      // excesso de rolagem passa do limite dele E o gesto termina.
      await tester.fling(
        find.byType(Scrollable).first,
        const Offset(0, 320),
        1200,
      );
      await tester.pumpAndSettle();

      final depois = servidor.chamadasA('GET $caminhoDaLista').length;
      expect(
        depois,
        greaterThan(antes),
        reason:
            'REPROVA: o arrasto para baixo NAO refez a busca. Chamadas '
            'a `GET $caminhoDaLista`: $antes antes do gesto e $depois '
            'depois. Esta tela tem `Scaffold` e `ListView` proprios e '
            'embrulha o proprio corpo com `ArrastarParaAtualizar` -- o '
            'outro caminho do componente, o das cinco raizes de secao, '
            'passa pelo slot da casca e e medido em '
            '`test/widgets/arrastar_para_atualizar_test.dart`. Consertar '
            'um nunca conserta o outro.',
      );
    });

    testWidgets('e continua sem busca, filtro e ordenacao', (tester) async {
      final servidor = ServidorDaCaixa(
        rotasDe(
          paginaDaCaixa(<Map<String, dynamic>>[
            aviso(assunto: 'Tobias'),
          ], naoLidos: 1),
        ),
      );
      await abrirACaixa(tester, servidor: servidor);

      // ANCORA: a tela carregou, e o `findsNothing` abaixo nao e vacuo.
      expect(
        find.textContaining('Tobias'),
        findsWidgets,
        reason: 'REPROVA NA ANCORA: a caixa nao carregou.',
      );
      expect(
        find.byType(TextField),
        findsNothing,
        reason:
            'REPROVA: a caixa nao tem busca. A ordem e uma so, '
            'decrescente, e vem pronta do servidor. **O gesto de atualizar '
            'entrou em 18/10 e nao abriu a porta para o resto do padrao de '
            'listagem**: controle que recorta uma caixa de 90 dias '
            'continua sendo controle sem funcao.',
      );
    });

    testWidgets(
      'CONTRAPESO: a pagina seguinte vem de `Carregar mais`, e o pedido leva a '
      'pagina 2',
      (tester) async {
        final servidor = ServidorDaCaixa(
          <String, http.Response Function(http.Request)>{
            'GET $caminhoDaLista': (req) => json200(
              paginaDaCaixa(
                <Map<String, dynamic>>[
                  aviso(
                    ref: req.url.queryParameters['page'] == '2'
                        ? refDoEncontro
                        : refDaPlaquinha,
                    tipo: req.url.queryParameters['page'] == '2'
                        ? 'event_cancelled'
                        : 'tag_scanned',
                    assunto: req.url.queryParameters['page'] == '2'
                        ? 'Encontro no parque'
                        : 'Tobias',
                  ),
                ],
                pagina: int.parse(req.url.queryParameters['page'] ?? '1'),
                total: 2,
                naoLidos: 2,
              ),
            ),
            'POST $caminhoDoVisto': (_) => semConteudo(),
          },
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          find.text('Carregar mais'),
          findsOneWidget,
          reason: 'REPROVA: com `total` maior que o carregado, o rodape de '
              'paginacao precisa oferecer a pagina seguinte -- sem paginacao '
              'numerada e sem rolagem infinita (design system 11.20).',
        );

        await tester.tap(find.text('Carregar mais'));
        await tester.pumpAndSettle();

        final pedidos = servidor.chamadasA('GET $caminhoDaLista');
        expect(
          pedidos.map((r) => r.url.queryParameters['page']).toList(),
          <String>['1', '2'],
          reason: 'REPROVA: `Carregar mais` precisa pedir a pagina SEGUINTE. '
              'Pedir a 1 de novo mostraria a mesma pagina duas vezes.',
        );
        expect(
          textoDaTela(tester),
          contains('Encontro no parque'),
          reason: 'REPROVA: a pagina 2 precisa ser ACRESCENTADA a lista.',
        );
        expect(
          textoDaTela(tester),
          contains('Tobias'),
          reason: 'REPROVA: a pagina 1 nao pode ser apagada pela chegada da 2.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(g) o "x" DISPENSA a linha, e dispensar nao e ler', () {
    testWidgets(
      'ISCA: o toque no "x" chama `POST /{ref}/dismiss` daquela linha, a linha '
      'SAI da lista, e `read` NAO e chamado',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(ref: refDaPlaquinha, assunto: 'Tobias'),
              aviso(
                ref: refDoEncontro,
                tipo: 'event_cancelled',
                assunto: 'Encontro no parque',
              ),
            ]),
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          textoDaTela(tester),
          contains('Tobias'),
          reason: 'REPROVA: a linha precisa estar na tela ANTES do toque, '
              'senao o resto deste caso passa por vazio.',
        );

        await tester.tap(fecharDaLinha(refDaPlaquinha));
        await tester.pumpAndSettle();

        expect(
          servidor
              .chamadasA('POST ${caminhoDoDispensado(refDaPlaquinha)}')
              .length,
          1,
          reason: 'REPROVA: o "x" precisa chamar `dismissNotification` com o '
              '`ref` DAQUELA linha, uma vez.',
        );
        expect(
          servidor.chamadasA('POST ${caminhoDoDispensado(refDoEncontro)}'),
          isEmpty,
          reason: 'REPROVA: o "x" de uma linha dispensou OUTRA. O `ref` que '
              'vai no caminho e o da linha tocada.',
        );
        expect(
          servidor.chamadasA('POST ${caminhoDoLido(refDaPlaquinha)}'),
          isEmpty,
          reason: 'REPROVA: o "x" marcou o aviso como LIDO. Dispensar tira da '
              'LISTA e ler tira do CONTADOR, e sao dois eixos independentes: '
              'quem fecha uma linha nao esta dizendo que a leu.',
        );
        expect(
          servidor.chamadasA('POST $caminhoDeTodas'),
          isEmpty,
          reason: 'REPROVA: o "x" chamou `marcar todas como lidas`.',
        );
        expect(
          textoDaTela(tester),
          isNot(contains('Tobias')),
          reason: 'REPROVA: a linha dispensada precisa SAIR da lista depois do '
              '`204` -- e isso que "ir limpando a lista" quer dizer.',
        );
        expect(
          textoDaTela(tester),
          contains('Encontro no parque'),
          reason: 'REPROVA: dispensar uma linha apagou a OUTRA. So a linha '
              'tocada sai.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: sem o toque no "x", nada e dispensado e a linha fica',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(ref: refDaPlaquinha, assunto: 'Tobias'),
            ]),
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          servidor
              .chamadasA('POST ${caminhoDoDispensado(refDaPlaquinha)}'),
          isEmpty,
          reason: 'REPROVA: a caixa dispensou um aviso sozinha, sem ninguem '
              'tocar no "x". A isca acima estaria verde por efeito de '
              'abertura.',
        );
        expect(
          textoDaTela(tester),
          contains('Tobias'),
          reason: 'REPROVA: a linha sumiu sem toque nenhum.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(h) o outro sentido: ler nao dispensa', () {
    testWidgets(
      'ISCA: o toque no CORPO da linha chama `read`, NAO chama `dismiss`, e a '
      'linha FICA na lista dizendo `Lido`',
      (tester) async {
        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(ref: refDaPlaquinha, assunto: 'Tobias'),
            ]),
          ),
        );
        await abrirACaixa(tester, servidor: servidor);

        // O toque vai no ASSUNTO, que e corpo da linha e nao o "x".
        await tester.tap(find.text('Tobias'));
        await tester.pumpAndSettle();

        expect(
          servidor.chamadasA('POST ${caminhoDoLido(refDaPlaquinha)}').length,
          1,
          reason: 'REPROVA: o toque no corpo precisa marcar o item como lido.',
        );
        expect(
          servidor
              .chamadasA('POST ${caminhoDoDispensado(refDaPlaquinha)}'),
          isEmpty,
          reason: 'REPROVA: marcar como lida DISPENSOU a linha. Ler deixa a '
              'linha na lista; so o "x" a tira.',
        );
        expect(
          textoDaTela(tester),
          contains('Tobias'),
          reason: 'REPROVA: a linha saiu da lista ao ser marcada como lida. '
              'Ela tem de FICAR, dizendo `Lido`.',
        );
        expect(
          textoDaTela(tester),
          contains('Lido'),
          reason: 'REPROVA: a linha marcada como lida nao passou a dizer '
              '`Lido`.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(i) o "x" que falha nao mente', () {
    testWidgets(
      'ISCA: `dismiss` que responde 404 deixa a linha na lista e mostra a '
      'faixa',
      (tester) async {
        final servidor = ServidorDaCaixa(<String,
            http.Response Function(http.Request)>{
          ...rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(ref: refDaPlaquinha, assunto: 'Tobias'),
            ]),
          ),
          // O 404 de aviso que nao e desta conta (ADR-0021).
          'POST ${caminhoDoDispensado(refDaPlaquinha)}': (_) =>
              problema('not-found', 404),
        });
        await abrirACaixa(tester, servidor: servidor);

        await tester.tap(fecharDaLinha(refDaPlaquinha));
        await tester.pumpAndSettle();

        expect(
          textoDaTela(tester),
          contains('Tobias'),
          reason: 'REPROVA: a linha saiu da lista mesmo sem o servidor '
              'confirmar. A tela nao pode afirmar o que ela nao sabe -- o '
              'aviso voltaria na proxima abertura.',
        );
        expect(
          textoDaTela(tester),
          contains('Não conseguimos fechar este aviso'),
          reason: 'REPROVA: a falha de dispensar precisa de uma faixa que fale '
              'DESTE aviso.',
        );
        expect(
          semanticaDaTela(tester) + textoDaTela(tester),
          isNot(contains(refDaPlaquinha)),
          reason: 'REPROVA: a frase da falha vazou o `ref`. Ela nao pode '
              'confirmar nem negar que aquele `ref` existe (ADR-0021).',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(j) o toque leva ao destino, e sem destino nao leva a lugar nenhum',
      () {
    /// O endereco de mentira do destino, e a tela que o ocupa.
    ///
    /// Endereco PROPRIO desta bancada, e nao uma rota de verdade do app: o que
    /// este par mede e "a caixa empilha o que a porta mandou", e nao o que a
    /// ficha do pet desenha. As rotas de verdade tem isca propria, em
    /// `destino_do_aviso_test.dart`.
    const String enderecoDoDestino = '/destino-de-mentira';
    const String textoDoDestino = 'Cheguei ao destino';

    tearDown(PortaDoDestinoDoAviso.soltar);

    /// Monta a caixa com DUAS rotas: ela e o destino de mentira.
    Future<void> abrirComDestino(
      WidgetTester tester, {
      required ServidorDaCaixa servidor,
    }) async {
      final api = apiDe(servidor);
      final roteador = GoRouter(
        initialLocation: RotasDaCaixa.caixa,
        routes: <RouteBase>[
          GoRoute(
            path: RotasDaCaixa.caixa,
            builder: (context, estado) => CaixaDeNotificacoes(notificacoes: api),
          ),
          GoRoute(
            path: enderecoDoDestino,
            builder: (context, estado) =>
                const Scaffold(body: Text(textoDoDestino)),
          ),
        ],
      );
      addTearDown(roteador.dispose);
      await tester.pumpWidget(
        MaterialApp.router(theme: BichuTheme.claro, routerConfig: roteador),
      );
      await tester.pumpAndSettle();
    }

    testWidgets(
      'ISCA: o toque numa linha COM destino marca como lido E navega',
      (tester) async {
        // A porta devolve o endereco de mentira SO para a linha que tem
        // destino -- e e assim que `rotas.dart` se comporta.
        PortaDoDestinoDoAviso.destino =
            (aviso) => aviso.temDestino ? enderecoDoDestino : null;

        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(
                ref: refDaPlaquinha,
                assunto: 'Tobias',
                destino: 'pet',
                destinoRef: '0192f3a1-7b2c-7def-8a01-000000000001',
              ),
            ]),
          ),
        );
        await abrirComDestino(tester, servidor: servidor);

        expect(
          find.text(textoDoDestino),
          findsNothing,
          reason: 'REPROVA: a tela de destino apareceu ANTES do toque -- o '
              'resto deste caso nao mediria o toque.',
        );

        await tester.tap(find.text('Tobias'));
        await tester.pumpAndSettle();

        expect(
          servidor.chamadasA('POST ${caminhoDoLido(refDaPlaquinha)}').length,
          1,
          reason: 'REPROVA: o toque precisa continuar marcando o item como '
              'lido. Levar ao destino nao substitui a marcacao -- o cliente '
              'pediu as duas coisas.',
        );
        expect(
          find.text(textoDoDestino),
          findsOneWidget,
          reason: 'REPROVA: o toque nao levou ao destino. E o pedido do '
              'cliente: "o link que leva para a acao que foi notificada".',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: a linha SEM destino marca como lido e NAO navega',
      (tester) async {
        // A MESMA porta ligada do caso acima: o que muda e a LINHA, que vem
        // sem destino. Se o caso passasse por a porta estar desligada, ele
        // nao mediria nada.
        PortaDoDestinoDoAviso.destino =
            (aviso) => aviso.temDestino ? enderecoDoDestino : null;

        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              // `match_suggested` como o servidor o manda: sem destino, porque
              // nao existe tela de confirmar candidato neste app.
              aviso(
                ref: refDaPlaquinha,
                tipo: 'match_suggested',
                assunto: 'Pingo',
              ),
            ]),
          ),
        );
        await abrirComDestino(tester, servidor: servidor);

        await tester.tap(find.text('Pingo'));
        await tester.pumpAndSettle();

        expect(
          find.text(textoDoDestino),
          findsNothing,
          reason: 'REPROVA: a linha SEM destino navegou. `match_suggested` nao '
              'tem tela neste app, e toque que leva a tela inexistente e pior '
              'que toque ausente.',
        );
        expect(
          servidor.chamadasA('POST ${caminhoDoLido(refDaPlaquinha)}').length,
          1,
          reason: 'REPROVA: a linha sem destino deixou de marcar como lida. '
              'Ficar onde esta E o `mostrarNoApp`, e nao perder a marcacao.',
        );
        // `textoDaTela` e nao `find.text('Lido')`: o estado da linha vive
        // dentro de um texto JUNTADO (`Lido · 18/10/2026 às 13h52`), e
        // `find.text` exige igualdade exata.
        expect(
          textoDaTela(tester),
          contains('Lido'),
          reason: 'REPROVA: a linha sem destino nao passou a dizer `Lido`. '
              'Sem navegacao, a marcacao e o unico retorno visivel do toque.',
        );
      },
    );

    testWidgets(
      'ISCA: destino sem referencia NAO navega -- nada de `/pets/null`',
      (tester) async {
        // A porta aqui e a de VERDADE, religada: ela e quem recusa o par
        // incompleto. Um `destination` sem `destination_ref` e contrato
        // quebrado, e a tela nao pode traduzir isso em endereco.
        ligarPortaDoDestinoDoAviso();

        final servidor = ServidorDaCaixa(
          rotasDe(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(ref: refDaPlaquinha, assunto: 'Tobias', destino: 'pet'),
            ]),
          ),
        );
        await abrirComDestino(tester, servidor: servidor);

        await tester.tap(find.text('Tobias'));
        await tester.pumpAndSettle();

        expect(
          find.text(textoDoDestino),
          findsNothing,
          reason: 'REPROVA: navegou com `destination` e SEM '
              '`destination_ref`. Os dois andam juntos por promessa do '
              'contrato, e a guarda e o que impede `/pets/null` quando a '
              'promessa for quebrada.',
        );
        expect(
          find.text('Tobias'),
          findsOneWidget,
          reason: 'REPROVA: a caixa saiu do ar. Par incompleto deixa a linha '
              'sem toque, e nao quebra a tela.',
        );
      },
    );
  });
}
