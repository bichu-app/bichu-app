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
