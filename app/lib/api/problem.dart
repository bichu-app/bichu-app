/// O formato unico de erro da API: `application/problem+json`, RFC 9457.
///
/// A regra que governa este arquivo inteiro: **o cliente decide por `type`, e
/// nunca pelo texto de `title` ou `detail`** (api/openapi.yaml, secao "Erros").
/// O texto vem do servidor e pode ser reescrito a qualquer momento; o
/// comportamento de tela nao pode mudar junto.
library;

/// Os `type` que o contrato nomeia hoje.
///
/// O `type` e uma URI estavel sob `https://<dominio>/problems/`. O app compara
/// pelo **ultimo segmento do caminho** e nao pela URI inteira, porque o
/// dominio e variavel de servidor no contrato (`api.{dominio}`) e muda entre
/// local, homologacao e producao. Comparar a URI inteira faria o app tratar o
/// mesmo erro de tres jeitos conforme o ambiente.
enum ProblemTipo {
  validacaoFalhou('validation-failed'),
  emailJaCadastrado('email-already-registered'),

  // Os QUATRO 401 do contrato (api/openapi.yaml, `x-problem-types`). Eles sao
  // quatro tipos e nao um porque significam coisas diferentes e a tela reage
  // diferente a cada um. Decidir pelo status 401 acerta hoje por sorte, porque
  // so `invalid-credentials` chega a C.2, e erra calado no dia em que outro
  // chegar: a tela diria a pessoa que a senha esta errada e ela trocaria uma
  // senha que estava certa (UX 8.2.2).
  //
  // `forbidden` NAO entra nesta lista de 401: ele e 403, e usa-lo aqui faria o
  // app tratar "sua senha nao confere" pelo mesmo caminho de "este recurso nao
  // e seu".

  /// Sem token, token ausente ou assinatura invalida. 401.
  naoAutenticado('unauthenticated'),

  /// E-mail ou senha nao conferem. 401. So aparece em C.2.
  ///
  /// O corpo e **identico** para conta inexistente e senha errada, por decisao
  /// de seguranca: distinguir os dois transformaria a tela de entrar num
  /// verificador de quem tem conta.
  credencialInvalida('invalid-credentials'),

  /// Token expirado, ja usado ou revogado. 401.
  tokenExpirado('token-expired'),

  reautenticacaoNecessaria('reauthentication-required'),
  canalDeContatoNaoVerificado('contact-channel-unverified'),
  petSemFoto('pet-photo-missing'),
  tagRevogada('tag-revoked'),

  /// Chegou um `type` que este build nao conhece.
  ///
  /// Nao e caso de erro: versao antiga do app continua instalada por semanas e
  /// vai receber `type` novo. A tela cai no texto generico da situacao, que e
  /// sempre melhor que uma tela em branco.
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

/// O caminho alternativo que o servidor oferece quando existe um.
///
/// A tela monta a acao a partir deste campo, **em vez de deduzir pelo status**:
/// dois 409 diferentes pedem saidas diferentes, e o status nao sabe qual.
enum ProximaAcao {
  registrarAchadoAvulso('register_stray_found_report'),
  verificarEmail('verify_email'),
  enviarFotoDoPet('upload_pet_photo'),
  entrar('sign_in');

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

  /// O mesmo identificador propagado no log e no trace do backend. E o que
  /// permite achar a requisicao quando alguem relata um problema.
  final String? correlationId;

  final ProximaAcao? proximaAcao;

  final List<ProblemCampo> campos;

  /// Vem do cabecalho `Retry-After` do 429, em segundos.
  final Duration? tenteDepoisDe;

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
    );
  }

  /// Um `Problem` sintetico, para quando a resposta nao veio no formato.
  ///
  /// Um backend que devolve HTML de proxy num 502 nao para o app: a tela cai
  /// no texto de servidor fora, que e o certo para aquele momento.
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
