import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Um bloco de informacao: um titulo e as linhas dele.
class BlocoDeInformacao extends StatelessWidget {
  const BlocoDeInformacao({
    required this.titulo,
    required this.linhas,
    super.key,
  });

  final String titulo;
  final List<String> linhas;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final cheias = linhas.where((l) => l.isNotEmpty).toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(header: true, child: Text(titulo, style: textos.titleMedium)),
        for (final linha in cheias) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            linha,
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
        ],
      ],
    );
  }
}
