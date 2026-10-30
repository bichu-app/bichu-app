import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'barra_do_teclado.dart';

/// A barra de acao fixa do rodape (design system 11.8).
class BarraDeAcaoFixa extends StatelessWidget {
  const BarraDeAcaoFixa({required this.acoes, super.key});

  /// Da principal para a ultima.
  final List<Widget> acoes;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return ValueListenableBuilder<double>(
      valueListenable: BarraDoTeclado.alturaEmUso,
      builder: (context, faixaDoTeclado, filho) {
        final double teclado = MediaQuery.viewInsetsOf(context).bottom;
        final double reserva = teclado > 0 ? faixaDoTeclado : 0;
        return Padding(
          padding: EdgeInsets.only(bottom: teclado + reserva),
          child: filho,
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: cores.surface,
          border: Border(
            top: BorderSide(color: cores.outline, width: BichuBorda.hairline),
          ),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                for (var i = 0; i < acoes.length; i++) ...<Widget>[
                  if (i > 0) const SizedBox(height: BichuEspaco.e3),
                  acoes[i],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// O passo do assistente de cadastro, dito em texto e nao so em barra.
class IndicadorDePasso extends StatelessWidget {
  const IndicadorDePasso({
    required this.passo,
    required this.total,
    required this.titulo,
    super.key,
  });

  final int passo;
  final int total;
  final String titulo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          child: Text(
            'Passo $passo de $total',
            style: textos.labelMedium?.copyWith(color: cores.primary),
          ),
        ),
        const SizedBox(height: BichuEspaco.e2),
        Semantics(
          header: true,
          child: Text(titulo, style: textos.headlineSmall),
        ),
      ],
    );
  }
}
