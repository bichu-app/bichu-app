// Trava A1: contraste do que o APP monta, e nao de uma replica dele.
//
// O motivo de existir esta no cabecalho de `widgets_reais.dart`, com a medicao
// que o produziu. O resumo em uma frase: em 03/11/2026 um par de 2.10:1 chegou
// ao cliente com o job `contraste` verde, porque as duas travas que existiam
// mediam uma replica escrita a mao e uma lista de pares mantida a mao, e
// nenhuma das duas media os widgets.
//
// O QUE ESTE ARQUIVO COBRA: todo par (cor de texto, cor de fundo) que os
// widgets montados aqui DE FATO produzem, nos dois temas, em todos os estados
// que a montagem exercita. Nao ha lista de pares, nao ha veredito publicado e
// nao ha isencao a manter: o par medido e o que saiu da arvore de renderizacao.
//
// O QUE ELE NAO COBRA, e esta dito para nao parecer coberto: as ~98 telas de
// `app/lib/telas`. Fechar a classe por completo e montar o app inteiro, e isso
// nao e este arquivo. O que ESTE arquivo fecha e a classe do PAR TROCADO --
// tinta de um preenchimento pintada sobre outro preenchimento -- nos widgets
// compartilhados que as telas herdam, que e onde os cinco casos de 03/11
// moravam.
//
// Como a esteira roda isto:
//   flutter test test/a11y

import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fixtures/isca_par_trocado.dart';
import 'tokens.dart';
import 'verificador.dart';
import 'widgets_reais.dart';

/// Quantos paragrafos a folha de filtros aberta tem de entregar.
///
/// NAO E BUROCRACIA, e a mesma defesa de `_conferirCobertura`: um `tap` que
/// deixasse de casar, ou uma folha que deixasse de abrir, devolveria arvore
/// sem pastilha nenhuma -- zero texto medido, zero violacao, e um portao verde
/// por nao estar olhando para nada. O numero e o PISO, nao o valor exato: a
/// folha pode ganhar texto sem que isso seja defeito.
const int _paragrafosMinimosDaFolha = 10;

void main() {
  for (final escuro in <bool>[false, true]) {
    final tema = escuro ? 'escuro' : 'claro';

    testWidgets(
      'A FOLHA DE FILTROS do app, com uma pastilha MARCADA, tema $tema',
      (tester) async {
        await abrirAFolhaDeFiltros(tester, escuro: escuro);

        // CONTROLE POSITIVO: a pastilha marcada esta na arvore. Sem este
        // cheque, um `selecionado` que deixasse de chegar faria todas as
        // pastilhas cairem no ramo nao-marcado e o ramo do defeito sairia da
        // medicao em silencio.
        expect(
          find.text('Veterinário'),
          findsOneWidget,
          reason:
              'REPROVA: a opcao que o fixture marca nao esta na folha. O ramo '
              '`marcada` do ternario da pastilha nao foi pintado, e e nele que '
              'o par trocado vive.',
        );

        // CONTROLE POSITIVO DO RAMO, e nao so da presenca. O cheque acima
        // prova que a pastilha esta na arvore; ele NAO prova em qual ramo do
        // ternario ela foi pintada, porque o rotulo e o mesmo nos dois. Quem
        // prova o ramo e o FUNDO: `primary` so fica atras de texto quando a
        // pastilha esta MARCADA. Sem isto, um `selecionado` que parasse de
        // chegar tiraria o par trocado da medicao e este caso continuaria
        // verde dizendo a mesma coisa.
        //
        // E E UMA CONTAGEM, nao um `contains`. O controle negativo do
        // `contains` -- desmarcar a opcao do filtro no fixture -- NAO reprovou:
        // a folha tem DOIS grupos de pastilha, e a de ORDENACAO nasce marcada
        // pela ordem efetiva, entao `primary` continuava no conjunto. O
        // "contains" provava o ramo do outro grupo. DOIS e o numero dos dois
        // grupos desta folha, um marcado em cada.
        final cores = escuro ? BichuCores.escuro : BichuCores.claro;
        final sobrePrimary =
            paragrafosSobreFundo(tester, hexDaCor(cores.primary));
        expect(
          sobrePrimary,
          greaterThanOrEqualTo(2),
          reason:
              'REPROVA: so $sobrePrimary texto(s) da folha caiu sobre '
              '`primary`, e esta folha tem DOIS grupos com uma pastilha '
              'marcada cada (o filtro e a ordenacao). A pastilha existe mas um '
              'dos dois ramos `marcada` nao foi pintado, e e so nele que o par '
              'trocado de 03/11/2026 aparece.',
        );

        final paragrafos = paragrafosMedidos(tester);
        expect(
          paragrafos,
          greaterThanOrEqualTo(_paragrafosMinimosDaFolha),
          reason:
              'REPROVA: o verificador mediu $paragrafos paragrafos na folha de '
              'filtros, e a folha declara pelo menos '
              '$_paragrafosMinimosDaFolha. Ou a folha nao abriu, ou ela mudou '
              'de forma. Nos dois casos o resultado anterior era verde por nao '
              'estar olhando para nada.',
        );

        // `isentarInativo` liga a unica isencao que o SC 1.4.3 concede, e
        // ela e necessaria aqui porque a folha nasce com o `Aplicar`
        // DESABILITADO -- nada foi mudado ainda. O par daquele rotulo e
        // `on-disabled` sobre `disabled-surface`, 3.62:1 no claro e 3.82:1 no
        // escuro, que e o valor que `telas.dart` ja declara como isento.
        final v = verificarContrasteDeTexto(
          tester,
          tela: 'folha-de-filtros',
          tema: tema,
          piso: 4.5,
          isentarInativo: true,
        );

        // A LISTA DAS ISENCOES VAI PARA O RESUMO, e o caso exige que ela nao
        // esteja vazia: isencao que ninguem ve vira permanente, e uma lista
        // vazia aqui significaria que o `Aplicar` deixou de nascer
        // desabilitado -- o que seria outro defeito, nao conformidade.
        final inativos = inativosIsentados(tester);
        // ignore: avoid_print
        print('ISENTOS POR INATIVIDADE [$tema/folha-de-filtros]: '
            '${inativos.join(' | ')}');
        expect(
          inativos,
          contains('Aplicar'),
          reason:
              'REPROVA: o `Aplicar` da folha nao esta mais inativo ao abrir. '
              'Ou ele nasce habilitado sem escolha nenhuma, ou o verificador '
              'parou de enxergar o estado -- e no segundo caso a isencao '
              'passou a valer sobre o que ele nao consegue classificar.',
        );
        expect(
          v,
          isEmpty,
          reason:
              'contraste abaixo do piso na folha de filtros do app ($tema). '
              'Este e o defeito de 03/11/2026: a pastilha MARCADA pintava '
              '`on-action-fill` sobre `primary`, 2.10:1 no claro. A tinta de '
              'um preenchimento nao serve sobre um preenchimento diferente -- '
              'quem pertence a `primary` e `on-primary`.\n'
              '${relatorio(v)}',
        );
      },
    );

    testWidgets('OS DISTINTIVOS de contador da listagem, tema $tema', (
      tester,
    ) async {
      await tester.pumpWidget(distintivosDaListagem(escuro: escuro));
      await tester.pumpAndSettle();

      expect(
        find.text('3'),
        findsNWidgets(2),
        reason:
            'REPROVA: esperava os DOIS distintivos com a contagem. Se um '
            'deles saiu da arvore, o par dele deixou de ser medido.',
      );

      final v = verificarContrasteDeTexto(
        tester,
        tela: 'distintivos-da-listagem',
        tema: tema,
        piso: 4.5,
      );
      expect(v, isEmpty, reason: 'contraste nos distintivos ($tema):\n${relatorio(v)}');
    });

    testWidgets('O DISTINTIVO DA ABA, tema $tema', (tester) async {
      await tester.pumpWidget(distintivoDaAbaComContagem(escuro: escuro));
      await tester.pumpAndSettle();

      expect(find.text('3'), findsOneWidget);

      final v = verificarContrasteDeTexto(
        tester,
        tela: 'distintivo-da-aba',
        tema: tema,
        piso: 4.5,
      );
      expect(v, isEmpty, reason: 'contraste no distintivo da aba ($tema):\n${relatorio(v)}');
    });

    testWidgets('O BOTAO PRIMARIO, parado e carregando, tema $tema', (
      tester,
    ) async {
      await tester.pumpWidget(botoesPrimarios(escuro: escuro));
      await tester.pump(const Duration(milliseconds: 50));

      // CONTROLE POSITIVO do verificador de objeto grafico: sem indicador na
      // arvore, lista vazia e cegueira e nao conformidade.
      final indicadores = indicadoresNaArvore(tester);
      expect(
        indicadores,
        greaterThanOrEqualTo(1),
        reason:
            'REPROVA: nenhum indicador de carga na arvore. O botao '
            '`carregando: true` deixou de desenhar o giro, e o verificador de '
            'objeto grafico ficou sem o que medir.',
      );

      final texto = verificarContrasteDeTexto(
        tester,
        tela: 'botao-primario',
        tema: tema,
        piso: 4.5,
        isentarInativo: true,
      );
      expect(texto, isEmpty, reason: 'contraste de texto no botao ($tema):\n${relatorio(texto)}');

      final grafico = verificarContrasteDeIndicador(
        tester,
        tela: 'botao-primario',
        tema: tema,
      );
      expect(
        grafico,
        isEmpty,
        reason:
            'o giro de carga nao atinge 3:1 (SC 1.4.11) no tema $tema. Medido '
            'em 03/11/2026: `on-action-fill` sobre `disabled-surface` da '
            '1.02:1 no escuro -- um giro invisivel. O botao fica DESABILITADO '
            'enquanto carrega, entao o fundo dele e `disabled-surface` e nao '
            '`action-fill`: a tinta que pertence aquele fundo e `on-disabled`, '
            'que e o que `widgets/folha_de_senha.dart` ja usava no mesmo giro.'
            '\n${relatorio(grafico)}',
      );

      // A isencao do rotulo desabilitado e PREVISTA, e a lista vai para o
      // resumo da execucao do job: isencao que ninguem ve vira permanente.
      final inativos = inativosIsentados(tester);
      // ignore: avoid_print
      print('ISENTOS POR INATIVIDADE [$tema/botao-primario]: '
          '${inativos.join(' | ')}');
      expect(
        inativos,
        contains('Enviando'),
        reason:
            'REPROVA: o rotulo do botao que carrega nao esta sendo visto como '
            'inativo. O botao com `carregando: true` passa `onPressed: null`, '
            'e se o verificador nao enxerga isso a isencao do SC 1.4.3 esta '
            'sendo aplicada por outro critério, ou nao esta sendo aplicada.',
      );
    });
  }

  // -------------------------------------------------------------------------
  // AS ISCAS: o portao reprovando o codigo que o fez nascer
  // -------------------------------------------------------------------------
  //
  // Elas sao a prova permanente. Rodar o portao novo contra a base sem o
  // conserto prova uma vez, no dia; a isca prova todo dia, e reprova no dia em
  // que alguem afrouxar o verificador. Isca que PASSA derruba o job, porque a
  // partir dali todos os casos acima estao verdes por nao estarem olhando.

  testWidgets('ISCA a pastilha com o par de 03/11 reprova a 2.10:1', (
    tester,
  ) async {
    await tester.pumpWidget(iscaDaPastilhaComParTrocado(escuro: false));
    await tester.pumpAndSettle();

    final medido = razaoMedidaDoTexto(tester, rotuloDaIscaDaPastilha);
    // O NUMERO E A ANCORA, e ele sai de dois tokens:
    //   on-action-fill  #1C1B19
    //   primary (claro) #9E0B3A
    // 2.10:1 pela formula da WCAG 2.1. Se esta linha subir, ou `primary`
    // clareou ou `on-action-fill` escureceu -- e nos dois casos o que mudou foi
    // um token, nunca a isca.
    expect(medido, closeTo(2.10, 0.01));

    // COM A ISENCAO LIGADA, de proposito: a pastilha e um controle ATIVO, e
    // uma isencao que a dispensasse seria uma isencao que dispensa tudo. Esta
    // e a contraprova de que `isentarInativo` le estado e nao cor -- as cores
    // da pastilha errada sao as mesmas de um botao desabilitado em outro lugar
    // do sistema.
    final v = verificarContrasteDeTexto(
      tester,
      tela: 'isca-pastilha',
      tema: 'claro',
      piso: 4.5,
      isentarInativo: true,
    );
    expect(
      v.where((x) => x.tipo == TipoDeViolacao.contraste),
      isNotEmpty,
      reason:
          'O VERIFICADOR PAROU DE VERIFICAR. Esta isca monta a pastilha com o '
          'par exato que chegou ao cliente em 03/11/2026, e ela PRECISA '
          'reprovar. Se ela passou, os casos de widget real deste arquivo '
          'estao verdes por nao estarem medindo nada.',
    );
  });

  testWidgets('ISCA o giro com o par de 03/11 reprova a 1.02:1 no escuro', (
    tester,
  ) async {
    await tester.pumpWidget(iscaDoGiroComParTrocado(escuro: true));
    await tester.pump(const Duration(milliseconds: 50));

    final medido = razaoMedidaDoIndicador(tester);
    // on-action-fill #1C1B19 sobre disabled-surface escuro #201D15: 1.02:1.
    // Dois quase-pretos, um por cima do outro.
    expect(medido, closeTo(1.02, 0.01));

    final v = verificarContrasteDeIndicador(
      tester,
      tela: 'isca-giro',
      tema: 'escuro',
    );
    expect(
      v.where((x) => x.tipo == TipoDeViolacao.contraste),
      isNotEmpty,
      reason:
          'O VERIFICADOR DE OBJETO GRAFICO PAROU DE VERIFICAR. Esta isca pinta '
          'o giro com a tinta de um preenchimento sobre a superficie '
          'desabilitada, que e o que `botao_primario.dart` fazia, e ela '
          'PRECISA reprovar.',
    );
  });

  testWidgets(
    'CONTRAPROVA a isencao de TEXTO nao silencia o objeto GRAFICO',
    (tester) async {
      // A fresta que esta contraprova fecha: se `verificarContrasteDeIndicador`
      // honrasse `prefixoIsencao`, pendurar `a11y-exempt:componente
      // desabilitado` num ancestral -- que e o certo para o ROTULO -- levaria o
      // giro junto, e o defeito de 1.02:1 voltaria a passar com a chave que
      // alguem pos por um motivo legitimo. Isencao e por CRITERIO.
      await tester.pumpWidget(
        iscaDoGiroComParTrocado(escuro: true, comIsencaoDeTexto: true),
      );
      await tester.pump(const Duration(milliseconds: 50));

      final v = verificarContrasteDeIndicador(
        tester,
        tela: 'isca-giro-com-isencao-de-texto',
        tema: 'escuro',
      );
      expect(
        v.where((x) => x.tipo == TipoDeViolacao.contraste),
        isNotEmpty,
        reason:
            'a chave de isencao de TEXTO (SC 1.4.3) silenciou o verificador de '
            'OBJETO GRAFICO (SC 1.4.11). Uma chave que dispensa um criterio '
            'nao pode dispensar o outro.',
      );
    },
  );
}
