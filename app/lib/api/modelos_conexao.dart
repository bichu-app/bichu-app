/// Os modelos da conexão entre pessoas, campo por campo do contrato.
///
/// **Regra do cliente (23/09/2026): o app usa exatamente os nomes do
/// `api/openapi.yaml`.** Por isso toda leitura de resposta acontece dentro da
/// própria classe, com `json['campo']`: leitura por outro nome de variável
/// escaparia do portão de conformidade.
///
/// ## O que o app NÃO lê, e por que
///
/// - **Nenhum identificador interno.** O contrato não manda `id`, não manda
///   UUID e não manda a conta de ninguém (ADR-0010 item 6). O que identifica
///   uma pessoa aqui é o **apelido**; o que identifica a aresta é `ref`, que é
///   **da aresta e nunca da pessoa**.
/// - **Não há `declined`.** O contrato não manda recusa ao app: para quem
///   pediu, o recusado chega como `pending_sent`. Não existe estado, rótulo nem
///   ramo de tela para recusa, e a isca de `test/telas/` reprova se aparecer.
/// - **Não há lista de conexões.** Não existe modelo de "minhas conexões", e
///   não pode existir: a lista não aparece a ninguém, nem ao dono (plano 4-B).
///   O que existe é [ResumoDeConexoes], que é só números.
/// - **Não há "seguir".** Nenhum campo, nenhum estado, nenhuma contagem de
///   seguidores: a conexão é simétrica, e o grafo é um só.
/// - **Não há avatar.** A lista fechada de onde o avatar pode aparecer é
///   decisão da fatia da vitrine, não desta.
/// - **Há o SELO DE VALIDADO**, e ele não é exceção às ausências de cima: um
///   booleano sobre a conta não identifica, não localiza e não conta nada. É a
///   emenda do ADR-0010 de 21/10/2026, e ela NOMEIA `ConnectionPerson` —
///   atributo novo sobre pessoa em superfície de terceiro não entra por
///   analogia.
library;

/// `#/components/schemas/ConnectionAppState`.
///
/// [porCodigo] devolve nulo para código desconhecido: não há valor seguro para
/// onde cair, e a tela não afirma nada sobre um estado que não entende.
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
///
/// Os dois campos de NOME são anuláveis **no contrato**, e por isso são
/// anuláveis aqui. O apelido é opcional de propósito: as contas que já existem
/// nasceram sem ele e nenhum fluxo obriga a escolher.
///
/// **O selo de validado NÃO é anulável**, e a diferença é a regra: nome a conta
/// pode não ter, mas a pergunta "ela confirmou um canal?" tem sempre uma das
/// duas respostas.
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
      // **Padrão `false`: na dúvida o selo NÃO nasce.** O campo é obrigatório no
      // contrato; este padrão é o que o app faz se um dia ele faltar, e o lado
      // seguro é não afirmar uma confirmação que ninguém fez.
      canalConfirmado: json['contact_channel_verified'] as bool? ?? false,
    );
  }

  final String? handle;
  final String? displayName;

  /// **O SELO DE VALIDADO** — `contact_channel_verified`, emenda do ADR-0010 de
  /// 21/10/2026, decisão do cliente.
  ///
  /// O que ele prova é **um canal de contato confirmado**
  /// (`email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL` no
  /// servidor), que é a MESMA régua dos quatro 409
  /// `contact-channel-unverified`. **Na prática é e-mail**, porque nada no
  /// servidor grava a confirmação de telefone — e é por isso que o rótulo que a
  /// tela desenha diz "e-mail confirmado" e nunca "verificado" nem "confiável".
  ///
  /// **`false` não desenha nada**, e não desenha um selo apagado: selo cinza ao
  /// lado do nome diria "esta conta foi reprovada", e `false` significa que
  /// ninguém conferiu nada.
  final bool canalConfirmado;

  /// Como a pessoa é escrita na tela. **O apelido vem primeiro**: é a chave de
  /// leitura. Com ele nulo cai para o nome de exibição, e com os dois nulos
  /// devolve nulo — quem desenha decide o texto, porque inventar um "Alguém"
  /// aqui faria o modelo escrever na tela.
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

  /// O identificador opaco **da aresta**. Não é UUID e não é de ninguém: um
  /// identificador por pessoa seria endereço estável e compartilhável, que é o
  /// que a decisão do cliente de 18/10/2026 recusou.
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

/// `#/components/schemas/ConnectionSummary`.
///
/// **Só números, e é isso que permite a tela do dono falar das próprias
/// conexões sem existir lista.** `connectionLimit` vem do servidor e não é
/// constante do app: o teto é número que se sobe depois, e um build antigo com
/// o número gravado mostraria um limite que deixou de valer.
class ResumoDeConexoes {
  const ResumoDeConexoes({
    required this.connectedCount,
    required this.pendingSentCount,
    required this.requestsReceivedCount,
    required this.remainingRequestsToday,
    required this.connectionLimit,
  });

  factory ResumoDeConexoes.doJson(Map<String, dynamic> json) {
    return ResumoDeConexoes(
      connectedCount: json['connected_count'] as int,
      pendingSentCount: json['pending_sent_count'] as int,
      requestsReceivedCount: json['requests_received_count'] as int,
      remainingRequestsToday: json['remaining_requests_today'] as int,
      connectionLimit: json['connection_limit'] as int,
    );
  }

  final int connectedCount;
  final int pendingSentCount;
  final int requestsReceivedCount;
  final int remainingRequestsToday;
  final int connectionLimit;
}

/// Local: qual caixa de pedidos a tela está mostrando. Não espelha schema
/// nenhum — os dois valores são os do **parâmetro de consulta** `direction` de
/// `listMyConnectionRequests`, que o contrato declara em linha e não como lista
/// fechada nomeada. [codigo] é o que viaja, e é por isso que ele existe em vez
/// de a tela montar a cadeia na hora.
///
/// **Não há uma terceira caixa, e não há "todas"** — e isso é desenho, não
/// lacuna: uma caixa que somasse recebidos e enviados misturaria o que a pessoa
/// decide com o que ela espera.
enum CaixaDePedidos {
  recebidos('received'),
  enviados('sent');

  const CaixaDePedidos(this.codigo);

  final String codigo;
}
