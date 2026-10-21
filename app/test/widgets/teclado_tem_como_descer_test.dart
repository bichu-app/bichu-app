// ISCA (D): o teclado SEMPRE tem como descer, e a faixa que o fecha nao cobre
// a acao da tela.
//
// ## O defeito que ela desliga
//
// Levantado em 20/10/2026 sobre `app/lib` inteiro, depois de o cliente relatar
// o mesmo problema em duas telas: **65 campos de texto em 22 telas**, e em
// **7 delas o teclado subia e nao descia**. Tres coisas se somavam:
//
//  1. **Toque fora nao fechava**, em nenhuma das 22. Nao e descuido do app: o
//     `EditableText._defaultOnTapOutside` do Flutter tem um `switch` por
//     plataforma em que Android, iOS e Fuchsia caem num `break` -- so desktop
//     desfoca. Quem quer o gesto no telefone precisa passar `onTapOutside`.
//  2. **16 dos 65 campos tem mais de uma linha e nenhum tipo de teclado
//     declarado.** O Flutter usa `multiline`, e com `multiline` a tecla de
//     retorno INSERE LINHA: nao existe tecla de concluir a declarar, porque o
//     teclado do sistema tem UMA tecla de retorno (13 rotulos possiveis no
//     `text_input.dart`, e `newline` e um deles).
//  3. **A barra de acao ficava atras do teclado**, com o botao da tela embaixo
//     dele (consertado em `barra_de_acao_fixa.dart`, com caso proprio).
//
// No Android o botao voltar fecha o teclado e salva a pessoa. **No iOS nao ha
// equivalente** -- e e por isso que o cliente descreveu o defeito como sendo
// do iOS, e estava certo.
//
// ## Os quatro casos, e o que cada um impede
//
// O primeiro liga o gesto. O segundo e o CONTRAPESO dele: tocar em outro campo
// NAO pode fechar o teclado, senao trocar de campo num formulario de seis
// campos pisca o teclado a cada toque. Quem garante isso nao e codigo nosso, e
// o `groupId` do `TextFieldTapRegion` que o `EditableText` desenha em volta de
// si -- ele e a propria classe `EditableText` para todos os campos, entao um
// campo esta DENTRO da regiao do outro. O caso existe porque a "simplificacao"
// obvia (um `GestureDetector` em volta da tela chamando `unfocus`) quebra
// exatamente isso, e passaria no primeiro caso.
//
// O terceiro e o quarto sao o par da faixa: ela aparece em campo de texto
// corrido e `Concluir` tira o foco; e campo de uma linha **nao** ganha faixa,
// porque a tecla de retorno dele ja resolve e dois controles para a mesma acao
// custariam 48 dp de altura util a 49 campos que nao precisam.

import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/barra_de_acao_fixa.dart';
import 'package:bichu/widgets/barra_do_teclado.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  /// Um formulario com dois campos de UMA linha e um de texto corrido, mais a
  /// barra de acao da tela -- que e o arranjo das 13 telas que tem campo e
  /// barra.
  Future<void> montar(WidgetTester tester) async {
    final um = TextEditingController();
    final dois = TextEditingController();
    final corrido = TextEditingController();
    addTearDown(um.dispose);
    addTearDown(dois.dispose);
    addTearDown(corrido.dispose);

    await tester.pumpWidget(
      MaterialApp(
        theme: BichuTheme.claro,
        home: Scaffold(
          body: ListView(
            children: <Widget>[
              // O ALVO DO TOQUE FORA: uma area da tela que nao e campo nenhum
              // e nao e botao. E onde o dedo cai quando a pessoa quer so
              // fechar o teclado.
              const SizedBox(
                height: 120,
                child: Center(child: Text('area neutra')),
              ),
              BichuField(rotulo: 'Um', controlador: um),
              BichuField(rotulo: 'Dois', controlador: dois),
              BichuField(
                rotulo: 'Corrido',
                controlador: corrido,
                linhas: 3,
              ),
            ],
          ),
          bottomNavigationBar: BarraDeAcaoFixa(
            acoes: <Widget>[
              FilledButton(onPressed: () {}, child: const Text('Salvar')),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder campoDe(String rotulo) => find.descendant(
    of: find.widgetWithText(BichuField, rotulo),
    matching: find.byType(EditableText),
  );

  bool temFoco(WidgetTester tester, Finder campo) =>
      tester.widget<EditableText>(campo).focusNode.hasFocus;

  testWidgets('tocar FORA dos campos FECHA o teclado', (tester) async {
    await montar(tester);

    await tester.tap(campoDe('Um'));
    await tester.pumpAndSettle();
    expect(
      temFoco(tester, campoDe('Um')),
      isTrue,
      reason:
          'REPROVA ANTES DA MEDICAO: o toque no campo nao deu foco a ele, '
          'entao "o toque fora fechou" nao mediria nada.',
    );

    await tester.tap(find.text('area neutra'));
    await tester.pumpAndSettle();

    expect(
      temFoco(tester, campoDe('Um')),
      isFalse,
      reason:
          'REPROVA: tocar fora dos campos NAO fechou o teclado. O Flutter nao '
          'faz isso sozinho no telefone -- '
          '`EditableText._defaultOnTapOutside` cai num `break` em Android, iOS '
          'e Fuchsia --, e sem `onTapOutside` no `TextField` de `BichuField` '
          'sao 65 campos em 22 telas sem gesto de saida. Em 7 dessas telas o '
          'teclado subia e nao descia, e no iOS nao ha botao voltar para '
          'salvar a pessoa.',
    );
  });

  testWidgets(
    'CONTRAPESO: tocar em OUTRO CAMPO nao fecha o teclado, so troca de campo',
    (tester) async {
      await montar(tester);

      await tester.tap(campoDe('Um'));
      await tester.pumpAndSettle();

      // HONESTIDADE SOBRE A FORCA DESTE CASO: ele e GUARDA, e nao isca
      // provada por desligamento.
      //
      // Tentei desligar o mecanismo de duas formas, em 20/10/2026, e **as
      // duas continuaram verdes**:
      //
      //  * um `TextFieldTapRegion` com `groupId` proprio por campo, em volta
      //    do campo de `BichuField`: nao muda nada, porque o
      //    `TextFieldTapRegion` que o `EditableText` desenha **por dentro de
      //    si** continua com `groupId` igual a classe `EditableText` em todos
      //    os campos, e e ele que decide;
      //  * trocar o gesto por um `GestureDetector` em volta da tela: num
      //    toque, o reconhecedor mais FUNDO ganha a arena, e o do campo e
      //    mais fundo que o da tela.
      //
      // Ou seja: a propriedade e garantida pelo Flutter, e nao por escolha
      // nossa, e nao consegui construir a versao que a quebra. O caso fica
      // porque o dia em que alguem escrever o campo sem passar por
      // `EditableText` -- ou em que o Flutter mudar esse `groupId` -- a troca
      // entre campos passa a piscar o teclado, e ninguem estaria olhando.
      //
      // O QUE ELE MEDE E O CANAL DO TECLADO, E NAO ONDE O FOCO PAROU.
      //
      // Medido: com um `groupId` proprio por campo -- a "simplificacao" que
      // este contrapeso existe para impedir --, o foco ACABA no campo certo de
      // qualquer jeito. A sequencia e `onTapOutside` do primeiro campo
      // desfocando, e o toque focando o segundo logo depois: dois `expect` de
      // `hasFocus` ficam verdes, e no aparelho o teclado DESCE E SOBE no meio.
      // Quem ve isso e o canal, e o sinal MEDIDO e `TextInput.hide`. Trocar
      // de campo com tudo certo manda `clearClient` e logo um `setClient` +
      // `show` -- o teclado NAO desce, e `clearClient` sozinho nao prova nada
      // (medido: ele sai nas duas situacoes). `hide` e o que so aparece quando
      // o teclado some de verdade.
      tester.testTextInput.log.clear();
      await tester.tap(campoDe('Dois'));
      await tester.pumpAndSettle();

      final fechamentos = tester.testTextInput.log
          .map((MethodCall c) => c.method)
          .where((String m) => m == 'TextInput.hide')
          .toList();
      expect(
        fechamentos,
        isEmpty,
        reason:
            'REPROVA: trocar de campo mandou $fechamentos para a plataforma -- '
            'o teclado DESCEU no caminho, e vai subir de novo. Num formulario '
            'de seis campos sao seis piscadas. Quem impede isso e o `groupId` '
            'do `TextFieldTapRegion`, que o `EditableText` fixa na propria '
            'classe para TODOS os campos: um campo esta dentro da regiao do '
            'outro e o `onTapOutside` nem e chamado. Se alguem trocou o gesto '
            'por um `groupId` proprio por campo, ou por um `GestureDetector` '
            'em volta da tela, este caso reprova -- e os `hasFocus` abaixo '
            'continuam verdes, porque o foco ACABA no lugar certo nos dois '
            'casos. Foi medido.',
      );

      expect(
        temFoco(tester, campoDe('Dois')),
        isTrue,
        reason:
            'REPROVA: tocar no segundo campo nao levou o foco para ele. Com o '
            'foco perdido no caminho, o teclado desce e sobe a cada troca de '
            'campo -- num formulario de seis campos sao seis piscadas. Quem '
            'impede isso e o `groupId` do `TextFieldTapRegion`, que e a classe '
            '`EditableText` para TODOS os campos: um campo esta dentro da '
            'regiao do outro e o `onTapOutside` nem e chamado. Se alguem '
            'trocou o gesto por um `GestureDetector` em volta da tela, ou por '
            'um `groupId` proprio por campo, este caso reprova e o de cima '
            'continua verde.',
      );
      expect(
        temFoco(tester, campoDe('Um')),
        isFalse,
        reason:
            'REPROVA: os dois campos ficaram com foco. Se este `expect` '
            'reprova, o de cima ficou verde medindo outra coisa.',
      );
      expect(
        tester.testTextInput.isVisible,
        isTrue,
        reason:
            'REPROVA: o teclado nao esta mais pedido a plataforma depois da '
            'troca de campo. A pessoa tocou no campo seguinte e ficou sem '
            'teclado para escrever nele.',
      );
    },
  );

  testWidgets('campo de TEXTO CORRIDO ganha a faixa, e `Concluir` tira o foco',
      (tester) async {
    await montar(tester);

    // A SEQUENCIA DO APARELHO: toca o campo, DEPOIS o teclado sobe. A faixa
    // nao aparece com o teclado fechado -- campo focado e teclado aberto nao
    // sao a mesma coisa, e uma faixa desenhada sem teclado se encosta no chao
    // da tela e cobre o que estiver ali (reprovou assim no mural, com o
    // `Comentar` da folha de comentario atras dela).
    await tester.tap(campoDe('Corrido'));
    await tester.pump();
    tester.view.viewInsets = const FakeViewPadding(bottom: 800);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();

    expect(
      find.byType(BarraDoTeclado),
      findsOneWidget,
      reason:
          'REPROVA: o campo de texto corrido nao recebeu a faixa de `Concluir`. '
          'Com mais de uma linha o Flutter usa `multiline`, e a tecla de '
          'retorno do teclado INSERE LINHA: nao ha tecla de concluir a '
          'declarar, e a faixa acima do teclado e o unico lugar que o iOS '
          'garante visivel com o teclado aberto. E o pedido literal do '
          'cliente: "vem um icone de certo nativo no proprio teclado, que '
          'permite com que o usuario feche o teclado nativo do celular".',
    );

    await tester.tap(
      find.descendant(
        of: find.byType(BarraDoTeclado),
        matching: find.text(BarraDoTeclado.rotuloConcluir),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      temFoco(tester, campoDe('Corrido')),
      isFalse,
      reason:
          'REPROVA: `Concluir` nao tirou o foco do campo, e sem foco perdido o '
          'teclado nao desce. A faixa seria um botao decorativo na unica tela '
          'em que nao ha outro jeito de fechar o teclado.',
    );
    expect(
      find.byType(BarraDoTeclado),
      findsNothing,
      reason:
          'REPROVA: a faixa ficou na tela depois de o campo perder o foco. Ela '
          'vive num `Overlay`, que desenha POR CIMA do `Scaffold`: uma faixa '
          'que nao se retira fica sobre a barra de acao da tela seguinte.',
    );
  });

  testWidgets(
    'CONTRAPESO: campo focado SEM teclado na tela nao ganha faixa',
    (tester) async {
      await montar(tester);

      // Foco sim, teclado nao: e o estado de quem tem teclado fisico ligado, o
      // quadro entre o toque e o teclado subir, e TODO teste de widget que
      // nao levanta `viewInsets` de proposito.
      await tester.tap(campoDe('Corrido'));
      await tester.pumpAndSettle();

      expect(
        tester.view.viewInsets.bottom,
        0,
        reason:
            'REPROVA POR VAZIO: havia teclado anunciado, entao este caso nao '
            'esta medindo o estado que ele descreve.',
      );
      expect(
        find.byType(BarraDoTeclado),
        findsNothing,
        reason:
            'REPROVA: a faixa apareceu com o campo focado e o teclado FECHADO. '
            'Ela vive num `Overlay` e se posiciona por `bottom: '
            'viewInsets.bottom`: sem teclado isso e `bottom: 0`, o chao da '
            'tela, e ela cobre o que estiver ali. Foi medido em 20/10/2026 e '
            'nao em teoria -- o caso `comentar manda o texto no corpo` do '
            'mural reprovou com o `Comentar` da folha de comentario atras da '
            'faixa, porque o campo de comentario tem `linhas: 2`. Foco e '
            'teclado aberto nao sao a mesma coisa.',
      );
    },
  );

  testWidgets(
    'CONTRAPESO: campo de UMA LINHA nao ganha faixa nenhuma',
    (tester) async {
      await montar(tester);

      await tester.tap(campoDe('Um'));
      await tester.pumpAndSettle();

      expect(
        find.byType(BarraDoTeclado),
        findsNothing,
        reason:
            'REPROVA: um campo de UMA LINHA recebeu a faixa de `Concluir`. Ele '
            'ja tem desfecho na propria tecla de retorno do sistema (`done` '
            'desenha o certo, `next` a flecha), e a faixa seria um segundo '
            'controle para a mesma acao cobrando '
            '${BarraDoTeclado.altura} dp de altura util. Sao 49 os campos de '
            'uma linha do app: o conserto dos 16 de texto corrido nao pode ser '
            'pago por eles.',
      );
      expect(
        BarraDoTeclado.alturaEmUso.value,
        0,
        reason:
            'REPROVA: a altura reservada para a faixa nao e zero com um campo '
            'de uma linha focado. E este valor que a barra de acao soma ao '
            'recuo do teclado, e um numero fantasma aqui levanta a barra de '
            'acao de toda tela sem motivo.',
      );
    },
  );

  testWidgets(
    'com a faixa na tela, a barra de acao fica ACIMA dela',
    (tester) async {
      await montar(tester);

      await tester.tap(campoDe('Corrido'));
      await tester.pump();
      tester.view.viewInsets = const FakeViewPadding(bottom: 800);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpAndSettle();

      final faixa = tester.getRect(find.byType(BarraDoTeclado));
      final acao = tester.getRect(
        find.descendant(
          of: find.byType(BarraDeAcaoFixa),
          matching: find.byType(FilledButton),
        ),
      );

      expect(
        acao.bottom,
        lessThanOrEqualTo(faixa.top + 0.5),
        reason:
            'REPROVA: `Salvar` ($acao) invade a faixa de `Concluir` ($faixa). '
            'A faixa vive num `Overlay` e desenha POR CIMA do `Scaffold`: sem '
            'somar `BarraDoTeclado.alturaEmUso` ao recuo da barra de acao, '
            'consertar "o teclado cobre o Salvar" produz "a faixa cobre o '
            'Salvar" -- o mesmo defeito do cliente com outro nome.',
      );
    },
  );
}
