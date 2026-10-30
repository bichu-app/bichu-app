import 'package:flutter/material.dart';

import '../../dispositivo/saida_do_app.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import 'textos_da_atualizacao.dart';

/// O AVISO BRANDO de versao nova.
class AvisoDeVersaoNova extends StatelessWidget {
  const AvisoDeVersaoNova({
    required this.aoDispensar,
    super.key,
    this.loja,
  });

  /// Chamado pelo `Agora nao`.
  final VoidCallback aoDispensar;

  /// Para onde o `Atualizar` manda.
  final Uri? loja;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final destino = loja;

    return Material(
      color: cores.warningContainer,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: BichuEspaco.e4,
            vertical: BichuEspaco.e2,
          ),
          child: Semantics(
            liveRegion: true,
            container: true,
            child: Row(
              children: <Widget>[
                Icon(Icons.info_outline, color: cores.textPrimary, size: BichuEspaco.e5),
                const SizedBox(width: BichuEspaco.e3),
                Expanded(
                  child: Text(
                    TextosDaAtualizacao.avisoDeVersaoNova,
                    style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
                  ),
                ),
                if (destino != null)
                  TextButton(
                    onPressed: () => SaidaDoApp.atual.abrirLink(destino),
                    child: const Text(TextosDaAtualizacao.atualizar),
                  ),
                TextButton(
                  onPressed: aoDispensar,
                  child: const Text(TextosDaAtualizacao.agoraNao),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
