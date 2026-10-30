import 'dart:typed_data';

import 'package:flutter/painting.dart';

/// Onde a imagem do QR **para** depois de baixada, e quem a tira de la.
class CofreDaImagemDoQr {
  MemoryImage? _provedor;
  Uint8List? _bytes;

  /// O provedor que a tela entrega ao `Image`.
  MemoryImage? get provedor => _provedor;

  /// Guarda [bytes] e devolve o provedor a ser desenhado.
  Future<MemoryImage> guardar(Uint8List bytes) async {
    await limpar();
    final provedor = MemoryImage(bytes);
    _provedor = provedor;
    _bytes = bytes;
    return provedor;
  }

  /// Tira a imagem de todo lugar em que ela esta.
  Future<void> limpar() async {
    final provedor = _provedor;
    final bytes = _bytes;
    _provedor = null;
    _bytes = null;
    if (provedor != null) {
      await provedor.evict();
    }
    if (bytes != null) {
      bytes.fillRange(0, bytes.length, 0);
    }
  }
}
