/// Os modelos de pet, de tag e da lista de referencia.
///
/// Recortes de `components/schemas` de `api/openapi.yaml`. O contrato e
/// entrada, nao sugestao: campo que nao esta la nao aparece aqui.
library;

/// `Species` do contrato.
enum Especie {
  cao('dog', 'Cão'),
  gato('cat', 'Gato'),
  outro('other', 'Outro');

  const Especie(this.valor, this.rotulo);

  final String valor;
  final String rotulo;

  /// O codigo de saida da lista de racas, por especie.
  ///
  /// E o unico codigo que **habilita** `breed_free_text` no contrato. Deduzir
  /// esse sufixo no ponto de uso, espalhado, e como as tres telas que usam a
  /// lista divergem: a regra mora aqui.
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

/// `PetSize` do contrato.
///
/// O contrato declara **quatro** valores (`P`, `M`, `G`, `GG`) e a tela F1.3
/// desenha **tres** botoes. Os quatro ficam aqui porque a resposta do servidor
/// pode trazer `GG` de um pet cadastrado por outra superficie, e um `switch`
/// que nao conhece o valor quebra a leitura da ficha. Quais deles a tela
/// oferece e decisao da tela, e esta em `TelaCadastrarIdentificacao`.
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

/// `Sex` do contrato.
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
///
/// **O codigo e o que vai para o servidor; o rotulo e o que aparece.** Trocar
/// um pelo outro e o defeito que a lista fechada existe para impedir.
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

/// `ReferenceData` do contrato: a lista fechada de especies, racas, portes e
/// cores, com a versao que o cliente precisa devolver em `ref_data_version`.
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
  ///
  /// A saida (`outro_dog` e irmas) e montada pela tela, porque o rotulo dela
  /// e microcopy (`Outra`) e nao dado do servidor.
  List<OpcaoDeReferencia> racasDe(Especie especie) {
    return racas
        .where((r) =>
            r.especie == especie && r.codigo != especie.codigoDeOutraRaca)
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

/// O que a redacao do servidor retirou de `care_notes` ao gravar.
///
/// Vazio quando nada foi retirado. Existe para a tela **dizer o que
/// aconteceu**, em vez de o tutor ver um texto sumir e achar que perdeu tudo.
enum RedacaoDeCuidados {
  telefone('phone', 'o telefone'),
  email('email', 'o e-mail'),
  endereco('address', 'o endereço'),
  link('external_link', 'o link');

  const RedacaoDeCuidados(this.valor, this.comoSeChama);

  final String valor;

  /// Como o texto de F1.5 nomeia a coisa retirada: "Tiramos **o telefone**
  /// que você escreveu."
  final String comoSeChama;

  static RedacaoDeCuidados? de(String? valor) {
    for (final r in RedacaoDeCuidados.values) {
      if (r.valor == valor) return r;
    }
    return null;
  }
}

/// `Pet.status` do contrato.
///
/// O app **nao** deduz estado a partir de `open_case_id`: sao dois campos e
/// eles respondem coisas diferentes (`lost` e o estado do animal; o caso e o
/// registro aberto). Um valor que este build nao conhece cai em
/// [StatusDoPet.desconhecido] em vez de estourar: versao antiga do app
/// continua instalada por semanas depois de o servidor ganhar um estado novo,
/// e um `switch` que nao conhece o valor quebraria a ficha inteira.
enum StatusDoPet {
  ativo('active'),
  perdido('lost'),
  falecido('deceased'),
  arquivado('archived'),

  /// Nao esta no contrato: e o que este build faz com um valor que ele nao
  /// conhece. Nunca e enviado ao servidor.
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

/// `PetPhoto.status` do contrato.
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

/// `PetPhoto` do contrato.
///
/// `thumb_url` e `card_url` sao **anulaveis no contrato**, inclusive com
/// `status: ready`. Quem consome precisa tratar foto pronta sem URL como foto
/// que nao da para mostrar, e nao como impossivel.
class FotoDoPet {
  const FotoDoPet({
    required this.id,
    required this.status,
    required this.principal,
    this.thumbUrl,
    this.cardUrl,
  });

  final String id;
  final StatusDaFoto status;
  final bool principal;
  final String? thumbUrl;
  final String? cardUrl;

  /// Da para pintar esta foto na moldura agora?
  bool get exibivel => status == StatusDaFoto.pronta && urlDeMiniatura != null;

  /// A URL que o cartao da variante `lista` usa.
  ///
  /// `thumb_url` primeiro porque a moldura `foto/sm` tem 56 dp de largura e a
  /// derivada de cartao tem ate 1024 px: baixar a grande para desenhar a
  /// pequena e trafego pago pelo tutor no 3G da rua.
  String? get urlDeMiniatura => thumbUrl ?? cardUrl;

  factory FotoDoPet.doJson(Map<String, dynamic> json) {
    return FotoDoPet(
      id: json['id'] as String? ?? '',
      status: StatusDaFoto.de(json['status'] as String?),
      principal: json['is_primary'] as bool? ?? false,
      thumbUrl: json['thumb_url'] as String?,
      cardUrl: json['card_url'] as String?,
    );
  }
}

/// `Pet` do contrato, nos campos que estas telas usam.
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
  });

  final String id;
  final String nome;
  final Especie especie;

  /// `status`. O contrato o declara **obrigatorio**; o padrao daqui existe
  /// para os construtores de teste, e nao para mascarar ausencia na resposta.
  final StatusDoPet status;

  /// `size`. Anulavel aqui e obrigatorio no contrato: o cartao mostra o que
  /// veio, e um pet cujo porte nao chegou some do texto de atributos em vez de
  /// derrubar a lista inteira.
  final Porte? porte;

  /// `breed_label`: o rotulo ja resolvido pelo servidor. E o `label` da lista
  /// quando o codigo esta nela, e o texto livre quando o codigo e `outro_*`.
  /// A tela exibe este campo e nao precisa saber qual caminho o gerou.
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
  /// para o topo de `Pets` pela BICHUS-177. O campo entra no modelo porque o
  /// contrato o declara e porque ler metade da resposta e como o app e o
  /// documento divergem sem ninguem ver.
  final String? idDoCasoAberto;

  /// A foto que o cartao pinta: a principal quando exibivel, senao a primeira
  /// exibivel que existir. Nulo quando nao ha nenhuma.
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
  ///
  /// Existe porque "sem foto" e "foto a caminho" sao estados diferentes para
  /// quem acabou de enviar uma, e dizer "sem foto" para quem enviou ha dez
  /// segundos e a falha silenciosa que este projeto persegue.
  bool get temFotoEmProcessamento =>
      fotos.any((f) => f.status == StatusDaFoto.processando);

  /// Sem plaquinha vinculada.
  bool get semTag => tagsAtivas <= 0;

  /// O pronome do texto de tela concorda com o sexo? Nao: a microcopy de F1.5
  /// e F1.6 fala do pet pelo **nome**, e nao por pronome. Nada a decidir aqui.

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

/// `PetTagIssued`: a **unica** resposta do contrato que traz o codigo em claro.
///
/// `GET /v1/pets/{petId}/tags` nunca mais devolve [codigo], nem para o dono:
/// so `code_suffix`, os quatro ultimos caracteres. Por isso o contrato diz que
/// o cliente **nao persiste** este valor, e por isso F1.6 e a unica tela do
/// produto em que ele aparece inteiro.
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

/// Quem esta do outro lado do codigo escaneado (`TagResolution.viewer`).
///
/// **E sinal de navegacao, e nao chave que destranca campo.** O corpo da
/// resposta e identico nos tres; `viewer` diz qual tela abrir.
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
    // Sem `viewer` reconhecido, o caminho conservador serve ao achador: quem
    // esta com o animal no colo precisa do botao de avisar, e o dono que caiu
    // aqui por engano perde uma tela, nao um resgate (UX F2.3, "Erro").
    return QuemEscaneou.anonimo;
  }
}

/// `TagResolution`: o que `GET /v1/tags/{code}` devolve quando o codigo vale.
class TagResolvida {
  const TagResolvida({
    required this.quemEscaneou,
    required this.nomeDoPet,
    required this.especie,
    this.estaPerdido = false,
  });

  final QuemEscaneou quemEscaneou;
  final String nomeDoPet;
  final Especie especie;
  final bool estaPerdido;

  factory TagResolvida.doJson(Map<String, dynamic> json) {
    final pet = json['pet'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final perdido = json['lost'] as Map<String, dynamic>?;
    return TagResolvida(
      quemEscaneou: QuemEscaneou.de(json['viewer'] as String?),
      nomeDoPet: pet['display_name'] as String? ?? '',
      especie: Especie.de(pet['species'] as String?) ?? Especie.outro,
      estaPerdido: perdido?['is_lost'] as bool? ?? false,
    );
  }
}
