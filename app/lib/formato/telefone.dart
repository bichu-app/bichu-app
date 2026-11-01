/// O telefone brasileiro: mascara para quem digita, **E.164 para a API**.
library;

import 'package:flutter/services.dart';

/// O prefixo do Brasil.
const String discagemDoBrasil = '55';

const int digitosDoFixo = 8;
const int digitosDoCelular = 9;
const int _digitosDoDdd = 2;

const int _minimoDeDigitos = _digitosDoDdd + digitosDoFixo;
const int _maximoDeDigitos = _digitosDoDdd + digitosDoCelular;

/// O maximo que a mascara brasileira ocupa: `(11) 98765-4321`.
const int limiteDoTelefone = 15;

/// **A MESMA forma do contrato** (`^\+55\d{10,11}$`), e nao uma segunda redacao
/// dela: `MeUpdate.phone_e164` e `DeliveryAddress.recipient_phone` declaram
/// esta expressao, e um campo que aceitasse mais produziria 400.
final RegExp formaDeE164DoBrasil = RegExp(r'^\+55\d{10,11}$');

String _somenteDigitos(String valor) => valor.replaceAll(RegExp(r'[^0-9]'), '');

/// O que a pessoa digitou, na gramatica brasileira que se le.
String mascaraDeTelefone(String bruto) {
  final digitos = _somenteDigitos(bruto);
  if (digitos.isEmpty) return '';

  final cortado = digitos.length > _maximoDeDigitos
      ? digitos.substring(0, _maximoDeDigitos)
      : digitos;

  if (cortado.length <= _digitosDoDdd) return '($cortado';

  final ddd = cortado.substring(0, _digitosDoDdd);
  final resto = cortado.substring(_digitosDoDdd);

  final tamanhoDoPrefixo = resto.length > digitosDoFixo ? 5 : 4;
  if (resto.length <= tamanhoDoPrefixo) return '($ddd) $resto';

  final prefixo = resto.substring(0, tamanhoDoPrefixo);
  final sufixo = resto.substring(tamanhoDoPrefixo);
  return '($ddd) $prefixo-$sufixo';
}

/// O E.164 do servidor **na gramatica da tela**, para preencher o campo.
String telefoneDoE164(String? e164) {
  if (e164 == null || e164.isEmpty) return '';
  final digitos = _somenteDigitos(e164);
  if (!digitos.startsWith(discagemDoBrasil)) return e164;
  final nacional = digitos.substring(discagemDoBrasil.length);
  if (nacional.length != _minimoDeDigitos &&
      nacional.length != _maximoDeDigitos) {
    return e164;
  }
  return mascaraDeTelefone(nacional);
}

/// O valor que vai para a API, ou `null` quando o que foi digitado nao serve.
String? telefoneEmE164(String bruto) {
  var digitos = _somenteDigitos(bruto);

  if (digitos.length > _maximoDeDigitos && digitos.startsWith(discagemDoBrasil)) {
    digitos = digitos.substring(discagemDoBrasil.length);
  }
  if (digitos.length < _minimoDeDigitos || digitos.length > _maximoDeDigitos) {
    return null;
  }
  final ddd = int.tryParse(digitos.substring(0, _digitosDoDdd));
  if (ddd == null || ddd < 11) return null;

  final e164 = '+$discagemDoBrasil$digitos';
  return formaDeE164DoBrasil.hasMatch(e164) ? e164 : null;
}

/// A mascara aplicada enquanto se digita.
class MascaraDeTelefone extends TextInputFormatter {
  const MascaraDeTelefone();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue antes,
    TextEditingValue depois,
  ) {
    final formatado = mascaraDeTelefone(depois.text);
    return TextEditingValue(
      text: formatado,
      selection: TextSelection.collapsed(offset: formatado.length),
    );
  }
}
