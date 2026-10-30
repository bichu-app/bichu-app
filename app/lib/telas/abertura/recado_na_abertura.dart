import 'package:flutter/material.dart';

import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';

/// UM RECADO QUE OCUPA A ABERTURA DO APLICATIVO.
class RecadoNaAbertura extends StatelessWidget {
  const RecadoNaAbertura({
    required this.icone,
    required this.titulo,
    required this.corpo,
    required this.semantica,
    super.key,
    this.rotuloDaAcao,
    this.aoTocarNaAcao,
    this.semAcao,
    this.rotuloDeFechar,
    this.aoFechar,
  });

  final IconData icone;
  final String titulo;
  final String corpo;

  /// O que o leitor de tela anuncia ao abrir.
  final String semantica;

  /// A acao primaria. **Nula, o botao nao existe** e [semAcao] aparece no lugar
  /// dele.
  final String? rotuloDaAcao;
  final VoidCallback? aoTocarNaAcao;

  /// A instrucao em palavras que SUBSTITUI o botao quando nao ha destino.
  final String? semAcao;

  /// A saida secundaria. Nula, a tela nao fecha -- ver o cabecalho.
  final String? rotuloDeFechar;
  final VoidCallback? aoFechar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final fechar = aoFechar;
    final acao = aoTocarNaAcao;

    return PopScope(
      canPop: fechar != null,
      child: Scaffold(
        backgroundColor: cores.surface,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(BichuEspaco.e6),
              child: Semantics(
                container: true,
                label: semantica,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Icon(
                      icone,
                      size: BichuEspaco.e10,
                      color: cores.primary,
                      semanticLabel: null,
                    ),
                    const SizedBox(height: BichuEspaco.e6),
                    Semantics(
                      header: true,
                      child: Text(
                        titulo,
                        style: textos.headlineSmall?.copyWith(
                          color: cores.primary,
                        ),
                      ),
                    ),
                    const SizedBox(height: BichuEspaco.e4),
                    Text(corpo, style: textos.bodyLarge),
                    const SizedBox(height: BichuEspaco.e6),
                    if (acao == null || rotuloDaAcao == null)
                      if (semAcao != null)
                        Text(
                          semAcao!,
                          style: textos.bodyMedium?.copyWith(
                            color: cores.textSecondary,
                          ),
                        )
                      else
                        const SizedBox.shrink()
                    else
                      BotaoPrimario(rotulo: rotuloDaAcao!, aoTocar: acao),
                    if (fechar != null && rotuloDeFechar != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e2),
                      TextButton(
                        onPressed: fechar,
                        style: TextButton.styleFrom(
                          minimumSize:
                              const Size.fromHeight(BichuAlvoDeToque.min),
                        ),
                        child: Text(rotuloDeFechar!),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
