/// Os modelos da secao `Loja`: a vitrine curada de `GET /v1/store/items`.
///
/// ## O preco chega em CENTAVOS, e sai daqui em texto
///
/// `price_amount` e um inteiro de centavos. Ele nunca vira `double` neste
/// arquivo: ponto flutuante para dinheiro erra na soma e o erro aparece meses
/// depois, num total que ninguem confere. A conversao para texto e feita por
/// divisao inteira, e o resultado e uma `String` -- que e o unico tipo que a
/// tela precisa.
///
/// ## O servidor ja omitiu o que venceu
///
/// Quando `price_status` e `vencido`, `price_amount` **nao vem**. Nao ha nada
/// a esconder aqui, e nao existe caminho neste arquivo que reconstrua um valor
/// vencido: o que nao chegou nao pode ser remontado por build nenhum, que e
/// exatamente a razao de a regra morar no servidor.
library;

/// A categoria de um item, espelhada do `enum` `StoreCategory` do contrato.
enum CategoriaDaLoja {
  alimento('food', 'Alimentação'),
  brinquedo('toy', 'Brinquedo'),
  higiene('hygiene', 'Higiene'),
  acessorio('accessory', 'Acessório'),
  saude('health', 'Saúde'),
  cama('bed', 'Cama e conforto');

  const CategoriaDaLoja(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static CategoriaDaLoja? porCodigo(String? codigo) {
    if (codigo == null) return null;
    for (final c in CategoriaDaLoja.values) {
      if (c.codigo == codigo) return c;
    }
    return null;
  }
}

/// Os tres estados de preco. **Tres, e nao dois.**
///
/// `semPreco` e `vencido` produzem a mesma ausencia de numero e pedem textos
/// diferentes: um item que nunca teve preco nao mostra linha nenhuma, e um com
/// preco vencido diz que o preco nao esta confirmado e aponta o parceiro. Um
/// booleano faria a tela escolher uma frase so para os dois casos.
enum EstadoDoPreco {
  vigente('vigente'),
  vencido('vencido'),
  semPreco('sem_preco');

  const EstadoDoPreco(this.codigo);

  final String codigo;

  static EstadoDoPreco porCodigo(String? codigo) {
    for (final e in EstadoDoPreco.values) {
      if (e.codigo == codigo) return e;
    }
    // Estado desconhecido cai em `semPreco`, que e o estado que **nao mostra
    // numero**. Cair em `vigente` faria uma resposta que este app nao entende
    // virar um preco na tela.
    return EstadoDoPreco.semPreco;
  }
}

/// O parceiro que vende o item. Sem UUID: `slug` e a chave.
class ParceiroDaLoja {
  const ParceiroDaLoja({
    required this.slug,
    required this.nome,
    required this.host,
  });

  final String slug;
  final String nome;

  /// So o host. E o que deixa a tela nomear o destino antes da saida.
  final String host;

  static ParceiroDaLoja doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) {
      throw const FormatException('item da vitrine sem `partner`');
    }
    final slug = bruto['slug'];
    final nome = bruto['name'];
    final host = bruto['host'];
    if (slug is! String || nome is! String || host is! String) {
      throw const FormatException('`partner` sem slug, name ou host');
    }
    return ParceiroDaLoja(slug: slug, nome: nome, host: host);
  }
}

/// Um item da vitrine.
class ItemDaLoja {
  const ItemDaLoja({
    required this.slug,
    required this.titulo,
    required this.resumo,
    required this.categoria,
    required this.urlDaImagem,
    required this.urlDeDestino,
    required this.parceiro,
    required this.precoEmCentavos,
    required this.consultadoEm,
    required this.estadoDoPreco,
  });

  final String slug;
  final String titulo;
  final String resumo;
  final CategoriaDaLoja? categoria;
  final String? urlDaImagem;
  final String urlDeDestino;
  final ParceiroDaLoja parceiro;

  /// **Centavos, inteiro.** Nulo quando nao ha preco e quando ele venceu.
  final int? precoEmCentavos;

  /// `AAAA-MM-DD`, como o servidor a manda. Nula junto com o valor.
  final String? consultadoEm;

  final EstadoDoPreco estadoDoPreco;

  /// O preco formatado em portugues do Brasil, ou nulo.
  ///
  /// Nulo quando nao ha valor, e a tela **nao** desenha a linha. Nao existe
  /// "preço sob consulta" nem espaço reservado vazio.
  String? get precoFormatado {
    final centavos = precoEmCentavos;
    if (centavos == null) return null;
    return formatarReais(centavos);
  }

  /// A linha inteira do preco, que e a unica forma em que o valor aparece.
  ///
  /// **O numero nunca aparece sozinho.** O rotulo e a data sao parte do preco,
  /// nao enfeite dele, e nao ha estado da tela em que o valor apareca e a data
  /// nao (criterio 15 da BICHUS-185). Por isso esta e **uma** string: duas
  /// propriedades separadas permitiriam que alguem renderizasse so a primeira.
  String? get linhaDoPreco {
    final valor = precoFormatado;
    final data = consultadoEm;
    if (valor == null || data == null) return null;
    return '$valor · preço de referência, consultado em ${dataCurta(data)}';
  }

  static ItemDaLoja doJson(Map<String, dynamic> json) {
    final slug = json['slug'];
    final titulo = json['title'];
    final resumo = json['summary'];
    final destino = json['target_url'];
    if (slug is! String || titulo is! String || resumo is! String || destino is! String) {
      throw const FormatException('item da vitrine sem slug, title, summary ou target_url');
    }
    final preco = json['price_amount'];
    final data = json['price_checked_at'];
    final imagem = json['image_url'];
    return ItemDaLoja(
      slug: slug,
      titulo: titulo,
      resumo: resumo,
      categoria: CategoriaDaLoja.porCodigo(json['category'] as String?),
      urlDaImagem: imagem is String ? imagem : null,
      urlDeDestino: destino,
      parceiro: ParceiroDaLoja.doJson(json['partner']),
      precoEmCentavos: preco is int ? preco : null,
      consultadoEm: data is String ? data : null,
      estadoDoPreco: EstadoDoPreco.porCodigo(json['price_status'] as String?),
    );
  }
}

/// Centavos para `R$ 1.249,90`.
///
/// **Virgula decimal e ponto de milhar**, que e a ordem inversa da inglesa.
/// Trocar os dois e o defeito que passa despercebido em valores pequenos e
/// vira outro numero em valores grandes: `R$ 1,249.90` e mil vezes menos para
/// quem le rapido.
///
/// Os centavos sao sempre **dois digitos**: `R$ 100,00`, e nunca `R$ 100,0`
/// nem `R$ 100`. Um valor redondo sem os dois zeros parece truncado.
///
/// Divisao INTEIRA, sem passar por `double` em momento nenhum.
String formatarReais(int centavos) {
  final negativo = centavos < 0;
  final absoluto = centavos.abs();
  final reais = absoluto ~/ 100;
  final resto = absoluto % 100;
  final buffer = StringBuffer();
  final digitos = reais.toString();
  for (var i = 0; i < digitos.length; i++) {
    // O ponto de milhar entra a cada tres digitos contados **da direita**.
    if (i > 0 && (digitos.length - i) % 3 == 0) buffer.write('.');
    buffer.write(digitos[i]);
  }
  final centavosEmTexto = resto.toString().padLeft(2, '0');
  return '${negativo ? '-' : ''}R\$ $buffer,$centavosEmTexto';
}

/// `2026-03-14` para `14/03`.
///
/// Dia e mes, sem ano: a data de consulta de um preco que vence em trinta dias
/// nunca cruza o ano de forma que o ano acrescente informacao, e `14/03/2026`
/// numa linha que ja tem o valor e o rotulo e tres numeros disputando a mesma
/// leitura.
String dataCurta(String iso) {
  final partes = iso.split('-');
  if (partes.length < 3) return iso;
  return '${partes[2].padLeft(2, '0')}/${partes[1].padLeft(2, '0')}';
}

/// A ordem em que a vitrine sai.
enum OrdemDaLoja {
  curadoria('curadoria', 'Seleção do Bichu'),
  nome('nome', 'Nome');

  const OrdemDaLoja(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static OrdemDaLoja porCodigo(String? codigo) {
    for (final o in OrdemDaLoja.values) {
      if (o.codigo == codigo) return o;
    }
    return OrdemDaLoja.curadoria;
  }
}

/// Uma pagina da vitrine.
class PaginaDaLoja {
  const PaginaDaLoja({
    required this.itens,
    required this.pagina,
    required this.limite,
    required this.total,
    required this.ordemEfetiva,
    required this.filtrosAplicados,
  });

  final List<ItemDaLoja> itens;
  final int pagina;
  final int limite;
  final int total;

  /// **A ordem em que a lista esta**, lida da resposta e nao do estado local.
  ///
  /// A barra de listagem mostra a ordem REAL. Ler a ordem do proprio estado
  /// faria a tela afirmar a ordem pedida sobre uma lista que o servidor pode
  /// ter ordenado de outro jeito.
  final OrdemDaLoja ordemEfetiva;

  final Map<String, String> filtrosAplicados;

  static PaginaDaLoja doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException('resposta da vitrine sem `items`');
    }
    final filtros = <String, String>{};
    final brutos = json['applied_filters'];
    if (brutos is Map) {
      brutos.forEach((chave, valor) {
        if (chave is String && valor is String) filtros[chave] = valor;
      });
    }
    return PaginaDaLoja(
      itens: <ItemDaLoja>[
        for (final bruto in itens)
          if (bruto is Map<String, dynamic>) ItemDaLoja.doJson(bruto),
      ],
      pagina: json['page'] as int? ?? 1,
      limite: json['limit'] as int? ?? 20,
      total: json['total'] as int? ?? 0,
      ordemEfetiva: OrdemDaLoja.porCodigo(json['effective_sort'] as String?),
      filtrosAplicados: filtros,
    );
  }
}

/// O recorte pedido a rota.
class RecorteDaLoja {
  const RecorteDaLoja({
    this.termo,
    this.categoria,
    this.ordem = OrdemDaLoja.curadoria,
    this.pagina = 1,
    this.limite = 20,
  });

  final String? termo;
  final CategoriaDaLoja? categoria;
  final OrdemDaLoja ordem;
  final int pagina;
  final int limite;

  /// Quantos GRUPOS de filtro estao ativos. A busca **nao** conta aqui: ela e
  /// um controle proprio, e a barra de listagem ja a considera por conta
  /// propria ao decidir se o recorte esta ativo.
  int get quantidadeDeFiltros => categoria == null ? 0 : 1;

  /// A pessoa recortou a lista de alguma forma -- por filtro ou por busca.
  bool get temRecorte =>
      quantidadeDeFiltros > 0 || (termo != null && termo!.trim().isNotEmpty);

  Map<String, String> get query => <String, String>{
        if (termo != null && termo!.trim().isNotEmpty) 'q': termo!.trim(),
        if (categoria != null) 'category': categoria!.codigo,
        'sort': ordem.codigo,
        'page': '$pagina',
        'limit': '$limite',
      };

  RecorteDaLoja com({
    String? termo,
    CategoriaDaLoja? categoria,
    OrdemDaLoja? ordem,
    int? pagina,
    bool limparTermo = false,
    bool limparCategoria = false,
  }) {
    return RecorteDaLoja(
      termo: limparTermo ? null : (termo ?? this.termo),
      categoria: limparCategoria ? null : (categoria ?? this.categoria),
      ordem: ordem ?? this.ordem,
      pagina: pagina ?? this.pagina,
      limite: limite,
    );
  }
}
