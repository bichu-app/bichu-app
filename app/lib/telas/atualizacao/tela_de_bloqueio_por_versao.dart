import 'package:flutter/material.dart';

import '../../dispositivo/saida_do_app.dart';
import '../abertura/recado_na_abertura.dart';
import 'textos_da_atualizacao.dart';

/// A TELA DE BLOQUEIO por versao minima.
class TelaDeBloqueioPorVersao extends StatelessWidget {
  const TelaDeBloqueioPorVersao({super.key, this.loja});

  /// Para onde o botao manda.
  final Uri? loja;

  @override
  Widget build(BuildContext context) {
    final destino = loja;

    return RecadoNaAbertura(
      icone: Icons.system_update_outlined,
      titulo: TextosDaAtualizacao.tituloDoBloqueio,
      corpo: TextosDaAtualizacao.corpoDoBloqueio,
      semantica: TextosDaAtualizacao.semanticaDoBloqueio,
      semAcao: destino == null
          ? TextosDaAtualizacao.comoAtualizarSemLoja
          : null,
      rotuloDaAcao: destino == null ? null : TextosDaAtualizacao.irParaALoja,
      aoTocarNaAcao: destino == null
          ? null
          : () => SaidaDoApp.atual.abrirLink(destino),
    );
  }
}
