// A tela do perfil de OUTRA pessoa, e as quatro ausências que ela precisa
// provar — medidas NO APARELHO, e não só no contrato.
//
// A decisão do cliente, 19/10/2026, literal: *"ele pode ver nome, quantidade de
// pets, conexões, mas não as fotos publicadas e nem a timeline do usuário"*.
//
// ## Por que medir aqui também
//
// O servidor tem as iscas de contrato e de SQL. O que elas NÃO pegam é a tela
// desenhar algo que o servidor não mandou — um nome de pet vindo de outra porta,
// uma grade de fotos montada com `openUrl`, uma frase que promete o que não
// existe. É isso que este arquivo mede.
//
// ## Ancoragem
//
// Toda isca de ausência tem CONTRAPESO, e as ausências são ancoradas em
// **widget** e não só em literal: `findsNothing` sobre um texto que a tela
// deixou de dizer é vacuamente verdadeiro, e isso já enganou este repositório.
// Os literais de controle (`_NOME_DO_PET`, `_URL_ABERTA`) existem só aqui: se
// aparecerem na árvore, é porque a tela os desenhou.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/pessoas_api.dart';
import 'package:bichu/api/seguranca_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/pessoa/tela_perfil_de_pessoa.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/selo_de_validado.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../widgets/palavras_proibidas_no_rotulo.dart';

const String _urlBase = 'https://api.exemplo.test';
const String _apelido = 'marina-vet';

/// Literais de CONTROLE. Nenhum deles pode aparecer na árvore de widgets.
const String _nomeDoPet = 'Bidu-o-terceiro';
const String _urlAberta = 'https://midia.test/aberta/UM-MIL-E-VINTE-E-QUATRO.jpg';
const String _urlDaGrade = 'https://midia.test/grade/TREZENTOS-E-VINTE.jpg';

/// O que a tela pediu ao servidor, na ordem.
final List<String> chamadas = <String>[];

/// Os CORPOS enviados, na ordem. Eles existem porque a reversao de 20/10/2026
/// trouxe DUAS credenciais para a mesma operacao, e o que separa os dois
/// caminhos nao e a rota -- e o que vai dentro.
final List<String> corpos = <String>[];

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) {
  return http.Response(
    jsonEncode(corpo),
    status,
    headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
  );
}

Map<String, dynamic> _perfil({
  required String estado,
  String? ref,
  int pets = 3,
  int conexoes = 12,
  String? nome = 'Marina',
  List<Map<String, dynamic>>? vitrine,
  // **Padrao `false`**, como no dublê de conexoes do servidor: perfil que o caso
  // nao mencionou nao e perfil validado, e um padrao `true` faria a isca do selo
  // ausente ficar verde sem medir nada.
  bool validado = false,
}) {
  return <String, dynamic>{
    'handle': _apelido,
    'public_ref': 'AbCdEfGhIjKlMnOpQrStUv',
    'display_name': nome,
    'pets_count': pets,
    'connections_count': conexoes,
    'connection_state': estado,
    'contact_channel_verified': validado,
    'connection_ref': ref,
    // `?vitrine` OMITE a chave quando nula -- que e exatamente o que a borda
    // faz com `showcase` para quem nao e conexao. Ausente e `[]` sao estados
    // diferentes, e este fixture precisa conseguir produzir os dois.
    'showcase': ?vitrine,
  };
}

List<Map<String, dynamic>> get _duasFotos => <Map<String, dynamic>>[
  <String, dynamic>{'grid_url': _urlDaGrade, 'open_url': _urlAberta, 'alt_text': 'o quintal'},
  <String, dynamic>{
    'grid_url': '$_urlDaGrade?dois',
    'open_url': '$_urlAberta?dois',
    'alt_text': null,
  },
];

Future<void> _montar(
  WidgetTester tester, {
  required Map<String, dynamic> perfil,
  int status = 200,
  String? tokenDoConvite,
  bool podeAgir = true,
}) async {
  chamadas.clear();
  corpos.clear();
  AppConfig.limparParaTeste();
  final cliente = MockClient((http.Request pedido) async {
    chamadas.add('${pedido.method} ${pedido.url.path}');
    if (pedido.body.isNotEmpty) corpos.add(pedido.body);
    if (pedido.url.path.contains('/people/')) {
      if (status != 200) {
        // O `type` casa com o status DE PROPOSITO: `ProblemTipo` sai do `type`
        // e nao do codigo HTTP, e a primeira versao deste arquivo mandava
        // `not-found` com status 500 -- a tela lia 404 e o caso de falha de
        // rede media o ramo errado.
        return _json(<String, dynamic>{
          'type': status == 404
              ? 'https://api.bichu.app/problems/not-found'
              : 'https://api.bichu.app/problems/internal-error',
          'title': status == 404 ? 'Não encontramos isso' : 'Erro interno',
          'status': status,
        }, status: status);
      }
      return _json(perfil);
    }
    if (pedido.method == 'DELETE') return http.Response('', 204);
    if (pedido.url.path.contains('/acceptance')) {
      return _json(<String, dynamic>{
        'ref': 'r1',
        'state': 'connected',
        'requested_at': '2026-10-19T12:00:00.000Z',
        'person': <String, dynamic>{'handle': _apelido, 'display_name': 'Marina'},
      });
    }
    if (pedido.url.path.endsWith('/connections')) {
      return _json(<String, dynamic>{
        'ref': 'r9',
        'state': 'pending_sent',
        'requested_at': '2026-10-19T12:00:00.000Z',
        'person': <String, dynamic>{'handle': _apelido, 'display_name': 'Marina'},
      }, status: 201);
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
      home: TelaDePerfilDePessoa(
        apelido: _apelido,
        pessoas: PessoasApi(api),
        conexoes: ConexoesApi(api),
        seguranca: SegurancaApi(api),
        podeAgirNaComunidade: podeAgir,
        tokenDoConvite: tokenDoConvite,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Todo texto que a tela desenhou, numa cadeia só. É sobre isto que as iscas de
/// literal de controle trabalham.
String _textoDaTela(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((t) => t.data ?? '')
      .join('\u0001');
}

void main() {
  // ------------------------------------------------------------------
  // ISCA (a): A VITRINE NÃO SAI PARA QUEM NÃO É CONEXÃO
  // ------------------------------------------------------------------

  testWidgets('ISCA (a): nao-conexao NAO recebe foto da vitrine', (tester) async {
    // O servidor omite `showcase` — é o que a borda faz quando o estado não é
    // `connected`. A tela não pode desenhar grade nenhuma.
    await _montar(tester, perfil: _perfil(estado: 'none'));

    // ANCORADO NO WIDGET: nenhuma `ImagemDaRede`, que é a única peça com que
    // esta tela desenha foto de servidor. Um `findsNothing` sobre um texto
    // seria vacuamente verdadeiro.
    expect(find.byType(ImagemDaRede), findsNothing);
    expect(find.byType(GridView), findsNothing);
    // E nenhuma URL de derivada atravessou para a árvore.
    expect(_textoDaTela(tester).contains(_urlDaGrade), isFalse);
    expect(_textoDaTela(tester).contains(_urlAberta), isFalse);
    // A frase diz o que a conexão ABRE, e não o que está proibido.
    expect(find.text('As fotos aparecem para quem é conexão.'), findsOneWidget);
  });

  testWidgets('ISCA (a): pedido pendente ainda nao e conexao, e tambem nao mostra foto', (
    tester,
  ) async {
    await _montar(tester, perfil: _perfil(estado: 'pending_received', ref: 'r1'));
    expect(find.byType(ImagemDaRede), findsNothing);
    expect(find.text('As fotos aparecem para quem é conexão.'), findsOneWidget);
    // E o estado está dito: a pessoa precisa saber que há uma decisão pendente.
    expect(find.text('Esta pessoa quer se conectar com você.'), findsOneWidget);
  });

  testWidgets('CONTRAPESO (a): conexao aceita ve a grade, e com a derivada de 320', (
    tester,
  ) async {
    // Sem este caso, as iscas acima passariam num mundo em que a tela nunca
    // desenha foto — que é a forma mais fácil de um teste de omissão ficar
    // verde sem ter medido nada.
    await _montar(
      tester,
      perfil: _perfil(estado: 'connected', ref: 'r1', vitrine: _duasFotos),
    );

    final imagens = tester.widgetList<ImagemDaRede>(find.byType(ImagemDaRede)).toList();
    expect(imagens.length, 2);
    // **A GRADE PEDE `grid_url`, NUNCA `open_url`.** A de 1024 px é 1,6x mais
    // dado do que a célula pinta, e a grade desenha até nove de uma vez.
    expect(imagens.first.url, _urlDaGrade);
    for (final imagem in imagens) {
      expect(
        imagem.url.startsWith(_urlAberta),
        isFalse,
        reason: 'a célula pediu a derivada ABERTA: 104 dp dão 312 px reais a 3x, e a de 1024 px é desperdício multiplicado por nove',
      );
    }
    // O texto alternativo chega como descrição, e nulo é decorativo.
    expect(imagens.first.descricao, 'o quintal');
    expect(imagens.last.descricao, isNull);
    // E a frase de "só para conexão" NÃO aparece para quem é conexão.
    expect(find.text('As fotos aparecem para quem é conexão.'), findsNothing);
  });

  testWidgets('conexao SEM foto tem frase propria: "nao pode ver" seria falso para ela', (
    tester,
  ) async {
    await _montar(
      tester,
      perfil: _perfil(estado: 'connected', ref: 'r1', vitrine: <Map<String, dynamic>>[]),
    );
    expect(find.text('Esta pessoa ainda não publicou fotos.'), findsOneWidget);
    expect(find.text('As fotos aparecem para quem é conexão.'), findsNothing);
    expect(find.byType(ImagemDaRede), findsNothing);
  });

  // ------------------------------------------------------------------
  // ISCA (b): NADA DE TIMELINE OU PUBLICAÇÃO
  // ------------------------------------------------------------------

  testWidgets('ISCA (b): nao-conexao NAO recebe timeline nem publicacao', (tester) async {
    await _montar(tester, perfil: _perfil(estado: 'none'));
    final texto = _textoDaTela(tester);
    // Varre o VOCABULÁRIO de timeline na árvore inteira. A tela não tem como
    // desenhar nenhum dos dois, porque o modelo não os carrega — e este caso é
    // o que acusa se alguém os acrescentar.
    for (final proibido in <String>[
      'Publicações',
      'Publicacoes',
      'Timeline',
      'Linha do tempo',
      'Seguidores',
      'Seguindo',
      'Curtidas',
      'Comentários',
    ]) {
      expect(
        texto.contains(proibido),
        isFalse,
        reason: '"$proibido" apareceu na tela: a timeline não existe no produto (migração 20261018000030)',
      );
    }
    // E a tela não pediu rota nenhuma de publicação.
    expect(chamadas.any((c) => c.contains('publication')), isFalse);
    expect(chamadas.any((c) => c.contains('timeline')), isFalse);
  });

  testWidgets('CONTRAPESO (b): a tela NAO esta vazia -- as tres coisas liberadas estao la', (
    tester,
  ) async {
    // Sem ele, a isca (b) passaria numa tela em branco. Rótulo de semântica
    // VAZIO fazendo `isNot(contains())` passar sem significar nada já enganou
    // este repositório.
    await _montar(tester, perfil: _perfil(estado: 'none'));
    expect(find.text('Marina'), findsWidgets);
    expect(find.text('3 pets'), findsOneWidget);
    expect(find.text('12 conexões'), findsOneWidget);
  });

  // ------------------------------------------------------------------
  // ISCA (c): PET É CONTAGEM, E SÓ CONTAGEM
  // ------------------------------------------------------------------

  testWidgets('ISCA (c): a tela mostra a CONTAGEM de pets, e nunca nome nem miniatura', (
    tester,
  ) async {
    // O servidor manda um campo que o contrato NÃO tem, com o nome de um pet
    // dentro: é o cenário de "alguém acrescentou no servidor". A tela não pode
    // desenhá-lo, porque o modelo não o lê.
    final comPetInventado = _perfil(estado: 'connected', ref: 'r1', vitrine: _duasFotos);
    comPetInventado['pets'] = <Map<String, dynamic>>[
      <String, dynamic>{'name': _nomeDoPet, 'photo_url': _urlAberta},
    ];
    await _montar(tester, perfil: comPetInventado);

    expect(find.text('3 pets'), findsOneWidget);
    expect(
      _textoDaTela(tester).contains(_nomeDoPet),
      isFalse,
      reason: 'o nome de um pet chegou à tela: o item 7 do ADR-0010 vale para tudo que não é a contagem',
    );
    // E nenhuma das imagens da tela é a foto do pet.
    for (final imagem in tester.widgetList<ImagemDaRede>(find.byType(ImagemDaRede))) {
      expect(imagem.url.startsWith(_urlAberta), isFalse);
    }
  });

  testWidgets('ISCA (c): a contagem de pets NAO e tocavel: nao ha para onde ir', (
    tester,
  ) async {
    await _montar(tester, perfil: _perfil(estado: 'connected', ref: 'r1'));
    // A lista de pets de outra pessoa não existe, e um toque que não leva a
    // nada é pior do que nenhum. Ancorado no widget: o texto da contagem não
    // tem ancestral clicável.
    expect(
      find.ancestor(of: find.text('3 pets'), matching: find.byType(InkWell)),
      findsNothing,
    );
    expect(
      find.ancestor(of: find.text('12 conexões'), matching: find.byType(InkWell)),
      findsNothing,
    );
  });

  testWidgets('ISCA (c): singular e plural, para "1 pets" nao chegar a tela', (tester) async {
    await _montar(tester, perfil: _perfil(estado: 'none', pets: 1, conexoes: 1));
    expect(find.text('1 pet'), findsOneWidget);
    expect(find.text('1 conexão'), findsOneWidget);
  });

  testWidgets('ISCA (c): nem cidade nem bairro, e nenhum UUID na tela', (tester) async {
    final comExtras = _perfil(estado: 'connected', ref: 'r1');
    comExtras['city'] = 'Belo Horizonte';
    comExtras['neighbourhood'] = 'Savassi';
    comExtras['id'] = '018f3a2b-0000-7000-8000-0000000000bb';
    await _montar(tester, perfil: comExtras);

    final texto = _textoDaTela(tester);
    expect(texto.contains('Belo Horizonte'), isFalse, reason: 'ele não mencionou cidade em 19/10/2026');
    expect(texto.contains('Savassi'), isFalse, reason: 'ele não mencionou bairro em 19/10/2026');
    expect(
      RegExp(
        r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
      ).hasMatch(texto),
      isFalse,
      reason: 'UUID interno em tela é o item 6 do ADR-0010',
    );
  });

  // ------------------------------------------------------------------
  // ISCA (d): 404 — E A TELA NÃO DIZ POR QUÊ
  // ------------------------------------------------------------------

  testWidgets('ISCA (d): perfil inexistente ou invisivel mostra UMA frase e uma saida', (
    tester,
  ) async {
    await _montar(tester, perfil: _perfil(estado: 'none'), status: 404);

    expect(find.text('Não encontramos esta pessoa.'), findsOneWidget);
    // **NENHUMA explicação do motivo.** Os cinco caminhos do 404 são
    // indistinguíveis de propósito: descobrir que foi bloqueado é o que gera
    // retaliação.
    final texto = _textoDaTela(tester);
    for (final proibido in <String>[
      'bloqueou',
      'bloqueada',
      'desabilitada',
      'desativada',
      'não existe',
      'inexistente',
      'denunciou',
    ]) {
      expect(
        texto.contains(proibido),
        isFalse,
        reason: '"$proibido" na tela é o oráculo que o ADR-0021 recusa',
      );
    }
    // E não há "tentar de novo": 404 é um desfecho, não uma falha de rede.
    expect(find.text('Tentar de novo'), findsNothing);
    expect(find.text('Voltar'), findsOneWidget);
    // Sem alvo não há a quem endereçar denúncia: o menu não é desenhado.
    expect(find.byIcon(Icons.more_vert), findsNothing);
  });

  testWidgets('CONTRAPESO (d): a MESMA tela desenha o perfil quando o servidor responde 200', (
    tester,
  ) async {
    // Sem ele, a isca (d) passaria numa tela que sempre diz "não encontramos".
    await _montar(tester, perfil: _perfil(estado: 'none'));
    expect(find.text('Não encontramos esta pessoa.'), findsNothing);
    expect(find.text('Marina'), findsWidgets);
  });

  testWidgets('falha de rede NAO e 404: ela tem "Tentar de novo" e nao a frase do 404', (
    tester,
  ) async {
    await _montar(tester, perfil: _perfil(estado: 'none'), status: 500);
    expect(find.text('Não encontramos esta pessoa.'), findsNothing);
    expect(find.text('Tentar de novo'), findsOneWidget);
  });

  // ------------------------------------------------------------------
  // A DENÚNCIA EXISTENTE, LIGADA — E NADA DE MODERAÇÃO NOVA
  // ------------------------------------------------------------------

  testWidgets('o "⋮" da barra existe em TODOS os estados com alvo, e e o menu que JA existia', (
    tester,
  ) async {
    for (final estado in <String>['none', 'pending_sent', 'pending_received', 'connected']) {
      await _montar(tester, perfil: _perfil(estado: estado, ref: 'r1'));
      expect(
        find.byIcon(Icons.more_vert),
        findsOneWidget,
        reason: 'o "⋮" sumiu no estado `$estado`: ele é o único acesso a denunciar e bloquear',
      );
    }
  });

  testWidgets('o menu oferece denunciar e bloquear, e NADA de moderacao nova', (tester) async {
    await _montar(tester, perfil: _perfil(estado: 'none'));
    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();

    expect(find.text('Denunciar este perfil'), findsOneWidget);
    expect(find.text('Bloquear'), findsOneWidget);
    // **Modelo mínimo por decisão do cliente: quem modera é o administrador, no
    // backoffice.** Nenhum item de moderação foi acrescentado nesta tela.
    for (final proibido in <String>[
      'Ocultar palavras',
      'Filtrar palavras',
      'Silenciar',
      'Restringir',
      'Minhas denúncias',
      'Status da denúncia',
    ]) {
      expect(find.text(proibido), findsNothing, reason: '"$proibido" é moderação que o cliente não pediu');
    }
  });

  // ------------------------------------------------------------------
  // A PORTA DE PEDIR CONEXÃO
  // ------------------------------------------------------------------

  // ESTE CASO FOI **INVERTIDO** EM 21/10/2026, E NÃO APAGADO.
  //
  // O QUE ELE DIZIA: *"SEM convite na mão, a porta de pedir conexão NÃO é
  // desenhada"*, e o motivo escrito era que *"`POST /connections` recebe um
  // TOKEN DE CONVITE, nunca um apelido, e não existe emissor de convite em
  // produção: um botão aqui desenharia um caminho que o servidor recusa com
  // 404"*.
  //
  // **As duas metades daquele motivo deixaram de valer, e por decisões
  // diferentes:** o cliente reverteu a recusa do apelido em 20/10/2026 (o
  // `ConnectionInvite` do contrato passou a ser um `oneOf` de uma das duas
  // credenciais), e o emissor de convite PASSOU A EXISTIR — é
  // `issueConnectionInvite`, que alimenta o QR de `Convide tutores`.
  //
  // O que o caso mede agora é o outro lado da mesma afirmação: a porta aparece
  // nos dois casos, e **a credencial que viaja é diferente em cada um**. É essa
  // diferença que o servidor grava como procedência (`invite_link` contra
  // `people_search`), e mandar o apelido de quem chegou por um convite
  // registraria uma busca que não houve.
  testWidgets('SEM convite na mao, a porta aparece e pede por APELIDO', (
    tester,
  ) async {
    await _montar(tester, perfil: _perfil(estado: 'none'));
    expect(
      find.text('Pedir conexão'),
      findsOneWidget,
      reason: 'REPROVA: a porta de pedir não aparece sem convite. Desde '
          '20/10/2026 o pedido aceita apelido, e esta tela é o destino da aba '
          '`Usuários` -- sem o botão, o cartão de resultado levaria a uma '
          'página sem ação.',
    );

    await tester.tap(find.text('Pedir conexão'));
    await tester.pumpAndSettle();

    expect(
      corpos.last,
      contains('"handle"'),
      reason: 'REPROVA: o pedido sem convite não foi por apelido. Corpos: '
          '$corpos',
    );
    expect(
      corpos.last,
      isNot(contains('invite_token')),
      reason: 'REPROVA: o corpo levou as duas credenciais. O `oneOf` do '
          'contrato recusa corpo com as duas e corpo com nenhuma.',
    );
  });

  testWidgets('CONTRAPESO: COM convite na mao, a porta pede por TOKEN', (
    tester,
  ) async {
    // **O token GANHA quando existe**, e a escolha não é indiferente: é ele
    // que o servidor grava como procedência.
    await _montar(
      tester,
      perfil: _perfil(estado: 'none'),
      tokenDoConvite: 'convite-de-teste',
    );
    expect(find.text('Pedir conexão'), findsOneWidget);

    await tester.tap(find.text('Pedir conexão'));
    await tester.pumpAndSettle();
    expect(
      chamadas.any((c) => c.endsWith('/connections')),
      isTrue,
      reason: 'esta é a primeira tela do app a chamar `ConexoesApi.pedir`, e é por aqui que H′ e H″ ligam',
    );
    expect(
      corpos.last,
      contains('"invite_token"'),
      reason: 'REPROVA: com convite na mão o corpo não levou o token. '
          'Corpos: $corpos',
    );
    expect(
      corpos.last,
      isNot(contains('handle')),
      reason: 'REPROVA: o corpo levou as duas credenciais.',
    );
  });

  testWidgets('ISCA: sem e-mail verificado a porta de pedir NAO aparece, com convite ou sem', (
    tester,
  ) async {
    // A MESMA porta de `podeCriarNaComunidade`: pedir conexão é ação de
    // comunidade, e política nova não foi inventada aqui.
    //
    // **Esta é a guarda que SOBREVIVEU à reversão de 20/10/2026**, e é por
    // isso que o caso ficou: o que caiu foi a exigência do convite, e não a da
    // permissão. Os dois caminhos passam por ela.
    for (final comConvite in <bool>[true, false]) {
      await _montar(
        tester,
        perfil: _perfil(estado: 'none'),
        tokenDoConvite: comConvite ? 'convite-de-teste' : null,
        podeAgir: false,
      );
      expect(
        find.text('Pedir conexão'),
        findsNothing,
        reason: 'REPROVA: com comConvite=$comConvite e sem e-mail verificado a '
            'porta de pedir apareceu. A régua é sessão E e-mail confirmado, a '
            'mesma de `podeCriarNaComunidade`, e a trava de verdade é do '
            'servidor.',
      );
    }
  });

  // ------------------------------------------------------------------
  // OS TRÊS ESTADOS DA RELAÇÃO, E AS AÇÕES DE CADA UM
  // ------------------------------------------------------------------

  testWidgets('pedido RECEBIDO: aceitar e recusar, e o `ref` que viaja e o da ARESTA', (
    tester,
  ) async {
    await _montar(tester, perfil: _perfil(estado: 'pending_received', ref: 'r1'));
    expect(find.text('Aceitar'), findsOneWidget);
    expect(find.text('Recusar'), findsOneWidget);

    await tester.tap(find.text('Aceitar'));
    await tester.pumpAndSettle();
    expect(chamadas.any((c) => c.contains('/connections/r1/acceptance')), isTrue);
  });

  testWidgets('pedido ENVIADO: cancelar, e NENHUMA palavra sobre recusa', (tester) async {
    await _montar(tester, perfil: _perfil(estado: 'pending_sent', ref: 'r1'));
    expect(find.text('Cancelar pedido'), findsOneWidget);
    expect(find.text('Aceitar'), findsNothing);
    // A recusa é silenciosa: o servidor não manda `declined`, e não há ramo
    // nesta tela que o desenhe.
    final texto = _textoDaTela(tester);
    expect(texto.contains('recusou'), isFalse);
    expect(texto.contains('Recusado'), isFalse);

    await tester.tap(find.text('Cancelar pedido'));
    await tester.pumpAndSettle();
    expect(chamadas.any((c) => c == 'DELETE /v1/connections/r1'), isTrue);
  });

  testWidgets('CONEXAO ACEITA: desfazer, e nenhum pedido a mais', (tester) async {
    await _montar(tester, perfil: _perfil(estado: 'connected', ref: 'r1'));
    expect(find.text('Vocês estão conectados.'), findsOneWidget);
    expect(find.text('Desfazer conexão'), findsOneWidget);
    expect(find.text('Pedir conexão'), findsNothing);
  });

  testWidgets('sem nome de exibicao a tela cai para o apelido, e nao repete a linha', (
    tester,
  ) async {
    await _montar(tester, perfil: _perfil(estado: 'none', nome: null));
    // DUAS vezes, e as duas sao as mesmas de qualquer tela desta casa: o
    // titulo da barra de topo e o nome no corpo. **Nao ha uma terceira** -- a
    // linha de apoio com `@apelido` e condicional a existir nome de exibicao, e
    // sem nome `nomeParaLer` JA e o apelido. Tres seria a duplicacao que o
    // cliente vem apontando, e e por isso que este caso conta.
    expect(find.text('@$_apelido'), findsNWidgets(2));
  });

  testWidgets('a tela pede UMA coisa ao servidor, e nao varre nada', (tester) async {
    await _montar(tester, perfil: _perfil(estado: 'none'));
    // O `/v1` e do `ApiClient` (ele monta o caminho a partir da base), e nao
    // desta camada: a cadeia aqui e o caminho REAL que saiu no pedido.
    expect(chamadas, <String>['GET /v1/people/$_apelido']);
    // Nenhuma coleção de pessoas, nenhuma busca, nenhuma lista de conexões.
    expect(chamadas.any((c) => c.endsWith('/v1/people')), isFalse);
    expect(chamadas.any((c) => c.contains('search')), isFalse);
    expect(chamadas.any((c) => c == 'GET /connections'), isFalse);
  });

  // =========================================================================
  // O SELO DE VALIDADO (emenda do ADR-0010, 21/10/2026)
  // =========================================================================

  testWidgets('SELO: com canal confirmado, o selo aparece ao lado do NOME no corpo', (
    tester,
  ) async {
    await _montar(tester, perfil: _perfil(estado: 'none', validado: true));
    expect(find.byType(SeloDeValidado), findsOneWidget);
    // **UM, e nao dois.** O titulo da BARRA nao recebe selo: a barra corta em
    // tela estreita (o proprio caso de `@apelido` duas vezes mede isso), e o
    // selo custa 24 dp de um orcamento que ja e o mais apertado da tela.
  });

  testWidgets('SELO: ISCA -- sem canal confirmado, nenhuma roseta na tela', (tester) async {
    await _montar(tester, perfil: _perfil(estado: 'none'));
    expect(find.byType(SeloDeValidado), findsNothing);
    expect(find.byIcon(Icons.verified), findsNothing);
  });

  testWidgets('SELO: sai nos QUATRO estados de conexao, ao contrario da vitrine', (
    tester,
  ) async {
    // **A vitrine e condicionada ao aceite e o selo NAO**, e a diferenca tem
    // razao: a vitrine e conteudo que a pessoa publicou para quem ela aceitou, e
    // o selo e atributo da conta — ele vale igual para quem chega pelo apelido.
    // Condiciona-lo faria a mesma conta aparecer validada numa tela e nao na
    // outra, que e a divergencia que a regua unica existe para impedir.
    for (final String estado in <String>[
      'none',
      'pending_sent',
      'pending_received',
      'connected',
    ]) {
      await _montar(
        tester,
        perfil: _perfil(
          estado: estado,
          ref: estado == 'none' ? null : 'ref-da-aresta-0001',
          validado: true,
        ),
      );
      expect(find.byType(SeloDeValidado), findsOneWidget, reason: 'estado $estado');
    }
  });

  testWidgets('SELO: o rotulo acessivel e `SeloDeValidado.rotulo`, e nada alem', (tester) async {
    // O booleano prova que a pessoa tem um canal de contato confirmado. Ele nao
    // prova documento, identidade nem conferencia humana, e **nao diz qual
    // canal** -- decisao do cliente de 21/10/2026, posterior a aprovacao de
    // "E-mail confirmado" do mesmo dia: *"tem que dizer que o usuario esta
    // confirmado, independente do meio"*.
    await _montar(tester, perfil: _perfil(estado: 'none', validado: true));
    // **`contains` e nao igualdade**: o selo pode cair dentro de um no de
    // semantica da tela, e ai o leitor anuncia o nome e a frase do selo numa
    // parada so. O que este caso cobra e que a frase chegue INTEIRA e sem
    // palavra proibida; a igualdade exata do rotulo do widget e medida em
    // `test/widgets/selo_de_validado_test.dart`.
    final String rotulo = tester.getSemantics(find.byType(SeloDeValidado)).label;
    // **A CONSTANTE, e nunca o literal.** O rotulo e UM para as quatro
    // superficies de terceiro e para a tela do dono; um literal aqui seria a
    // quarta redacao a divergir na primeira edicao.
    expect(rotulo, contains(SeloDeValidado.rotulo));
    // **A VARREDURA COMPARTILHADA**, e nao a lista curta que morava aqui: esta
    // tela tinha a sua propria copia de quatro palavras, e a de
    // `pedidos_de_conexao_test.dart` tinha a mesma copia. Duas listas curtas
    // sao duas definicoes de "rotulo honesto", e nenhuma das duas proibia
    // nomear canal.
    conferirRotuloDoSelo(rotulo, onde: 'o perfil de pessoa');
  });

  testWidgets('SELO: a conta SEM nome de exibicao tambem pode ter selo', (tester) async {
    // `display_name` e anulavel e `nomeParaLer` cai para `@apelido`. **O selo
    // nao cai com ele**: o booleano e sobre a CONTA, e uma conta sem nome de
    // exibicao pode ter confirmado o e-mail.
    await _montar(tester, perfil: _perfil(estado: 'none', nome: null, validado: true));
    expect(find.byType(SeloDeValidado), findsOneWidget);
  });
}
