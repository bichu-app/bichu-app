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
import 'package:bichu/telas/achado/tela_registrar_achado.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/widgets/icone_da_barra.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
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
///
/// **`Perto` SAIU em 19/10/2026** (deixou de ser secao; o diretorio virou a aba
/// `Comunidade` da `Rede`, e o gatilho de filtro dela e o da `Rede`).
/// **`Mural` NAO ENTROU, e a ausencia e medida:** a secao nao tem recorte
/// nenhum -- nao ha operacao de linha do tempo no contrato, entao nao ha busca,
/// nem ordem, nem grupo de filtro --, e `BarraDeListagem` devolve
/// `SizedBox.shrink()` com os tres ausentes. Po-lo nesta lista faria o caso
/// cobrar 64 dp de uma secao que nunca vai paga-los.
const Set<String> secoesComGatilhoDeFiltro = <String>{
  'Pets',
  'Rede',
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

/// MONTA a gaveta da secao [rotaDaSecao] **direto**, num `Scaffold` com o tema
/// do app, e a abre.
///
/// ## Por que ela deixou de ser aberta pela BARRA (19/10/2026)
///
/// `abrirAGaveta` tocava no gatilho da barra de topo, que era *"a unica forma
/// que ela tem de abrir"*. **O cliente mandou OCULTAR o menu** (*"vamos
/// ocultar o menu por enquanto, pois nao esta sendo utilizado para nada.
/// colocar o icone do usuario no lugar do menu"*), e com ele saiu o `drawer:`
/// da casca e o gatilho da barra: nao ha mais caminho de interface ate a
/// gaveta. A ausencia desse caminho e medida em
/// `casca_de_cinco_secoes_test.dart`, na isca que foi virada pela quarta vez.
///
/// **A GAVETA FOI OCULTADA E NAO APAGADA**, e a palavra do cliente e *"por
/// enquanto"*: `GavetaDeSecoes`, `BotaoDaGaveta`, `ControleDaGaveta` e o
/// inventario de 27.5 continuam no repositorio, intactos. Reinstalar e
/// devolver o `drawer:` a casca e o `leading` a `TelaDeAba`.
///
/// **Os casos deste arquivo que mediam o CONTEUDO dela continuam valendo, e
/// por isso eles mudaram de bancada e nao foram apagados.** O que eles provam
/// -- que a gaveta so mostra o submenu da secao, que nenhum item nasce sem
/// glifo, que item nao construido nao e tocavel, que ela e modal -- e
/// propriedade do WIDGET, nao da porta que o abria. Apaga-los deixaria a
/// reinstalacao sem portao nenhum: o dia em que o `drawer:` voltar, ela volta
/// com todos os defeitos que estes casos fecharam.
///
/// Esta bancada monta o widget diretamente, que e o que sobrou de honesto:
/// medir o conteudo pela porta exigiria repor a porta.
Future<void> abrirAGavetaDaSecao(
  WidgetTester tester,
  String rotaDaSecao,
) async {
  final chave = GlobalKey<ScaffoldState>();
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        key: chave,
        drawer: GavetaDeSecoes(rotaDaSecao: rotaDaSecao),
        // A barra de baixo entra porque a isca de MODALIDADE mede que a
        // cortina da gaveta tira os destinos dela da arvore de semantica, e
        // isso so e observavel com uma barra irma da gaveta no mesmo
        // `Scaffold` -- que e exatamente o arranjo que a casca tinha.
        bottomNavigationBar: NavigationBar(
          destinations: <Widget>[
            for (final destino in secoesDaBarra)
              NavigationDestination(
                // `IconeDaBarra` e nao `Icon`: desde 23/10/2026 destino da
                // barra declara desenho do cliente e `icone` e nulo, e
                // `Icon(null)` compila e pinta NADA -- o andaime desta isca
                // continuaria de pe com cinco slots vazios, que e o jeito de
                // uma medicao de modalidade medir a arvore errada sem acusar.
                icon: IconeDaBarra(destino.desenho!),
                label: destino.rotulo,
              ),
          ],
        ),
        body: const SizedBox.expand(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  chave.currentState!.openDrawer();
  await tester.pumpAndSettle();
  expect(
    find.byType(Drawer),
    findsOneWidget,
    reason: 'REPROVA: a gaveta nao montou. Sem ela nao ha conteudo a medir, e '
        'um verde aqui nao significaria nada.',
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
  group('1. o gesto de voltar, e a gaveta que saiu dele', () {
    testWidgets(
        'ISCA — nenhuma tela declara gaveta, e por isso nao ha arrasto de '
        'borda a desligar',
        (tester) async {
      // ======================================================================
      // ESTE CASO FOI VIRADO, e e a QUARTA vez (19/10/2026)
      // ======================================================================
      //
      // Ele cobrava `drawerEnableOpenDragGesture: false` -- o padrao do
      // Flutter e `true`, e com ele a borda esquerda passaria a abrir a
      // gaveta, brigando com o voltar por gesto (que no iOS e a borda
      // esquerda e no Android sai das DUAS bordas).
      //
      // **O cliente mandou ocultar o menu**, e o `drawer:` saiu da casca. Com
      // ele, `drawerEnableOpenDragGesture` deixou de ter objeto: `Scaffold`
      // sem `drawer` nao responde a arrasto de borda nenhum.
      //
      // **A PROPRIEDADE QUE O CASO PROTEGE E A MESMA**, e por isso ele nao foi
      // apagado: o gesto do sistema continua sendo o unico dono das bordas da
      // tela. O que mudou e que agora isso e garantido por CONSTRUCAO (nao ha
      // gaveta) em vez de por uma linha que alguem precisa lembrar de manter.
      //
      // DESLIGAMENTO: devolva `drawer: GavetaDeSecoes(...)` ao `Scaffold` da
      // casca em `casca_com_abas.dart`. Este caso reprova na hora.
      await abrirOApp(tester, rede: _semServidor);
      await irParaASecao(tester, 'Pets');

      final comGaveta = tester
          .widgetList<Scaffold>(find.byType(Scaffold))
          .where((s) => s.drawer != null)
          .toList();
      expect(
        comGaveta,
        isEmpty,
        reason: 'REPROVA: ha ${comGaveta.length} `Scaffold` com `drawer:` na '
            'arvore. Com gaveta de volta, a borda esquerda volta a brigar com '
            'o voltar por gesto -- e o `drawerEnableOpenDragGesture: false` '
            'que resolvia isso saiu junto com ela.',
      );
    });

    testWidgets('o voltar do sistema continua saindo da tela empilhada', (
      tester,
    ) async {
      // O que este caso sempre provou: o voltar do sistema devolve a casca
      // quando ha tela empilhada sobre ela. **O VEICULO MUDOU DUAS VEZES** --
      // era um item da gaveta, virou a opcao da folha da acao flutuante de
      // `Pets`, e em 20/10 o cliente mandou o alvo da folha sair (*"na pagina
      // pet, remova o icone dos ..., so deixe o de escanear a tag"*). A casa
      // nova de `Registrar achado avulso` e o menu da conta, no grupo `Bichos
      // na rua`. **O que o caso prova nao mudou uma letra.**
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());
      await irParaASecao(tester, 'Pets');

      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();
      final item = find.text('Registrar achado avulso');
      await tester.scrollUntilVisible(item, 200);
      await tester.tap(item);
      await tester.pumpAndSettle();
      expect(
        find.byType(TelaRegistrarAchado),
        findsOneWidget,
        reason: 'REPROVA: o item do menu da conta nao abriu a tela empilhada. '
            'Sem ela nao ha de onde voltar, e o caso mediria o nada.',
      );

      final voltou = await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(
        voltou,
        isTrue,
        reason: 'REPROVA: o voltar do sistema nao foi tratado pelo app.',
      );
      expect(
        find.byType(TelaRegistrarAchado),
        findsNothing,
        reason: 'REPROVA: o voltar do sistema nao saiu da tela empilhada.',
      );
      // **DESDE 20/10 A BARRA JA ESTAVA LA ANTES DO POP**, e por isso esta
      // linha deixou de provar que o pop devolveu a casca -- ela prova que o
      // pop nao levou a barra embora. A tela da conta e o destino: ela e ramo
      // da casca, e `irParaASecao` + a foto deixam o `IndexedStack` nela.
      expect(
        find.byType(NavigationBar),
        findsOneWidget,
        reason: 'REPROVA: depois do voltar nao ha UMA barra de baixo na '
            'arvore. Com a casca fixa de 20/10, a tela empilhada tambem tem '
            'barra: duas na arvore ao mesmo tempo significa que a tela de '
            'cima nao saiu, e nenhuma significa que o pop levou a casca.',
      );
    });
  });

  group('2. onde a FOTO ficou, e o que saiu do lugar', () {
    // ========================================================================
    // O ARRANJO DA BARRA DE TOPO MUDOU EM 19/10/2026, e a decisao e dele
    // ========================================================================
    //
    // Literal: *"vamos ocultar o menu por enquanto, pois nao esta sendo
    // utilizado para nada. colocar o icone do usuario no lugar do menu, do
    // lado esquerdo da pagina e o icone de notificacao vai ficar na barra
    // principal do lado direito de todas as paginas"*.
    //
    //   antes:  hamburguer 64 | titulo | sino 48 + foto 48
    //   agora:  foto 48       | titulo | sino 48
    //
    // **Isto REVERTE o pedido dele de 17/10** (*"padronize todas as telas,
    // tornando o menu esquerdo fixo"*), que foi o que instalou o hamburguer em
    // toda raiz de secao. Reversao DELE, do dia seguinte.
    testWidgets('a FOTO esta no slot da ESQUERDA (`leading`)', (tester) async {
      // **O SLOT, e nao a presenca.** Um caso que so procurasse a foto na
      // arvore ficaria verde com ela de volta em `actions` -- e ali ela custa
      // 48 dp de titulo em vez de zero.
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());
      for (final destino in secoesDaBarra) {
        await irParaASecao(tester, destino.rotulo);
        final barra = tester.widget<AppBar>(find.byType(AppBar));
        expect(
          barra.leading,
          isA<AvatarDaConta>(),
          reason: 'REPROVA: o slot da ESQUERDA de "${destino.rotulo}" nao e a '
              'foto da conta. Literal dele (19/10): "colocar o icone do '
              'usuario no lugar do menu, do lado esquerdo da pagina".',
        );
        // **A RESERVA DO SLOT E 56 DESDE 20/10/2026, e o ALVO continua 48.**
        //
        // O cliente pediu a margem (*"o icone do perfil do usuario ficou muito
        // perto do titulo da barra, de uma margem do nome"*) e ela nao tinha
        // de onde sair: o circulo terminava em 48, o alvo terminava em 48 e
        // `titleSpacing: 0` fazia o titulo comecar em 48 -- vao de 0,00 dp. O
        // slot passou a 56 e o alvo ficou em 48, com os 8 dp de respiro a
        // direita dele. Ver `AvatarDaConta.larguraNoLeading`, e o grupo 10,
        // que mede as duas medidas separadamente.
        expect(
          barra.leadingWidth,
          AvatarDaConta.larguraNoLeading,
          reason: 'REPROVA: a reserva do `leading` de "${destino.rotulo}" e '
              '${barra.leadingWidth} dp e nao '
              '${AvatarDaConta.larguraNoLeading}. O hamburguer tinha piso de '
              '64 dp (11.23.1, controle de canto de barra), a foto tem 48 '
              '(SC 2.5.8, com a excecao explicada no cabecalho dela) e desde '
              '20/10 ela carrega 8 dp de respiro ate o titulo. Os numeros '
              'estao na conta do grupo 3.',
        );
      }
    });

    testWidgets(
        'o lado direito e O SINO, e SO ele: a foto saiu e `criar` nao voltou',
        (tester) async {
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());
      for (final destino in secoesDaBarra) {
        await irParaASecao(tester, destino.rotulo);
        final acoes = tester.widget<AppBar>(find.byType(AppBar)).actions;
        expect(
          acoes,
          isNotNull,
          reason: 'REPROVA: "${destino.rotulo}" ficou sem `actions`. O sino e '
              'montado em toda tela de secao -- quem decide se ele PINTA e '
              'ele proprio, pela sessao.',
        );
        expect(
          acoes!.map((w) => w.runtimeType).toList(),
          <Type>[SinoDeNotificacoes],
          reason: 'REPROVA: o lado direito de "${destino.rotulo}" nao e '
              'exatamente um `SinoDeNotificacoes`. A foto saiu para o '
              '`leading` em 19/10 e `criar` saiu da barra no mesmo dia (a '
              'porta e o `floatingActionButton`). Cada controle que volta '
              'para ca custa 48 ou 64 dp do titulo, e o orcamento esta '
              'travado em numero no grupo 3.',
        );
      }
    });

    testWidgets('o alvo da FOTO e 48 x 48 dp, o piso do SC 2.5.8', (
      tester,
    ) async {
      // **48 e nao 64, e a excecao e DELIBERADA.** O 11.23.1 pede 64 x 64 em
      // controle de canto de barra, e o hamburguer os cumpria. A foto entrou
      // com 48, que e o piso do M3 e do SC 2.5.8, por decisao do briefing que
      // a trouxe -- e e essa diferenca que devolveu 16,00 dp ao titulo.
      //
      // O caso trava os 48: abaixo disso ela fura o SC 2.5.8; acima, o
      // orcamento do titulo encolhe e a conta do grupo 3 desaba.
      //
      // **A MEDIDA DESCEU DO WIDGET PARA O CONTROLE EM 20/10/2026**, e nao e
      // afrouxamento: com o respiro do titulo (`AvatarDaConta.
      // respiroDoTitulo`), o widget passou a ser o `Align` que ocupa o SLOT de
      // 56 dp, e o alvo continua sendo o `IconButton` de 48 dentro dele.
      // `find.byType(AvatarDaConta)` passaria a medir o slot -- e diria 56
      // para um alvo que nao mudou. `AvatarDaConta.chaveDoAlvo` esta no
      // proprio `IconButton`, que e o que recebe o toque.
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());
      await irParaASecao(tester, 'Pets');

      final alvo = tester.getSize(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byKey(AvatarDaConta.chaveDoAlvo),
        ),
      );
      expect(
        alvo.width,
        closeTo(AvatarDaConta.alvo, 0.01),
        reason: 'REPROVA: o alvo da foto mede ${alvo.width} dp de largura, e '
            'nao ${AvatarDaConta.alvo}.',
      );
      expect(
        alvo.height,
        greaterThanOrEqualTo(BichuAlvoDeToque.min),
        reason: 'REPROVA: o alvo da foto mede ${alvo.height} dp de altura, '
            'abaixo do piso de ${BichuAlvoDeToque.min} dp do SC 2.5.8.',
      );
    });

    testWidgets('SAIDA e FOTO nunca aparecem na mesma barra', (
      tester,
    ) async {
      // **O SUJEITO MUDOU DE DONO EM 19/10/2026, e a propriedade e a mesma.**
      //
      // O caso provava que `Saida + titulo + hamburguer` nao existe. O cliente
      // mandou ocultar o menu e por a FOTO no slot do hamburguer, entao a
      // composicao proibida passou a ser `Saida + titulo + foto` -- mesmo
      // slot, mesmo risco, mesmo mecanismo: `raizDeSecao` e a unica condicao
      // que monta o `leading`, e raiz de secao nao tem saida.
      //
      // =====================================================================
      // **A RAZAO MUDOU EM 20/10/2026, E A PROPRIEDADE FICOU. LEIA ISTO.**
      // =====================================================================
      //
      // A razao escrita aqui era: *"perder a gaveta numa tela empilhada
      // custava um atalho; perder a SAIDA custa a tela -- ela vira um beco, e
      // a pessoa so sai pelo gesto do sistema"*. **Essa frase deixou de ser
      // verdade no dia em que o cliente mandou fixar a barra de baixo**
      // (*"quando o usuario vai para a mensagem, o menu inferior some,
      // mantenha ele fixo em todas as paginas"*): a tela empilhada passou a
      // ter DUAS saidas -- o slot da esquerda e a barra --, e o slot deixou de
      // ser a ultima linha de defesa contra o beco.
      //
      // **E O CASO NAO FOI APAGADO, porque a propriedade nao era so sobre o
      // beco.** Ela e sobre o slot da esquerda dizer UMA coisa: naquele lugar,
      // ou ha a saida da tela, ou ha a porta da conta, e nunca as duas. Com as
      // duas, o `AppBar` monta so o que lhe dao -- a FOTO apaga a seta
      // automatica -- e a tela empilhada perde a seta **sem perder a
      // aparencia de ter uma**: o slot continua ocupado por um controle
      // redondo de 48 dp, no mesmo lugar, que leva para OUTRO lado. Quem
      // conhece o app por habito toca ali para voltar e vai para a conta.
      // Isso continua sendo defeito com a barra de baixo no lugar, e e por
      // isso que a regra fica.
      //
      // **A segunda metade da prova mudou de casa:** que ninguem fica sem
      // saida agora e medido TELA POR TELA no grupo `(g) ninguem ficou sem
      // saida` de `barra_fixa_em_toda_tela_test.dart`, que percorre as 29
      // telas empilhadas e trava QUAIS delas dependem so da barra.
      //
      // DESLIGAMENTO: em `casca_com_abas.dart`, tire a condicao `raizDeSecao`
      // do `leading` de `TelaDeAba`. A foto nasce na tela empilhada, a seta
      // automatica desaparece debaixo dela, e a segunda metade deste caso
      // reprova.
      await abrirOApp(tester, rede: _semServidor, deposito: depositoLogado());
      await irParaASecao(tester, 'Pets');

      // Na raiz: foto, sem saida.
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byType(AvatarDaConta),
        ),
        findsOneWidget,
        reason: 'REPROVA: a raiz de secao nao tem a foto no `leading`.',
      );
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byTooltip('Voltar'),
        ),
        findsNothing,
        reason: 'REPROVA: a raiz de secao ganhou saida ALEM da foto.',
      );

      // Numa tela empilhada que usa a MESMA `TelaDeAba`: saida, sem foto.
      //
      // **O VEICULO CONTINUA SENDO `Registrar achado avulso`, e O CAMINHO ATE
      // ELA MUDOU EM 20/10.** Ela era alcancada pelo alvo SECUNDARIO da acao
      // flutuante de `Pets`, e o cliente mandou o alvo sair (*"na pagina pet,
      // remova o icone dos ..., so deixe o de escanear a tag"*). A casa nova
      // dela e o menu da conta, no grupo `Bichos na rua`, e o caminho passa
      // pela FOTO -- que e tambem o controle cuja ausencia a segunda metade
      // deste caso cobra. O caminho exercita a propriedade nos dois sentidos:
      // a foto EXISTE na raiz, e NAO existe na tela que ela abre duas telas
      // adiante.
      //
      // A tela tem de usar a mesma `TelaDeAba` das raizes, e
      // `TelaRegistrarAchado` continua sendo exatamente isso.
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();
      final porta = find.text('Registrar achado avulso');
      await tester.scrollUntilVisible(porta, 200);
      await tester.tap(porta);
      await tester.pumpAndSettle();

      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byTooltip('Voltar'),
        ),
        findsOneWidget,
        reason:
            'REPROVA: a tela empilhada perdeu a saida. Ela usa a mesma '
            '`TelaDeAba` das raizes, e por a foto no `leading` sem a condicao '
            'de raiz apagaria a seta automatica do `AppBar`.',
      );
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byType(AvatarDaConta),
        ),
        findsNothing,
        reason:
            'REPROVA: a tela empilhada ganhou a foto por cima da saida. A '
            'composicao `Saida + titulo + foto` poe no slot da esquerda um '
            'controle que PARECE a saida e leva para a conta, e a seta '
            'automatica desaparece debaixo dela. A barra de baixo fixa, de '
            '20/10, tirou o risco do BECO e nao tirou este.',
      );
    });
  });

  group('3. os CINCO titulos CABEM, e o orcamento foi a 216,00 dp', () {
    for (final destino in secoesDaBarra) {
      testWidgets(
        'o titulo "${destino.rotulo}" em 320 dp a 200%: CABE, com folga medida',
        (tester) async {
          tester.view.physicalSize = const Size(960, 2000);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);

          // **LOGADO, e nao deslogado.** Deslogado a barra esconde o sino, e o
          // titulo tem folga de sobra: o portao mediria o arranjo MAIS VAZIO e
          // aprovaria o errado. O pior caso e o de quem tem conta.
          //
          // **UMA chamada de `abrirOApp` so.** Havia uma segunda, sem
          // deposito, que lia como "e agora deslogado" e nao era: `pumpWidget`
          // com o mesmo tipo de widget reaproveita o `State`, e o arranjo
          // medido continuava sendo o de quem tem conta. Ficava verde pelo
          // motivo errado.
          //
          // A ARVORE DE SEMANTICA E PARTE DA MEDIDA: o caso cobra que o nome
          // ANUNCIADO nao seja abreviado junto com o pintado, e sem
          // `ensureSemantics` a arvore nasce vazia e a conferencia aprovaria
          // qualquer coisa.
          final semantica = tester.ensureSemantics();
          await abrirOApp(
            tester,
            rede: _semServidor,
            deposito: depositoLogado(),
            escala: 2,
          );
          await irParaASecao(tester, destino.rotulo);

          final titulo = find.descendant(
            of: find.byType(AppBar),
            matching: find.text(destino.rotulo),
          );
          expect(
            titulo,
            findsOneWidget,
            reason: 'REPROVA: a barra de topo de "${destino.rotulo}" nao '
                'pinta o titulo. Sem ele nao ha o que medir.',
          );
          // **O `RichText` POR DENTRO, e nao o no que `find.text` acha.** O
          // titulo declara `semanticsLabel`, e com ele o `Text` embrulha o
          // `RichText` num `Semantics` -- `renderObject` sobre o `find.text`
          // devolve `RenderSemanticsAnnotations` e estoura em cast.
          final paragrafo = tester.renderObject<RenderParagraph>(
            find.descendant(of: titulo, matching: find.byType(RichText)),
          );

          // ==================================================================
          // O ORCAMENTO: 216,00 dp desde 20/10, e NENHUM TITULO CORTA
          // ==================================================================
          //
          // Medido no app de verdade, LOGADO, em 320 dp a 200% de escala:
          //
          //   titulo comeca em:        56,00 dp (a foto de 48 mais o respiro
          //                            de 8, com `titleSpacing: 0`)
          //   reserva do lado direito: 48,00 dp (so o sino)
          //   ORCAMENTO DO TITULO:    216,00 dp
          //
          //   `Pets`, `Rede`, `Loja`: 138,32 dp -> cabem (77,68 de folga)
          //   `Mural`:                172,90 dp -> CABE (43,10 de folga)
          //
          // **OS 8,00 dp QUE FALTAM PARA OS 224,00 SAO A MARGEM DO PEDIDO 1
          // (20/10/2026)**, e ela nao tinha de onde sair senao daqui. Literal
          // do cliente: *"o icone do perfil do usuario ficou muito perto do
          // titulo da barra, de uma margem do nome"*. O circulo de 32 dp
          // terminava em 48, o alvo terminava em 48 e `titleSpacing: 0` fazia
          // o titulo comecar em 48: o vao era **0,00 dp**, e nao havia folga
          // nenhuma dentro do alvo para ceder. Ver `AvatarDaConta.
          // respiroDoTitulo`, que carrega a conta e a opcao recusada.
          //
          // **A EXCECAO DE CORTE DE CINCO LETRAS ACABOU, e isto e o achado.**
          // Ela era de `Perto` (172,90 pedidos contra 160,00 de orcamento,
          // deficit de 12,90 dp), e durava porque nao havia de onde tirar os
          // 12,90: o hamburguer tinha piso de 64, o sino e a foto piso de 48,
          // `titleSpacing` ja estava em zero. **O cliente resolveu por outro
          // caminho, em dois movimentos do mesmo dia:** `Perto` deixou de ser
          // secao, e a foto saiu de `actions` para o `leading`.
          //
          //   hamburguer 64 -> foto 48 no `leading`:  +16,00 dp
          //   foto 48 sai de `actions`:               +48,00 dp
          //   ---------------------------------------------------
          //   160,00 -> 224,00 dp
          //
          // `Mural` e o novo rotulo de CINCO letras e pede os mesmos 172,90 dp
          // que `Perto` pedia. Com 224,00 ele cabe inteiro.
          //
          // DESLIGAMENTO: devolva `AvatarDaConta` ao `actions` de `TelaDeAba`
          // (o orcamento cai para 168,00 e `Mural` ainda cabe), ou devolva
          // tambem `widget.acaoDeCriar` ao `actions` (cai para 104,00 e os
          // CINCO cortam). A asercao de 216,00 abaixo reprova nos dois.
          expect(
            paragrafo.constraints.maxWidth,
            216.0,
            reason: 'REPROVA: o titulo de "${destino.rotulo}" recebeu '
                '${paragrafo.constraints.maxWidth.toStringAsFixed(2)} dp de '
                'orcamento em 320 dp a 200%, e o arranjo de 20/10 mede '
                '216,00 -- foto 48 + respiro 8 a esquerda, sino 48 a direita, '
                '`titleSpacing: 0`. Menos que isso significa que um controle '
                'voltou para a barra; mais, que um saiu dela, ou que a margem '
                'do pedido 1 desapareceu. Os tres mudam quais titulos cabem.',
          );

          final pedida = paragrafo.getMaxIntrinsicWidth(double.infinity);
          expect(
            pedida,
            lessThanOrEqualTo(paragrafo.constraints.maxWidth),
            reason: 'REPROVA: "${destino.rotulo}" pede '
                '${pedida.toStringAsFixed(2)} dp num orcamento de '
                '${paragrafo.constraints.maxWidth.toStringAsFixed(2)} dp, em '
                '320 dp a 200% de escala. **Nenhum dos cinco titulos corta '
                'desde 19/10**, e um que passe a cortar e decisao de produto '
                '-- rotulo mais curto, ou um controle fora da barra --, e nao '
                'uma reticencia a aceitar em silencio.',
          );

          // E A MEDIDA DE CADA RotuLO, travada em numero: rotulo que cresce
          // muda a conta, e o caso diz em quanto.
          expect(
            pedida,
            closeTo(destino.rotulo.length == 5 ? 172.90 : 138.32, 0.5),
            reason: 'REPROVA: "${destino.rotulo}" pede '
                '${pedida.toStringAsFixed(2)} dp a 200% de escala, e a '
                'bancada mediu '
                '${destino.rotulo.length == 5 ? "172,90" : "138,32"} dp. Ou o '
                'tema mudou de tipografia, ou o rotulo mudou de palavra.',
          );

          // **O PINTADO PODE ABREVIAR; O ANUNCIADO NAO.** Hoje nada abrevia,
          // e esta linha e o que mantem a separacao viva para o dia em que
          // algo abrevie.
          //
          // `tester.getSemantics` do PROPRIO no do titulo, e nao uma varredura
          // da arvore inteira: a varredura antiga passava por
          // `tester.binding.pipelineOwner`, que esta deprecado, e ela tambem
          // aprovava o rotulo achado em QUALQUER lugar da tela -- a barra de
          // baixo tem um `Semantics` com a mesma palavra.
          final anunciado = tester.getSemantics(titulo);
          expect(
            anunciado.label,
            destino.rotulo,
            reason: 'REPROVA: o nome ANUNCIADO do titulo de '
                '"${destino.rotulo}" e "${anunciado.label}", e nao o rotulo '
                'inteiro. Abreviar o pintado nao pode abreviar o anunciado: '
                'quem usa leitor de tela tem de continuar ouvindo a palavra '
                'completa. `semanticsLabel: titulo` em `casca_com_abas.dart` '
                'e o que separa as duas coisas.',
          );
          semantica.dispose();
        },
      );
    }

    testWidgets(
        'ISCA: a barra tem OS MESMOS controles a 100% e a 200% de escala',
        (tester) async {
      // A escala NAO pode mudar quais controles existem. Se a 200% um deles
      // sumisse, o titulo caberia por um motivo que nao e o arranjo -- e o
      // portao acima ficaria verde medindo uma barra que o aparelho nao tem.
      tester.view.physicalSize = const Size(960, 2000);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      final contagens = <double, List<Type>>{};
      for (final escala in <double>[1, 2]) {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        await abrirOApp(
          tester,
          rede: _semServidor,
          deposito: depositoLogado(),
          escala: escala,
        );
        await irParaASecao(tester, 'Pets');
        final barra = tester.widget<AppBar>(find.byType(AppBar));
        contagens[escala] = <Type>[
          barra.leading!.runtimeType,
          ...barra.actions!.map((w) => w.runtimeType),
        ];
      }
      expect(
        contagens[2],
        contagens[1],
        reason: 'REPROVA: a barra de topo de `Pets` tem controles DIFERENTES a '
            '100% e a 200% de escala: ${contagens[1]} contra ${contagens[2]}. '
            'O orcamento do titulo medido a 200% passaria a ser de uma barra '
            'que ninguem ve a 100%.',
      );
    });

    test('GUARDA: as secoes com gatilho de filtro existem no registro', () {
      // Linha orfa nesta lista mantem o orcamento errado sobre uma secao que
      // mudou de nome ou saiu.
      //
      // **`Perto` SAIU da lista em 19/10** (deixou de ser secao) e `Mural`
      // ENTROU -- e `Mural` entrou SEM gatilho de filtro, de proposito: a
      // secao nao tem recorte nenhum porque nao ha operacao de linha do
      // tempo, e `BarraDeListagem` devolve `SizedBox.shrink()` quando nao ha
      // busca, ordem nem filtro.
      final rotulosDaBarra = secoesDaBarra.map((d) => d.rotulo).toSet();
      final orfas = secoesComGatilhoDeFiltro.difference(rotulosDaBarra);
      expect(
        orfas,
        isEmpty,
        reason: 'REPROVA: $orfas estao em `secoesComGatilhoDeFiltro` e nao '
            'estao na barra. Linha orfa mantem a conta de uma secao que o '
            'produto nao tem mais.',
      );
    });
  });

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
      await abrirAGavetaDaSecao(tester, Rotas.pets);

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

    test('o inventario de 27.5 tem 54 linhas, 18 destinos e 8 atalhos vivos', () {
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
      // SEIS continua sendo SEIS em 19/10, e nao por coincidencia: `Perto`
      // saiu do mapa (deixou de ser secao) e `Mural` entrou nele. Uma troca,
      // nao um acrescimo.
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
      // 50 -> 51 em 19/10, na fatia G: `Pedidos de conexao` em `Perfil`. **E
      // linha NOVA e nao mudanca de estado**, e a diferenca importa aqui: a UX
      // 27.5.5 fechou em 21/09 e a conexao entre pessoas e decisao de
      // 18/10/2026, entao nao havia linha para subir. Ela nasce `existe`
      // porque a tela e a rota existem desde 18/10 e estavam SEM PORTA.
      // 51 -> 52 em 19/10: `Pessoas bloqueadas` em `Perfil`, pela mesma razao
      // -- linha NOVA, sem linha na UX, e decisao do cliente de 19/10/2026.
      // Ela nasce `existe` porque a tela e a rota entram no MESMO commit.
      // 52 -> 53 em 19/10, com a reestruturacao da barra: `Mural` entrou com
      // UMA linha (`Publicações das conexões`, `conteudoDaSecao`,
      // `planejada`). **A contencao e deliberada:** o conteudo do Mural e de
      // outra frente, e escrever aqui as linhas que eu IMAGINO que ele vai ter
      // seria decidir no codigo o desenho de telas que outra pessoa esta
      // desenhando.
      //
      // **A saida de `Perto` NAO mudou a contagem**, e vale dizer por que: a
      // secao deixou de existir e as OITO linhas dela nao foram apagadas --
      // elas mudaram de chave para `Rotas.rede`, que absorveu o conteudo. A
      // 27.5 e um INVENTARIO, e apagar linha porque a secao mudou de nome faz
      // o documento mentir sobre o que o produto tem.
      // 53 -> 54 em 22/10/2026: `Conexoes` em `Perfil`, por DECISAO DO CLIENTE
      // -- *"o usuario pode abrir a lista de usuarios que e sua conexao"*.
      // **Linha NOVA e nao mudanca de estado**, e pela mesma razao das duas de
      // 19/10: a UX 27.5.5 fechou em 21/09, e a lista das proprias conexoes era
      // PROIBIDA por escrito ate 22/10 -- nao havia linha para subir, porque a
      // decisao anterior dizia "nunca, nem ao dono". Ela nasce `existe` porque
      // `TelaDeMinhasConexoes` e `/conexoes` entram no MESMO commit da linha.
      expect(
        todos.length,
        54,
        reason:
            'REPROVA: o inventario de 27.5 saiu de 54 linhas e foi para '
            '${todos.length}. Se a UX acrescentou sub-destino, este numero '
            'sobe junto e de proposito; se alguem apagou linha, este caso e '
            'o unico lugar que acusa.',
      );

      final destinos = todos
          .where((d) => d.forma == FormaDoSubDestino.destino)
          .toList(growable: false);
      // 15 -> 16 em 19/10: `Pedidos de conexao`, que e `destino` porque a tela
      // tem `Scaffold`, barra de saida e endereco proprio.
      // 16 -> 17 em 19/10: `Pessoas bloqueadas`, `destino` pelo mesmo motivo.
      // 17 -> 18 em 22/10/2026: `Conexoes`, `destino` pelo mesmo motivo das
      // outras -- a tela tem `Scaffold`, barra de saida e endereco proprio. Ela
      // NAO e um bloco da aba, e nao e um terceiro segmento da tela de pedidos:
      // as duas razoes estao no cabecalho de `TelaDeMinhasConexoes`.
      expect(
        destinos.length,
        18,
        reason:
            'REPROVA: os destinos de MENU sairam de 18 e foram para '
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
      // CINCO -> SEIS em 19/10: `Pedidos de conexao` entrou `existe` COM rota,
      // e e a subida que a mensagem abaixo chama de caminho normal -- a tela do
      // outro lado existe e esta registrada no roteador, o que o caso `toda
      // rota de item vivo esta REGISTRADA no roteador` confere.
      // SEIS -> SETE em 19/10: `Pessoas bloqueadas` entrou `existe` COM rota,
      // pela mesma razao -- `TelaDeBloqueados` e `/perfil/bloqueados` entram no
      // mesmo commit da linha, e o caso de registro no roteador confere.
      // SETE -> OITO em 22/10/2026: `Conexoes` entrou `existe` COM rota, e e a
      // subida que a mensagem abaixo chama de caminho normal -- a tela do outro
      // lado existe e esta registrada no roteador, o que o caso `toda rota de
      // item vivo esta REGISTRADA no roteador` confere.
      expect(
        vivos.length,
        8,
        reason:
            'REPROVA: os atalhos VIVOS sairam de 8 e foram para '
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

    // Um caso POR ITEM, e nao um laco dentro de um caso so: a suite diz QUAL
    // atalho quebrou.
    for (final vivo in itensVivos()) {
      testWidgets(
        'o atalho "${vivo.item.rotulo}" de "${vivo.secao}" nasce TOCAVEL na '
        'gaveta, e a rota dele e a do registro',
        (tester) async {
          // ==================================================================
          // O QUE ESTE CASO MEDIA, E O QUE ELE MEDE AGORA (19/10/2026)
          // ==================================================================
          //
          // Ele navegava: abria a gaveta pela barra, tocava no atalho e cobrava
          // que o roteador parasse na rota do registro. **A gaveta foi
          // OCULTADA** e nao ha mais caminho de interface ate ela, entao a
          // navegacao por ela deixou de ser exercitavel -- e insistir nela
          // exigiria repor a porta que o cliente mandou esconder.
          //
          // **A METADE QUE SOBROU AQUI e a do WIDGET**, e ela e a que a
          // reinstalacao vai precisar: o item nasce com `onTap` preenchido (e
          // nao morto) e a chave dele carrega a rota que o registro declara.
          // Com o `drawer:` de volta, um item mudo ou apontado para outra rota
          // reprova neste caso antes de chegar ao aparelho.
          //
          // **A METADE QUE FALTA -- que o item continua ALCANCAVEL por um
          // caminho humano -- mudou de arquivo e nao desapareceu.** Ela e o
          // grupo `os sete itens vivos continuam alcançáveis` de
          // `gaveta_oculta_e_barra_nova_test.dart`, que mede um caso por item,
          // com o caminho nomeado: acao flutuante de `Pets` para tres deles, e
          // a foto da barra de topo -> `Perfil` para os outros quatro. **E foi
          // ela que achou que DOIS itens -- `Pedidos de conexao` e `Pessoas
          // bloqueadas` -- tinham a gaveta como UNICA porta em `lib/`.**
          await abrirAGavetaDaSecao(tester, vivo.secao);

          final alvo = find.byKey(
            ItemDaGaveta.chaveDe(vivo.secao, vivo.item.rotulo),
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
            reason: 'REPROVA: o atalho "${vivo.item.rotulo}" nao esta na '
                'gaveta de "${vivo.secao}".',
          );

          // **`onTap` PREENCHIDO, lido do widget.** Item que se anuncia
          // tocavel e nao faz nada e acao sem destino (criterio 2 da
          // BICHUS-62), e e o defeito que a gaveta oculta esconderia melhor do
          // que antes: ninguem o veria.
          // A chave esta NO `ListTile` e nao num embrulho (ver
          // `ItemDaGaveta.build`), entao o widget sai do proprio `alvo`.
          // `find.descendant` nao casa a raiz por padrao, e procurar o
          // `ListTile` por dentro devolvia `Bad state: No element`.
          final linha = tester.widget<ListTile>(alvo);
          expect(
            linha.onTap,
            isNotNull,
            reason: 'REPROVA: o atalho "${vivo.item.rotulo}" de '
                '"${vivo.secao}" nasceu com `onTap` nulo. Ele se anuncia '
                'tocavel e nao leva a lugar nenhum.',
          );

          // E A ROTA E A DO REGISTRO, pela chave: a chave e composta de
          // `(secao, rotulo)` e o registro e quem diz a rota, entao um item
          // apontado para outro endereco divergiria aqui.
          expect(
            vivo.item.rota,
            isNotNull,
            reason: 'REPROVA: "${vivo.item.rotulo}" e item VIVO e nao declara '
                'rota. `viraItem` exige rota, e um item vivo sem endereco nao '
                'deveria ser possivel.',
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
      await abrirAGavetaDaSecao(tester, Rotas.pets);

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
      await abrirAGavetaDaSecao(tester, Rotas.pets);

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
      await abrirAGavetaDaSecao(tester, Rotas.pets);

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
      await abrirAGavetaDaSecao(tester, Rotas.pets);
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
      final conferidas = <String>[];
      for (final destino in secoesDaBarra) {
        // **Nao ha mais secao sem gatilho desde 19/10**: a gaveta e fixa, e
        // desde que ela foi OCULTADA no mesmo dia nao ha gatilho nenhum -- a
        // bancada monta a gaveta da secao direto. O `continue` que existia
        // aqui pulava `Rede` e `Loja`, e com ele a isca deixaria de conferir
        // justamente as duas secoes cuja gaveta passou a ser so o grupo
        // global.
        await abrirAGavetaDaSecao(tester, destino.rota);
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
        // **A LISTA MUDOU EM 19/10/2026 com a barra**: `Perto` deixou de
        // ser secao (o inventario dela foi absorvido pela `Rede`) e `Mural`
        // entrou. Ela continua escrita A MAO, que e o ponto: secao nova sem
        // linha aqui reprova antes de entrar.
        <String>['Pets', 'Rede', 'Mural', 'Loja'],
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
        await abrirAGavetaDaSecao(tester, destino.rota);

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
        await abrirAGavetaDaSecao(tester, destino.rota);
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

    testWidgets('isca D: nenhuma gaveta abre VAZIA, em secao nenhuma', (
      tester,
    ) async {
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
      // **A OBRIGACAO 1 SAIU EM 19/10, E ELA SAIU POR DECISAO DELE.**
      //
      // Ela era *"toda secao desenha o gatilho e monta a gaveta DELA"*, e
      // nasceu do pedido de 17/10 (*"padronize todas as telas, tornando o
      // menu esquerdo fixo"*). No dia seguinte ele mandou OCULTAR o menu
      // (*"vamos ocultar o menu por enquanto, pois nao esta sendo utilizado
      // para nada"*): nao ha gatilho em tela nenhuma, e a AUSENCIA dele e
      // medida em `casca_de_cinco_secoes_test.dart`.
      //
      // **A OBRIGACAO 2 FICA, e ela e a que importa guardar**: nenhuma gaveta
      // abre VAZIA. Ela e o que torna a reinstalacao defensavel -- no dia em
      // que o `drawer:` voltar, ele volta mostrando conteudo e nao uma
      // cortina que escurece a tela para nao oferecer nada. Era a objecao
      // original desta isca, e e a unica metade que sobrevive a gaveta
      // oculta.
      final semSubmenuProprio = <String>[];
      for (final destino in secoesDaBarra) {
        final proprios = RegistroDeSubDestinos.itensDe(destino.rota);
        if (proprios.isEmpty) semSubmenuProprio.add(destino.rotulo);

        await abrirAGavetaDaSecao(tester, destino.rota);
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
      }

      expect(
        semSubmenuProprio,
        // **A LISTA MUDOU DUAS VEZES, e as duas por decisao dele.**
        //
        // 19/10, manha: `Perto` entrou nela -- o unico sub-destino vivo dela
        // era `Pets de ONGs para adoção`, e ele virou `planejada` com a saida
        // das portas de adocao.
        //
        // 19/10, tarde: `Perto` deixou de ser secao e SAIU do mapa; `Mural`
        // entrou, e entrou JA nesta lista -- a unica linha dele e
        // `conteudoDaSecao` e `planejada`, porque o conteudo da secao e de
        // outra frente.
        //
        // Ficou **tres das quatro** secoes abrindo so com o grupo global, e e
        // exatamente o cenario que esta isca existe para vigiar: a gaveta fixa
        // (quando ela voltar) so e defensavel se o caso vazio tiver conteudo.
        <String>['Rede', 'Mural', 'Loja'],
        reason:
            'REPROVA: as secoes sem sub-destino PROPRIO sao '
            '${semSubmenuProprio.join(', ')} e nao `Rede, Mural, Loja`. Se a '
            'lista ficar vazia esta isca deixou de exercitar o cenario que o '
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
          await abrirAGavetaDaSecao(tester, destino.rota);

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
          await abrirAGavetaDaSecao(tester, destino.rota);

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
    // **`Perto` SAIU DA LISTA em 19/10**: ela deixou de ser secao, e o
    // inventario dela foi absorvido pela `Rede`. `Mural` entrou no lugar.
    for (final destino in secoesDaBarra) {
      testWidgets(
          '(a) a gaveta de "${destino.rotulo}" NAO oferece `Meus dados`', (
        tester,
      ) async {
        await abrirAGavetaDaSecao(tester, destino.rota);
        final vistos = await textosDaGavetaInteira(tester);
        expect(
          vistos,
          isNot(contains('Meus dados')),
          reason:
              'REPROVA: a gaveta de "${destino.rotulo}" oferece `Meus dados`. O '
              'cliente '
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
              'REPROVA: a gaveta de "${destino.rotulo}" perdeu `Escanear uma tag` '
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
      await abrirAGavetaDaSecao(tester, Rotas.perfil);
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
      // **O ITEM E TOCAVEL, e a rota dele e `/perfil/dados`.**
      //
      // A navegacao POR AQUI deixou de ser exercitavel em 19/10: a gaveta foi
      // ocultada e a bancada a monta direto, sem roteador. O que este caso
      // mede e o que a reinstalacao vai precisar -- item vivo, `onTap`
      // preenchido, rota certa no registro.
      //
      // **E `Meus dados` NAO ficou sem porta humana**, que e a metade que
      // importava: ele e o PRIMEIRO item do menu da conta de `AbaPerfil`,
      // alcancado pela foto da barra de topo, e isso e medido caso por caso em
      // `gaveta_oculta_e_barra_nova_test.dart`.
      expect(
        tester.widget<ListTile>(alvo).onTap,
        isNotNull,
        reason:
            'REPROVA: o item `Meus dados` da gaveta do `Perfil` nasceu com '
            '`onTap` nulo. Item que nao navega e acao sem destino (criterio 2 '
            'da BICHUS-62).',
      );
      expect(
        RegistroDeSubDestinos.itensDe(Rotas.perfil)
            .firstWhere((d) => d.rotulo == 'Meus dados')
            .rota,
        Rotas.dadosPessoais,
        reason:
            'REPROVA: a linha `Meus dados` do inventario deixou de apontar '
            'para `/perfil/dados`.',
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
  group('10. a foto tem as DUAS margens, e so uma custou titulo', () {
    for (final destino in secoesDaBarra) {
      testWidgets(
        'em "${destino.rotulo}": 16,00 dp a esquerda do circulo, e o '
        'orcamento do titulo em 216,00',
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
          // O ALVO e o `IconButton`, e nao o widget: desde 20/10 o widget e
          // o `Align` do slot de 56 dp. Ver `AvatarDaConta.chaveDoAlvo`.
          final alvoDaFoto = tester.getRect(
            find.byKey(AvatarDaConta.chaveDoAlvo),
          );
          final circulo = tester.getRect(
            find.byKey(AvatarDaConta.chaveDoCirculo),
          );

          // (1) A MARGEM QUE O CLIENTE PEDIU, no DESENHO.
          //
          // **ELA TROCOU DE LADO EM 19/10/2026 com a foto.** Ela nasceu a
          // direita, porque a foto fechava o lado direito da barra; o cliente
          // a mandou para o slot do hamburguer (*"colocar o icone do usuario
          // no lugar do menu, do lado esquerdo da pagina"*), e a margem foi
          // com ela. A regra nao mudou -- o circulo fica a
          // `layout.margem-celular` da borda da TELA, que e a mesma margem do
          // corpo --, mudou qual borda e essa.
          expect(
            circulo.left - barra.left,
            BichuLayout.margemCelular,
            reason:
                'REPROVA: o circulo da foto esta a '
                '${(circulo.left - barra.left).toStringAsFixed(2)} dp da '
                'borda ESQUERDA da tela em "${destino.rotulo}", e nao aos '
                '${BichuLayout.margemCelular.toStringAsFixed(2)} dp de '
                '`layout.margem-celular`. Media 8,00 dp do lado direito antes '
                'de 18/10/2026 e o cliente leu isso como desalinho; a margem '
                'de 16 dp foi o conserto, e em 19/10 ela mudou de lado junto '
                'com a foto. Uma margem do lado DIREITO aqui poria 16 dp de '
                'ar entre a foto e o titulo e deixaria o circulo encostado na '
                'borda: o mesmo desalinho, espelhado.',
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
            alvoDaFoto.left - barra.left,
            0.0,
            reason:
                'REPROVA: o ALVO da foto saiu da borda ESQUERDA (${(barra.right - alvoDaFoto.right).toStringAsFixed(2)} dp '
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
          // **O ORCAMENTO SAI DA CONSTRICAO QUE O LEIAUTE DEU AO TITULO**, e
          // nao de somar larguras de `IconButton`. A conta antiga procurava o
          // primeiro `IconButton` do lado direito e descartava o primeiro da
          // lista como sendo o hamburguer -- com a FOTO no `leading` e o sino
          // sozinho a direita, aquele descarte passaria a jogar fora o
          // proprio sino e a conta daria a barra inteira.
          //
          // `constraints.maxWidth` nao depende de eu adivinhar de que TIPO
          // sao os controles nem de quantos sao. Foi assim que o grupo 3
          // consertou um portao cego MEU: `disponivel` somava `IconButton` e
          // a porta de criar deixou de ser um -- ela virou
          // `FloatingActionButton`.
          final orcamento = tester
              .renderObject<RenderParagraph>(
                find.descendant(of: titulo, matching: find.byType(RichText)),
              )
              .constraints
              .maxWidth;
          // **UM NUMERO SO PARA AS QUATRO SECOES, e ele foi a 216,00 dp.**
          //
          // O lado direito deixou de variar de secao para secao em 19/10 pela
          // manha (`criar` desceu para o corpo e o sino entrou), a tarde a
          // FOTO saiu de `actions` para o `leading`, e em 20/10 o cliente
          // pediu a margem entre a foto e o titulo:
          //
          //   hamburguer 64 | titulo | sino 48 + foto 48  -> 160,00
          //   foto 48       | titulo | sino 48            -> 224,00
          //   foto 48 + 8   | titulo | sino 48            -> 216,00
          //
          // Saldo: +16,00 do piso do hamburguer (64) para o da foto (48),
          // +48,00 da foto que saiu do lado direito, e **-8,00 da margem do
          // pedido 1**.
          //
          // **A MARGEM DA ESQUERDA CONTINUA CUSTANDO 0,00 dp**, e as duas
          // margens sao coisas diferentes: a da esquerda e INTERNA ao alvo (o
          // circulo em 16..48 dentro de um alvo de 0..48) e a de 20/10 e
          // EXTERNA a ele (o alvo em 0..48 dentro de um slot de 0..56). A
          // primeira cabia na folga que o alvo tinha sobre o desenho; a
          // segunda nao tinha folga nenhuma para caber, e por isso ela e a
          // unica das duas que aparece nesta linha.
          expect(
            orcamento,
            216.0,
            reason:
                'REPROVA: o titulo de "${destino.rotulo}" recebe '
                '${orcamento.toStringAsFixed(2)} dp em 320 dp a 200%, e o '
                'medido em 20/10/2026 e 216,00 (foto 48 + respiro 8 a '
                'esquerda, sino 48 a direita, `titleSpacing: 0`). A margem '
                'INTERNA da foto continua custando 0,00 dp daqui; o que custa '
                '8,00 e o respiro EXTERNO que o cliente pediu em 20/10, e '
                'nenhuma das duas pode crescer sobre a outra.',
          );

          // (4) E o titulo continua inteiro onde ja estava inteiro.
          //
          // `Perto` e a excecao medida e ela esta cobrada no grupo 3: ela
          // pede 172,90 dp contra os 160,00 do orcamento -- deficit de
          // **12,90 dp**. Ele caiu de 28,90 quando `criar` saiu da barra em
          // 19/10 e **nao chegou a zero**. A margem da foto continua custando
          // 0,00 dp. Fechar os 12,90 que faltam exige tirar outro controle da
          // barra ou encurtar o rotulo, e as duas coisas sao decisao dele.
          // ACHADO DA MESCLA DE 19/10/2026: desce ao `RichText`, como o
          // grupo 3 deste mesmo arquivo ja fazia.
          //
          // A frente `bloqueados-e-titulo` passou a declarar
          // `semanticsLabel` no titulo da barra (para o nome ANUNCIADO nao
          // abreviar junto com o pintado). Com `semanticsLabel`, o `Text`
          // embrulha o paragrafo e `find.text` passa a devolver
          // `RenderSemanticsAnnotations` -- o cast para `RenderParagraph`
          // estoura com `_TypeError`. Este caso e da frente da MARGEM DA
          // FOTO, que nao tinha o rotulo de semantica na base dela, e por
          // isso nenhum dos dois ramos reprovava sozinho.
          final paragrafo = tester.renderObject<RenderParagraph>(
            find.descendant(of: titulo, matching: find.byType(RichText)),
          );
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
