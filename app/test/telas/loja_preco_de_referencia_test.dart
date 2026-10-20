// O PRECO SAIU DA LOJA, E "PRECO DE REFERENCIA" COM ELE -- 18/10/2026.
//
// Decisao do cliente, literal: *"Retire o preco dos produtos da loja e o texto
// de 'preco de referencia'"*.
//
// ---------------------------------------------------------------------------
// ESTE ARQUIVO ERA O CONTRARIO, E A VIRADA E DELE
// ---------------------------------------------------------------------------
//
// Ate esta mesma data, aqui moravam seis casos cobrando que a linha
// `Preço de referência, consultado em 14/03` EXISTISSE acima do nome do
// produto, que ela ficasse `ExcludeSemantics`, que a data nao desaparecesse e
// que o no do preco carregasse a afirmacao junto do valor. Eles nasceram de
// tres pedidos do cliente do MESMO dia:
//
//  1. (manha) *"remova o texto 'preço de referência, consultado em 17/10',
//     porque você já colocou como eu pedi acima do titulo"* -- o rabo saiu da
//     linha do preco;
//  2. (manha) *"vamos colocar a mensagem preco de referencia, em cima do nome
//     do produto"* -- a linha de apoio nasceu;
//  3. (tarde) *"devolve a data onde esta o novo texto de preço de
//     referência"* -- a data voltou a linha de apoio.
//
// E agora o quarto pedido manda os tres embora, junto com o valor. **E
// reversao deliberada, e nao erro de leitura**: quem ler este arquivo em tres
// meses e achar que seis casos foram apagados por descuido esta lendo o commit
// errado. O `git log -p` deste caminho tem as duas metades.
//
// ---------------------------------------------------------------------------
// A ISCA NAO PODE SER CEGA, e esta era a tentacao obvia
// ---------------------------------------------------------------------------
//
// `expect(find.textContaining('Preço de referência'), findsNothing)` fica
// VERDE com a vitrine vazia, com a rota em 404 e com o cartao inteiro apagado.
// Portao cego e o defeito recorrente deste repositorio -- ja houve
// `findsNothing` vacuamente verdadeiro e rotulo de semantica VAZIO fazendo
// `isNot(contains())` passar sem significar nada.
//
// Entao TODO caso deste arquivo ancora primeiro no que TEM de existir no
// cartao -- o titulo do produto e o botao `Compre agora` -- e so depois cobra a
// ausencia do preco. Cartao em branco reprova na ancora.
//
// ---------------------------------------------------------------------------
// DESLIGAR PARA VER REPROVAR -- medido, com o nome do caso
// ---------------------------------------------------------------------------
//
//  1. Em `CartaoDaLoja.build` (`lib/telas/loja/vitrine_da_loja.dart`),
//     devolva o `Text(item.linhaDoPreco!, ...)` acima de `Compre agora`.
//     -> reprova `o VALOR nao esta no cartao` e
//        `o leitor de tela nao ouve preco nenhum`.
//  2. No mesmo lugar, devolva o `ExcludeSemantics(child: Text(
//     rotuloDePrecoComData(item)))` acima do titulo.
//     -> reprova `a linha de apoio "Preço de referência" nao esta no cartao`.
//  3. No mesmo lugar, devolva o ramo
//     `else if (item.estadoDoPreco == EstadoDoPreco.vencido)` com
//     `VitrineDaLoja.precoNaoConfirmado`.
//     -> reprova `a clausula do preco vencido saiu junto, por ficar orfa`.
//  4. Em `_Cabecalho` (`lib/telas/loja/produto_da_loja.dart`), devolva os dois
//     ramos de preco.
//     -> reprova os casos de `loja_detalhe_do_produto_test.dart`, que medem a
//        mesma remocao na pagina PARADA da secao.

import 'package:bichu/telas/loja/vitrine_da_loja.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart' show SemanticsNode;
import 'package:flutter_test/flutter_test.dart';

import 'loja_com_dados_test.dart'
    show abrirLoja, itemDoContrato, paginaDoContrato, redeDaVitrine;

/// Um item COM preco vigente: era o unico estado em que a linha nascia, e e o
/// unico em que a remocao e observavel.
///
/// **Um item sem preco nao prova nada aqui.** Com `price_status: sem_preco` o
/// cartao nunca desenhou valor nenhum, e o caso ficaria verde com a remocao
/// desfeita.
Map<String, dynamic> _itemComPreco() => itemDoContrato(
  title: 'Bola Pop',
  priceAmount: 8990,
  priceCheckedAt: '2026-03-14',
  priceStatus: 'vigente',
);

/// Um item com o preco VENCIDO: o ramo que desenhava a clausula visual.
Map<String, dynamic> _itemComPrecoVencido() =>
    itemDoContrato(title: 'Cama Nuvem', priceStatus: 'vencido');

Future<void> _abrir(
  WidgetTester tester,
  List<Map<String, dynamic>> itens,
) async {
  await abrirLoja(tester, rede: redeDaVitrine(paginaDoContrato(itens)));
}

/// A ANCORA de todo caso deste arquivo: o cartao existe e esta inteiro.
///
/// Sem ela, cada `findsNothing` abaixo passaria com a vitrine vazia -- e o
/// arquivo afirmaria que o preco saiu quando o que saiu foi a lista.
void _ancorarNoCartao(WidgetTester tester, String titulo) {
  expect(
    find.byType(CartaoDaLoja),
    findsWidgets,
    reason:
        'REPROVA NA ANCORA: nao ha cartao nenhum na vitrine. Este arquivo '
        'cobra AUSENCIA de preco, e ausencia sobre tela vazia e o portao cego '
        'que este repositorio ja produziu duas vezes.',
  );
  expect(
    find.text(titulo),
    findsOneWidget,
    reason:
        'REPROVA NA ANCORA: o titulo "$titulo" nao esta no cartao. Depois '
        'da remocao do preco o cartao tem carrossel, TITULO e `Compre '
        'agora` -- se o titulo sumiu, nao foi so o preco que saiu.',
  );
  expect(
    find.text(CartaoDaLoja.rotuloDeSaida),
    findsWidgets,
    reason:
        'REPROVA NA ANCORA: "${CartaoDaLoja.rotuloDeSaida}" nao esta no '
        'cartao. A saida para o parceiro e o que o cartao existe para '
        'oferecer, e a remocao do preco nao a toca.',
  );
}

/// Quantas vezes [trecho] e DITO na arvore de semantica inteira.
///
/// **Conta OCORRENCIAS, e nao nos**, e a razao esta medida: o `InkWell` do
/// cartao MESCLA os filhos num no de semantica so, entao contar nos devolve
/// `1` tanto para "falado uma vez" quanto para "falado duas vezes dentro do
/// mesmo rotulo". O que importa e quantas vezes quem usa leitor de tela ouve a
/// frase.
///
/// **Ela e a METADE QUE O `find.text` NAO COBRE.** O valor do preco viajava
/// com `semanticsLabel: rotuloAcessivelDoPreco(item)`, que **nao e texto na
/// tela**: um arquivo que so olhasse `find.text` aprovaria um cartao que
/// continuasse dizendo "Preço de referência, R$ 89,90" para quem nao ve.
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
  group('o preco saiu do cartao da vitrine', () {
    testWidgets('o VALOR nao esta no cartao', (tester) async {
      await _abrir(tester, <Map<String, dynamic>>[_itemComPreco()]);
      _ancorarNoCartao(tester, 'Bola Pop');

      // `R$ 89,90` escrito A MAO, e nao lido de `ItemDaLoja.linhaDoPreco`:
      // comparar com a funcao que produz o texto deixaria o caso verde com
      // qualquer formatacao, inclusive com a que o cliente mandou remover.
      expect(
        find.textContaining('R\$'),
        findsNothing,
        reason:
            'REPROVA: o cartao da vitrine mostra preco. O cliente mandou '
            'retirar o preco dos produtos da Loja em 18/10/2026, e o item '
            'desta massa tem `price_amount: 8990` e `price_status: vigente` '
            '-- exatamente o estado em que o valor aparecia.',
      );
      expect(
        find.text('R\$ 89,90'),
        findsNothing,
        reason: 'REPROVA: o valor formatado continua na tela.',
      );
    });

    testWidgets('a linha de apoio "Preço de referência" nao esta no cartao', (
      tester,
    ) async {
      await _abrir(tester, <Map<String, dynamic>>[_itemComPreco()]);
      _ancorarNoCartao(tester, 'Bola Pop');

      expect(
        find.textContaining('Preço de referência'),
        findsNothing,
        reason:
            'REPROVA: a linha de apoio voltou. Ela nasceu na manha de '
            '18/10/2026 por pedido literal do cliente e saiu no fim do '
            'mesmo dia pelo pedido dele de retirar "o texto de preco de '
            'referencia". E reversao deliberada.',
      );
      expect(
        find.textContaining('consultado em'),
        findsNothing,
        reason:
            'REPROVA: a data da consulta continua na tela. Ela viajava '
            'colada na afirmacao ("Preço de referência, consultado em '
            '14/03"), e sai com ela: data de consulta de um preco que nao '
            'esta mais na tela nao se refere a nada.',
      );
    });

    testWidgets('a clausula do preco vencido saiu junto, por ficar orfa', (
      tester,
    ) async {
      await _abrir(tester, <Map<String, dynamic>>[_itemComPrecoVencido()]);
      _ancorarNoCartao(tester, 'Cama Nuvem');

      // A frase escrita A MAO, com acento e pontuacao: um `expect` que lesse
      // `VitrineDaLoja.precoNaoConfirmado` acompanharia a constante para
      // sempre, inclusive se ela voltasse a ser desenhada com outra redacao.
      expect(
        find.text('Preço não confirmado, veja no site do parceiro'),
        findsNothing,
        reason:
            'REPROVA: o cartao ainda anuncia que o preco nao esta '
            'confirmado. **Esta era a clausula VISUAL que acompanhava o '
            'preco**, e ela ficou ORFA: a frase existia para ocupar o lugar '
            'de um valor que a pessoa esperava, e nao ha mais lugar nenhum. '
            'Mantida, ela anunciaria a ausencia de uma informacao que o '
            'cartao nao oferece em nenhum estado.',
      );
      expect(
        find.textContaining('Preço'),
        findsNothing,
        reason:
            'REPROVA: a palavra "Preço" continua no cartao de um produto '
            'da Loja.',
      );
    });

    testWidgets('o leitor de tela nao ouve preco nenhum', (tester) async {
      // A METADE QUE `find.text` NAO VE. O valor viajava com
      // `semanticsLabel: rotuloAcessivelDoPreco(item)`, que montava
      // "Preço de referência, R$ 89,90, consultado em 14/03" **sem** nada
      // disso aparecer na tela. Apagar so o texto visivel teria deixado quem
      // usa leitor de tela ouvindo o preco que o cliente mandou retirar.
      final manipulador = tester.ensureSemantics();
      await _abrir(tester, <Map<String, dynamic>>[_itemComPreco()]);
      _ancorarNoCartao(tester, 'Bola Pop');

      // ANCORA DA SEMANTICA: a arvore esta ligada e tem conteudo. Um rotulo
      // VAZIO fazendo a contagem dar zero e exatamente o portao cego que este
      // repositorio ja produziu uma vez.
      expect(
        vezesQueDizem(tester, 'Bola Pop'),
        greaterThan(0),
        reason:
            'REPROVA NA ANCORA: a arvore de semantica nao diz "Bola Pop". '
            'As contagens de zero abaixo nao significariam nada.',
      );

      expect(
        vezesQueDizem(tester, 'Preço de referência'),
        0,
        reason:
            'REPROVA: o leitor de tela ainda ouve "Preço de referência". '
            'A afirmacao morava no `semanticsLabel` do no do valor desde a '
            'manha de 18/10 -- ela nao e texto na tela, e um arquivo que so '
            'olhasse `find.text` aprovaria este estado.',
      );
      expect(
        vezesQueDizem(tester, 'R\$'),
        0,
        reason:
            'REPROVA: o leitor de tela ainda ouve um valor em reais no '
            'cartao da Loja.',
      );
      manipulador.dispose();
    });
  });

  group('o que a remocao NAO levou', () {
    testWidgets('a constante juridica continua no repositorio', (tester) async {
      // **NAO E TESTE DE TELA, e por isso nao abre nenhuma.** Ele existe
      // porque o repositorio tem uma regra escrita sobre isto: o texto de
      // natureza juridica fica no arquivo mesmo quando para de ser desenhado
      // (ver `VitrineDaLoja.avisoDeQueNaoSomosOVendedor`, que esta no mesmo
      // estado desde 17/10). Apagar a redacao junto com o widget tiraria do
      // repositorio a unica copia do que o produto afirmava a quem comprava.
      //
      // **A clausula dos TERMOS e outra coisa e nao foi tocada.**
      // `web/src/conteudo/juridico/termos.md` continua dizendo que a
      // plataforma nao vende nada e que precos sao referencia. Ela fala do que
      // o Bichu e, e nao do que o cartao pinta.
      expect(
        VitrineDaLoja.precoNaoConfirmado,
        'Preço não confirmado, veja no site do parceiro',
        reason:
            'REPROVA: a redacao da clausula do preco vencido mudou ou '
            'desapareceu do codigo. Ela saiu da TELA em 18/10/2026 e fica no '
            'arquivo como registro -- quem reabrir a decisao encontra a '
            'redacao exata.',
      );
      expect(
        VitrineDaLoja.avisoDeQueNaoSomosOVendedor,
        contains('O Bichu não é o vendedor'),
        reason:
            'REPROVA: o aviso de que nao somos o vendedor saiu do codigo. '
            'Ele nao e desenhado desde 17/10 e continua aqui pelo mesmo '
            'motivo.',
      );
    });

    testWidgets('o cartao continua levando ao parceiro', (tester) async {
      // CONTRAPESO. Sem ele, apagar o cartao inteiro satisfaria os quatro
      // casos de ausencia acima -- e e justamente contra isso que as ancoras
      // existem. Este caso diz, por fora, o que o cartao PASSA a ser: foto,
      // titulo e `Compre agora`.
      await _abrir(tester, <Map<String, dynamic>>[_itemComPreco()]);

      expect(find.byType(CartaoDaLoja), findsOneWidget);
      expect(
        find.text('Bola Pop'),
        findsOneWidget,
        reason:
            'REPROVA: o titulo do produto saiu junto com o preco. O '
            'cliente mandou remover o PRECO, e em 17/10 ele havia mandado '
            '*"Deixe apenas a foto, titulo e preco"* -- sobram foto e titulo.',
      );
      expect(
        find.widgetWithText(OutlinedButton, CartaoDaLoja.rotuloDeSaida),
        findsOneWidget,
        reason:
            'REPROVA: a saida para o site do parceiro saiu do cartao. A '
            'Loja e uma vitrine de saida, e a compra acontece la.',
      );
    });
  });
}
