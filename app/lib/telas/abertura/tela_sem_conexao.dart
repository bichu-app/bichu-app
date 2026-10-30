import 'package:flutter/material.dart';

import 'recado_na_abertura.dart';
import 'textos_da_abertura.dart';

/// A TELA QUE O CLIENTE PEDIU EM 26/10/2026.
class TelaDeAberturaSemConexao extends StatelessWidget {
  const TelaDeAberturaSemConexao({
    required this.aoTentarDeNovo,
    required this.aoSeguirSemInternet,
    super.key,
  });

  /// Pergunta outra vez. Quem chama volta a sondar e some com esta tela se o
  /// servidor responder.
  final VoidCallback aoTentarDeNovo;

  /// Segue para o aplicativo.
  final VoidCallback aoSeguirSemInternet;

  @override
  Widget build(BuildContext context) {
    return RecadoNaAbertura(
      icone: Icons.wifi_off_outlined,
      titulo: TextosDaAbertura.tituloSemConexao,
      corpo: TextosDaAbertura.corpoSemConexao,
      semantica: TextosDaAbertura.semanticaSemConexao,
      rotuloDaAcao: TextosDaAbertura.tentarDeNovo,
      aoTocarNaAcao: aoTentarDeNovo,
      rotuloDeFechar: TextosDaAbertura.seguirSemInternet,
      aoFechar: aoSeguirSemInternet,
    );
  }
}
