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
  final barra = BarraDeListagem(
    total: total,
    busca: busca,
    filtro: filtro,
    ordenacao: ordenacao,
    buscaAcima: buscaAcima,
    aoAplicar: aoAplicar ?? (_) {},
  );
  await tester.pumpWidget(
    _Casca(
      // **Com `buscaAcima`, a casca desenha a LINHA INTEIRA acima da barra**,
      // como `agenda_da_rede.dart` e `lista_de_perdidos.dart` fazem de
      // verdade desde 18/10/2026. Antes a casca desenhava so a barra, e o
      // campo que a tela sobe nao existia em teste nenhum -- o gatilho que
      // acompanha esse campo nao seria medido em lugar nenhum.
      child: buscaAcima && busca != null
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                LinhaDeBuscaDaListagem(
                  total: total,
                  busca: busca,
                  filtro: filtro,
                  ordenacao: ordenacao,
                  aoAplicar: aoAplicar ?? (_) {},
                ),
                barra,
              ],
            )
          : barra,
    ),
  );
  await tester.pumpAndSettle();
}

/// O corpo de uma tela de aba DE VERDADE: 16 dp de folga em cada lado.
///
/// `casca_com_abas.dart` declara `padding: EdgeInsets.all(BichuEspaco.e4)` no
/// corpo, e e por isso que a largura que a busca recebe num aparelho de 320 dp
/// se mede sobre 288 dp, e nao sobre 320. Medir sem a folga daria um numero
/// que nenhuma tela mostra.
Future<void> montarNoCorpoDaAba(
  WidgetTester tester, {
  required int total,
  required double largura,
  ControleDeBusca? busca,
  ControleDeFiltro? filtro,
  ControleDeOrdenacao? ordenacao,
  void Function(EscolhaDaFolha)? aoAplicar,
}) async {
  tester.view.physicalSize = Size(largura, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    _Casca(
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        child: BarraDeListagem(
          total: total,
          busca: busca,
          filtro: filtro,
          ordenacao: ordenacao,
          aoAplicar: aoAplicar ?? (_) {},
        ),
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
              // **A BARRA DE TOPO NAO DESENHA MAIS A ACAO DA LISTAGEM**, e a
              // casca de teste acompanha a de verdade: o `Filtros` voltou
              // para o corpo em 19/10 e `TelaDeAba` deixou de pintar o slot.
              //
              // O `SlotDaBarraDeListagem` acima **fica**, e nao e resto: e
              // ele que `BarraDeListagem` usa para publicar NULO e limpar a
              // barra quando a lista sai da tela. Mantendo o slot montado, os
              // casos continuam exercendo esse caminho; se a casca voltasse a
              // pintar `acao`, a isca do grupo do corpo reprovaria.
              actions: const <Widget>[],
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

  group('o filtro mora no CORPO, e a busca ocupa a area toda', () {
    // **O PADRAO DE LISTAGEM VOLTOU AO CORPO POR DECISAO DO CLIENTE
    // (19/10/2026)**: *"qualquer coisa, pense em outro lugar para colocar o
    // filtro da pagina"*.
    //
    // Isto REVERTE a decisao dele de 17/10 ("suba todos os filtros para a
    // barra do titulo da pagina"), que por sua vez tinha revertido a regra de
    // 22/09 ("busca, filtro e ordenacao no topo do CORPO da tela, nunca na
    // barra do aplicativo"). O lugar de hoje e o de 22/09, que e a casa
    // original. Quem ler estes casos em tres meses: as tres reversoes sao
    // dele, e nenhuma e defeito.
    //
    // **A busca nao mudou**: ela continua em largura TOTAL no corpo, que foi
    // o outro pedido de 17/10 e que ele nao reverteu.
    //
    // O que a saida da barra liberou: os 64 dp do slot. Eles NAO cobriram o
    // sino de notificacoes -- `Filtros` era condicional (so onde ha lista) e
    // o sino seria incondicional --, e a medicao disso esta em
    // `gaveta_com_submenus_test.dart`.

    testWidgets('ISCA -- o controle de filtro fica no CORPO, e nao na barra',
        (tester) async {
      // ISCA: faca `BarraDeListagem` voltar a publicar a acao no slot da
      // `AppBar`. Este caso reprova: o `Icons.tune` reaparece dentro da
      // `AppBar` e desaparece do corpo.
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        aoAplicar: (_) {},
      );

      expect(find.byIcon(Icons.tune), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(BarraDeListagem),
          matching: find.byIcon(Icons.tune),
        ),
        findsOneWidget,
        reason: 'REPROVA: o controle de filtro nao esta no corpo da tela. Ele '
            'voltou para la em 19/10, por decisao do cliente.',
      );
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byIcon(Icons.tune),
        ),
        findsNothing,
        reason: 'REPROVA: sobrou um controle de filtro na barra de titulo. Os '
            '64 dp dele foram devolvidos ao titulo, e `Perto` depende disso.',
      );
    });

    testWidgets('o alvo no corpo e de 48 dp, o piso do SC 2.5.8',
        (tester) async {
      // **64 -> 48, e a troca acompanha a mudanca de lugar.** O 11.23.1 fixa
      // 64 x 64 para os controles de CANTO da barra de topo, onde o dedo
      // disputa a borda com o titulo e com a mao que segura o aparelho. No
      // corpo essa disputa nao existe: o piso e o do SC 2.5.8, que e 48.
      await montar(
        tester,
        total: 3,
        filtro: filtroDeDoisGrupos(),
        aoAplicar: (_) {},
      );

      final alvo = tester.getSize(find.byType(GatilhoDeRecorteNoCorpo));
      expect(
        alvo.height,
        greaterThanOrEqualTo(48.0),
        reason: 'REPROVA: o gatilho de filtro no corpo tem ${alvo.height} dp '
            'de altura, abaixo do piso de 48 dp (SC 2.5.8).',
      );
    });

    testWidgets(
        'ISCA -- o gatilho vem NA FRENTE da busca, e na MESMA linha',
        (tester) async {
      // ISCA: em `LinhaDeBuscaDaListagem.build`, mova
      // `GatilhoDeRecorteNoCorpo` para DEPOIS do `Expanded`, ou troque a `Row`
      // por uma `Column`. Este caso reprova nas duas: na primeira o gatilho
      // deixa de estar a esquerda; na segunda ele deixa de dividir a linha.
      //
      // **Ele mede GEOMETRIA, e nao a ordem da lista de `children`.** A ordem
      // da lista nao e o que o cliente pediu -- ele pediu o controle NA
      // FRENTE do campo e na mesma linha --, e um caso que lesse a lista
      // ficaria verde com uma `Row` em `textDirection: rtl`.
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      await montarNoCorpoDaAba(
        tester,
        total: 3,
        largura: 320,
        filtro: filtroDeDoisGrupos(),
        busca: ControleDeBusca(
          controlador: controlador,
          alcance: AlcanceDaBusca.servidor,
          termoAplicado: null,
          aoAplicar: (_) {},
        ),
      );

      final gatilho = tester.getRect(find.byType(GatilhoDeRecorteNoCorpo));
      final campo = tester.getRect(find.byType(CampoDeBuscaDaListagem));

      expect(
        gatilho.right,
        lessThanOrEqualTo(campo.left),
        reason: 'REPROVA: o gatilho de filtro nao esta NA FRENTE do campo de '
            'busca. Ele termina em ${gatilho.right} e o campo comeca em '
            '${campo.left}.',
      );
      expect(
        gatilho.center.dy,
        allOf(
          greaterThanOrEqualTo(campo.top),
          lessThanOrEqualTo(campo.bottom),
        ),
        reason: 'REPROVA: o gatilho nao divide a LINHA com a busca. O centro '
            'dele esta em ${gatilho.center.dy} e o campo ocupa de '
            '${campo.top} a ${campo.bottom}. O cliente pediu "na frente do '
            'campo de busca e nao embaixo".',
      );
    });

    testWidgets(
        'ISCA -- o gatilho e SO O ICONE: nenhuma letra pintada nele',
        (tester) async {
      // ISCA: em `GatilhoDeRecorteNoCorpo`, volte o `OutlinedButton.icon` com
      // `label: Text(_verbo)`. Este caso reprova: "Filtrar" reaparece pintado
      // dentro do gatilho.
      //
      // **Ele olha o WIDGET, e nao um literal.** Procurar
      // `find.text('Filtrar')` com `findsNothing` ficaria verde a toa no dia
      // em que o verbo mudasse de palavra -- o defeito de portao cego que
      // este repositorio ja teve. Aqui o caso varre os `Text` DESCENDENTES do
      // gatilho e cobra que nenhum tenha letra: o distintivo com o numero de
      // filtros ativos e o unico texto que pode sobrar ali, e numero nao tem
      // letra.
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      await montarNoCorpoDaAba(
        tester,
        total: 3,
        largura: 320,
        // COM filtro ativo, de proposito: e o estado em que o rotulo pintado
        // dizia "Filtrar (1)", e e o unico em que o distintivo existe.
        filtro: filtroDeDoisGrupos(atividade: 'vet'),
        busca: ControleDeBusca(
          controlador: controlador,
          alcance: AlcanceDaBusca.servidor,
          termoAplicado: null,
          aoAplicar: (_) {},
        ),
      );

      // O glifo esta la, e o nome acessivel tambem: sem estas duas o caso
      // acima viraria "o gatilho nao existe", que passa de qualquer jeito.
      expect(
        find.descendant(
          of: find.byType(GatilhoDeRecorteNoCorpo),
          matching: find.byIcon(Icons.tune),
        ),
        findsOneWidget,
        reason: 'REPROVA: o gatilho perdeu o glifo. Sem ele o caso abaixo '
            'mediria a ausencia do controle, e nao a ausencia do texto.',
      );
      expect(
        find.byTooltip('Filtrar, 1 filtro ativo'),
        findsOneWidget,
        reason: 'REPROVA: o gatilho so-icone ficou sem nome acessivel. Sem o '
            'texto pintado, o `tooltip` e a UNICA forma de ele se nomear '
            '(SC 4.1.2).',
      );

      final pintados = tester
          .widgetList<Text>(
            find.descendant(
              of: find.byType(GatilhoDeRecorteNoCorpo),
              matching: find.byType(Text),
            ),
          )
          .map((t) => t.data ?? '')
          .toList();
      final comLetra =
          pintados.where((t) => RegExp('[A-Za-zÀ-ÿ]').hasMatch(t)).toList();
      expect(
        comLetra,
        isEmpty,
        reason: 'REPROVA: o gatilho de filtro voltou a pintar texto '
            '($comLetra). O cliente pediu em 18/10/2026: "os campos de filtro '
            'nao devem vir com o texto, apenas com o icone".',
      );
      expect(
        pintados,
        <String>['1'],
        reason: 'REPROVA: o distintivo com o numero de filtros ativos nao '
            'esta pintado sobre o glifo. Sem o texto do rotulo, ele e a unica '
            'forma de quem VE saber que ha filtro aplicado.',
      );
    });

    testWidgets(
        'a busca recebe a largura do corpo menos o gatilho, nas CINCO larguras',
        (tester) async {
      // A MEDICAO DO ARRANJO COMPACTO, no corpo de verdade (16 dp de cada
      // lado). Substitui o caso "o campo ocupa a LARGURA TOTAL", que media o
      // arranjo de 17/10 -- o campo sozinho na linha. Ele nao esta mais
      // sozinho: divide a linha com um alvo de 48 dp e 8 dp de respiro, e e
      // esse resto que este caso fixa.
      //
      // ISCA: tire o gatilho da `Row` (ou mande-o para uma linha propria). O
      // campo volta a largura cheia do corpo e os cinco numeros erram por
      // 56 dp.
      // Lista de pares, e nao mapa: `double` nao serve de chave de mapa
      // constante. A primeira medida e a do APARELHO, a segunda a que a busca
      // tem de receber -- o corpo e a largura menos 32 dp de folga, e a busca
      // e o corpo menos 48 do gatilho e 8 de respiro.
      const esperado = <(double, double)>[
        (320, 232), // corpo 288
        (360, 272), // corpo 328
        (375, 287), // corpo 343
        (390, 302), // corpo 358
        (412, 324), // corpo 380
      ];

      for (final (aparelho, larguraDaBusca) in esperado) {
        final controlador = TextEditingController();
        addTearDown(controlador.dispose);
        await montarNoCorpoDaAba(
          tester,
          total: 3,
          largura: aparelho,
          filtro: filtroDeDoisGrupos(),
          busca: ControleDeBusca(
            controlador: controlador,
            alcance: AlcanceDaBusca.servidor,
            termoAplicado: null,
            aoAplicar: (_) {},
          ),
        );

        final campo = tester.getSize(find.byType(CampoDeBuscaDaListagem));
        final barra = tester.getSize(find.byType(BarraDeListagem));
        final gatilho = tester.getSize(find.byType(GatilhoDeRecorteNoCorpo));

        expect(
          campo.width,
          larguraDaBusca,
          reason: 'REPROVA: em $aparelho dp de aparelho a busca recebeu '
              '${campo.width} dp, e nao $larguraDaBusca. O corpo tem '
              '${barra.width} dp e o gatilho ${gatilho.width}.',
        );
        expect(
          campo.width + gatilho.width + BichuEspaco.e2,
          barra.width,
          reason: 'REPROVA: em $aparelho dp a linha nao fecha no corpo. '
              'Busca ${campo.width} + gatilho ${gatilho.width} + 8 nao da '
              '${barra.width}, e o `Row` estourou ou sobrou folga.',
        );
        expect(
          gatilho.width,
          BichuAlvoDeToque.min,
          reason: 'REPROVA: o gatilho tem ${gatilho.width} dp de largura em '
              '$aparelho dp, e nao os 48 do SC 2.5.8.',
        );
      }
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
      // A casca de teste passou a declarar `actions: const <Widget>[]`, como
      // a de verdade: desde 19/10 a barra de topo nao desenha a acao da
      // listagem. O que este caso cobra continua sendo o mesmo -- NENHUM
      // controle de recorte na barra de titulo --, e agora ele cobra a lista
      // VAZIA em vez de nula.
      expect(
        tester.widget<AppBar>(find.byType(AppBar)).actions,
        isEmpty,
        reason: 'REPROVA: a barra de titulo ganhou controle sobre uma lista '
            'vazia. Filtrar o nada e um toque sem desfecho.',
      );
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

      // **UM campo, e ele e o da TELA.** A casca desenha a linha acima da
      // barra, como as duas telas de verdade; o que este caso cobra e que a
      // barra nao desenhe o segundo.
      expect(find.byType(TextField), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(BarraDeListagem),
          matching: find.byType(TextField),
        ),
        findsNothing,
        reason: 'REPROVA: com `buscaAcima` a barra desenhou o campo de novo, '
            'e a tela passou a ter dois.',
      );
      expect(find.text('2 resultados'), findsOneWidget);
    });

    testWidgets(
        'ISCA -- com buscaAcima o GATILHO sobe junto, e a barra nao o repete',
        (tester) async {
      // ISCA: em `BarraDeListagem.build`, tire o `!b.buscaAcima` da condicao
      // do gatilho solto. A barra volta a desenhar um segundo gatilho abaixo
      // da linha, e este caso reprova com dois.
      //
      // Por que isto importa: a linha de busca e UMA. Partida entre dois
      // lugares da tela, o campo fica em cima das abas e o gatilho embaixo
      // delas -- que e exatamente o "embaixo" que o cliente mandou sair.
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);
      await montar(
        tester,
        total: 2,
        buscaAcima: true,
        filtro: filtroDeDoisGrupos(),
        busca: ControleDeBusca(
          controlador: controlador,
          alcance: AlcanceDaBusca.servidor,
          termoAplicado: null,
          aoAplicar: (_) {},
        ),
      );

      expect(
        find.byType(GatilhoDeRecorteNoCorpo),
        findsOneWidget,
        reason: 'REPROVA: com `buscaAcima` ha mais de um gatilho de filtro na '
            'tela (ou nenhum). A linha de busca e uma so.',
      );
      expect(
        find.descendant(
          of: find.byType(BarraDeListagem),
          matching: find.byType(GatilhoDeRecorteNoCorpo),
        ),
        findsNothing,
        reason: 'REPROVA: a barra desenhou o gatilho mesmo com a linha de '
            'busca ja desenhada pela tela.',
      );
      expect(
        find.descendant(
          of: find.byType(LinhaDeBuscaDaListagem),
          matching: find.byType(GatilhoDeRecorteNoCorpo),
        ),
        findsOneWidget,
        reason: 'REPROVA: o gatilho nao esta na linha de busca que a tela '
            'desenhou.',
      );
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
