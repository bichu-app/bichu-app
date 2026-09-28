// Os modelos de `GET /v1/directory/entries` (`listDirectoryEntries`).
//
// Escritos contra `api/openapi.yaml`, e nao contra a implementacao. Tres
// coisas do contrato valem repetir aqui porque sao exatamente as que alguem
// adivinharia errado:
//
// 1. **Nao existe `id`.** A chave da entrada e o `slug` (ADR-0010 item 6).
// 2. **Nao existe coordenada no corpo.** So `distance_m`, arredondada a 100 m,
//    e nula sempre que o servidor nao consegue calcular.
// 3. **`distance_available: false` significa que a lista saiu por NOME.** Nao
//    e um detalhe de telemetria: e a ordem real da lista que a pessoa esta
//    vendo, e a tela precisa dizer isso.

import 'falhas.dart';

/// `#/components/schemas/ProfessionalKind` do contrato.
///
/// **Nao ha valor para ONG**, e a ausencia e decisao pendente do modelo, nao
/// esquecimento: `professionals` nao tem `entity_kind`. A porta das ONGs em
/// `Perto` leva hoje a lista de `Pets` filtrada em adocao (UX 27.2.4), que e
/// outra coisa.
enum AtividadeDoDiretorio {
  vet('vet', 'Veterinário'),
  groomer('groomer', 'Banho e tosa'),
  walker('walker', 'Passeador'),
  sitter('sitter', 'Hospedagem'),
  trainer('trainer', 'Adestrador'),
  clinic('clinic', 'Clínica');

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

/// `#/components/schemas/VerificationLevel` do contrato.
///
/// O que foi provado, derivado da verificacao aprovada mais forte.
///
/// **`nenhum` e estado legitimo e publicavel** (ADR-0011): passeador,
/// hospedagem, tosa e adestramento nao tem conselho nem registro obrigatorio.
/// A tela **nao** carimba "nao verificado" em cima deles: um selo negativo
/// sobre um estado legitimo e o mesmo desenho preguicoso do selo generico, do
/// outro lado.
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
///
/// O TIPO de prova aceita. A resposta devolve o tipo, **nunca o numero**.
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
  ///
  /// **Nunca devolve selo generico.** A BICHUS-165 nao passou por isso: a
  /// interface diz O QUE foi verificado. Duas situacoes devolvem nulo, e as
  /// duas de proposito:
  ///
  /// - [NivelDeVerificacao.nenhum], que e legitimo e nao merece carimbo
  ///   negativo;
  /// - nivel acima de `nenhum` com [provas] vazia, que e uma resposta que
  ///   afirma ter verificado e nao diz o que. Aqui a tela fica calada em vez
  ///   de inventar a palavra "Verificado" sozinha.
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
///
/// O que ela **nao tem, porque a tabela nao tem coluna**: foto, logotipo,
/// horario de funcionamento, rua e numero, site, e-mail, redes sociais, lista
/// de servicos, faixa de preco e avaliacao. Nada disso e omissao desta classe:
/// nao existe no contrato e nao existe no banco.
class EntradaDoDiretorio {
  const EntradaDoDiretorio({
    required this.slug,
    required this.atividade,
    required this.nome,
    required this.verificacao,
    this.cidade,
    this.estado,
    this.bairro,
    this.sobre,
    this.telefoneE164,
    this.distanciaEmMetros,
  });

  /// A chave. **Nao existe `id`.**
  final String slug;

  final AtividadeDoDiretorio? atividade;
  final String nome;
  final VerificacaoDaEntrada verificacao;

  final String? cidade;
  final String? estado;
  final String? bairro;
  final String? sobre;

  /// Telefone **comercial**, publicado de proposito pela entidade. Nulo e
  /// comum, e cartao sem telefone **nao tem botao de ligar**.
  final String? telefoneE164;

  /// Distancia ate a localizacao de referencia de quem chama, arredondada a
  /// 100 m. **Nula sempre que `distance_available` e falso**, e nula tambem
  /// quando a entrada nao tem coordenada.
  final int? distanciaEmMetros;

  /// A linha de lugar: bairro, cidade e UF, sem separador orfao.
  ///
  /// Os tres campos sao anulaveis no contrato, e juntar a mao produz
  /// `" · São Paulo · "` no dia em que o bairro vier nulo. Aqui a lista e
  /// filtrada antes de unir.
  String? get linhaDeLugar {
    final partes = <String>[
      if (bairro != null && bairro!.isNotEmpty) bairro!,
      if (cidade != null && cidade!.isNotEmpty) cidade!,
      if (estado != null && estado!.isNotEmpty) estado!,
    ];
    if (partes.isEmpty) return null;
    return partes.join(' · ');
  }

  static EntradaDoDiretorio doJson(Map<String, dynamic> json) {
    final slug = json['slug'];
    if (slug is! String || slug.isEmpty) {
      // **Estoura, e nao devolve entrada degradada.** O `slug` e a chave da
      // entrada; um cartao sem chave e um objeto que o app nao consegue
      // nomear, e engoli-lo aqui faria a lista mostrar linhas que nao sao
      // nada. O contrato declara o campo como obrigatorio.
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
      cidade: json['city'] as String?,
      estado: json['state'] as String?,
      bairro: json['neighborhood'] as String?,
      sobre: json['about'] as String?,
      telefoneE164: json['phone_e164'] as String?,
      distanciaEmMetros: distancia is num ? distancia.round() : null,
    );
  }
}

/// `#/paths/~1directory~1entries/get/parameters/5/schema` do contrato.
///
/// O ponteiro passa pelo INDICE do parametro porque `sort` do diretorio nao
/// tem espelho em `components/schemas` -- diferente de `OrdemDaLoja`, que
/// tem `StoreItemPage.effective_sort`. Parametro inserido antes deste desloca
/// o indice, e o portao reprova: ou o caminho deixa de resolver, ou os valores
/// deixam de bater. Reprovar alto e o comportamento desejado, porque a correcao
/// e mover o ponteiro, e ninguem move o que nao sabe que quebrou.
///
/// A ordem da listagem. Espelha o parametro `sort` do contrato.
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
  ///
  /// O contrato e literal: com `false`, todo `distance_m` vem nulo e a
  /// ordenacao foi por nome. Duas causas levam a isso, e a tela trata as duas
  /// diferente: nao ha localizacao de referencia valida (e ai da para
  /// oferecer ligar a localizacao), ou a pessoa PEDIU `sort=name` (e ai nao
  /// ha nada a oferecer, porque foi ela quem escolheu).
  final bool distanciaDisponivel;

  /// O recorte que de fato valeu. `{'scope': 'all'}` quando nada foi filtrado.
  final Map<String, String> filtrosAplicados;

  /// A ordem em que esta pagina **de fato** esta, e nao a que foi pedida.
  ///
  /// E esta a fonte do controle de ordenacao da tela. Mostrar `Mais perto`
  /// selecionado sobre uma lista que saiu por nome e a mentira que a secao
  /// inteira existe para nao contar.
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
      // **Estoura em vez de assumir `true`.** Assumir que da para ordenar por
      // distancia e a forma mais curta de a tela afirmar proximidade que
      // ninguem calculou. O campo e obrigatorio no contrato.
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

/// O recorte pedido pela tela. Todos os campos sao opcionais no contrato.
class RecorteDoDiretorio {
  const RecorteDoDiretorio({
    this.atividade,
    this.nivelMinimo,
    this.ordem = OrdemDoDiretorio.distancia,
    this.pagina = 1,
    this.limite = 20,
  });

  final AtividadeDoDiretorio? atividade;

  /// **Piso, nao igualdade.** `contato` traz tambem `documento`.
  final NivelDeVerificacao? nivelMinimo;

  final OrdemDoDiretorio ordem;
  final int pagina;

  /// O contrato fixa o teto em 20.
  final int limite;

  /// Quantos recortes de conteudo estao ativos. **A ordem nao conta**: ela
  /// tem valor sempre, e contar como filtro faria o distintivo nascer aceso
  /// numa tela em que ninguem filtrou nada.
  int get quantidadeDeFiltros =>
      (atividade == null ? 0 : 1) +
      (nivelMinimo == null || nivelMinimo == NivelDeVerificacao.nenhum ? 0 : 1);

  RecorteDoDiretorio com({
    AtividadeDoDiretorio? atividade,
    NivelDeVerificacao? nivelMinimo,
    OrdemDoDiretorio? ordem,
    int? pagina,
    bool limparAtividade = false,
    bool limparNivel = false,
  }) {
    return RecorteDoDiretorio(
      atividade: limparAtividade ? null : (atividade ?? this.atividade),
      nivelMinimo: limparNivel ? null : (nivelMinimo ?? this.nivelMinimo),
      ordem: ordem ?? this.ordem,
      pagina: pagina ?? this.pagina,
      limite: limite,
    );
  }

  Map<String, String> get query => <String, String>{
        if (atividade != null) 'kind': atividade!.codigo,
        if (nivelMinimo != null && nivelMinimo != NivelDeVerificacao.nenhum)
          'verification_level': nivelMinimo!.codigo,
        'sort': ordem.codigo,
        'page': '$pagina',
        'limit': '$limite',
      };
}

/// Traduz a falha de `listDirectoryEntries` que **so esta rota tem**.
///
/// O 429 desta operacao e por CONTA e nao por IP (`x-rate-limit` do
/// contrato), e o texto generico de erro nao diz isso. Fica aqui, e nao em
/// `MensagensDeErro`, porque e texto de uma operacao e nao do app inteiro.
String? textoDoTetoDoDiretorio(FalhaDeChamada falha) {
  if (falha is! FalhaDaApi) return null;
  if (falha.problem.status != 429) return null;
  return 'Você consultou o diretório muitas vezes seguidas. '
      'Tente de novo daqui a pouco.';
}
