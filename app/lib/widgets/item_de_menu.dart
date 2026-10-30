/// O item de menu do corpo de uma tela: uma linha que leva a uma acao.
library;

import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

class ItemDeMenu extends StatelessWidget {
  const ItemDeMenu({
    required this.rotulo,
    required this.aoTocar,
    super.key,
    this.apoio,
    this.critico = false,
    this.contador,
    this.rotuloDoContador,
  }) : assert(
          contador == null || rotuloDoContador != null,
          'Numero sem frase nao e anunciavel: quem usa leitor de tela ouviria '
          'o rotulo e nao ficaria sabendo do numero. Ver `rotuloDoContador`.',
        );

  final String rotulo;

  /// A linha de apoio, quando ela carrega informacao que a tela perderia sem
  /// ela.
  final String? apoio;

  /// Quando a acao e de saida ou destruicao, e por isso recebe a tinta da marca
  /// em vez do texto comum.
  final bool critico;

  /// QUANTOS ESPERAM DECISAO NESTE DESTINO, ou nulo quando a linha nao conta
  /// nada -- que e o estado das outras seis linhas deste menu.
  final int? contador;

  /// O QUE O NUMERO QUER DIZER, para o leitor de tela.
  final String? rotuloDoContador;

  final VoidCallback aoTocar;

  /// A pastilha deve ser desenhada?
  bool get temContador => contador != null && contador! > 0;

  /// O que o leitor de tela ouve: o rotulo, o apoio quando ha, o que o numero
  /// quer dizer quando ha, e nada do icone -- ele e decorativo e o rotulo ao
  /// lado ja diz para onde se vai.
  String get rotuloAcessivel {
    final partes = <String>[
      rotulo,
      if (apoio != null && apoio!.isNotEmpty) apoio as String,
      if (temContador) rotuloDoContador as String,
    ];
    return partes.join('. ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      container: true,
      excludeSemantics: true,
      label: rotuloAcessivel,
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.sm),
        child: Container(
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e3),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: cores.outline,
                width: BichuBorda.hairline,
              ),
            ),
          ),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      rotulo,
                      style: textos.titleMedium?.copyWith(
                        color: critico ? cores.primary : cores.textPrimary,
                      ),
                    ),
                    if (apoio != null && apoio!.isNotEmpty) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        apoio!,
                        style: textos.bodyMedium?.copyWith(
                          color: cores.textSecondary,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              if (temContador) ...<Widget>[
                const SizedBox(width: BichuEspaco.e2),
                Container(
                  constraints: const BoxConstraints(minWidth: 24),
                  height: 24,
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(
                    horizontal: BichuEspaco.e2,
                  ),
                  decoration: BoxDecoration(
                    color: cores.primary,
                    borderRadius: BorderRadius.circular(BichuRaio.full),
                  ),
                  child: Text(
                    '$contador',
                    style: textos.labelMedium?.copyWith(
                      color: cores.onPrimary,
                    ),
                  ),
                ),
              ],
              const SizedBox(width: BichuEspaco.e2),
              Icon(
                Icons.chevron_right,
                color: cores.textSecondary,
                semanticLabel: '',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// O cabecalho de um grupo de itens de menu.
class TituloDeGrupoDeMenu extends StatelessWidget {
  const TituloDeGrupoDeMenu(this.texto, {super.key});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
      child: Semantics(
        header: true,
        child: Text(
          texto,
          style: textos.labelMedium?.copyWith(color: cores.textMuted),
        ),
      ),
    );
  }
}
