// BICHUS-153 — o 404 do codigo DIGITADO nao acusa a plaquinha.
//
// O DEFEITO QUE ESTA ISCA GUARDA
// ------------------------------
// `GET /v1/tags/{code}` devolve um unico `tag-code-not-found` (404) para dois
// caminhos que nao sao a mesma situacao:
//
//   camera   -> a lente leu o que estava impresso. O dedo nao participou, e
//               "confira se a plaquinha e do Bichu" e verdade.
//   digitado -> a pessoa pode ter trocado um caractere em dezesseis. Acusar a
//               plaquinha de ser de outro produto manda embora quem so
//               precisava corrigir uma letra.
//
// O texto unico mandava a segunda pessoa embora. Ela esta na rua, com um
// animal no colo, ja falhou em escanear, e do outro lado da desistencia dela
// ha um tutor esperando (risco R1 do UX).
//
// POR QUE ESTA ISCA MEDE O EFEITO, E NAO A CHAMADA
// ------------------------------------------------
// Um caso que dissesse "a tela chama `_voltarAoCampo()`" ou "`_resolver`
// recebe `digitado: true`" fica **verde com o furo inteiro de pe**: o metodo
// pode ser chamado e nao fazer nada, e o parametro pode chegar e ser ignorado
// na traducao. Entao todo caso daqui olha para o que a pessoa ve e para o que
// o campo guarda: o texto na tela, o botao na barra, o conteudo do
// controlador, o foco e a selecao.
//
// Pelo mesmo motivo os casos montam o app inteiro e passam pela rede
// (`MockClient`), em vez de chamar `MensagensDeErro.de` direto: a traducao
// pode estar certa e a tela nao usar mais o parametro. O grupo final, que
// **so** exercita a traducao, existe para a prova negativa que a tela nao
// consegue dar hoje (o caminho da camera nao existe ate a BICHUS-54).
//
// AS TRES ISCAS, DITAS EM UMA LINHA CADA
// --------------------------------------
// 1. Fundir os dois textos de volta num so, ou trocar o texto digitado pelo
//    escaneado: o primeiro grupo reprova.
// 2. Fazer `Digitar de novo` limpar o campo (`_codigo.clear()`), ou deixar de
//    devolver o foco: o caso do criterio 4 reprova, e ele le o controlador
//    depois do toque, e nao o codigo-fonte.
// 3. Recalcular a origem do codigo por estado de tela dentro do temporizador
//    ou do `Tentar de novo`, em vez de carregar `_codigoFoiDigitado`: o
//    terceiro grupo reprova. Esse e o furo que nao aparece num diff -- o texto
//    trocava sozinho cinco segundos depois, sem ninguem ter tocado em nada.

import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/api/problem.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Um codigo bem formado para a mascara `XXXX-XXXX-XXXX-XXXX`.
///
/// O valor nao importa: nenhum caso confere o texto formatado contra uma
/// constante escrita aqui. Os casos leem o controlador **antes** e **depois**
/// do toque e comparam os dois, porque a mascara e da BICHUS-54 e uma
/// expectativa copiada a mao aqui viraria reprovacao pelo motivo errado no dia
/// em que ela mudar.
const String _codigoDigitado = 'BCH7K2M91QDX4N2';

/// A espera entre as retentativas automaticas da tela, em segundos.
///
/// Copiada porque a constante da tela e privada. Um numero MAIOR aqui nao
/// esconde nada (o temporizador ja terminou e os pumps a mais nao fazem mal);
/// um numero menor faz o caso do temporizador reprovar na defesa de vazio, com
/// a contagem de chamadas na mensagem, em vez de passar sem ter medido.
const int _esperaEntreTentativas = 6;

void main() {
  Future<http.Response> semServidor(http.Request _) async =>
      http.Response('', 404);

  /// Abre o leitor pela porta primaria e entra no estado de digitacao.
  ///
  /// Pela porta, e nao montando a tela solta: o que esta isca cobra e o que a
  /// pessoa recebe depois de andar o caminho, e um caso que instanciasse a
  /// tela direto nao percorreria `ApiClient` nem a traducao de `Problem` --
  /// que e exatamente onde o parametro novo pode se perder.
  Future<void> abrirADigitacao(
    WidgetTester tester, {
    required Future<http.Response> Function(http.Request) rede,
  }) async {
    await abrirOApp(tester, rede: rede);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.digitarOCodigo),
    );
    await tester.pumpAndSettle();
  }

  Future<void> enviarOCodigo(WidgetTester tester) async {
    await tester.enterText(find.byType(TextField).first, _codigoDigitado);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, 'Continuar'));
    await tester.pumpAndSettle();
  }

  /// O `TextField` do codigo, lido da arvore montada.
  TextField campoDoCodigo(WidgetTester tester) =>
      tester.widget<TextField>(find.byType(TextField).first);

  final digitarDeNovo = find.widgetWithText(
    TextButton,
    MensagensDeErro.digitarDeNovo,
  );

  group('o 404 de um codigo digitado fala do caractere, e nao da plaquinha',
      () {
    testWidgets('o texto na tela e o do caminho digitado', (tester) async {
      await abrirADigitacao(
        tester,
        rede: (_) async => problema('tag-code-not-found', 404),
      );
      await enviarOCodigo(tester);

      expect(
        find.text(MensagensDeErro.codigoNaoEncontradoDigitado),
        findsOne,
        reason: 'REPROVA: o 404 de um codigo que saiu do TECLADO nao mostrou o '
            'texto do caminho digitado. Quem digitou pode ter trocado um '
            'caractere em dezesseis, e a saida util e corrigir o caractere.',
      );

      // A PROVA NEGATIVA. Sem ela, um texto que dissesse as duas coisas
      // passaria no `expect` de cima e o defeito continuaria na tela.
      expect(
        find.text(MensagensDeErro.codigoNaoEncontrado),
        findsNothing,
        reason: 'REPROVA: a tela ainda acusa a plaquinha de nao ser do Bichu '
            'depois de um codigo DIGITADO. Ninguem encostou numa plaquinha '
            'aqui: o texto manda embora quem so errou uma letra.',
      );
    });

    testWidgets('so o 404 da tag mudou: o 400 continua sendo o de sempre',
        (tester) async {
      // A separacao de 17/09 em F4.5 nao foi desfeita, e este caso e quem
      // sustenta isso na tela. O 400 e o `tag-code-malformed`: ele ja diz
      // "confira o que voce digitou", e duplicar a bifurcacao nele produziria
      // dois textos para a mesma frase.
      await abrirADigitacao(
        tester,
        rede: (_) async => problema('tag-code-malformed', 400),
      );
      await enviarOCodigo(tester);

      expect(
        find.text(MensagensDeErro.codigoMalformado),
        findsOne,
        reason: 'REPROVA: o 400 deixou de ser o texto de codigo malformado. A '
            'BICHUS-153 separa a ORIGEM do codigo dentro de um desfecho so, e '
            'nao mexe em qual desfecho e qual.',
      );
      expect(
        find.text(MensagensDeErro.codigoNaoEncontradoDigitado),
        findsNothing,
        reason: 'REPROVA: o texto do 404 digitado vazou para o 400.',
      );
    });

    test('a microcopy e a da UX, e nao foi reescrita', () {
      // Uma constante reescrita nao quebra nada: a tela continua montando, os
      // finders continuam casando (eles usam a propria constante) e o defeito
      // volta sem alarme. Este e o unico lugar da suite onde os dois textos
      // sao cobrados literalmente.
      expect(
        MensagensDeErro.codigoNaoEncontradoDigitado,
        'Esse código não é de nenhuma tag do Bichu. Confira se algum caractere '
        'saiu trocado, ou registre o achado sem o código.',
        reason: 'REPROVA: a microcopy do 404 digitado foi reescrita. Ela e de '
            'UX e nao de engenharia; mudar a frase e mudar o produto.',
      );
      expect(
        MensagensDeErro.digitarDeNovo,
        'Digitar de novo',
        reason: 'REPROVA: o rotulo da saida do criterio 3 foi reescrito.',
      );
      expect(
        MensagensDeErro.codigoNaoEncontradoDigitado,
        isNot(MensagensDeErro.codigoNaoEncontrado),
        reason: 'REPROVA: os dois textos voltaram a ser o mesmo. A BICHUS-153 '
            'existe porque as duas situacoes sao diferentes.',
      );
    });
  });

  group('`Digitar de novo` (criterios 3 e 4)', () {
    testWidgets('aparece no 404 digitado, e o leitor de tela alcanca ela',
        (tester) async {
      await abrirADigitacao(
        tester,
        rede: (_) async => problema('tag-code-not-found', 404),
      );
      await enviarOCodigo(tester);

      expect(
        digitarDeNovo,
        findsOne,
        reason: 'REPROVA: o 404 digitado nao oferece a volta ao campo. A '
            'pessoa fica olhando um texto que manda corrigir um caractere sem '
            'nenhuma saida que a leve de volta ao caractere.',
      );

      // btn=true tap=false ja apareceu quatro vezes neste app, e sempre num
      // controle que EXISTIA e parecia certo. A pergunta nao e "o widget esta
      // na arvore": e "o TalkBack consegue acionar isto".
      final handle = tester.ensureSemantics();
      try {
        final dados = tester.getSemantics(digitarDeNovo).getSemanticsData();
        expect(
          dados.flagsCollection.isButton,
          isTrue,
          reason: 'REPROVA: `Digitar de novo` nao se anuncia como botao '
              '(WCAG 2.1 SC 4.1.2).',
        );
        expect(
          dados.hasAction(SemanticsAction.tap),
          isTrue,
          reason: 'REPROVA: `Digitar de novo` anuncia-se como botao e NAO tem '
              'a acao de toque. Quem navega por leitor de tela ouve que existe '
              'um botao e nao consegue aciona-lo.',
        );
      } finally {
        handle.dispose();
      }

      exigirRotuloAnunciavel(
        tester,
        MensagensDeErro.digitarDeNovo,
        na: 'F2.1, 404 do codigo digitado',
      );
    });

    testWidgets('devolve o foco ao campo SEM limpar o que foi digitado',
        (tester) async {
      await abrirADigitacao(
        tester,
        rede: (_) async => problema('tag-code-not-found', 404),
      );
      await enviarOCodigo(tester);

      final controlador = campoDoCodigo(tester).controller!;
      final antes = controlador.text;
      expect(
        antes,
        isNotEmpty,
        reason: 'REPROVA POR VAZIO: o campo ja estava vazio antes do toque, '
            'entao "nao limpou" nao prova nada. Este caso ficaria verde sem '
            'estar olhando para coisa nenhuma.',
      );

      // TIRA O FOCO ANTES, e isto nao e cerimonia. O `enterText` deixa o
      // campo focado, entao um `hasFocus` medido logo depois do toque daria
      // verde mesmo com `_voltarAoCampo` de corpo VAZIO: ele estaria medindo
      // o foco que o proprio teste pos ali. Sem esta linha o caso passa a
      // depender so da selecao, e a metade "refoca" do criterio 4 fica sem
      // ninguem olhando. Quem esta no aparelho perde o foco do mesmo jeito:
      // a faixa de erro aparece e o teclado desce.
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      expect(
        campoDoCodigo(tester).focusNode?.hasFocus,
        isFalse,
        reason: 'REPROVA POR VAZIO: o campo continuou focado mesmo depois de '
            'o foco ter sido retirado, entao o `hasFocus` la embaixo nao '
            'mediria o efeito do botao.',
      );

      await tester.tap(digitarDeNovo);
      await tester.pumpAndSettle();

      // O CRITERIO 4, medido no efeito e nao na chamada. Um teste que
      // afirmasse "a tela chama `_voltarAoCampo()`" fica verde com o metodo
      // vazio; os tres `expect` abaixo reprovam nesse caso, e reprovam
      // tambem com um `_codigo.clear()` la dentro.
      expect(
        controlador.text,
        antes,
        reason: 'REPROVA: `Digitar de novo` limpou o campo. A pessoa errou um '
            'caractere em dezesseis; limpar cobra de novo o trabalho inteiro '
            'que ja falhou uma vez, e e o oposto do criterio 4.',
      );

      final campo = campoDoCodigo(tester);
      expect(
        campo.focusNode?.hasFocus,
        isTrue,
        reason: 'REPROVA: o foco nao voltou ao campo. Sem foco o teclado nao '
            'sobe e o botao nao faz nada que o cursor ja nao fizesse -- ele '
            'vira um controle decorativo.',
      );
      expect(
        controlador.selection,
        TextSelection(baseOffset: 0, extentOffset: antes.length),
        reason: 'REPROVA: o texto voltou sem estar selecionado. A selecao e o '
            'que deixa a correcao a um toque de distancia com o conteudo '
            'ainda na tela, em vez de apagado.',
      );
    });

    testWidgets('NAO aparece antes de qualquer erro', (tester) async {
      await abrirADigitacao(tester, rede: semServidor);

      expect(
        digitarDeNovo,
        findsNothing,
        reason: 'REPROVA: `Digitar de novo` aparece no campo recem-aberto. '
            'Ali ela repete o que o cursor ja faz, e ocupa a barra de acao com '
            'uma saida que nao leva a lugar nenhum.',
      );
    });

    testWidgets('NAO aparece no 400, que ja manda conferir o que foi digitado',
        (tester) async {
      await abrirADigitacao(
        tester,
        rede: (_) async => problema('tag-code-malformed', 400),
      );
      await enviarOCodigo(tester);

      expect(
        find.text(MensagensDeErro.codigoMalformado),
        findsOne,
        reason: 'REPROVA POR VAZIO: o 400 nem chegou a tela, entao a ausencia '
            'do botao abaixo nao prova nada.',
      );
      expect(
        digitarDeNovo,
        findsNothing,
        reason: 'REPROVA: `Digitar de novo` passou a aparecer em qualquer '
            'falha. Ela e a saida do 404 digitado; no 400 o proprio texto ja '
            'manda conferir, e dois convites para a mesma coisa competem.',
      );
    });

    testWidgets('NAO aparece no 429, que espera e nao se corrige digitando',
        (tester) async {
      await abrirADigitacao(
        tester,
        rede: (_) async => problema('rate-limited', 429),
      );
      await enviarOCodigo(tester);

      expect(
        digitarDeNovo,
        findsNothing,
        reason: 'REPROVA: a tela convida a digitar de novo num 429. Digitar '
            'de novo agora gasta a proxima tentativa contra o mesmo limite.',
      );
    });
  });

  group('a origem do codigo sobrevive a retentativa', () {
    /// Cai na primeira chamada da tag e devolve 404 nas seguintes.
    ///
    /// A primeira queda leva a tela a `semConexao`, que e o unico estado em
    /// que os outros dois sitios de `_resolver` sao alcancaveis: o
    /// temporizador e o `Tentar de novo` manual.
    (Future<http.Response> Function(http.Request), List<int>) redeQueCaiUmaVez() {
      final chamadas = <int>[];
      Future<http.Response> rede(http.Request req) async {
        if (!req.url.path.contains('/tags/')) return http.Response('', 404);
        chamadas.add(chamadas.length + 1);
        if (chamadas.length == 1) {
          throw http.ClientException('sem sinal', req.url);
        }
        return problema('tag-code-not-found', 404);
      }

      return (rede, chamadas);
    }

    testWidgets('o temporizador nao troca o texto sozinho depois de 5 s',
        (tester) async {
      // O FURO QUE ESTE CASO GUARDA, e o mais dificil de ver num diff:
      // recalcular a origem por estado de tela dentro do `Timer.periodic`
      // faz o texto do 404 trocar sozinho cinco segundos depois de a pessoa
      // ter parado de mexer no aparelho. Nada no codigo parece errado, e a
      // tela passa a acusar a plaquinha de quem digitou.
      final (rede, chamadas) = redeQueCaiUmaVez();
      await abrirADigitacao(tester, rede: rede);

      await tester.enterText(find.byType(TextField).first, _codigoDigitado);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(BotaoPrimario, 'Continuar'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // O TEMPO PRECISA SER ANDADO A MAO, e isto custou uma execucao para
      // descobrir. `pumpAndSettle` para no primeiro quadro em que nada mais
      // esta agendado, e entre um tique e outro do `Timer.periodic` nao ha
      // quadro nenhum: ele voltava com UMA chamada a tag, a retentativa nunca
      // acontecia, e o `expect` de baixo passaria sem ter exercitado o
      // caminho que este caso existe para medir. Quem pegou foi a defesa de
      // vazio logo abaixo, e e por isso que ela esta aqui.
      for (var segundo = 0; segundo < _esperaEntreTentativas; segundo++) {
        await tester.pump(const Duration(seconds: 1));
      }
      await tester.pumpAndSettle();

      expect(
        chamadas.length,
        greaterThanOrEqualTo(2),
        reason: 'REPROVA POR VAZIO: a retentativa automatica nao aconteceu, '
            'entao o texto abaixo nao passou pelo caminho que este caso '
            'existe para medir. Mediu ${chamadas.length} chamada(s) a tag.',
      );
      expect(
        find.text(MensagensDeErro.codigoNaoEncontradoDigitado),
        findsOne,
        reason: 'REPROVA: depois da queda de conexao e da retentativa '
            'automatica, o 404 voltou com o texto do caminho ESCANEADO. O '
            'codigo e o mesmo e quem o digitou continua tendo digitado: a '
            'origem se perdeu no temporizador.',
      );
      expect(
        find.text(MensagensDeErro.codigoNaoEncontrado),
        findsNothing,
        reason: 'REPROVA: a tela acusa a plaquinha depois da retentativa.',
      );
    });

    testWidgets('`Tentar de novo` manual tambem nao troca o texto',
        (tester) async {
      final (rede, chamadas) = redeQueCaiUmaVez();
      await abrirADigitacao(tester, rede: rede);

      await tester.enterText(find.byType(TextField).first, _codigoDigitado);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(BotaoPrimario, 'Continuar'));
      // Pumps curtos: a pessoa toca em `Tentar de novo` ANTES de a contagem
      // de 5 s terminar, que e o caso que o botao existe para atender.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      final manual = find.widgetWithText(
        BotaoPrimario,
        MensagensDeErro.tentarDeNovo,
      );
      expect(
        manual,
        findsOne,
        reason: 'REPROVA POR VAZIO: a tela nao chegou ao estado de sem '
            'conexao, entao o `Tentar de novo` manual nao foi exercitado. '
            'Mediu ${chamadas.length} chamada(s) a tag.',
      );

      await tester.tap(manual);
      await tester.pumpAndSettle();

      expect(
        find.text(MensagensDeErro.codigoNaoEncontradoDigitado),
        findsOne,
        reason: 'REPROVA: `Tentar de novo` reenviou o mesmo codigo e a tela '
            'respondeu com o texto do caminho escaneado. Tocar em `Tentar de '
            'novo` nao transforma um codigo digitado num codigo lido pela '
            'camera.',
      );
    });
  });

  group('a traducao nao bifurca mais do que o combinado', () {
    // Este grupo NAO monta a tela, e a razao e concreta: o caminho da camera
    // nao existe no app ate a BICHUS-54 entrar, entao o 404 ESCANEADO nao tem
    // como ser produzido por um toque. A prova negativa dele mora aqui, na
    // traducao, e volta para a tela no dia em que houver leitor.
    FalhaDaApi falhaDe(ProblemTipo tipo, int status) => FalhaDaApi(
          Problem(
            tipo: tipo,
            tipoUri: 'https://api.bichu.app/problems/${tipo.slug}',
            status: status,
            titulo: 'Nao foi possivel concluir',
          ),
        );

    test('sem `codigoDigitado`, o 404 continua sendo o texto da plaquinha', () {
      // O default e `false` de proposito: o dia em que a leitura por camera
      // entrar e o dia em que ninguem vai lembrar de bifurcar este texto. Com
      // o default invertido, o defeito voltaria calado do outro lado.
      final m = MensagensDeErro.de(falhaDe(
        ProblemTipo.codigoDeTagNaoEncontrado,
        404,
      ));
      expect(
        m.texto,
        MensagensDeErro.codigoNaoEncontrado,
        reason: 'REPROVA: o 404 sem origem declarada deixou de ser o texto do '
            'caminho escaneado. Quando a BICHUS-54 trouxer a camera, ela vai '
            'cair neste default, e a plaquinha de outro produto precisa '
            'continuar sendo acusada quando e verdade.',
      );
    });

    test('`codigoDigitado` nao vaza para nenhum outro desfecho', () {
      // Portao que so procura o que some nao enxerga a bifurcacao que sobra.
      // Se alguem passar a variar um segundo desfecho por origem, a divergencia
      // entre o que o comentario de `de()` declara e o que o codigo faz nao
      // apareceria em diff nenhum: ninguem quebra ao ganhar um texto a mais.
      final outros = <(ProblemTipo, int)>[
        (ProblemTipo.codigoDeTagMalformado, 400),
        (ProblemTipo.tagRevogada, 410),
        (ProblemTipo.limiteDeTentativas, 429),
        (ProblemTipo.naoEncontrado, 404),
        (ProblemTipo.desconhecido, 500),
      ];

      for (final (tipo, status) in outros) {
        final falha = falhaDe(tipo, status);
        expect(
          MensagensDeErro.de(falha, codigoDigitado: true).texto,
          MensagensDeErro.de(falha).texto,
          reason: 'REPROVA: `${tipo.slug}` ($status) mudou de texto por causa '
              'da origem do codigo. So o 404 da tag bifurca (BICHUS-153); '
              'qualquer outro desfecho que passe a variar aqui e uma segunda '
              'regra que o comentario de `de()` nao declara.',
        );
      }

      // E as falhas que nem tem `Problem`.
      for (final falha in <FalhaDeChamada>[
        const FalhaDeConexao(),
        const FalhaDeTempo(Duration(seconds: 10)),
        const FalhaDeEnderecoRecusado('https://outro.example'),
      ]) {
        expect(
          MensagensDeErro.de(falha, codigoDigitado: true).texto,
          MensagensDeErro.de(falha).texto,
          reason: 'REPROVA: `${falha.runtimeType}` mudou de texto por causa da '
              'origem do codigo. Sem sinal e sem sinal, tenha o codigo saido '
              'do teclado ou da camera.',
        );
      }
    });

    test('e o 404 da tag, esse sim, bifurca', () {
      // A prova positiva do mesmo par: sem ela o caso acima ficaria verde no
      // dia em que a bifurcacao inteira fosse removida.
      final falha = falhaDe(ProblemTipo.codigoDeTagNaoEncontrado, 404);
      expect(
        MensagensDeErro.de(falha, codigoDigitado: true).texto,
        isNot(MensagensDeErro.de(falha).texto),
        reason: 'REPROVA: `codigoDigitado` deixou de mudar o 404 da tag. O '
            'parametro existe e nao faz nada -- e a forma mais silenciosa de '
            'este defeito voltar.',
      );
    });
  });
}
