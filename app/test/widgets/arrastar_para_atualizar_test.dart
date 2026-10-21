// ARRASTAR A PAGINA PARA BAIXO REFAZ A BUSCA -- cliente, 18/10/2026.
//
// Palavra por palavra: *"Crie uma acao no aplicativo de atualizar a pagina
// conforme o usuario puxa a pagina para baixo"*. Ele disse **no aplicativo**, e
// nao "nesta tela".
//
// ---------------------------------------------------------------------------
// A ISCA MEDE A BUSCA, E NAO O INDICADOR
// ---------------------------------------------------------------------------
//
// `expect(find.byType(RefreshIndicator), findsOneWidget)` e o portao cego
// desta historia: ele fica verde com `onRefresh: () async {}`, com a fisica
// errada (lista curta que nao aceita excesso de rolagem) e com a busca
// publicada nula. O gesto pareceria existir e nao buscaria nada.
//
// Entao os casos de comportamento deste arquivo **contam requisicoes HTTP**: a
// mesma rota tem de ser pedida uma segunda vez depois do arrasto, com a tela
// ja carregada. E a unica afirmacao que nao sobrevive a um `onRefresh` vazio.
//
// ---------------------------------------------------------------------------
// DESLIGAR PARA VER REPROVAR -- medido, com o nome do caso
// ---------------------------------------------------------------------------
//
//  1. Em `lib/telas/casca_com_abas.dart`, troque
//     `ArrastarParaAtualizar.doSlot(recarga: _recargaDaSecao, child: ...)`
//     pelo `ListView` cru (apague o embrulho).
//     -> reprova `a secao refaz a busca: o arrasto na Loja pede a rota de
//        novo`.
//  2. Em `lib/telas/loja/vitrine_da_loja.dart`, apague
//     `with PublicaAAtualizacao` e o `aoArrastarParaAtualizar`.
//     -> reprova o mesmo caso: o embrulho fica, e a busca publicada e nula --
//        que e exatamente o estado em que o indicador EXISTE e nao busca nada.
//  3. Em `lib/telas/notificacoes/caixa_de_notificacoes.dart`, troque
//     `ArrastarParaAtualizar(aoAtualizar: _carregar, child: _corpo())` por
//     `_corpo()`.
//     -> reprova `ISCA: o arrasto para baixo REFAZ a busca` em
//        `test/notificacoes/caixa_de_notificacoes_test.dart`. A outra ponta
//        do componente -- a tela que embrulha o proprio rolavel -- e medida
//        LA, onde mora o duble de servidor que conta chamadas por rota.
//  4. Em `lib/widgets/arrastar_para_atualizar.dart`, troque o `onRefresh` por
//     `() async {}` (deixando o resto).
//     -> reprova os DOIS casos de comportamento deste arquivo (a lista cheia e
//        a curta) e **nenhum** caso de estrutura. E essa assimetria que diz
//        que a medicao e da busca, e nao do widget.
//  5. No mesmo arquivo, apague o `ScrollConfiguration` que impoe
//     `AlwaysScrollableScrollPhysics`.
//     -> reprova o caso de FONTE `o componente impoe a fisica e o rotulo
//        acessivel`. **Nenhum caso de widget reprova com a fisica AUSENTE, e
//        isso continua medido** -- ver o comentario dentro de `a lista de UM
//        item tambem aceita o arrasto`.
//  5b. No mesmo arquivo, troque
//     `const AlwaysScrollableScrollPhysics().applyTo(heranca.getScrollPhysics(context))`
//     por `const AlwaysScrollableScrollPhysics()` (a forma SEM PAI, que e o
//     defeito que o lote de 19/10 carregava).
//     -> reprova `ISCA: a fisica do gesto tem PAI -- a secao DESCANSA depois
//        do arrasto` aqui, e `ISCA: a rolada ate o fim DESCANSA no conteudo, e
//        a pagina pedida FICA na tela` em
//        `test/mensagens/busca_e_rolagem_da_area_test.dart`, junto com os
//        quatro casos de rolagem e busca daquela pasta. O caso de FONTE do
//        item 5 fica VERDE nos dois casos -- ele le a palavra
//        `AlwaysScrollableScrollPhysics` na fonte, e a palavra esta nas duas
//        formas. E por isso que ele nao basta.
//  6. Em qualquer uma das doze telas, troque o componente por um
//     `RefreshIndicator` cru.
//     -> reprova `nenhuma tela usa RefreshIndicator cru`.

import 'dart:io';

import 'package:bichu/telas/loja/vitrine_da_loja.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A massa
// ---------------------------------------------------------------------------

Map<String, dynamic> _itemDaLoja(int i) => <String, dynamic>{
  'slug': 'item-$i',
  'title': 'Item $i',
  'summary': 'Um produto da vitrine.',
  'category': 'toy',
  'category_label': 'Brinquedos',
  'subcategory': null,
  'subcategory_label': null,
  'image_url': null,
  'image_alt_text': null,
  'target_url': 'https://cobasi.com.br/item-$i',
  'partner': <String, dynamic>{
    'slug': 'cobasi',
    'name': 'Cobasi',
    'host': 'cobasi.com.br',
  },
  'price_amount': null,
  'price_currency': null,
  'price_checked_at': null,
  'price_status': 'sem_preco',
};

Map<String, dynamic> _paginaDaLoja(int quantos) => <String, dynamic>{
  'items': <Map<String, dynamic>>[
    for (var i = 1; i <= quantos; i++) _itemDaLoja(i),
  ],
  'page': 1,
  'limit': 20,
  'total': quantos,
  'effective_sort': 'curadoria',
  'applied_filters': const <String, String>{'scope': 'all'},
};

/// **O ARRASTO, como o dedo o faz.**
///
/// `fling` e nao `drag`: o `RefreshIndicator` so dispara quando o excesso de
/// rolagem passa do limite dele E o gesto termina -- um `drag` sem velocidade
/// chega ao limite e volta sem soltar o gatilho. `pumpAndSettle` depois espera
/// a animacao da roda **e** o `Future` da busca.
Future<void> arrastarParaBaixo(WidgetTester tester) async {
  await tester.fling(find.byType(Scrollable).first, const Offset(0, 320), 1200);
  await tester.pumpAndSettle();
}

void main() {
  group('o arrasto refaz a BUSCA, e nao so a roda', () {
    testWidgets('a secao refaz a busca: o arrasto na Loja pede a rota de novo', (
      tester,
    ) async {
      final pedidos = <Uri>[];
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
        rede: (http.Request req) async {
          if (req.url.path == '/v1/store/taxonomy') {
            return json200(<String, dynamic>{
              'categories': const <Map<String, dynamic>>[],
            });
          }
          if (req.url.path == '/v1/store/items' && req.method == 'GET') {
            pedidos.add(req.url);
            // Vinte itens: a lista enche a tela, e o arrasto acontece sobre
            // conteudo de verdade.
            return json200(_paginaDaLoja(20));
          }
          return problema('not-found', 404);
        },
      );
      await abrirAAba(tester, 'Loja');

      // ANCORA: a vitrine carregou. Sem ela, um `length == 2` abaixo poderia
      // significar "duas falhas" em vez de "uma carga e uma recarga".
      expect(
        find.byType(CartaoDaLoja),
        findsWidgets,
        reason:
            'REPROVA NA ANCORA: a vitrine nao carregou, e o caso mediria '
            'o arrasto sobre uma tela vazia.',
      );
      final antes = pedidos.length;
      expect(
        antes,
        greaterThan(0),
        reason:
            'REPROVA NA ANCORA: a tela nao pediu `GET /v1/store/items` '
            'nenhuma vez.',
      );

      await arrastarParaBaixo(tester);

      expect(
        pedidos.length,
        greaterThan(antes),
        reason:
            'REPROVA: o arrasto na `Loja` NAO refez a busca. Pedidos a '
            '`GET /v1/store/items`: $antes antes do gesto e ${pedidos.length} '
            'depois. Esta e a assercao que distingue o gesto do ENFEITE: um '
            '`RefreshIndicator` na arvore com `onRefresh` vazio, ou com a '
            'busca publicada nula, deixa a roda girar e nao pergunta nada ao '
            'servidor. A `Loja` e o corpo de uma raiz de secao: a rolagem e '
            'da casca (`TelaDeAba`) e a busca e publicada por '
            '`SlotDeAtualizacao` -- se qualquer uma das duas pontas soltar, o '
            'gesto fica inerte.',
      );
    });

    testWidgets(
      'ISCA: a fisica do gesto tem PAI -- a secao DESCANSA depois do arrasto',
      (tester) async {
        // ===================================================================
        // A ISCA QUE FALTAVA PARA O `ScrollConfiguration`, e ela nao e de
        // widget na arvore: e de ONDE A LISTA VEM PARAR.
        //
        // O item 5 do cabecalho deste arquivo dizia que apagar o
        // `ScrollConfiguration` nao reprovava nada de widget. Verdade -- e a
        // lacuna nao era a presenca da fisica, era a FORMA dela.
        // `AlwaysScrollableScrollPhysics` sobrescreve **um** metodo,
        // `shouldAcceptUserOffset`; `applyBoundaryConditions` e
        // `createBallisticSimulation` ela delega ao `parent`. Imposta pela
        // `ScrollBehavior` (`copyWith(physics:)`), o `Scrollable` a usa
        // VERBATIM -- `applyTo` so e chamado na fisica que vem pelo widget
        // (`scrollable.dart`, `_updatePosition`). Sem pai, a subarvore inteira
        // ficou sem limite (`applyBoundaryConditions` -> `0.0`) e sem repouso
        // (`createBallisticSimulation` -> `null`): o dedo empurra a lista para
        // fora do conteudo e **nada a traz de volta**.
        //
        // Medido antes do conserto, na area de mensagens: o arrasto para baixo
        // deixava a lista em `pixels` = -280 para sempre, e a rolada ate o fim
        // deixava `pixels` = 2940 com `maxScrollExtent` = 1177 e a janela num
        // vazio. Isto vale nas ONZE superficies, e por isso o caso mora aqui e
        // nao na tela.
        //
        // **Ele mede a REDE junto**, e a ordem importa: primeiro que o gesto
        // refez a busca (senao um `pixels == 0` ficaria verde numa tela que
        // nunca aceitou o arrasto), depois onde a lista descansou.
        // ===================================================================
        final pedidos = <Uri>[];
        await abrirOApp(
          tester,
          deposito: depositoLogado(),
          rede: (http.Request req) async {
            if (req.url.path == '/v1/store/taxonomy') {
              return json200(<String, dynamic>{
                'categories': const <Map<String, dynamic>>[],
              });
            }
            if (req.url.path == '/v1/store/items' && req.method == 'GET') {
              pedidos.add(req.url);
              return json200(_paginaDaLoja(20));
            }
            return problema('not-found', 404);
          },
        );
        await abrirAAba(tester, 'Loja');
        expect(
          find.byType(CartaoDaLoja),
          findsWidgets,
          reason: 'REPROVA NA ANCORA: a vitrine nao carregou.',
        );
        final antes = pedidos.length;

        await arrastarParaBaixo(tester);

        // ---- ANCORA DE REDE: o gesto foi ACEITO e refez a busca ----
        expect(
          pedidos.length,
          greaterThan(antes),
          reason: 'REPROVA NA ANCORA: o arrasto nao refez a busca, e o '
              'repouso medido abaixo seria o de uma lista que nunca saiu do '
              'lugar.',
        );

        // ---- O REPOUSO: a lista VOLTOU ----
        final posicao = tester
            .state<ScrollableState>(find.byType(Scrollable).first)
            .position;
        expect(
          posicao.outOfRange,
          isFalse,
          reason: 'REPROVA: a secao ficou parada FORA do proprio conteudo '
              'depois do arrasto -- `pixels` = ${posicao.pixels}, '
              '`minScrollExtent` = ${posicao.minScrollExtent}, '
              '`maxScrollExtent` = ${posicao.maxScrollExtent}. A fisica que '
              '`ArrastarParaAtualizar` impoe perdeu o `parent`: sem ele nao '
              'ha limite nem simulacao balistica, e a lista nao volta ao '
              'topo depois de puxada. Vale nas ONZE superficies do gesto.',
        );
        expect(
          posicao.pixels,
          greaterThanOrEqualTo(posicao.minScrollExtent),
          reason: 'REPROVA: a lista descansou ACIMA do proprio topo. Quem '
              'puxa para atualizar fica com uma faixa vazia no alto da tela '
              'que nao fecha mais.',
        );
      },
    );

    testWidgets('a lista de UM item tambem aceita o arrasto', (tester) async {
      // A lista curta e o estado em que o gesto mais importa -- a de um item,
      // a vazia, a que acabou de falhar --, e e o estado em que ele morre
      // calado se a fisica do rolavel nao aceitar excesso de rolagem sobre
      // extensao zero. Este caso cobra que ele funcione ali.
      //
      // =====================================================================
      // **ELE NAO E A ISCA DO `ScrollConfiguration`, e isto esta MEDIDO.**
      //
      // Desligando o `ScrollConfiguration` que impoe
      // `AlwaysScrollableScrollPhysics` em
      // `lib/widgets/arrastar_para_atualizar.dart`, este caso passou VERDE --
      // duas vezes: na plataforma padrao de `flutter test` (macOS, onde a
      // fisica e `BouncingScrollPhysics` e aceita excesso com extensao zero) e
      // com `TargetPlatform.android` forcado, que e o que o `Theme` entrega a
      // `ScrollBehavior.getScrollPhysics`.
      //
      // Escrever aqui que ele prova a fisica seria a afirmacao mais perigosa
      // deste arquivo: um portao que diz medir o que nao mede. O que ele mede
      // de verdade e o que o nome dele diz -- a vitrine de UM cartao refaz a
      // busca no arrasto --, e e uma afirmacao util: ela reprova se o gesto
      // depender de a lista ser longa (um `notificationPredicate` errado, um
      // `ListView` com `shrinkWrap` que troque o rolavel). Quem cobra a
      // presenca da fisica e o caso de FONTE `o componente impoe a fisica e o
      // rotulo acessivel`, e quem poderia fechar a lacuna de verdade e um
      // aparelho Android na mao.
      //
      // O Android fica forcado de qualquer forma: e o unico sistema em que
      // este app esta hoje, e exercitar a fisica dele custa duas linhas.
      // =====================================================================
      //
      // **O `finally` e obrigatorio, e nao estilo**: `flutter_test` reprova o
      // caso com *"The value of a foundation debug variable was changed by the
      // test"* se a variavel sobrar ligada, e `addTearDown` roda DEPOIS dessa
      // conferencia -- medido.
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      try {
        final pedidos = <Uri>[];
        await abrirOApp(
          tester,
          deposito: depositoLogado(),
          rede: (http.Request req) async {
            if (req.url.path == '/v1/store/taxonomy') {
              return json200(<String, dynamic>{
                'categories': const <Map<String, dynamic>>[],
              });
            }
            if (req.url.path == '/v1/store/items' && req.method == 'GET') {
              pedidos.add(req.url);
              return json200(_paginaDaLoja(1));
            }
            return problema('not-found', 404);
          },
        );
        await abrirAAba(tester, 'Loja');

        expect(
          find.byType(CartaoDaLoja),
          findsOneWidget,
          reason:
              'REPROVA NA ANCORA: a vitrine de UM item nao desenhou o '
              'cartao, e o caso nao esta medindo lista curta nenhuma.',
        );
        final antes = pedidos.length;

        await arrastarParaBaixo(tester);

        expect(
          pedidos.length,
          greaterThan(antes),
          reason:
              'REPROVA: a vitrine de UM item nao aceita o arrasto. Pedidos: '
              '$antes antes e ${pedidos.length} depois. O gesto nao pode '
              'depender de a lista ser longa: a lista curta, a vazia e a que '
              'acabou de falhar sao justamente onde a pessoa mais precisa '
              'dele.',
        );
      } finally {
        debugDefaultTargetPlatformOverride = null;
      }
    });
  });

  // -------------------------------------------------------------------------
  // A ESTRUTURA: um ponto unico, e nao dez copias
  // -------------------------------------------------------------------------
  //
  // Estes casos leem `lib/` do DISCO. Eles nao abrem tela nenhuma, e e por
  // isso que sobrevivem ao conserto: no dia em que uma tela nova nascer com um
  // `RefreshIndicator` colado dentro, eles acusam -- e nenhum teste de widget
  // acusaria, porque a tela funcionaria.
  group('o gesto mora num lugar so', () {
    /// Os `.dart` de `lib/`, com o caminho relativo.
    Map<String, String> fontesDeLib() {
      final raiz = Directory('lib');
      expect(
        raiz.existsSync(),
        isTrue,
        reason:
            'REPROVA: o caso roda do diretorio errado. Ele tem de rodar '
            'da raiz de `app/`, que e de onde `flutter test` roda.',
      );
      final fontes = <String, String>{};
      for (final f in raiz.listSync(recursive: true)) {
        if (f is! File || !f.path.endsWith('.dart')) continue;
        fontes[f.path] = f.readAsStringSync();
      }
      expect(
        fontes.length,
        greaterThan(20),
        reason:
            'REPROVA: li ${fontes.length} arquivos de `lib/`. O portao '
            'ficaria verde por vazio, que e como esta classe de defeito passa '
            'despercebida.',
      );
      return fontes;
    }

    test('nenhuma tela usa RefreshIndicator cru', () {
      final crus = <String>[];
      fontesDeLib().forEach((caminho, fonte) {
        // O componente E o unico lugar em que a palavra pode aparecer.
        if (caminho.endsWith('widgets/arrastar_para_atualizar.dart')) return;
        if (fonte.contains('RefreshIndicator(')) crus.add(caminho);
      });

      expect(
        crus,
        isEmpty,
        reason:
            'REPROVA: ${crus.join(', ')} monta `RefreshIndicator` direto. O '
            'gesto tem UM lugar -- `widgets/arrastar_para_atualizar.dart` --, '
            'e nao e disciplina: sao doze superficies, e copiado doze vezes o '
            'gesto divergiria na primeira correcao. Uma com rotulo de leitor '
            'de tela e dez sem; uma com a fisica da lista curta e dez sem. '
            '`tela_pedidos_de_conexao.dart` era o cru que existia antes de '
            '18/10, e foi convertido junto.',
      );
    });

    test('as treze superficies de conteudo de rede TEM o gesto', () {
      // A LISTA E ESCRITA A MAO, de proposito. Derivar "toda tela que chama
      // `_carregar`" deixaria o portao concordar com qualquer recorte futuro;
      // esta lista e a DECISAO de 18/10, e mexer nela e um ato deliberado que
      // aparece no diff.
      //
      // As sete primeiras publicam pelo slot (a rolagem e da casca); as seis
      // ultimas embrulham o proprio corpo.
      const porSlot = <String>[
        'lib/telas/perdido/lista_de_perdidos.dart',
        'lib/telas/rede/agenda_da_rede.dart',
        'lib/telas/perto/lista_do_diretorio.dart',
        'lib/telas/perto/minhas_indicacoes.dart',
        'lib/telas/loja/vitrine_da_loja.dart',
        'lib/telas/perfil/meus_pets.dart',
        // A DECIMA TERCEIRA, e ela entrou por RELATO do cliente em 20/10/2026:
        // *"a pagina do mural nao esta funcionando a funcionalidade de
        // atualizar a pagina puxando pra baixo"*. O Mural nasceu depois do
        // lote de 18/10 e ficou sendo a UNICA tela de listagem do app sem o
        // gesto -- com `_carregar` ja pronto e so a metade que escuta faltando.
        'lib/telas/mural/tela_do_mural.dart',
      ];
      const proprias = <String>[
        'lib/telas/mensagens/area_de_mensagens.dart',
        'lib/telas/notificacoes/caixa_de_notificacoes.dart',
        'lib/telas/perfil/meus_achados.dart',
        'lib/telas/perfil/vitrine_de_fotos.dart',
        'lib/telas/conexoes/tela_pedidos_de_conexao.dart',
        // A DECIMA SEGUNDA, e ela nao e listagem: `/achados/:id` le UM
        // achado do servidor. Ficou fora do lote de 18/10 porque o recorte
        // daquele dia foi lista; o criterio e haver busca a refazer, e ela
        // tem `_carregar`.
        'lib/telas/achado/tela_do_achado.dart',
      ];

      final fontes = fontesDeLib();
      final semGesto = <String>[];

      for (final caminho in porSlot) {
        final fonte = fontes[caminho];
        expect(
          fonte,
          isNotNull,
          reason:
              'REPROVA: `$caminho` nao existe mais. Se a tela mudou de '
              'nome, esta lista muda com ela -- e a mudanca e deliberada.',
        );
        if (!fonte!.contains('with PublicaAAtualizacao') &&
            !fonte.contains(', PublicaAAtualizacao')) {
          semGesto.add('$caminho (deveria publicar pelo slot)');
        } else if (!fonte.contains('aoArrastarParaAtualizar()')) {
          semGesto.add('$caminho (usa o mixin e nao diz qual e a busca)');
        }
      }
      for (final caminho in proprias) {
        final fonte = fontes[caminho];
        expect(fonte, isNotNull, reason: 'REPROVA: `$caminho` nao existe.');
        if (!fonte!.contains('ArrastarParaAtualizar(')) {
          semGesto.add('$caminho (deveria embrulhar o proprio rolavel)');
        }
      }

      expect(
        semGesto,
        isEmpty,
        reason:
            'REPROVA: ${semGesto.join('; ')}. O cliente pediu o gesto "no '
            'aplicativo", e nao numa tela: estas treze sao as superficies com '
            'conteudo de rede que vale reler. Quem tirar uma daqui esta '
            'desfazendo a decisao de 18/10, e isso e um ato com nome no diff.',
      );
    });

    test('o componente impoe a fisica e o rotulo acessivel', () {
      // A metade de CODIGO da fisica. O caso de widget acima prova que a lista
      // curta aceita o arrasto; este prova POR QUE, e continua acusando no dia
      // em que alguem trocar a fisica por um `ListView` com `physics` escrito
      // a mao em uma das telas.
      final fonte = File('lib/widgets/arrastar_para_atualizar.dart')
          .readAsStringSync();

      expect(
        fonte.contains('AlwaysScrollableScrollPhysics'),
        isTrue,
        reason:
            'REPROVA: o componente nao impoe a fisica que faz a lista '
            'curta aceitar o excesso de rolagem. Sem ela o gesto morre na '
            'lista de um item e na lista vazia.',
      );
      expect(
        fonte.contains('semanticsLabel:'),
        isTrue,
        reason:
            'REPROVA: o gesto nao tem nome acessivel. '
            '`RefreshIndicator` sem `semanticsLabel` e anunciado pelo texto '
            'padrao do Material -- em ingles, num aparelho configurado em '
            'portugues.',
      );
    });

    test('o fio da conversa NAO tem o gesto, e a ausencia e a decisao', () {
      // **ISCA DE AUSENCIA COM ANCORA.** Um `findsNothing` solto aqui ficaria
      // verde com o arquivo apagado; entao o caso primeiro exige que a tela
      // exista e que ela ainda tenha o controle que ocupa o mesmo gesto.
      final fonte = File('lib/telas/mensagens/tela_da_conversa.dart')
          .readAsStringSync();

      expect(
        fonte.contains('carregarAnteriores'),
        isTrue,
        reason:
            'REPROVA NA ANCORA: `tela_da_conversa.dart` nao tem mais '
            '`Carregar anteriores`. A ausencia do arrastar-para-atualizar aqui '
            'e justificada por ESSE controle ocupar o topo da lista; sem ele, '
            'a decisao precisa ser reavaliada e nao mantida por inercia.',
      );
      expect(
        fonte.contains('ArrastarParaAtualizar'),
        isFalse,
        reason:
            'REPROVA: o fio da conversa ganhou o arrastar-para-atualizar. '
            'O topo daquela lista JA tem um gesto com significado -- '
            '`Carregar anteriores` --, e dois significados para o mesmo '
            'arrasto e a pessoa pedindo mensagem antiga e recebendo a lista '
            'recarregada.',
      );
    });
  });
}
