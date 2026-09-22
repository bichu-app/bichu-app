/// A fronteira entre o app e a leitura de QR pela camera do aparelho.
///
/// **Por que uma porta nova, e nao um metodo a mais em `CameraEGaleria`.**
/// As duas coisas parecem a mesma e nao sao. `CameraEGaleria` entrega um
/// **arquivo** depois que a pessoa apertou o botao num aplicativo de camera do
/// sistema, que roda fora do processo. Ler QR e um **visor ao vivo dentro do
/// processo**: um fluxo continuo de quadros, um widget que ocupa a tela, um
/// ciclo de vida que precisa parar quando o app vai para segundo plano, e um
/// plugin diferente. Juntar os dois numa porta so obrigaria toda tela que tira
/// foto a carregar o vocabulario do visor, e vice-versa.
///
/// **A permissao continua sendo de `CameraEGaleria`, e isso e deliberado.** E a
/// mesma permissao de sistema (`android.permission.CAMERA`,
/// `NSCameraUsageDescription`) e o mesmo dialogo: a pessoa que liberou a camera
/// para a foto do pet nao pode ser perguntada de novo aqui. Duas portas
/// consultando `Permission.camera` dariam duas respostas que precisam ser
/// iguais, e um dia nao seriam. Esta porta le quadros; quem pergunta se pode e
/// a outra.
///
/// ## O que esta porta permite provar sem aparelho
///
/// Camera nao se verifica em simulador nem em teste de widget. O que se
/// verifica aqui e que **a tela reage certo** a cada desfecho: o leitor
/// embarcado que le, o leitor embarcado que nao acha nada, o codigo que nao e
/// do Bichu, e o build sem leitor nenhum. O duble de teste mora em
/// `test/telas/ajuda_de_tela.dart`.
///
/// ## A marca que sustenta a isca de geometria
///
/// [SuperficieDeLeituraAoVivo] existe para que um portao consiga perguntar, na
/// arvore de render, se **ha camera atras da moldura**. Ate a BICHUS-220 a tela
/// desenhava moldura e fundo preto sem widget de camera nenhum, e todos os
/// oito casos daquela tela ficaram verdes porque perguntavam por texto. A
/// pergunta certa e geometrica, e ela so tem resposta se a superficie de
/// leitura se declarar na arvore.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Um simbolo lido pela camera, **ainda cru**.
///
/// E o conteudo do QR, e nao um codigo de tag: decidir se aquilo e do Bichu e
/// trabalho de `telas/escanear/codigo_lido_do_qr.dart`, e resolver o codigo e
/// do servidor. Esta porta nao interpreta o que leu, de proposito -- uma porta
/// que ja devolvesse "codigo da tag" esconderia o caso do criterio 3, que e
/// justamente o QR de outra coisa.
@immutable
class LeituraDeQr {
  const LeituraDeQr(this.conteudo);

  /// O texto que o simbolo carrega.
  final String conteudo;

  @override
  // `other`, e nao `outro`: `avoid_renaming_method_parameters` cobra o nome
  // do metodo sobrescrito, e o resto do arquivo escreve em portugues.
  bool operator ==(Object other) =>
      other is LeituraDeQr && other.conteudo == conteudo;

  @override
  int get hashCode => conteudo.hashCode;

  @override
  String toString() => 'LeituraDeQr($conteudo)';
}

/// A superficie que mostra os quadros da camera ao vivo.
///
/// **Ela nao desenha nada.** E um marcador: embrulha o widget de preview que a
/// implementacao produziu e declara, na arvore de render, que existe camera
/// ali. `test/telas/leitor_nao_finge_camera_test.dart` procura por ela embaixo
/// de toda moldura de leitura, e reprova a moldura que nao tiver uma.
///
/// [embarcado] viaja junto porque o marcador sozinho nao basta: um duble que
/// se declare superficie sem ter leitor por tras seria a mesma mentira com
/// outra roupa. O portao cobra os dois.
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
  ///
  /// Falso nao e erro e nao e recusa de permissao: e ausencia de recurso, e a
  /// tela precisa dizer isso em vez de mandar a pessoa aos ajustes do sistema
  /// procurar uma permissao que nao destrava nada.
  bool get embarcado;

  /// O visor ao vivo, ja embrulhado em [SuperficieDeLeituraAoVivo].
  ///
  /// **Reprova alto quando nao ha leitor.** Devolver um `SizedBox` aqui seria
  /// o comportamento que a BICHUS-220 veio tirar da tela: moldura desenhada
  /// sobre coisa nenhuma. Quem chama confere [embarcado] antes.
  Widget visor({required ValueChanged<LeituraDeQr> aoLer});
}

/// O build que **nao le QR** -- e o duble dos alvos sem camera.
///
/// Ele nao finge: [embarcado] e falso e [visor] estoura com o motivo escrito.
/// E por ele existir que a tela continua montavel em macOS, na web e no teste
/// de widget, e que o caminho "este aparelho nao le" tem onde ser exercitado.
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
///
/// **Por que `mobile_scanner`, e o que ele traz junto.** Nas duas plataformas
/// ele usa o decodificador do proprio sistema -- CameraX + ML Kit no Android,
/// `AVFoundation` com a Vision no iOS -- e nao um decodificador em Dart sobre
/// os bytes do quadro. Isso importa por dois motivos que so aparecem na rua:
/// a decodificacao roda fora da thread da interface (um decodificador em Dart
/// derruba o quadro a quadro para uns poucos por segundo num aparelho barato),
/// e o foco proximo, o corte e a correcao de perspectiva ja vem do sistema. A
/// plaquinha tem 27,77 mm de simbolo com modulo de 0,677 mm: e leitura de
/// perto, com a mao tremendo e um animal se mexendo.
///
/// **So QR.** `formats` fecha a lista em [BarcodeFormat.qrCode]: a historia
/// exclui codigo de barras de outros sistemas por escrito, e um leitor que
/// aceita tudo devolve o EAN do coleira que estava no enquadramento como se
/// fosse codigo de tag.
///
/// **O ciclo de vida e do widget, e nao desta classe.** `MobileScanner` para a
/// camera quando sai da arvore e a religa quando volta; o app suspenso em
/// segundo plano perde o recurso para o sistema de qualquer jeito. Guardar um
/// controlador aqui dentro criaria um dono que sobrevive a tela e segura a
/// camera ligada depois de a pessoa sair.
class LeitorDeQrDoAparelho implements LeitorDeQr {
  const LeitorDeQrDoAparelho();

  /// Camera ao vivo so existe onde ha aparelho. Mesma regra de
  /// `CameraDoAparelho`: em macOS, na web e no teste de widget nao ha canal de
  /// plataforma, e `false` e a resposta **certa** ali, nao um remendo.
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
          // `noDuplicates` nao serve: ele guarda o ultimo valor para sempre, e
          // quem le a plaquinha errada e volta para a certa e depois para a
          // errada de novo ficaria sem resposta na terceira. A tela ja ignora
          // repeticao enquanto uma resolucao esta em curso, que e a janela em
          // que a repeticao atrapalha.
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
