// A tela `Conexoes` — a lista das PRÓPRIAS conexões, autorizada pelo cliente em
// 22/10/2026: *"o usuário pode abrir a lista de usuários que é sua conexão"*.
//
// **ISTO EMENDA UMA DECISÃO DELE MESMO, DE 18/10/2026**, e as duas metades da
// emenda são medidas aqui:
//
// | | onde |
// |---|---|
// | a PRÓPRIA lista aparece ao dono | os casos de conteúdo, paginação e porta do perfil |
// | a lista de TERCEIRO continua NUNCA | `ISCA DE VAZAMENTO`, que varre o que a tela CHAMA |
//
// A varredura de chamadas é o que importa: o que a tela renderiza prova que a
// própria lista existe, mas só o que ela **pede ao servidor** prova que ela
// nunca pede a de outra pessoa.
//
// Todo esperado está escrito por extenso, com acento: nenhum `expect` compara o
// texto renderizado com a constante que o produz.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/conexoes/tela_minhas_conexoes.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
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

/// Uma pessoa como `ConnectedPerson` a declara: **os cinco campos, e nada
/// mais**. Escrito por extenso de propósito — um ajudante que montasse o corpo
/// a partir do modelo do app mediria o app contra si mesmo.
Map<String, dynamic> _pessoa({
  required String apelido,
  String? nome,
  int pets = 0,
  int conexoes = 0,
  String? foto,
}) {
  return <String, dynamic>{
    'handle': apelido,
    'display_name': nome,
    'pets_count': pets,
    'connections_count': conexoes,
    'photo_icon_url': foto,
  };
}

Map<String, dynamic> _pagina(
  List<Map<String, dynamic>> itens, {
  int? total,
  int page = 1,
}) {
  return <String, dynamic>{
    'items': itens,
    'total': total ?? itens.length,
    'page': page,
    'limit': 20,
  };
}

Map<String, dynamic> _resumo({int conectadas = 12}) {
  return <String, dynamic>{
    'connected_count': conectadas,
    'pending_sent_count': 2,
    'requests_received_count': 1,
    'remaining_requests_today': 7,
    'connection_limit': 150,
    'invited_joined_count': 0,
  };
}

/// O que a tela pediu ao servidor, na ordem. É sobre isto que a `ISCA DE
/// VAZAMENTO` trabalha.
final List<String> chamadas = <String>[];

/// Só o CAMINHO de cada chamada, sem a query. **Separado de [chamadas] por um
/// defeito medido**: a conferência de rota era `chamada.contains('/connections')`,
/// e `'/v1/people/ana/connections'` **contém** aquilo — ou seja, a varredura
/// aceitaria exatamente a lista de terceiro que ela existe para proibir. Medido
/// em 22/10/2026, pela isca deste arquivo, que reprovou quando devia.
///
/// Com o caminho separado a conferência é **igualdade**, e igualdade não tem
/// como aceitar um prefixo a mais.
final List<String> caminhos = <String>[];

Future<void> _montar(
  WidgetTester tester, {
  List<Map<String, dynamic>> primeiraPagina = const <Map<String, dynamic>>[],
  List<Map<String, dynamic>> segundaPagina = const <Map<String, dynamic>>[],
  int? total,
  bool listaFalha = false,
  bool semConta = false,
  bool resumoFalha = false,
}) async {
  chamadas.clear();
  caminhos.clear();
  AppConfig.limparParaTeste();
  final cliente = MockClient((http.Request pedido) async {
    chamadas.add('${pedido.method} ${pedido.url.path}?${pedido.url.query}');
    caminhos.add(pedido.url.path);
    final caminho = pedido.url.path;
    if (caminho.endsWith('/connections/summary')) {
      if (resumoFalha) return _json(<String, dynamic>{}, status: 500);
      return _json(_resumo());
    }
    if (caminho.endsWith('/connections')) {
      if (semConta) {
        return _json(<String, dynamic>{
          'type': 'https://problemas.invalid/problems/unauthenticated',
          'title': 'Entre para continuar',
          'status': 401,
          'next_action': 'sign_in',
        }, status: 401);
      }
      if (listaFalha) return _json(<String, dynamic>{}, status: 500);
      final pagina = int.tryParse(pedido.url.queryParameters['page'] ?? '1') ?? 1;
      return _json(
        pagina == 1
            ? _pagina(primeiraPagina, total: total)
            : _pagina(segundaPagina, total: total, page: pagina),
      );
    }
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
      home: TelaDeMinhasConexoes(conexoes: ConexoesApi(api)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a lista nomeia cada conexão, e mostra as duas contagens', (tester) async {
    await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
      _pessoa(apelido: 'ana-do-bairro', nome: 'Ana', pets: 2, conexoes: 7),
    ]);

    expect(find.text('Ana'), findsOneWidget);
    expect(find.text('2 pets · 7 conexões'), findsOneWidget);
  });

  testWidgets('sem nome de exibição, a linha cai para o apelido', (tester) async {
    await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
      _pessoa(apelido: 'bia-vet', pets: 1, conexoes: 1),
    ]);

    expect(find.text('@bia-vet'), findsOneWidget);
    expect(find.text('1 pet · 1 conexão'), findsOneWidget);
  });

  testWidgets('o resumo mostra o NÚMERO do servidor, ao lado da lista', (tester) async {
    await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
      _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
    ]);

    expect(find.text('Você tem 12 de 150 conexões.'), findsOneWidget);
  });

  /// **A ISCA DE VAZAMENTO ENTRE CONTAS, e é o caso mais importante do
  /// arquivo.**
  ///
  /// A emenda de 22/10/2026 abriu a lista do **próprio dono**. A de terceiro
  /// continua *nunca*, e a prova é o que a tela **pede**: as duas únicas
  /// chamadas são `/connections` e `/connections/summary`, as duas **sem
  /// nenhum apelido**. Uma tela que interpolasse a pessoa no caminho — ou que
  /// a mandasse como parâmetro — apareceria aqui, e nenhum caso de conteúdo
  /// acusaria.
  testWidgets('ISCA DE VAZAMENTO: a tela NUNCA pede a lista de outra pessoa', (tester) async {
    await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
      _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
      _pessoa(apelido: 'bia-vet', nome: 'Bia'),
    ]);

    expect(caminhos, isNotEmpty, reason: 'a varredura não mediu nada: a tela não chamou nada.');
    // 1. O CAMINHO é um dos DOIS da própria conta, por IGUALDADE e não por
    //    `contains`: `/v1/people/ana/connections` *contém* `/connections`, e
    //    uma conferência por substring aceitaria a lista de terceiro.
    for (final caminho in caminhos) {
      expect(
        <String>['/v1/connections', '/v1/connections/summary'],
        contains(caminho),
        reason: 'a tela chamou "$caminho", que não é a lista das próprias conexões nem o '
            'resumo. A lista de TERCEIRO continua não existindo.',
      );
    }
    for (final chamada in chamadas) {
      // 2. NENHUM apelido viaja na chamada — nem no caminho, nem na query. É
      //    por um apelido que a lista de terceiro nasceria.
      for (final apelido in <String>['ana-do-bairro', 'bia-vet']) {
        expect(
          chamada.contains(apelido),
          isFalse,
          reason: 'a chamada "$chamada" carrega o apelido "$apelido". A lista é endereçada '
              'por QUEM CHAMA, que vem do token — nunca por uma pessoa.',
        );
      }
      // 3. E nenhum nome de parâmetro de pessoa.
      for (final proibido in <String>['handle=', 'user=', 'person=', 'of=', 'q=']) {
        expect(
          chamada.contains(proibido),
          isFalse,
          reason: 'a chamada "$chamada" tem "$proibido": seria filtro de pessoa numa lista '
              'que o contrato declara com `page` e `limit` e mais nada.',
        );
      }
    }
  });

  /// **ISCA DA ISCA DE VAZAMENTO.** Sem ela, o caso de cima passaria por a tela
  /// não chamar nada que casasse — e não por a varredura reconhecer um apelido
  /// numa chamada.
  testWidgets('ISCA: a varredura de chamadas REPROVA um apelido no caminho', (tester) async {
    await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
      _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
    ]);

    const String caminhoDeTerceiro = '/v1/people/ana-do-bairro/connections';
    const String chamadaDeTerceiro = 'GET $caminhoDeTerceiro?page=1';

    // (a) A varredura de APELIDO o vê.
    expect(
      chamadaDeTerceiro.contains('ana-do-bairro'),
      isTrue,
      reason: 'a isca passou: a varredura não enxerga um apelido numa chamada, então o '
          'caso acima não mede nada.',
    );

    // (b) A conferência de ROTA o reprova -- e ela só reprova porque é
    //     IGUALDADE. **Este é o defeito que esta isca pegou de verdade**: com
    //     `contains('/connections')`, o caminho de terceiro PASSAVA.
    expect(
      <String>['/v1/connections', '/v1/connections/summary'],
      isNot(contains(caminhoDeTerceiro)),
      reason: 'a isca passou: a conferência de rota aceitaria uma lista de terceiro.',
    );
    expect(
      caminhoDeTerceiro.contains('/connections'),
      isTrue,
      reason: 'a isca passou: o caminho de terceiro nem casaria uma conferência por '
          'substring, então ele não exercita a diferença que importa.',
    );
  });

  /// **Nenhum identificador interno aparece na tela** (ADR-0010 item 6): o que
  /// endereça a pessoa é o apelido. A varredura é sobre o que foi RENDERIZADO,
  /// e não sobre nomes de campo — um campo chamado `pessoa` que carregasse o
  /// UUID passaria por uma conferência de nomes.
  testWidgets('nenhum UUID nem `ref` de aresta aparece na tela', (tester) async {
    const String uuid = '018f3a2b-0000-7000-8000-0000000000aa';
    await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
      _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
    ]);

    expect(find.textContaining(uuid), findsNothing);
    expect(find.textContaining('-0000-7000-'), findsNothing);
    // E nenhum botão de desfazer: desfazer mora no perfil, e a operação é
    // `irreversible_write`. Numa lista que se rola, o gesto que erra o alvo
    // apagaria uma conexão em silêncio.
    for (final proibido in <String>['Desfazer', 'Remover', 'Desconectar', 'Bloquear']) {
      expect(
        find.text(proibido),
        findsNothing,
        reason: 'a lista mostrou "$proibido": nenhuma ação destrutiva mora nesta tela.',
      );
    }
  });

  testWidgets('sem conexões, o vazio diz O QUE FAZER', (tester) async {
    await _montar(tester);

    expect(find.text('Você ainda não tem conexões'), findsOneWidget);
    expect(
      find.textContaining('Busque alguém que você já conhece'),
      findsOneWidget,
    );
  });

  /// Com falha, o vazio **não** é anunciado: *"ainda não tem conexões"* e *"não
  /// consegui perguntar"* são afirmações diferentes, e a primeira seria mentira
  /// em cima da segunda.
  testWidgets('com falha, a tela avisa e NÃO diz que a lista está vazia', (tester) async {
    await _montar(tester, listaFalha: true);

    expect(find.text('Não conseguimos carregar as suas conexões agora.'), findsOneWidget);
    expect(find.text('Você ainda não tem conexões'), findsNothing);
  });

  /// Sem conta o corpo inteiro vira o convite, e **não** a lista com faixa de
  /// erro: sem conta não existe "as próprias conexões", e não há recorte
  /// público desta tela a oferecer.
  ///
  /// ## O QUE ESTE CASO MEDE, E O QUE ELE NÃO MEDE
  ///
  /// Ele mede que o 401 escolhe o ramo do **convite** e não o da faixa de erro.
  /// A prova é a exceção que o `ConviteParaEntrar` levanta nesta bancada:
  /// *"Escopo nao encontrado"* — ele exige o `Escopo` do `main()`, e esta
  /// bancada monta a tela sozinha, de propósito, como a de `Pedidos de
  /// conexão`. **Se o ramo escolhido fosse o da faixa de erro, não haveria
  /// exceção nenhuma**, e o caso reprovaria.
  ///
  /// **Ele NÃO mede o texto do convite.** Esse texto é do catálogo
  /// (`SecaoComConta.minhasConexoes`) e se mede onde o `Escopo` existe —
  /// `estado_de_deslogado_test.dart`, com o app inteiro montado. Dizer aqui que
  /// ele foi medido seria afirmar o que esta bancada não alcança.
  testWidgets('sem conta, a tela escolhe o CONVITE e nao a faixa de erro', (tester) async {
    await _montar(tester, semConta: true);

    final erro = tester.takeException();
    expect(
      erro.toString(),
      contains('Escopo'),
      reason: 'sem conta, a tela tem de montar `ConviteParaEntrar` -- que exige o '
          '`Escopo` do `main()`. Nenhuma exceção aqui significa que o 401 caiu no ramo '
          'da faixa de erro, e sem conta NÃO é erro.',
    );

    // E o que NÃO apareceu: nem a faixa de falha, nem a afirmação de lista
    // vazia. As duas seriam mentira sobre quem não tem conta.
    expect(find.text('Não conseguimos carregar as suas conexões agora.'), findsNothing);
    expect(find.text('Você ainda não tem conexões'), findsNothing);
  });

  testWidgets('o resumo que falha não derruba a lista', (tester) async {
    await _montar(
      tester,
      resumoFalha: true,
      primeiraPagina: <Map<String, dynamic>>[
        _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
      ],
    );

    expect(find.text('Ana'), findsOneWidget);
    expect(find.textContaining('Você tem'), findsNothing);
  });

  /// **O botão da página seguinte aparece pelo `total` do servidor**, e não por
  /// a página ter vindo cheia: uma página cheia que é a última faria o botão
  /// aparecer e trazer vazio.
  testWidgets('com mais conexões que a página, o botão `Ver mais` traz a seguinte', (tester) async {
    await _montar(
      tester,
      total: 2,
      primeiraPagina: <Map<String, dynamic>>[_pessoa(apelido: 'ana-do-bairro', nome: 'Ana')],
      segundaPagina: <Map<String, dynamic>>[_pessoa(apelido: 'bia-vet', nome: 'Bia')],
    );

    expect(find.text('Ana'), findsOneWidget);
    expect(find.text('Bia'), findsNothing);
    expect(find.text('Ver mais'), findsOneWidget);

    await tester.tap(find.text('Ver mais'));
    await tester.pumpAndSettle();

    // A seguinte é ACRESCENTADA: a primeira não desaparece.
    expect(find.text('Ana'), findsOneWidget);
    expect(find.text('Bia'), findsOneWidget);
    expect(find.text('Ver mais'), findsNothing, reason: 'chegou ao total: não há mais página');
    expect(
      chamadas.where((String c) => c.contains('page=2')).length,
      1,
      reason: 'a página seguinte foi pedida UMA vez',
    );
  });

  testWidgets('com a lista completa, o botão `Ver mais` não aparece', (tester) async {
    await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
      _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
    ]);

    expect(find.text('Ver mais'), findsNothing);
  });

  /// A linha inteira é a porta do perfil, e o rótulo do leitor de tela diz o
  /// que o toque **abre** — não o que o controle é.
  testWidgets('a linha é um controle, e o rótulo diz que ela abre o perfil', (tester) async {
    await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
      _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
    ]);

    expect(find.bySemanticsLabel('Abrir o perfil de Ana'), findsOneWidget);
  });

  /// **A foto é a derivada `thumb`, e quem não tem foto pronta fica com a
  /// inicial** — o recurso que a emenda 3 do ADR-0010 manda usar. Foto em
  /// `processing` ou `rejected` não sai do servidor.
  testWidgets('sem foto pronta, o círculo desenha a INICIAL', (tester) async {
    await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
      _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
    ]);

    expect(find.text('A'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });

  // -------------------------------------------------------------------------
  // O BOTAO DE ADICIONAR (pedido do cliente de 22/10/2026)
  // -------------------------------------------------------------------------
  // Palavras dele: *"uma pagina com a listagem dos usuarios **e um botao para
  // adicionar**"*. A listagem saiu em 22/10; **o botao nao**, e uma varredura
  // de 26/10 por cinco caminhos mediu a ausencia: nem por linha, nem na tela.
  //
  // **A POSICAO foi escolha minha**, e por isso ela e MEDIDA e nao suposta: os
  // casos abaixo cobram que o botao fique ACIMA da primeira linha da lista, e o
  // comentario de `_acaoDeBuscar` guarda a razao (o pe da lista fica atras de
  // ate sete toques em `Ver mais`, porque `GET /connections` pagina de 20 em 20
  // com teto de 150).
  //
  // **E ele e UM, nunca um por linha**: o comentario de `_BotaoDeCancelar` em
  // `telas/perfil/meus_eventos.dart` registra que botao por linha *"transforma
  // a lista num campo minado"*, e o caso da contagem e o que impede isso de
  // voltar.
  //
  // **O que estes casos NAO medem:** quantas superficies PEDEM conexao. Este
  // botao so navega, e a contagem de portas e de
  // `telas/onde_se_adiciona_pessoa_test.dart`, que tem um caso proprio para a
  // fronteira.
  group('o botão de adicionar', () {
    testWidgets('a lista tem UM botão `Buscar usuários`, e ele fica ACIMA das linhas',
        (tester) async {
      await _montar(tester, primeiraPagina: <Map<String, dynamic>>[
        _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
        _pessoa(apelido: 'bruno-da-vila', nome: 'Bruno'),
        _pessoa(apelido: 'carla-do-parque', nome: 'Carla'),
      ]);

      final botao = find.text('Buscar usuários');

      // 1. **UM, com TRES linhas na tela.** Esta e a metade que impede o botao
      //    por linha de voltar: com um controle por linha haveria tres.
      expect(
        botao,
        findsOneWidget,
        reason: 'REPROVA: a tela tem ${tester.widgetList(botao).length} botões '
            '`Buscar usuários` com três linhas. Ele é UM — botão por linha '
            'transforma a lista num campo minado.',
      );

      // 2. **ACIMA da primeira linha**, e medido em pixel e nao por ordem de
      //    declaracao: quem le o `build` ve a ordem da lista, mas e a geometria
      //    que a pessoa toca.
      final alturaDoBotao = tester.getTopLeft(botao).dy;
      final alturaDaPrimeiraLinha = tester.getTopLeft(find.text('Ana')).dy;
      expect(
        alturaDoBotao,
        lessThan(alturaDaPrimeiraLinha),
        reason: 'REPROVA: o botão `Buscar usuários` está em $alturaDoBotao e a '
            'primeira linha em $alturaDaPrimeiraLinha — ele desceu para o pé '
            'do corpo. Com teto de 150 conexões paginadas de 20 em 20, o pé '
            'fica atrás de até sete toques em `Ver mais`, e um botão de '
            'adicionar que exige sete toques é o mesmo que ausente.',
      );

      // 3. CONTROLE POSITIVO DA GEOMETRIA: a terceira linha fica abaixo da
      //    primeira. Sem ele, um `getTopLeft` que devolvesse zero para tudo
      //    deixaria o caso 2 verde por empate.
      expect(
        tester.getTopLeft(find.text('Carla')).dy,
        greaterThan(alturaDaPrimeiraLinha),
        reason: 'REPROVA: as linhas não estão empilhadas na tela. A medida de '
            'posição do caso acima não vale.',
      );
    });

    testWidgets('no vazio o botão aparece, e DEPOIS da frase que o explica',
        (tester) async {
      await _montar(tester);

      final botao = find.text('Buscar usuários');
      expect(
        botao,
        findsOneWidget,
        reason: 'REPROVA: o estado vazio não oferece a porta de adicionar. É '
            'a única tela em que o passo seguinte é óbvio.',
      );
      // **DEPOIS da frase, e nao antes:** por a saida acima do *"você ainda
      // não tem conexões"* poria a solução antes do problema.
      expect(
        tester.getTopLeft(botao).dy,
        greaterThan(tester.getTopLeft(find.text('Você ainda não tem conexões')).dy),
        reason: 'REPROVA: no vazio o botão ficou ACIMA da frase que o explica.',
      );
    });

    /// **SEM CONTA ELE NAO NASCE**, e a ausencia e a unica correta: o corpo
    /// inteiro vira o convite, e mandar quem nao tem conta para a busca de
    /// pessoas seria oferecer uma tela que vai pedir login por cima do convite
    /// que resolve o problema dela. A mesma fronteira de `meus_pets.dart`.
    testWidgets('sem conta o botão NÃO nasce', (tester) async {
      await _montar(tester, semConta: true);
      tester.takeException();
      expect(find.text('Buscar usuários'), findsNothing);
    });

    /// O DESTINO, medido de verdade: um roteador com dois ramos, e o toque tem
    /// de pousar no da busca de pessoas **com a aba certa**. Um caso que so
    /// conferisse o rotulo deixaria um botao mudo passar.
    testWidgets('o toque leva à aba `Usuários` da Comunidade', (tester) async {
      await _montarComRoteador(tester, primeiraPagina: <Map<String, dynamic>>[
        _pessoa(apelido: 'ana-do-bairro', nome: 'Ana'),
      ]);

      // CONTROLE POSITIVO: o destino NAO esta na tela antes do toque.
      expect(find.text('CHEGUEI NA REDE'), findsNothing);

      await tester.tap(find.text('Buscar usuários'));
      await tester.pumpAndSettle();

      expect(
        find.text('CHEGUEI NA REDE'),
        findsOneWidget,
        reason: 'REPROVA: o botão não levou a `Rotas.rede`.',
      );
      expect(
        _abaPedida,
        'usuarios',
        reason: 'REPROVA: o botão chegou na `Rede` na aba "$_abaPedida". A aba '
            '`Usuários` é a que tem a busca e o pedido de conexão; qualquer '
            'outra deixa a pessoa a mais um toque do que ela pediu.',
      );
    });
  });
}

/// A aba que a rota `/rede` recebeu no ultimo toque medido.
String? _abaPedida;

/// A mesma bancada de [_montar], **com roteador**: e o que permite medir para
/// onde o botao leva, e nao so que ele existe.
///
/// Dois ramos e nada mais: `Rotas.minhasConexoes` com a tela de verdade, e
/// `Rotas.rede` com um sentinela. Montar a casca inteira traria a barra, as
/// cinco secoes e o `Escopo` -- e o que se mede aqui e UM toque.
Future<void> _montarComRoteador(
  WidgetTester tester, {
  List<Map<String, dynamic>> primeiraPagina = const <Map<String, dynamic>>[],
}) async {
  _abaPedida = null;
  chamadas.clear();
  caminhos.clear();
  AppConfig.limparParaTeste();
  final cliente = MockClient((http.Request pedido) async {
    final caminho = pedido.url.path;
    chamadas.add('${pedido.method} $caminho?${pedido.url.query}');
    caminhos.add(caminho);
    if (caminho.endsWith('/connections/summary')) return _json(_resumo());
    if (caminho.endsWith('/connections')) {
      return _json(_pagina(primeiraPagina, total: primeiraPagina.length));
    }
    return _json(<String, dynamic>{}, status: 404);
  });
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-de-teste',
  );
  final roteador = GoRouter(
    initialLocation: Rotas.minhasConexoes,
    routes: <RouteBase>[
      GoRoute(
        path: Rotas.minhasConexoes,
        builder: (_, _) => TelaDeMinhasConexoes(conexoes: ConexoesApi(api)),
      ),
      GoRoute(
        path: Rotas.rede,
        builder: (_, GoRouterState estado) {
          _abaPedida = estado.uri.queryParameters[Rotas.parametroDaAbaDaRede];
          return const Scaffold(body: Center(child: Text('CHEGUEI NA REDE')));
        },
      ),
    ],
  );
  await tester.pumpWidget(
    MaterialApp.router(theme: BichuTheme.claro, routerConfig: roteador),
  );
  await tester.pumpAndSettle();
}
