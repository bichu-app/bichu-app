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
//
// **AS ISCAS DO CONTROLE FORAM REESCRITAS, E NÃO APAGADAS (BICHUS-307,
// 26/10/2026).** O cliente trocou o grupo segmentado por abas, e os casos que
// achavam o controle por `find.text('Enviados')` passariam a achar uma ABA sem
// dizer nada sobre isso. Eles continuam no lugar -- `find.text` acha o `Text`
// de dentro do `Tab` e o toque chega igual --, e o grupo `ABAS:` no fim do
// arquivo é o que cobra a FORMA: que o controle seja `TabBar`, que sejam DUAS
// abas e não três, e que voltar para a aba já vista não recomece a lista.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/modelos_conexao.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/conexoes/tela_pedidos_de_conexao.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/grupo_segmentado.dart';
import 'package:bichu/widgets/selo_de_validado.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../widgets/palavras_proibidas_no_rotulo.dart';

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
  // **Padrao `false`**: pessoa que o caso nao mencionou nao e pessoa validada, e
  // um padrao `true` faria a isca do selo ausente ficar verde sem medir nada.
  bool validado = false,
}) {
  return <String, dynamic>{
    'ref': ref,
    'state': estado,
    'requested_at': '2026-10-17T12:00:00.000Z',
    'person': <String, dynamic>{
      'handle': apelido,
      'display_name': nome,
      'contact_channel_verified': validado,
    },
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
    'invited_joined_count': 0,
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
      // **O `Scaffold` E DO TESTE DESDE 28/10/2026, e nao da tela.** Esta tela
      // virou a aba `Pendentes` de `conexoes/tela_de_conexoes.dart`, e quem
      // desenha a barra de topo agora e a casca -- dois `Scaffold` empilhados
      // dariam duas barras, uma por aba. O corpo precisa de um `Material`
      // ancestral para os botoes dele, e `MaterialApp.home` nao e um. A casca
      // tem isca propria em `telas/conexoes_tres_abas_test.dart`.
      home: Scaffold(
        body: TelaDePedidosDeConexao(conexoes: ConexoesApi(api)),
      ),
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

    expect(find.text('Usuário sem nome'), findsOneWidget);
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
        home: Scaffold(
          body: TelaDePedidosDeConexao(conexoes: ConexoesApi(api)),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Não conseguimos carregar seus pedidos agora.'), findsOneWidget);
    expect(find.text('Nenhum pedido esperando você'), findsNothing);
  });

  // =========================================================================
  // O TOQUE NO NOME DE QUEM PEDIU LEVA AO PERFIL DELE
  // =========================================================================
  //
  // O DEFEITO MEDIDO: `telas/pessoa/tela_perfil_de_pessoa.dart` existe, tem
  // rota e desenha os quatro estados de conexao -- e a unica porta para ela no
  // app era a foto da conversa. Quem recebe um pedido decide aceitar ou recusar
  // sobre um apelido solto, sem poder olhar a pessoa.
  //
  // O QUE ESTES CASOS MEDEM, e o que um caso de existencia NAO mediria: que o
  // toque chega em `/pessoa/<apelido>` **com o apelido daquela pessoa**. Um
  // destino constante, ou o apelido do item errado da lista, passariam por
  // "abriu um perfil" e reprovam aqui.
  //
  // A rota de perfil desta bancada e um DUBLE com o caminho de verdade
  // (`Rotas.perfilDePessoa`), que escreve o apelido recebido. Montar
  // `TelaDePerfilDePessoa` exigiria `Escopo`, `PessoasApi`, `SegurancaApi` e
  // sessao -- uma segunda bancada inteira, para medir o que nao e desta tela.
  group('o toque no nome de quem pediu abre o perfil DAQUELA pessoa', () {
    testWidgets(
      'ISCA: o toque abre `/pessoa/<apelido>`, e com o apelido de quem pediu',
      (tester) async {
        await _montarComRoteador(tester, recebidos: <Map<String, dynamic>>[
          _pedido(
            ref: 'r1',
            estado: 'pending_received',
            apelido: 'ana-do-bairro',
            nome: 'Ana',
          ),
        ]);

        expect(
          _semanticaDaTela(tester),
          contains('Abrir o perfil de @ana-do-bairro'),
          reason:
              'REPROVA: o nome de quem pediu continuou texto puro. O rotulo diz '
              'o que o toque ABRE, e sem ele quem usa leitor de tela nao tem '
              'como saber que ha destino ali.',
        );

        await tester.tap(find.text('@ana-do-bairro'));
        await tester.pumpAndSettle();

        expect(
          _textoDaTela(tester),
          contains('perfil aberto: ana-do-bairro'),
          reason:
              'REPROVA: o toque no nome nao abriu o perfil daquela pessoa. O '
              'apelido no caminho e o que distingue "abriu um perfil" de '
              '"abriu O perfil certo".',
        );
      },
    );

    testWidgets(
      'ISCA: com DOIS pedidos, cada nome abre o perfil do SEU pedido',
      (tester) async {
        // O defeito que este caso pega: o cartao fecha sobre o apelido do
        // primeiro item (ou do ultimo) em vez do seu. Com um pedido so na
        // lista, esse defeito ficaria verde.
        await _montarComRoteador(tester, recebidos: <Map<String, dynamic>>[
          _pedido(
            ref: 'r1',
            estado: 'pending_received',
            apelido: 'ana-do-bairro',
            nome: 'Ana',
          ),
          _pedido(
            ref: 'r2',
            estado: 'pending_received',
            apelido: 'bruno-do-parque',
            nome: 'Bruno',
          ),
        ]);

        await tester.tap(find.text('@bruno-do-parque'));
        await tester.pumpAndSettle();

        expect(
          _textoDaTela(tester),
          contains('perfil aberto: bruno-do-parque'),
          reason:
              'REPROVA: o toque no SEGUNDO nome abriu outro perfil. Cada cartao '
              'responde pelo seu pedido, e nao pelo primeiro da pagina.',
        );
        expect(
          _textoDaTela(tester),
          isNot(contains('ana-do-bairro')),
          reason: 'o perfil aberto e o de quem foi tocado, e so ele',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: SEM APELIDO o nome nao e porta, e o toque nao quebra',
      (tester) async {
        // Estado real do contrato: `handle` e anulavel, e nenhum fluxo obriga a
        // escolher apelido. Com ele nulo a tela cai para o nome de exibicao --
        // e um destino montado com nulo abriria `/pessoa/null`, que e o que o
        // comentario de `rotas.dart` proibe por extenso.
        await _montarComRoteador(tester, recebidos: <Map<String, dynamic>>[
          _pedido(ref: 'r1', estado: 'pending_received', nome: 'Ana'),
        ]);

        expect(
          _semanticaDaTela(tester),
          isNot(contains('Abrir o perfil de')),
          reason:
              'REPROVA: o nome se anuncia como porta do perfil sem apelido. O '
              'destino seria `/pessoa/` ou `/pessoa/null`.',
        );

        await tester.tap(find.text('Ana'));
        await tester.pumpAndSettle();

        expect(
          _textoDaTela(tester),
          isNot(contains('perfil aberto')),
          reason:
              'REPROVA: o toque navegou sem apelido. Sem apelido nao ha '
              'endereco, e o nome volta a ser texto.',
        );
        expect(
          tester.takeException(),
          isNull,
          reason: 'REPROVA: o toque sem apelido levantou excecao',
        );
        expect(find.text('Ana'), findsOneWidget);
      },
    );

    testWidgets(
      'CONTRAPESO: com os dois nulos, o texto da tela nao e porta nenhuma',
      (tester) async {
        await _montarComRoteador(tester, recebidos: <Map<String, dynamic>>[
          _pedido(ref: 'r1', estado: 'pending_received'),
        ]);

        expect(find.text('Usuário sem nome'), findsOneWidget);
        expect(
          _semanticaDaTela(tester),
          isNot(contains('Abrir o perfil de')),
          reason:
              'REPROVA: a tela ofereceu o perfil de uma pessoa que ela nao '
              'conseguiu nomear.',
        );

        await tester.tap(find.text('Usuário sem nome'));
        await tester.pumpAndSettle();

        expect(_textoDaTela(tester), isNot(contains('perfil aberto')));
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'ISCA: em `Enviados` o nome TAMBEM abre o perfil de quem foi convidado',
      (tester) async {
        // A caixa de enviados nomeia a pessoa do mesmo jeito, e o perfil dela e
        // igualmente legitimo -- e de la que sai o `Cancelar pedido`.
        await _montarComRoteador(
          tester,
          recebidos: const <Map<String, dynamic>>[],
          enviados: <Map<String, dynamic>>[
            _pedido(
              ref: 'r9',
              estado: 'pending_sent',
              apelido: 'carla-da-praca',
              nome: 'Carla',
            ),
          ],
        );

        await tester.tap(find.text('Enviados'));
        await tester.pumpAndSettle();

        await tester.tap(find.text('@carla-da-praca'));
        await tester.pumpAndSettle();

        expect(
          _textoDaTela(tester),
          contains('perfil aberto: carla-da-praca'),
          reason:
              'REPROVA: a caixa de enviados nomeia a pessoa e nao oferece o '
              'perfil dela.',
        );
      },
    );
  });
  // As duas frentes da onda 4 ACRESCENTARAM grupo aqui, cada uma o seu, e os
  // dois medem coisas independentes da mesma tela: o toque no nome (acima) e o
  // selo ao lado do nome (abaixo). A uniao e os dois -- `_pedido` ja nasceu com
  // `validado` e `_montar` com `enviados`, as duas pontas vindas da outra
  // frente sem conflito.

  // O SELO DE VALIDADO (emenda do ADR-0010, 21/10/2026)
  // =========================================================================

  testWidgets('SELO: com canal confirmado, o selo aparece ao lado do nome do pedido', (
    tester,
  ) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received', apelido: 'ana-do-bairro', validado: true),
    ]);
    expect(find.byType(SeloDeValidado), findsOneWidget);
    expect(find.text('@ana-do-bairro'), findsOneWidget);
  });

  testWidgets('SELO: ISCA -- sem canal confirmado, nenhuma roseta na caixa de pedidos', (
    tester,
  ) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received', apelido: 'ana-do-bairro'),
    ]);
    expect(find.byType(SeloDeValidado), findsNothing);
    expect(find.byIcon(Icons.verified), findsNothing);
  });

  testWidgets('SELO: o pedido ENVIADO mostra o selo igual ao recebido', (tester) async {
    // **O aceite nao muda o selo.** Ele e atributo da conta, e sai igual nos dois
    // estados — como `display_name` ja sai. O que o aceite muda e o que as
    // OUTRAS superficies passam a mostrar, nao isto.
    await _montar(tester, recebidos: const <Map<String, dynamic>>[], enviados: <Map<String, dynamic>>[
      _pedido(ref: 'r2', estado: 'pending_sent', apelido: 'bia-do-parque', validado: true),
    ]);
    await tester.tap(find.text('Enviados'));
    await tester.pumpAndSettle();
    expect(find.text('@bia-do-parque'), findsOneWidget);
    expect(find.byType(SeloDeValidado), findsOneWidget);
  });

  testWidgets('SELO: a pessoa SEM nome e SEM apelido tambem pode ter selo', (tester) async {
    // A tela cai para "Pessoa sem nome", que e texto DELA. **O selo nao cai
    // junto**: o booleano e sobre a conta, e uma conta sem nome de exibicao pode
    // ter confirmado o e-mail.
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received', validado: true),
    ]);
    expect(find.text('Usuário sem nome'), findsOneWidget);
    expect(find.byType(SeloDeValidado), findsOneWidget);
  });

  testWidgets('SELO: o rotulo acessivel e `SeloDeValidado.rotulo`, e nada alem', (tester) async {
    await _montar(tester, recebidos: <Map<String, dynamic>>[
      _pedido(ref: 'r1', estado: 'pending_received', apelido: 'ana-do-bairro', validado: true),
    ]);
    // **`contains` e nao igualdade, e a diferenca e do CARTAO e nao do selo**:
    // a linha do pedido e um no de semantica unico, entao o leitor de tela
    // anuncia "@ana-do-bairro, Contato confirmado" numa parada so. O que este
    // caso cobra e que a frase do selo chegue INTEIRA e que nenhuma palavra
    // proibida apareca — a igualdade exata do rotulo do widget e medida em
    // `test/widgets/selo_de_validado_test.dart`, onde nao ha no de fora.
    final String rotulo = tester.getSemantics(find.byType(SeloDeValidado)).label;
    // A CONSTANTE, e nunca o literal: um rotulo so para as quatro superficies.
    expect(rotulo, contains(SeloDeValidado.rotulo));
    // A VARREDURA COMPARTILHADA, no lugar da lista curta de quatro palavras
    // que morava aqui e que nao proibia nomear canal.
    conferirRotuloDoSelo(rotulo, onde: 'o pedido de conexao');
  });

  // =========================================================================
  // AS ABAS (BICHUS-307, cliente de 26/10/2026)
  //
  // Literal dele: *"pedidos de conexão, vamos trocar essas caixas de recebidos
  // e enviados por abas, igual na pagina de rede."*
  // =========================================================================

  group('CHIPS: a forma do controle', () {
    // ==================================================================
    // ERA `ABAS: a forma do controle`, E A FORMA MUDOU EM 28/10/2026
    // ==================================================================
    //
    // Este grupo cobrava uma `TabBar` interna, por pedido do cliente de
    // 26/10/2026 (*"divida recebidos e enviados por abas, igual na pagina de
    // rede"*). Em 28/10 ele decidiu que CONEXOES VIRA UMA ENTRADA COM TRES
    // ABAS, e esta tela passou a ser a aba `Pendentes` de
    // `conexoes/tela_de_conexoes.dart`.
    //
    // **As duas caixas nao cabem mais como abas**, e nao e preferencia: aba
    // dentro de aba e o controle que ninguem sabe qual dos dois esta mexendo,
    // e este aplicativo tem UMA `TabBar` so. O protovipo aprovado as resolveu
    // como CHIPS no topo do corpo, que e onde o padrao de listagem deste
    // projeto manda por controle -- no corpo, nunca na barra. E a terceira
    // forma deste mesmo controle: `GrupoSegmentado` -> `TabBar` -> chips, no
    // mesmo lugar da tela.
    //
    // **O QUE O GRUPO PROTEGE NAO MUDOU**: duas caixas e so duas, abrindo em
    // `Recebidos`, com `Enviados` alcancavel. Foi a FORMA que a decisao
    // trocou, e por isso os casos foram reescritos em vez de apagados.
    //
    // **A decisao de 26/10 NAO foi revogada** -- as duas caixas continuam
    // divididas e visiveis. O que ela ganhou foi um dono diferente na arvore.
    // Qual e o certo esta registrado como pergunta fechada 2 no
    // `design/prototipos/menu-unificado/DESENHO.md`, parada no cliente.
    testWidgets('o controle e CHIP, e nao `TabBar` nem grupo segmentado', (
      tester,
    ) async {
      await _montar(tester, recebidos: const <Map<String, dynamic>>[]);

      expect(
        find.byType(TabBar),
        findsNothing,
        reason:
            'REPROVA: a caixa voltou a ser escolhida por `TabBar`. Esta tela e '
            'uma ABA desde 28/10/2026, e uma `TabBar` aqui dentro seria aba '
            'dentro de aba -- o controle que ninguem sabe qual dos dois esta '
            'mexendo.',
      );
      expect(
        find.byType(GrupoSegmentado<CaixaDePedidos>),
        findsNothing,
        reason:
            'REPROVA: a caixa voltou ao grupo segmentado, que saiu em '
            '26/10/2026.',
      );
      expect(
        find.byType(ChoiceChip),
        findsNWidgets(2),
        reason:
            'REPROVA: as duas caixas nao sao dois chips. O protovipo aprovado '
            'em 28/10 as desenhou como chips no topo do corpo.',
      );
      // Os rotulos sao dos CHIPS, e nao de um controle qualquer que por acaso
      // escreve as mesmas duas palavras.
      expect(find.widgetWithText(ChoiceChip, 'Recebidos'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Enviados'), findsOneWidget);
    });

    testWidgets('ISCA: sao DUAS caixas, e NENHUMA terceira', (tester) async {
      await _montar(tester, recebidos: const <Map<String, dynamic>>[]);

      expect(
        find.byType(ChoiceChip),
        findsNWidgets(2),
        reason:
            'REPROVA: a tela ganhou uma terceira caixa. A prosa da classe diz '
            'por que nao ha: esta tela mostra PEDIDOS, conexao aceita nao e '
            'pedido, e as duas perguntas nao cabem no mesmo controle. A '
            'terceira lista agora e uma ABA IRMA desta, na casca.',
      );
      // A terceira caixa teria o nome da OUTRA lista. Nenhuma palavra dela
      // DENTRO do segmento -- `Conexões` existe na tela unificada como rotulo
      // de ABA, que e outro controle e outro arquivo.
      for (final String proibido in <String>[
        'Conexões',
        'Minhas conexões',
        'Aceitas',
        'Aceitos',
      ]) {
        expect(
          find.widgetWithText(ChoiceChip, proibido),
          findsNothing,
          reason: 'REPROVA: existe um chip de caixa "$proibido" nesta tela',
        );
      }
    });

    testWidgets('a tela abre em `Recebidos`, e o chip selecionado diz o mesmo',
        (tester) async {
      await _montar(tester, recebidos: const <Map<String, dynamic>>[]);

      final selecionados = tester
          .widgetList<ChoiceChip>(find.byType(ChoiceChip))
          .where((ChoiceChip c) => c.selected)
          .toList(growable: false);

      expect(
        selecionados,
        hasLength(1),
        reason:
            'REPROVA: nao ha exatamente um chip selecionado. Dois selecionados '
            'afirmam duas caixas na frente ao mesmo tempo; nenhum deixa a '
            'pessoa sem saber qual lista ela esta lendo.',
      );
      expect(
        (selecionados.single.label as Text).data,
        'Recebidos',
        reason:
            'REPROVA: a tela nao abre na caixa de recebidos. O `selected` tem '
            'de sair de `_caixa`, que nasce em `CaixaDePedidos.recebidos`.',
      );
    });
  });

  group('CHIPS: acessibilidade', () {
    // Era `ABAS: acessibilidade`. A FORMA do controle mudou em 28/10/2026
    // (`TabBar` interna -> chips no topo do corpo, porque esta tela virou a
    // aba `Pendentes` de `conexoes/tela_de_conexoes.dart`), e **o que este
    // grupo cobra nao mudou**: cada caixa se anuncia, publica acao de toque,
    // tem alvo acima do piso, e a PERGUNTA do grupo (`Caixa`) continua dita.
    testWidgets('cada chip anuncia o rótulo E publica a ação de toque', (
      tester,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await _montar(tester, recebidos: const <Map<String, dynamic>>[]);

      for (final String rotulo in <String>['Recebidos', 'Enviados']) {
        final SemanticsNode no = tester.getSemantics(
          find.widgetWithText(ChoiceChip, rotulo),
        );
        expect(
          no.label,
          contains(rotulo),
          reason: 'REPROVA: o chip "$rotulo" não se anuncia',
        );
        expect(
          no.getSemanticsData().hasAction(SemanticsAction.tap),
          isTrue,
          reason:
              'REPROVA: o chip "$rotulo" se anuncia como controle e não '
              'publica ação -- é a mesma falha que '
              '`test/a11y/acao_de_controle_test.dart` reprova (WCAG 2.1 '
              'SC 4.1.2).',
        );
      }
      handle.dispose();
    });

    testWidgets('a PERGUNTA do grupo sobrevive: `Caixa` continua anunciado', (
      tester,
    ) async {
      await _montar(tester, recebidos: const <Map<String, dynamic>>[]);

      expect(
        _semanticaDaTela(tester),
        contains('Caixa'),
        reason:
            'REPROVA: o nome do grupo saiu junto com o segmento. Era o '
            '`rotulo` do `GrupoSegmentado`, e sem ele quem usa leitor de tela '
            'ouve "Recebidos" sem a pergunta que a palavra responde.',
      );
    });

    testWidgets('a área TOCÁVEL do chip respeita o piso do produto', (
      tester,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await _montar(tester, recebidos: const <Map<String, dynamic>>[]);

      for (final String rotulo in <String>['Recebidos', 'Enviados']) {
        // **O ALVO, e não a caixa do rótulo.** A conta do `Tab` (26/10) nao
        // vale mais: o controle e um `ChoiceChip`, e o M3 lhe da 32 dp de
        // altura por padrao -- ABAIXO do piso de 48. Quem paga o piso aqui e
        // o `padding` vertical de `e3` que a tela passa, e e por isso que
        // este caso continua existindo: sem ele, o chip nasceria com 32 dp e
        // nada acusaria.
        final double tocavel = tester
            .getSemantics(find.widgetWithText(ChoiceChip, rotulo))
            .rect
            .height;
        expect(
          tocavel,
          greaterThanOrEqualTo(BichuAlvoDeToque.min),
          reason:
              'REPROVA: o alvo de toque do chip "$rotulo" tem $tocavel dp de '
              'altura, abaixo do piso de ${BichuAlvoDeToque.min} dp '
              '(design system 6.5, WCAG 2.1 SC 2.5.8). O `ChoiceChip` do M3 '
              'nasce com 32 dp: quem paga o piso e o `padding` vertical da '
              'tela.',
        );
      }
      handle.dispose();
    });

    testWidgets(
      'o chip amarra a folga ao TOKEN, e não ao padrão do `ChoiceChip`',
      (tester) async {
        // ================================================================
        // ERA `a aba amarra a altura ao TOKEN, e não ao kTextTabBarHeight`
        // ================================================================
        //
        // O caso lia `(aba as Tab).height` e cobrava
        // `BichuAlvoDeToque.min`. Com a troca de forma de 28/10/2026 nao ha
        // `Tab` nenhum, e o alvo passou a ser pago por outro lugar -- mas **a
        // propriedade que o caso protege e a mesma**: a altura do controle sai
        // de `design/tokens.json` e nao de uma constante do SDK que muda numa
        // atualizacao sem ninguem reparar.
        //
        // No `Tab` quem pagava era `height`; no `ChoiceChip` e o `padding`
        // vertical, porque o M3 nao expoe altura no chip. A conta mudou de
        // dono, e o caso segue o dono.
        await _montar(tester, recebidos: const <Map<String, dynamic>>[]);

        for (final ChoiceChip chip
            in tester.widgetList<ChoiceChip>(find.byType(ChoiceChip))) {
          final padding = chip.padding;
          expect(
            padding,
            isA<EdgeInsets>(),
            reason: 'REPROVA: o chip da caixa nao declara `padding`. Sem ele o '
                '`ChoiceChip` do M3 fica em 32 dp de altura, abaixo do piso '
                'de 48, e nada acusa -- e o alvo volta a depender do padrao do '
                'SDK.',
          );
          expect(
            (padding as EdgeInsets).top,
            BichuEspaco.e3,
            reason: 'REPROVA: a folga vertical do chip nao vem do token do '
                'produto. Ela e o que paga o piso de '
                '${BichuAlvoDeToque.min} dp sobre os 32 dp do `ChoiceChip`, e '
                'um numero solto aqui e um alvo que encolhe no dia em que o '
                'M3 mudar o padrao dele.',
          );
          expect((padding).bottom, BichuEspaco.e3);
        }
      },
    );
  });

  group('CHIPS: trocar de caixa e VOLTAR não recomeça a lista', () {
    // Era `ABAS: ...`. Ver o grupo `CHIPS: a forma do controle` para a troca
    // de forma de 28/10/2026; o que estes casos cobram -- a pagina ja vista
    // nao perguntar de novo, e a caixa sobreviver ao `push` do perfil -- nao
    // mudou, e continua saindo de `_caixa` e de `_paginas`.
    testWidgets(
      'ISCA: voltar para a aba já vista NÃO pergunta de novo, e NÃO mostra a roda',
      (tester) async {
        await _montar(
          tester,
          recebidos: <Map<String, dynamic>>[
            _pedido(
              ref: 'r1',
              estado: 'pending_received',
              apelido: 'ana-do-bairro',
            ),
          ],
          enviados: <Map<String, dynamic>>[
            _pedido(ref: 'e1', estado: 'pending_sent', apelido: 'cleide'),
          ],
        );

        // LINHA DE BASE MEDIDA, e não suposta: a montagem pede `Recebidos`
        // uma vez e `Enviados` nenhuma.
        expect(_chamadasDeLista('received'), 1);
        expect(_chamadasDeLista('sent'), 0);
        expect(find.text('@ana-do-bairro'), findsOneWidget);

        // IDA: `Enviados` é inédita e TEM de perguntar. Sem este contrapeso o
        // caso ficaria verde com uma tela que nunca carrega nada.
        await tester.tap(find.widgetWithText(ChoiceChip, 'Enviados'));
        await tester.pumpAndSettle();
        expect(
          _chamadasDeLista('sent'),
          1,
          reason: 'REPROVA: a caixa inédita não foi carregada',
        );
        expect(find.text('@cleide'), findsOneWidget);

        // VOLTA: `Recebidos` já foi vista. UM pump, de propósito -- a roda,
        // se existisse, apareceria neste quadro e `pumpAndSettle` a esconderia.
        await tester.tap(find.widgetWithText(ChoiceChip, 'Recebidos'));
        await tester.pump();

        expect(
          find.byType(CircularProgressIndicator),
          findsNothing,
          reason:
              'REPROVA: voltar para a aba já vista mostra a roda, e a lista '
              'está recomeçando do zero. É a perda que o comentário do `push` '
              'em `_nomeDeQuemPediu` já citava sobre o `go`.',
        );
        expect(
          find.text('@ana-do-bairro'),
          findsOneWidget,
          reason: 'REPROVA: a lista de `Recebidos` não voltou com a aba',
        );

        await tester.pumpAndSettle();
        expect(
          _chamadasDeLista('received'),
          1,
          reason:
              'REPROVA: voltar para `Recebidos` perguntou a lista ao servidor '
              'outra vez. Foram ${_chamadasDeLista('received')} chamadas, e '
              'a montagem já tinha feito a única que este caso aceita.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: depois de ACEITAR, a outra caixa é perguntada de novo',
      (tester) async {
        // O guardado não pode sobreviver a uma ação: aceitar muda a lista NO
        // SERVIDOR, e aí o que está na mão virou mentira nas duas caixas.
        await _montar(
          tester,
          recebidos: <Map<String, dynamic>>[
            _pedido(
              ref: 'r1',
              estado: 'pending_received',
              apelido: 'ana-do-bairro',
            ),
          ],
          enviados: <Map<String, dynamic>>[
            _pedido(ref: 'e1', estado: 'pending_sent', apelido: 'cleide'),
          ],
        );

        await tester.tap(find.widgetWithText(ChoiceChip, 'Enviados'));
        await tester.pumpAndSettle();
        expect(_chamadasDeLista('sent'), 1);

        await tester.tap(find.widgetWithText(ChoiceChip, 'Recebidos'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Aceitar'));
        await tester.pumpAndSettle();

        await tester.tap(find.widgetWithText(ChoiceChip, 'Enviados'));
        await tester.pumpAndSettle();
        expect(
          _chamadasDeLista('sent'),
          2,
          reason:
              'REPROVA: depois da ação, `Enviados` foi desenhada a partir do '
              'que estava guardado. O `_paginas.clear()` de `_agir` é o que '
              'impede isso.',
        );
      },
    );

    testWidgets(
      'ISCA: ir ao perfil e VOLTAR devolve a aba `Enviados`, sem recarregar',
      (tester) async {
        // É ESTE o caminho que o comentário do `push` em `_nomeDeQuemPediu`
        // protege, por extenso: *"voltar dele tem de devolver a caixa que a
        // pessoa estava olhando -- `go` trocaria de ramo e a lista voltaria em
        // `Recebidos` do zero"*. Com o controle virando aba, o `TabController`
        // passou a ser a outra metade dessa promessa.
        await _montarComRoteador(
          tester,
          recebidos: const <Map<String, dynamic>>[],
          enviados: <Map<String, dynamic>>[
            _pedido(
              ref: 'e9',
              estado: 'pending_sent',
              apelido: 'carla-da-praca',
              nome: 'Carla',
            ),
          ],
        );

        await tester.tap(find.widgetWithText(ChoiceChip, 'Enviados'));
        await tester.pumpAndSettle();
        expect(_chamadasDeLista('sent'), 1);

        await tester.tap(find.text('@carla-da-praca'));
        await tester.pumpAndSettle();
        expect(_textoDaTela(tester), contains('perfil aberto: carla-da-praca'));

        GoRouter.of(
          tester.element(find.text('perfil aberto: carla-da-praca')),
        ).pop();
        await tester.pumpAndSettle();

        // A CAIXA ESCOLHIDA, LIDA NO CHIP SELECIONADO (28/10/2026).
        //
        // Era `barra.controller?.index`. O `TabController` saiu com a troca de
        // forma -- `_caixa` sempre foi quem guardava a escolha, e o
        // controlador existia para a BARRA e nao para a memoria. O caso
        // continua cobrando a mesma coisa pelo novo dono do estado.
        final selecionado = tester
            .widgetList<ChoiceChip>(find.byType(ChoiceChip))
            .where((ChoiceChip c) => c.selected)
            .single;
        expect(
          (selecionado.label as Text).data,
          TelaDePedidosDeConexao.rotuloDaCaixa(CaixaDePedidos.enviados),
          reason:
              'REPROVA: voltar do perfil devolveu a tela em `Recebidos`. É '
              'exatamente o que o comentário do `push` diz que o `go` faria, '
              'e um estado refeito a cada `build` reintroduz a perda pelo '
              'outro lado.',
        );
        expect(
          find.text('@carla-da-praca'),
          findsOneWidget,
          reason: 'REPROVA: a lista de `Enviados` não voltou com a aba',
        );
        expect(
          _chamadasDeLista('sent'),
          1,
          reason: 'REPROVA: voltar do perfil recarregou a caixa do zero',
        );
      },
    );
  });
}

/// Quantas vezes a tela pediu a LISTA de uma direção.
///
/// **O resumo (`/connections/summary`) NÃO entra.** Ele é outra rota, e a tela
/// o pede em paralelo com cada carga de lista; contar os dois juntos faria
/// este número dobrar sem dizer nada sobre recarga de caixa.
int _chamadasDeLista(String direcao) => chamadas
    .where(
      (String c) =>
          c.contains('/connections/requests') &&
          c.contains('direction=$direcao'),
    )
    .length;

/// Todo texto desenhado pela tela, junto.
String _textoDaTela(WidgetTester tester) {
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

/// Todo rotulo de semantica que a tela escreve.
///
/// Le os `Semantics` da arvore de WIDGETS, e nao a arvore compilada: e nos
/// `Semantics` que esta tela poe o rotulo da porta do perfil.
String _semanticaDaTela(WidgetTester tester) {
  final partes = <String>[];
  for (final e in find.byType(Semantics).evaluate()) {
    final p = (e.widget as Semantics).properties;
    partes.addAll(<String>[p.label ?? '', p.value ?? '', p.hint ?? '']);
  }
  return partes.join('\n');
}

/// A rota de perfil DESTA BANCADA: o caminho de producao, o desenho dublado.
///
/// O caminho e `Rotas.perfilDePessoa`, o de verdade -- e e por ele que um
/// destino montado a mao (`'/pessoa/' + apelido`, ou `/perfil/...`) reprova.
/// Ela escreve o apelido que chegou no parametro, que e a metade que distingue
/// "abriu um perfil" de "abriu O perfil certo".
GoRoute _rotaDoPerfilDublada() => GoRoute(
  path: Rotas.perfilDePessoa,
  builder: (context, estado) => Scaffold(
    body: Text(
      'perfil aberto: ${estado.pathParameters[Rotas.parametroDoApelido]}',
    ),
  ),
);

/// A MESMA bancada de `_montar`, com roteador de verdade em volta.
///
/// `_montar` usa `MaterialApp(home:)`, e `context.push` precisa de um
/// `GoRouter` na arvore -- sem ele o toque levantaria excecao e o caso
/// reprovaria pelo motivo errado. Os dubles de servidor sao os mesmos.
Future<void> _montarComRoteador(
  WidgetTester tester, {
  required List<Map<String, dynamic>> recebidos,
  List<Map<String, dynamic>> enviados = const <Map<String, dynamic>>[],
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
    if (caminho.endsWith('/connections/summary')) return _json(_resumo());
    if (pedido.method == 'DELETE') return http.Response('', 204);
    return _json(<String, dynamic>{}, status: 404);
  });

  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-de-teste',
  );

  await tester.pumpWidget(
    MaterialApp.router(
      theme: BichuTheme.claro,
      routerConfig: GoRouter(
        initialLocation: '/pedidos-nesta-bancada',
        routes: <RouteBase>[
          GoRoute(
            path: '/pedidos-nesta-bancada',
            // `Scaffold` da BANCADA desde 28/10/2026: esta tela virou a aba
            // `Pendentes` de `conexoes/tela_de_conexoes.dart`, e quem desenha
            // a barra agora e a casca. Sem um `Material` ancestral os botoes
            // do cartao nem montam.
            builder: (context, estado) => Scaffold(
              body: TelaDePedidosDeConexao(conexoes: ConexoesApi(api)),
            ),
          ),
          _rotaDoPerfilDublada(),
        ],
      ),
    ),
  );
  await tester.pumpAndSettle();
}
