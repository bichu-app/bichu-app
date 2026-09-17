// Trava A do paragrafo 18.2.1: contraste de texto RENDERIZADO, nos dois temas.
//
// Renderizado e nao estatico de proposito. Um lint sobre o codigo-fonte so
// pega o ambar, que e o erro que ja sabemos nomear. Este teste pega qualquer
// texto de baixo contraste, inclusive os que ninguem previu, porque mede a cor
// que de fato foi para a tela contra o fundo que de fato ficou atras dela.
//
// Pisos: 7.0 nas telas da lista critica (achador, pagina do QR, confirmacao de
// aviso, cartaz) e 4.5 no resto. Texto grande usa 4.5 e 3.0.
//
// Como a esteira roda isto:
//   flutter test test/a11y --dart-define=bichu.design=$PWD/design

import 'package:flutter_test/flutter_test.dart';

import 'telas.dart';
import 'tokens.dart';
import 'verificador.dart';

void main() {
  late TokensBichu tokens;

  setUpAll(() {
    // Se design/tokens.json nao existir, isto levanta e o job cai com o
    // motivo. Nao ha `skip` em lugar nenhum deste arquivo.
    tokens = TokensBichu.doDisco();
  });

  for (final escuro in [false, true]) {
    final tema = escuro ? 'escuro' : 'claro';

    testWidgets('tela do achador, tema $tema, piso 7.0', (tester) async {
      await tester.pumpWidget(telaDoAchador(tokens, escuro: escuro));
      await tester.pumpAndSettle();

      final v = verificarContrasteDeTexto(
        tester,
        tela: 'achador',
        tema: tema,
        piso: 7.0,
      );

      expect(
        v,
        isEmpty,
        reason:
            'contraste abaixo do piso na tela do achador ($tema):\n'
            '${relatorio(v)}',
      );
    });

    testWidgets('tela comum do app, tema $tema, piso 4.5', (tester) async {
      await tester.pumpWidget(telaComumDoApp(tokens, escuro: escuro));
      await tester.pumpAndSettle();

      final v = verificarContrasteDeTexto(
        tester,
        tela: 'app-comum',
        tema: tema,
        piso: 4.5,
      );

      expect(
        v,
        isEmpty,
        reason:
            'contraste abaixo do piso na tela comum ($tema):\n'
            '${relatorio(v)}',
      );

      // Isencao que ninguem ve vira isencao permanente: a lista vai para o
      // resumo da execucao do job (paragrafo 18.2.1, item 3).
      final isencoes = isencoesEncontradas(tester);
      // ignore: avoid_print
      print('ISENCOES a11y [$tema/app-comum]: ${isencoes.join(' | ')}');
      expect(
        isencoes,
        contains('componente desabilitado, SC 1.4.3'),
        reason:
            'a unica isencao prevista hoje e o componente desabilitado. '
            'Se ela sumiu, ou o componente saiu da tela ou alguem apagou a '
            'chave, e no segundo caso o verificador passou a cobrar um par que '
            'a norma dispensa.',
      );
    });
  }

  testWidgets('texto apagado nao e aceito na tela critica', (tester) async {
    // text-muted da 5.74:1 no claro. Passa no piso de 4.5 da tela comum e
    // reprova no piso de 7.0 da tela critica, que e exatamente por que o
    // paragrafo 6.3 o proibe la. Este caso prova que o piso muda de verdade
    // conforme a tela, e nao so no comentario.
    await tester.pumpWidget(telaComumDoApp(tokens, escuro: false));
    await tester.pumpAndSettle();

    final comoTelaComum = verificarContrasteDeTexto(
      tester,
      tela: 'app-comum',
      tema: 'claro',
      piso: 4.5,
    );
    final comoTelaCritica = verificarContrasteDeTexto(
      tester,
      tela: 'app-comum-sob-piso-critico',
      tema: 'claro',
      piso: 7.0,
    );

    expect(comoTelaComum, isEmpty);
    expect(
      comoTelaCritica.where((v) => v.tipo == TipoDeViolacao.contraste),
      isNotEmpty,
      reason:
          'o piso de 7.0 nao mudou nada em relacao ao de 4.5. Os dois '
          'pisos estao dando o mesmo resultado, o que significa que um deles '
          'nao esta sendo aplicado.',
    );
  });
}
