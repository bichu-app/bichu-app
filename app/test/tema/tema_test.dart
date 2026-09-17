import 'package:bichu/theme/bichu_colors.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// As travas do tema, escritas como teste porque comentario nao reprova merge.
///
/// Os valores abaixo sao a identidade Framboesa de 17/09/2026 e foram medidos
/// contra `design/tokens.json`, nao escolhidos para o teste passar. Quem muda
/// um token muda aqui junto: e esse acoplamento que faz a troca de paleta
/// aparecer no diff em vez de escorregar.
void main() {
  // Manteiga `butter.400`, o preenchimento de acao. 1.73:1 contra a
  // superficie marfim, entao nunca pode ser texto. O mesmo valor nos dois
  // temas: a cor da marca nao clareia no escuro, quem clareia e a tinta.
  const manteiga = Color(0xFFE7B93E);

  // Framboesa `raspberry.700`, o valor exato da folha do cliente. 7.36:1
  // sobre o marfim.
  const tintaClara = Color(0xFF922C4A);

  // `raspberry.300`, a tinta no escuro. 8.65:1 sobre `bark.900`.
  const tintaEscura = Color(0xFFE3A0B4);

  group('ColorScheme.primary nao e o preenchimento de acao', () {
    test('tema claro usa a tinta', () {
      expect(BichuTheme.claro.colorScheme.primary, tintaClara);
      expect(BichuTheme.claro.colorScheme.primary, isNot(manteiga));
    });

    test('tema escuro usa a tinta clara', () {
      expect(BichuTheme.escuro.colorScheme.primary, tintaEscura);
      expect(BichuTheme.escuro.colorScheme.primary, isNot(manteiga));
    });

    test('nenhum papel de texto do ColorScheme carrega preenchimento de marca',
        () {
      // Os quatro papeis nunca-texto da paleta nova, e nao so o de acao:
      // `$extensions.bichu.nunca-texto` em design/tokens.json declara os
      // quatro, e os quatro medem abaixo de 3:1 contra o marfim.
      const preenchimentosDeMarca = <Color>[
        manteiga, // action-fill, 1.73:1
        Color(0xFFD0A324), // action-fill-pressed, 2.20:1
        Color(0xFFA9CFBB), // community-fill, Verde suave, 1.60:1
        Color(0xFFE8A7A0), // accent-fill, Goiaba suave, 1.88:1
      ];

      for (final tema in <ThemeData>[BichuTheme.claro, BichuTheme.escuro]) {
        final e = tema.colorScheme;
        final papeisDeTexto = <Color>[
          e.primary,
          e.onPrimary,
          e.onPrimaryContainer,
          e.onSurface,
          e.onSurfaceVariant,
          e.secondary,
          e.tertiary,
          e.error,
        ];
        for (final preenchimento in preenchimentosDeMarca) {
          expect(
            papeisDeTexto,
            isNot(contains(preenchimento)),
            reason: 'Preenchimento de marca em papel de texto do '
                'ColorScheme. Manteiga, Verde suave e Goiaba suave medem de '
                '1.60:1 a 2.20:1 contra a superficie: qualquer papel de texto '
                'com esse valor nasce ilegivel.',
          );
        }
      }
    });
  });

  group('o preenchimento de acao chega a tela so pelos caminhos montados', () {
    test('o FilledButton usa o preenchimento manteiga', () {
      final estilo = BichuTheme.claro.filledButtonTheme.style;
      final fundo = estilo?.backgroundColor?.resolve(<WidgetState>{});
      expect(fundo, manteiga);
    });

    test('o FAB usa o preenchimento manteiga', () {
      expect(
        BichuTheme.claro.floatingActionButtonTheme.backgroundColor,
        manteiga,
      );
    });

    test('os campos brutos tem o nome que denuncia o uso errado', () {
      // Se um destes quebrar porque alguem renomeou o campo para algo
      // simpatico, a trava caiu junto: o nome feio e metade do mecanismo, e a
      // outra metade e ele ser o unico caminho ate o valor.
      expect(BichuColors.claro.actionFillRawDoNotUseAsText, manteiga);
      expect(
        BichuCores.claro.actionFillPressedRawDoNotUseAsText,
        const Color(0xFFD0A324),
      );
      expect(
        BichuCores.claro.communityFillRawDoNotUseAsText,
        const Color(0xFFA9CFBB),
      );
      expect(
        BichuCores.claro.accentFillRawDoNotUseAsText,
        const Color(0xFFE8A7A0),
      );
    });

    test('o texto sobre o preenchimento de acao e o mesmo nos dois temas', () {
      // 9.35:1 sobre a manteiga. O preenchimento nao muda entre os temas,
      // entao o que vai por cima tambem nao pode mudar.
      expect(BichuCores.claro.onActionFill, BichuCores.escuro.onActionFill);
      expect(BichuCores.claro.onActionFill, const Color(0xFF1C1B19));
    });
  });

  group('a inversao de nomenclatura de outline acontece uma vez', () {
    test('outline do M3 recebe a nossa borda de controle', () {
      expect(
        BichuTheme.claro.colorScheme.outline,
        BichuCores.claro.outlineControl,
      );
    });

    test('outlineVariant do M3 recebe o nosso divisor decorativo', () {
      expect(
        BichuTheme.claro.colorScheme.outlineVariant,
        BichuCores.claro.outline,
      );
    });
  });

  group('divergencias declaradas do Material 3', () {
    test('sem sobreposicao tonal de elevacao', () {
      expect(BichuTheme.claro.applyElevationOverlayColor, isFalse);
      expect(BichuTheme.claro.colorScheme.surfaceTint, Colors.transparent);
      expect(BichuTheme.escuro.colorScheme.surfaceTint, Colors.transparent);
    });

    test('botao com raio 12, e nao capsula', () {
      final forma = BichuTheme.claro.filledButtonTheme.style?.shape
          ?.resolve(<WidgetState>{});
      expect(forma, isA<RoundedRectangleBorder>());
      final raio = (forma! as RoundedRectangleBorder).borderRadius;
      expect(raio, BorderRadius.circular(BichuRaio.md));
    });

    test('alvo de toque: 48 no padrao, 64 no critico', () {
      final padrao = BichuColors.claro.filledButtonStyle.minimumSize
          ?.resolve(<WidgetState>{});
      final critico = BichuColors.claro.filledButtonStyleCritico.minimumSize
          ?.resolve(<WidgetState>{});
      expect(padrao?.height, BichuAlvoDeToque.min);
      expect(critico?.height, BichuAlvoDeToque.critico);
      expect(BichuAlvoDeToque.min, 48.0);
      expect(BichuAlvoDeToque.critico, 64.0);
    });

    test('botao secundario tem contorno de 2px', () {
      final lado = BichuTheme.claro.outlinedButtonTheme.style?.side
          ?.resolve(<WidgetState>{});
      expect(lado?.width, BichuBorda.medium);
      expect(BichuBorda.medium, 2.0);
    });

    test('no escuro nao ha sombra; a borda entra no lugar', () {
      expect(BichuColors.temaEscuro.sombra(BichuSombra.md), isEmpty);
      expect(BichuColors.claro.sombra(BichuSombra.md), isNotEmpty);
    });
  });

  group('a cor de erro e da familia Brasa, nao da familia da marca', () {
    test('o erro claro e ember.700 e o escuro e ember.300', () {
      expect(BichuCores.claro.error, const Color(0xFF8E2E0B));
      expect(BichuCores.escuro.error, const Color(0xFFE89273));
    });

    test('o erro nao repete a tinta da marca', () {
      // O vermelho-vinho anterior estava no mesmo matiz da framboesa nova. O
      // teste guarda a separacao: erro e marca sao cores diferentes, e nao
      // duas leituras da mesma.
      expect(BichuCores.claro.error, isNot(BichuCores.claro.primary));
      expect(BichuCores.escuro.error, isNot(BichuCores.escuro.primary));
    });
  });

  group('tipografia', () {
    test('o corpo padrao do app e 16 e o de tela critica e 18', () {
      expect(BichuTheme.claro.textTheme.bodyLarge?.fontSize, 16);
      expect(BichuEscalaDeTipo.bodyLg.tamanho, 18);
    });

    test('so duas familias no sistema', () {
      final familias = BichuEscalaDeTipo.todos.map((t) => t.familia).toSet();
      expect(familias, <String>{'Inter', 'Plus Jakarta Sans'});
    });

    test('caption existe e e proibido em tela critica: 13 < 16', () {
      // O piso de 16sp das telas criticas e o que torna o caption proibido
      // la. O teste guarda o numero para que a proibicao tenha lastro.
      expect(BichuEscalaDeTipo.caption.tamanho, 13);
      expect(BichuEscalaDeTipo.bodyLg.tamanho, greaterThanOrEqualTo(16));
    });
  });
}
