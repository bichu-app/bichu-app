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

import '../formato/cep.dart';
import 'falhas.dart';

/// `#/components/schemas/ProfessionalKind` do contrato.
///
/// **Nao ha valor para ONG, e a ausencia deixou de ser decisao pendente.** Ate
/// 18/10/2026 esta prosa dizia que `professionals` nao tinha `entity_kind`;
/// desde a migracao `20261018000012` ela tem, e o contrato passou a declarar
/// [TipoDeEntidade] como EIXO PROPRIO. ONG nao entra nesta lista por duas
/// razoes, e a prosa de `EntityKind` no `openapi.yaml` nomeia as duas: valor
/// novo em `enum` de RESPOSTA quebra o contrato (12 erros de `oasdiff`
/// medidos), e uma ONG nao e uma ATIVIDADE -- ela tem atividade (`clinic`,
/// `vet`) **e** tipo de entidade (`organization`) ao mesmo tempo.
enum AtividadeDoDiretorio {
  vet('vet', 'Veterinário'),
  groomer('groomer', 'Banho e tosa'),
  walker('walker', 'Dog Walker'),
  sitter('sitter', 'Pet Sitter'),
  trainer('trainer', 'Adestrador'),
  clinic('clinic', 'Clínica'),
  // `hospital` e `store` entraram em 28/10/2026 com a migracao
  // `20261028000001`. Os DOIS rotulos sao copiados de `ATIVIDADES` em
  // `admin/src/diretorio/dominio.ts` -- rotulo divergente entre painel e app e
  // defeito, e `admin/test/diretorio/rotulos-das-atividades.test.ts` cobra a
  // igualdade de `clinic`, `walker` e `sitter`, mas **nao** a destes dois: o
  // casamento aqui foi feito a mao, contra o fonte do painel.
  //
  // **`store` NAO e a secao `Loja` do produto**, que e catalogo
  // (`store_items`) e vive em outro fluxo. Aqui e "um estabelecimento que
  // vende" aparecendo em `Perto` -- um petshop --, e a coincidencia e so de
  // palavra. `hospital` e separado de `clinic` porque a distincao existe no
  // mundo: clinica atende hora marcada e fecha, hospital interna e tem
  // plantao.
  //
  // **Os dois entram no FIM, e isso nao e descuido.** `AtividadeDoDiretorio
  // .values` e a ordem de tela em dois lugares (os chips de filtro de
  // `telas/perto/lista_do_diretorio.dart` e o seletor de
  // `telas/perto/sugerir_profissional.dart`), entao a posicao e visivel. Pondo
  // os dois ao lado de `clinic`, os tres ESTABELECIMENTOS ficam juntos no fim,
  // que e onde `clinic` ja estava; reordenar a lista inteira para espelhar
  // `ORDEM_DAS_ATIVIDADES` do painel moveria os seis valores antigos e seria
  // mudanca de tela que ninguem pediu.
  hospital('hospital', 'Hospital'),
  store('store', 'Loja'),
  // `boarding` (Hospedagem) e `daycare` (Creche) -- cliente, 29/10/2026,
  // migracao `20261029000002`: *"Nao e um ou outro, sao todos .. hospedagem,
  // pet sitter, sao coisas diferentes"* e *"Acrescentar Creche junto"*.
  //
  // **ELES EXISTEM POR CAUSA DE UMA DIVERGENCIA DE MESES, e ela nasceu neste
  // arquivo.** `sitter` foi declarado no primeiro commit da listagem de `Perto`
  // (`109770b4`) com o rotulo **'Hospedagem'**: o valor dizia *pet sitter* e o
  // rotulo dizia *hospedagem*, e as duas coisas sao diferentes -- hospedagem e
  // o pet FICAR no estabelecimento, pet sitter e alguem que CUIDA, muitas vezes
  // na casa do tutor. O `openapi.yaml` nunca descreveu o significado de cada
  // atividade, so listou o `enum`, entao nao havia onde a divergencia reprovar.
  //
  // Em 28/10/2026 o cliente trocou o rotulo para 'Pet Sitter', e isso CORRIGIU
  // o rotulo em vez de renomear o conceito. Em 29/10 `boarding` entrou para
  // cobrir o que o rotulo errado vinha representando -- inclusive as 27 linhas
  // de homologacao gravadas como `sitter` por quem leu "Hospedagem" na tela.
  //
  // **`sitter` NAO foi renomeado**: renomear valor de `enum` quebra linha ja
  // gravada e exigiria migracao de DADO, nao so de `CHECK`.
  //
  // Entram no FIM pela mesma razao de `hospital` e `store`: `values` e a ordem
  // de tela em `telas/perto/lista_do_diretorio.dart` e em
  // `telas/perto/sugerir_profissional.dart`, e reordenar a lista inteira seria
  // mudanca de tela que ninguem pediu.
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
///
/// **O QUE a entrada e, e nao o que ela faz** -- eixo separado de
/// [AtividadeDoDiretorio] de proposito. Uma ONG que atende como clinica tem
/// `kind: clinic` e `entity_kind: organization`: um campo so nao expressava os
/// dois, e foi por isso que o contrato abriu o segundo.
///
/// ## Por que [porCodigo] devolve NULO, e nao `profissional`
///
/// `professional` e o `DEFAULT` da coluna e o valor de toda linha que existia
/// antes da migracao, e seria tentador cair nele na duvida. **Mas duas coisas
/// diferentes chegariam aqui como a mesma**: a resposta de um servidor antigo,
/// que nao manda o campo, e a resposta de um servidor NOVO que mandou um valor
/// que esta versao do app nao conhece. A segunda e a que importa -- o `enum` e
/// aditivo por construcao, e `glifoDoInscrito` (em
/// `lib/widgets/icone_do_inscrito.dart`) precisa poder distinguir "nao sei o
/// tipo" de "sei, e e profissional" para escolher o glifo de reserva. Engolir
/// o desconhecido como `profissional` apagaria essa diferenca na porta.
enum TipoDeEntidade {
  profissional('professional'),
  organizacao('organization');

  const TipoDeEntidade(this.codigo);

  /// O valor que vai e volta na API.
  final String codigo;

  /// O tipo, ou **nulo** para campo ausente, de outro tipo ou de valor que
  /// esta versao do app nao conhece. Ver a prosa da classe.
  static TipoDeEntidade? porCodigo(Object? codigo) {
    if (codigo is! String) return null;
    for (final t in TipoDeEntidade.values) {
      if (t.codigo == codigo) return t;
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
/// de servicos e faixa de preco. Nada disso e omissao desta classe: nao existe
/// no contrato e nao existe no banco.
///
/// **`avaliacao` SAIU dessa lista em 18/10/2026.** `DirectoryEntrySummary`
/// ganhou `rating` porque o cliente pediu media e quantidade "na lista e na
/// pagina", e [pontuacao] e esse campo. Ele e **opcional** no contrato, e a
/// opcionalidade importa aqui: ver o comentario do campo.
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
  /// ela faz. Nulo quando o campo nao veio ou trouxe valor desconhecido -- ver
  /// [TipoDeEntidade.porCodigo].
  ///
  /// A tela nao escreve este campo em texto nenhum: quem o usa e o glifo de
  /// reserva do lugar da imagem (`glifoDoInscrito`), que e o unico lugar onde
  /// ONG aparece sem estar escrita.
  final TipoDeEntidade? tipoDeEntidade;

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

  /// A pontuacao agregada do local, **ou nulo**.
  ///
  /// `rating` nao esta em `required` no contrato, e a opcionalidade e
  /// deliberada: o APK publicado le esta resposta e nao conhece o campo, e uma
  /// resposta que nao conseguiu agregar e melhor sem o campo do que com media
  /// zero -- zero se le como "pessimo", e local sem avaliacao nao e pessimo.
  ///
  /// **Nulo, e tambem `quantidade == 0`, nao desenham estrela nenhuma e nao
  /// escrevem "0,0"**: a linha da media simplesmente nao existe no cartao.
  final PontuacaoDoLocal? pontuacao;

  /// A URL da **derivada** da logo da entidade, ou nulo (cliente, 18/10/2026:
  /// *"pode liberar as imagens do profissional no app"*).
  ///
  /// **Nulo e o estado NORMAL**, em tres casos que a tela trata igual: a
  /// entrada nao tem logo; a logo foi enviada e o worker ainda nao terminou; a
  /// logo foi recusada nos bytes. Em nenhum deles o cartao deixa de existir --
  /// **cartao sem logo desenha o nome sem imagem**, e nunca um quadro vazio.
  ///
  /// E sempre derivada: o original mora no armazenamento privado e nao e
  /// servido a cliente nenhum. Quem garante isso e o servidor, que confere a
  /// forma da chave antes de montar a URL.
  final String? logoUrl;

  // A LINHA DE LUGAR DE TRES PARTES SAIU DAQUI EM 22/10/2026.
  //
  // Este getter devolvia `bairro · cidade · UF` e tinha UM leitor: o cartao do
  // `Perto`. O cliente pediu *"na listagem exibe so o bairro e na pagina
  // interna o endereco completo"*, e o cartao passou a chamar
  // [linhaDeLugarDe] com um argumento so.
  //
  // **Apagado, e nao deixado sem leitor**, porque o risco aqui tem nome:
  // [DetalheDoLocal] tem um getter com o MESMO NOME que continua devolvendo as
  // tres partes -- e deve continuar, porque a pagina interna mostra as tres.
  // Dois getters `linhaDeLugar` com significados diferentes no mesmo arquivo,
  // um deles sem nenhum leitor, e um convite a `entrada.linhaDeLugar` voltar
  // ao cartao por completacao automatica, desfazendo o pedido sem ninguem
  // decidir que fosse desfeito. O analisador nao avisa: getter publico sem
  // leitor nao e `unused_element`.
  //
  // Quem quiser a linha composta de um resumo chama [linhaDeLugarDe] com os
  // tres campos, que continuam todos aqui.

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
      // **Obrigatorio no contrato, e ainda assim lido com tolerancia.** O
      // campo e NOVO (migracao `20261018000012`): um servidor que nao subiu
      // ainda nao o manda, e derrubar a listagem por causa dele nao melhora
      // nada. Ausente e desconhecido viram nulo, e o nulo tem desenho.
      tipoDeEntidade: TipoDeEntidade.porCodigo(json['entity_kind']),
      cidade: json['city'] as String?,
      estado: json['state'] as String?,
      bairro: json['neighborhood'] as String?,
      sobre: json['about'] as String?,
      telefoneE164: json['phone_e164'] as String?,
      distanciaEmMetros: distancia is num ? distancia.round() : null,
      // **Campo OPCIONAL: ausente devolve nulo e nao estoura.** Ao contrario
      // de `slug` e `display_name` acima, `rating` nao esta em `required`, e
      // tratar a ausencia como falha faria a listagem inteira cair por causa
      // de um numero de enfeite.
      pontuacao: PontuacaoDoLocal.opcional(json['rating']),
      // **Campo OPCIONAL: ausente e nulo, e nao estoura.** Mesmo motivo de
      // `rating`: o APK publicado le esta resposta e nao conhece o campo, e
      // uma entrada sem logo nao pode derrubar a listagem inteira.
      logoUrl: urlDeImagem(json['logo_url']),
    );
  }
}

/// A linha de lugar de uma entrada: bairro, cidade e UF, **sem separador
/// orfao**.
///
/// Os tres campos sao anulaveis no contrato, e juntar a mao produz
/// `" · São Paulo · "` no dia em que o bairro vier nulo. Aqui a lista e
/// filtrada antes de unir.
///
/// Mora fora das classes porque o cartao da listagem
/// ([EntradaDoDiretorio]) e a pagina do local ([DetalheDoLocal]) precisam
/// escrever a MESMA linha: duas copias divergem na primeira edicao.
/// A URL de imagem que veio do contrato, **ou nulo**.
///
/// Existe por tres razoes, e nenhuma e estetica:
///
/// 1. **Campo ausente e campo nulo sao a MESMA coisa** para a tela. O contrato
///    declara `logo_url` e `photo_url` como anulaveis e nao obrigatorios, e um
///    `as String?` cru sobre um valor de outro tipo estoura em tempo de
///    execucao -- na listagem, isso derrubaria a pagina inteira por causa de
///    uma entrada.
/// 2. **String vazia nao e URL.** `Image.network('')` lanca, e o servidor nao
///    promete nunca mandar vazio: ele promete nulo. Vazio vira nulo aqui.
/// 3. **Uma definicao so**, porque o cartao da listagem e a pagina do local
///    leem o mesmo campo. Duas copias divergem na primeira edicao.
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
///
/// ERA `parameters/5` ate 30/09. A busca por nome no diretorio inseriu `q`
/// como PRIMEIRO parametro e deslocou todos os indices: o 5 passou a ser
/// `verification_level`, e o portao de conformidade reprovou nomeando os tres
/// valores dele (`none`, `contact_verified`, `document_verified`) como valores
/// que o app nao desenha. Foi exatamente o que o paragrafo abaixo previu.
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
  ///
  /// **So vai para a rota com tres caracteres ou mais**, e o piso e do
  /// contrato (`minLength: 3` em `q`): o indice que atende esta busca e GIN de
  /// trigrama, e padrao menor que tres nao produz trigrama nenhum. Abaixo do
  /// piso o campo fica preenchido na tela e o parametro NAO sai -- mandar
  /// voltaria 400, e engolir o 400 desenharia "nada encontrado" para quem
  /// apenas ainda nao acabou de digitar.
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

  /// A CIDADE do recorte, ou nulo. **Nome de cidade, nunca coordenada.**
  ///
  /// `city` sempre existiu em `listDirectoryEntries` (`minLength: 2`,
  /// `maxLength: 80`) e o servidor sempre o aplicou -- a comparacao passa por
  /// `texto_para_busca`, que absorve acento e caixa. **O que nao existia era o
  /// app MANDAR**, e e isso que entra em 20/10/2026 por decisao do cliente
  /// (*"nos eventos e na comunidade ... utilizar a mesma inteligencia do
  /// pets"*): a cidade que o aparelho resolve passa a recortar a lista.
  ///
  /// **Nenhum contrato mudou por causa disto, e nenhum podia mudar:** por o
  /// PONTO na consulta e exatamente o que o ADR-0006 proibe. O que vai e o
  /// nome; a coordenada nasce e morre dentro de `Localizacao.cidadeAproximada`.
  ///
  /// **Nao e a mesma coisa que a ordem por distancia desta aba.** Aquela sai de
  /// `ST_Distance` contra o ponto de referencia que o SERVIDOR guarda por
  /// aparelho, e so atravessa a borda em metros (`distance_m`). As duas se
  /// somam: a cidade recorta quais entradas entram, a distancia ordena as que
  /// entraram.
  final String? cidade;

  /// A cidade como ela vai para a rota, ou nulo quando ela nao vai.
  ///
  /// **O piso de dois caracteres e do contrato** (`minLength: 2` em `city`):
  /// mandar um caractere so voltaria 400, e engolir o 400 desenharia "nada
  /// encontrado" para quem tem uma cidade legitima. Mesma regra, e mesma razao,
  /// de [termoQueVai].
  String? get cidadeQueVai {
    final limpo = cidade?.trim();
    if (limpo == null || limpo.length < 2) return null;
    return limpo;
  }

  /// O BAIRRO do recorte, ou nulo (BICHUS-315, 28/10/2026).
  ///
  /// Pedido do cliente: *"No filtro da pagina de comunidade, precisamos
  /// implementar o filtro de bairro, pois em Sao Paulo a cidade e muito
  /// grande."* A razao dele e o requisito: `city` sozinha nao recorta nada
  /// numa cidade do tamanho de Sao Paulo.
  ///
  /// **Nenhum contrato mudou por causa disto, e nenhum precisava:**
  /// `neighborhood` (`minLength: 2`, `maxLength: 80`) ja existia nas DUAS
  /// operacoes que atendem esta lista -- `listDirectoryEntries` e
  /// `listPublicDirectoryEntries` --, e o servidor ja normaliza acento nele.
  /// O que faltava era o app MANDAR, exatamente como faltava para [cidade] em
  /// 20/10/2026.
  ///
  /// **E TEXTO, e nao chave de entidade**, e o contrato diz isso com as
  /// proprias palavras: *"`city`, `state` e `neighborhood` sao rotulo de
  /// exibicao e filtro de texto, jamais fonte de coordenada"*. Nao existe
  /// lista canonica de bairros, nao ha operacao que a devolva e nao ha
  /// geocodificacao (ADR-0006) -- e e por isso que a tela oferece um campo
  /// que a pessoa DIGITA (`CampoDeTextoDoFiltro`) e nao um grupo de opcoes.
  ///
  /// **A alternativa foi considerada e descartada por medida**: uma lista dos
  /// bairros vistos nas entradas carregadas ofereceria os bairros de 20
  /// entradas numa cidade com 87, mudaria de opcoes a cada `Carregar mais` e
  /// esconderia justamente o bairro que a pessoa procura -- que no caso dele
  /// quase nunca esta entre as 20 primeiras. O caso `um bairro que NÃO está em
  /// nenhuma entrada carregada pode ser aplicado`, em
  /// `filtro_de_bairro_test.dart`, e essa escolha em forma mensuravel.
  ///
  /// **O grupo `Cidade` desta mesma tela E lista derivada, e isso nao e
  /// contradicao**: a cidade tem uma fonte que o bairro nao tem -- o aparelho
  /// a resolve, e e ela que a folha injeta marcada. Nenhuma peca deste app
  /// resolve o bairro de quem olha.
  final String? bairro;

  /// O bairro como ele vai para a rota, ou nulo quando ele nao vai.
  ///
  /// **O piso de dois caracteres e do contrato** (`minLength: 2` em
  /// `neighborhood`): mandar um caractere so voltaria 400, e engolir o 400
  /// desenharia "nada encontrado" para quem tem um bairro legitimo. Mesma
  /// regra, e mesma razao, de [termoQueVai] e [cidadeQueVai].
  String? get bairroQueVai {
    final limpo = bairro?.trim();
    if (limpo == null || limpo.length < 2) return null;
    return limpo;
  }

  final OrdemDoDiretorio ordem;
  final int pagina;

  /// O contrato fixa o teto em 20.
  final int limite;

  /// Quantos recortes de conteudo estao ativos. **A ordem nao conta**: ela
  /// tem valor sempre, e contar como filtro faria o distintivo nascer aceso
  /// numa tela em que ninguem filtrou nada.
  /// **O bairro conta pelo `bairroQueVai`, e nao pelo campo.** Um caractere so
  /// nao vai para a rota: contado, o distintivo prometeria um recorte que o
  /// servidor nao aplicou -- a mesma mentira, do outro lado, que o piso
  /// existe para evitar.
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
      // `limparBairro` existe pela mesma razao de `limparTermo` e
      // `limparCidade`: `null` num parametro opcional e indistinguivel de
      // "nao passei", e apagar o bairro e um recorte VALIDO -- e assim que
      // quem digitou um bairro volta a ver a cidade inteira.
      bairro: limparBairro ? null : (bairro ?? this.bairro),
      // `limparCidade` existe pela mesma razao de `limparTermo`: `null` num
      // parametro opcional e indistinguivel de "nao passei", e confundir esses
      // dois foi o que deixou o botao de localizacao dos pets sem efeito.
      cidade: limparCidade ? null : (cidade ?? this.cidade),
      ordem: ordem ?? this.ordem,
      pagina: pagina ?? this.pagina,
      limite: limite,
    );
  }

  Map<String, String> get query => <String, String>{
        // `q` primeiro, na mesma ordem do contrato. Sai pelo `termoQueVai`, e
        // nao pelo `termo`: o piso de tres caracteres mora num lugar so.
        'q': ?termoQueVai,
        // A cidade vai como NOME, pelo `cidadeQueVai` -- o piso de dois
        // caracteres mora num lugar so. **Nao ha, e nao pode haver, `lat` nem
        // `lon` nesta consulta**: ver [cidade] e o ADR-0006.
        'city': ?cidadeQueVai,
        // O BAIRRO, pelo `bairroQueVai` -- o piso de dois caracteres mora num
        // lugar so (BICHUS-315). Depois de `city` e antes de `kind`, na mesma
        // ordem do contrato. **Ele vale nas duas rotas**: `queryPublica` sai
        // desta consulta por subtracao, e `listPublicDirectoryEntries` tambem
        // declara `neighborhood` -- conferido antes de acrescentar a linha,
        // porque mandar a uma operacao que nao declara o parametro seria 400.
        'neighborhood': ?bairroQueVai,
        if (atividade != null) 'kind': atividade!.codigo,
        if (nivelMinimo != null && nivelMinimo != NivelDeVerificacao.nenhum)
          'verification_level': nivelMinimo!.codigo,
        'sort': ordem.codigo,
        'page': '$pagina',
        'limit': '$limite',
      };

  /// A consulta da rota PUBLICA (`listPublicDirectoryEntries`): a mesma,
  /// **sem `sort`**.
  ///
  /// **Nao e a mesma consulta com um parametro a menos por economia.** Aquela
  /// operacao nao declara `sort`, e mandar o parametro que o contrato nao tem
  /// levaria 400 -- o que a pessoa le como o app quebrado. A ordem de la e
  /// sempre por nome, porque `distance` mede a partir da localizacao de
  /// referencia de quem chama, e sem conta nao existe ponto de onde medir.
  ///
  /// Derivada de [query] por subtracao, e nao escrita a mao: um filtro novo
  /// acrescentado la aparece aqui no mesmo instante. Duas listas de parametros
  /// mantidas em paralelo divergem, e a que fica para tras e a que ninguem le.
  Map<String, String> get queryPublica =>
      Map<String, String>.of(query)..remove('sort');
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

// ---------------------------------------------------------------------------
// A SUGESTAO DA COMUNIDADE (`suggestDirectoryEntry`)
// ---------------------------------------------------------------------------
// A diferenca de natureza entre esta escrita e a do encontro da `Rede`, que e
// o que explica tudo abaixo: criar encontro e a pessoa falando DELA MESMA, e
// por isso publica direto. Sugerir uma clinica e publicar sobre um TERCEIRO
// que nao pediu, nao sabe e pode discordar -- do texto, da categoria e de
// aparecer. Por isso a sugestao nasce `pending` e NADA aparece no `Perto` ate
// alguem do painel olhar.
//
// Isto nao e zelo novo: e a emenda 1 do ADR-0011, escrita no `CHECK` de
// `professionals.source`, que nao tem o valor `'community'` -- "nenhum perfil
// nasce sem o aceite de quem ele descreve; a comunidade convida e avalia,
// nunca cria". A sugestao nao escreve em `professionals`: ela escreve numa
// fila de revisao, e quem cria a entrada continua sendo o painel.

/// `#/components/schemas/DirectorySuggestionContactKind` do contrato.
///
/// O tipo e DECLARADO e nao adivinhado: o servidor confere o formato do valor
/// contra ele. Adivinhar por heuristica aceitaria um telefone no campo de site
/// e vice-versa, e a recusa chegaria sem dizer qual dos dois estava errado.
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
///
/// Nasce sempre [pendente]. **[aprovada] nao quer dizer que a entrada esta no
/// ar**: quer dizer que a revisao aceitou seguir com o convite do ADR-0011.
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
///
/// O recibo, e **nao o recurso sugerido**. Devolver o texto de volta faria a
/// tela parecer que algo foi publicado, e nada foi.
class ReciboDaSugestao {
  const ReciboDaSugestao({
    required this.referencia,
    required this.estado,
    required this.criadaEm,
  });

  /// O identificador opaco, 128 bits em base64url. **Nao e UUID**
  /// (ADR-0010 item 6).
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

// ---------------------------------------------------------------------------
// A PAGINA DO LOCAL E AS AVALIACOES (18/10/2026)
// ---------------------------------------------------------------------------
// O cliente pediu que o cartao do `Perto` abrisse uma pagina, com pontuacao de
// 1 a 5 e recomendacao em texto visivel para os outros, "como acontece na
// playstore". Cinco operacoes entraram no contrato por isso:
// `getDirectoryEntry`, `listDirectoryEntryReviews`, `putMyDirectoryEntryReview`,
// `deleteMyDirectoryEntryReview` e `reportDirectoryEntryReview`.
//
// Quatro regras do contrato que alguem adivinharia errado, e que por isso
// moram em codigo e nao em comentario de tela:
//
// 1. **`average` e NULO quando `count` e zero, e nunca vira `0,0`.** Zero se
//    le como "pessimo", e local sem avaliacao nao e pessimo. A media tem UMA
//    casa decimal e o SERVIDOR a arredonda: [PontuacaoDoLocal.mediaEmTexto] so
//    troca o ponto pela virgula.
// 2. **`body` nulo e estado normal e frequente**: quem deu so a nota. A nota E
//    a avaliacao, o texto e o opcional.
// 3. **`author_display_name` nulo e estado normal** (conta sem nome de
//    exibicao), e a linha nao fica muda: ela diz
//    [AvaliacaoDoLocal.nomeDeQuemLe].
// 4. **`edited_at` nao nulo se DIZ.** Avaliacao reescrita depois de alguem ter
//    lido a primeira versao e um formato conhecido de ma-fe, e marcar a edicao
//    e o que o torna visivel.

/// `#/components/schemas/DirectoryRating` do contrato.
///
/// **Calculada na consulta, nunca materializada.** Nao ha coluna
/// `rating_average` e nao ha gatilho: o autor desabilitar a conta muda a media
/// de todo local que ele avaliou sem tocar em nenhuma avaliacao, e um gatilho
/// nao enxerga esse caminho. Para esta classe o que isso significa e simples:
/// o valor que chegou e o valor de agora, e nao ha cache a invalidar aqui.
class PontuacaoDoLocal {
  const PontuacaoDoLocal({
    required this.media,
    required this.quantidade,
    required this.histograma,
  });

  /// A media das notas publicadas, **com uma casa decimal, arredondada pelo
  /// servidor**. Nula quando [quantidade] e zero.
  ///
  /// **Nao ha `?? 0` em nenhum lugar deste arquivo nem das telas.** Nulo aqui
  /// e a instrucao de nao desenhar media nem estrela.
  final double? media;

  /// Quantas avaliacoes publicadas o local tem. Zero e estado normal.
  final int quantidade;

  /// Quantas avaliacoes em cada nota, de 1 a 5. **As cinco chaves existem
  /// sempre**, inclusive com zero: a barra de uma nota que ninguem deu precisa
  /// existir vazia, senao o grafico muda de forma e deixa de ser comparavel
  /// entre locais.
  final Map<int, int> histograma;

  /// Ha avaliacao a mostrar. Falso leva ao estado zero, que **nao tem media e
  /// nao tem estrela**.
  bool get temAvaliacoes => quantidade > 0;

  /// A media como a tela escreve: uma casa e **virgula** decimal.
  ///
  /// Nula quando nao ha media. A tela que a recebe nula nao desenha o bloco,
  /// em vez de desenhar um bloco com um traco dentro.
  String? get mediaEmTexto {
    final valor = media;
    if (valor == null) return null;
    return valor.toStringAsFixed(1).replaceAll('.', ',');
  }

  /// `128 avaliações`, no plural e no singular.
  String get quantidadeEmTexto =>
      quantidade == 1 ? '1 avaliação' : '$quantidade avaliações';

  /// Quantas avaliacoes tem a nota [nota]. Fora de 1..5 devolve zero.
  int quantasNaNota(int nota) => histograma[nota] ?? 0;

  /// A fracao da barra de [nota] no histograma, de 0 a 1.
  ///
  /// O divisor e [quantidade] e nao a maior barra: a barra de 5 estrelas de um
  /// local com 78 de 128 precisa parecer 61% e nao 100%, senao dois locais com
  /// distribuicoes diferentes desenham o mesmo grafico.
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
      // **Nulo atravessa nulo.** `average` nulo com `count` zero e o caso
      // normal; `average` nulo com `count` acima de zero seria resposta fora
      // do contrato, e mesmo ai a tela fica sem media em vez de inventar uma.
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
  ///
  /// **Opcional de proposito, e nao por timidez** (contrato, 18/10): o APK
  /// publicado le a listagem e nao conhece o campo, e uma resposta que nao
  /// conseguiu agregar e melhor sem o campo do que com media zero. Ausente
  /// devolve nulo, e **o cartao sem pontuacao nao desenha estrela nenhuma**.
  static PontuacaoDoLocal? opcional(Object? bruto) {
    if (bruto is! Map) return null;
    if (bruto['count'] is! num) return null;
    return doJson(bruto);
  }
}

/// `#/components/schemas/DirectoryEntryDetail/properties/review_blocked_reason`.
///
/// Por que `can_review` e falso, **para a tela escrever a frase certa e
/// oferecer a saida** em vez de um "nao e possivel" sem porta. Enum de um
/// valor so hoje, e aberto de proposito no contrato: bloqueio por moderacao
/// entra aqui e nao num segundo booleano.
enum MotivoDeNaoPoderAvaliar {
  /// Conta sem e-mail confirmado. A mesma regua de criar encontro.
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

/// O ENDERECO COMERCIAL da entrada: os quatro campos de
/// `DirectoryEntryDetail` (cliente, 21/10/2026).
///
/// ## Por que ele e uma classe, e nao quatro campos soltos em [DetalheDoLocal]
///
/// Porque [porExtenso] e [textoParaBuscaNoMapa] sao a MESMA regra lida de duas
/// formas, e a tela precisa das duas na mesma decisao: desenha a linha? oferece
/// o toque? Com os campos soltos, cada tela refaria a juncao -- e juntar a mao
/// produz `"Rua X,  - "` no dia em que o numero vier nulo, que e o caso real de
/// estrada, rodovia e quadra (a migracao `20261018000001` recusou de proposito
/// um `CHECK` que exigisse rua e numero juntos).
///
/// ## O que esta classe NAO e
///
/// **Nao e endereco de PESSOA.** A secao 4 do ADR-0011 separa os dois casos: o
/// perfil do profissional e de uma entidade que aceitou aparecer para ser
/// contratada. Nenhuma tela de tutor tem endereco, e nada aqui alcanca uma.
///
/// **Nao e um segundo jeito de abrir mapa.** Quem abre e
/// `SaidaDoApp.abrirEnderecoNoAppDeMapas`, a MESMA do encontro da Rede --
/// intencao `geo:` com o TEXTO, uma vez, num lugar. Esta classe so monta o
/// texto.
class EnderecoComercialDaEntrada {
  const EnderecoComercialDaEntrada({
    this.cep,
    this.logradouro,
    this.numero,
    this.complemento,
  });

  /// `postal_code`: oito digitos **sem mascara**, como o servidor o guarda. A
  /// mascara e de exibicao e sai de `mascaraDeCep`, que e a mesma usada no
  /// cadastro -- uma definicao so.
  final String? cep;
  final String? logradouro;

  /// `street_number`: **texto e nao inteiro**. `s/n`, `120A` e `KM 32` sao
  /// numeros de porta reais, e nulo com [logradouro] preenchido e caso
  /// legitimo.
  final String? numero;

  /// `complement`: sala, loja, andar ou bloco. Entra em [porExtenso] e **fica
  /// fora de [textoParaBuscaNoMapa]**: nenhum mapa procura por `sala 302`, e
  /// incluir piora o resultado da busca.
  final String? complemento;

  static const EnderecoComercialDaEntrada vazio = EnderecoComercialDaEntrada();

  static String? _limpo(Object? bruto) {
    if (bruto is! String) return null;
    final texto = bruto.trim();
    return texto.isEmpty ? null : texto;
  }

  /// Os quatro campos de um corpo de `DirectoryEntryDetail`.
  ///
  /// **Ausente, nulo, vazio e de outro tipo viram nulo**, e nenhum estoura: os
  /// quatro sao opcionais no contrato porque o APK publicado nao os conhece, e
  /// um `as String?` cru sobre valor de outro tipo derrubaria a pagina.
  static EnderecoComercialDaEntrada doJson(Map<String, dynamic> json) {
    return EnderecoComercialDaEntrada(
      cep: _limpo(json['postal_code']),
      logradouro: _limpo(json['street']),
      numero: _limpo(json['street_number']),
      complemento: _limpo(json['complement']),
    );
  }

  /// **Ha endereco de rua para mostrar?**
  ///
  /// O logradouro e a condicao, e nao "algum dos quatro": CEP sozinho nao e um
  /// endereco que alguem leia, e complemento sozinho (`Sala 3`) e uma linha que
  /// nao diz onde fica nada. Sem logradouro a pagina fica com a linha de lugar
  /// -- bairro, cidade e UF --, que e o que ela sempre teve.
  bool get temEnderecoDeRua => logradouro != null;

  /// A linha que a pagina escreve: `Rua Teodoro Sampaio, 1020 - Sala 3`, e o
  /// CEP mascarado depois, quando ha.
  ///
  /// **Nulo quando nao ha logradouro**, e nulo e o estado normal: profissional
  /// autonomo -- adestrador, passeador, veterinario que atende em casa -- nao
  /// tem endereco comercial, e a entrada dele e publicavel sem nenhum dos
  /// quatro.
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
  ///
  /// **Nao e [porExtenso]**, e a diferenca e medida e nao estetica: o
  /// complemento sai (nenhum mapa procura por `sala 302`) e o bairro, a cidade
  /// e a UF entram (`Rua Teodoro Sampaio, 1020` existe em muitas cidades). O
  /// CEP entra mascarado, que e a forma que todo mapa brasileiro espera.
  ///
  /// Nulo quando nao ha logradouro: **endereco ausente nao pode virar botao que
  /// abre o mapa no nada**.
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
///
/// **Os mesmos campos de [EntradaDoDiretorio], mais [pontuacao],
/// [minhaAvaliacaoRef], [podeAvaliar] e [motivoDeNaoPoderAvaliar].** O
/// contrato repete os campos em vez de usar `allOf` porque o gerador de tipos
/// de `src/`, `admin/` e `web/` perde a nulabilidade na interseccao; aqui a
/// classe e separada pelo mesmo motivo pratico: o detalhe tem `rating`
/// OBRIGATORIO e o resumo nao.
///
/// **O ENDERECO COMERCIAL PASSOU A EXISTIR**, em 21/10/2026, e esta frase
/// substitui a anterior, que o listava junto com o que "nao existe em
/// `professionals`". As quatro colunas existiam desde `20261018000001` e nao
/// eram projetadas porque exibi-las era decisao do cliente -- e ela foi tomada:
/// *"o endereco completo do profissional"*, para a pessoa tocar e abrir o
/// aplicativo de mapas. Ver [endereco].
///
/// **E-mail, WhatsApp, redes sociais e horario continuam fora**: nao ha coluna
/// e nao ha painel que as preencha, e espaco reservado ensinaria quem le que o
/// dado vem.
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
  ///
  /// `kinds` do contrato (`ProfessionalKinds`): lista de 1 a 6, `uniqueItems`,
  /// OBRIGATORIA em `DirectoryEntryDetail` desde 21/10/2026 -- *"uma clinica
  /// que tambem faz banho e tosa nao precisa escolher"*. [atividade] e o
  /// `kind` singular, que o contrato mantem **so por compatibilidade** (a
  /// PRIMEIRA desta lista), e quem desenha a entrada nova usa esta.
  ///
  /// **A ORDEM E A DO SERVIDOR, e nao a do `enum`.** Ordenar aqui mostraria as
  /// tags numa ordem que ninguem escolheu -- o painel escolhe uma, e o
  /// primeiro item e justamente o que sai em `kind`.
  ///
  /// **Codigo que este build nao conhece e DESCARTADO, e nao derruba a
  /// leitura.** `uniqueItems` no contrato nao impede o servidor de ganhar um
  /// valor novo antes desta versao do app -- e nesta rodada o `enum` esta
  /// crescendo. Uma `FormatException` aqui tiraria a pagina inteira do ar por
  /// causa de uma tag; descartar mostra as atividades que o app entende e cala
  /// sobre a que nao entende.
  ///
  /// **Pode vir VAZIA**, em dois casos que a tela trata igual (nao desenha o
  /// bloco): todas as atividades sao desconhecidas, ou nem `kinds` nem `kind`
  /// vieram.
  final List<AtividadeDoDiretorio> atividades;

  /// `entity_kind`: **o QUE a entrada e**, ao lado de [atividade], que e o que
  /// ela faz. Nulo quando o campo nao veio ou trouxe valor desconhecido -- ver
  /// [TipoDeEntidade.porCodigo].
  ///
  /// A tela nao escreve este campo em texto nenhum: quem o usa e o glifo de
  /// reserva do lugar da imagem (`glifoDoInscrito`), que e o unico lugar onde
  /// ONG aparece sem estar escrita.
  final TipoDeEntidade? tipoDeEntidade;

  final String? cidade;
  final String? estado;
  final String? bairro;
  final String? sobre;

  /// Telefone **comercial** (ADR-0011 secao 4), e a unica acao de contato que
  /// a pagina oferece. Nulo e comum, e pagina sem telefone **nao tem botao de
  /// ligar desabilitado**: nao tem botao.
  final String? telefoneE164;

  /// Arredondada a 100 m, a grade do ADR-0006. **Nula com mais frequencia aqui
  /// do que na lista**: quem chega por link direto costuma nao ter localizacao
  /// de referencia valida. Nula nao escreve linha nenhuma.
  final int? distanciaEmMetros;

  final PontuacaoDoLocal pontuacao;

  /// O `ref` da MINHA avaliacao deste local, ou nulo se eu nao avaliei.
  ///
  /// Existe para a tela saber **antes de montar** se desenha o campo vazio ou
  /// a minha avaliacao com `Editar` e `Apagar`. Sem ele a tela teria de varrer
  /// a paginacao inteira procurando `mine: true`, e a minha pode estar na
  /// pagina 7.
  final String? minhaAvaliacaoRef;

  /// **Se EU posso avaliar agora**, e nao se a funcionalidade existe.
  ///
  /// **Nao e autorizacao**: `putMyDirectoryEntryReview` reavalia a condicao no
  /// servidor. Este campo existe para a tela nao oferecer um campo que vai
  /// levar 403.
  final bool podeAvaliar;

  /// Por que [podeAvaliar] e falso. Nulo quando ele e verdadeiro.
  final MotivoDeNaoPoderAvaliar? motivoDeNaoPoderAvaliar;

  /// A URL da **derivada** da logo da entidade, ou nulo (cliente, 18/10/2026:
  /// *"pode liberar as imagens do profissional no app"*).
  ///
  /// **Nulo e o estado NORMAL**, em tres casos que a tela trata igual: a
  /// entrada nao tem logo; a logo foi enviada e o worker ainda nao terminou; a
  /// logo foi recusada nos bytes. Em nenhum deles o cartao deixa de existir --
  /// **cartao sem logo desenha o nome sem imagem**, e nunca um quadro vazio.
  ///
  /// E sempre derivada: o original mora no armazenamento privado e nao e
  /// servido a cliente nenhum. Quem garante isso e o servidor, que confere a
  /// forma da chave antes de montar a URL.
  final String? logoUrl;

  /// A URL da **derivada** da foto do lugar -- fachada ou ambiente --, ou nulo.
  ///
  /// Faixa 16:9 (derivada `banner`, 1280 x 720), e e a imagem que a pessoa olha
  /// GRANDE antes de decidir se leva o animal ali.
  ///
  /// **So existe aqui, e nao em [EntradaDoDiretorio].** A faixa em ate 20
  /// cartoes multiplicaria o peso da primeira pintura da lista; a lista desenha
  /// a logo. Nulo nos mesmos tres casos da logo, e **pagina sem foto nao tem
  /// faixa vazia**: ela simplesmente nao desenha a faixa.
  final String? fotoUrl;

  /// O ENDERECO COMERCIAL (cliente, 21/10/2026): CEP, logradouro, numero e
  /// complemento.
  ///
  /// **So existe aqui, e nao em [EntradaDoDiretorio].** O cartao de `Perto`
  /// responde "existe e fica perto" com [linhaDeLugar]; endereco de porta em
  /// ate vinte cartoes nao foi pedido por tela nenhuma -- a mesma decisao de
  /// [fotoUrl].
  ///
  /// **Nunca nulo, e os quatro campos dentro dele podem ser**: assim a tela
  /// pergunta `detalhe.endereco.temEnderecoDeRua` sem um `?.` que esconderia a
  /// diferenca entre "nao veio" e "nao tem".
  final EnderecoComercialDaEntrada endereco;

  /// A linha de lugar: bairro, cidade e UF, sem separador orfao. **A MESMA
  /// linha do cartao da listagem**, por [linhaDeLugarDe]: duas copias da regra
  /// divergem na primeira edicao, e a pagina e o cartao mostram o mesmo lugar.
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
      // **Ausente vira FALSO, e nao verdadeiro.** `can_review` nao esta em
      // `required` no contrato, e o lado seguro de um campo ausente aqui e nao
      // oferecer o campo: oferecer levaria a pessoa a escrever um texto e
      // perde-lo num 403.
      podeAvaliar: pode is bool ? pode : false,
      motivoDeNaoPoderAvaliar: MotivoDeNaoPoderAvaliar.porCodigo(
        json['review_blocked_reason'] as String?,
      ),
      minhaAvaliacaoRef: json['my_review_ref'] as String?,
      // Mesma tolerancia da listagem: campo novo, ausente e desconhecido
      // viram nulo, e o nulo tem desenho.
      tipoDeEntidade: TipoDeEntidade.porCodigo(json['entity_kind']),
      cidade: json['city'] as String?,
      estado: json['state'] as String?,
      bairro: json['neighborhood'] as String?,
      sobre: json['about'] as String?,
      telefoneE164: json['phone_e164'] as String?,
      distanciaEmMetros: distancia is num ? distancia.round() : null,
      // Os dois sao OPCIONAIS: ausente e nulo, e nao estoura.
      logoUrl: urlDeImagem(json['logo_url']),
      fotoUrl: urlDeImagem(json['photo_url']),
      // Os QUATRO do endereco, pela mesma tolerancia: ausente, nulo, vazio e
      // de outro tipo viram nulo, e a pagina existe sem a linha de endereco.
      endereco: EnderecoComercialDaEntrada.doJson(json),
    );
  }

  /// `kinds` do contrato, com o `kind` singular como RESERVA.
  ///
  /// Ver [atividades] para o porque de cada decisao. Em resumo, e nesta ordem:
  ///
  /// 1. `kinds` quando vem como lista -- os codigos conhecidos, na ordem do
  ///    servidor, sem repetir;
  /// 2. o `kind` singular quando `kinds` nao veio (servidor mais velho que o
  ///    app, massa escrita antes de 21/10/2026);
  /// 3. lista VAZIA quando nenhum dos dois deu nada conhecido.
  ///
  /// **`kinds` presente e com valor conhecido nunca cai no singular**, e e por
  /// isso que a reserva olha a LISTA e nao o resultado: `kinds: ['frobnicator']`
  /// de um servidor novo significa *"a atividade desta entrada e uma que voce
  /// nao conhece"*, e cair no `kind` ali mostraria a atividade de
  /// compatibilidade como se fosse a lista inteira.
  ///
  /// **O `dedup` nao e zelo contra o contrato, e sim contra a juncao com a
  /// reserva**: `uniqueItems` ja promete que `kinds` nao repete, mas dois
  /// codigos distintos que este build nao conhece poderiam, no futuro,
  /// colapsar no mesmo valor de `enum` -- e duas tags iguais na tela sao um
  /// defeito visivel.
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
///
/// **Nao ha identificador do autor, de nenhuma forma** -- nem conta, nem
/// `slug`, nem ref estavel entre locais. [ref] identifica a AVALIACAO e e
/// sorteado por linha: duas avaliacoes da mesma pessoa em locais diferentes
/// nao tem nada em comum na resposta. A BICHUS-174 proibe expor vinculo entre
/// duas pessoas "inclusive como contagem e como existencia", e um ref de autor
/// permitiria montar o historico de qualquer um. **Nao invente aqui o campo
/// que o contrato se esforcou para nao ter.**
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

  /// O identificador opaco da avaliacao, usado pela denuncia. **Nao e UUID**
  /// (ADR-0010 item 6) e nao e derivado do autor.
  final String ref;

  /// A nota, inteira de 1 a 5. **Nunca nula: a nota E a avaliacao.**
  final int nota;

  /// A recomendacao em texto, ou nulo. **Nulo e estado normal e frequente**: o
  /// texto e opcional e dar so a nota tem de funcionar. A tela mostra o item
  /// com as estrelas e sem paragrafo.
  final String? texto;

  /// O nome de exibicao de quem escreveu, **ou nulo**. Nulo e conta sem nome,
  /// que e estado normal. Ver [nomeDeQuemLe].
  final String? nomeDeQuemEscreveu;

  final DateTime criadaEm;

  /// Quando o autor editou pela ultima vez, ou nulo se nunca editou.
  final DateTime? editadaEm;

  /// Verdadeiro na avaliacao de quem chama. A tela a tira do fluxo e a mostra
  /// no bloco de edicao, com `Editar` e `Apagar` -- **o servidor nao manda um
  /// bloco separado**, e e por isso que esta marca existe.
  final bool minha;

  /// O nome que a tela escreve.
  ///
  /// Conta sem nome de exibicao e estado normal, e a linha **nao fica muda**:
  /// um item de avaliacao sem nome nenhum parece defeito de carregamento.
  static const String semNome = 'Alguém da comunidade';

  String get nomeDeQuemLe {
    final nome = nomeDeQuemEscreveu;
    if (nome == null || nome.trim().isEmpty) return semNome;
    return nome;
  }

  /// A avaliacao foi editada depois de publicada, e a tela **diz isso**.
  bool get foiEditada => editadaEm != null;

  /// A data que a tela mostra: a de edicao quando houve edicao, a de
  /// publicacao quando nao houve.
  ///
  /// `dd/MM/aaaa`, com `toLocal()` porque as duas chegam em UTC e quem le esta
  /// num fuso. Sem `intl`: o pacote nao esta no `pubspec` e uma dependencia
  /// nova por uma linha de texto e custo que esta tela nao pede.
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
      // Ausente vira falso: tratar como minha a avaliacao de outra pessoa
      // ofereceria `Apagar` sobre o texto de um estranho.
      minha: minha is bool ? minha : false,
      texto: (texto == null || texto.trim().isEmpty) ? null : texto,
      nomeDeQuemEscreveu: json['author_display_name'] as String?,
      editadaEm: DateTime.tryParse(json['edited_at'] as String? ?? ''),
    );
  }
}

/// `#/paths/~1directory~1entries~1{slug}~1reviews/get/parameters/0/schema` — a
/// ordem da lista.
///
/// `recentes` e o padrao, e e o padrao de proposito (contrato): numa pagina sem
/// historico a avaliacao de ontem informa mais do que a melhor de 2026.
///
/// **Nao ha "mais util"**: nao ha voto de utilidade neste produto, e oferecer a
/// ordem sem o voto ordenaria por nada.
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
  /// Dois numeros diferentes na mesma tela e o defeito que a duplicacao de
  /// recorte produz, e e por isso que a tela nao soma nada por conta propria.
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
///
/// **[criada] e o que escolhe a frase.** `PUT` grava a primeira e atualiza a
/// que ja existia pelo mesmo caminho, e sem este campo a tela teria de
/// adivinhar pelo estado anterior -- que e exatamente o estado que pode estar
/// velho.
///
/// **[pontuacao] vem na mesma resposta de proposito**: ja com esta avaliacao
/// dentro. Uma segunda chamada so para atualizar a media deixaria a media
/// velha na tela no dia em que ela falhasse.
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
///
/// **Lista fechada e nao texto livre**, pelo mesmo desenho de
/// `conversation_reports`: a fila de moderacao precisa ser triada, e campo
/// livre nao tria. O detalhe opcional existe para o caso que a lista nao
/// cobre.
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
///
/// **A nota e obrigatoria e o texto e opcional** (decisao do cliente, 18/10).
/// Texto vazio ou so com espaco **nao vai**: o servidor trata como ausente e
/// grava nulo, e mandar `''` criaria duas representacoes de "sem texto" que
/// toda tela futura teria de conhecer.
Map<String, dynamic> corpoDaAvaliacao({required int nota, String? texto}) {
  final limpo = texto?.trim();
  return <String, dynamic>{
    'rating': nota,
    if (limpo != null && limpo.isNotEmpty) 'body': limpo,
  };
}

/// O limite do corpo da avaliacao, **que e o limite da COLUNA e nao um numero
/// de tela**: o `CHECK` em `professional_reviews.body` recusa 1501, e texto
/// maior leva 400. O contador da tela sai daqui.
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

/// `#/components/schemas/MyDirectorySuggestion` do contrato: uma indicacao
/// como **quem a fez** a ve.
///
/// ## Nao e `ReciboDaSugestao`, e nao e a projecao do painel
///
/// O recibo e o instante do envio e nada mais -- `referencia`, `estado` e
/// `criadaEm`. Este modelo e o que a tela `Minhas indicacoes` mostra depois:
/// o estado atual, o motivo quando recusada e o caminho para o `Perto` quando
/// a entrada esta no ar.
///
/// **`note` nao esta aqui porque o contrato nao o devolve.** O recado e para
/// quem revisa; quem o le e o painel. Nao e esquecimento, e a fronteira.
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

  /// O identificador opaco, 128 bits em base64url. **Nao e UUID**
  /// (ADR-0010 item 6), e e o MESMO que o recibo do envio devolveu.
  final String referencia;

  final String nome;
  final AtividadeDoDiretorio atividade;

  /// O QUE a entidade indicada E -- eixo SEPARADO de [atividade], que e o que
  /// ela FAZ (contrato, 29/10/2026, pedido do cliente: *"esta faltando o campo
  /// se e um profissional, ong ou estabelecimento"*).
  ///
  /// **Anulavel, pela MESMA razao de `TipoDeEntidade.porCodigo` devolver nulo:**
  /// o `enum` do contrato e aditivo, e o dia em que ele ganhar um terceiro
  /// valor esta versao do app precisa continuar lendo a resposta. O campo e
  /// `required` no contrato -- a coluna e `NOT NULL DEFAULT 'professional'` --,
  /// entao nulo aqui quer dizer "valor que esta versao nao conhece", e nao
  /// "ausente".
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
  ///
  /// **Ele chega a quem indicou desde 18/10/2026**, e isso reverte o que o
  /// contrato dizia antes. Nulo em tudo que nao foi recusado.
  final String? motivoDaRecusa;

  /// O caminho da entrada no `Perto`, **e so quando ela esta publicada**.
  ///
  /// **Nulo com [estado] `approved` TEM significado, e nao e dado faltando:**
  /// a entrada existe e esta em rascunho. Entrada nascida de indicacao com
  /// contato de site ou Instagram nasce rascunho (ela nao tem telefone, que e
  /// o canal unico do diretorio), e o `Perto` so lista o que esta publicado.
  ///
  /// **Quem decide isso e o servidor**, na funcao `indicacoes_do_autor`: esta
  /// tela nao reavalia publicacao, e por isso ela nao pode oferecer um caminho
  /// que o servidor nao deu. Aprovada sem `entradaSlug` e dita com palavras.
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

    // **Reprova em voz alta em vez de desenhar um cartao pela metade.** Campo
    // obrigatorio ausente e resposta fora do contrato, e a tela trata
    // `FormatException` como falha -- nao como lista vazia, que pareceria
    // "voce nunca indicou nada".
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
///
/// Sem `pending_total`: aquele numero e o aviso do menu do PAINEL, e nao tem
/// sentido na tela de quem indicou.
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

  /// Quantas indicacoes a conta tem AO TODO, e nao quantas vieram nesta
  /// pagina: e ele que alimenta "Mostrando 1 a 20 de 87".
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
