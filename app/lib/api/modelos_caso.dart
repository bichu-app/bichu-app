/// Os modelos do caso de perdido (`LostCase`, `LostCaseReachPreview`).
library;

/// `#/components/schemas/AlertDispatch/properties/reach_status` do contrato.
enum EstadoDoAlcance {
  calculado('computed'),
  indisponivel('unavailable'),
  semLocalizacao('no_location'),
  enfileirado('queued'),
  desconhecido('');

  const EstadoDoAlcance(this.valor);

  final String valor;

  static EstadoDoAlcance de(String? valor) {
    for (final e in EstadoDoAlcance.values) {
      if (e != EstadoDoAlcance.desconhecido && e.valor == valor) return e;
    }
    return EstadoDoAlcance.desconhecido;
  }
}

/// `#/components/schemas/LostCaseReachPreview/properties/blockers/items` do
/// contrato.
enum BloqueioDoCaso {
  canalDeContatoNaoVerificado('contact_channel_unverified'),
  petSemFoto('pet_photo_missing'),
  petJaPerdido('pet_already_lost'),
  desconhecido('');

  const BloqueioDoCaso(this.valor);

  final String valor;

  static BloqueioDoCaso de(String? valor) {
    for (final b in BloqueioDoCaso.values) {
      if (b != BloqueioDoCaso.desconhecido && b.valor == valor) return b;
    }
    return BloqueioDoCaso.desconhecido;
  }
}

/// `Area`: onde o pet foi visto, **em texto**.
class AreaDoAvistamento {
  const AreaDoAvistamento({
    required this.cidade,
    this.bairro,
    this.uf,
  });

  final String cidade;
  final String? bairro;
  final String? uf;

  /// Ha o minimo para abrir o caso?
  bool get suficiente => cidade.trim().isNotEmpty;

  Map<String, dynamic> paraJson() => <String, dynamic>{
        'city': cidade.trim(),
        if (bairro != null && bairro!.trim().isNotEmpty)
          'neighborhood': bairro!.trim(),
        if (uf != null && uf!.trim().isNotEmpty) 'state': uf!.trim(),
      };

  static AreaDoAvistamento? doJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final cidade = json['city'] as String?;
    if (cidade == null || cidade.trim().isEmpty) return null;
    return AreaDoAvistamento(
      cidade: cidade,
      bairro: json['neighborhood'] as String?,
      uf: json['state'] as String?,
    );
  }
}

/// `LostCaseReachPreview`: quantos tutores o alerta alcanca, **antes** de
/// abrir.
class PreviaDoAlcance {
  const PreviaDoAlcance({
    required this.estado,
    required this.raioEmMetros,
    required this.bloqueios,
    this.tutoresAlcancaveis,
    this.rotuloDaArea,
  });

  final EstadoDoAlcance estado;

  /// Nulo quando [estado] nao e [EstadoDoAlcance.calculado].
  final int? tutoresAlcancaveis;

  final int raioEmMetros;

  /// `area_label`. **Nulo quando a consulta levou coordenada**, porque nao ha
  /// geocodificacao no MVP (ADR-0006): rotular o ponto onde o pet sumiu com o
  /// bairro de casa do tutor seria mentira de aparencia plausivel.
  final String? rotuloDaArea;

  final List<BloqueioDoCaso> bloqueios;

  bool get bloqueado => bloqueios.isNotEmpty;

  factory PreviaDoAlcance.doJson(Map<String, dynamic> json) {
    return PreviaDoAlcance(
      estado: EstadoDoAlcance.de(json['reach_status'] as String?),
      tutoresAlcancaveis: json['reachable_tutors'] as int?,
      raioEmMetros: json['radius_m'] as int? ?? 5000,
      rotuloDaArea: json['area_label'] as String?,
      bloqueios: (json['blockers'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<String>()
          .map(BloqueioDoCaso.de)
          .where((b) => b != BloqueioDoCaso.desconhecido)
          .toList(growable: false),
    );
  }
}

/// `AlertDispatch`: o estado do disparo de um caso que ja existe.
class DisparoDoAlerta {
  const DisparoDoAlerta({
    required this.estado,
    this.destinatarios,
    this.raioEmMetros = 5000,
  });

  final EstadoDoAlcance estado;

  /// Nulo sempre que [estado] nao e [EstadoDoAlcance.calculado].
  final int? destinatarios;

  final int raioEmMetros;

  factory DisparoDoAlerta.doJson(Map<String, dynamic>? json) {
    final mapa = json ?? const <String, dynamic>{};
    return DisparoDoAlerta(
      estado: EstadoDoAlcance.de(mapa['reach_status'] as String?),
      destinatarios: mapa['recipients_total'] as int?,
      raioEmMetros: mapa['radius_m'] as int? ?? 5000,
    );
  }
}

/// `#/components/schemas/LostCaseClosure/properties/outcome` do contrato.
enum DesfechoDoCaso {
  /// O animal voltou. **E o unico que conta no numerador da metrica de
  /// reencontro**, que o contrato chama de instrumento de medicao do produto.
  reencontrado('reunited'),

  /// A procura terminou sem o animal.
  naoEncontrado('not_found'),

  /// O caso foi aberto por engano, e o animal nunca esteve perdido.
  abertoPorEngano('false_alarm');

  const DesfechoDoCaso(this.valor);

  final String valor;
}

/// `#/components/schemas/LostCaseClosure/properties/reunion_channel`.
enum CanalDoReencontro {
  pelaTag('tag_scan'),
  peloAlerta('bichu_alert'),
  peloCartazOuLink('poster_or_link'),
  porContaPropria('on_my_own'),
  outro('other');

  const CanalDoReencontro(this.valor);

  final String valor;
}

/// `LostCase`: o caso aberto.
class CasoDePerdido {
  const CasoDePerdido({
    required this.id,
    required this.petId,
    required this.status,
    required this.abertoEm,
    required this.alerta,
    required this.temLocalizacao,
    this.vistoEm,
    this.rotuloDaArea,
    this.descricao,
    this.urlDeCompartilhar,
    this.urlDoCartaz,
    this.prazoDeReabertura,
  });

  final String id;
  final String petId;
  final String status;
  final DateTime abertoEm;
  final DateTime? vistoEm;
  final String? rotuloDaArea;
  final String? descricao;

  /// `has_location`. **Falso quando o caso nasceu so com area**, e e ele que
  /// manda na tela: com ele falso F3.3 nao mostra a secao de alerta vazia,
  /// mostra a explicacao no lugar dela.
  final bool temLocalizacao;

  final DisparoDoAlerta alerta;
  final String? urlDeCompartilhar;
  final String? urlDoCartaz;

  /// `reopen_deadline`: ate quando este encerramento da para desfazer.
  final DateTime? prazoDeReabertura;

  /// Se a janela de reabertura esta aberta **neste instante**.
  bool janelaDeReaberturaAberta(DateTime agora) {
    final prazo = prazoDeReabertura;
    return prazo != null && prazo.isAfter(agora);
  }

  factory CasoDePerdido.doJson(Map<String, dynamic> json) {
    final vistoEm = json['last_seen_at'] as String?;
    return CasoDePerdido(
      id: json['id'] as String,
      petId: json['pet_id'] as String? ?? '',
      status: json['status'] as String? ?? 'open',
      abertoEm:
          DateTime.tryParse(json['opened_at'] as String? ?? '') ??
              DateTime.now(),
      vistoEm: vistoEm == null ? null : DateTime.tryParse(vistoEm),
      rotuloDaArea: json['area_label'] as String?,
      temLocalizacao: json['has_location'] as bool? ?? false,
      descricao: json['description'] as String?,
      alerta: DisparoDoAlerta.doJson(
        json['alert'] as Map<String, dynamic>?,
      ),
      urlDeCompartilhar: json['share_url'] as String?,
      urlDoCartaz: json['poster_url'] as String?,
      prazoDeReabertura: DateTime.tryParse(
        json['reopen_deadline'] as String? ?? '',
      ),
    );
  }
}

/// `MatchCandidate`: uma possivel correspondencia entre o caso do tutor e um
/// aviso de achado.
class CandidatoDeCorrespondencia {
  const CandidatoDeCorrespondencia({
    required this.id,
    required this.status,
    required this.avisoEm,
    this.rotuloDaArea,
    this.especie,
    this.porte,
    this.observacao,
    this.distanciaEmMetros,
    this.atributosQuePontuaram = const <String>[],
  });

  /// `MatchCandidate.id`. E o que a rota de decidir pede no caminho.
  final String id;

  /// `suggested`, `confirmed` ou `rejected`.
  final String status;

  /// `found_report.found_at`: quando o animal foi visto por quem avisou.
  final DateTime avisoEm;

  /// Bairro e cidade, em texto.
  final String? rotuloDaArea;

  final String? especie;
  final String? porte;
  final String? observacao;

  /// Nulo quando o caso ou o achado nao tem coordenada.
  final int? distanciaEmMetros;

  /// O que bateu, e nao quanto cada coisa pesou.
  final List<String> atributosQuePontuaram;

  bool get aguardandoDecisao => status == 'suggested';

  factory CandidatoDeCorrespondencia.doJson(Map<String, dynamic> json) {
    final aviso = json['found_report'] as Map<String, dynamic>? ??
        const <String, dynamic>{};
    return CandidatoDeCorrespondencia(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'suggested',
      avisoEm:
          DateTime.tryParse(aviso['found_at'] as String? ?? '')?.toLocal() ??
              DateTime.now(),
      rotuloDaArea: aviso['area_label'] as String?,
      especie: aviso['species'] as String?,
      porte: aviso['size'] as String?,
      observacao: aviso['notes'] as String?,
      distanciaEmMetros: json['distance_m'] as int?,
      atributosQuePontuaram:
          (json['matched_attributes'] as List<dynamic>? ?? const <dynamic>[])
              .whereType<String>()
              .toList(growable: false),
    );
  }
}

/// `CandidatePage`.
class PaginaDeCandidatos {
  const PaginaDeCandidatos({required this.itens, this.proximoCursor});

  final List<CandidatoDeCorrespondencia> itens;

  /// Valor **opaco**: o app o devolve como veio e nao o interpreta.
  final String? proximoCursor;

  factory PaginaDeCandidatos.doJson(Map<String, dynamic> json) {
    return PaginaDeCandidatos(
      itens: (json['items'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CandidatoDeCorrespondencia.doJson)
          .toList(growable: false),
      proximoCursor: json['next_cursor'] as String?,
    );
  }
}
