/// Os modelos da secao `Loja`: a vitrine curada de `GET /v1/store/items`.
library;

import '../formato/dinheiro.dart';

export '../formato/dinheiro.dart' show formatarReais, reaisEmTexto;

/// Os rotulos que ESTE binario carrega para as seis categorias antigas.
const Map<String, String> rotulosLegadosDaCategoria = <String, String>{
  'food': 'Alimentação',
  'toy': 'Brinquedos',
  'hygiene': 'Higiene',
  'accessory': 'Acessórios',
  'health': 'Saúde',
  'bed': 'Cama e conforto',
};

/// Uma subcategoria do vocabulario (`StoreTaxonomySubcategory`).
class SubcategoriaDaLoja {
  const SubcategoriaDaLoja({required this.codigo, required this.rotulo});

  final String codigo;
  final String rotulo;

  static SubcategoriaDaLoja? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final codigo = bruto['code'];
    final rotulo = bruto['label'];
    if (codigo is! String || rotulo is! String) return null;
    return SubcategoriaDaLoja(codigo: codigo, rotulo: rotulo);
  }
}

/// Uma categoria do vocabulario, com as subcategorias dela
/// (`StoreTaxonomyCategory`).
class CategoriaDaLoja {
  const CategoriaDaLoja({
    required this.codigo,
    required this.rotulo,
    required this.subcategorias,
  });

  final String codigo;
  final String rotulo;

  /// **Vazia e estado normal.** A arvore de 17/10 e a de CACHORRO; categoria
  /// cuja arvore ainda nao foi levantada nao oferece segundo nivel.
  final List<SubcategoriaDaLoja> subcategorias;

  static CategoriaDaLoja? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final codigo = bruto['code'];
    final rotulo = bruto['label'];
    if (codigo is! String || rotulo is! String) return null;
    final brutas = bruto['subcategories'];
    return CategoriaDaLoja(
      codigo: codigo,
      rotulo: rotulo,
      subcategorias: <SubcategoriaDaLoja>[
        if (brutas is List)
          for (final b in brutas)
            if (SubcategoriaDaLoja.doJson(b) case final SubcategoriaDaLoja s) s,
      ],
    );
  }
}

/// O vocabulario dos dois niveis (`GET /v1/store/taxonomy`).
class TaxonomiaDaLoja {
  const TaxonomiaDaLoja({required this.categorias});

  static const TaxonomiaDaLoja vazia = TaxonomiaDaLoja(categorias: <CategoriaDaLoja>[]);

  final List<CategoriaDaLoja> categorias;

  CategoriaDaLoja? porCodigo(String? codigo) {
    if (codigo == null) return null;
    for (final c in categorias) {
      if (c.codigo == codigo) return c;
    }
    return null;
  }

  /// As subcategorias da categoria escolhida, **e so dela**.
  List<SubcategoriaDaLoja> subcategoriasDe(String? categoria) {
    if (categoria == null) return <SubcategoriaDaLoja>[];
    return porCodigo(categoria)?.subcategorias ?? <SubcategoriaDaLoja>[];
  }

  static TaxonomiaDaLoja doJson(Map<String, dynamic> json) {
    final brutas = json['categories'];
    if (brutas is! List) {
      throw const FormatException('resposta da taxonomia sem `categories`');
    }
    return TaxonomiaDaLoja(
      categorias: <CategoriaDaLoja>[
        for (final b in brutas)
          if (CategoriaDaLoja.doJson(b) case final CategoriaDaLoja c) c,
      ],
    );
  }
}

/// `#/components/schemas/StorePriceStatus` do contrato.
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
    return EstadoDoPreco.semPreco;
  }
}

/// O parceiro que vende o item.
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
    required this.rotuloDaCategoria,
    required this.subcategoria,
    required this.rotuloDaSubcategoria,
    required this.urlDaImagem,
    required this.textoDaImagem,
    required this.urlDeDestino,
    this.imagens = const <ImagemDoProduto>[],
    required this.parceiro,
    required this.precoEmCentavos,
    required this.consultadoEm,
    required this.estadoDoPreco,
  });

  final String slug;
  final String titulo;
  final String resumo;
  /// O CODIGO da categoria, como o servidor o mandou.
  final String? categoria;

  /// O rotulo da categoria, **lido da resposta** (`category_label`).
  final String? rotuloDaCategoria;

  /// O codigo do segundo nivel.
  final String? subcategoria;

  /// O rotulo do segundo nivel.
  final String? rotuloDaSubcategoria;

  final String? urlDaImagem;

  /// O `image_alt_text` do servidor, **cru**: nulo quando o painel nao escreveu
  /// descricao para a imagem (ela e opcional desde 17/10/2026).
  final String? textoDaImagem;

  /// `images`: TODAS as imagens prontas do item, na ordem do painel
  /// (17/10/2026).
  final List<ImagemDoProduto> imagens;

  /// Ha mais de uma foto para mostrar?
  bool get temGaleria => imagens.length > 1;

  /// As fotos a desenhar no cartao, com a capa de reserva.
  List<ImagemDoProduto> get fotosDoCartao {
    if (imagens.isNotEmpty) return imagens;
    final capa = urlDaImagem;
    if (capa == null) return const <ImagemDoProduto>[];
    return <ImagemDoProduto>[
      ImagemDoProduto(url: capa, textoAlternativo: textoDaImagem),
    ];
  }

  final String urlDeDestino;
  final ParceiroDaLoja parceiro;

  /// **Centavos, inteiro.** Nulo quando nao ha preco e quando ele venceu.
  final int? precoEmCentavos;

  /// `AAAA-MM-DD`, como o servidor a manda.
  final String? consultadoEm;

  final EstadoDoPreco estadoDoPreco;

  /// O destino do produto como `Uri`, **so quando ele e `https` absoluto**.
  Uri? get destinoExterno {
    final bruto = urlDeDestino.trim();
    if (bruto.isEmpty) return null;
    final u = Uri.tryParse(bruto);
    if (u == null) return null;
    if (u.scheme != 'https') return null;
    if (u.host.isEmpty) return null;
    return u;
  }

  /// Quantos caracteres do resumo o cartao da vitrine mostra antes de pedir
  /// para expandir (decisao do cliente de 17/10/2026).
  static const int tetoDoResumoNoCartao = 500;

  /// O resumo cabe no cartao sem corte?
  bool get resumoCabeNoCartao => resumo.length <= tetoDoResumoNoCartao;

  /// Os primeiros [tetoDoResumoNoCartao] caracteres, **cortados no ultimo
  /// espaco**, com reticencias.
  String get trechoDoResumo {
    if (resumoCabeNoCartao) return resumo;
    final bruto = resumo.substring(0, tetoDoResumoNoCartao);
    final espaco = bruto.lastIndexOf(RegExp(r'\s'));
    final fim = espaco > tetoDoResumoNoCartao ~/ 2 ? espaco : tetoDoResumoNoCartao;
    return '${resumo.substring(0, fim).trimRight()}…';
  }

  /// O nome acessivel da imagem do item, que **nunca e vazio**.
  String get nomeDaImagem {
    final escrito = textoDaImagem?.trim();
    if (escrito != null && escrito.isNotEmpty) return escrito;
    return 'Foto de $titulo';
  }

  /// O preco formatado em portugues do Brasil, ou nulo.
  String? get precoFormatado {
    final centavos = precoEmCentavos;
    if (centavos == null) return null;
    return formatarReais(centavos);
  }

  /// A linha do preco, que e **so o valor**.
  String? get linhaDoPreco {
    final valor = precoFormatado;
    final data = consultadoEm;
    if (valor == null || data == null) return null;
    return valor;
  }

  /// A linha de classificacao do cartao: "Rações · Ração seca".
  String? get linhaDaClassificacao {
    final categoria = rotuloDaCategoria;
    if (categoria == null) return null;
    final sub = rotuloDaSubcategoria;
    return sub == null ? categoria : '$categoria · $sub';
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
    final texto = json['image_alt_text'];
    final codigo = json['category'] is String ? json['category'] as String : null;
    final rotuloDaCategoria = json['category_label'];
    final subcategoria = json['subcategory'];
    final rotuloDaSubcategoria = json['subcategory_label'];
    return ItemDaLoja(
      slug: slug,
      titulo: titulo,
      resumo: resumo,
      categoria: codigo,
      rotuloDaCategoria: rotuloDaCategoria is String
          ? rotuloDaCategoria
          : (codigo == null ? null : rotulosLegadosDaCategoria[codigo]),
      subcategoria: subcategoria is String ? subcategoria : null,
      rotuloDaSubcategoria: subcategoria is String && rotuloDaSubcategoria is String
          ? rotuloDaSubcategoria
          : null,
      urlDaImagem: imagem is String ? imagem : null,
      textoDaImagem: texto is String ? texto : null,
      imagens: json['images'] is List
          ? (json['images'] as List<dynamic>)
              .map(ImagemDoProduto.doJson)
              .toList(growable: false)
          : const <ImagemDoProduto>[],
      urlDeDestino: destino,
      parceiro: ParceiroDaLoja.doJson(json['partner']),
      precoEmCentavos: preco is int ? preco : null,
      consultadoEm: data is String ? data : null,
      estadoDoPreco: EstadoDoPreco.porCodigo(json['price_status'] as String?),
    );
  }
}

/// `2026-03-14` para `14/03`.
String dataCurta(String iso) {
  final partes = iso.split('-');
  if (partes.length < 3) return iso;
  return '${partes[2].padLeft(2, '0')}/${partes[1].padLeft(2, '0')}';
}

/// `#/components/schemas/StoreItemPage/properties/effective_sort` do contrato.
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
    this.subcategoria,
    this.ordem = OrdemDaLoja.curadoria,
    this.pagina = 1,
    this.limite = 20,
  });

  final String? termo;

  /// O CODIGO da categoria. Texto, e nao `enum`: o vocabulario e dado do
  /// servidor desde 17/10.
  final String? categoria;

  /// O CODIGO da subcategoria.
  final String? subcategoria;
  final OrdemDaLoja ordem;
  final int pagina;
  final int limite;

  /// Quantos GRUPOS de filtro estao ativos.
  int get quantidadeDeFiltros =>
      (categoria == null ? 0 : 1) + (subcategoria == null ? 0 : 1);

  /// A pessoa recortou a lista de alguma forma -- por filtro ou por busca.
  bool get temRecorte =>
      quantidadeDeFiltros > 0 || (termo != null && termo!.trim().isNotEmpty);

  Map<String, String> get query => <String, String>{
        if (termo != null && termo!.trim().isNotEmpty) 'q': termo!.trim(),
        'category': ?categoria,
        'subcategory': ?subcategoria,
        'sort': ordem.codigo,
        'page': '$pagina',
        'limit': '$limite',
      };

  RecorteDaLoja com({
    String? termo,
    String? categoria,
    String? subcategoria,
    OrdemDaLoja? ordem,
    int? pagina,
    bool limparTermo = false,
    bool limparCategoria = false,
    bool limparSubcategoria = false,
  }) {
    final categoriaNova = limparCategoria ? null : (categoria ?? this.categoria);
    final trocouCategoria = categoriaNova != this.categoria;
    final String? subcategoriaNova;
    if (trocouCategoria) {
      subcategoriaNova = subcategoria;
    } else if (limparSubcategoria) {
      subcategoriaNova = null;
    } else {
      subcategoriaNova = subcategoria ?? this.subcategoria;
    }
    return RecorteDaLoja(
      termo: limparTermo ? null : (termo ?? this.termo),
      categoria: categoriaNova,
      subcategoria: subcategoriaNova,
      ordem: ordem ?? this.ordem,
      pagina: pagina ?? this.pagina,
      limite: limite,
    );
  }
}

/// Uma imagem da galeria do produto: `#/components/schemas/StoreItemImage`.
class ImagemDoProduto {
  const ImagemDoProduto({required this.url, required this.textoAlternativo});

  /// A derivada publica, sempre pronta.
  final String url;

  /// O `alt_text` do servidor, **cru**: nulo quando o painel gravou a imagem
  /// sem descricao (opcional desde 17/10/2026).
  final String? textoAlternativo;

  static ImagemDoProduto doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) {
      throw const FormatException('`images` com item que nao e objeto');
    }
    final url = bruto['url'];
    if (url is! String) {
      throw const FormatException('imagem da galeria sem `url`');
    }
    final texto = bruto['alt_text'];
    return ImagemDoProduto(
      url: url,
      textoAlternativo: texto is String ? texto : null,
    );
  }

  /// O nome acessivel desta imagem, que **nunca e vazio**.
  String nomeDaImagem(String tituloDoProduto) {
    final escrito = textoAlternativo?.trim();
    if (escrito != null && escrito.isNotEmpty) return escrito;
    return 'Foto de $tituloDoProduto';
  }
}

/// `#/components/schemas/StoreItemDetail`: o item da vitrine **mais todas as
/// imagens prontas**, na ordem do painel.
class DetalheDoProduto {
  const DetalheDoProduto({required this.item, required this.imagens});

  /// O produto, no mesmo tipo que o cartao da vitrine ja desenha.
  final ItemDaLoja item;

  /// Todas as imagens prontas, na ordem do painel.
  final List<ImagemDoProduto> imagens;

  /// O produto nao tem imagem nenhuma.
  bool get semImagem => imagens.isEmpty;

  static DetalheDoProduto doJson(Map<String, dynamic> json) {
    final imagens = json['images'];
    if (imagens is! List) {
      throw const FormatException('detalhe do produto sem `images`');
    }
    return DetalheDoProduto(
      item: ItemDaLoja.doJson(json),
      imagens: <ImagemDoProduto>[
        for (final bruto in imagens) ImagemDoProduto.doJson(bruto),
      ],
    );
  }
}
