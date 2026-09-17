import 'dart:math' as math;

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
  // Manteiga `butter.400`, o preenchimento de acao. 1.76:1 contra a
  // superficie off-white, entao nunca pode ser texto. O mesmo valor nos dois
  // temas: a cor da marca nao clareia no escuro, quem clareia e a tinta.
  const manteiga = Color(0xFFE7B93E);

  // Framboesa `raspberry.700`, o valor exato da folha do cliente. 7.49:1
  // sobre a superficie off-white (era 7.36:1 sobre o marfim).
  const tintaClara = Color(0xFF922C4A);

  // `raspberry.300`, a tinta no escuro. 8.65:1 sobre `bark.900`.
  const tintaEscura = Color(0xFFE3A0B4);

  // A familia neutra que virou a superficie do app em 17/09/2026, quando o
  // cliente trocou o Marfim quente pelo off-white. A rampa `sand` deixou de
  // existir e foi absorvida por `neutral`; os papeis semanticos nao mudaram de
  // nome, so de valor, e e exatamente por isso que estas travas existem: uma
  // troca que nao renomeia nada nao quebra assinatura nenhuma e passaria sem
  // uma unica assercao notar.
  const superficie = Color(0xFFFAFAF8); // neutral.25
  const superficieAlt = Color(0xFFF6F6F4); // neutral.50
  const superficieFunda = Color(0xFFF4F3F1); // neutral.100
  const divisor = Color(0xFFDFDED8); // neutral.200, outline decorativo
  const bordaDeControle = Color(0xFF827F73); // neutral.400, outline-control

  // O Marfim quente da folha de identidade. Continua no material de marca e
  // saiu do app (design/tokens.json, paragrafo 6.8). Nenhum papel de
  // superficie pode voltar a este valor sem que alguem tenha decidido isso.
  const marfimDaMarca = Color(0xFFFFF7E8);

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
      // quatro, e os quatro medem abaixo de 3:1 contra a superficie. A troca
      // do marfim pelo off-white melhorou as quatro razoes em cerca de 0.03, o
      // que nao chega perto de tornar qualquer uma delas legivel.
      const preenchimentosDeMarca = <Color>[
        manteiga, // action-fill, 1.76:1
        Color(0xFFD0A324), // action-fill-pressed, 2.25:1
        Color(0xFFA9CFBB), // community-fill, Verde suave, 1.63:1
        Color(0xFFE8A7A0), // accent-fill, Goiaba suave, 1.92:1
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
                '1.63:1 a 2.25:1 contra a superficie: qualquer papel de texto '
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

    test('os quatro preenchimentos de marca tem caminho montado', () {
      // Nome feio sem caminho montado nao segura nada: a primeira tela que
      // precisar do verde suave vai pegar o campo bruto, porque nao ha outro
      // jeito, e o nome feio vira ruido que se aprende a ignorar. A trava e o
      // par -- caminho pronto mais nome feio -- e nao so a metade greppavel.
      final c = BichuColors.claro;

      expect(c.actionFillBox().color, manteiga);
      expect(c.communityFillBox().color, const Color(0xFFA9CFBB));
      expect(c.accentFillBox().color, const Color(0xFFE8A7A0));

      // O pressionado nao ganha caixa propria: ele so existe dentro do estilo
      // de botao, que ja resolve o estado. Uma caixa para ele seria um quarto
      // caminho sem tela que o peca.
      final pressionado = BichuTheme.claro.filledButtonTheme.style
          ?.backgroundColor
          ?.resolve(<WidgetState>{WidgetState.pressed});
      expect(pressionado, const Color(0xFFD0A324));
    });

    test('cada preenchimento tem o seu par de texto exposto', () {
      // O caminho montado so serve se o que vai POR CIMA vier junto. Framboesa
      // sobre o verde da 4.60:1 e sobre a goiaba 3.90:1: os dois reprovam o
      // piso de texto, e e por isso que o par certo precisa estar a mao.
      final c = BichuColors.claro;
      expect(c.onCommunityFill, const Color(0xFF1C1B19));
      expect(c.onAccentFill, const Color(0xFF1C1B19));

      // O preenchimento e o mesmo nos dois temas, entao a tinta por cima
      // tambem nao pode mudar.
      expect(c.onCommunityFill, BichuColors.temaEscuro.onCommunityFill);
      expect(c.onAccentFill, BichuColors.temaEscuro.onAccentFill);
    });

    test('o texto sobre o preenchimento de acao e o mesmo nos dois temas', () {
      // 9.35:1 sobre a manteiga. O preenchimento nao muda entre os temas,
      // entao o que vai por cima tambem nao pode mudar.
      expect(BichuCores.claro.onActionFill, BichuCores.escuro.onActionFill);
      expect(BichuCores.claro.onActionFill, const Color(0xFF1C1B19));
    });
  });

  group('a superficie do app e o off-white neutro, e nao o marfim da marca',
      () {
    test('as tres superficies claras sao a familia neutral', () {
      expect(BichuCores.claro.surface, superficie);
      expect(BichuCores.claro.surfaceAlt, superficieAlt);
      expect(BichuCores.claro.surfaceSunken, superficieFunda);
    });

    test('nenhum papel de superficie carrega o marfim da folha', () {
      // O marfim nao saiu do sistema: ele saiu do APP. Se voltar por aqui, a
      // decisao de 17/09/2026 foi desfeita sem passar por ninguem.
      final papeisDeSuperficie = <Color>[
        BichuCores.claro.surface,
        BichuCores.claro.surfaceAlt,
        BichuCores.claro.surfaceSunken,
        BichuCores.claro.disabledSurface,
        BichuCores.claro.warningContainer,
        BichuCores.escuro.surfaceInverse,
      ];
      expect(
        papeisDeSuperficie,
        isNot(contains(marfimDaMarca)),
        reason: 'O fundo do app voltou ao Marfim quente #FFF7E8. O cliente '
            'trocou por #FAFAF8 em 17/09/2026 e o marfim ficou so no material '
            'de marca (design/tokens.json, paragrafo 6.8).',
      );
    });

    test('o Scaffold e o ColorScheme pegam a mesma superficie', () {
      // Tres caminhos ate o fundo. Se um deles ficar para tras numa troca de
      // paleta, a tela fica com duas cores de fundo e so aparece no aparelho.
      expect(BichuTheme.claro.scaffoldBackgroundColor, superficie);
      expect(BichuTheme.claro.canvasColor, superficie);
      expect(BichuTheme.claro.colorScheme.surface, superficie);
    });

    test('os papeis que seguem a superficie seguiram junto', () {
      // `on-primary`, `text-on-inverse` e o `surface-inverse` do escuro
      // apontam todos para `neutral.25`. Eles sao o teste de que a troca foi
      // feita no token e nao campo a campo: um deles ficar no marfim seria
      // edicao a mao no Dart gerado.
      expect(BichuCores.claro.onPrimary, superficie);
      expect(BichuCores.claro.textOnInverse, superficie);
      expect(BichuCores.escuro.surfaceInverse, superficie);
    });
  });

  group('sem o marfim, quem separa as camadas claras e a borda', () {
    test('as tres superficies claras sao indistinguiveis entre si', () {
      // 1.04:1 e 1.06:1. Nao e defeito: e a consequencia medida de um fundo
      // neutro quase branco, e e ela que poe peso na borda de controle. O
      // teste guarda o fato para que ninguem tente usar elevacao ou tom para
      // separar camada.
      final c = BichuCores.claro;
      expect(_razao(c.surface, c.surfaceAlt), lessThan(1.1));
      expect(_razao(c.surface, c.surfaceSunken), lessThan(1.1));
    });

    test('a borda de controle cumpre o SC 1.4.11 sobre a superficie nova', () {
      // 3.84:1 sobre #FAFAF8 (era 3.77:1 sobre o marfim). Este e o piso que
      // passou a carregar a separacao das camadas: se a superficie clarear
      // mais, e aqui que o sistema quebra primeiro.
      expect(
        _razao(BichuCores.claro.outlineControl, BichuCores.claro.surface),
        greaterThanOrEqualTo(3.0),
        reason: 'A borda de controle caiu abaixo de 3:1 contra a superficie. '
            'Com as tres camadas claras a 1.04:1 entre si, ela e a unica '
            'coisa que separa controle de fundo: abaixo do piso do SC 1.4.11 '
            'o campo de formulario deixa de ter limite visivel.',
      );
    });

    test('a tinta framboesa melhorou sobre o fundo novo', () {
      // 7.49:1, acima do piso de 7.0 das telas criticas. Era 7.36:1 sobre o
      // marfim: a troca de fundo nao custou contraste, ganhou.
      expect(
        _razao(BichuCores.claro.primary, BichuCores.claro.surface),
        greaterThanOrEqualTo(7.0),
        reason: 'A tinta da marca caiu abaixo do piso de 7.0 das telas '
            'criticas (achador e perdido) sobre a superficie do app.',
      );
    });

    test('o divisor decorativo e a borda de controle nao trocaram de papel',
        () {
      // Os dois sao neutros parecidos e a nomenclatura e invertida em relacao
      // ao M3. Trocar um pelo outro poe 1.29:1 onde precisa haver 3:1, e nada
      // no tipo denuncia.
      expect(BichuCores.claro.outline, divisor);
      expect(BichuCores.claro.outlineControl, bordaDeControle);
      expect(
        _razao(BichuCores.claro.outline, BichuCores.claro.surface),
        lessThan(3.0),
      );
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

/// Razao de contraste do WCAG 2.1, formula 1.4.3.
///
/// Escrita aqui, e nao importada de `test/a11y/verificador.dart`, por uma
/// razao: o que este arquivo guarda sao os VALORES do tema, e a suite de
/// acessibilidade guarda os PARES publicados. Duas implementacoes da mesma
/// formula fechada da norma nao sao duas fontes da verdade — um hex repetido
/// seria. Se as duas discordarem, uma delas esta errada e isso e achado.
double _razao(Color a, Color b) {
  final la = _luminancia(a);
  final lb = _luminancia(b);
  final claro = la > lb ? la : lb;
  final escuro = la > lb ? lb : la;
  return (claro + 0.05) / (escuro + 0.05);
}

double _luminancia(Color c) {
  final argb = c.toARGB32();
  final r = _canal((argb >> 16) & 0xFF);
  final g = _canal((argb >> 8) & 0xFF);
  final b = _canal(argb & 0xFF);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

double _canal(int valor) {
  final v = valor / 255.0;
  if (v <= 0.03928) return v / 12.92;
  return math.pow((v + 0.055) / 1.055, 2.4) as double;
}
