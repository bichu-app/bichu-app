/// O `FoundReport` do contrato, campo a campo.
library;

/// `#/components/schemas/FoundReport/properties/origin` do contrato.
enum OrigemDoAchado {
  leituraDeTag('tag_scan'),
  achadoAvulso('stray_report'),

  /// Nao esta no contrato: e o que este build faz com um valor que ele nao
  /// conhece.
  desconhecida('');

  const OrigemDoAchado(this.valor);

  final String valor;

  static OrigemDoAchado de(String? valor) {
    for (final o in OrigemDoAchado.values) {
      if (o != OrigemDoAchado.desconhecida && o.valor == valor) return o;
    }
    return OrigemDoAchado.desconhecida;
  }
}

/// `#/components/schemas/FoundReport/properties/status` do contrato.
enum StatusDoAchado {
  aberto('open'),
  comCorrespondencia('matched'),
  encerrado('closed'),
  desconhecido('');

  const StatusDoAchado(this.valor);

  final String valor;

  static StatusDoAchado de(String? valor) {
    for (final s in StatusDoAchado.values) {
      if (s != StatusDoAchado.desconhecido && s.valor == valor) return s;
    }
    return StatusDoAchado.desconhecido;
  }
}

/// `#/components/schemas/FoundReportMatchedPet` do contrato: **a foto e o nome
/// do pet a que este achado JA esta ligado**.
class PetCorrespondenteDoAchado {
  const PetCorrespondenteDoAchado({required this.nome, this.urlDaFoto});

  /// `display_name`. **Obrigatorio no contrato** (`required: [display_name]`),
  /// e lido sem `??` pela mesma razao de `id`: pet correspondente sem nome nao
  /// e um pet degradado, e uma resposta que a tela nao deve desenhar.
  final String nome;

  /// `photo_url`: a capa do pet, montada sobre a base de MIDIA.
  final String? urlDaFoto;

  /// **Vazio e tratado como ausente**, e isso e defesa de desenho e nao zelo:
  /// `ImagemDaRede` recebe `url` nao anulavel de proposito e
  /// `Image.network('')` **lanca**.
  static PetCorrespondenteDoAchado? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final nome = bruto['display_name'];
    if (nome is! String || nome.isEmpty) return null;
    final url = bruto['photo_url'];
    return PetCorrespondenteDoAchado(
      nome: nome,
      urlDaFoto: url is String && url.isNotEmpty ? url : null,
    );
  }
}

/// O achado como o servidor o devolve.
class AchadoRegistrado {
  const AchadoRegistrado({
    required this.id,
    required this.origem,
    required this.status,
    required this.criadoEm,
    this.achadoEm,
    this.rotuloDaArea,
    this.observacao,
    this.conversaId,
    this.petCorrespondente,
  });

  final String id;
  final OrigemDoAchado origem;
  final StatusDoAchado status;

  /// Bairro e cidade. **Nulo quando a pessoa so deu coordenada**, e isso nao e
  /// falha: o rotulo publico so se monta com texto digitado, e converter
  /// coordenada em bairro e o que o ADR-0006 proibe.
  final String? rotuloDaArea;

  /// **Anulavel, e a anulabilidade e leitura do contrato.** `found_at` nao esta
  /// em `FoundReport.required`, entao um cliente que o lesse sem `??`
  /// estouraria na primeira resposta que o omitisse -- e versao antiga do app
  /// nao some do bolso de ninguem.
  final DateTime? achadoEm;

  final DateTime criadoEm;
  final String? observacao;

  /// Nulo enquanto a conversa mediada nao existir nesta entrega.
  final String? conversaId;

  /// `matched_pet`. **Nulo no achado avulso cruzado por semelhanca**, e ali o
  /// nulo e a decisao e nao a falta de dado -- ver [PetCorrespondenteDoAchado].
  final PetCorrespondenteDoAchado? petCorrespondente;

  /// **`id`, `origin`, `status` e `created_at` sao lidos sem `??`**, de
  /// proposito: o contrato os declara obrigatorios, e um achado sem identidade
  /// nao e um achado degradado -- e uma resposta que a tela nao deve desenhar.
  static DateTime? _data(Object? bruto) =>
      bruto is String ? DateTime.tryParse(bruto) : null;

  factory AchadoRegistrado.doJson(Map<String, dynamic> json) {
    return AchadoRegistrado(
      id: json['id'] as String,
      origem: OrigemDoAchado.de(json['origin'] as String?),
      status: StatusDoAchado.de(json['status'] as String?),
      rotuloDaArea: json['area_label'] as String?,
      achadoEm: _data(json['found_at']),
      criadoEm: DateTime.parse(json['created_at'] as String),
      observacao: json['notes'] as String?,
      conversaId: json['conversation_id'] as String?,
      petCorrespondente: PetCorrespondenteDoAchado.doJson(json['matched_pet']),
    );
  }
}

/// `FoundReportPage`: a página de `listMyFoundReports`.
class PaginaDeAchados {
  const PaginaDeAchados({required this.itens, this.proximoCursor});

  final List<AchadoRegistrado> itens;

  /// Nulo quando não há mais página.
  final String? proximoCursor;

  bool get temMais => proximoCursor != null && proximoCursor!.isNotEmpty;

  factory PaginaDeAchados.doJson(Map<String, dynamic> json) {
    final brutos = json['items'];
    final cursor = json['next_cursor'];
    return PaginaDeAchados(
      itens: <AchadoRegistrado>[
        if (brutos is List)
          for (final item in brutos)
            if (item is Map<String, dynamic>) AchadoRegistrado.doJson(item),
      ],
      proximoCursor: cursor is String && cursor.isNotEmpty ? cursor : null,
    );
  }
}
