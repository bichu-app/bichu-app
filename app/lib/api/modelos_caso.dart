/// Os modelos do caso de perdido (`LostCase`, `LostCaseReachPreview`).
///
/// Recorte de `components/schemas` de `api/openapi.yaml`. O contrato e entrada,
/// nao sugestao: campo que nao esta la nao aparece aqui.
///
/// **A coordenada nao esta neste arquivo, e a ausencia e a regra e nao um
/// esquecimento.** O servidor nao devolve `last_seen_location` em resposta
/// nenhuma, nem para o dono (`lost-case-routes.ts`, `comoRespostaDoCaso`): ele
/// ja sabe onde o pet dele sumiu, e o campo so existiria para vazar depois. Um
/// modelo que declarasse o campo convidaria a primeira tela com pressa a
/// preenche-lo.
library;

/// `#/components/schemas/AlertDispatch/properties/reach_status` do contrato.
///
/// `LostCaseReachPreview.reach_status` e `AlertDispatch.reach_status`.
///
/// **As quatro respostas nao se confundem, e e nisto que esta o produto.** O
/// erro que este enum existe para impedir e escrever `0` onde a verdade e
/// "nao sei":
///
/// | valor | o que quer dizer |
/// |---|---|
/// | `computed` | contamos, e o numero e este -- **inclusive zero** |
/// | `unavailable` | havia centro e o calculo nao respondeu |
/// | `noLocation` | nao ha centro: **nao havera alerta** |
/// | `queued` | o disparo ficou para depois (so em `AlertDispatch`) |
///
/// `desconhecido` nao esta no contrato: e o que este build faz com um valor
/// que ele nao conhece. Versao antiga do app fica instalada por semanas depois
/// de o servidor ganhar um estado novo, e um `switch` cego derrubaria a tela
/// inteira do caso aberto -- justamente a tela de quem esta em panico.
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

/// `#/components/schemas/LostCaseReachPreview/properties/blockers/items` do contrato.
///
/// `LostCaseReachPreview.blockers`: o que impede abrir o caso.
///
/// **Falta de coordenada nao esta aqui**, e o contrato diz isso por escrito:
/// ela reduz o alcance, nao a existencia do caso.
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
///
/// Bairro e cidade sao o nivel maximo de precisao que sai em superficie
/// publica (ADR-0010), entao esta representacao nao perde nada na exibicao.
/// Ela perde no alerta, que precisa de um centro para ter raio.
///
/// [cidade] e o unico campo obrigatorio do contrato, e o motivo esta no teste
/// de dominio do servidor: "ha Centro em toda cidade do pais". Bairro sem
/// cidade nao localiza nada.
class AreaDoAvistamento {
  const AreaDoAvistamento({
    required this.cidade,
    this.bairro,
    this.uf,
  });

  final String cidade;
  final String? bairro;
  final String? uf;

  /// Ha o minimo para abrir o caso? A mesma pergunta que `temOndeSuficiente`
  /// responde no servidor, feita aqui **antes** de gastar uma viagem de rede
  /// de quem esta com 11% de bateria.
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

/// `LostCaseReachPreview`: quantos tutores o alerta alcanca, **antes** de abrir.
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
  ///
  /// **A tela nao pode trocar este nulo por zero.** Sao respostas opostas: com
  /// zero a pessoa aprende que compartilhar alcanca mais gente hoje que o
  /// alerta; com "nao sei" ela nao aprende nada e nao desiste do alerta.
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

  /// Nulo sempre que [estado] nao e [EstadoDoAlcance.calculado]. Mesmo cuidado
  /// de [PreviaDoAlcance.tutoresAlcancaveis].
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
  /// mostra a explicacao no lugar dela. Secao vazia num caso aberto parece
  /// defeito, e faz a pessoa tocar de novo (criterio 9).
  final bool temLocalizacao;

  final DisparoDoAlerta alerta;
  final String? urlDeCompartilhar;
  final String? urlDoCartaz;

  factory CasoDePerdido.doJson(Map<String, dynamic> json) {
    final vistoEm = json['last_seen_at'] as String?;
    return CasoDePerdido(
      // Sem `??`, de proposito: caso sem identidade nao e caso degradado, e
      // uma tela de resultado apontando para nada e pior que um estouro aqui.
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
    );
  }
}
