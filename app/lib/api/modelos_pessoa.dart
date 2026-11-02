/// Os modelos das pessoas que **não são a própria conta**, campo por campo do
/// contrato: o perfil (`#/components/schemas/PersonProfile`) e o resultado da
/// busca (`PersonSearchResult` / `PersonSearchPage`).
library;

import 'modelos_conexao.dart';

/// `#/components/schemas/PersonShowcasePhoto` — a foto da vitrine de **outra**
/// pessoa.
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

  /// A derivada de **320 x 320**.
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
      connectionState: json['connection_state'] == 'none'
          ? null
          : EstadoDaConexao.porCodigo(json['connection_state'] as String?),
      connectionRef: json['connection_ref'] as String?,
      canalConfirmado: json['contact_channel_verified'] as bool? ?? false,
      vitrine: fotos
          ?.cast<Map<String, dynamic>>()
          .map(FotoDoPerfil.doJson)
          .toList(growable: false),
    );
  }

  /// O apelido, que é o identificador público da pessoa.
  final String handle;

  /// `users.public_ref`: o endereço opaco de 22 símbolos que `blockUser` e
  /// `reportUserProfile` recebem.
  final String publicRef;

  /// O nome de exibição. Anulável, como em `ConnectionPerson`.
  final String? displayName;

  /// **A contagem, e nada além dela** (emenda 2 do ADR-0010).
  final int petsCount;

  /// Quantas conexões aceitas a pessoa tem.
  final int connectionsCount;

  /// A relação com quem está olhando, ou **nulo para nenhuma**.
  final EstadoDaConexao? connectionState;

  /// O `ref` da **aresta**, nulo quando não há aresta viva.
  final String? connectionRef;

  /// **O SELO DE VALIDADO** — `contact_channel_verified`, emenda do ADR-0010 de
  /// 21/10/2026, decisão do cliente.
  final bool canalConfirmado;

  /// As fotos, ou **nulo quando quem olha não pode vê-las**.
  final List<FotoDoPerfil>? vitrine;

  /// Já é conexão aceita?
  bool get conectado => connectionState == EstadoDaConexao.conectado;

  /// Como a pessoa é escrita na tela.
  String get nomeParaLer {
    final nome = displayName;
    if (nome != null && nome.trim().isNotEmpty) return nome;
    return '@$handle';
  }
}

/// `#/components/schemas/PersonSearchResult` — uma pessoa **como a busca a
/// entrega**.
class PessoaEncontrada {
  const PessoaEncontrada({
    required this.handle,
    required this.displayName,
    required this.petsCount,
    required this.connectionsCount,
    required this.photoIconUrl,
    this.estadoDaConexao,
  });

  factory PessoaEncontrada.doJson(Map<String, dynamic> json) {
    return PessoaEncontrada(
      handle: json['handle'] as String,
      displayName: json['display_name'] as String?,
      petsCount: json['pets_count'] as int,
      connectionsCount: json['connections_count'] as int,
      photoIconUrl: json['photo_icon_url'] as String?,
      estadoDaConexao: EstadoDaConexao.porCodigo(json['connection_state'] as String?),
    );
  }

  /// O apelido. **Não anulável**: a busca lê a tabela de apelidos, então quem
  /// aparece tem apelido por construção — e é ele o endereço do perfil e a
  /// credencial de `requestConnection`.
  final String handle;

  /// O nome de exibição, **anulável no contrato**.
  final String? displayName;

  /// **A contagem, e nada além do número** (emenda 2 do ADR-0010).
  final int petsCount;

  /// Quantas conexões aceitas.
  final int connectionsCount;

  /// **A RELAÇÃO ENTRE QUEM BUSCA E ESTA PESSOA** — `connection_state`, que
  /// entrou no contrato em **22/10/2026**.
  final EstadoDaConexao? estadoDaConexao;

  /// A **derivada `thumb`** da foto da pessoa, ou nulo quando não há foto
  /// pronta.
  final String? photoIconUrl;

  /// Como a pessoa é escrita no cartão.
  String get nomeParaLer {
    final nome = displayName;
    if (nome != null && nome.trim().isNotEmpty) return nome;
    return '@$handle';
  }

  /// A letra do círculo, que é o que substitui a foto aqui.
  String get inicial {
    final limpo = nomeParaLer.replaceFirst('@', '').trimLeft();
    if (limpo.isEmpty) return '';
    return limpo.substring(0, 1).toUpperCase();
  }
}

/// `#/components/schemas/PersonSearchPage`.
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

/// `#/components/schemas/RegionPerson` — uma pessoa **como a LISTAGEM DA
/// PRÓPRIA REGIÃO a entrega** (cliente, 02/11/2026).
///
/// **É [PessoaEncontrada] menos a foto**, e a ausência é estrutural: não há
/// campo de foto neste modelo porque não há campo de foto naquele schema.
///
/// O motivo não é a emenda 5 item 2 — aquela foi emendada pelo próprio cliente
/// em 21/10/2026, e a busca TEM foto desde então. O motivo é o argumento com
/// que a foto entrou na busca: os três freios dela garantem que *"quem vê a
/// foto é alguém que já sabe aproximadamente quem procura, e não alguém
/// folheando"*. Esta lista é, por construção, folhear — e com foto seria o
/// catálogo de rostos que o plano 4-B recusou.
class PessoaDaRegiao {
  const PessoaDaRegiao({
    required this.handle,
    required this.displayName,
    required this.petsCount,
    required this.connectionsCount,
    this.estadoDaConexao,
  });

  factory PessoaDaRegiao.doJson(Map<String, dynamic> json) {
    return PessoaDaRegiao(
      handle: json['handle'] as String,
      displayName: json['display_name'] as String?,
      petsCount: json['pets_count'] as int,
      connectionsCount: json['connections_count'] as int,
      estadoDaConexao: EstadoDaConexao.porCodigo(
        json['connection_state'] as String?,
      ),
    );
  }

  /// O apelido. **Não anulável**: a listagem lê a tabela de apelidos, então
  /// quem aparece tem apelido por construção — e é ele o endereço do perfil e a
  /// credencial de `requestConnection`.
  final String handle;

  /// O nome de exibição, **anulável no contrato**.
  final String? displayName;

  /// **A contagem, e nada além do número** (emenda 2 do ADR-0010).
  final int petsCount;

  /// Quantas conexões aceitas.
  final int connectionsCount;

  /// `connection_state`: a relação entre quem olha e esta pessoa, que é o que
  /// faz o botão não oferecer `Pedir conexão` a quem já é conexão.
  final EstadoDaConexao? estadoDaConexao;

  /// A pessoa **como o cartão da busca a consome**, para o cartão ser UM só.
  ///
  /// **`photoIconUrl: null` é o ponto desta conversão**, e não um detalhe: é
  /// aqui que alguém seria tentado a ligar a foto, e é aqui que está escrito
  /// por que não. O cartão cai para a inicial no círculo, que é o recurso da
  /// emenda 3 — e quem é conexão aceita já vê a foto pelo perfil e pela
  /// conversa.
  PessoaEncontrada comoPessoaEncontrada() {
    return PessoaEncontrada(
      handle: handle,
      displayName: displayName,
      petsCount: petsCount,
      connectionsCount: connectionsCount,
      photoIconUrl: null,
      estadoDaConexao: estadoDaConexao,
    );
  }
}

/// `#/components/schemas/RegionPeoplePage`.
class PaginaDaRegiao {
  const PaginaDaRegiao({
    required this.itens,
    required this.total,
    required this.pagina,
    required this.limite,
  });

  factory PaginaDaRegiao.doJson(Map<String, dynamic> json) {
    final itens = (json['items'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(PessoaDaRegiao.doJson)
        .toList(growable: false);
    return PaginaDaRegiao(
      itens: itens,
      total: json['total'] as int,
      pagina: json['page'] as int,
      limite: json['limit'] as int,
    );
  }

  /// A página vazia que a tela usa **sem chamar o servidor**: é o que ela mostra
  /// a quem ainda não aderiu, e ela não pergunta o motivo ao servidor porque já
  /// o tem em `Usuario.naListaDaRegiao`.
  static const PaginaDaRegiao semAdesao = PaginaDaRegiao(
    itens: <PessoaDaRegiao>[],
    total: 0,
    pagina: 1,
    limite: 20,
  );

  final List<PessoaDaRegiao> itens;

  /// Quantas pessoas da região aderiram **e existem para quem olha**.
  final int total;

  final int pagina;
  final int limite;
}
