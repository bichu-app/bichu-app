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
/// ## Esta porta nao geocodifica, e isso e estrutural
///
/// ADR-0006: nao ha geocodificacao no MVP. CEP e bairro sao rotulo de exibicao
/// e filtro de listagem, nunca fonte de coordenada; e coordenada nunca vira
/// endereco. Esta porta **nao tem** metodo que faca nenhuma das duas coisas, e
/// o pacote escolhido tambem nao: `geolocator` e so posicao, e a conversao
/// para endereco mora num pacote separado (`geocoding`, do mesmo publicador)
/// que este projeto NAO declara. A garantia nao depende de disciplina de quem
/// escreve a proxima tela: o codigo para converter nao esta no binario.
///
/// O portao que cobra isso e `app/test/dispositivo/sem_geocodificacao_test.dart`.
library;

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
  const LocalizacaoPorGeolocator({this.forcarGerenciadorDoSistema = true});

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
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.low,
          timeLimit: prazo,
        ),
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
}
