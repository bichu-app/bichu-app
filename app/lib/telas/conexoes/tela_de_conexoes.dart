/// A ENTRADA UNICA DE CONEXOES: `Conexões` · `Pendentes` · `Bloqueados`.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/seguranca_api.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../seguranca/tela_de_bloqueados.dart';
import 'tela_minhas_conexoes.dart';
import 'tela_pedidos_de_conexao.dart';

/// As tres abas, na ordem em que o cliente as pediu.
enum AbaDeConexoes {
  conexoes('Conexões'),
  pendentes('Pendentes'),
  bloqueados('Bloqueados');

  const AbaDeConexoes(this.rotulo);

  /// O que a aba diz. **`Bloqueados` e nao `Usuários bloqueados`**: a palavra
  /// que a pessoa procura e `bloqueados`, e a barra tem tres rotulos para
  /// acomodar.
  final String rotulo;
}

class TelaDeConexoes extends StatefulWidget {
  const TelaDeConexoes({
    required this.conexoes,
    required this.seguranca,
    super.key,
    this.abaInicial = AbaDeConexoes.conexoes,
  });

  final ConexoesApi conexoes;
  final SegurancaApi seguranca;

  /// Em qual aba a tela POUSA.
  final AbaDeConexoes abaInicial;

  @override
  State<TelaDeConexoes> createState() => _EstadoDeConexoes();
}

class _EstadoDeConexoes extends State<TelaDeConexoes>
    with SingleTickerProviderStateMixin {
  late final TabController _abas = TabController(
    length: AbaDeConexoes.values.length,
    initialIndex: widget.abaInicial.index,
    vsync: this,
  );

  /// Quantos pedidos RECEBIDOS esperam decisao, ou nulo quando ninguem contou.
  int? _recebidos;

  @override
  void initState() {
    super.initState();
    unawaited(_lerOResumo());
  }

  @override
  void dispose() {
    _abas.dispose();
    super.dispose();
  }

  /// **A falha deixa a pastilha de fora e NAO desenha faixa de erro.**
  Future<void> _lerOResumo() async {
    try {
      final resumo = await widget.conexoes.resumo();
      if (!mounted) return;
      setState(() => _recebidos = resumo.requestsReceivedCount);
    } on Object catch (erro) {
      if (!mounted) return;
      if (erro is! FalhaDeChamada) {
        // **SILENCIO DELIBERADO, e nao esquecimento** -- o mesmo arranjo de `FiacaoDoPasskey.reconciliarComAConta`, e pela mesma razao.
      }
      setState(() => _recebidos = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(TelaDeMinhasConexoes.titulo),
        bottom: TabBar(
          controller: _abas,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: <Widget>[
            for (final aba in AbaDeConexoes.values)
              Tab(
                height: BichuAlvoDeToque.min,
                child: aba == AbaDeConexoes.pendentes
                    ? _RotuloComContador(
                        rotulo: aba.rotulo,
                        contador: _recebidos,
                      )
                    : Text(aba.rotulo),
              ),
          ],
        ),
      ),
      body: SafeArea(
        top: false,
        child: TabBarView(
          controller: _abas,
          children: <Widget>[
            TelaDeMinhasConexoes(conexoes: widget.conexoes),
            TelaDePedidosDeConexao(
              conexoes: widget.conexoes,
              aoMudarOsPedidos: () => unawaited(_lerOResumo()),
            ),
            TelaDeBloqueados(seguranca: widget.seguranca),
          ],
        ),
      ),
    );
  }
}

/// O rotulo de uma aba com a pastilha do numero ao lado.
class _RotuloComContador extends StatelessWidget {
  const _RotuloComContador({required this.rotulo, required this.contador});

  final String rotulo;
  final int? contador;

  @override
  Widget build(BuildContext context) {
    final quantos = contador;
    if (quantos == null || quantos <= 0) return Text(rotulo);

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(rotulo),
        const SizedBox(width: BichuEspaco.e2),
        Semantics(
          label: TelaDePedidosDeConexao.quantosEsperam(quantos),
          excludeSemantics: true,
          child: Container(
            constraints: const BoxConstraints(minWidth: 20),
            height: 20,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e1),
            decoration: BoxDecoration(
              color: cores.primary,
              borderRadius: BorderRadius.circular(BichuRaio.full),
            ),
            child: Text(
              '$quantos',
              style: textos.labelSmall?.copyWith(color: cores.onPrimary),
            ),
          ),
        ),
      ],
    );
  }
}
