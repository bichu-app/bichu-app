import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A imagem aberta em tela cheia, com ampliacao.
class VisualizadorDeImagem extends StatelessWidget {
  const VisualizadorDeImagem({
    required this.urls,
    super.key,
    this.textoAlternativo,
    this.inicial = 0,
  }) : assert(urls.length > 0, 'visualizador sem imagem nenhuma');

  /// As imagens, na ordem em que a tela as recebeu.
  final List<String> urls;

  /// Em qual de [urls] a tela abre.
  final int inicial;

  /// O texto alternativo, quando o contrato traz um.
  final String? textoAlternativo;

  /// O nome acessivel da tela.
  static const String tituloDaTela = 'Foto ampliada';

  /// O rotulo do botao de fechar.
  static const String rotuloDeFechar = 'Fechar';

  /// Os rotulos das setas, **que so existem com mais de uma foto**.
  static const String rotuloDeAnterior = 'Foto anterior';
  static const String rotuloDeProxima = 'Próxima foto';

  /// `1 de 3`. **Escrito, e nao pontinhos**: ponto aceso num carrossel de nove
  /// fotos nao diz em qual delas a pessoa esta.
  static String contador({required int atual, required int total}) =>
      '${atual + 1} de $total';

  /// O quanto a pinca amplia, no maximo.
  static const double ampliacaoMaxima = 4;

  /// O quanto o toque duplo amplia.
  static const double ampliacaoDoToqueDuplo = 2.5;

  /// Abre UMA imagem ampliada, **ou nao faz nada quando nao ha imagem**.
  static Future<void> abrir(
    BuildContext context, {
    required String? url,
    String? textoAlternativo,
  }) {
    final endereco = url;
    if (endereco == null || endereco.isEmpty) return Future<void>.value();
    return abrirVarias(
      context,
      urls: <String>[endereco],
      textoAlternativo: textoAlternativo,
    );
  }

  /// Abre VARIAS, e e a MESMA tela: uma vira ampliacao, mais de uma vira
  /// carrossel ampliavel.
  static Future<void> abrirVarias(
    BuildContext context, {
    required List<String> urls,
    String? textoAlternativo,
    int inicial = 0,
  }) {
    final limpas =
        urls.where((u) => u.trim().isNotEmpty).toList(growable: false);
    if (limpas.isEmpty) return Future<void>.value();
    return Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => VisualizadorDeImagem(
          urls: limpas,
          textoAlternativo: textoAlternativo,
          inicial: inicial,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Scaffold(
      backgroundColor: cores.scrim,
      body: Semantics(
        label: tituloDaTela,
        child: Stack(
          children: <Widget>[
            Positioned.fill(
              child: GestureDetector(
                onTap: () => Navigator.of(context).maybePop(),
                behavior: HitTestBehavior.opaque,
                child: const ExcludeSemantics(child: SizedBox.expand()),
              ),
            ),
            if (urls.length == 1)
              Positioned.fill(
                child: _ImagemAmpliavel(
                  child: _QuadroDaFoto(
                    url: urls.single,
                    textoAlternativo: textoAlternativo,
                  ),
                ),
              )
            else
              Positioned.fill(
                child: _CarrosselAmpliavel(
                  urls: urls,
                  textoAlternativo: textoAlternativo,
                  inicial: (inicial < 0 || inicial > urls.length - 1)
                      ? 0
                      : inicial,
                ),
              ),
            Positioned(
              top: BichuEspaco.e3,
              left: BichuEspaco.e3,
              child: SafeArea(
                child: _BotaoSobreMidia(
                  icone: Icons.close,
                  rotulo: rotuloDeFechar,
                  aoTocar: () => Navigator.of(context).maybePop(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A imagem pedida ao servidor, **sem `cacheWidth`**.
class _QuadroDaFoto extends StatelessWidget {
  const _QuadroDaFoto({required this.url, required this.textoAlternativo});

  final String url;
  final String? textoAlternativo;

  @override
  Widget build(BuildContext context) {
    final alternativo = textoAlternativo;
    return Image.network(
      url,
      fit: BoxFit.contain,
      semanticLabel: alternativo,
      excludeFromSemantics: alternativo == null,
      errorBuilder: (_, _, _) => _FalhaDaImagem(),
    );
  }
}

/// Mais de uma foto: paginas ampliaveis, com contador e setas.
class _CarrosselAmpliavel extends StatefulWidget {
  const _CarrosselAmpliavel({
    required this.urls,
    required this.textoAlternativo,
    required this.inicial,
  });

  final List<String> urls;
  final String? textoAlternativo;
  final int inicial;

  @override
  State<_CarrosselAmpliavel> createState() => _CarrosselAmpliavelState();
}

class _CarrosselAmpliavelState extends State<_CarrosselAmpliavel> {
  late final PageController _quadros =
      PageController(initialPage: widget.inicial);
  late int _atual = widget.inicial;

  @override
  void dispose() {
    _quadros.dispose();
    super.dispose();
  }

  void _ir(int para) {
    if (para < 0 || para > widget.urls.length - 1) return;
    _quadros.animateToPage(
      para,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.urls.length;
    return Stack(
      children: <Widget>[
        Positioned.fill(
          child: PageView.builder(
            controller: _quadros,
            itemCount: total,
            onPageChanged: (i) => setState(() => _atual = i),
            itemBuilder: (_, i) => _ImagemAmpliavel(
              child: _QuadroDaFoto(
                url: widget.urls[i],
                textoAlternativo: widget.textoAlternativo,
              ),
            ),
          ),
        ),
        Positioned(
          left: BichuEspaco.e3,
          right: BichuEspaco.e3,
          bottom: BichuEspaco.e3,
          child: SafeArea(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                _BotaoSobreMidia(
                  icone: Icons.chevron_left,
                  rotulo: VisualizadorDeImagem.rotuloDeAnterior,
                  aoTocar: _atual == 0 ? null : () => _ir(_atual - 1),
                ),
                _Contador(
                  texto: VisualizadorDeImagem.contador(
                    atual: _atual,
                    total: total,
                  ),
                ),
                _BotaoSobreMidia(
                  icone: Icons.chevron_right,
                  rotulo: VisualizadorDeImagem.rotuloDeProxima,
                  aoTocar: _atual == total - 1 ? null : () => _ir(_atual + 1),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// `1 de 3`, sobre tarja de `surface`.
class _Contador extends StatelessWidget {
  const _Contador({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.md),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BichuEspaco.e3,
          vertical: BichuEspaco.e1,
        ),
        child: Text(
          texto,
          style: Theme.of(context)
              .textTheme
              .labelLarge
              ?.copyWith(color: cores.textPrimary),
        ),
      ),
    );
  }
}

/// A imagem dentro do `InteractiveViewer`, com toque duplo.
class _ImagemAmpliavel extends StatefulWidget {
  const _ImagemAmpliavel({required this.child});

  final Widget child;

  @override
  State<_ImagemAmpliavel> createState() => _ImagemAmpliavelState();
}

class _ImagemAmpliavelState extends State<_ImagemAmpliavel> {
  final TransformationController _enquadramento = TransformationController();

  @override
  void dispose() {
    _enquadramento.dispose();
    super.dispose();
  }

  static const double _folgaDaEscala = 0.001;

  void _alternar(TapDownDetails toque) {
    final ampliado =
        _enquadramento.value.getMaxScaleOnAxis() > 1 + _folgaDaEscala;
    if (ampliado) {
      _enquadramento.value = Matrix4.identity();
      return;
    }
    const fator = VisualizadorDeImagem.ampliacaoDoToqueDuplo;
    final ponto = toque.localPosition;
    _enquadramento.value = Matrix4.identity()
      ..translateByDouble(-ponto.dx * (fator - 1), -ponto.dy * (fator - 1), 0, 1)
      ..scaleByDouble(fator, fator, fator, 1);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onDoubleTapDown: _alternar,
      onDoubleTap: () {},
      child: InteractiveViewer(
        transformationController: _enquadramento,
        minScale: 1,
        maxScale: VisualizadorDeImagem.ampliacaoMaxima,
        panEnabled: true,
        boundaryMargin: EdgeInsets.zero,
        clipBehavior: Clip.none,
        child: widget.child,
      ),
    );
  }
}

/// `Botao sobre midia` (design system 24.12.1 e 24.12.6): 48 dp, fundo
/// `surface`, sombra propria, para o contraste nao depender da foto.
class _BotaoSobreMidia extends StatelessWidget {
  const _BotaoSobreMidia({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
  });

  final IconData icone;
  final String rotulo;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final escuro = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cores.surface,
        shape: BoxShape.circle,
        boxShadow: escuro ? null : BichuSombra.md,
        border: escuro
            ? Border.all(color: cores.outline, width: BichuBorda.hairline)
            : null,
      ),
      child: IconButton(
        onPressed: aoTocar,
        tooltip: rotulo,
        icon: Icon(icone),
        constraints: const BoxConstraints(
          minWidth: BichuAlvoDeToque.min,
          minHeight: BichuAlvoDeToque.min,
        ),
        color: cores.textPrimary,
        focusColor: cores.focusRing,
      ),
    );
  }
}

/// A imagem que nao carregou.
class _FalhaDaImagem extends StatelessWidget {
  const _FalhaDaImagem();

  static const String aviso = 'Não conseguimos carregar a foto.';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cores.surface,
            borderRadius: BorderRadius.circular(BichuRaio.md),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: BichuEspaco.e4,
              vertical: BichuEspaco.e3,
            ),
            child: Text(
              aviso,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: cores.textPrimary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
