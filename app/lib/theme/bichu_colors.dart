import 'package:flutter/material.dart';

import 'bichu_tokens.g.dart';

/// Os papeis de cor que o `ColorScheme` do Material 3 nao tem.
///
/// Por que uma `ThemeExtension` e nao `tertiary` ou `surfaceVariant`: enfiar
/// `urgency`, `outlineControl` e `focusRing` em papeis que significam outra
/// coisa e o que faz o sistema divergir em tres meses
/// (docs/06-design-system.md secao 18.3).
///
/// **A trava A do sistema vive aqui** (secao 18.2.1). A manteiga `#E7B93E` da
/// 1.76:1 contra a superficie off-white `#FAFAF8`, entao ela nunca pode ser
/// texto. Esta extensao **nao expoe o preenchimento como `Color` solto**: ela
/// entrega o que ja vem montado ([filledButtonStyle], [actionFillBox],
/// [onActionFill]). Quem precisar do valor bruto usa o unico campo que o
/// entrega, e o nome dele e feio de proposito:
/// [actionFillRawDoNotUseAsText]. Nome feio no ponto de uso e uma revisao de
/// codigo que se faz sozinha, e e greppavel.
///
/// Os papeis nunca-texto sao **quatro** na identidade Framboesa, nao um:
/// `action-fill`, `action-fill-pressed`, `community-fill` e `accent-fill`,
/// declarados em `\$extensions.bichu.nunca-texto` de `design/tokens.json`. Os
/// quatro chegam de [BichuCores] com o nome feio, porque o gerador le aquele
/// contrato em vez de carregar uma lista propria.
///
/// **Os quatro precisam de caminho montado, nao so de nome feio.** O nome feio
/// e a segunda metade do mecanismo; a primeira e existir um caminho pronto que
/// dispense o valor bruto. Enquanto so `action-fill` tinha [actionFillBox], a
/// primeira tela de comunidade ia alcancar o verde suave pelo unico jeito
/// disponivel, que era o campo bruto, e o nome feio viraria ruido que se
/// aprende a ignorar. Por isso [communityFillBox] e [accentFillBox] existem
/// antes da tela que vai usa-los.
@immutable
class BichuColors extends ThemeExtension<BichuColors> {
  const BichuColors({required this.cores, required this.escuro});

  /// Os 38 papeis gerados de `design/tokens.json`.
  final BichuCores cores;

  /// Verdadeiro no tema escuro. Decide sombra (secao 9.3) e borda de camada.
  final bool escuro;

  static const BichuColors claro =
      BichuColors(cores: BichuCores.claro, escuro: false);

  static const BichuColors temaEscuro =
      BichuColors(cores: BichuCores.escuro, escuro: true);

  /// Atalho de leitura. Falha ruidosamente quando o tema nao foi instalado,
  /// em vez de devolver uma cor de outro sistema em silencio.
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

  // -- O preenchimento de acao, so pelos caminhos montados -----------------

  /// Texto e icone sobre o preenchimento manteiga. 9.35:1 nos dois temas.
  Color get onActionFill => cores.onActionFill;

  /// O valor bruto da manteiga. **Nunca use como cor de texto.**
  ///
  /// Contra `surface` ele da 1.73:1, que reprova qualquer piso. Existe para
  /// preenchimento de forma e para o arquivo-isca do verificador de contraste.
  Color get actionFillRawDoNotUseAsText => cores.actionFillRawDoNotUseAsText;

  /// Preenchimento manteiga pronto para um `Container`.
  BoxDecoration actionFillBox({double radius = BichuRaio.md}) {
    return BoxDecoration(
      color: cores.actionFillRawDoNotUseAsText,
      borderRadius: BorderRadius.circular(radius),
    );
  }

  // -- Os outros dois preenchimentos de marca, pelo mesmo caminho ----------

  /// Texto e icone sobre o Verde suave. 10.10:1 nos dois temas.
  ///
  /// A framboesa aqui da 4.60:1 e nao entra: o cartao de comunidade escreve em
  /// neutro, mesmo quando o instinto pede a cor da marca.
  Color get onCommunityFill => cores.onCommunityFill;

  /// Texto e icone sobre a Goiaba suave. 8.58:1 nos dois temas.
  ///
  /// A framboesa aqui da 3.90:1, que e o defeito do cartao "Evento no bairro"
  /// da arte de referencia (design/tokens.json, `cor.claro.on-accent-fill`).
  Color get onAccentFill => cores.onAccentFill;

  /// Preenchimento Verde suave pronto para um `Container`.
  ///
  /// `community-fill` da 1.63:1 contra a superficie: ele preenche forma, nunca
  /// pinta glifo. Use [onCommunityFill] no que for por cima.
  BoxDecoration communityFillBox({double radius = BichuRaio.lg}) {
    return BoxDecoration(
      color: cores.communityFillRawDoNotUseAsText,
      borderRadius: BorderRadius.circular(radius),
    );
  }

  /// Preenchimento Goiaba suave pronto para um `Container`.
  ///
  /// `accent-fill` da 1.92:1 contra a superficie. Mesma regra do verde: forma,
  /// nao glifo. Use [onAccentFill] no que for por cima.
  BoxDecoration accentFillBox({double radius = BichuRaio.lg}) {
    return BoxDecoration(
      color: cores.accentFillRawDoNotUseAsText,
      borderRadius: BorderRadius.circular(radius),
    );
  }

  /// O estilo do botao de acao primaria, ja com a manteiga, o raio de 12 e o
  /// alvo de 48. Use [filledButtonStyleCritico] nas acoes de tela critica.
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

  /// Anel de foco de 3px, desenhado com 2px de afastamento.
  ///
  /// O afastamento nao e decoracao: e ele que faz o anel cumprir o SC 1.4.11.
  /// No tema escuro o anel carmim-claro (`#E79DB4`) contra a manteiga
  /// (`#E7B93E`) da 1.15:1, e o unico motivo de isso passar e os dois nunca se
  /// tocarem (secao 7). O mesmo vale para o anel sobre o Verde suave (1.24:1)
  /// e sobre a Goiaba suave (1.05:1).
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
  /// Interpolar entre eles produz valores que ninguem mediu, entao a troca de
  /// tema e um corte, nao uma transicao de cor.
  @override
  BichuColors lerp(ThemeExtension<BichuColors>? other, double t) {
    if (other is! BichuColors) return this;
    return t < 0.5 ? this : other;
  }
}
