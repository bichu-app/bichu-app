// JUNTA OS PAINEIS JA RASTERIZADOS NUMA IMAGEM SO, LADO A LADO.
//
// Por que um compositor em vez de desenhar os tres arranjos numa arvore so:
// cada arranjo e um estado DIFERENTE do mesmo arquivo de `lib/`, e um processo
// de teste carrega UMA versao dele. Desenhar os tres juntos exigiria copiar o
// layout para dentro do teste -- e ai a imagem mostraria o que eu escrevi no
// teste, nao o que o widget faz. Cada painel aqui saiu do widget de verdade,
// com o `lib/` daquele arranjo no disco.
//
// Por que em Dart e nao com ferramenta de imagem: esta maquina nao tem PIL nem
// ImageMagick (medido), e o `sips` do macOS nao ladrilha. `dart:ui` ja tem o
// decodificador e o codificador, e e o mesmo motor que rasterizou os paineis.
//
// Nao termina em `_test.dart`: a suite nao o descobre.
//
//   cd app && BICHU_PAINEIS=a.png,b.png,c.png BICHU_JUNTADO=/saida.png \
//     flutter test test/telas/juntar_paineis_do_cartao.dart

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const double _vao = 48;
const Color _fundo = Color(0xFFE9E7E2);

void main() {
  testWidgets('junta os paineis do cartao', (tester) async {
    final entrada = Platform.environment['BICHU_PAINEIS'];
    final saida = Platform.environment['BICHU_JUNTADO'];
    if (entrada == null || saida == null) {
      throw StateError(
        'REPROVA: defina `BICHU_PAINEIS` (caminhos separados por virgula) e '
        '`BICHU_JUNTADO` (o PNG de saida). Sem os dois nao ha o que juntar, e '
        'sair verde sem escrever nada e a aparencia de sucesso que este '
        'arquivo existe para evitar.',
      );
    }
    final caminhos = entrada.split(',');

    late List<ui.Image> imagens;
    late ui.Image resultado;
    late List<int> bytes;

    await tester.runAsync(() async {
      imagens = <ui.Image>[];
      for (final c in caminhos) {
        final arquivo = File(c);
        if (!arquivo.existsSync()) {
          throw StateError('REPROVA: nao achei o painel "$c".');
        }
        final codec = await ui.instantiateImageCodec(
          await arquivo.readAsBytes(),
        );
        imagens.add((await codec.getNextFrame()).image);
      }

      // O GUARDA CONTRA JUNTAR LIXO: painel de poucos pixels e tela em branco,
      // e tres telas em branco lado a lado continuam sendo nada.
      for (var i = 0; i < imagens.length; i++) {
        if (imagens[i].width < 300 || imagens[i].height < 300) {
          throw StateError(
            'REPROVA: o painel "${caminhos[i]}" tem '
            '${imagens[i].width}x${imagens[i].height}. Isso nao e um cartao.',
          );
        }
      }

      final larguraTotal = imagens.fold<double>(0, (a, i) => a + i.width.toDouble()) +
          _vao * (imagens.length + 1);
      final alturaMaxima =
          imagens.fold<double>(0, (a, i) => a > i.height ? a : i.height.toDouble());
      final alturaTotal = alturaMaxima + _vao * 2;

      final gravador = ui.PictureRecorder();
      final tela = Canvas(gravador);
      tela.drawRect(
        Rect.fromLTWH(0, 0, larguraTotal, alturaTotal),
        Paint()..color = _fundo,
      );
      var x = _vao;
      for (final imagem in imagens) {
        tela.drawImage(imagem, Offset(x, _vao), Paint());
        x += imagem.width + _vao;
      }
      resultado = await gravador.endRecording().toImage(
            larguraTotal.toInt(),
            alturaTotal.toInt(),
          );
      final dados = await resultado.toByteData(format: ui.ImageByteFormat.png);
      bytes = dados!.buffer.asUint8List();
    });

    if (bytes.length < 50000) {
      throw StateError(
        'REPROVA: a imagem juntada saiu com ${bytes.length} bytes. Nesta area '
        'isso e fundo liso.',
      );
    }
    File(saida).writeAsBytesSync(bytes);
    // ignore: avoid_print
    print('JUNTADO: $saida (${resultado.width}x${resultado.height}, '
        '${bytes.length} bytes)');
  });
}
