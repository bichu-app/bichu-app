// BICHUS-316: a listagem volta NO MESMO REGISTRO, com a paginacao mantida.
//
// Pedido do cliente, verbatim: *"nas paginas de listagem como pets, eventos e
// comunidade, quando eu estou rodando e ja passei umas 3 paginacoes e clico em
// um dos itens para ir para a pagina interna e volto para a pagina anterior, a
// rolagem esta voltando la para cima, voce consegue fazer voltar exatamente no
// mesmo registro que eu tinha visto, como se mantivesse a paginacao?"*
//
// ---------------------------------------------------------------------------
// ## COMO MEDIR O DESLOCAMENTO AQUI, E OS QUATRO ENGANOS QUE ISSO CUSTOU
//
// Esta suite nasceu com QUATRO medicoes erradas seguidas, e as quatro davam
// numero plausivel. Elas estao escritas porque a proxima pessoa vai repeti-las:
//
// 1. **`ensureVisible` no cartao que se vai tocar.** Ele ROLA a lista ate o
//    cartao, e tocar no primeiro leva a rolagem de volta ao topo antes da
//    medicao. O deslocamento "preservado" era o do topo. Toque num cartao que
//    JA esta na dobra -- [_cartaoNaDobra].
// 2. **`find.byType(ListView).first`.** `IndexedStack` mantem os cinco ramos
//    VIVOS: `.first` pode ser a lista de outra secao, parada noutro
//    deslocamento. Ver [_deslocamento].
// 3. **O rolavel sem `controller`.** Ha mais de um `Scrollable` na arvore, e o
//    que importa e o que a casca controla.
// 4. **`abrirAComunidade` na volta.** O ajudante ROLA a lista ate o topo para
//    achar o `Tab` (a `TabBar` mora dentro do corpo rolavel). Ele acusa 16,0 de
//    deslocamento e a culpa parece ser do app. Para medir a troca de aba, volte
//    **so pela aba**, sem reabrir a sub-aba -- a selecao dela sobrevive.
//
// Nenhum desses enganos reprova: todos passam, com o numero errado.

import 'package:bichu/telas/perdido/cartao_do_perdido.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:bichu/widgets/listagem_preservada.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'ajuda_de_tela.dart';
import 'perdidos_e_meus_achados_test.dart' as pets;
import 'perto_com_dados_test.dart' as perto;

/// O deslocamento do rolavel QUE A CASCA CONTROLA e que CONTEM os cartoes.
///
/// Os dois criterios juntos, e nao um deles. Ver os enganos 2 e 3 no cabecalho.
double _deslocamento(WidgetTester tester, Finder cartao) {
  final listas = find
      .ancestor(of: cartao.first, matching: find.byType(ListView))
      .evaluate()
      .map((e) => e.widget as ListView)
      .where((l) => l.controller != null && l.controller!.hasClients);
  expect(
    listas,
    isNotEmpty,
    reason: 'REPROVA: nenhum `ListView` com controlador contem os cartoes. A '
        'casca parou de entregar o controlador de rolagem, e sem ele nao ha o '
        'que preservar -- o pedido do cliente nao tem como ser cumprido.',
  );
  return listas.first.controller!.positions.first.pixels;
}

/// Um cartao que JA esta na dobra -- ver o engano 1 no cabecalho.
Finder _cartaoNaDobra(Finder cartoes) {
  final visiveis = cartoes.evaluate().where((e) {
    final caixa = e.renderObject as RenderBox?;
    if (caixa == null || !caixa.hasSize) return false;
    final y = caixa.localToGlobal(Offset.zero).dy;
    return y > 100 && y < 500;
  }).toList();
  expect(
    visiveis,
    isNotEmpty,
    reason: 'REPROVA: nenhum cartao na dobra depois de rolar, e o caso perdeu '
        'o que ele existe para medir.',
  );
  return find.byWidget(visiveis.first.widget);
}

/// O campo de busca da barra de listagem.
final Finder _campoDeBusca = find.descendant(
  of: find.byType(CampoDeBuscaDaListagem),
  matching: find.byType(TextField),
);

/// Volta ao topo. **Rolar nao descarta nada** -- so os gatilhos descartam.
Future<void> _aoTopo(WidgetTester tester, Finder cartoes) async {
  await tester.drag(cartoes.first, const Offset(0, 3000));
  await tester.pumpAndSettle();
}

Future<double> _rolarAteODois(WidgetTester tester, Finder cartoes) async {
  await perto.tocarEmCarregarMais(tester);
  await tester.drag(cartoes.first, const Offset(0, -2000));
  await tester.pumpAndSettle();
  return _deslocamento(tester, cartoes);
}

void main() {
  final cartoesDaComunidade = find.byType(CartaoDoDiretorio);

  group('a volta devolve o mesmo registro', () {
    testWidgets(
        'ISCA Comunidade: botao do sistema preserva paginas, rolagem e NAO vai '
        'a rede', (tester) async {
      final urls = <Uri>[];
      await perto.abrirPerto(
        tester,
        rede: perto.redeQuePaginaODiretorio(
          perto.vinteECincoEntradas(),
          urls: urls,
        ),
      );
      final antes = await _rolarAteODois(tester, cartoesDaComunidade);
      expect(perto.nomesNaTela(tester), hasLength(25));

      final antesDeEntrar = urls.length;
      await tester.tap(_cartaoNaDobra(cartoesDaComunidade));
      await tester.pumpAndSettle();
      expect(
        cartoesDaComunidade,
        findsNothing,
        reason: 'REPROVA: a ficha do local nao cobriu a listagem, e o caso nao '
            'exercitou a ida e volta.',
      );

      tester.state<NavigatorState>(find.byType(Navigator).last).pop();
      await tester.pumpAndSettle();

      // (1) AS PAGINAS. Sem isto, voltar no item 60 refaz tres chamadas de rede
      // antes de mostrar qualquer coisa -- o custo invisivel do pedido.
      expect(
        perto.nomesNaTela(tester),
        hasLength(25),
        reason: 'REPROVA: a volta jogou fora o que o `Carregar mais` tinha '
            'acumulado e recomecou da pagina 1.',
      );
      // (2) E NENHUMA CHAMADA NOVA.
      expect(
        urls.sublist(antesDeEntrar),
        isEmpty,
        reason: 'REPROVA: a volta foi a rede. Pedidas: '
            '${urls.sublist(antesDeEntrar).map((u) => u.query).toList()}',
      );
      // (3) A ROLAGEM, no mesmo registro.
      expect(
        _deslocamento(tester, cartoesDaComunidade),
        antes,
        reason: 'REPROVA: a rolagem nao voltou onde estava. O cliente descreveu '
            'exatamente isto: "a rolagem esta voltando la para cima".',
      );
    });

    testWidgets('ISCA Comunidade: a TROCA DE ABA preserva igual',
        (tester) async {
      await perto.abrirPerto(
        tester,
        rede: perto.redeQuePaginaODiretorio(
          perto.vinteECincoEntradas(),
          urls: <Uri>[],
        ),
      );
      final antes = await _rolarAteODois(tester, cartoesDaComunidade);

      await abrirAAba(tester, 'Loja');
      // **So pela aba.** `abrirAComunidade` rolaria a lista ao topo para achar
      // o `Tab`, e acusaria 16,0 -- o engano 4 do cabecalho.
      await abrirAAba(tester, 'Rede');

      expect(perto.nomesNaTela(tester), hasLength(25));
      expect(
        _deslocamento(tester, cartoesDaComunidade),
        antes,
        reason: 'REPROVA: dois gestos de voltar preservam e um nao. '
            'Comportamento aleatorio para quem usa e a pior categoria de '
            'defeito de interface.',
      );
    });

    testWidgets('ISCA Pets: a volta preserva paginas e rolagem',
        (tester) async {
      final urls = <Uri>[];
      await pets.abrirPets(
        tester,
        rede: pets.redeQuePaginaPerdidos(pets.vinteECincoPerdidos(), urls: urls),
      );
      final cartoes = find.byType(CartaoDoPerdido);
      final antes = await _rolarAteODois(tester, cartoes);
      final antesDeEntrar = urls.length;

      await tester.tap(_cartaoNaDobra(cartoes));
      await tester.pumpAndSettle();
      tester.state<NavigatorState>(find.byType(Navigator).last).pop();
      await tester.pumpAndSettle();

      expect(cartoes.evaluate(), hasLength(25));
      expect(urls.sublist(antesDeEntrar), isEmpty);
      expect(_deslocamento(tester, cartoes), antes);
    });
  });

  // -------------------------------------------------------------------------
  // OS GATILHOS DE INVALIDACAO
  //
  // **Preservar demais e pior que nao preservar.** Quem troca a pergunta tem de
  // receber a resposta nova; devolver a lista antiga faria a pessoa acreditar no
  // que ve. Um caso por gatilho.
  // -------------------------------------------------------------------------
  group('o que DESCARTA o estado preservado', () {
    testWidgets('aplicar a BUSCA descarta e volta para a pagina 1',
        (tester) async {
      final urls = <Uri>[];
      await perto.abrirPerto(
        tester,
        rede: perto.redeQuePaginaODiretorio(
          perto.vinteECincoEntradas(),
          urls: urls,
          // A rede RECORTA de verdade: um duble que devolvesse a massa inteira
          // para qualquer `q` deixaria passar o defeito que este caso mede.
          recorte: (pedido) {
            final termo = pedido['q'];
            if (termo == null || termo.isEmpty) {
              return perto.vinteECincoEntradas();
            }
            return perto
                .vinteECincoEntradas()
                .where((e) => (e['display_name'] as String).contains(termo))
                .toList();
          },
        ),
      );
      await _rolarAteODois(tester, cartoesDaComunidade);
      expect(perto.nomesNaTela(tester), hasLength(25));

      // De volta ao topo para alcancar o campo: a barra de listagem e um dos
      // filhos do corpo ROLAVEL, e rolar nao descarta nada.
      await _aoTopo(tester, cartoesDaComunidade);
      final antes = urls.length;
      await tester.enterText(_campoDeBusca, 'Entrada 1');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();

      final depois = urls.sublist(antes);
      expect(
        depois,
        isNotEmpty,
        reason: 'REPROVA: a busca nao foi a rede, e o caso perdeu o que ele '
            'existe para medir.',
      );
      for (final url in depois) {
        expect(
          url.queryParameters['page'],
          '1',
          reason: 'REPROVA: a busca nova pediu a pagina que o `Carregar mais` '
              'tinha deixado no recorte. A fatia volta vazia e a tela diz que '
              'nada casa. Pedidas: ${depois.map((u) => u.query).toList()}',
        );
      }
      expect(
        perto.nomesNaTela(tester),
        hasLength(lessThan(25)),
        reason: 'REPROVA: a lista acumulada ATRAVESSOU a busca. A pessoa busca '
            'e continua vendo a lista antiga, acreditando no que ve.',
      );
    });

    testWidgets('o ARRASTAR-PARA-ATUALIZAR descarta', (tester) async {
      final urls = <Uri>[];
      await perto.abrirPerto(
        tester,
        rede: perto.redeQuePaginaODiretorio(
          perto.vinteECincoEntradas(),
          urls: urls,
        ),
      );
      await _rolarAteODois(tester, cartoesDaComunidade);
      expect(perto.nomesNaTela(tester), hasLength(25));

      // O gesto so existe no TOPO da lista.
      await _aoTopo(tester, cartoesDaComunidade);
      final antes = urls.length;
      // **`show()` e nao um `fling`.** `IndexedStack` mantem os cinco ramos
      // vivos e cada um tem o seu `RefreshIndicator`: um `fling` por
      // coordenada acerta o rolavel de outra secao, nao dispara nada e o caso
      // fica verde por engano. `show()` dispara O INDICADOR DESTA LISTA, que e
      // o que o gesto faz quando chega ao fim.
      final indicador = find.ancestor(
        of: cartoesDaComunidade.first,
        matching: find.byType(RefreshIndicator),
      );
      expect(
        indicador,
        findsWidgets,
        reason: 'REPROVA: a lista nao esta sob um `RefreshIndicator`, e o gesto '
            'de atualizar nao existe nesta tela.',
      );
      // **Sem `await` no `show()`.** Ele so completa quando a recarga termina,
      // e a recarga precisa de quadros para andar: esperar por ele antes de
      // bombear travaria o caso -- medido, o processo ficou pendurado.
      tester.state<RefreshIndicatorState>(indicador.first).show();
      await tester.pumpAndSettle();

      expect(
        urls.sublist(antes),
        isNotEmpty,
        reason: 'REPROVA: o gesto de atualizar nao foi a rede. Preservar nao '
            'pode engolir um pedido EXPLICITO de dado novo.',
      );
      expect(
        perto.nomesNaTela(tester),
        hasLength(20),
        reason: 'REPROVA: atualizar manteve as paginas acumuladas. Quem puxa a '
            'pagina pede a lista de agora, e nao a de antes.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // A POLITICA, medida sozinha
  //
  // Os gatilhos que dependem do RELOGIO e do TETO nao se exercitam pela tela
  // sem esperar cinco minutos de verdade ou carregar cem cartoes. Eles sao
  // medidos aqui, na peca que decide.
  // -------------------------------------------------------------------------
  group('PreservacaoDaListagem', () {
    test('mesma pergunta, dentro do prazo e do teto: VALE', () {
      final p = PreservacaoDaListagem(teto: 100)..marcar('a=1#ref');
      expect(p.vale(itens: 25, assinatura: 'a=1#ref'), isTrue);
    });

    test('ORDENACAO diferente: nao vale', () {
      final p = PreservacaoDaListagem(teto: 100)
        ..marcar(assinaturaDaListagem(
          pergunta: <String, String>{'sort': 'distance'},
          referencia: 'r',
        ));
      expect(
        p.vale(
          itens: 25,
          assinatura: assinaturaDaListagem(
            pergunta: <String, String>{'sort': 'name'},
            referencia: 'r',
          ),
        ),
        isFalse,
      );
    });

    test('A LOCALIZACAO DE REFERENCIA mudou: nao vale', () {
      // O gatilho que ninguem lembraria. A `Comunidade` ordena por distancia a
      // partir da referencia CADASTRADA (ADR-0006, nunca do GPS): se ela muda,
      // a ordem preservada esta errada -- e muda com a tela fora de cena, sem
      // nenhuma carga rodando para avisar.
      final antes = assinaturaDaListagem(
        pergunta: <String, String>{'sort': 'distance'},
        referencia: textoDaReferencia(cidade: 'São Paulo', bairro: 'Pinheiros'),
      );
      final depois = assinaturaDaListagem(
        pergunta: <String, String>{'sort': 'distance'},
        referencia: textoDaReferencia(cidade: 'São Paulo', bairro: 'Santana'),
      );
      expect(antes, isNot(depois));
      final p = PreservacaoDaListagem(teto: 100)..marcar(antes);
      expect(p.vale(itens: 25, assinatura: depois), isFalse);
    });

    test('a PAGINA nao faz parte da pergunta: `Carregar mais` nao invalida', () {
      final p1 = assinaturaDaListagem(
        pergunta: <String, String>{'sort': 'distance', 'page': '1'},
        referencia: 'r',
      );
      final p3 = assinaturaDaListagem(
        pergunta: <String, String>{'sort': 'distance', 'page': '3'},
        referencia: 'r',
      );
      expect(p1, p3);
    });

    test('ESTOUROU O TETO: nao vale', () {
      final p = PreservacaoDaListagem(teto: 40)..marcar('a');
      expect(p.vale(itens: 40, assinatura: 'a'), isTrue);
      expect(
        p.vale(itens: 41, assinatura: 'a'),
        isFalse,
        reason: 'REPROVA: a preservacao passou do teto. Em listagem de capa '
            '16:9 cada cartao custa 2,05 MiB decodificados, e o teto e o que '
            'impede a acumulacao de crescer sem limite.',
      );
    });

    test('O DADO ENVELHECEU: nao vale', () {
      var agora = DateTime(2026, 10, 29, 12);
      final p = PreservacaoDaListagem(teto: 100, relogio: () => agora)
        ..marcar('a');
      agora = agora.add(validadeDaListagemPreservada - const Duration(seconds: 1));
      expect(p.vale(itens: 25, assinatura: 'a'), isTrue);
      agora = agora.add(const Duration(seconds: 2));
      expect(
        p.vale(itens: 25, assinatura: 'a'),
        isFalse,
        reason: 'REPROVA: estado preservado por tempo demais. Lista de pets '
            'perdidos velha mostra caso JA ENCERRADO como se estivesse aberto.',
      );
    });

    test('um gatilho descartou, ou nunca mediu: nao vale', () {
      final p = PreservacaoDaListagem(teto: 100);
      expect(p.vale(itens: 25, assinatura: 'a'), isFalse);
      p
        ..marcar('a')
        ..descartar();
      expect(p.vale(itens: 25, assinatura: 'a'), isFalse);
    });

    test('lista VAZIA nao se preserva', () {
      final p = PreservacaoDaListagem(teto: 100)..marcar('a');
      expect(
        p.vale(itens: 0, assinatura: 'a'),
        isFalse,
        reason: 'REPROVA: preservar o vazio esconderia uma lista que agora tem '
            'itens.',
      );
    });
  });
}
