/// O formato unico de erro da API: `application/problem+json`, RFC 9457.
library;

/// Catalogo: os slugs de `#/x-problem-types` que a tela trata por NOME.
enum ProblemTipo {
  validacaoFalhou('validation-failed'),
  emailJaCadastrado('email-already-registered'),

  /// Sem token, token ausente ou assinatura invalida.
  naoAutenticado('unauthenticated'),

  /// E-mail ou senha nao conferem.
  credencialInvalida('invalid-credentials'),

  /// Token expirado, ja usado ou revogado.
  tokenExpirado('token-expired'),

  reautenticacaoNecessaria('reauthentication-required'),
  canalDeContatoNaoVerificado('contact-channel-unverified'),
  petSemFoto('pet-photo-missing'),
  tagRevogada('tag-revoked'),

  /// Teto de pets por conta atingido.
  limiteDePetsAtingido('pet-limit-reached'),

  /// Teto de 3 encontros ATIVOS da comunidade por conta.
  limiteDeEncontrosDaComunidade('community-event-limit-reached'),

  /// O texto **nao normaliza para um codigo**: tamanho diferente de 16 depois
  /// da normalizacao, caractere fora do alfabeto, ou **simbolo de verificacao
  /// que nao bate**.
  codigoDeTagMalformado('tag-code-malformed'),

  /// Normalizou para um codigo bem formado que nao existe.
  codigoDeTagNaoEncontrado('tag-code-not-found'),

  /// Recurso que sumiu ou nunca foi da pessoa.
  naoEncontrado('not-found'),

  /// A conversa mediada nao aceita mais mensagem.
  conversaEncerrada('conversation-closed'),

  /// O link publico de um caso nao leva mais a caso aberto.
  casoEncerrado('lost-case-closed'),

  /// O caso publico terminou **porque o animal voltou**.
  casoReencontrado('lost-case-reunited'),

  /// Estouro de limite com `deny_429`.
  limiteDeTentativas('rate-limited'),

  /// O `ETag` apresentado nao e a versao atual: alguem salvou depois de voce
  /// ter lido.
  precondicaoFalhou('precondition-failed'),

  /// Escrita sobre recurso existente sem `If-Match`.
  precondicaoNecessaria('precondition-required'),

  /// Chegou um `type` que este build nao conhece.
  desconhecido('');

  const ProblemTipo(this.slug);

  /// Ultimo segmento do caminho da URI de `type`.
  final String slug;

  static ProblemTipo deUri(String? uri) {
    if (uri == null || uri.isEmpty) return ProblemTipo.desconhecido;
    final caminho = Uri.tryParse(uri)?.pathSegments;
    final slug = (caminho == null || caminho.isEmpty) ? uri : caminho.last;
    for (final tipo in ProblemTipo.values) {
      if (tipo != ProblemTipo.desconhecido && tipo.slug == slug) return tipo;
    }
    return ProblemTipo.desconhecido;
  }
}

/// `#/components/schemas/Problem/properties/next_action` do contrato.
enum ProximaAcao {
  registrarAchadoAvulso('register_stray_found_report'),
  verificarEmail('verify_email'),
  enviarFotoDoPet('upload_pet_photo'),
  entrar('sign_in'),

  /// O servidor pede que a pessoa tente de novo mais tarde.
  tentarMaisTarde('retry_later');

  const ProximaAcao(this.valor);

  final String valor;

  static ProximaAcao? de(String? valor) {
    if (valor == null) return null;
    for (final acao in ProximaAcao.values) {
      if (acao.valor == valor) return acao;
    }
    return null;
  }
}

/// Um erro de campo dentro de um `Problem`.
class ProblemCampo {
  const ProblemCampo({required this.campo, required this.codigo, this.mensagem});

  final String campo;
  final String codigo;
  final String? mensagem;

  factory ProblemCampo.doJson(Map<String, dynamic> json) {
    return ProblemCampo(
      campo: json['field'] as String? ?? '',
      codigo: json['code'] as String? ?? '',
      mensagem: json['message'] as String?,
    );
  }
}

/// Uma resposta `application/problem+json`.
class Problem {
  const Problem({
    required this.tipo,
    required this.tipoUri,
    required this.status,
    this.titulo,
    this.detalhe,
    this.correlationId,
    this.proximaAcao,
    this.campos = const <ProblemCampo>[],
    this.tenteDepoisDe,
    this.extensoes = const <String, dynamic>{},
  });

  /// O `type` ja resolvido. **E por aqui que a tela decide.**
  final ProblemTipo tipo;

  /// A URI crua de `type`, guardada para o log e para o relato de suporte.
  final String tipoUri;

  final int status;

  /// Texto do servidor. **Nao decida por ele.** Serve para o log; a tela usa a
  /// microcopy da tabela 12.4 do UX.
  final String? titulo;

  /// Texto do servidor. Mesma regra de [titulo].
  final String? detalhe;

  /// O mesmo identificador propagado no log e no trace do backend.
  final String? correlationId;

  final ProximaAcao? proximaAcao;

  final List<ProblemCampo> campos;

  /// Vem do cabecalho `Retry-After` do 429, em segundos.
  final Duration? tenteDepoisDe;

  /// O corpo cru, para os **membros de extensao** da RFC 9457: propriedades que
  /// o `Problem` carrega e o esquema do contrato nao declara.
  final Map<String, dynamic> extensoes;

  /// Um membro de extensao numerico, quando o servidor mandou um.
  int? inteiro(String chave) {
    final valor = extensoes[chave];
    if (valor is int) return valor;
    if (valor is String) return int.tryParse(valor);
    return null;
  }

  factory Problem.doJson(
    Map<String, dynamic> json, {
    required int status,
    Duration? tenteDepoisDe,
  }) {
    final tipoUri = json['type'] as String? ?? '';
    return Problem(
      tipo: ProblemTipo.deUri(tipoUri),
      tipoUri: tipoUri,
      status: json['status'] as int? ?? status,
      titulo: json['title'] as String?,
      detalhe: json['detail'] as String?,
      correlationId: json['correlation_id'] as String?,
      proximaAcao: ProximaAcao.de(json['next_action'] as String?),
      campos: (json['errors'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(ProblemCampo.doJson)
          .toList(growable: false),
      tenteDepoisDe: tenteDepoisDe,
      extensoes: json,
    );
  }

  /// Um `Problem` sintetico, para quando a resposta nao veio no formato.
  factory Problem.semCorpo(int status, {Duration? tenteDepoisDe}) {
    return Problem(
      tipo: ProblemTipo.desconhecido,
      tipoUri: '',
      status: status,
      tenteDepoisDe: tenteDepoisDe,
    );
  }

  ProblemCampo? campo(String nome) {
    for (final c in campos) {
      if (c.campo == nome) return c;
    }
    return null;
  }

  @override
  String toString() =>
      'Problem(status: $status, type: $tipoUri, correlation_id: '
      '$correlationId)';
}
