/// A fronteira entre o app e o servico de localizacao do aparelho.
///
/// **Por que uma porta, e nao uma chamada direta ao plugin.** Pelo mesmo
/// motivo de `camera_e_galeria.dart` e de `avisos.dart`: permissao e dialogo,
/// e nao configuracao. A diferenca desta porta para as outras duas esta no que
/// ela precisa separar, e sao DUAS coisas que costumam ser confundidas numa so:
///
/// - **permissao** e o que a pessoa respondeu ao dialogo do sistema;
/// - **servico ligado** e se o aparelho tem a localizacao ligada nos ajustes.
///
/// As duas sao independentes e as duas falham sozinhas. Permissao concedida
/// com o servico desligado devolve posicao nenhuma, e a tela que trata isso
/// como "negou" manda a pessoa para a tela de permissao que ela ja concedeu.
/// Por isso [Localizacao.servicoLigado] existe separado de
/// [Localizacao.estado].
///
/// **A terceira falha nao e nenhuma das duas: o GPS nao fixa.** Permissao
/// concedida, servico ligado, e mesmo assim a posicao nao chega -- dentro de
/// predio, em garagem, no primeiro uso depois de o aparelho ligar. Isso nao e
/// erro e nao e recusa: e demora sem prazo. Uma captura sem prazo maximo
/// deixaria a tela girando para sempre, e o "ponto de uso" da BICHUS-23 vira
/// um fluxo que nao termina. Por isso [Localizacao.pontoAproximado] recebe um
/// [Duration] e desiste, com motivo.
///
/// ## Esta porta converte num sentido so, e o outro segue proibido
///
/// ADR-0006, emenda 1 de 19/10/2026 (decisao do cliente: *"autorizar o gps, e
/// trazer algum valor padrao em caso de fallback"*):
///
/// - **coordenada -> nome de cidade: AUTORIZADO.** E o que
///   [Localizacao.cidadeAproximada] faz, pelo servico de plataforma, e e o
///   unico metodo de conversao desta porta.
/// - **endereco -> coordenada: PROIBIDO, e continua.** CEP e bairro seguem
///   sendo rotulo de exibicao e filtro de listagem, nunca fonte de coordenada.
///   Esta porta **nao tem** metodo que faca isso, e nao pode passar a ter sem
///   nova decisao.
///
/// A garantia mudou de FORMA, e isso precisa estar dito: ela era a ausencia do
/// pacote no binario e passou a ser **assercao sobre o uso**. O pacote
/// `geocoding` traz os dois sentidos no mesmo arquivo
/// (`placemarkFromCoordinates` e `locationFromAddress`), e nao da para
/// importar meio pacote. Quem cobra a diferenca e
/// `app/test/dispositivo/sem_geocodificacao_test.dart`, que foi ESTREITADO e
/// nao removido: ele permite `placemarkFromCoordinates` por nome, e reprova
/// `locationFromAddress` em qualquer importe, chamada ou porta.
///
/// **E A COORDENADA SAI DO APARELHO PARA RESOLVER A CIDADE.** Apple no iOS,
/// Google no Android, com teto de uso e indisponibilidade por pais. O
/// `pubspec.yaml` tem o paragrafo inteiro, com o que o cliente aceitou em
/// troca. Nao existe resolucao local: quem achar que existe vai desenhar uma
/// tela que promete offline o que nao e.
library;

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';

/// Os tres estados de permissao, mais o quarto que nao e permissao.
///
/// Mesma forma do `EstadoDaPermissao` da camera, e de proposito: quem ja leu
/// aquela porta le esta sem reaprender nada. Nao e o MESMO enum porque juntar
/// os dois obrigaria cada tela a tratar um valor que nao existe no caso dela,
/// que e o argumento que `avisos.dart` ja registrou.
enum PermissaoDeLocalizacao {
  /// O dialogo do sistema ainda nao foi mostrado. Pedir abre o dialogo.
  naoPedida,

  /// A pessoa autorizou. O caminho principal roda.
  concedida,

  /// A pessoa recusou **desta vez**. Pedir de novo ainda abre o dialogo.
  negada,

  /// A pessoa recusou de forma permanente, ou o sistema bloqueou. Pedir de
  /// novo **nao abre dialogo nenhum**: o unico caminho e os ajustes do
  /// sistema, e a tela precisa dizer isso em vez de repetir o pedido.
  negadaPermanentemente,

  /// Este build ou esta plataforma nao tem localizacao.
  ///
  /// Nao e recusa: e ausencia. Tratar isto como recusa mandaria a pessoa para
  /// os ajustes procurar uma permissao que nao existe. O caminho alternativo
  /// (digitar o bairro) passa a ser o unico -- e ele e o mesmo caminho de quem
  /// nega, entao a tela nao ganha um quarto desenho por causa deste estado.
  indisponivel,
}

/// De onde a coordenada veio. E o `source` da BICHUS-92.
///
/// **Sao exatamente dois, e nao ha um terceiro**, porque os dois sao os unicos
/// jeitos de uma coordenada nascer sem geocodificacao (ADR-0006): o aparelho
/// mediu, ou a pessoa apontou. CEP e bairro digitados **nunca** produzem um
/// valor deste enum, e e por isso que [AreaDigitada] nao carrega nenhum.
enum OrigemDoPonto {
  /// O aparelho mediu. E a unica origem que esta historia produz.
  deviceGps,

  /// A pessoa marcou o ponto num mapa.
  ///
  /// **Modelado e nao produzido, e isso e deliberado.** A BICHUS-23 lista
  /// "Mapa" em *Fora desta historia*, e o produto nao mostra mapa (BICHUS-14 e
  /// 37). O valor existe aqui porque o contrato e a BICHUS-92 o preveem, e
  /// porque quem construir a correcao de ponto precisa encontrar o lugar dele
  /// ja pronto em vez de inventar um terceiro nome.
  ///
  /// Enquanto nao ha mapa, a correcao que a pessoa tem e outra e ela existe:
  /// trocar a captura pelo bairro digitado, que e reversivel e nao exige mapa.
  mapPin;

  /// O valor como o contrato o escreve.
  String get noContrato => switch (this) {
        OrigemDoPonto.deviceGps => 'device_gps',
        OrigemDoPonto.mapPin => 'map_pin',
      };
}

/// Por que a captura nao devolveu um ponto.
///
/// Cada valor leva a uma frase diferente na tela, e e por isso que eles sao
/// cinco e nao um. Um `null` no lugar disto faria as cinco situacoes virarem a
/// mesma mensagem generica, e a pessoa que esta com o servico desligado seria
/// mandada para a tela de permissao que ela ja concedeu.
enum MotivoDeNaoTerPonto {
  /// Recusou desta vez. A tela oferece o bairro e o pedido continua possivel.
  permissaoNegada,

  /// Recusou em definitivo. A tela oferece o bairro e o caminho de volta sao
  /// os AJUSTES, nunca um segundo dialogo que nao abre.
  permissaoNegadaPermanentemente,

  /// A localizacao esta desligada nos ajustes do aparelho. Nao e recusa.
  servicoDesligado,

  /// Permissao concedida, servico ligado, e o aparelho nao fixou no prazo.
  semFixNoPrazo,

  /// Nao ha localizacao neste build ou nesta plataforma.
  indisponivel,
}

/// Uma coordenada medida pelo aparelho, ainda **no app**.
///
/// [precisaoEmMetros] e o raio que o proprio aparelho declara, e ele existe
/// aqui por uma razao de tela: a BICHUS-23 pede que o app diga o que capturou
/// **sem prometer exatidao que nao tem**. Sem este numero a tela so pode
/// dizer "peguei sua localizacao", que e mais forte do que a medicao sustenta.
class PontoCapturado {
  const PontoCapturado({
    required this.lat,
    required this.lon,
    required this.precisaoEmMetros,
    required this.origem,
  });

  final double lat;
  final double lon;

  /// O raio declarado pelo aparelho, em metros. Nulo quando ele nao declara.
  final double? precisaoEmMetros;

  final OrigemDoPonto origem;

  /// O `GeoPoint` do contrato.
  ///
  /// **A coordenada vai CRUA, e a quantizacao e do servidor.** A grade de
  /// ~100 m do criterio 10 acontece "antes de ir para o banco", e quem a
  /// aplica e `localizacaoAGravar` no servidor (BICHUS-92), onde ela e
  /// autoridade. Quantizar aqui tambem pareceria zelo e seria o contrario:
  /// regra de negocio no aparelho e inspecionavel, e a versao antiga do app
  /// nunca some -- um app que quantiza com grade diferente da do servidor
  /// produz dois tamanhos de celula no mesmo banco, e o defeito so aparece na
  /// consulta de alcance, meses depois.
  Map<String, Object?> get noContrato => <String, Object?>{
        'lat': lat,
        'lon': lon,
        if (precisaoEmMetros != null) 'accuracy_m': precisaoEmMetros!.round(),
      };
}

/// O resultado de uma tentativa de captura: um ponto, ou o motivo de nao ter.
sealed class ResultadoDaCaptura {
  const ResultadoDaCaptura();
}

/// Deu certo.
class CapturaComPonto extends ResultadoDaCaptura {
  const CapturaComPonto(this.ponto);
  final PontoCapturado ponto;
}

/// Nao deu, e o motivo decide o que a tela diz.
///
/// **Isto nao e um erro a ser lancado.** Nenhum dos cinco motivos e excecao: a
/// BICHUS-23 exige que o fluxo continue funcionando em todos eles, pelo campo
/// de bairro. Uma excecao obrigaria cada chamador a lembrar do `try`, e quem
/// esquecer derruba a tela -- que e exatamente o "fluxo travado" que o
/// criterio 5 proibe.
class CapturaSemPonto extends ResultadoDaCaptura {
  const CapturaSemPonto(this.motivo);
  final MotivoDeNaoTerPonto motivo;
}

/// Por que a resolucao da cidade nao devolveu nome.
///
/// **Sao OITO, e cada um e um caminho que acontece de verdade.** Os cinco
/// primeiros sao os de [MotivoDeNaoTerPonto], repetidos aqui porque sem ponto
/// nao ha o que resolver; os tres ultimos sao da resolucao em si, e nenhum
/// deles e exotico:
///
/// - [geocoderAusente] e medido pelo proprio pacote (`isPresent()`), e ele
///   existe porque o geocoder do Android **pode nao estar no aparelho** --
///   AOSP sem Play Services, e paises onde o servico nao e oferecido;
/// - [tetoDeUsoEstourado] e o `PlatformException(IO_ERROR, ...)` que o README
///   do pacote descreve: *"most of the times it means that the rate limit has
///   been reached"*;
/// - [semResultado] e a lista de lugares vindo vazia, ou vindo sem `locality`
///   -- mar aberto, zona rural, e o aparelho que responde mas nao sabe.
///
/// **Nenhum dos oito e erro, e nenhum deles vira excecao.** Os oito caem para
/// a reserva da tela, que e a lista nacional dos 20 mais recentes. Um `null`
/// no lugar deste enum faria os oito virarem a mesma ausencia, e a tela nao
/// teria como registrar o que aconteceu.
enum MotivoDeNaoTerCidade {
  permissaoNegada,
  permissaoNegadaPermanentemente,
  servicoDesligado,
  semFixNoPrazo,
  indisponivel,
  geocoderAusente,
  tetoDeUsoEstourado,
  semResultado,
}

/// O resultado de uma tentativa de resolver a cidade.
sealed class ResultadoDaCidade {
  const ResultadoDaCidade();
}

/// Deu certo: o nome da cidade, **ja aparado e com espaco colapsado**.
///
/// A normalizacao de espaco nao e enfeite e foi MEDIDA em 19/10/2026 contra
/// `texto_para_busca` do banco: ela absorve acento (`São`/`Sao`) e caixa
/// (`SAO PAULO`/`sao paulo`), e **nao absorve espaco** -- `'São  Paulo'`
/// normaliza para `'sao  paulo'` e nao casa com `'sao paulo'`, e
/// `' São Paulo '` tambem nao. Como o nome vem de fora (a plataforma decide a
/// forma), deixar o espaco passar produziria lista vazia com cara de defeito.
class CidadeResolvida extends ResultadoDaCidade {
  CidadeResolvida(String cidade) : cidade = cidade.trim().replaceAll(RegExp(r'\s+'), ' ');
  final String cidade;
}

/// Nao deu, e o motivo e so para registro: a tela trata os oito igual.
class CidadeNaoResolvida extends ResultadoDaCidade {
  const CidadeNaoResolvida(this.motivo);
  final MotivoDeNaoTerCidade motivo;
}

/// O acesso a localizacao do aparelho.
abstract class Localizacao {
  /// O estado atual, **sem** abrir dialogo.
  Future<PermissaoDeLocalizacao> estado();

  /// Pede a permissao, abrindo o dialogo do sistema quando ele ainda abre.
  Future<PermissaoDeLocalizacao> pedir();

  /// Abre os ajustes do sistema, no unico caso em que pedir de novo nao
  /// resolve ([PermissaoDeLocalizacao.negadaPermanentemente]).
  Future<void> abrirAjustesDoSistema();

  /// A localizacao esta ligada nos ajustes do aparelho.
  ///
  /// Independente da permissao, e por isso separado dela. Ver o topo.
  Future<bool> servicoLigado();

  /// Mede a posicao **aproximada**, desistindo depois de [prazo].
  ///
  /// Nao pede permissao: quem pede e a tela, depois da antessala, porque o
  /// pedido e um ato da pessoa e nao um efeito colateral de medir.
  Future<ResultadoDaCaptura> pontoAproximado({required Duration prazo});

  /// O nome da cidade em que o aparelho esta, ou o motivo de nao ter.
  ///
  /// **O UNICO metodo de conversao desta porta, e num sentido so**
  /// (coordenada -> cidade). Ver o topo do arquivo: o sentido inverso segue
  /// proibido pelo ADR-0006 e e cobrado por portao.
  ///
  /// Nao pede permissao, pela mesma razao de [pontoAproximado]: sem permissao
  /// concedida ela devolve [MotivoDeNaoTerCidade.permissaoNegada] em vez de
  /// abrir dialogo. Quem pede e a tela, por um toque da pessoa.
  Future<ResultadoDaCidade> cidadeAproximada({required Duration prazo});
}

/// A implementacao de verdade: `geolocator`.
///
/// ## Precisao APROXIMADA, e o que isso significa em cada plataforma
///
/// Criterio 2 da BICHUS-23: a precisao pedida e `coarse`. Aqui isso e
/// [LocationAccuracy.low], que o pacote traduz para ~1000 m no iOS e ~500 m no
/// Android (`PRIORITY_LOW_POWER`). Nao e detalhe de bateria: pedir
/// `high` traria a rua e o numero de quem abriu o app em casa, e o produto
/// nunca mostra mais que bairro (ADR-0010). O dado mais fino nao teria onde
/// ser usado e teria onde vazar.
///
/// **O que de fato limita a precisao e o MANIFESTO, nao esta linha.** No
/// Android, `ACCESS_COARSE_LOCATION` sem `ACCESS_FINE_LOCATION` e o que impede
/// o sistema de entregar o ponto fino, e e la que a regra e inspecionavel. No
/// iOS, o escopo `Ao usar o app` sai de o `Info.plist` ter
/// `NSLocationWhenInUseUsageDescription` e **nao ter** nenhuma chave de
/// `Always`: o proprio `geolocator_apple` escolhe
/// `requestAlwaysAuthorization` quando so acha a chave de `Always`
/// (`PermissionHandler.m`). As duas coisas sao cobradas em
/// `app/test/dispositivo/permissoes_de_loja_test.dart`, e nao aqui, porque um
/// portao sobre codigo Dart nao enxergaria nenhuma delas.
///
/// ## Nada sai deste aparelho por causa deste pacote
///
/// `geolocator` nao faz rede: nao ha cliente HTTP nem socket no codigo Dart
/// dele, e a coordenada so sai do aparelho quando ESTE app a manda para a
/// nossa API. [forcarGerenciadorDoSistema] existe para o unico ponto em que
/// isso poderia deixar de ser verdade -- ver o campo.
class LocalizacaoPorGeolocator implements Localizacao {
  LocalizacaoPorGeolocator({this.forcarGerenciadorDoSistema = true});

  /// No Android, usar o `LocationManager` do sistema em vez do provedor
  /// fundido do Google Play Services.
  ///
  /// **Ligado por padrao, e isto e uma decisao de privacidade, nao de
  /// desempenho.** O provedor fundido (`FusedLocationProvider`) costuma fixar
  /// mais rapido porque combina GPS com a base de Wi-Fi e de celula do Google
  /// -- e essa combinacao e feita por um componente do Google, no aparelho,
  /// que consulta servico do Google. O `LocationManager` do proprio Android
  /// nao envolve terceiro nenhum.
  ///
  /// O produto precisa de bairro, nao de calcada: a precisao que o provedor
  /// fundido acrescenta nao tem uso aqui, e o custo dela e uma dependencia de
  /// terceiro no caminho de um dado pessoal. Quando o ganho passar a importar,
  /// isto vira `false` num lugar so, com a decisao registrada.
  ///
  /// **Quem le este campo e [_ajustesDaMedicao], e so ele.** A observacao nao
  /// e organizacao de codigo: entre a BICHUS-23 e 20/10/2026 este campo
  /// existiu DECLARADO E NAO LIDO -- a captura montava um [LocationSettings]
  /// puro, que no Android e justamente o provedor fundido do Google. A prosa
  /// acima estava inteira, a decisao estava tomada, e no aparelho ela nao
  /// valia. Um campo de privacidade que ninguem le nao reprova nada, e foi
  /// por isso que `gerenciador_do_sistema_test.dart` passou a medir o valor
  /// que chega ao canal.
  final bool forcarGerenciadorDoSistema;

  @override
  Future<PermissaoDeLocalizacao> estado() async =>
      _traduzir(await Geolocator.checkPermission());

  @override
  Future<PermissaoDeLocalizacao> pedir() async =>
      _traduzir(await Geolocator.requestPermission());

  @override
  Future<void> abrirAjustesDoSistema() async {
    await Geolocator.openAppSettings();
  }

  @override
  Future<bool> servicoLigado() => Geolocator.isLocationServiceEnabled();

  @override
  Future<ResultadoDaCaptura> pontoAproximado({
    required Duration prazo,
  }) async {
    final permissao = await estado();
    switch (permissao) {
      case PermissaoDeLocalizacao.negada:
      case PermissaoDeLocalizacao.naoPedida:
        // `naoPedida` cai aqui de proposito: medir NAO pede. Quem pede e a
        // tela, depois da antessala. Chegar em `pontoAproximado` sem ter
        // pedido e erro de fluxo, e o lado seguro dele e nao abrir dialogo
        // nenhum -- abrir seria o pedido sem contexto que a antessala existe
        // para impedir.
        return const CapturaSemPonto(MotivoDeNaoTerPonto.permissaoNegada);
      case PermissaoDeLocalizacao.negadaPermanentemente:
        return const CapturaSemPonto(
          MotivoDeNaoTerPonto.permissaoNegadaPermanentemente,
        );
      case PermissaoDeLocalizacao.indisponivel:
        return const CapturaSemPonto(MotivoDeNaoTerPonto.indisponivel);
      case PermissaoDeLocalizacao.concedida:
        break;
    }

    if (!await servicoLigado()) {
      return const CapturaSemPonto(MotivoDeNaoTerPonto.servicoDesligado);
    }

    try {
      final posicao = await Geolocator.getCurrentPosition(
        locationSettings: _ajustesDaMedicao(prazo),
      );
      return CapturaComPonto(
        PontoCapturado(
          lat: posicao.latitude,
          lon: posicao.longitude,
          precisaoEmMetros: posicao.accuracy,
          origem: OrigemDoPonto.deviceGps,
        ),
      );
    } on Object {
      // O pacote lanca tipos diferentes para "estourou o prazo", "o servico
      // caiu no meio" e "o aparelho recusou", e os tres terminam na mesma
      // tela: sem ponto, com o bairro oferecido. Distinguir aqui produziria
      // tres frases para uma acao unica.
      return const CapturaSemPonto(MotivoDeNaoTerPonto.semFixNoPrazo);
    }
  }

  /// Os ajustes que vao para o lado nativo -- e **o unico lugar que le
  /// [forcarGerenciadorDoSistema]**.
  ///
  /// Sao duas classes e nao uma porque a escolha de provedor **nao existe no
  /// iOS**: nele ha um `CLLocationManager` e nada mais, e
  /// `forceLocationManager` e campo de [AndroidSettings]. Mandar a chave onde
  /// ela nao tem significado nao e inofensivo: ela viaja no `toJson()` para o
  /// lado nativo e passa a parecer uma garantia que a plataforma nao da.
  ///
  /// **O [LocationSettings] puro nao e um padrao conservador, e o contrario.**
  /// Com ele o `geolocator` cai no `FusedLocationProviderClient` do Google
  /// Play Services -- exatamente o terceiro que o campo existe para tirar do
  /// caminho. Foi assim que a decisao de privacidade ficou escrita no campo e
  /// ausente do aparelho, e e por isso que
  /// `app/test/dispositivo/gerenciador_do_sistema_test.dart` cobra o valor
  /// COMO ELE SAI NO CANAL, e nao a existencia do campo.
  ///
  /// [defaultTargetPlatform] e nao `Platform.isAndroid` porque este arquivo
  /// nao abre `dart:io` -- e porque o portao precisa poder dizer "agora eu sou
  /// Android" sem aparelho.
  LocationSettings _ajustesDaMedicao(Duration prazo) {
    // `low` e a decisao do criterio 2 da BICHUS-23, e ela vale nas duas
    // plataformas: fica num lugar so para as duas nao divergirem.
    const precisao = LocationAccuracy.low;

    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        forceLocationManager: forcarGerenciadorDoSistema,
        accuracy: precisao,
        timeLimit: prazo,
      );
    }

    return LocationSettings(accuracy: precisao, timeLimit: prazo);
  }

  /// ## A MEMORIA DA ULTIMA RESOLUCAO, e por que ela e obrigatoria
  ///
  /// `_ultimoPonto` e `_ultimaCidade` existem para a resolucao NAO acontecer a
  /// cada abertura da tela. Duas razoes, e as duas sao medidas e nao
  /// preferencia:
  ///
  /// 1. **Teto de uso.** O servico de plataforma e limitado, e o README do
  ///    pacote diz que estourar vira `IO_ERROR`. Resolver a cada abertura
  ///    gastaria o teto de quem usa o app muito, e quem usa muito e justamente
  ///    quem esta procurando um pet.
  /// 2. **O ADR-0006 exige a grade de ~100 m.** Ele diz que a localizacao do
  ///    usuario e quantizada numa grade de cerca de 100 m antes de ser
  ///    gravada, porque *"precisao maior nao melhora em nada um raio de 5 km e
  ///    so aumenta o dano de um vazamento"*. O mesmo raciocinio vale para
  ///    nome de CIDADE, com folga: andar 100 m nao troca a cidade. Reresolver
  ///    por menos que isso manda a coordenada para o terceiro de novo sem
  ///    nenhuma chance de a resposta mudar.
  ///
  /// [gradeEmMetros] e a mesma ordem de grandeza da grade do ADR. Ela nao
  /// pretende ser a quantizacao do servidor -- essa continua sendo do servidor
  /// (ver [PontoCapturado.noContrato]); aqui ela e so o limiar de "vale
  /// reperguntar".
  static const double gradeEmMetros = 100;

  PontoCapturado? _ultimoPonto;
  String? _ultimaCidade;
  Geocoding? _geocoding;

  /// Quantas vezes o servico de plataforma foi de fato chamado nesta sessao.
  ///
  /// Existe para ser MEDIDO, e e lido por teste: "quantas resolucoes por
  /// abertura da tela" e uma pergunta com resposta, e sem este contador ela
  /// seria respondida por leitura de codigo.
  int resolucoesPedidas = 0;

  @override
  Future<ResultadoDaCidade> cidadeAproximada({
    required Duration prazo,
  }) async {
    final captura = await pontoAproximado(prazo: prazo);
    switch (captura) {
      case CapturaSemPonto(motivo: final motivo):
        // Os cinco motivos do PONTO atravessam sem traducao perdida: a tela
        // trata os oito igual, e manter o motivo preserva o registro.
        return CidadeNaoResolvida(switch (motivo) {
          MotivoDeNaoTerPonto.permissaoNegada =>
            MotivoDeNaoTerCidade.permissaoNegada,
          MotivoDeNaoTerPonto.permissaoNegadaPermanentemente =>
            MotivoDeNaoTerCidade.permissaoNegadaPermanentemente,
          MotivoDeNaoTerPonto.servicoDesligado =>
            MotivoDeNaoTerCidade.servicoDesligado,
          MotivoDeNaoTerPonto.semFixNoPrazo =>
            MotivoDeNaoTerCidade.semFixNoPrazo,
          MotivoDeNaoTerPonto.indisponivel =>
            MotivoDeNaoTerCidade.indisponivel,
        });
      case CapturaComPonto(ponto: final ponto):
        final guardada = _cidadeGuardadaPara(ponto);
        if (guardada != null) return CidadeResolvida(guardada);
        return _resolver(ponto);
    }
  }

  /// A cidade da ultima resolucao, quando o aparelho nao saiu da celula.
  String? _cidadeGuardadaPara(PontoCapturado ponto) {
    final anterior = _ultimoPonto;
    final cidade = _ultimaCidade;
    if (anterior == null || cidade == null) return null;
    final metros = Geolocator.distanceBetween(
      anterior.lat,
      anterior.lon,
      ponto.lat,
      ponto.lon,
    );
    return metros <= gradeEmMetros ? cidade : null;
  }

  Future<ResultadoDaCidade> _resolver(PontoCapturado ponto) async {
    // `isPresent` PRIMEIRO, e nao dentro do `try`: ausencia de geocoder nao e
    // falha de chamada, e misturar os dois daria a mesma frase para "este
    // aparelho nao tem" e "o teto estourou". Medido no pacote: `isPresent()`
    // existe exatamente porque o Android pode nao ter.
    // Instancia guardada: `Geocoding()` monta o canal de plataforma, e montar
    // um por resolucao seria desperdicio num caminho que ja tem teto de uso.
    final plataforma = _geocoding ??= Geocoding();
    try {
      if (!await plataforma.isPresent()) {
        return const CidadeNaoResolvida(MotivoDeNaoTerCidade.geocoderAusente);
      }
    } on Object {
      // `isPresent` falhando e tratado como ausencia, e nao como teto: o
      // aparelho que nao consegue nem responder "tenho geocoder" nao tem.
      return const CidadeNaoResolvida(MotivoDeNaoTerCidade.geocoderAusente);
    }

    resolucoesPedidas += 1;
    final List<Placemark> lugares;
    try {
      // **O SENTIDO AUTORIZADO, e o unico.** `placemarkFromCoordinates` e
      // coordenada -> lugar. `locationFromAddress` existe no mesmo pacote e
      // NAO pode ser chamado aqui nem em lugar nenhum deste app: ADR-0006, e
      // o portao `sem_geocodificacao_test.dart` reprova por nome.
      lugares = await plataforma.placemarkFromCoordinates(ponto.lat, ponto.lon);
    } on Object {
      // O `IO_ERROR` do teto de uso chega aqui, e e o caminho NORMAL sob
      // volume -- nao o excepcional. Qualquer outra falha de plataforma cai no
      // mesmo lugar porque o desfecho da tela e o mesmo: a reserva.
      return const CidadeNaoResolvida(
        MotivoDeNaoTerCidade.tetoDeUsoEstourado,
      );
    }

    // `locality` e a cidade. Lista vazia, ou `locality` vazia em todos os
    // lugares devolvidos, e `semResultado` -- mar aberto e zona rural
    // respondem assim, e nao sao erro.
    for (final lugar in lugares) {
      // `locality` e ANULAVEL no pacote, e e ela que e a cidade. Um `!` aqui
      // derrubaria a tela no aparelho que responde sem cidade -- que e
      // justamente o caso `semResultado`.
      final nome = (lugar.locality ?? '').trim();
      if (nome.isNotEmpty) {
        _ultimoPonto = ponto;
        _ultimaCidade = nome;
        return CidadeResolvida(nome);
      }
    }
    return const CidadeNaoResolvida(MotivoDeNaoTerCidade.semResultado);
  }

  static PermissaoDeLocalizacao _traduzir(LocationPermission permissao) {
    switch (permissao) {
      case LocationPermission.always:
      case LocationPermission.whileInUse:
        return PermissaoDeLocalizacao.concedida;
      case LocationPermission.denied:
        return PermissaoDeLocalizacao.negada;
      case LocationPermission.deniedForever:
        return PermissaoDeLocalizacao.negadaPermanentemente;
      case LocationPermission.unableToDetermine:
        return PermissaoDeLocalizacao.indisponivel;
    }
  }
}

/// A implementacao para quando a localizacao **nao existe neste processo**.
///
/// Ela nao finge. Todo metodo responde ausencia, e a tela cai no caminho do
/// bairro digitado -- que e o mesmo caminho de quem nega a permissao, e que a
/// BICHUS-23 exige que funcione inteiro de qualquer forma.
///
/// E por ela existir que as telas seguem montaveis sem aparelho, e que os
/// cinco motivos de [MotivoDeNaoTerPonto] tem onde ser exercitados.
class LocalizacaoNaoEmbarcada implements Localizacao {
  const LocalizacaoNaoEmbarcada();

  @override
  Future<PermissaoDeLocalizacao> estado() async =>
      PermissaoDeLocalizacao.indisponivel;

  @override
  Future<PermissaoDeLocalizacao> pedir() async =>
      PermissaoDeLocalizacao.indisponivel;

  @override
  Future<void> abrirAjustesDoSistema() async {}

  @override
  Future<bool> servicoLigado() async => false;

  @override
  Future<ResultadoDaCaptura> pontoAproximado({
    required Duration prazo,
  }) async =>
      const CapturaSemPonto(MotivoDeNaoTerPonto.indisponivel);

  @override
  Future<ResultadoDaCidade> cidadeAproximada({
    required Duration prazo,
  }) async =>
      const CidadeNaoResolvida(MotivoDeNaoTerCidade.indisponivel);
}
