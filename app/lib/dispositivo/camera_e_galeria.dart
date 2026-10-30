/// A fronteira entre o app e o aparelho, para camera e galeria.
library;

import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

/// Os tres estados de permissao, mais o quarto que nao e permissao.
enum EstadoDaPermissao {
  /// A pessoa autorizou. O caminho principal roda.
  concedida,

  /// A pessoa recusou **desta vez**.
  negada,

  /// A pessoa recusou de forma permanente, ou o sistema bloqueou.
  negadaPermanentemente,

  /// Nao ha camera no aparelho, ou este build nao embarca o leitor.
  indisponivel,
}

/// Uma foto escolhida pela pessoa, ainda **no aparelho**.
class FotoLocal {
  const FotoLocal({
    required this.caminho,
    required this.tipoDeConteudo,
    required this.tamanhoEmBytes,
  });

  final String caminho;
  final String tipoDeConteudo;
  final int tamanhoEmBytes;
}

/// O retangulo que a pessoa escolheu, **em pixels do arquivo**.
@immutable
class RecorteDaFoto {
  const RecorteDaFoto({
    required this.x,
    required this.y,
    required this.largura,
    required this.altura,
  });

  /// O recorte que **nao recorta**: o arquivo inteiro, de um lado ao outro.
  const RecorteDaFoto.oArquivoInteiro({
    required int largura,
    required int altura,
  }) : this(x: 0, y: 0, largura: largura, altura: altura);

  final int x;
  final int y;
  final int largura;
  final int altura;

  /// Este recorte **grudado** dentro de um arquivo de [larguraDoArquivo] por
  /// [alturaDoArquivo].
  RecorteDaFoto grudadoEm(int larguraDoArquivo, int alturaDoArquivo) {
    final l = largura.clamp(1, larguraDoArquivo);
    final a = altura.clamp(1, alturaDoArquivo);
    return RecorteDaFoto(
      x: x.clamp(0, larguraDoArquivo - l),
      y: y.clamp(0, alturaDoArquivo - a),
      largura: l,
      altura: a,
    );
  }

  /// Verdadeiro quando este recorte cobre o arquivo todo -- ou seja, quando
  /// recortar nao mudaria nada.
  bool cobreTudo(int larguraDoArquivo, int alturaDoArquivo) =>
      x == 0 &&
      y == 0 &&
      largura >= larguraDoArquivo &&
      altura >= alturaDoArquivo;

  @override
  bool operator ==(Object other) =>
      other is RecorteDaFoto &&
      other.x == x &&
      other.y == y &&
      other.largura == largura &&
      other.altura == altura;

  @override
  int get hashCode => Object.hash(x, y, largura, altura);

  @override
  String toString() =>
      'RecorteDaFoto(x: $x, y: $y, largura: $largura, altura: $altura)';
}

/// O acesso a camera e a galeria do aparelho.
abstract class CameraEGaleria {
  /// O estado atual, **sem** abrir dialogo.
  Future<EstadoDaPermissao> estadoDaCamera();

  /// Pede a permissao, abrindo o dialogo do sistema quando ele ainda abre.
  Future<EstadoDaPermissao> pedirCamera();

  /// Abre os ajustes do sistema, no unico caso em que pedir de novo nao
  /// resolve.
  Future<void> abrirAjustesDoSistema();

  Future<FotoLocal?> tirarFoto();

  Future<FotoLocal?> escolherDaGaleria();

  /// Os bytes do arquivo que [tirarFoto] ou [escolherDaGaleria] produziram.
  Future<Uint8List> bytesDaFoto(FotoLocal foto);

  /// A foto recortada em [recorte], como um arquivo NOVO no aparelho.
  Future<FotoLocal?> recortarFoto(FotoLocal foto, RecorteDaFoto recorte);
}

/// O aparelho que **nao tem camera** -- e o duble que os testes montam.
class CameraNaoEmbarcada implements CameraEGaleria {
  const CameraNaoEmbarcada();

  @override
  Future<EstadoDaPermissao> estadoDaCamera() async =>
      EstadoDaPermissao.indisponivel;

  @override
  Future<EstadoDaPermissao> pedirCamera() async =>
      EstadoDaPermissao.indisponivel;

  @override
  Future<void> abrirAjustesDoSistema() async {}

  @override
  Future<FotoLocal?> tirarFoto() async => null;

  @override
  Future<FotoLocal?> escolherDaGaleria() async => null;

  /// **Estoura, e e o certo.** Esta implementacao nunca devolve [FotoLocal],
  /// entao chegar aqui com uma significa que ela veio de outro lugar -- e
  /// devolver bytes vazios faria o envio recusar em silencio, escondendo a
  /// fiacao errada.
  @override
  Future<Uint8List> bytesDaFoto(FotoLocal foto) async {
    throw StateError(
      'CameraNaoEmbarcada nao produz foto, entao nao ha bytes para ler de '
      '"${foto.caminho}". Chegar aqui significa que a FotoLocal veio de outra '
      'porta que nao esta montada.',
    );
  }

  /// **Estoura, pela mesma razao de [bytesDaFoto]**: esta implementacao nunca
  /// devolve [FotoLocal], entao chegar aqui com uma significa fiacao errada, e
  /// devolver a foto intacta esconderia isso atras de um recorte que nao
  /// aconteceu.
  @override
  Future<FotoLocal?> recortarFoto(FotoLocal foto, RecorteDaFoto recorte) async {
    throw StateError(
      'CameraNaoEmbarcada nao produz foto, entao nao ha o que recortar em '
      '"${foto.caminho}". Chegar aqui significa que a FotoLocal veio de outra '
      'porta que nao esta montada.',
    );
  }
}

/// O teto de bytes de **todo envio de imagem da aplicacao**: 5 MiB.
const int tetoDeBytesDaFoto = 5242880;

/// A ORIENTACAO que toda tela de envio de imagem mostra, antes do envio.
const String orientacaoDeTamanhoDaImagem = 'Envie uma imagem de até 5 MB.';

/// A lista fechada de `UploadIntentInput.content_type`.
const Set<String> tiposDeFotoAceitos = <String>{
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
};

/// A lista fechada de `NetworkEventCoverIntentInput.content_type`: **os mesmos
/// quatro MENOS o HEIC**.
const Set<String> tiposDeFotoAceitosSemHeic = <String>{
  'image/jpeg',
  'image/png',
  'image/webp',
};

/// A recusa por TIPO, dita **antes** de o envio sair, ou nulo quando o tipo
/// serve.
String? recusaDeTipoDaFoto(String tipoDeConteudo, Set<String> aceitos) {
  final tipo = tipoDeConteudo.trim().toLowerCase();
  if (aceitos.contains(tipo)) return null;
  final nomes = aceitos.map(_nomeDoTipo).toList()..sort();
  final lista = nomes.length > 1
      ? '${nomes.sublist(0, nomes.length - 1).join(', ')} ou ${nomes.last}'
      : nomes.join();
  return 'Esse tipo de imagem não é aceito aqui. Escolha uma foto $lista.';
}

String _nomeDoTipo(String tipo) => switch (tipo) {
      'image/jpeg' => 'JPEG',
      'image/png' => 'PNG',
      'image/heic' => 'HEIC',
      'image/webp' => 'WebP',
      _ => tipo,
    };

/// O lado maior, em pixels, com que a foto e recodificada antes de virar
/// [FotoLocal].
const int ladoMaiorDaFoto = 1920;

/// A qualidade da recodificacao JPEG.
const int qualidadeDaFoto = 80;

/// Traduz o estado do plugin de permissao para o enum do produto.
EstadoDaPermissao estadoDaPermissaoDoPlugin(PermissionStatus status) {
  return switch (status) {
    PermissionStatus.granted ||
    PermissionStatus.limited ||
    PermissionStatus.provisional =>
      EstadoDaPermissao.concedida,
    PermissionStatus.denied => EstadoDaPermissao.negada,
    PermissionStatus.permanentlyDenied => EstadoDaPermissao.negadaPermanentemente,
    PermissionStatus.restricted => EstadoDaPermissao.indisponivel,
  };
}

/// Converte o que o seletor devolveu em [FotoLocal], ou **nulo se o arquivo nao
/// serve para o contrato**.
FotoLocal? fotoLocalDoArquivo({
  required String caminho,
  required int tamanhoEmBytes,
  String? tipoDeConteudo,
}) {
  if (caminho.trim().isEmpty) return null;
  if (tamanhoEmBytes < 1) return null;
  if (tamanhoEmBytes > tetoDeBytesDaFoto) return null;

  final tipo = (tipoDeConteudo ?? '').trim().toLowerCase();
  final efetivo = tiposDeFotoAceitos.contains(tipo) ? tipo : 'image/jpeg';

  return FotoLocal(
    caminho: caminho,
    tipoDeConteudo: efetivo,
    tamanhoEmBytes: tamanhoEmBytes,
  );
}

/// A camera e a galeria de verdade, pelo aparelho (BICHUS-161).
class CameraDoAparelho implements CameraEGaleria {
  const CameraDoAparelho({ImagePicker? seletor})
      : _seletorInjetado = seletor;

  final ImagePicker? _seletorInjetado;

  ImagePicker get _seletor => _seletorInjetado ?? ImagePicker();

  /// Camera so existe onde ha aparelho.
  bool get _plataformaTemCamera =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;

  @override
  Future<EstadoDaPermissao> estadoDaCamera() async {
    if (!_plataformaTemCamera) return EstadoDaPermissao.indisponivel;
    return _semExplodir(
      () async => estadoDaPermissaoDoPlugin(await Permission.camera.status),
      quando: 'consultar o estado da camera',
      padrao: EstadoDaPermissao.indisponivel,
    );
  }

  @override
  Future<EstadoDaPermissao> pedirCamera() async {
    if (!_plataformaTemCamera) return EstadoDaPermissao.indisponivel;
    return _semExplodir(
      () async => estadoDaPermissaoDoPlugin(await Permission.camera.request()),
      quando: 'pedir a permissao de camera',
      padrao: EstadoDaPermissao.indisponivel,
    );
  }

  @override
  Future<void> abrirAjustesDoSistema() async {
    if (!_plataformaTemCamera) return;
    await _semExplodir(
      () async => openAppSettings(),
      quando: 'abrir os ajustes do sistema',
      padrao: false,
    );
  }

  @override
  Future<FotoLocal?> tirarFoto() => _escolher(ImageSource.camera);

  @override
  Future<FotoLocal?> escolherDaGaleria() => _escolher(ImageSource.gallery);

  /// **Sem `_semExplodir` aqui, de proposito.** As outras operacoes degradam
  /// para "ausencia de recurso" porque a tela tem caminho alternativo; um
  /// arquivo que nao abre nao tem alternativa nenhuma, e devolver vazio faria o
  /// envio recusar sem ninguem saber por que.
  @override
  Future<Uint8List> bytesDaFoto(FotoLocal foto) {
    return File(foto.caminho).readAsBytes();
  }

  /// ## Por que isto e Dart PURO e nao um plugin de recorte
  @override
  Future<FotoLocal?> recortarFoto(FotoLocal foto, RecorteDaFoto recorte) async {
    final bytes = await bytesDaFoto(foto);
    final recortado = await compute(
      _recortarEmJpeg,
      _PedidoDeRecorte(bytes: bytes, recorte: recorte),
    );
    if (recortado == null) return null;
    if (recortado.isEmpty) return foto;

    final pasta = await getTemporaryDirectory();
    final destino = File(
      '${pasta.path}/bichu-recorte-${DateTime.now().microsecondsSinceEpoch}.jpg',
    );
    await destino.writeAsBytes(recortado, flush: true);

    return fotoLocalDoArquivo(
      caminho: destino.path,
      tamanhoEmBytes: recortado.length,
      tipoDeConteudo: 'image/jpeg',
    );
  }

  Future<FotoLocal?> _escolher(ImageSource origem) async {
    if (!_plataformaTemCamera) return null;
    return _semExplodir<FotoLocal?>(
      () async {
        final arquivo = await _seletor.pickImage(
          source: origem,
          maxWidth: ladoMaiorDaFoto.toDouble(),
          maxHeight: ladoMaiorDaFoto.toDouble(),
          imageQuality: qualidadeDaFoto,
          requestFullMetadata: false,
        );
        if (arquivo == null) return null;

        return fotoLocalDoArquivo(
          caminho: arquivo.path,
          tamanhoEmBytes: await File(arquivo.path).length(),
          tipoDeConteudo: arquivo.mimeType,
        );
      },
      quando: 'escolher a foto (${origem.name})',
      padrao: null,
    );
  }

  /// Nenhuma falha de canal derruba o app, **e nenhuma some**.
  Future<T> _semExplodir<T>(
    Future<T> Function() acao, {
    required String quando,
    required T padrao,
  }) async {
    try {
      return await acao();
    } on MissingPluginException catch (erro) {
      debugPrint('BICHU camera: canal ausente ao $quando. $erro');
      return padrao;
    } on PlatformException catch (erro) {
      debugPrint('BICHU camera: falha de plataforma ao $quando. $erro');
      return padrao;
    }
  }
}

/// O que atravessa para o isolado do recorte.
@immutable
class _PedidoDeRecorte {
  const _PedidoDeRecorte({required this.bytes, required this.recorte});

  final Uint8List bytes;
  final RecorteDaFoto recorte;
}

/// Decodifica, corta e recodifica em JPEG.
Uint8List? _recortarEmJpeg(_PedidoDeRecorte pedido) {
  final decodificada = img.decodeImage(pedido.bytes);
  if (decodificada == null) return null;

  final r = pedido.recorte.grudadoEm(decodificada.width, decodificada.height);
  if (r.cobreTudo(decodificada.width, decodificada.height)) {
    return Uint8List(0);
  }

  final cortada = img.copyCrop(
    decodificada,
    x: r.x,
    y: r.y,
    width: r.largura,
    height: r.altura,
  );
  return img.encodeJpg(cortada, quality: qualidadeDaFoto);
}
