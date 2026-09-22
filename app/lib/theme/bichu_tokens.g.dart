// GERADO POR app/tool/gen_tokens.dart A PARTIR DE design/tokens.json — NÃO EDITE.
//
// Para mudar um valor, edite design/tokens.json na raiz do repositório e rode,
// de dentro de app/:
//   dart run tool/gen_tokens.dart
//
// ignore_for_file: lines_longer_than_80_chars

import 'package:flutter/animation.dart';
import 'package:flutter/painting.dart';

/// Os 38 papeis semanticos de cor, nos dois temas.
///
/// Fonte: design/tokens.json, grupo `cor`.
///
/// 4 deles nunca podem pintar texto nem icone e por isso
/// carregam nome feio, conforme $extensions.bichu.nunca-texto:
/// action-fill, action-fill-pressed, community-fill, accent-fill.
class BichuCores {
  const BichuCores({
    required this.actionFillRawDoNotUseAsText,
    required this.actionFillPressedRawDoNotUseAsText,
    required this.onActionFill,
    required this.communityFillRawDoNotUseAsText,
    required this.onCommunityFill,
    required this.accentFillRawDoNotUseAsText,
    required this.onAccentFill,
    required this.primary,
    required this.primaryPressed,
    required this.onPrimary,
    required this.primaryContainer,
    required this.onPrimaryContainer,
    required this.surface,
    required this.surfaceAlt,
    required this.surfaceSunken,
    required this.surfaceInverse,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.textOnInverse,
    required this.urgency,
    required this.onUrgency,
    required this.urgencyContainer,
    required this.onUrgencyContainer,
    required this.error,
    required this.errorContainer,
    required this.success,
    required this.successContainer,
    required this.warning,
    required this.warningContainer,
    required this.info,
    required this.infoContainer,
    required this.outline,
    required this.outlineControl,
    required this.focusRing,
    required this.disabledSurface,
    required this.onDisabled,
    required this.scrim,
  });

  final Color actionFillRawDoNotUseAsText;
  final Color actionFillPressedRawDoNotUseAsText;
  final Color onActionFill;
  final Color communityFillRawDoNotUseAsText;
  final Color onCommunityFill;
  final Color accentFillRawDoNotUseAsText;
  final Color onAccentFill;
  final Color primary;
  final Color primaryPressed;
  final Color onPrimary;
  final Color primaryContainer;
  final Color onPrimaryContainer;
  final Color surface;
  final Color surfaceAlt;
  final Color surfaceSunken;
  final Color surfaceInverse;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color textOnInverse;
  final Color urgency;
  final Color onUrgency;
  final Color urgencyContainer;
  final Color onUrgencyContainer;
  final Color error;
  final Color errorContainer;
  final Color success;
  final Color successContainer;
  final Color warning;
  final Color warningContainer;
  final Color info;
  final Color infoContainer;
  final Color outline;
  final Color outlineControl;
  final Color focusRing;
  final Color disabledSurface;
  final Color onDisabled;
  final Color scrim;

  static const BichuCores claro = BichuCores(
    actionFillRawDoNotUseAsText: Color(0xFFE7B93E),
    actionFillPressedRawDoNotUseAsText: Color(0xFFD0A324),
    onActionFill: Color(0xFF1C1B19),
    communityFillRawDoNotUseAsText: Color(0xFFA9CFBB),
    onCommunityFill: Color(0xFF1C1B19),
    accentFillRawDoNotUseAsText: Color(0xFFE8A7A0),
    onAccentFill: Color(0xFF1C1B19),
    primary: Color(0xFF9E0B3A),
    primaryPressed: Color(0xFF880730),
    onPrimary: Color(0xFFFAFAF8),
    primaryContainer: Color(0xFFF9ECF0),
    onPrimaryContainer: Color(0xFF880730),
    surface: Color(0xFFFAFAF8),
    surfaceAlt: Color(0xFFF6F6F4),
    surfaceSunken: Color(0xFFF4F3F1),
    surfaceInverse: Color(0xFF1C1B19),
    textPrimary: Color(0xFF1C1B19),
    textSecondary: Color(0xFF4B4944),
    textMuted: Color(0xFF67655D),
    textOnInverse: Color(0xFFFAFAF8),
    urgency: Color(0xFF9B330D),
    onUrgency: Color(0xFFFFFFFF),
    urgencyContainer: Color(0xFFFBEEE9),
    onUrgencyContainer: Color(0xFF8E2E0B),
    error: Color(0xFF8E2E0B),
    errorContainer: Color(0xFFFBEEE9),
    success: Color(0xFF1F7A46),
    successContainer: Color(0xFFDDEFE6),
    warning: Color(0xFF1C1B19),
    warningContainer: Color(0xFFF4F3F1),
    info: Color(0xFF1B5FA8),
    infoContainer: Color(0xFFDCEAF8),
    outline: Color(0xFFDFDED8),
    outlineControl: Color(0xFF827F73),
    focusRing: Color(0xFF9E0B3A),
    disabledSurface: Color(0xFFF4F3F1),
    onDisabled: Color(0xFF827F73),
    scrim: Color(0xA31C1B19),
  );

  static const BichuCores escuro = BichuCores(
    actionFillRawDoNotUseAsText: Color(0xFFE7B93E),
    actionFillPressedRawDoNotUseAsText: Color(0xFFF0CE6B),
    onActionFill: Color(0xFF1C1B19),
    communityFillRawDoNotUseAsText: Color(0xFFA9CFBB),
    onCommunityFill: Color(0xFF1C1B19),
    accentFillRawDoNotUseAsText: Color(0xFFE8A7A0),
    onAccentFill: Color(0xFF1C1B19),
    primary: Color(0xFFE79DB4),
    primaryPressed: Color(0xFFECBBCB),
    onPrimary: Color(0xFF17150F),
    primaryContainer: Color(0xFF54031D),
    onPrimaryContainer: Color(0xFFECBBCB),
    surface: Color(0xFF17150F),
    surfaceAlt: Color(0xFF201D15),
    surfaceSunken: Color(0xFF2B271C),
    surfaceInverse: Color(0xFFFAFAF8),
    textPrimary: Color(0xFFF3F0E7),
    textSecondary: Color(0xFFBEB9AB),
    textMuted: Color(0xFFBEB9AB),
    textOnInverse: Color(0xFF17150F),
    urgency: Color(0xFF6B220A),
    onUrgency: Color(0xFFFBEEE9),
    urgencyContainer: Color(0xFF6B220A),
    onUrgencyContainer: Color(0xFFFBEEE9),
    error: Color(0xFFE89273),
    errorContainer: Color(0xFF3D1406),
    success: Color(0xFFA9CFBB),
    successContainer: Color(0xFF0E3A21),
    warning: Color(0xFFD9D2C0),
    warningContainer: Color(0xFF2B271C),
    info: Color(0xFF7FB3E3),
    infoContainer: Color(0xFF12304F),
    outline: Color(0xFF38342A),
    outlineControl: Color(0xFF6E6857),
    focusRing: Color(0xFFE79DB4),
    disabledSurface: Color(0xFF201D15),
    onDisabled: Color(0xFF7E7866),
    scrim: Color(0xB8000000),
  );
}

/// Uma entrada da escala tipografica.
///
/// `entrelinha` vem em pixels logicos, como no documento; o
/// tema converte para a razao que o Flutter chama de `height`.
class BichuTipo {
  const BichuTipo({
    required this.familia,
    required this.peso,
    required this.tamanho,
    required this.entrelinha,
    required this.espacejamentoEm,
  });

  final String familia;
  final int peso;
  final double tamanho;
  final double entrelinha;
  final double espacejamentoEm;

  /// Razao esperada por `TextStyle.height`.
  double get altura => entrelinha / tamanho;

  /// Espacejamento em pixels logicos, que e o que o Flutter usa.
  double get espacejamento => espacejamentoEm * tamanho;
}

/// As 12 entradas da escala tipografica.
abstract final class BichuEscalaDeTipo {
  static const BichuTipo displayLg = BichuTipo(
    familia: 'Plus Jakarta Sans',
    peso: 800,
    tamanho: 40.0,
    entrelinha: 44.0,
    espacejamentoEm: -0.02,
  );
  static const BichuTipo display = BichuTipo(
    familia: 'Plus Jakarta Sans',
    peso: 800,
    tamanho: 32.0,
    entrelinha: 38.0,
    espacejamentoEm: -0.02,
  );
  static const BichuTipo headline = BichuTipo(
    familia: 'Plus Jakarta Sans',
    peso: 700,
    tamanho: 26.0,
    entrelinha: 32.0,
    espacejamentoEm: -0.01,
  );
  static const BichuTipo titleLg = BichuTipo(
    familia: 'Inter',
    peso: 600,
    tamanho: 22.0,
    entrelinha: 28.0,
    espacejamentoEm: 0.0,
  );
  static const BichuTipo title = BichuTipo(
    familia: 'Inter',
    peso: 600,
    tamanho: 18.0,
    entrelinha: 24.0,
    espacejamentoEm: 0.0,
  );
  static const BichuTipo bodyLg = BichuTipo(
    familia: 'Inter',
    peso: 400,
    tamanho: 18.0,
    entrelinha: 28.0,
    espacejamentoEm: 0.0,
  );
  static const BichuTipo body = BichuTipo(
    familia: 'Inter',
    peso: 400,
    tamanho: 16.0,
    entrelinha: 24.0,
    espacejamentoEm: 0.0,
  );
  static const BichuTipo bodySm = BichuTipo(
    familia: 'Inter',
    peso: 400,
    tamanho: 14.0,
    entrelinha: 20.0,
    espacejamentoEm: 0.0,
  );
  static const BichuTipo labelLg = BichuTipo(
    familia: 'Inter',
    peso: 600,
    tamanho: 16.0,
    entrelinha: 20.0,
    espacejamentoEm: 0.01,
  );
  static const BichuTipo label = BichuTipo(
    familia: 'Inter',
    peso: 600,
    tamanho: 14.0,
    entrelinha: 18.0,
    espacejamentoEm: 0.01,
  );
  static const BichuTipo caption = BichuTipo(
    familia: 'Inter',
    peso: 400,
    tamanho: 13.0,
    entrelinha: 18.0,
    espacejamentoEm: 0.0,
  );
  static const BichuTipo overline = BichuTipo(
    familia: 'Inter',
    peso: 700,
    tamanho: 12.0,
    entrelinha: 16.0,
    espacejamentoEm: 0.08,
  );

  static const List<BichuTipo> todos = <BichuTipo>[
    displayLg,
    display,
    headline,
    titleLg,
    title,
    bodyLg,
    body,
    bodySm,
    labelLg,
    label,
    caption,
    overline,
  ];
}

/// Escala de espacamento. Base 4, uma escala so.
///
/// Fonte: design/tokens.json, grupo(s) `space`.
abstract final class BichuEspaco {
  static const double e0 = 0.0;
  static const double e1 = 4.0;
  static const double e2 = 8.0;
  static const double e3 = 12.0;
  static const double e4 = 16.0;
  static const double e5 = 20.0;
  static const double e6 = 24.0;
  static const double e8 = 32.0;
  static const double e10 = 40.0;
  static const double e12 = 48.0;
  static const double e16 = 64.0;
}

/// Escala de raio.
///
/// Fonte: design/tokens.json, grupo(s) `radius`.
abstract final class BichuRaio {
  static const double none = 0.0;
  static const double sm = 8.0;
  static const double md = 12.0;
  static const double lg = 16.0;
  static const double xl = 24.0;
  static const double full = 999.0;
}

/// Larguras de borda e o anel de foco.
///
/// Fonte: design/tokens.json, grupo(s) `border`, `focus`.
abstract final class BichuBorda {
  static const double hairline = 1.0;
  static const double medium = 2.0;
  static const double thick = 3.0;
  static const double focusWidth = 3.0;
  static const double focusOffset = 2.0;
}

/// Alvo de toque. Contrato de acessibilidade, nao estilo.
///
/// Fonte: design/tokens.json, grupo(s) `target`.
abstract final class BichuAlvoDeToque {
  static const double min = 48.0;
  static const double critico = 64.0;
  static const double gapMin = 8.0;
  static const double gapConsequenciaAlta = 16.0;
}

/// Grid e medida de linha.
///
/// Fonte: design/tokens.json, grupo(s) `layout`.
abstract final class BichuLayout {
  static const double colunaMax = 640.0;
  static const double medidaMax = 66.0;
  static const double margemCelular = 16.0;
}

/// Duracoes de movimento. Nada acima de 320 ms.
abstract final class BichuMovimento {
  static const Duration instant = Duration(milliseconds: 100);
  static const Duration fast = Duration(milliseconds: 160);
  static const Duration base = Duration(milliseconds: 240);
  static const Duration slow = Duration(milliseconds: 320);
  static const Duration skeleton = Duration(milliseconds: 1200);
}

/// Curvas de aceleracao.
abstract final class BichuCurva {
  static const Cubic standard = Cubic(0.2, 0.0, 0.0, 1.0);
  static const Cubic decelerate = Cubic(0.0, 0.0, 0.0, 1.0);
  static const Cubic accelerate = Cubic(0.3, 0.0, 1.0, 1.0);
}

/// Sombras do tema claro.
///
/// No tema escuro a lista e vazia e a borda de 1px entra no
/// lugar: sobreposicao tonal gera diferencas de 1.1:1 a 1.3:1
/// entre camadas, invisiveis em tela barata e sob sol.
abstract final class BichuSombra {
  static const List<BoxShadow> sm = <BoxShadow>[
    BoxShadow(
      color: Color(0x0F1C1B19),
      offset: Offset(0.0, 1.0),
      blurRadius: 2.0,
      spreadRadius: 0.0,
    ),
    BoxShadow(
      color: Color(0x141C1B19),
      offset: Offset(0.0, 1.0),
      blurRadius: 3.0,
      spreadRadius: 0.0,
    ),
  ];
  static const List<BoxShadow> md = <BoxShadow>[
    BoxShadow(
      color: Color(0x141C1B19),
      offset: Offset(0.0, 2.0),
      blurRadius: 6.0,
      spreadRadius: 0.0,
    ),
    BoxShadow(
      color: Color(0x1A1C1B19),
      offset: Offset(0.0, 6.0),
      blurRadius: 16.0,
      spreadRadius: 0.0,
    ),
  ];
  static const List<BoxShadow> lg = <BoxShadow>[
    BoxShadow(
      color: Color(0x1F1C1B19),
      offset: Offset(0.0, 8.0),
      blurRadius: 24.0,
      spreadRadius: 0.0,
    ),
    BoxShadow(
      color: Color(0x141C1B19),
      offset: Offset(0.0, 2.0),
      blurRadius: 8.0,
      spreadRadius: 0.0,
    ),
  ];

  /// Tema escuro nao usa sombra.
  static const List<BoxShadow> nenhuma = <BoxShadow>[];
}

