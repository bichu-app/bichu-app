import 'dart:typed_data';

import 'package:flutter/painting.dart';

/// Onde a imagem do QR **para** depois de baixada, e quem a tira de la.
///
/// ## A medicao, e nao a suposicao
///
/// O QR carrega o codigo da tag dentro dele: quem le a imagem tem a credencial,
/// e o ADR-0004 diz que codigo de tag e irreversivel. Entao a pergunta nao e
/// "como desenhar a imagem", e sim **onde ela fica depois**. Os lugares
/// possiveis, medidos e nao deduzidos:
///
/// 1. **Cache de imagem em memoria do Flutter**
///    ([PaintingBinding.imageCache]). E aqui que ela fica, e o teste
///    `qr_na_tela_test.dart` mede: qualquer `ImageProvider` resolvido por um
///    widget `Image` entra nesse cache, que e **global e nao tem nocao de
///    sessao**. Ele guarda ate 1000 entradas / 100 MiB e so descarta por LRU.
///    Sem esta classe, o QR de um tutor continuaria decodificado na memoria do
///    processo depois de ele sair da conta.
/// 2. **Cache em disco**: nao existe neste caminho, e a ausencia e deliberada.
///    `package:http` sobre o `HttpClient` do `dart:io` nao guarda resposta em
///    disco, e [MemoryImage] nunca escreve. O jeito conhecido de a imagem
///    chegar ao disco e alguem trocar isto por `cached_network_image` /
///    `flutter_cache_manager` para "resolver o cabecalho" -- esses pacotes
///    gravam o arquivo em `getApplicationCacheDirectory()` e **sobrevivem ao
///    logout**. Ha isca para os dois: uma varre o disco do app durante o
///    fluxo, outra le o `pubspec.yaml`.
/// 3. **Captura de tela e recentes do sistema**: fora do alcance deste codigo.
///    O codigo por extenso ja esta na mesma tela, em texto selecionavel, desde
///    a F1.6 original -- a imagem nao acrescenta exposicao nova ali.
///
/// ## Por que nao morre junto com a tela
///
/// Porque o cache de imagem **nao** morre junto com a tela. Descartar o widget
/// tira a referencia viva e deixa a entrada no cache, disponivel para a
/// proxima pessoa que abrir o app neste aparelho. Foi exatamente essa a forma
/// do defeito do `cacheDeMeusPets`, que era limpo no `onPressed` do botao de
/// sair e por isso sobrevivia a sessao derrubada por refresh recusado. A
/// limpeza mora na lista `limpezasAoSair` do controlador de sessao, que roda
/// nos **quatro** desfechos.
class CofreDaImagemDoQr {
  MemoryImage? _provedor;
  Uint8List? _bytes;

  /// O provedor que a tela entrega ao `Image`. Nulo quando nao ha imagem.
  MemoryImage? get provedor => _provedor;

  /// Guarda [bytes] e devolve o provedor a ser desenhado.
  ///
  /// Uma imagem por vez: guardar a segunda despeja a primeira do cache global.
  Future<MemoryImage> guardar(Uint8List bytes) async {
    await limpar();
    final provedor = MemoryImage(bytes);
    _provedor = provedor;
    _bytes = bytes;
    return provedor;
  }

  /// Tira a imagem de todo lugar em que ela esta.
  ///
  /// [ImageProvider.evict] remove a entrada do cache global -- a chave de
  /// [MemoryImage] e a identidade do proprio `Uint8List`, entao zerar o buffer
  /// **depois** do despejo nao atrapalha a busca. O zero-fill vem em seguida
  /// para que o PNG deixe de estar legivel na memoria do processo agora, e nao
  /// quando o coletor de lixo resolver passar.
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
