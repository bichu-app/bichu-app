/// `#/components/schemas/PublicLostPet` e `PublicLostPetPage` do contrato,
/// campo a campo.
library;

import 'modelos_pet.dart';

/// `case_state` de `listPublicLostPets`, como o contrato declara a lista
/// fechada: `#/paths/~1public~1lost-pets/get/parameters/0/schema`.
enum EstadoDoCasoNaLista {
  aberto('open', 'Perdidos'),
  reencontrado('reunited', 'Encontrados');

  const EstadoDoCasoNaLista(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  /// O valor do contrato, ou **nulo** para codigo desconhecido.
  static EstadoDoCasoNaLista? de(String? codigo) {
    for (final e in EstadoDoCasoNaLista.values) {
      if (e.codigo == codigo) return e;
    }
    return null;
  }
}

/// A janela de `period`, como o contrato a declara:
/// `#/paths/~1public~1lost-pets/get/parameters/5/schema`.
enum JanelaDePerdidos {
  umDia('24h', '24 horas'),
  seteDias('7d', '7 dias'),
  trintaDias('30d', '30 dias');

  const JanelaDePerdidos(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  /// A janela de um codigo, ou **nulo** quando nao ha codigo.
  static JanelaDePerdidos? de(String? codigo) {
    for (final j in JanelaDePerdidos.values) {
      if (j.codigo == codigo) return j;
    }
    return null;
  }
}

/// Um pet perdido como a superfície pública o devolve.
class PerdidoPublico {
  const PerdidoPublico({
    required this.shareToken,
    required this.nome,
    required this.especie,
    required this.porte,
    required this.vistoPorUltimoEm,
    this.racaRotulo,
    this.cor,
    this.rotuloDaArea,
    this.urlDaFoto,
    this.urlDeCompartilhamento,
    this.encontradoPelaComunidade = false,
  });

  /// Opaco, o mesmo do `share_url`.
  final String shareToken;

  final String nome;
  final Especie especie;
  final Porte porte;

  /// Rótulo da lista de referência quando há código; o texto do tutor quando
  /// não há.
  final String? racaRotulo;

  final String? cor;

  /// Bairro e cidade. **Nulo quando o caso foi aberto só com coordenada**
  /// (BICHUS-21 critério 5): a coordenada nunca sai e não há geocodificação,
  /// então não há rótulo verdadeiro para dar.
  final String? rotuloDaArea;

  /// **Quando o animal foi visto pela última vez**, e não quando o caso foi
  /// aberto.
  final DateTime vistoPorUltimoEm;

  /// A derivada `thumb` da foto principal.
  final String? urlDaFoto;

  final String? urlDeCompartilhamento;

  /// `found_by_community`: o SELO de reencontro pela comunidade.
  final bool encontradoPelaComunidade;

  /// **`share_token`, `pet_display_name`, `species`, `size` e `lost_since` são
  /// lidos sem `??`**, de propósito: o contrato os declara obrigatórios, e um
  /// perdido sem nome ou sem data não é um perdido degradado — é uma resposta
  /// que a tela não deve desenhar.
  factory PerdidoPublico.doJson(Map<String, dynamic> json) {
    final especie = Especie.de(json['species'] as String?);
    final porte = Porte.de(json['size'] as String?);
    if (especie == null || porte == null) {
      throw const FormatException(
        'PublicLostPet com `species` ou `size` fora do contrato',
      );
    }
    return PerdidoPublico(
      shareToken: json['share_token'] as String,
      nome: json['pet_display_name'] as String,
      especie: especie,
      porte: porte,
      racaRotulo: json['breed_label'] as String?,
      cor: json['primary_color'] as String?,
      rotuloDaArea: json['area_label'] as String?,
      vistoPorUltimoEm: DateTime.parse(json['lost_since'] as String),
      urlDaFoto: json['photo_url'] as String?,
      urlDeCompartilhamento: json['share_url'] as String?,
      encontradoPelaComunidade: json['found_by_community'] as bool? ?? false,
    );
  }
}

/// `PublicLostPetPage`: a página, com o `total` que a tela precisa para dizer
/// "Mostrando 1 a 20 de 87".
class PaginaDePerdidos {
  const PaginaDePerdidos({
    required this.itens,
    required this.pagina,
    required this.limite,
    required this.total,
    this.filtrosAplicados = const <String, String>{},
  });

  final List<PerdidoPublico> itens;
  final int pagina;
  final int limite;
  final int total;

  /// O recorte que de fato valeu, como o servidor o devolveu.
  final Map<String, String> filtrosAplicados;

  factory PaginaDePerdidos.doJson(Map<String, dynamic> json) {
    final brutos = json['items'];
    final filtros = json['applied_filters'];
    return PaginaDePerdidos(
      itens: <PerdidoPublico>[
        if (brutos is List)
          for (final item in brutos)
            if (item is Map<String, dynamic>) PerdidoPublico.doJson(item),
      ],
      pagina: (json['page'] as num?)?.toInt() ?? 1,
      limite: (json['limit'] as num?)?.toInt() ?? 20,
      total: (json['total'] as num?)?.toInt() ?? 0,
      filtrosAplicados: <String, String>{
        if (filtros is Map)
          for (final entrada in filtros.entries)
            if (entrada.key is String && entrada.value is String)
              entrada.key as String: entrada.value as String,
      },
    );
  }
}

/// O recorte pedido à listagem pública.
class RecorteDePerdidos {
  const RecorteDePerdidos({
    this.estado,
    this.cidade,
    this.bairro,
    this.especie,
    this.porte,
    this.janela,
    this.termo,
    this.pagina = 1,
  });

  /// A cidade pedida, ou **nulo quando ninguem pediu nenhuma**.
  final EstadoDoCasoNaLista? estado;
  final String? cidade;
  final String? bairro;
  final Especie? especie;
  final Porte? porte;
  /// A janela PEDIDA, ou nulo quando ninguem pediu nenhuma.
  final JanelaDePerdidos? janela;

  /// Busca parcial por **nome do pet**.
  final String? termo;

  final int pagina;

  String? get termoLimpo {
    final t = termo?.trim();
    return (t == null || t.isEmpty) ? null : t;
  }

  bool get temBusca => termoLimpo != null;

  /// O `limit` máximo do contrato é 20, e é o que a tela pede: pedir mais
  /// responderia 400.
  static const int limite = 20;

  /// A cidade pronta para a consulta: **aparada e com espaço colapsado**.
  String? get cidadeLimpa {
    final c = cidade?.trim().replaceAll(RegExp(r'\s+'), ' ');
    return (c == null || c.isEmpty) ? null : c;
  }

  Map<String, String> get query => <String, String>{
    'case_state': ?estado?.codigo,
    'city': ?cidadeLimpa,
    if (bairro != null && bairro!.trim().isNotEmpty) 'neighborhood': bairro!.trim(),
    if (especie != null) 'species': especie!.valor,
    if (porte != null) 'size': porte!.valor,
    'period': ?janela?.codigo,
    'q': ?termoLimpo,
    'page': '$pagina',
    'limit': '$limite',
  };

  RecorteDePerdidos copiar({
    Object? estado = _naoMexer,
    Object? cidade = _naoMexer,
    Object? bairro = _naoMexer,
    Object? especie = _naoMexer,
    Object? porte = _naoMexer,
    Object? janela = _naoMexer,
    Object? termo = _naoMexer,
    int? pagina,
  }) {
    T? v<T>(Object? novo, T? atual) => novo == _naoMexer ? atual : novo as T?;
    return RecorteDePerdidos(
      estado: v<EstadoDoCasoNaLista>(estado, this.estado),
      cidade: v<String>(cidade, this.cidade),
      bairro: v<String>(bairro, this.bairro),
      especie: v<Especie>(especie, this.especie),
      porte: v<Porte>(porte, this.porte),
      janela: v<JanelaDePerdidos>(janela, this.janela),
      termo: v<String>(termo, this.termo),
      pagina: pagina ?? this.pagina,
    );
  }

  static const Object _naoMexer = Object();
}

/// `#/components/schemas/PublicLostCase`: a visão pública de UM caso, pelo
/// `share_token`.
class CasoPerdidoPublico {
  const CasoPerdidoPublico({
    required this.perdido,
    required this.podeAvisarQueViu,
    this.descricao,
    this.notasDeCuidado,
    this.urlDoCartaz,
  });

  /// Os campos de `PublicLostPet`, que é o que o cartão da listagem já lê.
  final PerdidoPublico perdido;

  /// `can_report_sighting`. Ver o cabeçalho da classe.
  final bool podeAvisarQueViu;

  /// `description`: o texto do tutor.
  final String? descricao;

  /// `care_notes`: o mesmo cartão de manejo da página do achador por QR.
  final String? notasDeCuidado;

  final String? urlDoCartaz;

  factory CasoPerdidoPublico.doJson(Map<String, dynamic> json) {
    return CasoPerdidoPublico(
      perdido: PerdidoPublico.doJson(json),
      podeAvisarQueViu: json['can_report_sighting'] as bool? ?? true,
      descricao: json['description'] as String?,
      notasDeCuidado: json['care_notes'] as String?,
      urlDoCartaz: json['poster_url'] as String?,
    );
  }
}
