import 'package:flutter/material.dart';

import 'recado_na_abertura.dart';
import 'textos_da_abertura.dart';

/// A TELA QUE O CLIENTE PEDIU EM 26/10/2026.
///
/// Nas palavras dele: *"vamos implementar uma mensagem de erro, quando o
/// usuario tentar abrir o aplicativo e nao estiver conectado na internet, ao
/// invés de deixar parado na pagina de splashscreen"*.
///
/// ====================================================================
/// ELA NAO E UM BLOQUEIO, E A DIFERENCA E DELIBERADA
/// ====================================================================
///
/// [aoSeguirSemInternet] e obrigatorio. Uma tela de "sem internet" sem saida
/// trancaria o aplicativo exatamente nos casos em que o desenho dele diz que
/// ele tem de funcionar: `PortaoDeVersao` nasce liberado porque "metro,
/// elevador, aviao e sinal ruim sao operacao normal deste produto", e a fila
/// offline e as fotos pendentes existem para guardar o caso do pet sumido ate
/// o sinal voltar. Quem abre sem rede precisa alcancar essas duas coisas.
///
/// O que ela troca e o SILENCIO: antes, abrir sem internet levava a pessoa
/// para dentro do app sem uma palavra sobre o motivo de nada carregar.
class TelaDeAberturaSemConexao extends StatelessWidget {
  const TelaDeAberturaSemConexao({
    required this.aoTentarDeNovo,
    required this.aoSeguirSemInternet,
    super.key,
  });

  /// Pergunta outra vez. Quem chama volta a sondar e some com esta tela se o
  /// servidor responder.
  final VoidCallback aoTentarDeNovo;

  /// Segue para o aplicativo. **Obrigatorio** -- ver o cabecalho.
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
