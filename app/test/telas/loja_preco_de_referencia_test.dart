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
// 18/10/2026, SEGUNDA PASSADA: o cliente mandou remover o RABO da linha do
// preco ("preço de referência, consultado em ..."), justamente porque esta
// linha acima do nome ja diz a afirmacao. O rotulo visivel FICA -- e o que ele
// pediu antes --, e a contraprova de semantica deste arquivo mudou de alvo: a
// afirmacao agora chega ao leitor de tela pelo `semanticsLabel` do no do preco
// e nao mais pelo texto do rabo.
//
// 18/10/2026, TERCEIRA PASSADA: *"devolve a data onde esta o novo texto de
// preço de referência"*. A data volta -- NESTA linha, nao no rabo -- e a
// linha do preco continua sendo so o valor. A redacao e a do rabo que saiu,
// sem o valor, e a data sai da mesma `dataCurta`.
//
// A suspensao de teste acabou: os casos deste arquivo foram EXECUTADOS nesta
// rodada.

import 'package:bichu/telas/loja/vitrine_da_loja.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart' show SemanticsNode;
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

/// Quantas vezes [trecho] e DITO na arvore de semantica inteira.
///
/// **Conta OCORRENCIAS, e nao nos -- e as duas tentativas anteriores falharam
/// por isso.** Medido com a isca do anuncio duplicado armada:
///
/// 1. `find.bySemanticsLabel(RegExp(...))` devolveu **um** com o defeito
///    armado. Aquele finder casa WIDGETS com o no que os cobre, e nao serve
///    para contar quantas vezes uma frase e falada;
/// 2. contar NOS cujo rotulo contem o trecho tambem devolveu **um** -- e aqui
///    esta a descoberta: o `InkWell` do cartao MESCLA os filhos num no so. Com
///    o rotulo visivel anunciado, o rotulo daquele no unico passa a ser
///    `"Preço de referência, consultado em 14/03\nBola Pop\nPreço de
///    referência, R\$ 89,90, consultado em 14/03"`: a data aparece DUAS vezes
///    dentro de UM rotulo.
///
/// Entao o que importa nao e em quantos nos a frase esta: e quantas vezes quem
/// usa leitor de tela a ouve. E isso se conta somando as ocorrencias.
int vezesQueDizem(WidgetTester tester, String trecho) {
  final raiz = tester.getSemantics(find.byType(MaterialApp));
  var vezes = 0;
  void andar(SemanticsNode no) {
    vezes += trecho.allMatches(no.label).length;
    no.visitChildren((filho) {
      andar(filho);
      return true;
    });
  }

  andar(raiz);
  return vezes;
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

      // **ESCRITA POR EXTENSO, e nao lida da constante.** Comparar
      // `find.text(CartaoDaLoja.rotuloDePrecoComData(item))` seria comparar a
      // funcao com ela mesma: ficaria verde com a linha dizendo qualquer
      // coisa, inclusive sem a data. O item de `_itemComPreco` tem
      // `price_checked_at: 2026-03-14`, e `dataCurta` escreve `14/03`.
      expect(
        find.text('Preço de referência, consultado em 14/03'),
        findsOneWidget,
        reason: 'REPROVA: a linha de apoio do preco nao diz a afirmacao E a '
            'data. A data voltou a ESTA linha em 18/10/2026 por pedido '
            'literal do cliente, e e ela que torna verdadeira a clausula de '
            '`web/src/conteudo/juridico/termos.md` ("Essa data aparece junto '
            'do preco, na tela").',
      );
      // E a metade que separa esta linha do rabo que saiu: ela NAO repete o
      // valor. Reponde-lo aqui desfaria a remocao da manha.
      expect(
        find.textContaining('R\$ 89,90 ·'),
        findsNothing,
        reason: 'REPROVA: a linha de apoio voltou a carregar o valor. O rabo '
            'da linha do preco saiu em 18/10/2026 e nao volta por esta porta.',
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
        find.text('Preço de referência, consultado em 14/03'),
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

      // Contado no nivel do NO, pelo motivo escrito em `rotulosQueDizem`: o
      // `find.bySemanticsLabel` que estava aqui ficava verde com o rotulo
      // visivel anunciado, que e exatamente o defeito que este caso nomeia.
      expect(
        vezesQueDizem(tester, 'Preço de referência'),
        1,
        reason: 'REPROVA: a afirmacao do preco e dita um numero de vezes '
            'diferente de um. O rotulo visivel acima do nome e '
            '`ExcludeSemantics` de proposito: anuncia-lo faria o cartao dizer '
            'a afirmacao -- e a data -- duas vezes na mesma leitura, a '
            'primeira antes do nome do produto e sem dizer de que preco fala.',
      );

      // E a contraprova, que impede este arquivo de ficar verde escondendo a
      // afirmacao de todo mundo: o leitor de tela CONTINUA ouvindo "preço de
      // referência", junto do valor, no no do preco.
      //
      // **O ENDERECO DELA MUDOU EM 18/10/2026.** Antes a afirmacao vinha de
      // graca: ela era texto, dentro do no do numero
      // ("R$ 89,90 · preço de referência, consultado em 14/03"). O cliente
      // mandou remover esse rabo; a afirmacao foi para o `semanticsLabel` do
      // mesmo no, por `CartaoDaLoja.rotuloAcessivelDoPreco`. Apagar o rabo sem
      // isto teria deixado quem usa leitor de tela com o numero e nada mais,
      // enquanto quem enxerga continua lendo o rotulo acima do nome -- a
      // regressao silenciosa que este `expect` existe para pegar.
      expect(
        // `RegExp` e nao `String`: `bySemanticsLabel` com string compara o
        // rotulo INTEIRO, e o cartao da vitrine e um `InkWell` -- o no do
        // preco pode vir mesclado com o do cartao. Era `RegExp` antes desta
        // mudanca pela mesma razao.
        find.bySemanticsLabel(RegExp(r'Preço de referência, R\$ 89,90')),
        findsOneWidget,
        reason:
            'REPROVA: o rotulo saiu de perto do valor. O leitor de tela '
            'passou a ouvir o numero sem dizer de que preco ele e.',
      );
      // **E o RABO nao voltou, que e coisa diferente da data ter voltado.**
      //
      // A data agora aparece na tela, e e para aparecer: ela esta na linha de
      // apoio, acima do nome. O que nao pode voltar e a data COLADA NO VALOR,
      // que foi o que o cliente mandou remover de manha. Por isso o alvo e o
      // `·` que unia os dois, e nao a frase "consultado em" -- que agora e
      // legitima.
      expect(
        find.textContaining('R\$ 89,90 ·'),
        findsNothing,
        reason: 'REPROVA: o rabo voltou a linha do preco. A data mora na linha '
            'de apoio desde a tarde de 18/10; grudada no valor, nao.',
      );
      // E o no do valor e **exatamente** o valor, sem sufixo nenhum.
      expect(
        find.text('R\$ 89,90'),
        findsOneWidget,
        reason: 'REPROVA: a linha do preco deixou de ser o valor limpo.',
      );

      manipulador.dispose();
    });

    testWidgets('ISCA — a DATA nao desaparece do rotulo', (tester) async {
      // **POR QUE ESTA ISCA EXISTE.** A data saiu da tela na manha de
      // 18/10/2026, junto com o rabo da linha do preco, e voltou na tarde do
      // mesmo dia por pedido do cliente -- nesta linha. Entre uma coisa e
      // outra, a clausula de `web/src/conteudo/juridico/termos.md` ficou sem
      // lastro: ela diz, por escrito, que *"Essa data aparece junto do preco,
      // na tela"*.
      //
      // Esta isca e o que impede aquela divergencia de voltar calada. Ela
      // reprova se a data sair do rotulo por QUALQUER caminho, e cada caminho
      // esta nomeado abaixo.
      //
      // ISCA, as tres formas de quebrar:
      //   1. em `CartaoDaLoja.build`, troque `rotuloDePrecoComData(item)` por
      //      `rotuloDePrecoDeReferencia`: a afirmacao fica, a data vai embora;
      //   2. em `sufixoDaConsulta`, devolva `null` sempre: mesma coisa, pela
      //      porta do modelo;
      //   3. em `rotuloDePrecoComData`, devolva so a afirmacao quando houver
      //      data: o `if` invertido, que e o erro de uma letra.
      await _abrir(tester, <Map<String, dynamic>>[_itemComPreco()]);

      // As duas metades, separadas de proposito: a primeira reprova dizendo
      // que a data sumiu, a segunda dizendo que a frase inteira mudou.
      expect(
        find.textContaining('consultado em 14/03'),
        findsOneWidget,
        reason: 'REPROVA: a data da consulta nao esta na tela. Com ela fora, a '
            'clausula dos termos ("Essa data aparece junto do preco, na '
            'tela") volta a ser falsa -- e foi essa divergencia que o pedido '
            'do cliente de 18/10 veio fechar.',
      );
      expect(
        find.text('Preço de referência, consultado em 14/03'),
        findsOneWidget,
        reason: 'REPROVA: o rotulo de apoio nao e a afirmacao MAIS a data numa '
            'frase so. A redacao e a do rabo que saiu, sem o valor.',
      );
    });

    testWidgets('ISCA — a data e anunciada UMA vez, e nao duas',
        (tester) async {
      // **POR QUE ESTA ISCA EXISTE.** Com a data no rotulo visivel, o caminho
      // obvio para "devolver a data a quem nao ve" seria tirar o
      // `ExcludeSemantics` daquele rotulo. Isso produziria DOIS anuncios: o
      // rotulo solto, antes do nome do produto, e o no do preco, que ja
      // carrega a data no `semanticsLabel`.
      //
      // Anuncio duplicado nao aparece na tela, nao reprova layout e nao
      // incomoda quem enxerga: e exatamente a classe de defeito que so um caso
      // como este pega. E ele e pior que ruido -- o rotulo solto diria
      // "consultado em 14/03" sem dizer de que preco fala.
      //
      // ISCA: em `CartaoDaLoja.build`, troque o `ExcludeSemantics` que embrulha
      // `rotuloDePrecoComData` por um `Text` cru. Este caso reprova dizendo
      // quantos nos passaram a dizer a data.
      final manipulador = tester.ensureSemantics();
      await _abrir(tester, <Map<String, dynamic>>[_itemComPreco()]);

      // UM no, e um so: o do valor.
      final vezes = vezesQueDizem(tester, 'consultado em 14/03');
      expect(
        vezes,
        1,
        reason: 'REPROVA: a data e dita $vezes vezes na arvore de semantica, e '
            'nao uma. Zero significa que quem nao ve perdeu a data; duas '
            'significa que ela e repetida na mesma leitura do cartao -- o '
            'rotulo visivel acima do nome e o no do preco dizendo a mesma '
            'coisa, um atras do outro.',
      );
      // E esse no e o do preco, com as tres partes na ordem: a afirmacao, o
      // valor e a data. Escrito por extenso.
      expect(
        // `RegExp` e nao `String`: com string, `bySemanticsLabel` compara o
        // rotulo INTEIRO, e o cartao e um `InkWell` -- o no do preco chega
        // mesclado com o do cartao.
        find.bySemanticsLabel(
          RegExp(r'Preço de referência, R\$ 89,90, consultado em 14/03'),
        ),
        findsOneWidget,
        reason: 'REPROVA: o no do preco nao diz a afirmacao, o valor e a data '
            'numa leitura so. Quem nao ve recebe as tres juntas porque quem ve '
            'recebe o bloco inteiro de uma olhada.',
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
        find.textContaining(CartaoDaLoja.rotuloDePrecoDeReferencia),
        findsNothing,
        reason:
            'REPROVA: o rotulo do preco apareceu em cartao que nao tem preco. '
            '`textContaining` de proposito: com a data dentro da frase, um '
            '`find.text` exato deixaria passar a linha que aparecesse com '
            'outra data, ou com "consultado em" pela metade.',
      );
      // E o cartao de preco vencido continua dizendo o que dizia.
      expect(find.text(VitrineDaLoja.precoNaoConfirmado), findsOneWidget);
    });
  });
}
