// Rotulo acessivel em todo elemento tocavel.
//
// WCAG 2.1 SC 4.1.2 (nome, funcao, valor) e SC 2.5.3 (rotulo no nome
// acessivel, para comando de voz). Secao 15.3 da pesquisa de UX e paragrafo
// 10.1 do design system: icone que representa acao carrega rotulo textual
// visivel ou, quando isso nao for possivel, um semanticsLabel.

import 'package:flutter_test/flutter_test.dart';

import 'telas.dart';
import 'tokens.dart';
import 'verificador.dart';

void main() {
  late TokensBichu tokens;

  setUpAll(() => tokens = TokensBichu.doDisco());

  for (final escuro in [false, true]) {
    final tema = escuro ? 'escuro' : 'claro';

    testWidgets('tela do achador, tema $tema', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(telaDoAchador(tokens, escuro: escuro));
      await tester.pumpAndSettle();

      final v = verificarRotulos(
        tester,
        tela: 'achador',
        tema: tema,
        tocaveisEsperados: 2,
      );
      expect(v, isEmpty, reason: 'no tocavel sem rotulo:\n${relatorio(v)}');

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      handle.dispose();
    });

    testWidgets('tela comum do app, tema $tema', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(telaComumDoApp(tokens, escuro: escuro));
      await tester.pumpAndSettle();

      final v = verificarRotulos(
        tester,
        tela: 'app-comum',
        tema: tema,
        tocaveisEsperados: 1,
      );
      expect(v, isEmpty, reason: 'no tocavel sem rotulo:\n${relatorio(v)}');
      handle.dispose();
    });
  }

  testWidgets('o verificador reprova quando enxerga menos do que a tela tem', (
    tester,
  ) async {
    // A armadilha que este caso guarda: um verificador cego devolve lista
    // vazia, e lista vazia e indistinguivel de "esta tudo certo". Ele ficaria
    // verde em toda tela, para sempre, e ninguem procura o que acredita ja
    // ter.
    //
    // A primeira versao deste caso tentava provar isso desligando a arvore de
    // semantica, e nao funcionou: no binding de teste ela fica ligada. Entao a
    // defesa mudou de lugar. Agora a tela declara quantos nos tocaveis tem, e
    // achar menos e reprovacao com nome.
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(telaDoAchador(tokens, escuro: false));
    await tester.pumpAndSettle();

    final v = verificarRotulos(
      tester,
      tela: 'achador',
      tema: 'claro',
      tocaveisEsperados: 99,
    );
    expect(
      v.where((x) => x.tipo == TipoDeViolacao.indeterminado),
      isNotEmpty,
      reason:
          'o verificador achou menos nos do que a tela declara e mesmo '
          'assim nao reprovou. Assim ele aprova qualquer tela que ele nao '
          'consiga enxergar.',
    );
    handle.dispose();
  });
}
