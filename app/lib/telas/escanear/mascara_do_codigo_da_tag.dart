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
/// ## ELA NAO CORTA NO 16o, E ISSO FOI UM DEFEITO DE CLIENTE
///
/// Ate 28/09 havia um `if (escritos == simbolos) break;` aqui, e um `continue`
/// para todo caractere fora do alfabeto tolerante. Os dois **descartavam
/// entrada em silencio**: quem colava um codigo de 26 simbolos -- a forma
/// antiga, que ainda existe impressa -- via o campo aceitar os 16 primeiros
/// como se fossem o codigo dele, e recebia do servidor uma recusa que nao
/// tinha relacao nenhuma com o que estava na tela. O cliente achou isso no
/// telefone, e a frase dele foi que o app "descartou sem avisar".
///
/// Agora ela guarda **todo simbolo alfanumerico** que chega, e formata em
/// grupos de quatro tantos quantos vierem: 26 simbolos ficam visiveis como 26.
/// Quem confere tamanho e alfabeto e `formaDoCodigoDeTag`, antes da chamada, e
/// a mensagem que a pessoa le diz o numero que ela digitou. **A mascara nunca
/// mais decide sozinha o que sobra do que a pessoa escreveu.**
///
/// O que ela continua descartando e o que **o servidor tambem descarta**, e so
/// isso: hifen, espaco, ponto e o resto da pontuacao. `normalizarCodigoDaTag`
/// abre com `replace(/[^0-9A-Za-z]/g, '')`, entao o campo e o contrato jogam
/// fora exatamente o mesmo conjunto, e o que sobra no campo e o que o servidor
/// vai ver. Separador nao e entrada perdida: e o formato da plaquinha.
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
  ///
  /// **Publica desde a BICHUS-54**, e nao por conveniencia: `codigo_lido_do_qr`
  /// precisa do MESMO alfabeto para decidir se um QR e do Bichu. Uma segunda
  /// copia do intervalo divergiria da mascara no dia em que um dos dois
  /// mudasse, e o sintoma seria o app recusar um codigo que ele acabou de
  /// aceitar no campo ao lado.
  static final RegExp aceitos = RegExp('[0-9A-TV-Z]');

  /// O que o campo **guarda**: todo digito e toda letra de A a Z, `U`
  /// incluido.
  ///
  /// E mais largo que [aceitos] de proposito, e a diferenca e a razao de ele
  /// existir. Enquanto a mascara filtrava por [aceitos], um `U` digitado
  /// **desaparecia sob o dedo** e uma conferencia de alfabeto no valor do
  /// campo nunca podia reprovar: o caractere que ela deveria acusar ja tinha
  /// sido apagado antes de ela olhar. Guardar o `U` e o que faz
  /// `formaDoCodigoDeTag` ter algo para dizer.
  ///
  /// E o MESMO conjunto que `normalizarCodigoDaTag` preserva no servidor
  /// (`[^0-9A-Za-z]` e o que ele joga fora). Duas regras que precisam ser
  /// iguais escritas nos dois lados e sempre um risco; escrever aqui a do
  /// servidor, e nao uma mais estreita, pelo menos garante que o campo nunca
  /// esconda um caractere que o servidor teria visto.
  static final RegExp mantidos = RegExp('[0-9A-Z]');

  /// 16 simbolos, em quatro grupos de quatro.
  static const int simbolos = 16;
  static const int tamanhoDoGrupo = 4;

  /// O tamanho da forma impressa: 16 simbolos mais 3 hifens.
  static const int tamanhoImpresso = simbolos + (simbolos ~/ tamanhoDoGrupo) - 1;

  /// Aplica a mascara a um texto qualquer. Exposta para teste e para quem
  /// precisar formatar um codigo ja conhecido.
  /// **Sem teto.** O `break` no 16o simbolo que morava aqui era o defeito do
  /// cliente: ele fazia o 17o em diante sumir sem nada na tela mudar. Um texto
  /// longo formata em grupos de quatro ate o fim, e a sobra fica **visivel**
  /// para quem digitou poder ve-la.
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

    // O cursor conta SIMBOLOS, e nao caracteres, e depois volta para a posicao
    // correspondente no texto com hifen. Sem isto, apagar o caractere logo
    // depois de um hifen joga o cursor para o fim do campo, e quem esta
    // corrigindo um erro de digitacao perde o lugar -- o defeito classico de
    // mascara feita sem olhar para o cursor.
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
