/// O TITULO DA TELA DE CONVERSA: o nome da pessoa, e o do pet como contexto.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';

/// O titulo de duas linhas: a pessoa em cima, o pet embaixo.
class TituloDaConversa extends StatelessWidget {
  const TituloDaConversa({required this.nome, this.pet, super.key});

  /// O nome de quem esta do outro lado.
  final String nome;

  /// O nome do pet. Nulo ou vazio: a segunda linha **nao e construida**, em vez
  /// de nascer vazia e roubar altura da barra.
  final String? pet;

  /// O QUE A BARRA TIRA DO TITULO, em dp, antes de sobrar vao para o texto.
  static const double vaoTiradoPelaBarra = 88.0;

  static const double _respiroVertical = BichuEspaco.e2;

  /// O TETO DE ESCALA QUE A `AppBar` APLICA AO TITULO DELA, e nao um teto
  /// nosso.
  static const double tetoDaEscalaDoTitulo = 1.34;

  /// A altura de que a barra precisa para NAO cortar o nome.
  static double alturaDaBarra(
    BuildContext context, {
    required String nome,
    String? pet,
  }) {
    final tema = Theme.of(context);
    final escala = MediaQuery.textScalerOf(
      context,
    ).clamp(maxScaleFactor: tetoDaEscalaDoTitulo);
    final largura = math.max(
      1.0,
      MediaQuery.sizeOf(context).width - vaoTiradoPelaBarra,
    );
    final alturaDoNome = _alturaDe(
      nome,
      _estiloDoNome(tema),
      escala,
      largura,
      null,
    );
    final alturaDoPet = _temPet(pet)
        ? _alturaDe(pet!, _estiloDoPet(tema, context), escala, largura, 1)
        : 0.0;
    return math.max(
      BichuAlvoDeToque.critico,
      alturaDoNome + alturaDoPet + _respiroVertical,
    );
  }

  static bool _temPet(String? pet) => pet != null && pet.trim().isNotEmpty;

  static TextStyle _estiloDoNome(ThemeData tema) {
    return tema.appBarTheme.titleTextStyle ??
        tema.textTheme.headlineSmall ??
        const TextStyle(fontSize: 26);
  }

  static TextStyle _estiloDoPet(ThemeData tema, BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return (tema.textTheme.bodyMedium ?? const TextStyle(fontSize: 14))
        .copyWith(color: cores.textSecondary);
  }

  static double _alturaDe(
    String texto,
    TextStyle estilo,
    TextScaler escala,
    double largura,
    int? maxLinhas,
  ) {
    final pintor = TextPainter(
      text: TextSpan(text: texto, style: estilo),
      textDirection: TextDirection.ltr,
      textScaler: escala,
      maxLines: maxLinhas,
    )..layout(maxWidth: largura);
    final altura = pintor.height;
    pintor.dispose();
    return altura;
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final petDaConversa = pet;
    return Column(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          nome,
          style: _estiloDoNome(tema),
          softWrap: true,
          overflow: TextOverflow.visible,
        ),
        if (_temPet(petDaConversa))
          Text(
            petDaConversa!,
            style: _estiloDoPet(tema, context),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
      ],
    );
  }
}
