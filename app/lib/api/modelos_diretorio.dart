import '../formato/cep.dart';
import 'falhas.dart';

/// `#/components/schemas/ProfessionalKind` do contrato.
enum AtividadeDoDiretorio {
  vet('vet', 'Veterinário'),
  groomer('groomer', 'Banho e tosa'),
  walker('walker', 'Dog Walker'),
  sitter('sitter', 'Pet Sitter'),
  trainer('trainer', 'Adestrador'),
  clinic('clinic', 'Clínica'),
  hospital('hospital', 'Hospital'),
  store('store', 'Loja'),
  boarding('boarding', 'Hospedagem'),
  daycare('daycare', 'Creche');

  const AtividadeDoDiretorio(this.codigo, this.rotulo);

  /// O valor que vai e volta na API.
  final String codigo;

  /// O nome em portugues, que e o que a tela mostra.
  final String rotulo;

  static AtividadeDoDiretorio? porCodigo(String? codigo) {
    for (final a in AtividadeDoDiretorio.values) {
      if (a.codigo == codigo) return a;
    }
    return null;
  }
}

/// `#/components/schemas/EntityKind` do contrato.
enum TipoDeEntidade {
  profissional('professional', 'Profissional ou estabelecimento'),
  organizacao('organization', 'ONG');

  const TipoDeEntidade(this.codigo, this.rotulo);

  /// O valor que vai e volta na API.
  final String codigo;

  /// O nome em portugues, que e o que a tela mostra.
  final String rotulo;

  /// O tipo, ou **nulo** para campo ausente, de outro tipo ou de valor que esta
  /// versao do app nao conhece.
  static TipoDeEntidade? porCodigo(Object? codigo) {
    if (codigo is! String) return null;
    for (final t in TipoDeEntidade.values) {
      if (t.codigo == codigo) return t;
    }
    return null;
  }
}

/// `#/components/schemas/VerificationLevel` do contrato.
enum NivelDeVerificacao {
  nenhum('none', 'Sem verificação', 0),
  contato('contact_verified', 'Contato verificado', 1),
  documento('document_verified', 'Documento verificado', 2);

  const NivelDeVerificacao(this.codigo, this.rotulo, this.forca);

  final String codigo;
  final String rotulo;

  /// A ordem do piso. O filtro do contrato e **piso, nao igualdade**:
  /// `contact_verified` traz tambem `document_verified`.
  final int forca;

  static NivelDeVerificacao porCodigo(String? codigo) {
    for (final n in NivelDeVerificacao.values) {
      if (n.codigo == codigo) return n;
    }
    return NivelDeVerificacao.nenhum;
  }
}

/// `#/components/schemas/EvidenceKind` do contrato.
enum TipoDeProva {
  crmv('crmv', 'CRMV'),
  cnpj('cnpj', 'CNPJ'),
  retornoDeLigacao('phone_callback', 'telefone confirmado por ligação'),
  documento('document', 'documento');

  const TipoDeProva(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static TipoDeProva? porCodigo(String? codigo) {
    for (final p in TipoDeProva.values) {
      if (p.codigo == codigo) return p;
    }
    return null;
  }
}

/// O que sustenta o selo: o nivel **e a lista do que foi provado**.
class VerificacaoDaEntrada {
  const VerificacaoDaEntrada({required this.nivel, required this.provas});

  final NivelDeVerificacao nivel;
  final List<TipoDeProva> provas;

  /// A frase que a tela mostra, ou nulo quando nao ha o que dizer.
  String? get oQueFoiVerificado {
    if (nivel == NivelDeVerificacao.nenhum) return null;
    if (provas.isEmpty) return null;
    return 'Verificado: ${provas.map((p) => p.rotulo).join(', ')}';
  }

  static VerificacaoDaEntrada doJson(Object? bruto) {
    if (bruto is! Map) {
      return const VerificacaoDaEntrada(
        nivel: NivelDeVerificacao.nenhum,
        provas: <TipoDeProva>[],
      );
    }
    final lista = bruto['evidence_kinds'];
    final provas = <TipoDeProva>[];
    if (lista is List) {
      for (final item in lista) {
        final prova = TipoDeProva.porCodigo(item is String ? item : null);
        if (prova != null) provas.add(prova);
      }
    }
    return VerificacaoDaEntrada(
      nivel: NivelDeVerificacao.porCodigo(bruto['level'] as String?),
      provas: List<TipoDeProva>.unmodifiable(provas),
    );
  }
}

/// Uma entrada do diretorio — o cartao da listagem.
class EntradaDoDiretorio {
  const EntradaDoDiretorio({
    required this.slug,
    required this.atividade,
    required this.nome,
    required this.verificacao,
    this.tipoDeEntidade,
    this.cidade,
    this.estado,
    this.bairro,
    this.sobre,
    this.telefoneE164,
    this.distanciaEmMetros,
    this.pontuacao,
    this.logoUrl,
  });

  /// A chave. **Nao existe `id`.**
  final String slug;

  final AtividadeDoDiretorio? atividade;
  final String nome;
  final VerificacaoDaEntrada verificacao;

  /// `entity_kind`: **o QUE a entrada e**, ao lado de [atividade], que e o que
  /// ela faz.
  final TipoDeEntidade? tipoDeEntidade;

  final String? cidade;
  final String? estado;
  final String? bairro;
  final String? sobre;

  /// Telefone **comercial**, publicado de proposito pela entidade.
  final String? telefoneE164;

  /// Distancia ate a localizacao de referencia de quem chama, arredondada a 100
  /// m.
  final int? distanciaEmMetros;

  /// A pontuacao agregada do local, **ou nulo**.
  final PontuacaoDoLocal? pontuacao;

  /// A URL da **derivada** da logo da entidade, ou nulo (cliente, 18/10/2026:
  /// *"pode liberar as imagens do profissional no app"*).
  final String? logoUrl;

  static EntradaDoDiretorio doJson(Map<String, dynamic> json) {
    final slug = json['slug'];
    if (slug is! String || slug.isEmpty) {
      throw const FormatException(
        'GET /directory/entries devolveu item sem `slug`. O contrato declara '
        'o campo como obrigatorio (api/openapi.yaml, DirectoryEntrySummary), '
        'e o `slug` e a chave da entrada: nao existe `id`.',
      );
    }
    final nome = json['display_name'];
    if (nome is! String || nome.isEmpty) {
      throw const FormatException(
        'GET /directory/entries devolveu item sem `display_name`. O contrato '
        'declara o campo como obrigatorio.',
      );
    }
    final distancia = json['distance_m'];
    return EntradaDoDiretorio(
      slug: slug,
      nome: nome,
      atividade: AtividadeDoDiretorio.porCodigo(json['kind'] as String?),
      verificacao: VerificacaoDaEntrada.doJson(json['verification']),
      tipoDeEntidade: TipoDeEntidade.porCodigo(json['entity_kind']),
      cidade: json['city'] as String?,
      estado: json['state'] as String?,
      bairro: json['neighborhood'] as String?,
      sobre: json['about'] as String?,
      telefoneE164: json['phone_e164'] as String?,
      distanciaEmMetros: distancia is num ? distancia.round() : null,
      pontuacao: PontuacaoDoLocal.opcional(json['rating']),
      logoUrl: urlDeImagem(json['logo_url']),
    );
  }
}

/// A linha de lugar de uma entrada: bairro, cidade e UF, **sem separador
/// orfao**.
String? urlDeImagem(Object? bruto) {
  if (bruto is! String) return null;
  final limpo = bruto.trim();
  return limpo.isEmpty ? null : limpo;
}

String? linhaDeLugarDe({String? bairro, String? cidade, String? estado}) {
  final partes = <String>[
    if (bairro != null && bairro.isNotEmpty) bairro,
    if (cidade != null && cidade.isNotEmpty) cidade,
    if (estado != null && estado.isNotEmpty) estado,
  ];
  if (partes.isEmpty) return null;
  return partes.join(' · ');
}

/// `#/paths/~1directory~1entries/get/parameters/6/schema` do contrato.
enum OrdemDoDiretorio {
  distancia('distance', 'Mais perto'),
  nome('name', 'Nome');

  const OrdemDoDiretorio(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static OrdemDoDiretorio porCodigo(String? codigo) {
    for (final o in OrdemDoDiretorio.values) {
      if (o.codigo == codigo) return o;
    }
    return OrdemDoDiretorio.distancia;
  }
}

/// Uma pagina do diretorio.
class PaginaDoDiretorio {
  const PaginaDoDiretorio({
    required this.itens,
    required this.pagina,
    required this.limite,
    required this.total,
    required this.distanciaDisponivel,
    required this.filtrosAplicados,
  });

  final List<EntradaDoDiretorio> itens;
  final int pagina;
  final int limite;
  final int total;

  /// **Falso significa que a lista saiu ordenada por NOME.**
  final bool distanciaDisponivel;

  /// O recorte que de fato valeu.
  final Map<String, String> filtrosAplicados;

  /// A ordem em que esta pagina **de fato** esta, e nao a que foi pedida.
  OrdemDoDiretorio get ordemEfetiva =>
      distanciaDisponivel ? OrdemDoDiretorio.distancia : OrdemDoDiretorio.nome;

  static PaginaDoDiretorio doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException(
        'GET /directory/entries respondeu sem `items`. O contrato declara o '
        'campo como obrigatorio (api/openapi.yaml, DirectoryEntryPage).',
      );
    }
    final disponivel = json['distance_available'];
    if (disponivel is! bool) {
      throw const FormatException(
        'GET /directory/entries respondeu sem `distance_available`. O contrato '
        'declara o campo como obrigatorio, e ele e o que diz se a lista saiu '
        'por distancia ou por nome. Sem ele a tela nao tem como ser honesta '
        'sobre a ordem, e assumir um valor seria escolher a mentira barata.',
      );
    }
    final filtros = json['applied_filters'];
    return PaginaDoDiretorio(
      itens: List<EntradaDoDiretorio>.unmodifiable(
        itens
            .whereType<Map<String, dynamic>>()
            .map(EntradaDoDiretorio.doJson)
            .toList(growable: false),
      ),
      pagina: (json['page'] as num?)?.toInt() ?? 1,
      limite: (json['limit'] as num?)?.toInt() ?? itens.length,
      total: (json['total'] as num?)?.toInt() ?? itens.length,
      distanciaDisponivel: disponivel,
      filtrosAplicados: <String, String>{
        if (filtros is Map)
          for (final par in filtros.entries)
            if (par.key is String && par.value is String)
              par.key as String: par.value as String,
      },
    );
  }
}

/// O recorte pedido pela tela.
class RecorteDoDiretorio {
  const RecorteDoDiretorio({
    this.termo,
    this.atividade,
    this.nivelMinimo,
    this.cidade,
    this.bairro,
    this.ordem = OrdemDoDiretorio.distancia,
    this.pagina = 1,
    this.limite = 20,
  });

  /// O termo da busca por NOME, ou nulo.
  final String? termo;

  /// O termo como ele vai para a rota, ou nulo quando ele nao vai.
  String? get termoQueVai {
    final limpo = termo?.trim();
    if (limpo == null || limpo.length < 3) return null;
    return limpo;
  }

  final AtividadeDoDiretorio? atividade;

  /// **Piso, nao igualdade.** `contato` traz tambem `documento`.
  final NivelDeVerificacao? nivelMinimo;

  /// A CIDADE do recorte, ou nulo.
  final String? cidade;

  /// A cidade como ela vai para a rota, ou nulo quando ela nao vai.
  String? get cidadeQueVai {
    final limpo = cidade?.trim();
    if (limpo == null || limpo.length < 2) return null;
    return limpo;
  }

  /// O BAIRRO do recorte, ou nulo (BICHUS-315, 28/10/2026).
  final String? bairro;

  /// O bairro como ele vai para a rota, ou nulo quando ele nao vai.
  String? get bairroQueVai {
    final limpo = bairro?.trim();
    if (limpo == null || limpo.length < 2) return null;
    return limpo;
  }

  final OrdemDoDiretorio ordem;
  final int pagina;

  /// O contrato fixa o teto em 20.
  final int limite;

  /// Quantos recortes de conteudo estao ativos.
  int get quantidadeDeFiltros =>
      (atividade == null ? 0 : 1) +
      (nivelMinimo == null || nivelMinimo == NivelDeVerificacao.nenhum
          ? 0
          : 1) +
      (bairroQueVai == null ? 0 : 1);

  RecorteDoDiretorio com({
    String? termo,
    AtividadeDoDiretorio? atividade,
    NivelDeVerificacao? nivelMinimo,
    String? cidade,
    String? bairro,
    OrdemDoDiretorio? ordem,
    int? pagina,
    bool limparAtividade = false,
    bool limparNivel = false,
    bool limparTermo = false,
    bool limparCidade = false,
    bool limparBairro = false,
  }) {
    return RecorteDoDiretorio(
      termo: limparTermo ? null : (termo ?? this.termo),
      atividade: limparAtividade ? null : (atividade ?? this.atividade),
      nivelMinimo: limparNivel ? null : (nivelMinimo ?? this.nivelMinimo),
      bairro: limparBairro ? null : (bairro ?? this.bairro),
      cidade: limparCidade ? null : (cidade ?? this.cidade),
      ordem: ordem ?? this.ordem,
      pagina: pagina ?? this.pagina,
      limite: limite,
    );
  }

  Map<String, String> get query => <String, String>{
        'q': ?termoQueVai,
        'city': ?cidadeQueVai,
        'neighborhood': ?bairroQueVai,
        if (atividade != null) 'kind': atividade!.codigo,
        if (nivelMinimo != null && nivelMinimo != NivelDeVerificacao.nenhum)
          'verification_level': nivelMinimo!.codigo,
        'sort': ordem.codigo,
        'page': '$pagina',
        'limit': '$limite',
      };

  /// A consulta da rota PUBLICA (`listPublicDirectoryEntries`): a mesma, **sem
  /// `sort`**.
  Map<String, String> get queryPublica =>
      Map<String, String>.of(query)..remove('sort');
}

/// Traduz a falha de `listDirectoryEntries` que **so esta rota tem**.
String? textoDoTetoDoDiretorio(FalhaDeChamada falha) {
  if (falha is! FalhaDaApi) return null;
  if (falha.problem.status != 429) return null;
  return 'Você consultou o diretório muitas vezes seguidas. '
      'Tente de novo daqui a pouco.';
}

/// `#/components/schemas/DirectorySuggestionContactKind` do contrato.
enum TipoDeContatoPublico {
  phone('phone', 'Telefone', 'Com DDD, como +5511988887777'),
  website('website', 'Site', 'O endereço completo, com https://'),
  instagram('instagram', 'Instagram', 'O perfil, com @');

  const TipoDeContatoPublico(this.codigo, this.rotulo, this.exemplo);

  /// O valor que vai na API.
  final String codigo;

  /// O nome em portugues, que e o que a tela mostra.
  final String rotulo;

  /// A ajuda do campo, que depende do tipo escolhido.
  final String exemplo;

  static TipoDeContatoPublico? porCodigo(String? codigo) {
    for (final t in TipoDeContatoPublico.values) {
      if (t.codigo == codigo) return t;
    }
    return null;
  }
}

/// `#/components/schemas/DirectorySuggestionState` do contrato.
enum EstadoDaSugestao {
  pending('pending'),
  approved('approved'),
  declined('declined');

  const EstadoDaSugestao(this.codigo);

  final String codigo;

  static EstadoDaSugestao? porCodigo(String? codigo) {
    for (final e in EstadoDaSugestao.values) {
      if (e.codigo == codigo) return e;
    }
    return null;
  }
}

/// `#/components/schemas/DirectorySuggestionReceipt` do contrato.
class ReciboDaSugestao {
  const ReciboDaSugestao({
    required this.referencia,
    required this.estado,
    required this.criadaEm,
  });

  /// O identificador opaco, 128 bits em base64url.
  final String referencia;

  final EstadoDaSugestao estado;

  final DateTime criadaEm;

  factory ReciboDaSugestao.doJson(Map<String, dynamic> json) {
    final referencia = json['reference'];
    final estado = EstadoDaSugestao.porCodigo(json['state'] as String?);
    final criadaEm = DateTime.tryParse(json['created_at'] as String? ?? '');
    if (referencia is! String || referencia.isEmpty) {
      throw const FormatException('sugestao sem `reference`');
    }
    if (estado == null) {
      throw const FormatException('sugestao com `state` desconhecido');
    }
    if (criadaEm == null) {
      throw const FormatException('sugestao sem `created_at` legivel');
    }
    return ReciboDaSugestao(
      referencia: referencia,
      estado: estado,
      criadaEm: criadaEm,
    );
  }
}

/// `#/components/schemas/DirectoryRating` do contrato.
class PontuacaoDoLocal {
  const PontuacaoDoLocal({
    required this.media,
    required this.quantidade,
    required this.histograma,
  });

  /// A media das notas publicadas, **com uma casa decimal, arredondada pelo
  /// servidor**.
  final double? media;

  /// Quantas avaliacoes publicadas o local tem.
  final int quantidade;

  /// Quantas avaliacoes em cada nota, de 1 a 5.
  final Map<int, int> histograma;

  /// Ha avaliacao a mostrar. Falso leva ao estado zero, que **nao tem media e
  /// nao tem estrela**.
  bool get temAvaliacoes => quantidade > 0;

  /// A media como a tela escreve: uma casa e **virgula** decimal.
  String? get mediaEmTexto {
    final valor = media;
    if (valor == null) return null;
    return valor.toStringAsFixed(1).replaceAll('.', ',');
  }

  /// `128 avaliações`, no plural e no singular.
  String get quantidadeEmTexto =>
      quantidade == 1 ? '1 avaliação' : '$quantidade avaliações';

  /// Quantas avaliacoes tem a nota [nota].
  int quantasNaNota(int nota) => histograma[nota] ?? 0;

  /// A fracao da barra de [nota] no histograma, de 0 a 1.
  double fracaoDaNota(int nota) {
    if (quantidade <= 0) return 0;
    return quantasNaNota(nota) / quantidade;
  }

  static const List<int> notasDeCimaParaBaixo = <int>[5, 4, 3, 2, 1];

  /// O rotulo acessivel de uma barra: `4 estrelas: 26 de 128 avaliações`.
  String rotuloDaBarra(int nota) {
    final quantas = quantasNaNota(nota);
    final estrelas = nota == 1 ? '1 estrela' : '$nota estrelas';
    return '$estrelas: $quantas de $quantidade';
  }

  /// A pontuacao de um corpo obrigatorio (`DirectoryEntryDetail.rating` e
  /// `DirectoryReviewWritten.rating`).
  static PontuacaoDoLocal doJson(Object? bruto) {
    if (bruto is! Map) {
      throw const FormatException(
        'A resposta trouxe `rating` que nao e objeto. O contrato declara o '
        'campo como obrigatorio em `DirectoryEntryDetail` e em '
        '`DirectoryReviewWritten` (api/openapi.yaml).',
      );
    }
    final quantidade = bruto['count'];
    if (quantidade is! num) {
      throw const FormatException(
        '`rating` sem `count`. O contrato declara o campo como obrigatorio, e '
        'ele e o que distingue "ainda sem avaliacoes" de "nao consegui '
        'agregar": assumir zero aqui apagaria a diferenca.',
      );
    }
    final media = bruto['average'];
    final histograma = bruto['histogram'];
    return PontuacaoDoLocal(
      media: media is num ? media.toDouble() : null,
      quantidade: quantidade.toInt(),
      histograma: Map<int, int>.unmodifiable(<int, int>{
        for (final nota in <int>[1, 2, 3, 4, 5])
          nota: histograma is Map && histograma['$nota'] is num
              ? (histograma['$nota'] as num).toInt()
              : 0,
      }),
    );
  }

  /// A pontuacao de um campo **opcional** (`DirectoryEntrySummary.rating`).
  static PontuacaoDoLocal? opcional(Object? bruto) {
    if (bruto is! Map) return null;
    if (bruto['count'] is! num) return null;
    return doJson(bruto);
  }
}

/// `#/components/schemas/DirectoryEntryDetail/properties/review_blocked_reason`.
enum MotivoDeNaoPoderAvaliar {
  /// Conta sem e-mail confirmado.
  canalNaoVerificado('unverified_channel');

  const MotivoDeNaoPoderAvaliar(this.codigo);

  final String codigo;

  static MotivoDeNaoPoderAvaliar? porCodigo(String? codigo) {
    for (final m in MotivoDeNaoPoderAvaliar.values) {
      if (m.codigo == codigo) return m;
    }
    return null;
  }
}

/// O ENDERECO COMERCIAL da entrada: os quatro campos de `DirectoryEntryDetail`
/// (cliente, 21/10/2026).
class EnderecoComercialDaEntrada {
  const EnderecoComercialDaEntrada({
    this.cep,
    this.logradouro,
    this.numero,
    this.complemento,
  });

  /// `postal_code`: oito digitos **sem mascara**, como o servidor o guarda.
  final String? cep;
  final String? logradouro;

  /// `street_number`: **texto e nao inteiro**.
  final String? numero;

  /// `complement`: sala, loja, andar ou bloco.
  final String? complemento;

  static const EnderecoComercialDaEntrada vazio = EnderecoComercialDaEntrada();

  static String? _limpo(Object? bruto) {
    if (bruto is! String) return null;
    final texto = bruto.trim();
    return texto.isEmpty ? null : texto;
  }

  /// Os quatro campos de um corpo de `DirectoryEntryDetail`.
  static EnderecoComercialDaEntrada doJson(Map<String, dynamic> json) {
    return EnderecoComercialDaEntrada(
      cep: _limpo(json['postal_code']),
      logradouro: _limpo(json['street']),
      numero: _limpo(json['street_number']),
      complemento: _limpo(json['complement']),
    );
  }

  /// **Ha endereco de rua para mostrar?**
  bool get temEnderecoDeRua => logradouro != null;

  /// A linha que a pagina escreve: `Rua Teodoro Sampaio, 1020 - Sala 3`, e o
  /// CEP mascarado depois, quando ha.
  String? get porExtenso {
    final rua = logradouro;
    if (rua == null) return null;
    final comNumero = numero == null ? rua : '$rua, $numero';
    final comComplemento =
        complemento == null ? comNumero : '$comNumero - $complemento';
    final digitos = cep;
    if (digitos == null) return comComplemento;
    return '$comComplemento · CEP ${mascaraDeCep(digitos)}';
  }

  /// O TEXTO que vai para o aplicativo de mapas.
  String? textoParaBuscaNoMapa({
    String? bairro,
    String? cidade,
    String? estado,
  }) {
    final rua = logradouro;
    if (rua == null) return null;
    final partes = <String>[
      numero == null ? rua : '$rua, $numero',
      if (bairro != null && bairro.isNotEmpty) bairro,
      if (cidade != null && cidade.isNotEmpty) cidade,
      if (estado != null && estado.isNotEmpty) estado,
      if (cep != null) mascaraDeCep(cep!),
    ];
    return partes.join(' - ');
  }
}

/// `#/components/schemas/DirectoryEntryDetail` do contrato — a pagina do local.
class DetalheDoLocal {
  const DetalheDoLocal({
    required this.slug,
    required this.atividade,
    required this.nome,
    required this.verificacao,
    required this.pontuacao,
    required this.podeAvaliar,
    this.atividades = const <AtividadeDoDiretorio>[],
    this.tipoDeEntidade,
    this.cidade,
    this.estado,
    this.bairro,
    this.sobre,
    this.telefoneE164,
    this.distanciaEmMetros,
    this.minhaAvaliacaoRef,
    this.motivoDeNaoPoderAvaliar,
    this.logoUrl,
    this.fotoUrl,
    this.endereco = EnderecoComercialDaEntrada.vazio,
  });

  final String slug;
  final AtividadeDoDiretorio? atividade;
  final String nome;
  final VerificacaoDaEntrada verificacao;

  /// **TODAS as atividades da entrada**, na ordem em que o servidor as manda.
  final List<AtividadeDoDiretorio> atividades;

  /// `entity_kind`: **o QUE a entrada e**, ao lado de [atividade], que e o que
  /// ela faz.
  final TipoDeEntidade? tipoDeEntidade;

  final String? cidade;
  final String? estado;
  final String? bairro;
  final String? sobre;

  /// Telefone **comercial** (ADR-0011 secao 4), e a unica acao de contato que a
  /// pagina oferece.
  final String? telefoneE164;

  /// Arredondada a 100 m, a grade do ADR-0006.
  final int? distanciaEmMetros;

  final PontuacaoDoLocal pontuacao;

  /// O `ref` da MINHA avaliacao deste local, ou nulo se eu nao avaliei.
  final String? minhaAvaliacaoRef;

  /// **Se EU posso avaliar agora**, e nao se a funcionalidade existe.
  final bool podeAvaliar;

  /// Por que [podeAvaliar] e falso.
  final MotivoDeNaoPoderAvaliar? motivoDeNaoPoderAvaliar;

  /// A URL da **derivada** da logo da entidade, ou nulo (cliente, 18/10/2026:
  /// *"pode liberar as imagens do profissional no app"*).
  final String? logoUrl;

  /// A URL da **derivada** da foto do lugar -- fachada ou ambiente --, ou nulo.
  final String? fotoUrl;

  /// O ENDERECO COMERCIAL (cliente, 21/10/2026): CEP, logradouro, numero e
  /// complemento.
  final EnderecoComercialDaEntrada endereco;

  /// A linha de lugar: bairro, cidade e UF, sem separador orfao.
  String? get linhaDeLugar =>
      linhaDeLugarDe(bairro: bairro, cidade: cidade, estado: estado);

  /// Eu ja avaliei este local.
  bool get jaAvaliei => minhaAvaliacaoRef != null;

  static DetalheDoLocal doJson(Map<String, dynamic> json) {
    final slug = json['slug'];
    if (slug is! String || slug.isEmpty) {
      throw const FormatException(
        'GET /directory/entries/{slug} respondeu sem `slug`. O contrato '
        'declara o campo como obrigatorio (DirectoryEntryDetail), e o `slug` e '
        'a chave da entrada: nao existe `id`.',
      );
    }
    final nome = json['display_name'];
    if (nome is! String || nome.isEmpty) {
      throw const FormatException(
        'GET /directory/entries/{slug} respondeu sem `display_name`. O '
        'contrato declara o campo como obrigatorio.',
      );
    }
    final distancia = json['distance_m'];
    final pode = json['can_review'];
    return DetalheDoLocal(
      slug: slug,
      nome: nome,
      atividade: AtividadeDoDiretorio.porCodigo(json['kind'] as String?),
      atividades: _atividadesDoJson(json),
      verificacao: VerificacaoDaEntrada.doJson(json['verification']),
      pontuacao: PontuacaoDoLocal.doJson(json['rating']),
      podeAvaliar: pode is bool ? pode : false,
      motivoDeNaoPoderAvaliar: MotivoDeNaoPoderAvaliar.porCodigo(
        json['review_blocked_reason'] as String?,
      ),
      minhaAvaliacaoRef: json['my_review_ref'] as String?,
      tipoDeEntidade: TipoDeEntidade.porCodigo(json['entity_kind']),
      cidade: json['city'] as String?,
      estado: json['state'] as String?,
      bairro: json['neighborhood'] as String?,
      sobre: json['about'] as String?,
      telefoneE164: json['phone_e164'] as String?,
      distanciaEmMetros: distancia is num ? distancia.round() : null,
      logoUrl: urlDeImagem(json['logo_url']),
      fotoUrl: urlDeImagem(json['photo_url']),
      endereco: EnderecoComercialDaEntrada.doJson(json),
    );
  }

  static List<AtividadeDoDiretorio> _atividadesDoJson(
    Map<String, dynamic> json,
  ) {
    final bruto = json['kinds'];
    if (bruto is List) {
      final lidas = <AtividadeDoDiretorio>[];
      for (final item in bruto) {
        final atividade = AtividadeDoDiretorio.porCodigo(
          item is String ? item : null,
        );
        if (atividade != null && !lidas.contains(atividade)) {
          lidas.add(atividade);
        }
      }
      return List<AtividadeDoDiretorio>.unmodifiable(lidas);
    }
    return List<AtividadeDoDiretorio>.unmodifiable(<AtividadeDoDiretorio>[
      ?AtividadeDoDiretorio.porCodigo(json['kind'] as String?),
    ]);
  }
}

/// `#/components/schemas/DirectoryReview` do contrato.
class AvaliacaoDoLocal {
  const AvaliacaoDoLocal({
    required this.ref,
    required this.nota,
    required this.criadaEm,
    required this.minha,
    this.texto,
    this.nomeDeQuemEscreveu,
    this.editadaEm,
  });

  /// O identificador opaco da avaliacao, usado pela denuncia.
  final String ref;

  /// A nota, inteira de 1 a 5.
  final int nota;

  /// A recomendacao em texto, ou nulo.
  final String? texto;

  /// O nome de exibicao de quem escreveu, **ou nulo**.
  final String? nomeDeQuemEscreveu;

  final DateTime criadaEm;

  /// Quando o autor editou pela ultima vez, ou nulo se nunca editou.
  final DateTime? editadaEm;

  /// Verdadeiro na avaliacao de quem chama.
  final bool minha;

  /// O nome que a tela escreve.
  static const String semNome = 'Alguém da comunidade';

  String get nomeDeQuemLe {
    final nome = nomeDeQuemEscreveu;
    if (nome == null || nome.trim().isEmpty) return semNome;
    return nome;
  }

  /// A avaliacao foi editada depois de publicada, e a tela **diz isso**.
  bool get foiEditada => editadaEm != null;

  /// A data que a tela mostra: a de edicao quando houve edicao, a de publicacao
  /// quando nao houve.
  String get dataEmTexto {
    final quando = (editadaEm ?? criadaEm).toLocal();
    final dia = quando.day.toString().padLeft(2, '0');
    final mes = quando.month.toString().padLeft(2, '0');
    return '$dia/$mes/${quando.year}';
  }

  /// O rotulo acessivel da nota: `4 de 5 estrelas`.
  String get notaEmTexto => '$nota de 5 estrelas';

  static AvaliacaoDoLocal doJson(Map<String, dynamic> json) {
    final ref = json['ref'];
    if (ref is! String || ref.isEmpty) {
      throw const FormatException(
        'Uma avaliacao chegou sem `ref`. O contrato declara o campo como '
        'obrigatorio (DirectoryReview), e ele e o que a denuncia usa: um item '
        'sem ref teria um botao de denunciar sem destino.',
      );
    }
    final nota = json['rating'];
    if (nota is! num) {
      throw const FormatException(
        'Uma avaliacao chegou sem `rating`. A nota E a avaliacao: o contrato a '
        'declara obrigatoria e nunca nula.',
      );
    }
    final criadaEm = DateTime.tryParse(json['created_at'] as String? ?? '');
    if (criadaEm == null) {
      throw const FormatException(
        'Uma avaliacao chegou sem `created_at` legivel. O contrato declara o '
        'campo como obrigatorio.',
      );
    }
    final texto = json['body'] as String?;
    final minha = json['mine'];
    return AvaliacaoDoLocal(
      ref: ref,
      nota: nota.toInt(),
      criadaEm: criadaEm,
      minha: minha is bool ? minha : false,
      texto: (texto == null || texto.trim().isEmpty) ? null : texto,
      nomeDeQuemEscreveu: json['author_display_name'] as String?,
      editadaEm: DateTime.tryParse(json['edited_at'] as String? ?? ''),
    );
  }
}

/// `#/paths/~1directory~1entries~1{slug}~1reviews/get/parameters/0/schema` — a
/// ordem da lista.
enum OrdemDasAvaliacoes {
  recentes('recent', 'Mais recentes'),
  maiorNota('rating_desc', 'Maior nota'),
  menorNota('rating_asc', 'Menor nota');

  const OrdemDasAvaliacoes(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static OrdemDasAvaliacoes porCodigo(String? codigo) {
    for (final o in OrdemDasAvaliacoes.values) {
      if (o.codigo == codigo) return o;
    }
    return OrdemDasAvaliacoes.recentes;
  }
}

/// `#/components/schemas/DirectoryReviewPage` do contrato.
class PaginaDeAvaliacoes {
  const PaginaDeAvaliacoes({
    required this.itens,
    required this.pagina,
    required this.limite,
    required this.total,
  });

  final List<AvaliacaoDoLocal> itens;
  final int pagina;
  final int limite;

  /// O total de avaliacoes publicadas do local, **o mesmo numero de
  /// [PontuacaoDoLocal.quantidade]**: as duas consultas usam o mesmo recorte.
  final int total;

  static PaginaDeAvaliacoes doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException(
        'GET /directory/entries/{slug}/reviews respondeu sem `items`. O '
        'contrato declara o campo como obrigatorio (DirectoryReviewPage).',
      );
    }
    return PaginaDeAvaliacoes(
      itens: List<AvaliacaoDoLocal>.unmodifiable(
        itens
            .whereType<Map<String, dynamic>>()
            .map(AvaliacaoDoLocal.doJson)
            .toList(growable: false),
      ),
      pagina: (json['page'] as num?)?.toInt() ?? 1,
      limite: (json['limit'] as num?)?.toInt() ?? itens.length,
      total: (json['total'] as num?)?.toInt() ?? itens.length,
    );
  }
}

/// `#/components/schemas/DirectoryReviewWritten` — a resposta do `PUT`.
class AvaliacaoGravada {
  const AvaliacaoGravada({
    required this.avaliacao,
    required this.criada,
    required this.pontuacao,
  });

  final AvaliacaoDoLocal avaliacao;

  /// Verdadeiro quando esta foi a PRIMEIRA avaliacao desta pessoa neste local;
  /// falso quando o envio **atualizou** a que ja existia.
  final bool criada;

  /// A pontuacao do local ja com esta avaliacao dentro.
  final PontuacaoDoLocal pontuacao;

  static AvaliacaoGravada doJson(Map<String, dynamic> json) {
    final avaliacao = json['review'];
    if (avaliacao is! Map<String, dynamic>) {
      throw const FormatException(
        'PUT /directory/entries/{slug}/reviews/me respondeu sem `review`. O '
        'contrato declara o campo como obrigatorio (DirectoryReviewWritten).',
      );
    }
    final criada = json['created'];
    if (criada is! bool) {
      throw const FormatException(
        'PUT /directory/entries/{slug}/reviews/me respondeu sem `created`. O '
        'contrato declara o campo como obrigatorio, e ele e o que escolhe '
        'entre "Avaliacao publicada" e "Avaliacao atualizada": adivinhar '
        'escreveria a frase errada para quem acabou de editar.',
      );
    }
    return AvaliacaoGravada(
      avaliacao: AvaliacaoDoLocal.doJson(avaliacao),
      criada: criada,
      pontuacao: PontuacaoDoLocal.doJson(json['rating']),
    );
  }
}

/// `#/components/schemas/DirectoryReviewReportInput/properties/reason` do
/// contrato.
enum MotivoDaDenuncia {
  spam('spam', 'Spam ou propaganda'),
  ofensiva('offensive', 'Ofensiva ou agressiva'),

  /// O caso que motiva a rota existir: negocio real com nome e endereco, e uma
  /// afirmacao falsa sobre ele tem consequencia fora do app.
  informacaoFalsa('false_information', 'Informação falsa'),

  /// O caso mais comum e mais facil de verificar num diretorio: a pessoa
  /// avaliou o lugar errado.
  naoEDesteLocal('not_about_this_place', 'Não é sobre este local'),
  outro('other', 'Outro motivo');

  const MotivoDaDenuncia(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;
}

/// O corpo de `putMyDirectoryEntryReview`, montado num lugar so.
Map<String, dynamic> corpoDaAvaliacao({required int nota, String? texto}) {
  final limpo = texto?.trim();
  return <String, dynamic>{
    'rating': nota,
    if (limpo != null && limpo.isNotEmpty) 'body': limpo,
  };
}

/// O limite do corpo da avaliacao, **que e o limite da COLUNA e nao um numero
/// de tela**: o `CHECK` em `professional_reviews.body` recusa 1501, e texto
/// maior leva 400.
const int limiteDoTextoDaAvaliacao = 1500;

/// O corpo de `reportDirectoryEntryReview`.
Map<String, dynamic> corpoDaDenuncia({
  required MotivoDaDenuncia motivo,
  String? detalhe,
}) {
  final limpo = detalhe?.trim();
  return <String, dynamic>{
    'reason': motivo.codigo,
    if (limpo != null && limpo.isNotEmpty) 'detail': limpo,
  };
}

/// O limite de `DirectoryReviewReportInput.detail`.
const int limiteDoDetalheDaDenuncia = 1000;

/// `#/components/schemas/MyDirectorySuggestion` do contrato: uma indicacao como
/// **quem a fez** a ve.
class MinhaIndicacao {
  const MinhaIndicacao({
    required this.referencia,
    required this.nome,
    required this.atividade,
    required this.tipoDeEntidade,
    required this.cidade,
    required this.uf,
    required this.tipoDeContato,
    required this.contato,
    required this.estado,
    required this.criadaEm,
    this.bairro,
    this.decididaEm,
    this.motivoDaRecusa,
    this.entradaSlug,
  });

  /// O identificador opaco, 128 bits em base64url.
  final String referencia;

  final String nome;
  final AtividadeDoDiretorio atividade;

  /// O QUE a entidade indicada E -- eixo SEPARADO de [atividade], que e o que
  /// ela FAZ (contrato, 29/10/2026, pedido do cliente: *"esta faltando o campo
  /// se e um profissional, ong ou estabelecimento"*).
  final TipoDeEntidade? tipoDeEntidade;
  final String cidade;
  final String uf;
  final String? bairro;
  final TipoDeContatoPublico tipoDeContato;
  final String contato;
  final EstadoDaSugestao estado;
  final DateTime criadaEm;
  final DateTime? decididaEm;

  /// O motivo da recusa, escrito pelo administrador.
  final String? motivoDaRecusa;

  /// O caminho da entrada no `Perto`, **e so quando ela esta publicada**.
  final String? entradaSlug;

  /// A entrada da indicacao aprovada esta no ar e tem para onde levar?
  bool get levaAoPerto => entradaSlug != null;

  factory MinhaIndicacao.doJson(Map<String, dynamic> json) {
    final referencia = json['reference'];
    final nome = json['display_name'];
    final atividade = AtividadeDoDiretorio.porCodigo(json['kind'] as String?);
    final cidade = json['city'];
    final uf = json['state'];
    final contatoJson = json['public_contact'];
    final estado = EstadoDaSugestao.porCodigo(json['review_status'] as String?);
    final criadaEm = DateTime.tryParse(json['created_at'] as String? ?? '');

    if (referencia is! String || referencia.isEmpty) {
      throw const FormatException('indicacao sem `reference`');
    }
    if (nome is! String || nome.isEmpty) {
      throw const FormatException('indicacao sem `display_name`');
    }
    if (atividade == null) {
      throw const FormatException('indicacao com `kind` desconhecido');
    }
    if (cidade is! String || uf is! String) {
      throw const FormatException('indicacao sem `city` ou `state`');
    }
    if (contatoJson is! Map<String, dynamic>) {
      throw const FormatException('indicacao sem `public_contact`');
    }
    final tipoDeContato = TipoDeContatoPublico.porCodigo(
      contatoJson['kind'] as String?,
    );
    final contato = contatoJson['value'];
    if (tipoDeContato == null || contato is! String) {
      throw const FormatException('indicacao com `public_contact` incompleto');
    }
    if (estado == null) {
      throw const FormatException('indicacao com `review_status` desconhecido');
    }
    if (criadaEm == null) {
      throw const FormatException('indicacao sem `created_at` legivel');
    }

    return MinhaIndicacao(
      referencia: referencia,
      nome: nome,
      atividade: atividade,
      tipoDeEntidade: TipoDeEntidade.porCodigo(json['entity_kind']),
      cidade: cidade,
      uf: uf,
      bairro: json['neighborhood'] as String?,
      tipoDeContato: tipoDeContato,
      contato: contato,
      estado: estado,
      criadaEm: criadaEm,
      decididaEm: DateTime.tryParse(json['decided_at'] as String? ?? ''),
      motivoDaRecusa: json['decline_reason'] as String?,
      entradaSlug: json['entry_slug'] as String?,
    );
  }
}

/// `#/components/schemas/MyDirectorySuggestionPage`.
class PaginaDasMinhasIndicacoes {
  const PaginaDasMinhasIndicacoes({
    required this.itens,
    required this.pagina,
    required this.tamanho,
    required this.total,
  });

  final List<MinhaIndicacao> itens;
  final int pagina;
  final int tamanho;

  /// Quantas indicacoes a conta tem AO TODO, e nao quantas vieram nesta pagina:
  /// e ele que alimenta "Mostrando 1 a 20 de 87".
  final int total;

  factory PaginaDasMinhasIndicacoes.doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException('pagina de indicacoes sem `items`');
    }
    return PaginaDasMinhasIndicacoes(
      itens: itens
          .whereType<Map<String, dynamic>>()
          .map(MinhaIndicacao.doJson)
          .toList(growable: false),
      pagina: json['page'] as int? ?? 1,
      tamanho: json['limit'] as int? ?? 20,
      total: json['total'] as int? ?? 0,
    );
  }
}
