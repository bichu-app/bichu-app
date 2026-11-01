import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A acao primaria: botao preenchido de largura total, na manteiga.
class BotaoPrimario extends StatelessWidget {
  const BotaoPrimario({
    required this.rotulo,
    required this.aoTocar,
    super.key,
    this.carregando = false,
    this.critico = false,
    this.icone,
    this.nomeAcessivel,
  });

  final String rotulo;

  /// Um glifo a ESQUERDA do rotulo, ou nulo para botao so de texto.
  final IconData? icone;

  /// O nome que o LEITOR DE TELA diz, quando ele precisa ser mais longo que o
  /// rotulo visivel.
  final String? nomeAcessivel;

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

    final VoidCallback? acao = carregando ? null : aoTocar;

    final String nome = nomeAcessivel ?? rotulo;

    return Semantics(
      button: true,
      enabled: acao != null,
      label: carregando ? '$nome, em andamento' : nome,
      excludeSemantics: true,
      onTap: acao,
      child: FilledButton(
        onPressed: acao,
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
            ] else if (icone != null) ...<Widget>[
              Icon(icone, size: BichuEspaco.e5),
              const SizedBox(width: BichuEspaco.e2),
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
class BotaoSecundario extends StatelessWidget {
  const BotaoSecundario({
    required this.rotulo,
    required this.aoTocar,
    super.key,
    this.carregando = false,
    this.nomeAcessivel,
  });

  final String rotulo;
  final VoidCallback? aoTocar;

  final bool carregando;

  /// O nome que o LEITOR DE TELA diz, quando ele precisa ser mais longo que o
  /// rotulo visivel.
  final String? nomeAcessivel;

  Widget _comNome(Widget filho, VoidCallback? acao) {
    final nome = nomeAcessivel;
    if (nome == null) return filho;
    return Semantics(
      button: true,
      enabled: acao != null,
      label: carregando ? '$nome, em andamento' : nome,
      excludeSemantics: true,
      onTap: acao,
      child: filho,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!carregando) {
      return _comNome(
        OutlinedButton(onPressed: aoTocar, child: Text(rotulo)),
        aoTocar,
      );
    }

    final cores = BichuColors.of(context).cores;

    return _comNome(
      OutlinedButton(
        onPressed: null,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: cores.textSecondary,
                semanticsLabel: 'Carregando',
              ),
            ),
            const SizedBox(width: BichuEspaco.e3),
            Flexible(child: Text(rotulo, textAlign: TextAlign.center)),
          ],
        ),
      ),
      null,
    );
  }
}
