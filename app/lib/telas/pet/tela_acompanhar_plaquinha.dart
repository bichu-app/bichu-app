import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../escopo.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/acompanhamento_do_pedido.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// A PAGINA DE ACOMPANHAMENTO do pedido da plaquinha.
class TelaAcompanharPlaquinha extends StatefulWidget {
  const TelaAcompanharPlaquinha({super.key, required this.petId});

  final String petId;

  @override
  State<TelaAcompanharPlaquinha> createState() =>
      _TelaAcompanharPlaquinhaState();
}

class _TelaAcompanharPlaquinhaState extends State<TelaAcompanharPlaquinha> {
  List<PedidoDePlaquinha>? _pedidos;
  bool _carregando = true;
  String? _falha;

  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
    });
    try {
      final pedidos =
          await Escopo.of(context).pets.listarPedidosDePlaquinha(widget.petId);
      if (!mounted) return;
      setState(() {
        _pedidos = pedidos;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _falha = MensagensDeErro.de(falha).texto;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler os pedidos da plaquinha');
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _falha = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: _TextosDaPagina.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(child: _corpo()),
    );
  }

  Widget _corpo() {
    if (_carregando) return const Center(child: CircularProgressIndicator());

    if (_falha != null) {
      return Padding(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        child: FaixaDeAviso(
          texto: _falha!,
          rotuloDaAcao: _TextosDaPagina.atualizar,
          aoTocarNaAcao: _carregar,
        ),
      );
    }

    final pedidos = _pedidos ?? const <PedidoDePlaquinha>[];
    if (pedidos.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        child: Center(
          child: Text(
            _TextosDaPagina.semPedido,
            style: Theme.of(context).textTheme.bodyLarge,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      itemCount: pedidos.length,
      separatorBuilder: (context, _) => const Padding(
        padding: EdgeInsets.symmetric(vertical: BichuEspaco.e6),
        child: Divider(height: 1),
      ),
      itemBuilder: (context, i) => AcompanhamentoDoPedido(pedido: pedidos[i]),
    );
  }
}

abstract final class _TextosDaPagina {
  static const String titulo = 'Pedido da plaquinha';
  static const String atualizar = 'Atualizar';
  static const String semPedido = 'Nenhum pedido para este pet.';
}
