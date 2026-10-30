/// O **unico** lugar do app que decide o que e um e-mail plausivel e o que sai
/// do campo de e-mail para o contrato.
library;

/// A mensagem da conferencia ao sair do campo.
const String erroAoSairDoEmail = 'Confira o e-mail.';

/// O que vai para o contrato: o texto aparado, **na caixa que a pessoa
/// escreveu**.
String emailParaEnvio(String bruto) => bruto.trim();

/// Conferencia tolerante (UX 13): recusa o obviamente errado, aceita o incomum.
bool emailPlausivel(String bruto) {
  final v = emailParaEnvio(bruto);
  final arroba = v.indexOf('@');
  return arroba > 0 && v.indexOf('.', arroba) > arroba + 1;
}

/// `true` quando o campo tem algo escrito e o que esta escrito nao e plausivel.
bool erraAoSairDoCampo(String bruto) {
  final v = emailParaEnvio(bruto);
  return v.isNotEmpty && !emailPlausivel(v);
}
