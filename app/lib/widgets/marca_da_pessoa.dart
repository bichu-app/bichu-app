import 'package:flutter/material.dart';

import '../api/cache_de_imagens.dart';
import '../theme/bichu_colors.dart';
import 'imagem_da_rede.dart';

/// **O CIRCULO QUE REPRESENTA UMA PESSOA**: a foto dela quando existe, a
/// inicial do nome quando nao.
class MarcaDaPessoa extends StatelessWidget {
  const MarcaDaPessoa({
    required this.urlDoIcone,
    required this.inicial,
    super.key,
    this.lado = 40,
    this.desligada = false,
    this.estiloDaInicial,
    this.apelido,
  });

  /// A derivada `thumb` de 176 px da foto da pessoa, ou **nula**.
  final String? urlDoIcone;

  /// A letra ja escolhida por quem monta, **e nao o nome inteiro**.
  final String inicial;

  /// O lado do circulo, em dp.
  final double lado;

  /// A conversa encerrada pinta a marca em cinza.
  final bool desligada;

  /// O estilo base da inicial.
  final TextStyle? estiloDaInicial;

  /// **O APELIDO DE QUEM E ESTA FOTO**, e e ele que liga o cache em disco
  /// (BICHUS-296).
  final String? apelido;

  /// A letra que representa um nome: a **primeira**, em maiuscula.
  static String letraDe(String nome) {
    final limpo = nome.trim();
    if (limpo.isEmpty) return '';
    return limpo.characters.first.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final url = urlDoIcone;

    if (url == null || url.isEmpty) {
      final base = estiloDaInicial ?? Theme.of(context).textTheme.titleMedium;
      return Container(
        width: lado,
        height: lado,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: desligada ? cores.disabledSurface : cores.primaryContainer,
          shape: BoxShape.circle,
        ),
        child: ExcludeSemantics(
          child: Text(
            inicial.isEmpty ? '·' : inicial,
            style: base?.copyWith(
              color: desligada ? cores.onDisabled : cores.primary,
            ),
          ),
        ),
      );
    }

    return ImagemDaRede(
      url: url,
      descricao: null,
      largura: lado,
      proporcao: 1,
      raio: lado / 2,
      simboloDeFalha: Icons.person_outline,
      cache: ChaveDeImagem.dePessoa(url, apelido: apelido),
    );
  }
}
