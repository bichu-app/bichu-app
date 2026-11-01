/// O **unico** lugar do app que escreve dinheiro.
library;

String _comMilhar(int inteiros) {
  final digitos = inteiros.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digitos.length; i++) {
    if (i > 0 && (digitos.length - i) % 3 == 0) buffer.write('.');
    buffer.write(digitos[i]);
  }
  return buffer.toString();
}

/// Centavos para o texto do produto, com `R$`.
String reaisEmTexto(int centavos, {bool centavosRedondos = true}) {
  final negativo = centavos < 0;
  final absoluto = centavos.abs();
  final inteiros = _comMilhar(absoluto ~/ 100);
  final resto = absoluto % 100;
  final sinal = negativo ? '-' : '';
  if (resto == 0 && !centavosRedondos) return '${sinal}R\$ $inteiros';
  return '${sinal}R\$ $inteiros,${resto.toString().padLeft(2, '0')}';
}

/// Centavos para `R$ 1.249,90`, a forma da Loja: sempre dois digitos de
/// centavo.
String formatarReais(int centavos) => reaisEmTexto(centavos);
