import 'package:flutter/material.dart';

/// A porta de CRIAR da secao, desenhada como acao FLUTUANTE no corpo da tela.
class AcaoDeCriarFlutuante extends StatelessWidget {
  const AcaoDeCriarFlutuante({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
    super.key,
  }) : assert(
         rotulo != '',
         'AcaoDeCriarFlutuante sem rotulo e um icone mudo: o nome acessivel '
         'sai do tooltip, e sem ele o leitor de tela anuncia so "botao".',
       );

  /// O glifo. Da familia fechada do design system 10.1 (Material Symbols), que
  /// e a mesma de onde sai todo `Icons.*` deste app -- nenhum vetor novo,
  /// nenhum asset baixado.
  final IconData icone;

  /// O que vai ser criado, por extenso e em portugues.
  final String rotulo;

  /// **Nunca nulo.** Quem explica bloqueio de conta ou de e-mail e a tela de
  /// DESTINO, que tem onde escrever o motivo e a saida; um controle apagado
  /// aqui seria uma acao morta sem lugar nenhum onde dizer por que.
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      heroTag: null,
      onPressed: aoTocar,
      tooltip: rotulo,
      child: Icon(icone),
    );
  }
}
