/// Os modelos de pet, de tag e da lista de referencia.
///
/// Recortes de `components/schemas` de `api/openapi.yaml`. O contrato e
/// entrada, nao sugestao: campo que nao esta la nao aparece aqui.
library;

/// `#/components/schemas/Species` do contrato.
enum Especie {
  // O ROTULO E `Cachorro` (cliente, 22/10/2026): *"Troque os textos de cao
  // para cachorro"*. **`'dog'` e VALOR DE CONTRATO e nao muda** -- ele e o
  // `Species` de `api/openapi.yaml` e viaja em toda requisicao; so o rotulo
  // de exibicao, que e o que a pessoa le, virou `Cachorro`.
  //
  // Esta linha era a UNICA fonte do rotulo no app, e estava LIBERADA por
  // excecao no portao de vocabulario (`test/widgets/vocabulario_do_produto.dart`)
  // desde 22/10. A excecao SAIU no mesmo commit: enquanto ela existia, o
  // portao que cobra `cao` -> `cachorro` ficava cego exatamente aqui.
  cao('dog', 'Cachorro'),
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

/// `#/components/schemas/PetSize` do contrato.
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

/// `#/components/schemas/ReferenceData` do contrato.
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
///
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

/// `#/components/schemas/Pet/allOf/1/properties/status` do contrato.
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
    this.motivoDaRecusa,
  });

  final String id;
  final StatusDaFoto status;
  final bool principal;
  final String? thumbUrl;
  final String? cardUrl;

  /// `rejection_reason`: o MOTIVO da recusa, em texto pronto para a tela.
  ///
  /// Nulo fora de `rejected`. Ele passou a existir no contrato nesta entrega --
  /// antes a tela dizia "recusada" e a pessoa nao tinha como saber se o
  /// problema era o formato, o tamanho, a dimensao minima ou um arquivo
  /// truncado, e portanto nao tinha como consertar.
  ///
  /// **Nao e codigo de erro**: nao se compara, nao se traduz e nao se ramifica
  /// por ele. Quem precisa ramificar ramifica por [status].
  final String? motivoDaRecusa;

  /// Da para pintar esta foto na moldura agora?
  bool get exibivel => status == StatusDaFoto.pronta && urlDeMiniatura != null;

  /// A foto foi recusada, e ha um motivo para dizer?
  bool get recusada => status == StatusDaFoto.recusada;

  /// A URL que o cartao da variante `lista` usa.
  ///
  /// `thumb_url` primeiro porque a moldura `foto/sm` tem 56 dp de largura e a
  /// derivada de cartao tem ate 1024 px: baixar a grande para desenhar a
  /// pequena e trafego pago pelo tutor no 3G da rua.
  String? get urlDeMiniatura => thumbUrl ?? cardUrl;

  /// A URL que a moldura GRANDE do detalhe usa (`foto/lg`, 160 x 176 dp).
  ///
  /// `card_url` primeiro, e e o inverso de [urlDeMiniatura] de proposito: a
  /// `thumb` tem 176 px de largura e a moldura do detalhe desenha 160 dp, que
  /// a 3x sao 480 px -- a miniatura esticada quase tres vezes. A `card` tem
  /// 1024 px, cortada na mesma proporcao de 1 : 1,1 da moldura, e e a derivada
  /// que o cartaz impresso e a pagina publica do caso tambem usam.
  ///
  /// Ela existia e **nao era desenhada por ninguem no app**: a lista pedia a
  /// `thumb` e a tela de detalhe nao montava `Image` nenhuma -- a moldura
  /// grande ficava no estado vazio mesmo com foto pronta.
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
  ///
  /// A BICHUS-61 e a BICHUS-60 passaram a **ler** este campo: a edicao avisa
  /// que o alerta ja disparado nao e reescrito (criterio 3 da 61), e a
  /// exclusao avisa que o caso sera encerrado sem desfecho (criterio 4 da 60).
  final String? idDoCasoAberto;

  // --------------------------------------------------------------------
  // Os campos que a BICHUS-61 acrescentou, e o motivo de eles nao existirem
  // antes
  // --------------------------------------------------------------------
  //
  // O contrato declara `Pet` como `allOf [PetInput, ...]`: a resposta SEMPRE
  // trouxe `breed_code`, `primary_color_code`, `secondary_color_code`, `sex` e
  // `distinctive_marks`. Este modelo simplesmente nao os lia, porque a lista
  // de `Meus pets` nao os mostra.
  //
  // **Para a edicao isso deixa de ser economia e vira perda de dado.**
  // `PATCH /pets/{petId}` recebe um `PetInput` inteiro e o repositorio grava
  // TODAS as colunas (`kysely-pet-repository.ts`, `atualizar`): campo que nao
  // for enviado e gravado como nulo. Uma tela de edicao que so soubesse ler
  // nome, especie e porte apagaria a cor, o sexo e os sinais particulares do
  // pet a cada vez que o tutor corrigisse o nome -- em silencio, e sem que
  // nada no app reprovasse. Ler a resposta inteira e o que torna o `PATCH`
  // seguro.

  /// `breed_code`. **O codigo, e nao o rotulo**: e ele que o cruzamento de
  /// perdido e achado le, e e ele que volta no `PATCH`. [racaRotulo] continua
  /// sendo o que a tela exibe.
  final String? racaCodigo;

  /// `breed_free_text`. So existe quando [racaCodigo] e o `outro_*` da
  /// especie; o contrato recusa os dois juntos fora disso.
  final String? racaTextoLivre;

  /// `ref_data_version`: de qual versao da lista este pet foi escolhido.
  ///
  /// Reenviado como veio no `PATCH` que **nao** mexe na raca. Mandar a versao
  /// corrente ali responderia "qual e a lista de hoje" a uma pergunta que e
  /// "de qual lista este pet foi escolhido", e reescreveria a procedencia do
  /// dado por causa de uma edicao de nome.
  final String? versaoDaReferencia;

  final String? corPrincipalCodigo;
  final String? segundaCorCodigo;
  final Sexo? sexo;

  /// `distinctive_marks`, ate 500 caracteres no contrato.
  final String? sinaisParticulares;

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

  /// O motivo da primeira foto RECUSADA, quando nao ha nenhuma exibivel.
  ///
  /// A condicao "quando nao ha nenhuma exibivel" e a regra, e nao zelo: com uma
  /// foto boa na tela, avisar que uma antiga foi recusada e barulho sobre algo
  /// que a pessoa ja resolveu enviando outra. Sem nenhuma, o aviso e a unica
  /// informacao que permite consertar.
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
///
/// **Ela nao tem o codigo, e a ausencia e o contrato.** A rota "nunca devolve
/// o codigo em claro, nem para o dono: apenas os quatro ultimos caracteres,
/// para que ele consiga identificar a plaquinha fisica". Quem quer o codigo
/// inteiro de novo nao tem por onde: ele saiu uma vez, em [TagEmitida], na
/// F1.6, e o contrato manda o cliente **nao** persistir aquele valor.
///
/// Por isso [TagDoPet] existe com tres campos e nao com quatro: o caminho de
/// recuperacao do codigo e a IMAGEM (`qr.png`), que o servidor desenha, e nao
/// um codigo guardado no aparelho. A consequencia de desenho esta na tela do
/// detalhe: o rotulo acessivel do QR **nao pode** ser o codigo por extenso,
/// porque o app nao o tem.
class TagDoPet {
  const TagDoPet({
    required this.id,
    required this.ativa,
    required this.sufixo,
    this.apelido,
  });

  final String id;

  /// `status == 'active'`. O contrato fecha o enum em `active` e `revoked`, e
  /// a tela so tem o que fazer com a primeira: tag revogada responde 410 no
  /// `qr.png` ("A tag revogada. O QR nao e reimpresso"), entao pedir a imagem
  /// dela seria pedir uma recusa.
  final bool ativa;

  /// `code_suffix`: os quatro ultimos caracteres. **Tudo o que o app tem** do
  /// codigo depois da F1.6.
  final String sufixo;

  /// `label`: o apelido que distingue uma plaquinha da outra. Nao viaja no QR.
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

/// `#/components/schemas/TagResolution/properties/viewer` do contrato.
///
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
///
/// **Ele le o corpo inteiro, e a razao e de produto.** Ate 22/09 esta classe
/// lia quatro campos de dez: `viewer`, `display_name`, `species` e `is_lost`.
/// O servidor mandava `breed_label`, `size`, `primary_color`,
/// `distinctive_marks`, `care_notes`, `since` e `already_notified`, e o
/// desserializador os jogava fora antes de qualquer tela poder pedi-los. Quem
/// esta com o animal no colo precisa da linha de sinais para confirmar que e o
/// mesmo bicho (F4.1, item 3) e do cartao de manejo para saber o que fazer
/// agora (F4.1, item 4); nenhum dos dois se reconstroi no aparelho.
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

  /// `pet.size`. Obrigatorio no contrato; nulo aqui so quando vier um valor
  /// que este build nao conhece, e ai a linha de sinais o omite em vez de
  /// quebrar.
  final Porte? porte;

  /// `pet.primary_color`.
  final String? corPrincipal;

  /// `pet.distinctive_marks`.
  final String? sinaisDistintivos;

  /// `pet.care_notes`: o cartao de manejo, **ja redigido pelo tutor**.
  final String? notasDeCuidado;

  /// `pet.photo_url`.
  ///
  /// **Ele vem preenchido desde 18/10, e a tela o desenha.** Ate ali o servidor
  /// mandava `null` fixo nesta rota -- o contrato sempre declarou o campo, e o
  /// exemplo de 200 de `resolveTagCode` sempre trouxe um endereco --, e o
  /// sintoma era o do relato do cliente: escaneou a plaquinha, a tela abriu sem
  /// a foto do pet.
  ///
  /// Continua anulavel, e o nulo continua tendo significado: pet sem foto de
  /// capa pronta. Nesse caso a tela trata a ausencia pela regra 5.4 do design
  /// system e **nunca** promete uma foto que nao vai chegar.
  final String? fotoUrl;

  final bool estaPerdido;

  /// `lost.since`.
  final DateTime? perdidoDesde;

  /// `already_notified`: este mesmo aparelho ja avisou nas ultimas 24 h.
  ///
  /// **Muda o texto do botao de avisar; nao impede avisar de novo.** Enquanto
  /// o botao nao existir no app, ele nao tem onde aparecer -- e continua sendo
  /// lido, para nao se perder de novo no desserializador.
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
///
/// **Nao ha identificador interno aqui, e a ausencia e do contrato** (SEC-001):
/// devolver UUIDv7 a quem nao tem conta entregaria de graca o instante de
/// criacao e a posicao do registro na base. Quem endereca e a URL; quem
/// autoriza e o token.
class AvisoDoAchadorCriado {
  const AvisoDoAchadorCriado({
    required this.tokenDoAchador,
    required this.urlDaConversa,
    required this.tutorAvisado,
    this.nomeDoPet,
  });

  /// `finder_token`: o que deixa o achador **sem conta** voltar a conversa.
  ///
  /// **Este build nao o persiste, e isso esta declarado no relatorio da
  /// entrega em vez de escondido aqui.** Guardar um token que nada le seria
  /// codigo morto carregando credencial em disco; a tela de conversa do
  /// achador nao existe neste app. Quem construir essa tela persiste o token
  /// junto, e nao depois.
  final String tokenDoAchador;

  /// `conversation_url`: o endereco da conversa mediada, montado pelo servidor.
  final String urlDaConversa;

  /// `owner_notified` — **verdadeiro so quando a entrega ao tutor foi
  /// enfileirada**.
  ///
  /// O paragrafo que estava aqui dizia que falso significa apenas "agrupado a
  /// um aviso recente" e que a tela "continua dizendo que o tutor foi avisado,
  /// porque foi". **Nao foi.** Medido em 18/10/2026: o servidor devolvia
  /// `true` em todo primeiro escaneamento e nenhuma entrega era enfileirada --
  /// o unico push emitido em producao e o alerta de vizinhanca. Quem achou o
  /// animal lia que o tutor foi avisado e soltava o bicho.
  ///
  /// **Falso continua NAO significando que o aviso se perdeu**: o registro
  /// existe e o tutor o encontra ao abrir o aplicativo. O que falso diz e que
  /// ninguem garante que o telefone dele apitou, e a tela precisa dizer
  /// exatamente isso -- nem mais, nem menos.
  final bool tutorAvisado;

  /// `pet_display_name`. Opcional no contrato.
  final String? nomeDoPet;

  factory AvisoDoAchadorCriado.doJson(Map<String, dynamic> json) {
    return AvisoDoAchadorCriado(
      tokenDoAchador: json['finder_token'] as String? ?? '',
      urlDaConversa: json['conversation_url'] as String? ?? '',
      // **O ausente vale FALSO**, e o padrao era `true`. Um corpo que nao
      // trouxe o campo nao autoriza a tela a prometer que o tutor foi
      // avisado: na duvida, a frase que nao faz ninguem soltar o animal.
      tutorAvisado: json['owner_notified'] as bool? ?? false,
      nomeDoPet: json['pet_display_name'] as String?,
    );
  }
}

/// A resposta de `GET /tags/{code}/owner-context` (`TagOwnerContext`).
///
/// **Os dois identificadores internos da tag, e eles so saem por `bearerAuth`.**
/// Eles vivem numa rota propria, e nao dentro de `TagResolution`, porque
/// `GET /tags/{code}` tem caminho anonimo: enquanto `pet_id` e `tag_id`
/// moraram no corpo daquela operacao, estavam protegidos apenas por uma frase
/// de descricao (ADR-0010 item 6; SEC-001).
///
/// **Custa uma ida a mais so no caminho do dono**, que e o raro: quem escaneia
/// a plaquinha na rua e um estranho, e para ele esta rota nunca e chamada.
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
///
/// **Dado pessoal, e o minimo para entregar.** Sem documento e sem data de
/// nascimento. O telefone entrou em 17/10 por decisao do cliente: a
/// transportadora costuma exigir um para entregar.
///
/// **Nenhum campo vira coordenada** (ADR-0006): nao ha latitude, nao ha
/// longitude e nada aqui e geocodificado. O CEP **preenche** rua, bairro,
/// cidade e estado desde 17/10, por decisao do cliente, e isso e TEXTO --
/// quem busca e `api/busca_de_cep.dart`, e o que vem de la a pessoa pode
/// corrigir inteiro.
///
/// O `uf` e a sigla de dois caracteres. A lista dos 27 nomes vive em
/// `estados_brasileiros.dart`, e e ela que o formulario mostra; o que viaja e
/// a sigla.
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

  /// **E.164**, `+55` e 10 ou 11 digitos, como o contrato exige. Obrigatorio:
  /// transportadora costuma precisar dele para entregar.
  final String telefone;

  /// O endereco que o SERVIDOR devolveu, ou `null` quando nao ha nenhum.
  ///
  /// **Para o endereco GUARDADO NA CONTA** (`getMyDeliveryAddress`,
  /// `putMyDeliveryAddress`, autorizados pelo cliente em 21/10/2026). Nasceu
  /// porque o formulario da plaquinha passou a abrir preenchido com ele, e um
  /// segundo modelo de endereco no app seria a segunda redacao do mesmo
  /// endereco -- os nove campos sao os MESMOS, e [paraJson] e a volta exata
  /// desta funcao.
  ///
  /// **`null` nao e erro.** `getMyDeliveryAddress` devolve corpo `null` quando
  /// a conta nunca guardou endereco, que e o estado normal de quem nunca abriu
  /// a tela -- e nele o formulario se comporta como antes desta leitura
  /// existir. Mesma forma de `getMyLocation`.
  ///
  /// `complement` ausente e `complement` nulo viram a MESMA coisa (nulo): o
  /// contrato o declara opcional, e distinguir "campo que sumiu" de "sem
  /// complemento" nao serviria a nenhuma tela.
  static EnderecoDeEntrega? doJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final complemento = json['complement'] as String?;
    return EnderecoDeEntrega(
      destinatario: json['recipient_name'] as String? ?? '',
      // Sem mascara, como o contrato o declara. A mascara e da tela, e
      // `MascaraDeCep` a aplica quando o valor entra no campo.
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
///
/// **Solicitar nao e emitir.** [TagEmitida] e o CODIGO, irreversivel
/// (ADR-0004) e visivel uma unica vez; este e o pedido do PLASTICO, e ele nao
/// carrega codigo nenhum.
///
/// Sem `ref` e sem identificador: o `ref` serve ao caminho do painel, e o
/// contrato nao o projeta para o app (ADR-0010 item 6).
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
  ///
  /// **Nunca gerado aqui.** Ele e o mesmo `ref` de 128 bits que a fila do
  /// painel usa, e e o numero que a pessoa tem para falar sobre o pedido
  /// dela. Um identificador inventado no app nao serviria para nada: ninguem
  /// do outro lado saberia procura-lo.
  final String ref;

  /// `pending`, `fulfilled` ou `declined`, como o contrato os escreve.
  ///
  /// **Texto e nao enum**, de proposito: a fila do painel pode ganhar estados
  /// de entrega, e um enum fechado faria uma versao antiga do app quebrar ao
  /// receber um valor que ainda nao conhece. Quem traduz para passo de tela e
  /// `AcompanhamentoDoPedido`, com um ramo explicito para o desconhecido.
  final String status;

  final DateTime? solicitadoEm;

  /// Quando o painel decidiu, ou nulo enquanto ninguem decidiu.
  final DateTime? decididoEm;

  /// O PASSO DA ENTREGA: `requested`, `in_transit` ou `arrived`.
  ///
  /// **E este campo que a tela desenha, e nao [status].** Os dois sao eixos
  /// diferentes: [status] e a DECISAO do painel (atender ou recusar) e este e
  /// ONDE A ENCOMENDA ESTA. Desenhar o trilho a partir de [status] faria o
  /// pedido atendido parecer entregue no instante em que alguem clicou em
  /// "atender", muito antes de a plaquinha sair.
  ///
  /// **Texto e nao enum**, pelo mesmo motivo de [status]: um valor novo numa
  /// versao futura do painel nao pode quebrar o app que ja esta no aparelho.
  ///
  /// **Padrao `requested` e nao nulo**: a coluna do banco e
  /// `NOT NULL DEFAULT 'requested'`, entao todo pedido tem um passo escrito --
  /// inclusive os criados antes de a entrega existir -- e a tela nao tem nulo
  /// a tratar. Resposta antiga sem a chave cai no mesmo lugar.
  final String passoDaEntrega;

  /// O codigo de rastreio da transportadora, quando existir.
  ///
  /// **Vem PREENCHIDO quando ha despacho com rastreio.** Ate 18/10/2026 nao
  /// havia coluna que o guardasse e este campo era sempre nulo; a migracao
  /// `20261018000004` criou a coluna e a tela de entrega do painel a escreve.
  /// Nulo continua sendo o caso comum e NAO e defeito: nem todo envio tem
  /// rastreio, e nenhum pedido tem rastreio antes de sair. A tela so o desenha
  /// quando ele vem preenchido -- campo de rastreio vazio e pior que nenhum.
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
    // `tracking_code` vazio conta como ausente: um codigo em branco nao e um
    // codigo, e deixa-lo passar faria a tela desenhar um campo vazio.
    final rastreio = json['tracking_code'] as String?;
    final despachado = json['shipped_at'];
    final entregue = json['delivered_at'];
    // `delivery_state` ausente cai em `requested`, que e o passo INICIAL: o
    // contrato o declara `NOT NULL DEFAULT 'requested'` do lado do banco, e
    // supor "chegou" na ausencia seria a tela afirmando uma entrega.
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
