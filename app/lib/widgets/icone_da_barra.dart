import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/icones_da_barra.g.dart';

/// O `d` de um icone da barra, em `Path`.
Path caminhoDoIcone(String d) {
  final caminho = Path();
  final simbolos = RegExp(r'[MCLZmclz]|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?');
  final fichas = simbolos.allMatches(d).map((m) => m.group(0)!).toList();

  var i = 0;
  double numero(String comando) {
    if (i >= fichas.length) {
      throw FormatException('Faltou número no comando "$comando" do ícone.');
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
      case 'L':
      case 'l':
        caminho.lineTo(numero(comando), numero(comando));
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
          'Comando "$comando" não é M, C, L nem Z. O gerador só emite esses '
          'quatro; um `d` com outro comando não saiu dele.',
        );
    }
  }
  return caminho;
}

/// Um icone da barra de baixo, desenhado a partir do SVG do cliente.
class IconeDaBarra extends StatelessWidget {
  const IconeDaBarra(this.desenho, {super.key});

  final DesenhoDoIcone desenho;

  /// A tinta, pela ordem que o componente manda.
  Color _tinta(BuildContext context) =>
      IconTheme.of(context).color ?? BichuColors.of(context).cores.textPrimary;

  @override
  Widget build(BuildContext context) {
    final tema = IconTheme.of(context);
    final lado = tema.size ?? desenho.lado;
    return SizedBox.square(
      dimension: lado,
      child: CustomPaint(
        painter: _PintorDoIcone(
          desenho: desenho,
          tinta: _tinta(context),
          opacidade: tema.opacity ?? 1.0,
        ),
      ),
    );
  }
}

class _PintorDoIcone extends CustomPainter {
  const _PintorDoIcone({
    required this.desenho,
    required this.tinta,
    required this.opacidade,
  });

  final DesenhoDoIcone desenho;
  final Color tinta;
  final double opacidade;

  @override
  void paint(Canvas canvas, Size size) {
    final escala = size.shortestSide / desenho.lado;
    final cor = tinta.withValues(alpha: tinta.a * opacidade);

    canvas.save();
    canvas.scale(escala);

    for (final grupo in desenho.grupos) {
      final caminho = Path();
      for (final forma in grupo.formas) {
        if (forma.ehCurva) {
          caminho.addPath(caminhoDoIcone(forma.d!), Offset.zero);
        } else {
          caminho.addOval(
            Rect.fromCircle(center: Offset(forma.cx!, forma.cy!), radius: forma.r!),
          );
        }
      }

      if (grupo.preenchido) {
        canvas.drawPath(
          caminho,
          Paint()
            ..color = cor
            ..isAntiAlias = true,
        );
      }
      canvas.drawPath(
        caminho,
        Paint()
          ..color = cor
          ..isAntiAlias = true
          ..style = PaintingStyle.stroke
          ..strokeWidth = desenho.espessura
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(_PintorDoIcone antigo) =>
      antigo.desenho.arquivo != desenho.arquivo ||
      antigo.tinta != tinta ||
      antigo.opacidade != opacidade;
}
