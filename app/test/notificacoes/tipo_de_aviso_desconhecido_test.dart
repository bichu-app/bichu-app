// A ISCA DA SENTINELA: o que a caixa faz com um `kind` que ESTE build nao
// conhece (BICHUS-278, 23/10/2026).
//
// POR QUE ESTE ARQUIVO EXISTE. `connection_requested` entrou no enum
// `NotificationKind` da resposta de `listNotifications` em 45380f6b, e o
// portao `compatibilidade contra main` reprovou o PR #61 com
// `response-property-enum-value-added` em nivel ERR. Acrescentar valor a enum
// de RESPOSTA e, no caso geral, quebra de cliente antigo -- e o cliente antigo
// aqui e o APK que esta no aparelho de alguem.
//
// A pergunta foi MEDIDA na arvore `bdae03e1` (== `45380f6b^`, a arvore de que
// saiu o APK em campo) e a resposta foi: o app TOLERA. `TipoDeAviso.porCodigo`
// cai em `TipoDeAviso.desconhecido` e a linha continua na caixa, com assunto e
// data, sem ser tocavel.
//
// E A TOLERANCIA NAO TINHA PORTAO. Nenhum caso da suite alimentava `kind`
// desconhecido: a sentinela podia sair num refactor e NADA reprovaria -- e a
// dispensa datada em `.github/quality-gates.yml` passaria a afirmar, por
// escrito e com o nome de um responsavel, uma compatibilidade que deixou de
// existir. Este arquivo e esse portao.
//
// O QUE A ISCA PEGA, medido desligando a sentinela (`porCodigo` lancando em
// vez de cair em `desconhecido`): 5 dos 6 casos reprovam pelo nome, e o grupo
// (c) mostra o preco de verdade -- a caixa INTEIRA vira a faixa "O Bichu esta
// fora do ar por alguns minutos" com `Tentar de novo`. Nao e uma linha feia na
// lista: e a tela toda, por causa de um valor que o servidor ganhou.
//
// O VALOR USADO E INVENTADO de proposito, e nao `connection_requested`: este
// build JA conhece aquele, e um caso que usasse o valor de hoje ficaria verde
// por vazio amanha. A propriedade presa aqui e "um valor que este build nao
// conhece", e nao "o valor de 23/10".
//
// Cada grupo e um PAR: a isca e o contrapeso. O contrapeso prova que a tela
// desenhou de fato, e nao que o caso esta verde por nao ter achado nada.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/modelos_notificacao.dart';
import 'package:bichu/api/notificacoes_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/notificacoes/caixa_de_notificacoes.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Um `kind` que NENHUM build conhece, e que o contrato nao declara.
///
/// Ele e o que `connection_requested` era para o APK de ontem.
const String tipoQueEsteBuildNaoConhece = 'kind_que_o_contrato_nao_declara';

/// Um `destination` que nenhum build conhece, pelo mesmo motivo.
const String destinoQueEsteBuildNaoConhece = 'destino_que_o_contrato_nao_declara';

/// Um `ref` OPACO de 20 a 32 caracteres, como o ADR-0010 manda.
const String refDoAviso = 'avi_8Hk3Lm9Qr2Tv5Xz7Bd1Cf';

const String caminhoDaLista = '/v1/me/notifications';
const String caminhoDoVisto = '/v1/me/notifications/seen';

String caminhoDoLido(String ref) => '/v1/me/notifications/$ref/read';

/// Um `NotificationItem` do contrato, campo por campo.
Map<String, dynamic> aviso({
  String ref = refDoAviso,
  required String tipo,
  String? assunto = 'Marina',
  String? destino,
  String? destinoRef,
}) => <String, dynamic>{
  'ref': ref,
  'kind': tipo,
  'subject': assunto,
  'occurred_at': '2026-10-18T13:52:00.000Z',
  'read': false,
  'grouped_count': 1,
  // Os dois saem SEMPRE, nulos por padrao: o contrato os declara sempre
  // presentes e anulaveis.
  'destination': destino,
  'destination_ref': destinoRef,
};

/// Um `NotificationPage` do contrato.
Map<String, dynamic> paginaDaCaixa(List<Map<String, dynamic>> itens) =>
    <String, dynamic>{
      'items': itens,
      'page': 1,
      'limit': 30,
      'total': itens.length,
      'unread_total': itens.length,
    };

http.Response json200(Map<String, dynamic> corpo) => http.Response(
      jsonEncode(corpo),
      200,
      headers: const <String, String>{
        'content-type': 'application/json; charset=utf-8',
      },
    );

/// O servidor de teste, e o registro do que a tela chamou.
class ServidorDaCaixa {
  ServidorDaCaixa(this.pagina);

  final Map<String, dynamic> pagina;
  final List<http.Request> chamadas = <http.Request>[];

  List<http.Request> chamadasA(String metodoECaminho) => chamadas
      .where((r) => '${r.method} ${r.url.path}' == metodoECaminho)
      .toList();

  Future<http.Response> call(http.Request req) async {
    chamadas.add(req);
    if ('${req.method} ${req.url.path}' == 'GET $caminhoDaLista') {
      return json200(pagina);
    }
    // `204` para as marcacoes, que respondem sem corpo.
    return http.Response('', 204);
  }
}

/// Monta a caixa com um roteador de verdade, no endereco que ela exporta.
Future<void> abrirACaixa(
  WidgetTester tester, {
  required ServidorDaCaixa servidor,
}) async {
  AppConfig.limparParaTeste();
  final api = NotificacoesApi(
    ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'https://api.teste.bichu'),
      cliente: MockClient(servidor.call),
      tokenDeAcesso: () async => 'token-de-teste',
    ),
  );
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

/// Todo o texto visivel da tela, numa string so.
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

void main() {
  // -------------------------------------------------------------------------
  group('(a) a sentinela existe, e o valor da sonda e de fato desconhecido', () {
    test(
      'CONTROLE: nenhum valor do enum casa com o `kind` da sonda, e os valores '
      'de verdade do contrato casam',
      () {
        expect(
          TipoDeAviso.values.where(
            (t) => t.codigo == tipoQueEsteBuildNaoConhece,
          ),
          isEmpty,
          reason: 'REPROVA: o `kind` da sonda entrou no enum. Um caso que mede '
              'um valor CONHECIDO nao mede nada: troque a constante por outra '
              'que o contrato nao declare.',
        );
        expect(
          DestinoDoAviso.values.where(
            (d) => d.codigo == destinoQueEsteBuildNaoConhece,
          ),
          isEmpty,
          reason: 'REPROVA: o `destination` da sonda entrou no enum, pelo mesmo '
              'motivo do caso acima.',
        );
        // O CONTRAPESO: a sonda procura no lugar certo. Sem isto, o caso acima
        // ficaria verde ate se o enum estivesse vazio.
        expect(
          TipoDeAviso.values.where((t) => t.codigo == 'broadcast'),
          hasLength(1),
          reason: 'contrapeso: `broadcast` e valor do contrato e PRECISA estar '
              'no enum. Se isto falhar, a sonda nao esta olhando o enum certo.',
        );
        expect(
          DestinoDoAviso.values.where((d) => d.codigo == 'broadcast'),
          hasLength(1),
          reason: 'contrapeso, pelo mesmo motivo.',
        );
      },
    );

    test(
      'ISCA: `porCodigo` NAO lanca com valor desconhecido, e devolve a '
      'sentinela com rotulo de tela nao vazio',
      () {
        late TipoDeAviso lido;
        expect(
          () => lido = TipoDeAviso.porCodigo(tipoQueEsteBuildNaoConhece),
          returnsNormally,
          reason: 'REPROVA: `TipoDeAviso.porCodigo` passou a LANCAR com um '
              'valor que este build nao conhece. Isso derruba a caixa de '
              'notificacoes inteira no dia em que o servidor ganhar um tipo '
              'novo antes do APK -- que e exatamente o que a dispensa datada '
              '`oasdiff-aviso-de-pedido-de-conexao-na-caixa` afirma que NAO '
              'acontece.',
        );
        expect(lido, TipoDeAviso.desconhecido);
        expect(
          lido.rotulo,
          isNotEmpty,
          reason: 'REPROVA: a sentinela ficou sem rotulo, e a linha apareceria '
              'na caixa com o nome do tipo em branco.',
        );
        expect(lido.rotulo, 'Aviso');
        // Nulo e numero tambem cairiam aqui: o parametro e `Object?` de
        // proposito, porque `json['kind']` nao tem tipo garantido.
        expect(TipoDeAviso.porCodigo(null), TipoDeAviso.desconhecido);
        expect(TipoDeAviso.porCodigo(7), TipoDeAviso.desconhecido);
        // O CONTRAPESO: `porCodigo` continua ACERTANDO os valores de verdade.
        expect(TipoDeAviso.porCodigo('broadcast'), TipoDeAviso.comunicado);
        expect(
          TipoDeAviso.porCodigo('connection_requested'),
          TipoDeAviso.pedidoDeConexao,
          reason: 'contrapeso: o valor que estreou em 45380f6b precisa casar. '
              'Se isto falhar, a sentinela esta engolindo valor conhecido.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(b) a desserializacao nao lanca e NAO descarta a linha', () {
    test(
      'ISCA: `AvisoDaCaixa.doJson` com `kind` e `destination` desconhecidos nao '
      'lanca, e a linha fica SEM destino',
      () {
        late AvisoDaCaixa lido;
        expect(
          () => lido = AvisoDaCaixa.doJson(
            aviso(
              tipo: tipoQueEsteBuildNaoConhece,
              destino: destinoQueEsteBuildNaoConhece,
              destinoRef: 'xyz_4Nj6Pq8St0Uw2Yx4Ac6Ee',
            ),
          ),
          returnsNormally,
          reason: 'REPROVA: um `kind` ou `destination` desconhecido fez a '
              'leitura do item LANCAR. Quem chama trata `FalhaDeChamada` e '
              '`FormatException` -- uma excecao aqui derruba a pagina toda.',
        );
        expect(lido.tipo, TipoDeAviso.desconhecido);
        expect(
          lido.destino,
          isNull,
          reason: 'REPROVA: destino desconhecido precisa virar nulo, que e o '
              'mesmo estado de `destination: null`.',
        );
        expect(
          lido.temDestino,
          isFalse,
          reason: 'REPROVA: a linha ficou tocavel para um destino que este '
              'build nao sabe abrir.',
        );
        // O CONTRAPESO: o resto do item foi lido, e nao perdido junto.
        expect(lido.assunto, 'Marina');
        expect(lido.ref, refDoAviso);
      },
    );

    test(
      'ISCA: a pagina inteira nao lanca, e a linha desconhecida NAO desaparece '
      'da lista',
      () {
        late PaginaDaCaixa pagina;
        expect(
          () => pagina = PaginaDaCaixa.doJson(
            paginaDaCaixa(<Map<String, dynamic>>[
              aviso(tipo: tipoQueEsteBuildNaoConhece),
              aviso(ref: 'avi_4Nj6Pq8St0Uw2Yx4Ac6Ee', tipo: 'broadcast'),
            ]),
          ),
          returnsNormally,
        );
        expect(
          pagina.itens,
          hasLength(2),
          reason: 'REPROVA: a linha desconhecida foi DESCARTADA da pagina. '
              'Aviso que o app joga fora por nao reconhecer e aviso que '
              'ninguem vai saber que existiu.',
        );
        expect(pagina.itens.first.tipo, TipoDeAviso.desconhecido);
        // O CONTRAPESO: a linha conhecida ao lado continua certa.
        expect(pagina.itens.last.tipo, TipoDeAviso.comunicado);
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(c) a caixa DESENHA a linha desconhecida, e nao a tela de erro', () {
    testWidgets(
      'ISCA: a caixa mostra a linha com o rotulo neutro, o assunto e a data, e '
      'nao estoura excecao nenhuma',
      (tester) async {
        final servidor = ServidorDaCaixa(
          paginaDaCaixa(<Map<String, dynamic>>[
            aviso(
              tipo: tipoQueEsteBuildNaoConhece,
              destino: destinoQueEsteBuildNaoConhece,
              destinoRef: 'xyz_4Nj6Pq8St0Uw2Yx4Ac6Ee',
            ),
          ]),
        );
        await abrirACaixa(tester, servidor: servidor);

        expect(
          tester.takeException(),
          isNull,
          reason: 'REPROVA: a caixa estourou excecao com um `kind` que este '
              'build nao conhece.',
        );

        // POR `find.text`, E NAO POR `contains`: a barra de topo desta tela se
        // chama `Avisos`, e `contains('Aviso')` casava com ELA. O caso ficava
        // verde mesmo quando a linha mostrava outro rotulo -- medido na isca,
        // trocando a constante da sonda por `connection_requested`: o caso
        // passava. `find.text` compara o `data` do `Text` INTEIRO, e `Avisos`
        // nao e `Aviso`.
        expect(
          find.text(TipoDeAviso.desconhecido.rotulo),
          findsOneWidget,
          reason: 'REPROVA: a linha desconhecida nao mostrou o rotulo da '
              'sentinela. Ou ela ficou sem rotulo, ou mostrou outro.',
        );
        final texto = textoDaTela(tester);
        expect(
          texto,
          contains('Marina'),
          reason: 'REPROVA: o assunto nao foi desenhado -- ou a linha nao '
              'existe, ou a tela caiu para outro estado. Este e o contrapeso '
              'que impede o caso de ficar verde por tela vazia.',
        );
        expect(
          texto,
          contains('18/10/2026'),
          reason: 'contrapeso: a data da linha tambem aparece.',
        );
        expect(
          texto,
          isNot(contains('Tentar de novo')),
          reason: 'REPROVA: a caixa caiu para a FAIXA DE ERRO por causa de um '
              'valor de enum. Isto e o preco de verdade de tirar a sentinela: '
              'nao e uma linha feia na lista, e a tela toda virando '
              '"o Bichu esta fora do ar".',
        );
        expect(
          servidor.chamadasA('POST $caminhoDoVisto'),
          hasLength(1),
          reason: 'contrapeso: a caixa abriu de verdade e zerou o sino.',
        );
      },
    );

    testWidgets(
      'ISCA: o toque na linha desconhecida marca como lido e NAO navega para '
      'lugar nenhum',
      (tester) async {
        final servidor = ServidorDaCaixa(
          paginaDaCaixa(<Map<String, dynamic>>[
            aviso(
              tipo: tipoQueEsteBuildNaoConhece,
              destino: destinoQueEsteBuildNaoConhece,
              destinoRef: 'xyz_4Nj6Pq8St0Uw2Yx4Ac6Ee',
            ),
          ]),
        );
        await abrirACaixa(tester, servidor: servidor);

        await tester.tap(find.text('Marina'));
        await tester.pumpAndSettle();

        expect(
          tester.takeException(),
          isNull,
          reason: 'REPROVA: o toque numa linha com destino desconhecido '
              'estourou -- e o `/pets/null` que `temDestino` existe para '
              'impedir.',
        );
        expect(
          servidor.chamadasA('POST ${caminhoDoLido(refDoAviso)}'),
          hasLength(1),
          reason: 'contrapeso: o toque CHEGOU na linha e marcou aquele item '
              'como lido. Sem isto o caso abaixo ficaria verde por ninguem ter '
              'tocado em nada.',
        );
        expect(
          find.text('Marina'),
          findsOneWidget,
          reason: 'REPROVA: a linha saiu da tela depois do toque, o que '
              'significa que o app NAVEGOU para um destino que ele nao conhece.',
        );
      },
    );
  });
}
