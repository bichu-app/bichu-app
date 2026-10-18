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
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: BarraDeListagem(
          total: total,
          busca: busca,
          filtro: filtro,
          ordenacao: ordenacao,
          buscaAcima: buscaAcima,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

ControleDeFiltro filtroDeDoisGrupos({
  required void Function(Map<String, String?>) aoAplicar,
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
    aoAplicar: aoAplicar,
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
        filtro: filtroDeDoisGrupos(aoAplicar: aplicadas.add),
      );

      await tester.tap(find.byTooltip('Filtrar'));
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
        filtro: filtroDeDoisGrupos(aoAplicar: aplicadas.add),
      );

      await tester.tap(find.byTooltip('Filtrar'));
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
        filtro: filtroDeDoisGrupos(aoAplicar: aplicadas.add, atividade: 'vet'),
      );

      await tester.tap(find.byTooltip('Filtrar, 1 filtro ativo'));
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
        filtro: filtroDeDoisGrupos(
          aoAplicar: aplicadas.add,
          atividade: 'vet',
          nivel: 'contact',
        ),
      );

      await tester.tap(find.byTooltip('Filtrar, 2 filtros ativos'));
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
          aoAplicar: aplicadas.add,
        ),
      );

      await tester.tap(find.byTooltip('Filtrar, 2 filtros ativos'));
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
        rotulo: 'Buscar encontro',
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
      expect(find.text('Buscar encontro (opcional)'), findsNothing);
      expect(find.text('Buscar encontro'), findsNothing);
      final campo = tester.widget<TextField>(find.byType(TextField));
      expect(campo.decoration?.hintText, 'Buscar encontro');
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
        find.bySemanticsLabel(RegExp('Buscar encontro')),
        findsWidgets,
        reason: 'REPROVA: campo com dica e sem rotulo ficou sem nome '
            'acessivel assim que recebeu texto.',
      );
      handle.dispose();
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
          aoEscolher: (_) {},
        ),
        busca: ControleDeBusca(
          controlador: controlador,
          alcance: AlcanceDaBusca.servidor,
          termoAplicado: 'agility',
          aoAplicar: (_) {},
        ),
      );

      expect(find.text('0 resultados · Data mais próxima'), findsOneWidget);
      expect(find.byTooltip('Ordenar, Data mais próxima'), findsOneWidget);
    });
  });
}
