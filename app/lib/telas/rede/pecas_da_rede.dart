import 'package:flutter/material.dart';

import '../../api/modelos_rede.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';

/// As pecas que o cartao da agenda e a pagina do encontro dividem.
///
/// Design system 24.12 a 24.17. Nenhuma cor escrita a mao: tudo sai de
/// `BichuColors` ou de `BichuCores.claro` (o banner, abaixo, explica por que o
/// claro fixo).

/// A proporcao 16:9 da capa e do cartao (pedido de token P-M5, 24.12.7).
const double proporcaoDaCapa = 16 / 9;

/// A proporcao 4:3 das fotos (pedido de token P-M5).
const double proporcaoDaFoto = 4 / 3;

/// O rotulo da situacao que a data nao diz, ou nulo.
///
/// `upcoming` nao ganha rotulo: a data ja diz. Os outros tres ganham.
String? rotuloDaSituacao(SituacaoDoEncontro? situacao) {
  return switch (situacao) {
    SituacaoDoEncontro.acontecendo => 'Acontecendo agora',
    SituacaoDoEncontro.encerrado => 'Encerrado',
    SituacaoDoEncontro.cancelado => 'Cancelado',
    SituacaoDoEncontro.aVir => null,
    null => null,
  };
}

/// O banner da marca, no lugar da capa que nao existe ou que nao pode sair.
///
/// Ceu, sol, chao e tres arvores do pilar "encontros" (design system 24.12.2).
/// Decorativo: fora da arvore de acessibilidade.
///
/// **Por que `BichuCores.claro` e nao o tema.** A especificacao pede as rampas
/// primitivas (`butter`, `sage`, `raspberry`) porque o banner faz o papel de
/// uma FOTO, e foto nao troca com o tema (24.12.6). O gerador de tokens do app
/// nao publica primitivas; os papeis do tema claro que coincidem com elas
/// sao `communityFill` (`sage-300`), `successContainer` (`sage-100`),
/// `primary` (`raspberry-700`) e `actionFill` (`butter-400`, o vizinho do
/// `butter-300` pedido). O ceu (`butter-100`) sai do `actionFill` a 25% sobre
/// `surface`. Pedido de token registrado na entrega: publicar as primitivas.
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

/// A imagem 16:9 do cartao e da pagina: a capa, ou o banner da marca.
///
/// [cancelado] poe a imagem em escala de cinza (filtro de imagem, sem cor
/// nova): continua reconhecivel e deixa de parecer convite (24.12.6).
///
/// A imagem fica **fora da arvore** quando [textoAlternativo] e nulo (cartao:
/// o nome do cartao ja diz o encontro). Na pagina, a capa tem o texto
/// alternativo da imagem de posicao 0 (`images[0].alt_text`).
class ImagemDoEncontroOuBanner extends StatelessWidget {
  const ImagemDoEncontroOuBanner({
    required this.url,
    super.key,
    this.textoAlternativo,
    this.cancelado = false,
  });

  final String? url;
  final String? textoAlternativo;
  final bool cancelado;

  static const ColorFilter _cinza = ColorFilter.matrix(<double>[
    0.2126, 0.7152, 0.0722, 0, 0, //
    0.2126, 0.7152, 0.0722, 0, 0, //
    0.2126, 0.7152, 0.0722, 0, 0, //
    0, 0, 0, 1, 0, //
  ]);

  @override
  Widget build(BuildContext context) {
    final endereco = url;
    Widget imagem = endereco == null
        ? const BannerDaMarca()
        : Image.network(
            endereco,
            fit: BoxFit.cover,
            width: double.infinity,
            height: double.infinity,
            semanticLabel: textoAlternativo,
            excludeFromSemantics: textoAlternativo == null,
            // Foto que nao carrega vira o banner, e nao um retangulo cinza:
            // o retangulo promete algo que nao vem (24.12.2).
            errorBuilder: (_, _, _) => const BannerDaMarca(),
          );
    if (cancelado) imagem = ColorFiltered(colorFilter: _cinza, child: imagem);
    return AspectRatio(aspectRatio: proporcaoDaCapa, child: imagem);
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

    // A data por extenso esta sempre ao lado, em texto: o bloco e ornamento
    // de leitura rapida e sai da arvore para nao ser lido duas vezes.
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

/// O distintivo de situacao: `Acontecendo agora`, `Encerrado`, `Cancelado`.
///
/// `Cancelado` e o unico invertido (`surfaceInverse` com `textOnInverse`): o
/// par de maior contraste do sistema, sem cor de erro nem de urgencia
/// (24.11). A diferenca nao depende de cor: a palavra esta la (SC 1.4.1).
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

/// Um selo neutro com icone e palavra: `Gratuito`, `R$ 15 por cão`,
/// `Privado`.
///
/// Neutro de proposito: a palavra e a informacao, e nenhuma cor diz nada
/// (24.13.1). **Nao ha selo `Público`** (UX 28.7.2): o normal nao tem selo.
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

/// O selo `Privado`.
const SeloDoEncontro seloPrivado = SeloDoEncontro(
  icone: Icons.lock_outline,
  texto: 'Privado',
);
