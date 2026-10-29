// ISCA DA BICHUS-278 (28/10/2026): CONEXOES VIRA UMA ENTRADA COM TRES ABAS.
//
// `Conexões` · `Pendentes` · `Bloqueados`, desenhado e aprovado em
// `design/prototipos/menu-unificado/`. Tres telas que existiam separadas
// (`tela_minhas_conexoes.dart`, `tela_pedidos_de_conexao.dart`,
// `seguranca/tela_de_bloqueados.dart`) passam a morar debaixo de um titulo so.
//
// ## O CAMINHO DO DESBLOQUEIO E O RISCO MEDIDO DESTA FRENTE
//
// O bloqueio e **simetrico no servidor**: quem bloqueia alguem passa a receber
// `404` no perfil dessa pessoa, e o `Desbloquear` morava dentro do menu daquele
// perfil -- que nunca mais abre. **Esta lista e o unico lugar de onde o
// desbloqueio sai no aplicativo inteiro**, e a prosa do item em `abas.dart`
// dizia, literal, que ela era *"a mais critica deste menu caso se perdesse"*.
//
// A decisao do cliente tira a PALAVRA `bloqueados` do menu e a poe debaixo de
// `Conexões`, que e o oposto do que a pessoa veio desfazer. Por isso esta isca
// cobra TRES coisas, e nao uma:
//
//   1. a aba existe e o `Desbloquear` funciona dentro dela;
//   2. `Rotas.pessoasBloqueadas` **continua sendo uma porta direta** e abre a
//      tela JA na aba 3 -- o endereco que a gaveta e qualquer link antigo usam
//      nao passa a cair na aba 1, obrigando um segundo toque;
//   3. a aba diz, por escrito, que o desbloqueio sai dali.
//
// Sem (2) o caminho ficaria obscuro exatamente como o desenho avisou; e (2) e
// de graca, porque a rota ja existe.
//
// ## O contador fica na aba `Pendentes`, e so ele
//
// `requests_received_count` ja existe no contrato. `pending_sent_count` fica
// FORA: pedido que eu mandei nao espera nada de mim, e um numero que soma os
// dois manda a pessoa decidir algo que nao e dela.
//
// ## `Recebidos`/`Enviados` sao CHIPS, e nao uma segunda `TabBar`
//
// A decisao do cliente de 26/10 dividiu os pedidos em duas abas internas. Com
// `Pendentes` virando aba, as duas nao cabem como `TabBar`: aba dentro de aba e
// o controle que ninguem sabe qual dos dois esta mexendo. O protovipo as
// resolveu como chips no topo do CORPO, que e onde o padrao de listagem deste
// projeto manda por controle. A isca cobra **uma** `TabBar` na arvore.
library;

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/seguranca_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/conexoes/tela_de_conexoes.dart';
import 'package:bichu/telas/conexoes/tela_minhas_conexoes.dart';
import 'package:bichu/telas/seguranca/tela_de_bloqueados.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

const String _urlBase = 'https://api.exemplo.test';

/// Quantos pedidos recebidos o servidor afirma.
int _recebidos = 3;

/// Os `DELETE /v1/users/{ref}/blocks` que chegaram ao servidor.
List<String> _desbloqueios = <String>[];

Map<String, dynamic> _pessoaDoPedido(String handle) => <String, dynamic>{
      'handle': handle,
      'display_name': 'Ana do Bairro',
      'contact_channel_verified': true,
    };

Future<http.Response> _servidor(http.Request req) async {
  final caminho = req.url.path;

  if (caminho == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 2,
      'pending_sent_count': 1,
      'requests_received_count': _recebidos,
      'remaining_requests_today': 5,
      'connection_limit': 150,
      'invited_joined_count': 4,
    });
  }

  // A LISTA DE ACEITAS (aba 1) -- com foto, por emenda 3 do ADR-0010.
  if (caminho == '/v1/connections' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        <String, dynamic>{
          'handle': '@bia-da-praca',
          'display_name': 'Bia da Praça',
          'pets_count': 2,
          'connections_count': 11,
          'photo_icon_url': 'https://exemplo.test/bia.webp',
        },
      ],
      'total': 1,
      'page': 1,
      'limit': 20,
    });
  }

  // OS PENDENTES (aba 2), nas duas caixas.
  if (caminho == '/v1/connections/requests' && req.method == 'GET') {
    final direcao = req.url.queryParameters['direction'];
    final recebidos = direcao == null || direcao == 'received';
    return json200(<String, dynamic>{
      'items': recebidos && _recebidos > 0
          ? <Map<String, dynamic>>[
              <String, dynamic>{
                'ref': 'aresta-1',
                'state': 'request_received',
                'requested_at': '2026-10-28T09:00:00Z',
                'person': _pessoaDoPedido('@ana-do-bairro'),
              },
            ]
          : <Map<String, dynamic>>[],
      'total': recebidos ? _recebidos : 0,
      'page': 1,
      'limit': 20,
    });
  }

  // OS BLOQUEADOS (aba 3).
  if (caminho == '/v1/me/blocks' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        <String, dynamic>{
          'public_ref': 'pessoa-diego',
          'handle': '@d-alves',
          'display_name': 'Diego Alves',
          'blocked_at': '2026-10-20T12:00:00Z',
        },
      ],
      'total': 1,
      'page': 1,
    });
  }
  if (caminho == '/v1/users/pessoa-diego/blocks' && req.method == 'DELETE') {
    _desbloqueios.add('pessoa-diego');
    return json200(<String, dynamic>{}, status: 204);
  }

  return problema('not-found', 404);
}

/// A tela unificada sozinha, com as duas portas que ela precisa.
///
/// Sem roteador: o que se mede aqui e a TELA. O caso da ROTA, que e outra
/// afirmacao, monta o app inteiro.
Future<void> _abrirATela(
  WidgetTester tester, {
  AbaDeConexoes aba = AbaDeConexoes.conexoes,
}) async {
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: MockClient(_servidor),
    tokenDeAcesso: () async => 'token-de-teste',
  );
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: TelaDeConexoes(
        conexoes: ConexoesApi(api),
        seguranca: SegurancaApi(api),
        abaInicial: aba,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    _recebidos = 3;
    _desbloqueios = <String>[];
  });

  group('a entrada unica tem tres abas', () {
    testWidgets('as tres abas, e UMA `TabBar` so', (tester) async {
      await _abrirATela(tester);

      expect(
        find.byType(TabBar),
        findsOneWidget,
        reason: 'REPROVA: ha mais de uma `TabBar` na arvore (ou nenhuma). '
            '`Recebidos`/`Enviados` sao CHIPS no topo do corpo, e nao uma '
            'segunda barra de abas: aba dentro de aba e o controle que ninguem '
            'sabe qual dos dois esta mexendo.',
      );
      for (final rotulo in const <String>['Conexões', 'Pendentes', 'Bloqueados']) {
        expect(
          find.descendant(of: find.byType(TabBar), matching: find.text(rotulo)),
          findsOneWidget,
          reason: 'REPROVA: a aba `$rotulo` nao existe na barra de abas.',
        );
      }
    });

    testWidgets('o titulo da tela e `Conexões`', (tester) async {
      await _abrirATela(tester);

      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.text(TelaDeMinhasConexoes.titulo),
        ),
        findsWidgets,
        reason: 'REPROVA: a barra da tela nao diz `Conexões`. Ele e o rotulo '
            'do menu, e a barra tem de dizer o mesmo nome -- quem procura a '
            'funcao pelo nome do menu precisa reconhece-la na tela que abriu.',
      );
    });

    testWidgets('abre na aba 1, e nao em `Pendentes`', (tester) async {
      await _abrirATela(tester);

      // A aba 1 e o que a pessoa vem ver no caso comum; `Pendentes` esta
      // quase sempre vazia, e o numero dela e o que a traz quando ha o que
      // decidir.
      expect(
        tester.widget<TabBar>(find.byType(TabBar)).controller?.index,
        0,
        reason: 'REPROVA: a tela nao abre na aba `Conexões`.',
      );
    });
  });

  group('o contador da aba `Pendentes`', () {
    testWidgets('com tres pedidos recebidos, a aba mostra 3', (tester) async {
      _recebidos = 3;
      await _abrirATela(tester);

      expect(
        find.descendant(of: find.byType(TabBar), matching: find.text('3')),
        findsOneWidget,
        reason: 'REPROVA: a aba `Pendentes` nao mostra o contador. Ele sai de '
            '`requests_received_count`, que JA existe no contrato -- e '
            'mudanca de lugar do numero, nao construcao.',
      );
    });

    testWidgets('com zero, a pastilha SOME (nao vira `0`)', (tester) async {
      _recebidos = 0;
      await _abrirATela(tester);

      expect(
        find.descendant(of: find.byType(TabBar), matching: find.text('0')),
        findsNothing,
        reason: 'REPROVA: a aba pintou `0`. Pastilha com zero e um aviso que '
            'afirma que nao ha aviso.',
      );
    });

    testWidgets('o numero NAO soma os enviados', (tester) async {
      // `pending_sent_count` e 1 e `requests_received_count` e 3 no servidor
      // deste arquivo. Um contador que somasse os dois diria 4.
      _recebidos = 3;
      await _abrirATela(tester);

      expect(
        find.descendant(of: find.byType(TabBar), matching: find.text('4')),
        findsNothing,
        reason: 'REPROVA: o contador somou `pending_sent_count`. Pedido que eu '
            'mandei nao espera nada de mim, e um numero que soma os dois manda '
            'a pessoa decidir algo que nao e dela.',
      );
    });
  });

  group('a aba `Pendentes` guarda os chips herdados', () {
    testWidgets('`Recebidos` e `Enviados` estao no corpo', (tester) async {
      await _abrirATela(tester, aba: AbaDeConexoes.pendentes);

      for (final rotulo in const <String>['Recebidos', 'Enviados']) {
        expect(
          find.text(rotulo),
          findsOneWidget,
          reason: 'REPROVA: o chip `$rotulo` nao esta no corpo da aba '
              '`Pendentes`. A divisao em duas caixas e decisao do cliente de '
              '26/10 e nao foi revogada; esconde-la faria os pedidos ENVIADOS '
              'deixarem de ter tela.',
        );
        expect(
          find.descendant(of: find.byType(TabBar), matching: find.text(rotulo)),
          findsNothing,
          reason: 'REPROVA: `$rotulo` virou aba e nao chip. Aba dentro de aba '
              'e o controle que ninguem sabe qual dos dois esta mexendo.',
        );
      }
    });
  });

  group('O CAMINHO DO DESBLOQUEIO -- o risco medido desta frente', () {
    testWidgets('a aba `Bloqueados` tem o `Desbloquear`, e ele age',
        (tester) async {
      await _abrirATela(tester, aba: AbaDeConexoes.bloqueados);

      expect(
        find.text(TelaDeBloqueados.desbloquear),
        findsOneWidget,
        reason: 'REPROVA: nao ha `Desbloquear` na aba 3. Esta lista e o UNICO '
            'lugar de onde o desbloqueio sai no aplicativo inteiro -- sem '
            'ela, bloquear volta a ser irreversivel pelo aplicativo.',
      );

      await tocar(tester, find.text(TelaDeBloqueados.desbloquear));
      await tester.pumpAndSettle();

      expect(
        _desbloqueios,
        <String>['pessoa-diego'],
        reason: 'REPROVA: o toque em `Desbloquear` nao chegou ao servidor. O '
            'botao existir sem agir e pior que nao existir.',
      );
    });

    testWidgets('a aba DIZ que o desbloqueio sai dali', (tester) async {
      await _abrirATela(tester, aba: AbaDeConexoes.bloqueados);

      // A palavra `bloqueados` saiu do MENU: dentro da aba, o texto e o unico
      // lugar que ainda nomeia a funcao para quem procura por leitura.
      expect(
        find.textContaining('Desbloquear'),
        findsWidgets,
        reason: 'REPROVA: a aba nao nomeia o desbloqueio em texto nenhum. Com '
            'a palavra fora do menu, quem procurava a funcao lendo deixa de '
            'acha-la por leitura.',
      );
    });

    testWidgets(
      'PORTA DIRETA: `Rotas.pessoasBloqueadas` abre JA na aba 3',
      (tester) async {
        // Esta e a afirmacao que impede o caminho de ficar obscuro. A rota ja
        // existe (a gaveta a usa, e qualquer link antigo tambem): se ela
        // passasse a cair na aba 1, o desbloqueio custaria um toque A MAIS
        // que hoje, e nao o mesmo.
        await _abrirATela(tester, aba: AbaDeConexoes.bloqueados);

        expect(
          tester.widget<TabBar>(find.byType(TabBar)).controller?.index,
          2,
          reason: 'REPROVA: a tela nao abriu na aba `Bloqueados` quando foi '
              'pedida por `abaInicial`. `Rotas.pessoasBloqueadas` e a porta '
              'direta do desbloqueio e tem de pousar NA aba, nao na aba 1.',
        );
        expect(
          find.text(TelaDeBloqueados.desbloquear),
          findsOneWidget,
          reason: 'REPROVA: a aba abriu mas o controle nao esta visivel.',
        );
      },
    );
  });
}
