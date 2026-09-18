// F1.3 — Cadastrar pet: identificacao.
//
// A ISCA central deste arquivo: **os dois campos de raca nao podem coexistir
// preenchidos.** `breed_code` vem da lista fechada e e a unica coisa que o
// cruzamento de perdido e achado le; `breed_free_text` e a raca como a pessoa
// escreveu, guardada e exibida, nunca cruzada. O contrato recusa os dois
// juntos com `validation-failed`.
//
// A restricao que impede isso nao e validacao: e o campo de texto **so
// existir** quando a opcao de saida esta escolhida. Se alguem "melhorar" a
// tela deixando o campo sempre visivel, o primeiro grupo reprova -- e reprova
// antes de o defeito virar um codigo de cruzamento sujo, que e o estrago que
// so aparece meses depois, no dia em que um pet some e o cruzamento nao
// acontece.

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  Future<http.Response> comAListaDeRacas(http.Request req) async {
    if (req.url.path.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    // `POST /v1/pets` nao existe no servidor ainda, e este arquivo nao chega a
    // chamar. Nada aqui simula um cadastro bem-sucedido.
    return http.Response('', 404);
  }

  Future<void> abrirF13(
    WidgetTester tester, {
    Future<http.Response> Function(http.Request)? rede,
  }) async {
    await abrirOApp(tester, rede: rede ?? comAListaDeRacas);
    await irPara(tester, Rotas.cadastrarPet);
  }

  /// Abre a lista de raca e escolhe a opcao com este rotulo.
  /// Abre o seletor de raca (qualquer que seja o valor que ele ja mostra) e
  /// escolhe a opcao com este rotulo.
  Future<void> escolherRaca(WidgetTester tester, String rotulo) async {
    // Sobe ate o seletor: depois de digitar no campo livre a lista rolou, e o
    // `ListView` nao mantem construido o que saiu da tela.
    await rolarAte(tester, find.byType(SeletorDeLista), passo: -120);
    // O toque vai na CAIXA do seletor, e nao no bloco inteiro: o bloco inclui
    // o rotulo e a linha de ajuda, e o centro dele cai no texto.
    await tocar(
      tester,
      find.descendant(
        of: find.byType(SeletorDeLista).first,
        matching: find.byType(InkWell),
      ),
    );
    await tocar(tester, find.text(rotulo).last);
  }

  testWidgets('a tela abre com saida, passo e o titulo do desenho',
      (tester) async {
    await abrirF13(tester);

    expect(find.text('Passo 1 de 3'), findsOne);
    expect(find.text(TextosDoCadastro.tituloIdentificacao), findsOne);
    // Tela fora das abas tem saida, sempre. Ela cobre a barra inferior, e sem
    // saida propria a pessoa fica sem barra E sem volta.
    expect(find.byTooltip('Voltar'), findsOne);
  });

  testWidgets('a ajuda da raca diz que vira-lata esta na lista', (tester) async {
    await abrirF13(tester);

    // Sete palavras que removem o medo de quem tem um SRD diante de uma lista
    // fechada. Se sumirem, quem mais se beneficia do codigo fechado e quem
    // mais vai achar que o animal dele e uma excecao.
    expect(
      find.textContaining('Vira-lata está nela'),
      findsOne,
      reason: 'REPROVA: a ajuda da raca perdeu a mencao a vira-lata. E a '
          'frase que mais trabalha nesta tela.',
    );
  });

  group('os dois campos de raca', () {
    testWidgets('o campo livre NAO existe antes de a opcao de saida ser '
        'escolhida', (tester) async {
      await abrirF13(tester);
      await tocar(tester, find.text('Cão'));

      expect(
        find.text('${TextosDoCadastro.rotuloDaRacaLivre} (opcional)'),
        findsNothing,
        reason: 'REPROVA: o campo de raca livre esta visivel sem a opcao '
            '`Outra` escolhida. Deixa-lo sempre visivel e convidar ao erro '
            'que o contrato recusa, e depois explica-lo.',
      );

      await escolherRaca(tester, 'Shih Tzu');
      expect(
        find.text('${TextosDoCadastro.rotuloDaRacaLivre} (opcional)'),
        findsNothing,
        reason: 'REPROVA: raca da lista escolhida e o campo livre apareceu. '
            'Mandar os dois responde `validation-failed`.',
      );
    });

    testWidgets('escolher Outra faz o campo livre aparecer', (tester) async {
      await abrirF13(tester);
      await tocar(tester, find.text('Cão'));
      await escolherRaca(tester, TextosDoCadastro.opcaoOutraRaca);

      expect(
        find.text('${TextosDoCadastro.rotuloDaRacaLivre} (opcional)'),
        findsOne,
        reason: 'REPROVA: `Outra` escolhida e o campo livre nao apareceu. Sem '
            'ele, quem tem um Akita nao consegue dizer o que o animal e.',
      );
      // A ajuda diz ONDE o texto aparece. Ela deliberadamente NAO diz que o
      // campo nao cruza: isso e verdade, e relevante para nos, e ruido para
      // quem esta cadastrando o proprio cachorro.
      expect(find.textContaining('Aparece na ficha'), findsOne);
      expect(
        find.textContaining('cruzamento'),
        findsNothing,
        reason: 'REPROVA: a ajuda do campo livre voltou a falar de '
            'cruzamento. O UX cortou essa frase de proposito.',
      );
    });

    testWidgets('trocar Outra por uma raca da lista apaga o texto livre',
        (tester) async {
      await abrirF13(tester);
      await tocar(tester, find.text('Cão'));
      await escolherRaca(tester, TextosDoCadastro.opcaoOutraRaca);

      await tester.ensureVisible(find.byType(TextField).last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'Akita');
      await tester.pumpAndSettle();
      expect(find.text('Akita'), findsOne);

      await escolherRaca(tester, 'Shih Tzu');

      expect(
        find.text('Akita'),
        findsNothing,
        reason: 'REPROVA: o texto livre sobreviveu a troca para uma raca da '
            'lista. "Shih Tzu" no codigo e "Akita" no texto sao duas '
            'respostas para uma pergunta, e a divergencia nao tem como ser '
            'resolvida depois.',
      );
    });

    testWidgets('o contador do campo livre mostra o teto de 40 do contrato',
        (tester) async {
      await abrirF13(tester);
      await tocar(tester, find.text('Cão'));
      await escolherRaca(tester, TextosDoCadastro.opcaoOutraRaca);

      expect(
        find.text('0/40'),
        findsOne,
        reason: 'REPROVA: o contador sumiu. O requisito e dito ANTES do erro '
            '(UX secao 13); sem ele a pessoa descobre o limite ao ser '
            'recusada.',
      );
    });
  });

  testWidgets('a lista que nao carrega nao trava o cadastro, e nao vira texto '
      'livre', (tester) async {
    await abrirF13(
      tester,
      rede: (_) async => http.Response('', 503),
    );

    expect(
      find.textContaining('Não conseguimos carregar a lista de raças'),
      findsOne,
    );
    await rolarAte(tester, find.text(TextosDoCadastro.continuarSemARaca));
    expect(find.text(TextosDoCadastro.continuarSemARaca), findsOne);

    // O que NAO pode acontecer: a lista virar campo de texto livre como plano
    // B. Ai o codigo de cruzamento nasce sujo, que e exatamente o que os dois
    // campos existem para evitar.
    expect(
      find.text('${TextosDoCadastro.rotuloDaRacaLivre} (opcional)'),
      findsNothing,
      reason: 'REPROVA: a falha da lista abriu um campo de texto livre. '
          'Cadastrar sem raca e escolher depois em `Editar` e a saida certa; '
          'texto livre como plano B suja a chave de cruzamento.',
    );
    // E o cadastro segue: raca e opcional no contrato.
    expect(
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.continuar),
      findsOne,
    );
  });

  testWidgets('Continuar tem alvo critico de 64 dp e rotulo anunciavel',
      (tester) async {
    await abrirF13(tester);

    final continuar =
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.continuar);
    final alvo = tamanhoDoAlvo(tester, continuar);
    expect(
      alvo.height,
      greaterThanOrEqualTo(pisoCritico),
      reason: 'REPROVA: alvo de ${alvo.height} dp na acao principal. O piso '
          'critico e $pisoCritico dp.',
    );
    exigirRotuloAnunciavel(tester, TextosDoCadastro.continuar, na: 'F1.3');
  });

  testWidgets('Continuar com o nome vazio nao avanca, e diz o que falta',
      (tester) async {
    await abrirF13(tester);
    await tocar(
      tester,
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.continuar),
    );

    expect(
      find.text(TextosDoCadastro.digiteONome),
      findsOne,
      reason: 'REPROVA: a tela avancou sem nome, ou nao disse o que falta. '
          '`name` e obrigatorio no contrato, e botao que nao responde sem '
          'motivo dito e desenho preguicoso.',
    );
    expect(
      find.text('Passo 2 de 3'),
      findsNothing,
      reason: 'REPROVA: avancou para F1.4 sem os campos obrigatorios.',
    );
  });

  testWidgets('com os obrigatorios preenchidos, Continuar leva a F1.4',
      (tester) async {
    await abrirF13(tester);
    await tester.enterText(find.byType(TextField).first, 'Nina');
    await tocar(tester, find.text('Cão'));
    await tocar(tester, find.text('Médio'));
    await tocar(
      tester,
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.continuar),
    );

    expect(find.text('Passo 2 de 3'), findsOne);
    // O nome atravessa o passo: a tela seguinte fala do pet pelo nome.
    expect(find.text('Uma foto de Nina'), findsOne);
  });
}
