import 'api_client.dart';
import 'modelos.dart';
import 'reautenticacao.dart';

/// As operacoes de `/v1/auth` do contrato.
class AuthApi {
  const AuthApi(this._api);

  final ApiClient _api;

  /// A sessao persistente passou a ser **comportamento padrao**, e nao escolha.
  static const bool sessaoPersistentePorPadrao = true;

  /// `POST /auth/register`.
  Future<Sessao> criarConta({
    required String email,
    required String senha,
    /// A data de nascimento em **`YYYY-MM-DD`**, ja conferida contra a idade
    /// minima de 16 anos (cliente, 18/10/2026: *"coloque maiores de 16 anos"*).
    required String nascimento,
    required String? versaoDosTermos,
    String? nome,
    /// O apelido (`@`) **normalizado**, ou `null` quando a pessoa nao escolheu
    /// nenhum.
    String? apelido,
    bool continuarConectado = sessaoPersistentePorPadrao,
  }) async {
    final json = await _api.post(
      '/auth/register',
      exigeToken: false,
      corpo: <String, dynamic>{
        'email': email,
        'password': senha,
        'birth_date': nascimento,
        if (apelido != null && apelido.isNotEmpty) 'handle': apelido,
        if (nome != null && nome.isNotEmpty) 'display_name': nome,
        'accepted_terms_version': ?versaoDosTermos,
        'stay_signed_in': continuarConectado,
      },
    );
    return Sessao.doJson(json);
  }

  /// `POST /auth/login`.
  Future<Sessao> entrar({
    required String email,
    required String senha,
    bool continuarConectado = sessaoPersistentePorPadrao,
  }) async {
    final json = await _api.post(
      '/auth/login',
      exigeToken: false,
      corpo: <String, dynamic>{
        'email': email,
        'password': senha,
        'stay_signed_in': continuarConectado,
      },
    );
    return Sessao.doJson(json);
  }

  /// `POST /auth/refresh`.
  Future<Sessao> renovar(String refreshToken) async {
    final json = await _api.post(
      '/auth/refresh',
      exigeToken: false,
      corpo: <String, dynamic>{'refresh_token': refreshToken},
    );
    return Sessao.doJson(json);
  }

  /// `POST /auth/logout`.
  Future<void> sair(String refreshToken) => _api.post(
        '/auth/logout',
        corpo: <String, dynamic>{'refresh_token': refreshToken},
      );

  /// `POST /auth/email-verification`.
  Future<void> reenviarVerificacaoDeEmail({String? email}) {
    return _api.post(
      '/auth/email-verification',
      exigeToken: true,
      corpo: email == null ? null : <String, dynamic>{'email': email},
    );
  }

  /// `POST /auth/email-verification/confirm`.
  Future<Sessao> confirmarEmail(String token) async {
    final json = await _api.post(
      '/auth/email-verification/confirm',
      exigeToken: false,
      corpo: <String, dynamic>{'token': token},
    );
    return Sessao.doJson(json);
  }

  /// `POST /auth/reauth`: abre a janela de uma operacao destrutiva.
  ///
  /// E a UNICA operacao do sistema que confere a senha de quem ja esta
  /// autenticado, e as seis operacoes destrutivas do contrato passam por ela.
  /// Concentrar aqui e desenho: a senha trafega para um endereco em vez de
  /// seis, e o teto contra forca bruta existe num lugar so.
  ///
  /// A senha NAO e guardada em nenhum lugar depois da chamada, e o token
  /// devolvido tambem nao: ver [JanelaDeReautenticacao].
  ///
  /// Recusa com `invalid-credentials` quando a senha nao confere, e com
  /// `rate-limited` quando um dos dois tetos da conta estourou.
  Future<JanelaDeReautenticacao> reautenticar({
    required String senha,
    required EscopoDeReautenticacao escopo,
  }) async {
    final json = await _api.post(
      '/auth/reauth',
      corpo: <String, dynamic>{'password': senha, 'scope': escopo.valor},
    );
    return JanelaDeReautenticacao.doJson(json);
  }

  /// `POST /auth/password-reset`.
  Future<void> pedirRedefinicaoDeSenha(String email) {
    return _api.post(
      '/auth/password-reset',
      exigeToken: false,
      corpo: <String, dynamic>{'email': email},
    );
  }

  /// `POST /auth/password-reset/confirm`.
  Future<void> confirmarRedefinicaoDeSenha({
    required String token,
    required String novaSenha,
  }) {
    return _api.post(
      '/auth/password-reset/confirm',
      exigeToken: false,
      corpo: <String, dynamic>{'token': token, 'new_password': novaSenha},
    );
  }
}
