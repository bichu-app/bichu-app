import 'package:flutter/material.dart';

import '../../theme/bichu_tokens.g.dart';

/// As pecas do cartao da agenda, e as duas proporcoes que a `Loja` divide com
/// ela.
///
/// ## O que saiu em 19/10/2026, e por que
///
/// A pagina do encontro saiu do app (*"sem informações adicionais ou pagina
/// de detalhes do evento"*) e o cartao virou foto e titulo. Com as duas
/// coisas, estas pecas deixaram de ter quem as desenhasse e sairam: o bloco
/// de dia (`SÁB` / `27` / `SET`), o distintivo de situacao (`Acontecendo
/// agora`, `Encerrado`, `Cancelado`), `rotuloDaSituacao` e os selos
/// (`SeloDoEncontro`, `seloDeValor`, `seloPrivado`).
///
/// Ficaram as tres que ainda tem chamador: [proporcaoDaCapa] e
/// [BannerDaMarca], que [ImagemDoEncontroOuBanner] usa, e [proporcaoDaFoto],
/// que e de `loja/produto_da_loja.dart` -- e e por ela que este arquivo
/// continua sendo importado de fora da `Rede`.
///
/// Nenhuma cor escrita a mao: tudo sai de `BichuCores.claro` (o banner,
/// abaixo, explica por que o claro fixo).

/// A proporcao 16:9 da capa e do cartao (pedido de token P-M5, 24.12.7).
const double proporcaoDaCapa = 16 / 9;

/// A proporcao 4:3 das fotos (pedido de token P-M5).
const double proporcaoDaFoto = 4 / 3;

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

/// A imagem 16:9 do cartao: a capa da derivada `cover_image_url`, ou o banner
/// da marca quando nao ha capa (ou quando ela nao carrega).
///
/// ## `cacheWidth` pela largura PINTADA, e por que ele entrou agora
///
/// Ate 19/10/2026 esta peca era um `Image.network` sem `cacheWidth` -- a
/// excecao do app, porque a politica de `widgets/imagem_da_rede.dart` nunca
/// chegou aqui. O custo em memoria de um `ui.Image` e `largura x altura x 4`
/// bytes da imagem DECODIFICADA, e nao os bytes do JPEG: sem `cacheWidth`, a
/// derivada de 1024 x 576 custa **2.359.296 bytes por cartao**, e uma pagina
/// de 20 cartoes custa 47.185.920 -- a agenda monta os 20 de uma vez, numa
/// `Column` e nao numa lista preguicosa, entao sao os 20 ao mesmo tempo.
///
/// Com `cacheWidth` pela largura pintada o decodificador nunca passa do que a
/// tela usa. A derivada CONTINUA sendo `cover_image_url` (1024 x 576): o
/// cartao pinta 326 dp de largura, que da 978 px a 3x -- `cover_banner_url`
/// (1280 x 720) desperdicaria 30% em cada um dos 20 cartoes para ganhar
/// nitidez que ninguem ve, e a derivada de 480 da galeria borraria.
///
/// **A imagem fica fora da arvore de acessibilidade.** O cartao mostra foto e
/// titulo, e o titulo esta logo abaixo, em texto: um rotulo aqui faria o
/// leitor de tela dizer o encontro duas vezes.
class ImagemDoEncontroOuBanner extends StatelessWidget {
  const ImagemDoEncontroOuBanner({required this.url, super.key});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final endereco = url;
    if (endereco == null) {
      return const AspectRatio(
        aspectRatio: proporcaoDaCapa,
        child: BannerDaMarca(),
      );
    }
    // Fora do `LayoutBuilder`: o fator de pixel e do aparelho, nao do espaco
    // disponivel. Mesma razao de `widgets/imagem_da_rede.dart`.
    final fatorDePixel = MediaQuery.devicePixelRatioOf(context);
    return AspectRatio(
      aspectRatio: proporcaoDaCapa,
      child: LayoutBuilder(
        builder: (context, limites) {
          final largura = limites.maxWidth;
          // `maxWidth` infinito nao da numero para pedir ao decodificador, e
          // desenhar sem `cacheWidth` seria exatamente o que estas linhas
          // existem para impedir: entra o banner, que nao baixa nada.
          if (!largura.isFinite || largura <= 0) {
            return const BannerDaMarca();
          }
          return ExcludeSemantics(
            child: Image.network(
              endereco,
              fit: BoxFit.cover,
              width: double.infinity,
              height: double.infinity,
              // **O numero que decide o custo em memoria.** Em pixeis do
              // aparelho, pela largura que o cartao PINTA.
              cacheWidth: (largura * fatorDePixel).round(),
              excludeFromSemantics: true,
              // Foto que nao carrega vira o banner, e nao um retangulo cinza:
              // o retangulo promete algo que nao vem (24.12.2).
              errorBuilder: (_, _, _) => const BannerDaMarca(),
            ),
          );
        },
      ),
    );
  }
}
