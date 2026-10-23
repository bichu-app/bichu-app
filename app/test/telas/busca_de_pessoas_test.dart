// A aba `Usuários` da `Rede`: a busca de pessoas e o cartão de resultado.
//
// As iscas deste arquivo, pelo nome do caso:
//
//   (a) **campo vazio não lista ninguém** — nenhuma chamada sai, e nada é
//       desenhado. Não existe "listar todos", e um estado inicial povoado seria
//       a listagem de pessoas que a reversão de 20/10/2026 não autorizou;
//   (b) **a busca com menos que o piso NÃO busca** — a lupa não habilita e
//       nenhuma requisição sai. O servidor instalado responde 400 abaixo de
//       três caracteres, e descobrir isso por faixa vermelha no meio de alguém
//       escrevendo um nome é o produto discutindo com quem digita;
//   (c) **o resultado TRAZ foto, e nada além dela** — isca INVERTIDA em
//       21/10/2026 por decisão do cliente (*"o resultado tras foto sim, para
//       identificar usuarios com nomes parecidos."*). Ela media a ausência;
//       passa a medir a presença, com contrapeso de que nenhum quinto campo
//       veio junto e nenhum identificador interno entrou (ADR-0010 item 6);
//   (d) **não há gatilho de filtro nesta aba** — cidade e bairro a emenda 2
//       recusa, contagem de pets viraria critério de busca, e sobra ordenar por
//       nome, que é opção única;
//   (e) **o teto do dia substitui a ação, e não a desabilita** — critério 2 da
//       BICHUS-62.
//
// Todo esperado está escrito por extenso, com acento: nenhum `expect` compara o
// texto renderizado com a constante que o produz.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/modelos_pessoa.dart';
import 'package:bichu/api/pessoas_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/rede/busca_de_pessoas.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
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

/// A URL da derivada `thumb`, como o servidor a monta.
const String _urlDaFoto = 'https://midia.exemplo.test/u/ab/cdef/thumb.jpg';

Map<String, dynamic> _pessoa({
  required String apelido,
  String? nome,
  int pets = 2,
  int conexoes = 38,
  /// Nulo reproduz quem não tem foto pronta -- o caso da inicial no círculo.
  String? foto = _urlDaFoto,
}) {
  return <String, dynamic>{
    'handle': apelido,
    'display_name': nome,
    'pets_count': pets,
    'connections_count': conexoes,
    'photo_icon_url': foto,
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

Map<String, dynamic> _resumo({int restamHoje = 7}) {
  return <String, dynamic>{
    'connected_count': 12,
    'pending_sent_count': 2,
    'requests_received_count': 1,
    'remaining_requests_today': restamHoje,
    'connection_limit': 150,
    'invited_joined_count': 0,
  };
}

/// O que a tela pediu ao servidor, na ordem. É sobre isto que as iscas (a) e
/// (b) trabalham: elas afirmam o que a tela **não** pediu.
final List<String> chamadas = <String>[];

/// Os corpos enviados, para a isca de que o pedido vai por APELIDO.
final List<String> corpos = <String>[];

/// A sessao da bancada. Trocar o valor refaz a aba **no mesmo lugar da
/// arvore**, que e a condicao do defeito do estado preso: o `State` sobrevive,
/// e com ele o `_termoAplicado` do 401.
final ValueNotifier<bool> sessao = ValueNotifier<bool>(true);

/// A casca que leva a troca de sessao a aba, como `secao_da_rede.dart` faz com
/// o `AnimatedBuilder` sobre o `ControladorDeSessao`.
class _AbaComSessao extends StatelessWidget {
  const _AbaComSessao({required this.pessoas, required this.conexoes});

  final PessoasApi pessoas;
  final ConexoesApi conexoes;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: sessao,
      builder: (context, logado, _) => BuscaDePessoas(
        pessoas: pessoas,
        conexoes: conexoes,
        logado: logado,
      ),
    );
  }
}

Future<void> _montar(
  WidgetTester tester, {
  List<Map<String, dynamic>> resultados = const <Map<String, dynamic>>[],
  int restamHoje = 7,
  String estadoDoPedido = 'pending_sent',
  bool logado = true,
  int statusDaBusca = 200,
}) async {
  sessao.value = logado;
  chamadas.clear();
  corpos.clear();
  AppConfig.limparParaTeste();
  final cliente = MockClient((http.Request pedido) async {
    chamadas.add('${pedido.method} ${pedido.url.path}?${pedido.url.query}');
    if (pedido.body.isNotEmpty) corpos.add(pedido.body);
    final caminho = pedido.url.path;
    if (caminho.endsWith('/connections/summary')) {
      return _json(_resumo(restamHoje: restamHoje));
    }
    if (caminho.endsWith('/people')) {
      if (statusDaBusca != 200) {
        // **O 401 DESTA BANCADA VAI SEM `next_action`, E ISSO E DELIBERADO.**
        //
        // Com `sign_in` no corpo, `faltaConta` fica verdadeiro e o corpo troca
        // para `ConviteParaEntrar` -- que le `Escopo.of(context).sessao` e
        // ESTOURA aqui, porque esta aba e montada por parametro justamente
        // para nao construir as vinte e oito dependencias do escopo. O que o
        // caso de estado preso mede e `_termoAplicado`, que fica igual nos dois
        // ramos: o da faixa e o do convite passam pelo mesmo `catch`.
        return _json(<String, dynamic>{
          'type': 'about:blank',
          'title': 'unauthenticated',
          'status': statusDaBusca,
        }, status: statusDaBusca);
      }
      return _json(_pagina(resultados));
    }
    if (caminho.endsWith('/connections') && pedido.method == 'POST') {
      return _json(<String, dynamic>{
        'ref': 'aresta-1',
        'state': estadoDoPedido,
        'requested_at': '2026-10-21T12:00:00.000Z',
        'person': <String, dynamic>{
          'handle': 'marina-vet',
          'display_name': 'Marina',
        },
      }, status: 201);
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
      home: Scaffold(
        body: SingleChildScrollView(
          child: _AbaComSessao(
            pessoas: PessoasApi(api),
            conexoes: ConexoesApi(api),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// A largura que o nome recebe no cartão, em 320 dp **nesta bancada**.
///
/// **MEDIDO em 21/10/2026: 218,0 dp**, e travado. A conta fecha: 320 de tela,
/// menos `BichuEspaco.e4` de cada lado do cartão (32), menos o círculo de 56,
/// menos `BichuEspaco.e3` de respiro (12) — sobram 220 de restrição, e o
/// parágrafo recebe 218.
///
/// **O número é DESTA bancada, e não da aba montada**: aqui o cartão é filho
/// direto de um `Scaffold`, e dentro da seção `Rede` ele ainda perde a margem
/// de corpo de `BichuLayout.margemCelular` em cada lado. O que o caso mede não
/// é o valor absoluto — é que ele é **o mesmo com foto e sem foto**, porque o
/// círculo tem 56 dp nos dois casos. O absoluto está travado por cima disso,
/// para acusar o dia em que alguém mexer no `Row` do cartão.
const double _larguraDoNomeEm320 = 218;

/// Quantas vezes a busca de pessoas foi perguntada.
int get _buscas =>
    chamadas.where((c) => c.startsWith('GET /v1/people?')).length;

void main() {
  testWidgets('o campo de busca existe ANTES de qualquer busca', (tester) async {
    // **Esta aba é a única do app que desenha `LinhaDeBuscaDaListagem` em vez
    // de `BarraDeListagem`**, e o motivo está no cabeçalho de
    // `BuscaDePessoas.build`: a barra não se desenha com `total == 0` e sem
    // recorte aplicado, e aqui esse é o estado NORMAL de abertura, porque não
    // existe "listar todos". Sem o campo a aba não tem controle nenhum.
    //
    // PARA DESLIGAR E VER REPROVAR: troque `LinhaDeBuscaDaListagem` por
    // `BarraDeListagem` em `BuscaDePessoas.build`.
    await _montar(tester);

    expect(
      find.byType(TextField),
      findsOneWidget,
      reason: 'REPROVA: a aba abriu sem campo de busca. Não existe "listar '
          'todos" no contrato, então sem o campo a pessoa não tem como fazer a '
          'única coisa que esta aba existe para fazer.',
    );
    expect(
      find.text('0 usuários'),
      findsNothing,
      reason: 'REPROVA: a tela escreveu uma contagem antes de alguém buscar. '
          '"0 usuários" ali é a tela afirmando um resultado que ninguém pediu.',
    );
  });

  group('ISCA (a) -- campo vazio NAO lista ninguem', () {
    testWidgets('nenhuma chamada de busca sai na abertura da aba', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: em `BuscaDePessoas._agendarLeituraDoTeto`,
      // acrescente `unawaited(_buscar(''))` ao lado de `_lerOTeto()`.
      await _montar(tester);

      expect(
        _buscas,
        0,
        reason: 'REPROVA: a aba perguntou a busca sem ninguém digitar nada. '
            'Não existe "listar todos" no contrato, e um resultado inicial '
            'seria a listagem de pessoas que a reversão de 20/10/2026 não '
            'autorizou.',
      );
      expect(
        find.text('Procure quem você já conhece'),
        findsOneWidget,
        reason: 'REPROVA: o estado inicial não é o de antes de buscar.',
      );
      expect(
        find.byType(BotaoPrimario),
        findsNothing,
        reason: 'REPROVA: há ação de pedir conexão sem resultado na tela. '
            'Sem pessoa encontrada não há a quem pedir.',
      );
    });

    testWidgets('a lupa diz que nada foi digitado, e nao aplica', (
      tester,
    ) async {
      await _montar(tester);

      expect(
        find.byTooltip('Buscar, nada digitado'),
        findsOneWidget,
        reason: 'REPROVA: a lupa não diz por que não aplica. Quem usa leitor '
            'de tela não vê o botão apagado.',
      );
    });
  });

  group('ISCA (b) -- menos que o piso NAO busca', () {
    testWidgets('duas letras: a lupa nao habilita e nenhuma chamada sai', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: em `BuscaDePessoas._controleDaBusca`,
      // troque `minimoDeCaracteres: PessoasApi.minimoDaBusca` por `1`.
      //
      // O piso é 3 e não é gosto: o índice é GIN trigrama, e um padrão com
      // menos de três caracteres não produz trigrama nenhum.
      await _montar(tester);

      await tester.enterText(find.byType(TextField).first, 'ma');
      await tester.pumpAndSettle();

      expect(
        find.byTooltip('Buscar, faltam 1 letra'),
        findsOneWidget,
        reason: 'REPROVA: com duas letras a lupa não diz quantas faltam para '
            'o piso de três.',
      );

      await tester.tap(find.byTooltip('Buscar, faltam 1 letra'));
      await tester.pumpAndSettle();

      expect(
        _buscas,
        0,
        reason: 'REPROVA: a aba perguntou a busca com menos de três '
            'caracteres. O servidor instalado responde 400 nesse caso, e a '
            'pessoa veria faixa vermelha no meio de escrever um nome.',
      );
    });

    testWidgets('a porta tambem recusa, e sem rede: o piso e dos DOIS lados', (
      tester,
    ) async {
      // O freio da tela é a lupa; o freio da porta é este. Dois freios porque
      // o primeiro é de interface e some no dia em que outra tela chamar a
      // mesma porta.
      AppConfig.limparParaTeste();
      var perguntou = false;
      final api = ApiClient(
        config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
        cliente: MockClient((_) async {
          perguntou = true;
          return _json(_pagina(<Map<String, dynamic>>[]));
        }),
        tokenDeAcesso: () async => 'token-de-teste',
      );

      final pagina = await PessoasApi(api).buscar('ma');

      expect(
        perguntou,
        isFalse,
        reason: 'REPROVA: `PessoasApi.buscar` perguntou com dois caracteres.',
      );
      expect(
        pagina.itens,
        isEmpty,
        reason: 'REPROVA: a página devolvida abaixo do piso não é vazia.',
      );
      expect(
        pagina.total,
        0,
        reason: 'REPROVA: o total abaixo do piso não é zero.',
      );
    });
  });

  testWidgets('tres letras: busca, e o cartao diz nome, apelido e contagens', (
    tester,
  ) async {
    await _montar(
      tester,
      resultados: <Map<String, dynamic>>[
        _pessoa(apelido: 'marina-vet', nome: 'Marina', pets: 2, conexoes: 38),
      ],
    );

    await tester.enterText(find.byType(TextField).first, 'marina');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    expect(_buscas, 1, reason: 'REPROVA: a lupa não perguntou uma vez.');
    expect(
      chamadas.any((c) => c.contains('q=marina')),
      isTrue,
      reason: 'REPROVA: o termo não viajou em `q`. Chamadas: $chamadas',
    );
    expect(find.text('Marina'), findsOneWidget);
    expect(
      find.text('@marina-vet'),
      findsOneWidget,
      reason: 'REPROVA: o apelido não aparece. Ele é mais certeiro que o nome '
          'quando há quatro Marinas.',
    );
    expect(
      find.text('2 pets · 38 conexões'),
      findsOneWidget,
      reason: 'REPROVA: as duas contagens da emenda 2 não aparecem juntas.',
    );
  });

  testWidgets('nada encontrado e outro estado, e nao a lista vazia', (
    tester,
  ) async {
    await _montar(tester);

    await tester.enterText(find.byType(TextField).first, 'marinna vet');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    expect(find.text('Nada com esse nome'), findsOneWidget);
    expect(
      find.text('Procure quem você já conhece'),
      findsNothing,
      reason: 'REPROVA: depois de buscar a tela voltou ao estado de antes de '
          'buscar. São dois estados diferentes: um é "não pedi nada", o outro '
          'é "pedi e não casou".',
    );
    expect(
      find.textContaining('não existe'),
      findsNothing,
      reason: 'REPROVA: a tela afirma que a pessoa não existe. Conta '
          'desabilitada, apelido de pet e quem bloqueou quem busca somem do '
          'resultado pelo mesmo caminho, e distinguir isso entregaria a '
          'informação que gera retaliação.',
    );
  });

  // A ISCA (c) FOI **INVERTIDA** EM 21/10/2026, E NÃO APAGADA.
  //
  // O QUE ELA DIZIA: *"a tela desenha a inicial no círculo, e nenhuma imagem"*,
  // e o motivo escrito era a emenda 5 item 2 do ADR-0010 — *"a foto não sai
  // para quem não é conexão aceita"*.
  //
  // **O cliente emendou a própria decisão**, literal: *"o resultado tras foto
  // sim, para identificar usuarios com nomes parecidos."* Com só o nome, duas
  // `Maria Silva` são indistinguíveis, e numa busca cujo propósito é achar uma
  // pessoa específica que você conhece isso transforma a lista em adivinhação.
  //
  // **Apagar a isca teria deixado a superfície sem proteção nenhuma**, e é
  // assim que o quinto campo entra sem ninguém notar. Ela guardava um LIMITE; o
  // limite mudou, e agora ela guarda o limite novo: a foto aparece, **e nada
  // além dela**.
  group('ISCA (c) -- o resultado TRAZ foto, e NADA alem dela', () {
    testWidgets('a foto aparece no circulo, e e a derivada do servidor', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: em `CartaoDePessoaEncontrada._avatar`,
      // devolva sempre `_circuloDaInicial(...)`.
      await _montar(
        tester,
        resultados: <Map<String, dynamic>>[
          _pessoa(apelido: 'marina-vet', nome: 'Marina'),
        ],
      );
      await tester.enterText(find.byType(TextField).first, 'marina');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      final imagens = tester.widgetList<ImagemDaRede>(
        find.byType(ImagemDaRede),
      );
      expect(
        imagens,
        hasLength(1),
        reason: 'REPROVA: o resultado não desenha a foto da pessoa. O cliente '
            'pediu o rosto para desempatar nomes parecidos.',
      );
      expect(
        imagens.first.url,
        _urlDaFoto,
        reason: 'REPROVA: a imagem desenhada não é a URL que o servidor '
            'mandou. O app não monta endereço de mídia.',
      );
      expect(
        imagens.first.descricao,
        isNull,
        reason: 'REPROVA: o avatar não é decorativo. O nome é lido ao lado, e '
            'um leitor de tela anunciaria "foto de Marina, Marina".',
      );
      expect(
        find.text('M'),
        findsNothing,
        reason: 'REPROVA: a inicial foi desenhada junto com a foto. É uma ou a '
            'outra, no mesmo círculo.',
      );
    });

    testWidgets('CONTRAPESO: sem foto pronta, a inicial no circulo volta', (
      tester,
    ) async {
      // A inicial **não foi apagada** quando a foto entrou: foto em
      // `processing` ou `rejected` não sai do servidor, e o círculo vazio
      // pareceria imagem que não carregou. É o recurso da emenda 3.
      await _montar(
        tester,
        resultados: <Map<String, dynamic>>[
          _pessoa(apelido: 'marina-vet', nome: 'Marina', foto: null),
        ],
      );
      await tester.enterText(find.byType(TextField).first, 'marina');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      expect(
        find.byType(ImagemDaRede),
        findsNothing,
        reason: 'REPROVA: a tela tentou desenhar imagem para quem não tem foto '
            'pronta.',
      );
      expect(
        find.text('M'),
        findsOneWidget,
        reason: 'REPROVA: a inicial no círculo não voltou. Círculo vazio parece '
            'imagem que não carregou.',
      );
    });

    test('o modelo le a foto, e NADA alem dos cinco campos', () {
      // ISCA DO LADO DO MODELO, e ela é a que sobrevive a um redesenho da
      // tela. Ela mede as duas metades da emenda: a foto entra, e o que não
      // entrou continua fora.
      final pessoa = PessoaEncontrada.doJson(<String, dynamic>{
        'handle': 'marina-vet',
        'display_name': 'Marina',
        'pets_count': 2,
        'connections_count': 38,
        'photo_icon_url': _urlDaFoto,
        // O servidor NÃO manda estes dois. Estão aqui para provar que, se um
        // dia mandasse, o app não os leria.
        'public_ref': 'ABCDEFGHIJKLMNOPQRSTUV',
        'id': '0193f2d4-0000-7000-8000-000000000000',
      });

      expect(pessoa.handle, 'marina-vet');
      expect(pessoa.petsCount, 2);
      expect(pessoa.connectionsCount, 38);
      expect(
        pessoa.photoIconUrl,
        _urlDaFoto,
        reason: 'REPROVA: o modelo não lê a foto que o contrato passou a '
            'mandar.',
      );
      // Não há getter de referência pública nem de identificador para
      // conferir: a ausência é a prova. O que este caso trava é a adição de um
      // — quem acrescentar `publicRef` a `PessoaEncontrada` precisa apagar
      // esta afirmação, e apagá-la é um ato deliberado no diff.
      expect(
        PessoaEncontrada(
          handle: 'x-apelido',
          displayName: null,
          petsCount: 0,
          connectionsCount: 0,
          photoIconUrl: null,
        ).inicial,
        'X',
        reason: 'REPROVA: quem não tem nome nem foto ficou sem letra. A queda é '
            'o apelido, e o `@` não é letra de ninguém.',
      );
    });

    testWidgets('o nome tem a MESMA largura com foto e sem foto', (
      tester,
    ) async {
      // **A MEDIÇÃO QUE O DESENHO PEDIA.** O avatar come espaço do nome, e o
      // nome é o que a pessoa está lendo — então a pergunta é se o nome passou
      // a cortar onde cabia.
      //
      // **A resposta é não, e o motivo é estrutural:** o círculo já existia com
      // 56 dp porque a inicial morava nele. A foto substitui o CONTEÚDO do
      // círculo, não a geometria. Este caso trava isso: a largura que o
      // parágrafo do nome recebe é a mesma nos dois casos, em 320 dp.
      //
      // Se um dia precisar encolher, **o avatar encolhe e o nome não**.
      tester.view.physicalSize = const Size(960, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      final larguras = <bool, double>{};
      // **UM TERMO DIFERENTE POR RODADA, e isso não é capricho:** `pumpWidget`
      // com o mesmo tipo de widget reaproveita o `State`, então o termo
      // APLICADO sobrevive à segunda montagem -- a lupa diria "a busca já é
      // esta" e não aplicaria. É a mesma pegadinha que o caso das duas
      // plaquinhas deste repositório já pagou.
      final termos = <bool, String>{true: 'maria', false: 'silva'};
      for (final comFoto in <bool>[true, false]) {
        await _montar(
          tester,
          resultados: <Map<String, dynamic>>[
            _pessoa(
              apelido: 'maria-silva',
              nome: 'Maria Silva',
              foto: comFoto ? _urlDaFoto : null,
            ),
          ],
        );
        await tester.enterText(
          find.byType(TextField).first,
          termos[comFoto]!,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Buscar'));
        await tester.pumpAndSettle();

        final paragrafo = tester.renderObject<RenderParagraph>(
          find.text('Maria Silva'),
        );
        larguras[comFoto] = paragrafo.constraints.maxWidth;
      }

      expect(
        larguras[true],
        closeTo(larguras[false]!, 0.01),
        reason: 'REPROVA: o nome recebeu larguras diferentes com foto '
            '(${larguras[true]} dp) e sem foto (${larguras[false]} dp). O '
            'círculo tem 56 dp nos dois casos, e a foto troca o conteúdo dele '
            'e não a geometria -- se a largura mudou, alguém mexeu no `Row`.',
      );
      expect(
        larguras[true],
        closeTo(_larguraDoNomeEm320, 0.5),
        reason: 'REPROVA: o nome recebe ${larguras[true]} dp em 320 dp, e a '
            'bancada mediu $_larguraDoNomeEm320. O que mudou foi a geometria '
            'do cartão, e o número aqui é o que trava isso.',
      );
    });
  });

  testWidgets('ISCA (d) -- NAO ha gatilho de filtro nesta aba', (tester) async {
    // PARA DESLIGAR E VER REPROVAR: em `BuscaDePessoas.build`, passe
    // `ordenacao: ControleDeOrdenacao(opcoes: [...], efetiva: 'nome')` para a
    // `BarraDeListagem`.
    //
    // Isto CONTRARIA o padrão de listagem desta casa, e a contrariedade está
    // escrita no cabeçalho de `BuscaDePessoas` com os quatro candidatos e o
    // motivo de cada recusa: cidade e bairro a emenda 2 recusa, contagem de
    // pets viraria critério de busca, e ordenar por nome é opção única.
    await _montar(
      tester,
      resultados: <Map<String, dynamic>>[
        _pessoa(apelido: 'marina-vet', nome: 'Marina'),
      ],
    );
    await tester.enterText(find.byType(TextField).first, 'marina');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    expect(
      find.byIcon(Icons.tune),
      findsNothing,
      reason: 'REPROVA: nasceu gatilho de recorte na busca de pessoas. Um '
          'controle que abre uma folha sem nada para mudar é toque sem '
          'desfecho, que é o critério 2 da BICHUS-62.',
    );
    final linha = tester.widget<LinhaDeBuscaDaListagem>(
      find.byType(LinhaDeBuscaDaListagem),
    );
    expect(
      linha.filtro,
      isNull,
      reason: 'REPROVA: a aba passou um controle de filtro à linha de busca.',
    );
    expect(
      linha.ordenacao,
      isNull,
      reason: 'REPROVA: a aba passou um controle de ordenação à linha de '
          'busca.',
    );
  });

  group('o cartao pede conexao por APELIDO, e aprende o estado da resposta', () {
    testWidgets('o corpo leva `handle`, e nunca identificador interno', (
      tester,
    ) async {
      await _montar(
        tester,
        resultados: <Map<String, dynamic>>[
          _pessoa(apelido: 'marina-vet', nome: 'Marina'),
        ],
      );
      await tester.enterText(find.byType(TextField).first, 'marina');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Pedir conexão'));
      await tester.pumpAndSettle();

      expect(
        corpos.last,
        '{"handle":"marina-vet"}',
        reason: 'REPROVA: o pedido não foi por apelido. O `oneOf` do contrato '
            'recusa corpo com as duas credenciais e corpo com nenhuma, e '
            'identificador de pessoa não existe em operação nenhuma.',
      );
      expect(
        find.text('Pedido enviado, aguardando aceite'),
        findsOneWidget,
        reason: 'REPROVA: o cartão não passou ao estado que o servidor '
            'devolveu.',
      );
      expect(
        find.text('Pedir conexão'),
        findsNothing,
        reason: 'REPROVA: a ação de pedir continua ao lado do estado. Ninguém '
            'pede duas vezes.',
      );
      expect(find.text('Cancelar'), findsOneWidget);
    });

    testWidgets('quem ja era conexao descobre no 201, e nao num palpite', (
      tester,
    ) async {
      // A busca NÃO devolve `connection_state` -- "numa lista, vinte estados
      // por requisição são o material de que uma lista de conexões se faz do
      // lado de fora". O cartão nasce em `nenhum` e aprende do pedido, que é
      // idempotente e devolve a aresta que já existia.
      await _montar(
        tester,
        resultados: <Map<String, dynamic>>[
          _pessoa(apelido: 'marina-vet', nome: 'Marina'),
        ],
        estadoDoPedido: 'connected',
      );
      await tester.enterText(find.byType(TextField).first, 'marina');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pedir conexão'));
      await tester.pumpAndSettle();

      expect(
        find.text('Já é sua conexão'),
        findsOneWidget,
        reason: 'REPROVA: o cartão não leu `state: connected` da resposta.',
      );
    });

    testWidgets('quem pediu primeiro vira Aceitar e Recusar, e nao Pedir', (
      tester,
    ) async {
      await _montar(
        tester,
        resultados: <Map<String, dynamic>>[
          _pessoa(apelido: 'rafa-pug', nome: 'Rafael'),
        ],
        estadoDoPedido: 'pending_received',
      );
      await tester.enterText(find.byType(TextField).first, 'rafael');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pedir conexão'));
      await tester.pumpAndSettle();

      expect(find.text('Pediu conexão com você'), findsOneWidget);
      expect(find.text('Aceitar'), findsOneWidget);
      expect(find.text('Recusar'), findsOneWidget);
      expect(
        find.text('Pedir conexão'),
        findsNothing,
        reason: 'REPROVA: o cartão oferece pedir a quem já pediu. Seriam duas '
            'arestas para a mesma relação.',
      );
    });
  });

  testWidgets('ISCA (e) -- o teto do dia SUBSTITUI a acao, e nao a desabilita', (
    tester,
  ) async {
    // PARA DESLIGAR E VER REPROVAR: em `CartaoDePessoaEncontrada._areaDeAcao`,
    // no `case null`, troque o `break` do teto por um `BotaoPrimario` com
    // `aoTocar: null`.
    //
    // O critério 2 da BICHUS-62 proíbe renderizar ação sem destino **nem
    // habilitada nem desabilitada**: controle desabilitado continua se
    // anunciando e continua sem desfecho.
    await _montar(
      tester,
      resultados: <Map<String, dynamic>>[
        _pessoa(apelido: 'camila-rex', nome: 'Camila'),
      ],
      restamHoje: 0,
    );
    await tester.enterText(find.byType(TextField).first, 'camila');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    expect(
      find.text('Você já enviou os pedidos de hoje. Amanhã cabem mais.'),
      findsOneWidget,
      reason: 'REPROVA: o teto do dia não aparece escrito. Descobrir um limite '
          'de 24 horas por um 400 depois de apertar o botão é descobrir depois '
          'de apertar.',
    );
    expect(
      find.text('Pedir conexão'),
      findsNothing,
      reason: 'REPROVA: a ação de pedir continua desenhada com o teto fechado.',
    );
    for (final botao in tester.widgetList<BotaoPrimario>(
      find.byType(BotaoPrimario),
    )) {
      expect(
        botao.aoTocar,
        isNotNull,
        reason: 'REPROVA: há `BotaoPrimario` com `aoTocar: null` na tela. '
            'Botão desabilitado é proibido pelo critério 2 da BICHUS-62.',
      );
    }
  });

  testWidgets('o teto NAO esconde a acao quando o resumo nao pudo ser lido', (
    tester,
  ) async {
    // Nulo e zero são coisas diferentes: zero é a afirmação do servidor de que
    // o teto fechou; nulo é a ausência de afirmação. Esconder a ação por não
    // ter conseguido ler o resumo tiraria do ar a única coisa que a aba existe
    // para fazer.
    chamadas.clear();
    corpos.clear();
    AppConfig.limparParaTeste();
    final api = ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
      cliente: MockClient((http.Request pedido) async {
        if (pedido.url.path.endsWith('/connections/summary')) {
          return _json(<String, dynamic>{}, status: 500);
        }
        if (pedido.url.path.endsWith('/people')) {
          return _json(
            _pagina(<Map<String, dynamic>>[
              _pessoa(apelido: 'marina-vet', nome: 'Marina'),
            ]),
          );
        }
        return _json(<String, dynamic>{}, status: 404);
      }),
      tokenDeAcesso: () async => 'token-de-teste',
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: BichuTheme.claro,
        home: Scaffold(
          body: SingleChildScrollView(
            child: BuscaDePessoas(
              pessoas: PessoasApi(api),
              conexoes: ConexoesApi(api),
              logado: true,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'marina');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    expect(
      find.text('Pedir conexão'),
      findsOneWidget,
      reason: 'REPROVA: a falha de leitura do resumo escondeu a ação. "Não '
          'consegui perguntar" não é "o teto fechou".',
    );
  });
  // ===========================================================================
  // OS TRES CONSERTOS DE 22/10/2026
  //
  // O cliente concluiu que a busca nao funciona porque digitar nao fazia nada.
  // Medido no aparelho no mesmo dia, por contadores de rede com controle
  // positivo e negativo: digitar `souza` nao gerava **um byte**; tocar a lupa
  // gerava. O servidor estava certo em tudo -- `q=lima` devolvia `total=1`,
  // acento casava nos dois sentidos, `q=a` e `q=ab` devolviam lista vazia com
  // 200, e sem token dava 401.
  //
  // Os tres casos abaixo sao, em ordem: a busca que dispara ao digitar e nao a
  // cada letra; o resultado velho que sai da tela abaixo do piso; e a lupa que
  // volta a viver depois de alguem entrar na conta.
  // ===========================================================================

  group('CONSERTO 1 -- dispara ao digitar, COM espera', () {
    testWidgets('acima do piso, UMA busca sai depois da espera', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: apague
      // `_campo.addListener(_aoDigitar);` de `BuscaDePessoas.initState`.
      await _montar(
        tester,
        resultados: <Map<String, dynamic>>[
          _pessoa(apelido: 'ana-souza', nome: 'Ana Souza'),
        ],
      );

      await tester.enterText(find.byType(TextField).first, 'souza');
      await tester.pump();

      // CONTROLE NEGATIVO DA ESPERA: antes dela vencer nao ha consulta. Sem
      // esta metade, "uma busca" tambem passaria para uma tela que buscasse na
      // tecla, e seria o teto de 60/h que pagaria a conta.
      expect(
        _buscas,
        0,
        reason: 'REPROVA: a busca saiu NA TECLA, sem esperar a pausa. Cada '
            'letra vira uma consulta do teto de 60/h, e `souza` sozinho '
            'custaria tres.',
      );

      await tester.pump(const Duration(milliseconds: 300));
      expect(
        _buscas,
        0,
        reason: 'REPROVA: a espera venceu antes dos 400 ms declarados em '
            '`BuscaDePessoas.esperaAntesDeBuscar`.',
      );

      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpAndSettle();

      // CONTROLE POSITIVO: a consulta sai, e o resultado chega na tela. Sem
      // isto "nao disparou" seria indistinguivel de "nada funciona nesta
      // bancada".
      expect(
        _buscas,
        1,
        reason: 'REPROVA: digitar acima do piso nao disparou a busca depois da '
            'espera. E exatamente o que o cliente viu: digitou o nome e nada '
            'aconteceu.',
      );
      expect(
        find.text('Ana Souza'),
        findsOneWidget,
        reason: 'REPROVA: a busca disparou e o resultado nao chegou na tela.',
      );
    });

    testWidgets('cinco letras digitadas geram UMA busca, e nao cinco', (
      tester,
    ) async {
      // **ESTE E O CASO QUE PROTEGE O TETO DE 60 CONSULTAS POR HORA.**
      //
      // PARA DESLIGAR E VER REPROVAR: troque
      // `BuscaDePessoas.esperaAntesDeBuscar` por `Duration.zero`. Sem espera a
      // conta sao tres consultas (`sou`, `souz`, `souza` -- as duas primeiras
      // letras estao abaixo do piso e nunca perguntam), e vinte nomes fecham a
      // hora de uma pessoa normal.
      await _montar(
        tester,
        resultados: <Map<String, dynamic>>[
          _pessoa(apelido: 'ana-souza', nome: 'Ana Souza'),
        ],
      );

      // Cinco teclas, com 120 ms entre elas: abaixo dos 400 ms da espera, que
      // e o que faz as cinco virarem UMA pausa.
      for (final parcial in <String>['s', 'so', 'sou', 'souz', 'souza']) {
        await tester.enterText(find.byType(TextField).first, parcial);
        await tester.pump(const Duration(milliseconds: 120));
      }
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();

      expect(
        _buscas,
        1,
        reason: 'REPROVA: cinco teclas geraram $_buscas buscas, e nao uma. O '
            'teto de `searchPeople` e 60 por hora por conta na dimensao '
            '[account, q], e `q` marca PRESENCA de busca -- as 60 contam toda '
            'consulta. Uma consulta por tecla queima o teto em segundos.',
      );

      // CONTROLE POSITIVO DO CONTADOR: uma pausa de verdade no meio produz
      // DUAS buscas. Sem esta metade, um contador quebrado (ou uma tela que
      // nao busca nunca) passaria o `expect` acima com qualquer numero.
      await tester.enterText(find.byType(TextField).first, 'souzas');
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pumpAndSettle();
      expect(
        _buscas,
        2,
        reason: 'REPROVA: a segunda pausa nao produziu a segunda busca. O caso '
            'acima nao mede nada se a tela simplesmente nunca buscar.',
      );
    });
  });

  group('CONSERTO 2 -- abaixo do piso, o resultado velho SAI da tela', () {
    testWidgets('com duas letras a lista anterior sai, e a tela diz o que falta', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: em `BuscaDePessoas._aoDigitar`, troque o
      // ramo abaixo do piso por `return;` -- sem `_limparABusca()` e sem
      // `setState`. E o estado medido em 22/10/2026: *"digita um nome novo,
      // toca, e aparece a pessoa errada"*.
      await _montar(
        tester,
        resultados: <Map<String, dynamic>>[
          _pessoa(apelido: 'ana-souza', nome: 'Ana Souza'),
        ],
      );

      await tester.enterText(find.byType(TextField).first, 'souza');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();

      // CONTROLE POSITIVO: o resultado velho EXISTE antes de ser tirado. Sem
      // esta linha, "Ana Souza nao esta na tela" passaria numa tela que nunca
      // desenhou ninguem.
      expect(
        find.text('Ana Souza'),
        findsOneWidget,
        reason: 'REPROVA: a busca de linha de base nao desenhou a pessoa, '
            'entao o caso nao tem o que medir.',
      );
      expect(find.text('1 usuário'), findsOneWidget);

      final buscasAntes = _buscas;
      await tester.enterText(find.byType(TextField).first, 'li');
      await tester.pump(const Duration(milliseconds: 800));
      await tester.pumpAndSettle();

      expect(
        _buscas,
        buscasAntes,
        reason: 'REPROVA: a tela perguntou a busca com duas letras. O piso de '
            'tres e do indice trigrama, e abaixo dele nao ha trigrama nenhum '
            'para casar.',
      );
      expect(
        find.text('Ana Souza'),
        findsNothing,
        reason: 'REPROVA: o resultado da busca ANTERIOR continua na tela com '
            'duas letras no campo. Quem digita um nome novo e toca ve a pessoa '
            'errada, e foi exatamente o que o cliente descreveu.',
      );
      expect(
        find.text('1 usuário'),
        findsNothing,
        reason: 'REPROVA: a contagem da busca anterior ficou na tela.',
      );
      expect(
        find.text('Faltam 1 letra.'),
        findsOneWidget,
        reason: 'REPROVA: a tela tirou a lista e nao disse por que. A contagem '
            'de letras e a MESMA frase que o nome acessivel da lupa ja dizia '
            '(`ControleDeBusca.faltamLetras`), e nao uma segunda redacao.',
      );
    });

    testWidgets('campo vazio nao dispara e nao lista ninguem', (tester) async {
      // PARA DESLIGAR E VER REPROVAR: em `BuscaDePessoas._aoDigitar`, apague o
      // `if (digitado.length < PessoasApi.minimoDaBusca)` inteiro. A tela entao
      // aplica o termo vazio, e desenha `Nada com esse nome` com `0 pessoas`
      // sobre uma busca que ninguem pediu.
      //
      // O ZERO BYTE do campo vazio e GUARDA, e nao isca provada: mesmo com o
      // freio desta tela removido, `PessoasApi.buscar` devolve
      // `PaginaDeBuscaDePessoas.semBusca` sem tocar na rede (ver a isca `a
      // porta tambem recusa, e sem rede`). Sao dois freios, e o de baixo nao
      // cai junto com o de cima.
      await _montar(
        tester,
        resultados: <Map<String, dynamic>>[
          _pessoa(apelido: 'ana-souza', nome: 'Ana Souza'),
        ],
      );

      await tester.enterText(find.byType(TextField).first, 'souza');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(
        find.text('Ana Souza'),
        findsOneWidget,
        reason: 'CONTROLE POSITIVO: sem a busca de linha de base nao ha o que '
            'limpar.',
      );

      final buscasAntes = _buscas;
      await tester.enterText(find.byType(TextField).first, '');
      await tester.pump(const Duration(milliseconds: 800));
      await tester.pumpAndSettle();

      expect(
        _buscas,
        buscasAntes,
        reason: 'REPROVA: a tela perguntou a busca com o campo vazio. Nao '
            'existe "listar todos" no contrato.',
      );
      expect(
        find.text('Ana Souza'),
        findsNothing,
        reason: 'REPROVA: o campo vazio continua listando gente.',
      );
      expect(
        find.text('Nada com esse nome'),
        findsNothing,
        reason: 'REPROVA: campo vazio virou "nada encontrado". Ninguem buscou, '
            'entao nao ha resultado nenhum a afirmar.',
      );
      expect(
        find.text('Digite o nome ou o apelido de alguém e toque na lupa.'),
        findsOneWidget,
        reason: 'REPROVA: o campo vazio nao voltou ao estado de abertura. Com '
            'nada digitado nao ha letras a cobrar de quem nem comecou.',
      );
    });
  });

  group('CONSERTO 3 -- entrar na conta invalida o estado da busca', () {
    testWidgets('depois de entrar, a lupa volta a funcionar sem mudar o texto', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: apague o corpo de
      // `_EstadoDaBuscaDePessoas.didUpdateWidget` (deixe so a chamada a
      // `super`). **E assim que o defeito foi reproduzido antes do conserto**:
      // `_termoAplicado` guarda o `lima` que produziu o 401, o texto digitado
      // continua `lima`, e "digitado igual a aplicado" e exatamente a condicao
      // em que `_podeAplicar` de `CampoDeBuscaDaListagem` NAO habilita a lupa.
      // O unico jeito de sair era mudar o texto.
      //
      // O QUE ESTA BANCADA NAO MEDE: o ramo do `ConviteParaEntrar` (ver o 401
      // sem `next_action` em `_montar`). A causa e a mesma -- os dois ramos do
      // `catch` deixam `_termoAplicado` igual --, mas quem quiser medir o
      // convite sumindo depois do login precisa do app montado com `Escopo`.
      await _montar(tester, logado: false, statusDaBusca: 401);

      await tester.enterText(find.byType(TextField).first, 'lima');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      final buscasDoDeslogado = _buscas;

      // CONTROLE POSITIVO: o 401 de verdade saiu e chegou na tela. Sem isto
      // "a lupa destravou" passaria numa bancada onde nada falhou.
      expect(
        buscasDoDeslogado,
        1,
        reason: 'CONTROLE POSITIVO: a busca do deslogado nao saiu, entao nao '
            'ha 401 nem estado preso a destravar.',
      );
      expect(
        find.byType(FaixaDeAviso),
        findsOneWidget,
        reason: 'CONTROLE POSITIVO: a recusa do servidor nao virou estado de '
            'falha na tela.',
      );
      // O ESTADO PRESO, medido: a lupa esta morta com o texto que a pessoa
      // escreveu, porque o termo do 401 ficou registrado como aplicado.
      expect(
        find.byTooltip('Buscar, a busca já é esta'),
        findsOneWidget,
        reason: 'CONTROLE POSITIVO: a lupa nao esta no estado preso que o '
            'conserto desfaz, e o caso nao mede nada.',
      );

      // A pessoa entra pela porta `Entrar` e volta a aba. Em producao e o
      // `AnimatedBuilder` de `secao_da_rede.dart` que traz o valor novo; a aba
      // NAO sai do lugar dela na arvore, e e por isso que o `State` -- e o
      // `_termoAplicado` dentro dele -- sobrevive ao login.
      sessao.value = true;
      await tester.pumpAndSettle();

      expect(
        find.byTooltip('Buscar'),
        findsOneWidget,
        reason: 'REPROVA: a lupa continua morta depois de entrar, com o mesmo '
            'texto no campo. Era preciso mudar o texto para sair, e e esse o '
            'defeito.',
      );
      expect(
        find.byType(FaixaDeAviso),
        findsNothing,
        reason: 'REPROVA: a aba continua desenhando a recusa do deslogado com '
            'a sessao aberta. A falha e consequencia de um pedido de OUTRA '
            'sessao, e nao um resultado desta.',
      );

      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      // CONTROLE POSITIVO do toque: a lupa nao esta so pintada de viva.
      expect(
        _buscas,
        buscasDoDeslogado + 1,
        reason: 'REPROVA: a lupa habilitou e o toque nao gerou consulta -- '
            'zero byte, que foi o que o contador de rede mediu no aparelho.',
      );
    });

    testWidgets('entrar NAO busca sozinho: o login nao gasta consulta', (
      tester,
    ) async {
      // CONTRAPESO do caso acima. O conserto devolve a CAPACIDADE de pedir, e
      // nao o pedido: gastar uma das 60 consultas da hora por um login seria a
      // tela decidindo por quem nao pediu nada.
      //
      // PARA DESLIGAR E VER REPROVAR: acrescente
      // `unawaited(_buscar(_campo.text.trim()))` ao fim de `didUpdateWidget`.
      await _montar(tester, logado: false, statusDaBusca: 401);

      await tester.enterText(find.byType(TextField).first, 'lima');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();

      final antes = _buscas;
      sessao.value = true;
      await tester.pump(const Duration(milliseconds: 800));
      await tester.pumpAndSettle();

      expect(
        _buscas,
        antes,
        reason: 'REPROVA: entrar na conta disparou uma busca por conta '
            'propria. Entrar nao e pedir uma busca.',
      );
    });
  });
}
