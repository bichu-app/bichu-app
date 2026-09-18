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
  ///
  /// [versaoDosTermos] e **obrigatorio, e nulavel**, e a combinacao e o ponto:
  /// o tipo admite "nao tenho o valor", e o `required` obriga cada chamador a
  /// **dizer isso**. Enquanto o parametro era opcional, nenhum chamador o
  /// passava, a chave saia do corpo pelo `?` da linha abaixo e ninguem via: a
  /// pessoa aceitava os termos e nao ficava registro de qual versao. O backend
  /// so grava `accepted_terms_at` quando o campo chega
  /// (`kysely-identity-repository.ts`), entao omitir e nao registrar aceite
  /// nenhum, o que e onus da prova e nao detalhe de tela
  /// (docs/04-seguranca.md secao 6.6).
  ///
  /// Passar nulo continua permitido porque o identificador da versao ainda nao
  /// existe: a secao 6.6 exige o identificador do arquivo versionado no
  /// repositorio, e esse arquivo nao foi escrito. Inventar um numero gravaria
  /// prova de aceite a um documento inexistente. O que mudou e que agora a
  /// omissao e uma decisao escrita no ponto de chamada, e nao um esquecimento.
  ///
  /// [continuarConectado] entrou no contrato em 17/09/2026 (ADR-0019) e fecha
  /// a lacuna que este arquivo carregava: a caixa existia na tela, a pessoa
  /// marcava, e a escolha morria no aparelho porque `RegisterRequest` nao
  /// tinha o campo. Ela governa **so** a janela de inatividade do refresh (30
  /// dias quando falso, 180 quando verdadeiro); nao mexe no token de acesso de
  /// 15 minutos, nao move o teto absoluto de 180 dias e nao dispensa a
  /// reautenticacao com senha das seis acoes sensiveis.
  ///
  /// `POST /auth/register` ja responde 201 com o par de tokens, entao **nao
  /// existia a opcao de nao decidir**: a janela se aplicava de qualquer jeito,
  /// e antes disto aplicava-se a padrao em silencio, descartando a escolha
  /// explicita. E a conta recem-criada e justamente a que passa mais tempo sem
  /// ser aberta, porque a pessoa cadastra o pet, prende a plaquinha e so volta
  /// no dia em que o animal some.
  Future<Sessao> criarConta({
    required String email,
    required String senha,
    required String? versaoDosTermos,
    String? nome,
    bool continuarConectado = false,
  }) async {
    final json = await _api.post(
      '/auth/register',
      exigeToken: false,
      corpo: <String, dynamic>{
        'email': email,
        'password': senha,
        if (nome != null && nome.isNotEmpty) 'display_name': nome,
        'accepted_terms_version': ?versaoDosTermos,
        // Enviado sempre, inclusive quando falso: e o padrao do contrato, e
        // mandar explicitamente evita que a omissao e a escolha "nao" fiquem
        // indistinguiveis no servidor.
        'stay_signed_in': continuarConectado,
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
