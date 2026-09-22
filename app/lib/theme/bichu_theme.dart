import 'package:flutter/material.dart';

import 'bichu_colors.dart';
import 'bichu_tokens.g.dart';
import 'bichu_typography.dart';

/// O tema do Bichu sobre o Material 3.
///
/// Decisao do cliente: os componentes usam o M3 como base, pelo suporte nativo
/// do Flutter (docs/06-design-system.md secao 15). A semente e a Framboesa
/// `#9E0B3A`, mas **o esquema nao e gerado por HCT**: cada papel foi fixado por
/// medicao de contraste, porque o gerador do M3 produz pares que passam em AA
/// e falham no piso de 7:1 que este produto adota nas superficies criticas.
///
/// A trava principal esta em duas linhas deste arquivo, e vale reler antes de
/// mexer: **`ColorScheme.primary` e a tinta carmim `#9E0B3A`, nao a
/// manteiga `#E7B93E`.** Se a manteiga fosse `primary`, todo `TextButton`,
/// todo `OutlinedButton` e todo icone acentuado do M3 nasceriam a 1.73:1, por
/// padrao, sem ninguem escrever uma linha errada. Com a tinta ali, o padrao
/// passa a ser o seguro e o preenchimento so aparece onde alguem o colocou de
/// proposito, pelos temas explicitos de `filledButtonTheme` e
/// `floatingActionButtonTheme`.
abstract final class BichuTheme {
  static ThemeData get claro => _tema(BichuColors.claro, Brightness.light);

  static ThemeData get escuro =>
      _tema(BichuColors.temaEscuro, Brightness.dark);

  static ThemeData _tema(BichuColors bichu, Brightness brilho) {
    final c = bichu.cores;
    final esquema = _colorScheme(bichu, brilho);
    final textos = BichuTipografia.textTheme(c.textPrimary);

    return ThemeData(
      useMaterial3: true,
      brightness: brilho,
      colorScheme: esquema,
      extensions: <ThemeExtension<dynamic>>[bichu],
      scaffoldBackgroundColor: c.surface,
      canvasColor: c.surface,
      textTheme: textos,
      fontFamily: 'Inter',
      splashFactory: InkSparkle.splashFactory,

      // O M3 usa sobreposicao tonal para elevacao. Nos nao: a sobreposicao
      // gera diferencas de 1.1:1 a 1.3:1 entre camadas, invisiveis em tela
      // barata e sob sol. Separacao por `outline` de 1px e por superficie,
      // que e deterministica (divergencia 1 da secao 15.6).
      applyElevationOverlayColor: false,

      // Alvo de toque: 48dp no app, 64dp nas acoes criticas. Vem do tema, nao
      // de padding caso a caso.
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,

      appBarTheme: AppBarTheme(
        backgroundColor: c.surface,
        foregroundColor: c.textPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textos.headlineSmall,
      ),

      // O preenchimento de acao chega a tela por aqui, e so por aqui.
      filledButtonTheme: FilledButtonThemeData(
        style: bichu.filledButtonStyle,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: c.actionFillRawDoNotUseAsText,
        foregroundColor: c.onActionFill,
        elevation: 0,
        focusElevation: 0,
        hoverElevation: 0,
        highlightElevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.lg),
        ),
      ),

      // Botao secundario: contorno de 2px. O `FilledTonalButton` do M3 fica
      // com 1.3:1 de contraste de container sobre superficie clara, e o
      // usuario nao identifica onde e o alvo sob sol (divergencia 7).
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStateProperty.resolveWith((estados) {
            if (estados.contains(WidgetState.disabled)) return c.onDisabled;
            if (estados.contains(WidgetState.pressed)) return c.primaryPressed;
            return c.primary;
          }),
          side: WidgetStateProperty.resolveWith((estados) {
            if (estados.contains(WidgetState.disabled)) {
              return BorderSide(color: c.onDisabled, width: BichuBorda.medium);
            }
            if (estados.contains(WidgetState.focused)) {
              return BorderSide(
                color: c.focusRing,
                width: BichuBorda.focusWidth,
              );
            }
            return BorderSide(color: c.primary, width: BichuBorda.medium);
          }),
          minimumSize: WidgetStateProperty.all(
            const Size(double.infinity, BichuAlvoDeToque.min),
          ),
          shape: WidgetStateProperty.all(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(BichuRaio.md),
            ),
          ),
          textStyle: WidgetStateProperty.all(textos.labelLarge),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStateProperty.resolveWith((estados) {
            if (estados.contains(WidgetState.disabled)) return c.onDisabled;
            if (estados.contains(WidgetState.pressed)) return c.primaryPressed;
            return c.primary;
          }),
          minimumSize: WidgetStateProperty.all(
            const Size(0, BichuAlvoDeToque.min),
          ),
          shape: WidgetStateProperty.all(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(BichuRaio.sm),
            ),
          ),
          textStyle: WidgetStateProperty.all(textos.labelLarge),
        ),
      ),

      // Rotulo fixo acima do campo, nunca flutuante: o rotulo flutuante reduz
      // a altura util e some quando o campo esta preenchido, que e justamente
      // quando a pessoa revisa (divergencia 8). Quem monta o par rotulo+campo
      // e o `BichuField`.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surface,
        isDense: false,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: BichuEspaco.e4,
          vertical: BichuEspaco.e3,
        ),
        hintStyle: textos.bodyLarge?.copyWith(color: c.textMuted),
        helperStyle: textos.bodyMedium?.copyWith(color: c.textSecondary),
        errorStyle: textos.bodyMedium?.copyWith(color: c.error),
        border: _borda(c.outlineControl, BichuBorda.hairline),
        enabledBorder: _borda(c.outlineControl, BichuBorda.hairline),
        focusedBorder: _borda(c.focusRing, BichuBorda.medium),
        errorBorder: _borda(c.error, BichuBorda.medium),
        focusedErrorBorder: _borda(c.error, BichuBorda.medium),
        disabledBorder: _borda(c.onDisabled, BichuBorda.hairline),
      ),

      cardTheme: CardThemeData(
        color: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          side: BorderSide(color: c.outline, width: BichuBorda.hairline),
        ),
      ),

      dividerTheme: DividerThemeData(
        color: c.outline,
        thickness: BichuBorda.hairline,
        space: BichuEspaco.e0,
      ),

      // Quatro destinos, rotulo sempre visivel, e visivel tambem deslogado:
      // deslogado e um estado de navegacao, nao um muro (UX 5.2).
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: c.primaryContainer,
        elevation: 0,
        height: 72,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.all(
          textos.labelMedium?.copyWith(color: c.textPrimary),
        ),
        iconTheme: WidgetStateProperty.resolveWith((estados) {
          final selecionado = estados.contains(WidgetState.selected);
          return IconThemeData(
            color: selecionado ? c.onPrimaryContainer : c.textSecondary,
            size: 24,
          );
        }),
      ),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: c.outlineControl,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(BichuRaio.xl),
          ),
        ),
      ),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.surfaceInverse,
        contentTextStyle: textos.bodyLarge?.copyWith(color: c.textOnInverse),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.md),
        ),
      ),

      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: c.primary,
        linearTrackColor: c.surfaceSunken,
        circularTrackColor: c.surfaceSunken,
      ),

      // Botao com cápsula compete com a geometria da moldura, que e a forma
      // assinante do sistema (divergencia 2). Raio 12 em tudo que e acao.
      chipTheme: ChipThemeData(
        backgroundColor: c.surfaceSunken,
        labelStyle: textos.labelMedium?.copyWith(color: c.textPrimary),
        side: BorderSide(color: c.outline, width: BichuBorda.hairline),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),

      listTileTheme: ListTileThemeData(
        titleTextStyle: textos.bodyLarge,
        subtitleTextStyle: textos.bodyMedium?.copyWith(color: c.textSecondary),
        iconColor: c.textSecondary,
        minTileHeight: BichuAlvoDeToque.min,
      ),
    );
  }

  static OutlineInputBorder _borda(Color cor, double largura) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(BichuRaio.md),
      borderSide: BorderSide(color: cor, width: largura),
    );
  }

  static ColorScheme _colorScheme(BichuColors bichu, Brightness brilho) {
    final c = bichu.cores;
    return ColorScheme(
      brightness: brilho,

      // A tinta, nunca o preenchimento. Ver o comentario da classe.
      primary: c.primary,
      onPrimary: c.onPrimary,
      primaryContainer: c.primaryContainer,
      onPrimaryContainer: c.onPrimaryContainer,

      // Nao ha papel `secondary` nem `tertiary` no sistema do Bichu. Apontar
      // os dois para a tinta e deliberado: assim nenhum widget do M3 pinta
      // uma cor que ninguem mediu.
      secondary: c.primary,
      onSecondary: c.onPrimary,
      secondaryContainer: c.primaryContainer,
      onSecondaryContainer: c.onPrimaryContainer,
      tertiary: c.primary,
      onTertiary: c.onPrimary,
      tertiaryContainer: c.primaryContainer,
      onTertiaryContainer: c.onPrimaryContainer,

      error: c.error,
      onError: c.surface,
      errorContainer: c.errorContainer,
      onErrorContainer: c.error,

      surface: c.surface,
      onSurface: c.textPrimary,
      surfaceDim: c.surfaceSunken,
      surfaceBright: c.surface,
      surfaceContainerLowest: c.surface,
      surfaceContainerLow: c.surfaceAlt,
      surfaceContainer: c.surfaceAlt,
      surfaceContainerHigh: c.surfaceSunken,
      surfaceContainerHighest: c.surfaceSunken,
      onSurfaceVariant: c.textSecondary,

      // A armadilha de nomenclatura da secao 15.2: o que o M3 chama de
      // `outline` e a borda de controle, e o que ele chama de `outlineVariant`
      // e o divisor decorativo. A nossa nomenclatura e a inversa, entao a
      // traducao acontece aqui, uma vez, com o nome do erro escrito ao lado:
      // trocar estas duas linhas passa em revisao e reprova em acessibilidade.
      outline: c.outlineControl,
      outlineVariant: c.outline,

      shadow: c.textPrimary,
      scrim: c.scrim,
      inverseSurface: c.surfaceInverse,
      onInverseSurface: c.textOnInverse,
      inversePrimary: c.primaryContainer,

      // Sem sobreposicao tonal (divergencia 1).
      surfaceTint: Colors.transparent,
    );
  }
}
