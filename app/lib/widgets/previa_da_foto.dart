import 'dart:io';

import 'package:flutter/material.dart';

import '../dispositivo/camera_e_galeria.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A foto que a pessoa acabou de escolher, **desenhada**.
class PreviaDaFoto extends StatelessWidget {
  const PreviaDaFoto({
    required this.foto,
    required this.descricao,
    super.key,
    this.altura = 300,
    this.vazio,
    this.pontoFocal = Alignment.center,
    this.aoNaoAbrir,
    this.comInvolucroProprio = true,
  });

  /// A foto no aparelho, ou nulo quando ainda nao ha uma.
  final FotoLocal? foto;

  /// O rotulo que o leitor de tela anuncia.
  final String descricao;

  final double altura;

  /// O que escrever quando nao ha foto.
  final String? vazio;

  /// O ponto focal do recorte.
  final Alignment pontoFocal;

  /// O que desenhar quando o arquivo existe e **nao abre**.
  final WidgetBuilder? aoNaoAbrir;

  /// Desenha o proprio quadro (fundo afundado, borda fina, raio `lg`).
  final bool comInvolucroProprio;

  /// O que mostrar quando o arquivo existe e **nao abre**.
  static const String naoAbriu = 'Não deu para mostrar esta foto aqui.';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escolhida = foto;

    if (escolhida == null && vazio == null) return const SizedBox.shrink();

    final Widget conteudo = escolhida == null
        ? _texto(vazio!, textos, cores)
        : LayoutBuilder(
            builder: (context, limites) {
              final largura = limites.maxWidth.isFinite
                  ? (limites.maxWidth * MediaQuery.devicePixelRatioOf(context))
                      .round()
                  : null;
              return Image.file(
                File(escolhida.caminho),
                fit: BoxFit.cover,
                width: double.infinity,
                height: comInvolucroProprio ? altura : null,
                alignment: pontoFocal,
                cacheWidth: largura,
                errorBuilder: (context, erro, pilha) =>
                    aoNaoAbrir?.call(context) ?? _texto(naoAbriu, textos, cores),
              );
            },
          );

    if (!comInvolucroProprio) return conteudo;

    return Semantics(
      image: escolhida != null,
      label: escolhida == null ? vazio : descricao,
      child: Container(
        height: altura,
        alignment: Alignment.center,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: conteudo,
      ),
    );
  }

  Widget _texto(String texto, TextTheme textos, BichuCores cores) => Padding(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        child: Text(
          texto,
          textAlign: TextAlign.center,
          style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
        ),
      );
}
