import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../roteamento/rotas.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O que a saida promete a quem toca nela.
enum TipoDeSaida {
  /// A tela e um **desvio**: o passo anterior existe e continua na pilha.
  voltar,

  /// A tela e um **destino**: o passo anterior foi substituido de proposito e
  /// nao existe mais.
  fechar,
}

/// O controle de saida das telas que cobrem a casca de abas.
class SaidaDaTela extends StatelessWidget {
  const SaidaDaTela({
    required this.tipo,
    super.key,
    this.escape = Rotas.pets,
    this.resultado,
    this.cor,
  });

  final TipoDeSaida tipo;

  /// A cor do glifo, quando o fundo atras dele **nao e superficie do tema**.
  final Color? cor;

  /// O valor que [BuildContext.pop] devolve a quem empilhou a tela.
  final Object? Function()? resultado;

  /// Para onde ir quando nao ha nada para desempilhar.
  final String escape;

  @override
  Widget build(BuildContext context) {
    final voltar = tipo == TipoDeSaida.voltar;
    final rotulo = voltar ? 'Voltar' : 'Fechar';

    return IconButton(
      onPressed: () {
        if (context.canPop()) {
          final valor = resultado?.call();
          if (valor == null) {
            context.pop();
          } else {
            context.pop(valor);
          }
          return;
        }
        context.go(escape);
      },
      tooltip: rotulo,
      icon: Icon(voltar ? Icons.arrow_back : Icons.close),
      iconSize: 24,
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      padding: EdgeInsets.zero,
      color: cor ?? BichuColors.of(context).cores.textPrimary,
      focusColor: BichuColors.of(context).cores.focusRing,
      style: IconButton.styleFrom(
        minimumSize: const Size.square(BichuAlvoDeToque.critico),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}

/// A barra de topo das telas de conta: titulo e saida, sempre as duas.
class BarraDeConta extends StatelessWidget implements PreferredSizeWidget {
  const BarraDeConta({
    required this.titulo,
    required this.saida,
    super.key,
    this.escape = Rotas.pets,
    this.resultado,
  });

  final String titulo;
  final TipoDeSaida saida;
  final String escape;

  /// Repassado a [SaidaDaTela.resultado].
  final Object? Function()? resultado;

  @override
  Size get preferredSize =>
      const Size.fromHeight(BichuAlvoDeToque.critico);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      toolbarHeight: BichuAlvoDeToque.critico,
      leadingWidth: BichuAlvoDeToque.critico,
      leading: SaidaDaTela(tipo: saida, escape: escape, resultado: resultado),
      title: Text(titulo),
    );
  }
}
