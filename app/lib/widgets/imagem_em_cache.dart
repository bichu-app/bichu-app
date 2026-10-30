import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import '../api/cache_de_imagens.dart';

/// O QUE BUSCA OS BYTES PELA REDE quando o cache nao tem.
typedef BuscadorDeBytes = Future<Uint8List?> Function(String url);

Future<Uint8List?> _buscarPelaRede(String url) async {
  final resposta = await http.get(Uri.parse(url));
  if (resposta.statusCode != 200) return null;
  if (resposta.bodyBytes.isEmpty) return null;
  return resposta.bodyBytes;
}

/// **O CACHE DE IMAGEM NO ESCOPO DA ARVORE.**
class CacheDeImagensDoAplicativo extends InheritedWidget {
  const CacheDeImagensDoAplicativo({
    required this.cache,
    required super.child,
    this.buscador = _buscarPelaRede,
    super.key,
  });

  final CacheDeImagensNoAparelho cache;

  /// Como os bytes chegam na primeira vez.
  final BuscadorDeBytes buscador;

  /// O cache do escopo, ou **nulo quando nao ha**.
  static CacheDeImagensDoAplicativo? talvezDe(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CacheDeImagensDoAplicativo>();

  @override
  bool updateShouldNotify(CacheDeImagensDoAplicativo anterior) =>
      cache != anterior.cache || buscador != anterior.buscador;
}

/// **UM `ImageProvider` QUE LE O DISCO ANTES DA REDE.**
@immutable
class ImagemEmCache extends ImageProvider<ImagemEmCache> {
  const ImagemEmCache({
    required this.url,
    required this.chave,
    required this.cache,
    required this.buscador,
  });

  /// De onde buscar quando o disco nao tem.
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
      return decode(await ui.ImmutableBuffer.fromUint8List(doDisco));
    }
    final bytes = await buscador(url);
    if (bytes == null) {
      scheduleMicrotask(() => PaintingBinding.instance.imageCache.evict(this));
      throw ImagemNaoChegou(url);
    }
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
class ImagemNaoChegou implements Exception {
  const ImagemNaoChegou(this.url);

  final String url;

  @override
  String toString() => 'ImagemNaoChegou: os bytes de $url nao chegaram.';
}
