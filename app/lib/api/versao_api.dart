import 'api_client.dart';
import 'falhas.dart';

/// O veredito do servidor sobre ESTA versao do aplicativo.
///
/// Tres estados, e nao um booleano: `bloqueado` fecha o app e `recomendado` so
/// avisa, de forma dispensavel. Um booleano nao conseguiria carregar os dois.
///
/// Local: NAO espelha a grafia do contrato, e por isso nao aponta para ele.
/// O vocabulario de fio e `supported` / `update_recommended` /
/// `update_required`, em `AppVersionStatus.verdict`; a traducao mora num lugar
/// so, o mapa `VersaoApi._vereditos`, e e ele que decide o que fazer com um
/// valor que este binario nao conhece -- liberar.
///
/// **Espelhar a grafia aqui seria pior**, e nao melhor: um `enum` com os nomes
/// do fio faria `switch` sobre eles espalhado pelo app, e o dia em que o
/// servidor mandasse um quarto valor cada `switch` decidiria sozinho o que
/// fazer. Com a traducao num mapa, valor desconhecido tem UM destino, escrito
/// em uma linha.
enum VereditoDeVersao {
  /// Esta versao serve. **E o valor de toda ausencia e de toda falha.**
  liberado,

  /// Ha versao nova e esta ainda funciona. Aviso dispensavel, nunca bloqueio.
  recomendado,

  /// Esta versao nao serve mais. O unico estado que fecha o app.
  bloqueado,
}

/// O que o portao de versao recebeu do servidor.
class RespostaDeVersao {
  const RespostaDeVersao({
    required this.veredito,
    this.loja,
    this.servidorRespondeu = true,
  });

  /// O veredito LIBERADO, sem loja. O valor de toda falha e de toda ausencia.
  const RespostaDeVersao.liberado()
      : veredito = VereditoDeVersao.liberado,
        loja = null,
        servidorRespondeu = true;

  /// LIBERADO **e nao houve servidor do outro lado**.
  ///
  /// Existe pelo pedido do cliente de 26/10/2026: a abertura sem internet
  /// precisa dizer alguma coisa. O veredito continua [VereditoDeVersao
  /// .liberado] -- falta de rede nunca fecha o app, e essa trava nao mudou --,
  /// mas quem chama passa a conseguir distinguir *"o servidor disse que esta
  /// versao serve"* de *"nao deu para perguntar"*, que antes eram o MESMO
  /// valor.
  ///
  /// **Era a mesma coisa, e isso era o silencio.** Ate aqui as cinco formas de
  /// falha de [VersaoApi.consultar] devolviam um liberado indistinguivel do
  /// liberado de verdade, e por isso ninguem acima tinha de onde tirar a
  /// mensagem que o cliente pediu.
  const RespostaDeVersao.semResposta()
      : veredito = VereditoDeVersao.liberado,
        loja = null,
        servidorRespondeu = false;

  final VereditoDeVersao veredito;

  /// Houve um servidor do outro lado desta pergunta.
  ///
  /// `false` em duas das cinco formas de falha, e **somente nelas**: sem rede
  /// (`FalhaDeConexao`) e sem resposta no prazo (`FalhaDeTempo`). As outras
  /// tres -- erro do servidor, corpo fora do contrato e campo ausente --
  /// deixam `true`, porque nos tres o servidor RESPONDEU: anunciar "sem
  /// internet" para quem recebeu um 500 seria a tela mentindo sobre o que
  /// aconteceu, e mandaria a pessoa conferir o Wi-Fi dela por um defeito
  /// nosso.
  ///
  /// **5xx entra pela sonda, nao por aqui.** `SondaDeConexao` trata 5xx como
  /// servidor fora, e e ela quem responde pelos dois sintomas juntos; esta
  /// pergunta e sobre versao, e um 503 nela nao e evidencia de nada sobre o
  /// servico inteiro.
  final bool servidorRespondeu;

  /// Para onde mandar a pessoa. **Nula enquanto nao houver loja**, e hoje ela
  /// e nula: o APK vai por arquivo e o iOS por cabo. Nula, a tela nao desenha
  /// botao -- botao que leva a lugar nenhum e pior que nenhum botao.
  final Uri? loja;
}

/// A consulta ao veredito de versao (`getAppVersionStatus`).
///
/// ====================================================================
/// ESTA CLASSE NAO LANCA. NUNCA. E ISSO E O DESENHO INTEIRO.
/// ====================================================================
///
/// Toda a outra camada de API deste app sobe `FalhaDeChamada` para a tela
/// decidir o que dizer. **Aqui e o contrario**, e a diferenca nao e descuido:
/// quem chama isto e um portao que pode FECHAR o aplicativo. Se a falha
/// subisse, cada ponto de tratamento se tornaria uma chance de o app fechar
/// por engano -- e o custo de errar para esse lado e o produto inteiro, para
/// todos, ate alguem perceber.
///
/// Entao [consultar] devolve [VereditoDeVersao.bloqueado] **somente** quando o
/// servidor respondeu 200 com um corpo que diz, com essas letras,
/// `update_required`. Qualquer outra coisa devolve [VereditoDeVersao.liberado]:
///
/// 1. **sem rede** (`FalhaDeConexao`: sem sinal, DNS, recusa de conexao);
/// 2. **tempo esgotado** (`FalhaDeTempo`);
/// 3. **erro do servidor** (`FalhaDaApi`, de 400 a 503 -- inclusive o 429 do
///    teto e o 400 de versao fora do formato);
/// 4. **corpo fora do contrato** (200 com `verdict` que nao e texto, ou corpo
///    que nao e objeto, ou JSON invalido, que `ApiClient` entrega como
///    `TypeError`/`FormatException`);
/// 5. **campo ausente** (200 com `{}`, ou sem `verdict`);
///
/// e, somando aos cinco, **veredito que este binario nao conhece**: um
/// `verdict` novo que o servidor passe a mandar depois nao pode fechar um app
/// que nao sabe o que ele significa.
///
/// O `catch` e sobre `Object`, e nao sobre `FalhaDeChamada`. Capturar a
/// hierarquia declarada parece exaustivo e nao e -- o proprio `falhas.dart`
/// registra que corpo 200 fora do contrato estoura `TypeError`, fora da
/// hierarquia. E justamente a classe de erro que o item 4 descreve.
///
/// **Capturar nao e engolir**: nada aqui vai para log de proposito, porque
/// este caminho roda na abertura do app e sem conta, e um `reportError` por
/// abertura sem rede encheria a observabilidade de um estado que e normal
/// (metro, elevador, aviao). O que importa -- "o bloqueio nao se aplicou" --
/// e o comportamento padrao e nao um incidente.
class VersaoApi {
  const VersaoApi(this._api);

  final ApiClient _api;

  static const String caminho = '/app/version-status';

  /// Os vereditos que ESTE binario conhece, pelo texto do contrato.
  ///
  /// Mapa e nao `switch` sobre `String`: o `[]` devolve `null` para o que nao
  /// esta aqui, e `null` cai em [VereditoDeVersao.liberado] pelo `??` abaixo.
  /// Um `switch` com `default: bloqueado` seria a mesma linha escrita do lado
  /// errado, e e esse o engano que este mapa torna inexprimivel.
  static const Map<String, VereditoDeVersao> _vereditos = <String, VereditoDeVersao>{
    'supported': VereditoDeVersao.liberado,
    'update_recommended': VereditoDeVersao.recomendado,
    'update_required': VereditoDeVersao.bloqueado,
  };

  /// Pergunta o veredito. **Nunca lanca, e nunca bloqueia por falha.**
  ///
  /// [versao] nula ou vazia nem sai do aparelho: sem `APP_VERSION` no build
  /// nao ha o que perguntar, e perguntar sem versao receberia 400. Devolve
  /// liberado na hora.
  Future<RespostaDeVersao> consultar({
    required String plataforma,
    required String? versao,
  }) async {
    if (versao == null || versao.isEmpty) return const RespostaDeVersao.liberado();
    try {
      final json = await _api.get(
        caminho,
        query: <String, String>{'platform': plataforma, 'version': versao},
        // Rota publica: `security: []` no contrato. Sem token, e sem esperar
        // pelo chaveiro -- este e o primeiro pedido da abertura do app.
        exigeToken: false,
      );
      final bruto = json['verdict'];
      if (bruto is! String) return const RespostaDeVersao.liberado();
      final veredito = _vereditos[bruto] ?? VereditoDeVersao.liberado;
      if (veredito == VereditoDeVersao.liberado) {
        return const RespostaDeVersao.liberado();
      }
      return RespostaDeVersao(veredito: veredito, loja: _loja(json['store_url']));
    } on FalhaDeConexao {
      // SEM REDE. Libera -- a trava de 19/10 nao mudou --, e **diz** que nao
      // houve servidor. Ver [RespostaDeVersao.semResposta].
      return const RespostaDeVersao.semResposta();
    } on FalhaDeTempo {
      // A requisicao saiu e nada voltou no prazo. Para quem abriu o app isso e
      // indistinguivel de sem rede, e o desfecho e o mesmo.
      return const RespostaDeVersao.semResposta();
    } on Object {
      // Os outros tres casos do cabecalho -- erro do servidor, corpo fora do
      // contrato, campo ausente -- chegam aqui, e todos liberam SEM afirmar
      // que faltou internet.
      return const RespostaDeVersao.liberado();
    }
  }

  /// A URL da loja, ou nula.
  ///
  /// Valor presente e ilegivel vira nulo em vez de virar link quebrado, pela
  /// mesma regra de `AppConfig._uriOuNulo`: um botao que abre "lugar nenhum" e
  /// pior que nenhum botao, porque parece que funcionou. **Somente `https`**:
  /// o `CHECK` do banco ja o exige, e esta e a segunda recusa, no aparelho.
  static Uri? _loja(Object? bruto) {
    if (bruto is! String || bruto.isEmpty) return null;
    final uri = Uri.tryParse(bruto);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
    return uri;
  }
}
