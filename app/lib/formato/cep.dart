/// O CEP brasileiro: **mascara para quem digita, oito digitos para a API**.
library;

import 'package:flutter/services.dart';

/// Os oito digitos do CEP.
const int digitosDoCep = 8;

/// `01310`: o que vem antes do hifen.
const int _digitosDoPrefixo = 5;

/// O que a mascara brasileira ocupa: `01310-100`.
const int limiteDoCep = digitosDoCep + 1;

/// **A MESMA forma do contrato** (`^[0-9]{8}$`), e nao uma segunda redacao
/// dela: `TagRequestInput.postal_code` e `DirectorySuggestionInput.postal_code`
/// declaram esta expressao.
final RegExp formaDoCepNoContrato = RegExp(r'^[0-9]{8}$');

String _somenteDigitos(String valor) => valor.replaceAll(RegExp(r'[^0-9]'), '');

/// O que a pessoa digitou, na gramatica que se le: `01310-100`.
String mascaraDeCep(String bruto) {
  final digitos = _somenteDigitos(bruto);
  if (digitos.isEmpty) return '';

  final cortado = digitos.length > digitosDoCep
      ? digitos.substring(0, digitosDoCep)
      : digitos;

  if (cortado.length <= _digitosDoPrefixo) return cortado;
  return '${cortado.substring(0, _digitosDoPrefixo)}-'
      '${cortado.substring(_digitosDoPrefixo)}';
}

/// O valor que vai para a API, ou `null` quando o que foi digitado nao serve.
String? cepParaOContrato(String bruto) {
  final digitos = _somenteDigitos(bruto);
  return formaDoCepNoContrato.hasMatch(digitos) ? digitos : null;
}

/// A mascara aplicada enquanto se digita.
class MascaraDeCep extends TextInputFormatter {
  const MascaraDeCep();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue antes,
    TextEditingValue depois,
  ) {
    final formatado = mascaraDeCep(depois.text);
    return TextEditingValue(
      text: formatado,
      selection: TextSelection.collapsed(offset: formatado.length),
    );
  }
}
