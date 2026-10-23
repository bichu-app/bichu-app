// A COR DO `x` DE FECHAR NO LEITOR DE QR (cliente, 22/10/2026).
//
// Literal: *"Na tela de escanear o qr-code do pet ou do usuario, o x para
// fechar deve ser branco, em algumas paginas ele esta ficando cinza ou preto e
// nao esta dando muita leitura"*.
//
// ---------------------------------------------------------------------------
// ELE MEDE A PROPRIEDADE, E NAO O FONTE
// ---------------------------------------------------------------------------
// A cor sai de `SaidaDaTela`, que a passa ao `IconButton` por `color:`. Ler o
// arquivo procurando `Colors.white` seria o portao que este repositorio ja
// teve e que ficou verde num defeito real em onze telas (o que lia
// `AlwaysScrollableScrollPhysics`). Aqui o caso pega o `IconTheme` que o
// `IconButton` instala em volta do glifo na ARVORE RENDERIZADA e le o valor
// efetivo -- que e a cor com que o `x` e pintado.
//
// ---------------------------------------------------------------------------
// BRANCO **SO SOBRE O VISOR**, e os DOIS lados sao medidos aqui
// ---------------------------------------------------------------------------
// `EstadoDoLeitor.procurando` e o unico dos seis estados em que a imagem da
// camera ocupa a tela atras do glifo. Nos outros o fundo e superficie clara do
// tema, e branco ali reproduziria o defeito dele ao contrario -- glifo branco
// em fundo claro tambem nao se le.
//
// **A redacao do pedido nao fez essa distincao; ela e minha, e esta no
// relatorio para ele decidir.** O caso de baixo e o que a torna visivel: se
// ele decidir "branco sempre", e esse caso que muda.
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/widgets/saida_da_tela.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// O backend nao tem `GET /v1/tags/{code}`, e estes casos nem chegam a ler
/// codigo: eles medem a COR da saida no estado de abertura.
Future<http.Response> _semServidor(http.Request _) async =>
    http.Response('', 404);


/// A cor EFETIVA com que o glifo de fechar e pintado.
///
/// Vem do `IconTheme` que o `IconButton` instala em volta do `Icon` -- e nao
/// do `Icon.color`, que o widget deixa nulo de proposito para herdar do tema.
Color? _corDoXDeFechar(WidgetTester tester) {
  final glifo = find.descendant(
    of: find.byType(SaidaDaTela),
    matching: find.byIcon(Icons.close),
  );
  expect(
    glifo,
    findsOneWidget,
    reason: 'REPROVA: nao ha glifo de fechar dentro de `SaidaDaTela`. Sem ele '
        'nao ha cor para medir, e a leitura abaixo nao mede nada.',
  );
  return IconTheme.of(tester.element(glifo)).color;
}

void main() {
  // DESLIGAR PARA VER REPROVAR: em
  // `lib/telas/escanear/tela_leitor_de_qr.dart`, apague o argumento `cor:` da
  // `SaidaDaTela` (ou troque `Colors.white` por `null`). Este caso reprova
  // dizendo a cor que saiu no lugar do branco.
  testWidgets('sobre o visor da camera, o `x` de fechar e BRANCO',
      (tester) async {
    await abrirOApp(
      tester,
      rede: _semServidor,
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
      leitorDeQr: LeitorDeQrDeTeste(),
    );
    await irAoLeitorDeQr(tester);

    // CONTROLE POSITIVO do ESTADO, e ele vem primeiro: com a permissao
    // concedida e um leitor embarcado, a tela esta em `procurando` -- que e o
    // unico estado com a camera atras do glifo. Sem isto o caso poderia estar
    // medindo a cor de outro estado e passar por engano.
    expect(
      find.byTooltip('Fechar'),
      findsOneWidget,
      reason: 'REPROVA: o leitor nao abriu com a saida sobreposta.',
    );

    final cor = _corDoXDeFechar(tester);
    expect(
      cor,
      Colors.white,
      reason:
          'REPROVA: o `x` de fechar sobre o visor da camera esta pintado em '
          '$cor, e nao em branco. Sobre a imagem da camera o `textPrimary` do '
          'tema claro e um cinza-escuro que desaparece no video -- e e '
          'exatamente o que o cliente relatou em 22/10/2026.',
    );
  });

  // CONTROLE NEGATIVO, e ele e a outra metade da decisao: fora do visor o
  // glifo NAO pode ser branco, senao o conserto troca um defeito de leitura
  // por outro.
  //
  // DESLIGAR PARA VER REPROVAR: troque a condicao `_estado ==
  // EstadoDoLeitor.procurando ? Colors.white : null` por `Colors.white` fixo.
  // Este caso reprova.
  testWidgets('sem camera embarcada, o `x` NAO e branco', (tester) async {
    await abrirOApp(
      tester,
      rede: _semServidor,
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
      // Sem leitor: a tela cai em `EstadoDoLeitor.semLeitor`, que desenha
      // conteudo normal sobre superficie clara do tema.
      leitorDeQr: LeitorDeQrDeTeste(embarcado: false),
    );
    await irAoLeitorDeQr(tester);

    expect(
      find.byTooltip('Fechar'),
      findsOneWidget,
      reason: 'REPROVA (controle positivo): a saida nao esta na tela.',
    );

    final cor = _corDoXDeFechar(tester);
    expect(
      cor,
      isNot(Colors.white),
      reason:
          'REPROVA: o `x` de fechar esta BRANCO num estado em que o fundo e '
          'superficie clara do tema (sem camera embarcada). Branco ali nao se '
          'le, que e o mesmo defeito que o cliente relatou -- ao contrario. A '
          'cor tem de seguir o ESTADO da tela, e nao a tela.',
    );
  });
}
