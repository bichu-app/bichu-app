/// Os modelos das pessoas que **não são a própria conta**, campo por campo do
/// contrato: o perfil (`#/components/schemas/PersonProfile`) e o resultado da
/// busca (`PersonSearchResult` / `PersonSearchPage`).
///
/// **A BUSCA ENTROU EM 20/10/2026, e este arquivo dizia o contrário.** Até
/// aquela data não havia busca de pessoas em lugar nenhum do produto, e a
/// recusa estava registrada em quatro lugares. O cliente a reverteu, literal:
/// *"vamos implementar a busca pelo usuario"*. Os freios que vieram com a
/// reversão são parte da decisão e não enfeite — piso de três caracteres,
/// campo vazio nunca lista ninguém, teto de consultas por conta, e resposta
/// limitada a nome e duas contagens.
///
/// **O que a reversão NÃO abriu**, e vale escrito porque é o que a próxima
/// pessoa vai querer acrescentar: continua não existindo rota de
/// disponibilidade de apelido, continua não existindo lista de conexões para
/// ninguém (nem para o dono), e continua não existindo "seguir".
///
/// **Regra do cliente (23/09/2026): o app usa exatamente os nomes do
/// `api/openapi.yaml`.** Por isso toda leitura de resposta acontece dentro da
/// própria classe, com `json['campo']`: leitura por outro nome de variável
/// escaparia do portão de conformidade.
///
/// ## A decisão que estes campos são
///
/// Cliente, 19/10/2026, literal: *"ele pode ver nome, quantidade de pets,
/// conexões, mas não as fotos publicadas e nem a timeline do usuário"*. É a
/// emenda 2 do ADR-0010, e a lista de campos aqui é ela.
///
/// ## O que o app NÃO lê, e por que
///
/// - **Nenhum identificador interno.** Não há `id`, não há UUID e não há conta
///   de ninguém (ADR-0010 item 6). O que endereça a pessoa é o **apelido**; o
///   que endereça a aresta é [PerfilDePessoa.connectionRef]; o que endereça a
///   pessoa para **denunciar e bloquear** é [PerfilDePessoa.publicRef], que é
///   opaco e já é o que as três rotas de segurança recebem.
/// - **Nenhum atributo de pet.** Só [PerfilDePessoa.petsCount]. Não há campo de
///   nome, de slug, de foto nem de espécie, e por isso não há como uma tela
///   desenhar um sem alguém acrescentar campo aqui.
/// - **Nenhuma timeline, publicação, curtida nem contador.** Não existe no
///   produto: a decisão está registrada na migração `20261018000030` — *"uma
///   timeline de quem você segue É a lista de presença com hora... Encerrado,
///   não se reabre"*.
/// - **Nenhuma cidade e nenhum bairro.** Ele não mencionou nenhum dos dois em
///   19/10, e o teto de "bairro e cidade" do ADR-0010 é limite de precisão e
///   não permissão de expor onde a pessoa mora.
/// - **Nenhuma lista de conexões.** Só a contagem. A lista não aparece a
///   ninguém, nem ao dono (plano 4-B), e não existe no contrato.
library;

import 'modelos_conexao.dart';

/// `#/components/schemas/PersonShowcasePhoto` — a foto da vitrine de **outra**
/// pessoa.
///
/// **Menor que a foto do dono, de propósito.** Não tem `status`, não tem
/// `rejection_reason`, não tem `position` e não tem `upload_id`: os dois
/// primeiros são estado de moderação da vitrine de quem a publicou, e os dois
/// últimos são de edição. Foto que não está pronta **não chega nesta lista**, e
/// é por isso que não há estado para a tela desenhar.
///
/// As duas URLs **não são anuláveis** aqui, ao contrário da foto do dono: o
/// servidor só manda foto com as duas derivadas prontas.
class FotoDoPerfil {
  const FotoDoPerfil({
    required this.gridUrl,
    required this.openUrl,
    required this.altText,
  });

  factory FotoDoPerfil.doJson(Map<String, dynamic> json) {
    return FotoDoPerfil(
      gridUrl: json['grid_url'] as String,
      openUrl: json['open_url'] as String,
      altText: json['alt_text'] as String?,
    );
  }

  /// A derivada de **320 x 320**. É ela que a grade pede, e nunca [openUrl]: a
  /// célula tem 104 dp (312 px reais a 3x), e a grade desenha até nove de uma
  /// vez — a medição que motivou isso foi 88 MiB contra 2,15 MiB.
  final String gridUrl;

  /// A derivada de **1024 x 1024**, para a foto aberta.
  final String openUrl;

  /// Rótulo de leitor de tela, **e não legenda**: nunca é desenhado como texto.
  final String? altText;
}

/// `#/components/schemas/PersonProfile`.
class PerfilDePessoa {
  const PerfilDePessoa({
    required this.handle,
    required this.publicRef,
    required this.displayName,
    required this.petsCount,
    required this.connectionsCount,
    required this.connectionState,
    required this.connectionRef,
    required this.vitrine,
  });

  factory PerfilDePessoa.doJson(Map<String, dynamic> json) {
    final fotos = json['showcase'] as List<dynamic>?;
    return PerfilDePessoa(
      handle: json['handle'] as String,
      publicRef: json['public_ref'] as String,
      displayName: json['display_name'] as String?,
      petsCount: json['pets_count'] as int,
      connectionsCount: json['connections_count'] as int,
      // `none` não existe em `EstadoDaConexao` — ele é o valor de
      // `connection_state` que diz "nenhuma relação", e no app ele é **nulo**.
      // A conversão é por igualdade explícita e não por `porCodigo`: aquela
      // devolve nulo para código DESCONHECIDO, e confundir "nenhuma relação"
      // com "não entendi o estado" faria a tela desenhar o estado de estranho
      // para um valor que o servidor passou a mandar e este build não conhece.
      connectionState: json['connection_state'] == 'none'
          ? null
          : EstadoDaConexao.porCodigo(json['connection_state'] as String?),
      connectionRef: json['connection_ref'] as String?,
      // **Ausente e `[]` são coisas diferentes, e a tela depende disso.**
      // Ausente é "você não pode ver"; `[]` é "esta conexão não tem foto".
      // Mapear ausente para lista vazia aqui apagaria a distinção antes de a
      // tela poder usá-la.
      vitrine: fotos
          ?.cast<Map<String, dynamic>>()
          .map(FotoDoPerfil.doJson)
          .toList(growable: false),
    );
  }

  /// O apelido, que é o identificador público da pessoa. **Não anulável**: quem
  /// não tem apelido não tem endereço, e por isso não tem esta página.
  final String handle;

  /// `users.public_ref`: o endereço opaco de 22 símbolos que `blockUser` e
  /// `reportUserProfile` recebem. **Não é UUID e não é o apelido.**
  final String publicRef;

  /// O nome de exibição. Anulável, como em `ConnectionPerson`.
  final String? displayName;

  /// **A contagem, e nada além dela** (emenda 2 do ADR-0010).
  final int petsCount;

  /// Quantas conexões aceitas a pessoa tem. **O número, nunca a lista.**
  final int connectionsCount;

  /// A relação com quem está olhando, ou **nulo para nenhuma**.
  final EstadoDaConexao? connectionState;

  /// O `ref` da **aresta**, nulo quando não há aresta viva. Nunca de uma pessoa.
  final String? connectionRef;

  /// As fotos, ou **nulo quando quem olha não pode vê-las**. Lista vazia é uma
  /// conexão sem foto.
  final List<FotoDoPerfil>? vitrine;

  /// Já é conexão aceita?
  bool get conectado => connectionState == EstadoDaConexao.conectado;

  /// Como a pessoa é escrita na tela. **O nome vem primeiro, e o apelido é a
  /// queda** — o inverso de `PessoaDaConexao.nomeParaLer`, e de propósito: ali
  /// a lista é de pedidos e o apelido é a chave de leitura; aqui a pessoa está
  /// olhando o perfil DELA, e o cliente disse que o que se vê é o *nome*.
  /// Nunca devolve nulo, porque [handle] nunca é nulo.
  String get nomeParaLer {
    final nome = displayName;
    if (nome != null && nome.trim().isNotEmpty) return nome;
    return '@$handle';
  }
}

/// `#/components/schemas/PersonSearchResult` — uma pessoa **como a busca a
/// entrega**.
///
/// ## Quatro campos, e as três ausências têm dono
///
/// Este modelo é **menor** que [PerfilDePessoa], e de propósito. Ele não
/// reusa aquele nem herda dele: um modelo só para os dois obrigaria a tornar
/// anuláveis os três campos que a busca não manda, e campo anulável é convite
/// a preencher depois.
///
/// | Falta aqui | Está em [PerfilDePessoa] porque |
/// |---|---|
/// | `public_ref` | aquela tela hospeda denunciar e bloquear, e as três operações são endereçadas por ele. A busca não hospeda nenhuma das três, e referência pública sem uso é superfície de graça |
/// | `connection_state` | o perfil é de UMA pessoa; numa lista, vinte estados por requisição são o material de que uma lista de conexões se faz do lado de fora |
/// | `connection_ref` | `ref` de aresta existe quando há aresta, e resultado de busca é lista de quem ainda não é conexão |
///
/// ## A FOTO SAI AQUI, E ESTE BLOCO DIZIA O CONTRÁRIO (21/10/2026)
///
/// Até 21/10/2026 este modelo não tinha foto, e o parágrafo aqui citava a
/// **emenda 5 item 2 do ADR-0010** — *"a foto não sai para quem não é conexão
/// aceita"*. **O cliente emendou a própria decisão**, literal: *"o resultado
/// tras foto sim, para identificar usuarios com nomes parecidos."*
///
/// Com só o nome, duas `Maria Silva` são indistinguíveis. Numa busca cujo
/// propósito é achar **uma pessoa específica que você conhece**, tirar a foto
/// transforma a lista em adivinhação.
///
/// É a derivada **`thumb`**, a menor que o contrato devolve. Os três freios que
/// separam isso de um catálogo de rostos estão no cabeçalho de
/// `CartaoDePessoaEncontrada`. E [inicial] **não foi apagada**: ela é a queda de
/// quem não tem foto pronta, e é o recurso que a emenda 3 manda usar.
///
/// **Nenhum identificador interno** (ADR-0010 item 6): o que endereça a pessoa
/// é o apelido.
class PessoaEncontrada {
  const PessoaEncontrada({
    required this.handle,
    required this.displayName,
    required this.petsCount,
    required this.connectionsCount,
    required this.photoIconUrl,
  });

  factory PessoaEncontrada.doJson(Map<String, dynamic> json) {
    return PessoaEncontrada(
      handle: json['handle'] as String,
      displayName: json['display_name'] as String?,
      petsCount: json['pets_count'] as int,
      connectionsCount: json['connections_count'] as int,
      photoIconUrl: json['photo_icon_url'] as String?,
    );
  }

  /// O apelido. **Não anulável**: a busca lê a tabela de apelidos, então quem
  /// aparece tem apelido por construção — e é ele o endereço do perfil e a
  /// credencial de `requestConnection`.
  final String handle;

  /// O nome de exibição, **anulável no contrato**. A coluna é anulável em
  /// `users`, e omitir da busca quem não preencheu nome faria a pessoa
  /// desaparecer por um campo que ela não escolheu deixar vazio. Quem não tem
  /// nome é achável pelo apelido, e a tela cai para `@handle`.
  final String? displayName;

  /// **A contagem, e nada além do número** (emenda 2 do ADR-0010). Nenhum
  /// atributo de pet acompanha: nome, miniatura e slug seguem proibidos pelo
  /// item 7.
  final int petsCount;

  /// Quantas conexões aceitas. **O número, nunca a lista** — é o "sinal de
  /// confiança" do plano 4-B.
  final int connectionsCount;

  /// A **derivada `thumb`** da foto da pessoa, ou nulo quando não há foto
  /// pronta.
  ///
  /// A menor derivada que existe, e a escolha é do contrato: a `card` custa
  /// cerca de 51 KB por rosto, e numa página de vinte resultados isso é rede e
  /// memória de uma lista que a pessoa rola.
  ///
  /// **A chave vem sempre, com nulo quando não há** — foto em `processing` ou
  /// `rejected` não sai. Nulo cai para [inicial], e não para um quadrado vazio.
  final String? photoIconUrl;

  /// Como a pessoa é escrita no cartão. **O nome primeiro, o apelido é a
  /// queda**, igual a [PerfilDePessoa.nomeParaLer]: o cartão leva ao perfil, e
  /// as duas telas chamando a mesma pessoa por nomes diferentes seria o app
  /// duvidando de si mesmo no meio de uma navegação.
  String get nomeParaLer {
    final nome = displayName;
    if (nome != null && nome.trim().isNotEmpty) return nome;
    return '@$handle';
  }

  /// A letra do círculo, que é o que substitui a foto aqui.
  ///
  /// Sai de [nomeParaLer] e não de [displayName] para quem não tem nome ter
  /// letra também — a primeira do apelido, e nunca o `@`, que não é letra de
  /// ninguém. Cadeia vazia quando não há caractere aproveitável; quem desenha
  /// decide o que pôr no lugar, e é a mesma regra da marca neutra da conversa.
  String get inicial {
    final limpo = nomeParaLer.replaceFirst('@', '').trimLeft();
    if (limpo.isEmpty) return '';
    return limpo.substring(0, 1).toUpperCase();
  }
}

/// `#/components/schemas/PersonSearchPage`.
///
/// **`items` vazio e `total: 0` são a resposta para três situações
/// diferentes**, e a fusão é do servidor e não desta classe: termo que não
/// casou ninguém, e termo que só casaria gente que não existe para quem busca
/// (conta desabilitada, par bloqueado, perfil denunciado por quem busca).
/// Distinguir as duas seria dizer *"existe alguém assim, mas não para você"*,
/// que é o oráculo que a busca não pode ser.
///
/// A terceira situação — termo abaixo do piso — **não chega aqui**: a tela não
/// chama a busca abaixo do piso. Ver [PessoasApi.buscar].
class PaginaDeBuscaDePessoas {
  const PaginaDeBuscaDePessoas({
    required this.itens,
    required this.total,
    required this.pagina,
    required this.limite,
  });

  factory PaginaDeBuscaDePessoas.doJson(Map<String, dynamic> json) {
    final itens = (json['items'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(PessoaEncontrada.doJson)
        .toList(growable: false);
    return PaginaDeBuscaDePessoas(
      itens: itens,
      total: json['total'] as int,
      pagina: json['page'] as int,
      limite: json['limit'] as int,
    );
  }

  /// A página vazia que a tela usa **sem chamar o servidor**, quando não há o
  /// que buscar.
  ///
  /// Existe para o estado "não busquei nada ainda" não ser representado por
  /// nulo em todo lugar que lê a página: nulo é "não consegui perguntar", e as
  /// duas telas são diferentes. `page: 1` e `limit: 20` repetem os padrões do
  /// contrato.
  static const PaginaDeBuscaDePessoas semBusca = PaginaDeBuscaDePessoas(
    itens: <PessoaEncontrada>[],
    total: 0,
    pagina: 1,
    limite: 20,
  );

  final List<PessoaEncontrada> itens;

  /// Quantas pessoas casam o termo **para quem busca** — o mesmo conjunto que
  /// [itens] pagina.
  final int total;

  final int pagina;
  final int limite;
}
