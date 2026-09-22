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

  /// A sessao persistente passou a ser **comportamento padrao**, e nao escolha.
  ///
  /// Decisao do cliente no teste em aparelho de 22/09/2026: _"Retire o
  /// checkbox de manter conectado e traga isso como um comportamento padrao,
  /// tanto na tela de cadastro, quanto na tela de login."_ As duas caixas
  /// sairam das telas e este valor ocupou o lugar delas.
  ///
  /// **Ele mora aqui, e nao em cada tela, de proposito.** Duas constantes,
  /// uma por tela, divergem: e precisamente o que ja aconteceu com
  /// `stay_signed_in`, que existia duplicado em `RegisterRequest` e
  /// `LoginRequest` e carregou "7 e 90 dias" depois de a secao 7.5 ter
  /// passado para 30 e 180 (ADR-0019). Um valor so, e a isca em
  /// `app/test/sessao/sessao_persistente_por_padrao_test.dart` percorre as
  /// duas telas contra ele.
  ///
  /// ## O que isto muda na postura de seguranca, dito inteiro
  ///
  /// Ele governa **a janela de inatividade do refresh, e so ela**. Com o
  /// padrao em `true`, a janela que valia para quem nao marcava a caixa deixa
  /// de existir:
  ///
  /// | | antes (caixa desmarcada) | agora (padrao) |
  /// |---|---|---|
  /// | inatividade do refresh | 30 dias | **180 dias** |
  /// | teto absoluto desde a senha | 180 dias | 180 dias |
  /// | token de acesso | 15 min | 15 min |
  ///
  /// **Tres coisas NAO mudam, e sao elas que tornam a troca sustentavel.** O
  /// teto absoluto de 180 dias desde a autenticacao com senha vale igual e
  /// continua derrubando a sessao independentemente de uso, que e o que impede
  /// a rotacao a cada uso de transformar um refresh roubado em acesso
  /// permanente (BICHUS-81, criterio 8). O token de acesso continua com 15
  /// minutos. E as seis acoes sensiveis continuam exigindo a senha de novo.
  ///
  /// **O lugar de guarda tambem nao muda**: o refresh continua no chaveiro do
  /// aparelho (Keychain/Keystore, ADR-0002), nunca em armazenamento comum. E o
  /// logout continua revogando a familia no servidor, nao so apagando local.
  ///
  /// O que a mudanca custa, em uma frase: o aparelho perdido e nao reportado
  /// que antes se fechava sozinho em 30 dias de silencio agora leva ate 180.
  /// O remedio continua sendo `Sair de todos os aparelhos` (BICHUS-125), que
  /// fecha em menos de um segundo.
  static const bool sessaoPersistentePorPadrao = true;

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
    bool continuarConectado = sessaoPersistentePorPadrao,
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
  ///
  /// **O `refresh_token` vai no corpo, e ele e obrigatorio.** Nao e detalhe de
  /// implementacao: e a unica informacao que diz ao servidor *qual* familia de
  /// refresh morrer. Sem ela o servidor nao tem o que revogar, e um logout que
  /// nao revoga deixa a credencial de longo prazo viva no banco por ate 180
  /// dias enquanto o aparelho ja esqueceu dela (ADR-0002, emenda 1 de
  /// 21/09/2026, secoes 1 e 4).
  ///
  /// Enquanto esta funcao nao levava parametro nenhum ela chamava
  /// `_api.post('/auth/logout')` **sem corpo**, e o servidor respondia 204 sem
  /// ter revogado coisa alguma. O contrato passou a exigir o campo e a recusar
  /// com 400 quando ele falta, que e o certo: logout que nao revogou precisa
  /// ser erro visivel, e nao sucesso indistinguivel do nada.
  ///
  /// **Sair deste aparelho, e nao de todos.** Esta operacao revoga so a
  /// familia apresentada e nao toca `users.sessions_invalid_before`, que e por
  /// pessoa. Quem sai do celular emprestado nao esta pedindo para cair da
  /// propria casa; o outro verbo e `BICHUS-125`.
  ///
  /// Idempotente no servidor: reapresentar uma familia ja revogada responde
  /// 204 e nao erra.
  Future<void> sair(String refreshToken) => _api.post(
        '/auth/logout',
        corpo: <String, dynamic>{'refresh_token': refreshToken},
      );

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
