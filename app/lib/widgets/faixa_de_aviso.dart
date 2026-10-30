import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Os dois pesos de mensagem que a tela pode mostrar.
enum PesoDaFaixa {
  /// Exige acao de quem esta lendo.
  erro,

  /// Informa sem exigir acao.
  informativo,
}

/// A faixa de mensagem acima da acao.
class FaixaDeAviso extends StatelessWidget {
  const FaixaDeAviso({
    required this.texto,
    super.key,
    this.peso = PesoDaFaixa.erro,
    this.rotuloDaAcao,
    this.aoTocarNaAcao,
  });

  /// A frase que a pessoa le.
  final String texto;
  final PesoDaFaixa peso;
  final String? rotuloDaAcao;
  final VoidCallback? aoTocarNaAcao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final erro = peso == PesoDaFaixa.erro;

    final corDoTexto = erro ? cores.error : cores.textPrimary;
    final fundo = erro ? cores.errorContainer : cores.warningContainer;
    final borda = erro ? cores.error : cores.outline;

    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: fundo,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(
            color: borda,
            width: erro ? BichuBorda.medium : BichuBorda.hairline,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(
                  erro ? Icons.error_outline : Icons.info_outline,
                  color: corDoTexto,
                  size: 24,
                  semanticLabel: '',
                ),
                if (texto.isNotEmpty) ...<Widget>[
                  const SizedBox(width: BichuEspaco.e3),
                  Expanded(
                    child: Text(
                      texto,
                      style: textos.bodyLarge?.copyWith(color: corDoTexto),
                    ),
                  ),
                ],
              ],
            ),
            if (rotuloDaAcao != null && aoTocarNaAcao != null) ...<Widget>[
              if (texto.isNotEmpty) const SizedBox(height: BichuEspaco.e2),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: aoTocarNaAcao,
                  child: Text(rotuloDaAcao!),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
