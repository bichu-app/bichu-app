import 'package:flutter/material.dart';

import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import 'minhas_indicacoes.dart';

/// `Minhas indicações` como TELA PROPRIA, empilhada (19/10/2026).
class TelaDeMinhasIndicacoes extends StatefulWidget {
  const TelaDeMinhasIndicacoes({super.key});

  /// O titulo da barra de topo.
  static const String titulo = 'Minhas indicações';

  @override
  State<TelaDeMinhasIndicacoes> createState() =>
      _TelaDeMinhasIndicacoesState();
}

class _TelaDeMinhasIndicacoesState extends State<TelaDeMinhasIndicacoes> {
  final RecargaDaSecao _recarga = RecargaDaSecao();

  @override
  void dispose() {
    _recarga.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SlotDeAtualizacao(
      recarga: _recarga,
      child: Scaffold(
        appBar: AppBar(title: const Text(TelaDeMinhasIndicacoes.titulo)),
        body: SafeArea(
          child: ArrastarParaAtualizar.doSlot(
            recarga: _recarga,
            child: ListView(
              addSemanticIndexes: false,
              padding: const EdgeInsets.all(BichuEspaco.e4),
              children: const <Widget>[MinhasIndicacoes()],
            ),
          ),
        ),
      ),
    );
  }
}
