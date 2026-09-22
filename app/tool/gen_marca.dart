// Gerador do vetor da marca.
//
// Le os SVG de `design/marca/vetor/` **na raiz do repositorio** e escreve
// `lib/theme/marca_vetor.g.dart`.
//
// Rode a partir de `app/`:
//
//   dart run tool/gen_marca.dart
//
// MESMO ARRANJO DE `tool/gen_tokens.dart`, e pelo mesmo motivo: a marca tem
// uma fonte so, e ela nao mora dentro deste pacote. Copiar SVG para
// `app/assets/` criaria a segunda fonte da verdade que
// `docs/06-design-system.md` paragrafo 18.2.2 existe para impedir — e neste
// caso seria pior que nos tokens, porque um SVG copiado diverge sem nem mudar
// de tamanho.
//
// POR QUE GERADOR E NAO ASSET. O Flutter so empacota asset de dentro do
// pacote, entao consumir o SVG em tempo de execucao exigiria copia ou link
// simbolico. Link simbolico neste repositorio ja produziu uma suite inteira
// invisivel para `flutter test` (ver o adendo 2 do ponto de recuperacao). O
// gerador tem o efeito oposto: a divergencia vira diferenca de arquivo, e o
// portao `test/marca/vetor_da_marca_test.dart` regera e compara.
//
// NENHUMA COR E ESCRITA AQUI. O gerador le o hexadecimal que esta no SVG,
// procura o primitivo correspondente em `design/tokens.json` e emite o NOME do
// papel. Cor que nao for primitivo conhecido REPROVA a geracao — e assim que
// "trocaram a cor de um SVG da marca" deixa de ser silencioso.
library;

import 'dart:convert';
import 'dart:io';

/// Onde o gerador procura a raiz, em ordem.
const List<String> _candidatos = <String>['..', '.'];

/// Os SVG que o APP consome, e o piso de reducao de cada um.
///
/// O piso vem da secao 3.10 de `docs/06-design-system.md`, medido em
/// 17/09/2026 para o simbolo e em 21/09/2026 para a variante reduzida. Ele nao
/// e enfeite: `MarcaSimbolo` escolhe a variante por ele, entao a regua vira
/// codigo em vez de lembranca.
///
/// Os outros arquivos de `design/marca/vetor/` **nao entram no app de
/// proposito**, e o motivo de cada um esta em `design/marca/vetor/README.md`.
/// Eles continuam cobertos pelo portao, que le a pasta inteira.
const Map<String, ({String campo, double pisoPx})> _consumidos =
    <String, ({String campo, double pisoPx})>{
  'simbolo.svg': (campo: 'simbolo', pisoPx: 48),
  'simbolo-reduzido.svg': (campo: 'simboloReduzido', pisoPx: 24),
  'lockup-sem-descritor.svg': (campo: 'lockupSemDescritor', pisoPx: 120),
};

/// De `id` do grupo no SVG para o papel de cor do sistema.
///
/// `manteiga` cai num papel **nunca-texto** (`action-fill`), e o nome feio
/// viaja junto ate o ponto de uso de proposito: ver `BichuColors`. A lingua e
/// os brilhos da marca sao a unica excecao registrada da trava A, e ela esta
/// no paragrafo 4 de `design/marca/README.md`.
const Map<String, ({String primitivo, String papel})> _camadas =
    <String, ({String primitivo, String papel})>{
  'tinta': (primitivo: 'raspberry.700', papel: 'primary'),
  'manteiga': (primitivo: 'butter.400', papel: 'actionFillRawDoNotUseAsText'),
  'verde': (primitivo: 'sage.300', papel: 'communityFillRawDoNotUseAsText'),
};

const String _cabecalho = '''
// GERADO POR app/tool/gen_marca.dart A PARTIR DE design/marca/vetor/*.svg — NÃO EDITE.
//
// Para mudar a marca, mude o SVG na raiz do repositório e rode, de dentro de app/:
//   dart run tool/gen_marca.dart
//
// ignore_for_file: lines_longer_than_80_chars
''';

void main() {
  final raiz = _raiz();
  final tokens =
      jsonDecode(File('$raiz/design/tokens.json').readAsStringSync())
          as Map<String, dynamic>;

  final buffer = StringBuffer(_cabecalho)
    ..writeln()
    ..writeln("/// Uma camada de cor de um vetor da marca.")
    ..writeln('///')
    ..writeln('/// [papel] é o nome do papel em `BichuCores`, nunca um valor de cor:')
    ..writeln('/// quem pinta resolve pelo tema. [d] é o atributo `d` do SVG de origem,')
    ..writeln('/// com os comandos `M`, `C` e `Z` — os únicos que o derivador emite.')
    ..writeln('class CamadaDaMarca {')
    ..writeln('  const CamadaDaMarca(this.papel, this.d);')
    ..writeln()
    ..writeln('  final String papel;')
    ..writeln('  final String d;')
    ..writeln('}')
    ..writeln()
    ..writeln('/// Um vetor da marca, como o SVG de origem o declara.')
    ..writeln('class VetorDaMarca {')
    ..writeln('  const VetorDaMarca({')
    ..writeln('    required this.arquivo,')
    ..writeln('    required this.origemX,')
    ..writeln('    required this.origemY,')
    ..writeln('    required this.largura,')
    ..writeln('    required this.altura,')
    ..writeln('    required this.pisoPx,')
    ..writeln('    required this.camadas,')
    ..writeln('  });')
    ..writeln()
    ..writeln('  /// O nome do arquivo em `design/marca/vetor/`.')
    ..writeln('  final String arquivo;')
    ..writeln()
    ..writeln('  /// Canto superior esquerdo do `viewBox`. Não é sempre a origem:')
    ..writeln('  /// a variante reduzida foi reemoldurada e nasce em coordenada negativa.')
    ..writeln('  final double origemX;')
    ..writeln('  final double origemY;')
    ..writeln()
    ..writeln('  /// Largura e altura do `viewBox`.')
    ..writeln('  final double largura;')
    ..writeln('  final double altura;')
    ..writeln()
    ..writeln('  /// Piso de redução da §3.10 do design system, na maior dimensão.')
    ..writeln('  final double pisoPx;')
    ..writeln()
    ..writeln('  final List<CamadaDaMarca> camadas;')
    ..writeln('}')
    ..writeln()
    ..writeln('/// Os vetores da marca que o app consome.')
    ..writeln('abstract final class MarcaVetor {');

  for (final entrada in _consumidos.entries) {
    final caminho = '$raiz/design/marca/vetor/${entrada.key}';
    final arquivo = File(caminho);
    if (!arquivo.existsSync()) {
      throw StateError(
        'REPROVA: $caminho não existe. O app consome este arquivo; gerador '
        'que não acha a arte para, não emite marca em branco.',
      );
    }
    final svg = arquivo.readAsStringSync();
    _recusaFonteViva(entrada.key, svg);

    final vb = RegExp(r'viewBox="([^"]*)"').firstMatch(svg);
    if (vb == null) {
      throw StateError('REPROVA: ${entrada.key} não tem viewBox.');
    }
    final nums = RegExp(r'-?\d+(?:\.\d+)?')
        .allMatches(vb.group(1)!)
        .map((m) => double.parse(m.group(0)!))
        .toList();
    if (nums.length != 4) {
      throw StateError('REPROVA: viewBox de ${entrada.key} não tem 4 números.');
    }

    buffer
      ..writeln()
      ..writeln('  static const VetorDaMarca ${entrada.value.campo} = VetorDaMarca(')
      ..writeln("    arquivo: '${entrada.key}',")
      ..writeln('    origemX: ${_dart(nums[0])},')
      ..writeln('    origemY: ${_dart(nums[1])},')
      ..writeln('    largura: ${_dart(nums[2])},')
      ..writeln('    altura: ${_dart(nums[3])},')
      ..writeln('    pisoPx: ${_dart(entrada.value.pisoPx)},')
      ..writeln('    camadas: <CamadaDaMarca>[');

    final grupos =
        RegExp(r'<g id="([^"]+)"[^>]*fill="([^"]+)"[^>]*>(.*?)</g>', dotAll: true)
            .allMatches(svg);
    if (grupos.isEmpty) {
      throw StateError('REPROVA: ${entrada.key} não tem nenhum grupo com fill.');
    }
    for (final g in grupos) {
      final id = g.group(1)!;
      final cor = g.group(2)!.toUpperCase();
      final camada = _camadas[id];
      if (camada == null) {
        throw StateError(
          'REPROVA: ${entrada.key} tem a camada "$id", que não está no mapa de '
          'papéis deste gerador. Camada nova da marca é decisão de quem desenha, '
          'não invenção do gerador.',
        );
      }
      final esperado = _primitivo(tokens, camada.primitivo);
      if (cor != esperado) {
        throw StateError(
          'REPROVA: a camada "$id" de ${entrada.key} está em $cor e o token '
          '${camada.primitivo} vale $esperado. Ou o SVG saiu da cor da marca, ou '
          'ele foi gerado antes da troca de semente e ninguém rodou o derivador.',
        );
      }
      final d = RegExp(r'd="([^"]*)"').firstMatch(g.group(3)!);
      if (d == null) {
        throw StateError('REPROVA: a camada "$id" de ${entrada.key} não tem path.');
      }
      buffer.writeln("      CamadaDaMarca('${camada.papel}', '${d.group(1)!}'),");
    }
    buffer
      ..writeln('    ],')
      ..writeln('  );');
  }

  buffer.writeln('}');

  File('lib/theme/marca_vetor.g.dart').writeAsStringSync(buffer.toString());
  stdout.writeln(
    'lib/theme/marca_vetor.g.dart: ${_consumidos.length} vetores '
    '(${_consumidos.keys.join(', ')}).',
  );
}

void _recusaFonteViva(String nome, String svg) {
  final vivo = RegExp(r'<(text|tspan)\b|font-family').firstMatch(svg);
  if (vivo != null) {
    throw StateError(
      'REPROVA: $nome carrega fonte viva ("${vivo.group(0)}"). O logotipo é '
      'curva convertida (§8.4 do design system); SVG com texto vira outra letra '
      'na máquina que não tem a fonte, e ninguém percebe.',
    );
  }
}

String _primitivo(Map<String, dynamic> tokens, String caminho) {
  Object? no = tokens;
  for (final chave in caminho.split('.')) {
    if (no is! Map<String, dynamic> || !no.containsKey(chave)) {
      throw StateError('REPROVA: token $caminho não existe em design/tokens.json.');
    }
    no = no[chave];
  }
  final valor = (no! as Map<String, dynamic>)[r'$value'];
  if (valor is! String || !RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(valor)) {
    throw StateError('REPROVA: token $caminho vale $valor, que não é hex de 6 dígitos.');
  }
  return valor.toUpperCase();
}

String _raiz() {
  for (final c in _candidatos) {
    if (File('$c/design/tokens.json').existsSync() &&
        Directory('$c/design/marca/vetor').existsSync()) {
      return c;
    }
  }
  throw StateError(
    'REPROVA: não achei design/tokens.json + design/marca/vetor/ a partir de '
    '${Directory.current.path}. Rode de dentro de app/.',
  );
}

String _dart(double v) => v == v.roundToDouble() ? '${v.toInt()}.0' : '$v';
