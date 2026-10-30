/// A regra do **nome de exibicao**, num lugar so.
class NomeDeExibicao {
  const NomeDeExibicao._();

  /// O teto, igual ao `maxLength` de `display_name` no contrato
  /// (`RegisterRequest` e `MeUpdate`, os dois com 80) e ao `LIMITE_DO_NOME` do
  /// `auth-service.ts`.
  static const int limite = 80;

  /// A cobranca do campo vazio.
  static const String precisaDoNome = 'Digite o nome que você quer usar no Bichu.';

  /// A cobranca do nome que passa do teto.
  static const String passouDoLimite =
      'Use no máximo $limite caracteres no nome.';

  /// O nome aparado, ou `null` quando **nao sobra nome depois de aparar**.
  static String? aparar(String? bruto) {
    final String aparado = (bruto ?? '').trim();
    return aparado.isEmpty ? null : aparado;
  }

  /// `true` quando ha nome suficiente para o botao de enviar ficar habilitado.
  static bool completo(String? bruto) => aparar(bruto) != null;

  /// A mensagem de recusa, ou `null` quando o nome passa.
  static String? recusa(String? bruto) {
    final String? nome = aparar(bruto);
    if (nome == null) return precisaDoNome;
    if (nome.length > limite) return passouDoLimite;
    return null;
  }
}
