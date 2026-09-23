// A GAVETA COM O SUBMENU DE CADA SECAO — as iscas.
//
// Pedido direto do cliente, repetido duas vezes. O product manager recomendou
// contra, com medidas; o cliente leu e decidiu pela gaveta. As medidas dele
// nao evaporaram com a decisao: viraram as quatro restricoes que este arquivo
// cobra, uma por grupo.
//
//  1. `o gesto de voltar`  — a gaveta NAO abre por arrasto de borda. No iOS a
//                            borda esquerda ja e o voltar deste app, e no
//                            Android o voltar por gesto sai de qualquer uma
//                            das duas bordas. Tem contraprova: o MESMO arrasto,
//                            com o padrao do Flutter ligado, abre a gaveta.
//  2. `o slot de acao`     — o hamburguer ficou na ESQUERDA e nada saiu do
//                            lugar: o slot unico da direita (11.23.1) continua
//                            livre para o `Filtros`. E `Saida + hamburguer`
//                            nao coexistem em tela nenhuma.
//  3. `os cinco titulos`   — medidos contra o que sobra da barra de topo com o
//                            hamburguer instalado, em 320 dp e a 200%, com a
//                            `Inter` de verdade.
//  4. `dois menus, uma     — nenhum item da gaveta navega para SECAO. A barra
//     divisao`               de baixo troca de secao; a gaveta entra nos
//                            caminhos de dentro dela.
//
// E as duas regras que nao se negociam:
//
//  5. `nenhum item morto`  — o criterio 2 da BICHUS-62. Todo item tocavel da
//                            gaveta tem rota REGISTRADA no roteador de verdade
//                            e navega; nenhum sub-destino nao construido vira
//                            controle. Tem contraprova nos dois sentidos.
//  6. `a gaveta e modal`   — com ela aberta, o leitor de tela nao alcanca o
//                            fundo. A contraprova e a mesma varredura com a
//                            gaveta FECHADA, que PRECISA achar o fundo -- sem
//                            ela, o caso passaria por nao estar olhando.
//
// Sobre tautologia: os casos que comparam texto renderizado com a constante
// que o produz estao marcados, e nenhum deles e a prova principal do seu
// grupo. A prova principal e sempre um comportamento (navegou, nao abriu,
// nao aparece na arvore), medido no app montado.

import 'dart:io';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import '../widgets/portao_de_tokens_test.dart' show conferir;
import 'ajuda_de_tela.dart';
import 'casca_de_cinco_secoes_test.dart' show carregarInter;

Future<http.Response> _semServidor(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  if (req.url.path.endsWith('/reference-data')) {
    return json200(referenciaDeTeste());
  }
  if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
    return http.Response('', 204);
  }
  return http.Response('', 404);
}

/// As secoes a que a UX 27.5 da o slot UNICO de acao da barra de topo.
///
/// Escrita a mao **de proposito**, como `ordemDecidida` no portao da
/// BICHUS-164: e a segunda fonte da verdade, e ela existe para brigar com a
/// primeira. Um portao que derivasse isto do registro de sub-destinos
/// incluiria `Excluir a conta` de `Perfil`, que tambem e folha inferior e
/// **nao** e gatilho de barra de topo -- e passaria a cobrar 64 dp de uma
/// secao que nunca vai paga-los.
///
/// Procedencia, linha a linha: 27.5.1 (`Pets` > `Filtros`, "folha inferior,
/// gatilho `tune` no slot unico"), 27.5.2 (`Rede` > `Filtros`), 27.5.3
/// (`Perto` > `Filtros`) e 27.5.4 (`Loja` > `Filtros de categoria`). A 27.5.5
/// NAO da acao de topo a `Perfil`: `Excluir a conta` e folha destrutiva
/// aberta de dentro da pagina.
const Set<String> secoesComGatilhoDeFiltro = <String>{
  'Pets',
  'Rede',
  'Perto',
  'Loja',
};

// ---------------------------------------------------------------------------
// A bancada
// ---------------------------------------------------------------------------

/// Abre a gaveta pelo BOTAO, que e a unica forma que ela tem de abrir.
Future<void> abrirAGaveta(WidgetTester tester) async {
  final gatilho = find.byTooltip(TextosDaGaveta.abrirAGaveta);
  expect(
    gatilho,
    findsOneWidget,
    reason:
        'REPROVA: nao achei o gatilho da gaveta na barra de topo. Com o '
        'arrasto de borda desligado, ele e o UNICO jeito de abrir a gaveta: '
        'sem ele os submenus ficam inalcancaveis.',
  );
  await tester.tap(gatilho);
  await tester.pumpAndSettle();
  expect(
    find.byType(Drawer),
    findsOneWidget,
    reason: 'REPROVA: o gatilho existe e nao abriu a gaveta.',
  );
}

/// A lista rolavel DA GAVETA, e nao qualquer uma da tela.
///
/// `find.byType(Scrollable)` devolve varias: a da gaveta, a do corpo da aba e
/// a de cada lista de dentro. Sem esta restricao, `scrollUntilVisible` estoura
/// com `Bad state: Too many elements` -- e um portao que estoura nao mede.
Finder get rolavelDaGaveta =>
    find.descendant(of: find.byType(Drawer), matching: find.byType(Scrollable));

/// Rola a gaveta ate o fim, juntando tudo o que ela PINTA no caminho.
///
/// Necessario porque a gaveta e um `ListView`: o que esta abaixo da dobra nao
/// tem `Element` nenhum, e `find` nao acha o que nao foi construido. Um caso
/// que so olhasse a primeira tela aprovaria uma gaveta que perde os grupos de
/// baixo.
Future<Set<String>> textosDaGavetaInteira(WidgetTester tester) async {
  final vistos = <String>{};
  void coletar() {
    vistos.addAll(
      tester
          .widgetList<Text>(
            find.descendant(
              of: find.byType(Drawer),
              matching: find.byType(Text),
            ),
          )
          .map((t) => t.data ?? '')
          .where((t) => t.isNotEmpty),
    );
  }

  coletar();
  for (var i = 0; i < 40; i++) {
    final antes = tester.getRect(rolavelDaGaveta);
    await tester.drag(rolavelDaGaveta, const Offset(0, -BichuEspaco.e16 * 4));
    await tester.pumpAndSettle();
    coletar();
    if (tester.getRect(rolavelDaGaveta) == antes &&
        !tester.hasRunningAnimations) {
      // A dobra nao se move mais: cheguei ao fim ou a lista nao rola.
      final antesDoTamanho = vistos.length;
      await tester.drag(rolavelDaGaveta, const Offset(0, -BichuEspaco.e16 * 4));
      await tester.pumpAndSettle();
      coletar();
      if (vistos.length == antesDoTamanho) break;
    }
  }
  expect(
    vistos,
    isNotEmpty,
    reason:
        'REPROVA: a gaveta nao pintou texto nenhum. O coletor esta '
        'olhando para a arvore errada e todo caso que depende dele passaria '
        'por vazio.',
  );
  return vistos;
}

/// O VOLTAR DO SISTEMA, pelo caminho que o sistema usa de verdade.
///
/// E a mensagem `popRoute` no canal `flutter/navigation` -- a mesma que o
/// Android manda no gesto de borda e no botao de voltar, e que o iOS manda no
/// gesto de borda. Chamar `Navigator.pop` no teste seria o atalho que parece
/// equivalente: ele pula justamente a camada em que uma gaveta mal instalada
/// engole o gesto.
Future<void> voltarDoSistema(WidgetTester tester) async {
  await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
    'flutter/navigation',
    const JSONMethodCodec().encodeMethodCall(const MethodCall('popRoute')),
    (_) {},
  );
  await tester.pumpAndSettle();
}

/// Todos os nos da arvore de semantica.
List<SemanticsNode> todosOsNos(WidgetTester tester) {
  final raiz = tester.getSemantics(find.byType(MaterialApp));
  final todos = <SemanticsNode>[];
  void andar(SemanticsNode no) {
    todos.add(no);
    no.visitChildren((filho) {
      andar(filho);
      return true;
    });
  }

  andar(raiz);
  expect(
    todos.length,
    greaterThan(1),
    reason:
        'REPROVA: a arvore de semantica tem ${todos.length} no(s). Sem '
        '`ensureSemantics` ela nasce vazia e todo caso deste arquivo passaria '
        'por vacuidade.',
  );
  return todos;
}

/// Os nomes acessiveis de tudo que o leitor de tela consegue ATIVAR.
///
/// E a medida que serve aos dois grupos mais caros: "nenhum item morto" olha
/// o que **esta** aqui, e "a gaveta e modal" olha o que **nao pode** estar.
List<String> rotulosAtivaveis(WidgetTester tester) {
  return todosOsNos(tester)
      .where((n) => n.getSemanticsData().hasAction(SemanticsAction.tap))
      .map((n) => n.label)
      .where((l) => l.isNotEmpty)
      .toList();
}

/// Os itens vivos do registro, achatados com a secao a que pertencem.
List<({String secao, SubDestino item})> itensVivos() {
  return <({String secao, SubDestino item})>[
    for (final destino in CascaComAbas.destinos)
      for (final item in RegistroDeSubDestinos.itensDe(destino.rota))
        (secao: destino.rota, item: item),
  ];
}

/// Todos os sub-destinos de menu que o mapa declara e ninguem construiu.
List<SubDestino> pendentes() {
  return <SubDestino>[
    for (final destino in CascaComAbas.destinos)
      ...RegistroDeSubDestinos.pendentesDe(destino.rota),
  ];
}

// ---------------------------------------------------------------------------

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(carregarInter);

  // -------------------------------------------------------------------------
  group('1. o gesto de voltar', () {
    testWidgets('a raiz de secao declara o arrasto de borda DESLIGADO', (
      tester,
    ) async {
      await abrirOApp(tester, rede: _semServidor);

      for (final destino in CascaComAbas.destinos) {
        await tester.tap(
          find.widgetWithText(NavigationDestination, destino.rotulo),
        );
        await tester.pumpAndSettle();

        final cascas = tester
            .widgetList<Scaffold>(find.byType(Scaffold))
            .where((s) => s.drawer != null)
            .toList();
        expect(
          cascas,
          hasLength(1),
          reason:
              'REPROVA: a secao "${destino.rotulo}" montou '
              '${cascas.length} `Scaffold` com gaveta. Duas gavetas na mesma '
              'tela e dois gatilhos disputando a mesma borda.',
        );
        expect(
          cascas.single.drawerEnableOpenDragGesture,
          isFalse,
          reason:
              'REPROVA: a secao "${destino.rotulo}" deixou o arrasto de '
              'borda LIGADO, que e o padrao do Flutter. No iOS a borda '
              'esquerda e o voltar deste app e no Android o voltar por gesto '
              'sai de qualquer uma das duas bordas: a gaveta passaria a '
              'roubar o gesto de voltar em toda tela de secao. Ela abre so '
              'pelo botao.',
        );
      }
    });

    testWidgets('arrastar da borda esquerda NAO abre a gaveta', (tester) async {
      // A declaracao acima e o fonte; isto e o aparelho. As duas medem coisas
      // diferentes: o campo pode estar falso e outro `Scaffold` acima montar
      // a gaveta com o padrao.
      await abrirOApp(tester, rede: _semServidor);
      await tester.dragFrom(const Offset(1, 400), const Offset(320, 0));
      await tester.pumpAndSettle();

      expect(
        find.byType(Drawer),
        findsNothing,
        reason:
            'REPROVA: o arrasto da borda esquerda ABRIU a gaveta. E o '
            'gesto de voltar do iOS e um dos dois gestos de voltar do '
            'Android, e quem arrastar para sair de uma tela vai receber um '
            'menu.',
      );
    });

    testWidgets('CONTRAPROVA: o MESMO arrasto abre uma gaveta com o padrao do '
        'Flutter', (tester) async {
      // Sem este caso o de cima ficaria verde no dia em que `dragFrom`
      // parasse de produzir um arrasto de borda -- e a gaveta poderia estar
      // abrindo por arrasto sem ninguem saber.
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(
            // `drawerEnableOpenDragGesture` fica no PADRAO (true) de
            // proposito: e exatamente o que a casca desliga.
            drawer: Drawer(child: Text('contraprova')),
            body: SizedBox.expand(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.dragFrom(const Offset(1, 400), const Offset(320, 0));
      await tester.pumpAndSettle();

      expect(
        find.text('contraprova'),
        findsOneWidget,
        reason:
            'REPROVA: o arrasto nao abriu nem a gaveta que ACEITA '
            'arrasto. O gesto da bancada deixou de ser um arrasto de borda, e '
            'o caso acima passou a nao medir nada.',
      );
    });

    testWidgets('o voltar do sistema continua saindo da tela empilhada', (
      tester,
    ) async {
      // O risco concreto: uma gaveta instalada na casca engole o `pop` e a
      // pessoa fica presa na tela de dentro.
      await abrirOApp(tester, rede: _semServidor);
      await abrirAGaveta(tester);
      await tester.tap(find.byKey(ItemDaGaveta.chaveDe(Rotas.pets, 'Adoções')));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppBar, 'Adoções'), findsOneWidget);

      await voltarDoSistema(tester);

      expect(
        find.widgetWithText(AppBar, 'Pets'),
        findsOneWidget,
        reason:
            'REPROVA: o voltar do sistema nao desempilhou `Adoções`. Com '
            'a gaveta instalada na casca, o `pop` passou a ser consumido por '
            'ela e quem entrou num sub-destino ficou sem volta.',
      );
    });

    testWidgets('com a gaveta ABERTA, o voltar do sistema fecha a gaveta e '
        'nao a tela', (tester) async {
      await abrirOApp(tester, rede: _semServidor);
      await abrirAGaveta(tester);

      await voltarDoSistema(tester);

      expect(
        find.byType(Drawer),
        findsNothing,
        reason:
            'REPROVA: o voltar nao fechou a gaveta aberta. Gaveta modal '
            'que nao fecha no voltar e a armadilha classica: a unica saida '
            'passa a ser tocar fora dela, que ninguem descobre sem ver.',
      );
      expect(
        find.widgetWithText(AppBar, 'Pets'),
        findsOneWidget,
        reason:
            'REPROVA: o voltar fechou a gaveta E saiu da secao. O gesto '
            'gastou dois passos de navegacao de uma vez.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('2. onde o hamburguer ficou, e o que saiu do lugar', () {
    testWidgets('ele esta no slot da ESQUERDA (`leading`)', (tester) async {
      await abrirOApp(tester, rede: _semServidor);

      final barra = tester.widget<AppBar>(find.byType(AppBar));
      expect(
        barra.leading,
        isA<BotaoDaGaveta>(),
        reason:
            'REPROVA: o gatilho da gaveta nao esta no `leading`. A UX '
            '25.6 e a 27.5 recusaram o hamburguer A DIREITA porque o 11.23.1 '
            'da UM slot de acao ali e em `Pets` e em `Perto` ele e do '
            '`Filtros`. A esquerda esta livre na raiz de secao, que e a unica '
            'tela do app com `Saida=Nenhuma` (23.4).',
      );
    });

    testWidgets('o slot UNICO de acao da direita continua LIVRE', (
      tester,
    ) async {
      // O que a pergunta "o que saiu do lugar?" cobra: NADA saiu. Este caso
      // reprova no dia em que alguem puser o hamburguer -- ou qualquer outra
      // coisa -- no slot que o `Filtros` vai ocupar.
      await abrirOApp(tester, rede: _semServidor);

      for (final destino in CascaComAbas.destinos) {
        await tester.tap(
          find.widgetWithText(NavigationDestination, destino.rotulo),
        );
        await tester.pumpAndSettle();

        final barra = tester.widget<AppBar>(find.byType(AppBar));
        expect(
          barra.actions ?? const <Widget>[],
          isEmpty,
          reason:
              'REPROVA: a secao "${destino.rotulo}" ocupou o slot de acao '
              'da direita. Ele e UM so (11.23.1) e esta reservado ao '
              '`Filtros` em `Pets` e em `Perto`; o hamburguer foi para a '
              'esquerda justamente para nao disputa-lo.',
        );
      }
    });

    testWidgets('SAIDA e HAMBURGUER nunca aparecem na mesma barra', (
      tester,
    ) async {
      // A composicao `Saida + titulo + hamburguer` e a que aperta o titulo, e
      // ela nao existe neste app por construcao: `raizDeSecao` e a unica
      // condicao que monta o gatilho, e raiz de secao nao tem saida.
      await abrirOApp(tester, rede: _semServidor);

      // Na raiz: hamburguer, sem saida.
      expect(find.byType(BotaoDaGaveta), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byTooltip('Voltar'),
        ),
        findsNothing,
        reason: 'REPROVA: a raiz de secao ganhou saida ALEM do hamburguer.',
      );

      // Numa tela empilhada que usa a MESMA `TelaDeAba`: saida, sem
      // hamburguer.
      await abrirAGaveta(tester);
      await tester.tap(find.byKey(ItemDaGaveta.chaveDe(Rotas.pets, 'Adoções')));
      await tester.pumpAndSettle();

      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byTooltip('Voltar'),
        ),
        findsOneWidget,
        reason:
            'REPROVA: `Adoções` perdeu a saida. Ela usa a mesma '
            '`TelaDeAba` das raizes, e por o hamburguer no `leading` sem a '
            'condicao de raiz apagaria a seta automatica do `AppBar`.',
      );
      expect(
        find.byType(BotaoDaGaveta),
        findsNothing,
        reason:
            'REPROVA: `Adoções` ganhou hamburguer por cima da saida. A '
            'composicao `Saida + titulo + hamburguer` e a que aperta o '
            'titulo, e ela nao pode existir.',
      );
    });

    testWidgets('raiz de secao montada FORA da casca nao desenha o gatilho', (
      tester,
    ) async {
      // Achado por estas iscas, e nao deduzido: `rotas.dart` usa
      // `AbaPerfil()` como tela de escape de rotas alcancadas sem o `extra`
      // que esperavam, e essas rotas sao IRMAS da casca. Ali a raiz de
      // secao existe sem barra de baixo e sem gaveta. Com o gatilho preso
      // so a `raizDeSecao`, tres casos de `marcar_como_perdido_test.dart`
      // reprovaram com o gatilho procurando uma gaveta que nao existe.
      //
      // O certo nao e tolerar e abrir nada: e nao desenhar o controle. Um
      // hamburguer que nao abre gaveta nenhuma e acao sem destino.
      await abrirOApp(tester, rede: _semServidor);
      // `casoAberto` sem `extra` cai em `AbaPerfil`, fora da casca.
      await irPara(tester, Rotas.casoAberto);

      expect(
        tester.takeException(),
        isNull,
        reason:
            'REPROVA: a tela de escape estourou. O gatilho da gaveta '
            'procurou uma casca que nao existe acima dela.',
      );
      expect(
        find.byType(NavigationBar),
        findsNothing,
        reason:
            'REPROVA: a tela de escape trouxe a barra de baixo. Se ela '
            'trouxe, este caso deixou de exercitar o cenario sem casca.',
      );
      expect(
        find.byType(BotaoDaGaveta),
        findsNothing,
        reason:
            'REPROVA: a raiz de secao montada fora da casca desenhou o '
            'gatilho da gaveta. Nao ha gaveta ali, e um controle que nao '
            'abre nada e acao sem destino (criterio 2 da BICHUS-62).',
      );
    });

    testWidgets('o alvo do gatilho e 64 x 64 dp, o piso critico do 11.23.1', (
      tester,
    ) async {
      await abrirOApp(tester, rede: _semServidor);
      final tamanho = tester.getSize(
        find.descendant(
          of: find.byType(BotaoDaGaveta),
          matching: find.byType(IconButton),
        ),
      );
      expect(
        tamanho.width,
        greaterThanOrEqualTo(BichuAlvoDeToque.critico),
        reason:
            'REPROVA: o gatilho mede ${tamanho.width} dp de largura. O '
            '11.23.1 fixa 64 x 64 para a barra de topo, e o `IconButton` '
            'nasce com 40.',
      );
      expect(
        tamanho.height,
        greaterThanOrEqualTo(BichuAlvoDeToque.critico),
        reason: 'REPROVA: o gatilho mede ${tamanho.height} dp de altura.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('3. os cinco titulos cabem com o hamburguer instalado', () {
    for (final destino in CascaComAbas.destinos) {
      testWidgets(
        'o titulo "${destino.rotulo}" cabe em 320 dp a 200% de escala',
        (tester) async {
          tester.view.physicalSize = const Size(960, 2000);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);

          await abrirOApp(tester, rede: _semServidor, escala: 2);
          await tester.tap(
            find.widgetWithText(NavigationDestination, destino.rotulo),
          );
          await tester.pumpAndSettle();

          final barra = tester.getRect(find.byType(AppBar));
          final titulo = find.descendant(
            of: find.byType(AppBar),
            matching: find.text(destino.rotulo),
          );
          expect(
            titulo,
            findsOneWidget,
            reason:
                'REPROVA: a barra de topo de "${destino.rotulo}" nao pinta '
                'o titulo. Sem ele nao ha o que medir.',
          );
          final paragrafo = tester.renderObject<RenderParagraph>(titulo);

          // O orcamento sai do LEIAUTE, e nao de uma conta: o titulo comeca
          // onde o `AppBar` o poe, ja descontados o gatilho de 64 dp e o
          // `titleSpacing` de 16. Deu 240,00 dp nas cinco secoes, que e
          // exatamente o numero que a UX 27.4.1 mediu -- o hamburguer entrou no
          // slot da SAIDA, que ja estava reservado naquela medida, e por isso o
          // orcamento do titulo NAO encolheu ao instalar a gaveta.
          //
          // De 240 desconta-se o slot de acao **so nas secoes que vao ter um**.
          final reservaDeAcao =
              secoesComGatilhoDeFiltro.contains(destino.rotulo)
              ? BichuAlvoDeToque.critico
              : 0.0;
          final disponivel =
              barra.right - tester.getRect(titulo).left - reservaDeAcao;

          expect(
            paragrafo.didExceedMaxLines,
            isFalse,
            reason:
                'REPROVA: o titulo "${destino.rotulo}" foi CORTADO com '
                'reticencia na barra de topo. O cliente encarregou o titulo de '
                'carregar o significado que o rotulo de quatro letras nao '
                'carrega (UX 27.4.2), e significado que some com reticencia nao '
                'foi transferido para lugar nenhum.',
          );
          expect(
            paragrafo.size.width,
            lessThanOrEqualTo(disponivel),
            reason:
                'REPROVA: "${destino.rotulo}" pede '
                '${paragrafo.size.width.toStringAsFixed(2)} dp e sobram '
                '${disponivel.toStringAsFixed(2)} dp em 320 dp a 200%, com o '
                'hamburguer no slot da esquerda e '
                '${reservaDeAcao == 0 ? 'nenhuma' : 'uma'} acao reservada a '
                'direita. Titulo que nao cabe se resolve trocando a palavra em '
                'projeto, nunca com reticencia: o cliente encarregou o titulo '
                'de carregar o significado que o rotulo curto deixou de '
                'carregar (UX 27.4.2).',
          );
        },
      );
    }

    test('GUARDA: as secoes com gatilho de filtro existem no registro', () {
      final rotulos = CascaComAbas.destinos.map((d) => d.rotulo).toSet();
      expect(
        secoesComGatilhoDeFiltro,
        isNotEmpty,
        reason:
            'REPROVA: a lista de secoes com acao de topo esta vazia. O '
            'orcamento de titulo passaria a ser 240 dp para todas, que e '
            'generoso demais e nao reprovaria nada.',
      );
      expect(
        rotulos.containsAll(secoesComGatilhoDeFiltro),
        isTrue,
        reason:
            'REPROVA: a lista de secoes com acao de topo cita rotulo que '
            'nao esta no registro: '
            '${secoesComGatilhoDeFiltro.difference(rotulos).join(', ')}. '
            'Linha orfa mantem o orcamento errado sobre uma secao que mudou '
            'de nome.',
      );
    });

    testWidgets('CONTRAPROVA: um titulo longo NESTA barra e cortado', (
      tester,
    ) async {
      // A prova negativa do grupo. Sem ela, `didExceedMaxLines` poderia estar
      // sempre falso -- por o titulo nao ser `Text`, por o `AppBar` mudar de
      // componente -- e os cinco casos acima aprovariam qualquer coisa.
      tester.view.physicalSize = const Size(960, 2000);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: MaterialApp(
            theme: BichuTheme.claro,
            // O gatilho so sabe abrir a gaveta DA CASCA, e a bancada nao tem
            // casca: o `ControleDaGaveta` entra aqui com um `abrir` que nao
            // faz nada. O que se mede neste caso e a LARGURA da barra com o
            // gatilho instalado, e nao o que o toque faz.
            home: ControleDaGaveta(
              abrir: () {},
              child: Scaffold(
                appBar: AppBar(
                  toolbarHeight: BichuAlvoDeToque.critico,
                  leading: const BotaoDaGaveta(),
                  leadingWidth: BichuAlvoDeToque.critico,
                  // A frase que a UX 27.4.1 mediu e descartou: ela pede 406,72
                  // dp ja em escala 1x, contra 240,0 disponiveis.
                  title: const Text('Profissionais e estabelecimentos'),
                ),
                body: const SizedBox.expand(),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final paragrafo = tester.renderObject<RenderParagraph>(
        find.text('Profissionais e estabelecimentos'),
      );
      expect(
        paragrafo.didExceedMaxLines,
        isTrue,
        reason:
            'REPROVA: a barra de topo NAO cortou '
            '`Profissionais e estabelecimentos` em 320 dp a 200%. A UX 27.4.1 '
            'mediu 406,72 dp pedidos contra 240,0 disponiveis ja em escala '
            '1x. Se isto passa, a medida dos cinco titulos acima nao esta '
            'medindo corte nenhum.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('4. dois menus, uma divisao declarada', () {
    testWidgets('nenhum item da gaveta navega para SECAO', (tester) async {
      // O risco que o product manager apontou: no Material 3 a gaveta e
      // ALTERNATIVA a barra inferior, e nao complemento. Este app tem as
      // duas, e a divisao precisa ser estrutural e nao so escrita -- a barra
      // troca de secao, a gaveta entra nos caminhos de dentro dela.
      final rotasDeSecao = CascaComAbas.destinos.map((d) => d.rota).toSet();
      final invasores = <String>[];
      for (final vivo in itensVivos()) {
        if (rotasDeSecao.contains(vivo.item.rota)) {
          invasores.add('${vivo.item.rotulo} -> ${vivo.item.rota}');
        }
      }
      expect(
        rotasDeSecao,
        hasLength(5),
        reason:
            'REPROVA: o registro de secoes nao tem cinco rotas. Sem elas '
            'este caso nao teria o que comparar e passaria por vazio.',
      );
      expect(
        invasores,
        isEmpty,
        reason:
            'REPROVA: a gaveta tem item que abre uma SECAO:\n  '
            '${invasores.join('\n  ')}\n'
            'Ai sao dois menus oferecendo a mesma viagem, que e exatamente o '
            'risco de ter gaveta e barra inferior juntas.',
      );
    });

    testWidgets('o nome da secao na gaveta e CABECALHO, e nao botao', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      await abrirAGaveta(tester);

      final ativaveis = rotulosAtivaveis(tester);
      for (final destino in CascaComAbas.destinos) {
        expect(
          ativaveis,
          isNot(contains(destino.rotulo)),
          reason:
              'REPROVA: o cabecalho "${destino.rotulo}" da gaveta virou '
              'controle. Ele nomeia o grupo; quem troca de secao e a barra de '
              'baixo. Um cabecalho tocavel e a gaveta comecando a competir '
              'com ela.',
        );
      }

      final cabecalhos = todosOsNos(tester)
          .where((n) => n.getSemanticsData().flagsCollection.isHeader)
          .map((n) => n.label)
          .toList();
      for (final destino in CascaComAbas.destinos) {
        expect(
          cabecalhos,
          contains(destino.rotulo),
          reason:
              'REPROVA: "${destino.rotulo}" nao e anunciado como '
              'cabecalho na gaveta. Sem o papel de cabecalho, quem usa leitor '
              'de tela nao consegue pular de grupo em grupo e le a gaveta '
              'inteira linha a linha.',
        );
      }
      handle.dispose();
    });

    testWidgets('a gaveta DIZ na tela qual menu leva aonde', (tester) async {
      // TAUTOLOGIA ASSUMIDA: este caso compara o texto pintado com a
      // constante que o produz, e por isso ele **nao** e a prova deste grupo.
      // A prova sao os dois casos acima, que medem estrutura. Este aqui
      // guarda outra coisa: que a frase nao seja apagada em silencio.
      await abrirOApp(tester, rede: _semServidor);
      await abrirAGaveta(tester);

      expect(
        find.text(TextosDaGaveta.comoOsDoisSeDividem),
        findsOneWidget,
        reason:
            'REPROVA: a gaveta nao explica a divisao de trabalho com a '
            'barra de baixo. Sem a frase, quem abre ve dois menus e precisa '
            'descobrir sozinho por que o mesmo nome esta nos dois.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('5. nenhum item morto', () {
    test('todo item vivo declara rota, e nenhum pendente declara', () {
      final vivos = itensVivos();
      expect(
        vivos,
        isNotEmpty,
        reason:
            'REPROVA: o registro de sub-destinos nao tem NENHUM item '
            'vivo. Ou todos regrediram, ou o registro parou de ser lido -- e '
            'nos dois casos os portoes deste grupo ficariam verdes por vazio.',
      );
      for (final vivo in vivos) {
        expect(
          vivo.item.rota,
          isNotNull,
          reason: 'REPROVA: "${vivo.item.rotulo}" vira item e nao tem rota.',
        );
      }

      final pendentesComRota = pendentes()
          .where((p) => p.rota != null)
          .map((p) => p.rotulo);
      expect(
        pendentesComRota,
        isEmpty,
        reason:
            'REPROVA: sub-destino nao construido declarando rota: '
            '${pendentesComRota.join(', ')}. Rota preenchida num item '
            '`planejada` e como ele volta a aparecer no dia em que alguem '
            'trocar a condicao de `viraItem`.',
      );
    });

    test('o inventario de 27.5 tem 48 linhas, 15 destinos e 6 atalhos vivos',
        () {
      // Os quatro numeros estao escritos A MAO, e e de proposito: eles sao a
      // segunda fonte da verdade contra o registro, como `ordemDecidida` e
      // contra `CascaComAbas.destinos` na BICHUS-164.
      //
      // Eles existem porque as contas divergiram em 22/09. Circularam "49" e
      // "48" sub-destinos e "8 de 49" atalhos vivos. **48 e o numero certo**,
      // e o 49 e um artefato de contagem: `grep -c 'SubDestino('` no arquivo
      // do registro conta tambem a declaracao `const SubDestino({` do
      // construtor, que nao e linha de inventario nenhuma. Medir por texto
      // conta o que esta escrito; medir pelo registro conta o que existe.
      //
      // Quando um destes numeros mudar, ele deve mudar aqui tambem, e a
      // mudanca e o ponto: ninguem acrescenta sub-destino a um mapa de 48
      // linhas sem que alguem veja.
      final todos = RegistroDeSubDestinos.porSecao.values
          .expand((lista) => lista)
          .toList(growable: false);

      expect(
        RegistroDeSubDestinos.porSecao.keys.length,
        5,
        reason: 'REPROVA: o registro deixou de ter uma entrada por secao. '
            'Sao cinco secoes, e uma secao sem entrada some da gaveta sem '
            'que nenhum outro caso acuse.',
      );
      expect(
        todos.length,
        48,
        reason: 'REPROVA: o inventario de 27.5 saiu de 48 linhas e foi para '
            '${todos.length}. Se a UX acrescentou sub-destino, este numero '
            'sobe junto e de proposito; se alguem apagou linha, este caso e '
            'o unico lugar que acusa.',
      );

      final destinos = todos
          .where((d) => d.forma == FormaDoSubDestino.destino)
          .toList(growable: false);
      expect(
        destinos.length,
        15,
        reason: 'REPROVA: os destinos de MENU sairam de 15 e foram para '
            '${destinos.length}. A maioria das 48 linhas nunca foi item de '
            'menu -- filtro e folha, busca e campo, aviso e faixa -- e e a '
            'FORMA que decide. Mudanca aqui significa que alguem reclassificou '
            'uma linha, e reclassificar filtro como destino e exatamente como '
            'a gaveta ganharia um item que nao tem endereco.',
      );

      final vivos = todos.where((d) => d.viraItem).toList(growable: false);
      expect(
        vivos.length,
        6,
        reason: 'REPROVA: os atalhos VIVOS sairam de 6 e foram para '
            '${vivos.length}: ${vivos.map((d) => d.rotulo).join(', ')}. '
            'Subir e o caminho normal, e so quando a tela do outro lado '
            'existir; descer significa que um atalho da gaveta morreu.',
      );

      final porConstruir = todos.where((d) => d.pendente).toList(growable: false);
      expect(
        porConstruir.length,
        9,
        reason: 'REPROVA: os destinos de menu POR CONSTRUIR sairam de 9 e '
            'foram para ${porConstruir.length}. Estes sao os que a gaveta '
            'NOMEIA em texto e nunca renderiza como controle; o numero cair '
            'sem que `vivos` suba e um nome que desapareceu da tela.',
      );

      expect(
        vivos.length + porConstruir.length,
        destinos.length,
        reason: 'REPROVA: ha destino de menu que nao e nem vivo nem pendente. '
            'A unica maneira de isso acontecer e um `destino` marcado '
            '`existe` com rota nula, que e um atalho que a gaveta esconde sem '
            'nomear: ele nao vira item e tambem nao entra na linha de '
            '`Em construção`.',
      );
    });

    testWidgets('toda rota de item vivo esta REGISTRADA no roteador', (
      tester,
    ) async {
      // Lida do roteador montado, e nao de uma lista a mao: uma lista a mao
      // continuaria dizendo que a rota existe no dia em que alguem a
      // apagasse.
      await abrirOApp(tester, rede: _semServidor);
      final registradas = rotasRegistradasDoApp(tester);
      expect(
        registradas,
        isNotEmpty,
        reason: 'REPROVA: o leitor de rotas devolveu vazio.',
      );

      final orfas = <String>[];
      for (final vivo in itensVivos()) {
        if (!registradas.contains(vivo.item.rota)) {
          orfas.add('${vivo.item.rotulo} -> ${vivo.item.rota}');
        }
      }
      expect(
        orfas,
        isEmpty,
        reason:
            'REPROVA: item da gaveta apontando para rota NAO REGISTRADA:'
            '\n  ${orfas.join('\n  ')}\n'
            'Tocar nele estoura ou abre o nada. E o criterio 2 da BICHUS-62, '
            'e este app ja teve dois botoes apontando para o vazio.',
      );
    });

    test('CONTRAPROVA: o conferidor de rota reprova um endereco inventado', () {
      // Sem esta prova negativa, o caso acima ficaria verde no dia em que o
      // leitor de rotas passasse a devolver tudo.
      const registradas = <String>{Rotas.pets, Rotas.escanear};
      const inventado = SubDestino(
        rotulo: 'Carrinho',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: '/loja/carrinho',
      );
      expect(inventado.viraItem, isTrue);
      expect(
        registradas.contains(inventado.rota),
        isFalse,
        reason:
            'REPROVA: um endereco que ninguem registrou passou pelo '
            'conferidor. A comparacao do caso acima nao reprova nada.',
      );
    });

    // Um caso POR ITEM, e nao um laco dentro de um caso so.
    //
    // `pumpWidget` com o mesmo tipo de widget reaproveita o `State`, e com ele
    // o roteador: a segunda volta de um laco comecaria na tela em que a
    // primeira terminou, sem gaveta nenhuma na barra de topo. Um caso por item
    // tambem faz a suite dizer QUAL atalho quebrou.
    for (final vivo in itensVivos()) {
      testWidgets(
        'o atalho "${vivo.item.rotulo}" de "${vivo.secao}" NAVEGA de verdade, '
        'e fecha a gaveta',
        (tester) async {
          await abrirOApp(
            tester,
            rede: _semServidor,
            deposito: depositoLogado(),
          );
          await abrirAGaveta(tester);

          final alvo = find.byKey(
            ItemDaGaveta.chaveDe(vivo.secao, vivo.item.rotulo),
          );
          await tester.scrollUntilVisible(
            alvo,
            BichuEspaco.e16,
            scrollable: rolavelDaGaveta,
          );
          // `scrollUntilVisible` para quando o item tem ELEMENTO, e o
          // `ListView` constroi um pouco alem da dobra: os dois atalhos de
          // `Perfil` ja existiam na arvore e continuavam fora da tela, e o
          // `tap` caia na cortina modal em vez de no item -- o teste dizia
          // que o atalho nao navegava, com o atalho intacto. `ensureVisible`
          // termina o trabalho.
          await tester.ensureVisible(alvo);
          await tester.pumpAndSettle();
          await tester.tap(alvo);
          await tester.pumpAndSettle();

          // **`matches.last.matchedLocation`, e nao `uri.path`.** Os atalhos
          // chegam por `push`, e num `push` o `uri` do roteador continua sendo
          // a localizacao BASE -- `/pets` -- enquanto a rota empilhada e a
          // ultima da lista de casamentos. Medido: com `uri.path` este caso
          // reprovava `Adoções` dizendo que ela parou em `/pets`, com a tela
          // de `Adoções` montada na frente. Portao que le o campo errado acusa
          // defeito onde nao ha e some com o que ha.
          final pilha = GoRouter.of(tester.element(find.byType(Scaffold).first))
              .routerDelegate
              .currentConfiguration
              .matches;
          final onde = pilha.last.matchedLocation;
          expect(
            onde,
            vivo.item.rota,
            reason:
                'REPROVA: o atalho "${vivo.item.rotulo}" da secao '
                '"${vivo.secao}" parou em "$onde" em vez de '
                '"${vivo.item.rota}". E o criterio 2 da BICHUS-62: item que '
                'nao leva ao que promete e acao sem destino.',
          );
          expect(
            find.byType(Drawer),
            findsNothing,
            reason:
                'REPROVA: a gaveta continuou aberta por cima do destino de '
                '"${vivo.item.rotulo}". Quem tocou fica achando que o toque '
                'nao pegou.',
          );
        },
      );
    }

    testWidgets('nenhum sub-destino NAO CONSTRUIDO e tocavel', (tester) async {
      // A escolha desta historia entre as duas saidas que o criterio 2
      // permite: o que nao existe **nao vira controle**. Nem desabilitado --
      // item desabilitado e a forma exata em que `btn=true tap=false` ja
      // apareceu quatro vezes neste repositorio.
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      await abrirAGaveta(tester);

      final pendentesDoMapa = pendentes();
      expect(
        pendentesDoMapa,
        isNotEmpty,
        reason:
            'REPROVA: o registro nao tem NENHUM sub-destino pendente. Ou '
            'os quarenta e oito foram construidos, ou o campo `estado` parou '
            'de ser preenchido -- e este caso ficaria verde por nao ter o que '
            'procurar.',
      );

      final ativaveis = rotulosAtivaveis(tester);
      final vivos = <String>[];
      for (final pendente in pendentesDoMapa) {
        if (ativaveis.any((l) => l.contains(pendente.rotulo))) {
          vivos.add(pendente.rotulo);
        }
      }
      expect(
        vivos,
        isEmpty,
        reason:
            'REPROVA: sub-destino nao construido virou controle tocavel '
            'na gaveta: ${vivos.join(', ')}.\n'
            'Um item que parece clicavel e nao faz nada e pior que ausencia: '
            'ele ensina que a gaveta nao merece toque. Com quarenta e um '
            'sub-destinos por construir, essa licao seria a tela inteira.',
      );
      handle.dispose();
    });

    testWidgets('CONTRAPROVA: a varredura ENXERGA um item tocavel', (
      tester,
    ) async {
      // Sem ela, `rotulosAtivaveis` poderia devolver lista vazia sempre e o
      // caso acima aprovaria uma gaveta cheia de itens mortos.
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      await abrirAGaveta(tester);

      final ativaveis = rotulosAtivaveis(tester);
      expect(
        ativaveis.any((l) => l.contains('Adoções')),
        isTrue,
        reason:
            'REPROVA: a varredura nao achou `Adoções`, que e um item VIVO '
            'da gaveta. Ela nao esta enxergando controle nenhum, e o caso dos '
            'pendentes passou a nao medir nada.',
      );
      handle.dispose();
    });

    testWidgets('a gaveta NOMEIA o que ainda nao existe, sem prometer toque', (
      tester,
    ) async {
      // O cliente pediu para ver o escopo (UX 27.0). Ele ve, em texto: o que
      // nao existe e NOMEADO e nao e controle. As duas metades sao uma coisa
      // so -- esconder sem nomear perderia o pedido dele; nomear como botao
      // quebraria o criterio 2.
      await abrirOApp(tester, rede: _semServidor);
      await abrirAGaveta(tester);

      final textos = await textosDaGavetaInteira(tester);
      expect(
        textos.any((t) => t.contains(TextosDaGaveta.emConstrucao)),
        isTrue,
        reason:
            'REPROVA: a gaveta nao diz o que vem depois. O cliente pediu '
            'para ver o escopo, e uma gaveta com seis itens e nenhuma palavra '
            'sobre o resto responde metade do pedido.',
      );

      final semNome = <String>[];
      for (final pendente in pendentes()) {
        if (!textos.any((t) => t.contains(pendente.rotulo))) {
          semNome.add(pendente.rotulo);
        }
      }
      expect(
        semNome,
        isEmpty,
        reason:
            'REPROVA: estes sub-destinos sumiram da gaveta em vez de '
            'virar texto: ${semNome.join(', ')}.\n'
            'Esconder sem nomear responde metade do pedido do cliente de '
            '27.0, que e ver o escopo.',
      );
    });

    test('nenhum ListTile da gaveta pode nascer com `onTap` nulo', () {
      // Varredura de FONTE, e de proposito: o `onTap: null` escrito num ramo
      // que nenhum caso monta passa calado pela arvore. E o defeito exato do
      // `TextButton` de termos que ficou no `Perfil` ate 22/09.
      const caminho = 'lib/telas/gaveta_de_secoes.dart';
      final arquivo = File(caminho);
      expect(
        arquivo.existsSync(),
        isTrue,
        reason:
            'REPROVA: nao achei "$caminho". Portao sem o que conferir '
            'reprova com o motivo, nunca aprova por ausencia.',
      );
      final semComentarios = arquivo
          .readAsStringSync()
          .split('\n')
          .map((l) => l.replaceAll(RegExp('//.*'), ''))
          .join('\n');
      expect(
        semComentarios,
        isNot(contains('onTap: null')),
        reason:
            'REPROVA: ha `onTap: null` em "$caminho". Controle que se '
            'anuncia tocavel e nao leva a lugar nenhum e o que o criterio 2 '
            'da BICHUS-62 proibe.',
      );
      expect(
        semComentarios,
        isNot(contains('enabled: false')),
        reason:
            'REPROVA: ha `enabled: false` em "$caminho". A decisao desta '
            'gaveta e que o nao construido NAO vira controle -- nem '
            'desabilitado. Item desabilitado e a forma em que '
            '`btn=true tap=false` ja apareceu quatro vezes aqui.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('6. a gaveta e modal: o foco nao vaza para o fundo', () {
    testWidgets('com a gaveta aberta, a barra de baixo sai da arvore de '
        'semantica', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      await abrirAGaveta(tester);

      final ativaveis = rotulosAtivaveis(tester);
      final vazaram = <String>[];
      for (final destino in CascaComAbas.destinos) {
        if (ativaveis.any((l) => l.contains(destino.semanticsLabel))) {
          vazaram.add(destino.rotulo);
        }
      }
      expect(
        vazaram,
        isEmpty,
        reason:
            'REPROVA: com a gaveta ABERTA, o leitor de tela ainda alcanca '
            'a barra de baixo: ${vazaram.join(', ')}.\n'
            'E a armadilha classica de gaveta: VoiceOver e TalkBack lendo o '
            'fundo, sem foco preso ao que esta na frente. Quem nao ve nao tem '
            'como saber que ha uma gaveta aberta.',
      );
      handle.dispose();
    });

    testWidgets('CONTRAPROVA: com a gaveta FECHADA, a barra de baixo ESTA na '
        'arvore', (tester) async {
      // Sem ela, o caso acima passaria com uma arvore vazia -- e vazia e
      // indistinguivel de "esta tudo certo".
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);

      final ativaveis = rotulosAtivaveis(tester);
      final achados = CascaComAbas.destinos
          .where((d) => ativaveis.any((l) => l.contains(d.semanticsLabel)))
          .length;
      expect(
        achados,
        CascaComAbas.destinos.length,
        reason:
            'REPROVA: com a gaveta FECHADA a varredura achou $achados de '
            '${CascaComAbas.destinos.length} destinos da barra. Ela nao esta '
            'enxergando o fundo, e o caso de cima passou a provar nada.',
      );
      handle.dispose();
    });

    testWidgets('a gaveta aberta tem a cortina que a fecha por toque', (
      tester,
    ) async {
      await abrirOApp(tester, rede: _semServidor);
      await abrirAGaveta(tester);
      expect(
        find.byType(ModalBarrier),
        findsWidgets,
        reason:
            'REPROVA: a gaveta abriu sem cortina modal. Sem ela o toque '
            'atravessa para a tela de tras, e a gaveta deixa de ser modal '
            'tambem para quem enxerga.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('portao de tokens sobre o arquivo desta historia', () {
    test('nenhum hex literal, nenhum espacamento fora de BichuEspaco', () {
      const List<String> meusArquivos = <String>[
        'lib/telas/gaveta_de_secoes.dart',
      ];
      final achados = <String>[];
      var lidos = 0;
      for (final caminho in meusArquivos) {
        final arquivo = File(caminho);
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: "$caminho" nao existe.',
        );
        lidos += 1;
        for (final a in conferir(caminho, arquivo.readAsStringSync())) {
          achados.add('  ${a.onde}:${a.linha} — ${a.motivo}: ${a.trecho}');
        }
      }
      expect(lidos, meusArquivos.length);
      expect(
        achados,
        isEmpty,
        reason:
            'REPROVA: cor, espacamento ou raio escrito a mao na gaveta.\n'
            '${achados.join('\n')}',
      );
    });

    test('AUTOTESTE: o verificador importado continua reprovando', () {
      final achados = conferir('fixture', '''
        final cor = const Color(0xFF9E0B3A);
        const EdgeInsets.all(15);
      ''');
      final motivos = achados.map((a) => a.motivo).toSet();
      expect(motivos, contains('hex literal em Dart'));
      expect(motivos, contains('espacamento fora de BichuEspaco'));
    });
  });
}
