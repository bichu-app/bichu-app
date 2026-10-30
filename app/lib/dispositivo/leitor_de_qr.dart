/// A fronteira entre o app e a leitura de QR pela camera do aparelho.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Um simbolo lido pela camera, **ainda cru**.
@immutable
class LeituraDeQr {
  const LeituraDeQr(this.conteudo);

  /// O texto que o simbolo carrega.
  final String conteudo;

  @override
  bool operator ==(Object other) =>
      other is LeituraDeQr && other.conteudo == conteudo;

  @override
  int get hashCode => conteudo.hashCode;

  @override
  String toString() => 'LeituraDeQr($conteudo)';
}

/// A superficie que mostra os quadros da camera ao vivo.
class SuperficieDeLeituraAoVivo extends StatelessWidget {
  const SuperficieDeLeituraAoVivo({
    required this.embarcado,
    required this.child,
    super.key,
  });

  /// Se ha leitura de verdade acontecendo atras deste widget.
  final bool embarcado;

  final Widget child;

  @override
  Widget build(BuildContext context) => child;
}

/// A leitura de QR pela camera.
abstract class LeitorDeQr {
  /// Se **este build** consegue ler QR pela camera.
  bool get embarcado;

  /// O visor ao vivo, ja embrulhado em [SuperficieDeLeituraAoVivo].
  Widget visor({required ValueChanged<LeituraDeQr> aoLer});
}

/// O build que **nao le QR** -- e o duble dos alvos sem camera.
class LeitorDeQrNaoEmbarcado implements LeitorDeQr {
  const LeitorDeQrNaoEmbarcado();

  @override
  bool get embarcado => false;

  @override
  Widget visor({required ValueChanged<LeituraDeQr> aoLer}) {
    throw StateError(
      'REPROVA: a tela pediu o visor de um leitor que nao existe neste build. '
      'Quem chama `visor()` confere `embarcado` antes; desenhar moldura sem '
      'camera atras e exatamente o defeito que o cliente achou em aparelho '
      'fisico em 22/09/2026 (BICHUS-220).',
    );
  }
}

/// O leitor de verdade, pela camera do aparelho (BICHUS-54).
class LeitorDeQrDoAparelho implements LeitorDeQr {
  const LeitorDeQrDoAparelho();

  /// Camera ao vivo so existe onde ha aparelho.
  static bool get plataformaTemLeitor =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;

  @override
  bool get embarcado => plataformaTemLeitor;

  @override
  Widget visor({required ValueChanged<LeituraDeQr> aoLer}) {
    if (!embarcado) return const LeitorDeQrNaoEmbarcado().visor(aoLer: aoLer);
    return SuperficieDeLeituraAoVivo(
      embarcado: true,
      child: MobileScanner(
        fit: BoxFit.cover,
        controller: MobileScannerController(
          formats: const <BarcodeFormat>[BarcodeFormat.qrCode],
          detectionSpeed: DetectionSpeed.normal,
        ),
        onDetect: (captura) {
          for (final codigo in captura.barcodes) {
            final conteudo = codigo.rawValue;
            if (conteudo == null || conteudo.isEmpty) continue;
            aoLer(LeituraDeQr(conteudo));
            return;
          }
        },
      ),
    );
  }
}
