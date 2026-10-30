/// Os modelos da conexão entre pessoas, campo por campo do contrato.
library;

/// `#/components/schemas/ConnectionAppState`.
enum EstadoDaConexao {
  pedidoEnviado('pending_sent'),
  pedidoRecebido('pending_received'),
  conectado('connected');

  const EstadoDaConexao(this.codigo);

  final String codigo;

  static EstadoDaConexao? porCodigo(String? codigo) {
    for (final estado in EstadoDaConexao.values) {
      if (estado.codigo == codigo) return estado;
    }
    return null;
  }
}

/// `#/components/schemas/ConnectionPerson`.
class PessoaDaConexao {
  const PessoaDaConexao({
    required this.handle,
    required this.displayName,
    required this.canalConfirmado,
  });

  factory PessoaDaConexao.doJson(Map<String, dynamic> json) {
    return PessoaDaConexao(
      handle: json['handle'] as String?,
      displayName: json['display_name'] as String?,
      canalConfirmado: json['contact_channel_verified'] as bool? ?? false,
    );
  }

  final String? handle;
  final String? displayName;

  /// **O SELO DE VALIDADO** — `contact_channel_verified`, emenda do ADR-0010 de
  /// 21/10/2026, decisão do cliente.
  final bool canalConfirmado;

  /// Como a pessoa é escrita na tela.
  String? get nomeParaLer {
    final apelido = handle;
    if (apelido != null && apelido.isNotEmpty) return '@$apelido';
    final nome = displayName;
    if (nome != null && nome.isNotEmpty) return nome;
    return null;
  }
}

/// `#/components/schemas/Connection`.
class Conexao {
  const Conexao({
    required this.ref,
    required this.state,
    required this.requestedAt,
    required this.person,
  });

  factory Conexao.doJson(Map<String, dynamic> json) {
    return Conexao(
      ref: json['ref'] as String,
      state: EstadoDaConexao.porCodigo(json['state'] as String?),
      requestedAt: DateTime.parse(json['requested_at'] as String),
      person: PessoaDaConexao.doJson(json['person'] as Map<String, dynamic>),
    );
  }

  /// O identificador opaco **da aresta**.
  final String ref;
  final EstadoDaConexao? state;
  final DateTime requestedAt;
  final PessoaDaConexao person;
}

/// `#/components/schemas/ConnectionRequestPage`.
class PaginaDePedidosDeConexao {
  const PaginaDePedidosDeConexao({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory PaginaDePedidosDeConexao.doJson(Map<String, dynamic> json) {
    final crus = (json['items'] as List<dynamic>).cast<Map<String, dynamic>>();
    return PaginaDePedidosDeConexao(
      items: crus.map(Conexao.doJson).toList(growable: false),
      total: json['total'] as int,
      page: json['page'] as int,
      limit: json['limit'] as int,
    );
  }

  final List<Conexao> items;
  final int total;
  final int page;
  final int limit;
}

/// `#/components/schemas/ConnectedPerson`.
class PessoaConectada {
  const PessoaConectada({
    required this.handle,
    required this.displayName,
    required this.petsCount,
    required this.connectionsCount,
    required this.photoIconUrl,
  });

  factory PessoaConectada.doJson(Map<String, dynamic> json) {
    return PessoaConectada(
      handle: json['handle'] as String,
      displayName: json['display_name'] as String?,
      petsCount: json['pets_count'] as int,
      connectionsCount: json['connections_count'] as int,
      photoIconUrl: json['photo_icon_url'] as String?,
    );
  }

  /// O apelido. **Não anulável**: cada linha é uma porta para o perfil, e o
  /// perfil é endereçado pelo apelido.
  final String handle;

  /// O nome de exibição, **anulável no contrato**.
  final String? displayName;

  /// **A contagem, e nada além do número** (emenda 2 do ADR-0010).
  final int petsCount;

  /// Quantas conexões aceitas **daquela pessoa**.
  final int connectionsCount;

  /// A derivada **`thumb`** da foto, ou nulo quando não há foto pronta.
  final String? photoIconUrl;

  /// Como a pessoa é escrita na linha.
  String get nomeParaLer {
    final nome = displayName;
    if (nome != null && nome.trim().isNotEmpty) return nome;
    return '@$handle';
  }

  /// A letra do círculo, que é o que substitui a foto quando não há.
  String get inicial {
    final texto = nomeParaLer.replaceFirst('@', '').trim();
    if (texto.isEmpty) return '?';
    return texto.substring(0, 1).toUpperCase();
  }
}

/// `#/components/schemas/ConnectedPersonPage`.
class PaginaDeConexoes {
  const PaginaDeConexoes({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory PaginaDeConexoes.doJson(Map<String, dynamic> json) {
    final crus = (json['items'] as List<dynamic>).cast<Map<String, dynamic>>();
    return PaginaDeConexoes(
      items: crus.map(PessoaConectada.doJson).toList(growable: false),
      total: json['total'] as int,
      page: json['page'] as int,
      limit: json['limit'] as int,
    );
  }

  final List<PessoaConectada> items;
  final int total;
  final int page;
  final int limit;
}

/// `#/components/schemas/ConnectionSummary`.
class ResumoDeConexoes {
  const ResumoDeConexoes({
    required this.connectedCount,
    required this.pendingSentCount,
    required this.requestsReceivedCount,
    required this.remainingRequestsToday,
    required this.connectionLimit,
    required this.invitedJoinedCount,
  });

  factory ResumoDeConexoes.doJson(Map<String, dynamic> json) {
    return ResumoDeConexoes(
      connectedCount: json['connected_count'] as int,
      pendingSentCount: json['pending_sent_count'] as int,
      requestsReceivedCount: json['requests_received_count'] as int,
      remainingRequestsToday: json['remaining_requests_today'] as int,
      connectionLimit: json['connection_limit'] as int,
      invitedJoinedCount: json['invited_joined_count'] as int,
    );
  }

  final int connectedCount;
  final int pendingSentCount;
  final int requestsReceivedCount;
  final int remainingRequestsToday;
  final int connectionLimit;

  /// **Quantos tutores entraram no Bichu pelo convite desta conta e viraram
  /// conexão aceita** — o número da seção `Convide tutores`.
  final int invitedJoinedCount;
}

/// Local: qual caixa de pedidos a tela está mostrando.
enum CaixaDePedidos {
  recebidos('received'),
  enviados('sent');

  const CaixaDePedidos(this.codigo);

  final String codigo;
}

/// `#/components/schemas/ConnectionInviteIssued` — o convite recém-emitido.
class ConviteEmitido {
  const ConviteEmitido({required this.inviteToken, required this.expiresAt});

  factory ConviteEmitido.doJson(Map<String, dynamic> json) {
    return ConviteEmitido(
      inviteToken: json['invite_token'] as String,
      expiresAt: DateTime.parse(json['expires_at'] as String),
    );
  }

  /// O token: 256 bits de CSPRNG em base64url, **reusável por várias pessoas**.
  final String inviteToken;

  /// Quando o convite para de resolver: **30 dias** após a emissão.
  final DateTime expiresAt;
}

/// Por que o servidor recusou um pedido de conexão, quando a recusa é um
/// **teto** e não um 404.
enum RecusaDoPedidoDeConexao {
  /// Quem pede já chegou ao teto de conexões aceitas.
  tetoDeConexoes('connection_limit_reached'),

  /// **O outro lado** está cheio.
  tetoDeConexoesDeQuemRecebe('addressee_connection_limit_reached'),

  /// Pendentes enviados ao mesmo tempo.
  tetoDePendentes('pending_limit_reached'),

  /// **O teto do dia**, em janela corrida de 24 horas.
  tetoDoDia('daily_limit_reached'),

  /// A recusa anterior ainda está em descanso.
  emDescanso('connection_resting'),

  /// Corrida: a cláusula `WHERE` barrou o que a aplicação aprovou, porque já
  /// existe aresta viva entre os dois.
  jaExiste('connection_exists');

  const RecusaDoPedidoDeConexao(this.codigo);

  /// O valor que chega em `errors[].code`.
  final String codigo;

  /// O `field` que carrega o código quando o pedido foi **por apelido**.
  static const String campoDoApelido = 'handle';

  /// O `field` quando o pedido foi **por token de convite**.
  static const String campoDoToken = 'invite_token';

  /// Devolve **nulo para código desconhecido**, e não um valor de queda.
  static RecusaDoPedidoDeConexao? porCodigo(String? codigo) {
    for (final recusa in RecusaDoPedidoDeConexao.values) {
      if (recusa.codigo == codigo) return recusa;
    }
    return null;
  }
}
