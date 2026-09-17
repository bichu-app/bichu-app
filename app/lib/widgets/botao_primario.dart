import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A acao primaria: botao preenchido de largura total, na manteiga.
///
/// O estado de carregando **mantem o rotulo visivel**. O Material 3 nao define
/// esse estado, e a alternativa comum, trocar o rotulo por um indicador, tira
/// da tela a unica pista do que esta acontecendo no momento em que a pessoa
/// mais precisa dela.
///
/// [critico] troca o alvo de toque de 48 para 64 dp. Use nas acoes de tela
/// critica: pessoa em pe, com um animal em um dos bracos, usando o polegar da
/// outra mao (secao 6.5).
class BotaoPrimario extends StatelessWidget {
  const BotaoPrimario({
    required this.rotulo,
    required this.aoTocar,
    super.key,
    this.carregando = false,
    this.critico = false,
  });

  final String rotulo;

  /// Nulo desabilita. **Nao desabilite por estado de rede**: o detector de
  /// offline erra, e deixar a pessoa sem caminho e pior que deixa-la tentar.
  final VoidCallback? aoTocar;

  final bool carregando;
  final bool critico;

  @override
  Widget build(BuildContext context) {
    final bichu = BichuColors.of(context);
    final estilo =
        critico ? bichu.filledButtonStyleCritico : bichu.filledButtonStyle;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      enabled: aoTocar != null,
      label: carregando ? '$rotulo, em andamento' : rotulo,
      excludeSemantics: true,
      child: FilledButton(
        onPressed: carregando ? null : aoTocar,
        style: estilo,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (carregando) ...<Widget>[
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: bichu.cores.onActionFill,
                ),
              ),
              const SizedBox(width: BichuEspaco.e3),
            ],
            Flexible(
              child: Text(
                rotulo,
                style: textos.labelLarge,
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A acao secundaria: contorno de 2px.
///
/// Botao tonal sobre superficie clara fica com 1.3:1 de contraste de
/// container, e o usuario nao identifica onde e o alvo sob sol; por isso o
/// sistema nao usa `FilledTonalButton` (divergencia 7 da secao 15.6).
class BotaoSecundario extends StatelessWidget {
  const BotaoSecundario({
    required this.rotulo,
    required this.aoTocar,
    super.key,
  });

  final String rotulo;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(onPressed: aoTocar, child: Text(rotulo));
  }
}
