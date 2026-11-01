import 'package:flutter/material.dart';

import '../api/modelos_loja.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O carrossel de fotos de um cartao de listagem.
class CarrosselDeFotos extends StatefulWidget {
  const CarrosselDeFotos({
    required this.fotos,
    required this.titulo,
    required this.altura,
    super.key,
  });

  /// As fotos, na ordem do painel.
  final List<ImagemDoProduto> fotos;

  /// O titulo do produto, para a reserva do texto alternativo.
  final String titulo;

  /// A altura da area de foto, em dp.
  final double altura;

  @override
  State<CarrosselDeFotos> createState() => _CarrosselDeFotosState();
}

class _CarrosselDeFotosState extends State<CarrosselDeFotos> {
  final PageController _quadros = PageController();
  int _atual = 0;

  @override
  void dispose() {
    _quadros.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(CarrosselDeFotos anterior) {
    super.didUpdateWidget(anterior);
    if (widget.fotos.length != anterior.fotos.length && _atual != 0) {
      _atual = 0;
      if (_quadros.hasClients) _quadros.jumpToPage(0);
    }
  }

  void _ir(int destino) {
    final limite = widget.fotos.length - 1;
    if (destino < 0 || destino > limite) return;
    _quadros.animateToPage(
      destino,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final fotos = widget.fotos;
    if (fotos.isEmpty) return const SizedBox.shrink();

    if (fotos.length == 1) {
      return _Quadro(
        foto: fotos.first,
        titulo: widget.titulo,
        altura: widget.altura,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        SizedBox(
          height: widget.altura,
          child: PageView.builder(
            controller: _quadros,
            itemCount: fotos.length,
            onPageChanged: (indice) => setState(() => _atual = indice),
            itemBuilder: (contexto, indice) => _Quadro(
              foto: fotos[indice],
              titulo: widget.titulo,
              altura: widget.altura,
            ),
          ),
        ),
        const SizedBox(height: BichuEspaco.e2),
        _Controles(
          atual: _atual,
          total: fotos.length,
          aoAnterior: _atual == 0 ? null : () => _ir(_atual - 1),
          aoProxima: _atual == fotos.length - 1 ? null : () => _ir(_atual + 1),
        ),
      ],
    );
  }
}

/// Uma foto do carrossel.
class _Quadro extends StatelessWidget {
  const _Quadro({
    required this.foto,
    required this.titulo,
    required this.altura,
  });

  final ImagemDoProduto foto;
  final String titulo;
  final double altura;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(BichuRaio.md),
      child: Image.network(
        foto.url,
        height: altura,
        width: double.infinity,
        fit: BoxFit.cover,
        semanticLabel: foto.nomeDaImagem(titulo),
        errorBuilder: (_, _, _) => const SizedBox.shrink(),
      ),
    );
  }
}

/// O indicador e a navegacao sem arrasto.
class _Controles extends StatelessWidget {
  const _Controles({
    required this.atual,
    required this.total,
    required this.aoAnterior,
    required this.aoProxima,
  });

  final int atual;
  final int total;
  final VoidCallback? aoAnterior;
  final VoidCallback? aoProxima;

  static const int _maximoDePontos = 5;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final contador = '${atual + 1} de $total';

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: <Widget>[
        _Seta(
          icone: Icons.chevron_left,
          rotulo: 'Foto anterior',
          aoTocar: aoAnterior,
        ),
        Semantics(
          label: 'Foto $contador',
          container: true,
          excludeSemantics: true,
          child: total <= _maximoDePontos
              ? Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    for (var i = 0; i < total; i++)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 3),
                        child: Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i == atual ? cores.primary : cores.surface,
                            border: Border.all(
                              color: i == atual ? cores.primary : cores.outline,
                              width: BichuBorda.hairline,
                            ),
                          ),
                        ),
                      ),
                  ],
                )
              : Text(
                  contador,
                  style: textos.labelMedium?.copyWith(
                    color: cores.textSecondary,
                  ),
                ),
        ),
        _Seta(
          icone: Icons.chevron_right,
          rotulo: 'Próxima foto',
          aoTocar: aoProxima,
        ),
      ],
    );
  }
}

/// Uma seta do carrossel. Alvo de 48 dp (`BichuAlvoDeToque.min`), com nome.
class _Seta extends StatelessWidget {
  const _Seta({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
  });

  final IconData icone;
  final String rotulo;

  /// Nulo na ponta da lista: o botao fica **desabilitado e visivel**, e nao
  /// escondido.
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return IconButton(
      onPressed: aoTocar,
      tooltip: rotulo,
      icon: Icon(icone),
      iconSize: 24,
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.min,
        minHeight: BichuAlvoDeToque.min,
      ),
      padding: EdgeInsets.zero,
      color: cores.textPrimary,
      disabledColor: cores.onDisabled,
      focusColor: cores.focusRing,
      style: IconButton.styleFrom(
        minimumSize: const Size.square(BichuAlvoDeToque.min),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
