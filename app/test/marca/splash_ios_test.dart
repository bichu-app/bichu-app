// A ISCA QUE ALCANCA O RENDER DO iOS.
//
// O QUE AS OITO ISCAS DE `arte_do_app_test.dart` NAO PEGAM. Elas leem o BYTE
// do arquivo e comparam com `design/tokens.json`. Em 21/09/2026 as oito
// estavam VERDES enquanto o simulador (iPhone 18 Pro, iOS 27) abria o app com
// a launch screen nativa medindo `#AD0038` e a marca sendo `#9E0B3A`. Nao ha
// contradicao: o byte do PNG estava certo. O que estava errado era o que o
// sistema FAZIA com aquele byte.
//
// A CAUSA, com a conta fechada. O `flutter_native_splash` escreve os PNG do
// catalogo sem nenhum chunk de espaco de cor -- `IHDR`, `IDAT`, `IEND` e mais
// nada. Sem `sRGB`, `iCCP` ou `cHRM`, o catalogo de assets do Xcode trata os
// componentes como se ja estivessem no gamut do display, que no iPhone e
// Display P3, e o sistema converte P3 -> sRGB para exibir:
//
//   P3(#9E0B3A) -> sRGB = #AD0038   <- medido na tela, quadro f2..f5
//   P3(#922C4A) -> sRGB = #9F204A   <- o app/README.md registrou #9F2049
//
// A segunda linha e a semente ANTERIOR, e ela explica por que o README tinha o
// numero certo e a conclusao errada: ele dizia que o caminho que fecha e "PNG
// gerado, que carrega perfil de cor". O PNG gerado nao carregava perfil nenhum.
//
// O QUE ESTE ARQUIVO FAZ, e por que ele alcanca onde a leitura de byte para:
// ele nao pergunta "qual e o pixel", pergunta "QUAL COR O iOS EXIBE". Para
// isso ele aplica a mesma regra que o sistema aplica -- perfil declarado, o
// pixel vale como esta; perfil ausente, os componentes sao P3 e passam pela
// conversao. O modelo nao e teoria: a isca negativa da secao 4 e o arquivo
// exato que estava no repositorio, e o modelo preve nele os `#AD0038` que se
// mediram na tela.
//
// Assim ele reprova em TRES situacoes, e as tres passariam pelas oito iscas
// antigas:
//   1. o PNG voltar a sair sem chunk de perfil (o gerador rodou e o passo
//      `dart run tool/corrigir_splash_ios.dart` foi esquecido);
//   2. alguem carimbar um perfil ERRADO, por exemplo um iCCP de Display P3;
//   3. o `backgroundColor` da view raiz do storyboard voltar a ser branco.
//
// Padroes: PNG e ISO/IEC 15948 (chunks `sRGB` 11.3.3.5, `iCCP` 11.3.3.4,
// `cHRM` 11.3.3.1). As matrizes de Display P3 e de sRGB para XYZ D65 sao as
// da IEC 61966-2-1 e da SMPTE RP 431-2 com ponto branco D65, que e o que a
// Apple chama de "Display P3".

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'png_cru.dart';

// ---------------------------------------------------------------------------
// Leitura de chunk, que e o que o decodificador de pixel nao guarda
// ---------------------------------------------------------------------------

/// Tipos de chunk do arquivo, na ordem em que aparecem.
///
/// `PngCru` descarta essa informacao de proposito: ele existe para entregar
/// pixel. Aqui a pergunta e outra -- o que o arquivo DECLARA sobre o proprio
/// espaco de cor -- e a resposta esta justamente nos chunks que aquele
/// decodificador pula.
List<String> tiposDeChunk(File arquivo) {
  if (!arquivo.existsSync()) {
    throw StateError(
      'REPROVA: nao achei ${arquivo.path}. Portao que nao acha o que verificar '
      'reprova; ausencia de arquivo nunca e aprovacao.',
    );
  }
  final Uint8List bytes = arquivo.readAsBytesSync();
  final ByteData dados = ByteData.sublistView(bytes);
  final List<String> tipos = <String>[];
  var i = 8;
  while (i + 8 <= bytes.length) {
    final int tamanho = dados.getUint32(i);
    final String tipo = String.fromCharCodes(bytes, i + 4, i + 8);
    tipos.add(tipo);
    if (tipo == 'IEND') break;
    i = i + 12 + tamanho;
  }
  return tipos;
}

/// Chunks que declaram espaco de cor, em ordem de precedencia do iOS.
const List<String> chunksDePerfil = <String>['iCCP', 'sRGB', 'cHRM'];

/// O nome do ICC embutido num chunk `iCCP` (texto latin-1 ate o primeiro nulo).
///
/// Serve para a situacao 2 do cabecalho: um `iCCP` de Display P3 declara um
/// perfil, entao "tem chunk" ficaria verde, e o desvio continuaria de pe.
String nomeDoIccp(File arquivo) {
  final Uint8List bytes = arquivo.readAsBytesSync();
  final ByteData dados = ByteData.sublistView(bytes);
  var i = 8;
  while (i + 8 <= bytes.length) {
    final int tamanho = dados.getUint32(i);
    final String tipo = String.fromCharCodes(bytes, i + 4, i + 8);
    if (tipo == 'iCCP') {
      final int inicio = i + 8;
      var fim = inicio;
      while (fim < inicio + tamanho && bytes[fim] != 0) {
        fim++;
      }
      return latin1.decode(Uint8List.sublistView(bytes, inicio, fim));
    }
    if (tipo == 'IEND') break;
    i = i + 12 + tamanho;
  }
  return '';
}

// ---------------------------------------------------------------------------
// O modelo do render: o que o iOS EXIBE a partir destes bytes
// ---------------------------------------------------------------------------

double _linearizar(int byte) {
  final double c = byte / 255.0;
  return c <= 0.04045 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4) as double;
}

int _codificar(double v) {
  final double x = v.clamp(0.0, 1.0);
  final double s =
      x <= 0.0031308 ? 12.92 * x : 1.055 * (math.pow(x, 1 / 2.4) as double) - 0.055;
  return (s * 255).round();
}

/// Display P3 -> XYZ (D65).
const List<List<double>> _p3ParaXyz = <List<double>>[
  <double>[0.4865709, 0.2656677, 0.1982173],
  <double>[0.2289746, 0.6917385, 0.0792869],
  <double>[0.0000000, 0.0451134, 1.0439444],
];

/// XYZ (D65) -> sRGB.
const List<List<double>> _xyzParaSrgb = <List<double>>[
  <double>[3.2404542, -1.5371385, -0.4985314],
  <double>[-0.9692660, 1.8760108, 0.0415560],
  <double>[0.0556434, -0.2040259, 1.0572252],
];

/// O RGB que sai quando componentes de sRGB sao lidos como se fossem P3.
///
/// E a conta que o sistema faz com um PNG sem perfil dentro de um catalogo de
/// assets: ele nao sabe de que espaco vieram os numeros, assume o do display,
/// e converte para o espaco de trabalho.
int comoP3ConvertidoParaSrgb(int rgb) {
  final List<double> linear = <double>[
    _linearizar((rgb >> 16) & 0xFF),
    _linearizar((rgb >> 8) & 0xFF),
    _linearizar(rgb & 0xFF),
  ];
  final List<double> xyz = <double>[
    for (int i = 0; i < 3; i++)
      _p3ParaXyz[i][0] * linear[0] +
          _p3ParaXyz[i][1] * linear[1] +
          _p3ParaXyz[i][2] * linear[2],
  ];
  final List<int> saida = <int>[
    for (int i = 0; i < 3; i++)
      _codificar(_xyzParaSrgb[i][0] * xyz[0] +
          _xyzParaSrgb[i][1] * xyz[1] +
          _xyzParaSrgb[i][2] * xyz[2]),
  ];
  return (saida[0] << 16) | (saida[1] << 8) | saida[2];
}

/// A cor que o iOS EXIBE para o pixel (0,0) deste PNG dentro do catalogo.
///
/// Perfil declarado: os componentes ja estao no espaco que o arquivo diz, e o
/// sistema exibe o que esta la. Perfil ausente: o gamut vira o do display e a
/// cor passa pela conversao. Esta funcao e o ponto inteiro deste arquivo --
/// e a diferenca entre ler byte e prever tela.
int corExibidaNoIos(File arquivo) {
  final int pixel = PngCru.doArquivo(arquivo).rgbEm(0, 0);
  final List<String> tipos = tiposDeChunk(arquivo);
  final bool declara = tipos.any(chunksDePerfil.contains);
  if (!declara) return comoP3ConvertidoParaSrgb(pixel);
  final String icc = nomeDoIccp(arquivo);
  if (icc.isNotEmpty && !icc.toLowerCase().contains('srgb')) {
    throw StateError(
      'REPROVA: ${arquivo.path} embute um perfil ICC chamado "$icc". Este '
      'portao so sabe prever o render de um PNG declarado em sRGB. Perfil de '
      'outro espaco muda a cor exibida e este arquivo ficaria verde sem saber '
      'qual cor o aparelho mostra.',
    );
  }
  return pixel;
}

String _hex(int rgb) =>
    '#${rgb.toRadixString(16).toUpperCase().padLeft(6, '0')}';

// ---------------------------------------------------------------------------

Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/design/tokens.json').existsSync() &&
        Directory('${dir.path}/app/android').existsSync()) {
      return dir;
    }
    final Directory pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei a raiz do repositorio (design/tokens.json + '
    'app/android) subindo a partir de "${Directory.current.path}".',
  );
}

int _sementeDoDisco(Directory raiz) {
  final File arquivo = File('${raiz.path}/design/tokens.json');
  final Map<String, dynamic> json =
      jsonDecode(arquivo.readAsStringSync()) as Map<String, dynamic>;
  final Object? valor = ((json['raspberry'] as Map)['700'] as Map)[r'$value'];
  if (valor is! String || !RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(valor)) {
    throw StateError(
      'REPROVA: raspberry.700 em ${arquivo.path} vale $valor, que nao e um '
      'hexadecimal de 6 digitos.',
    );
  }
  return int.parse(valor.substring(1), radix: 16);
}

/// A linha `<color key="backgroundColor" .../>` da view raiz do storyboard,
/// devolvida como RGB de 24 bits.
///
/// Reprova quando nao ha exatamente uma, quando falta componente e quando o
/// espaco declarado nao e sRGB: qualquer um desses casos deixaria o valor sem
/// significado, e um portao que aprova o que nao entendeu e pior que portao
/// nenhum.
int fundoDoStoryboard(File arquivo) {
  if (!arquivo.existsSync()) {
    throw StateError(
      'REPROVA: nao achei ${arquivo.path}. Sem o storyboard nao ha o que '
      'verificar, e ausencia nunca e aprovacao.',
    );
  }
  final String texto = arquivo.readAsStringSync();
  final List<RegExpMatch> achados =
      RegExp(r'<color key="backgroundColor"[^>]*/>').allMatches(texto).toList();
  if (achados.length != 1) {
    throw StateError(
      'REPROVA: ${arquivo.path} tem ${achados.length} elementos '
      '<color key="backgroundColor" .../> e este portao conhece exatamente um, '
      'o da view raiz. Se o template do flutter_native_splash mudou de forma, '
      'este portao precisa ser relido antes de voltar a ficar verde.',
    );
  }
  final String elemento = achados.single.group(0)!;

  final String? espaco =
      RegExp(r'customColorSpace="([^"]+)"').firstMatch(elemento)?.group(1);
  if (espaco != 'sRGB') {
    throw StateError(
      'REPROVA: ${arquivo.path} declara o fundo em customColorSpace='
      '"$espaco". Este portao so sabe ler componentes de sRGB; em outro '
      'espaco os mesmos numeros sao outra cor.',
    );
  }

  int componente(String nome) {
    final RegExpMatch? m =
        RegExp('$nome="([0-9.eE+-]+)"').firstMatch(elemento);
    if (m == null) {
      throw StateError(
        'REPROVA: ${arquivo.path} nao declara o componente "$nome" no fundo da '
        'view raiz: $elemento',
      );
    }
    return (double.parse(m.group(1)!) * 255).round();
  }

  return (componente('red') << 16) |
      (componente('green') << 8) |
      componente('blue');
}

void main() {
  final Directory raiz = _raizDoRepositorio();
  final int semente = _sementeDoDisco(raiz);
  final String xcassets = '${raiz.path}/app/ios/Runner/Assets.xcassets';
  final String fixtures = '${raiz.path}/app/test/marca/fixtures';

  List<File> pngsDoCatalogo() {
    final Directory dir = Directory(xcassets);
    if (!dir.existsSync()) {
      throw StateError('REPROVA: nao achei $xcassets.');
    }
    final List<File> achados = dir
        .listSync(recursive: true)
        .whereType<File>()
        .where((File f) => f.path.toLowerCase().endsWith('.png'))
        .toList()
      ..sort((File a, File b) => a.path.compareTo(b.path));
    if (achados.length < 20) {
      throw StateError(
        'REPROVA: achei so ${achados.length} PNG em $xcassets. O catalogo tem '
        'o fundo do splash, a launch image e as medidas do icone -- mais de '
        'vinte arquivos. Portao que encolhe sozinho fica verde cobrindo menos '
        'do que anuncia.',
      );
    }
    return achados;
  }

  // ---------------------------------------------------------------------
  // 1. Todo PNG do catalogo do iOS declara o proprio espaco de cor
  // ---------------------------------------------------------------------
  //
  // Vale para o icone da loja tambem, e nao so para o splash: os dois entram
  // no mesmo catalogo e sofriam o mesmo desvio.

  test('todo PNG do catalogo do iOS declara espaco de cor', () {
    for (final File f in pngsDoCatalogo()) {
      final List<String> tipos = tiposDeChunk(f);
      expect(
        tipos.any(chunksDePerfil.contains),
        isTrue,
        reason:
            '${f.path} tem os chunks $tipos e nenhum deles declara espaco de '
            'cor. Sem $chunksDePerfil o catalogo de assets do Xcode trata os '
            'componentes como se fossem do gamut do display (Display P3) e o '
            'iOS exibe ${_hex(comoP3ConvertidoParaSrgb(PngCru.doArquivo(f).rgbEm(0, 0)))} '
            'onde o arquivo diz '
            '${_hex(PngCru.doArquivo(f).rgbEm(0, 0))}. Isto acontece toda vez '
            'que `dart run flutter_native_splash:create` ou '
            '`dart run flutter_launcher_icons` roda: reaplique com\n'
            '    cd app && dart run tool/corrigir_splash_ios.dart',
      );
    }
  });

  test('o chunk sRGB tem intencao de renderizacao valida', () {
    for (final File f in pngsDoCatalogo()) {
      final Uint8List bytes = f.readAsBytesSync();
      final ByteData dados = ByteData.sublistView(bytes);
      var i = 8;
      while (i + 8 <= bytes.length) {
        final int tamanho = dados.getUint32(i);
        final String tipo = String.fromCharCodes(bytes, i + 4, i + 8);
        if (tipo == 'sRGB') {
          expect(
            tamanho,
            1,
            reason: '${f.path}: o chunk sRGB tem $tamanho bytes e a secao '
                '11.3.3.5 da ISO/IEC 15948 declara exatamente um.',
          );
          expect(
            bytes[i + 8],
            inInclusiveRange(0, 3),
            reason: '${f.path}: intencao de renderizacao ${bytes[i + 8]}, e a '
                'norma so define de 0 a 3. Um valor fora da faixa faz o '
                'decodificador cair no caminho de adivinhar gamut, que e '
                'exatamente o que este chunk existe para evitar.',
          );
          break;
        }
        if (tipo == 'IEND') break;
        i = i + 12 + tamanho;
      }
    }
  });

  // ---------------------------------------------------------------------
  // 2. A cor que o iOS EXIBE no fundo da launch screen e a semente
  // ---------------------------------------------------------------------

  test('a cor EXIBIDA no fundo da launch screen nativa e a semente', () {
    for (final String nome in <String>['background.png', 'darkbackground.png']) {
      final File f = File('$xcassets/LaunchBackground.imageset/$nome');
      final int exibida = corExibidaNoIos(f);
      expect(
        exibida,
        semente,
        reason:
            '${f.path}: o byte do arquivo e '
            '${_hex(PngCru.doArquivo(f).rgbEm(0, 0))}, mas o iOS EXIBE '
            '${_hex(exibida)} e a semente de design/tokens.json e '
            '${_hex(semente)}. Foi assim que o defeito de 21/09/2026 passou '
            'pelas oito iscas de arte_do_app_test.dart em verde: elas leem '
            'byte, e o byte estava certo.',
      );
    }
  });

  // ---------------------------------------------------------------------
  // 3. O fundo da view raiz do storyboard, que hoje e inerte
  // ---------------------------------------------------------------------
  //
  // O template do flutter_native_splash nasce com `red="1" green="1"
  // blue="1"`. O `imageView` de LaunchBackground cobre a view raiz pelas
  // quatro bordas, entao o branco nao aparece -- hoje. Basta remover aquele
  // imageView, ou UMA das quatro constraints, para a splash do iOS ficar
  // branca com todo portao verde. E defeito adormecido, nao defeito
  // inexistente.

  test('o fundo da view raiz do storyboard e a semente, e nao branco', () {
    final File f =
        File('${raiz.path}/app/ios/Runner/Base.lproj/LaunchScreen.storyboard');
    final int fundo = fundoDoStoryboard(f);
    expect(
      fundo,
      isNot(0xFFFFFF),
      reason:
          '${f.path} declara o fundo da view raiz BRANCO, que e o valor de '
          'fabrica do template do flutter_native_splash (lib/templates.dart, '
          'linha 130). Hoje ele e inerte porque o imageView de '
          'LaunchBackground o cobre pelas quatro bordas; no dia em que alguem '
          'remover o imageView ou uma das quatro constraints, a splash do iOS '
          'abre branca e nenhum outro portao acusa. Rode\n'
          '    cd app && dart run tool/corrigir_splash_ios.dart',
    );
    expect(
      fundo,
      semente,
      reason:
          '${f.path} declara o fundo da view raiz em ${_hex(fundo)} e a '
          'semente de design/tokens.json e ${_hex(semente)}.',
    );
  });

  // ---------------------------------------------------------------------
  // 4. AUTOTESTE: as duas iscas negativas, versionadas
  // ---------------------------------------------------------------------
  //
  // "Prova negativa que vive numa frase evapora." As tres checagens acima
  // valem pela confianca do dia em que foram escritas enquanto ninguem
  // demonstrar que elas REPROVAM. As duas fixtures abaixo sao os arquivos
  // exatos que estavam no repositorio com o defeito de pe, e precisam ser
  // recusadas pelo mesmo caminho de codigo que aprova os de producao.

  test('AUTOTESTE: o PNG sem perfil e reprovado, e o modelo preve o #AD0038 '
      'que se mediu na tela', () {
    final File isca = File('$fixtures/fundo_ios_sem_perfil.png');
    final List<String> tipos = tiposDeChunk(isca);

    expect(
      tipos,
      <String>['IHDR', 'IDAT', 'IEND'],
      reason:
          '${isca.path} deixou de ser o arquivo sem perfil de cor e passou a '
          'ter $tipos. Alguem "consertou" a isca, e a partir daqui ela nao '
          'prova mais nada.',
    );
    expect(
      tipos.any(chunksDePerfil.contains),
      isFalse,
      reason: 'a isca precisa continuar sem declaracao de espaco de cor.',
    );

    // O byte esta CERTO: e a semente. Era por isso que as oito iscas de
    // arte_do_app_test.dart estavam verdes com o defeito de pe.
    expect(PngCru.doArquivo(isca).rgbEm(0, 0), semente);

    // E o render esta ERRADO. `#AD0038` nao e conta de papel: foi medido no
    // quadro da launch screen nativa, iPhone 18 Pro com iOS 27, numa
    // inicializacao a frio, em 21/09/2026.
    expect(
      corExibidaNoIos(isca),
      0xAD0038,
      reason:
          'o modelo de render deste arquivo previa ${_hex(corExibidaNoIos(isca))} '
          'para a isca, e o que se mediu no simulador foi #AD0038. Quando o '
          'modelo deixa de reproduzir a medicao, ele parou de descrever o '
          'aparelho e as tres checagens acima passam a valer por confianca.',
    );
    expect(
      corExibidaNoIos(isca),
      isNot(semente),
      reason:
          'a isca passou a ser EXIBIDA na semente. Se a semente mudou para uma '
          'cor que sobrevive a conversao P3 -> sRGB, troque a fixture: uma '
          'isca que o portao aprova nao reprova nada.',
    );
  });

  test('AUTOTESTE: o storyboard com fundo branco e reprovado', () {
    final File isca = File('$fixtures/launchscreen_fundo_branco.storyboard');
    final int fundo = fundoDoStoryboard(isca);

    expect(
      fundo,
      0xFFFFFF,
      reason:
          '${isca.path} deixou de declarar o fundo branco e passou a '
          '${_hex(fundo)}. Alguem "consertou" a isca: ela e uma copia do '
          'storyboard como o flutter_native_splash o escreve, e existe para '
          'provar que a checagem da secao 3 recusa esse arquivo.',
    );
    expect(
      fundo,
      isNot(semente),
      reason:
          'a semente virou branco. Isso e outra decisao de marca, e esta isca '
          'precisa ser refeita antes de voltar a valer.',
    );
  });
}
