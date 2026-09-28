/// Os modelos da secao `Rede`: a agenda de encontros de
/// `GET /v1/network/events`.
///
/// **LEIA O ADR-0025 ANTES DE MEXER AQUI.** As ausencias deste arquivo sao o
/// conteudo dele, e cada uma fecha uma inferencia.
///
/// ## Nao existe pessoa neste arquivo, em forma nenhuma
///
/// Nao ha classe de participante, nao ha lista, nao ha nome, apelido, avatar
/// nem `slug` de pessoa.
///
/// ## Nao existe check-in nem galeria nesta versao
///
/// BICHUS-251, decisao do cliente de 23/09/2026: a confirmacao de presenca e a
/// galeria de fotos saem do app antes do merge. A resposta do contrato ainda
/// pode trazer `checkin_count`, `photo_count`, `gallery` e `viewer_checked_in`,
/// e **nenhum deles e lido aqui**: um campo lido e o convite para alguem
/// desenha-lo. A versao com os quatro esta na branch
/// `guarda/rede-checkin-galeria`.
///
/// Nao ha UUID: `slug` e a chave primaria das duas tabelas publicas da secao.
///
/// ## Nao existe coordenada, e por isso nao existe distancia
///
/// [LugarDoEncontro] sao quatro rotulos de texto. Nao ha latitude, longitude,
/// CEP nem logradouro, em precisao nenhuma e em arredondamento nenhum
/// (ADR-0006 e ADR-0010 item 2). [OrdemDaRede] por isso tem **duas** opcoes, e
/// nenhuma delas e distancia.
///
/// ## A situacao do encontro vem PRONTA do servidor
///
/// [SituacaoDoEncontro] e lida de `status`, e **nao e calculada aqui**. Um
/// `DateTime.now().isBefore(...)` neste arquivo chamaria de `upcoming` um
/// encontro de tres semanas atras num aparelho com o relogio errado, e a
/// correcao passaria pela loja de aplicativos.
///
/// ## A hora e de PAREDE, e o Dart nao tem base IANA
///
/// Ver [FusoDoEvento]: a resolucao do deslocamento e o unico lugar deste
/// arquivo em que ha uma tabela escrita a mao, e o cabecalho dela explica por
/// que ela existe e ate onde ela vale.
library;

import 'dart:collection';

/// O recorte no tempo da agenda, espelhado de `NetworkEventWhen`.
///
/// `all` existe e **nao e o default**: uma lista que mistura passado e futuro
/// sem dizer qual e qual e o defeito mais comum de agenda.
enum QuandoDaRede {
  aVir('upcoming', 'Ainda vão acontecer'),
  passados('past', 'Já aconteceram'),
  todos('all', 'Todos os encontros');

  const QuandoDaRede(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static QuandoDaRede? porCodigo(String? codigo) {
    if (codigo == null) return null;
    for (final q in QuandoDaRede.values) {
      if (q.codigo == codigo) return q;
    }
    return null;
  }
}

/// A ordem da agenda, espelhada de `NetworkEventSort`.
///
/// **Sao duas, e as ausencias sao decisao.** Nao ha ordem por distancia
/// (ADR-0025 secao 5: sem coordenada nao ha distancia, e uma ordem que nunca
/// podera ser cumprida e pior que uma que nao e oferecida) e nao ha ordem por
/// numero de presencas (ela transformaria a contagem numa disputa e daria a
/// quem enche a contagem o topo da agenda).
enum OrdemDaRede {
  proximos('proximos', 'Data mais próxima'),
  recentes('recentes', 'Mais recente primeiro');

  const OrdemDaRede(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static OrdemDaRede? porCodigo(String? codigo) {
    if (codigo == null) return null;
    for (final o in OrdemDaRede.values) {
      if (o.codigo == codigo) return o;
    }
    return null;
  }
}

/// Em que ponto o encontro esta, **segundo o servidor**.
///
/// [porCodigo] devolve nulo para codigo desconhecido, e isso e deliberado:
/// aqui nao existe valor seguro para onde cair. Cair em [aVir] chamaria de
/// proximo o que passou; cair em [encerrado] daria por encerrado o que ainda
/// vai acontecer. Os dois seriam uma AFIRMACAO inventada sobre a data, que e
/// exatamente o que o ADR-0025 tirou do aplicativo. Nulo faz o cartao **nao
/// dizer nada** sobre a situacao, e nao dizer e o unico desfecho honesto de
/// uma resposta que este app nao entende.
enum SituacaoDoEncontro {
  aVir('upcoming'),
  acontecendo('happening'),
  encerrado('ended');

  const SituacaoDoEncontro(this.codigo);

  final String codigo;

  static SituacaoDoEncontro? porCodigo(String? codigo) {
    if (codigo == null) return null;
    for (final s in SituacaoDoEncontro.values) {
      if (s.codigo == codigo) return s;
    }
    return null;
  }
}

/// O lugar do encontro, **em rotulo e nunca em coordenada**.
///
/// Quatro campos de texto, e a precisao para no bairro, que e o teto que o
/// ADR-0010 declara para superficie publica. `place_name` e o nome do lugar
/// publico como as pessoas o chamam -- e nao logradouro, numero nem CEP, que
/// sao endereco.
class LugarDoEncontro {
  const LugarDoEncontro({
    required this.nomeDoLugar,
    required this.bairro,
    required this.cidade,
    required this.uf,
  });

  final String nomeDoLugar;
  final String bairro;
  final String cidade;
  final String uf;

  /// `Praça Benedito Calixto · Pinheiros · São Paulo, SP`.
  String get linha => '$nomeDoLugar · $bairro · $cidade, $uf';

  static LugarDoEncontro doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) {
      throw const FormatException('encontro sem `place`');
    }
    final nome = bruto['place_name'];
    final bairro = bruto['neighborhood'];
    final cidade = bruto['city'];
    final uf = bruto['state'];
    if (nome is! String ||
        bairro is! String ||
        cidade is! String ||
        uf is! String) {
      throw const FormatException(
        '`place` sem place_name, neighborhood, city ou state',
      );
    }
    return LugarDoEncontro(
      nomeDoLugar: nome,
      bairro: bairro,
      cidade: cidade,
      uf: uf,
    );
  }
}

// ---------------------------------------------------------------------------
// O FUSO DO EVENTO
// ---------------------------------------------------------------------------

/// O deslocamento de fuso com que a hora do encontro e desenhada, e de onde
/// ele saiu.
///
/// ## O problema, e ele nao e teorico
///
/// `starts_at` e um instante absoluto e `time_zone` e o nome IANA da zona. A
/// hora que o cartaz da praca diz **nao esta no instante**: um aparelho
/// configurado em UTC renderizaria um encontro das 9h como 12h, sem nada
/// acusar. `DateTime.toLocal()` resolve o fuso do APARELHO, que e a pergunta
/// errada -- a pergunta e o fuso do EVENTO.
///
/// **O Dart nao embarca a base IANA.** Nao ha `TimeZone` na biblioteca padrao,
/// e o `intl` que vem com `flutter_localizations` traz formatacao, nao a base
/// de zonas. Resolver o nome IANA de verdade exigiria o pacote `timezone`, que
/// este `pubspec.yaml` nao declara e que nao foi acrescentado aqui.
///
/// ## A resolucao, em tres degraus e nesta ordem
///
/// 1. **A tabela de zonas do Brasil** ([_zonasDoBrasil]). Ela ganha dos
///    outros dois de proposito: o nome IANA e a zona do EVENTO, enquanto o
///    deslocamento escrito em `starts_at` e o da sessao que serializou a
///    resposta. Se o servidor serializar tudo em `-03:00`, um encontro em
///    Manaus sairia uma hora adiantado por esse caminho -- e sairia certo por
///    este.
/// 2. **O deslocamento escrito no proprio `starts_at`**, quando ele e
///    numerico (`2026-10-04T09:00:00-03:00`). Vale para zona fora da tabela, e
///    e um sinal mais fraco pelo motivo do degrau 1.
/// 3. **UTC**, e entao [conhecido] e falso e o rotulo diz `horário UTC` por
///    extenso. **Nao ha degrau que invente uma hora**: quando o app nao sabe o
///    fuso, ele diz qual fuso usou, em vez de apresentar como hora de parede um
///    numero que nao e.
///
/// ## Ate onde a tabela vale
///
/// As zonas brasileiras **nao observam horario de verao desde 2019** (Decreto
/// 9.772/2019), entao um deslocamento fixo por zona e exato para qualquer
/// instante posterior. Se o horario de verao voltar, esta tabela passa a errar
/// uma hora em parte do ano e o conserto e o pacote `timezone` -- que e
/// decisao de dependencia, e nao de tela.
class FusoDoEvento {
  const FusoDoEvento({
    required this.nomeIana,
    required this.deslocamento,
    required this.conhecido,
    required this.rotulo,
  });

  /// O nome IANA como o servidor o mandou.
  final String nomeIana;

  /// O quanto somar ao instante absoluto para chegar a hora de parede.
  final Duration deslocamento;

  /// O app soube resolver a zona. Falso significa que [deslocamento] e zero e
  /// que [rotulo] diz `horário UTC`.
  final bool conhecido;

  /// Como a tela nomeia o fuso ao lado da hora: `horário de São Paulo`,
  /// `horário UTC−03:00` ou `horário UTC`.
  final String rotulo;

  /// As dezesseis zonas IANA do Brasil, com o deslocamento fixo e o rotulo em
  /// portugues.
  ///
  /// A lista e COMPLETA de proposito: uma tabela com "as que importam" e a que
  /// erra em silencio no dia em que um encontro for marcado em Boa Vista.
  static const Map<String, (int, String)> _zonasDoBrasil = <String, (int, String)>{
    'America/Sao_Paulo': (-3, 'São Paulo'),
    'America/Bahia': (-3, 'Salvador'),
    'America/Fortaleza': (-3, 'Fortaleza'),
    'America/Recife': (-3, 'Recife'),
    'America/Maceio': (-3, 'Maceió'),
    'America/Belem': (-3, 'Belém'),
    'America/Santarem': (-3, 'Santarém'),
    'America/Araguaina': (-3, 'Araguaína'),
    'America/Noronha': (-2, 'Fernando de Noronha'),
    'America/Manaus': (-4, 'Manaus'),
    'America/Boa_Vista': (-4, 'Boa Vista'),
    'America/Porto_Velho': (-4, 'Porto Velho'),
    'America/Cuiaba': (-4, 'Cuiabá'),
    'America/Campo_Grande': (-4, 'Campo Grande'),
    'America/Rio_Branco': (-5, 'Rio Branco'),
    'America/Eirunepe': (-5, 'Eirunepé'),
  };

  /// O deslocamento escrito no fim de um `date-time` do RFC 3339.
  ///
  /// Devolve nulo para `Z` e para texto sem deslocamento: os dois dizem que o
  /// instante foi normalizado, e normalizado nao carrega hora de parede.
  static Duration? deslocamentoEscritoEm(String iso) {
    final casou = RegExp(r'([+-])(\d{2}):?(\d{2})$').firstMatch(iso);
    if (casou == null) return null;
    final sinal = casou.group(1) == '-' ? -1 : 1;
    final horas = int.parse(casou.group(2)!);
    final minutos = int.parse(casou.group(3)!);
    return Duration(minutes: sinal * (horas * 60 + minutos));
  }

  /// Resolve o fuso pelos tres degraus, nesta ordem.
  static FusoDoEvento resolver({
    required String nomeIana,
    required String inicioEmIso,
  }) {
    final doBrasil = _zonasDoBrasil[nomeIana];
    if (doBrasil != null) {
      return FusoDoEvento(
        nomeIana: nomeIana,
        deslocamento: Duration(hours: doBrasil.$1),
        conhecido: true,
        rotulo: 'horário de ${doBrasil.$2}',
      );
    }

    final escrito = deslocamentoEscritoEm(inicioEmIso);
    if (escrito != null) {
      return FusoDoEvento(
        nomeIana: nomeIana,
        deslocamento: escrito,
        conhecido: true,
        // Sem nome em portugues para uma zona que a tabela nao conhece, o
        // rotulo vira o proprio deslocamento -- que e exato e nao precisa de
        // base de dados nenhuma.
        rotulo: 'horário ${_utcComSinal(escrito)}',
      );
    }

    return FusoDoEvento(
      nomeIana: nomeIana,
      deslocamento: Duration.zero,
      conhecido: false,
      rotulo: 'horário UTC',
    );
  }

  /// `UTC−03:00`. O sinal e o **menos tipografico**, e nao o hifen: a tela
  /// mostra isto ao lado de uma hora, e o hifen ali le como tracinho.
  static String _utcComSinal(Duration deslocamento) {
    final negativo = deslocamento.isNegative;
    final absoluto = deslocamento.abs();
    final horas = absoluto.inHours.toString().padLeft(2, '0');
    final minutos = (absoluto.inMinutes % 60).toString().padLeft(2, '0');
    return 'UTC${negativo ? '−' : '+'}$horas:$minutos';
  }
}

/// A data e a hora de um encontro, ja resolvidas no fuso do EVENTO.
///
/// O instante fica guardado em UTC e a hora de parede sai de
/// `instante + deslocamento`, lida nos campos UTC do resultado. Nao ha
/// `toLocal()` em lugar nenhum deste arquivo: ele responderia sobre o aparelho.
class DataDoEncontro {
  const DataDoEncontro({required this.instante, required this.fuso});

  /// O instante absoluto, em UTC.
  final DateTime instante;

  final FusoDoEvento fuso;

  /// A hora de parede, como um `DateTime` marcado UTC cujos campos ja sao os
  /// do fuso do evento. **Nao use `instante` para ler hora**, e nao use este
  /// para comparar com agora.
  DateTime get parede => instante.add(fuso.deslocamento);

  /// `4 de outubro de 2026, 9h · horário de São Paulo`.
  ///
  /// O ano entra sempre: numa agenda que abre tambem no passado, `4 de
  /// outubro` sozinho nao distingue o encontro do ano que vem do de tres anos
  /// atras.
  ///
  /// O rotulo do fuso entra **sempre**, e nao so quando o aparelho esta fora
  /// dele. Mostra-lo condicionalmente faria a mesma tela dizer coisas
  /// diferentes em aparelhos diferentes, e o unico jeito de descobrir o
  /// defeito seria ter os dois aparelhos em maos.
  String get porExtenso => '$dataPorExtenso, $horaPorExtenso · ${fuso.rotulo}';

  /// `4 de outubro de 2026`.
  String get dataPorExtenso {
    final p = parede;
    return '${p.day} de ${_meses[p.month - 1]} de ${p.year}';
  }

  /// `9h` quando o minuto e zero, `9h30` quando nao e.
  ///
  /// `9h00` nao: em portugues do Brasil a hora cheia se escreve sem os
  /// minutos, e `9h00` e a forma que vaza de quem formatou em ingles.
  String get horaPorExtenso {
    final p = parede;
    if (p.minute == 0) return '${p.hour}h';
    return '${p.hour}h${p.minute.toString().padLeft(2, '0')}';
  }

  static const List<String> _meses = <String>[
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];

  /// Le `starts_at` e `time_zone` juntos. Os dois, e nao um.
  static DataDoEncontro doJson({
    required String inicioEmIso,
    required String nomeIana,
  }) {
    return DataDoEncontro(
      instante: DateTime.parse(inicioEmIso).toUtc(),
      fuso: FusoDoEvento.resolver(
        nomeIana: nomeIana,
        inicioEmIso: inicioEmIso,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// O ENCONTRO
// ---------------------------------------------------------------------------

/// Um encontro da agenda, no formato de `NetworkEventSummary`.
///
/// **Nao ha nenhum campo com pessoas**, e nesta versao nao ha nem a contagem
/// de presencas: sem check-in no app, um numero de confirmados seria um numero
/// que ninguem aqui consegue mudar.
///
/// E tambem o formato de `NetworkEvent`, o detalhe: os campos a mais daquela
/// resposta sao da galeria e do check-in, e nao sao lidos.
class EncontroDaRede {
  const EncontroDaRede({
    required this.slug,
    required this.titulo,
    required this.resumo,
    required this.lugar,
    required this.comeca,
    required this.situacao,
    required this.urlDaCapa,
  });

  final String slug;
  final String titulo;
  final String resumo;
  final LugarDoEncontro lugar;

  /// Quando ele comeca, ja no fuso do evento.
  final DataDoEncontro comeca;

  /// Nula quando o servidor mandou um `status` que este app nao conhece. Ver
  /// [SituacaoDoEncontro.porCodigo] para por que nao ha valor de fallback.
  final SituacaoDoEncontro? situacao;

  /// Ausencia e estado normal, e nao lacuna: o cartao sabe se desenhar sem ela.
  final String? urlDaCapa;

  static EncontroDaRede doJson(Map<String, dynamic> json) {
    final slug = json['slug'];
    final titulo = json['title'];
    final resumo = json['summary'];
    final inicio = json['starts_at'];
    final zona = json['time_zone'];
    if (slug is! String ||
        titulo is! String ||
        resumo is! String ||
        inicio is! String ||
        zona is! String) {
      throw const FormatException(
        'encontro sem slug, title, summary, starts_at ou time_zone',
      );
    }
    final capa = json['cover_image_url'];
    return EncontroDaRede(
      slug: slug,
      titulo: titulo,
      resumo: resumo,
      lugar: LugarDoEncontro.doJson(json['place']),
      comeca: DataDoEncontro.doJson(inicioEmIso: inicio, nomeIana: zona),
      situacao: SituacaoDoEncontro.porCodigo(json['status'] as String?),
      urlDaCapa: capa is String ? capa : null,
    );
  }
}

/// Uma pagina da agenda.
class PaginaDaRede {
  const PaginaDaRede({
    required this.itens,
    required this.pagina,
    required this.limite,
    required this.total,
    required this.ordemEfetiva,
    required this.quandoEfetivo,
    required this.filtrosAplicados,
  });

  final List<EncontroDaRede> itens;
  final int pagina;
  final int limite;
  final int total;

  /// **A ordem em que a lista de fato saiu**, lida de `effective_sort`.
  ///
  /// Aqui ela nao e decoracao: o default de `sort` no servidor DEPENDE de
  /// `when`, entao uma tela que nao mandou `sort` **nao tem como saber** qual
  /// ordem valeu sem este campo. Ler a ordem do proprio estado local faria a
  /// tela afirmar a pedida sobre uma lista que saiu em outra.
  final OrdemDaRede ordemEfetiva;

  /// O recorte de tempo que valeu, lido de `effective_when`, pelo mesmo motivo.
  final QuandoDaRede quandoEfetivo;

  final Map<String, String> filtrosAplicados;

  /// As cidades que aparecem nesta pagina, sem repetir e em ordem.
  ///
  /// Serve ao filtro de cidade, que e por **rotulo digitado** no contrato e
  /// nao tem rota que liste cidades. Ver `AgendaDaRede` para o que a tela faz
  /// com isto e para o que ela diz a quem le.
  Set<String> get cidades {
    final achadas = SplayTreeSet<String>();
    for (final item in itens) {
      achadas.add(item.lugar.cidade);
    }
    return achadas;
  }

  static PaginaDaRede doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException('resposta da agenda sem `items`');
    }
    final ordem = OrdemDaRede.porCodigo(json['effective_sort'] as String?);
    if (ordem == null) {
      // A barra de listagem mostra a ordem REAL e nao tem como mostrar uma que
      // nao existe. Uma resposta sem `effective_sort` -- ou com um codigo que
      // este app nao conhece -- e resposta fora do contrato, e o desfecho dela
      // e o estado de falha da tela, nao um palpite de ordem.
      throw const FormatException(
        'resposta da agenda sem `effective_sort` reconhecivel',
      );
    }
    final quando = QuandoDaRede.porCodigo(json['effective_when'] as String?);
    if (quando == null) {
      throw const FormatException(
        'resposta da agenda sem `effective_when` reconhecivel',
      );
    }
    final filtros = <String, String>{};
    final brutos = json['applied_filters'];
    if (brutos is Map) {
      brutos.forEach((chave, valor) {
        if (chave is String && valor is String) filtros[chave] = valor;
      });
    }
    return PaginaDaRede(
      itens: <EncontroDaRede>[
        for (final bruto in itens)
          if (bruto is Map<String, dynamic>) EncontroDaRede.doJson(bruto),
      ],
      pagina: json['page'] as int? ?? 1,
      limite: json['limit'] as int? ?? 20,
      total: json['total'] as int? ?? 0,
      ordemEfetiva: ordem,
      quandoEfetivo: quando,
      filtrosAplicados: filtros,
    );
  }
}

/// O recorte pedido a rota.
///
/// ## [quando] e [ordem] sao NULAVEIS, e isso e o ponto
///
/// Nulo quer dizer **"nao mandei o parametro"**, e nao "mandei o default". A
/// diferenca e o motivo de `effective_sort` e `effective_when` existirem: o
/// default de `sort` no servidor depende de `when`, entao a tela que nao
/// escolheu nao pode adivinhar em que ordem a lista saiu -- ela le a resposta.
///
/// Se a tela mandasse `sort=proximos` de saida, `effective_sort` voltaria
/// sempre igual ao pedido e o campo viraria enfeite, junto com a unica coisa
/// que ele prova.
class RecorteDaRede {
  const RecorteDaRede({
    this.termo,
    this.cidade,
    this.quando,
    this.ordem,
    this.pagina = 1,
    this.limite = 20,
  });

  final String? termo;
  final String? cidade;
  final QuandoDaRede? quando;
  final OrdemDaRede? ordem;
  final int pagina;
  final int limite;

  /// Quantos GRUPOS de filtro estao ativos. A busca **nao** conta aqui: ela e
  /// um controle proprio, e a barra de listagem ja a considera por conta
  /// propria ao decidir se o recorte esta ativo.
  int get quantidadeDeFiltros =>
      (quando == null ? 0 : 1) + (cidade == null ? 0 : 1);

  /// A pessoa recortou a agenda de alguma forma -- por filtro ou por busca.
  bool get temRecorte =>
      quantidadeDeFiltros > 0 || (termo != null && termo!.trim().isNotEmpty);

  Map<String, String> get query => <String, String>{
        if (termo != null && termo!.trim().isNotEmpty) 'q': termo!.trim(),
        if (cidade != null && cidade!.trim().isNotEmpty) 'city': cidade!.trim(),
        if (quando != null) 'when': quando!.codigo,
        if (ordem != null) 'sort': ordem!.codigo,
        'page': '$pagina',
        'limit': '$limite',
      };

  /// [limparOrdem] existe para o caso de trocar o `Quando`.
  ///
  /// Trocar o recorte de tempo **devolve a ordem ao servidor**: o default de
  /// `sort` depende de `when`, e quem pede `past` esta perguntando "o que
  /// houve", que se responde de tras para frente. Carregar para `past` a ordem
  /// que valia em `upcoming` entregaria a lista invertida sem ninguem ter
  /// pedido.
  RecorteDaRede com({
    String? termo,
    String? cidade,
    QuandoDaRede? quando,
    OrdemDaRede? ordem,
    int? pagina,
    bool limparTermo = false,
    bool limparCidade = false,
    bool limparQuando = false,
    bool limparOrdem = false,
  }) {
    return RecorteDaRede(
      termo: limparTermo ? null : (termo ?? this.termo),
      cidade: limparCidade ? null : (cidade ?? this.cidade),
      quando: limparQuando ? null : (quando ?? this.quando),
      ordem: limparOrdem ? null : (ordem ?? this.ordem),
      pagina: pagina ?? this.pagina,
      limite: limite,
    );
  }
}
