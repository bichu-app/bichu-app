import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A geometria da moldura (design system 5.1, grupo `moldura` de
/// `design/tokens.json`).
abstract final class BichuMoldura {
  /// `moldura.proporcao`: altura dividida pela largura.
  static const double proporcao = 1.1;

  /// `moldura.raio-superior`: fator sobre a largura.
  static const double fatorDoRaioSuperior = 0.5;

  /// `moldura.raio-inferior`: fator sobre a largura.
  static const double fatorDoRaioInferior = 0.3;

  /// `foto/sm` (design system 5.4): 56 x 62, o tamanho do cartao de pet na
  /// lista.
  static const double larguraFotoSm = 56;

  /// A altura que [proporcao] impoe a [larguraFotoSm].
  static double get alturaFotoSm => larguraFotoSm * proporcao;

  /// `foto/lg` (design system 5.4): 160 x 176, o tamanho que a tabela publica
  /// para **"Perfil do pet"** -- que e a tela de detalhe da BICHUS-60 e da
  /// BICHUS-61.
  static const double larguraFotoLg = 160;

  /// O raio composto da forma, para uma largura qualquer.
  static BorderRadius raio(double largura) {
    final superiorX = largura * fatorDoRaioSuperior;
    final inferiorX = largura * fatorDoRaioInferior;
    return BorderRadius.only(
      topLeft: Radius.elliptical(superiorX, superiorX / proporcao),
      topRight: Radius.elliptical(superiorX, superiorX / proporcao),
      bottomLeft: Radius.elliptical(inferiorX, inferiorX / proporcao),
      bottomRight: Radius.elliptical(inferiorX, inferiorX / proporcao),
    );
  }
}

/// Os estados da moldura (design system 11.4).
enum EstadoDaMoldura {
  /// Ha conteudo para pintar.
  repouso,

  /// Esqueleto. A foto esta a caminho.
  carregando,

  /// Nao ha conteudo, ou ele falhou.
  vazio,
}

/// A moldura do paragrafo 11.4: componente base de foto, icone e selo.
class Moldura extends StatelessWidget {
  const Moldura({
    required this.largura,
    super.key,
    this.estado = EstadoDaMoldura.vazio,
    this.filho,
    this.simbolo = Icons.pets_outlined,
  });

  /// A largura em dp. A altura sai de [BichuMoldura.proporcao].
  final double largura;

  final EstadoDaMoldura estado;

  /// O que preenche a moldura em [EstadoDaMoldura.repouso].
  final Widget? filho;

  /// O simbolo do estado vazio.
  final IconData simbolo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final altura = largura * BichuMoldura.proporcao;
    final forma = BichuMoldura.raio(largura);

    final Widget conteudo = switch (estado) {
      EstadoDaMoldura.repouso => filho ?? const SizedBox.shrink(),
      EstadoDaMoldura.carregando => _Esqueleto(cor: cores.surfaceSunken),
      EstadoDaMoldura.vazio => ColoredBox(
          color: cores.primaryContainer,
          child: Center(
            child: Icon(
              simbolo,
              size: largura * 0.4,
              color: cores.primary,
            ),
          ),
        ),
    };

    return ExcludeSemantics(
      child: SizedBox(
        width: largura,
        height: altura,
        child: ClipRRect(
          borderRadius: forma,
          child: conteudo,
        ),
      ),
    );
  }
}

/// O esqueleto com brilho de 1200 ms do paragrafo 5.4.
class _Esqueleto extends StatefulWidget {
  const _Esqueleto({required this.cor});

  final Color cor;

  @override
  State<_Esqueleto> createState() => _EsqueletoState();
}

class _EsqueletoState extends State<_Esqueleto>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controlador = AnimationController(
    vsync: this,
    duration: BichuMovimento.skeleton,
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(
        CurvedAnimation(parent: _controlador, curve: BichuCurva.standard),
      ),
      child: ColoredBox(color: widget.cor),
    );
  }
}
