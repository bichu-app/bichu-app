import 'package:flutter/services.dart';

/// A mascara do campo de digitacao do codigo da tag: `XXXX-XXXX-XXXX-XXXX`.
class MascaraDoCodigoDaTag extends TextInputFormatter {
  const MascaraDoCodigoDaTag();

  /// Os 32 simbolos do Crockford Base32 **mais** `I`, `L` e `O`, que o servidor
  /// substitui por `1`, `1` e `0`.
  static final RegExp aceitos = RegExp('[0-9A-TV-Z]');

  /// O que o campo **guarda**: todo digito e toda letra de A a Z, `U` incluido.
  static final RegExp mantidos = RegExp('[0-9A-Z]');

  /// 16 simbolos, em quatro grupos de quatro.
  static const int simbolos = 16;
  static const int tamanhoDoGrupo = 4;

  /// O tamanho da forma impressa: 16 simbolos mais 3 hifens.
  static const int tamanhoImpresso = simbolos + (simbolos ~/ tamanhoDoGrupo) - 1;

  /// Aplica a mascara a um texto qualquer.
  static String formatar(String bruto) {
    final buffer = StringBuffer();
    var escritos = 0;
    for (final caractere in bruto.toUpperCase().split('')) {
      if (!mantidos.hasMatch(caractere)) continue;
      if (escritos > 0 && escritos % tamanhoDoGrupo == 0) buffer.write('-');
      buffer.write(caractere);
      escritos += 1;
    }
    return buffer.toString();
  }

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue anterior,
    TextEditingValue novo,
  ) {
    final formatado = formatar(novo.text);

    final simbolosAntesDoCursor = novo.text
        .substring(0, novo.selection.baseOffset.clamp(0, novo.text.length))
        .toUpperCase()
        .split('')
        .where(mantidos.hasMatch)
        .length;

    var deslocamento = 0;
    var contados = 0;
    while (deslocamento < formatado.length && contados < simbolosAntesDoCursor) {
      if (formatado[deslocamento] != '-') contados += 1;
      deslocamento += 1;
    }
    if (deslocamento < formatado.length && formatado[deslocamento] == '-') {
      deslocamento += 1;
    }

    return TextEditingValue(
      text: formatado,
      selection: TextSelection.collapsed(offset: deslocamento),
    );
  }
}
