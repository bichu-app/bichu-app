import 'package:bichu/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

/// O criterio de aceite diz que configuracao faltando falha ruidosamente no
/// start, com o nome da variavel na mensagem, e nunca sobe degradado em
/// silencio. Aqui e onde isso deixa de ser intencao.
void main() {
  setUp(AppConfig.limparParaTeste);

  test('sem API_BASE_URL o app nao sobe, e a mensagem diz o nome', () {
    expect(
      () => AppConfig.carregar(apiBaseUrlDeTeste: ''),
      throwsA(
        isA<ConfiguracaoAusente>().having(
          (e) => e.toString(),
          'mensagem',
          contains('API_BASE_URL'),
        ),
      ),
    );
  });

  test('so espaco em branco conta como ausente', () {
    expect(
      () => AppConfig.carregar(apiBaseUrlDeTeste: '   '),
      throwsA(isA<ConfiguracaoAusente>()),
    );
  });

  test('URL relativa e recusada no start, e nao na primeira chamada', () {
    expect(
      () => AppConfig.carregar(apiBaseUrlDeTeste: '/api'),
      throwsA(
        isA<ConfiguracaoInvalida>().having(
          (e) => e.toString(),
          'mensagem',
          contains('API_BASE_URL'),
        ),
      ),
    );
  });

  test('esquema fora de http e https e recusado', () {
    expect(
      () => AppConfig.carregar(apiBaseUrlDeTeste: 'ftp://bichu.app'),
      throwsA(isA<ConfiguracaoInvalida>()),
    );
  });

  test('a barra final e removida, para nao gerar // no caminho', () {
    final config = AppConfig.carregar(
      apiBaseUrlDeTeste: 'https://api.bichu.app/',
    );
    expect(config.apiBaseUrl.toString(), 'https://api.bichu.app');
  });

  test('ler antes de carregar e erro de programacao, e diz isso', () {
    expect(() => AppConfig.instancia, throwsA(isA<StateError>()));
  });
}
