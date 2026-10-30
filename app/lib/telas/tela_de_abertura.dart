import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../widgets/marca.dart';

/// A tela de abertura.
class TelaDeAbertura extends StatelessWidget {
  const TelaDeAbertura({super.key});

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    final larguraDaTela = MediaQuery.sizeOf(context).width;
    final larguraDaMarca = math.max(
      MarcaLockup.pisoDeLargura,
      math.min<double>(200, larguraDaTela - BichuEspaco.e6 * 2),
    );

    return Scaffold(
      backgroundColor: cores.surface,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            MarcaLockup(largura: larguraDaMarca),
            const SizedBox(height: BichuEspaco.e6),
            Semantics(
              liveRegion: true,
              label: 'Abrindo o Bichu',
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: cores.primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
