/// O logotipo do Bichu, desenhado a partir do vetor da marca.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../theme/marca_vetor.g.dart';

/// Converte o atributo `d` de um SVG da marca num [Path].
Path caminhoDaMarca(String d) {
  final caminho = Path()..fillType = PathFillType.evenOdd;
  final simbolos = RegExp(r'[MCZmcz]|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?');
  final fichas = simbolos.allMatches(d).map((m) => m.group(0)!).toList();

  var i = 0;
  double numero(String comando) {
    if (i >= fichas.length) {
      throw FormatException('Faltou número no comando "$comando" do caminho da marca.');
    }
    final f = fichas[i++];
    final v = double.tryParse(f);
    if (v == null) {
      throw FormatException('Esperava número no comando "$comando" e achei "$f".');
    }
    return v;
  }

  while (i < fichas.length) {
    final comando = fichas[i++];
    switch (comando) {
      case 'M':
      case 'm':
        caminho.moveTo(numero(comando), numero(comando));
      case 'C':
      case 'c':
        caminho.cubicTo(
          numero(comando),
          numero(comando),
          numero(comando),
          numero(comando),
          numero(comando),
          numero(comando),
        );
      case 'Z':
      case 'z':
        caminho.close();
      default:
        throw FormatException(
          'Comando "$comando" não é M, C nem Z. O derivador da marca só emite '
          'esses três; um arquivo com outro comando não foi gerado por ele.',
        );
    }
  }
  return caminho;
}

/// O símbolo isolado, na variante certa para o tamanho pedido.
class MarcaSimbolo extends StatelessWidget {
  const MarcaSimbolo({required this.altura, super.key, this.rotulo = 'Bichu'});

  /// Altura em pixels lógicos.
  final double altura;

  /// O que o leitor de tela anuncia.
  final String rotulo;

  /// Qual variante serve um dado tamanho, pela §3.10 do design system.
  static VetorDaMarca varianteParaAltura(double altura) =>
      altura >= MarcaVetor.simbolo.pisoPx
          ? MarcaVetor.simbolo
          : MarcaVetor.simboloReduzido;

  @override
  Widget build(BuildContext context) {
    assert(
      altura >= MarcaVetor.simboloReduzido.pisoPx,
      'MarcaSimbolo a ${altura}px: abaixo do piso medido de '
      '${MarcaVetor.simboloReduzido.pisoPx}px da variante reduzida (§3.10). '
      'Nesses tamanhos o que serve é design/marca/vetor/selo-reduzido.svg, que '
      'é ativo de favicon e de ícone nativo, não widget.',
    );
    final vetor = varianteParaAltura(altura);
    return _PinturaDaMarca(
      vetor: vetor,
      largura: altura * vetor.largura / vetor.altura,
      altura: altura,
      rotulo: rotulo,
    );
  }
}

/// O lockup horizontal sem o descritor: símbolo mais a palavra "Bichu".
class MarcaLockup extends StatelessWidget {
  const MarcaLockup({required this.largura, super.key, this.rotulo = 'Bichu'});

  /// O piso de redução do lockup sem descritor, em pixels lógicos (§3.10).
  static double get pisoDeLargura => MarcaVetor.lockupSemDescritor.pisoPx;

  /// Largura em pixels lógicos.
  final double largura;

  final String rotulo;

  @override
  Widget build(BuildContext context) {
    const vetor = MarcaVetor.lockupSemDescritor;
    assert(
      largura >= vetor.pisoPx,
      'MarcaLockup a ${largura}px de largura: abaixo do piso medido de '
      '${vetor.pisoPx}px (§3.10). Abaixo dele o símbolo dentro do lockup cai '
      'sob 48px e a palavra funde. Use MarcaSimbolo.',
    );
    return _PinturaDaMarca(
      vetor: vetor,
      largura: largura,
      altura: largura * vetor.altura / vetor.largura,
      rotulo: rotulo,
    );
  }
}

class _PinturaDaMarca extends StatelessWidget {
  const _PinturaDaMarca({
    required this.vetor,
    required this.largura,
    required this.altura,
    required this.rotulo,
  });

  final VetorDaMarca vetor;
  final double largura;
  final double altura;
  final String rotulo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: rotulo,
      image: true,
      child: ExcludeSemantics(
        child: CustomPaint(
          size: Size(largura, altura),
          painter: _PintorDaMarca(
            vetor: vetor,
            tintas: <Color>[
              for (final camada in vetor.camadas) _corDoPapel(cores, camada.papel),
            ],
          ),
        ),
      ),
    );
  }
}

/// Resolve o nome do papel emitido pelo gerador.
Color _corDoPapel(BichuCores cores, String papel) {
  switch (papel) {
    case 'primary':
      return cores.primary;
    case 'actionFillRawDoNotUseAsText':
      return cores.actionFillRawDoNotUseAsText;
    case 'communityFillRawDoNotUseAsText':
      return cores.communityFillRawDoNotUseAsText;
    default:
      throw StateError(
        'A marca pede o papel de cor "$papel", que não existe em BichuCores. '
        'Rode `dart run tool/gen_marca.dart` ou acerte o mapa de camadas do '
        'gerador — nenhuma cor da marca se resolve fora do tema.',
      );
  }
}

class _PintorDaMarca extends CustomPainter {
  _PintorDaMarca({required this.vetor, required this.tintas});

  final VetorDaMarca vetor;
  final List<Color> tintas;

  @override
  void paint(Canvas canvas, Size size) {
    final escala = size.width / vetor.largura;
    canvas
      ..save()
      ..scale(escala)
      ..translate(-vetor.origemX, -vetor.origemY);
    for (var i = 0; i < vetor.camadas.length; i++) {
      canvas.drawPath(
        caminhoDaMarca(vetor.camadas[i].d),
        Paint()
          ..color = tintas[i]
          ..isAntiAlias = true,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_PintorDaMarca antigo) =>
      antigo.vetor.arquivo != vetor.arquivo ||
      !listEquals(antigo.tintas, tintas);
}
