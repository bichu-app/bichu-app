/// Os textos da FOTO dentro da conversa, e o numero de bytes que a barra
/// escreve.
library;

/// Os textos, num lugar so.
abstract final class TextosDaFotoNaConversa {
  /// O nome acessivel do botao de anexar.
  static const String anexarFoto = 'Anexar uma foto';

  /// A linha curta ao lado do anexar.
  static const String aLocalizacaoSai =
      'A localização é removida da foto antes de enviar.';

  /// O rotulo do campo quando ha foto escolhida.
  static const String campoDeLegenda = 'Escreva uma legenda para a foto';

  /// O aviso de que falta a legenda.
  static const String aFotoPrecisaDeLegenda =
      'Escreva uma legenda para enviar a foto.';

  /// O nome acessivel do descarte.
  static const String descartarAFoto = 'Descartar a foto';

  /// A descricao da previa para quem usa leitor de tela.
  static const String previaAindaNaoEnviada =
      'Foto escolhida, ainda não enviada';

  /// O que a barra de progresso esta fazendo.
  static const String enviandoAFoto = 'Enviando a foto';

  /// Os bytes sairam e o servidor ainda nao respondeu.
  static const String terminandoDeEnviar = 'Terminando de enviar';

  /// A foto subiu e espera o toque em Enviar.
  static const String fotoProntaParaEnviar = 'Foto pronta para enviar.';

  /// A higiene assincrona do servidor ainda nao terminou.
  static const String preparandoAFoto =
      'Preparando a foto. Isso leva um instante.';

  /// Faltou rede no envio dos bytes.
  static const String aFotoNaoSubiu =
      'A foto não subiu. Confira a conexão e toque em Enviar a foto de novo.';

  /// O servidor ou o armazenamento recusaram, e nao ha texto do servidor para
  /// mostrar.
  static const String aFotoFoiRecusada =
      'Não conseguimos enviar esta foto. Escolha outra ou tire uma nova.';

  /// A acao do estado de erro: refazer o envio dos bytes, com a MESMA foto.
  static const String enviarAFotoDeNovo = 'Enviar a foto de novo';

  /// A outra acao do estado de erro.
  static const String descartar = 'Descartar';

  /// A legenda da foto RECEBIDA na conversa de achado.
  static const String fotoDeQuemDizTerEncontrado =
      'Foto enviada por quem diz ter encontrado o animal.';

  /// O aviso de que a foto **nao vai ser vista** pelo outro lado.
  static const String aFotoNaoChegaDoOutroLado =
      'Quem está do outro lado não tem conta no Bichu e não consegue abrir '
      'fotos. O que você escrever, esse usuário lê.';

  /// A marca na mensagem JA ENVIADA, no fio de quem a mandou.
  static const String essaPessoaNaoVeFotos = 'Este usuário não vê fotos.';

  /// A legenda da foto que a PROPRIA pessoa mandou.
  static const String fotoQueVoceEnviou = 'Foto que você enviou.';

  /// A legenda da foto que vem numa mensagem do sistema.
  static const String fotoDestaConversa = 'Foto enviada nesta conversa.';

  /// A imagem da conversa nao carregou.
  static const String aFotoNaoCarregou =
      'A foto não carregou. Toque para buscar de novo.';
}

/// Um tamanho em bytes, escrito como a pessoa le.
String bytesLegiveis(int bytes) {
  if (bytes < 0) return '0 KB';
  const int kb = 1024;
  const int mb = 1024 * 1024;
  if (bytes < mb) {
    final int emKb = (bytes + kb - 1) ~/ kb;
    return '$emKb KB';
  }
  final double emMb = bytes / mb;
  return '${emMb.toStringAsFixed(1).replaceAll('.', ',')} MB';
}

/// A linha que a barra de progresso escreve: `1,2 MB de 3,4 MB`.
String progressoEmBytes(int enviados, int total) {
  if (total <= 0) return bytesLegiveis(enviados);
  final int mostrado = enviados > total ? total : enviados;
  return '${bytesLegiveis(mostrado)} de ${bytesLegiveis(total)}';
}
