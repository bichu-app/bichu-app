// Fecha, no iOS, os dois buracos que `flutter_native_splash:create` deixa
// abertos. Rode SEMPRE logo depois dele, a partir de `app/`:
//
//   dart run flutter_native_splash:create
//   dart run tool/corrigir_splash_ios.dart
//
// E idempotente: rodar duas vezes nao muda nada na segunda.
//
// ---------------------------------------------------------------------------
// BURACO 1 — o PNG do fundo sai SEM perfil de cor, e o iOS o le como P3
// ---------------------------------------------------------------------------
//
// `flutter_native_splash` 2.4.8 escreve o fundo do splash como bitmap de 1x1
// (`lib/ios.dart`, `Image(width: 1, height: 1)` + `encodePng`). O `encodePng`
// do pacote `image` nao emite nenhum chunk de espaco de cor: o arquivo sai com
// `IHDR`, `IDAT` e `IEND` e mais nada.
//
// Sem `sRGB`, `iCCP` ou `cHRM`, o catalogo de assets do Xcode assume que os
// componentes ja estao no gamut do display, que no iPhone e **Display P3**. O
// sistema entao converte P3 -> sRGB para exibir, e a cor sai deslocada:
//
//   P3(#9E0B3A) convertido para sRGB = #AD0038
//
// Foi exatamente isso que se mediu no simulador (iPhone 18 Pro, iOS 27) em
// 21/09/2026: o quadro da launch screen NATIVA media `#AD0038` e o quadro
// seguinte, ja da superficie Flutter e com a mesma arte, media a cor da marca.
// Dois quadros consecutivos da mesma abertura, cores diferentes.
//
// O conserto e declarar o espaco de cor: este arquivo carimba `sRGB`, `gAMA` e
// `cHRM` logo depois do `IHDR`, como a secao 11.3.3.5 da ISO/IEC 15948 manda
// (quem escreve `sRGB` deve escrever tambem `gAMA` e `cHRM` equivalentes, para
// o decodificador que nao entende `sRGB`).
//
// Vale para TODOS os PNG do catalogo, nao so o do splash: o icone da loja
// sofria do mesmo desvio, pelo mesmo motivo.
//
// ---------------------------------------------------------------------------
// BURACO 2 — o `backgroundColor` do storyboard nasce BRANCO
// ---------------------------------------------------------------------------
//
// O template do pacote (`lib/templates.dart`, linha 130) fixa
// `red="1" green="1" blue="1"`. Hoje isso e inerte, porque o `imageView` de
// `LaunchBackground` esta presilhado nas quatro bordas por cima. Mas basta
// alguem remover o imageView, ou UMA das quatro constraints, para a splash do
// iOS ficar branca -- e nenhum portao acusaria, porque o valor esta escrito e
// nao ha nada errado com ele do ponto de vista de XML.
//
// Este arquivo troca o branco pela semente. E defesa em profundidade: o
// caminho primario continua sendo o PNG.
//
// Padroes: PNG e ISO/IEC 15948. A semente sai de `design/tokens.json`
// (`raspberry.700`), que e a fonte unica do paragrafo 18.2.2 do design system
// -- este arquivo NAO tem hexadecimal de marca escrito dentro dele.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

/// Onde o gerador procura a fonte dos tokens, em ordem. Mesma lista de
/// `tool/gen_tokens.dart`.
const List<String> _candidatosDeTokens = <String>[
  '../design/tokens.json',
  'design/tokens.json',
];

const String _catalogo = 'ios/Runner/Assets.xcassets';
const String _storyboard = 'ios/Runner/Base.lproj/LaunchScreen.storyboard';

/// Assinatura de um arquivo PNG (ISO/IEC 15948, secao 5.2).
const List<int> _assinaturaPng = <int>[137, 80, 78, 71, 13, 10, 26, 10];

/// Chunks que declaram espaco de cor. Qualquer um deles tira o arquivo do
/// caminho em que o Xcode adivinha o gamut do display.
const Set<String> _chunksDePerfil = <String>{'iCCP', 'sRGB', 'cHRM'};

/// Intencao de renderizacao do chunk `sRGB`: 0 = Perceptual.
///
/// Para cor chapada de marca as quatro intencoes dao o mesmo resultado, ja que
/// origem e destino sao o mesmo espaco. O 0 e o que libpng e o Preview do
/// macOS escrevem, entao e o que menos surpreende quem abrir o arquivo.
const int _intencaoPerceptual = 0;

/// Gama de sRGB em 1/100000, como a secao 11.3.3.2 da norma exige.
const int _gamaSrgb = 45455;

/// Cromaticidades de sRGB em 1/100000 (branco D65, e os tres primarios),
/// na ordem que o chunk `cHRM` declara.
const List<int> _cromaticidadesSrgb = <int>[
  31270, 32900, // ponto branco
  64000, 33000, // vermelho
  30000, 60000, // verde
  15000, 6000, // azul
];

void main() {
  final int semente = _sementeDosTokens();

  final List<File> pngs = _pngsDoCatalogo();
  var carimbados = 0;
  for (final File f in pngs) {
    if (_carimbarPerfilSrgb(f)) {
      carimbados++;
      stdout.writeln('  sRGB+gAMA+cHRM -> ${f.path}');
    }
  }
  stdout.writeln(
    'perfil de cor: ${pngs.length} PNG no catalogo, '
    '$carimbados carimbados agora, ${pngs.length - carimbados} ja tinham.',
  );

  final bool mudou = _corrigirFundoDoStoryboard(semente);
  stdout.writeln(
    mudou
        ? 'storyboard: backgroundColor passou a ser ${_hex(semente)}.'
        : 'storyboard: backgroundColor ja era ${_hex(semente)}.',
  );
}

String _hex(int rgb) =>
    '#${rgb.toRadixString(16).toUpperCase().padLeft(6, '0')}';

/// Le `raspberry.700` de `design/tokens.json`.
///
/// Reprova alto quando nao acha ou nao entende: um gerador de cor que nao
/// resolve a cor precisa parar. Seguir com um valor inventado produziria arte
/// errada em silencio, que e o defeito que este arquivo existe para fechar.
int _sementeDosTokens() {
  for (final String caminho in _candidatosDeTokens) {
    final File f = File(caminho);
    if (!f.existsSync()) continue;
    final Object? json = jsonDecode(f.readAsStringSync());
    final Object? valor =
        (((json as Map)['raspberry'] as Map)['700'] as Map)[r'$value'];
    if (valor is! String || !RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(valor)) {
      throw StateError(
        'REPROVA: raspberry.700 em ${f.path} vale $valor, que nao e um '
        'hexadecimal de 6 digitos. A semente da marca e a unica entrada deste '
        'gerador.',
      );
    }
    return int.parse(valor.substring(1), radix: 16);
  }
  throw StateError(
    'REPROVA: nao achei design/tokens.json em $_candidatosDeTokens a partir de '
    '"${Directory.current.path}". Rode este gerador de dentro de app/.',
  );
}

/// Todos os PNG do catalogo de assets do iOS, descobertos por varredura.
///
/// A lista NAO e escrita a mao: o `flutter_launcher_icons` pode acrescentar
/// uma medida, e um gerador com lista fixa deixaria a nova sem perfil. O piso
/// existe para o caso oposto -- o catalogo sumir e isto ficar verde sem ter
/// carimbado nada.
List<File> _pngsDoCatalogo() {
  final Directory dir = Directory(_catalogo);
  if (!dir.existsSync()) {
    throw StateError(
      'REPROVA: nao achei $_catalogo a partir de "${Directory.current.path}". '
      'Rode este gerador de dentro de app/.',
    );
  }
  final List<File> achados = dir
      .listSync(recursive: true)
      .whereType<File>()
      .where((File f) => f.path.toLowerCase().endsWith('.png'))
      .toList()
    ..sort((File a, File b) => a.path.compareTo(b.path));
  if (achados.length < 20) {
    throw StateError(
      'REPROVA: achei so ${achados.length} PNG em $_catalogo. O catalogo tem o '
      'fundo do splash, a launch image e as medidas do icone -- mais de vinte '
      'arquivos. Gerador que encolhe sozinho termina verde tendo tocado em '
      'menos do que anuncia.',
    );
  }
  return achados;
}

/// Insere `sRGB`, `gAMA` e `cHRM` logo depois do `IHDR`, se ainda nao houver
/// declaracao de espaco de cor. Devolve `true` quando escreveu.
bool _carimbarPerfilSrgb(File arquivo) {
  final Uint8List bytes = arquivo.readAsBytesSync();
  for (int i = 0; i < _assinaturaPng.length; i++) {
    if (i >= bytes.length || bytes[i] != _assinaturaPng[i]) {
      throw StateError(
        'REPROVA: ${arquivo.path} nao comeca com a assinatura PNG. Este '
        'gerador so sabe carimbar PNG, e adivinhar formato aqui gravaria lixo '
        'dentro de um arquivo do catalogo.',
      );
    }
  }

  final ByteData dados = ByteData.sublistView(bytes);
  int? fimDoIhdr;
  var i = 8;
  while (i + 8 <= bytes.length) {
    final int tamanho = dados.getUint32(i);
    final String tipo = String.fromCharCodes(bytes, i + 4, i + 8);
    if (_chunksDePerfil.contains(tipo)) return false;
    if (tipo == 'IHDR') fimDoIhdr = i + 12 + tamanho;
    if (tipo == 'IDAT' || tipo == 'IEND') break;
    i = i + 12 + tamanho;
  }
  if (fimDoIhdr == null) {
    throw StateError(
      'REPROVA: ${arquivo.path} nao tem chunk IHDR. Arquivo PNG sem cabecalho '
      'nao e PNG, e carimbar em cima disso produziria um arquivo que o Xcode '
      'recusa no meio do build.',
    );
  }

  final BytesBuilder saida = BytesBuilder(copy: false)
    ..add(Uint8List.sublistView(bytes, 0, fimDoIhdr))
    ..add(_chunk('sRGB', Uint8List.fromList(<int>[_intencaoPerceptual])))
    ..add(_chunk('gAMA', _u32(<int>[_gamaSrgb])))
    ..add(_chunk('cHRM', _u32(_cromaticidadesSrgb)))
    ..add(Uint8List.sublistView(bytes, fimDoIhdr));
  arquivo.writeAsBytesSync(saida.takeBytes());
  return true;
}

Uint8List _u32(List<int> valores) {
  final ByteData b = ByteData(valores.length * 4);
  for (int i = 0; i < valores.length; i++) {
    b.setUint32(i * 4, valores[i]);
  }
  return b.buffer.asUint8List();
}

/// Monta um chunk PNG completo: tamanho, tipo, dados e CRC-32.
Uint8List _chunk(String tipo, Uint8List dados) {
  final Uint8List tipoBytes = Uint8List.fromList(ascii.encode(tipo));
  final BytesBuilder corpo = BytesBuilder(copy: false)
    ..add(tipoBytes)
    ..add(dados);
  final Uint8List corpoBytes = corpo.takeBytes();
  final ByteData saida = ByteData(8 + dados.length + 4)
    ..setUint32(0, dados.length);
  final Uint8List bytes = saida.buffer.asUint8List();
  bytes.setRange(4, 4 + corpoBytes.length, corpoBytes);
  saida.setUint32(4 + corpoBytes.length, _crc32(corpoBytes));
  return bytes;
}

final List<int> _tabelaCrc = List<int>.generate(256, (int n) {
  var c = n;
  for (int k = 0; k < 8; k++) {
    c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
  }
  return c;
});

int _crc32(Uint8List bytes) {
  var c = 0xFFFFFFFF;
  for (final int b in bytes) {
    c = _tabelaCrc[(c ^ b) & 0xFF] ^ (c >> 8);
  }
  return (c ^ 0xFFFFFFFF) & 0xFFFFFFFF;
}

/// Marca com que este gerador reconhece o proprio comentario, para reescrever
/// no lugar em vez de empilhar um a cada execucao.
///
/// A primeira versao disto procurava "o comentario imediatamente antes do
/// `<color>`" com uma expressao que atravessava linhas. Na PRIMEIRA execucao
/// funcionou; na segunda, o `-->` deste comentario virou o alvo do casamento
/// preguicoso que comecava no `<!--View Controller-->` do template, e a
/// substituicao comeu a `<scene>`, o `<viewController>` e os dois `imageView`
/// inteiros. Dai o processamento ser por LINHA e o reconhecimento ser por
/// marca fixa: gerador que nao e idempotente destroi na segunda vez.
const String _marcaDoComentario = 'bichu:fundo-inerte-do-storyboard';

/// So casa a linha do `<color key="backgroundColor" .../>`.
final RegExp _linhaDoFundo =
    RegExp(r'^([ \t]*)<color key="backgroundColor"[^>]*/>\s*$');

/// Troca o branco do template pela semente, e escreve o porque ao lado.
///
/// Devolve `true` quando o arquivo mudou.
bool _corrigirFundoDoStoryboard(int semente) {
  final File f = File(_storyboard);
  if (!f.existsSync()) {
    throw StateError(
      'REPROVA: nao achei $_storyboard a partir de "${Directory.current.path}". '
      'Rode este gerador de dentro de app/.',
    );
  }
  final String texto = f.readAsStringSync();
  final List<String> linhas = texto.split('\n');

  final List<int> alvos = <int>[
    for (int i = 0; i < linhas.length; i++)
      if (_linhaDoFundo.hasMatch(linhas[i])) i,
  ];
  if (alvos.length != 1) {
    throw StateError(
      'REPROVA: $_storyboard tem ${alvos.length} linhas '
      '<color key="backgroundColor" .../>, e este gerador conhece exatamente '
      'uma, a da view raiz. O template do flutter_native_splash mudou de '
      'forma: confira antes de deixar este passo silencioso.',
    );
  }

  final int alvo = alvos.single;
  final String recuo = _linhaDoFundo.firstMatch(linhas[alvo])!.group(1)!;

  // Onde o bloco comeca: no proprio `<color>`, ou no inicio do comentario que
  // este gerador escreveu numa execucao anterior.
  var inicio = alvo;
  if (alvo > 0 && linhas[alvo - 1].trimRight().endsWith('-->')) {
    for (int i = alvo - 1; i >= 0; i--) {
      if (linhas[i].contains(_marcaDoComentario)) {
        inicio = i;
        break;
      }
      if (i < alvo - 1 && linhas[i].contains('<!--')) break;
    }
  }

  final List<String> bloco = <String>[
    '$recuo<!-- $_marcaDoComentario',
    '$recuo     O branco do template do flutter_native_splash foi trocado pela',
    '$recuo     semente da marca (raspberry.700 de design/tokens.json) por',
    '$recuo     app/tool/corrigir_splash_ios.dart. Hoje este valor e inerte: o',
    '$recuo     imageView de LaunchBackground cobre a view raiz pelas quatro',
    '$recuo     bordas. Ele existe para o dia em que alguem remover aquele',
    '$recuo     imageView, ou UMA das quatro constraints: com branco aqui a',
    '$recuo     splash do iOS ficaria branca e nenhum portao acusaria. O',
    '$recuo     caminho primario da cor continua sendo o PNG do catalogo, que',
    '$recuo     so acerta porque carrega chunk sRGB.',
    '$recuo-->',
    '$recuo<color key="backgroundColor"'
        ' red="${_componente(semente, 16)}"'
        ' green="${_componente(semente, 8)}"'
        ' blue="${_componente(semente, 0)}"'
        ' alpha="1" colorSpace="custom" customColorSpace="sRGB"/>',
  ];

  linhas.replaceRange(inicio, alvo + 1, bloco);
  final String novo = linhas.join('\n');
  if (novo == texto) return false;
  f.writeAsStringSync(novo);
  return true;
}

/// Um componente de cor como o Interface Builder o escreve: 0..1, com os
/// digitos que `1/255` exige para voltar ao mesmo byte.
String _componente(int rgb, int deslocamento) {
  final int byte = (rgb >> deslocamento) & 0xFF;
  return (byte / 255).toStringAsPrecision(17);
}
