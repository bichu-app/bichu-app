// A tela dos pedidos de conexão, e as duas ausências que ela precisa provar.
//
// **ISCA (b): A LISTA DE CONEXÕES NÃO APARECE A NINGUÉM, nem ao dono.** Medida
// aqui de duas formas, porque uma só não bastaria: varrendo o que a tela
// RENDERIZA (nenhum nome de pessoa conectada) e varrendo o que o app CHAMA
// (nenhuma requisição a uma coleção de conexões).
//
// **A recusa é silenciosa**: o app não tem estado, rótulo nem ramo de tela para
// recusa, e o caso correspondente prova isso pelo lado que importa — um pedido
// recusado chega como `pending_sent` e a tela o desenha como enviado.
//
// Todo esperado está escrito por extenso, com acento: nenhum `expect` compara o
// texto renderizado com a constante que o produz.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/modelos_conexao.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/conexoes/tela_pedidos_de_conexao.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String _urlBase = 'https://api.exemplo.test';

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) {
  return http.Response(
    jsonEncode(corpo),
    status,
    headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
  );
}

Map<String, dynamic> _pedido({
  required String ref,
  required String estado,
  String? apelido,
  String? nome,
}) {
  return <String, dynamic>{
    'ref': ref,
    'state': estado,
    'requested_at': '2026-10-17T12:00:00.000Z',
    'person': <String, dynamic>{'handle': apelido, 'display_name': nome},
  };
}

Map<String, dynamic> _pagina(List<Map<String, dynamic>> itens) {
  return <String, dynamic>{
    'items': itens,
    'total': itens.length,
    'page': 1,
    'limit': 20,
  };
}

Map<String, dynamic> _resumo({int conectadas = 12, int restamHoje = 7}) {
  return <String, dynamic>{
    'connected_count': conectadas,
    'pending_sent_count': 2,
    'requests_received_count': 1,
    'remaining_requests_today': restamHoje,
    'connection_limit': 150,
  };
}

/// O que a tela pediu ao servidor, na ordem. É sobre isto que a varredura de
/// "nenhuma chamada a uma coleção de conexões" trabalha.
final List<String> chamadas = <String>[];

Future<void> _montar(
  WidgetTester tester, {
  required List<Map<String, dynamic>> recebidos,
  List<Map<String, dynamic>> enviados = const <Map<String, dynamic>>[],
  bool resumoFalha = false,
}) async {
  chamadas.clear();
  AppConfig.limparParaTeste();
  final cliente = MockClient((http.Request pedido) async {
    chamadas.add('${pedido.method} ${pedido.url.path}?${pedido.url.query}');
    final caminho = pedido.url.path;
    if (caminho.endsWith('/connections/requests')) {
      final direcao = pedido.url.queryParameters['direction'];
      return _json(_pagina(direcao == 'sent' ? enviados : recebidos));
    }
    if (caminho.endsWith('/connections/summary')) {
      if (resumoFalha) return _json(<String, dynamic>{}, status: 500);
      return _json(_resumo());
    }
    if (caminho.contains('/acceptance')) {
      return _json(_pedido(ref: 'r1', estado: 'connected', apelido: 'ana-do-bairro'));
    }
    if (pedido.method == 'DELETE') return http.Response('', 204);
    return _json(<String, dynamic>{}, status: 404);
  });

  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-de-teste',
  );

  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: TelaDePedidosDeConexao(conexoes: ConexoesApi(api)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a caixa de recebidos nomeia quem pediu, pelo apelido', (tester) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received', apelido: 'ana-do-bairro', nome: 'Ana'),
    ]);

    expect(find.text('@ana-do-bairro'), findsOneWidget);
    expect(find.text('Aceitar'), findsOneWidget);
    expect(find.text('Recusar'), findsOneWidget);
  });

  testWidgets('com apelido nulo, cai para o nome de exibição', (tester) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received', nome: 'Bia'),
    ]);

    expect(find.text('Bia'), findsOneWidget);
    expect(find.text('@null'), findsNothing);
  });

  testWidgets('com os dois nulos, a tela escreve o texto dela e não quebra', (tester) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received'),
    ]);

    expect(find.text('Pessoa sem nome'), findsOneWidget);
  });

  testWidgets('ISCA (b): a tela NÃO mostra, e NÃO pede, a lista de conexões', (tester) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received', apelido: 'ana-do-bairro'),
    ]);

    // 1. O que a tela CHAMA: nenhuma coleção de conexões. As duas chamadas são
    //    a caixa de pedidos e o resumo de números.
    for (final chamada in chamadas) {
      expect(
        chamada.contains('/connections/requests') ||
            chamada.contains('/connections/summary'),
        isTrue,
        reason: 'a tela chamou "$chamada", que não é a caixa de pedidos nem o resumo. '
            'A lista de conexões não existe para ninguém, nem para o dono.',
      );
    }

    // 2. O que a tela MOSTRA: nenhum rótulo que anuncie uma lista.
    for (final proibido in <String>[
      'Minhas conexões',
      'Conexões',
      'Seguidores',
      'Seguindo',
      'Amigos',
    ]) {
      expect(
        find.text(proibido),
        findsNothing,
        reason: 'a tela mostrou "$proibido": a lista de conexões não aparece a ninguém.',
      );
    }
  });

  testWidgets('o resumo mostra NÚMERO, e número não diz quem', (tester) async {
    await _montar(tester, recebidos: const <Map<String, dynamic>>[]);

    expect(
      find.text('Você tem 12 de 150 conexões. Pode enviar 7 pedidos hoje.'),
      findsOneWidget,
    );
  });

  testWidgets('o resumo que falha não derruba a caixa de pedidos', (tester) async {
    await _montar(
      tester,
      resumoFalha: true,
      recebidos: <Map<String, dynamic>>[
        _pedido(ref: 'r1', estado: 'pending_received', apelido: 'ana-do-bairro'),
      ],
    );

    expect(find.text('@ana-do-bairro'), findsOneWidget);
    expect(find.text('Não conseguimos carregar seus pedidos agora.'), findsNothing);
  });

  testWidgets('a caixa de enviados oferece cancelar, e nunca aceitar', (tester) async {
    await _montar(
      tester,
      recebidos: const <Map<String, dynamic>>[],
      enviados: <Map<String, dynamic>>[
        _pedido(ref: 'e1', estado: 'pending_sent', apelido: 'cleide'),
      ],
    );

    await tester.tap(find.text('Enviados'));
    await tester.pumpAndSettle();

    expect(find.text('@cleide'), findsOneWidget);
    expect(find.text('Cancelar'), findsOneWidget);
    expect(find.text('Aceitar'), findsNothing);
  });

  testWidgets('A RECUSA É SILENCIOSA: não há estado nem rótulo de recusa no app', (tester) async {
    // O servidor manda o pedido recusado como `pending_sent`, e a tela não tem
    // como saber da recusa. Este caso prova as duas pontas: o modelo não
    // reconhece `declined`, e a tela desenha "enviado".
    expect(EstadoDaConexao.porCodigo('declined'), isNull);
    expect(
      EstadoDaConexao.values.map((e) => e.codigo).toList(),
      <String>['pending_sent', 'pending_received', 'connected'],
    );

    await _montar(
      tester,
      recebidos: const <Map<String, dynamic>>[],
      enviados: <Map<String, dynamic>>[
        _pedido(ref: 'e1', estado: 'pending_sent', apelido: 'cleide'),
      ],
    );
    await tester.tap(find.text('Enviados'));
    await tester.pumpAndSettle();

    for (final proibido in <String>['Recusado', 'Recusou', 'Rejeitado', 'Negado']) {
      expect(find.text(proibido), findsNothing, reason: 'a tela anunciou "$proibido"');
    }
  });

  testWidgets('aceitar chama a operação de aceite e recarrega a caixa', (tester) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received', apelido: 'ana-do-bairro'),
    ]);

    await tester.tap(find.text('Aceitar'));
    await tester.pumpAndSettle();

    expect(
      chamadas.any((c) => c.startsWith('POST') && c.contains('/connections/r1/acceptance')),
      isTrue,
      reason: 'o aceite tem de passar pela operação de aceite, pelo `ref` da aresta',
    );
  });

  testWidgets('recusar e cancelar usam a MESMA operação, e o app não diz qual é', (tester) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received', apelido: 'ana-do-bairro'),
    ]);

    await tester.tap(find.text('Recusar'));
    await tester.pumpAndSettle();

    final encerramentos = chamadas.where((c) => c.startsWith('DELETE')).toList();
    expect(encerramentos.length, 1);
    expect(encerramentos.first.contains('/connections/r1'), isTrue);
    // Sem corpo e sem parâmetro de intenção: a semântica é do servidor.
    expect(encerramentos.first.contains('declined'), isFalse);
    expect(encerramentos.first.contains('intent'), isFalse);
  });

  testWidgets('nenhum identificador interno aparece na tela', (tester) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'Zm9vYmFyMTIzNDU2Nzg5MA', estado: 'pending_received', apelido: 'ana-do-bairro'),
    ]);

    final textos = tester
        .widgetList<Text>(find.byType(Text))
        .map((t) => t.data ?? '')
        .join(' ');
    expect(
      RegExp(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
          .hasMatch(textos),
      isFalse,
      reason: 'a tela escreveu algo com forma de UUID: $textos',
    );
    expect(
      textos.contains('Zm9vYmFyMTIzNDU2Nzg5MA'),
      isFalse,
      reason: 'o `ref` da aresta é endereço de operação, não texto de tela',
    );
  });

  testWidgets('a falha ao carregar aparece como faixa, e não como lista vazia', (tester) async {
    chamadas.clear();
    AppConfig.limparParaTeste();
    final cliente = MockClient((http.Request _) async => http.Response('', 503));
    final api = ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
      cliente: cliente,
      tokenDeAcesso: () async => 'token-de-teste',
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: BichuTheme.claro,
        home: TelaDePedidosDeConexao(conexoes: ConexoesApi(api)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Não conseguimos carregar seus pedidos agora.'), findsOneWidget);
    expect(find.text('Nenhum pedido esperando você'), findsNothing);
  });
}
