/// Os modelos que a camada de acesso devolve.
///
/// Sao recortes do `components/schemas` de `api/openapi.yaml`, com os campos
/// que as telas desta entrega usam. O contrato e entrada, nao sugestao: campo
/// que nao esta la nao aparece aqui.
library;

/// O que o contrato chama de `pending_profile_fields`: o que alimenta o aviso
/// persistente de cadastro incompleto.
enum PendenciaDeCadastro {
  verificacaoDeEmail('email_verification'),
  telefone('phone'),
  nome('display_name'),
  regiaoDeReferencia('reference_area');

  const PendenciaDeCadastro(this.valor);

  final String valor;

  static PendenciaDeCadastro? de(String valor) {
    for (final p in PendenciaDeCadastro.values) {
      if (p.valor == valor) return p;
    }
    return null;
  }
}

/// `Me.reference_area`: onde o tutor mora, **em texto**.
///
/// Os quatro campos sao anulaveis no contrato, inclusive quando o objeto
/// existe. Ela e a fonte honesta do bairro ja preenchido em F3.1 (criterio 2
/// da BICHUS-21): **coordenada nao vira nome de bairro**, porque nao ha
/// geocodificacao no MVP (ADR-0006), e o que a pessoa cadastrou e a unica
/// regiao que o produto sabe escrever.
///
/// **Nao ha coordenada aqui, e nao ha de haver.** O servidor guarda o ponto de
/// referencia numa coluna geografica propria (BICHUS-92) que nao sai em
/// resposta nenhuma, e ha portao de contrato que reprova quando
/// `reference_point` aparece em qualquer corpo.
class RegiaoDeReferencia {
  const RegiaoDeReferencia({this.bairro, this.cidade, this.uf, this.cep});

  final String? bairro;
  final String? cidade;
  final String? uf;
  final String? cep;

  /// Verdadeiro quando ha algo a preencher. Um objeto com os campos nulos
  /// existe no contrato e nao serve para preencher nada.
  bool get temAlgo =>
      (bairro != null && bairro!.isNotEmpty) ||
      (cidade != null && cidade!.isNotEmpty);

  static RegiaoDeReferencia? doJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final regiao = RegiaoDeReferencia(
      bairro: json['neighborhood'] as String?,
      cidade: json['city'] as String?,
      uf: json['state'] as String?,
      cep: json['postal_code'] as String?,
    );
    return regiao.temAlgo ? regiao : null;
  }
}

/// `Me` do contrato: quem esta usando o app.
class Usuario {
  const Usuario({
    required this.id,
    required this.email,
    required this.emailVerificado,
    required this.pendencias,
    required this.podeAbrirCaso,
    this.nome,
    this.emailPendente,
    this.emailEntregavel = true,
    this.regiaoDeReferencia,
  });

  final String id;
  final String email;
  final bool emailVerificado;

  /// Endereco novo aguardando confirmacao, quando ha troca em curso.
  final String? emailPendente;

  /// Falso apos devolucao definitiva do provedor. Sem isto, o tutor de e-mail
  /// invalido nunca descobre que ninguem consegue avisa-lo.
  final bool emailEntregavel;

  final String? nome;
  final List<PendenciaDeCadastro> pendencias;

  /// Falso quando nenhum canal de contato esta verificado. E o que bloqueia
  /// marcar um pet como perdido.
  final bool podeAbrirCaso;

  /// A regiao cadastrada pelo tutor, quando ha uma. E o que preenche o bairro
  /// em F3.1 sem geocodificar nada (criterio 2 da BICHUS-21).
  final RegiaoDeReferencia? regiaoDeReferencia;

  bool get cadastroIncompleto => pendencias.isNotEmpty;

  factory Usuario.doJson(Map<String, dynamic> json) {
    return Usuario(
      id: json['id'] as String,
      email: json['email'] as String,
      emailVerificado: json['email_verified'] as bool? ?? false,
      emailPendente: json['pending_email'] as String?,
      emailEntregavel: json['email_deliverable'] as bool? ?? true,
      nome: json['display_name'] as String?,
      pendencias: (json['pending_profile_fields'] as List<dynamic>? ??
              const <dynamic>[])
          .whereType<String>()
          .map(PendenciaDeCadastro.de)
          .whereType<PendenciaDeCadastro>()
          .toList(growable: false),
      podeAbrirCaso: json['can_open_lost_case'] as bool? ?? false,
      regiaoDeReferencia: RegiaoDeReferencia.doJson(
        json['reference_area'] as Map<String, dynamic>?,
      ),
    );
  }
}

/// `SessionResponse` do contrato.
class Sessao {
  const Sessao({
    required this.accessToken,
    required this.refreshToken,
    required this.expiraEm,
    required this.usuario,
  });

  final String accessToken;
  final String refreshToken;

  /// Instante absoluto em que o access token deixa de valer.
  ///
  /// O contrato manda `expires_in` em segundos; guardar o instante e nao a
  /// duracao e o que faz a sessao continuar correta depois de o app ficar
  /// horas suspenso em segundo plano.
  final DateTime expiraEm;

  final Usuario usuario;

  bool get expirado => DateTime.now().isAfter(expiraEm);

  /// Verdadeiro quando falta pouco para expirar. Renovar antes evita que a
  /// sessao caia no meio de uma acao.
  bool get quaseExpirado =>
      DateTime.now().isAfter(expiraEm.subtract(const Duration(minutes: 1)));

  factory Sessao.doJson(Map<String, dynamic> json) {
    final segundos = json['expires_in'] as int? ?? 900;
    return Sessao(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String,
      expiraEm: DateTime.now().add(Duration(seconds: segundos)),
      usuario: Usuario.doJson(json['user'] as Map<String, dynamic>),
    );
  }
}
