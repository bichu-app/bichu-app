import 'dart:math' as math;

import 'package:flutter/material.dart';

/// O ESTADO DE UMA LISTAGEM SOBREVIVE A IDA E VOLTA (BICHUS-316).
const Duration validadeDaListagemPreservada = Duration(minutes: 5);

/// O TETO DE ITENS PRESERVADOS numa listagem de MINIATURA.
const int tetoDeItensPreservados = 100;

/// O TETO DE ITENS PRESERVADOS numa listagem de CAPA 16:9 -- a agenda.
const int tetoDeItensPreservadosComCapa = 40;

/// A DECISAO de devolver o estado preservado, ou de recomecar.
class PreservacaoDaListagem {
  PreservacaoDaListagem({
    required this.teto,
    DateTime Function()? relogio,
  }) : _relogio = relogio ?? DateTime.now;

  /// Quantos itens ainda cabem.
  final int teto;

  /// O relogio, injetavel **para o teste poder envelhecer o estado** sem
  /// esperar cinco minutos de verdade.
  final DateTime Function() _relogio;

  String? _assinatura;
  DateTime? _medidoEm;

  /// A listagem acabou de medir [itens] itens sob [assinatura].
  void marcar(String assinatura) {
    _assinatura = assinatura;
    _medidoEm = _relogio();
  }

  /// UM GATILHO DE INVALIDACAO DISPAROU: o estado preservado morre.
  void descartar() {
    _assinatura = null;
    _medidoEm = null;
  }

  /// Ha estado preservado que valha a pena devolver?
  bool vale({required int itens, required String assinatura}) {
    final medidoEm = _medidoEm;
    if (medidoEm == null) return false;
    if (_assinatura != assinatura) return false;
    if (itens <= 0) return false;
    if (itens > teto) return false;
    return _relogio().difference(medidoEm) < validadeDaListagemPreservada;
  }
}

/// A EPOCA DA LISTA, que a listagem publica para a casca.
class RolagemDaListagem extends ValueNotifier<int> {
  RolagemDaListagem() : super(0);

  bool _descartada = false;

  @override
  void dispose() {
    _descartada = true;
    super.dispose();
  }

  bool get descartada => _descartada;
}

/// O SLOT: a casca o oferece, o corpo da secao publica nele.
class SlotDaRolagem extends InheritedWidget {
  const SlotDaRolagem({
    required this.rolagem,
    required super.child,
    super.key,
  });

  final RolagemDaListagem rolagem;

  static SlotDaRolagem? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SlotDaRolagem>();

  /// A listagem DESCARTOU o que tinha: o deslocamento guardado morre com ela.
  void aListaFoiDescartada() {
    if (rolagem.descartada) return;
    rolagem.value = rolagem.value + 1;
  }

  @override
  bool updateShouldNotify(SlotDaRolagem antigo) => antigo.rolagem != rolagem;
}

/// GUARDA O DESLOCAMENTO FORA DO ROLAVEL, e o reaplica quando a listagem volta
/// a aparecer.
class PreservaARolagem extends StatefulWidget {
  const PreservaARolagem({
    required this.rolagem,
    required this.filho,
    super.key,
  });

  /// A epoca publicada pelo corpo.
  final RolagemDaListagem rolagem;

  /// Recebe o controlador que o rolavel tem de usar.
  final Widget Function(BuildContext context, ScrollController controlador)
      filho;

  @override
  State<PreservaARolagem> createState() => _EstadoDePreservaARolagem();
}

class _EstadoDePreservaARolagem extends State<PreservaARolagem> {
  late final ScrollController _controlador = ScrollController()
    ..addListener(_anotarODeslocamento);

  /// O ultimo deslocamento anotado COM A LISTA EM CENA, ou nulo.
  double? _guardado;

  bool _visivel = false;

  @override
  void initState() {
    super.initState();
    widget.rolagem.addListener(_aListaFoiDescartada);
  }

  @override
  void didUpdateWidget(PreservaARolagem antigo) {
    super.didUpdateWidget(antigo);
    if (antigo.rolagem != widget.rolagem) {
      antigo.rolagem.removeListener(_aListaFoiDescartada);
      widget.rolagem.addListener(_aListaFoiDescartada);
    }
  }

  /// A LISTA FOI DESCARTADA: o deslocamento morre com ela.
  void _aListaFoiDescartada() => _guardado = null;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final visivel = TickerMode.valuesOf(context).enabled;
    if (!visivel) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _reaplicar();
  }

  /// ANOTA O DESLOCAMENTO A CADA QUADRO DE ROLAGEM.
  void _anotarODeslocamento() {
    if (!_controlador.hasClients) return;
    final posicao = _controlador.positions.first;
    if (posicao.viewportDimension <= 0) return;
    _guardado = posicao.pixels;
  }

  /// Reaplica o deslocamento no quadro seguinte.
  void _reaplicar() {
    final alvo = _guardado;
    if (alvo == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!_controlador.hasClients) return;
      if (_guardado == null) return;
      final posicao = _controlador.positions.first;
      final destino = math.min(alvo, posicao.maxScrollExtent);
      if (destino <= 0) return;
      if ((posicao.pixels - destino).abs() > 0.5) posicao.jumpTo(destino);
    });
  }

  @override
  void dispose() {
    widget.rolagem.removeListener(_aListaFoiDescartada);
    _controlador
      ..removeListener(_anotarODeslocamento)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.filho(context, _controlador);
}

/// A ASSINATURA DA PERGUNTA, composta na MESMA ordem pelas tres listagens.
String assinaturaDaListagem({
  required Map<String, String> pergunta,
  required String? referencia,
}) {
  final chaves = pergunta.keys.where((chave) => chave != 'page').toList()
    ..sort();
  final recorte = chaves.map((c) => '$c=${pergunta[c]}').join('&');
  return '$recorte#${referencia ?? 'sem-referencia'}';
}

/// A localizacao de referencia da conta como UMA linha, ou nulo quando nao ha.
String? textoDaReferencia({
  String? cep,
  String? bairro,
  String? cidade,
  String? uf,
}) {
  if (cep == null && bairro == null && cidade == null && uf == null) {
    return null;
  }
  return '$cep|$bairro|$cidade|$uf';
}
