import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A trilha de progresso de quem convida — **desenhada para receber prêmio
/// depois, sem redesenho**.
class TrilhaDeConvites extends StatelessWidget {
  const TrilhaDeConvites({
    required this.quantos,
    super.key,
    this.marcos = padrao,
    this.comAFrase = true,
  });

  /// Quantas pessoas a conta trouxe, pela regra decidida: **conexão aceita E a
  /// pessoa com ao menos um pet com foto `ready`**.
  final int quantos;

  /// Os marcos, em ordem crescente.
  final List<MarcoDeConvite> marcos;

  /// A FRASE-CABEÇALHO ENTRA?
  final bool comAFrase;

  /// Os marcos de hoje: **reconhecimento, e nenhum prêmio material**.
  static const List<MarcoDeConvite> padrao = <MarcoDeConvite>[
    MarcoDeConvite(1, 'O primeiro vizinho'),
    MarcoDeConvite(3, 'Três olhos a mais'),
    MarcoDeConvite(10, 'Dez na vizinhança'),
  ];

  static String quantosEmPalavras(int quantos) {
    if (quantos == 1) {
      return '1 tutor entrou no Bichu com o seu convite e já cadastrou um pet.';
    }
    return '$quantos tutores entraram no Bichu com o seu convite e já '
        'cadastraram um pet.';
  }

  /// O que falta para o próximo marco, ou **nulo quando não falta nada** —
  /// porque todos foram alcançados.
  MarcoDeConvite? get proximo {
    for (final marco in marcos) {
      if (quantos < marco.quantos) return marco;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final alvo = proximo;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (comAFrase) ...<Widget>[
          Text(
            TrilhaDeConvites.quantosEmPalavras(quantos),
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],
        for (final marco in marcos) ...<Widget>[
          _linhaDoMarco(marco, cores, textos),
          const SizedBox(height: BichuEspaco.e2),
        ],
        if (alvo != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            alvo.quantoFalta(quantos),
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ],
      ],
    );
  }

  Widget _linhaDoMarco(
    MarcoDeConvite marco,
    BichuCores cores,
    TextTheme textos,
  ) {
    final feito = quantos >= marco.quantos;
    return Semantics(
      label: '${marco.rotulo}: ${feito ? 'alcançado' : 'ainda não'}',
      child: ExcludeSemantics(
        child: Row(
          children: <Widget>[
            Icon(
              feito ? Icons.check_circle_outline : Icons.radio_button_unchecked,
              size: 20,
              color: feito ? cores.success : cores.textMuted,
            ),
            const SizedBox(width: BichuEspaco.e2),
            Expanded(
              child: Text(
                marco.rotulo,
                style: textos.bodyMedium?.copyWith(
                  color: feito ? cores.textPrimary : cores.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Um marco da trilha: **em que número ele acontece, e o que acontece lá**.
class MarcoDeConvite {
  const MarcoDeConvite(this.quantos, this.rotulo);

  final int quantos;
  final String rotulo;

  String quantoFalta(int atuais) {
    final faltam = quantos - atuais;
    if (faltam <= 0) return rotulo;
    if (faltam == 1) return 'Falta 1 para “$rotulo”.';
    return 'Faltam $faltam para “$rotulo”.';
  }
}
