// O teste que testa o portao.
//
// Cada caso monta uma fixture ERRADA de proposito e exige que o verificador a
// reprove. Isca que passa nao deixa o caso amarelo: derruba o job com "o
// verificador parou de verificar", porque a partir daquele momento todos os
// outros testes deste diretorio estao verdes por nao estarem olhando para
// nada.
//
// Paragrafo 18.2.1 e 18.2.2 de docs/06-design-system.md. A razao de existir
// esta escrita la em uma frase: "sem isso, a trava vale pela confianca do dia
// em que foi escrita".
//
// Cada isca vem com a sua contraprova: a mesma tela feita certo, que precisa
// PASSAR. As duas juntas provam que o verificador mede, em vez de so reprovar.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'fixtures/isca_alvo_pequeno.dart';
import 'fixtures/isca_rotulo_ausente.dart';
import 'fixtures/isca_texto_ambar.dart';
import 'tokens.dart';
import 'verificador.dart';

void main() {
  late TokensBichu tokens;

  setUpAll(() => tokens = TokensBichu.doDisco());

  // -------------------------------------------------------------------------
  // Isca 1: a marca virou texto
  // -------------------------------------------------------------------------

  testWidgets('ISCA texto Manteiga sobre surface reprova a 1.76:1', (
    tester,
  ) async {
    await tester.pumpWidget(iscaTextoAmbar(tokens, escuro: false));
    await tester.pumpAndSettle();

    final medido = razaoMedidaDoTexto(tester, conteudoDaIsca);
    // A ANCORA JA MUDOU DUAS VEZES, E O HISTORICO E A PARTE UTIL.
    //
    //   1.57:1  ambar #FFC400 sobre a superficie areia #FFFDF7
    //   1.73:1  Manteiga #E7B93E sobre o Marfim quente #FFF7E8  (identidade
    //           Framboesa, 17/09/2026)
    //   1.76:1  Manteiga #E7B93E sobre o neutro #FAFAF8         (troca do
    //           fundo do app, 17/09/2026)
    //
    // Nas tres vezes o que mudou foi o VALOR de um dos dois tokens que a isca
    // mede, nunca a isca. Ela continua sendo a mesma coisa: a marca virou
    // texto. E as tres razoes foram medidas com a formula da WCAG 2.1 sobre os
    // tokens do dia, nao afrouxadas para o teste voltar a passar.
    //
    // O padrao que o historico mostra vale mais que qualquer um dos numeros:
    // a razao SOBE a cada troca de fundo, porque cada fundo novo foi mais
    // claro que o anterior, e mesmo assim ela continua abaixo de qualquer
    // piso. Se algum dia esta linha chegar perto de 4.5, o problema nao e a
    // ancora: e que o preenchimento de acao deixou de ser preenchimento.
    expect(
      medido,
      closeTo(1.76, 0.02),
      reason:
          'a isca nao esta mais medindo 1.76:1. Ou action-fill mudou de '
          'valor, ou a superficie mudou, ou a fixture foi "corrigida". Nos '
          'tres casos a trava A perdeu a referencia. Se foi mudanca de '
          'paleta ou de fundo, remeca e reescreva a ancora com a razao nova e '
          'o motivo, acrescentando uma linha ao historico acima em vez de '
          'apagar as anteriores.',
    );

    final v = verificarContrasteDeTexto(
      tester,
      tela: 'isca-texto-ambar',
      tema: 'claro',
      piso: 7.0,
    );
    expect(
      v.where((x) => x.tipo == TipoDeViolacao.contraste),
      isNotEmpty,
      reason:
          'O VERIFICADOR DE CONTRASTE PAROU DE VERIFICAR: texto em '
          'action-fill (Manteiga) sobre surface passou. Nao mexa na fixture; conserte o '
          'verificador.',
    );
  });

  testWidgets('ISCA texto Manteiga reprova tambem no piso frouxo de 4.5', (
    tester,
  ) async {
    // 1.76 esta abaixo de qualquer piso. Se um dia so a tela critica acusar,
    // e porque o piso generico deixou de ser aplicado.
    await tester.pumpWidget(iscaTextoAmbar(tokens, escuro: false));
    await tester.pumpAndSettle();
    final v = verificarContrasteDeTexto(
      tester,
      tela: 'isca-texto-ambar',
      tema: 'claro',
      piso: 4.5,
    );
    expect(
      v,
      isNotEmpty,
      reason: 'O VERIFICADOR DE CONTRASTE PAROU DE VERIFICAR.',
    );
  });

  testWidgets('CONTRAPROVA o mesmo rotulo feito certo passa', (tester) async {
    await tester.pumpWidget(textoAmbarConforme(tokens, escuro: false));
    await tester.pumpAndSettle();
    final v = verificarContrasteDeTexto(
      tester,
      tela: 'contraprova-texto-ambar',
      tema: 'claro',
      piso: 7.0,
    );
    expect(
      v,
      isEmpty,
      reason:
          'o verificador reprovou a versao CORRETA (tinta sobre Manteiga, '
          '9.35:1). Ele nao esta medindo contraste, esta reprovando por '
          'reprovar, e um portao assim e desligado na primeira semana.\n'
          '${relatorio(v)}',
    );
  });

  // -------------------------------------------------------------------------
  // Isca 2: alvo de toque pequeno demais
  // -------------------------------------------------------------------------

  testWidgets('ISCA acao critica de 40dp reprova no piso de 64dp', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(iscaAlvoPequeno(tokens, escuro: false));
    await tester.pumpAndSettle();

    final v = verificarAlvoDeToque(
      tester,
      tela: 'isca-alvo-pequeno',
      tema: 'claro',
      piso: tokens.dimensao('target.critico'),
      tocaveisEsperados: 1,
    );
    expect(
      v,
      isNotEmpty,
      reason:
          'O VERIFICADOR DE ALVO DE TOQUE PAROU DE VERIFICAR: "Avisar o '
          'tutor" com 40dp passou no piso de 64dp.',
    );
    expect(v.first.medido, closeTo(alturaErrada, 0.5));

    // E reprova tambem no piso generico de 48dp: a isca acusa mesmo que
    // alguem afrouxe o piso critico por engano.
    final generico = verificarAlvoDeToque(
      tester,
      tela: 'isca-alvo-pequeno',
      tema: 'claro',
      piso: tokens.dimensao('target.min'),
      tocaveisEsperados: 1,
    );
    expect(
      generico,
      isNotEmpty,
      reason: 'O VERIFICADOR DE ALVO PAROU DE VERIFICAR.',
    );
    handle.dispose();
  });

  testWidgets('CONTRAPROVA a mesma acao com 64dp passa', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(alvoConforme(tokens, escuro: false));
    await tester.pumpAndSettle();
    final v = verificarAlvoDeToque(
      tester,
      tela: 'contraprova-alvo',
      tema: 'claro',
      piso: tokens.dimensao('target.critico'),
      tocaveisEsperados: 1,
    );
    expect(
      v,
      isEmpty,
      reason:
          'o verificador reprovou um alvo de 64dp:\n'
          '${relatorio(v)}',
    );
    handle.dispose();
  });

  // -------------------------------------------------------------------------
  // Isca 3: rotulo acessivel ausente
  // -------------------------------------------------------------------------

  testWidgets('ISCA icone de acao sem rotulo reprova', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(iscaRotuloAusente(tokens, escuro: false));
    await tester.pumpAndSettle();

    final v = verificarRotulos(
      tester,
      tela: 'isca-rotulo',
      tema: 'claro',
      tocaveisEsperados: 1,
    );
    expect(
      v,
      isNotEmpty,
      reason:
          'O VERIFICADOR DE ROTULO PAROU DE VERIFICAR: um IconButton sem '
          'tooltip nem semanticsLabel passou. O leitor de tela anuncia so '
          '"botao".',
    );
    expect(v.first.tipo, TipoDeViolacao.rotuloAusente);
    handle.dispose();
  });

  testWidgets('CONTRAPROVA a mesma acao com rotulo visivel passa', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(rotuloConforme(tokens, escuro: false));
    await tester.pumpAndSettle();
    final v = verificarRotulos(
      tester,
      tela: 'contraprova-rotulo',
      tema: 'claro',
      tocaveisEsperados: 1,
    );
    expect(
      v,
      isEmpty,
      reason:
          'o verificador reprovou um botao rotulado:\n'
          '${relatorio(v)}',
    );
    handle.dispose();
  });

  // -------------------------------------------------------------------------
  // Isca 4: a lista de pares rebaixada (trava B, item 4)
  // -------------------------------------------------------------------------

  test('ISCA pares rebaixados reprovam, e o par integro passa', () {
    final arquivo = File(
      '${Directory(_pastaDestesTestes()).path}/fixtures/pares-rebaixados.json',
    );
    if (!arquivo.existsSync()) {
      fail(
        'REPROVA: a isca ${arquivo.path} sumiu. Sem ela nao ha como provar '
        'que o verificador de pares ainda verifica.',
      );
    }
    final lista =
        jsonDecode(arquivo.readAsStringSync()) as Map<String, dynamic>;
    final resultados = verificarPares(tokens, lista);

    final reprovados = {
      for (final r in resultados.where((r) => !r.aprovado)) r.id: r.motivo,
    };

    // Nomeando qual, como o paragrafo 18.2.2 exige.
    expect(
      reprovados.keys,
      containsAll(<String>[
        'ISCA-piso',
        'ISCA-tabela-nao-regerada',
        'ISCA-isencao-sem-motivo',
      ]),
      reason:
          'O VERIFICADOR DE PARES PAROU DE VERIFICAR. Reprovou apenas: '
          '${reprovados.keys.toList()}.',
    );

    expect(
      reprovados.containsKey('CONTROLE-passa'),
      isFalse,
      reason:
          'o verificador reprovou o par INTEGRO de controle. Ele nao esta '
          'medindo: esta reprovando tudo.',
    );
  });
}

/// A pasta deste arquivo de teste, para achar `fixtures/` sem depender do
/// diretorio de trabalho de quem chamou `flutter test`.
String _pastaDestesTestes() {
  final direto = Directory('test/a11y');
  if (direto.existsSync()) return direto.path;
  // Quando o pacote Flutter nao esta na raiz do repositorio, `design/` e a
  // ancora conhecida e `test/a11y` fica ao lado dela.
  final irmao = Directory('${diretorioDesign().parent.path}/test/a11y');
  if (irmao.existsSync()) return irmao.path;
  throw StateError(
    'REPROVA: nao achei a pasta test/a11y a partir de '
    '"${Directory.current.path}" nem ao lado de design/.',
  );
}
