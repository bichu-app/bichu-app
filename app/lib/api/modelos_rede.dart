/// Os modelos da secao `Rede`, campo por campo do contrato.
library;

import 'dart:collection';

import '../formato/dinheiro.dart';

import 'modelos_pet.dart';

/// `#/components/schemas/NetworkEventStatus` do contrato.
enum SituacaoDoEncontro {
  aVir('upcoming'),
  acontecendo('happening'),
  encerrado('ended'),
  cancelado('cancelled');

  const SituacaoDoEncontro(this.codigo);

  final String codigo;

  static SituacaoDoEncontro? porCodigo(Object? codigo) {
    for (final s in SituacaoDoEncontro.values) {
      if (s.codigo == codigo) return s;
    }
    return null;
  }
}

/// `#/components/schemas/NetworkEventOrigin` do contrato.
enum OrigemDoEncontro {
  equipe('admin'),
  comunidade('community');

  const OrigemDoEncontro(this.codigo);

  /// O codigo de fio, e a UNICA copia dele.
  final String codigo;

  static OrigemDoEncontro? porCodigo(Object? codigo) {
    for (final o in OrigemDoEncontro.values) {
      if (o.codigo == codigo) return o;
    }
    return null;
  }
}

/// `#/components/schemas/NetworkEventWhen` do contrato, sem `all`.
enum QuandoDaRede {
  aVir('upcoming', 'Próximos'),
  passados('past', 'Encerrados'),
  hoje('today', 'Hoje'),
  fimDeSemana('weekend', 'Este fim de semana'),
  proximos30Dias('next_30_days', 'Próximos 30 dias');

  const QuandoDaRede(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  /// Os tres sub-recortes do filtro `Quando` de `Próximos` (UX 28.7.4).
  static const List<QuandoDaRede> subRecortes = <QuandoDaRede>[
    hoje,
    fimDeSemana,
    proximos30Dias,
  ];

  static QuandoDaRede? porCodigo(Object? codigo) {
    for (final q in QuandoDaRede.values) {
      if (q.codigo == codigo) return q;
    }
    return null;
  }
}

/// `#/components/schemas/NetworkEventSort` do contrato.
enum OrdemDaRede {
  proximos('proximos', 'Data mais próxima'),
  recentes('recentes', 'Mais recente primeiro');

  const OrdemDaRede(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static OrdemDaRede? porCodigo(Object? codigo) {
    for (final o in OrdemDaRede.values) {
      if (o.codigo == codigo) return o;
    }
    return null;
  }
}

/// `#/components/schemas/NetworkEventNearbySort` do contrato.
enum OrdemPorPerto {
  distancia('distancia', 'Mais perto'),
  proximos('proximos', 'Data mais próxima');

  const OrdemPorPerto(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static OrdemPorPerto? porCodigo(Object? codigo) {
    for (final o in OrdemPorPerto.values) {
      if (o.codigo == codigo) return o;
    }
    return null;
  }
}

/// `#/components/schemas/NetworkEventVisibility` do contrato.
enum VisibilidadeDoEncontro {
  publico('public', 'Público'),
  privado('private', 'Privado');

  const VisibilidadeDoEncontro(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static VisibilidadeDoEncontro? porCodigo(Object? codigo) {
    for (final v in VisibilidadeDoEncontro.values) {
      if (v.codigo == codigo) return v;
    }
    return null;
  }
}

/// `#/components/schemas/NetworkEventAdmission/properties/kind` do contrato.
enum TipoDeEntrada {
  gratuito('free', 'Gratuito'),
  pago('paid', 'Pago');

  const TipoDeEntrada(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static TipoDeEntrada? porCodigo(Object? codigo) {
    for (final t in TipoDeEntrada.values) {
      if (t.codigo == codigo) return t;
    }
    return null;
  }
}

/// `#/components/schemas/EventPriceUnit` do contrato.
enum UnidadeDoPreco {
  porPet('per_pet', 'por pet'),
  porPessoa('per_person', 'por humano'),
  porDupla('per_pair', 'por dupla (1 humano + 1 pet)'),
  porDuasPessoas('per_two_people', 'por dupla (2 humanos)'),
  porCao('per_dog', 'por pet');

  const UnidadeDoPreco(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static UnidadeDoPreco? porCodigo(Object? codigo) {
    for (final u in UnidadeDoPreco.values) {
      if (u.codigo == codigo) return u;
    }
    return null;
  }
}

/// `#/components/schemas/NetworkEventDogAge` do contrato.
enum IdadeDosCaes {
  qualquer('any', 'Qualquer idade'),
  aPartirDe4Meses('from_4_months', 'A partir de 4 meses'),
  aPartirDe1Ano('from_1_year', 'A partir de 1 ano'),
  ate1Ano('up_to_1_year', 'Até 1 ano');

  const IdadeDosCaes(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static IdadeDosCaes? porCodigo(Object? codigo) {
    for (final i in IdadeDosCaes.values) {
      if (i.codigo == codigo) return i;
    }
    return null;
  }
}

/// `#/components/schemas/NetworkEventAmenity` do contrato.
enum EstruturaDoLocal {
  pisoPlanoOuRampa('level_ground_or_ramp', 'Piso plano ou rampa'),
  banheiroAcessivel('accessible_restroom', 'Banheiro acessível'),
  banheiroPublicoProximo('public_restroom_nearby', 'Banheiro público próximo'),
  sombra('shade', 'Sombra'),
  bancos('benches', 'Bancos'),
  bebedouroParaCaes('dog_water_fountain', 'Bebedouro para cachorros'),
  estacionamentoProximo('parking_nearby', 'Estacionamento próximo');

  const EstruturaDoLocal(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static EstruturaDoLocal? porCodigo(Object? codigo) {
    for (final e in EstruturaDoLocal.values) {
      if (e.codigo == codigo) return e;
    }
    return null;
  }
}

/// `#/components/schemas/NetworkEventBringItem` do contrato.
enum ItemParaLevar {
  agua('water', 'Água'),
  poteDeAgua('water_bowl', 'Pote de água'),
  guia('leash', 'Guia'),
  saquinho('poop_bags', 'Saquinhos para cocô'),
  petisco('treats', 'Petisco'),
  toalha('towel', 'Toalha'),
  carteiraDeVacinacao('vaccination_card', 'Carteira de vacinação'),
  brinquedo('toy', 'Brinquedo');

  const ItemParaLevar(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static ItemParaLevar? porCodigo(Object? codigo) {
    for (final i in ItemParaLevar.values) {
      if (i.codigo == codigo) return i;
    }
    return null;
  }
}

/// `#/components/schemas/JoinRequestAppState` do contrato.
enum EstadoDoPedido {
  enviado('requested', 'Pedido enviado'),
  aprovado('approved', 'Pedido aprovado'),
  desistido('withdrawn', null),
  expirado('expired', null);

  const EstadoDoPedido(this.codigo, this.rotulo);

  final String codigo;

  /// O rotulo na tela, ou nulo quando a especificacao nao desenha nenhum.
  final String? rotulo;

  static EstadoDoPedido? porCodigo(Object? codigo) {
    for (final e in EstadoDoPedido.values) {
      if (e.codigo == codigo) return e;
    }
    return null;
  }
}

/// `#/paths/~1network~1events~1nearby/get/parameters/6/schema` do contrato: o
/// `max_km` de `listNearbyNetworkEvents`.
enum DistanciaMaxima {
  ate2km('2', 'Até 2 km'),
  ate5km('5', 'Até 5 km'),
  ate10km('10', 'Até 10 km');

  const DistanciaMaxima(this.codigo, this.rotulo);

  final String codigo;
  final String rotulo;

  static DistanciaMaxima? porCodigo(Object? codigo) {
    for (final d in DistanciaMaxima.values) {
      if (d.codigo == codigo) return d;
    }
    return null;
  }
}

/// O deslocamento de fuso com que a hora do encontro e desenhada.
class FusoDoEvento {
  const FusoDoEvento({
    required this.nomeIana,
    required this.deslocamento,
    required this.conhecido,
    required this.rotulo,
  });

  final String nomeIana;
  final Duration deslocamento;
  final bool conhecido;

  /// A linha que a caixa `Quando` mostra: `Horário de Brasília`, `Horário de
  /// Manaus`, `Horário UTC−03:00` ou `Horário UTC`.
  final String rotulo;

  static const Map<String, (int, String)> _zonasDoBrasil =
      <String, (int, String)>{
    'America/Sao_Paulo': (-3, 'Brasília'),
    'America/Bahia': (-3, 'Brasília'),
    'America/Fortaleza': (-3, 'Brasília'),
    'America/Recife': (-3, 'Brasília'),
    'America/Maceio': (-3, 'Brasília'),
    'America/Belem': (-3, 'Brasília'),
    'America/Santarem': (-3, 'Brasília'),
    'America/Araguaina': (-3, 'Brasília'),
    'America/Noronha': (-2, 'Fernando de Noronha'),
    'America/Manaus': (-4, 'Manaus'),
    'America/Boa_Vista': (-4, 'Boa Vista'),
    'America/Porto_Velho': (-4, 'Porto Velho'),
    'America/Cuiaba': (-4, 'Cuiabá'),
    'America/Campo_Grande': (-4, 'Campo Grande'),
    'America/Rio_Branco': (-5, 'Rio Branco'),
    'America/Eirunepe': (-5, 'Eirunepé'),
  };

  static Duration? deslocamentoEscritoEm(String iso) {
    final casou = RegExp(r'([+-])(\d{2}):?(\d{2})$').firstMatch(iso);
    if (casou == null) return null;
    final sinal = casou.group(1) == '-' ? -1 : 1;
    final horas = int.parse(casou.group(2)!);
    final minutos = int.parse(casou.group(3)!);
    return Duration(minutes: sinal * (horas * 60 + minutos));
  }

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
        rotulo: 'Horário de ${doBrasil.$2}',
      );
    }
    final escrito = deslocamentoEscritoEm(inicioEmIso);
    if (escrito != null) {
      return FusoDoEvento(
        nomeIana: nomeIana,
        deslocamento: escrito,
        conhecido: true,
        rotulo: 'Horário ${_utcComSinal(escrito)}',
      );
    }
    return FusoDoEvento(
      nomeIana: nomeIana,
      deslocamento: Duration.zero,
      conhecido: false,
      rotulo: 'Horário UTC',
    );
  }

  static String _utcComSinal(Duration deslocamento) {
    final absoluto = deslocamento.abs();
    final horas = absoluto.inHours.toString().padLeft(2, '0');
    final minutos = (absoluto.inMinutes % 60).toString().padLeft(2, '0');
    return 'UTC${deslocamento.isNegative ? '−' : '+'}$horas:$minutos';
  }
}

/// Os nomes em portugues de dia e mes, num lugar so.
abstract final class CalendarioPtBr {
  static const List<String> meses = <String>[
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

  /// Indice pelo `DateTime.weekday` (1 = segunda).
  static const List<String> diasDaSemana = <String>[
    'segunda',
    'terça',
    'quarta',
    'quinta',
    'sexta',
    'sábado',
    'domingo',
  ];

  static const List<String> diasAbreviados = <String>[
    'SEG',
    'TER',
    'QUA',
    'QUI',
    'SEX',
    'SÁB',
    'DOM',
  ];

  static const List<String> mesesAbreviados = <String>[
    'JAN',
    'FEV',
    'MAR',
    'ABR',
    'MAI',
    'JUN',
    'JUL',
    'AGO',
    'SET',
    'OUT',
    'NOV',
    'DEZ',
  ];

  /// `Sábado, 27 de setembro`, com o ano quando ele nao e o [anoCorrente].
  static String dataLonga(DateTime parede, {required int anoCorrente}) {
    final dia = diasDaSemana[parede.weekday - 1];
    final base =
        '${dia[0].toUpperCase()}${dia.substring(1)}, ${parede.day} de ${meses[parede.month - 1]}';
    return parede.year == anoCorrente ? base : '$base de ${parede.year}';
  }

  /// `9h` na hora cheia, `9h30` fora dela.
  static String hora(DateTime parede) {
    if (parede.minute == 0) return '${parede.hour}h';
    return '${parede.hour}h${parede.minute.toString().padLeft(2, '0')}';
  }

  /// `2 horas`, `1 hora e meia`, `45 minutos`, `2 horas e 15 minutos`.
  static String duracao(Duration d) {
    final horas = d.inHours;
    final minutos = d.inMinutes % 60;
    if (horas == 0) return '$minutos minutos';
    final parteHoras = horas == 1 ? '1 hora' : '$horas horas';
    if (minutos == 0) return parteHoras;
    if (minutos == 30) return '$parteHoras e meia';
    return '$parteHoras e $minutos minutos';
  }
}

/// Quando o encontro acontece, ja no fuso do EVENTO.
class HorarioDoEncontro {
  const HorarioDoEncontro({
    required this.inicio,
    required this.fim,
    required this.fuso,
  });

  /// O instante absoluto de inicio, em UTC.
  final DateTime inicio;

  /// O instante absoluto do fim, quando o encontro declara um.
  final DateTime? fim;

  final FusoDoEvento fuso;

  DateTime get inicioNaParede => inicio.add(fuso.deslocamento);
  DateTime? get fimNaParede => fim?.add(fuso.deslocamento);

  /// `Das 9h às 11h`, ou `Às 9h` quando nao ha fim.
  String get faixa {
    final fimParede = fimNaParede;
    if (fimParede == null) return 'Às ${CalendarioPtBr.hora(inicioNaParede)}';
    return 'Das ${CalendarioPtBr.hora(inicioNaParede)} às '
        '${CalendarioPtBr.hora(fimParede)}';
  }

  /// `Das 9h às 11h · 2 horas`, e so `Às 9h` sem fim.
  String get faixaComDuracao {
    final f = fim;
    if (f == null || !f.isAfter(inicio)) return faixa;
    return '$faixa · ${CalendarioPtBr.duracao(f.difference(inicio))}';
  }

  static HorarioDoEncontro doIso({
    required String inicioEmIso,
    required String? fimEmIso,
    required String nomeIana,
  }) {
    return HorarioDoEncontro(
      inicio: DateTime.parse(inicioEmIso).toUtc(),
      fim: fimEmIso == null ? null : DateTime.parse(fimEmIso).toUtc(),
      fuso: FusoDoEvento.resolver(
        nomeIana: nomeIana,
        inicioEmIso: inicioEmIso,
      ),
    );
  }
}

/// A data de um encontro como a TELA precisa dela: dia, mes e dia da semana.
class DiaDoEncontro {
  const DiaDoEncontro(this.parede);

  /// Uma data marcada UTC cujos campos de ano, mes e dia ja sao os do fuso do
  /// evento.
  final DateTime parede;

  String dataLonga({required int anoCorrente}) =>
      CalendarioPtBr.dataLonga(parede, anoCorrente: anoCorrente);

  String get diaAbreviado => CalendarioPtBr.diasAbreviados[parede.weekday - 1];
  String get mesAbreviado => CalendarioPtBr.mesesAbreviados[parede.month - 1];
  int get numero => parede.day;

  /// `local_date` do teaser. Data sem hora: e lida como meio-dia UTC para o dia
  /// da semana nunca escorregar pela borda da meia-noite.
  static DiaDoEncontro? daDataLocal(String? iso) {
    if (iso == null) return null;
    final casou = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso);
    if (casou == null) return null;
    return DiaDoEncontro(
      DateTime.utc(
        int.parse(casou.group(1)!),
        int.parse(casou.group(2)!),
        int.parse(casou.group(3)!),
        12,
      ),
    );
  }
}

/// `#/components/schemas/NetworkEventPlace` do contrato.
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

  /// `Pinheiros · São Paulo, SP`.
  String get bairroECidade => '$bairro · $cidade, $uf';

  /// `Praça Benedito Calixto · Pinheiros`, a linha do cartao.
  String get lugarEBairro => '$nomeDoLugar · $bairro';

  /// Uma linha so para o calendario e para copiar.
  String get linhaCompleta => '$nomeDoLugar, $bairro, $cidade - $uf';

  static LugarDoEncontro doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) {
      throw const FormatException('encontro sem `place`');
    }
    final json = bruto;
    final nome = json['place_name'];
    final bairro = json['neighborhood'];
    final cidade = json['city'];
    final uf = json['state'];
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

/// `#/components/schemas/NetworkEventPrice` do contrato.
class PrecoDoEncontro {
  const PrecoDoEncontro({required this.centavos, required this.unidade});

  final int centavos;
  final UnidadeDoPreco? unidade;

  /// `R$ 15 por pet`, `R$ 12,50 por humano`.
  String get rotulo {
    final valor = reaisEmTexto(centavos, centavosRedondos: false);
    final u = unidade;
    return u == null ? valor : '$valor ${u.rotulo}';
  }

  static PrecoDoEncontro? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final json = bruto;
    final centavos = json['amount'];
    if (centavos is! int) return null;
    final moeda = json['currency'];
    if (moeda != null && moeda != 'BRL') return null;
    return PrecoDoEncontro(
      centavos: centavos,
      unidade: UnidadeDoPreco.porCodigo(json['unit']),
    );
  }
}

/// `#/components/schemas/NetworkEventAdmission` do contrato.
class EntradaDoEncontro {
  const EntradaDoEncontro({required this.tipo, required this.preco});

  final TipoDeEntrada tipo;
  final PrecoDoEncontro? preco;

  /// O texto do selo: `Gratuito` ou o valor.
  String get rotuloDoSelo {
    final p = preco;
    if (tipo == TipoDeEntrada.pago && p != null) return p.rotulo;
    return tipo.rotulo;
  }

  static EntradaDoEncontro doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) {
      throw const FormatException('encontro sem `admission`');
    }
    final json = bruto;
    final tipo = TipoDeEntrada.porCodigo(json['kind']);
    if (tipo == null) {
      throw const FormatException('`admission.kind` desconhecido');
    }
    return EntradaDoEncontro(
      tipo: tipo,
      preco: PrecoDoEncontro.doJson(json['price']),
    );
  }
}

/// `#/components/schemas/NetworkEventImage` do contrato.
class ImagemDoEncontro {
  const ImagemDoEncontro({
    required this.url,
    required this.textoAlternativo,
    this.urlDaMiniatura,
  });

  /// A derivada de 1024 x 576 (16:9), do cartao da agenda.
  final String url;

  /// `thumb_url`: a derivada de 480 x 360 (4:3), **da galeria do detalhe**.
  final String? urlDaMiniatura;

  final String textoAlternativo;

  /// O que a GALERIA pede: a miniatura, com a capa como reserva.
  String get urlParaGaleria => urlDaMiniatura ?? url;

  static List<ImagemDoEncontro> daLista(Object? bruto) {
    if (bruto is! List) return const <ImagemDoEncontro>[];
    return <ImagemDoEncontro>[
      for (final item in bruto)
        if (doJson(item) case final ImagemDoEncontro imagem) imagem,
    ];
  }

  static ImagemDoEncontro? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final json = bruto;
    final url = json['url'];
    final alt = json['alt_text'];
    final miniatura = json['thumb_url'];
    if (url is! String || alt is! String) return null;
    return ImagemDoEncontro(
      url: url,
      urlDaMiniatura: miniatura is String ? miniatura : null,
      textoAlternativo: alt,
    );
  }
}

/// O que o encontro publico e o conteudo do privado aprovado tem em comum.
abstract class ConteudoDoEncontro {
  const ConteudoDoEncontro();

  String get slug;
  String get titulo;
  String get resumo;
  LugarDoEncontro get lugar;
  HorarioDoEncontro get horario;
  SituacaoDoEncontro? get situacao;
  String? get urlDaCapa;

  /// `cover_banner_url`: a derivada de 1280 x 720 da capa, **do detalhe**.
  String? get urlDoBannerDaCapa;

  List<ImagemDoEncontro> get imagens;
  EntradaDoEncontro get entrada;
  Set<Porte> get portesAceitos;
  IdadeDosCaes? get idadeDosCaes;
  bool get vacinacaoExigida;
  bool get areaCercadaParaSoltar;
  List<EstruturaDoLocal> get estrutura;
  List<ItemParaLevar> get oQueLevar;
  String? get observacoes;

  /// Quem cadastrou o encontro, ou **nulo** quando o servidor nao disse.
  OrigemDoEncontro? get origem;

  /// `ticket_url`: onde se compra o convite.
  Uri? get urlDoConvite;

  /// `instagram_url`, montada pelo servidor com a base da configuracao e o
  /// handle.
  Uri? get urlDoInstagram;

  /// `share_url`: o endereco da **pagina publica do encontro** no site, para o
  /// compartilhamento levar um link que abre para quem **ainda nao tem o app**
  /// (decisao do cliente de 21/10/2026, emenda 4 do ADR-0017).
  Uri? get linkDaPagina;

  DiaDoEncontro get dia => DiaDoEncontro(horario.inicioNaParede);

  /// O texto alternativo da capa: o da imagem de posicao 0.
  String? get textoAlternativoDaCapa =>
      imagens.isEmpty ? null : imagens.first.textoAlternativo;

  /// AS URLS QUE O VISUALIZADOR AMPLIA, na ordem da galeria e **numa fonte
  /// so**.
  List<String> get urlsParaAmpliar => <String>[
        for (final (int i, ImagemDoEncontro imagem) in imagens.indexed)
          if (i == 0) urlDoBannerDaCapa ?? imagem.url else imagem.url,
      ];
}

/// Os campos de conteudo, lidos do mesmo jeito nas duas formas.
Set<Porte> _portes(Object? bruto) {
  if (bruto is! List) return <Porte>{...Porte.values};
  final lidos = <Porte>{
    for (final item in bruto)
      if (item is String)
        if (Porte.de(item) case final Porte p) p,
  };
  return lidos.isEmpty ? <Porte>{...Porte.values} : lidos;
}

List<EstruturaDoLocal> _estrutura(Object? bruto) {
  if (bruto is! List) return const <EstruturaDoLocal>[];
  return <EstruturaDoLocal>[
    for (final item in bruto)
      if (EstruturaDoLocal.porCodigo(item) case final EstruturaDoLocal e) e,
  ];
}

/// Um link publico do encontro (`ticket_url`, `instagram_url`).
Uri? _link(Object? bruto) {
  if (bruto is! String || bruto.trim().isEmpty) return null;
  final u = Uri.tryParse(bruto.trim());
  if (u == null || !u.hasScheme || !u.isAbsolute) return null;
  return u;
}

List<ItemParaLevar> _levar(Object? bruto) {
  if (bruto is! List) return const <ItemParaLevar>[];
  return <ItemParaLevar>[
    for (final item in bruto)
      if (ItemParaLevar.porCodigo(item) case final ItemParaLevar i) i,
  ];
}

/// Um encontro da agenda ou do detalhe: `NetworkEventSummary` e `NetworkEvent`
/// sao `oneOf` do publico e do teaser do privado, discriminados por
/// `visibility`.
sealed class EncontroDaRede {
  const EncontroDaRede();

  String get slug;
  String get titulo;
  SituacaoDoEncontro? get situacao;
  DiaDoEncontro get dia;
  VisibilidadeDoEncontro get visibilidade;

  static EncontroDaRede doJson(Map<String, dynamic> json) {
    return switch (json['visibility']) {
      'private' => TeaserDoPrivado.doJson(json),
      'public' => EncontroPublico.doJson(json),
      _ => throw const FormatException('encontro sem `visibility` conhecida'),
    };
  }
}

/// `#/components/schemas/NetworkEventPublic` do contrato.
class EncontroPublico extends EncontroDaRede implements ConteudoDoEncontro {
  const EncontroPublico({
    required this.slug,
    required this.titulo,
    required this.resumo,
    required this.lugar,
    required this.horario,
    required this.situacao,
    required this.urlDaCapa,
    required this.urlDoBannerDaCapa,
    required this.imagens,
    required this.entrada,
    required this.portesAceitos,
    required this.idadeDosCaes,
    required this.vacinacaoExigida,
    required this.areaCercadaParaSoltar,
    required this.estrutura,
    required this.oQueLevar,
    required this.observacoes,
    required this.origem,
    required this.urlDoConvite,
    required this.urlDoInstagram,
    required this.linkDaPagina,
  });

  @override
  final String slug;
  @override
  final String titulo;
  @override
  final String resumo;
  @override
  final LugarDoEncontro lugar;
  @override
  final HorarioDoEncontro horario;
  @override
  final SituacaoDoEncontro? situacao;
  @override
  final String? urlDaCapa;
  @override
  final String? urlDoBannerDaCapa;
  @override
  final List<ImagemDoEncontro> imagens;
  @override
  final EntradaDoEncontro entrada;
  @override
  final Set<Porte> portesAceitos;
  @override
  final IdadeDosCaes? idadeDosCaes;
  @override
  final bool vacinacaoExigida;
  @override
  final bool areaCercadaParaSoltar;
  @override
  final List<EstruturaDoLocal> estrutura;
  @override
  final List<ItemParaLevar> oQueLevar;
  @override
  final String? observacoes;
  @override
  final Uri? linkDaPagina;
  @override
  @override
  final OrigemDoEncontro? origem;
  @override
  final Uri? urlDoConvite;
  @override
  final Uri? urlDoInstagram;

  @override
  VisibilidadeDoEncontro get visibilidade => VisibilidadeDoEncontro.publico;

  @override
  DiaDoEncontro get dia => DiaDoEncontro(horario.inicioNaParede);

  @override
  String? get textoAlternativoDaCapa =>
      imagens.isEmpty ? null : imagens.first.textoAlternativo;

  /// Ver `ConteudoDoEncontro.urlsParaAmpliar`.
  @override
  List<String> get urlsParaAmpliar => <String>[
        for (final (int i, ImagemDoEncontro imagem) in imagens.indexed)
          if (i == 0) urlDoBannerDaCapa ?? imagem.url else imagem.url,
      ];

  static EncontroPublico doJson(Map<String, dynamic> json) {
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
    final fim = json['ends_at'];
    final capa = json['cover_image_url'];
    final bannerDaCapa = json['cover_banner_url'];
    final notas = json['notes'];
    return EncontroPublico(
      slug: slug,
      titulo: titulo,
      resumo: resumo,
      lugar: LugarDoEncontro.doJson(json['place']),
      horario: HorarioDoEncontro.doIso(
        inicioEmIso: inicio,
        fimEmIso: fim is String ? fim : null,
        nomeIana: zona,
      ),
      situacao: SituacaoDoEncontro.porCodigo(json['status']),
      urlDaCapa: capa is String ? capa : null,
      urlDoBannerDaCapa: bannerDaCapa is String ? bannerDaCapa : null,
      imagens: ImagemDoEncontro.daLista(json['images']),
      entrada: EntradaDoEncontro.doJson(json['admission']),
      portesAceitos: _portes(json['accepted_sizes']),
      idadeDosCaes: IdadeDosCaes.porCodigo(json['dog_age']),
      vacinacaoExigida: json['vaccination_required'] == true,
      areaCercadaParaSoltar: json['fenced_off_leash_area'] == true,
      estrutura: _estrutura(json['amenities']),
      oQueLevar: _levar(json['bring_items']),
      observacoes: notas is String && notas.trim().isNotEmpty ? notas : null,
      origem: OrigemDoEncontro.porCodigo(json['origin']),
      urlDoConvite: _link(json['ticket_url']),
      urlDoInstagram: _link(json['instagram_url']),
      linkDaPagina: _link(json['share_url']),
    );
  }
}

/// `#/components/schemas/NetworkEventPrivateTeaser` do contrato.
class TeaserDoPrivado extends EncontroDaRede {
  const TeaserDoPrivado({
    required this.slug,
    required this.titulo,
    required this.dia,
    required this.situacao,
  });

  @override
  final String slug;
  @override
  final String titulo;
  @override
  final DiaDoEncontro dia;
  @override
  final SituacaoDoEncontro? situacao;

  @override
  VisibilidadeDoEncontro get visibilidade => VisibilidadeDoEncontro.privado;

  static TeaserDoPrivado doJson(Map<String, dynamic> json) {
    final slug = json['slug'];
    final titulo = json['title'];
    final data = json['local_date'];
    final dia = DiaDoEncontro.daDataLocal(data is String ? data : null);
    if (slug is! String || titulo is! String || dia == null) {
      throw const FormatException('teaser sem slug, title ou local_date');
    }
    if (json['visibility'] != 'private') {
      throw const FormatException('teaser sem `visibility: private`');
    }
    return TeaserDoPrivado(
      slug: slug,
      titulo: titulo,
      dia: dia,
      situacao: SituacaoDoEncontro.porCodigo(json['status']),
    );
  }
}

/// `#/components/schemas/NetworkEventPrivateDetails` do contrato.
class DetalhesDoPrivado implements ConteudoDoEncontro {
  const DetalhesDoPrivado({
    required this.slug,
    required this.titulo,
    required this.resumo,
    required this.lugar,
    required this.horario,
    required this.situacao,
    required this.urlDaCapa,
    required this.urlDoBannerDaCapa,
    required this.imagens,
    required this.entrada,
    required this.portesAceitos,
    required this.idadeDosCaes,
    required this.vacinacaoExigida,
    required this.areaCercadaParaSoltar,
    required this.estrutura,
    required this.oQueLevar,
    required this.observacoes,
    required this.origem,
    required this.urlDoConvite,
    required this.urlDoInstagram,
  });

  @override
  final String slug;
  @override
  final String titulo;
  @override
  final String resumo;
  @override
  final LugarDoEncontro lugar;
  @override
  final HorarioDoEncontro horario;
  @override
  final SituacaoDoEncontro? situacao;
  @override
  final String? urlDaCapa;
  @override
  final String? urlDoBannerDaCapa;
  @override
  final List<ImagemDoEncontro> imagens;
  @override
  final EntradaDoEncontro entrada;
  @override
  final Set<Porte> portesAceitos;
  @override
  final IdadeDosCaes? idadeDosCaes;
  @override
  final bool vacinacaoExigida;
  @override
  final bool areaCercadaParaSoltar;
  @override
  final List<EstruturaDoLocal> estrutura;
  @override
  final List<ItemParaLevar> oQueLevar;
  @override
  final String? observacoes;

  /// **Sempre nulo, e cravado em vez de lido.** Encontro privado **nao tem
  /// pagina publica** (ADR-0027 12.10): quem nao foi aprovado ve so o teaser, e
  /// publicar uma pagina aberta de um encontro privado entregaria a estranhos o
  /// lugar e a hora que o produto esconde deles.
  @override
  Uri? get linkDaPagina => null;
  @override
  @override
  final OrigemDoEncontro? origem;
  @override
  final Uri? urlDoConvite;
  @override
  final Uri? urlDoInstagram;

  @override
  DiaDoEncontro get dia => DiaDoEncontro(horario.inicioNaParede);

  @override
  String? get textoAlternativoDaCapa =>
      imagens.isEmpty ? null : imagens.first.textoAlternativo;

  /// Ver `ConteudoDoEncontro.urlsParaAmpliar`.
  @override
  List<String> get urlsParaAmpliar => <String>[
        for (final (int i, ImagemDoEncontro imagem) in imagens.indexed)
          if (i == 0) urlDoBannerDaCapa ?? imagem.url else imagem.url,
      ];

  static DetalhesDoPrivado doJson(Map<String, dynamic> json) {
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
        'detalhes sem slug, title, summary, starts_at ou time_zone',
      );
    }
    final fim = json['ends_at'];
    final capa = json['cover_image_url'];
    final bannerDaCapa = json['cover_banner_url'];
    final notas = json['notes'];
    return DetalhesDoPrivado(
      slug: slug,
      titulo: titulo,
      resumo: resumo,
      lugar: LugarDoEncontro.doJson(json['place']),
      horario: HorarioDoEncontro.doIso(
        inicioEmIso: inicio,
        fimEmIso: fim is String ? fim : null,
        nomeIana: zona,
      ),
      situacao: SituacaoDoEncontro.porCodigo(json['status']),
      urlDaCapa: capa is String ? capa : null,
      urlDoBannerDaCapa: bannerDaCapa is String ? bannerDaCapa : null,
      imagens: ImagemDoEncontro.daLista(json['images']),
      entrada: EntradaDoEncontro.doJson(json['admission']),
      portesAceitos: _portes(json['accepted_sizes']),
      idadeDosCaes: IdadeDosCaes.porCodigo(json['dog_age']),
      vacinacaoExigida: json['vaccination_required'] == true,
      areaCercadaParaSoltar: json['fenced_off_leash_area'] == true,
      estrutura: _estrutura(json['amenities']),
      oQueLevar: _levar(json['bring_items']),
      observacoes: notas is String && notas.trim().isNotEmpty ? notas : null,
      origem: OrigemDoEncontro.porCodigo(json['origin']),
      urlDoConvite: _link(json['ticket_url']),
      urlDoInstagram: _link(json['instagram_url']),
    );
  }
}

/// `#/components/schemas/NetworkEventNearby` do contrato: o publico com a
/// distancia a partir da regiao cadastrada de quem chama.
class EncontroPorPerto {
  const EncontroPorPerto({required this.encontro, required this.distanciaEmMetros});

  final EncontroPublico encontro;

  /// Metros, arredondados a 100 pelo servidor.
  final int? distanciaEmMetros;

  static EncontroPorPerto doJson(Map<String, dynamic> json) {
    final bruta = json['distance_m'];
    final distancia = bruta is int ? bruta : null;
    return EncontroPorPerto(
      encontro: EncontroPublico.doJson(json),
      distanciaEmMetros: distancia,
    );
  }
}

/// A distancia como a tela a escreve: `A cerca de {n} km da sua região`.
abstract final class DistanciaDaRegiao {
  static int quilometros(int metros) {
    final km = (metros / 1000).round();
    return km < 1 ? 1 : km;
  }

  static String texto(int metros) =>
      'A cerca de ${quilometros(metros)} km da sua região';

  /// O leitor de tela ouve a unidade por extenso: alguns soletram `km`.
  static String falado(int metros) {
    final n = quilometros(metros);
    return 'a cerca de $n ${n == 1 ? 'quilômetro' : 'quilômetros'} da sua região';
  }
}

/// `#/components/schemas/NetworkEventPoint` do contrato.
class PontoDoEncontro {
  const PontoDoEncontro({required this.lat, required this.lon});

  final double lat;
  final double lon;

  static PontoDoEncontro? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final json = bruto;
    final lat = json['lat'];
    final lon = json['lon'];
    if (lat is! num || lon is! num) return null;
    return PontoDoEncontro(lat: lat.toDouble(), lon: lon.toDouble());
  }
}

/// `#/components/schemas/NetworkEventLocation` do contrato.
class LocalizacaoDoEncontro {
  const LocalizacaoDoEncontro({required this.ponto, required this.endereco});

  final PontoDoEncontro? ponto;

  /// `street_address`: o endereco por extenso, como o painel o escreveu.
  final String? endereco;

  static LocalizacaoDoEncontro doJson(Map<String, dynamic> json) {
    final endereco = json['street_address'];
    return LocalizacaoDoEncontro(
      ponto: PontoDoEncontro.doJson(json['point']),
      endereco: endereco is String && endereco.trim().isNotEmpty
          ? endereco.trim()
          : null,
    );
  }
}

/// `#/components/schemas/NetworkEventJoinRequest` do contrato.
class PedidoDeParticipacao {
  const PedidoDeParticipacao({required this.estado, required this.pedidoEm});

  /// Nulo para um estado que este build nao conhece.
  final EstadoDoPedido? estado;

  final DateTime? pedidoEm;

  static PedidoDeParticipacao doJson(Map<String, dynamic> json) {
    final em = json['requested_at'];
    return PedidoDeParticipacao(
      estado: EstadoDoPedido.porCodigo(json['state']),
      pedidoEm: em is String ? DateTime.tryParse(em) : null,
    );
  }
}

/// `#/components/schemas/MyNetworkEventJoinRequest` do contrato.
class MeuPedido {
  const MeuPedido({required this.encontro, required this.estado});

  final TeaserDoPrivado encontro;
  final EstadoDoPedido? estado;

  static MeuPedido doJson(Map<String, dynamic> json) {
    final evento = json['event'];
    if (evento is! Map<String, dynamic>) {
      throw const FormatException('pedido sem `event`');
    }
    return MeuPedido(
      encontro: TeaserDoPrivado.doJson(evento),
      estado: EstadoDoPedido.porCodigo(json['state']),
    );
  }
}

/// Os campos de paginacao, lidos igual nas tres paginas.
int _inteiro(Object? bruto, int padrao) => bruto is int ? bruto : padrao;

Map<String, String> _filtros(Object? bruto) {
  final filtros = <String, String>{};
  if (bruto is Map) {
    bruto.forEach((chave, valor) {
      if (chave is String && valor is String) filtros[chave] = valor;
    });
  }
  return filtros;
}

/// `#/components/schemas/NetworkEventPage` do contrato.
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

  /// A ordem em que a lista DE FATO saiu.
  final OrdemDaRede ordemEfetiva;
  final QuandoDaRede? quandoEfetivo;
  final Map<String, String> filtrosAplicados;

  /// As cidades dos encontros PUBLICOS desta pagina.
  Set<String> get cidades {
    final achadas = SplayTreeSet<String>();
    for (final item in itens) {
      if (item is EncontroPublico) achadas.add(item.lugar.cidade);
    }
    return achadas;
  }

  static PaginaDaRede doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException('resposta da agenda sem `items`');
    }
    final ordem = OrdemDaRede.porCodigo(json['effective_sort']);
    if (ordem == null) {
      throw const FormatException(
        'resposta da agenda sem `effective_sort` reconhecivel',
      );
    }
    return PaginaDaRede(
      itens: <EncontroDaRede>[
        for (final bruto in itens)
          if (bruto is Map<String, dynamic> && bruto['visibility'] == 'public')
            EncontroDaRede.doJson(bruto),
      ],
      pagina: _inteiro(json['page'], 1),
      limite: _inteiro(json['limit'], 20),
      total: _inteiro(json['total'], 0),
      ordemEfetiva: ordem,
      quandoEfetivo: QuandoDaRede.porCodigo(json['effective_when']),
      filtrosAplicados: _filtros(json['applied_filters']),
    );
  }
}

/// `#/components/schemas/NetworkEventNearbyPage` do contrato.
class PaginaPorPerto {
  const PaginaPorPerto({
    required this.itens,
    required this.pagina,
    required this.limite,
    required this.total,
    required this.ordemEfetiva,
    required this.filtrosAplicados,
  });

  final List<EncontroPorPerto> itens;
  final int pagina;
  final int limite;
  final int total;
  final OrdemPorPerto ordemEfetiva;
  final Map<String, String> filtrosAplicados;

  /// Ha regiao cadastrada: pediu distancia e a distancia valeu, ou algum
  /// encontro veio com a medida.
  bool get temRegiao =>
      ordemEfetiva == OrdemPorPerto.distancia ||
      itens.any((i) => i.distanciaEmMetros != null);

  Map<String, int> get distanciasPorSlug => <String, int>{
        for (final i in itens)
          if (i.distanciaEmMetros != null)
            i.encontro.slug: i.distanciaEmMetros!,
      };

  static PaginaPorPerto doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException('resposta por distancia sem `items`');
    }
    final ordem = OrdemPorPerto.porCodigo(json['effective_sort']);
    if (ordem == null) {
      throw const FormatException(
        'resposta por distancia sem `effective_sort` reconhecivel',
      );
    }
    return PaginaPorPerto(
      itens: <EncontroPorPerto>[
        for (final bruto in itens)
          if (bruto is Map<String, dynamic> && bruto['visibility'] == 'public')
            EncontroPorPerto.doJson(bruto),
      ],
      pagina: _inteiro(json['page'], 1),
      limite: _inteiro(json['limit'], 20),
      total: _inteiro(json['total'], 0),
      ordemEfetiva: ordem,
      filtrosAplicados: _filtros(json['applied_filters']),
    );
  }
}

/// `#/components/schemas/MyNetworkEventJoinRequestPage` do contrato.
class PaginaDeMeusPedidos {
  const PaginaDeMeusPedidos({
    required this.itens,
    required this.pagina,
    required this.limite,
    required this.total,
    required this.filtrosAplicados,
  });

  final List<MeuPedido> itens;
  final int pagina;
  final int limite;
  final int total;
  final Map<String, String> filtrosAplicados;

  static PaginaDeMeusPedidos doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException('resposta de meus pedidos sem `items`');
    }
    if (json['effective_sort'] != 'proximos') {
      throw const FormatException(
        'resposta de meus pedidos sem `effective_sort` reconhecivel',
      );
    }
    return PaginaDeMeusPedidos(
      itens: <MeuPedido>[
        for (final bruto in itens)
          if (bruto is Map<String, dynamic>) MeuPedido.doJson(bruto),
      ],
      pagina: _inteiro(json['page'], 1),
      limite: _inteiro(json['limit'], 20),
      total: _inteiro(json['total'], 0),
      filtrosAplicados: _filtros(json['applied_filters']),
    );
  }
}

/// `#/components/schemas/MyNetworkEventCoverStatus`: o estado da capa do dono.
enum EstadoDaCapa {
  processando('processing'),
  pronta('ready'),
  recusada('rejected');

  const EstadoDaCapa(this.codigo);

  final String codigo;

  /// Nulo para codigo desconhecido: nao ha estado seguro para onde cair, e a
  /// tela nao afirma nada sobre uma situacao que ela nao entende.
  static EstadoDaCapa? porCodigo(Object? codigo) {
    for (final e in EstadoDaCapa.values) {
      if (e.codigo == codigo) return e;
    }
    return null;
  }
}

/// `#/components/schemas/MyNetworkEventCover`: a capa e o que aconteceu com
/// ela.
class CapaDoMeuEncontro {
  const CapaDoMeuEncontro({
    required this.estado,
    required this.url,
    required this.motivoDaRecusa,
  });

  /// Nulo quando o servidor manda um estado que esta versao do app nao conhece.
  final EstadoDaCapa? estado;

  /// A derivada de 1024 x 576, a MESMA que a agenda serve.
  final String? url;

  /// O motivo da recusa, **em texto pronto do servidor**, quando recusada.
  final String? motivoDaRecusa;

  /// Verdadeiro so quando ha estado `recusada` **e** motivo para mostrar.
  bool get recusadaComMotivo =>
      estado == EstadoDaCapa.recusada &&
      motivoDaRecusa != null &&
      motivoDaRecusa!.trim().isNotEmpty;

  /// Verdadeiro enquanto o processador ainda nao terminou com a capa.
  bool get emPreparo => estado == EstadoDaCapa.processando;

  static CapaDoMeuEncontro? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final url = bruto['url'];
    final motivo = bruto['rejection_reason'];
    return CapaDoMeuEncontro(
      estado: EstadoDaCapa.porCodigo(bruto['status']),
      url: url is String && url.isNotEmpty ? url : null,
      motivoDaRecusa:
          motivo is String && motivo.trim().isNotEmpty ? motivo : null,
    );
  }
}

/// `#/components/schemas/MyNetworkEvent`: um encontro na lista do DONO.
class MeuEncontro {
  const MeuEncontro({
    required this.slug,
    required this.titulo,
    required this.capa,
    required this.horario,
    required this.situacao,
  });

  /// O endereco da ACAO: e o que vai em `cancelNetworkEvent` e em
  /// `getMyNetworkEvent`.
  final String slug;

  final String titulo;

  /// Nula quando o encontro nao tem capa nenhuma -- diferente de
  /// [EstadoDaCapa.processando], que e "tem, e o worker nao terminou".
  final CapaDoMeuEncontro? capa;

  final HorarioDoEncontro horario;

  /// Nula para codigo desconhecido, como no resto da secao.
  final SituacaoDoEncontro? situacao;

  DiaDoEncontro get dia => DiaDoEncontro(horario.inicioNaParede);

  /// Se a tela oferece `Cancelar`.
  bool get podeCancelar =>
      situacao == SituacaoDoEncontro.aVir ||
      situacao == SituacaoDoEncontro.acontecendo;

  static MeuEncontro doJson(Map<String, dynamic> json) {
    final slug = json['slug'];
    final titulo = json['title'];
    final inicio = json['starts_at'];
    final zona = json['time_zone'];
    if (slug is! String || titulo is! String || inicio is! String || zona is! String) {
      throw const FormatException(
        'encontro do dono sem slug, title, starts_at ou time_zone',
      );
    }
    final fim = json['ends_at'];
    return MeuEncontro(
      slug: slug,
      titulo: titulo,
      capa: CapaDoMeuEncontro.doJson(json['cover']),
      horario: HorarioDoEncontro.doIso(
        inicioEmIso: inicio,
        fimEmIso: fim is String ? fim : null,
        nomeIana: zona,
      ),
      situacao: SituacaoDoEncontro.porCodigo(json['status']),
    );
  }
}

/// `#/components/schemas/MyNetworkEventPage`.
class PaginaDeMeusEncontros {
  const PaginaDeMeusEncontros({
    required this.itens,
    required this.pagina,
    required this.limite,
    required this.total,
  });

  final List<MeuEncontro> itens;
  final int pagina;
  final int limite;
  final int total;

  static PaginaDeMeusEncontros doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException('resposta de meus eventos sem `items`');
    }
    return PaginaDeMeusEncontros(
      itens: <MeuEncontro>[
        for (final bruto in itens)
          if (bruto is Map<String, dynamic>) MeuEncontro.doJson(bruto),
      ],
      pagina: _inteiro(json['page'], 1),
      limite: _inteiro(json['limit'], 20),
      total: _inteiro(json['total'], 0),
    );
  }
}

/// Um encontro meu **com a versao dele**, como `getMyNetworkEvent` a devolve.
class MeuEncontroComVersao {
  const MeuEncontroComVersao({required this.encontro, required this.etag});

  final MeuEncontro encontro;

  /// Nulo quando a resposta nao trouxe o cabecalho.
  final String? etag;
}

/// O recorte pedido a agenda: o que cada aba manda.
class RecorteDaRede {
  const RecorteDaRede({
    this.termo,
    this.quando,
    this.situacao,
    this.entrada,
    this.cidade,
    this.porte,
    this.distanciaMaxima,
    this.ordem,
    this.pagina = 1,
    this.limite = 20,
  });

  final String? termo;

  /// Um dos sub-recortes de `Próximos`; nulo e `upcoming`.
  final QuandoDaRede? quando;

  /// A SITUACAO pedida (`status` de `listNetworkEvents`), ou nula para todas.
  final SituacaoDoEncontro? situacao;
  final TipoDeEntrada? entrada;
  final String? cidade;
  final Porte? porte;
  final DistanciaMaxima? distanciaMaxima;

  /// `proximos`, `recentes` ou `distancia`.
  final String? ordem;
  final int pagina;
  final int limite;

  /// A mesma consulta em outra pagina, sem o termo de busca, ou com outra
  /// cidade.
  RecorteDaRede copiar({
    int? pagina,
    bool semTermo = false,
    String? cidade,
    bool semCidade = false,
  }) =>
      RecorteDaRede(
        termo: semTermo ? null : termo,
        quando: quando,
        situacao: situacao,
        entrada: entrada,
        cidade: semCidade ? null : (cidade ?? this.cidade),
        porte: porte,
        distanciaMaxima: distanciaMaxima,
        ordem: ordem,
        pagina: pagina ?? this.pagina,
        limite: limite,
      );

  /// O que decide as distancias guardadas: QUAIS encontros publicos entram e DE
  /// ONDE se mede.
  String assinaturaDasDistancias({required String regiao}) => <Object?>[
        regiao,
        cidade,
        quando?.codigo,
        situacao?.codigo,
        entrada?.codigo,
        porte?.valor,
      ].join('|');

  String? get termoLimpo {
    final t = termo?.trim();
    return t == null || t.isEmpty ? null : t;
  }

  /// Quantos GRUPOS de filtro estao ativos.
  int get quantidadeDeFiltros => <Object?>[
        quando,
        situacao,
        entrada,
        cidade,
        porte,
        distanciaMaxima,
      ].where((v) => v != null).length;

  bool get temBusca => termoLimpo != null;

  /// O recorte exige a operacao por distancia.
  bool get pedeDistancia =>
      ordem == OrdemPorPerto.distancia.codigo || distanciaMaxima != null;

  /// `listNetworkEvents`, com o `when` da aba.
  Map<String, String> queryDaAgenda({required QuandoDaRede quandoDaAba}) =>
      <String, String>{
        'q': ?termoLimpo,
        'city': ?cidade,
        'when': (quando ?? quandoDaAba).codigo,
        if (situacao != null) 'status': situacao!.codigo,
        if (ordem != null && OrdemDaRede.porCodigo(ordem) != null)
          'sort': ordem!,
        if (entrada != null) 'admission': entrada!.codigo,
        'visibility': VisibilidadeDoEncontro.publico.codigo,
        if (porte != null) 'size': porte!.valor,
        'page': '$pagina',
        'limit': '$limite',
      };

  /// `listNearbyNetworkEvents`.
  Map<String, String> queryPorPerto({required OrdemPorPerto ordemPorPerto}) =>
      <String, String>{
        'q': ?termoLimpo,
        'city': ?cidade,
        'when': (quando ?? QuandoDaRede.aVir).codigo,
        if (entrada != null) 'admission': entrada!.codigo,
        if (porte != null) 'size': porte!.valor,
        'sort': ordemPorPerto.codigo,
        if (distanciaMaxima != null) 'max_km': distanciaMaxima!.codigo,
        'page': '$pagina',
        'limit': '$limite',
      };

}
