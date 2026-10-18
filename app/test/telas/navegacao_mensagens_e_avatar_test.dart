// AS ISCAS DA REESTRUTURACAO DE NAVEGACAO DE 19/10.
//
// O cliente mudou quatro coisas de uma vez, e cada uma pode quebrar em
// silencio:
//
//   1. `Perfil` saiu da barra de baixo e a porta dele virou a foto da barra de
//      topo. **Se essa porta nao existir, ou nao abrir, cinco destinos somem
//      do produto de uma vez** -- e um deles e o bloco `Meus pets`, cujos
//      cartoes sao o UNICO caminho ate a pagina do pet, onde moram o QR da
//      plaquinha e `Marcar como perdido`.
//   2. A secao de mensagens entrou no slot que era do `Perfil`.
//   3. A foto aparece na barra de topo de toda tela de secao.
//   4. A gaveta ficou FIXA, inclusive nas secoes que nao tem submenu proprio.
//
// Cada grupo abaixo e uma isca: ele falha quando a coisa que ele afirma for
// desligada. Nenhum deles confere PRESENCA sozinha -- o grupo da barra mede
// POSICAO, porque uma barra com os cinco rotulos na ordem errada passa em
// qualquer teste de presenca.
//
// **O que este arquivo NAO cobre, dito por escrito:** a area de mensagens em
// si. A tela, a lista e o envio sao de outro agente e nao existem nesta
// arvore; o slot aponta para um destino provisorio. Quando a tela descer, o
// caso `o slot de mensagens leva a um destino que EXISTE` passa a cobrar a
// rota de verdade, e e o unico caso deste arquivo que muda.
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/telas/pet/tela_detalhe_do_pet.dart';
import 'package:bichu/widgets/cartao_de_pet.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'casca_de_cinco_secoes_test.dart' show todosOsNos;

/// Um pet na conta, para os cartoes existirem e o caminho critico poder ser
/// percorrido de verdade.
///
/// **Sem pet nao ha cartao, e sem cartao a isca do caminho critico passaria
/// por vacuidade** -- que e exatamente a armadilha que este projeto ja pagou.
Future<http.Response> _comUmPet(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <dynamic>[
        <String, dynamic>{
          'id': 'pet-1',
          'name': 'Bidu',
          'species': 'dog',
          'status': 'safe',
        },
      ],
    });
  }
  if (req.url.path == '/v1/pets/pet-1' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'pet-1',
      'name': 'Bidu',
      'species': 'dog',
      'status': 'safe',
    });
  }
  if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
    return http.Response('', 204);
  }
  return http.Response('', 404);
}

Future<http.Response> _semPet(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
    return http.Response('', 204);
  }
  return http.Response('', 404);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // -------------------------------------------------------------------------
  group('(a) nada ficou inalcancavel', () {
    testWidgets(
        'ISCA DO CAMINHO CRITICO: foto -> cartao do pet -> pagina do pet',
        (tester) async {
      // **E a isca que mais importa deste arquivo.** A pagina do pet e onde
      // se ve o QR da plaquinha e onde se marca o pet como perdido, e os
      // cartoes de `Meus pets` sao o unico caminho do app ate ela. Esse bloco
      // morava na aba `Perfil`; a aba deixou de existir. Se a foto nao abrir a
      // tela, ou a tela abrir sem os cartoes, o caminho mais critico do
      // produto fecha -- e fecha sem erro, sem excecao e sem tela quebrada.
      await abrirOApp(tester, rede: _comUmPet, deposito: depositoLogado());

      final foto = find.byType(AvatarDaConta);
      expect(
        foto,
        findsOneWidget,
        reason: 'REPROVA: a foto da conta nao esta na barra de topo. Ela e a '
            'unica porta da tela da conta desde 19/10.',
      );
      await tester.tap(foto);
      await tester.pumpAndSettle();

      expect(
        find.byType(MeusPets),
        findsOneWidget,
        reason: 'REPROVA: a tela que a foto abre nao tem o bloco `Meus pets`.',
      );

      final cartao = find.byType(CartaoDePet);
      expect(
        cartao,
        findsOneWidget,
        reason: 'REPROVA: nao ha cartao de pet na tela da conta. O servidor '
            'de mentira deste caso devolve um pet, entao a ausencia e da '
            'tela: o unico caminho ate a pagina do pet acabou de fechar, e '
            'com ele o QR e `Marcar como perdido`.',
      );
      await tester.tap(cartao);
      await tester.pumpAndSettle();

      expect(
        find.byType(TelaDetalheDoPet),
        findsOneWidget,
        reason: 'REPROVA: tocar no cartao nao abriu a pagina do pet. Esta e a '
            'ponta do caminho critico: e nesta tela que moram o QR da '
            'plaquinha e o botao de marcar como perdido.',
      );
    });

    testWidgets('os itens do Perfil continuam todos alcancaveis pela foto',
        (tester) async {
      // O ANTES -> DEPOIS, item por item, afirmado por extenso.
      //
      // Estes eram os destinos da aba `Perfil` logada. A aba saiu; a lista
      // nao. Um item que desaparecesse aqui teria desaparecido do produto, e
      // nenhum outro caso deste repositorio notaria.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();

      // `Cadastrar meu pet` e BOTAO PRIMARIO, e nao item de menu: com o
      // cadastro fora de `Pets`, este e o unico caminho do app para cadastrar
      // o proximo pet.
      expect(
        find.widgetWithText(FilledButton, 'Cadastrar meu pet'),
        findsOneWidget,
        reason: 'REPROVA: `Cadastrar meu pet` nao esta na tela da conta. Com '
            'o cadastro fora de `Pets`, este e o unico caminho do app para '
            'cadastrar um pet.',
      );

      for (final rotulo in <String>[
        'Meus dados',
        'Escanear uma tag',
        'Sair da conta',
      ]) {
        // **ROLA ATE O ITEM, e a rolagem e parte da prova.**
        //
        // `Sair da conta` e o ultimo da lista e caiu ABAIXO DA DOBRA quando a
        // barra de baixo voltou a ser visivel na tela da conta: a barra come
        // 72 dp de altura. Um `findsOneWidget` seco reprovava por ausencia de
        // `Element`, e a conclusao seria errada -- o item existe e e
        // alcancavel, so nao nasce construido.
        //
        // O que este caso prova e ALCANCABILIDADE, nao visibilidade na
        // primeira tela. Se o item nao existisse, a rolagem terminaria sem
        // achar e o caso reprovaria do mesmo jeito.
        await tester.scrollUntilVisible(
          find.widgetWithText(ItemDeMenu, rotulo),
          120,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(
          find.widgetWithText(ItemDeMenu, rotulo),
          findsOneWidget,
          reason: 'REPROVA: "$rotulo" nao esta na tela da conta. Ele estava na '
              'aba `Perfil` antes de 19/10, e tirar a aba da barra nao podia '
              'tirar o destino do produto.',
        );
      }
    });

    testWidgets('a tela da conta MANTEM a barra de baixo, e nenhum slot '
        'fica aceso', (tester) async {
      // **ISTO FOI MEDIDO DUAS VEZES, e a primeira medida estava errada.**
      //
      // A primeira tentativa tirou a tela da conta do `IndexedStack` e a fez
      // rota irma da casca: ela cobria a barra e ganhava `Voltar`. Custou 107
      // casos da suite. `Entrar` e `Criar conta` sao alcancadas DESTA tela e a
      // saida delas devolve a ABA de onde a pessoa veio; com a conta
      // empilhada, voltar de `Entrar` caia numa tela que cobre a casca e **a
      // barra de baixo nao existia na arvore**. O fluxo de entrada inteiro,
      // deslogado, ficava sem barra.
      //
      // Ela voltou a ser ramo, e com isso a barra fica visivel dentro dela --
      // que e tambem o arranjo do Instagram, a referencia que o cliente deu.
      //
      // O que este caso cobra sao as DUAS metades, porque uma sem a outra e
      // defeito: a barra esta la, e **nenhum slot dela fica aceso**. Acender
      // `Pets` na tela da conta seria a barra afirmando uma secao em que a
      // pessoa nao esta -- e `NavigationBar.selectedIndex` e `int`, entao sem
      // `_BarraSemSelecao` era exatamente isso que acontecia.
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();

      expect(
        find.byType(NavigationBar),
        findsOneWidget,
        reason: 'REPROVA: a tela da conta abriu SEM a barra de baixo. Ela e '
            'ramo da casca de proposito: com ela empilhada, voltar de '
            '`Entrar` cai numa tela sem barra, e foram 107 casos.',
      );

      // -------------------------------------------------------------------
      // A LACUNA MEDIDA, e ela esta aqui para NAO ficar escondida.
      //
      // O indicador fica apagado (`_BarraSemSelecao` tira o indicador, a
      // tinta do icone e a do rotulo), entao quem VE nao ve slot aceso. Mas
      // `NavigationBar.selectedIndex` e `int` e nao `int?`: o componente
      // ainda marca um destino como `selected` na ARVORE DE SEMANTICA, e
      // quem usa leitor de tela ouve `Pets ... selecionado` estando na tela
      // da conta.
      //
      // **Isto e um defeito de acessibilidade conhecido, nao resolvido, e
      // declarado.** Suprimir a tinta nao suprime o estado. Fecha-lo exige
      // uma das duas coisas que estao na mesa do cliente: a tela da conta
      // voltar a ser rota empurrada (semantica limpa, mas a barra nao
      // aparece nela) ou uma barra propria no lugar do `NavigationBar`.
      //
      // O caso trava o estado MEDIDO: e UM no, e e o do primeiro slot. Se
      // virar dois, ou mudar de slot, alguem mexeu no fallback e isto
      // reprova; se virar ZERO, o defeito foi fechado e este caso deve ser
      // trocado por `isEmpty` -- a mensagem abaixo diz isso.
      final acesos = todosOsNos(tester)
          // ignore: deprecated_member_use
          .where((n) => n.getSemanticsData().hasFlag(SemanticsFlag.isSelected))
          .map((n) => n.label)
          .where((l) => l.isNotEmpty)
          .toList();
      expect(
        acesos,
        hasLength(1),
        reason: 'REPROVA: na tela da conta a arvore anuncia '
            '${acesos.length} no(s) como selecionado(s): '
            '${acesos.join(' | ')}.\n'
            'O esperado hoje e UM, e ele e a lacuna conhecida: '
            '`NavigationBar.selectedIndex` nao aceita nulo, entao a barra '
            'marca um destino mesmo sem slot que represente esta tela. Se '
            'deu ZERO, o defeito foi FECHADO -- troque este caso por '
            '`isEmpty` e apague `_BarraSemSelecao` se ela ficou sem uso.',
      );
      expect(
        acesos.single,
        contains(CascaComAbas.visiveisEm(
          CascaComAbas.configuracao,
        ).first.rotulo),
        reason: 'REPROVA: o no anunciado como selecionado na tela da conta '
            'nao e o do PRIMEIRO slot ("${acesos.single}"). O fallback de '
            '`selectedIndex` e 0 de proposito, para a lacuna ser previsivel '
            'em vez de depender de onde a pessoa estava antes.',
      );
      handle.dispose();
    });
  });

  // -------------------------------------------------------------------------
  group('(b) a foto no topo, em TODA tela de secao', () {
    // Uma tela por secao, e **por posicao na barra**, nao por nome: se a ordem
    // mudar, este laco passa a visitar outra secao e o caso continua valido.
    for (var i = 0; i < 4; i++) {
      testWidgets('a secao no slot $i tem a foto na barra de topo',
          (tester) async {
        await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

        final slots = find.byType(NavigationDestination);
        await tester.tap(slots.at(i));
        await tester.pumpAndSettle();

        expect(
          find.byType(AvatarDaConta),
          findsOneWidget,
          reason: 'REPROVA: a secao do slot $i abriu sem a foto na barra de '
              'topo. O cliente pediu a foto em TODAS as paginas (19/10), e '
              'numa tela sem ela a tela da conta fica inalcancavel.',
        );
      });
    }

    testWidgets('a foto tem alvo de 48 dp e rotulo acessivel', (tester) async {
      // Avatar sem rotulo e um circulo mudo para quem nao ve, e alvo pequeno e
      // um controle que escapa do dedo. As duas coisas sao medidas, nao
      // afirmadas.
      //
      // `ensureSemantics` e obrigatorio: sem ele a arvore de semantica nasce
      // vazia e `bySemanticsLabel` nao acha NADA -- o caso reprovaria por
      // motivo errado, e, pior, um caso escrito ao contrario passaria por
      // vacuidade.
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      final tamanho = tester.getSize(find.byType(AvatarDaConta));
      expect(
        tamanho.width,
        greaterThanOrEqualTo(48),
        reason: 'REPROVA: a foto mede ${tamanho.width} dp de largura. O piso '
            'e 48 dp (SC 2.5.8 e o piso do M3).',
      );
      expect(
        tamanho.height,
        greaterThanOrEqualTo(48),
        reason: 'REPROVA: a foto mede ${tamanho.height} dp de altura, e o '
            'piso e 48 dp.',
      );

      // `byTooltip`, e nao `bySemanticsLabel`: o `tooltip` do `IconButton`
      // entra na arvore como a propriedade `tooltip` do no, e nao como
      // `label` -- medido na arvore desta tela. E o mesmo idioma que o portao
      // da gaveta usa para o hamburguer.
      expect(
        find.byTooltip(AvatarDaConta.rotuloAcessivel),
        findsOneWidget,
        reason: 'REPROVA: a foto nao anuncia '
            '"${AvatarDaConta.rotuloAcessivel}". Um avatar sem rotulo e um '
            'circulo mudo no VoiceOver e no TalkBack, e ele e a porta de '
            'cinco destinos.',
      );
      handle.dispose();
    });

    testWidgets('a foto existe DESLOGADO, e leva a Entrar', (tester) async {
      // Deslogado e estado de navegacao, nao muro (UX 5.2). Esconder a foto de
      // quem nao tem conta esconderia `Entrar` junto, que e o oposto do que a
      // cunha do produto precisa.
      await abrirOApp(tester, rede: _semPet);

      expect(
        find.byType(AvatarDaConta),
        findsOneWidget,
        reason: 'REPROVA: a foto desapareceu deslogado, e com ela a porta de '
            '`Entrar` e `Criar conta`.',
      );
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(ElevatedButton, 'Entrar').evaluate().isNotEmpty ||
            find.text('Entrar').evaluate().isNotEmpty,
        isTrue,
        reason: 'REPROVA: a foto deslogada nao leva a uma tela com `Entrar`.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('(c) a gaveta e FIXA, inclusive sem submenu', () {
    // **O caso que o cliente mandou padronizar.** `Rede` e `Loja` nao tem
    // nenhum sub-destino construido, e antes de 19/10 elas nao montavam gaveta
    // nem desenhavam o hamburguer. Ele reverteu isso de propria vontade.
    for (var i = 0; i < 4; i++) {
      testWidgets('a secao no slot $i desenha o gatilho da gaveta',
          (tester) async {
        await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());
        await tester.tap(find.byType(NavigationDestination).at(i));
        await tester.pumpAndSettle();

        expect(
          find.byType(BotaoDaGaveta),
          findsOneWidget,
          reason: 'REPROVA: a secao do slot $i nao desenha o gatilho da '
              'gaveta. O cliente mandou o menu esquerdo ser FIXO em todas as '
              'telas (19/10), "por mais que nao exista um sub-menu ainda".',
        );
      });
    }

    testWidgets('ISCA: a gaveta de uma secao SEM submenu abre com conteudo',
        (tester) async {
      // **A objecao honesta, provada e nao argumentada:** gaveta aberta e
      // vazia e pior que gaveta ausente. A padronizacao so e defensavel porque
      // o caso vazio tem conteudo -- os destinos globais. Este caso falha se
      // alguem tirar os globais e deixar a gaveta fixa.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      // A secao sem submenu proprio, achada pelo REGISTRO e nao pelo nome: se
      // `Rede` ganhar um sub-destino amanha, o caso passa a medir a proxima
      // secao vazia em vez de ficar verde por medir a secao errada.
      final semSubmenu = CascaComAbas.visiveisEm(CascaComAbas.configuracao)
          .where((d) => d.ehRamo)
          .where((d) => RegistroDeSubDestinos.itensDe(d.rota).isEmpty)
          .toList();
      expect(
        semSubmenu,
        isNotEmpty,
        reason: 'REPROVA: nao ha mais secao sem submenu proprio no registro. '
            'Este caso existe para cobrir exatamente esse estado; sem ele, '
            'ele passaria por vacuidade. Se toda secao ganhou submenu, '
            'troque este caso por uma secao de mentira sem sub-destino.',
      );

      for (final secao in semSubmenu) {
        final slot = find.widgetWithText(
          NavigationDestination,
          secao.rotulo,
        );
        await tester.tap(slot);
        await tester.pumpAndSettle();

        await tester.tap(find.byType(BotaoDaGaveta));
        await tester.pumpAndSettle();

        final itens = find.byType(ItemDaGaveta);
        expect(
          itens,
          findsWidgets,
          reason: 'REPROVA: a gaveta de "${secao.rotulo}" abriu VAZIA. Uma '
              'cortina que escurece a tela para nao oferecer nada e pior que '
              'gaveta nenhuma: e o que os destinos globais existem para '
              'impedir.',
        );

        // E os globais estao todos la, por rotulo.
        for (final global in RegistroDeSubDestinos.globais) {
          expect(
            find.descendant(
              of: find.byType(Drawer),
              matching: find.text(global.rotulo),
            ),
            findsOneWidget,
            reason: 'REPROVA: "${global.rotulo}" nao esta na gaveta de '
                '"${secao.rotulo}". Os destinos globais sao o conteudo que '
                'torna a gaveta fixa defensavel.',
          );
        }

        // Fecha para a proxima volta do laco.
        await tester.tapAt(const Offset(700, 300));
        await tester.pumpAndSettle();
      }
    });

    testWidgets('ISCA DE TEXTO: a gaveta e rotulo e seta, sem paragrafo',
        (tester) async {
      // A reclamacao literal do cliente em 23/09: *"que porra de menu lateral
      // e esse que parece mais uma pagina do que menu, com tanto texto, tanta
      // explicacao?"*. Esta isca falha se alguem repuser linha de apoio -- e
      // a tentacao de repor e grande justamente na gaveta vazia, onde uma
      // frase "ainda nao ha submenu" parece util.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());
      await tester.tap(find.byType(BotaoDaGaveta));
      await tester.pumpAndSettle();

      final linhas = tester.widgetList<ListTile>(
        find.descendant(
          of: find.byType(Drawer),
          matching: find.byType(ListTile),
        ),
      );
      expect(linhas, isNotEmpty);
      for (final linha in linhas) {
        expect(
          linha.subtitle,
          isNull,
          reason: 'REPROVA: uma linha da gaveta voltou a ter `subtitle`. Linha '
              'de menu e rotulo e seta: o cliente mandou remover os textos de '
              'apoio, e a gaveta foi reprovada por eles uma vez.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  group('(d) a barra: ordem e rotulos POR POSICAO MEDIDA', () {
    testWidgets('cada slot esta na posicao decidida, da esquerda para a '
        'direita', (tester) async {
      // **Por posicao, e nao por presenca.** Uma barra com os cinco rotulos
      // certos na ordem errada passa em qualquer `findsOneWidget`; o que
      // reprova e comparar a coordenada X de cada um.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      // A INVERSAO DE `Rede` E `Perto` CHEGOU AQUI NA UNIAO DE 18/10/2026: a
      // lista estava na ordem de antes do pedido literal do cliente
      // (*"inverta a ordem no app do item rede e perto"*), porque este ramo
      // nasceu antes dele. O caso continua conferindo a MESMA coisa contra uma
      // lista escrita a mao; so a ordem passou a ser a da uniao.
      const esperado = <String>['Pets', 'Perto', 'Rede', 'Loja', 'AuAu'];
      final centros = <String, double>{};
      for (final rotulo in esperado) {
        final alvo = find.widgetWithText(NavigationDestination, rotulo);
        expect(
          alvo,
          findsOneWidget,
          reason: 'REPROVA: "$rotulo" nao esta na barra.',
        );
        centros[rotulo] = tester.getCenter(alvo).dx;
      }

      final naOrdemPintada = centros.entries.toList()
        ..sort((a, b) => a.value.compareTo(b.value));
      expect(
        naOrdemPintada.map((e) => e.key).toList(),
        esperado,
        reason: 'REPROVA: a barra pinta, da esquerda para a direita, '
            '${naOrdemPintada.map((e) => e.key).toList()}. A ordem decidida e '
            '$esperado, com a secao de mensagens no slot que era do `Perfil`.',
      );
    });

    testWidgets('`Perfil` NAO e mais um slot da barra', (tester) async {
      // Asseverar a AUSENCIA: sem este caso, `Perfil` poderia voltar como
      // sexto slot e todos os casos de presenca continuariam verdes.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      expect(
        find.widgetWithText(NavigationDestination, 'Perfil'),
        findsNothing,
        reason: 'REPROVA: `Perfil` voltou a ser slot da barra. O cliente pediu '
            'que ele saisse e que a porta dele fosse a foto da barra de topo '
            '(19/10).',
      );
      expect(
        find.byType(NavigationDestination),
        findsNWidgets(5),
        reason: 'REPROVA: a barra nao tem cinco slots. Cinco e a conta que o '
            'slot de 64,0 dp em 320 dp sustenta (UX 27.2.1).',
      );
    });

    testWidgets('o slot de mensagens leva a um destino que EXISTE',
        (tester) async {
      // **Este e o caso que muda quando a area de mensagens descer.**
      //
      // Hoje ele prova o minimo honesto: o slot nao e um botao morto. Ele
      // aponta para `destinoProvisorio`, que e uma rota registrada de verdade,
      // e por isso o toque abre uma tela em vez de estourar. Quando a tela do
      // outro agente chegar, `destinoProvisorio` sai da entrada do registro e
      // este caso passa a cobrar `Rotas.mensagens` sem mudar de forma.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      final mensagens = CascaComAbas.destinos.firstWhere(
        (d) => d.campoSemantico == CampoSemantico.conversa,
      );
      expect(
        rotasRegistradasDoApp(tester),
        contains(mensagens.destinoDeHoje),
        reason: 'REPROVA: o slot de mensagens aponta para '
            '"${mensagens.destinoDeHoje}", que nao esta registrada no '
            'roteador. Um slot que aponta para rota inexistente e um botao '
            'que estoura no primeiro toque.',
      );

      await tester.tap(find.widgetWithText(NavigationDestination, 'AuAu'));
      await tester.pumpAndSettle();
      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: tocar no slot de mensagens estourou.',
      );
    });

    testWidgets('o nome acessivel do slot diz MENSAGENS, e nao so AuAu',
        (tester) async {
      // **A saida que faz `AuAu` ser aceitavel.** `AuAu` e palavra de marca e
      // nao diz a funcao: ela cabe nos 64,0 dp onde `Mensagens` (86,66 dp),
      // `Mensagem` (82,73) e `Conversa` (71,13) nao cabem. Quem ve entende
      // pelo balao; quem usa leitor de tela precisa ouvir a palavra clara.
      // Sem esta isca, o rotulo curto seria uma regressao de acessibilidade.
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      final mensagens = CascaComAbas.destinos.firstWhere(
        (d) => d.campoSemantico == CampoSemantico.conversa,
      );
      expect(
        mensagens.rotulo,
        'AuAu',
        reason: 'REPROVA: o rotulo pintado da secao de mensagens mudou. '
            'Qualquer troca aqui precisa ser remedida contra o slot de 64,0 '
            'dp em 320 dp.',
      );
      expect(
        mensagens.semanticsLabel.toLowerCase(),
        contains('mensagens'),
        reason: 'REPROVA: o nome acessivel do slot e '
            '"${mensagens.semanticsLabel}" e nao contem a palavra '
            '"mensagens". O rotulo visivel e palavra de marca; se o nome '
            'acessivel tambem nao disser a funcao, ninguem que usa leitor de '
            'tela descobre o que a secao faz.',
      );
      // O no da aba acrescenta a posicao ("Guia 5 de 5") ao nome, entao a
      // comparacao e por CONTEUDO e nao por igualdade -- medido na arvore.
      // O que importa provar e que a palavra clara chega ao leitor de tela.
      expect(
        find.bySemanticsLabel(RegExp(RegExp.escape(mensagens.semanticsLabel))),
        findsOneWidget,
        reason: 'REPROVA: o nome acessivel "${mensagens.semanticsLabel}" esta '
            'no registro e nao chega a arvore de semantica.',
      );
      handle.dispose();
    });

    testWidgets('o glifo do slot de mensagens e um BALAO', (tester) async {
      // O cliente pediu o balao por escrito, e aqui ele nao e decoracao: com
      // um rotulo que nao diz a funcao, o glifo e o unico sinal visivel que
      // diz "mensagem". Trocar por outra familia de forma quebra a leitura.
      final mensagens = CascaComAbas.destinos.firstWhere(
        (d) => d.campoSemantico == CampoSemantico.conversa,
      );
      expect(
        <IconData>[mensagens.icone, mensagens.iconeSelecionado],
        <IconData>[Icons.chat_outlined, Icons.chat],
        reason: 'REPROVA: o glifo da secao de mensagens nao e mais o balao '
            '`chat`. `chat_bubble` e balao vazio de comentario solto e '
            '`forum` sao dois baloes que se fundem em 24 dp -- e justamente '
            'aqui o glifo nao pode ficar ambiguo.',
      );
    });

    test('a secao de mensagens tem campo semantico PROPRIO', () {
      // Duas secoes que desenham do mesmo campo desfazem a transferencia de
      // significado de que a barra de cinco depende. Com o rotulo desta secao
      // sendo palavra de marca, ela e a que mais depende do glifo -- e a que
      // menos pode dividi-lo.
      final campos = CascaComAbas.destinos.map((d) => d.campoSemantico);
      expect(
        campos.toSet(),
        hasLength(CascaComAbas.destinos.length),
        reason: 'REPROVA: dois destinos declaram o mesmo campo semantico. '
            'Campos: ${campos.toList()}.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('o titulo da tela da conta', () {
    test('e o nome de exibicao da pessoa, num ponto de troca so', () {
      // O cliente pediu o "slug do usuario" (19/10). Slug de pessoa nao existe
      // e esta proibido de existir por ora (ADR-0025, item 2). O que existe e
      // e dela e o nome de exibicao.
      expect(tituloDaTelaDaConta('Leandro'), 'Leandro');
      expect(tituloDaTelaDaConta('  Ana  '), 'Ana');
    });

    test('conta SEM nome cai num titulo neutro, e nao em `Tutor`', () {
      // Medido em 19/10: 2 das 7 contas de hml nao tem `display_name`. O
      // estado tende a desaparecer -- o nome esta virando obrigatorio -- mas
      // existe hoje, e um titulo vazio deixaria a barra sem nome nenhum.
      for (final vazio in <String?>[null, '', '   ']) {
        expect(
          tituloDaTelaDaConta(vazio),
          'Minha conta',
          reason: 'REPROVA: conta sem nome deu '
              '"${tituloDaTelaDaConta(vazio)}". `Tutor` e rotulo da conversa '
              'de achado e soaria como papel atribuido; o titulo da propria '
              'tela diz o lugar, nao o papel.',
        );
      }
    });

    testWidgets('a barra de topo da tela da conta pinta o nome da pessoa',
        (tester) async {
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();

      // `depositoLogado()` nao define `display_name`, e por isso este caso
      // exerce justamente o estado medido em hml: conta SEM nome. O titulo
      // tem de ser o neutro, e nunca a palavra `Perfil`.
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.text(tituloDaTelaDaConta(null)),
        ),
        findsOneWidget,
        reason: 'REPROVA: a barra de topo da tela da conta nao pinta '
            '"${tituloDaTelaDaConta(null)}". O cliente pediu o nome da pessoa '
            'no titulo desta tela (19/10), e `tituloDaTelaDaConta` e o ponto '
            'unico que decide isso -- inclusive o que ele mostra quando a '
            'conta nao tem nome.',
      );
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.text('Perfil'),
        ),
        findsNothing,
        reason: 'REPROVA: a barra de topo da tela da conta voltou a pintar a '
            'palavra `Perfil`.',
      );
    });
  });
}
