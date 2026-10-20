
/// `#/components/schemas/PublicLostPet` e `PublicLostPetPage` do contrato,
/// campo a campo.
///
/// Recorte do contrato, que é a autoridade: campo que não está lá não aparece
/// aqui.
///
/// ## A CHAVE DA LISTA É O `share_token`, E ISSO É O ADR-0010 ITEM 6
///
/// Não há `pet_id` e não há `case_id`, e a ausência **não é esquecimento**: o
/// contrato diz, com todas as letras, que esta projeção "não possui, e nunca
/// deve possuir, `pet_id`, `case_id`, `user_id`, coordenada, dado do tutor nem
/// endereço (SEC-002)". O `share_token` é opaco, não é UUID e não é ordenável,
/// e é o mesmo que o link de compartilhamento já carrega.
///
/// A consequência de navegação é direta e vale repetir: **o cartão desta lista
/// não leva a `/pets/:petId`**. Aquela rota é endereçada por UUID interno, e
/// UUID interno não sai em superfície pública. O destino é a página do caso,
/// por token.
///
/// ## Não há coordenada, em nenhum campo e em nenhum filtro
///
/// O recorte geográfico é `city` e `neighborhood` **digitados**. O contrato
/// explica o porquê: um ponto por caso permitiria montar o mapa que a regra de
/// privacidade existe para impedir, e não há geocodificação no produto
/// (ADR-0006).
library;

import 'modelos_pet.dart';

/// A janela de `period`, como o contrato a declara:
/// `#/paths/~1public~1lost-pets/get/parameters/4/schema`.
///
/// O ponteiro traz o INDICE do parametro porque `period` e declarado em linha
/// na operacao, e nao em `#/components/parameters` -- RFC 6901 nao tem outra
/// forma de enderecar um item de lista. Reordenar os parametros de
/// `listPublicLostPets` no contrato quebra este ponteiro, e
/// `verificar-conformidade-do-app.mjs` reprova com `ponteiro-nao-resolve`
/// nomeando-o, que e o jeito certo de descobrir.
///
/// **A lista fechada tem TRES valores, e nao ha um quarto para "janela
/// aberta".** Janela aberta e a AUSENCIA de `period` na consulta, e nao um
/// valor a mais -- `RecorteDePerdidos.janela` nula nao manda o parametro, e o
/// servidor perdeu o `default: 30d` que repunha 30 dias por conta propria
/// (`api/openapi.yaml`, 19/10/2026). Um `all` aqui voltaria em
/// `applied_filters` e a tela abriria dizendo "1 filtro ativo" sem ninguem ter
/// escolhido nada, que e o defeito que o cliente reclamou em 18/10.
/// `case_state` de `listPublicLostPets`: QUAL CONJUNTO a pagina de `Pets` pede.
///
/// Decisao do cliente de 20/10/2026: *"o pet ganha um selo/filtro na pagina de
/// pets como encontrado por 30 dias e depois ele expira e sai"*.
///
/// **A ausencia nao e "sem recorte", e por isso [RecorteDePerdidos.estado] e
/// nulo por padrao em vez de valer [aberto].** Nulo e nao mandar o parametro, e
/// nao mandar e o conjunto de casos ABERTOS -- que e o que a lista sempre
/// devolveu. Mandar `open` pede o mesmo conjunto dizendo o nome, e ai ele volta
/// em `applied_filters`; a tela precisa poder dizer que abriu sem recorte
/// nenhum, e `period` pagou por isso em 18/10/2026.
///
/// `reencontrado` traz os casos encerrados com reencontro **pela comunidade**,
/// e so dentro da janela de 30 dias. As duas condicoes sao do SERVIDOR: o app
/// nao refaz a conta de 30 dias e nao sabe dizer quem encontrou. Ver a Emenda 4
/// do ADR-0010.
enum EstadoDoCasoNaLista {
  aberto('open', 'Perdidos'),
  reencontrado('reunited', 'Encontrados');

  const EstadoDoCasoNaLista(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  /// O valor do contrato, ou **nulo** para codigo desconhecido.
  ///
  /// Nulo e nao [aberto] de proposito: quem le isto e a folha de filtros, e
  /// codigo que ela nao conhece tem de virar "nenhuma pastilha marcada", que e
  /// o estado em que a pagina abre.
  static EstadoDoCasoNaLista? de(String? codigo) {
    for (final e in EstadoDoCasoNaLista.values) {
      if (e.codigo == codigo) return e;
    }
    return null;
  }
}

enum JanelaDePerdidos {
  umDia('24h', '24 horas'),
  seteDias('7d', '7 dias'),
  trintaDias('30d', '30 dias');

  const JanelaDePerdidos(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  /// A janela de um codigo, ou **nulo** quando nao ha codigo.
  ///
  /// **Nulo, e nao `trintaDias`** (cliente, 18/10/2026): *"a pagina de pets
  /// nao deve trazer nenhum item do filtro por padrao, como esta atualmente
  /// por ultimos 30 dias"*. Antes, limpar a pastilha de `Perdido desde`
  /// voltava para `30d`, e a lista nascia recortada sem ninguem ter pedido.
  /// Agora "nenhuma escolha" e um valor que o recorte sabe guardar, e ele nao
  /// manda `period` nenhum.
  static JanelaDePerdidos? de(String? codigo) {
    for (final j in JanelaDePerdidos.values) {
      if (j.codigo == codigo) return j;
    }
    return null;
  }
}

/// Um pet perdido como a superfície pública o devolve.
class PerdidoPublico {
  const PerdidoPublico({
    required this.shareToken,
    required this.nome,
    required this.especie,
    required this.porte,
    required this.vistoPorUltimoEm,
    this.racaRotulo,
    this.cor,
    this.rotuloDaArea,
    this.urlDaFoto,
    this.urlDeCompartilhamento,
    this.encontradoPelaComunidade = false,
  });

  /// Opaco, o mesmo do `share_url`. **Não é UUID e não é ordenável.**
  final String shareToken;

  final String nome;
  final Especie especie;
  final Porte porte;

  /// Rótulo da lista de referência quando há código; o texto do tutor quando
  /// não há. Quem resolve isso é o servidor.
  final String? racaRotulo;

  final String? cor;

  /// Bairro e cidade. **Nulo quando o caso foi aberto só com coordenada**
  /// (BICHUS-21 critério 5): a coordenada nunca sai e não há geocodificação,
  /// então não há rótulo verdadeiro para dar. O texto que a tela mostra nesse
  /// caso é **do cliente**, e não do servidor — um rótulo fixo dentro de um
  /// campo de dado seria indistinguível de um bairro com esse nome.
  final String? rotuloDaArea;

  /// **Quando o animal foi visto pela última vez**, e não quando o caso foi
  /// aberto. É este número que orienta quem está procurando.
  final DateTime vistoPorUltimoEm;

  /// A derivada `thumb` da foto principal. Nula sem foto pronta, e a ausência
  /// é decisão de quem desenha: ver `ImagemDaRede`, que recebe `url` não
  /// anulável de propósito.
  final String? urlDaFoto;

  final String? urlDeCompartilhamento;

  /// `found_by_community`: o SELO de reencontro pela comunidade.
  ///
  /// **O app nao deduz este campo**, nem do `case_state` que ele mandou nem de
  /// data nenhuma. Quem decide e o servidor, no ramo `reencontrado` da consulta,
  /// onde a existencia de conversa ligada ao caso e predicado. Deduzir aqui pelo
  /// pedido faria o cartao -- que e componente compartilhado -- mentir na
  /// proxima tela que o reaproveitasse.
  ///
  /// `false` e o padrao porque e o valor de todo item do conjunto de casos
  /// abertos, que e o que a pagina devolve quando ninguem pede nada.
  final bool encontradoPelaComunidade;

  /// **`share_token`, `pet_display_name`, `species`, `size` e `lost_since` são
  /// lidos sem `??`**, de propósito: o contrato os declara obrigatórios, e um
  /// perdido sem nome ou sem data não é um perdido degradado — é uma resposta
  /// que a tela não deve desenhar.
  factory PerdidoPublico.doJson(Map<String, dynamic> json) {
    final especie = Especie.de(json['species'] as String?);
    final porte = Porte.de(json['size'] as String?);
    if (especie == null || porte == null) {
      throw const FormatException(
        'PublicLostPet com `species` ou `size` fora do contrato',
      );
    }
    return PerdidoPublico(
      shareToken: json['share_token'] as String,
      nome: json['pet_display_name'] as String,
      especie: especie,
      porte: porte,
      racaRotulo: json['breed_label'] as String?,
      cor: json['primary_color'] as String?,
      rotuloDaArea: json['area_label'] as String?,
      vistoPorUltimoEm: DateTime.parse(json['lost_since'] as String),
      urlDaFoto: json['photo_url'] as String?,
      urlDeCompartilhamento: json['share_url'] as String?,
      // `?? false` e seguro aqui, e esta e a direcao certa do padrao: ausencia
      // vira "sem selo". Um `?? true` poria o selo em todo pet de uma versao
      // de servidor que nao o emite -- e esta casa ja pagou por um `?? true`
      // que afirmava aviso ao tutor sem aviso nenhum.
      encontradoPelaComunidade: json['found_by_community'] as bool? ?? false,
    );
  }
}

/// `PublicLostPetPage`: a página, com o `total` que a tela precisa para dizer
/// "Mostrando 1 a 20 de 87".
class PaginaDePerdidos {
  const PaginaDePerdidos({
    required this.itens,
    required this.pagina,
    required this.limite,
    required this.total,
    this.filtrosAplicados = const <String, String>{},
  });

  final List<PerdidoPublico> itens;
  final int pagina;
  final int limite;
  final int total;

  /// O recorte que de fato valeu, como o servidor o devolveu.
  final Map<String, String> filtrosAplicados;

  factory PaginaDePerdidos.doJson(Map<String, dynamic> json) {
    final brutos = json['items'];
    final filtros = json['applied_filters'];
    return PaginaDePerdidos(
      itens: <PerdidoPublico>[
        if (brutos is List)
          for (final item in brutos)
            if (item is Map<String, dynamic>) PerdidoPublico.doJson(item),
      ],
      pagina: (json['page'] as num?)?.toInt() ?? 1,
      limite: (json['limit'] as num?)?.toInt() ?? 20,
      total: (json['total'] as num?)?.toInt() ?? 0,
      filtrosAplicados: <String, String>{
        if (filtros is Map)
          for (final entrada in filtros.entries)
            if (entrada.key is String && entrada.value is String)
              entrada.key as String: entrada.value as String,
      },
    );
  }
}

/// O recorte pedido à listagem pública.
///
/// `cidade` é **obrigatória no contrato**, e a obrigatoriedade é de privacidade
/// e não de desempenho: sem ela a operação seria um inventário nacional de
/// animais perdidos.
class RecorteDePerdidos {
  const RecorteDePerdidos({
    this.estado,
    this.cidade,
    this.bairro,
    this.especie,
    this.porte,
    this.janela,
    this.termo,
    this.pagina = 1,
  });

  /// A cidade pedida, ou **nulo quando ninguem pediu nenhuma**.
  ///
  /// **Nasce nula desde 19/10/2026** (cliente: *"o campo cidade do filtro da
  /// pagina pet nao deve ser obrigatorio"*). Nula, `city` fica FORA da consulta
  /// e o servidor nao recorta por cidade -- a lista abre com os 20 casos mais
  /// recentes de qualquer cidade. Era `required` e obrigava a tela a uma fase
  /// propria (`_Fase.semCidade`) antes de ter o que mostrar.
  /// `case_state`, ou **nulo quando ninguem escolheu conjunto**.
  ///
  /// Nulo e a pagina como ela abre: os casos abertos, sem o parametro na
  /// consulta. Ver [EstadoDoCasoNaLista].
  final EstadoDoCasoNaLista? estado;
  final String? cidade;
  final String? bairro;
  final Especie? especie;
  final Porte? porte;
  /// A janela PEDIDA, ou nulo quando ninguem pediu nenhuma.
  ///
  /// **Nasce nula** (cliente, 18/10/2026): a pagina de pets abre sem filtro
  /// nenhum aplicado. Nula, `period` fica FORA da consulta -- e e o servidor
  /// que decide o que fazer com a ausencia, pelo `default: 30d` que o contrato
  /// declara na rota. Mandar `30d` daqui era o app escolhendo um recorte que a
  /// pessoa nao escolheu.
  final JanelaDePerdidos? janela;

  /// Busca parcial por **nome do pet**. Nunca por código de tag: quando o
  /// texto digitado tem a forma de um código, o caminho é `GET /v1/tags/{code}`,
  /// que leva direto ao pet. Aceitar código aqui transformaria a listagem num
  /// oráculo de existência de código.
  final String? termo;

  final int pagina;

  String? get termoLimpo {
    final t = termo?.trim();
    return (t == null || t.isEmpty) ? null : t;
  }

  bool get temBusca => termoLimpo != null;

  /// O `limit` máximo do contrato é 20, e é o que a tela pede: pedir mais
  /// responderia 400.
  static const int limite = 20;

  /// A cidade pronta para a consulta: **aparada e com espaço colapsado**.
  ///
  /// **O colapso de espaço NÃO é zelo, e foi medido** em 19/10/2026 contra
  /// `texto_para_busca` do banco, que é a função dos dois lados da comparação
  /// de cidade:
  ///
  /// | forma | normaliza para | casa com `sao paulo` |
  /// |---|---|---|
  /// | `São Paulo` | `sao paulo` | sim |
  /// | `SAO PAULO` | `sao paulo` | sim |
  /// | `Mogi das Cruzes` / `Mogi Das Cruzes` | `mogi das cruzes` | sim |
  /// | `' São Paulo '` | `' sao paulo '` | **NÃO** |
  /// | `São  Paulo` | `sao  paulo` | **NÃO** |
  ///
  /// Ela absorve **acento e caixa**, e **não absorve espaço**. Isso importa
  /// porque a cidade deixou de ser só digitada: ela vem do serviço de
  /// plataforma, que decide a forma do nome. Deixar o espaço passar produziria
  /// uma lista VAZIA com cara de defeito — a pior saída possível, porque ela
  /// não acusa nada.
  ///
  /// Aparar resolve a borda; colapsar resolve o meio. O servidor não faz nem
  /// um nem outro, e corrigir lá seria mudar a semântica de `texto_para_busca`
  /// para todas as consultas que a usam.
  String? get cidadeLimpa {
    final c = cidade?.trim().replaceAll(RegExp(r'\s+'), ' ');
    return (c == null || c.isEmpty) ? null : c;
  }

  Map<String, String> get query => <String, String>{
    // `case_state` SO VAI QUANDO HA ESCOLHA, pela mesma forma `'chave': ?valor`
    // de `period` e `q`: nao mandar e pedir os casos abertos, que e o recorte
    // que esta rota sempre teve.
    'case_state': ?estado?.codigo,
    // `city` SO VAI QUANDO HA CIDADE. Mandar `city=` vazio nao e o mesmo que
    // omitir: o `minLength: 2` do contrato responde 400 ao vazio, enquanto a
    // omissao e geografia aberta. A forma `'chave': ?valor` e a mesma que
    // `period` e `q` ja usavam.
    'city': ?cidadeLimpa,
    if (bairro != null && bairro!.trim().isNotEmpty) 'neighborhood': bairro!.trim(),
    if (especie != null) 'species': especie!.valor,
    if (porte != null) 'size': porte!.valor,
    'period': ?janela?.codigo,
    'q': ?termoLimpo,
    'page': '$pagina',
    'limit': '$limite',
  };

  RecorteDePerdidos copiar({
    // **Sentinela**, pelo mesmo motivo de `janela` e de `cidade`: com o estado
    // podendo ser nulo de verdade, `estado ?? this.estado` nao consegue
    // LIMPA-LO -- e tirar a pastilha de `Encontrados` deixaria o conjunto
    // anterior valendo, que e o defeito que o cliente reclamou em `period`.
    Object? estado = _naoMexer,
    // **Sentinela, e nao `String?`**, pelo mesmo motivo de `janela`: com a
    // cidade podendo ser nula de verdade, `cidade ?? this.cidade` nao consegue
    // LIMPA-LA -- passar nulo seria indistinguivel de nao passar nada, e
    // apagar o campo de cidade na folha deixaria a cidade anterior valendo.
    Object? cidade = _naoMexer,
    Object? bairro = _naoMexer,
    Object? especie = _naoMexer,
    Object? porte = _naoMexer,
    // **Sentinela, e nao `JanelaDePerdidos?`**: com a janela podendo ser nula
    // de verdade, `janela ?? this.janela` nao consegue LIMPA-LA -- passar nulo
    // seria indistinguivel de nao passar nada, e tirar a pastilha de `Perdido
    // desde` deixaria a janela anterior valendo.
    Object? janela = _naoMexer,
    Object? termo = _naoMexer,
    int? pagina,
  }) {
    T? v<T>(Object? novo, T? atual) => novo == _naoMexer ? atual : novo as T?;
    return RecorteDePerdidos(
      estado: v<EstadoDoCasoNaLista>(estado, this.estado),
      cidade: v<String>(cidade, this.cidade),
      bairro: v<String>(bairro, this.bairro),
      especie: v<Especie>(especie, this.especie),
      porte: v<Porte>(porte, this.porte),
      janela: v<JanelaDePerdidos>(janela, this.janela),
      termo: v<String>(termo, this.termo),
      pagina: pagina ?? this.pagina,
    );
  }

  static const Object _naoMexer = Object();
}

/// `#/components/schemas/PublicLostCase`: a visão pública de UM caso, pelo
/// `share_token`.
///
/// `allOf` sobre `PublicLostPet` no contrato, e por isso [perdido] está aqui
/// inteiro em vez de ter os campos repetidos: o cartão da listagem e esta
/// página desenham a **mesma** projeção, e duas cópias dos sete campos
/// divergiriam na primeira manutenção.
///
/// ## `podeAvisarQueViu` é do SERVIDOR, e a tela não o deduz
///
/// `can_report_sighting` é falso **só para o próprio tutor** — e verdadeiro
/// para qualquer outra conta **e para quem chama sem conta**. O contrato diz
/// por escrito por quê: *"a conta é pedida no toque, não na leitura. Esconder o
/// botão de quem não entrou esconderia justamente de quem chegou pelo cartaz."*
///
/// Deduzir isto no app seria impossível sem o `user_id` do tutor, que esta
/// projeção não tem e nunca deve ter (ADR-0010, item 6).
class CasoPerdidoPublico {
  const CasoPerdidoPublico({
    required this.perdido,
    required this.podeAvisarQueViu,
    this.descricao,
    this.notasDeCuidado,
    this.urlDoCartaz,
  });

  /// Os campos de `PublicLostPet`, que é o que o cartão da listagem já lê.
  final PerdidoPublico perdido;

  /// `can_report_sighting`. Ver o cabeçalho da classe.
  ///
  /// **Lido sem `??` para `false`**: o contrato o declara `boolean` sem
  /// `nullable`, e um padrão falso aqui esconderia a ação de quem tem direito a
  /// ela no dia em que o campo chegasse ausente por defeito de servidor — que é
  /// o pior desfecho possível, porque quem perde a ação é o achador. O padrão é
  /// `true`, e quem é o tutor recebe `false` explícito.
  final bool podeAvisarQueViu;

  /// `description`: o texto do tutor.
  final String? descricao;

  /// `care_notes`: o mesmo cartão de manejo da página do achador por QR.
  final String? notasDeCuidado;

  final String? urlDoCartaz;

  factory CasoPerdidoPublico.doJson(Map<String, dynamic> json) {
    return CasoPerdidoPublico(
      perdido: PerdidoPublico.doJson(json),
      podeAvisarQueViu: json['can_report_sighting'] as bool? ?? true,
      descricao: json['description'] as String?,
      notasDeCuidado: json['care_notes'] as String?,
      urlDoCartaz: json['poster_url'] as String?,
    );
  }
}
