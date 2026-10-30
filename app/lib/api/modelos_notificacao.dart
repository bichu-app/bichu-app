/// Os modelos da CAIXA DE NOTIFICACOES, campo por campo do contrato.
library;

/// `#/components/schemas/NotificationKind` do contrato: os onze tipos de aviso.
enum TipoDeAviso {
  plaquinhaLida('tag_scanned', 'Plaquinha lida'),
  petAchado('found_reported', 'Alguém achou um pet'),
  possivelPet('match_suggested', 'Possível pet encontrado'),
  petPerdidoPorPerto('neighborhood_alert', 'Pet perdido por perto'),
  pedidoParaParticipar('event_join_requested', 'Pedido para participar'),
  respostaDoPedidoDeParticipar('event_join_decided', 'Resposta ao seu pedido'),
  encontroCancelado('event_cancelled', 'Encontro cancelado'),
  respostaDaIndicacao('suggestion_decided', 'Resposta à sua indicação'),
  pedidoDaPlaquinha('tag_request_updated', 'Novidade no pedido da plaquinha'),
  comunicado('broadcast', 'Recado do Bichu'),
  pedidoDeConexao('connection_requested', 'Pedido de conexão'),
  desconhecido('', 'Aviso');

  const TipoDeAviso(this.codigo, this.rotulo);

  /// O valor do contrato. Vazio em [desconhecido], que nao e valor de fio.
  final String codigo;

  /// A palavra que a linha da caixa mostra.
  final String rotulo;

  /// O tipo de um codigo do contrato, ou [desconhecido] quando este build nao
  /// conhece o valor.
  static TipoDeAviso porCodigo(Object? codigo) {
    for (final tipo in TipoDeAviso.values) {
      if (tipo.codigo.isNotEmpty && tipo.codigo == codigo) return tipo;
    }
    return TipoDeAviso.desconhecido;
  }
}

/// `#/components/schemas/NotificationDestination` do contrato: para onde o
/// toque na linha leva.
enum DestinoDoAviso {
  pet('pet'),
  achado('found_report'),
  casoPublico('public_case'),
  encontro('network_event'),
  indicacao('directory_suggestion'),
  pedidoDaPlaquinha('collar_tag_request'),
  comunicado('broadcast'),
  pedidosDeConexao('connection_request');

  const DestinoDoAviso(this.codigo);

  /// O valor do contrato.
  final String codigo;

  /// O destino de um codigo do contrato, ou **nulo** quando o campo vem nulo ou
  /// quando este build nao conhece o valor.
  static DestinoDoAviso? porCodigo(Object? codigo) {
    for (final destino in DestinoDoAviso.values) {
      if (destino.codigo == codigo) return destino;
    }
    return null;
  }
}

/// `#/components/schemas/MyBroadcast` do contrato: o comunicado com o CORPO.
class ComunicadoDoBichu {
  const ComunicadoDoBichu({
    required this.ref,
    required this.titulo,
    required this.corpo,
    required this.disparadoEm,
  });

  final String ref;
  final String titulo;
  final String corpo;

  /// Quando o comunicado foi disparado.
  final DateTime disparadoEm;

  static ComunicadoDoBichu doJson(Map<String, dynamic> json) {
    final quando = DateTime.tryParse(json['dispatched_at'] as String);
    if (quando == null) {
      throw const FormatException(
        'Um comunicado chegou com `dispatched_at` que nao e data-hora.',
      );
    }
    return ComunicadoDoBichu(
      ref: json['ref'] as String,
      titulo: json['title'] as String,
      corpo: json['body'] as String,
      disparadoEm: quando.toUtc(),
    );
  }
}

/// `#/components/schemas/NotificationItem` do contrato: uma linha da caixa.
class AvisoDaCaixa {
  const AvisoDaCaixa({
    required this.ref,
    required this.tipo,
    required this.assunto,
    required this.aconteceuEm,
    required this.lido,
    required this.agrupados,
    required this.destino,
    required this.destinoRef,
  });

  /// O identificador OPACO do aviso -- o que vai no caminho de
  /// `markNotificationRead`.
  final String ref;

  final TipoDeAviso tipo;

  /// O nome do pet, o titulo do encontro ou o nome indicado, em texto ja pronto
  /// pelo servidor.
  final String? assunto;

  /// Quando o FATO aconteceu, e nao quando a linha nasceu.
  final DateTime aconteceuEm;

  /// O item foi ABERTO. Ver a lista nao marca nada: abrir a caixa zera o
  /// contador e deixa isto em `false`.
  final bool lido;

  /// Quantos avisos esta linha resume.
  final int agrupados;

  /// Para onde o toque leva, ou **nulo quando esta linha nao tem destino**.
  final DestinoDoAviso? destino;

  /// A chave do destino. Nula quando [destino] e nulo.
  final String? destinoRef;

  /// A linha resume mais de um aviso, e por isso a tela diz quantos.
  bool get resumeVarios => agrupados > 1;

  /// **Esta linha leva a algum lugar?**
  bool get temDestino =>
      destino != null && destinoRef != null && destinoRef!.isNotEmpty;

  /// `18/10/2026 às 13h52`, no fuso de quem le.
  String get dataEmTexto {
    final quando = aconteceuEm.toLocal();
    final dia = quando.day.toString().padLeft(2, '0');
    final mes = quando.month.toString().padLeft(2, '0');
    final minuto = quando.minute.toString().padLeft(2, '0');
    return '$dia/$mes/${quando.year} às ${quando.hour}h$minuto';
  }

  /// A mesma linha com [lido] trocado.
  AvisoDaCaixa comoLido() => AvisoDaCaixa(
        ref: ref,
        tipo: tipo,
        assunto: assunto,
        aconteceuEm: aconteceuEm,
        lido: true,
        agrupados: agrupados,
        destino: destino,
        destinoRef: destinoRef,
      );

  static AvisoDaCaixa doJson(Map<String, dynamic> json) {
    final ref = json['ref'] as String;
    if (ref.isEmpty) {
      throw const FormatException(
        'Um aviso chegou sem `ref`. O contrato declara o campo como '
        'obrigatorio, e sem ele nao ha como marcar o item como lido.',
      );
    }
    final quando = DateTime.tryParse(json['occurred_at'] as String);
    if (quando == null) {
      throw const FormatException(
        'Um aviso chegou com `occurred_at` que nao e data-hora.',
      );
    }
    return AvisoDaCaixa(
      ref: ref,
      tipo: TipoDeAviso.porCodigo(json['kind']),
      assunto: json['subject'] as String?,
      aconteceuEm: quando.toUtc(),
      lido: json['read'] as bool,
      agrupados: json['grouped_count'] as int,
      destino: DestinoDoAviso.porCodigo(json['destination']),
      destinoRef: json['destination_ref'] as String?,
    );
  }
}

/// `#/components/schemas/NotificationPage` do contrato: uma pagina da caixa.
class PaginaDaCaixa {
  const PaginaDaCaixa({
    required this.itens,
    required this.pagina,
    required this.tamanho,
    required this.total,
    required this.naoLidos,
  });

  final List<AvisoDaCaixa> itens;
  final int pagina;
  final int tamanho;

  /// Quantas LINHAS ja agrupadas a caixa tem no servidor, e nao quantos avisos:
  /// e ele que alimenta o `RodapeDaPaginacao`.
  final int total;

  /// O mesmo numero de `getNotificationCount`, que vem junto para a tela nao
  /// precisar de uma segunda chamada.
  final int naoLidos;

  static PaginaDaCaixa doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException('pagina da caixa sem `items`');
    }
    return PaginaDaCaixa(
      itens: itens
          .whereType<Map<String, dynamic>>()
          .map(AvisoDaCaixa.doJson)
          .toList(growable: false),
      pagina: json['page'] as int,
      tamanho: json['limit'] as int,
      total: json['total'] as int,
      naoLidos: json['unread_total'] as int,
    );
  }
}

/// `#/components/schemas/NotificationCount` do contrato: o numero do sino.
class ContagemDeAvisos {
  const ContagemDeAvisos({required this.naoLidos});

  final int naoLidos;

  /// **`FormatException`, e nao `TypeError`, quando o corpo nao bate** -- e a
  /// diferenca e o que separa "nao consegui ler" de um app que cai.
  static ContagemDeAvisos doJson(Map<String, dynamic> json) {
    final naoLidos = json['unread_total'];
    if (naoLidos is! int) {
      throw const FormatException('contagem de avisos sem `unread_total`');
    }
    return ContagemDeAvisos(naoLidos: naoLidos);
  }
}
