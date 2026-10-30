import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Uma opcao do grupo: o valor que a tela guarda e o rotulo que a pessoa le.
class OpcaoDeLinha<T> {
  const OpcaoDeLinha({required this.valor, required this.rotulo, this.detalhe});

  final T valor;
  final String rotulo;

  /// Uma segunda linha, quando a opcao precisa dizer o que ela significa.
  final String? detalhe;
}

/// Um **radiogroup vertical, com as opcoes a vista**.
class GrupoDeOpcoes<T> extends StatelessWidget {
  const GrupoDeOpcoes({
    required this.rotulo,
    required this.opcoes,
    required this.selecionado,
    required this.aoSelecionar,
    super.key,
    this.erro,
  });

  /// O rotulo do grupo. Ele viaja junto de cada opcao: sem ele, o leitor de
  /// tela anuncia "Ontem" sozinho e nao ha como saber qual era a pergunta.
  final String rotulo;

  final List<OpcaoDeLinha<T>> opcoes;
  final T? selecionado;
  final ValueChanged<T> aoSelecionar;
  final String? erro;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final temErro = erro != null && erro!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          rotulo,
          style: textos.labelLarge?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e2),
        for (var i = 0; i < opcoes.length; i++) ...<Widget>[
          if (i > 0) const SizedBox(height: BichuAlvoDeToque.gapMin),
          _Linha<T>(
            rotuloDoGrupo: rotulo,
            opcao: opcoes[i],
            selecionada: opcoes[i].valor == selecionado,
            aoTocar: () => aoSelecionar(opcoes[i].valor),
          ),
        ],
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
    );
  }
}

class _Linha<T> extends StatelessWidget {
  const _Linha({
    required this.rotuloDoGrupo,
    required this.opcao,
    required this.selecionada,
    required this.aoTocar,
  });

  final String rotuloDoGrupo;
  final OpcaoDeLinha<T> opcao;
  final bool selecionada;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final detalhe = opcao.detalhe;

    return Semantics(
      inMutuallyExclusiveGroup: true,
      selected: selecionada,
      button: true,
      label: detalhe == null
          ? '$rotuloDoGrupo, ${opcao.rotulo}'
          : '$rotuloDoGrupo, ${opcao.rotulo}, $detalhe',
      excludeSemantics: true,
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        focusColor: cores.focusRing,
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          padding: const EdgeInsets.symmetric(
            horizontal: BichuEspaco.e4,
            vertical: BichuEspaco.e3,
          ),
          decoration: BoxDecoration(
            color: selecionada ? cores.primaryContainer : cores.surface,
            borderRadius: BorderRadius.circular(BichuRaio.md),
            border: Border.all(
              color: selecionada ? cores.primary : cores.outlineControl,
              width: selecionada ? BichuBorda.medium : BichuBorda.hairline,
            ),
          ),
          child: Row(
            children: <Widget>[
              Icon(
                selecionada
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                size: 24,
                color: selecionada ? cores.primary : cores.textSecondary,
              ),
              const SizedBox(width: BichuEspaco.e3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      opcao.rotulo,
                      style: textos.labelLarge?.copyWith(
                        color: selecionada
                            ? cores.onPrimaryContainer
                            : cores.textPrimary,
                      ),
                    ),
                    if (detalhe != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        detalhe,
                        style: textos.bodySmall?.copyWith(
                          color: cores.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
