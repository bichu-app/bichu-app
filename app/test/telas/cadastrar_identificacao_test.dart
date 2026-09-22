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

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
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

    // O campo livre NAO aparece sozinho, e a distincao e fina: o problema
    // nunca foi a pessoa digitar -- foi o texto digitado virar a chave de
    // cruzamento. Aparecer sozinho faria o texto substituir a lista. Aparecer
    // depois de `Digitar a raca` faz ele acompanhar o codigo `outro_<especie>`,
    // que e limpo. Ver o caso seguinte.
    expect(
      find.text('${TextosDoCadastro.rotuloDaRacaLivre} (opcional)'),
      findsNothing,
      reason: 'REPROVA: a falha da lista abriu o campo de texto livre SOZINHA. '
          'Ele existe, mas atras de uma escolha explicita.',
    );
    // E o cadastro segue: raca e opcional no contrato.
    expect(
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.continuar),
      findsOne,
    );
  });

  testWidgets(
      'CRITERIO 6 de BICHUS-90: sem a lista, `Digitar a raca` abre o texto '
      'livre com o codigo outro_<especie>, que e LIMPO', (tester) async {
    await abrirF13(
      tester,
      rede: (_) async => http.Response('', 503),
    );
    // A espécie primeiro: a lista de raças é POR espécie, e sem ela não existe
    // `outro_<espécie>` para escolher.
    await tocar(tester, find.text('Cão'));

    await rolarAte(tester, find.text(TextosDoCadastro.digitarARaca));
    await tester.tap(find.text(TextosDoCadastro.digitarARaca));
    await tester.pumpAndSettle();

    // O campo existe agora, e existe porque a pessoa pediu.
    expect(
      find.text('${TextosDoCadastro.rotuloDaRacaLivre} (opcional)'),
      findsOne,
      reason: 'sem este campo, a raca se perde quando a lista nao carrega, e '
          '`outro_dog` + "Akita" aparece na ficha, no cartaz e no perfil '
          'publico -- nada nao aparece',
    );

    await tester.ensureVisible(find.byType(TextField).last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Akita');
    await tester.pumpAndSettle();
    expect(find.text('Akita'), findsOne);

    // E o cadastro segue, com o texto guardado.
    expect(
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.continuar),
      findsOne,
    );
  });

  testWidgets(
      'o texto digitado sem lista NAO vira a chave de cruzamento', (tester) async {
    // Este e o medo que a primeira versao desta tela tinha, e ele continua
    // valendo: o que nao pode e o texto livre SUBSTITUIR o codigo. Aqui ele
    // acompanha `outro_<especie>`, que e um codigo da lista fechada
    // significando "nao esta na lista" -- e o cruzamento continua olhando o
    // codigo, nunca o texto.
    await abrirF13(
      tester,
      rede: (_) async => http.Response('', 503),
    );
    // A espécie primeiro: a lista de raças é POR espécie, e sem ela não existe
    // `outro_<espécie>` para escolher.
    await tocar(tester, find.text('Cão'));

    await rolarAte(tester, find.text(TextosDoCadastro.digitarARaca));
    await tester.tap(find.text(TextosDoCadastro.digitarARaca));
    await tester.pumpAndSettle();

    // A lista SEGUE desabilitada: ela nao carregou, e fingir que carregou
    // seria pior que o campo livre.
    //
    // Rola ate ela antes de ler: o `ListView` so constroi o que cabe na tela, e
    // depois de o campo livre aparecer o seletor pode ter saido da dobra.
    await rolarAte(tester, find.byType(SeletorDeLista), passo: -120);
    final seletor = tester.widget<SeletorDeLista>(find.byType(SeletorDeLista).first);
    expect(seletor.habilitado, isFalse);
    expect(seletor.selecionado, 'outro_dog',
        reason: 'o codigo precisa ser o `outro_<especie>` da lista fechada');
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

  // BICHUS-156 -------------------------------------------------------------
  //
  // A segunda ISCA deste arquivo, e ela e de CLASSE, nao de campo.
  //
  // `RascunhoDePet` e um `ChangeNotifier` e `atualizar` chama
  // `notifyListeners()`. A tela nao o escutava, entao a notificacao nao
  // chegava a ninguem: o campo que so chamava `atualizar` -- o sexo -- gravava
  // o valor e **nao redesenhava**. A selecao so aparecia no toque seguinte,
  // quando o `setState` do PORTE redesenhava a tela inteira, e era dai que
  // vinha o relato do cliente de que "o sexo esta vinculado ao porte".
  //
  // Por isso um caso que tocasse no sexo e DEPOIS no porte antes de conferir
  // ficaria verde com o defeito de pe. Os casos abaixo nao fazem isso.
  group('BICHUS-156 — a tela escuta o rascunho', () {
    /// Exige que o segmento com este rotulo esteja (ou nao esteja) marcado
    /// como selecionado.
    ///
    /// Vai pelo `find.text` e sobe ate o no de acessibilidade: `_Segmento` usa
    /// `excludeSemantics`, entao o no mais proximo acima do texto e o do
    /// proprio segmento. O `selected` desse no e o mesmo bit que pinta a borda
    /// e o preenchimento, entao conferir aqui confere o que a pessoa **ve** e
    /// o que o leitor de tela **anuncia**, de uma vez.
    ///
    /// O handle sai no `finally`: a arvore de semantica so existe enquanto
    /// alguem a segura, e um handle vivo no fim do caso reprova o caso por um
    /// motivo que nao e o dele.
    void exigirSegmento(
      WidgetTester tester,
      String rotulo, {
      required bool selecionado,
      String? porque,
    }) {
      final handle = tester.ensureSemantics();
      try {
        expect(
          tester.getSemantics(find.text(rotulo)),
          isSemantics(isSelected: selecionado),
          reason: porque,
        );
      } finally {
        handle.dispose();
      }
    }

    testWidgets('A ISCA: tocar num sexo mostra a selecao, e nada mais e tocado',
        (tester) async {
      await abrirF13(tester);

      // Rolar nao e tocar num campo: o grupo de sexo e o ultimo da tela, e
      // ninguem toca no que esta fora da dobra. Nenhum OUTRO campo recebe
      // toque neste caso, e e isso que faz dele isca.
      await rolarAte(tester, find.text('Fêmea'));
      await tocar(tester, find.text('Fêmea'));

      exigirSegmento(
        tester,
        'Fêmea',
        selecionado: true,
        porque: 'REPROVA: o sexo foi escolhido e a tela nao redesenhou. O '
            'valor vai para o rascunho, mas quem tocou nao ve resposta e toca '
            'de novo -- e, palavra por palavra, o relato do cliente. Se este '
            'caso reprovar, a tela parou de escutar o `RascunhoDePet`.',
      );
    });

    testWidgets('tocar em outro sexo move a selecao, e nao acumula',
        (tester) async {
      await abrirF13(tester);
      await rolarAte(tester, find.text('Fêmea'));
      await tocar(tester, find.text('Fêmea'));
      await tocar(tester, find.text('Macho'));

      exigirSegmento(tester, 'Macho', selecionado: true);
      exigirSegmento(
        tester,
        'Fêmea',
        selecionado: false,
        porque: 'REPROVA: os dois sexos ficaram selecionados. O grupo e '
            'mutuamente exclusivo, e duas respostas para uma pergunta nao tem '
            'como ser resolvidas depois.',
      );
    });

    testWidgets('o sexo que a tela MOSTRAVA e o que atravessa o passo',
        (tester) async {
      final rascunho = RascunhoDePet();
      await abrirOApp(tester, rede: comAListaDeRacas);
      await irPara(tester, Rotas.cadastrarPet, extra: rascunho);

      await tester.enterText(find.byType(TextField).first, 'Nina');
      await tocar(tester, find.text('Cão'));
      await rolarAte(tester, find.text('Médio'));
      await tocar(tester, find.text('Médio'));
      await tocar(tester, find.text('Fêmea'));
      exigirSegmento(tester, 'Fêmea', selecionado: true);

      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.continuar),
      );

      expect(find.text('Passo 2 de 3'), findsOne);
      expect(
        rascunho.sexo,
        Sexo.femea,
        reason: 'REPROVA: o sexo gravado nao e o que a tela mostrava.',
      );
    });

    testWidgets(
        'O CRITERIO QUE SEPARA A RAIZ DA ESTREITA: mudanca que so passa por '
        '`atualizar`, sem `setState` nenhum, redesenha', (tester) async {
      // O rascunho vem de FORA da tela, e a mudanca tambem. E o campo NOVO que
      // alguem acrescentar amanha chamando so `atualizar`: aqui nao existe
      // handler de campo, entao nao existe onde por um `setState`.
      //
      // Um `setState` no handler do sexo faria os casos de toque acima
      // passarem e deixaria ESTE de pe. E o unico caso do arquivo que separa
      // a correcao de raiz da correcao por campo, e sem ele a historia fecha
      // com o defeito de classe intacto.
      final rascunho = RascunhoDePet();
      await abrirOApp(tester, rede: comAListaDeRacas);
      await irPara(tester, Rotas.cadastrarPet, extra: rascunho);

      await rolarAte(tester, find.text('Macho'));
      exigirSegmento(tester, 'Macho', selecionado: false);

      rascunho.atualizar(() => rascunho.sexo = Sexo.macho);
      await tester.pump();

      exigirSegmento(
        tester,
        'Macho',
        selecionado: true,
        porque: 'REPROVA: `atualizar` notificou e a tela nao redesenhou. A '
            'tela precisa ESCUTAR o `RascunhoDePet` (`addListener` ou '
            '`ListenableBuilder`); um `setState` ao lado de cada `atualizar` '
            'nao satisfaz este caso, e e justamente a correcao que ja falhou '
            'uma vez neste repositorio (ver o comentario de '
            '`tela_cadastrar_sinais.dart`).',
      );
    });

    testWidgets(
        'o `setState` do handler do PORTE continua necessario: ele apaga a '
        'cobranca do porte', (tester) async {
      // A escuta do rascunho NAO torna aquele `setState` redundante, e este
      // caso e a prova: `_erroDoPorte` e estado LOCAL da tela, o rascunho nao
      // o conhece e nao notifica por ele. Remover o `setState` do handler do
      // porte reprova AQUI -- e e por isso que ele nao deve ser removido como
      // "limpeza" depois desta correcao.
      await abrirF13(tester);
      await tester.enterText(find.byType(TextField).first, 'Nina');
      await tocar(tester, find.text('Cão'));
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.continuar),
      );

      await rolarAte(tester, find.text(TextosDoCadastro.escolhaOPorte));
      expect(find.text(TextosDoCadastro.escolhaOPorte), findsOne);

      await tocar(tester, find.text('Médio'));

      expect(find.text('Médio'), findsOne);
      expect(
        find.text(TextosDoCadastro.escolhaOPorte),
        findsNothing,
        reason: 'REPROVA: o porte foi escolhido e a cobranca continuou na '
            'tela. O `setState` do handler do porte foi removido, e ele '
            'carrega o que o rascunho nao carrega.',
      );
    });

    testWidgets('a digitacao na raca livre continua sobrevivendo ao redesenho',
        (tester) async {
      // O risco usual da correcao de raiz: a tela passa a reconstruir a cada
      // notificacao e isso brigaria com os `TextEditingController`. Nao briga
      // -- o `aoMudar` da raca livre ja chamava `setState` a cada tecla --,
      // mas "nao briga" dito numa frase evapora. Fica como caso.
      await abrirF13(tester);
      await tester.enterText(find.byType(TextField).first, 'Nina');
      await tocar(tester, find.text('Cão'));
      await escolherRaca(tester, TextosDoCadastro.opcaoOutraRaca);

      await tester.ensureVisible(find.byType(TextField).last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'Akita');
      await tester.pumpAndSettle();

      await rolarAte(tester, find.text('Fêmea'));
      await tocar(tester, find.text('Fêmea'));

      await rolarAte(tester, find.text('Akita'), passo: -120);
      expect(
        find.text('Akita'),
        findsOne,
        reason: 'REPROVA: o redesenho disparado pelo rascunho apagou o que '
            'estava digitado no campo livre.',
      );
      await rolarAte(tester, find.text('Nina'), passo: -120);
      expect(find.text('Nina'), findsOne);
    });
  });
}
