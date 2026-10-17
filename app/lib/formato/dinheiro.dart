/// O **unico** lugar do app que escreve dinheiro.
///
/// ## Por que este arquivo existe
///
/// Antes dele havia duas aritmeticas de centavos no app, cada uma com o seu
/// proprio laco de ponto de milhar: `formatarReais` em
/// `app/lib/api/modelos_loja.dart` e `PrecoDoEncontro._comMilhar` em
/// `app/lib/api/modelos_rede.dart`. Duas copias da mesma conta divergem na
/// primeira correcao, e a que divergiria e a menos exercitada. Agora a conta
/// mora aqui e as duas chamam.
///
/// ## O que NAO muda por causa deste arquivo
///
/// **A unidade do contrato continua sendo centavos inteiros.** Nada aqui
/// converte, arredonda nem devolve numero: a entrada e `int` de centavos e a
/// saida e texto para a tela. Nenhuma funcao deste arquivo e chamada no caminho
/// de escrita -- o app nao tem campo de valor monetario, so exibicao -- e
/// mesmo se tivesse, texto nao volta para o contrato por aqui.
///
/// ## A forma brasileira
///
/// **Virgula decimal e ponto de milhar**, que e a ordem inversa da inglesa.
/// Trocar os dois e o defeito que passa despercebido em valores pequenos e
/// vira outro numero em valores grandes: `R$ 1,249.90` e mil vezes menos para
/// quem le rapido.
///
/// Divisao INTEIRA, sem passar por `double` em momento nenhum.
library;

/// `1249` -> `1.249`. O ponto de milhar entra a cada tres digitos contados
/// **da direita**.
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
///
/// [centavosRedondos] decide o que acontece com `,00`, e os dois lados sao
/// decisao de produto, nao gosto:
///
/// - `true` (Loja): `R$ 100,00`, e nunca `R$ 100,0` nem `R$ 100`. Um preco
///   redondo sem os dois zeros parece truncado numa linha de preco;
/// - `false` (Rede): `R$ 15 por pet`. O selo do encontro e uma frase curta e
///   `R$ 15,00 por pet` acrescenta dois zeros que ninguem le.
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
///
/// Mantido com este nome porque e o que as telas e
/// `app/test/telas/loja_com_dados_test.dart` ja importam.
String formatarReais(int centavos) => reaisEmTexto(centavos);
