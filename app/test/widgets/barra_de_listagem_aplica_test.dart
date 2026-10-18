// NADA SE APLICA SOZINHO — o contrato do `Aplicar` e da lupa, no COMPONENTE.
//
// Decisao do cliente, 17/10/2026: *"Todos os filtros do app, nao devem ser
// filtrados automaticamente, voce deve colocar um botao para o usuario clicar
// e aplicar os filtros"*.
//
// Os casos moram aqui, e nao em cada tela, pela mesma razao que o desenho
// mora no componente: `Perto`, `Loja` e `Rede` herdam `BarraDeListagem`, e
// tres copias destes casos divergiriam na primeira edicao. As telas tem os
// casos de FIACAO -- que o mapa de escolhas chega na rota certa --, e eles
// estao em `test/telas/perto_com_dados_test.dart`,
// `test/telas/loja_com_dados_test.dart` e `test/rede/agenda_da_rede_test.dart`.

import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A barra num `MaterialApp` com o tema do app.
///
/// O tema do Bichu, e nao o do Material: `BichuColors` vive no `ThemeData` e o
/// componente estoura sem ele, de proposito.
Future<void> montar(
  WidgetTester tester, {
  required int total,
  ControleDeBusca? busca,
  ControleDeFiltro? filtro,
  ControleDeOrdenacao? ordenacao,
  bool buscaAcima = false,
  void Function(EscolhaDaFolha)? aoAplicar,
}) async {
  await tester.pumpWidget(
    _Casca(
      child: BarraDeListagem(
        total: total,
        busca: busca,
        filtro: filtro,
        ordenacao: ordenacao,
        buscaAcima: buscaAcima,
        aoAplicar: aoAplicar ?? (_) {},
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// A casca minima que `TelaDeAba` oferece de verdade: o slot de acao da
/// `AppBar` e o desenho do que a listagem publicar nele.
///
/// **Ela existe porque o controle de filtro saiu do corpo em 17/10/2026** e
/// passou a morar na barra de titulo, por decisao do cliente. Montar a
/// `BarraDeListagem` solta num `Scaffold` sem slot deixaria estes casos sem
/// como abrir a folha -- e, pior, deixaria verde um componente que na tela de
/// verdade nao publica nada.
class _Casca extends StatefulWidget {
  const _Casca({required this.child});

  final Widget child;

  @override
  State<_Casca> createState() => _EstadoDaCasca();
}

class _EstadoDaCasca extends State<_Casca> {
  final ValueNotifier<AcaoDeListagem?> _acao =
      ValueNotifier<AcaoDeListagem?>(null);

  @override
  void dispose() {
    _acao.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      // O tema do app, e nao o do Material: `BichuColors` vive no `ThemeData`
      // e o componente estoura sem ele, de proposito.
      theme: BichuTheme.claro,
      home: SlotDaBarraDeListagem(
        acao: _acao,
        child: ValueListenableBuilder<AcaoDeListagem?>(
          valueListenable: _acao,
          builder: (context, acao, _) => Scaffold(
            appBar: AppBar(
              title: const Text('Listagem'),
              // **64 dp, como a casca de verdade.** `casca_com_abas.dart`,
              // linha 653, fixa `toolbarHeight: BichuAlvoDeToque.critico` com
              // o motivo escrito ao lado ("64 dp, e nao os 56 do padrao do
              // M3"). Sem esta linha a casca de teste deixava o padrao do M3
              // valer, e os 56 da barra ESMAGAVAM o `SizedBox(64, 64)` que o
              // `BotaoDeAcaoDaListagem` declara -- a medida saia 56 e o caso
              // do alvo de 64 reprovava um componente correto, por causa do
              // andaime. Esta casca existe para ser "a casca minima que
              // `TelaDeAba` oferece de verdade", e a altura da barra e parte
              // disso.
              toolbarHeight: BichuAlvoDeToque.critico,
              actions: acao == null
                  ? null
                  : <Widget>[BotaoDeAcaoDaListagem(acao: acao)],
            ),
            body: widget.child,
          ),
        ),
      ),
    );
  }
}

ControleDeFiltro filtroDeDoisGrupos({
  String? atividade,
  String? nivel,
}) {
  return ControleDeFiltro(
    grupos: <GrupoDeFiltro>[
      GrupoDeFiltro(
        chave: 'kind',
        titulo: 'Atividade',
        selecionado: atividade,
        opcoes: const <OpcaoDeRecorte>[
          OpcaoDeRecorte(codigo: 'vet', rotulo: 'Veterinário'),
          OpcaoDeRecorte(codigo: 'walker', rotulo: 'Passeador'),
        ],
      ),
      GrupoDeFiltro(
        chave: 'level',
        titulo: 'Verificação',
        selecionado: nivel,
        opcoes: const <OpcaoDeRecorte>[
          OpcaoDeRecorte(codigo: 'contact', rotulo: 'Contato verificado'),
        ],
      ),
    ],
  );
}

void main() {
  group('a folha de filtros guarda a escolha e so aplica no botao', () {
    testWidgets('ISCA -- tocar na pastilha NAO chama a tela e NAO fecha a folha',
        (tester) async {
      // ISCA: em `_EstadoDaFolhaDeFiltros._escolher`, troque o `setState` por
      // `widget.filtro.aoAplicar(...)` seguido de `Navigator.pop`. Volta a
      // aplicacao automatica que o cliente recusou, e este caso reprova.
      final aplicadas = <Map<String, String?>>[];
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        aoAplicar: (e) => aplicadas.add(e.filtros),
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Veterinário'));
      await tester.pumpAndSettle();

      expect(
        aplicadas,
        isEmpty,
        reason: 'REPROVA: a pastilha aplicou o filtro sozinha. A lista atras '
            'da folha deixou de ser a lista do recorte que a pessoa ve.',
      );
      // A folha continua aberta: a pessoa ainda esta escolhendo.
      expect(find.text('Verificação'), findsOneWidget);
    });

    testWidgets('o Aplicar manda TODOS os grupos, de uma vez', (tester) async {
      final aplicadas = <Map<String, String?>>[];
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        aoAplicar: (e) => aplicadas.add(e.filtros),
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Passeador'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Contato verificado'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();

      // UMA chamada com os dois grupos, e nao duas chamadas com um cada: e
      // disto que depende a lista voltar a primeira pagina uma vez so.
      expect(aplicadas, hasLength(1));
      expect(aplicadas.single, <String, String?>{
        'kind': 'walker',
        'level': 'contact',
      });
      // E a folha fechou.
      expect(find.text('Verificação'), findsNothing);
    });

    testWidgets('o Aplicar nasce desabilitado e habilita com a pendencia',
        (tester) async {
      // O cliente pediu que a mudanca pendente fique visivel, e que o botao
      // habilitado baste. Sem nada pendente o botao nao pode aplicar: ele
      // recarregaria a lista para o mesmo recorte.
      final aplicadas = <Map<String, String?>>[];
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(atividade: 'vet'),
        aoAplicar: (e) => aplicadas.add(e.filtros),
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();

      // `BotaoPrimario` desenha um `FilledButton`; o `onPressed` dele e o
      // estado que o cliente pediu que ficasse visivel.
      FilledButton botao() => tester.widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Aplicar'),
          );
      expect(botao().onPressed, isNull);

      // Desmarcar o que estava marcado tambem e pendencia.
      await tester.tap(find.text('Veterinário'));
      await tester.pumpAndSettle();
      expect(botao().onPressed, isNotNull);

      // E voltar ao valor aplicado desabilita de novo.
      await tester.tap(find.text('Veterinário'));
      await tester.pumpAndSettle();
      expect(botao().onPressed, isNull);
      expect(aplicadas, isEmpty);
    });

    testWidgets('Limpar desmarca a FOLHA e nao recorta a lista',
        (tester) async {
      // A decisao: existe `Limpar`, e ele mexe no pendente. Duas formas de
      // recortar a lista a partir da mesma folha era o que havia antes, e uma
      // delas aplicava sozinha.
      final aplicadas = <Map<String, String?>>[];
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(atividade: 'vet', nivel: 'contact'),
        aoAplicar: (e) => aplicadas.add(e.filtros),
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Limpar'));
      await tester.pumpAndSettle();

      expect(aplicadas, isEmpty, reason: 'REPROVA: o Limpar recortou a lista.');
      // Sem nada marcado, o `Limpar` nao tem mais o que tirar e sai da folha.
      expect(find.text('Limpar'), findsNothing);

      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();
      expect(aplicadas.single, <String, String?>{'kind': null, 'level': null});
    });

    testWidgets('grupo dependente: mexer no pai solta o filho e o esconde',
        (tester) async {
      // O caso da `Loja`: as subcategorias desenhadas sao as da categoria
      // APLICADA. Sem isto o par (categoria nova, subcategoria antiga) iria
      // junto para a rota e a lista voltaria vazia sem explicacao.
      final aplicadas = <Map<String, String?>>[];
      await montar(
        tester,
        total: 3,
        filtro: ControleDeFiltro(
          grupos: const <GrupoDeFiltro>[
            GrupoDeFiltro(
              chave: 'category',
              titulo: 'Categoria',
              selecionado: 'racoes',
              opcoes: <OpcaoDeRecorte>[
                OpcaoDeRecorte(codigo: 'racoes', rotulo: 'Rações'),
                OpcaoDeRecorte(codigo: 'brinquedos', rotulo: 'Brinquedos'),
              ],
            ),
            GrupoDeFiltro(
              chave: 'subcategory',
              titulo: 'Subcategoria',
              dependeDe: 'category',
              selecionado: 'racao_seca',
              opcoes: <OpcaoDeRecorte>[
                OpcaoDeRecorte(codigo: 'racao_seca', rotulo: 'Ração seca'),
              ],
            ),
          ],
        ),
        aoAplicar: (e) => aplicadas.add(e.filtros),
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      expect(find.text('Subcategoria'), findsOneWidget);

      await tester.tap(find.text('Brinquedos'));
      await tester.pumpAndSettle();

      expect(
        find.text('Subcategoria'),
        findsNothing,
        reason: 'REPROVA: a folha continua oferecendo as subcategorias da '
            'categoria anterior sobre uma categoria nova.',
      );

      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();
      expect(aplicadas.single, <String, String?>{
        'category': 'brinquedos',
        'subcategory': null,
      });
    });
  });

  group('a ordenacao mora DENTRO da folha de filtros', () {
    ControleDeOrdenacao ordem({String efetiva = 'curadoria', String? nota}) {
      return ControleDeOrdenacao(
        opcoes: const <OpcaoDeRecorte>[
          OpcaoDeRecorte(codigo: 'curadoria', rotulo: 'Seleção do Bichu'),
          OpcaoDeRecorte(codigo: 'preco', rotulo: 'Menor preço'),
        ],
        efetiva: efetiva,
        nota: nota,
      );
    }

    testWidgets('ISCA -- nao ha icone de ordenar fora da folha',
        (tester) async {
      // Pedido do cliente, 17/10/2026: *"coloque o campo de ordenacao dentro
      // da modal de filtro"*. Fora do corpo da tela fica so a busca.
      //
      // ISCA: reponha o segundo `_BotaoDeFolha` com `Icons.swap_vert` no
      // `build` da barra. Este caso reprova no icone a mais.
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        ordenacao: ordem(),
      );

      expect(find.byIcon(Icons.swap_vert), findsNothing);
      expect(find.byIcon(Icons.tune), findsOneWidget);
      // E o icone unico se chama pelos DOIS verbos: um controle chamado so
      // "Filtrar" esconderia a ordem atras de uma palavra que nao a nomeia.
      expect(
        find.byTooltip('Filtrar e ordenar, Seleção do Bichu'),
        findsOneWidget,
      );
    });

    testWidgets('a ordem sai no MESMO Aplicar que os filtros', (tester) async {
      final aplicadas = <EscolhaDaFolha>[];
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        ordenacao: ordem(),
        aoAplicar: aplicadas.add,
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Veterinário'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Menor preço'));
      await tester.pumpAndSettle();
      expect(aplicadas, isEmpty);

      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();

      // UMA chamada com filtro e ordem: duas seriam duas idas a rota e duas
      // voltas a primeira pagina para um toque so.
      expect(aplicadas, hasLength(1));
      expect(aplicadas.single.filtros['kind'], 'vet');
      expect(aplicadas.single.ordem, 'preco');
    });

    testWidgets('so a ordem tambem habilita o Aplicar', (tester) async {
      final aplicadas = <EscolhaDaFolha>[];
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        ordenacao: ordem(),
        aoAplicar: aplicadas.add,
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      FilledButton botao() => tester.widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Aplicar'),
          );
      expect(botao().onPressed, isNull);

      await tester.tap(find.text('Menor preço'));
      await tester.pumpAndSettle();
      expect(botao().onPressed, isNotNull);

      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();
      expect(aplicadas.single.ordem, 'preco');
      expect(aplicadas.single.filtros, <String, String?>{
        'kind': null,
        'level': null,
      });
    });

    testWidgets('a ordem NAO se desmarca, e o Limpar nao a toca',
        (tester) async {
      // Uma lista sempre esta em alguma ordem: "nenhuma" nao e um estado
      // possivel, e por isso o segundo toque na pastilha marcada nao a tira.
      final aplicadas = <EscolhaDaFolha>[];
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(atividade: 'vet'),
        ordenacao: ordem(),
        aoAplicar: aplicadas.add,
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Menor preço'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Menor preço'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Limpar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();

      expect(aplicadas.single.ordem, 'preco');
      expect(aplicadas.single.filtros['kind'], isNull);
    });

    testWidgets('a folha marca a ordem EFETIVA, e nao a pedida',
        (tester) async {
      // A barra nunca pinta marcada uma ordem em que a lista nao esta: o
      // servidor pode ter devolvido outra, e a folha herda a mesma regra da
      // linha de resumo.
      await montar(
        tester,
        total: 3,
        ordenacao: ordem(efetiva: 'preco', nota: 'De onde o preço sai.'),
      );

      expect(find.byTooltip('Ordenar, Menor preço'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      expect(find.text('Ordenar por'), findsOneWidget);
      expect(find.text('De onde o preço sai.'), findsOneWidget);

      // Sem nada pendente, o `Aplicar` nasce desabilitado tambem aqui.
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Aplicar'))
            .onPressed,
        isNull,
      );
    });

    testWidgets('sem `aoAplicar` o icone da folha NAO nasce', (tester) async {
      // Folha cujo botao nao leva a lugar nenhum e o toque sem desfecho que o
      // criterio 2 proibe.
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      await tester.pumpWidget(
        _Casca(
          child: BarraDeListagem(
            total: 3,
            filtro: filtroDeDoisGrupos(),
            ordenacao: ordem(),
            busca: ControleDeBusca(
              controlador: controlador,
              alcance: AlcanceDaBusca.servidor,
              termoAplicado: null,
              aoAplicar: (_) {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.tune), findsNothing);
      expect(find.byType(TextField), findsOneWidget);
    });
  });

  group('a busca tem o mesmo contrato do filtro', () {
    ControleDeBusca buscaCom({
      required TextEditingController controlador,
      required List<String?> aplicados,
      String? termoAplicado,
      int minimo = 2,
    }) {
      return ControleDeBusca(
        controlador: controlador,
        alcance: AlcanceDaBusca.servidor,
        rotulo: 'Buscar evento',
        termoAplicado: termoAplicado,
        minimoDeCaracteres: minimo,
        aoAplicar: aplicados.add,
      );
    }

    testWidgets('ISCA -- digitar nao aplica; a lupa aplica, sem espaco nas '
        'pontas', (tester) async {
      // ISCA: em `CampoDeBuscaDaListagem`, troque `aoMudar: null` por
      // `aoMudar: (t) => busca.aoAplicar(t)`. Volta a busca automatica e este
      // caso reprova na primeira tecla.
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      final aplicados = <String?>[];
      await montar(
        tester,
        total: 3,
        busca: buscaCom(controlador: controlador, aplicados: aplicados),
      );

      await tester.enterText(find.byType(TextField), '  agility  ');
      await tester.pumpAndSettle();
      expect(aplicados, isEmpty);

      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();
      expect(aplicados, <String?>['agility']);
    });

    testWidgets('a tecla de busca do teclado e o MESMO caminho da lupa',
        (tester) async {
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      final aplicados = <String?>[];
      await montar(
        tester,
        total: 3,
        busca: buscaCom(controlador: controlador, aplicados: aplicados),
      );

      final campo = tester.widget<TextField>(find.byType(TextField));
      expect(campo.textInputAction, TextInputAction.search);

      await tester.enterText(find.byType(TextField), 'agility');
      await tester.pumpAndSettle();
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();
      expect(aplicados, <String?>['agility']);
    });

    testWidgets('campo vazio aplica NULO, que e a volta para a lista inteira',
        (tester) async {
      // Limpar a busca nao esta sujeito ao piso de caracteres da rota: o piso
      // guarda o termo que vai, e aqui nao vai termo nenhum.
      final controlador = TextEditingController(text: 'agility');
      addTearDown(controlador.dispose);
      final aplicados = <String?>[];
      await montar(
        tester,
        total: 3,
        busca: buscaCom(
          controlador: controlador,
          aplicados: aplicados,
          termoAplicado: 'agility',
        ),
      );

      await tester.enterText(find.byType(TextField), '');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Buscar'));
      await tester.pumpAndSettle();
      expect(aplicados, <String?>[null]);
    });

    testWidgets('a lupa nao habilita sem pendencia, e o motivo vai no nome',
        (tester) async {
      // Quem usa leitor de tela nao ve o botao apagado: ouvir "Buscar" e nada
      // acontecer e o toque sem desfecho que o criterio 2 persegue.
      final controlador = TextEditingController(text: 'agility');
      addTearDown(controlador.dispose);
      final aplicados = <String?>[];
      await montar(
        tester,
        total: 3,
        busca: buscaCom(
          controlador: controlador,
          aplicados: aplicados,
          termoAplicado: 'agility',
        ),
      );

      expect(find.byTooltip('Buscar, a busca já é esta'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'a');
      await tester.pumpAndSettle();
      expect(find.byTooltip('Buscar, faltam 1 letra'), findsOneWidget);

      await tester.tap(find.byTooltip('Buscar, faltam 1 letra'));
      await tester.pumpAndSettle();
      expect(aplicados, isEmpty);
    });

    testWidgets('o rotulo e a dica DENTRO do campo, e nao uma linha acima',
        (tester) async {
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      await montar(
        tester,
        total: 3,
        busca: buscaCom(controlador: controlador, aplicados: <String?>[]),
      );

      // O `(opcional)` saiu com o rotulo visivel.
      expect(find.text('Buscar evento (opcional)'), findsNothing);
      // **O texto existe UMA vez, e DENTRO do campo.** `findsNothing` sobre
      // `'Buscar evento'` nao podia passar: o `hintText` e desenhado pelo
      // `InputDecorator` como um `Text` com esse mesmo texto, e a linha de
      // baixo exige justamente que ele seja a dica -- a isca pedia a ausencia
      // do que ela mesma cobra em seguida. O que ela quis dizer e que nao ha
      // rotulo FORA do campo, e e isso que esta medido agora: exatamente um, e
      // descendente do `TextField`.
      expect(find.text('Buscar evento'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(TextField),
          matching: find.text('Buscar evento'),
        ),
        findsOneWidget,
      );
      final campo = tester.widget<TextField>(find.byType(TextField));
      expect(campo.decoration?.hintText, 'Buscar evento');
    });

    testWidgets('sem rotulo visivel, o campo com texto CONTINUA com nome',
        (tester) async {
      // A dica desaparece na primeira letra. Se ela fosse o unico nome, o
      // campo ficaria mudo (SC 3.3.2 e SC 4.1.2) justamente quando ha o que
      // revisar.
      final handle = tester.ensureSemantics();
      final controlador = TextEditingController(text: 'agility');
      addTearDown(controlador.dispose);
      await montar(
        tester,
        total: 3,
        busca: buscaCom(controlador: controlador, aplicados: <String?>[]),
      );

      expect(
        find.bySemanticsLabel(RegExp('Buscar evento')),
        findsWidgets,
        reason: 'REPROVA: campo com dica e sem rotulo ficou sem nome '
            'acessivel assim que recebeu texto.',
      );
      handle.dispose();
    });
  });

  group('o filtro mora na BARRA DE TITULO, e a busca ocupa a area toda', () {
    // **O PADRAO DE LISTAGEM MUDOU POR DECISAO DO CLIENTE (17/10/2026)**:
    // *"suba todos os filtros para a barra do titulo da pagina e deixe o
    // campo de busca sempre ocupando a area toda"*. Isto REVERTE a regra de
    // 22/09 ("busca, filtro e ordenacao no topo do CORPO da tela, nunca na
    // barra do aplicativo"). Quem ler estes casos em tres meses: a reversao
    // e dele, e nao um defeito.

    testWidgets('ISCA -- o controle de filtro nao fica no corpo', (tester) async {
      // ISCA: devolva o `_BotaoDeFolha` ao `Row` do corpo da barra. Este caso
      // reprova: passa a haver um `Icons.tune` fora da `AppBar`.
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        aoAplicar: (_) {},
      );

      expect(find.byIcon(Icons.tune), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byIcon(Icons.tune),
        ),
        findsOneWidget,
        reason: 'REPROVA: o controle de filtro nao esta na barra de titulo.',
      );
      expect(
        find.descendant(
          of: find.byType(BarraDeListagem),
          matching: find.byIcon(Icons.tune),
        ),
        findsNothing,
        reason: 'REPROVA: sobrou um controle de filtro no corpo da tela.',
      );
    });

    testWidgets('o alvo na barra e de 64 dp, e nao de 48', (tester) async {
      // 11.23.1 fixa os dois alvos da barra de topo em 64 x 64. Enquanto o
      // controle morou no corpo, 48 era a medida certa; nao ha mais corpo.
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        aoAplicar: (_) {},
      );

      // **A caixa do PROPRIO controle**, e nao o `SizedBox` mais proximo do
      // glifo: `find.ancestor(...).first` devolve o ancestral mais INTERNO, e
      // o `IconButton` do Material tem `SizedBox` proprio dentro dele -- a
      // medida que saia dali era 56, que nao e nem 48 nem 64 e nao
      // corresponde a decisao nenhuma. A caixa que o produto declara e a
      // primeira DESCENDENTE de `BotaoDeAcaoDaListagem`
      // (`barra_de_listagem.dart`, linhas 846-848,
      // `BichuAlvoDeToque.critico`), e e ela que o polegar acerta.
      final alvo = tester.getSize(
        find
            .descendant(
              of: find.byType(BotaoDeAcaoDaListagem),
              matching: find.byType(SizedBox),
            )
            .first,
      );
      expect(alvo.width, 64.0);
      expect(alvo.height, 64.0);
    });

    testWidgets('o campo de busca ocupa a LARGURA TOTAL do corpo, em 320 dp',
        (tester) async {
      // "Sempre" inclui a tela mais estreita que o produto desenha. O campo
      // nao divide mais a linha com icone nenhum, entao nao ha o que
      // encolher.
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        aoAplicar: (_) {},
        busca: ControleDeBusca(
          controlador: controlador,
          alcance: AlcanceDaBusca.servidor,
          termoAplicado: null,
          aoAplicar: (_) {},
        ),
      );

      final campo = tester.getSize(find.byType(CampoDeBuscaDaListagem));
      final barra = tester.getSize(find.byType(BarraDeListagem));
      expect(
        campo.width,
        barra.width,
        reason: 'REPROVA: o campo de busca nao ocupa a area toda em 320 dp.',
      );
    });

    testWidgets('sem barra desenhada, a barra de titulo fica sem controle',
        (tester) async {
      // Filtrar o nada e um toque sem desfecho, e um icone pendurado na
      // barra de titulo sobre uma lista vazia e pior do que um que some com
      // ela.
      await montar(
        tester,
        total: 0,
        filtro: filtroDeDoisGrupos(),
        aoAplicar: (_) {},
      );

      expect(find.byIcon(Icons.tune), findsNothing);
      expect(tester.widget<AppBar>(find.byType(AppBar)).actions, isNull);
    });
  });

  group('o recorte ativo e o APLICADO, e nunca o digitado', () {
    testWidgets('ISCA -- zero itens com termo APLICADO mantem a barra',
        (tester) async {
      // ISCA: em `BarraDeListagem._recorteAtivo`, troque
      // `busca?.termoAplicado` por `busca?.controlador.text`. Este caso
      // reprova: o controlador esta vazio e o termo foi aplicado, que e
      // exatamente o estado em que a barra desaparecia sem o conserto.
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      await montar(
        tester,
        total: 0,
        busca: ControleDeBusca(
          controlador: controlador,
          alcance: AlcanceDaBusca.servidor,
          termoAplicado: 'agility',
          aoAplicar: (_) {},
        ),
      );

      expect(
        find.byType(TextField),
        findsOneWidget,
        reason: 'REPROVA: a pessoa buscou, nao sobrou nada, e a barra que '
            'produziu o vazio sumiu junto. O unico caminho de volta seria '
            'sair da secao.',
      );
      expect(find.text('0 resultados'), findsOneWidget);
    });

    testWidgets('zero itens e nenhum recorte APLICADO: a barra nao nasce',
        (tester) async {
      // Texto digitado e intencao, e intencao nao recorta lista: com o campo
      // preenchido e nada aplicado a barra continua nao existindo.
      final controlador = TextEditingController(text: 'agility');
      addTearDown(controlador.dispose);
      await montar(
        tester,
        total: 0,
        busca: ControleDeBusca(
          controlador: controlador,
          alcance: AlcanceDaBusca.servidor,
          termoAplicado: null,
          aoAplicar: (_) {},
        ),
      );

      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('`desenha` responde o mesmo que o widget', (tester) async {
      // A `Rede` sobe o campo de busca para cima das abas e precisa da MESMA
      // decisao. Duas copias dela divergem na primeira edicao.
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      final busca = ControleDeBusca(
        controlador: controlador,
        alcance: AlcanceDaBusca.servidor,
        termoAplicado: null,
        aoAplicar: (_) {},
      );

      expect(BarraDeListagem.desenha(total: 0, busca: busca), isFalse);
      expect(BarraDeListagem.desenha(total: 2, busca: busca), isTrue);
      expect(BarraDeListagem.desenha(total: 0), isFalse);
      expect(
        BarraDeListagem.desenha(
          total: 0,
          busca: ControleDeBusca(
            controlador: controlador,
            alcance: AlcanceDaBusca.servidor,
            termoAplicado: 'agility',
            aoAplicar: (_) {},
          ),
        ),
        isTrue,
      );
    });
  });

  group('buscaAcima: a tela desenha o campo, a barra ainda sabe do termo', () {
    testWidgets('a barra nao desenha o campo duas vezes', (tester) async {
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      await montar(
        tester,
        total: 2,
        buscaAcima: true,
        busca: ControleDeBusca(
          controlador: controlador,
          alcance: AlcanceDaBusca.servidor,
          termoAplicado: null,
          aoAplicar: (_) {},
        ),
      );

      expect(find.byType(TextField), findsNothing);
      expect(find.text('2 resultados'), findsOneWidget);
    });

    testWidgets('ISCA -- com buscaAcima a barra FICA no vazio buscado',
        (tester) async {
      // ISCA: em `agenda_da_rede.dart`, passe `busca: null` a
      // `BarraDeListagem` em vez de `buscaAcima: true`. A barra perde o termo
      // aplicado, e a pessoa que buscou ate o vazio fica sem filtro e sem
      // ordem na tela.
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      await montar(
        tester,
        total: 0,
        buscaAcima: true,
        ordenacao: ControleDeOrdenacao(
          opcoes: const <OpcaoDeRecorte>[
            OpcaoDeRecorte(codigo: 'proximos', rotulo: 'Data mais próxima'),
            OpcaoDeRecorte(codigo: 'recentes', rotulo: 'Mais recente primeiro'),
          ],
          efetiva: 'proximos',
        ),
        busca: ControleDeBusca(
          controlador: controlador,
          alcance: AlcanceDaBusca.servidor,
          termoAplicado: 'agility',
          aoAplicar: (_) {},
        ),
      );

      expect(find.text('0 resultados · Data mais próxima'), findsOneWidget);
      expect(
        find.byTooltip('Ordenar, Data mais próxima'),
        findsOneWidget,
        reason: 'REPROVA: sem grupo de filtro, o icone unico da barra tem de '
            'se chamar `Ordenar` -- e com a ordem EFETIVA no nome.',
      );
    });
  });
}
