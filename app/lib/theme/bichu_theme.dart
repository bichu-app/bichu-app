import 'package:flutter/material.dart';

import 'bichu_colors.dart';
import 'bichu_tokens.g.dart';
import 'bichu_typography.dart';

/// O tema do Bichu sobre o Material 3.
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

      applyElevationOverlayColor: false,

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

      primary: c.primary,
      onPrimary: c.onPrimary,
      primaryContainer: c.primaryContainer,
      onPrimaryContainer: c.onPrimaryContainer,

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

      outline: c.outlineControl,
      outlineVariant: c.outline,

      shadow: c.textPrimary,
      scrim: c.scrim,
      inverseSurface: c.surfaceInverse,
      onInverseSurface: c.textOnInverse,
      inversePrimary: c.primaryContainer,

      surfaceTint: Colors.transparent,
    );
  }
}
