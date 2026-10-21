/// Os modelos do **perfil de outra pessoa**, campo por campo do contrato
/// (`#/components/schemas/PersonProfile`).
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
///
/// ## O que entrou depois, e por decisão
///
/// **O SELO DE VALIDADO** (`contact_channel_verified`), pela emenda do ADR-0010
/// de 21/10/2026. A lista de campos acima é FECHADA e a emenda 2 a fechou; o
/// selo só entra porque a emenda nova NOMEIA `PersonProfile` — não porque ele
/// "cabia".
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
    required this.canalConfirmado,
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
      // **Padrão `false`: na dúvida o selo NÃO nasce.** O campo é obrigatório no
      // contrato e sai nos QUATRO estados de conexão; este padrão é o que o app
      // faz se um dia ele faltar.
      canalConfirmado: json['contact_channel_verified'] as bool? ?? false,
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
  ///
  /// **Chega nos QUATRO estados de conexão**, ao contrário de [vitrine]: a
  /// vitrine é conteúdo que a pessoa publicou para quem ela aceitou, e o selo é
  /// atributo da conta, que vale igual para quem chega pelo apelido.
  final bool canalConfirmado;

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
