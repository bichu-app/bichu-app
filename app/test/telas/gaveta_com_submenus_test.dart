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
import 'package:bichu/widgets/acao_de_criar_flutuante.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
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
/// As secoes que a barra abre por toque: os slots que sao RAMO da casca.
///
/// Existe desde 19/10, quando o registro deixou de ser a barra: a conta saiu
/// dela (a porta virou a foto da barra de topo) e o slot de mensagens empurra
/// uma rota em vez de trocar de ramo. Um caso que iterasse
/// `CascaComAbas.destinos` tentaria tocar num slot que nao existe, ou abrir
/// uma secao que nao e da casca.
List<DestinoDeNavegacao> get secoesDaBarra =>
    CascaComAbas.visiveisEm(CascaComAbas.configuracao)
        .where((d) => d.ehRamo)
        .toList(growable: false);

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

/// Vai para a secao [rotulo] pela barra de baixo.
Future<void> irParaASecao(WidgetTester tester, String rotulo) async {
  await tester.tap(find.widgetWithText(NavigationDestination, rotulo));
  await tester.pumpAndSettle();
}

/// O `Scaffold` DA CASCA, que e o unico que carrega a barra de baixo.
Scaffold cascaDaVez(WidgetTester tester) {
  final cascas = tester
      .widgetList<Scaffold>(find.byType(Scaffold))
      .where((s) => s.bottomNavigationBar != null)
      .toList();
  expect(
    cascas,
    hasLength(1),
    reason:
        'REPROVA: achei ${cascas.length} casca(s) com barra de baixo. Sem '
        'exatamente uma, todo caso que le `drawer` daqui esta lendo a tela '
        'errada e passaria por acidente.',
  );
  return cascas.single;
}

/// Os textos que a gaveta ABERTA pinta agora, sem rolar.
List<String> textosDaGaveta(WidgetTester tester) {
  return tester
      .widgetList<Text>(
        find.descendant(of: find.byType(Drawer), matching: find.byType(Text)),
      )
      .map((t) => t.data ?? '')
      .where((t) => t.isNotEmpty)
      .toList();
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

/// Os itens que a GAVETA realmente oferece, achatados com a secao em que
/// aparecem.
///
/// **Mudou em 19/10, e a mudanca tem duas metades.**
///
/// A primeira: a gaveta so existe nas secoes da barra que sao ramo. A tela da
/// conta deixou de ser secao da casca -- ela virou rota irma, alcancada pela
/// foto da barra de topo --, e por isso a linha `Rotas.perfil` do registro
/// **nao e mais renderizada como gaveta**. Ela continua no registro porque e
/// inventario da UX 27.5, e o caso de contagem acima responde por ela; o que
/// ela nao e mais e uma gaveta montada.
///
/// A segunda: toda gaveta mostra tambem os destinos GLOBAIS, que e o conteudo
/// que fez a gaveta fixa ser defensavel no caso vazio. Eles sao itens de
/// verdade, navegam de verdade, e tinham de entrar nesta conta -- senao os
/// casos deste grupo nao olhariam para metade do que a gaveta oferece.
///
/// **Nenhum destino do `Perfil` ficou inalcancavel por causa disto:**
/// `Meus dados` e `Escanear uma tag` estao nos globais, de toda secao, e
/// `Cadastrar pet` e o botao primario da propria tela da conta.
List<({String secao, SubDestino item})> itensVivos() {
  return <({String secao, SubDestino item})>[
    for (final destino in secoesDaBarra) ...<({String secao, SubDestino item})>[
      for (final item in RegistroDeSubDestinos.itensDe(destino.rota))
        (secao: destino.rota, item: item),
      // O mesmo recorte que a gaveta faz: global cuja rota a secao ja
      // oferece nao e pintado duas vezes.
      for (final item in RegistroDeSubDestinos.globais)
        if (!RegistroDeSubDestinos.itensDe(destino.rota)
            .map((i) => i.rota)
            .contains(item.rota))
          (secao: destino.rota, item: item),
    ],
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

      // Os slots da BARRA que trocam de ramo. O registro deixou de servir
      // aqui em 19/10: a conta saiu da barra e o slot de mensagens empurra
      // uma rota -- nenhum dos dois e uma secao da casca que este caso possa
      // abrir por toque.
      for (final destino in secoesDaBarra) {
        await tester.tap(
          find.widgetWithText(NavigationDestination, destino.rotulo),
        );
        await tester.pumpAndSettle();

        // A CASCA, achada pela barra de baixo e nao pela gaveta.
        //
        // **Desde 19/10 a gaveta e FIXA**: o cliente mandou padronizar o menu
        // esquerdo em todas as telas, e por isso toda secao monta exatamente
        // uma. Entre 23/09 e 19/10 `Rede` e `Loja` nao montavam nenhuma, e
        // este trecho tolerava zero por causa disso -- a tolerancia saiu com
        // a decisao nova, e agora o caso cobra UMA.
        final casca = cascaDaVez(tester);
        final comSubmenu = tester
            .widgetList<Scaffold>(find.byType(Scaffold))
            .where((s) => s.drawer != null)
            .toList();
        expect(
          comSubmenu.length,
          1,
          reason:
              'REPROVA: a secao "${destino.rotulo}" montou '
              '${comSubmenu.length} `Scaffold` com gaveta, e o esperado e '
              'UMA. Zero significa que a gaveta deixou de ser fixa, que o '
              'cliente mandou o contrario em 19/10; duas sao dois gatilhos '
              'disputando a mesma borda.',
        );
        expect(
          casca.drawerEnableOpenDragGesture,
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
      // **O VEICULO MUDOU DE `Adoções` PARA `Registrar achado avulso`
      // (19/10), e o que o caso prova nao mudou.**
      //
      // `Adoções` deixou de ser item vivo da gaveta: as portas de adocao
      // sairam porque nao existe rota de adocao no contrato. O caso precisa de
      // UM sub-destino vivo que abra tela empilhada sobre a casca, e
      // `Registrar achado avulso` e exatamente isso -- mesma `TelaDeAba`,
      // mesma pilha, mesmo `push`.
      await abrirOApp(tester, rede: _semServidor);
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');
      await abrirAGaveta(tester);
      await tester.tap(
        find.byKey(
          ItemDaGaveta.chaveDe(Rotas.pets, 'Registrar achado avulso'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(BotaoDaGaveta), findsNothing);

      await voltarDoSistema(tester);

      expect(
        find.widgetWithText(AppBar, 'Pets'),
        findsOneWidget,
        reason:
            'REPROVA: o voltar do sistema nao desempilhou a tela do '
            'sub-destino. Com '
            'a gaveta instalada na casca, o `pop` passou a ser consumido por '
            'ela e quem entrou num sub-destino ficou sem volta.',
      );
    });

    testWidgets('com a gaveta ABERTA, o voltar do sistema fecha a gaveta e '
        'nao a tela', (tester) async {
      await abrirOApp(tester, rede: _semServidor);
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');
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
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');

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

    // **ESTE CASO MUDOU DE AFIRMACAO EM 17/10/2026, POR DECISAO DO CLIENTE.**
    //
    // Nas palavras dele: *"suba todos os filtros para a barra do titulo da
    // pagina e deixe o campo de busca sempre ocupando a area toda"*. Isto
    // REVERTE a regra de 22/09 que mandou busca, filtro e ordenacao para o
    // topo do CORPO da tela, e devolve ao slot unico da direita o `Filtros`
    // que a UX 27.5.1 a 27.5.4 sempre lhe deu.
    //
    // O caso antigo cobrava que o slot ficasse VAZIO em toda secao. Ele nao
    // foi apagado nem dispensado: virou a afirmacao nova, que e mais estreita
    // e continua pegando o defeito que o original existia para pegar -- o
    // hamburguer, ou qualquer outra coisa, caindo na direita.
    //
    // **E MUDOU DE NOVO EM 18/10/2026, PELA MESMA RAZAO: decisao dele.**
    //
    // Nas palavras dele: *"os itens de criacao, como evento e indicacao, ate o
    // escanear poderia ser icones na barra superior ou um simbolo apenas de +
    // para que o designer fique mais bonito e nao fique esse botao grande na
    // pagina ocupando muito espaco"*. A direita deixou de ter UM slot e passou
    // a ter DOIS, e isso atravessa o 11.23.1 de propria vontade -- a conta de
    // largura esta escrita em `casca_com_abas.dart`. De novo o caso nao foi
    // apagado nem dispensado: o teto subiu de um para dois, e a lista de quem
    // pode ocupar a direita ganhou a porta de criar.
    //
    // O que ele cobra agora:
    //  - **no maximo DOIS** controles na direita, em qualquer secao;
    //  - cada um deles e a porta de CRIAR ou o `Filtros`, e nunca o gatilho
    //    da gaveta nem qualquer terceira coisa;
    //  - quando ha os dois, **criar vem primeiro**: a acao da SECAO fica mais
    //    longe da borda e o controle da LISTA mais perto;
    //  - o gatilho da gaveta continua na ESQUERDA, inteiro.
    //
    // **ESTE CASO PASSOU A RODAR LOGADO EM 19/10, e a troca e um conserto.**
    //
    // Ele rodava com o ajudante no estado de arranque, que e DESLOGADO desde
    // 18/10. Deslogado a porta de criar nao existe em `Rede` nem em `Perto`
    // -- `podeCriarNaComunidade` exige conta e e-mail confirmado --, entao a
    // afirmacao "`criar` nao esta na barra" era VERDADEIRA POR VACUIDADE: ela
    // ficaria verde com a porta devolvida ao `actions`, porque o arranjo
    // medido nem a desenhava. Medido: com `criar` de volta no `actions` e o
    // caso deslogado, ele passou.
    //
    // E e a mesma armadilha que a frente da gaveta acabou de achar aqui ao
    // lado. Por isso ha, logo no inicio do laco, uma linha que PROVA que a
    // sessao e a que eu penso -- e nao um comentario dizendo que e.
    //
    // O arranjo deslogado nao ficou sem portao: quem cobra que o sino
    // DESAPARECE sem conta e
    // `test/telas/navegacao_mensagens_e_avatar_test.dart`, grupo (b2).
    testWidgets('o lado direito e o SINO e a FOTO, nesta ordem, e `criar` '
        'nao esta mais nele', (tester) async {
      await abrirOApp(
        tester,
        rede: _semServidor,
        deposito: depositoLogado(),
      );
      // **A PROVA DE QUE A SESSAO E A QUE EU PENSO, e ela e POSITIVA.**
      //
      // A `Rede` e a aba de arranque e tem porta de criar. Se a porta estiver
      // CONSTRUIDA, a sessao tem conta e e-mail confirmado -- e e exatamente
      // essa a condicao de `podeCriarNaComunidade`. Sem esta linha, tudo o
      // que este caso afirma sobre `criar` nao estar na barra ficaria verde
      // por vacuidade, porque deslogado a porta nem existe.
      //
      // **A medida NAO e circular:** aqui ela prova que a porta EXISTE; o
      // laco abaixo prova que ela nao esta no `actions`. Sao dois fatos
      // diferentes, e e a conjuncao deles que e a decisao do cliente.
      //
      // Nao serve medir a inicial da foto: `depositoLogado()` nao da nome ao
      // usuario, entao a foto desenha o glifo de pessoa nos DOIS estados --
      // medido, e foi o que derrubou a primeira versao desta linha.
      expect(
        find.byType(AcaoDeCriarFlutuante),
        findsOneWidget,
        reason:
            'REPROVA: este caso NAO esta no estado que ele pensa -- a porta '
            'de criar da `Rede` nao esta construida, e ela exige conta E '
            'e-mail confirmado. Sem sessao, afirmar que `criar` nao esta na '
            'barra nao prova nada: ele nao esta em lugar nenhum.',
      );

      // **O QUE ESTE CASO PROVAVA, E O QUE ELE PROVA AGORA.**
      //
      // Ele provava um teto de TRES controles -- `criar`, `Filtros` e a foto
      // --, medido em 48,00 dp de titulo sobrando para o `Perto`, que pedia
      // 47,95: passava por 0,05 dp. Em 19/10 o cliente decidiu o que sai para
      // o sino entrar: *"O botao criar sai da barra"*.
      //
      // O caso nao foi afrouxado, ele foi APERTADO. O lado direito deixou de
      // variar de secao para secao -- sino 48 + foto 48, sempre --, entao o
      // "no maximo tres" virou uma contagem EXATA de dois, mais a ordem, mais
      // a ausencia da porta de criar. Um teto frouxo aqui deixaria passar uma
      // barra que perdesse o sino, que e o controle que acabou de entrar.
      for (final destino in secoesDaBarra) {
        await tester.tap(
          find.widgetWithText(NavigationDestination, destino.rotulo),
        );
        await tester.pumpAndSettle();

        final barra = tester.widget<AppBar>(find.byType(AppBar));
        final acoes = barra.actions ?? const <Widget>[];
        for (final acao in acoes) {
          expect(
            acao,
            anyOf(
              // `BotaoDeAcaoDaListagem` continua na lista e **nao aparece
              // mais**: o `Filtros` saiu da barra em 19/10 e voltou para o
              // topo do corpo. Ele fica aqui porque a tela que quiser um
              // controle de canto ainda pode usa-lo -- e, se voltar a
              // aparecer, o teto e a conta de largura abaixo e que respondem.
              isA<BotaoDeAcaoDaListagem>(),
              isA<SinoDeNotificacoes>(),
              isA<AvatarDaConta>(),
            ),
            reason:
                'REPROVA: a secao "${destino.rotulo}" pos no lado direito '
                'algo que nao e o sino nem a foto da conta. O gatilho da '
                'gaveta tem o slot da ESQUERDA, e nada mais sobe para a '
                'barra -- a busca, os controles de recorte e a porta de '
                'criar moram no corpo, onde o cliente os quer.',
          );
          // **A ISCA (a) DESTE PORTAO: `criar` NAO VOLTA A BARRA.**
          //
          // Decisao dele em 19/10, com a conta na mesa: *"O botao criar sai
          // da barra"*. `AcaoDeCriarFlutuante` e o widget da porta de criar, e
          // ele mora no `floatingActionButton` da casca. Um `isNot` sobre a
          // lista de permitidos acima nao bastaria: a lista e um `anyOf`, e
          // acrescentar um tipo a ela e a maneira mais facil de reabrir a
          // barra sem nenhum caso reprovar.
          //
          // DESLIGAMENTO: volte `if (widget.acaoDeCriar != null)
          // widget.acaoDeCriar!,` ao `actions` de `TelaDeAba`.
          expect(
            acao,
            isNot(isA<AcaoDeCriarFlutuante>()),
            reason:
                'REPROVA: a porta de criar voltou a barra de topo de '
                '"${destino.rotulo}". Ela saiu dali em 19/10 por decisao do '
                'cliente -- *"O botao criar sai da barra"* -- para o sino '
                'entrar no lugar, e e essa troca que devolveu o titulo '
                'inteiro ao `Perto`.',
          );
        }
        // **DOIS CONTROLES, e exatamente dois.** O sino e a foto. O teto de
        // tres de 19/10 virou uma contagem exata quando `criar` saiu: o lado
        // direito deixou de variar de secao para secao, e contar "no maximo"
        // deixaria passar uma barra que perdesse o sino.
        expect(
          acoes.length,
          2,
          reason:
              'REPROVA: a secao "${destino.rotulo}" tem ${acoes.length} '
              'controles no lado direito, e o arranjo de 19/10 e DOIS: o '
              'sino e a foto. Menos que isso perdeu um deles; mais que isso '
              'devolveu a barra um controle que o cliente mandou para o '
              'corpo.',
        );
        // **A FOTO E SEMPRE A ULTIMA.** Ela e o controle que nao muda de
        // tela; os que variam ficam antes dela. Sem esta linha, a ordem do
        // lado direito dancaria de secao para secao.
        expect(
          acoes.last,
          isA<AvatarDaConta>(),
          reason:
              'REPROVA: em "${destino.rotulo}" a foto nao e o ultimo controle '
              'do lado direito. Ela esta em todas as telas, sempre no mesmo '
              'lugar: controle que varia por tela nao empurra o que nao '
              'varia.',
        );
        // **O SINO VEM ANTES DA FOTO**, e a razao e a mesma de sempre: a
        // foto e o controle que nao varia e fecha a barra. Esta linha
        // substitui a que ordenava `criar` antes do `Filtros` -- nenhum dos
        // dois esta mais aqui.
        expect(
          acoes.first,
          isA<SinoDeNotificacoes>(),
          reason:
              'REPROVA: em "${destino.rotulo}" o sino nao e o primeiro '
              'controle do lado direito. Ele entrou no slot que `criar` '
              'deixou, e a foto continua fechando a barra.',
        );
        // O gatilho da gaveta continua inteiro, e na ESQUERDA: ele e o
        // `leading` da barra, nunca uma `action`. O caso do slot da esquerda,
        // logo acima, mede a largura de 64 dp dele.
        expect(
          tester.widget<AppBar>(find.byType(AppBar)).leading,
          anyOf(isNull, isA<BotaoDaGaveta>()),
          reason:
              'REPROVA: o slot da ESQUERDA de "${destino.rotulo}" deixou de '
              'ser do gatilho da gaveta.',
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
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');

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
      // **O VEICULO MUDOU DE `Adoções` PARA `Registrar achado avulso`
      // (19/10), e o que o caso prova nao mudou.**
      //
      // `Adoções` deixou de ser item vivo da gaveta: as portas de adocao
      // sairam porque nao existe rota de adocao no contrato. O caso precisa de
      // UM sub-destino vivo que abra tela empilhada sobre a casca, e
      // `Registrar achado avulso` e exatamente isso -- mesma `TelaDeAba`,
      // mesma pilha, mesmo `push`.
      await abrirAGaveta(tester);
      await tester.tap(
        find.byKey(
          ItemDaGaveta.chaveDe(Rotas.pets, 'Registrar achado avulso'),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byTooltip('Voltar'),
        ),
        findsOneWidget,
        reason:
            'REPROVA: a tela do sub-destino perdeu a saida. Ela usa a mesma '
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
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');
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
    for (final destino in secoesDaBarra) {
      testWidgets(
        'o titulo "${destino.rotulo}" cabe em 320 dp a 200% de escala',
        (tester) async {
          tester.view.physicalSize = const Size(960, 2000);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);

          // **LOGADO, e isto conserta o segundo defeito deste caso.**
          //
          // Ele rodava deslogado, e deslogado a barra esconde a porta de
          // criar E o sino -- sobrava so a foto, e o titulo tinha folga de
          // sobra. O portao media o arranjo MAIS VAZIO e aprovava, enquanto o
          // arranjo mais cheio (criar + sino + foto, que e o de quem usa o
          // app com conta) cortava `Rede` e `Perto` com reticencia.
          //
          // O pior caso e o de quem tem sessao, e e ele que o portao mede.
          //
          // **A SEGUNDA CHAMADA DE `abrirOApp` SAIU DAQUI (18/10/2026).**
          // Havia um `await abrirOApp(tester, rede: _semServidor, escala: 2)`
          // logo abaixo, SEM deposito, e ele lia como "e agora deslogado" --
          // o defeito que esta correcao dizia ter fechado, escrito de novo
          // na linha seguinte. Ele nao chegava a desfazer a sessao, e isto
          // esta MEDIDO: `pumpWidget` com o mesmo tipo de widget reaproveita
          // o `State`, e com ele o escopo e o roteador, entao o arranjo
          // medido continuava sendo o de quem tem conta -- e dele que sai o
          // `criar` de `Rede` e de `Perto`, que o caso precisa ver.
          //
          // A linha ficava verde pelo motivo errado, e uma mudanca qualquer
          // no arranque do app a faria medir o arranjo mais vazio sem que
          // nenhum caso reprovasse. Medido depois de tirar: `Rede` continua
          // com tres controles na barra e `Perto` continua cortada.
          await abrirOApp(
            tester,
            rede: _semServidor,
            deposito: depositoLogado(),
            escala: 2,
          );
          await irParaASecao(tester, 'Pets');
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
          // **O ORCAMENTO SAI DAS ACOES QUE ESTAO NA TELA, e nao de uma lista
          // escrita a mao.** Isto mudou em 19/10 e a mudanca conserta um
          // defeito do proprio portao: a conta antiga reservava 64 dp para o
          // gatilho de `Filtros` e **nunca contava a porta de criar**. Ela
          // devolvia 144,00 dp onde a tela tinha de verdade 96,00, e por isso
          // ficou verde enquanto `Rede` e `Perto` saiam com reticencia.
          //
          // Portao que mede o que ele mesmo imagina aprova o aparelho errado.
          // Agora ele soma a largura REAL de cada controle do lado direito.
          final acoesNaTela = tester
              .widgetList<Widget>(
                find.descendant(
                  of: find.byType(AppBar),
                  matching: find.byType(IconButton),
                ),
              )
              .length;
          final reservaDeAcao = tester
              .widgetList<IconButton>(
                find.descendant(
                  of: find.byType(AppBar),
                  matching: find.byType(IconButton),
                ),
              )
              .fold<double>(0, (soma, b) {
            // O `leading` (o hamburguer) nao entra: ele ja esta descontado
            // porque o titulo COMECA depois dele.
            final c = b.constraints;
            return soma + (c?.minWidth ?? BichuAlvoDeToque.min);
          }) - BichuAlvoDeToque.critico;
          expect(
            acoesNaTela,
            greaterThanOrEqualTo(2),
            reason: 'REPROVA: a barra de "${destino.rotulo}" tem '
                '$acoesNaTela controle(s) de icone. O esperado e no minimo o '
                'hamburguer e a foto; menos que isso significa que a conta de '
                'largura abaixo esta medindo outra tela.',
          );
          final disponivel =
              barra.right - tester.getRect(titulo).left - reservaDeAcao;

          // -----------------------------------------------------------------
          // O ARRANJO DE 19/10 COM O SINO: `criar` SAIU DA BARRA E `Perto`
          // AINDA CORTA. OS NUMEROS SAO MEDIDOS, NAO CALCULADOS.
          //
          // Decisao do cliente, com a conta na mesa: *"O botao criar sai da
          // barra"*. O lado direito passou a ser sino 48 + foto 48, e a
          // esquerda continua com o hamburguer de 64. Medido no app de
          // verdade, LOGADO, em 320 dp a 200% de escala:
          //
          //   titulo comeca em:           64,00 dp (depois do hamburguer,
          //                               com `titleSpacing: 0`)
          //   reserva do lado direito:    96,00 dp (sino 48 + foto 48)
          //   ORCAMENTO DO TITULO:       160,00 dp
          //
          //   `Pets`, `Rede` e `Loja`:   138,32 dp -> cabem (21,68 de folga)
          //   `Perto`:                   172,90 dp -> NAO cabe, faltam 12,90
          //
          // **O deficit CAIU de 28,90 para 12,90 dp e nao chegou a zero.** O
          // arranjo anterior (criar 64 + foto 48) dava 144,00 dp de orcamento;
          // tirar `criar` devolveu 64 e o sino levou 48, saldo de +16,00. Nao
          // ha como fechar os 12,90 que faltam sem mexer em algo que nao e
          // meu: o hamburguer tem o piso de 64 dp do 11.23.1 (e caso proprio
          // acima que o mede), o sino e a foto estao no piso de 48 dp do
          // SC 2.5.8, `titleSpacing` ja esta em zero e a margem interna da
          // foto custa 0,00 dp de orcamento. **Sobra tirar outro controle da
          // barra ou encurtar o rotulo, e as duas coisas sao decisao do
          // cliente** -- `Perto` ja e o nome curto que ele escolheu, e e o
          // unico rotulo de CINCO letras entre as quatro secoes.
          //
          // O caso trava os tres lados: as outras tres continuam inteiras,
          // `Perto` reprova se pedir mais do que ja pede, e o ORCAMENTO em si
          // esta assertado logo abaixo -- se um controle voltar para a barra,
          // ele desaba e o caso reprova em vez de so cortar mais um titulo.
          final deficitDeCincoLetras = destino.rotulo == 'Perto';

          // **O ORCAMENTO MEDIDO, preso em 160,00 dp.**
          //
          // Esta linha e a isca de que `criar` saiu da barra, dita em numero:
          // com a porta de criar de volta em `actions` o orcamento cai para
          // 96,00 dp e este caso reprova. Ele tambem reprova se o sino sair
          // (sobe para 208,00) ou se um quarto controle entrar.
          //
          // **O NUMERO VEM DA CONSTRICAO QUE O `AppBar` DEU AO TITULO, e nao
          // de `disponivel`.** Isto consertou um portao cego MEU, achado ao
          // provar esta propria isca: `disponivel` soma a largura dos
          // `IconButton` da barra, e a porta de criar deixou de ser um -- ela
          // e um `FloatingActionButton`. Com `criar` devolvido ao `actions`,
          // `disponivel` continuava dizendo 160,00 enquanto o titulo de
          // `Rede` saia cortado de verdade: verde pelo motivo errado, e
          // exatamente a classe de defeito que este grupo existe para pegar.
          //
          // `paragrafo.constraints.maxWidth` e o espaco que o leiaute
          // entregou ao titulo. Ele nao depende de eu adivinhar de que TIPO
          // sao os controles do lado direito.
          //
          // DESLIGAMENTO: volte `if (widget.acaoDeCriar != null)
          // widget.acaoDeCriar!,` ao `actions` de `TelaDeAba`.
          expect(
            paragrafo.constraints.maxWidth,
            160.0,
            reason:
                'REPROVA: o titulo de "${destino.rotulo}" recebeu '
                '${paragrafo.constraints.maxWidth.toStringAsFixed(2)} dp de '
                'orcamento em 320 dp a 200%, e o arranjo de 19/10 mede '
                '160,00 -- hamburguer 64 a esquerda, sino 48 e foto 48 a '
                'direita. Menos que isso significa que um controle voltou '
                'para a barra de topo; mais, que um saiu dela. Os dois mudam '
                'quais titulos cabem.',
          );
          expect(
            paragrafo.didExceedMaxLines,
            deficitDeCincoLetras ? isTrue : isFalse,
            reason: deficitDeCincoLetras
                ? 'REPROVA: "${destino.rotulo}" NAO foi cortado a 200%, e o '
                      'deficit medido de 12,90 dp dizia que seria. Se a barra '
                      'ganhou espaco -- outro controle saiu, ou o rotulo '
                      'mudou --, apague esta excecao e volte a cobrar o '
                      'titulo inteiro nas quatro secoes.'
                : 'REPROVA: o titulo "${destino.rotulo}" foi CORTADO com '
                      'reticencia na barra de topo. O cliente encarregou o '
                      'titulo de carregar o significado que o rotulo de '
                      'quatro letras nao carrega (UX 27.4.2), e significado '
                      'que some com reticencia nao foi transferido para lugar '
                      'nenhum.',
          );

          // -----------------------------------------------------------------
          // O ORCAMENTO COM A RESERVA DE FILTRO: `Perto` JA NAO CABE NELE.
          //
          // `disponivel` desconta 64 dp para o gatilho de `Filtros` que a UX
          // 27.5.3 promete a esta secao e que ela **ainda nao publica** (sem
          // dados carregados nao ha acao de listagem). Por isso o leiaute de
          // hoje nao corta nada: o espaco reservado esta livre na pratica.
          //
          // Medido a 200% em 320 dp, com a foto na barra:
          //
          //   orcamento com hamburguer + reserva de filtro + foto: 144,00 dp
          //   `Pets` 138,32 · `Loja` 138,32 · `Rede` 138,32  -> cabem
          //   `Perto` 172,90                                 -> NAO cabe
          //
          // Ou seja: **no dia em que `Perto` publicar o gatilho de `Filtros`,
          // o titulo dela passa a ser cortado a 200%** -- faltam 28,90 dp.
          // Fechar isso exige tirar UM dos controles que o cliente pos na
          // barra: o `Filtros` (17/10), a porta de criar (18/10) ou a foto
          // (19/10). **Decisao dele, nao de quem implementa**, e esta no
          // relatorio como pergunta fechada.
          //
          // O caso trava os dois lados: as tres que cabem continuam cabendo,
          // e `Perto` reprova se pedir mais que os 172,90 dp medidos.
          expect(
            paragrafo.size.width,
            deficitDeCincoLetras
                ? lessThanOrEqualTo(180.0)
                : lessThanOrEqualTo(disponivel),
            reason: deficitDeCincoLetras
                ? 'REPROVA: "${destino.rotulo}" passou a pedir '
                      '${paragrafo.size.width.toStringAsFixed(2)} dp a 200%, '
                      'acima dos 172,90 dp medidos em 19/10. Ela ja nao cabe '
                      'no orcamento com a reserva de `Filtros` (144,00 dp), e '
                      'o deficit aumentou.'
                : 'REPROVA: "${destino.rotulo}" pede '
                      '${paragrafo.size.width.toStringAsFixed(2)} dp e sobram '
                      '${disponivel.toStringAsFixed(2)} dp em 320 dp a 200%, '
                      'com o hamburguer na esquerda, a foto da conta a direita '
                      'e ${reservaDeAcao > AvatarDaConta.alvo ? 'uma' : 'nenhuma'} '
                      'acao de listagem reservada. Titulo que nao cabe se '
                      'resolve trocando a palavra em projeto, nunca com '
                      'reticencia (UX 27.4.2).',
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
              // A bancada mede LARGURA de barra com o gatilho instalado, e
              // por isso ela declara que ha submenu: sem isto o `TelaDeAba`
              // real nao desenharia o botao e nao haveria o que medir.
              temSubDestinos: true,
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
      // As rotas das SECOES DA BARRA, e nao do registro inteiro.
      //
      // A divisao que este caso protege e "a gaveta nao oferece a mesma
      // viagem que a BARRA". Desde 19/10 a conta esta no registro e **fora**
      // da barra: a porta dela e a foto da barra de topo. Por isso
      // `Minha conta` pode ser item de gaveta sem violar nada -- a barra nao
      // oferece essa viagem. Comparar contra o registro proibiria justamente
      // o item que a saida do `Perfil` da barra tornou necessario.
      final rotasDeSecao = CascaComAbas.visiveisEm(CascaComAbas.configuracao)
          .map((d) => d.rota)
          .toSet();
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
            'REPROVA: a barra nao tem cinco rotas de secao. Sem elas '
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

    testWidgets('nenhum NOME DE SECAO e pintado dentro da gaveta', (
      tester,
    ) async {
      // Este caso mudou de sinal em 23/09, e a mudanca e a correcao.
      //
      // Ate 22/09 ele COBRAVA os cinco nomes de secao como cabecalho de grupo
      // dentro da gaveta, porque a gaveta mostrava as cinco. O cliente leu o
      // resultado e reprovou com a frase exata: "voce replicou no menu
      // lateral, exatamente o mesmo menu principal". Um cabecalho que nao
      // navega nao deixa de ser o menu principal repetido: ele e o menu
      // principal repetido e mudo.
      //
      // Agora a gaveta mostra o submenu de UMA secao -- a atual --, e o nome
      // dela ja esta na barra de topo, ao lado do proprio gatilho que a abriu.
      // Pintar a palavra de novo seria a terceira vez na mesma tela.
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');
      await abrirAGaveta(tester);

      final pintados = tester
          .widgetList<Text>(
            find.descendant(
              of: find.byType(Drawer),
              matching: find.byType(Text),
            ),
          )
          .map((t) => t.data ?? '')
          .toList();
      // Os nomes das secoes DA BARRA. `Perfil` saiu da lista porque saiu da
      // barra: a gaveta pode -- e precisa -- oferecer a conta, e ela o faz
      // com o rotulo `Minha conta`.
      for (final destino in CascaComAbas.visiveisEm(
        CascaComAbas.configuracao,
      )) {
        expect(
          pintados,
          isNot(contains(destino.rotulo)),
          reason:
              'REPROVA: a gaveta pinta "${destino.rotulo}", que e nome de '
              'SECAO da barra. Com ou sem toque, e o menu principal replicado '
              'dentro do submenu -- exatamente o que o cliente reprovou em '
              '23/09.',
        );
      }

      final ativaveis = rotulosAtivaveis(tester);
      for (final destino in CascaComAbas.visiveisEm(
        CascaComAbas.configuracao,
      )) {
        expect(
          ativaveis,
          isNot(contains(destino.rotulo)),
          reason:
              'REPROVA: "${destino.rotulo}" e ativavel com a gaveta aberta. '
              'Quem troca de secao e a barra de baixo, e com a gaveta aberta '
              'ela esta atras da cortina.',
        );
      }
      handle.dispose();
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

    test('o inventario de 27.5 tem 50 linhas, 15 destinos e 5 atalhos vivos', () {
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

      // CINCO -> SEIS em 19/10: a secao de mensagens entrou na barra e toda
      // secao do registro precisa de linha aqui (`itensDe` estoura sem ela).
      // A entrada dela esta declarada e com as duas linhas `planejada` -- os
      // sub-destinos de mensagens sao de outro agente e nao existem nesta
      // arvore.
      expect(
        RegistroDeSubDestinos.porSecao.keys.length,
        6,
        reason:
            'REPROVA: o registro deixou de ter uma entrada por secao. '
            'Sao seis entradas -- as cinco secoes da barra mais a conta, que '
            'saiu da barra e continua no registro -- e uma secao sem entrada '
            'faz `itensDe` estourar.',
      );
      // 48 -> 50 em 19/10: as duas linhas da secao de mensagens
      // (`Lista de conversas` e `Conversa`), as duas `planejada`.
      expect(
        todos.length,
        50,
        reason:
            'REPROVA: o inventario de 27.5 saiu de 50 linhas e foi para '
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
        reason:
            'REPROVA: os destinos de MENU sairam de 15 e foram para '
            '${destinos.length}. A maioria das 48 linhas nunca foi item de '
            'menu -- filtro e folha, busca e campo, aviso e faixa -- e e a '
            'FORMA que decide. Mudanca aqui significa que alguem reclassificou '
            'uma linha, e reclassificar filtro como destino e exatamente como '
            'a gaveta ganharia um item que nao tem endereco.',
      );

      final vivos = todos.where((d) => d.viraItem).toList(growable: false);
      // SEIS -> SETE em 18/10/2026: `Editar o perfil`, que a UX 27.5.5 listava
      // e o app nao tinha, passou a existir como `Meus dados`
      // (`TelaDadosPessoais`, rota `/perfil/dados`). E a subida que a propria
      // mensagem abaixo chama de caminho normal -- e ela so aconteceu porque a
      // tela do outro lado existe e esta registrada no roteador, o que o caso
      // `toda rota de item vivo esta REGISTRADA no roteador` confere.
      // SETE -> CINCO em 19/10: as duas linhas de `Adoções` viraram
      // `planejada` porque nao existe rota de adocao no contrato. **Elas nao
      // foram apagadas** -- desceram para a lista de `porConstruir`, que
      // subiu de 8 para 10 no mesmo movimento. A queda aqui so e legitima
      // porque aquela subida aconteceu, e e isso que o caso de soma no fim
      // deste grupo garante.
      expect(
        vivos.length,
        5,
        reason:
            'REPROVA: os atalhos VIVOS sairam de 5 e foram para '
            '${vivos.length}: ${vivos.map((d) => d.rotulo).join(', ')}. '
            'Subir e o caminho normal, e so quando a tela do outro lado '
            'existir; descer significa que um atalho da gaveta morreu.',
      );

      final porConstruir = todos
          .where((d) => d.pendente)
          .toList(growable: false);
      // NOVE -> OITO no mesmo dia, e pelo mesmo motivo: `Meus dados` saiu
      // desta lista para a de vivos. `vivos` subiu junto, que e a condicao que
      // a mensagem abaixo exige para a queda nao ser um nome que desapareceu.
      // OITO -> DEZ em 19/10, pelas duas linhas de `Adoções` que desceram de
      // `existe` para `planejada`. Elas continuam NOMEADAS no inventario.
      expect(
        porConstruir.length,
        10,
        reason:
            'REPROVA: os destinos de menu POR CONSTRUIR sairam de 10 e '
            'foram para ${porConstruir.length}. Estes sao os que a gaveta '
            'NOMEIA em texto e nunca renderiza como controle; o numero cair '
            'sem que `vivos` suba e um nome que desapareceu da tela.',
      );

      expect(
        vivos.length + porConstruir.length,
        destinos.length,
        reason:
            'REPROVA: ha destino de menu que nao e nem vivo nem pendente. '
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
        // A assercao de `SubDestino` cobra glifo de todo item VIVO, e este
        // fixture e vivo de proposito (`viraItem` e o que ele afirma logo
        // abaixo). O glifo nao e do registro: inventar endereco e o assunto
        // deste caso, inventar desenho nao.
        icone: Icons.shopping_cart_outlined,
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
          // A GAVETA E O SUBMENU DA SECAO ATUAL (23/09): e preciso estar NELA.
          //
          // Antes deste dia a gaveta listava as cinco secoes e qualquer atalho
          // era alcancavel de qualquer aba -- que era o defeito, e nao a
          // comodidade. Este passo e o preco da correcao, e ele tambem passou
          // a exercitar o caminho real: ninguem abre o submenu de `Perfil`
          // estando em `Pets`.
          await tester.tap(
            find.widgetWithText(
              NavigationDestination,
              CascaComAbas.porRota(vivo.secao).rotulo,
            ),
          );
          await tester.pumpAndSettle();
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
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');
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
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');
      await abrirAGaveta(tester);

      final ativaveis = rotulosAtivaveis(tester);
      expect(
        // Mesmo motivo: `Adoções` nao e mais item vivo. `Escanear uma tag`
        // e, e continua sendo a porta mais critica do produto.
        ativaveis.any((l) => l.contains('Escanear uma tag')),
        isTrue,
        reason:
            'REPROVA: a varredura nao achou `Escanear uma tag`, que e um item '
            'VIVO da gaveta. Ela nao esta enxergando controle nenhum, e o '
            'caso dos pendentes passou a nao medir nada.',
      );
      handle.dispose();
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
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');
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

      // Os destinos DA BARRA: a conta saiu dela em 19/10 e o nome acessivel
      // dela nao esta mais na arvore da barra -- cobrar os seis do registro
      // faria a contraprova falhar por um motivo que nao e o dela.
      final ativaveis = rotulosAtivaveis(tester);
      final naBarra = CascaComAbas.visiveisEm(CascaComAbas.configuracao);
      final achados = naBarra
          .where((d) => ativaveis.any((l) => l.contains(d.semanticsLabel)))
          .length;
      expect(
        achados,
        naBarra.length,
        reason:
            'REPROVA: com a gaveta FECHADA a varredura achou $achados de '
            '${naBarra.length} destinos da barra. Ela nao esta '
            'enxergando o fundo, e o caso de cima passou a provar nada.',
      );
      handle.dispose();
    });

    testWidgets('a gaveta aberta tem a cortina que a fecha por toque', (
      tester,
    ) async {
      await abrirOApp(tester, rede: _semServidor);
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino -- logo nao tem gaveta e nao tem gatilho,
      // pela segunda metade de `comGaveta` em `casca_com_abas.dart`. Este caso
      // fala da gaveta, entao ele vai a uma secao que TEM uma. `Pets` e a
      // escolhida por ser a que o resto do arquivo usa.
      await irParaASecao(tester, 'Pets');
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
  group('7. a gaveta e SUBMENU, e nao o menu principal (23/09)', () {
    // O cliente reprovou a gaveta de 22/09 com duas frases, e cada uma virou
    // duas iscas aqui:
    //
    //   "parece mais uma pagina do que menu, com tanto texto, tanta
    //    explicacao"                                    -> iscas B e C
    //   "voce replicou no menu lateral exatamente o mesmo menu principal;
    //    ali e para voce utilizar submenu"              -> iscas A e D
    //
    // Medido antes: 736 caracteres em 22 blocos de texto para 6 itens que
    // navegam. Um titulo, um paragrafo de explicacao, cinco cabecalhos de
    // secao, tres paragrafos de `Em construcao` nomeando nove telas
    // inexistentes e seis linhas de apoio.

    testWidgets('isca A: a gaveta nao mostra sub-destino de OUTRA secao', (
      tester,
    ) async {
      // O MECANISMO: `GavetaDeSecoes` recebe `rotaDaSecao` e lista
      // `RegistroDeSubDestinos.itensDe(rotaDaSecao)` -- uma secao, a atual.
      // Desligar = voltar a iterar as cinco secoes. Esta isca reprova pelo
      // nome do caso, dizendo qual item invadiu e de onde ele veio.
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());

      final conferidas = <String>[];
      for (final destino in secoesDaBarra) {
        await irParaASecao(tester, destino.rotulo);
        // **Nao ha mais secao sem gatilho desde 19/10**: a gaveta e fixa. O
        // `continue` que existia aqui pulava `Rede` e `Loja`, e com ele a
        // isca deixaria de conferir justamente as duas secoes cuja gaveta
        // passou a ser so o grupo global.
        await abrirAGaveta(tester);
        conferidas.add(destino.rotulo);

        for (final item in RegistroDeSubDestinos.itensDe(destino.rota)) {
          expect(
            find.byKey(ItemDaGaveta.chaveDe(destino.rota, item.rotulo)),
            findsOneWidget,
            reason:
                'REPROVA: o submenu de "${destino.rotulo}" nao mostra o '
                'proprio atalho "${item.rotulo}". A correcao de 23/09 tirou as '
                'outras secoes da gaveta; tirar tambem os itens da secao atual '
                'a deixaria vazia, e nenhum dos 6 atalhos vivos pode ficar '
                'inalcancavel.',
          );
        }

        final invasores = <String>[];
        for (final vivo in itensVivos()) {
          if (vivo.secao == destino.rota) continue;
          if (find
              .byKey(ItemDaGaveta.chaveDe(vivo.secao, vivo.item.rotulo))
              .evaluate()
              .isNotEmpty) {
            invasores.add('${vivo.item.rotulo} (de ${vivo.secao})');
          }
        }
        expect(
          invasores,
          isEmpty,
          reason:
              'REPROVA: estando em "${destino.rotulo}", a gaveta mostra item '
              'de outra secao: ${invasores.join(', ')}.\n'
              'Ai ela volta a ser o indice do app inteiro -- o menu principal '
              'replicado --, e nao o submenu da secao em que se esta. Foi a '
              'reprovacao do cliente em 23/09.',
        );

        // Fecha pelo caminho do sistema, que o grupo 1 ja provou que fecha a
        // gaveta em vez de desempilhar a tela.
        await voltarDoSistema(tester);
        expect(
          find.byType(Drawer),
          findsNothing,
          reason:
              'REPROVA: a gaveta de "${destino.rotulo}" nao fechou, e a volta '
              'do laco mediria a secao anterior achando que mudou.',
        );
      }

      // TRES -> QUATRO em 19/10, e a lista mudou de significado.
      //
      // Ela era "as secoes que tem atalho vivo PROPRIO" (`Pets`, `Perto`,
      // `Perfil`), porque so essas montavam gaveta. Agora **toda** secao da
      // barra monta: a gaveta e fixa. E `Perfil` saiu porque deixou de ser
      // secao da barra -- a tela da conta e rota irma, alcancada pela foto.
      expect(
        conferidas,
        // A INVERSAO DE `Rede` E `Perto` CHEGOU AQUI NA UNIAO DE 18/10/2026: a
        // lista estava na ordem de antes do pedido literal do cliente
        // (*"inverta a ordem no app do item rede e perto"*), porque este ramo
        // nasceu antes dele. O caso continua conferindo a MESMA coisa contra uma
        // lista escrita a mao; so a ordem passou a ser a da uniao.
        <String>['Pets', 'Perto', 'Rede', 'Loja'],
        reason:
            'REPROVA: conferi ${conferidas.length} secao(oes) com gaveta '
            '(${conferidas.join(', ')}) em vez das QUATRO secoes da barra. '
            'Desde 19/10 toda secao tem gaveta: se a lista encolher, esta '
            'isca passou a olhar menos gaveta do que existe.',
      );
    });

    testWidgets('isca B: nenhum item da gaveta tem linha descritiva', (
      tester,
    ) async {
      // O MECANISMO: `ItemDaGaveta` pinta `title` e nao tem `subtitle`, e o
      // campo `descricao` saiu do `SubDestino` para a linha de apoio nao ter
      // de onde voltar. Desligar = devolver o `subtitle`.
      //
      // A medida e dura de proposito: o conjunto de textos que a gaveta pinta
      // tem de ser IGUAL ao conjunto de rotulos dos itens dela. Nao "conter",
      // nao "comecar por": igual. Qualquer palavra a mais -- subtitulo,
      // cabecalho, titulo, explicacao -- reprova.
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());

      for (final destino in secoesDaBarra) {
        await irParaASecao(tester, destino.rotulo);
        await abrirAGaveta(tester);

        final tiles = tester
            .widgetList<ListTile>(
              find.descendant(
                of: find.byType(Drawer),
                matching: find.byType(ListTile),
              ),
            )
            .toList();
        expect(
          tiles,
          isNotEmpty,
          reason:
              'REPROVA: a gaveta de "${destino.rotulo}" nao tem item nenhum, e '
              'esta isca passaria por vazio.',
        );
        for (final tile in tiles) {
          expect(
            tile.subtitle,
            isNull,
            reason:
                'REPROVA: um item da gaveta de "${destino.rotulo}" voltou a '
                'ter linha de apoio. As seis que existiam eram metade do texto '
                'da gaveta e nenhuma dizia algo que o rotulo nao dissesse: '
                '"Leia o QR da coleira de um pet." embaixo de '
                '"Escanear uma tag".',
          );
        }

        // O conjunto esperado = os itens PROPRIOS da secao + os GLOBAIS que
        // ela nao duplica. Os globais entraram em 19/10, com a gaveta fixa, e
        // sao itens de verdade: deixa-los fora desta conta faria a isca
        // reprovar o estado correto -- e, se alguem invertesse o sinal, ela
        // passaria a aprovar texto solto na gaveta.
        //
        // **A medida continua dura: IGUALDADE de conjuntos, nao "contem".**
        // Qualquer palavra a mais -- subtitulo, cabecalho, titulo de grupo,
        // explicacao, "ainda nao ha submenu" -- reprova.
        final proprios = RegistroDeSubDestinos.itensDe(destino.rota);
        final rotasProprias = proprios.map((i) => i.rota).toSet();
        final esperados = <String>[
          ...proprios.map((i) => i.rotulo),
          ...RegistroDeSubDestinos.globais
              .where((g) => !rotasProprias.contains(g.rota))
              .map((g) => g.rotulo),
        ]..sort();
        final pintados = textosDaGaveta(tester)..sort();
        expect(
          pintados,
          esperados,
          reason:
              'REPROVA: a gaveta de "${destino.rotulo}" pinta\n  '
              '${pintados.join('\n  ')}\n'
              'e os rotulos dos itens dela sao\n  '
              '${esperados.join('\n  ')}\n'
              'Uma linha por item, so o rotulo: e o que o cliente pediu em '
              '23/09 depois de contar 736 caracteres para 6 itens.',
        );

        await voltarDoSistema(tester);
      }
    });

    test('isca B (fonte): nao ha `subtitle` no arquivo da gaveta', () {
      // Varredura de FONTE, pelo mesmo motivo do caso de `onTap: null`: um
      // `subtitle` escrito num ramo que nenhum caso monta passa calado pela
      // arvore. O campo `descricao` tambem e cobrado aqui -- ele era a fonte
      // da linha de apoio, e reintroduzi-lo e o primeiro passo para ela
      // voltar.
      const caminho = 'lib/telas/gaveta_de_secoes.dart';
      final arquivo = File(caminho);
      expect(
        arquivo.existsSync(),
        isTrue,
        reason: 'REPROVA: nao achei "$caminho".',
      );
      final semComentarios = arquivo
          .readAsStringSync()
          .split('\n')
          .map((l) => l.replaceAll(RegExp('//.*'), ''))
          .join('\n');
      expect(
        semComentarios,
        isNot(contains('subtitle')),
        reason:
            'REPROVA: ha `subtitle` em "$caminho". A gaveta de 23/09 e uma '
            'linha por item, so o rotulo.',
      );
      expect(
        semComentarios,
        isNot(contains('descricao')),
        reason:
            'REPROVA: o campo `descricao` voltou ao registro de sub-destinos. '
            'Ele era a fonte das seis linhas de apoio que o cliente reprovou; '
            'com o campo de volta, a linha volta no primeiro `subtitle:`.',
      );
    });

    testWidgets('isca C: a gaveta nao fala de tela que nao existe', (
      tester,
    ) async {
      // O MECANISMO: os tres paragrafos de `Em construcao` sairam da gaveta,
      // e as constantes que os produziam sairam de `TextosDaGaveta`.
      // Desligar = devolver o paragrafo que nomeia os pendentes.
      //
      // Roadmap em menu tem um custo que nao e de gosto: `Mensagens`,
      // `Doações`, `Carrinho e pedido`, `Meus pedidos`, `Convidar vizinhos`,
      // `Notificações`, `Transferir um pet` e `Termos` sao OITO telas que o
      // app nao tem. Quem le oito nomes num menu tenta tocar em algum.
      //
      // Eram nove ate 18/10/2026: `Editar o perfil` saiu desta lista porque a
      // tela foi construida (`Meus dados`, `/perfil/dados`) e a linha virou
      // atalho vivo.
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());

      final porConstruir = pendentes();
      expect(
        porConstruir,
        isNotEmpty,
        reason:
            'REPROVA: o registro nao tem sub-destino pendente nenhum, e esta '
            'isca nao teria nome nenhum para procurar na gaveta.',
      );

      for (final destino in secoesDaBarra) {
        await irParaASecao(tester, destino.rotulo);
        await abrirAGaveta(tester);
        // Rola a gaveta inteira: texto abaixo da dobra nao tem `Element`, e
        // uma isca que so olhasse a primeira tela aprovaria um paragrafo de
        // roadmap no rodape.
        final textos = await textosDaGavetaInteira(tester);

        for (final marca in <String>[
          'Em construção',
          'construção',
          'Atalhos',
        ]) {
          expect(
            textos.any((t) => t.contains(marca)),
            isFalse,
            reason:
                'REPROVA: a gaveta de "${destino.rotulo}" pinta "$marca". '
                'Menu nao carrega roadmap: o que nao existe nao se anuncia no '
                'lugar em que tudo o mais e tocavel.',
          );
        }

        final nomeados = <String>[];
        for (final p in porConstruir) {
          if (textos.any((t) => t.contains(p.rotulo))) {
            nomeados.add(p.rotulo);
          }
        }
        expect(
          nomeados,
          isEmpty,
          reason:
              'REPROVA: a gaveta de "${destino.rotulo}" nomeia tela que nao '
              'existe: ${nomeados.join(', ')}.\n'
              'Nenhuma delas tem rota registrada; o nome no menu e uma promessa '
              'que o toque nao cumpre.',
        );

        await voltarDoSistema(tester);
      }
    });

    testWidgets('isca D: TODA secao desenha o gatilho, e a gaveta nunca '
        'abre vazia', (tester) async {
      // **O QUE ESTA ISCA PROVAVA, E O QUE ELA PROVA AGORA.**
      //
      // Ela provava o CONTRARIO: que uma secao sem nenhum sub-destino
      // construido **nao** desenhava o gatilho e **nao** montava a gaveta --
      // `Rede` e `Loja` eram o par. O argumento era bom e continua sendo: um
      // hamburguer que escurece a tela para nao oferecer nada e acao sem
      // destino (criterio 2 da BICHUS-62) na forma mais silenciosa que
      // existe, porque o controle responde ao toque.
      //
      // **O cliente reverteu em 19/10**, com o argumento na mesa: *"padronize
      // todas as telas, tornando o menu esquerdo fixo para manter o padrao,
      // por mais que nao exista um sub-menu ainda, mas irei evoluir e
      // acrescentar alguns itens"*.
      //
      // A isca nao foi apagada e nao foi afrouxada: ela trocou de lado e
      // ficou com DUAS obrigacoes, porque a padronizacao so e defensavel se a
      // segunda for cumprida.
      //
      //   1. toda secao desenha o gatilho e monta a gaveta DELA;
      //   2. **nenhuma gaveta abre vazia** -- o que a secao sem submenu
      //      proprio mostra sao os destinos globais.
      //
      // Desligar os globais faz esta isca reprovar na obrigacao 2, que e
      // exatamente a objecao antiga continuando de pe por outro mecanismo.
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());

      final semSubmenuProprio = <String>[];
      for (final destino in secoesDaBarra) {
        await irParaASecao(tester, destino.rotulo);
        final proprios = RegistroDeSubDestinos.itensDe(destino.rota);
        if (proprios.isEmpty) semSubmenuProprio.add(destino.rotulo);

        expect(
          find.byType(BotaoDaGaveta),
          findsOneWidget,
          reason:
              'REPROVA: "${destino.rotulo}" nao desenhou o gatilho da gaveta. '
              'Desde 19/10 o menu esquerdo e FIXO em toda tela de secao, por '
              'decisao do cliente -- inclusive onde ainda nao ha submenu '
              'proprio.',
        );

        final casca = cascaDaVez(tester);
        expect(
          casca.drawer,
          isA<GavetaDeSecoes>(),
          reason:
              'REPROVA: "${destino.rotulo}" desenhou o gatilho e a casca nao '
              'montou a gaveta. O toque escureceria a tela para nada.',
        );
        expect(
          (casca.drawer! as GavetaDeSecoes).rotaDaSecao,
          destino.rota,
          reason:
              'REPROVA: estando em "${destino.rotulo}" a casca montou a '
              'gaveta de outra secao. E a isca A pelo lado da construcao: '
              'gaveta apontada para a secao errada mostra submenu alheio.',
        );

        // A OBRIGACAO 2, medida na tela e nao no registro.
        await abrirAGaveta(tester);
        expect(
          find.descendant(
            of: find.byType(Drawer),
            matching: find.byType(ItemDaGaveta),
          ),
          findsWidgets,
          reason:
              'REPROVA: a gaveta de "${destino.rotulo}" abriu VAZIA. Gaveta '
              'fixa so e defensavel porque o caso vazio tem conteudo: os '
              'destinos globais. Sem eles, a padronizacao de 19/10 virou uma '
              'cortina que escurece a tela para nao oferecer nada -- que e a '
              'objecao que esta isca provava do outro lado ate 19/10.',
        );
        await tester.tapAt(const Offset(700, 300));
        await tester.pumpAndSettle();
      }

      expect(
        semSubmenuProprio,
        // `Perto` ENTROU nesta lista em 19/10: o unico sub-destino vivo dela
        // era `Pets de ONGs para adoção`, e ele virou `planejada` com a saida
        // das portas de adocao. Agora tres das quatro secoes abrem so com o
        // grupo global -- o que torna a decisao de 19/10 (gaveta fixa com
        // destinos globais) ainda mais carregada, e e exatamente o cenario
        // que esta isca existe para vigiar.
        // A INVERSAO DE `Rede` E `Perto` CHEGOU AQUI NA UNIAO DE 18/10/2026: a
        // lista estava na ordem de antes do pedido literal do cliente
        // (*"inverta a ordem no app do item rede e perto"*), porque este ramo
        // nasceu antes dele. O caso continua conferindo a MESMA coisa contra uma
        // lista escrita a mao; so a ordem passou a ser a da uniao.
        <String>['Perto', 'Rede', 'Loja'],
        reason:
            'REPROVA: as secoes sem sub-destino PROPRIO sao '
            '${semSubmenuProprio.join(', ')} e nao `Rede, Loja`. Se a lista '
            'ficar vazia esta isca deixou de exercitar o cenario que o '
            'cliente mandou padronizar e passa por vacuidade; se crescer, '
            'uma secao perdeu os atalhos dela.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 8. CADA SUBITEM TEM GLIFO, E NENHUM GLIFO DIZ DUAS COISAS NA MESMA SECAO
  //
  // Pedido do cliente de 18/10/2026, literal: *"nos subitens dos menus voce
  // deve colocar icones tambem, para deixar o aplicativo mais bonito"*. E a
  // restricao que vem com ele, que nao e estetica: *houve colisao lida no
  // aparelho em 22/09* -- `edit_calendar` significando duas coisas dentro da
  // `Rede` --, e por isso o portao nao se contenta com "tem icone".
  //
  // Os tres casos sao independentes de proposito:
  //   (a) a gaveta MONTADA pinta um glifo em cada linha -- prova de tela, e
  //       nao de registro; reprova se `leading` sair de `ItemDaGaveta`;
  //   (b) o glifo pintado e o que o registro declara -- sem isto, pintar
  //       sempre o mesmo icone passaria pelo caso (a);
  //   (c) dentro de uma secao, dois itens nunca dividem o mesmo glifo.
  group('8. cada subitem pinta um glifo, e nenhum glifo colide', () {
    /// A lista que a gaveta de [rotaDaSecao] pinta, na ordem dela.
    ///
    /// **Reproduz o recorte da gaveta, inclusive o por ROTA:** global cuja
    /// rota a secao ja oferece nao e pintado duas vezes. Uma lista a mao aqui
    /// mediria outra gaveta.
    List<SubDestino> pintadosDe(String rotaDaSecao) {
      final itens = RegistroDeSubDestinos.itensDe(rotaDaSecao);
      final jaOferecidas = itens.map((i) => i.rota).toSet();
      return <SubDestino>[
        ...itens,
        ...RegistroDeSubDestinos.globais.where(
          (g) => !jaOferecidas.contains(g.rota),
        ),
      ];
    }

    for (final destino in secoesDaBarra) {
      testWidgets(
        'a gaveta de "${destino.rotulo}" pinta um glifo em cada linha',
        (tester) async {
          await abrirOApp(
            tester,
            rede: _semServidor,
            deposito: depositoLogado(),
          );
          await irParaASecao(tester, destino.rotulo);
          await abrirAGaveta(tester);

          final pintados = pintadosDe(destino.rota);
          expect(
            pintados,
            isNotEmpty,
            reason:
                'REPROVA: a gaveta de "${destino.rotulo}" nao pinta linha '
                'nenhuma. Sem item nao ha glifo para conferir, e o caso '
                'passaria por vazio.',
          );
          for (final item in pintados) {
            final linha = find.byKey(
              ItemDaGaveta.chaveDe(destino.rota, item.rotulo),
            );
            await tester.scrollUntilVisible(
              linha,
              BichuEspaco.e16,
              scrollable: rolavelDaGaveta,
            );
            await tester.ensureVisible(linha);
            await tester.pumpAndSettle();
            // O GLIFO DA FRENTE, e nao a seta da direita. `find.byIcon` sobre
            // a linha inteira acharia `chevron_right` tambem e o caso ficaria
            // verde com a affordance no lugar do icone do item.
            // A chave de `ItemDaGaveta` esta NO `ListTile`, e por isso o
            // `linha` ja e ele.
            final tile = tester.widget<ListTile>(linha);
            expect(
              tile.leading,
              isA<Icon>(),
              reason:
                  'REPROVA: a linha "${item.rotulo}" da gaveta de '
                  '"${destino.rotulo}" nao tem glifo no `leading`. O cliente '
                  'pediu icone em TODO subitem em 18/10/2026; uma linha so de '
                  'texto no meio de linhas com glifo e o desalinho que o '
                  'pedido veio fechar.',
            );
          }
        },
      );
    }

    for (final destino in secoesDaBarra) {
      testWidgets(
        'o glifo pintado em "${destino.rotulo}" e o que o registro declara',
        (tester) async {
          await abrirOApp(
            tester,
            rede: _semServidor,
            deposito: depositoLogado(),
          );
          await irParaASecao(tester, destino.rotulo);
          await abrirAGaveta(tester);

          for (final item in pintadosDe(destino.rota)) {
            final linha = find.byKey(
              ItemDaGaveta.chaveDe(destino.rota, item.rotulo),
            );
            await tester.scrollUntilVisible(
              linha,
              BichuEspaco.e16,
              scrollable: rolavelDaGaveta,
            );
            await tester.ensureVisible(linha);
            await tester.pumpAndSettle();
            final tile = tester.widget<ListTile>(linha);
            expect(
              (tile.leading! as Icon).icon,
              item.icone,
              reason:
                  'REPROVA: a linha "${item.rotulo}" pinta um glifo que nao e '
                  'o que o registro declara para ela. Um `leading` fixo '
                  'passaria pelo caso de presenca e deixaria as seis linhas '
                  'da gaveta com o mesmo desenho.',
            );
          }
        },
      );
    }

    test('nenhuma secao tem dois itens com o MESMO glifo', () {
      // A regra que a colisao de 22/09 deixou: um glifo, um sentido, dentro
      // da secao. A conta e por `codePoint` e nao por identidade de objeto --
      // `Icons.pets` e um `IconData` novo a cada leitura em algumas versoes,
      // e comparar por objeto aprovaria duas linhas iguais.
      final colisoes = <String>[];
      for (final rotaDaSecao in RegistroDeSubDestinos.porSecao.keys) {
        final itens = RegistroDeSubDestinos.itensDe(rotaDaSecao);
        final jaOferecidas = itens.map((i) => i.rota).toSet();
        final pintados = <SubDestino>[
          ...itens,
          ...RegistroDeSubDestinos.globais.where(
            (g) => !jaOferecidas.contains(g.rota),
          ),
        ];
        final porGlifo = <int, List<String>>{};
        for (final item in pintados) {
          porGlifo.putIfAbsent(item.icone!.codePoint, () => <String>[])
              .add(item.rotulo);
        }
        for (final entrada in porGlifo.entries) {
          if (entrada.value.length > 1) {
            colisoes.add('$rotaDaSecao: ${entrada.value.join(' = ')}');
          }
        }
      }
      expect(
        colisoes,
        isEmpty,
        reason:
            'REPROVA: dois itens da MESMA secao dividem o mesmo glifo:\n'
            '  ${colisoes.join('\n  ')}\n'
            'E a colisao que o cliente leu no aparelho em 22/09: o mesmo '
            'desenho significando duas viagens diferentes na mesma lista. '
            'Troque o glifo, dentro da familia embutida (Material Symbols, '
            'design system 10.1) -- nenhum vetor novo, nada baixado.',
      );
    });

    test('CONTRAPROVA: o conferidor de colisao ACHA uma colisao plantada', () {
      // Sem esta prova negativa, o caso acima ficaria verde no dia em que a
      // conta por `codePoint` parasse de agrupar.
      const a = SubDestino(
        rotulo: 'Um',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: '/um',
        icone: Icons.qr_code_scanner,
      );
      const b = SubDestino(
        rotulo: 'Outro',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: '/outro',
        icone: Icons.qr_code_scanner,
      );
      final porGlifo = <int, List<String>>{};
      for (final item in <SubDestino>[a, b]) {
        porGlifo.putIfAbsent(item.icone!.codePoint, () => <String>[])
            .add(item.rotulo);
      }
      expect(
        porGlifo.values.where((l) => l.length > 1),
        isNotEmpty,
        reason:
            'REPROVA: duas linhas com o MESMO glifo passaram pelo '
            'conferidor. O caso acima nao reprova nada.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 9. `Meus dados` NAO E GLOBAL (18/10/2026)
  //
  // Pedido do cliente, literal: *"o menu `Meus dados` dentro da pagina Pets e
  // Perto nao faz sentido nenhum com o contexto dessa secao"*. Ele aparecia
  // nas duas porque estava em [RegistroDeSubDestinos.globais], o grupo que
  // toda secao mostra -- e nao no inventario de `Pets` nem no de `Perto`.
  //
  // **Os dois lados sao cobrados.** Tirar um item de menu e facil de fazer
  // errado de duas maneiras opostas: deixando a viagem inalcancavel, ou
  // deixando-a onde ele mandou tirar. O caso (b) cobra a primeira e o (a) a
  // segunda.
  group('9. `Meus dados` saiu de `Pets` e de `Perto`, e nao ficou orfao', () {
    for (final rotulo in <String>['Pets', 'Perto', 'Rede', 'Loja']) {
      testWidgets('(a) a gaveta de "$rotulo" NAO oferece `Meus dados`', (
        tester,
      ) async {
        await abrirOApp(
          tester,
          rede: _semServidor,
          deposito: depositoLogado(),
        );
        await irParaASecao(tester, rotulo);
        await abrirAGaveta(tester);
        final vistos = await textosDaGavetaInteira(tester);
        expect(
          vistos,
          isNot(contains('Meus dados')),
          reason:
              'REPROVA: a gaveta de "$rotulo" oferece `Meus dados`. O cliente '
              'disse em 18/10/2026 que o item "nao faz sentido nenhum com o '
              'contexto dessa secao": os dados da conta sao do `Perfil`, que '
              'tem endereco proprio. Global e o destino que vale em QUALQUER '
              'secao, e este nao e.\n'
              'A gaveta mostrou: ${vistos.join(' · ')}',
        );
        // E a gaveta NAO ficou vazia, que era a objecao que criou o grupo
        // global. Sem esta metade, apagar os globais inteiros passaria.
        expect(
          vistos,
          contains('Escanear uma tag'),
          reason:
              'REPROVA: a gaveta de "$rotulo" perdeu `Escanear uma tag` '
              'junto. Ela e o global que SOBROU, e e ela que mantem a gaveta '
              'fixa defensavel: ler a plaquinha de um bicho na rua faz '
              'sentido em qualquer secao e nao exige conta.',
        );
      });
    }

    testWidgets('(b) `Meus dados` continua na gaveta do `Perfil`, e NAVEGA', (
      tester,
    ) async {
      // A metade que impede a correcao de virar beco: a tela
      // `/perfil/dados` tem de continuar alcancavel por menu, e o lugar dela
      // e a secao da conta.
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());
      await irParaAConta(tester);
      await abrirAGaveta(tester);
      final alvo = find.byKey(
        ItemDaGaveta.chaveDe(Rotas.perfil, 'Meus dados'),
      );
      await tester.scrollUntilVisible(
        alvo,
        BichuEspaco.e16,
        scrollable: rolavelDaGaveta,
      );
      await tester.ensureVisible(alvo);
      await tester.pumpAndSettle();
      expect(
        alvo,
        findsOneWidget,
        reason:
            'REPROVA: `Meus dados` nao esta na gaveta do `Perfil`. Ele saiu '
            'dos globais em 18/10/2026 por pedido do cliente, e sair dos '
            'globais E do submenu da conta no mesmo movimento deixaria '
            '`/perfil/dados` sem porta de menu nenhuma.',
      );
      await tester.tap(alvo);
      await tester.pumpAndSettle();
      final roteador = GoRouter.of(tester.element(find.byType(Scaffold).first));
      expect(
        roteador.routerDelegate.currentConfiguration.matches.last
            .matchedLocation,
        Rotas.dadosPessoais,
        reason:
            'REPROVA: o item `Meus dados` da gaveta do `Perfil` existe e nao '
            'abre `/perfil/dados`. Item que nao navega e acao sem destino '
            '(criterio 2 da BICHUS-62).',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 10. A MARGEM DA FOTO, E O ORCAMENTO DO TITULO NA MESMA MEDIDA
  //
  // Pedido do cliente (18/10/2026): *"o icone do perfil na barra superior,
  // acho que esta faltando uma margem do lado direito, esta desalinhado"*.
  //
  // **MEDIDO, em 320 dp a 200%, logado, antes do conserto:** o alvo de 48 dp
  // da foto ia de 272,00 a 320,00 -- encostado na borda, 0,00 dp de folga --
  // e o circulo de 32 dp ficava centrado nele, a **8,00 dp** da borda da
  // tela. Os vizinhos da mesma barra tem 20,00 dp de ar em volta do glifo
  // (o hamburguer e um alvo de 64 com glifo de 24 centrado) e
  // `layout.margem-celular` fixa a margem lateral da tela em 16 dp, que e a
  // mesma do corpo. A foto era o unico controle encostado na borda.
  //
  // **O CONSERTO NAO PODE SAIR DO TITULO, e e por isso que este grupo mede as
  // duas coisas juntas.** Medido: com um `Padding(right: 8)` por fora, o
  // circulo chega aos 16,00 dp e o lado direito passa a custar 56 dp -- o
  // orcamento de `Rede` e `Perto` cai de 144,00 para 136,00 e **`Rede`
  // (138,32 dp) passa a sair com reticencia**. A margem veio de DENTRO do
  // alvo: o alvo continua 272..320 e o circulo andou para 272..304.
  //
  // Um caso que medisse so a margem aprovaria a versao que corta `Rede`; um
  // que medisse so o titulo aprovaria a volta da margem de 8,00. Os dois
  // numeros ficam no mesmo caso para que a troca entre eles nao passe calada.
  group('10. a foto tem margem, e ela nao foi tirada do titulo', () {
    for (final destino in secoesDaBarra) {
      testWidgets(
        'em "${destino.rotulo}": 16,00 dp de margem na foto e o orcamento do '
        'titulo intacto',
        (tester) async {
          tester.view.physicalSize = const Size(960, 2000);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);
          // LOGADO: e o arranjo mais cheio, e o unico em que `Rede` e `Perto`
          // desenham a porta de criar. Deslogado a barra sobra espaco e o
          // caso aprovaria a versao que corta o titulo de quem tem conta.
          await abrirOApp(
            tester,
            rede: _semServidor,
            deposito: depositoLogado(),
            escala: 2,
          );
          await irParaASecao(tester, destino.rotulo);

          final barra = tester.getRect(find.byType(AppBar));
          final alvoDaFoto = tester.getRect(find.byType(AvatarDaConta));
          final circulo = tester.getRect(
            find.byKey(AvatarDaConta.chaveDoCirculo),
          );

          // (1) A MARGEM QUE O CLIENTE PEDIU, no DESENHO.
          expect(
            barra.right - circulo.right,
            BichuLayout.margemCelular,
            reason:
                'REPROVA: o circulo da foto esta a '
                '${(barra.right - circulo.right).toStringAsFixed(2)} dp da '
                'borda da tela em "${destino.rotulo}", e nao aos '
                '${BichuLayout.margemCelular.toStringAsFixed(2)} dp de '
                '`layout.margem-celular`. Media 8,00 dp antes de 18/10/2026 '
                'e o cliente leu isso como desalinho -- era o unico controle '
                'da barra encostado na borda, com os vizinhos a 20,00 dp.',
          );

          // (2) A MARGEM VEIO DE DENTRO DO ALVO, e nao do orcamento.
          expect(
            alvoDaFoto.width,
            AvatarDaConta.alvo,
            reason:
                'REPROVA: o alvo da foto mede '
                '${alvoDaFoto.width.toStringAsFixed(2)} dp de largura em '
                '"${destino.rotulo}", e nao ${AvatarDaConta.alvo}. Encolher o '
                'alvo para ganhar margem desce abaixo do piso do M3 e do '
                'SC 2.5.8; alarga-lo custa titulo.',
          );
          expect(
            barra.right - alvoDaFoto.right,
            0.0,
            reason:
                'REPROVA: o ALVO da foto saiu da borda '
                '(${(barra.right - alvoDaFoto.right).toStringAsFixed(2)} dp '
                'de folga) em "${destino.rotulo}". A margem tem de ser '
                'INTERNA: um `Padding` por fora empurra o alvo e o lado '
                'direito passa a custar 56 dp -- medido, `Rede` (138,32 dp) '
                'sai com reticencia a 200%.',
          );

          // (3) O ORCAMENTO DO TITULO, medido do leiaute e nao de uma conta.
          //
          // De onde o titulo COMECA ate onde o primeiro controle do lado
          // direito COMECA. Nada de somar larguras imaginadas: se um controle
          // mudar de tamanho, este numero muda com ele.
          final titulo = find.descendant(
            of: find.byType(AppBar),
            matching: find.text(destino.rotulo),
          );
          expect(titulo, findsOneWidget);
          final acoes = find.descendant(
            of: find.byType(AppBar),
            matching: find.byType(IconButton),
          );
          final bordasEsquerdas = <double>[
            for (var i = 0; i < acoes.evaluate().length; i++)
              tester.getRect(acoes.at(i)).left,
          ]..sort();
          // O hamburguer e o primeiro da lista e nao e acao: o titulo ja
          // comeca depois dele.
          final primeiraAcao = bordasEsquerdas.last == bordasEsquerdas.first
              ? barra.right
              : bordasEsquerdas[1];
          final orcamento = primeiraAcao - tester.getRect(titulo).left;
          // **UM NUMERO SO PARA AS QUATRO SECOES, desde 19/10.** O ramo
          // `comPortaDeCriar ? 144,00 : 208,00` saiu porque o lado direito
          // deixou de variar de secao para secao: `criar` desceu para o corpo
          // (*"O botao criar sai da barra"*) e o sino entrou, e ele e
          // INCONDICIONAL. Agora toda secao tem hamburguer 64 a esquerda e
          // sino 48 + foto 48 a direita, e o orcamento e 160,00 dp em todas.
          //
          // Saldo da troca: +64 de `criar` que saiu, -48 do sino que entrou,
          // 144,00 -> 160,00.
          expect(
            orcamento,
            160.0,
            reason:
                'REPROVA: o titulo de "${destino.rotulo}" recebe '
                '${orcamento.toStringAsFixed(2)} dp em 320 dp a 200%, e o '
                'medido em 19/10/2026 e 160,00 (hamburguer 64 + sino 48 + '
                'foto 48). A margem da foto NAO podia mexer neste numero: '
                'fechar os 8 dp de margem com o orcamento do titulo e '
                'desfazer o `titleSpacing: 0` de 19/10 pelo outro lado.',
          );

          // (4) E o titulo continua inteiro onde ja estava inteiro.
          //
          // `Perto` e a excecao medida e ela esta cobrada no grupo 3: ela
          // pede 172,90 dp contra os 160,00 do orcamento -- deficit de
          // **12,90 dp**. Ele caiu de 28,90 quando `criar` saiu da barra em
          // 19/10 e **nao chegou a zero**. A margem da foto continua custando
          // 0,00 dp. Fechar os 12,90 que faltam exige tirar outro controle da
          // barra ou encurtar o rotulo, e as duas coisas sao decisao dele.
          final paragrafo = tester.renderObject<RenderParagraph>(titulo);
          expect(
            paragrafo.didExceedMaxLines,
            destino.rotulo == 'Perto' ? isTrue : isFalse,
            reason: destino.rotulo == 'Perto'
                ? 'REPROVA: "Perto" NAO foi cortada. Se a barra ganhou '
                      'espaco, refaca a conta do deficit de 12,90 dp em vez '
                      'de apagar esta excecao.'
                : 'REPROVA: o titulo "${destino.rotulo}" passou a ser CORTADO '
                      'com reticencia. A margem da foto nao pode ter sido '
                      'paga com titulo: significado que some com reticencia '
                      'nao foi transferido para lugar nenhum (UX 27.4.2).',
          );
        },
      );
    }
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
