import 'package:flutter/material.dart';

import 'bichu_tokens.g.dart';

/// A escala tipografica do Bichu, montada a partir de `design/tokens.json`.
///
/// Duas familias e nao mais (secao 8.1): `PlusJakartaSans` em `display*` e
/// `headline*`, `Inter` em todo o resto. Ambas embarcadas em
/// `assets/fonts/`, nao baixadas em tempo de execucao.
abstract final class BichuTipografia {
  /// Converte uma entrada da escala num `TextStyle`.
  static TextStyle estilo(BichuTipo tipo, Color cor) {
    return TextStyle(
      fontFamily: tipo.familia,
      fontWeight: _peso(tipo.peso),
      fontSize: tipo.tamanho,
      height: tipo.altura,
      letterSpacing: tipo.espacejamento,
      color: cor,
    );
  }

  /// O corpo de 18/28 das telas criticas (achador, pagina do QR, cartaz).
  ///
  /// Ele **nao** ocupa um slot do `TextTheme`: o `bodyLarge` do Material e o
  /// corpo padrao do app, de 16. A tela critica pede este estilo por nome, de
  /// proposito, porque 18 nao e o corpo de toda tela.
  static TextStyle corpoDeTelaCritica(Color cor) =>
      estilo(BichuEscalaDeTipo.bodyLg, cor);

  /// O `overline` em caixa alta do selo de estado. Uma a tres palavras.
  static TextStyle overline(Color cor) =>
      estilo(BichuEscalaDeTipo.overline, cor);

  /// Algarismos tabulares. Obrigatorio em data, hora, contagem, distancia e
  /// qualquer codigo (secao 8.3): sem isso o codigo da tag dança na tela a
  /// cada digito.
  static TextStyle tabular(TextStyle base) {
    return base.copyWith(
      fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
    );
  }

  /// O `TextTheme` do Material 3 com os nossos tamanhos (secao 15.3).
  ///
  /// Onde divergimos do M3, divergimos para cima: o M3 foi calibrado para uso
  /// em ambiente normal, e a tela critica deste produto nao e ambiente normal.
  static TextTheme textTheme(Color corDoTexto) {
    TextStyle e(BichuTipo tipo) => estilo(tipo, corDoTexto);
    return TextTheme(
      displayLarge: e(BichuEscalaDeTipo.displayLg),
      displayMedium: e(BichuEscalaDeTipo.displayLg),
      displaySmall: e(BichuEscalaDeTipo.display),
      headlineLarge: e(BichuEscalaDeTipo.headline),
      headlineMedium: e(BichuEscalaDeTipo.headline),
      headlineSmall: e(BichuEscalaDeTipo.headline),
      titleLarge: e(BichuEscalaDeTipo.titleLg),
      titleMedium: e(BichuEscalaDeTipo.title),
      titleSmall: e(BichuEscalaDeTipo.title),
      bodyLarge: e(BichuEscalaDeTipo.body),
      bodyMedium: e(BichuEscalaDeTipo.bodySm),
      bodySmall: e(BichuEscalaDeTipo.caption),
      labelLarge: e(BichuEscalaDeTipo.labelLg),
      labelMedium: e(BichuEscalaDeTipo.label),
      labelSmall: e(BichuEscalaDeTipo.overline),
    );
  }

  static FontWeight _peso(int peso) {
    return switch (peso) {
      400 => FontWeight.w400,
      500 => FontWeight.w500,
      600 => FontWeight.w600,
      700 => FontWeight.w700,
      800 => FontWeight.w800,
      _ => throw ArgumentError(
          'Peso $peso nao esta embarcado. Os unicos pesos do sistema sao '
          'Inter 400/500/600/700 e PlusJakartaSans 700/800 (secao 8.2).',
        ),
    };
  }
}
