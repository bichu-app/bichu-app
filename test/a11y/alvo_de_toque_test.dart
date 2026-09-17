// Alvo de toque: 48dp no app, 64dp nas acoes criticas.
//
// Paragrafo 6.5 do design system e secao 15.1 da pesquisa de UX. Os 64dp
// substituem os 56dp que o design system usava, e o motivo esta na pesquisa:
// pessoa em pe, com um animal em um dos bracos, usando o polegar da outra mao.
// Restricao de campo ganha de preferencia de sistema.
//
// Mede altura E largura, porque o documento manda "64 dp de altura e largura
// total" e um botao de 300 x 40 passaria numa verificacao que so olhasse area.

import 'package:flutter_test/flutter_test.dart';

import 'telas.dart';
import 'tokens.dart';
import 'verificador.dart';

void main() {
  late TokensBichu tokens;

  setUpAll(() => tokens = TokensBichu.doDisco());

  for (final escuro in [false, true]) {
    final tema = escuro ? 'escuro' : 'claro';

    testWidgets('tela do achador, tema $tema, piso 64dp', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(telaDoAchador(tokens, escuro: escuro));
      await tester.pumpAndSettle();

      final piso = tokens.dimensao('target.critico');
      expect(piso, 64, reason: 'target.critico saiu de 64dp em tokens.json.');

      final v = verificarAlvoDeToque(
        tester,
        tela: 'achador',
        tema: tema,
        piso: piso,
        tocaveisEsperados: 2, // "Avisar o tutor" e "Ver como ajudar"
      );
      expect(
        v,
        isEmpty,
        reason:
            'alvo abaixo de 64dp na tela do achador ($tema):\n'
            '${relatorio(v)}',
      );

      // O piso generico do Android e menor que o nosso. Conferir os dois deixa
      // claro qual esta valendo: se um dia o nosso cair para 48, esta linha
      // continua verde e a de cima reprova, e a diferenca aparece.
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      handle.dispose();
    });

    testWidgets('tela comum do app, tema $tema, piso 48dp', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(telaComumDoApp(tokens, escuro: escuro));
      await tester.pumpAndSettle();

      final v = verificarAlvoDeToque(
        tester,
        tela: 'app-comum',
        tema: tema,
        piso: tokens.dimensao('target.min'),
        tocaveisEsperados: 1, // "Adicionar um pet"
      );
      expect(
        v,
        isEmpty,
        reason: 'alvo abaixo de 48dp ($tema):\n${relatorio(v)}',
      );
      handle.dispose();
    });
  }
}
