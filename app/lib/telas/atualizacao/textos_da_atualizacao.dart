/// Os textos do bloqueio por versao minima e do aviso brando.
///
/// Separados da tela pelo mesmo motivo de [TextosDoDetalhe]: quem revisa a
/// palavra nao deveria precisar ler um `build`, e a isca que cobra a frase
/// precisa de um lugar estavel para apontar.
///
/// ## A regra de linguagem desta tela
///
/// Quem le o bloqueio esta sendo impedido de usar o produto, agora, sem ter
/// feito nada de errado. Entao:
///
/// - **Nada de "versao incompativel", "obsoleta" nem "nao suportada".** Sao
///   palavras de sistema, e elas culpam o aparelho de quem le.
/// - **Diz o que aconteceu, nao o que a pessoa errou.** O sujeito da frase e o
///   aplicativo, nao ela.
/// - **Nenhum numero de versao.** Dizer "sua versao e a 1.3.9 e a minima e a
///   1.4.0" nao ajuda quem nao pode fazer nada com os numeros, e o servidor
///   nao manda numero nenhum de proposito (ver `versao_api.dart`).
/// - **Sem pedido de desculpa longo.** Uma linha de consequencia e o caminho.
///
/// ## Os dois textos de "como atualizar", e por que sao dois
///
/// Com loja configurada, a saida e um botao e a frase e curta. **Sem loja --
/// que e o estado de hoje** --, nao existe botao: o APK vai por arquivo e o
/// iOS por cabo (decisao de 23/09). A tela entao precisa dizer o que fazer em
/// palavras, e "procure quem te mandou o aplicativo" e a instrucao honesta
/// para quem instalou um APK recebido por mensagem. Desenhar um botao que nao
/// leva a lugar nenhum seria pior: ele parece a saida, e nao e.
///
/// Esta e tambem a razao pela qual o iOS de PROVISIONAMENTO GRATUITO nao fica
/// sem resposta. Aquele build vence em 7 dias e e reinstalado por cabo, e
/// "va para a loja" la seria instrucao impossivel -- mas o app **nao sabe de
/// onde foi instalado**, e nao ha deteccao disso aqui (ver o relatorio desta
/// entrega). O que resolve nao e deteccao: e o destino VAZIO, que faz o botao
/// nao existir e a frase de [comoAtualizarSemLoja] aparecer. Quem opera
/// escreve `store_url` apenas na plataforma que de fato tem loja.
library;

/// Os textos do portao de versao.
abstract final class TextosDaAtualizacao {
  // -- Bloqueio (nao da para fechar) ---------------------------------------

  /// O titulo. Fala do aplicativo, e nao da pessoa.
  static const String tituloDoBloqueio = 'Precisamos atualizar o Bichu';

  /// A consequencia, em uma frase.
  ///
  /// "Esta versao parou de funcionar" e o fato. Nao ha "incompativel", nao ha
  /// "obsoleta", e nao ha numero -- nenhum dos tres ajuda quem esta lendo.
  static const String corpoDoBloqueio =
      'Esta versao do aplicativo parou de funcionar. Atualize para continuar '
      'cuidando dos seus pets.';

  /// A frase que SUBSTITUI o botao quando nao ha loja configurada.
  ///
  /// Ela e deliberadamente concreta: quem instalou um APK recebido por
  /// mensagem precisa saber que o caminho e pedir o arquivo novo, e nao
  /// procurar uma loja onde o aplicativo nao esta.
  static const String comoAtualizarSemLoja =
      'A atualizacao ainda nao e distribuida por loja de aplicativos. Peca a '
      'versao nova a quem te enviou o Bichu.';

  /// O rotulo do botao, quando ha destino.
  static const String irParaALoja = 'Atualizar agora';

  // -- Aviso brando (dispensavel) ------------------------------------------

  /// A faixa do aviso brando. Uma linha: ela aparece sobre a tela em uso.
  static const String avisoDeVersaoNova =
      'Ha uma versao nova do Bichu, com correcoes e melhorias.';

  /// A acao do aviso brando, quando ha destino.
  static const String atualizar = 'Atualizar';

  /// Dispensar o aviso brando. **Existe so no aviso**, e nunca no bloqueio:
  /// bloqueio com saida nao e bloqueio.
  static const String agoraNao = 'Agora nao';

  /// O que o leitor de tela anuncia ao abrir o bloqueio.
  ///
  /// Explicita que nao ha saida, porque quem nao ve a tela tentaria procurar
  /// um botao de voltar que nao existe.
  static const String semanticaDoBloqueio =
      'Atualizacao necessaria. Esta tela nao pode ser fechada.';
}
