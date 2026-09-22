import 'package:flutter/services.dart';

/// A mascara do campo de digitacao do codigo da tag: `XXXX-XXXX-XXXX-XXXX`.
///
/// Sao 16 caracteres em quatro grupos iguais de quatro (ADR-0004, Emenda 1). O
/// formato anterior, de 26, era seis grupos de quatro e um de dois, e e por isso
/// que nunca houve mascara aqui: quatro grupos iguais sao simples o bastante
/// para caber numa regra que ninguem precisa reler.
///
/// ## O que ela faz, e o que ela NAO faz
///
/// Ela **formata**, e nao valida. A conferencia do simbolo de verificacao mora
/// no servidor (`normalizarCodigoDaTag`), e continua morando la: repeti-la aqui
/// criaria duas fontes para a mesma regra, e a do aplicativo envelheceria na
/// mao de quem nao atualiza. O campo que aceita um codigo com o simbolo errado e
/// recebe 400 esta correto; o erro chega pela resposta.
///
/// Ela tambem **nao normaliza `I`/`L`/`O`**. Quem digitar `O` ve `O` na tela, e o
/// servidor resolve para `0` -- transformar na tela faria o caractere pular sob
/// o dedo de quem digita, que e o tipo de correcao automatica que a pesquisa de
/// UX pediu para nao existir neste campo. A tolerancia do contrato continua
/// sendo do contrato.
///
/// ## Por que ela reescreve o valor inteiro a cada toque
///
/// Porque o alternativo -- inserir um hifen quando o tamanho bate -- quebra na
/// edicao no meio do texto e na colagem, que sao os dois caminhos reais: quem
/// tem o codigo numa mensagem cola, e quem digitou errado volta com o cursor.
/// Reescrever custa nada num texto de 19 caracteres e nao tem caso especial.
class MascaraDoCodigoDaTag extends TextInputFormatter {
  const MascaraDoCodigoDaTag();

  /// Os 32 simbolos do Crockford Base32 **mais** `I`, `L` e `O`, que o servidor
  /// substitui por `1`, `1` e `0`. Eles sao aceitos na digitacao exatamente
  /// porque o contrato os aceita, e a substituicao e dele.
  ///
  /// `U` fica de fora, e e o unico: ele nao tem substituicao e nunca vira
  /// codigo, entao deixa-lo entrar so adiaria o 400 ate a viagem de rede.
  static final RegExp _aceitos = RegExp('[0-9A-TV-Z]');

  /// 16 simbolos, em quatro grupos de quatro.
  static const int simbolos = 16;
  static const int tamanhoDoGrupo = 4;

  /// O tamanho da forma impressa: 16 simbolos mais 3 hifens.
  static const int tamanhoImpresso = simbolos + (simbolos ~/ tamanhoDoGrupo) - 1;

  /// Aplica a mascara a um texto qualquer. Exposta para teste e para quem
  /// precisar formatar um codigo ja conhecido.
  static String formatar(String bruto) {
    final buffer = StringBuffer();
    var escritos = 0;
    for (final caractere in bruto.toUpperCase().split('')) {
      if (!_aceitos.hasMatch(caractere)) continue;
      if (escritos == simbolos) break;
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

    // O cursor conta SIMBOLOS, e nao caracteres, e depois volta para a posicao
    // correspondente no texto com hifen. Sem isto, apagar o caractere logo
    // depois de um hifen joga o cursor para o fim do campo, e quem esta
    // corrigindo um erro de digitacao perde o lugar -- o defeito classico de
    // mascara feita sem olhar para o cursor.
    final simbolosAntesDoCursor = novo.text
        .substring(0, novo.selection.baseOffset.clamp(0, novo.text.length))
        .toUpperCase()
        .split('')
        .where(_aceitos.hasMatch)
        .length;

    var deslocamento = 0;
    var contados = 0;
    while (deslocamento < formatado.length && contados < simbolosAntesDoCursor) {
      if (formatado[deslocamento] != '-') contados += 1;
      deslocamento += 1;
    }
    // Um cursor parado logo depois de um grupo completo vai para DEPOIS do
    // hifen: o proximo caractere digitado entra no grupo seguinte, que e o que
    // a pessoa espera ver acontecer.
    if (deslocamento < formatado.length && formatado[deslocamento] == '-') {
      deslocamento += 1;
    }

    return TextEditingValue(
      text: formatado,
      selection: TextSelection.collapsed(offset: deslocamento),
    );
  }
}
