/// O `FoundReport` do contrato, campo a campo.
///
/// Recorte de `components/schemas/FoundReport`. O contrato e entrada, nao
/// sugestao: campo que nao esta la nao aparece aqui.
///
/// ## Tres ausencias que sao decisao do servidor, e que a tela obedece
///
/// - **Nao ha coordenada.** Nem para quem registrou. A pessoa ja sabe onde
///   estava, e o campo so existiria para vazar depois.
/// - **`photo_url` volta NULO enquanto nao houver conversa mediada**
///   (criterio 9). A foto do achador e vista pelo tutor dentro da conversa, e
///   so. Esta tela **envia** foto e **nao a rele de la**: quem desenhar o
///   achado registrado mostra a foto que esta no aparelho, e nunca um endereco
///   que o servidor nao assinou.
/// - **Nao ha `case_id` nem `pet_id`.** Devolver a qual caso o achado se ligou
///   contaria a quem registrou qual pet de qual tutor esta sendo procurado --
///   antes de qualquer confirmacao humana, e para quem, no pior caso, e o
///   falso achador (ADR-0010 item 7).
library;

/// `#/components/schemas/FoundReport/properties/origin` do contrato.
///
/// `FoundReport.origin`.
enum OrigemDoAchado {
  leituraDeTag('tag_scan'),
  achadoAvulso('stray_report'),

  /// Nao esta no contrato: e o que este build faz com um valor que ele nao
  /// conhece. Versao antiga do app continua instalada por semanas depois de o
  /// servidor ganhar uma origem nova, e um `switch` que nao a conhece
  /// quebraria a tela inteira.
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
///
/// `FoundReport.status`.
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
  });

  final String id;
  final OrigemDoAchado origem;
  final StatusDoAchado status;

  /// Bairro e cidade. **Nulo quando a pessoa so deu coordenada**, e isso nao
  /// e falha: o rotulo publico so se monta com texto digitado, e converter
  /// coordenada em bairro e o que o ADR-0006 proibe.
  final String? rotuloDaArea;

  /// **Anulavel, e a anulabilidade e leitura do contrato.** `found_at` nao
  /// esta em `FoundReport.required`, entao um cliente que o lesse sem `??`
  /// estouraria na primeira resposta que o omitisse -- e versao antiga do app
  /// nao some do bolso de ninguem. A tela trata o nulo escrevendo o que sabe,
  /// e nunca inventando uma data.
  final DateTime? achadoEm;

  final DateTime criadoEm;
  final String? observacao;

  /// Nulo enquanto a conversa mediada nao existir nesta entrega.
  final String? conversaId;

  /// **`id`, `origin`, `status` e `created_at` sao lidos sem `??`**, de
  /// proposito: o contrato os declara obrigatorios, e um achado sem
  /// identidade nao e um achado degradado -- e uma resposta que a tela nao
  /// deve desenhar.
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
    );
  }
}

/// `FoundReportPage`: a página de `listMyFoundReports`.
///
/// **Paginação por CURSOR**, e é assim que o contrato a declara: `next_cursor`
/// nulo (ou ausente) é o fim da lista. Não há `total`, e a ausência decide o
/// desenho da tela — não se pode escrever "1 a 20 de 87" sobre uma lista que
/// não sabe quantos são, então a lista de achados diz quantos **estão na tela**
/// e para de pedir quando o cursor acaba.
///
/// É deliberadamente diferente da listagem pública de perdidos, que é numerada
/// com `total`. As duas seguem o contrato, e o contrato segue o uso: a pública
/// precisa que o visitante chegue ao fim de 87 casos; a minha tem três.
class PaginaDeAchados {
  const PaginaDeAchados({required this.itens, this.proximoCursor});

  final List<AchadoRegistrado> itens;

  /// Nulo quando não há mais página. **Ausente também é nulo**: o campo é
  /// anulável no contrato e não está em `required`.
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
