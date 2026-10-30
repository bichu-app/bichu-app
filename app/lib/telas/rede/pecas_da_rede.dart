import 'package:flutter/material.dart';

import '../../api/modelos_rede.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';

/// A proporcao 16:9 da capa e do cartao (pedido de token P-M5, 24.12.7).
const double proporcaoDaCapa = 16 / 9;

/// A proporcao 4:3 das fotos (pedido de token P-M5).
const double proporcaoDaFoto = 4 / 3;

/// O banner da marca, no lugar da capa que nao existe ou que nao pode sair.
class BannerDaMarca extends StatelessWidget {
  const BannerDaMarca({super.key});

  @override
  Widget build(BuildContext context) {
    return const ExcludeSemantics(
      child: CustomPaint(painter: _PintorDoBanner(), size: Size.infinite),
    );
  }
}

class _PintorDoBanner extends CustomPainter {
  const _PintorDoBanner();

  @override
  void paint(Canvas canvas, Size size) {
    const c = BichuCores.claro;
    final ceu = Color.alphaBlend(
      c.actionFillRawDoNotUseAsText.withValues(alpha: 0.25),
      c.surface,
    );
    canvas.drawRect(Offset.zero & size, Paint()..color = ceu);

    final w = size.width;
    final h = size.height;
    canvas.drawCircle(
      Offset(w * 0.8, h * 0.28),
      h * 0.13,
      Paint()..color = c.actionFillRawDoNotUseAsText,
    );

    final chao = Path()
      ..moveTo(0, h * 0.72)
      ..quadraticBezierTo(w * 0.5, h * 0.62, w, h * 0.74)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(chao, Paint()..color = c.successContainer);

    final tronco = Paint()..color = c.primary;
    final copa = Paint()..color = c.communityFillRawDoNotUseAsText;
    for (final (x, escala) in <(double, double)>[
      (0.18, 1.0),
      (0.32, 0.75),
      (0.46, 0.9),
    ]) {
      final base = Offset(w * x, h * 0.72);
      final altura = h * 0.34 * escala;
      canvas.drawRect(
        Rect.fromCenter(
          center: base.translate(0, -altura * 0.25),
          width: h * 0.035,
          height: altura * 0.5,
        ),
        tronco,
      );
      canvas.drawCircle(
        base.translate(0, -altura * 0.62),
        altura * 0.38,
        copa,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _PintorDoBanner oldDelegate) => false;
}

/// A imagem 16:9 do cartao: a capa da derivada `cover_image_url`, ou o banner
/// da marca quando nao ha capa (ou quando ela nao carrega).
class ImagemDoEncontroOuBanner extends StatelessWidget {
  const ImagemDoEncontroOuBanner({
    required this.url,
    super.key,
    this.textoAlternativo,
  });

  final String? url;

  /// O `alt_text` da capa, quando ha um.
  final String? textoAlternativo;

  @override
  Widget build(BuildContext context) {
    final endereco = url;
    if (endereco == null) {
      return const AspectRatio(
        aspectRatio: proporcaoDaCapa,
        child: BannerDaMarca(),
      );
    }
    final fatorDePixel = MediaQuery.devicePixelRatioOf(context);
    return AspectRatio(
      aspectRatio: proporcaoDaCapa,
      child: LayoutBuilder(
        builder: (context, limites) {
          final largura = limites.maxWidth;
          if (!largura.isFinite || largura <= 0) {
            return const BannerDaMarca();
          }
          final imagem = Image.network(
              endereco,
              fit: BoxFit.cover,
              width: double.infinity,
              height: double.infinity,
              semanticLabel: textoAlternativo,
              cacheWidth: (largura * fatorDePixel).round(),
              excludeFromSemantics: textoAlternativo == null,
              errorBuilder: (_, _, _) => const BannerDaMarca(),
          );
          return textoAlternativo == null
              ? ExcludeSemantics(child: imagem)
              : imagem;
        },
      ),
    );
  }
}

/// O rotulo da situacao que a data nao diz, ou nulo.
String? rotuloDaSituacao(SituacaoDoEncontro? situacao) {
  return switch (situacao) {
    SituacaoDoEncontro.acontecendo => 'Acontecendo agora',
    SituacaoDoEncontro.encerrado => 'Encerrado',
    SituacaoDoEncontro.cancelado => 'Cancelado',
    SituacaoDoEncontro.aVir => null,
    null => null,
  };
}

/// O distintivo de situacao: `Acontecendo agora`, `Encerrado`, `Cancelado`.
class DistintivoDeSituacao extends StatelessWidget {
  const DistintivoDeSituacao({
    required this.situacao,
    super.key,
    this.grande = false,
  });

  final SituacaoDoEncontro situacao;
  final bool grande;

  @override
  Widget build(BuildContext context) {
    final rotulo = rotuloDaSituacao(situacao);
    if (rotulo == null) return const SizedBox.shrink();
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final invertido = situacao == SituacaoDoEncontro.cancelado;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: grande ? BichuEspaco.e4 : BichuEspaco.e3,
        vertical: grande ? BichuEspaco.e2 : BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: invertido ? cores.surfaceInverse : cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        border: invertido
            ? null
            : Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        rotulo,
        style: (grande ? textos.titleMedium : textos.labelMedium)?.copyWith(
          color: invertido ? cores.textOnInverse : cores.textPrimary,
        ),
      ),
    );
  }
}

/// O bloco de dia: `SÁB` / `27` / `SET`.
class BlocoDoDia extends StatelessWidget {
  const BlocoDoDia({required this.dia, super.key, this.comFundo = true});

  final DiaDoEncontro dia;

  /// No cartao, sobre a imagem, o bloco tem fundo e sombra proprios; na caixa
  /// `Quando`, ele fica sobre `surfaceAlt`, sem fundo.
  final bool comFundo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escuro = Theme.of(context).brightness == Brightness.dark;

    final conteudo = Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(
          dia.diaAbreviado,
          style: textos.labelSmall?.copyWith(color: cores.primary),
        ),
        Text(
          '${dia.numero}',
          style: textos.titleLarge?.copyWith(color: cores.textPrimary),
        ),
        Text(
          dia.mesAbreviado,
          style: textos.labelSmall?.copyWith(color: cores.textSecondary),
        ),
      ],
    );

    return ExcludeSemantics(
      child: !comFundo
          ? conteudo
          : Container(
              padding: const EdgeInsets.symmetric(
                horizontal: BichuEspaco.e3,
                vertical: BichuEspaco.e2,
              ),
              decoration: BoxDecoration(
                color: cores.surface,
                borderRadius: BorderRadius.circular(BichuRaio.md),
                boxShadow: escuro ? null : BichuSombra.sm,
                border: escuro
                    ? Border.all(color: cores.outline, width: BichuBorda.hairline)
                    : null,
              ),
              child: conteudo,
            ),
    );
  }
}

/// Um selo neutro com icone e palavra: `Gratuito`, `R$ 15 por cão`, `Privado`.
class SeloDoEncontro extends StatelessWidget {
  const SeloDoEncontro({required this.icone, required this.texto, super.key});

  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e3,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        border: Border.all(
          color: cores.outlineControl,
          width: BichuBorda.hairline,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          ExcludeSemantics(
            child: Icon(icone, size: BichuEspaco.e5, color: cores.primary),
          ),
          const SizedBox(width: BichuEspaco.e1),
          Flexible(
            child: Text(
              texto,
              style: textos.labelMedium?.copyWith(color: cores.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

/// O selo de valor. Recebe a entrada ja lida do contrato.
SeloDoEncontro seloDeValor(EntradaDoEncontro entrada) => SeloDoEncontro(
      icone: Icons.payments_outlined,
      texto: entrada.rotuloDoSelo,
    );
