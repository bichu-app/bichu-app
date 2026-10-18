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
///
/// ## Privada, e a autorizacao nao esta aqui
///
/// O cliente decidiu em 18/10 que a pagina e privada: exige sessao e a pessoa
/// ve **so as plaquinhas dela**. Esta tela **nao confere dono nenhum**, e isso
/// e deliberado -- quem confere e a clausula `WHERE` do servidor, e pet de
/// outra conta responde **404 e nunca 403** (ADR-0021). Uma comparacao de dono
/// escrita aqui poderia ser escrita ao contrario, e um `WHERE` que falta nao
/// devolve o dado.
///
/// Por isso o 404 **nao e tratado como um erro especial**: para quem le, pet
/// de outra pessoa e pet que nao existe sao a mesma coisa, e a tela diz a
/// mesma frase nos dois casos.
///
/// ## Alcancavel por link direto, e por que isso e seguro aqui
///
/// Ao contrario do desfecho do formulario -- que fica na propria tela de
/// pedido, porque um destino de sucesso alcancavel por link afirmaria um
/// desfecho que ninguem produziu (criterio 2 da BICHUS-31) --, esta tela
/// **LE o pedido do servidor** antes de afirmar qualquer coisa. Ela nao
/// recebe desfecho em `extra`: ela pergunta.
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

  /// O mesmo sinalizador de `TelaSolicitarPlaquinha` e das outras telas que
  /// leem `Escopo`: ler um `InheritedWidget` em `initState` estoura
  /// `dependOnInheritedWidgetOfExactType ... before initState() completed`, e
  /// a tela abriria dizendo "servidor fora" sem ter chamado nada.
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
        // 404 cai aqui junto com o resto, e de proposito: pet de outra conta e
        // pet inexistente dizem a mesma coisa para quem le (ADR-0021).
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
      // **Estado legitimo, e nao erro**: o pet e seu e voce ainda nao pediu.
      // A pagina do pet nem oferece o link neste caso, mas o endereco e
      // alcancavel por link direto e ele precisa dizer algo.
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
      // Um pet costuma ter UM pedido; a lista existe porque a segunda
      // plaquinha e um pedido legitimo depois do primeiro ser atendido. Com
      // mais de um, o divisor e o que impede os trilhos de parecerem um so.
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
