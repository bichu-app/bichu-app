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
/// - **A LISTA DAS PRÓPRIAS CONEXÕES EXISTE DESDE 22/10/2026.** Este item dizia
///   *"Não há lista de conexões. Não existe modelo de 'minhas conexões', e não
///   pode existir"*, e dizia com razão — era a decisão do cliente de 18/10. **Ele
///   emendou a própria decisão**, literal: *"o usuário pode abrir a lista de
///   usuários que é sua conexão"*. O modelo é [PessoaConectada], e a página é
///   [PaginaDeConexoes]. [ResumoDeConexoes] continua existindo ao lado dela: a
///   tela diz *"Você tem N de 150 conexões"* com o número, e lista com a página.
///
///   **A lista de TERCEIRO continua não existindo**, e não há modelo para ela:
///   `ConnectedPerson` é o que a conta recebe sobre as PRÓPRIAS conexões, e não
///   existe operação que devolva as de outra pessoa.
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

/// `#/components/schemas/ConnectedPerson`.
///
/// **Uma pessoa na lista das PRÓPRIAS conexões** (cliente, 22/10/2026: *"o
/// usuário pode abrir a lista de usuários que é sua conexão"*).
///
/// ## Os CINCO campos são os de [PessoaEncontrada], e isso é medido
///
/// Nome, apelido, contagem de pets, contagem de conexões e a foto — os mesmos
/// de `PersonSearchResult`. **Ser conexão aceita não abre campo nesta lista**: o
/// que o aceite abre está nas OUTRAS telas (a vitrine, o mural, o bairro no
/// perfil), cada uma com o próprio predicado. O portão
/// `conexao-nao-expoe-lista-nem-identificador.test.ts` compara os dois conjuntos
/// no contrato, por nome.
///
/// **Classe própria e não reúso de [PessoaEncontrada]**, e a razão é de leitura
/// de JSON: `PersonSearchResult` ganhou `connection_state` em 22/10/2026, e
/// `ConnectedPerson` **não** o tem — nesta lista ele seria a constante
/// `connected` em toda linha. Reusar a classe faria `doJson` procurar uma chave
/// que esta resposta não manda.
///
/// **Nenhum identificador interno** (ADR-0010 item 6), e nenhum `ref` de
/// aresta: desfazer mora no perfil, e é lá que `getPersonProfile` entrega o
/// `ref`.
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
  /// perfil é endereçado pelo apelido. Conexão sem apelido não entra na lista.
  final String handle;

  /// O nome de exibição, **anulável no contrato**. A tela cai para `@handle`.
  final String? displayName;

  /// **A contagem, e nada além do número** (emenda 2 do ADR-0010).
  final int petsCount;

  /// Quantas conexões aceitas **daquela pessoa**. O número, nunca a lista.
  final int connectionsCount;

  /// A derivada **`thumb`** da foto, ou nulo quando não há foto pronta.
  final String? photoIconUrl;

  /// Como a pessoa é escrita na linha. **O nome primeiro, o apelido é a
  /// queda** — a mesma regra de `PessoaEncontrada.nomeParaLer`, porque a linha
  /// leva ao perfil e duas telas chamando a mesma pessoa por nomes diferentes
  /// seria o app duvidando de si mesmo no meio de uma navegação.
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
///
/// **A segunda coleção de pessoas desta família**, depois de
/// [PaginaDePedidosDeConexao], e a única de conexões ACEITAS. `total` é o
/// conjunto inteiro e não a página: a tela mostra quantas conexões a conta tem
/// e pagina de 20 em 20.
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
  ///
  /// ## A REGRA NÃO MORA AQUI, e isso é deliberado
  ///
  /// Conta quem satisfaz os **dois** sinais: conexão aceita com esta conta,
  /// nascida de um convite, **e** a pessoa com ao menos um pet de foto
  /// `ready`. Os dois estão na cláusula `WHERE` do servidor, e o app **não os
  /// reproduz** — dois clientes com a própria cópia da regra contariam
  /// diferente, e o número que a pessoa vê passaria a depender de qual
  /// aplicativo ela abriu.
  ///
  /// **Não é contagem de usos do convite**, e a distinção importa: quantas
  /// pessoas ABRIRAM o link é informação sobre quem olhou um perfil, e
  /// `ConnectionInviteIssued` a recusa por escrito. Este número é sobre a
  /// própria rede de quem pergunta, do mesmo tipo que [connectedCount].
  ///
  /// **Não anulável, e não há `?? 0`**: zero vindo do servidor é a afirmação de
  /// que ninguém entrou ainda; campo ausente é resposta fora do contrato, e
  /// `FormatException` é o que a tela precisa para não afirmar "ninguém ainda"
  /// sobre uma pergunta que não foi respondida.
  final int invitedJoinedCount;
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

/// `#/components/schemas/ConnectionInviteIssued` — o convite recém-emitido.
///
/// ## O token em claro existe NESTA RESPOSTA e em lugar nenhum mais
///
/// O banco guarda os 32 bytes do SHA-256 (`connection_invites.token_hash`),
/// então nem o servidor nem um despejo do banco o recuperam depois. Quem
/// perde, emite outro — e emitir **revoga o anterior**.
///
/// Por isso este objeto é tratado como credencial pela tela que o recebe: ele
/// não é guardado em disco, não vai para registro de telemetria e não
/// sobrevive à sessão.
///
/// ## Não há URL e não há imagem aqui, e as duas ausências são do contrato
///
/// *"O QR e o link são o mesmo token em dois transportes, e quem os monta é a
/// tela: devolver URL absoluta amarraria o convite ao domínio do dia."* O
/// servidor emite um token e mais nada — ele não sabe o que é um QR.
///
/// **E não há contagem de quantas pessoas usaram o convite**: seria a lista de
/// quem viu o perfil de alguém, reduzida a um número.
class ConviteEmitido {
  const ConviteEmitido({required this.inviteToken, required this.expiresAt});

  factory ConviteEmitido.doJson(Map<String, dynamic> json) {
    return ConviteEmitido(
      inviteToken: json['invite_token'] as String,
      expiresAt: DateTime.parse(json['expires_at'] as String),
    );
  }

  /// O token: 256 bits de CSPRNG em base64url, **reusável por várias
  /// pessoas**.
  ///
  /// Reusável e não de uso único, e o motivo está na migração
  /// `20261020000012`: compartilhar num grupo é o caso de uso, e uso único
  /// funcionaria para a primeira pessoa e falharia **calado** para todas as
  /// outras — sem que quem compartilhou soubesse, porque a falha acontece na
  /// tela de outra pessoa. O freio do volume não é o uso único: são os tetos
  /// de conexões, de pendentes e de pedidos por dia, cobrados em **cada**
  /// pedido que o convite gera. Um link reusado não compra conexão nenhuma,
  /// porque o aceite continua obrigatório.
  final String inviteToken;

  /// Quando o convite para de resolver: **30 dias** após a emissão.
  ///
  /// O mesmo prazo do pedido pendente — dois prazos para "quanto tempo uma
  /// intenção de conexão sobrevive" obrigariam a defender os dois. Depois
  /// desta data o token responde o **mesmo 404** de um token inexistente, e a
  /// tela não tem como distinguir os dois.
  final DateTime expiresAt;
}

/// Por que o servidor recusou um pedido de conexão, quando a recusa é um
/// **teto** e não um 404.
///
/// Local: o contrato declara `Problem.errors[].code` como `type: string` sem
/// lista fechada — é um campo aberto por desenho, porque cada operação tem o
/// seu conjunto de códigos e uma enumeração global envelheceria a cada rota
/// nova. Esta lista é a dos códigos que **`requestConnection` e
/// `acceptConnection`** produzem, e ela está escrita aqui, e não espalhada em
/// `if`s de tela, porque os seis precisam de frases diferentes e cinco deles
/// não são "tentar de novo".
///
/// ## Por que isto não é 429, e por que a distinção importa na tela
///
/// Teto de produto sai como **400 `validation-failed`**, com o código em
/// `errors[]`. O 429 é outro bicho: é o teto de *requisições por hora*, e ele
/// vem com `Retry-After`. Uma tela que tratasse os dois pelo status mostraria
/// "o servidor está fora, tente de novo" para quem bateu num limite de 24
/// horas — mandando a pessoa repetir a única coisa que não resolve.
///
/// ## A ordem de avaliação do servidor é fixa, e a tela não a reproduz
///
/// O servidor devolve **um** código, o primeiro que casa. A tela lê o que
/// chegou; ela não soma condições nem adivinha qual teto estava mais perto.
enum RecusaDoPedidoDeConexao {
  /// Quem pede já chegou ao teto de conexões aceitas.
  tetoDeConexoes('connection_limit_reached'),

  /// **O outro lado** está cheio. A frase não diz o número da outra pessoa:
  /// quantas conexões alguém tem é dela, e a contagem já aparece no cartão
  /// porque a própria pessoa a publica — o teto dela, não.
  tetoDeConexoesDeQuemRecebe('addressee_connection_limit_reached'),

  /// Pendentes enviados ao mesmo tempo. **Não é teto de hoje**: ele se
  /// resolve quando alguém responde, e não quando o dia virar.
  tetoDePendentes('pending_limit_reached'),

  /// **O teto do dia**, em janela corrida de 24 horas. Corrida e não "até a
  /// meia-noite", senão os pedidos de dois dias caberiam em dois minutos na
  /// virada. Recusado e cancelado contam, senão cancelar seria a forma de
  /// burlar o teto.
  tetoDoDia('daily_limit_reached'),

  /// A recusa anterior ainda está em descanso. **A tela não diz que houve
  /// recusa**, e é o único caso em que o código sabe mais do que a frase pode
  /// contar: dizer "ela recusou você" é exatamente o que o produto não dá.
  emDescanso('connection_resting'),

  /// Corrida: a cláusula `WHERE` barrou o que a aplicação aprovou, porque já
  /// existe aresta viva entre os dois. **Não é falha**: o estado que a pessoa
  /// queria já está lá, e o conserto é reler.
  jaExiste('connection_exists');

  const RecusaDoPedidoDeConexao(this.codigo);

  /// O valor que chega em `errors[].code`.
  final String codigo;

  /// O `field` que carrega o código quando o pedido foi **por apelido**.
  static const String campoDoApelido = 'handle';

  /// O `field` quando o pedido foi **por token de convite**.
  static const String campoDoToken = 'invite_token';

  /// Devolve **nulo para código desconhecido**, e não um valor de queda.
  ///
  /// Mesma regra de [EstadoDaConexao.porCodigo], pelo mesmo motivo: não há
  /// valor seguro para onde cair, e uma tela que mapeasse o desconhecido para
  /// "teto do dia" afirmaria um limite que ninguém informou. Quem recebe nulo
  /// mostra a mensagem genérica de validação, que é verdadeira.
  static RecusaDoPedidoDeConexao? porCodigo(String? codigo) {
    for (final recusa in RecusaDoPedidoDeConexao.values) {
      if (recusa.codigo == codigo) return recusa;
    }
    return null;
  }
}
