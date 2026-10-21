/// Os textos da FOTO dentro da conversa, e o numero de bytes que a barra
/// escreve.
///
/// ---------------------------------------------------------------------------
/// ## A REDACAO E DECISAO DE PRODUTO, E ELA TEM UM MOTIVO MATERIAL
///
/// A foto que chega de quem diz ter encontrado o animal **nao e apresentada
/// como prova de posse**. Nenhum texto deste arquivo escreve "prova",
/// "comprovacao", "confirmacao" nem "verificado", e a isca
/// `test/mensagens/foto_dentro_da_conversa_test.dart` varre a tela procurando
/// essas palavras.
///
/// O motivo nao e pudor de linguagem, e aritmetica do golpe: **a foto do pet
/// perdido e PUBLICA** na listagem de perdidos (`PublicLostPet.photo_url`).
/// Quem nao tem o animal pode baixa-la e devolve-la na conversa. Se a
/// interface chamar aquela imagem de comprovacao, ela empresta credibilidade
/// que ela nao mediu -- e o golpe do falso achador opera exatamente nessa
/// credibilidade emprestada.
///
/// Entao a legenda diz **quem disse**, e nao **o que e verdade**:
/// [fotoDeQuemDizTerEncontrado]. O app nao atesta o que nao verificou.
///
/// ---------------------------------------------------------------------------
/// ## "Localizacao", e nunca "EXIF"
///
/// O servidor substitui o arquivo enviado por uma derivada sem metadado
/// nenhum, porque o EXIF de foto de celular carrega coordenada de GPS
/// (`createFoundReportPhotoUploadIntent`, decisao do cliente de 17/10/2026).
/// Isso e uma coisa boa que acontece com a pessoa, e ela tem de poder ler.
/// "Removemos os metadados EXIF" e a mesma informacao escrita para quem nao
/// precisava dela.
library;

/// Os textos, num lugar so.
///
/// Separado de `TextosDasMensagens` (que mora em `area_de_mensagens.dart`)
/// porque aquele arquivo esta sendo mexido por outra frente nesta mesma data e
/// escrever nele colidiria. A fusao dos dois, quando as frentes se unirem, e um
/// movimento de texto e nao de comportamento.
abstract final class TextosDaFotoNaConversa {
  /// O nome acessivel do botao de anexar. **Diz o que o toque FAZ.**
  static const String anexarFoto = 'Anexar uma foto';

  /// A linha curta ao lado do anexar.
  ///
  /// Sem jargao, e no presente: e o que vai acontecer com a foto desta pessoa,
  /// e nao uma politica abstrata. "Metadado" e "EXIF" ficam fora.
  static const String aLocalizacaoSai =
      'A localização é removida da foto antes de enviar.';

  /// O rotulo do campo quando ha foto escolhida.
  ///
  /// **Muda de "Escreva uma mensagem" para "legenda"** porque com a foto na
  /// tela o campo deixou de ser opcional: o contrato exige `body` de 1 a 1000,
  /// e o `CHECK` do banco exige texto nao vazio. Um campo que continuasse
  /// dizendo "mensagem" pareceria dispensavel ao lado de uma foto.
  static const String campoDeLegenda = 'Escreva uma legenda para a foto';

  /// O aviso de que falta a legenda. **Nao e erro**: e o que falta para
  /// enviar, dito antes de a pessoa tocar num botao que nao responderia.
  static const String aFotoPrecisaDeLegenda =
      'Escreva uma legenda para enviar a foto.';

  /// O nome acessivel do descarte.
  static const String descartarAFoto = 'Descartar a foto';

  /// A descricao da previa para quem usa leitor de tela.
  ///
  /// **Diz que nada foi enviado ainda**, que e o fato mais importante deste
  /// estado: foto mandada por engano numa conversa nao se desfaz como
  /// rascunho.
  static const String previaAindaNaoEnviada =
      'Foto escolhida, ainda não enviada';

  /// O que a barra de progresso esta fazendo.
  static const String enviandoAFoto = 'Enviando a foto';

  /// Os bytes sairam e o servidor ainda nao respondeu. **Nao e "pronto"**: ver
  /// `ProgressoDeEnvio` em `api/envio_de_foto.dart`.
  static const String terminandoDeEnviar = 'Terminando de enviar';

  /// A foto subiu e espera o toque em Enviar.
  static const String fotoProntaParaEnviar = 'Foto pronta para enviar.';

  /// A higiene assincrona do servidor ainda nao terminou.
  ///
  /// **E o caso raro e nao o caminho comum**: os bytes sobem na ESCOLHA, e
  /// quando a pessoa toca em Enviar o processamento em geral ja acabou. A
  /// corrida existe, e e so ela que este texto cobre.
  static const String preparandoAFoto =
      'Preparando a foto. Isso leva um instante.';

  /// Faltou rede no envio dos bytes. Tentar de novo resolve.
  static const String aFotoNaoSubiu =
      'A foto não subiu. Confira a conexão e toque em Enviar a foto de novo.';

  /// O servidor ou o armazenamento recusaram, e nao ha texto do servidor para
  /// mostrar.
  ///
  /// **Quando o servidor manda texto, e o dele que aparece** -- as quatro
  /// frases de recusa de foto sao escritas por ele, e reescreve-las aqui seria
  /// a segunda copia que diverge.
  static const String aFotoFoiRecusada =
      'Não conseguimos enviar esta foto. Escolha outra ou tire uma nova.';

  /// A acao do estado de erro: refazer o envio dos bytes, com a MESMA foto.
  static const String enviarAFotoDeNovo = 'Enviar a foto de novo';

  /// A outra acao do estado de erro.
  static const String descartar = 'Descartar';

  /// A legenda da foto RECEBIDA na conversa de achado.
  ///
  /// **Diz quem disse, e nao o que e verdade.** Ver o cabecalho deste arquivo:
  /// a foto do pet perdido e publica, e quem nao tem o animal pode devolve-la
  /// aqui.
  static const String fotoDeQuemDizTerEncontrado =
      'Foto enviada por quem diz ter encontrado o animal.';

  /// A legenda da foto que a PROPRIA pessoa mandou.
  static const String fotoQueVoceEnviou = 'Foto que você enviou.';

  /// A legenda da foto que vem numa mensagem do sistema.
  ///
  /// Neutra de proposito: a mensagem do sistema nao e de nenhum dos dois
  /// lados, e atribui-la a um deles faria parecer que uma das duas pessoas
  /// mandou aquilo.
  static const String fotoDestaConversa = 'Foto enviada nesta conversa.';

  /// A imagem da conversa nao carregou.
  ///
  /// **A validade da URL assinada e curta**, entao reabrir a conversa depois de
  /// um tempo cai aqui de verdade -- e o conserto e buscar de novo, nao
  /// insistir na mesma URL. O texto diz a acao e nao a causa: "o link da foto
  /// venceu" seria explicar o nosso mecanismo para resolver o problema dela.
  static const String aFotoNaoCarregou =
      'A foto não carregou. Toque para buscar de novo.';
}

/// Um tamanho em bytes, escrito como a pessoa le.
///
/// ## A unidade e a MESMA que o resto do app usa, e isso e deliberado
///
/// `orientacaoDeTamanhoDaImagem` em `dispositivo/camera_e_galeria.dart` diz
/// *"Envie uma imagem de ate 5 MB"* para um teto de 5 242 880 bytes -- isto e,
/// a casa chama 1024 x 1024 de "MB". Escrever 5,24 MB aqui para o mesmo arquivo
/// faria a barra encher ate um numero diferente do que o aviso de tamanho
/// promete, e a pessoa leria dois tetos para uma regra.
///
/// ## Virgula, e uma casa decimal
///
/// Virgula porque e pt-BR. **Uma** casa porque a barra atualiza a cada 64 KiB:
/// com duas casas o ultimo digito viraria ruido piscando, e com zero casas uma
/// foto de 1,9 MB passaria o envio inteiro escrita como `1 MB de 1 MB`.
///
/// Abaixo de 1 MB sai em KB inteiro: `0,8 MB` e menos legivel que `812 KB`, e
/// nenhuma foto de celular termina ali.
String bytesLegiveis(int bytes) {
  if (bytes < 0) return '0 KB';
  const int kb = 1024;
  const int mb = 1024 * 1024;
  if (bytes < mb) {
    // Arredonda para cima, e nao para baixo: um arquivo de 300 bytes escrito
    // como `0 KB` leria como "nada", e o que ha nao e nada.
    final int emKb = (bytes + kb - 1) ~/ kb;
    return '$emKb KB';
  }
  final double emMb = bytes / mb;
  // `toStringAsFixed` arredonda; a virgula entra por substituicao porque o
  // numero sai sempre com ponto, em qualquer local.
  return '${emMb.toStringAsFixed(1).replaceAll('.', ',')} MB';
}

/// A linha que a barra de progresso escreve: `1,2 MB de 3,4 MB`.
///
/// **Os dois numeros, sempre.** Sozinho, `1,2 MB` nao diz se falta muito; e o
/// par que transforma a barra em informacao. [total] zero ou negativo devolve
/// apenas o enviado: um `de 0 MB` seria um denominador que nao existe.
String progressoEmBytes(int enviados, int total) {
  if (total <= 0) return bytesLegiveis(enviados);
  // O enviado nunca passa do total na tela, mesmo que o contador passe: o
  // envelope do multipart nao entra na conta, mas um retorno fora de ordem
  // escreveria `3,5 MB de 3,4 MB`, que parece defeito.
  final int mostrado = enviados > total ? total : enviados;
  return '${bytesLegiveis(mostrado)} de ${bytesLegiveis(total)}';
}
