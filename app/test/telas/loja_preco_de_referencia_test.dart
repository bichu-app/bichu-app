// "PREÇO DE REFERÊNCIA" FICA ACIMA DO NOME DO PRODUTO, no cartao da vitrine.
//
// Decisao do cliente, 18/10/2026, literal: *"vamos colocar a mensagem preco de
// referencia, em cima do nome do produto"*.
//
// Este arquivo e PROVA POR DESLIGAMENTO: cada caso diz, no corpo, o que apagar
// de `CartaoDaLoja.build` para ele reprovar. Um caso que desenha a linha e so
// confere que ela existe ficaria verde tambem num cartao em que ela escorregou
// para BAIXO do nome -- e e justamente a POSICAO que o cliente pediu. Por isso
// a ordem e medida em pixel, com `getTopLeft`, e nao por presenca.
//
// ATENCAO: escrito e NAO EXECUTADO. A regra do cliente para esta tarefa proibiu
// rodar suite unitaria e de integracao, e nada aqui foi para aparelho nenhum.
// Nenhum caso abaixo tem recibo de aprovacao.

import 'package:bichu/telas/loja/vitrine_da_loja.dart';
import 'package:flutter_test/flutter_test.dart';

import 'loja_com_dados_test.dart'
    show abrirLoja, itemDoContrato, paginaDoContrato, redeDaVitrine;

/// Um item COM preco vigente: e o unico estado em que a linha nasce.
Map<String, dynamic> _itemComPreco() => itemDoContrato(
  title: 'Bola Pop',
  priceAmount: 8990,
  priceCheckedAt: '2026-03-14',
  priceStatus: 'vigente',
);

Future<void> _abrir(
  WidgetTester tester,
  List<Map<String, dynamic>> itens,
) async {
  await abrirLoja(
    tester,
    rede: redeDaVitrine(paginaDoContrato(itens)),
  );
}

void main() {
  group('a linha de apoio do preco', () {
    testWidgets('EXISTE no cartao com preco', (tester) async {
      // ISCA -- em `CartaoDaLoja.build`
      // (`app/lib/telas/loja/vitrine_da_loja.dart`), apague o bloco
      // `if (linhaDoPreco != null) ...` que desenha
      // `rotuloDePrecoDeReferencia`. Este caso reprova, e com ele a decisao
      // do cliente de 18/10 deixa de estar na tela.
      await _abrir(tester, <Map<String, dynamic>>[_itemComPreco()]);

      expect(
        find.text(CartaoDaLoja.rotuloDePrecoDeReferencia),
        findsOneWidget,
        reason: 'REPROVA: a linha "Preço de referência" nao esta no cartao.',
      );
    });

    testWidgets('fica ACIMA do nome do produto, medido em pixel', (
      tester,
    ) async {
      // ISCA -- no mesmo `build`, mova o bloco de
      // `rotuloDePrecoDeReferencia` para DEPOIS de
      // `Text(item.titulo, ...)`. O caso de cima continuaria verde (a linha
      // existe); este reprova, porque o que o cliente pediu foi a POSICAO.
      await _abrir(tester, <Map<String, dynamic>>[_itemComPreco()]);

      final rotulo = tester.getTopLeft(
        find.text(CartaoDaLoja.rotuloDePrecoDeReferencia),
      );
      final titulo = tester.getTopLeft(find.text('Bola Pop'));

      expect(
        rotulo.dy,
        lessThan(titulo.dy),
        reason:
            'REPROVA: "Preço de referência" nao esta acima do nome do produto '
            '(rotulo em dy=${rotulo.dy}, nome em dy=${titulo.dy}).',
      );
      // Mesma coluna: se um dia a linha virar sufixo na MESMA faixa do nome,
      // `dy` menor poderia vir de arredondamento de linha de base, e nao de
      // estar acima. Alinhadas a esquerda, as duas comecam no mesmo x.
      expect(rotulo.dx, titulo.dx);
    });

    testWidgets('NAO e anunciada solta pelo leitor de tela', (tester) async {
      // ISCA -- troque o `ExcludeSemantics` que embrulha a linha pelo `Text`
      // puro. A arvore de semantica volta a ter um no de nome "Preço de
      // referência" sem valor nenhum ao lado, que e o rotulo orfao: quem nao
      // ve ouve o rotulo sem saber de que preco ele fala.
      //
      // O `ListView` da casca roda com `addSemanticIndexes: false`, entao os
      // filhos do cartao NAO colapsam num no so -- um `Text` cru aqui seria
      // mesmo um no proprio.
      final manipulador = tester.ensureSemantics();
      await _abrir(tester, <Map<String, dynamic>>[_itemComPreco()]);

      expect(
        find.bySemanticsLabel(CartaoDaLoja.rotuloDePrecoDeReferencia),
        findsNothing,
        reason: 'REPROVA: o rotulo virou um no de semantica solto.',
      );

      // E a contraprova, que impede este arquivo de ficar verde escondendo a
      // afirmacao de todo mundo: o leitor de tela CONTINUA ouvindo "preço de
      // referência", junto do valor, no no de texto do preco.
      expect(
        find.bySemanticsLabel(
          RegExp(r'R\$ 89,90 · preço de referência, consultado em'),
        ),
        findsOneWidget,
        reason:
            'REPROVA: o rotulo saiu de perto do valor. O leitor de tela '
            'passou a ouvir o numero sem dizer de que preco ele e.',
      );

      manipulador.dispose();
    });

    testWidgets('NAO aparece no cartao sem preco', (tester) async {
      // ISCA -- tire a guarda `if (linhaDoPreco != null)` do bloco novo,
      // deixando a linha sempre desenhada. Este caso reprova: um cartao sem
      // valor nenhum passaria a afirmar "Preço de referência" sobre nada.
      await _abrir(tester, <Map<String, dynamic>>[
        itemDoContrato(title: 'Sem preço', priceStatus: 'sem_preco'),
        itemDoContrato(title: 'Vencido', priceStatus: 'vencido'),
      ]);

      expect(
        find.text(CartaoDaLoja.rotuloDePrecoDeReferencia),
        findsNothing,
        reason:
            'REPROVA: o rotulo do preco apareceu em cartao que nao tem preco.',
      );
      // E o cartao de preco vencido continua dizendo o que dizia.
      expect(find.text(VitrineDaLoja.precoNaoConfirmado), findsOneWidget);
    });
  });
}
