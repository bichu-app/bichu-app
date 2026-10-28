/// Configuracao resolvida no build do app, nao no runtime do servidor.
///
/// `API_BASE_URL` e a unica das tres URLs base do projeto que o app conhece, e
/// e legitimamente diferente das outras duas no mesmo ambiente
/// (docs/07-devops.md secao 3.9). Ela entra por `--dart-define`:
///
/// ```
/// flutter build apk --dart-define=API_BASE_URL=http://SEU_IP:3000
/// ```
///
/// `SEU_IP` e o endereco da maquina que roda a API na Wi-Fi do aparelho. O
/// marcador esta aqui no lugar de um IP de exemplo de proposito: endereco
/// privado escrito em codigo e amarracao de ambiente, o portao de
/// portabilidade reprova, e o valor copiado sem pensar aponta o app para uma
/// maquina que nao e a de quem copiou.
library;

/// O que o app sabe sobre onde a API esta.
class AppConfig {
  const AppConfig._({
    required this.apiBaseUrl,
    required this.ambiente,
    required this.versaoDosTermos,
    required this.urlDosTermos,
    required this.urlDaPrivacidade,
    required this.versaoDoApp,
    required this.commitDoBuild,
  });

  /// Raiz da API, **sem** a barra final e **sem** o `/v1`, que a camada de
  /// acesso acrescenta.
  final Uri apiBaseUrl;

  /// Nome do ambiente, so para telemetria e para a tela de suporte.
  final String ambiente;

  /// Identificador da versao dos termos que o cadastro grava como aceita.
  ///
  /// Vai em `accepted_terms_version` do `RegisterRequest`. O backend so grava
  /// `accepted_terms_at` quando este campo chega, entao **omiti-lo e a mesma
  /// coisa que nao registrar aceite nenhum**: a pessoa aceita os termos e nao
  /// fica prova de qual versao ela aceitou. Isso e onus da prova, nao tela
  /// (docs/04-seguranca.md secao 6.6).
  ///
  /// **Nulo quando o build nao declarou**, e nao ha valor padrao de proposito:
  /// a secao 6.6 diz que a versao e "o identificador do arquivo versionado no
  /// repositorio, nao 'v1' digitado a mao". Nao existe esse arquivo ainda.
  /// Inventar um numero aqui gravaria no banco a prova de um aceite a um
  /// documento que nao existe, que e pior que nao gravar.
  final String? versaoDosTermos;

  /// URL do documento de termos de uso, aberta pelo link da tela de cadastro.
  ///
  /// Nula quando o build nao declarou. **A URL inteira vem do build, e nao um
  /// caminho montado sobre a base publica:** essas paginas sao superficie web,
  /// de outro time, e nao existem ainda. Montar `<base>/termos` seria eu
  /// inventar a rota de uma pagina que nao desenhei.
  final Uri? urlDosTermos;

  /// URL da politica de privacidade. Mesma regra de [urlDosTermos].
  final Uri? urlDaPrivacidade;

  /// A VERSAO DESTE BINARIO, que o app manda ao servidor para receber o
  /// veredito de `GET /v1/app/version-status`.
  ///
  /// Entra por `--dart-define=APP_VERSION=<versionName>`, e ela precisa ser o
  /// MESMO valor que `--build-name` do comando de build. O lugar certo de
  /// garantir isso e o comando, e nao este arquivo: as duas saem da mesma
  /// linha em `infra/verificacao/verificar-apk.sh`.
  ///
  /// **Nula quando o build nao declarou, e isso NAO derruba o arranque.** A
  /// diferenca em relacao a `API_BASE_URL` e de consequencia, como a das tres
  /// URLs acima: sem `API_BASE_URL` o app nao faz nada; sem `APP_VERSION` ele
  /// faz tudo, e so o bloqueio por versao minima fica inerte -- o portao
  /// trata versao desconhecida como "nao consegui perguntar" e LIBERA o uso.
  ///
  /// Essa direcao e deliberada e e a mesma do mecanismo inteiro: derrubar o
  /// arranque, ou bloquear por nao saber a versao, trocaria "a versao velha
  /// passa por mais um minuto" por "ninguem usa o produto". O preco honesto
  /// de um `APP_VERSION` esquecido e um mecanismo desligado em silencio, e e
  /// por isso que ele e exigido pelo script de build e nao descoberto aqui.
  ///
  /// **NAO vem de `package_info_plus`**, que leria o `versionName` do proprio
  /// APK e nao poderia divergir dele. Aquele caminho foi recusado hoje por
  /// custo: e canal de plataforma, exige dependencia direta nova, e teria de
  /// morar atras de uma porta em `lib/dispositivo/`. A divergencia possivel
  /// (build com `--build-name` diferente do `--dart-define`) e o preco, esta
  /// escrito aqui, e o conserto e trocar esta linha por aquela porta -- sem
  /// tocar em mais nada, porque quem le isto e so o portao de versao.
  final String? versaoDoApp;

  /// O COMMIT QUE GEROU ESTE BINARIO, para o app poder DIZER qual build e.
  ///
  /// Entra por `--dart-define=BUILD_COMMIT=<sha>`, e a chave e a MESMA que o
  /// `Dockerfile` e o `Makefile` ja exigem desde a BICHUS-210 para estampar o
  /// commit nos containers (`/etc/bichu/commit`, lido por `GET /health`).
  /// **Reusar o nome e deliberado, e nao economia de teclado**: um segundo
  /// nome para o mesmo fato (`GIT_SHA`, `BUILD_SHA`, `COMMIT_SHA` -- medidos
  /// em 26/10/2026 como ZERO ocorrencias em `app/lib`) daria dois conceitos de
  /// "qual build e este" dentro do mesmo produto, e quem estampa o servidor
  /// com um e o aplicativo com outro nao consegue comparar os dois.
  ///
  /// **POR QUE ISTO EXISTE.** Ate 26/10/2026 nada no app dizia qual build
  /// estava instalado: `APP_VERSION` era `1.0.0` em TODO build, entao dois
  /// APKs de dias diferentes se apresentavam com o mesmo nome. A consequencia
  /// nao foi tecnica, foi de conversa: o cliente relatou duas vezes que uma
  /// coisa pronta "nao chegou" no aparelho dele, e nao havia como saber se o
  /// APK que ele tinha continha aquele trabalho ou nao. O carimbo nao conserta
  /// nenhum defeito do produto; ele torna a pergunta respondivel.
  ///
  /// **Nulo quando o build nao declarou**, pela mesma razao de [versaoDoApp]:
  /// nao saber o proprio commit nao e motivo para o app nao subir. O que o
  /// carimbo faz nesse caso **nao e desaparecer** -- ele diz, na tela, que o
  /// build nao declarou. Rodape vazio e indistinguivel de rodape que sumiu, e
  /// foi exatamente essa indistinguibilidade que criou o problema acima.
  final String? commitDoBuild;

  /// O commit CURTO: o que a tela mostra e o que da para ler em voz alta.
  ///
  /// Dez digitos. O `git log --oneline` deste repositorio imprime oito, e dez
  /// da folga para nao colidir. Valor mais curto que isso volta INTEIRO em vez
  /// de ser cortado -- cortar um valor de oito para dez nao e possivel, e
  /// `substring` cego estouraria em vez de mostrar o que tem.
  String? get commitCurtoDoBuild {
    final valor = commitDoBuild;
    if (valor == null) return null;
    return valor.length <= 10 ? valor : valor.substring(0, 10);
  }

  static const String _chaveApi = 'API_BASE_URL';
  static const String _chaveAmbiente = 'ENVIRONMENT';
  static const String _chaveVersaoDosTermos = 'TERMS_VERSION';
  static const String _chaveUrlDosTermos = 'TERMS_URL';
  static const String _chaveUrlDaPrivacidade = 'PRIVACY_URL';
  static const String _chaveVersaoDoApp = 'APP_VERSION';
  static const String _chaveCommitDoBuild = 'BUILD_COMMIT';

  static const String _apiBaseUrlBruta =
      String.fromEnvironment(_chaveApi, defaultValue: '');
  static const String _ambienteBruto =
      String.fromEnvironment(_chaveAmbiente, defaultValue: 'dev');
  static const String _versaoDosTermosBruta =
      String.fromEnvironment(_chaveVersaoDosTermos, defaultValue: '');
  static const String _urlDosTermosBruta =
      String.fromEnvironment(_chaveUrlDosTermos, defaultValue: '');
  static const String _urlDaPrivacidadeBruta =
      String.fromEnvironment(_chaveUrlDaPrivacidade, defaultValue: '');
  static const String _versaoDoAppBruta =
      String.fromEnvironment(_chaveVersaoDoApp, defaultValue: '');
  static const String _commitDoBuildBruto =
      String.fromEnvironment(_chaveCommitDoBuild, defaultValue: '');

  static AppConfig? _instancia;

  /// A configuracao do processo.
  ///
  /// Chame [carregar] uma vez no arranque. Ler antes disso e erro de
  /// programacao, e falha dizendo isso em vez de devolver um valor plausivel.
  static AppConfig get instancia {
    final atual = _instancia;
    if (atual == null) {
      throw StateError(
        'AppConfig.carregar() precisa rodar antes de qualquer leitura de '
        'configuracao. Chame no main(), antes de runApp().',
      );
    }
    return atual;
  }

  /// Le a configuracao do build e **falha ruidosamente** quando falta valor.
  ///
  /// Nunca sobe degradado em silencio: um app apontado para lugar nenhum passa
  /// na homologacao como se fosse problema de rede, e o defeito so aparece no
  /// aparelho de quem esta homologando (criterio de aceite de BICHUS-13,
  /// antiga BICHU-25).
  static AppConfig carregar({
    String? apiBaseUrlDeTeste,
    String? versaoDosTermosDeTeste,
    String? urlDosTermosDeTeste,
    String? urlDaPrivacidadeDeTeste,
    String? versaoDoAppDeTeste,
    String? commitDoBuildDeTeste,
  }) {
    final bruta = apiBaseUrlDeTeste ?? _apiBaseUrlBruta;

    if (bruta.trim().isEmpty) {
      throw ConfiguracaoAusente(_chaveApi);
    }

    final uri = Uri.tryParse(bruta.trim());
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw ConfiguracaoInvalida(
        _chaveApi,
        bruta,
        'precisa ser uma URL absoluta com esquema e host, '
        'por exemplo http://SEU_IP:3000',
      );
    }
    if (uri.scheme != 'http' && uri.scheme != 'https') {
      throw ConfiguracaoInvalida(
        _chaveApi,
        bruta,
        'o esquema precisa ser http ou https',
      );
    }

    // As tres abaixo NAO derrubam o arranque quando faltam, ao contrario da
    // URL da API. O motivo e a diferenca de consequencia: sem API o app nao faz
    // nada e o certo e parar; sem a versao dos termos o app funciona inteiro e
    // so o cadastro grava um aceite sem versao. Derrubar o arranque por isso
    // deixaria o produto inteiro parado por causa de uma pagina que outro time
    // ainda nao publicou.
    //
    // O que impede a omissao silenciosa nao e este arquivo, e a assinatura de
    // `AuthApi.criarConta`: la `versaoDosTermos` e parametro **obrigatorio**, e
    // o compilador cobra de cada chamador. Foi assim que o campo sumiu antes:
    // ele era opcional, ninguem passava, e a chave saia do corpo em silencio.
    final config = AppConfig._(
      apiBaseUrl: _semBarraFinal(uri),
      ambiente: _ambienteBruto,
      versaoDosTermos: _ouNulo(versaoDosTermosDeTeste ?? _versaoDosTermosBruta),
      urlDosTermos: _uriOuNulo(urlDosTermosDeTeste ?? _urlDosTermosBruta),
      urlDaPrivacidade:
          _uriOuNulo(urlDaPrivacidadeDeTeste ?? _urlDaPrivacidadeBruta),
      // **Nao e validada aqui**, e a ausencia de validacao e deliberada: o
      // formato de versao e cobrado pelo `pattern` de `AppVersion` do
      // contrato, que responde 400, e o portao de versao trata 400 como "nao
      // consegui perguntar". Uma segunda definicao do formato neste arquivo
      // seria a divergencia que o ADR-0001 existe para nao ter -- e, pior,
      // uma validacao local que recusasse poderia virar tela de erro por um
      // valor que o servidor aceitaria.
      versaoDoApp: _ouNulo(versaoDoAppDeTeste ?? _versaoDoAppBruta),
      // **Nao e validado aqui**, pela mesma razao de `versaoDoApp` acima: o
      // formato de commit e cobrado no comando de build (o `Makefile` tem
      // `FORMA_DE_COMMIT` desde a BICHUS-210) e no portao do APK, que mede o
      // VALOR dentro do binario. Uma segunda definicao do formato neste
      // arquivo seria a divergencia que o ADR-0001 existe para nao ter.
      commitDoBuild: _ouNulo(commitDoBuildDeTeste ?? _commitDoBuildBruto),
    );
    _instancia = config;
    return config;
  }

  static String? _ouNulo(String valor) {
    final v = valor.trim();
    return v.isEmpty ? null : v;
  }

  /// URL absoluta, ou nulo.
  ///
  /// Valor presente e ilegivel vira nulo em vez de virar link quebrado: um
  /// link que abre "lugar nenhum" e pior que um documento declarado ausente,
  /// porque parece que funcionou.
  static Uri? _uriOuNulo(String valor) {
    final v = _ouNulo(valor);
    if (v == null) return null;
    final uri = Uri.tryParse(v);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) return null;
    if (uri.scheme != 'http' && uri.scheme != 'https') return null;
    return uri;
  }

  /// Apaga a configuracao carregada. Existe para o teste, e so para ele.
  static void limparParaTeste() => _instancia = null;

  static Uri _semBarraFinal(Uri uri) {
    final caminho = uri.path.endsWith('/')
        ? uri.path.substring(0, uri.path.length - 1)
        : uri.path;
    return uri.replace(path: caminho);
  }
}

/// Variavel de ambiente obrigatoria que nao veio no build.
class ConfiguracaoAusente implements Exception {
  const ConfiguracaoAusente(this.variavel);

  final String variavel;

  @override
  String toString() =>
      'Falta $variavel. O app nao sobe sem saber com qual API falar. '
      'Passe --dart-define=$variavel=<url> no comando de build.';
}

/// Variavel presente, mas com valor que nao serve.
class ConfiguracaoInvalida implements Exception {
  const ConfiguracaoInvalida(this.variavel, this.valor, this.motivo);

  final String variavel;
  final String valor;
  final String motivo;

  @override
  String toString() => '$variavel="$valor" nao serve: $motivo.';
}
