import 'package:flutter/material.dart';

import '../api/cache_de_imagens.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'imagem_em_cache.dart';

/// Uma imagem que vem do servidor, **desenhada com disciplina de memoria**.
class ImagemDaRede extends StatelessWidget {
  const ImagemDaRede({
    required this.url,
    required this.descricao,
    super.key,
    this.largura,
    this.proporcao = 1,
    this.raio = BichuRaio.md,
    this.simboloDeFalha = Icons.image_not_supported_outlined,
    this.aoTocarNaFalha,
    this.textoDaFalha,
    this.reservaDeFalha,
    this.cache,
  });

  /// A URL da **derivada**. Nao anulavel e nao vazia: ver o item 3 acima.
  final String url;

  /// O rotulo do leitor de tela, ou **nulo para imagem decorativa**.
  final String? descricao;

  /// A largura pintada, em dp.
  final double? largura;

  /// Largura dividida pela altura.
  final double proporcao;

  final double raio;

  /// O simbolo do estado de falha.
  final IconData simboloDeFalha;

  /// O que fazer quando a imagem **nao carregou e vale tentar de novo**.
  final VoidCallback? aoTocarNaFalha;

  /// O texto do estado de falha quando ele e um controle.
  final String? textoDaFalha;

  /// O DESENHO INTEIRO DO ESTADO DE FALHA, quando um glifo nao serve.
  final Widget? reservaDeFalha;

  /// **A IDENTIDADE ESTAVEL DA IMAGEM, PARA O CACHE EM DISCO** (BICHUS-296).
  final ChaveDeImagem? cache;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final fatorDePixel = MediaQuery.devicePixelRatioOf(context);

    return LayoutBuilder(
      builder: (context, limites) {
        final double? larguraPintada =
            largura ?? (limites.maxWidth.isFinite ? limites.maxWidth : null);
        if (larguraPintada == null || larguraPintada <= 0) {
          return const SizedBox.shrink();
        }
        final alturaPintada = larguraPintada / proporcao;

        final moldura = BoxDecoration(
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(raio),
        );

        final emPixeis = (larguraPintada * fatorDePixel).round();

        final conteudo = Container(
          width: larguraPintada,
          height: alturaPintada,
          clipBehavior: Clip.antiAlias,
          decoration: moldura,
          child: Image(
            image: ResizeImage(_provedor(context), width: emPixeis),
            width: larguraPintada,
            height: alturaPintada,
            fit: BoxFit.cover,
            errorBuilder: (context, erro, pilha) =>
                reservaDeFalha ?? _falha(cores),
          ),
        );

        if (descricao != null) {
          return Semantics(image: true, label: descricao, child: conteudo);
        }
        return aoTocarNaFalha == null
            ? ExcludeSemantics(child: conteudo)
            : conteudo;
      },
    );
  }

  ImageProvider<Object> _provedor(BuildContext context) {
    final chave = cache;
    if (chave == null) return NetworkImage(url);
    final escopo = CacheDeImagensDoAplicativo.talvezDe(context);
    if (escopo == null) return NetworkImage(url);
    return ImagemEmCache(
      url: url,
      chave: chave,
      cache: escopo.cache,
      buscador: escopo.buscador,
    );
  }

  Widget _falha(BichuCores cores) {
    final simbolo = Icon(
      simboloDeFalha,
      size: BichuEspaco.e6,
      color: cores.textMuted,
    );
    final aoTocar = aoTocarNaFalha;
    if (aoTocar == null) return Center(child: simbolo);
    return Semantics(
      button: true,
      label: textoDaFalha ?? '',
      child: InkWell(
        onTap: aoTocar,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(BichuEspaco.e3),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                simbolo,
                if (textoDaFalha != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e2),
                  ExcludeSemantics(
                    child: Text(
                      textoDaFalha!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: cores.textSecondary,
                        fontSize: BichuEscalaDeTipo.bodySm.tamanho,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
