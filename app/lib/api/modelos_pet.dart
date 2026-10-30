/// Os modelos de pet, de tag e da lista de referencia.
library;

/// `#/components/schemas/Species` do contrato.
enum Especie {
  cao('dog', 'Cachorro'),
  gato('cat', 'Gato'),
  outro('other', 'Outro');

  const Especie(this.valor, this.rotulo);

  final String valor;
  final String rotulo;

  /// O codigo de saida da lista de racas, por especie.
  String get codigoDeOutraRaca => switch (this) {
    Especie.cao => 'outro_dog',
    Especie.gato => 'outro_cat',
    Especie.outro => 'outro_other',
  };

  static Especie? de(String? valor) {
    for (final e in Especie.values) {
      if (e.valor == valor) return e;
    }
    return null;
  }
}

/// `#/components/schemas/PetSize` do contrato.
enum Porte {
  pequeno('P', 'Pequeno'),
  medio('M', 'Médio'),
  grande('G', 'Grande'),
  gigante('GG', 'Gigante');

  const Porte(this.valor, this.rotulo);

  final String valor;
  final String rotulo;

  static Porte? de(String? valor) {
    for (final p in Porte.values) {
      if (p.valor == valor) return p;
    }
    return null;
  }
}

/// `#/components/schemas/Sex` do contrato.
enum Sexo {
  macho('male', 'Macho'),
  femea('female', 'Fêmea'),
  naoSei('unknown', 'Não sei');

  const Sexo(this.valor, this.rotulo);

  final String valor;
  final String rotulo;

  static Sexo? de(String? valor) {
    for (final s in Sexo.values) {
      if (s.valor == valor) return s;
    }
    return null;
  }
}

/// Uma opcao de lista fechada: codigo que cruza, rotulo que a pessoa le.
class OpcaoDeReferencia {
  const OpcaoDeReferencia({
    required this.codigo,
    required this.rotulo,
    this.especie,
  });

  final String codigo;
  final String rotulo;

  /// So em raca: a especie a que a raca pertence.
  final Especie? especie;

  factory OpcaoDeReferencia.doJson(Map<String, dynamic> json) {
    return OpcaoDeReferencia(
      codigo: json['code'] as String? ?? '',
      rotulo: json['label'] as String? ?? '',
      especie: Especie.de(json['species'] as String?),
    );
  }
}

/// `#/components/schemas/ReferenceData` do contrato.
class DadosDeReferencia {
  const DadosDeReferencia({
    required this.versao,
    required this.racas,
    required this.cores,
  });

  final String versao;
  final List<OpcaoDeReferencia> racas;
  final List<OpcaoDeReferencia> cores;

  /// As racas de uma especie, sem a opcao de saida.
  List<OpcaoDeReferencia> racasDe(Especie especie) {
    return racas
        .where(
          (r) => r.especie == especie && r.codigo != especie.codigoDeOutraRaca,
        )
        .toList(growable: false);
  }

  factory DadosDeReferencia.doJson(Map<String, dynamic> json) {
    List<OpcaoDeReferencia> lista(String chave) {
      return (json[chave] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(OpcaoDeReferencia.doJson)
          .toList(growable: false);
    }

    return DadosDeReferencia(
      versao: json['version'] as String? ?? '',
      racas: lista('breeds'),
      cores: lista('colors'),
    );
  }
}

/// `#/components/schemas/Pet/allOf/1/properties/care_notes_redactions/items/properties/kind`
/// do contrato.
enum RedacaoDeCuidados {
  telefone('phone', 'o telefone'),
  email('email', 'o e-mail'),
  endereco('address', 'o endereço'),
  link('external_link', 'o link');

  const RedacaoDeCuidados(this.valor, this.comoSeChama);

  final String valor;

  /// Como o texto de F1.5 nomeia a coisa retirada: "Tiramos **o telefone** que
  /// você escreveu."
  final String comoSeChama;

  static RedacaoDeCuidados? de(String? valor) {
    for (final r in RedacaoDeCuidados.values) {
      if (r.valor == valor) return r;
    }
    return null;
  }
}

/// `#/components/schemas/Pet/allOf/1/properties/status` do contrato.
enum StatusDoPet {
  ativo('active'),
  perdido('lost'),
  falecido('deceased'),
  arquivado('archived'),

  /// Nao esta no contrato: e o que este build faz com um valor que ele nao
  /// conhece.
  desconhecido('');

  const StatusDoPet(this.valor);

  final String valor;

  static StatusDoPet de(String? valor) {
    for (final s in StatusDoPet.values) {
      if (s != StatusDoPet.desconhecido && s.valor == valor) return s;
    }
    return StatusDoPet.desconhecido;
  }
}

/// `#/components/schemas/PetPhoto/properties/status` do contrato.
enum StatusDaFoto {
  processando('processing'),
  pronta('ready'),
  recusada('rejected'),
  desconhecido('');

  const StatusDaFoto(this.valor);

  final String valor;

  static StatusDaFoto de(String? valor) {
    for (final s in StatusDaFoto.values) {
      if (s != StatusDaFoto.desconhecido && s.valor == valor) return s;
    }
    return StatusDaFoto.desconhecido;
  }
}

/// `#/components/schemas/PetPhoto` do contrato.
class FotoDoPet {
  const FotoDoPet({
    required this.id,
    required this.status,
    required this.principal,
    this.thumbUrl,
    this.cardUrl,
    this.motivoDaRecusa,
  });

  final String id;
  final StatusDaFoto status;
  final bool principal;
  final String? thumbUrl;
  final String? cardUrl;

  /// `rejection_reason`: o MOTIVO da recusa, em texto pronto para a tela.
  final String? motivoDaRecusa;

  /// Da para pintar esta foto na moldura agora?
  bool get exibivel => status == StatusDaFoto.pronta && urlDeMiniatura != null;

  /// A foto foi recusada, e ha um motivo para dizer?
  bool get recusada => status == StatusDaFoto.recusada;

  /// A URL que o cartao da variante `lista` usa.
  String? get urlDeMiniatura => thumbUrl ?? cardUrl;

  /// A URL que a moldura GRANDE do detalhe usa (`foto/lg`, 160 x 176 dp).
  String? get urlDeCartao => cardUrl ?? thumbUrl;

  factory FotoDoPet.doJson(Map<String, dynamic> json) {
    return FotoDoPet(
      id: json['id'] as String? ?? '',
      status: StatusDaFoto.de(json['status'] as String?),
      principal: json['is_primary'] as bool? ?? false,
      thumbUrl: json['thumb_url'] as String?,
      cardUrl: json['card_url'] as String?,
      motivoDaRecusa: json['rejection_reason'] as String?,
    );
  }
}

/// `#/components/schemas/Pet` do contrato.
class Pet {
  const Pet({
    required this.id,
    required this.nome,
    required this.especie,
    required this.redacoesDeCuidados,
    this.status = StatusDoPet.ativo,
    this.porte,
    this.racaRotulo,
    this.cuidados,
    this.fotos = const <FotoDoPet>[],
    this.tagsAtivas = 0,
    this.idDoCasoAberto,
    this.racaCodigo,
    this.racaTextoLivre,
    this.versaoDaReferencia,
    this.corPrincipalCodigo,
    this.segundaCorCodigo,
    this.sexo,
    this.sinaisParticulares,
  });

  final String id;
  final String nome;
  final Especie especie;

  /// `status`. O contrato o declara **obrigatorio**; o padrao daqui existe para
  /// os construtores de teste, e nao para mascarar ausencia na resposta.
  final StatusDoPet status;

  /// `size`. Anulavel aqui e obrigatorio no contrato: o cartao mostra o que
  /// veio, e um pet cujo porte nao chegou some do texto de atributos em vez de
  /// derrubar a lista inteira.
  final Porte? porte;

  /// `breed_label`: o rotulo ja resolvido pelo servidor.
  final String? racaRotulo;

  /// `care_notes` **como ficou depois da redacao**, e nao como foi digitado.
  final String? cuidados;

  final List<RedacaoDeCuidados> redacoesDeCuidados;

  /// `photos`. Vazia e o caso comum: a foto e **opcional** no cadastro por
  /// decisao de 21/09.
  final List<FotoDoPet> fotos;

  /// `active_tag_count`. Zero e o que faz o cartao trazer o convite de
  /// plaquinha (criterio 4 da BICHUS-62).
  final int tagsAtivas;

  /// `open_case_id`. **Esta historia nao renderiza caso aberto** -- ele foi
  /// para o topo de `Pets` pela BICHUS-177.
  final String? idDoCasoAberto;

  /// `breed_code`. **O codigo, e nao o rotulo**: e ele que o cruzamento de
  /// perdido e achado le, e e ele que volta no `PATCH`.
  final String? racaCodigo;

  /// `breed_free_text`. So existe quando [racaCodigo] e o `outro_*` da especie;
  /// o contrato recusa os dois juntos fora disso.
  final String? racaTextoLivre;

  /// `ref_data_version`: de qual versao da lista este pet foi escolhido.
  final String? versaoDaReferencia;

  final String? corPrincipalCodigo;
  final String? segundaCorCodigo;
  final Sexo? sexo;

  /// `distinctive_marks`, ate 500 caracteres no contrato.
  final String? sinaisParticulares;

  /// A foto que o cartao pinta: a principal quando exibivel, senao a primeira
  /// exibivel que existir.
  FotoDoPet? get fotoDeCapa {
    for (final f in fotos) {
      if (f.principal && f.exibivel) return f;
    }
    for (final f in fotos) {
      if (f.exibivel) return f;
    }
    return null;
  }

  /// Ha foto enviada que ainda nao terminou de processar?
  bool get temFotoEmProcessamento =>
      fotos.any((f) => f.status == StatusDaFoto.processando);

  /// O motivo da primeira foto RECUSADA, quando nao ha nenhuma exibivel.
  String? get motivoDaFotoRecusada {
    if (fotoDeCapa != null) return null;
    for (final f in fotos) {
      final motivo = f.motivoDaRecusa;
      if (f.recusada && motivo != null && motivo.isNotEmpty) return motivo;
    }
    return null;
  }

  /// Sem plaquinha vinculada.
  bool get semTag => tagsAtivas <= 0;

  factory Pet.doJson(Map<String, dynamic> json) {
    return Pet(
      id: json['id'] as String,
      nome: json['name'] as String? ?? '',
      especie: Especie.de(json['species'] as String?) ?? Especie.outro,
      status: StatusDoPet.de(json['status'] as String?),
      porte: Porte.de(json['size'] as String?),
      fotos: (json['photos'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(FotoDoPet.doJson)
          .toList(growable: false),
      tagsAtivas: json['active_tag_count'] as int? ?? 0,
      idDoCasoAberto: json['open_case_id'] as String?,
      racaRotulo: json['breed_label'] as String?,
      racaCodigo: json['breed_code'] as String?,
      racaTextoLivre: json['breed_free_text'] as String?,
      versaoDaReferencia: json['ref_data_version'] as String?,
      corPrincipalCodigo: json['primary_color_code'] as String?,
      segundaCorCodigo: json['secondary_color_code'] as String?,
      sexo: Sexo.de(json['sex'] as String?),
      sinaisParticulares: json['distinctive_marks'] as String?,
      cuidados: json['care_notes'] as String?,
      redacoesDeCuidados:
          (json['care_notes_redactions'] as List<dynamic>? ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map((m) => RedacaoDeCuidados.de(m['kind'] as String?))
              .whereType<RedacaoDeCuidados>()
              .toList(growable: false),
    );
  }
}

/// `PetTag`: a tag do pet como o **dono** a ve em `GET /v1/pets/{petId}/tags`.
class TagDoPet {
  const TagDoPet({
    required this.id,
    required this.ativa,
    required this.sufixo,
    this.apelido,
  });

  final String id;

  /// `status == 'active'`. O contrato fecha o enum em `active` e `revoked`, e a
  /// tela so tem o que fazer com a primeira: tag revogada responde 410 no
  /// `qr.png` ("A tag revogada.
  final bool ativa;

  /// `code_suffix`: os quatro ultimos caracteres.
  final String sufixo;

  /// `label`: o apelido que distingue uma plaquinha da outra.
  final String? apelido;

  factory TagDoPet.doJson(Map<String, dynamic> json) {
    return TagDoPet(
      id: json['id'] as String? ?? '',
      ativa: (json['status'] as String?) == 'active',
      sufixo: json['code_suffix'] as String? ?? '',
      apelido: json['label'] as String?,
    );
  }
}

/// `PetTagIssued`: a **unica** resposta do contrato que traz o codigo em claro.
class TagEmitida {
  const TagEmitida({
    required this.id,
    required this.codigo,
    required this.url,
    required this.sufixo,
    this.qrPngUrl,
  });

  final String id;

  /// O codigo por extenso. **Nao grave isto em disco.**
  final String codigo;

  final String url;

  /// `code_suffix`: os quatro ultimos caracteres, que sao tudo o que o app
  /// consegue mostrar depois desta tela.
  final String sufixo;

  final String? qrPngUrl;

  factory TagEmitida.doJson(Map<String, dynamic> json) {
    return TagEmitida(
      id: json['id'] as String? ?? '',
      codigo: json['code'] as String? ?? '',
      url: json['url'] as String? ?? '',
      sufixo: json['code_suffix'] as String? ?? '',
      qrPngUrl: json['qr_png_url'] as String?,
    );
  }
}

/// `#/components/schemas/TagResolution/properties/viewer` do contrato.
enum QuemEscaneou {
  dono('owner'),
  outroLogado('authenticated_other'),
  anonimo('anonymous');

  const QuemEscaneou(this.valor);

  final String valor;

  static QuemEscaneou de(String? valor) {
    for (final q in QuemEscaneou.values) {
      if (q.valor == valor) return q;
    }
    return QuemEscaneou.anonimo;
  }
}

/// `TagResolution`: o que `GET /v1/tags/{code}` devolve quando o codigo vale.
class TagResolvida {
  const TagResolvida({
    required this.quemEscaneou,
    required this.nomeDoPet,
    required this.especie,
    this.racaRotulo,
    this.porte,
    this.corPrincipal,
    this.sinaisDistintivos,
    this.notasDeCuidado,
    this.fotoUrl,
    this.estaPerdido = false,
    this.perdidoDesde,
    this.jaAvisouDesteAparelho = false,
  });

  final QuemEscaneou quemEscaneou;
  final String nomeDoPet;
  final Especie especie;

  /// `pet.breed_label`: o rotulo ja resolvido pelo servidor.
  final String? racaRotulo;

  /// `pet.size`. Obrigatorio no contrato; nulo aqui so quando vier um valor que
  /// este build nao conhece, e ai a linha de sinais o omite em vez de quebrar.
  final Porte? porte;

  /// `pet.primary_color`.
  final String? corPrincipal;

  /// `pet.distinctive_marks`.
  final String? sinaisDistintivos;

  /// `pet.care_notes`: o cartao de manejo, **ja redigido pelo tutor**.
  final String? notasDeCuidado;

  /// `pet.photo_url`.
  final String? fotoUrl;

  final bool estaPerdido;

  /// `lost.since`.
  final DateTime? perdidoDesde;

  /// `already_notified`: este mesmo aparelho ja avisou nas ultimas 24 h.
  final bool jaAvisouDesteAparelho;

  factory TagResolvida.doJson(Map<String, dynamic> json) {
    final pet =
        json['pet'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final perdido = json['lost'] as Map<String, dynamic>?;
    return TagResolvida(
      quemEscaneou: QuemEscaneou.de(json['viewer'] as String?),
      nomeDoPet: pet['display_name'] as String? ?? '',
      especie: Especie.de(pet['species'] as String?) ?? Especie.outro,
      racaRotulo: pet['breed_label'] as String?,
      porte: Porte.de(pet['size'] as String?),
      corPrincipal: pet['primary_color'] as String?,
      sinaisDistintivos: pet['distinctive_marks'] as String?,
      notasDeCuidado: pet['care_notes'] as String?,
      fotoUrl: pet['photo_url'] as String?,
      estaPerdido: perdido?['is_lost'] as bool? ?? false,
      perdidoDesde: DateTime.tryParse(perdido?['since'] as String? ?? ''),
      jaAvisouDesteAparelho: json['already_notified'] as bool? ?? false,
    );
  }
}

/// A resposta de `POST /tags/{code}/found-reports` (`FoundReportCreated`).
class AvisoDoAchadorCriado {
  const AvisoDoAchadorCriado({
    required this.tokenDoAchador,
    required this.urlDaConversa,
    required this.tutorAvisado,
    this.nomeDoPet,
  });

  /// `finder_token`: o que deixa o achador **sem conta** voltar a conversa.
  final String tokenDoAchador;

  /// `conversation_url`: o endereco da conversa mediada, montado pelo servidor.
  final String urlDaConversa;

  /// `owner_notified` — **verdadeiro so quando a entrega ao tutor foi
  /// enfileirada**.
  final bool tutorAvisado;

  /// `pet_display_name`. Opcional no contrato.
  final String? nomeDoPet;

  factory AvisoDoAchadorCriado.doJson(Map<String, dynamic> json) {
    return AvisoDoAchadorCriado(
      tokenDoAchador: json['finder_token'] as String? ?? '',
      urlDaConversa: json['conversation_url'] as String? ?? '',
      tutorAvisado: json['owner_notified'] as bool? ?? false,
      nomeDoPet: json['pet_display_name'] as String?,
    );
  }
}

/// A resposta de `GET /tags/{code}/owner-context` (`TagOwnerContext`).
class ContextoDoDonoDaTag {
  const ContextoDoDonoDaTag({required this.petId, required this.tagId});

  /// `pet_id`. E o endereco da pagina do pet (`T.1`), que e para onde o dono
  /// vai quando escaneia a propria plaquinha.
  final String petId;

  /// `tag_id`. Endereca as operacoes de plaquinha do tutor.
  final String tagId;

  factory ContextoDoDonoDaTag.doJson(Map<String, dynamic> json) {
    return ContextoDoDonoDaTag(
      petId: json['pet_id'] as String? ?? '',
      tagId: json['tag_id'] as String? ?? '',
    );
  }
}

/// O endereco para onde a plaquinha e enviada (`DeliveryAddress`).
class EnderecoDeEntrega {
  const EnderecoDeEntrega({
    required this.destinatario,
    required this.cep,
    required this.logradouro,
    required this.numero,
    required this.bairro,
    required this.cidade,
    required this.uf,
    required this.telefone,
    this.complemento,
  });

  /// Quem recebe, como vai na etiqueta.
  final String destinatario;

  /// Oito digitos, **sem mascara**: o contrato declara `^[0-9]{8}$`.
  final String cep;

  final String logradouro;

  /// Texto, e nao numero: `s/n`, `120A` e `KM 32` sao numeros de porta.
  final String numero;

  /// O unico campo opcional do endereco.
  final String? complemento;

  final String bairro;
  final String cidade;

  /// A sigla de dois caracteres.
  final String uf;

  /// **E.164**, `+55` e 10 ou 11 digitos, como o contrato exige.
  final String telefone;

  /// O endereco que o SERVIDOR devolveu, ou `null` quando nao ha nenhum.
  static EnderecoDeEntrega? doJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final complemento = json['complement'] as String?;
    return EnderecoDeEntrega(
      destinatario: json['recipient_name'] as String? ?? '',
      cep: json['postal_code'] as String? ?? '',
      logradouro: json['street'] as String? ?? '',
      numero: json['street_number'] as String? ?? '',
      complemento: complemento == null || complemento.isEmpty ? null : complemento,
      bairro: json['neighborhood'] as String? ?? '',
      cidade: json['city'] as String? ?? '',
      uf: json['state'] as String? ?? '',
      telefone: json['recipient_phone'] as String? ?? '',
    );
  }

  Map<String, dynamic> paraJson() {
    return <String, dynamic>{
      'recipient_name': destinatario,
      'postal_code': cep,
      'street': logradouro,
      'street_number': numero,
      if (complemento != null && complemento!.isNotEmpty)
        'complement': complemento,
      'neighborhood': bairro,
      'city': cidade,
      'state': uf,
      'recipient_phone': telefone,
    };
  }
}

/// O pedido da plaquinha da coleira, como o app o ve.
class PedidoDePlaquinha {
  const PedidoDePlaquinha({
    required this.ref,
    required this.status,
    required this.solicitadoEm,
    this.passoDaEntrega = 'requested',
    this.decididoEm,
    this.codigoDeRastreio,
    this.despachadoEm,
    this.entregueEm,
    this.observacao,
  });

  /// O identificador OPACO do pedido, como o servidor o devolveu.
  final String ref;

  /// `pending`, `fulfilled` ou `declined`, como o contrato os escreve.
  final String status;

  final DateTime? solicitadoEm;

  /// Quando o painel decidiu, ou nulo enquanto ninguem decidiu.
  final DateTime? decididoEm;

  /// O PASSO DA ENTREGA: `requested`, `in_transit` ou `arrived`.
  final String passoDaEntrega;

  /// O codigo de rastreio da transportadora, quando existir.
  final String? codigoDeRastreio;

  /// Quando a plaquinha SAIU, ou nulo enquanto ela nao saiu.
  final DateTime? despachadoEm;

  /// Quando a plaquinha CHEGOU, ou nulo em tudo que nao chegou.
  final DateTime? entregueEm;

  final String? observacao;

  /// Verdadeiro enquanto ninguem decidiu.
  bool get aguardando => status == 'pending';

  factory PedidoDePlaquinha.doJson(Map<String, dynamic> json) {
    final quando = json['requested_at'];
    final decidido = json['decided_at'];
    final rastreio = json['tracking_code'] as String?;
    final despachado = json['shipped_at'];
    final entregue = json['delivered_at'];
    final passo = json['delivery_state'] as String?;
    return PedidoDePlaquinha(
      ref: json['ref'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      solicitadoEm: quando is String ? DateTime.tryParse(quando) : null,
      passoDaEntrega:
          passo == null || passo.trim().isEmpty ? 'requested' : passo.trim(),
      decididoEm: decidido is String ? DateTime.tryParse(decidido) : null,
      codigoDeRastreio:
          rastreio == null || rastreio.trim().isEmpty ? null : rastreio.trim(),
      despachadoEm: despachado is String ? DateTime.tryParse(despachado) : null,
      entregueEm: entregue is String ? DateTime.tryParse(entregue) : null,
      observacao: json['notes'] as String?,
    );
  }
}
