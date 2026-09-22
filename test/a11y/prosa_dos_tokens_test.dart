// O portao da PROSA de design/tokens.json.
//
// POR QUE ELE EXISTE. Em 21/09/2026 a tinta da marca passou da Framboesa
// `#922C4A` para o Carmim `#9E0B3A`. Os VALORES viraram no mesmo commit e o
// portao de contraste conferiu os 70 pares. A PROSA nao virou: o `$description`
// de `cor.claro.primary` continuou dizendo "Framboesa. A tinta.", e o do grupo
// `cor` continuou dizendo "primary (framboesa) e a tinta", com a esteira verde o
// tempo inteiro -- nenhum teste le texto. Quem abria o arquivo lia o nome de uma
// marca que tinha saido, ao lado do hex da que tinha entrado.
//
// E o mesmo arquivo carregava uma garantia falsa: "nenhum codigo Dart escreve
// cor a mao". Escreviam SEIS pontos, todos legitimos (visor da camera e QR), e
// foi justamente a negacao que os deixou fora de qualquer lista -- ninguem
// inventaria o que a documentacao jura nao existir.
//
// O QUE ELE CONFERE.
//   1. Nome de marca aposentada em `$description` SEM data. "Framboesa" solto
//      numa frase e o defeito; "era a Framboesa ate 21/09/2026" e registro
//      legitimo. A regra e mecanica: a mesma descricao precisa carregar uma
//      data `dd/mm/aaaa`.
//   2. Hex de marca aposentada como `$value` em qualquer lugar do arquivo.
//   3. O numero de pontos de Dart que escrevem cor a mao, declarado na prosa da
//      raiz, contra a contagem real em `app/lib/` fora de `theme/`. Divergiu, o
//      portao nomeia os arquivos e as linhas.
//   4. Que esses pontos sejam mesmo da classe funcional: preto ou branco puros.
//      Um hex de marca escrito a mao no Dart reprova nomeando o arquivo.
//
// O QUE ELE NAO CONFERE, dito em voz alta para ninguem confiar demais:
// `docs/06-design-system.md`. O documento esta FORA do repositorio por decisao
// do cliente de 17/09/2026, o `actions/checkout` nao o traz, e portanto NENHUM
// portao da esteira alcanca a prosa dele -- nem este. O paragrafo 7 tem o seu
// (`documento_secao7_test.dart`), e mesmo aquele so roda porque uma dispensa
// datada segura a ausencia do arquivo. As 64 mencoes historicas a "Framboesa"
// que restaram no documento sao protegidas por convencao escrita no cabecalho
// dele, nao por codigo. Isso e uma promessa, nao um portao, e esta dito aqui
// para que ninguem conte o contrario. (BICHUS-193.)
//
// Este arquivo, ao contrario, roda de verdade: `design/tokens.json` e `app/lib/`
// sao versionados, o job `contraste` chama `flutter test test/a11y` por caminho
// explicito e a ponte `app/test/a11y_suite_test.dart` o poe no `flutter test`
// puro.

library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'tokens.dart';

/// Raiz do repositorio: a pasta que contem `design/`.
Directory _raiz() => diretorioDesign().parent;

/// Nomes e valores de marca que ja saíram. Mencao a qualquer um deles em
/// `$description` exige data na mesma descricao.
const Map<String, String> _aposentados = <String, String>{
  'framboesa': 'a tinta de 17/09 a 21/09/2026, substituida pelo Carmim #9E0B3A',
  '#922c4a': 'o hex da Framboesa',
  'ambar': 'a semente de ate 17/09/2026',
  '#ffc400': 'o hex do ambar',
};

/// Hex que nao podem mais ser `$value` de token nenhum.
const List<String> _hexAposentados = <String>['#922c4a', '#ffc400'];

/// `dd/mm/aaaa`. E o unico formato de data que este documento usa.
final RegExp _data = RegExp(r'\b\d{2}/\d{2}/\d{4}\b');

/// Cor escrita a mao no Dart: `Color(0xAARRGGBB)`.
final RegExp _corNoDart = RegExp(r'Color\(0x([0-9A-Fa-f]{8})\)');

/// Os unicos valores que a classe "cor por funcao optica" admite: os extremos
/// da escala (paragrafo 19.5 de docs/06-design-system.md). Qualquer outro hex
/// escrito a mao e cor de estilo disfarcada.
const Set<String> _funcionais = <String>{'FF000000', 'FFFFFFFF'};

/// Quantos pontos de Dart a prosa da raiz declara.
final RegExp _declaracao = RegExp(
  r'\b(UM|DOIS|TRES|QUATRO|CINCO|SEIS|SETE|OITO|NOVE|DEZ|\d+) pontos? de Dart escrevem cor a mao',
  caseSensitive: false,
);

const Map<String, int> _porExtenso = <String, int>{
  'um': 1, 'dois': 2, 'tres': 3, 'quatro': 4, 'cinco': 5,
  'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10,
};

// ---------------------------------------------------------------------------

/// Percorre o JSON e devolve `caminho -> $description`.
Map<String, String> _descricoes(Object? no, [String caminho = '']) {
  final saida = <String, String>{};
  if (no is Map) {
    for (final entrada in no.entries) {
      final chave = entrada.key.toString();
      final filho = '$caminho${caminho.isEmpty ? '' : '.'}$chave';
      if (chave == r'$description' && entrada.value is String) {
        saida[caminho.isEmpty ? '(raiz)' : caminho] = entrada.value as String;
      } else {
        saida.addAll(_descricoes(entrada.value, filho));
      }
    }
  }
  return saida;
}

/// Percorre o JSON e devolve `caminho -> $value` (so os literais de texto).
Map<String, String> _valores(Object? no, [String caminho = '']) {
  final saida = <String, String>{};
  if (no is Map) {
    for (final entrada in no.entries) {
      final chave = entrada.key.toString();
      final filho = '$caminho${caminho.isEmpty ? '' : '.'}$chave';
      if (chave == r'$value' && entrada.value is String) {
        saida[caminho] = entrada.value as String;
      } else {
        saida.addAll(_valores(entrada.value, filho));
      }
    }
  }
  return saida;
}

/// Os `.dart` de `app/lib/` que NAO estao em `theme/` (onde vive o gerado).
List<File> _fontesDeTela(Directory libDir) => libDir
    .listSync(recursive: true)
    .whereType<File>()
    .where((f) => f.path.endsWith('.dart'))
    .where((f) => !f.path.contains('${Platform.pathSeparator}theme${Platform.pathSeparator}'))
    .toList()
  ..sort((a, b) => a.path.compareTo(b.path));

class _PontoDeCor {
  _PontoDeCor(this.arquivo, this.linha, this.valor);
  final String arquivo;
  final int linha;
  final String valor;
  @override
  String toString() => '$arquivo:$linha  Color(0x$valor)';
}

List<_PontoDeCor> _pontosDeCor(Directory raiz) {
  final libDir = Directory('${raiz.path}/app/lib');
  if (!libDir.existsSync()) {
    fail(
      'REPROVA: nao achei app/lib a partir de "${raiz.path}". Sem o codigo do '
      'app este portao nao tem o que contar, e portao que nao consegue '
      'verificar reprova, nunca aprova por ausencia.',
    );
  }
  final achados = <_PontoDeCor>[];
  for (final arquivo in _fontesDeTela(libDir)) {
    final relativo = arquivo.path.substring(raiz.path.length + 1);
    final linhas = arquivo.readAsLinesSync();
    for (var i = 0; i < linhas.length; i++) {
      for (final m in _corNoDart.allMatches(linhas[i])) {
        achados.add(_PontoDeCor(relativo, i + 1, m.group(1)!.toUpperCase()));
      }
    }
  }
  return achados;
}

void main() {
  late Map<String, Object?> json;
  late String bruto;
  late Directory raiz;

  setUpAll(() {
    raiz = _raiz();
    final arquivo = File('${raiz.path}/design/tokens.json');
    if (!arquivo.existsSync()) {
      fail(
        'REPROVA: design/tokens.json nao existe em "${raiz.path}". '
        'Este portao le a fonte unica dos tokens; sem ela nao ha o que conferir.',
      );
    }
    bruto = arquivo.readAsStringSync();
    json = jsonDecode(bruto) as Map<String, Object?>;
  });

  test('1. nenhuma marca aposentada e citada sem data na mesma descricao', () {
    final faltando = <String>[];
    _descricoes(json).forEach((caminho, texto) {
      final minusculo = texto.toLowerCase();
      final citados = _aposentados.keys.where(minusculo.contains).toList();
      if (citados.isEmpty) return;
      if (_data.hasMatch(texto)) return;
      faltando.add(
        '  $caminho\n'
        '    cita ${citados.join(', ')} e nao traz nenhuma data dd/mm/aaaa\n'
        '    texto: "${texto.length > 180 ? '${texto.substring(0, 180)}...' : texto}"',
      );
    });

    expect(
      faltando,
      isEmpty,
      reason:
          'REPROVA: descricao de token cita uma marca aposentada como se fosse '
          'a de hoje.\n\n${faltando.join('\n\n')}\n\n'
          'A tinta em vigor e o CARMIM #9E0B3A (raspberry.700), desde '
          '21/09/2026. Mencao historica e legitima e deve ficar -- mas datada, '
          'porque foi exatamente "Framboesa" solto numa frase que fez o design '
          'system descrever duas marcas ao mesmo tempo (BICHUS-192, BICHUS-193). '
          'Escreva "era a Framboesa #922C4A ate 21/09/2026", nao "Framboesa".',
    );
  });

  test('2. nenhum hex de marca aposentada sobrou como valor de token', () {
    final vivos = <String>[];
    _valores(json).forEach((caminho, valor) {
      if (_hexAposentados.contains(valor.toLowerCase())) {
        vivos.add('  $caminho = $valor');
      }
    });
    expect(
      vivos,
      isEmpty,
      reason:
          'REPROVA: hex de uma marca que saiu ainda e valor de token.\n'
          '${vivos.join('\n')}\n'
          'A rampa da marca e o CARMIM: raspberry.700 = #9E0B3A.',
    );
  });

  test('3. a prosa declara quantos pontos de Dart escrevem cor a mao, e acerta',
      () {
    final descricaoDaRaiz = (json[r'$description'] as String?) ?? '';
    final m = _declaracao.firstMatch(descricaoDaRaiz);

    if (m == null) {
      fail(
        'REPROVA: a descricao da raiz de design/tokens.json nao declara quantos '
        'pontos de Dart escrevem cor a mao.\n'
        'Ela ja afirmou o contrario -- "nenhum codigo Dart escreve cor a mao" -- '
        'e era falso: existiam seis, todos legitimos, e a negacao foi o que os '
        'deixou fora de qualquer inventario. Declare o numero, na forma '
        '"<N> pontos de Dart escrevem cor a mao", e mantenha-o verdadeiro. '
        'Este portao conta os pontos de verdade e compara.',
      );
    }

    final bruto = m.group(1)!.toLowerCase();
    final declarado = _porExtenso[bruto] ?? int.parse(bruto);
    final reais = _pontosDeCor(raiz);

    expect(
      reais.length,
      declarado,
      reason:
          'REPROVA: design/tokens.json declara $declarado ponto(s) de Dart que '
          'escrevem cor a mao, e app/lib/ (fora de theme/) tem '
          '${reais.length}.\n'
          'Encontrados:\n${reais.join('\n')}\n\n'
          'Se um ponto novo e legitimo -- cor por funcao optica, do paragrafo '
          '19.5 -- acrescente-o a prosa e ao paragrafo 19.5.1, com a razao '
          'fisica. Se nao e, use um token. O que nao pode e a documentacao '
          'dizer um numero e o codigo ter outro: foi assim que a frase '
          '"nenhum codigo Dart escreve cor a mao" sobreviveu falsa.',
    );
  });

  test('4. todo ponto de cor a mao no Dart e preto ou branco puro (funcional)',
      () {
    final fora = _pontosDeCor(raiz)
        .where((p) => !_funcionais.contains(p.valor))
        .toList();
    expect(
      fora,
      isEmpty,
      reason:
          'REPROVA: cor escrita a mao no Dart que nao e preto nem branco puro.\n'
          '${fora.join('\n')}\n\n'
          'A unica cor que pode escapar dos tokens e a de FUNCAO OPTICA '
          '(paragrafo 19.5): valor fixado por um leitor de maquina ou por uma '
          'condicao fisica, e por isso imune a troca de paleta -- os modulos e '
          'a zona de silencio do QR, e o fundo do visor da camera. Sao os '
          'extremos da escala, nunca um tom. Qualquer outro hex a mao e cor de '
          'estilo com desculpa: use o token.',
    );
  });
}
