import 'package:bichu/api/modelos_loja.dart';
import 'package:bichu/formato/dinheiro.dart';
import 'package:flutter_test/flutter_test.dart';

/// ESCRITO E NAO RODADO (regra do cliente nesta tarefa).
///
/// O app **nao tem campo de valor monetario**: dinheiro so e exibido. O que
/// estes casos guardam e a forma brasileira e a existencia de UMA conta de
/// centavos, depois de ela ter saido de `modelos_loja.dart` e de
/// `modelos_rede.dart`.
void main() {
  group('reais: virgula decimal e ponto de milhar', () {
    test('ISCA: trocar os dois separadores reprova aqui', () {
      // `R$ 1,249.90` e mil vezes menos para quem le rapido.
      expect(reaisEmTexto(124990), r'R$ 1.249,90');
      expect(reaisEmTexto(124990), isNot(r'R$ 1,249.90'));
    });

    test('ponto de milhar a cada tres digitos, contados da direita', () {
      expect(reaisEmTexto(100000), r'R$ 1.000,00');
      expect(reaisEmTexto(100000000), r'R$ 1.000.000,00');
      expect(reaisEmTexto(123456789), r'R$ 1.234.567,89');
    });

    test('zero e um centavo', () {
      expect(reaisEmTexto(0), r'R$ 0,00');
      expect(reaisEmTexto(1), r'R$ 0,01');
      expect(reaisEmTexto(999999), r'R$ 9.999,99');
    });

    test('divisao inteira: 0,29, 1,15 e 4,35 nao passam por double', () {
      expect(reaisEmTexto(29), r'R$ 0,29');
      expect(reaisEmTexto(115), r'R$ 1,15');
      expect(reaisEmTexto(435), r'R$ 4,35');
    });
  });

  group('as duas formas do produto, uma conta so', () {
    test('Loja: sempre dois digitos de centavo', () {
      expect(formatarReais(10000), r'R$ 100,00');
      expect(formatarReais(990), r'R$ 9,90');
    });

    test('Rede: sem ",00" redondo', () {
      expect(reaisEmTexto(1500, centavosRedondos: false), r'R$ 15');
      expect(reaisEmTexto(125000, centavosRedondos: false), r'R$ 1.250');
      expect(reaisEmTexto(1550, centavosRedondos: false), r'R$ 15,50');
    });

    test('`formatarReais` continua visivel por `api/modelos_loja.dart`', () {
      // A reexportacao existe porque as telas e
      // `app/test/telas/loja_com_dados_test.dart` importam daquele caminho.
      expect(formatarReais(8990), r'R$ 89,90');
    });
  });
}
