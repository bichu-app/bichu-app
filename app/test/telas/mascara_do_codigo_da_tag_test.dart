import 'package:bichu/telas/escanear/mascara_do_codigo_da_tag.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// A mascara do campo de digitacao do codigo (BICHUS-154, criterio 11).
///
/// O que estes casos guardam nao e a aparencia: e que a mascara **nao inventa e
/// nao perde simbolo**. Uma mascara que engolisse um caractere produziria um
/// codigo errado com a forma certa, e a pessoa receberia 400 sem entender por
/// que -- o campo mostraria exatamente o que ela digitou.
void main() {
  TextEditingValue digitado(String texto) => TextEditingValue(
        text: texto,
        selection: TextSelection.collapsed(offset: texto.length),
      );

  String aplicar(String texto) => const MascaraDoCodigoDaTag()
      .formatEditUpdate(TextEditingValue.empty, digitado(texto))
      .text;

  group('mascara XXXX-XXXX-XXXX-XXXX', () {
    test('quatro grupos iguais de quatro, e nao os sete do formato antigo', () {
      expect(aplicar('GQSM0XHBT4D9G31S'), 'GQSM-0XHB-T4D9-G31S');
      expect(MascaraDoCodigoDaTag.tamanhoImpresso, 19);
    });

    test('nenhum simbolo e perdido nem inventado no caminho', () {
      const codigo = 'GQSM0XHBT4D9G31S';
      final comMascara = aplicar(codigo);
      expect(comMascara.replaceAll('-', ''), codigo);
    });

    test('o hifen so aparece quando o grupo fecha, e nunca sobra no fim', () {
      expect(aplicar('GQS'), 'GQS');
      expect(aplicar('GQSM'), 'GQSM');
      expect(aplicar('GQSM0'), 'GQSM-0');
      expect(aplicar('GQSM0XHB'), 'GQSM-0XHB');
    });

    test('maiusculiza, porque a plaquinha e lida por quem nao olha o teclado', () {
      expect(aplicar('gqsm0xhbt4d9g31s'), 'GQSM-0XHB-T4D9-G31S');
    });

    test('o hifen que a pessoa digitou nao duplica o da mascara', () {
      expect(aplicar('GQSM-0XHB-T4D9-G31S'), 'GQSM-0XHB-T4D9-G31S');
      expect(aplicar('GQSM--0XHB'), 'GQSM-0XHB');
    });

    test('colar de uma mensagem, com espaco e pontuacao, resolve no mesmo texto', () {
      expect(aplicar(' GQSM 0XHB.T4D9/G31S '), 'GQSM-0XHB-T4D9-G31S');
    });

    test('para em 16 simbolos: o 17o nao entra', () {
      expect(aplicar('GQSM0XHBT4D9G31SZZZZ'), 'GQSM-0XHB-T4D9-G31S');
    });

    test('I, L e O passam intactos: quem substitui e o servidor', () {
      // Substituir aqui faria o caractere pular sob o dedo de quem digita, e
      // criaria uma segunda fonte para uma regra que e do contrato.
      expect(aplicar('ILO1'), 'ILO1');
    });

    test('U nao entra: ele nao tem substituicao e nunca vira codigo', () {
      expect(aplicar('GUQS'), 'GQS');
    });

    test('o cursor fica onde a pessoa deixou, e nao no fim do campo', () {
      // Editar no meio e o caminho de quem esta corrigindo um erro de
      // digitacao. Cursor que salta para o fim faz a correcao ser refeita.
      const mascara = MascaraDoCodigoDaTag();
      final resultado = mascara.formatEditUpdate(
        digitado('GQSM-0XHB-T4D9-G31S'),
        const TextEditingValue(
          text: 'GQSX-0XHB-T4D9-G31S',
          selection: TextSelection.collapsed(offset: 4),
        ),
      );
      expect(resultado.text, 'GQSX-0XHB-T4D9-G31S');
      // Quatro simbolos antes do cursor: ele para depois do hifen, prontos
      // para o quinto.
      expect(resultado.selection.baseOffset, 5);
    });

    test('o campo vazio continua vazio, sem hifen solto', () {
      expect(aplicar(''), '');
      expect(aplicar('---'), '');
    });
  });
}
