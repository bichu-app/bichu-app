import 'api_client.dart';
import 'modelos.dart';

/// As operacoes de `/v1/auth` do contrato.
///
/// Nenhuma delas leva `Idempotency-Key`: sao operacoes que o produto **nao**
/// enfileira. Um pedido de redefinicao de senha disparado sozinho meia hora
/// depois, sem a pessoa presente, gasta o token no vazio (UX 7.6.1).
class AuthApi {
  const AuthApi(this._api);

  final ApiClient _api;

  /// `POST /auth/register`.
  ///
  /// A conta nasce incompleta de proposito: e-mail ainda nao verificado. A
  /// resposta ja traz o par de tokens porque a intencao pendente da pessoa
  /// precisa executar logo em seguida.
  Future<Sessao> criarConta({
    required String email,
    required String senha,
    String? nome,
    String? versaoDosTermos,
  }) async {
    final json = await _api.post(
      '/auth/register',
      exigeToken: false,
      corpo: <String, dynamic>{
        'email': email,
        'password': senha,
        if (nome != null && nome.isNotEmpty) 'display_name': nome,
        'accepted_terms_version': ?versaoDosTermos,
      },
    );
    return Sessao.doJson(json);
  }

  /// `POST /auth/login`.
  ///
  /// O 401 e identico para e-mail inexistente e senha errada: a resposta nao
  /// revela se a conta existe, e a tela nao pode inventar essa distincao.
  Future<Sessao> entrar({
    required String email,
    required String senha,
    bool continuarConectado = false,
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
  ///
  /// Rotacao obrigatoria: cada refresh token vale uma vez e a resposta traz um
  /// novo. Apresentar um token ja consumido revoga a familia inteira, entao o
  /// app precisa gravar o token novo antes de qualquer outra coisa.
  Future<Sessao> renovar(String refreshToken) async {
    final json = await _api.post(
      '/auth/refresh',
      exigeToken: false,
      corpo: <String, dynamic>{'refresh_token': refreshToken},
    );
    return Sessao.doJson(json);
  }

  /// `POST /auth/logout`.
  Future<void> sair() => _api.post('/auth/logout');

  /// `POST /auth/email-verification`. Responde sempre 202, exista ou nao a
  /// conta.
  Future<void> reenviarVerificacaoDeEmail({String? email}) {
    return _api.post(
      '/auth/email-verification',
      exigeToken: true,
      corpo: email == null ? null : <String, dynamic>{'email': email},
    );
  }

  /// `POST /auth/email-verification/confirm`.
  ///
  /// Sempre `POST` disparado por um botao, nunca `GET` na URL do e-mail:
  /// varredor de link de antivirus e previsualizacao de mensageiro consomem o
  /// token antes da pessoa.
  Future<Sessao> confirmarEmail(String token) async {
    final json = await _api.post(
      '/auth/email-verification/confirm',
      exigeToken: false,
      corpo: <String, dynamic>{'token': token},
    );
    return Sessao.doJson(json);
  }

  /// `POST /auth/password-reset`.
  ///
  /// Responde **sempre** 202 com o mesmo corpo, exista ou nao a conta. A tela
  /// depende disso: a confirmacao e identica nos dois casos, porque o
  /// contrario entrega uma lista de quem tem conta.
  Future<void> pedirRedefinicaoDeSenha(String email) {
    return _api.post(
      '/auth/password-reset',
      exigeToken: false,
      corpo: <String, dynamic>{'email': email},
    );
  }

  /// `POST /auth/password-reset/confirm`. Revoga todas as sessoes ativas.
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
