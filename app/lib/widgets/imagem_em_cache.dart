import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import '../api/cache_de_imagens.dart';

/// O QUE BUSCA OS BYTES PELA REDE quando o cache nao tem.
///
/// Injetavel porque teste de widget nao fala com a rede: sem isto, cada caso
/// que pinta uma imagem ficaria esperando um `HttpClient` real -- que em
/// `flutter_test` responde 400 por um cliente falso global, e o quadro ficaria
/// sempre no estado de falha.
typedef BuscadorDeBytes = Future<Uint8List?> Function(String url);

Future<Uint8List?> _buscarPelaRede(String url) async {
  final resposta = await http.get(Uri.parse(url));
  if (resposta.statusCode != 200) return null;
  if (resposta.bodyBytes.isEmpty) return null;
  return resposta.bodyBytes;
}

/// **O CACHE DE IMAGEM NO ESCOPO DA ARVORE.**
///
/// Um `InheritedWidget` proprio, e nao um campo em `Escopo`, por uma razao de
/// alcance: `ImagemDaRede` mora em `lib/widgets/` e e desenhada por quinze
/// telas, varias delas montadas isoladamente em teste de widget. Lendo o
/// `Escopo` inteiro ela passaria a exigir que todo caso que pinta uma imagem
/// montasse a raiz do aplicativo.
///
/// **A AUSENCIA E O COMPORTAMENTO DE ANTES, e isso e deliberado.**
/// [talvezDe] devolve nulo quando este widget nao esta na arvore, e ai
/// `ImagemDaRede` desenha `Image.network` exatamente como desenhava. Nenhum dos
/// 210 arquivos de teste que existiam precisou mudar por causa disto, e nenhum
/// deles passou a tocar o disco.
class CacheDeImagensDoAplicativo extends InheritedWidget {
  const CacheDeImagensDoAplicativo({
    required this.cache,
    required super.child,
    this.buscador = _buscarPelaRede,
    super.key,
  });

  final CacheDeImagensNoAparelho cache;

  /// Como os bytes chegam na primeira vez. Trocavel em teste.
  final BuscadorDeBytes buscador;

  /// O cache do escopo, ou **nulo quando nao ha**. Nulo nao e erro: ver o
  /// cabecalho.
  static CacheDeImagensDoAplicativo? talvezDe(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CacheDeImagensDoAplicativo>();

  @override
  bool updateShouldNotify(CacheDeImagensDoAplicativo anterior) =>
      cache != anterior.cache || buscador != anterior.buscador;
}

/// **UM `ImageProvider` QUE LE O DISCO ANTES DA REDE.**
///
/// ## Por que um provedor proprio, e nao um pacote
///
/// Porque `app/test/telas/qr_na_tela_test.dart` tem um portao que le o
/// `pubspec.yaml` e reprova `cached_network_image`, `flutter_cache_manager`,
/// `extended_image`, `dio_cache_interceptor` e `http_cache_stream` **por
/// nome**. O motivo dele esta certo e nao se reabre: esses pacotes gravam em
/// `getApplicationCacheDirectory()` **todo** `ImageProvider` que passa por
/// eles, e o aplicativo tem uma imagem que nao pode encostar no disco -- o QR
/// da tag, que carrega a credencial dentro dos pixeis (ADR-0004).
///
/// Um pacote generico nao sabe distinguir foto de pet de credencial, e nao sabe
/// o que e um apelido. Este provedor e opt-in: quem nao passa uma
/// [ChaveDeImagem] nao chega aqui.
///
/// ## A IDENTIDADE DA ENTRADA E A CHAVE, E NAO A URL
///
/// `==` e `hashCode` saem de [ChaveDeImagem] e **ignoram a URL**. Isso importa
/// duas vezes:
///
/// 1. o `imageCache` global do Flutter indexa por esta chave, entao a MESMA
///    imagem vista com uma assinatura nova acerta a entrada em memoria -- com a
///    URL na chave, cada releitura da tela decodificaria tudo de novo;
/// 2. a identidade do arquivo em disco e a mesma do provedor, entao nao ha como
///    o cache em memoria e o cache em disco discordarem de quem e quem.
@immutable
class ImagemEmCache extends ImageProvider<ImagemEmCache> {
  const ImagemEmCache({
    required this.url,
    required this.chave,
    required this.cache,
    required this.buscador,
  });

  /// De onde buscar quando o disco nao tem. **Pode ser assinada e pode estar
  /// vencida** -- e exatamente por isso ela nao entra na chave.
  final String url;

  final ChaveDeImagem chave;
  final CacheDeImagensNoAparelho cache;
  final BuscadorDeBytes buscador;

  @override
  Future<ImagemEmCache> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture<ImagemEmCache>(this);

  @override
  ImageStreamCompleter loadImage(ImagemEmCache key, ImageDecoderCallback decode) {
    return MultiFrameImageStreamCompleter(
      codec: key._carregar(decode),
      scale: 1,
      debugLabel: key.chave.toString(),
      informationCollector: () => <DiagnosticsNode>[
        DiagnosticsProperty<ImageProvider<Object>>('Provedor', key),
        DiagnosticsProperty<String>('Chave', key.chave.caminhoRelativo),
      ],
    );
  }

  Future<ui.Codec> _carregar(ImageDecoderCallback decode) async {
    final doDisco = await cache.ler(chave);
    if (doDisco != null) {
      // **O CAMINHO SEM REDE.** E este ramo que entrega o que o cliente pediu:
      // foto visivel com o aviao ligado, e a abertura que nao espera o
      // servidor.
      return decode(await ui.ImmutableBuffer.fromUint8List(doDisco));
    }
    final bytes = await buscador(url);
    if (bytes == null) {
      // `evict` antes de lancar: sem isto o `imageCache` guarda o completer com
      // erro e a entrada envenenada responde a toda tentativa seguinte -- a
      // pessoa que volta a tela com a rede de volta continuaria vendo o quadro
      // quebrado.
      scheduleMicrotask(() => PaintingBinding.instance.imageCache.evict(this));
      throw ImagemNaoChegou(url);
    }
    // Gravar NAO bloqueia a pintura: a imagem aparece com os bytes que estao na
    // mao, e o arquivo cai no disco quando cair. `gravar` ja nao lanca -- ele
    // devolve `false` -- e recusa sozinho o que nao esta `ready`.
    unawaited(cache.gravar(chave, bytes));
    return decode(await ui.ImmutableBuffer.fromUint8List(bytes));
  }

  @override
  bool operator ==(Object other) =>
      other is ImagemEmCache && other.chave == chave && other.cache == cache;

  @override
  int get hashCode => Object.hash(chave, cache);

  @override
  String toString() => 'ImagemEmCache(${chave.caminhoRelativo})';
}

/// A falha de rede com a URL dentro, para o `errorBuilder` e para o log.
///
/// Classe propria e nao `Exception` solta: o `informationCollector` do
/// completer imprime o `toString`, e "Exception" sem assunto num relatorio de
/// falha de imagem nao diz qual imagem.
class ImagemNaoChegou implements Exception {
  const ImagemNaoChegou(this.url);

  final String url;

  @override
  String toString() => 'ImagemNaoChegou: os bytes de $url nao chegaram.';
}
