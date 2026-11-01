import 'package:flutter/material.dart';

import 'bichu_tokens.g.dart';

/// Os papeis de cor que o `ColorScheme` do Material 3 nao tem.
@immutable
class BichuColors extends ThemeExtension<BichuColors> {
  const BichuColors({required this.cores, required this.escuro});

  /// Os 38 papeis gerados de `design/tokens.json`.
  final BichuCores cores;

  /// Verdadeiro no tema escuro.
  final bool escuro;

  static const BichuColors claro =
      BichuColors(cores: BichuCores.claro, escuro: false);

  static const BichuColors temaEscuro =
      BichuColors(cores: BichuCores.escuro, escuro: true);

  /// Atalho de leitura. Falha ruidosamente quando o tema nao foi instalado, em
  /// vez de devolver uma cor de outro sistema em silencio.
  static BichuColors of(BuildContext context) {
    final extensao = Theme.of(context).extension<BichuColors>();
    if (extensao == null) {
      throw FlutterError(
        'BichuColors nao esta no ThemeData. Toda tela do Bichu precisa estar '
        'sob BichuTheme.claro ou BichuTheme.escuro; sem isso a tela nasce com '
        'cor solta e o portao de contraste reprova.',
      );
    }
    return extensao;
  }

  /// Texto e icone sobre o preenchimento manteiga.
  Color get onActionFill => cores.onActionFill;

  /// O valor bruto da manteiga.
  Color get actionFillRawDoNotUseAsText => cores.actionFillRawDoNotUseAsText;

  /// Preenchimento manteiga pronto para um `Container`.
  BoxDecoration actionFillBox({double radius = BichuRaio.md}) {
    return BoxDecoration(
      color: cores.actionFillRawDoNotUseAsText,
      borderRadius: BorderRadius.circular(radius),
    );
  }

  /// Texto e icone sobre o Verde suave.
  Color get onCommunityFill => cores.onCommunityFill;

  /// Texto e icone sobre a Goiaba suave.
  Color get onAccentFill => cores.onAccentFill;

  /// Preenchimento Verde suave pronto para um `Container`.
  BoxDecoration communityFillBox({double radius = BichuRaio.lg}) {
    return BoxDecoration(
      color: cores.communityFillRawDoNotUseAsText,
      borderRadius: BorderRadius.circular(radius),
    );
  }

  /// Preenchimento Goiaba suave pronto para um `Container`.
  BoxDecoration accentFillBox({double radius = BichuRaio.lg}) {
    return BoxDecoration(
      color: cores.accentFillRawDoNotUseAsText,
      borderRadius: BorderRadius.circular(radius),
    );
  }

  /// O estilo do botao de acao primaria, ja com a manteiga, o raio de 12 e o
  /// alvo de 48.
  ButtonStyle get filledButtonStyle =>
      _filledButtonStyle(alvo: BichuAlvoDeToque.min);

  /// O mesmo estilo com o alvo de 64 das acoes criticas (secao 6.5).
  ButtonStyle get filledButtonStyleCritico =>
      _filledButtonStyle(alvo: BichuAlvoDeToque.critico);

  ButtonStyle _filledButtonStyle({required double alvo}) {
    return ButtonStyle(
      backgroundColor: WidgetStateProperty.resolveWith((estados) {
        if (estados.contains(WidgetState.disabled)) {
          return cores.disabledSurface;
        }
        if (estados.contains(WidgetState.pressed)) {
          return cores.actionFillPressedRawDoNotUseAsText;
        }
        return cores.actionFillRawDoNotUseAsText;
      }),
      foregroundColor: WidgetStateProperty.resolveWith((estados) {
        if (estados.contains(WidgetState.disabled)) return cores.onDisabled;
        return cores.onActionFill;
      }),
      iconColor: WidgetStateProperty.resolveWith((estados) {
        if (estados.contains(WidgetState.disabled)) return cores.onDisabled;
        return cores.onActionFill;
      }),
      overlayColor: WidgetStateProperty.all(Colors.transparent),
      minimumSize: WidgetStateProperty.all(Size(double.infinity, alvo)),
      shape: WidgetStateProperty.all(
        RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.md),
        ),
      ),
      side: _ladoDeFoco(),
      elevation: WidgetStateProperty.all(0),
      tapTargetSize: MaterialTapTargetSize.padded,
    );
  }

  WidgetStateProperty<BorderSide?> _ladoDeFoco() {
    return WidgetStateProperty.resolveWith((estados) {
      if (estados.contains(WidgetState.focused)) {
        return BorderSide(
          color: cores.focusRing,
          width: BichuBorda.focusWidth,
          strokeAlign: BorderSide.strokeAlignOutside,
        );
      }
      return BorderSide.none;
    });
  }

  /// A lista de sombra do nivel pedido, vazia no tema escuro.
  List<BoxShadow> sombra(List<BoxShadow> nivel) =>
      escuro ? BichuSombra.nenhuma : nivel;

  @override
  BichuColors copyWith({BichuCores? cores, bool? escuro}) {
    return BichuColors(
      cores: cores ?? this.cores,
      escuro: escuro ?? this.escuro,
    );
  }

  /// Os papeis do Bichu foram fixados por medicao de contraste, par a par.
  @override
  BichuColors lerp(ThemeExtension<BichuColors>? other, double t) {
    if (other is! BichuColors) return this;
    return t < 0.5 ? this : other;
  }
}
