// A ISCA DE PIXEL: o portao que reprova quem troca a semente e nao roda os
// geradores.
//
// O BURACO QUE ELE FECHA, escrito na secao 21.4 de docs/06-design-system.md em
// 21/09/2026: "quem trocar os sete pontos de texto e nao rodar os dois
// geradores entrega um produto Carmim que abre com splash e icone Framboesa, e
// nenhum portao acusa, porque nada le pixel."
//
// Era verdade. O portao de contraste recalcula `design/tokens.json` e a tabela
// do paragrafo 7, o de tema compara os papeis em Dart, o de portabilidade
// procura literal de rede -- e todos os tres continuariam verdes com o icone
// da loja e a splash na cor velha, porque a cor deles nao mora em texto: mora
// em 40 arquivos PNG que tres geradores assam.
//
// O QUE ESTE ARQUIVO FAZ: le a semente de `design/tokens.json`, decodifica os
// PNG que os geradores escreveram e exige que o pixel bata com o token. Trocar
// a semente sem rodar
//
//     python3 design/marca/app/gerar-arte-do-app.py
//     cd app && dart run flutter_launcher_icons
//     cd app && dart run flutter_native_splash:create
//
// derruba este arquivo nomeando o primeiro arquivo divergente e a cor que ele
// encontrou.
//
// O QUE ELE NAO FAZ, e vale estar escrito para ninguem contar com o contrario:
// ele nao olha o DESENHO. Um simbolo trocado, deformado, deslocado ou fora da
// zona segura passa aqui desde que a cor esteja certa. Geometria continua
// sendo conferencia de quem desenha (secao 21.5), e este portao cobre a
// metade que falhava sozinha em silencio.
//
// Padroes contra os quais ele foi escrito: PNG (ISO/IEC 15948) para a leitura
// de pixel; `flutter_launcher_icons` 0.14.4 e `flutter_native_splash` para a
// forma dos arquivos gerados.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'png_cru.dart';

/// Dois RGB a ate um ponto de distancia em cada canal.
///
/// Ver o comentario de [PngCru.quantosPerto]: a folga de 1 e o arredondamento
/// do reamostrador do gerador de icone, medido, e nao uma concessao. Ela nao
/// confunde duas decisoes de marca -- a Framboesa que saiu em 21/09/2026 dista
/// 12, 33 e 16 da semente que entrou.
bool _mesmaCor(int a, int b) =>
    (((a >> 16) & 0xFF) - ((b >> 16) & 0xFF)).abs() <= 1 &&
    (((a >> 8) & 0xFF) - ((b >> 8) & 0xFF)).abs() <= 1 &&
    ((a & 0xFF) - (b & 0xFF)).abs() <= 1;

/// Sobe de `Directory.current` ate achar a raiz do repositorio.
///
/// `flutter test` roda com o diretorio corrente em `app/`, mas a fonte dos
/// tokens vive um nivel acima. Um portao que nao acha o que verificar REPROVA
/// com o motivo; nunca aprova por ausencia.
Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/design/tokens.json').existsSync() &&
        Directory('${dir.path}/app/android').existsSync()) {
      return dir;
    }
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei a raiz do repositorio (design/tokens.json + app/android) '
    'subindo a partir de "${Directory.current.path}". Sem ela este portao nao '
    'tem semente para comparar nem PNG para ler, e portao sem o que verificar '
    'reprova.',
  );
}

int _sementeDoDisco(Directory raiz) {
  final arquivo = File('${raiz.path}/design/tokens.json');
  final json = jsonDecode(arquivo.readAsStringSync()) as Map<String, dynamic>;
  final valor = ((json['raspberry'] as Map)['700'] as Map)[r'$value'];
  if (valor is! String ||
      !RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(valor)) {
    throw StateError(
      'REPROVA: raspberry.700 em ${arquivo.path} vale ${valor.toString()}, que '
      'nao e um hexadecimal de 6 digitos. A semente da marca e a unica entrada '
      'deste portao.',
    );
  }
  return int.parse(valor.substring(1), radix: 16);
}

void main() {
  final raiz = _raizDoRepositorio();
  final semente = _sementeDoDisco(raiz);
  final res = '${raiz.path}/app/android/app/src/main/res';
  final xcassets = '${raiz.path}/app/ios/Runner/Assets.xcassets';

  /// Todos os `nome` dentro de `res/<prefixo>*/`, descobertos por varredura.
  ///
  /// A lista NAO e escrita a mao de proposito: o gerador pode acrescentar uma
  /// densidade, e um portao com lista fixa continuaria verde sem olhar para a
  /// nova. O piso de [minimo] existe para o caso oposto -- a pasta sumir.
  List<File> pngsPorDensidade(String prefixo, String nome, int minimo) {
    final achados = Directory(res)
        .listSync()
        .whereType<Directory>()
        .where((d) => d.path.split('/').last.startsWith(prefixo))
        .map((d) => File('${d.path}/$nome'))
        .where((f) => f.existsSync())
        .toList()
      ..sort((a, b) => a.path.compareTo(b.path));
    if (achados.length < minimo) {
      throw StateError(
        'REPROVA: esperava pelo menos $minimo arquivos "$nome" em '
        '"$res/$prefixo*" e achei ${achados.length}. Um portao que encolhe '
        'sozinho fica verde cobrindo menos do que anuncia.',
      );
    }
    return achados;
  }

  // ---------------------------------------------------------------------
  // 1. O fundo chapado do splash: seis bitmaps de 1x1 que nenhum diff le
  // ---------------------------------------------------------------------
  //
  // Os dois `launch_background.xml` deixaram de escrever cor em 21/09/2026 e
  // passaram a apontar para `@drawable/background`. A cor saiu do texto e
  // virou pixel: mais facil de manter, impossivel de conferir por diff.

  test('o fundo do splash e a semente, nos seis bitmaps de 1x1', () {
    final arquivos = <File>[
      File('$res/drawable/background.png'),
      File('$res/drawable-v21/background.png'),
      File('$res/drawable-night/background.png'),
      File('$res/drawable-night-v21/background.png'),
      File('$xcassets/LaunchBackground.imageset/background.png'),
      File('$xcassets/LaunchBackground.imageset/darkbackground.png'),
    ];

    for (final f in arquivos) {
      final png = PngCru.doArquivo(f);
      expect(
        png.rgbEm(0, 0),
        semente,
        reason:
            '${f.path} esta em ${hex(png.rgbEm(0, 0))} e a semente de '
            'design/tokens.json e ${hex(semente)}. Este arquivo e escrito por '
            '`dart run flutter_native_splash:create`, a partir de `color` e '
            '`color_dark` em app/pubspec.yaml. O aparelho abre nesta cor: o '
            'produto abriria na cor velha e todo o resto do portao estaria '
            'verde.',
      );
    }
  });

  // ---------------------------------------------------------------------
  // 2. A camada de fundo do icone adaptativo, chapada nos 108 dp inteiros
  // ---------------------------------------------------------------------

  test('a camada de fundo do icone adaptativo e 100% semente', () {
    final arquivos = pngsPorDensidade('drawable-', 'ic_launcher_background.png', 5);
    for (final f in arquivos) {
      final png = PngCru.doArquivo(f);
      expect(
        png.quantosPerto(semente),
        png.pixels,
        reason:
            '${f.path} tem ${png.quantosPerto(semente)} de ${png.pixels} pixels '
            'na semente ${hex(semente)}; o dominante e '
            '${hex(png.corDominante().rgb)}. Esta camada cobre o deslocamento '
            'de parallax e qualquer mascara de fabricante, entao ela e chapada '
            'por definicao. Rode `dart run flutter_launcher_icons`.',
      );
    }
  });

  // ---------------------------------------------------------------------
  // 3. O icone da loja: Android legado e as dezoito medidas do iOS
  // ---------------------------------------------------------------------
  //
  // Aqui a cobranca e por cor DOMINANTE, nao por 100%: o simbolo em Marfim e a
  // lingua em Manteiga ocupam parte do quadrado, e a suavizacao de borda
  // produz milhares de tons intermediarios. O piso de 60% vem da menor medida
  // do conjunto, o iOS de 20x20, que mede 70%.

  test('o icone da loja tem a semente como cor dominante, em toda medida', () {
    final arquivos = <File>[
      ...pngsPorDensidade('mipmap-', 'ic_launcher.png', 5),
      ...Directory('$xcassets/AppIcon.appiconset')
          .listSync()
          .whereType<File>()
          .where((f) => f.path.endsWith('.png'))
          .toList()
        ..sort((a, b) => a.path.compareTo(b.path)),
    ];
    expect(
      arquivos.length,
      greaterThanOrEqualTo(20),
      reason:
          'esperava as 5 densidades do Android mais as medidas do iOS e achei '
          '${arquivos.length} arquivos. Portao que encolhe sozinho fica verde '
          'cobrindo menos do que anuncia.',
    );

    for (final f in arquivos) {
      final png = PngCru.doArquivo(f);
      final dom = png.corDominante();
      expect(
        _mesmaCor(dom.rgb, semente),
        isTrue,
        reason:
            '${f.path} (${png.largura}x${png.altura}) tem '
            '${hex(dom.rgb)} como cor dominante e a semente e ${hex(semente)}. '
            'O quadrado do icone e pintado na cor da marca; se ele divergiu, o '
            '`flutter_launcher_icons` nao rodou depois da troca da semente, ou '
            'a arte de design/marca/app/ nao foi regerada.',
      );
      final naSemente = png.quantosPerto(semente);
      expect(
        naSemente / png.pixels,
        greaterThan(0.60),
        reason:
            '${f.path}: a semente ocupa ${(100 * naSemente / png.pixels).toStringAsFixed(1)}% '
            'do quadrado. A menor medida do conjunto (iOS 20x20) mede 70%; '
            'abaixo de 60% o quadrado deixou de ser o fundo da marca.',
      );
    }
  });

  // ---------------------------------------------------------------------
  // 4. A arte de ORIGEM, que e a entrada dos dois geradores
  // ---------------------------------------------------------------------
  //
  // Sem esta checagem daria para ter os arquivos nativos certos e a pasta de
  // arte na cor velha, e a proxima execucao de qualquer gerador desfaria tudo.

  test('a arte de design/marca/app/ ja esta na semente', () {
    final fundo = PngCru.doArquivo(
        File('${raiz.path}/design/marca/app/icone-android-background.png'));
    expect(
      fundo.quantosPerto(semente),
      fundo.pixels,
      reason:
          'design/marca/app/icone-android-background.png nao e chapado na '
          'semente ${hex(semente)}: o dominante e ${hex(fundo.corDominante().rgb)}. '
          'Rode `python3 design/marca/app/gerar-arte-do-app.py`, que le a cor '
          'de design/tokens.json.',
    );

    final ios = PngCru.doArquivo(
        File('${raiz.path}/design/marca/app/icone-ios-1024.png'));
    expect(
      _mesmaCor(ios.corDominante().rgb, semente),
      isTrue,
      reason:
          'design/marca/app/icone-ios-1024.png tem '
          '${hex(ios.corDominante().rgb)} como dominante e a semente e '
          '${hex(semente)}.',
    );
  });

  // ---------------------------------------------------------------------
  // 5. Os pontos que continuam em TEXTO, e por imposicao de plataforma
  // ---------------------------------------------------------------------
  //
  // O XML de recurso do Android e o catalogo de assets do iOS sao lidos pelo
  // sistema antes de existir processo Dart: nenhum dos dois le
  // design/tokens.json. A duplicacao fica; o que nao fica e ela divergir sem
  // ninguem ver.

  test('os quatro valores de cor do pubspec sao a semente', () {
    final texto = File('${raiz.path}/app/pubspec.yaml').readAsStringSync();
    final achados = RegExp(r'^\s+color(?:_dark)?: "(#[0-9A-Fa-f]{6})"',
            multiLine: true)
        .allMatches(texto)
        .map((m) => m.group(1)!)
        .toList();
    expect(
      achados.length,
      4,
      reason:
          'app/pubspec.yaml declara ${achados.length} valores de cor de splash '
          'e o bloco `flutter_native_splash` tem quatro: `color`, `color_dark` '
          'e os dois de `android_12`. Um a mais ou a menos muda o que este '
          'portao cobre.',
    );
    for (final v in achados) {
      expect(
        int.parse(v.substring(1), radix: 16),
        semente,
        reason:
            'app/pubspec.yaml tem $v onde design/tokens.json tem '
            '${hex(semente)}. O pubspec e a ENTRADA do gerador de splash: '
            'errado aqui, errado em todos os arquivos nativos.',
      );
    }
  });

  test('o windowSplashScreenBackground dos dois temas e a semente', () {
    for (final caminho in <String>[
      '$res/values-v31/styles.xml',
      '$res/values-night-v31/styles.xml',
    ]) {
      final texto = File(caminho).readAsStringSync();
      final m = RegExp(
              r'windowSplashScreenBackground">\s*(#[0-9A-Fa-f]{6})\s*<')
          .firstMatch(texto);
      expect(
        m,
        isNotNull,
        reason:
            '$caminho nao declara `windowSplashScreenBackground`. Sem ele o '
            'Android 12+ desenha a splash no fundo do TEMA, e o app abre '
            'branco ou preto em vez da cor da marca -- e emulador antigo nao '
            'acusa, porque abaixo da API 31 o mecanismo e outro.',
      );
      expect(
        int.parse(m!.group(1)!.substring(1), radix: 16),
        semente,
        reason:
            '$caminho tem ${m.group(1)} e a semente e ${hex(semente)}. Este '
            'arquivo e escrito por `flutter_native_splash:create` a partir do '
            'pubspec: se ele divergiu, o gerador nao rodou.',
      );
    }
  });

  // ---------------------------------------------------------------------
  // 6. O defeito do flutter_launcher_icons 0.14.4, que volta a cada execucao
  // ---------------------------------------------------------------------
  //
  // Nas configuracoes de build de NIVEL DE PROJETO, onde
  // `ASSETCATALOG_COMPILER_APPICON_NAME` nao existe, a 0.14.4 sobrescreve o
  // valor da primeira chave `ASSETCATALOG_COMPILER_*` que encontra. O Xcode le
  // `AppIcon` como booleano falso e desliga a geracao de simbolos de asset em
  // Swift, em silencio. Voltou nesta rodada, exatamente como em 21/09/2026: um
  // comentario no pubspec nao impediu, e por isso virou teste.

  test('o gerador de icone nao deixou o defeito 0.14.4 no project.pbxproj', () {
    final texto = File('${raiz.path}/app/ios/Runner.xcodeproj/project.pbxproj')
        .readAsStringSync();
    expect(
      texto.contains('GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = AppIcon'),
      isFalse,
      reason:
          'o flutter_launcher_icons 0.14.4 gravou '
          '`ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = '
          'AppIcon` no project.pbxproj. O Xcode le isso como booleano: tudo que '
          'nao for YES vale NO, e a geracao de simbolos de asset em Swift fica '
          'desligada sem ninguem pedir. Volte as duas para YES.',
    );
  });

  // ---------------------------------------------------------------------
  // 7. AUTOTESTE: a isca negativa, versionada
  // ---------------------------------------------------------------------
  //
  // "Prova negativa que vive numa frase evapora." As tres checagens acima
  // valem pela confianca do dia em que foram escritas enquanto ninguem
  // demonstrar que elas REPROVAM. A fixture abaixo e o bitmap de 1x1 na
  // Framboesa `#922C4A` -- literalmente o arquivo que estava no repositorio
  // antes desta troca -- e ele precisa ser recusado pelo mesmo caminho de
  // codigo que aprova os de producao.

  test('AUTOTESTE: o fundo na cor VELHA e reprovado', () {
    final fixture = File(
        '${raiz.path}/app/test/marca/fixtures/fundo_da_semente_velha.png');
    final png = PngCru.doArquivo(fixture);

    expect(
      png.rgbEm(0, 0),
      0x922C4A,
      reason:
          'a fixture deixou de ser a Framboesa #922C4A e virou '
          '${hex(png.rgbEm(0, 0))}. Alguem "consertou" a isca, e a partir daqui '
          'este arquivo nao prova mais nada.',
    );
    expect(
      _mesmaCor(png.rgbEm(0, 0), semente),
      isFalse,
      reason:
          'a semente de design/tokens.json voltou a ser #922C4A. Se isso for '
          'decisao, troque a fixture por outra cor divergente: uma isca igual '
          'ao valor de producao nao reprova nada, e as seis checagens acima '
          'passam a valer por confianca.',
    );
  });
}
