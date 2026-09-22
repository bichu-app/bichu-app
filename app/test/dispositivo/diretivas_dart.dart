// O leitor de diretivas `import` e `export` que o portao estrutural de
// `porta_nao_contornada_test.dart` usa para decidir o que uma tela importa.
//
// POR QUE ISTO EXISTE, e nao um `fonte.contains("import '")`:
//
// O portao anterior casava a string literal `import '`, com aspa SIMPLES. O
// Dart aceita a mesma diretiva escrita de pelo menos nove formas diferentes, e
// oito delas passavam verdes:
//
//     import "package:image_picker/image_picker.dart";      // aspa dupla
//     import r'package:image_picker/image_picker.dart';     // string crua
//     import """package:image_picker/image_picker.dart"""// aspa tripla
//     import                                                // quebra de linha
//         'package:image_picker/image_picker.dart';
//     import /* nota */ 'package:image_picker/...';         // comentario no meio
//     import 'package:' 'image_picker/image_picker.dart';   // literais adjacentes
//     import 'package:image_picker/...';               // escape unicode
//     import 'x.dart' if (dart.library.io)                  // import condicional
//         "package:image_picker/image_picker.dart";
//
// Nenhuma delas e exotica o bastante para ser "ma-fe": a aspa dupla e o padrao
// de quem vem de outra linguagem, e o `prefer_single_quotes` estava comentado
// no `analysis_options.yaml`, entao o `flutter analyze` tambem ficava calado.
// Um portao que so pega uma das formas nao pega nada -- ele so parece pegar.
//
// A saida NAO foi ligar o lint e continuar casando texto. Um portao que depende
// de outra regra continuar ligada e um portao com duas maneiras de morrer, e a
// segunda e silenciosa. Este leitor percorre o fonte como o analisador
// percorre: pula comentario, entende literal, e resolve a URI. O lint foi
// ligado tambem, mas como cinto, nao como freio -- se alguem o desligar amanha,
// este arquivo continua enxergando igual.
//
// O QUE ELE NAO FAZ: nao e um analisador de Dart. Ele nao resolve macro, nao
// avalia expressao e nao entende `part`. Ele enxerga diretiva e literal, que e
// exatamente o que o portao precisa decidir.

/// Uma diretiva `import` ou `export` encontrada no fonte, ja com a URI
/// resolvida -- sem aspas, com os escapes decodificados e com os literais
/// adjacentes concatenados.
class DiretivaDart {
  const DiretivaDart({
    required this.palavra,
    required this.uri,
    required this.linha,
  });

  /// `import` ou `export`.
  final String palavra;

  /// A URI como o Dart a enxerga: `package:image_picker/image_picker.dart`.
  final String uri;

  /// A linha (base 1) em que a palavra-chave aparece.
  final int linha;

  @override
  String toString() => '$palavra "$uri" (linha $linha)';
}

/// Le todas as diretivas `import` e `export` de um fonte Dart.
///
/// Um `import` condicional devolve **uma entrada por URI**, porque qualquer uma
/// delas pode ser a que o build escolhe.
List<DiretivaDart> lerDiretivas(String fonte) {
  final achados = <DiretivaDart>[];
  final n = fonte.length;
  var i = 0;

  while (i < n) {
    i = _pularVazio(fonte, i);
    if (i >= n) break;

    // Literal solto: consumir inteiro, para que um `import` escrito DENTRO de
    // uma string (um exemplo em documentacao, por exemplo) nao seja lido como
    // diretiva.
    final solto = _lerLiteral(fonte, i);
    if (solto != null) {
      i = solto.fim;
      continue;
    }

    if (!_inicioDeIdentificador(fonte.codeUnitAt(i))) {
      i++;
      continue;
    }

    final inicioDaPalavra = i;
    while (i < n && _corpoDeIdentificador(fonte.codeUnitAt(i))) {
      i++;
    }
    final palavra = fonte.substring(inicioDaPalavra, i);
    if (palavra != 'import' && palavra != 'export') continue;

    // Varre ate o `;`, recolhendo todo literal do caminho. Literais adjacentes
    // (`'a' 'b'`) sao um so; literais separados por outro token (o caso do
    // `import` condicional) sao URIs diferentes.
    final linha = _linhaEm(fonte, inicioDaPalavra);
    final uri = StringBuffer();
    var temUri = false;
    var j = i;

    while (j < n) {
      j = _pularVazio(fonte, j);
      if (j >= n) break;
      if (fonte.codeUnitAt(j) == 0x3b) {
        j++;
        break;
      }

      final parte = _lerLiteral(fonte, j);
      if (parte != null) {
        uri.write(parte.valor);
        temUri = true;
        j = parte.fim;

        final proximo = _pularVazio(fonte, j);
        if (proximo < n && _lerLiteral(fonte, proximo) != null) {
          j = proximo;
          continue; // literal adjacente: mesma URI
        }
        achados.add(
          DiretivaDart(palavra: palavra, uri: uri.toString(), linha: linha),
        );
        uri.clear();
        temUri = false;
        continue;
      }

      if (_inicioDeIdentificador(fonte.codeUnitAt(j))) {
        while (j < n && _corpoDeIdentificador(fonte.codeUnitAt(j))) {
          j++;
        }
      } else {
        j++;
      }
    }

    if (temUri) {
      achados.add(
        DiretivaDart(palavra: palavra, uri: uri.toString(), linha: linha),
      );
    }
    i = j;
  }

  return achados;
}

/// Devolve o fonte com os comentarios removidos e os literais preservados.
///
/// Serve a rede de seguranca do portao: uma referencia a plugin de aparelho que
/// nao esteja numa diretiva (uma constante, um `loadLibrary` adiado) continua
/// aparecendo, enquanto uma MENCAO EM PROSA -- "esta tela nao importa
/// package:image_picker de proposito" -- deixa de reprovar por engano.
String semComentarios(String fonte) {
  final saida = StringBuffer();
  final n = fonte.length;
  var i = 0;

  while (i < n) {
    final depois = _pularVazio(fonte, i);
    if (depois != i) {
      saida.write(' ');
      i = depois;
      continue;
    }
    final literal = _lerLiteral(fonte, i);
    if (literal != null) {
      saida.write(fonte.substring(i, literal.fim));
      i = literal.fim;
      continue;
    }
    saida.writeCharCode(fonte.codeUnitAt(i));
    i++;
  }

  return saida.toString();
}

// ---------------------------------------------------------------------------
// As pecas
// ---------------------------------------------------------------------------

class _Literal {
  const _Literal(this.valor, this.fim);
  final String valor;
  final int fim;
}

int _linhaEm(String fonte, int posicao) {
  var linha = 1;
  for (var k = 0; k < posicao; k++) {
    if (fonte.codeUnitAt(k) == 0x0a) linha++;
  }
  return linha;
}

bool _inicioDeIdentificador(int u) =>
    (u >= 0x41 && u <= 0x5a) ||
    (u >= 0x61 && u <= 0x7a) ||
    u == 0x5f ||
    u == 0x24;

bool _corpoDeIdentificador(int u) =>
    _inicioDeIdentificador(u) || (u >= 0x30 && u <= 0x39);

/// Pula espaco, quebra de linha, comentario de linha e comentario de bloco.
/// O comentario de bloco do Dart **aninha**, e isto respeita isso.
int _pularVazio(String fonte, int i) {
  final n = fonte.length;
  while (i < n) {
    final c = fonte.codeUnitAt(i);
    if (c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0d) {
      i++;
      continue;
    }
    if (c == 0x2f && i + 1 < n) {
      final d = fonte.codeUnitAt(i + 1);
      if (d == 0x2f) {
        while (i < n && fonte.codeUnitAt(i) != 0x0a) {
          i++;
        }
        continue;
      }
      if (d == 0x2a) {
        var profundidade = 1;
        i += 2;
        while (i < n && profundidade > 0) {
          if (i + 1 < n &&
              fonte.codeUnitAt(i) == 0x2f &&
              fonte.codeUnitAt(i + 1) == 0x2a) {
            profundidade++;
            i += 2;
            continue;
          }
          if (i + 1 < n &&
              fonte.codeUnitAt(i) == 0x2a &&
              fonte.codeUnitAt(i + 1) == 0x2f) {
            profundidade--;
            i += 2;
            continue;
          }
          i++;
        }
        continue;
      }
    }
    break;
  }
  return i;
}

/// Le um literal de string em `i`, em qualquer das formas que o Dart aceita.
/// Devolve `null` quando `i` nao comeca um literal.
_Literal? _lerLiteral(String fonte, int i) {
  final n = fonte.length;
  if (i >= n) return null;

  var cru = false;
  if (fonte.codeUnitAt(i) == 0x72 && i + 1 < n) {
    final prox = fonte[i + 1];
    if (prox == "'" || prox == '"') {
      cru = true;
      i++;
    }
  }
  if (i >= n) return null;

  final aspa = fonte[i];
  if (aspa != "'" && aspa != '"') return null;

  final tripla = aspa * 3;
  final fechamento = fonte.startsWith(tripla, i) ? tripla : aspa;

  var j = i + fechamento.length;
  final valor = StringBuffer();

  while (j < n) {
    if (fonte.startsWith(fechamento, j)) {
      return _Literal(valor.toString(), j + fechamento.length);
    }
    if (!cru && fonte.codeUnitAt(j) == 0x5c && j + 1 < n) {
      final lido = _lerEscape(fonte, j);
      valor.write(lido.valor);
      j = lido.fim;
      continue;
    }
    valor.write(fonte[j]);
    j++;
  }

  // Literal sem fechamento: fonte invalido. Devolver o que se leu e melhor que
  // devolver `null`, porque `null` faria a diretiva sumir do relatorio -- e
  // portao que perde o que conferir precisa reprovar, nunca ficar calado.
  return _Literal(valor.toString(), n);
}

/// Decodifica uma sequencia de escape a partir da contrabarra em `i`.
_Literal _lerEscape(String fonte, int i) {
  final n = fonte.length;
  final c = fonte[i + 1];

  if (c == 'u') {
    if (i + 2 < n && fonte[i + 2] == '{') {
      final fim = fonte.indexOf('}', i + 3);
      if (fim > 0) {
        final ponto = int.tryParse(fonte.substring(i + 3, fim), radix: 16);
        if (ponto != null) {
          return _Literal(String.fromCharCode(ponto), fim + 1);
        }
      }
    } else if (i + 6 <= n) {
      final ponto = int.tryParse(fonte.substring(i + 2, i + 6), radix: 16);
      if (ponto != null) {
        return _Literal(String.fromCharCode(ponto), i + 6);
      }
    }
  }

  if (c == 'x' && i + 4 <= n) {
    final ponto = int.tryParse(fonte.substring(i + 2, i + 4), radix: 16);
    if (ponto != null) {
      return _Literal(String.fromCharCode(ponto), i + 4);
    }
  }

  const simples = <String, String>{
    'n': '\n',
    'r': '\r',
    't': '\t',
    'b': '\b',
    'f': '\f',
    'v': '\v',
    '0': ' ',
  };
  return _Literal(simples[c] ?? c, i + 2);
}
