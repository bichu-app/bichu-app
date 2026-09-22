// Decodificador de PNG minimo, para o portao de marca conseguir LER PIXEL.
//
// Por que escrever isto em vez de usar o decodificador do Flutter: o portao
// precisa rodar em `flutter test` puro, sem binding de widget e sem depender
// do pipeline de imagem da engine, e precisa reprovar com o motivo quando
// encontra um arquivo que ele nao sabe ler. `dart:ui` devolveria bytes, mas
// uma falha dele apareceria como excecao generica no meio de um teste de
// cor -- e o diagnostico e metade do valor de um portao.
//
// O QUE ELE COBRE, e a lista e curta de proposito: 8 bits por canal, sem
// entrelacamento, tipo de cor 2 (RGB) ou 6 (RGBA). E exatamente o que os tres
// geradores do produto escrevem hoje. Qualquer outra coisa REPROVA nomeando o
// que encontrou, porque um decodificador que adivinha formato entrega cor
// errada em silencio, que e o defeito que este arquivo existe para impedir.
//
// Inflar e do `ZLibCodec` de `dart:io`, que esta disponivel na VM onde o
// `flutter test` roda. Nenhuma dependencia nova entra no `pubspec.yaml`: este
// arquivo e de teste e nao chega perto do binario.

import 'dart:io';
import 'dart:typed_data';

/// Um PNG decodificado em RGBA de 8 bits, quatro bytes por pixel.
class PngCru {
  PngCru._(this.caminho, this.largura, this.altura, this._rgba);

  final String caminho;
  final int largura;
  final int altura;
  final Uint8List _rgba;

  static const List<int> _assinatura = <int>[137, 80, 78, 71, 13, 10, 26, 10];

  /// Le e decodifica o arquivo. Lanca [StateError] com o motivo em qualquer
  /// caso que ele nao saiba tratar.
  factory PngCru.doArquivo(File arquivo) {
    if (!arquivo.existsSync()) {
      throw StateError(
        'REPROVA: nao achei ${arquivo.path}. O portao de marca ficaria verde '
        'sem olhar para nada, e ausencia de arquivo nunca e aprovacao.',
      );
    }
    final bytes = arquivo.readAsBytesSync();
    final caminho = arquivo.path;

    for (var i = 0; i < _assinatura.length; i++) {
      if (i >= bytes.length || bytes[i] != _assinatura[i]) {
        throw StateError('REPROVA: $caminho nao comeca com a assinatura PNG.');
      }
    }

    final dados = ByteData.sublistView(bytes);
    int largura = 0, altura = 0, profundidade = 0, tipoDeCor = -1, entrelace = 0;
    final idat = BytesBuilder(copy: false);
    var i = 8;
    while (i + 8 <= bytes.length) {
      final tamanho = dados.getUint32(i);
      final tipo = String.fromCharCodes(bytes, i + 4, i + 8);
      final inicio = i + 8;
      if (tipo == 'IHDR') {
        largura = dados.getUint32(inicio);
        altura = dados.getUint32(inicio + 4);
        profundidade = bytes[inicio + 8];
        tipoDeCor = bytes[inicio + 9];
        entrelace = bytes[inicio + 12];
      } else if (tipo == 'IDAT') {
        idat.add(Uint8List.sublistView(bytes, inicio, inicio + tamanho));
      } else if (tipo == 'IEND') {
        break;
      }
      i = inicio + tamanho + 4;
    }

    if (profundidade != 8 || entrelace != 0 || (tipoDeCor != 2 && tipoDeCor != 6)) {
      throw StateError(
        'REPROVA: $caminho esta em profundidade=$profundidade, '
        'tipo_de_cor=$tipoDeCor, entrelacamento=$entrelace. Este portao so sabe '
        'ler 8 bits, sem entrelacamento, tipo 2 (RGB) ou 6 (RGBA) -- que e o '
        'que flutter_launcher_icons, flutter_native_splash e '
        'design/marca/app/gerar-arte-do-app.py escrevem. Se o formato mudou de '
        'verdade, atualize este decodificador; NAO relaxe a checagem, porque '
        'um decodificador que adivinha formato aprova cor errada em silencio.',
      );
    }

    final canais = tipoDeCor == 6 ? 4 : 3;
    final cru = Uint8List.fromList(ZLibCodec().decode(idat.takeBytes()));
    final porLinha = largura * canais;
    final esperado = (porLinha + 1) * altura;
    if (cru.length < esperado) {
      throw StateError(
        'REPROVA: $caminho inflou para ${cru.length} bytes e o cabecalho '
        'declara ${largura}x$altura com $canais canais, que exige $esperado.',
      );
    }

    final rgba = Uint8List(largura * altura * 4);
    final linha = Uint8List(porLinha);
    final anterior = Uint8List(porLinha);
    var p = 0;
    for (var y = 0; y < altura; y++) {
      final filtro = cru[p++];
      for (var x = 0; x < porLinha; x++) {
        final bruto = cru[p + x];
        final a = x >= canais ? linha[x - canais] : 0;
        final b = anterior[x];
        final c = x >= canais ? anterior[x - canais] : 0;
        final int valor;
        switch (filtro) {
          case 0:
            valor = bruto;
          case 1:
            valor = bruto + a;
          case 2:
            valor = bruto + b;
          case 3:
            valor = bruto + ((a + b) >> 1);
          case 4:
            final pa = (b - c).abs();
            final pb = (a - c).abs();
            final pc = (a + b - 2 * c).abs();
            valor = bruto + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
          default:
            throw StateError('REPROVA: $caminho usa o filtro $filtro na linha $y.');
        }
        linha[x] = valor & 0xFF;
      }
      p += porLinha;
      for (var x = 0; x < largura; x++) {
        final o = (y * largura + x) * 4;
        final s = x * canais;
        rgba[o] = linha[s];
        rgba[o + 1] = linha[s + 1];
        rgba[o + 2] = linha[s + 2];
        rgba[o + 3] = canais == 4 ? linha[s + 3] : 255;
      }
      anterior.setAll(0, linha);
    }

    return PngCru._(caminho, largura, altura, rgba);
  }

  /// `0xRRGGBB` do pixel, ignorando o alfa.
  int rgbEm(int x, int y) {
    final o = (y * largura + x) * 4;
    return (_rgba[o] << 16) | (_rgba[o + 1] << 8) | _rgba[o + 2];
  }

  int alfaEm(int x, int y) => _rgba[(y * largura + x) * 4 + 3];

  /// Quantos pixels opacos ficam a ate [tolerancia] de [rgb] em CADA canal.
  ///
  /// A tolerancia nao e frouxidao: o `image` usado pelo flutter_launcher_icons
  /// reamostra o quadrado chapado e devolve `#9E0B39` em parte das densidades
  /// onde a entrada e `#9E0B3A` -- um ponto de diferenca no azul, medido em
  /// 21/09/2026 no hdpi (2704 dos 26244 pixels) e ausente no mdpi. E
  /// arredondamento do gerador, nao cor errada. Com 1 de folga o portao ainda
  /// separa a semente de qualquer outra decisao de marca: a Framboesa que esta
  /// troca removeu dista 12, 33 e 16 nos tres canais.
  int quantosPerto(int rgb, {int tolerancia = 1}) {
    final r = (rgb >> 16) & 0xFF, g = (rgb >> 8) & 0xFF, b = rgb & 0xFF;
    var n = 0;
    for (var i = 0; i < _rgba.length; i += 4) {
      if (_rgba[i + 3] == 0) continue;
      if ((_rgba[i] - r).abs() <= tolerancia &&
          (_rgba[i + 1] - g).abs() <= tolerancia &&
          (_rgba[i + 2] - b).abs() <= tolerancia) {
        n++;
      }
    }
    return n;
  }

  /// Quantos pixels opacos valem exatamente [rgb].
  int quantosSao(int rgb) => quantosPerto(rgb, tolerancia: 0);

  /// A cor opaca mais frequente, e quantos pixels ela ocupa.
  ({int rgb, int pixels}) corDominante() {
    final contagem = <int, int>{};
    for (var i = 0; i < _rgba.length; i += 4) {
      if (_rgba[i + 3] == 0) continue;
      final v = (_rgba[i] << 16) | (_rgba[i + 1] << 8) | _rgba[i + 2];
      contagem[v] = (contagem[v] ?? 0) + 1;
    }
    var melhor = 0, quantos = -1;
    contagem.forEach((v, n) {
      if (n > quantos) {
        melhor = v;
        quantos = n;
      }
    });
    return (rgb: melhor, pixels: quantos < 0 ? 0 : quantos);
  }

  int get pixels => largura * altura;
}

/// `#RRGGBB` a partir de um inteiro, para mensagem de erro legivel.
String hex(int rgb) => '#${rgb.toRadixString(16).toUpperCase().padLeft(6, '0')}';
