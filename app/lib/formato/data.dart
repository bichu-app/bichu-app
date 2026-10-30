/// A data brasileira: **mascara para quem digita, `YYYY-MM-DD` para a API**.
library;

import 'package:flutter/services.dart';

/// Os oito digitos de uma data: `31121990`.
const int digitosDaData = 8;

/// O que a mascara brasileira ocupa: `31/12/1990`.
const int limiteDaData = digitosDaData + 2;

/// A idade minima do Bichu, em anos completos (cliente, 18/10/2026).
const int idadeMinimaDoBichu = 16;

/// O fuso em que o aniversario e contado, **igual ao do servidor**.
const Duration _deslocamentoDeSaoPaulo = Duration(hours: -3);

String _somenteDigitos(String valor) => valor.replaceAll(RegExp(r'[^0-9]'), '');

/// O que a pessoa digitou, na gramatica que se le: `31/12/1990`.
String mascaraDeData(String bruto) {
  final digitos = _somenteDigitos(bruto);
  if (digitos.isEmpty) return '';

  final cortado = digitos.length > digitosDaData
      ? digitos.substring(0, digitosDaData)
      : digitos;

  if (cortado.length <= 2) return cortado;
  if (cortado.length <= 4) {
    return '${cortado.substring(0, 2)}/${cortado.substring(2)}';
  }
  return '${cortado.substring(0, 2)}/${cortado.substring(2, 4)}/'
      '${cortado.substring(4)}';
}

/// O valor que vai para a API em `YYYY-MM-DD`, ou `null` quando o que foi
/// digitado nao serve.
String? dataParaOContrato(String bruto) {
  final digitos = _somenteDigitos(bruto);
  if (digitos.length != digitosDaData) return null;

  final dia = int.parse(digitos.substring(0, 2));
  final mes = int.parse(digitos.substring(2, 4));
  final ano = int.parse(digitos.substring(4));

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  final montada = DateTime(ano, mes, dia);
  final existe =
      montada.year == ano && montada.month == mes && montada.day == dia;
  if (!existe) return null;

  String doisDigitos(int n) => n.toString().padLeft(2, '0');
  return '${ano.toString().padLeft(4, '0')}-'
      '${doisDigitos(mes)}-${doisDigitos(dia)}';
}

/// A mascara aplicada enquanto se digita.
class MascaraDeData extends TextInputFormatter {
  const MascaraDeData();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue antes,
    TextEditingValue depois,
  ) {
    final formatado = mascaraDeData(depois.text);
    return TextEditingValue(
      text: formatado,
      selection: TextSelection.collapsed(offset: formatado.length),
    );
  }
}

/// A regra da **idade minima** do lado da tela, num lugar so.
class IdadeMinima {
  const IdadeMinima._();

  /// A cobranca do campo vazio ou incompleto.
  static const String precisaDaData = 'Digite a sua data de nascimento, como 31/12/1990.';

  /// A cobranca da data que nao existe no calendario.
  static const String dataNaoExiste = 'Confira o dia e o mês: essa data não existe.';

  /// A cobranca da data no futuro.
  static const String dataNoFuturo = 'Essa data ainda não chegou.';

  /// A cobranca de quem nao tem a idade minima.
  static const String aindaNaoTemIdade =
      'O Bichu é para quem tem $idadeMinimaDoBichu anos ou mais.';

  /// O dia de **hoje** no fuso do produto (`America/Sao_Paulo`).
  static DateTime hojeNoFusoDoProduto(DateTime agora) {
    final emSaoPaulo = agora.toUtc().add(_deslocamentoDeSaoPaulo);
    return DateTime(emSaoPaulo.year, emSaoPaulo.month, emSaoPaulo.day);
  }

  /// A idade em **anos completos** no dia `hoje`.
  static int anosCompletos(DateTime nascimento, DateTime hoje) {
    final anos = hoje.year - nascimento.year;
    final aniversarioJaPassou = hoje.month > nascimento.month ||
        (hoje.month == nascimento.month && hoje.day >= nascimento.day);
    return aniversarioJaPassou ? anos : anos - 1;
  }

  /// A mensagem de recusa, ou `null` quando a data passa.
  static String? recusa(String? bruto, {required DateTime agora}) {
    final String? iso = dataParaOContrato(bruto ?? '');
    if (iso == null) {
      final digitos = _somenteDigitos(bruto ?? '');
      return digitos.length == digitosDaData ? dataNaoExiste : precisaDaData;
    }

    final nascimento = DateTime.parse(iso);
    final hoje = hojeNoFusoDoProduto(agora);

    if (nascimento.isAfter(hoje)) return dataNoFuturo;
    if (anosCompletos(nascimento, hoje) < idadeMinimaDoBichu) {
      return aindaNaoTemIdade;
    }
    return null;
  }

  /// `true` quando ha data suficiente para o botao de enviar ficar habilitado.
  static bool completo(String? bruto) => dataParaOContrato(bruto ?? '') != null;
}
