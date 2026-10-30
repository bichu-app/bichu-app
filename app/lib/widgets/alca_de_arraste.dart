/// A alça no topo de uma folha, **decorativa**.
library;

import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A alça: 36 x 4, no `outline`, centrada.
class AlcaDeArraste extends StatelessWidget {
  const AlcaDeArraste({super.key});

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: Center(
        child: Container(
          width: 36,
          height: 4,
          margin: const EdgeInsets.symmetric(vertical: BichuEspaco.e3),
          decoration: BoxDecoration(
            color: cores.outline,
            borderRadius: BorderRadius.circular(BichuRaio.full),
          ),
        ),
      ),
    );
  }
}
