/// O VEU DO AUTOR SOBRE A MIDIA: a barra preta translucida em que o nome e a
/// foto de quem publicou pousam EM CIMA da imagem, no desenho do Instagram.
library;

import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

class VeuDoAutorSobreMidia extends StatelessWidget {
  const VeuDoAutorSobreMidia({required this.child, super.key});

  final Widget child;

  /// 40 dp. **O minimo que passa**, e quem fixa o numero e
  /// [BichuAlvoDeToque.min].
  static const double alturaDaBarra = 40;

  /// O recuo horizontal do conteudo dentro da barra.
  static const double recuoInterno = BichuEspaco.e3;

  /// A marca de isencao do paragrafo 18.2.1, com o motivo e o endereco da
  /// medicao que a substitui.
  static const String chaveDeIsencao =
      'a11y-exempt:texto sobre veu translucido em foto arbitraria; o '
      'verificador so acha fundo SOLIDO. A medicao do pior caso (foto branca) '
      'esta em test/mural/cartao_no_desenho_do_instagram_test.dart: 4,94:1 no '
      'tema claro e 8,89:1 no escuro, contra o piso de 4,5.';

  /// A TINTA SOBRE O VEU, e ela e CLARA NOS DOIS TEMAS.
  static Color tinta(BichuColors tema) =>
      tema.escuro ? tema.cores.surfaceInverse : tema.cores.textOnInverse;

  @override
  Widget build(BuildContext context) {
    final tema = BichuColors.of(context);
    return Semantics(
      key: const ValueKey<String>(chaveDeIsencao),
      child: SizedBox(
        height: alturaDaBarra,
        child: ColoredBox(
          color: tema.cores.scrim,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: recuoInterno),
            child: child,
          ),
        ),
      ),
    );
  }
}
