// ISCA (D): o tipo de teclado que CHEGA A PLATAFORMA, campo por campo.
//
// ## Por que medir o canal, e nao a aparencia
//
// Teste de widget nao tem teclado de verdade: nao da para olhar a tecla. O que
// da para medir e o que o Flutter MANDA para a plataforma em
// `TextInput.setClient` -- `tester.testTextInput.setClientArgs['inputType']`
// --, e e exatamente esse valor que decide qual teclado o iOS abre e se ele
// oferece a sugestao do sistema. Um caso que lesse `BichuField.tipoDeTeclado`
// mediria a nossa propria declaracao; este le o que saiu.
//
// ## O que mudou em 20/10/2026, e o que NAO mudou
//
// Levantados os 65 campos do app, **um** tinha teclado errado (o numero da
// casa, que abria o alfabeto inteiro para tres digitos) e tres ganharam a
// variante que o conteudo pede. Cinco campos em tres telas, e nada em massa:
//
//   tela                      campo          antes      agora
//   Solicitar plaquinha       numero         (nenhum)   number
//   Solicitar plaquinha       logradouro     (nenhum)   streetAddress
//   Solicitar plaquinha       destinatario   (nenhum)   name
//   Meus dados                nome           (nenhum)   name
//   Criar conta               Nome           (nenhum)   name
//
// **O CEP ficou como estava, de proposito**: ele declara `number` com o porque
// escrito ao lado (mascara brasileira, pedido do cliente de 18/10). Campo com
// razao escrita nao se troca sem ler a razao.
//
// **E o codigo da plaquinha continua `text`**, que e o terceiro caso daqui: o
// alfabeto da tag e Crockford Base32, **alfanumerico**, e um teclado numerico
// esconderia metade das teclas que a pessoa precisa digitar. Era uma hipotese
// de quem pediu o levantamento, e morreu na medicao.
//
// **O campo de texto corrido continua `multiline`**, que e o contrapeso: a
// tecla de retorno dele insere linha, e trocar para `text` para "ganhar" a
// tecla de concluir mataria o paragrafo de um campo que pode precisar dele. A
// saida dos campos de texto corrido e a faixa acima do teclado
// (`widgets/barra_do_teclado.dart`), que serve nos dois casos.

import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  /// O tipo que a plataforma recebeu para o campo que esta com o foco.
  String tipoNoCanal(WidgetTester tester) {
    final args = tester.testTextInput.setClientArgs;
    expect(
      args,
      isNotNull,
      reason:
          'REPROVA ANTES DA MEDICAO: nenhum campo abriu conexao de entrada de '
          'texto, entao nao ha tipo de teclado a medir -- o caso ficaria verde '
          'olhando para nada.',
    );
    return ((args!['inputType'] as Map<String, dynamic>)['name'] as String);
  }

  /// Monta um campo so, do jeito que as telas o montam.
  Future<void> montarCampo(
    WidgetTester tester, {
    TextInputType? tipo,
    int linhas = 1,
  }) async {
    final controlador = TextEditingController();
    addTearDown(controlador.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: BichuTheme.claro,
        home: Scaffold(
          body: BichuField(
            rotulo: 'Campo',
            controlador: controlador,
            tipoDeTeclado: tipo,
            linhas: linhas,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(EditableText));
    await tester.pumpAndSettle();
  }

  group('o tipo declarado chega inteiro a plataforma', () {
    // Os tres tipos que entraram nesta rodada. Cada um e um campo de verdade
    // de uma tela de verdade; o que este grupo prova e que `BichuField`
    // entrega o tipo ao canal sem perde-lo no caminho -- sem isso, os casos
    // por tela mediriam a tela e nao o teclado.
    for (final (String nome, TextInputType tipo, String esperado) in <
      (String, TextInputType, String)
    >[
      ('numero da casa', TextInputType.number, 'TextInputType.number'),
      (
        'logradouro',
        TextInputType.streetAddress,
        'TextInputType.address',
      ),
      ('nome de pessoa', TextInputType.name, 'TextInputType.name'),
      ('telefone', TextInputType.phone, 'TextInputType.phone'),
      ('e-mail', TextInputType.emailAddress, 'TextInputType.emailAddress'),
    ]) {
      testWidgets('$nome entrega `$esperado`', (tester) async {
        await montarCampo(tester, tipo: tipo);
        expect(
          tipoNoCanal(tester),
          esperado,
          reason:
              'REPROVA: o campo de $nome declarou um tipo de teclado e a '
              'plataforma recebeu outro. E este valor que decide qual teclado '
              'o iOS abre -- e, nos tipos de nome e endereco, se ele oferece a '
              'sugestao do sistema.',
        );
      });
    }
  });

  group('os dois que NAO mudam, e o motivo de cada um', () {
    testWidgets(
      'CONTRAPESO: campo de TEXTO CORRIDO continua `multiline`',
      (tester) async {
        await montarCampo(tester, linhas: 3);

        expect(
          tipoNoCanal(tester),
          'TextInputType.multiline',
          reason:
              'REPROVA: um campo de texto corrido deixou de ser `multiline`. '
              'Parece ganho -- com `text` a tecla de retorno vira `done` e o '
              'teclado passa a ter como fechar --, e e perda: com `multiline` '
              'a tecla INSERE LINHA, e e isso que deixa escrever paragrafo num '
              'campo que pede paragrafo (sinais do pet, cuidados, observacao '
              'do pedido, recado ao tutor). Quem resolve o teclado destes 16 '
              'campos e a faixa de `Concluir` acima dele, nao a troca do tipo. '
              'A escolha de encolher algum deles para uma linha e do cliente, '
              'e esta pendente.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: campo sem tipo declarado continua teclado de TEXTO',
      (tester) async {
        await montarCampo(tester);

        expect(
          tipoNoCanal(tester),
          'TextInputType.text',
          reason:
              'REPROVA: campo de uma linha sem tipo declarado deixou de abrir '
              'o teclado de texto. E o caso do CODIGO DA PLAQUINHA, e ele e o '
              'exemplo de por que nao se troca tipo em massa: o alfabeto da '
              'tag e Crockford Base32, ALFANUMERICO com 16 simbolos, e um '
              'teclado numerico esconderia metade das teclas de quem esta na '
              'calcada com o animal de alguem no colo.',
        );
      },
    );
  });
}
