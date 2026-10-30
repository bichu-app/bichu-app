import 'package:flutter/material.dart';

import '../../api/modelos_rede.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import 'pecas_da_rede.dart';

/// O cartao de um encontro na agenda: **a foto e o titulo** -- mais UMA
/// palavra, e so quando o encontro foi cancelado.
class CartaoDoEncontro extends StatelessWidget {
  const CartaoDoEncontro({
    required this.encontro,
    required this.aoTocar,
    super.key,
  });

  final EncontroDaRede encontro;

  /// O que o toque faz. **Obrigatorio e nao anulavel**: o criterio 2 da
  /// BICHUS-62 proibe controle sem desfecho, e um `aoTocar` opcional deixaria o
  /// cartao voltar calado ao estado de 19/10 -- tocavel na aparencia e morto no
  /// dedo.
  final VoidCallback aoTocar;

  /// A UNICA palavra de situacao que o cartao desenha.
  static const String rotuloDeCancelado = 'Cancelado';

  /// O nome que o leitor de tela diz: o titulo, com `Cancelado: ` na frente
  /// quando for o caso.
  String get nomeAcessivel => encontro.situacao == SituacaoDoEncontro.cancelado
      ? '$rotuloDeCancelado: ${encontro.titulo}'
      : encontro.titulo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escuro = Theme.of(context).brightness == Brightness.dark;
    final e = encontro;
    final cancelado = e.situacao == SituacaoDoEncontro.cancelado;

    return Material(
      color: cores.surface,
      borderRadius: BorderRadius.circular(BichuRaio.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
            boxShadow: escuro ? null : BichuSombra.sm,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              ImagemDoEncontroOuBanner(
                url: e is EncontroPublico ? e.urlDaCapa : null,
              ),
              Semantics(
                label: nomeAcessivel,
                button: true,
                excludeSemantics: true,
                child: Padding(
                  padding: const EdgeInsets.all(BichuEspaco.e4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      if (cancelado) ...<Widget>[
                        Text(
                          rotuloDeCancelado,
                          style: textos.labelMedium
                              ?.copyWith(color: cores.textPrimary),
                        ),
                        const SizedBox(height: BichuEspaco.e1),
                      ],
                      Text(e.titulo, style: textos.titleMedium),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
