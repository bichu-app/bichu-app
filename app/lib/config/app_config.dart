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
  const AppConfig._({required this.apiBaseUrl, required this.ambiente});

  /// Raiz da API, **sem** a barra final e **sem** o `/v1`, que a camada de
  /// acesso acrescenta.
  final Uri apiBaseUrl;

  /// Nome do ambiente, so para telemetria e para a tela de suporte.
  final String ambiente;

  static const String _chaveApi = 'API_BASE_URL';
  static const String _chaveAmbiente = 'ENVIRONMENT';

  static const String _apiBaseUrlBruta =
      String.fromEnvironment(_chaveApi, defaultValue: '');
  static const String _ambienteBruto =
      String.fromEnvironment(_chaveAmbiente, defaultValue: 'dev');

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
  /// aparelho de quem esta homologando (criterio de aceite de BICHU-25).
  static AppConfig carregar({String? apiBaseUrlDeTeste}) {
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
    );
    _instancia = config;
    return config;
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
