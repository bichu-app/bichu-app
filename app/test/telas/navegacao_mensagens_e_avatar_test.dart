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
//   5. **O SINO DE NOTIFICACOES ENTROU NA BARRA** (grupo (b2)), e com ele
//      entrou a unica porta da caixa de avisos. Ele estava construido e
//      comentado desde 18/10 por falta de espaco, e desceu quando o cliente
//      decidiu o que sai: *"O botao criar sai da barra"*. Um sino que exista
//      e nao abra nada deixa a caixa inalcancavel sem erro nenhum na tela.
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
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
import 'package:bichu/telas/notificacoes/caixa_de_notificacoes.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/telas/pet/tela_detalhe_do_pet.dart';
import 'package:bichu/widgets/cartao_de_pet.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:bichu/widgets/saida_da_tela.dart';
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

/// O servidor que RESPONDE a contagem do sino, com doze avisos esperando.
///
/// Doze, e nao tres: e acima do teto de um digito, e por isso ele exercita as
/// DUAS pontas da regra de apresentacao de uma vez -- o distintivo pintado
/// encurta para `9+`, e o nome acessivel continua dizendo doze.
Future<http.Response> _comDozeAvisos(http.Request req) async {
  if (req.url.path == '/v1/me/notifications/count' && req.method == 'GET') {
    return json200(<String, dynamic>{'unread_total': 12});
  }
  return _semPet(req);
}

/// Como [_comDozeAvisos], mais a CAIXA inteira: a lista e a marcacao de vista.
///
/// Existe para a isca de abrir a caixa. Sem a marcacao respondendo `204` o
/// contador nao zera -- de proposito --, e sem a lista a tela abre em falha e a
/// isca mediria outra coisa.
Future<http.Response> _comCaixaQueAbre(http.Request req) async {
  if (req.url.path == '/v1/me/notifications' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <dynamic>[
        <String, dynamic>{
          'ref': 'aviso-1',
          'kind': 'broadcast',
          'subject': 'Recado do Bichu',
          'occurred_at': '2026-10-19T12:00:00Z',
          'read': false,
          'grouped_count': 1,
        },
      ],
      'page': 1,
      'limit': 30,
      'total': 1,
      'unread_total': 12,
    });
  }
  if (req.url.path == '/v1/me/notifications/seen' && req.method == 'POST') {
    return http.Response('', 204);
  }
  return _comDozeAvisos(req);
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
  // (b2) O SINO DE NOTIFICACOES — A ISCA (c) DE 19/10
  //
  // Pedido dele (19/10): *"na barra principal crie um icone de notificacao
  // para alertar o usuario sobre os posts dos seus amigos e sobre informacoes
  // sistemicas e comunicados de eventos, etc."*
  //
  // O sino estava CONSTRUIDO e COMENTADO desde 18/10, parado por falta de
  // espaco na barra. Ele desceu quando o cliente decidiu o que sai: *"O botao
  // criar sai da barra"*. Este grupo e reaproveitado da branch
  // `feat/navegacao-mensagens-e-avatar` (commit `0f34de5d`), que ja o havia
  // escrito -- a ordem, o alvo, o rotulo e a prova do numero nao inventado sao
  // dela. **O que foi acrescentado aqui** e o destino: naquela branch
  // `RotasDaCaixa` nao existia e o toque caia na tela da conta; hoje a caixa
  // existe e o caso exige chegar nela.
  //
  // DESLIGAMENTO: comente `const SinoDeNotificacoes(),` no `actions` de
  // `TelaDeAba` (`app/lib/telas/casca_com_abas.dart`), que e como ele estava
  // ate hoje. Os casos deste grupo reprovam.
  group('(b2) o sino de notificacoes', () {
    testWidgets('o sino esta na barra, e SOZINHO no lado direito',
        (tester) async {
      // **O LADO DIREITO MUDOU EM 19/10/2026, e a decisao e dele.**
      //
      // Era sino + foto, e a ordem importava (a foto fechava a barra). O
      // cliente mandou a foto para o slot do hamburguer (*"colocar o icone do
      // usuario no lugar do menu, do lado esquerdo da pagina e o icone de
      // notificacao vai ficar na barra principal do lado direito de todas as
      // paginas"*), e `actions` ficou com UM item.
      //
      // **O caso nao foi afrouxado:** ele continua medindo o sino na barra, o
      // GLIFO pintado, e agora tambem que ele e o UNICO ali -- que e a
      // afirmacao mais forte do que "ele vem antes da foto". Os 48 dp que a
      // foto devolveu estao na conta do orcamento do titulo, em
      // `gaveta_com_submenus_test.dart`.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      for (var i = 0; i < 4; i++) {
        await tester.tap(find.byType(NavigationDestination).at(i));
        await tester.pumpAndSettle();

        expect(
          find.byType(SinoDeNotificacoes),
          findsOneWidget,
          reason: 'REPROVA: a secao do slot $i abriu sem o sino. Ele e da '
              'barra principal, em toda tela de secao.',
        );
        // O GLIFO, e nao so o widget: `SinoDeNotificacoes` devolve
        // `SizedBox.shrink` quando nao ha sessao, e um caso que olhasse so o
        // tipo ficaria verde com a barra sem sino nenhum pintado.
        expect(
          find.descendant(
            of: find.byType(AppBar),
            matching: find.byIcon(Icons.notifications_outlined),
          ),
          findsOneWidget,
          reason: 'REPROVA: no slot $i o sino esta na arvore e nao PINTA '
              'nada. Com sessao ele desenha o glifo; sem sessao ele encolhe, '
              'e este caso esta logado.',
        );

        final barra = tester.widget<AppBar>(find.byType(AppBar));
        final acoes = barra.actions ?? const <Widget>[];
        expect(
          acoes.map((a) => a.runtimeType).toList(),
          <Type>[SinoDeNotificacoes],
          reason: 'REPROVA: no slot $i o lado direito da barra nao e '
              'exatamente um `SinoDeNotificacoes`. A foto saiu para o '
              '`leading` em 19/10 e `criar` saiu da barra no mesmo dia; cada '
              'controle que volta para ca custa 48 ou 64 dp do titulo.',
        );
        // E A FOTO ESTA NO `leading`, no slot que era do hamburguer: a
        // ausencia dela a direita nao e a entrega -- a entrega e ela do outro
        // lado.
        expect(
          barra.leading,
          isA<AvatarDaConta>(),
          reason: 'REPROVA: no slot $i a foto nao esta no `leading`.',
        );
      }
    });

    testWidgets('ISCA: o sino LEVA a caixa de avisos', (tester) async {
      // **A isca que mais importa deste grupo.** Um sino que existe e nao
      // abre nada e um controle que promete: a tela continua montando, a
      // suite continua verde e a caixa de avisos fica inalcancavel -- ela nao
      // tem nenhuma outra porta no app.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();

      expect(
        find.byType(CaixaDeNotificacoes),
        findsOneWidget,
        reason: 'REPROVA: tocar no sino nao abriu a caixa de avisos '
            '(`${RotasDaCaixa.caixa}`). O sino e a UNICA porta dela: sem este '
            'toque a tela existe, a rota existe e ninguem chega la.',
      );
    });

    testWidgets('o sino NAO aparece sem sessao', (tester) async {
      // Notificacao e sobre o que aconteceu com a SUA rede, e sem conta nao
      // ha rede nem o que contar. E a mesma regua das acoes de criar. O
      // leitor de QR e a excecao conhecida, e por outro motivo.
      await abrirOApp(tester, rede: _semPet);

      expect(
        find.byType(SinoDeNotificacoes),
        findsOneWidget,
        reason: 'REPROVA: o widget do sino nao esta na arvore nem para '
            'decidir se aparece. Ele e montado SEMPRE; quem decide se pinta e '
            'ele proprio, pela sessao.',
      );
      expect(
        find.byIcon(Icons.notifications_outlined),
        findsNothing,
        reason: 'REPROVA: o sino APARECE deslogado. Sem conta nao ha rede '
            'nem o que contar, e um sino que nunca tem numero e um controle '
            'que promete.',
      );
      // **A PROVA DE QUE O ESTADO E O QUE EU PENSO, e ela e POSITIVA.**
      //
      // Sem ela este caso ficaria verde num app logado em que o sino sumiu
      // por outro motivo -- e `abrirOApp` sem deposito e exatamente o ponto
      // em que um descuido de arranque deixa a sessao de pe sem ninguem
      // notar. **Nao serve medir o glifo de pessoa da foto:**
      // `depositoLogado()` nao da nome ao usuario, entao a foto desenha o
      // mesmo glifo nos DOIS estados.
      //
      // O que distingue de verdade: a tela da conta oferece `Entrar` a quem
      // nao tem sessao, e `Sair da conta` a quem tem.
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();
      expect(
        find.text('Entrar'),
        findsWidgets,
        reason: 'REPROVA: este caso NAO esta deslogado -- a tela da conta nao '
            'oferece `Entrar`. Entao a ausencia do sino, medida acima, nao '
            'prova nada sobre a regra de sessao.',
      );
      expect(
        find.widgetWithText(ItemDeMenu, 'Sair da conta'),
        findsNothing,
        reason: 'REPROVA: este caso NAO esta deslogado -- a tela da conta '
            'oferece `Sair da conta`.',
      );
    });

    testWidgets('alvo de 48 dp e rotulo acessivel "Notificações"',
        (tester) async {
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      final tamanho = tester.getSize(find.byType(SinoDeNotificacoes));
      expect(
        tamanho.width,
        greaterThanOrEqualTo(SinoDeNotificacoes.alvo),
        reason: 'REPROVA: o sino mede ${tamanho.width} dp de largura, abaixo '
            'do piso de ${SinoDeNotificacoes.alvo} dp (SC 2.5.8).',
      );
      expect(
        tamanho.height,
        greaterThanOrEqualTo(SinoDeNotificacoes.alvo),
        reason: 'REPROVA: o sino mede ${tamanho.height} dp de altura.',
      );
      expect(
        find.byTooltip(SinoDeNotificacoes.rotuloBase),
        findsOneWidget,
        reason: 'REPROVA: o sino nao anuncia '
            '"${SinoDeNotificacoes.rotuloBase}". Um sino com bolinha '
            'vermelha nao diz nada para quem nao ve -- e e o nome acessivel '
            'que o distingue do balao de `AuAu` na barra de baixo.',
      );
    });

    testWidgets('o nome acessivel CHEGA a arvore de semantica, e nao fica '
        'vazio', (tester) async {
      // **Rotulo de semantica VAZIO ja passou vacuamente neste
      // repositorio.** Por isso este caso nao pergunta "o tooltip existe no
      // fonte": ele varre a arvore de semantica e exige um no cujo nome seja
      // EXATAMENTE a palavra. Nenhum no sem nome satisfaz isso.
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      final nos = todosOsNos(tester).where(
        (n) =>
            n.label == SinoDeNotificacoes.rotuloBase ||
            n.tooltip == SinoDeNotificacoes.rotuloBase,
      ).toList();
      expect(
        nos,
        isNotEmpty,
        reason: 'REPROVA: nao ha no de semantica chamado exatamente '
            '"${SinoDeNotificacoes.rotuloBase}". O glifo do sino e a unica '
            'pista do que o controle faz, e sem este nome quem usa TalkBack '
            'ou VoiceOver ouve so "botao" (SC 4.1.2).',
      );
      for (final no in nos) {
        final dados = no.getSemanticsData();
        expect(
          dados.flagsCollection.isButton,
          isTrue,
          reason: 'REPROVA: o sino nao se anuncia como botao.',
        );
        expect(
          dados.hasAction(SemanticsAction.tap),
          isTrue,
          reason: 'REPROVA: o sino anuncia-se como botao e NAO carrega a acao '
              'de toque. O leitor de tela oferece um controle que nao ativa.',
        );
      }
      handle.dispose();
    });

    test('a contagem vai INTEIRA para o leitor de tela, e `9+` so no pintado',
        () {
      // O numero cru e o que importa para quem ouve: "12 novas" e informacao,
      // "9+ novas" e a apresentacao vazando para o anuncio. **Um numero
      // sozinho nao diz nada**, e e por isso que o rotulo carrega a palavra.
      expect(SinoDeNotificacoes.rotuloCom(null), 'Notificações');
      expect(SinoDeNotificacoes.rotuloCom(0), 'Notificações');
      expect(SinoDeNotificacoes.rotuloCom(1), 'Notificações, 1 nova');
      expect(SinoDeNotificacoes.rotuloCom(12), 'Notificações, 12 novas');

      expect(SinoDeNotificacoes.distintivoDe(null), isNull);
      expect(
        SinoDeNotificacoes.distintivoDe(0),
        isNull,
        reason: 'REPROVA: zero pintou distintivo. **Nulo nao e zero**: nulo e '
            '"ninguem contou ainda" e zero seria a afirmacao de que nao ha '
            'nada -- e o app nao tem como saber disso, porque nada em `lib/` '
            'chama `NotificacoesApi.contar()`.',
      );
      expect(SinoDeNotificacoes.distintivoDe(9), '9');
      expect(
        SinoDeNotificacoes.distintivoDe(12),
        '9+',
        reason: 'REPROVA: o distintivo pintado nao encurtou. O circulo nao '
            'cresce, e por isso o pintado encurta e o anunciado nunca.',
      );
    });

    testWidgets('A FONTE FALHOU: o sino nao pinta numero nenhum, e nao pinta '
        'ZERO', (tester) async {
      // **ESTE CASO FOI RETARGETADO em 19/10, e o que ele mede mudou.**
      //
      // Ele nasceu como "SEM FONTE": a rota e `NotificacoesApi.contar()`
      // existiam e nenhuma linha de `lib/` as chamava, entao o sino nao tinha
      // de onde ler numero. A fonte desceu -- `ContadorDeAvisos`, no `Escopo`
      // --, e a ausencia que ele media deixou de existir.
      //
      // **O que ele mede agora e a FALHA, que e o estado mais comum em
      // aparelho de verdade:** `_semPet` responde `404` a
      // `/v1/me/notifications/count`, entao o contador perguntou e nao obteve
      // numero. Nesse estado o sino fica SEM distintivo. O jeito de quebrar
      // isto e um `catch` que devolva zero -- e zero esconderia, de quem tem
      // trinta avisos, que eles existem, por ter aberto o app num elevador.
      //
      // **Nao foi apagado de proposito:** a regra "numero nao se inventa no
      // aparelho" e a mesma de antes e continua precisando de isca. O que
      // mudou foi a razao de nao haver numero, e a prova positiva de que o
      // caminho ESTA ligado e o caso de doze avisos, logo abaixo: sem ele,
      // este voltaria a passar por vacuidade no dia em que o contador fosse
      // desligado.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      expect(
        find.descendant(
          of: find.byType(SinoDeNotificacoes),
          matching: find.byType(Text),
        ),
        findsNothing,
        reason: 'REPROVA: o sino pintou numero com a contagem respondendo '
            '404. Falha de rede nao vira numero -- nem o anterior, que aqui '
            'nao existe, nem zero.',
      );
    });

    testWidgets('COM DOZE AVISOS: o pintado e `9+` e o ANUNCIADO e doze',
        (tester) async {
      // **A prova POSITIVA de que a fonte esta ligada**, e o par necessario do
      // caso acima: sem ela, "o sino nao pinta numero" ficaria verde com o
      // contador arrancado do app.
      //
      // Ela percorre o caminho inteiro -- arranque atras da sessao,
      // `ContadorDeAvisos.atualizar`, `NotificacoesApi.contar`, `ApiClient`,
      // `unread_total`, `Escopo`, `ListenableBuilder` da barra e `naoLidas` do
      // sino. Um duble de contador deixaria tudo isso sem cobertura.
      //
      // E mede as DUAS pontas da apresentacao de uma vez, que e por que o
      // numero e doze: **o circulo nao cresce, entao o pintado encurta; o
      // anuncio nunca.** Dizer `9+ novas` a quem usa leitor de tela seria a
      // apresentacao vazando para a informacao.
      final handle = tester.ensureSemantics();
      await abrirOApp(
        tester,
        rede: _comDozeAvisos,
        deposito: depositoLogado(),
      );

      expect(
        find.descendant(
          of: find.byType(SinoDeNotificacoes),
          matching: find.text('9+'),
        ),
        findsOneWidget,
        reason: 'REPROVA: o sino nao pintou `9+` com doze avisos no servidor. '
            'Ou a fonte nao chegou ao sino -- e ai o distintivo nao existe, e '
            'a barra voltou a ser o desenho sem numero de antes de 19/10 --, '
            'ou o numero nao encurtou e `12` esta estourando o circulo.',
      );

      // O ANUNCIADO, na arvore de semantica e nao no fonte: o rotulo vazio ja
      // passou vacuamente neste repositorio.
      final nos = todosOsNos(tester).where(
        (n) =>
            n.label == 'Notificações, 12 novas' ||
            n.tooltip == 'Notificações, 12 novas',
      );
      expect(
        nos,
        isNotEmpty,
        reason: 'REPROVA: nao ha no de semantica dizendo '
            '"Notificações, 12 novas". Quem nao ve o circulo depende desta '
            'frase para saber que ha algo novo -- e ela carrega o numero '
            'INTEIRO, porque `9+` e desenho e nao informacao.',
      );

      // E o `9+` pintado **nao** entra no anuncio: dois numeros diferentes
      // para o mesmo estado, no mesmo controle, e pior que um so.
      expect(
        todosOsNos(tester).where((n) => n.label.contains('9+')),
        isEmpty,
        reason: 'REPROVA: o `9+` do desenho vazou para a arvore de semantica. '
            'O leitor de tela anunciaria "9+" ao lado de "12 novas".',
      );
      handle.dispose();
    });

    testWidgets('ISCA: abrir a caixa DERRUBA o numero do sino',
        (tester) async {
      // **A isca da ligacao entre a caixa e a barra, e ela cobre um
      // VAZAMENTO DE FIO que nenhum outro caso veria.**
      //
      // `markNotificationsListSeen` zera o contador NO SERVIDOR quando a
      // caixa abre. Se o app nao souber disso, o sino continua com `9+` sobre
      // uma caixa que a pessoa acabou de ler -- e so o conserta quando o app
      // for reaberto. O caminho dessa noticia e
      // `caixa_de_notificacoes.dart` -> `Escopo.contadorDeAvisos`, e ele
      // passa por `dependOnInheritedWidgetOfExactType`, que devolve NULO em
      // vez de estourar: a suite da propria caixa monta a tela SEM `Escopo`.
      // Entao o dia em que essa leitura parar de achar o objeto, nada falha
      // -- exceto este caso.
      await abrirOApp(
        tester,
        rede: _comCaixaQueAbre,
        deposito: depositoLogado(),
      );
      expect(
        find.descendant(
          of: find.byType(SinoDeNotificacoes),
          matching: find.text('9+'),
        ),
        findsOneWidget,
        reason: 'REPROVA: este caso nao comeca com numero no sino, entao a '
            'queda medida abaixo nao prova nada.',
      );

      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      expect(find.byType(CaixaDeNotificacoes), findsOneWidget);

      // Volta para a secao: e a barra dela que desenha o sino.
      await tester.tap(find.byType(SaidaDaTela));
      await tester.pumpAndSettle();

      expect(
        find.descendant(
          of: find.byType(SinoDeNotificacoes),
          matching: find.byType(Text),
        ),
        findsNothing,
        reason: 'REPROVA: o sino continua com numero depois de a caixa ter '
            'sido aberta e o servidor ter confirmado `seen`. O servidor esta '
            'em zero e a barra afirma o contrario -- e continuaria afirmando '
            'ate o app ser reaberto.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('(c) a gaveta foi OCULTADA, e o conteudo dela ficou inteiro', () {
    // ========================================================================
    // ESTE GRUPO FOI VIRADO EM 19/10/2026, e e a segunda vez em dois dias
    // ========================================================================
    //
    // 17/10: o cliente mandou o menu esquerdo ser FIXO em todas as telas
    //        (*"padronize todas as telas, tornando o menu esquerdo fixo para
    //        manter o padrao, por mais que nao exista um sub-menu ainda, mas
    //        irei evoluir e acrescentar alguns itens"*), e este grupo nasceu
    //        cobrando isso.
    // 19/10: ele mandou OCULTAR (*"vamos ocultar o menu por enquanto, pois nao
    //        esta sendo utilizado para nada. colocar o icone do usuario no
    //        lugar do menu"*).
    //
    // **Reversao DELE, do dia seguinte, e nao descuido de quem apagou o
    // gatilho.** A gaveta foi OCULTADA e nao apagada -- a palavra e *"por
    // enquanto"* --, e `GavetaDeSecoes`, `BotaoDaGaveta` e o inventario de 27.5
    // continuam no repositorio.
    //
    // **O QUE SOBROU AQUI e a metade que a reinstalacao vai precisar:** que o
    // conteudo dela esta inteiro. A AUSENCIA do gatilho e do `drawer:` nas
    // quatro secoes e medida em `casca_de_cinco_secoes_test.dart`, e a
    // alcancabilidade dos sete itens vivos em
    // `gaveta_oculta_e_barra_nova_test.dart`.
    testWidgets('nenhuma secao da barra desenha o gatilho da gaveta',
        (tester) async {
      // O caso virado: ele cobrava o gatilho em cada um dos quatro slots, e
      // agora cobra a ausencia nos quatro. Mesma varredura, veredicto oposto.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());
      for (var i = 0; i < 4; i++) {
        await tester.tap(find.byType(NavigationDestination).at(i));
        await tester.pumpAndSettle();
        expect(
          find.byType(BotaoDaGaveta),
          findsNothing,
          reason: 'REPROVA: a secao do slot $i desenha o gatilho da gaveta. O '
              'cliente mandou ocultar o menu em 19/10/2026, e a foto dele '
              'assumiu esse slot.',
        );
        expect(
          tester.widget<AppBar>(find.byType(AppBar)).leading,
          isA<AvatarDaConta>(),
          reason: 'REPROVA: a secao do slot $i nao tem a foto no `leading`. A '
              'ausencia do hamburguer nao e a entrega: a entrega e a foto no '
              'lugar dele.',
        );
      }
    });

    testWidgets(
        'ISCA: a gaveta de uma secao SEM submenu continua tendo CONTEUDO',
        (tester) async {
      // **A objecao honesta, provada e nao argumentada:** gaveta aberta e
      // vazia e pior que gaveta ausente. Ela foi a razao pela qual a gaveta
      // fixa de 17/10 so era defensavel com os destinos GLOBAIS dentro, e ela
      // continua valendo para o dia em que o `drawer:` voltar.
      //
      // **A bancada mudou e a afirmacao nao:** sem gatilho na barra, o caso
      // monta `GavetaDeSecoes` direto. Medir pela porta exigiria repor a porta
      // que o cliente mandou esconder.
      final semSubmenu = CascaComAbas.visiveisEm(CascaComAbas.configuracao)
          .where((d) => d.ehRamo)
          .where((d) => RegistroDeSubDestinos.itensDe(d.rota).isEmpty)
          .toList();
      expect(
        semSubmenu,
        isNotEmpty,
        reason: 'REPROVA: nao ha mais secao sem submenu proprio no registro. '
            'Este caso existe para cobrir exatamente esse estado; sem ele, '
            'ele passaria por vacuidade.',
      );

      for (final secao in semSubmenu) {
        final chave = GlobalKey<ScaffoldState>();
        await tester.pumpWidget(
          MaterialApp(
            theme: BichuTheme.claro,
            home: Scaffold(
              key: chave,
              drawer: GavetaDeSecoes(rotaDaSecao: secao.rota),
              body: const SizedBox.expand(),
            ),
          ),
        );
        await tester.pumpAndSettle();
        chave.currentState!.openDrawer();
        await tester.pumpAndSettle();

        expect(
          find.byType(ItemDaGaveta),
          findsWidgets,
          reason: 'REPROVA: a gaveta de "${secao.rotulo}" abriu VAZIA. Uma '
              'cortina que escurece a tela para nao oferecer nada e pior que '
              'gaveta nenhuma: e o que os destinos globais existem para '
              'impedir, e e isso que faz a REINSTALACAO dela defensavel.',
        );
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
      }
    });

    testWidgets('ISCA DE TEXTO: a gaveta e rotulo e seta, sem paragrafo',
        (tester) async {
      // A reclamacao literal do cliente em 23/09: *"que porra de menu lateral
      // e esse que parece mais uma pagina do que menu, com tanto texto, tanta
      // explicacao?"*. Esta isca falha se alguem repuser linha de apoio -- e a
      // tentacao de repor e grande justamente na gaveta vazia, onde uma frase
      // "ainda nao ha submenu" parece util.
      //
      // Ela vale MAIS com a gaveta oculta e nao menos: ninguem veria o texto
      // de volta antes de a gaveta ser reinstalada.
      final chave = GlobalKey<ScaffoldState>();
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: Scaffold(
            key: chave,
            drawer: GavetaDeSecoes(rotaDaSecao: Rotas.pets),
            body: const SizedBox.expand(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      chave.currentState!.openDrawer();
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

  group('(d) a barra: ordem e rotulos POR POSICAO MEDIDA', () {
    testWidgets('cada slot esta na posicao decidida, da esquerda para a '
        'direita', (tester) async {
      // **Por posicao, e nao por presenca.** Uma barra com os cinco rotulos
      // certos na ordem errada passa em qualquer `findsOneWidget`; o que
      // reprova e comparar a coordenada X de cada um.
      await abrirOApp(tester, rede: _semPet, deposito: depositoLogado());

      // **A ORDEM MUDOU EM 19/10/2026: `Perto` SAIU e `Mural` ENTROU.**
      // `Perto` deixou de ser secao -- o conteudo dela e a aba `Comunidade` da
      // `Rede` -- e `Mural` ficou com o slot 3. A inversao de 18/10
      // (*"inverta a ordem no app do item rede e perto"*) foi absorvida: sem
      // `Perto` na barra nao ha par para inverter.
      //
      // O caso continua conferindo a MESMA coisa contra uma lista escrita A
      // MAO; so a lista mudou.
      const esperado = <String>['Pets', 'Rede', 'Mural', 'Loja', 'AuAu'];
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
