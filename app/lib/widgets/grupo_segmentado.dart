import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Uma opcao do grupo segmentado: o valor que vai ao servidor e o rotulo que a
/// pessoa le.
class OpcaoSegmentada<T> {
  const OpcaoSegmentada({required this.valor, required this.rotulo});

  final T valor;
  final String rotulo;
}

/// O grupo segmentado do sistema (design system 11.17): `SegmentedButton` do M3
/// com altura 48 e raio `md` em vez de capsula.
class GrupoSegmentado<T> extends StatelessWidget {
  const GrupoSegmentado({
    required this.rotulo,
    required this.opcoes,
    required this.selecionado,
    required this.aoSelecionar,
    super.key,
    this.erro,
    this.rotuloVisivel = true,
  });

  final String rotulo;

  /// Desenha o [rotulo] como `Text` acima dos segmentos.
  final bool rotuloVisivel;
  final List<OpcaoSegmentada<T>> opcoes;
  final T? selecionado;
  final ValueChanged<T> aoSelecionar;
  final String? erro;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final temErro = erro != null && erro!.isNotEmpty;

    return Semantics(
      container: true,
      label: rotulo,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (rotuloVisivel) ...<Widget>[
            Text(
              rotulo,
              style: textos.labelLarge?.copyWith(color: cores.textPrimary),
            ),
            const SizedBox(height: BichuEspaco.e2),
          ],
          Wrap(
            spacing: BichuAlvoDeToque.gapMin,
            runSpacing: BichuAlvoDeToque.gapMin,
            children: <Widget>[
              for (final opcao in opcoes)
                _Segmento<T>(
                  opcao: opcao,
                  selecionado: opcao.valor == selecionado,
                  aoTocar: () => aoSelecionar(opcao.valor),
                ),
            ],
          ),
          if (temErro) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Semantics(
              liveRegion: true,
              child: Text(
                erro!,
                style: textos.bodyMedium?.copyWith(color: cores.error),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Segmento<T> extends StatelessWidget {
  const _Segmento({
    required this.opcao,
    required this.selecionado,
    required this.aoTocar,
  });

  final OpcaoSegmentada<T> opcao;
  final bool selecionado;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      inMutuallyExclusiveGroup: true,
      selected: selecionado,
      button: true,
      label: opcao.rotulo,
      excludeSemantics: true,
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        focusColor: cores.focusRing,
        child: Container(
          constraints: const BoxConstraints(
            minWidth: 80,
            minHeight: BichuAlvoDeToque.min,
          ),
          padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selecionado ? cores.primaryContainer : cores.surface,
            borderRadius: BorderRadius.circular(BichuRaio.md),
            border: Border.all(
              color: selecionado ? cores.primary : cores.outlineControl,
              width: selecionado ? BichuBorda.medium : BichuBorda.hairline,
            ),
          ),
          child: Text(
            opcao.rotulo,
            textAlign: TextAlign.center,
            style: textos.labelLarge?.copyWith(
              color: selecionado ? cores.onPrimaryContainer : cores.textPrimary,
            ),
          ),
        ),
      ),
    );
  }
}
