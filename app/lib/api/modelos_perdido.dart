
/// `#/components/schemas/PublicLostPet` e `PublicLostPetPage` do contrato,
/// campo a campo.
///
/// Recorte do contrato, que é a autoridade: campo que não está lá não aparece
/// aqui.
///
/// ## A CHAVE DA LISTA É O `share_token`, E ISSO É O ADR-0010 ITEM 6
///
/// Não há `pet_id` e não há `case_id`, e a ausência **não é esquecimento**: o
/// contrato diz, com todas as letras, que esta projeção "não possui, e nunca
/// deve possuir, `pet_id`, `case_id`, `user_id`, coordenada, dado do tutor nem
/// endereço (SEC-002)". O `share_token` é opaco, não é UUID e não é ordenável,
/// e é o mesmo que o link de compartilhamento já carrega.
///
/// A consequência de navegação é direta e vale repetir: **o cartão desta lista
/// não leva a `/pets/:petId`**. Aquela rota é endereçada por UUID interno, e
/// UUID interno não sai em superfície pública. O destino é a página do caso,
/// por token.
///
/// ## Não há coordenada, em nenhum campo e em nenhum filtro
///
/// O recorte geográfico é `city` e `neighborhood` **digitados**. O contrato
/// explica o porquê: um ponto por caso permitiria montar o mapa que a regra de
/// privacidade existe para impedir, e não há geocodificação no produto
/// (ADR-0006).
library;

import 'modelos_pet.dart';

/// A janela de `period`, como o contrato a declara.
enum JanelaDePerdidos {
  umDia('24h', '24 horas'),
  seteDias('7d', '7 dias'),
  trintaDias('30d', '30 dias');

  const JanelaDePerdidos(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static JanelaDePerdidos de(String? codigo) {
    for (final j in JanelaDePerdidos.values) {
      if (j.codigo == codigo) return j;
    }
    return JanelaDePerdidos.trintaDias;
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
  });

  /// Opaco, o mesmo do `share_url`. **Não é UUID e não é ordenável.**
  final String shareToken;

  final String nome;
  final Especie especie;
  final Porte porte;

  /// Rótulo da lista de referência quando há código; o texto do tutor quando
  /// não há. Quem resolve isso é o servidor.
  final String? racaRotulo;

  final String? cor;

  /// Bairro e cidade. **Nulo quando o caso foi aberto só com coordenada**
  /// (BICHUS-21 critério 5): a coordenada nunca sai e não há geocodificação,
  /// então não há rótulo verdadeiro para dar. O texto que a tela mostra nesse
  /// caso é **do cliente**, e não do servidor — um rótulo fixo dentro de um
  /// campo de dado seria indistinguível de um bairro com esse nome.
  final String? rotuloDaArea;

  /// **Quando o animal foi visto pela última vez**, e não quando o caso foi
  /// aberto. É este número que orienta quem está procurando.
  final DateTime vistoPorUltimoEm;

  /// A derivada `thumb` da foto principal. Nula sem foto pronta, e a ausência
  /// é decisão de quem desenha: ver `ImagemDaRede`, que recebe `url` não
  /// anulável de propósito.
  final String? urlDaFoto;

  final String? urlDeCompartilhamento;

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
///
/// `cidade` é **obrigatória no contrato**, e a obrigatoriedade é de privacidade
/// e não de desempenho: sem ela a operação seria um inventário nacional de
/// animais perdidos.
class RecorteDePerdidos {
  const RecorteDePerdidos({
    required this.cidade,
    this.bairro,
    this.especie,
    this.porte,
    this.janela = JanelaDePerdidos.trintaDias,
    this.termo,
    this.pagina = 1,
  });

  final String cidade;
  final String? bairro;
  final Especie? especie;
  final Porte? porte;
  final JanelaDePerdidos janela;

  /// Busca parcial por **nome do pet**. Nunca por código de tag: quando o
  /// texto digitado tem a forma de um código, o caminho é `GET /v1/tags/{code}`,
  /// que leva direto ao pet. Aceitar código aqui transformaria a listagem num
  /// oráculo de existência de código.
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

  Map<String, String> get query => <String, String>{
    'city': cidade,
    if (bairro != null && bairro!.trim().isNotEmpty) 'neighborhood': bairro!.trim(),
    if (especie != null) 'species': especie!.valor,
    if (porte != null) 'size': porte!.valor,
    'period': janela.codigo,
    'q': ?termoLimpo,
    'page': '$pagina',
    'limit': '$limite',
  };

  RecorteDePerdidos copiar({
    String? cidade,
    Object? bairro = _naoMexer,
    Object? especie = _naoMexer,
    Object? porte = _naoMexer,
    JanelaDePerdidos? janela,
    Object? termo = _naoMexer,
    int? pagina,
  }) {
    T? v<T>(Object? novo, T? atual) => novo == _naoMexer ? atual : novo as T?;
    return RecorteDePerdidos(
      cidade: cidade ?? this.cidade,
      bairro: v<String>(bairro, this.bairro),
      especie: v<Especie>(especie, this.especie),
      porte: v<Porte>(porte, this.porte),
      janela: janela ?? this.janela,
      termo: v<String>(termo, this.termo),
      pagina: pagina ?? this.pagina,
    );
  }

  static const Object _naoMexer = Object();
}

/// `#/components/schemas/PublicLostCase`: a visão pública de UM caso, pelo
/// `share_token`.
///
/// `allOf` sobre `PublicLostPet` no contrato, e por isso [perdido] está aqui
/// inteiro em vez de ter os campos repetidos: o cartão da listagem e esta
/// página desenham a **mesma** projeção, e duas cópias dos sete campos
/// divergiriam na primeira manutenção.
///
/// ## `podeAvisarQueViu` é do SERVIDOR, e a tela não o deduz
///
/// `can_report_sighting` é falso **só para o próprio tutor** — e verdadeiro
/// para qualquer outra conta **e para quem chama sem conta**. O contrato diz
/// por escrito por quê: *"a conta é pedida no toque, não na leitura. Esconder o
/// botão de quem não entrou esconderia justamente de quem chegou pelo cartaz."*
///
/// Deduzir isto no app seria impossível sem o `user_id` do tutor, que esta
/// projeção não tem e nunca deve ter (ADR-0010, item 6).
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
  ///
  /// **Lido sem `??` para `false`**: o contrato o declara `boolean` sem
  /// `nullable`, e um padrão falso aqui esconderia a ação de quem tem direito a
  /// ela no dia em que o campo chegasse ausente por defeito de servidor — que é
  /// o pior desfecho possível, porque quem perde a ação é o achador. O padrão é
  /// `true`, e quem é o tutor recebe `false` explícito.
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
