import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A barra de ferramentas do teclado: `Concluir` e as setas de travessia.
class BarraDoTeclado extends StatelessWidget {
  const BarraDoTeclado({required this.aoConcluir, super.key});

  /// Fecha o teclado. Recebido de fora para esta barra nao decidir sozinha o
  /// que e o foco da tela.
  final VoidCallback aoConcluir;

  /// A altura da faixa, e o que [BarraDeAcaoFixa] reserva por cima dela.
  static const double altura = BichuAlvoDeToque.min;

  /// Quanto a faixa RESERVA enquanto um campo de texto corrido tem o foco, ou
  /// zero.
  static final ValueNotifier<double> alturaEmUso = ValueNotifier<double>(0);

  static const String rotuloConcluir = 'Concluir';
  static const String rotuloAnterior = 'Campo anterior';
  static const String rotuloProximo = 'Próximo campo';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Material(
      color: cores.surfaceSunken,
      child: SizedBox(
        height: altura,
        child: Row(
          children: <Widget>[
            IconButton(
              icon: const Icon(Icons.keyboard_arrow_up),
              tooltip: rotuloAnterior,
              onPressed: () => FocusManager.instance.primaryFocus?.previousFocus(),
            ),
            IconButton(
              icon: const Icon(Icons.keyboard_arrow_down),
              tooltip: rotuloProximo,
              onPressed: () => FocusManager.instance.primaryFocus?.nextFocus(),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.only(right: BichuEspaco.e2),
              child: TextButton(
                onPressed: aoConcluir,
                child: const Text(rotuloConcluir),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Mostra a [BarraDoTeclado] enquanto o campo de texto corrido que ele embala
/// estiver com o foco.
class AcessorioDeTextoCorrido extends StatefulWidget {
  const AcessorioDeTextoCorrido({required this.child, super.key});

  final Widget child;

  @override
  State<AcessorioDeTextoCorrido> createState() =>
      _AcessorioDeTextoCorridoState();
}

class _AcessorioDeTextoCorridoState extends State<AcessorioDeTextoCorrido> {
  OverlayEntry? _faixa;

  @override
  void dispose() {
    _esconder();
    super.dispose();
  }

  void _mostrar() {
    if (_faixa != null) return;
    final overlay = Overlay.maybeOf(context);
    if (overlay == null) return;
    final entrada = OverlayEntry(
      builder: (contexto) {
        final double teclado = MediaQuery.viewInsetsOf(contexto).bottom;
        if (teclado <= 0) return const SizedBox.shrink();
        return Positioned(
          left: 0,
          right: 0,
          bottom: teclado,
          child: BarraDoTeclado(
            aoConcluir: () => FocusManager.instance.primaryFocus?.unfocus(),
          ),
        );
      },
    );
    _faixa = entrada;
    overlay.insert(entrada);
    BarraDoTeclado.alturaEmUso.value = BarraDoTeclado.altura;
  }

  void _esconder() {
    _faixa?.remove();
    _faixa = null;
    BarraDoTeclado.alturaEmUso.value = 0;
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      onFocusChange: (bool tem) => tem ? _mostrar() : _esconder(),
      child: widget.child,
    );
  }
}
