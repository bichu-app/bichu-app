/// Configuracao resolvida no build do app, nao no runtime do servidor.
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
  final String? versaoDosTermos;

  /// URL do documento de termos de uso, aberta pelo link da tela de cadastro.
  final Uri? urlDosTermos;

  /// URL da politica de privacidade.
  final Uri? urlDaPrivacidade;

  /// A VERSAO DESTE BINARIO, que o app manda ao servidor para receber o
  /// veredito de `GET /v1/app/version-status`.
  final String? versaoDoApp;

  /// O COMMIT QUE GEROU ESTE BINARIO, para o app poder DIZER qual build e.
  final String? commitDoBuild;

  /// O commit CURTO: o que a tela mostra e o que da para ler em voz alta.
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

    final config = AppConfig._(
      apiBaseUrl: _semBarraFinal(uri),
      ambiente: _ambienteBruto,
      versaoDosTermos: _ouNulo(versaoDosTermosDeTeste ?? _versaoDosTermosBruta),
      urlDosTermos: _uriOuNulo(urlDosTermosDeTeste ?? _urlDosTermosBruta),
      urlDaPrivacidade:
          _uriOuNulo(urlDaPrivacidadeDeTeste ?? _urlDaPrivacidadeBruta),
      versaoDoApp: _ouNulo(versaoDoAppDeTeste ?? _versaoDoAppBruta),
      commitDoBuild: _ouNulo(commitDoBuildDeTeste ?? _commitDoBuildBruto),
    );
    _instancia = config;
    return config;
  }

  static String? _ouNulo(String valor) {
    final v = valor.trim();
    return v.isEmpty ? null : v;
  }

  static Uri? _uriOuNulo(String valor) {
    final v = _ouNulo(valor);
    if (v == null) return null;
    final uri = Uri.tryParse(v);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) return null;
    if (uri.scheme != 'http' && uri.scheme != 'https') return null;
    return uri;
  }

  /// Apaga a configuracao carregada.
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
