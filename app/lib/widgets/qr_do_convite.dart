import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O QR do **convite de conexão**: o quadrado que outra pessoa escaneia para
/// chegar ao seu perfil com o botão de adicionar.
class QrDoConvite extends StatelessWidget {
  const QrDoConvite({required this.token, super.key});

  /// O token do convite — o conteúdo do quadrado, e nada mais.
  final String token;

  /// O lado da imagem, **o mesmo de `QrDaPlaquinha`**.
  static const double lado = 200;

  /// A folga branca ao redor dos módulos.
  static const double folgaSilenciosa = BichuEspaco.e3;

  /// O branco da zona silenciosa e do fundo do simbolo.
  static const Color brancoDoSimbolo = Color(0xFFFFFFFF);

  /// O preto dos modulos. Mesma classe, mesmo motivo.
  static const Color pretoDosModulos = Color(0xFF000000);

  static const String rotuloAcessivel =
      'QR do seu convite. Quem escanear este código com o Bichu abre o seu '
      'perfil e pode pedir conexão com você.';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Semantics(
      label: rotuloAcessivel,
      image: true,
      child: ExcludeSemantics(
        child: Container(
          width: lado,
          height: lado,
          padding: const EdgeInsets.all(folgaSilenciosa),
          decoration: BoxDecoration(
            color: brancoDoSimbolo,
            borderRadius: BorderRadius.circular(BichuRaio.sm),
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
          ),
          child: QrImageView(
            data: token,
            version: QrVersions.auto,
            gapless: true,
            backgroundColor: brancoDoSimbolo,
            eyeStyle: const QrEyeStyle(
              eyeShape: QrEyeShape.square,
              color: pretoDosModulos,
            ),
            dataModuleStyle: const QrDataModuleStyle(
              dataModuleShape: QrDataModuleShape.square,
              color: pretoDosModulos,
            ),
          ),
        ),
      ),
    );
  }
}
