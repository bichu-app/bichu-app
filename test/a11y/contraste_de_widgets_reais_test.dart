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
import 'package:flutter/material.dart' show Icons;
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

      // UMA EXPECTATIVA SO PARA OS DOIS CRITERIOS, e a razao e de diagnostico.
      //
      // Na primeira versao deste caso o texto tinha `expect` proprio ANTES do
      // grafico. Rodado contra o codigo velho, o botao reprovava pela mensagem
      // do TEXTO (1.62:1 do rotulo no escuro) e o `expect` abortava o caso
      // antes de o grafico ser medido -- entao o giro a 1.02:1, que e o
      // defeito do SC 1.4.11, NAO aparecia na reprovacao. Quem reintroduzisse
      // o giro junto com o rotulo cacaria o defeito na mensagem errada.
      // Juntando as duas listas numa expectativa, nenhum dos dois criterios
      // esconde o outro, e o relatorio nomeia os dois.
      final texto = verificarContrasteDeTexto(
        tester,
        tela: 'botao-primario',
        tema: tema,
        piso: 4.5,
        isentarInativo: true,
      );
      final grafico = verificarContrasteDeIndicador(
        tester,
        tela: 'botao-primario',
        tema: tema,
      );
      expect(
        <Violacao>[...grafico, ...texto],
        isEmpty,
        reason:
            'contraste abaixo do piso no botao primario ($tema). Os DOIS '
            'defeitos de 03/11/2026 moram aqui: o GIRO pintava '
            '`on-action-fill` sobre `disabled-surface` (1.02:1 no escuro, '
            'piso de 3:1 do SC 1.4.11) porque o botao fica DESABILITADO '
            'enquanto carrega; e o ROTULO usava `textos.labelLarge` pelado, '
            'que carrega `text-primary` do tema e vence o `foregroundColor` '
            'do botao (1.62:1 sobre a manteiga no escuro). O grafico vem '
            'PRIMEIRO na lista de proposito.\n'
            '${relatorio(<Violacao>[...grafico, ...texto])}',
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

    // -----------------------------------------------------------------------
    // OS TRES BOTOES PREENCHIDOS DO MESMO MECANISMO (04/11/2026)
    // -----------------------------------------------------------------------
    //
    // Cada um reprovava num tema DIFERENTE e os tres eram o mesmo defeito, o
    // que e justamente por que cada caso roda nos dois.

    testWidgets('A FOLHA DE SENHA das operacoes destrutivas, tema $tema', (
      tester,
    ) async {
      await tester.pumpWidget(folhaDeSenhaReal(escuro: escuro));
      await tester.pumpAndSettle();

      // CONTROLE POSITIVO: o rotulo que carrega o defeito esta na arvore. Sem
      // ele, uma folha que deixasse de montar devolveria zero violacao.
      expect(
        find.text('Confirmar'),
        findsOneWidget,
        reason:
            'REPROVA: o botao de confirmar nao esta na folha, e e o rotulo '
            'dele que media 2.10:1 no claro e 1.87:1 no escuro.',
      );

      final v = verificarContrasteDeTexto(
        tester,
        tela: 'folha-de-senha',
        tema: tema,
        piso: 4.5,
        isentarInativo: true,
      );
      expect(
        v,
        isEmpty,
        reason:
            'contraste abaixo do piso na folha de senha ($tema). **Esta e a '
            'folha das seis operacoes destrutivas**, exclusao de conta '
            'inclusive: o rotulo do `Confirmar` usava `textos.labelLarge` '
            'pelado, que carrega `text-primary` e vence o `foregroundColor` '
            'do botao -- 2.10:1 no claro e 1.87:1 no escuro sobre `primary`. '
            'A tinta que pertence a `primary` e `on-primary`.\n'
            '${relatorio(v)}',
      );
    });

    testWidgets('A FOLHA DESTRUTIVA, tema $tema', (tester) async {
      await tester.pumpWidget(folhaDestrutivaReal(escuro: escuro));
      await tester.pumpAndSettle();

      expect(find.text('Excluir'), findsOneWidget);

      final v = verificarContrasteDeTexto(
        tester,
        tela: 'folha-destrutiva',
        tema: tema,
        piso: 4.5,
        isentarInativo: true,
      );
      expect(
        v,
        isEmpty,
        reason:
            'contraste abaixo do piso na folha destrutiva ($tema). O rotulo '
            'do botao media 2.35:1 sobre `urgency` no tema CLARO; no escuro o '
            'mesmo par dava 9.92:1 e passava por acidente, porque la '
            '`urgency` e escuro. A tinta de `urgency` e `on-urgency`.\n'
            '${relatorio(v)}',
      );
    });

    testWidgets('O CONVITE DE PASSKEY, tema $tema', (tester) async {
      await tester.pumpWidget(conviteDePasskeyReal(escuro: escuro));
      await tester.pumpAndSettle();

      expect(find.text('Ativar'), findsOneWidget);

      final v = verificarContrasteDeTexto(
        tester,
        tela: 'convite-de-passkey',
        tema: tema,
        piso: 4.5,
        isentarInativo: true,
      );
      expect(
        v,
        isEmpty,
        reason:
            'contraste abaixo do piso no convite de passkey ($tema). O rotulo '
            'do `Ativar` media 1.62:1 sobre `action-fill` no tema ESCURO; no '
            'claro `text-primary` e `on-action-fill` tem o MESMO valor e ele '
            'saia certo por coincidencia, a 9.35:1. Este botao nao declara '
            '`style` e herda o `filledButtonTheme`.\n'
            '${relatorio(v)}',
      );
    });

    // -----------------------------------------------------------------------
    // O MURAL (04/11/2026)
    // -----------------------------------------------------------------------
    //
    // A PRIMEIRA TELA desta galeria, e por isso o cabecalho de
    // `widgets_reais.dart` declarava as telas fora de cobertura: o coracao de
    // "curtido" mora em `telas/mural/`, nao em `widgets/`. O defeito era o
    // mesmo par trocado de 03/11, pela terceira vez -- `urgency`, tinta de
    // PREENCHIMENTO do banner de pet perdido, por cima da superficie do
    // cartao: **1.62:1 no escuro**, piso de 3.0 do SC 1.4.11.
    //
    // OS DOIS ESTADOS DO CORACAO SAO CASOS SEPARADOS, e nao um caso com dois
    // ramos, porque sao dois PARES diferentes -- `primary` no curtido,
    // `text-secondary` no nao-curtido -- e so um dos dois estava errado. Um
    // caso que medisse os dois juntos nao diria qual.

    for (final curtida in <bool>[true, false]) {
      final estado = curtida ? 'CURTIDO' : 'nao curtido';

      testWidgets('O MURAL, coracao $estado, tema $tema', (tester) async {
        await montarOMural(tester, escuro: escuro, curtida: curtida);

        // CONTROLE POSITIVO DA MONTAGEM: a publicacao chegou a arvore. O Mural
        // come a falha de rede e desenha estado vazio, entao uma rota que
        // mudasse de endereco devolveria uma tela SEM cartao -- zero icone,
        // zero violacao, verde por cegueira. Este cheque e o que separa
        // "aprovado" de "nao olhei".
        expect(
          find.text('o Bidu no parque'),
          findsOneWidget,
          reason:
              'REPROVA: a publicacao do fixture nao esta na arvore. Ou a rota '
              'de leitura mudou de endereco e o Mural caiu no estado vazio, ou '
              'o cartao deixou de montar. Nos dois casos nao ha coracao a '
              'medir e o resultado anterior era verde por nao estar olhando.',
        );

        // CONTROLE POSITIVO DO RAMO, e nao so da presenca do cartao. O
        // coracao CHEIO (`Icons.favorite`) so e pintado quando `liked_by_me`
        // atravessou a resposta; o vazado (`Icons.favorite_border`) e outro
        // ponto de codigo. Sem isto, um `liked_by_me` que parasse de ser
        // decodificado levaria o ramo do defeito para fora da medicao e este
        // caso continuaria verde dizendo a mesma coisa.
        //
        // E E `byIcon`, NAO `find.text` do glifo: `Icon` monta um `RichText`
        // direto, e `find.text` so casa `Text` (precisaria de
        // `findRichText: true`). A primeira versao deste controle usou
        // `find.text` e reprovou os dois casos CURTIDOS dizendo que o coracao
        // nao estava na arvore -- ele estava; o finder e que nao o alcancava.
        // Controle que erra para o lado de reprovar se denuncia; o perigoso
        // seria o contrario.
        expect(
          find.byIcon(curtida ? Icons.favorite : Icons.favorite_border),
          findsOneWidget,
          reason: curtida
              ? 'REPROVA: o coracao CHEIO nao esta na arvore. O `liked_by_me` '
                'do fixture nao chegou ao estado da tela, e e o ramo marcado '
                'que carregava o par de 1.62:1.'
              : 'REPROVA: o coracao VAZADO nao esta na arvore num cartao que '
                'o fixture declara nao curtido. O ramo errado foi pintado, e '
                'o caso do estado curtido deixou de ser o unico que mede '
                'aquele par.',
        );

        // E O OUTRO RAMO NAO PODE ESTAR NA ARVORE. Com um cartao so, os dois
        // glifos juntos significariam que o fixture deixou de escolher o
        // estado -- e entao os dois casos mediriam a mesma coisa e um deles
        // estaria verde por redundancia, nao por conformidade.
        expect(
          find.byIcon(curtida ? Icons.favorite_border : Icons.favorite),
          findsNothing,
          reason:
              'REPROVA: os DOIS estados do coracao estao na arvore ao mesmo '
              'tempo. O fixture monta um cartao so, entao ou ele parou de '
              'escolher o estado, ou o Mural passou a desenhar mais de uma '
              'publicacao -- e nos dois casos este caso deixou de medir o '
              'estado que o nome dele promete.',
        );

        final v = verificarContrasteDeTexto(
          tester,
          tela: 'mural/coracao-$estado',
          tema: tema,
          piso: 4.5,
          isentarInativo: true,
        );
        expect(
          v,
          isEmpty,
          reason:
              'contraste abaixo do piso no Mural ($tema, coracao $estado). '
              'Este e o defeito de 04/11/2026: o coracao de "curtido" pintava '
              '`cores.urgency` sobre `cores.surface` -- 1.62:1 no tema escuro, '
              'contra o piso de 3.0 do SC 1.4.11 para icone. No claro o mesmo '
              'par dava 6.99:1 e passava, e e esse acidente de um tema so que '
              'faz esta classe de defeito parecer intencional. A tinta de '
              '`urgency` e `on-urgency`, e ela vale SOBRE `urgency`; sobre a '
              'superficie do cartao quem a tabela publica para um icone de '
              'estado e `primary` (7.84 / 8.59) e `text-secondary` '
              '(8.60 / 9.31).\n'
              '${relatorio(v)}',
        );
      });
    }
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

  testWidgets('ISCA o coracao com o par de 04/11 reprova a 1.62:1 no escuro', (
    tester,
  ) async {
    await tester.pumpWidget(iscaDoCoracaoComParTrocado(escuro: true));
    await tester.pumpAndSettle();

    final medido = razaoMedidaDoTexto(tester, glifoDoCoracaoCurtido);
    // O NUMERO E A ANCORA, e ele sai de dois tokens:
    //   urgency (escuro) #6B220A  -- ember.800
    //   surface (escuro) #17150F  -- bark.900
    // 1.62:1 pela formula da WCAG 2.1. Se esta linha subir, ou `urgency`
    // clareou ou `surface` escureceu -- e nos dois casos o que mudou foi um
    // token, nunca a isca.
    expect(medido, closeTo(1.62, 0.01));

    // COM A ISENCAO LIGADA, de proposito, e pela mesma razao da isca da
    // pastilha: o coracao e um controle ATIVO. Uma isencao que o dispensasse
    // seria uma isencao que dispensa tudo.
    final v = verificarContrasteDeTexto(
      tester,
      tela: 'isca-coracao',
      tema: 'escuro',
      piso: 4.5,
      isentarInativo: true,
    );
    expect(
      v.where((x) => x.tipo == TipoDeViolacao.contraste),
      isNotEmpty,
      reason:
          'O VERIFICADOR PAROU DE MEDIR GLIFO DE ICONE. Esta isca pinta o '
          'coracao com o par exato que o Mural montava em 04/11/2026, e ela '
          'PRECISA reprovar. Se ela passou, os quatro casos do Mural deste '
          'arquivo estao verdes por nao estarem medindo nada -- e o caminho '
          'mais provavel para isso e alguem fazer `verificarContrasteDeTexto` '
          'pular o glifo de icone, que NAO e texto legivel mas E o que o '
          '`Icon` do Flutter renderiza.',
    );

    // E O PISO APLICADO TEM DE SER O DE ICONE, nao o de corpo. Sem este
    // cheque a isca passaria a reprovar por 4.5 e continuaria verde no dia em
    // que o glifo deixasse de ser classificado como objeto de interface -- o
    // que silenciaria todo icone de 24px do app, que e a maioria deles.
    final doIcone = v.firstWhere((x) => x.tipo == TipoDeViolacao.contraste);
    expect(
      doIcone.piso,
      3.0,
      reason:
          'REPROVA: o piso aplicado ao glifo foi ${doIcone.piso} e nao 3.0. O '
          'icone de 24px e objeto de interface (SC 1.4.11) e cai em "texto '
          'grande" no `pisoEfetivo`. Um piso de 4.5 aqui reprovaria icone '
          'legitimo; um piso mais alto que 3.0 some com a classe toda.',
    );

    // O ALVO TEM DE SE NOMEAR. A primeira versao deste portao reprovava com o
    // alvo em branco (`::  ::`), porque o glifo vive na area de uso privado da
    // fonte: numa tela com sete icones a reprovacao nao dizia qual deles era.
    expect(
      doIcone.alvo,
      'icone U+${Icons.favorite.codePoint.toRadixString(16).toUpperCase()}',
      reason:
          'REPROVA: a reprovacao do glifo nao nomeia o alvo (veio '
          '"${doIcone.alvo}"). Reprovacao que nao diz QUAL icone esta '
          'ilegivel obriga quem le a adivinhar.',
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
