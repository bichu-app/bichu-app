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

// `formatarReais` mora em `formato/dinheiro.dart`, que e o unico lugar do
// app que faz a conta de centavos para texto. Reexportado aqui porque as
// telas e `app/test/telas/loja_com_dados_test.dart` ja o importam deste
// arquivo, e trocar o caminho de import nao e o assunto desta mudanca.
import '../formato/dinheiro.dart';

export '../formato/dinheiro.dart' show formatarReais, reaisEmTexto;

/// Os rotulos que ESTE binario carrega para as seis categorias antigas.
///
/// ## Por que ele existe, e por que nao e a lista de categorias
///
/// Ate 17/10/2026 a categoria era um `enum` de seis valores no contrato
/// (`CategoriaDaLoja`), e este arquivo guardava os seis rotulos nele. O
/// cliente decidiu dois niveis com subcategorias como a petlove: 14 categorias
/// e 83 subcategorias, e a lista virou DADO -- ela mora em `store_categories`
/// e sai por `GET /v1/store/taxonomy`, com o rotulo de cada uma.
///
/// Este mapa sobrou como **rede de seguranca de uma versao so**: a resposta
/// agora traz `category_label`, e e ele que a tela mostra. Quando o campo
/// faltar -- servidor mais antigo que o aplicativo, que e o caso de um
/// aparelho que atualizou antes do deploy --, o rotulo cai para ca, e so para
/// os seis codigos que existiam antes. Codigo novo sem `category_label` nao
/// ganha rotulo inventado: a tela simplesmente nao escreve a linha.
///
/// **Os rotulos aqui sao os deste BINARIO, de proposito.** `food` passou a se
/// chamar "Racoes" no vocabulario do servidor; este mapa continua dizendo
/// "Alimentacao" porque e o que este binario mostrava, e inventar o rotulo
/// novo aqui faria a tela afirmar um vocabulario que ela nao leu.
///
/// **`toy` e `accessory` estao no PLURAL**, e isso nao e descuido de copia: o
/// cliente pediu "Brinquedos" e "Acessorios" no plural em 17/10/2026, no mesmo
/// dia e no lote anterior a este, e esta e a reserva do binario que JA carrega
/// aquela mudanca. Trazer o singular de volta aqui desfaria o pedido dele
/// justamente no caminho de reserva, onde ninguem iria olhar.
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

/// Uma categoria do vocabulario, com as subcategorias dela (`StoreTaxonomyCategory`).
///
/// A subcategoria chega DENTRO da categoria, como o contrato a aninha: duas
/// listas irmas obrigariam esta tela a cruzar `category_code` por conta
/// propria, e e justamente essa relacao que o `enum` nao sabia expressar.
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
  ///
  /// Sem categoria escolhida a lista e vazia, e o grupo de filtro do segundo
  /// nivel nao aparece: oferecer as 83 de uma vez devolveria a pessoa ao
  /// problema que os dois niveis existem para resolver.
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
///
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
    required this.rotuloDaCategoria,
    required this.subcategoria,
    required this.rotuloDaSubcategoria,
    required this.urlDaImagem,
    required this.textoDaImagem,
    required this.urlDeDestino,
    required this.parceiro,
    required this.precoEmCentavos,
    required this.consultadoEm,
    required this.estadoDoPreco,
  });

  final String slug;
  final String titulo;
  final String resumo;
  /// O CODIGO da categoria, como o servidor o mandou. Nulo so se a resposta
  /// vier sem o campo.
  final String? categoria;

  /// O rotulo da categoria, **lido da resposta** (`category_label`).
  ///
  /// Nulo quando nem a resposta nem [rotulosLegadosDaCategoria] sabem dizer, e
  /// nesse caso a linha de classificacao nao e desenhada. **A tela nunca mostra
  /// o codigo cru**: `treats` na tela nao e um rotulo, e um codigo vazando
  /// parece defeito.
  final String? rotuloDaCategoria;

  /// O codigo do segundo nivel. Nulo e estado normal: a subcategoria e opcional.
  final String? subcategoria;

  /// O rotulo do segundo nivel. Nulo junto com [subcategoria].
  final String? rotuloDaSubcategoria;

  final String? urlDaImagem;

  /// O `image_alt_text` do servidor, **cru**: nulo quando o painel nao escreveu
  /// descricao para a imagem (ela e opcional desde 17/10/2026).
  ///
  /// Quem desenha nao usa este campo direto, usa [nomeDaImagem]: ler o cru na
  /// tela e o caminho para alguem esquecer a reserva e deixar a imagem sem nome
  /// acessivel.
  final String? textoDaImagem;

  final String urlDeDestino;
  final ParceiroDaLoja parceiro;

  /// **Centavos, inteiro.** Nulo quando nao ha preco e quando ele venceu.
  final int? precoEmCentavos;

  /// `AAAA-MM-DD`, como o servidor a manda. Nula junto com o valor.
  final String? consultadoEm;

  final EstadoDoPreco estadoDoPreco;

  /// O destino do produto como `Uri`, **so quando ele e `https` absoluto**.
  ///
  /// Nulo e o que a tela usa para NAO desenhar o botao de saida: sem destino
  /// utilizavel nao ha para onde levar a pessoa, e um botao que nao faz nada e
  /// pior que botao ausente.
  ///
  /// ## Por que o esquema e conferido AQUI, e nao so no servidor
  ///
  /// `target_url` e dado CADASTRADO: ele entra pelo painel, e a escrita o
  /// confere (`errosDoDestino`, em `escrita-da-vitrine.ts`: so `https`, sem
  /// usuario e senha, sem IP literal, no host exato do parceiro). Mas o que
  /// chega ao aparelho e uma `String` da resposta, e `launchUrl` abre o que o
  /// sistema souber abrir -- `intent:`, `market:`, `tel:`, `javascript:`,
  /// `file:`. Entregar a string crua ao sistema faria do cadastro de produto um
  /// canal para disparar qualquer coisa no aparelho da pessoa, e a unica trava
  /// seria a escrita de um ambiente que este binario nao controla.
  ///
  /// **`http` em claro tambem e recusado**, e nao e zelo: a vitrine leva a
  /// pessoa para uma pagina de compra. Sugerir uma pagina sem TLS e sugerir que
  /// ela digite dado de pagamento em canal aberto.
  ///
  /// Nao e defesa contra o servidor: e a recusa de ampliar o que um registro de
  /// catalogo consegue fazer.
  Uri? get destinoExterno {
    final bruto = urlDeDestino.trim();
    if (bruto.isEmpty) return null;
    final u = Uri.tryParse(bruto);
    if (u == null || !u.isAbsolute) return null;
    if (u.scheme != 'https') return null;
    // Sem host nao ha site: `https:///caminho` da `isAbsolute` verdadeiro.
    if (u.host.isEmpty) return null;
    return u;
  }

  /// Quantos caracteres do resumo o cartao da vitrine mostra antes de pedir
  /// para expandir (decisao do cliente de 17/10/2026).
  ///
  /// O teto do campo e 3000; desenhar 3000 num cartao de lista empurra a
  /// vitrine inteira para baixo, e e por isso que existe o corte.
  static const int tetoDoResumoNoCartao = 500;

  /// O resumo cabe no cartao sem corte?
  ///
  /// Quem desenha usa isto para **nao desenhar o botao de expandir** quando
  /// nao ha nada escondido: botao que nao faz nada e pior que nenhum botao.
  bool get resumoCabeNoCartao => resumo.length <= tetoDoResumoNoCartao;

  /// Os primeiros [tetoDoResumoNoCartao] caracteres, **cortados no ultimo
  /// espaco**, com reticencias.
  ///
  /// Corte por palavra, e nao por caractere cru: `substring(0, 500)` parte a
  /// palavra no meio, e isso as vezes muda o sentido do que sobrou. Quando nao
  /// ha espaco nenhum na segunda metade do trecho (texto sem espaco, ou uma
  /// palavra longuissima), o corte volta a ser no caractere: devolver 250
  /// caracteres seria pior que uma palavra partida.
  ///
  /// **A quebra de linha e preservada**: nada aqui troca `\n` por espaco. A
  /// area de texto do painel existe para a pessoa escrever em paragrafos.
  String get trechoDoResumo {
    if (resumoCabeNoCartao) return resumo;
    final bruto = resumo.substring(0, tetoDoResumoNoCartao);
    final espaco = bruto.lastIndexOf(RegExp(r'\s'));
    final fim = espaco > tetoDoResumoNoCartao ~/ 2 ? espaco : tetoDoResumoNoCartao;
    return '${resumo.substring(0, fim).trimRight()}…';
  }

  /// O nome acessivel da imagem do item, que **nunca e vazio**.
  ///
  /// O texto que o administrador escreveu, quando ele escreveu;
  /// `Foto de {titulo}` quando nao escreveu. Nunca nulo e nunca `''`: imagem com
  /// `semanticLabel` vazio e imagem que o leitor de tela ANUNCIA SEM DIZER
  /// NADA, que e pior que a reserva generica.
  ///
  /// Por que nao esta na tela: a reserva e regra do modelo, nao desenho. Ate
  /// 17/10/2026 a tela montava `Foto de <titulo>` e IGNORAVA o texto do
  /// painel -- o campo existia e nao chegava a ninguem. Com a reserva aqui, as
  /// duas respostas saem do mesmo lugar e nenhuma tela pode esquecer uma delas.
  String get nomeDaImagem {
    final escrito = textoDaImagem?.trim();
    if (escrito != null && escrito.isNotEmpty) return escrito;
    return 'Foto de $titulo';
  }

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

  /// A linha de classificacao do cartao: "Rações · Ração seca".
  ///
  /// **Uma string so, e nao dois campos**, pela mesma razao de
  /// [linhaDoPreco]: dois getters separados permitiriam que alguem desenhasse
  /// so o segundo nivel, e "Ração seca" sozinho nao diz de que categoria e.
  ///
  /// Nula quando nao ha rotulo de categoria -- e a tela nao desenha a linha.
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
    // `image_alt_text` e anulavel no contrato, e desde 17/10/2026 o nulo e
    // estado NORMAL (o painel pode gravar a imagem sem descricao). A reserva
    // mora em `nomeDaImagem`.
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
      // O rotulo vem da RESPOSTA; o mapa deste binario e so a rede de
      // seguranca para servidor que ainda nao manda `category_label`.
      rotuloDaCategoria: rotuloDaCategoria is String
          ? rotuloDaCategoria
          : (codigo == null ? null : rotulosLegadosDaCategoria[codigo]),
      subcategoria: subcategoria is String ? subcategoria : null,
      // Rotulo de subcategoria sem o codigo dela nao e desenhado: seria um
      // segundo nivel que a lista nao sabe filtrar de volta.
      rotuloDaSubcategoria: subcategoria is String && rotuloDaSubcategoria is String
          ? rotuloDaSubcategoria
          : null,
      urlDaImagem: imagem is String ? imagem : null,
      textoDaImagem: texto is String ? texto : null,
      urlDeDestino: destino,
      parceiro: ParceiroDaLoja.doJson(json['partner']),
      precoEmCentavos: preco is int ? preco : null,
      consultadoEm: data is String ? data : null,
      estadoDoPreco: EstadoDoPreco.porCodigo(json['price_status'] as String?),
    );
  }
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

/// `#/components/schemas/StoreItemPage/properties/effective_sort` do contrato.
///
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
    this.subcategoria,
    this.ordem = OrdemDaLoja.curadoria,
    this.pagina = 1,
    this.limite = 20,
  });

  final String? termo;

  /// O CODIGO da categoria. Texto, e nao `enum`: o vocabulario e dado do
  /// servidor desde 17/10.
  final String? categoria;

  /// O CODIGO da subcategoria. Sempre dentro da categoria escolhida -- trocar
  /// a categoria limpa este campo, em [com].
  final String? subcategoria;
  final OrdemDaLoja ordem;
  final int pagina;
  final int limite;

  /// Quantos GRUPOS de filtro estao ativos. A busca **nao** conta aqui: ela e
  /// um controle proprio, e a barra de listagem ja a considera por conta
  /// propria ao decidir se o recorte esta ativo.
  /// Quantos GRUPOS de filtro estao ativos. A subcategoria conta como grupo
  /// proprio: ela e um recorte a mais, e a barra de listagem mostra o numero.
  int get quantidadeDeFiltros =>
      (categoria == null ? 0 : 1) + (subcategoria == null ? 0 : 1);

  /// A pessoa recortou a lista de alguma forma -- por filtro ou por busca.
  bool get temRecorte =>
      quantidadeDeFiltros > 0 || (termo != null && termo!.trim().isNotEmpty);

  Map<String, String> get query => <String, String>{
        if (termo != null && termo!.trim().isNotEmpty) 'q': termo!.trim(),
        // `?valor` e a entrada null-aware: a chave so entra quando o valor
        // existe. E o `use_null_aware_elements` do analisador deste
        // repositorio, e nao gosto.
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
    // **Trocar a categoria limpa a subcategoria, e limpar a categoria tambem.**
    // A subcategoria antiga pertence a categoria antiga; mante-la produziria um
    // recorte que nenhum item satisfaz, e a lista voltaria vazia sem a pessoa
    // entender por que. A regra mora aqui, e nao na tela, para valer tambem
    // quando o recorte for montado de outro lugar.
    final categoriaNova = limparCategoria ? null : (categoria ?? this.categoria);
    final trocouCategoria = categoriaNova != this.categoria;
    final String? subcategoriaNova;
    if (trocouCategoria) {
      // So o que vier NESTA chamada: a guardada era da categoria anterior.
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
///
/// **So `url` e `alt_text` existem no contrato.** Nao ha derivada de miniatura
/// para a Loja: `NetworkEventImage` tem `thumb_url` (480 x 360, 4:3, para a
/// galeria do detalhe do encontro) e `AdminPetPhoto` tem `thumb_url` e
/// `card_url`, mas `StoreItemImage` tem um campo de imagem so. A galeria desta
/// tela desenha miniatura de 144 dp a partir da MESMA `url` que o quadro
/// grande usa -- o desperdicio que o encontro ja resolveu, e que aqui nao tem
/// como resolver sem o campo. **Relatado, nao contornado**: o contrato manda
/// nas quatro aplicacoes e nao se mexe nele por conveniencia de uma tela.
class ImagemDoProduto {
  const ImagemDoProduto({required this.url, required this.textoAlternativo});

  /// A derivada publica, sempre pronta. Imagem em processamento ou recusada
  /// nunca chega aqui.
  final String url;

  /// O `alt_text` do servidor, **cru**: nulo quando o painel gravou a imagem
  /// sem descricao (opcional desde 17/10/2026).
  ///
  /// Quem desenha usa [nomeDaImagem], e nao este campo: a reserva e regra do
  /// modelo, pelo mesmo motivo de [ItemDaLoja.nomeDaImagem].
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
  ///
  /// O texto do painel quando ha; `Foto de {titulo do produto}` quando nao ha.
  /// Recebe o titulo de fora porque a imagem nao conhece o produto dela.
  String nomeDaImagem(String tituloDoProduto) {
    final escrito = textoAlternativo?.trim();
    if (escrito != null && escrito.isNotEmpty) return escrito;
    return 'Foto de $tituloDoProduto';
  }
}

/// `#/components/schemas/StoreItemDetail`: o item da vitrine **mais todas as
/// imagens prontas**, na ordem do painel.
///
/// A rota e `GET /v1/store/items/{itemSlug}` (`getStoreItem`), publica, e
/// **ela existia sem nenhum chamador** desde que entrou no contrato: das oito
/// imagens que o painel aceita, o app mostrava uma (a `image_url` da lista, no
/// cartao). Esta classe e a tela de detalhe sao o chamador.
///
/// ## A ordem e a da LISTA, e nao ha campo de posicao
///
/// `StoreItemImage` nao tem `position`: a ordem do painel **e** a ordem do
/// array, e a primeira e a capa (a mesma de `image_url`). Por isso
/// [ImagemDoProduto] nao guarda indice e nada aqui reordena: ordenar por
/// conta propria seria inventar uma regra que o contrato nao tem.
///
/// ## Lista vazia e estado NORMAL
///
/// "Vazia e estado normal", diz o contrato por extenso. Nao e falha, nao e
/// item quebrado e nao e tela em branco: a hml de hoje tem zero produto, e um
/// produto sem foto nenhuma e o primeiro caso que a tela vai encontrar quando
/// tiver.
class DetalheDoProduto {
  const DetalheDoProduto({required this.item, required this.imagens});

  /// O produto, no mesmo tipo que o cartao da vitrine ja desenha.
  ///
  /// Nao e heranca nem copia de campo: `StoreItemDetail` e `allOf` de
  /// `StoreItemSummary` no contrato, e repetir os treze campos aqui criaria
  /// dois lugares para o preco ser formatado.
  final ItemDaLoja item;

  /// Todas as imagens prontas, na ordem do painel. Pode ser vazia.
  final List<ImagemDoProduto> imagens;

  /// O produto nao tem imagem nenhuma. **Estado da tela, nao erro.**
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
