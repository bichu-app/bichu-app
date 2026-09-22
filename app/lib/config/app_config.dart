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

  static const String _chaveApi = 'API_BASE_URL';
  static const String _chaveAmbiente = 'ENVIRONMENT';
  static const String _chaveVersaoDosTermos = 'TERMS_VERSION';
  static const String _chaveUrlDosTermos = 'TERMS_URL';
  static const String _chaveUrlDaPrivacidade = 'PRIVACY_URL';

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
