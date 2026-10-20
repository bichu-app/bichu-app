// ARRASTAR O CARROSSEL NAO SAI DA LOJA, e tocar no cartao sai.
//
// POR QUE ESTE ARQUIVO NASCEU NA MESCLA, e nao na branch do carrossel. Duas
// decisoes do cliente de 17/10/2026 se encontraram aqui:
//
//   1. "remova o clique para entrar na pagina de detalhes do produto e coloque
//      para abrir o site do parceiro" -- o cartao INTEIRO passou a sair para o
//      parceiro, pela porta `SaidaDoApp`.
//   2. o carrossel entrou DENTRO desse mesmo cartao.
//
// O autor do carrossel mediu o gesto no desenho ANTIGO, em que arrastar nao
// podia abrir o DETALHE INTERNO. Depois da mescla o destino do cartao mudou, e
// com ele o custo do defeito: arrastar para ver a segunda foto nao pode mais
// jogar a pessoa para FORA DO APLICATIVO, no navegador do parceiro. O gesto
// mudou, logo a medicao e refeita -- e e refeita aqui, uma vez, e nao em dois
// arquivos que divergem.
//
// O caso ISCA diz, no corpo, o que apagar para ele reprovar.

import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/widgets/carrossel_de_fotos.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'loja_com_dados_test.dart'
    show abrirLoja, itemDoContrato, paginaDoContrato, redeDaVitrine;

/// A porta de saida, de mentira: guarda para onde pediram para ir.
///
/// Os outros metodos lancam em vez de devolver valor morno: se a vitrine um dia
/// chamar o app de mapas, este arquivo reprova em vez de ficar calado.
class _SaidaDeMentira extends SaidaDoApp {
  final List<Uri> links = <Uri>[];

  @override
  Future<bool> abrirLink(Uri link) async {
    links.add(link);
    return true;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async =>
      throw StateError('a vitrine da Loja nao abre o app de mapas');

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async =>
      throw StateError('a vitrine da Loja nao abre o app de mapas');

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async =>
      throw StateError('a vitrine da Loja nao escreve no calendario');

  @override
  Future<bool> compartilharTexto({
    required String texto,
    required String assunto,
  }) async {
    // Este arquivo nao fala de compartilhamento. Devolver `false` e o lado
    // escondido, e o dia em que alguem o chamar daqui o teste nao vai afirmar
    // que a folha abriu.
    return false;
  }
}

/// Um item com TRES fotos, para o cartao virar `PageView` de verdade.
///
/// Com uma foto so `CarrosselDeFotos` desenha a mesma `Image` de antes, sem
/// `PageView` e sem gesto: nao haveria arrasto para medir.
Map<String, dynamic> _itemComTresFotos() {
  final item = itemDoContrato(imageUrl: 'https://cdn.exemplo/1.jpg');
  item['images'] = <Map<String, dynamic>>[
    <String, dynamic>{'url': 'https://cdn.exemplo/1.jpg', 'alt_text': 'de frente'},
    <String, dynamic>{'url': 'https://cdn.exemplo/2.jpg', 'alt_text': 'de lado'},
    <String, dynamic>{'url': 'https://cdn.exemplo/3.jpg', 'alt_text': null},
  ];
  return item;
}

Future<void> _abrirComCarrossel(WidgetTester tester) async {
  await abrirLoja(
    tester,
    rede: redeDaVitrine(
      paginaDoContrato(<Map<String, dynamic>>[_itemComTresFotos()]),
    ),
  );
}

void main() {
  late _SaidaDeMentira saida;

  setUp(() {
    saida = _SaidaDeMentira();
    SaidaDoApp.atual = saida;
  });

  tearDown(SaidaDoApp.restaurar);

  group('o carrossel vive dentro do alvo de toque do cartao', () {
    testWidgets('o cartao com varias fotos desenha o `PageView`', (tester) async {
      await _abrirComCarrossel(tester);

      // Sem isto os dois casos abaixo poderiam ficar verdes por nao haver
      // carrossel nenhum na tela -- que e a forma de este arquivo medir nada.
      expect(find.byType(CarrosselDeFotos), findsOneWidget);
      expect(find.byType(PageView), findsOneWidget);
    });

    testWidgets(
      'ARRASTAR para ver a proxima foto NAO abre o site do parceiro',
      (tester) async {
        await _abrirComCarrossel(tester);

        final pagina = find.byType(PageView);
        // Arrasto horizontal largo, a partir do centro do `PageView`: e o
        // gesto que o dedo faz para ver a segunda foto.
        await tester.drag(pagina, const Offset(-320, 0));
        await tester.pumpAndSettle();

        // O QUE ESTE ARQUIVO EXISTE PARA COBRAR.
        expect(
          saida.links,
          isEmpty,
          reason: 'REPROVA: arrastar o carrossel jogou a pessoa para fora do '
              'aplicativo. O `PageView` precisa reivindicar o arrasto '
              'horizontal na arena de gestos antes de o `InkWell` do cartao '
              'resolver o toque.',
        );
      },
    );

    testWidgets(
      'TOCAR no cartao continua abrindo o site do parceiro',
      (tester) async {
        // ISCA deste caso -- em `CartaoDaLoja.build`
        // (`app/lib/telas/loja/vitrine_da_loja.dart`), troque o `onTap` do
        // `InkWell` por `null`. Sem ele a decisao do cliente de 17/10 ("coloque
        // para abrir o site do parceiro") deixa de valer para o cartao, e o
        // caso de cima ficaria verde pelo motivo errado: nada abre nunca.
        await _abrirComCarrossel(tester);

        // No TITULO, e nao no carrossel nem no botao: o titulo e area do
        // cartao, e e o `InkWell` do cartao que responde por ela.
        await tester.tap(find.text('Bola Pop'));
        await tester.pumpAndSettle();

        expect(saida.links, hasLength(1));
        expect(saida.links.single.host, 'cobasi.com.br');
      },
    );
  });
}
