/// A fronteira entre o app e o servico de localizacao do aparelho.
library;

import 'dart:async';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;
import 'package:flutter/services.dart' show PlatformException;
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';

/// Os tres estados de permissao, mais o quarto que nao e permissao.
enum PermissaoDeLocalizacao {
  /// O dialogo do sistema ainda nao foi mostrado.
  naoPedida,

  /// A pessoa autorizou. O caminho principal roda.
  concedida,

  /// A pessoa recusou **desta vez**.
  negada,

  /// A pessoa recusou de forma permanente, ou o sistema bloqueou.
  negadaPermanentemente,

  /// Este build ou esta plataforma nao tem localizacao.
  indisponivel,
}

/// De onde a coordenada veio.
enum OrigemDoPonto {
  /// O aparelho mediu. E a unica origem que esta historia produz.
  deviceGps,

  /// A pessoa marcou o ponto num mapa.
  mapPin;

  /// O valor como o contrato o escreve.
  String get noContrato => switch (this) {
        OrigemDoPonto.deviceGps => 'device_gps',
        OrigemDoPonto.mapPin => 'map_pin',
      };
}

/// Por que a captura nao devolveu um ponto.
enum MotivoDeNaoTerPonto {
  /// Recusou desta vez. A tela oferece o bairro e o pedido continua possivel.
  permissaoNegada,

  /// Recusou em definitivo. A tela oferece o bairro e o caminho de volta sao os
  /// AJUSTES, nunca um segundo dialogo que nao abre.
  permissaoNegadaPermanentemente,

  /// A localizacao esta desligada nos ajustes do aparelho.
  servicoDesligado,

  /// Permissao concedida, servico ligado, e o aparelho nao fixou no prazo.
  semFixNoPrazo,

  /// Nao ha localizacao neste build ou nesta plataforma.
  indisponivel,
}

/// Uma coordenada medida pelo aparelho, ainda **no app**.
class PontoCapturado {
  const PontoCapturado({
    required this.lat,
    required this.lon,
    required this.precisaoEmMetros,
    required this.origem,
  });

  final double lat;
  final double lon;

  /// O raio declarado pelo aparelho, em metros.
  final double? precisaoEmMetros;

  final OrigemDoPonto origem;

  /// O `GeoPoint` do contrato.
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
class CapturaSemPonto extends ResultadoDaCaptura {
  const CapturaSemPonto(this.motivo, {this.detalhe});
  final MotivoDeNaoTerPonto motivo;

  /// O QUE DE FATO VEIO DO APARELHO, quando veio algo.
  final String? detalhe;
}

/// Por que a resolucao da cidade nao devolveu nome.
enum MotivoDeNaoTerCidade {
  permissaoNegada,
  permissaoNegadaPermanentemente,
  servicoDesligado,
  semFixNoPrazo,
  indisponivel,
  geocoderAusente,
  falhaDoServico,
  semResultado,
  resolucaoSemResposta;

  /// O codigo CURTO que a tela mostra para a pessoa ler de volta para nos.
  String get codigo => switch (this) {
        MotivoDeNaoTerCidade.permissaoNegada => 'perm-negada',
        MotivoDeNaoTerCidade.permissaoNegadaPermanentemente => 'perm-bloqueada',
        MotivoDeNaoTerCidade.servicoDesligado => 'servico-off',
        MotivoDeNaoTerCidade.semFixNoPrazo => 'sem-fix',
        MotivoDeNaoTerCidade.indisponivel => 'indisponivel',
        MotivoDeNaoTerCidade.geocoderAusente => 'geocoder-ausente',
        MotivoDeNaoTerCidade.falhaDoServico => 'falha-servico',
        MotivoDeNaoTerCidade.semResultado => 'sem-nome',
        MotivoDeNaoTerCidade.resolucaoSemResposta => 'sem-resposta',
      };
}

/// O resultado de uma tentativa de resolver a cidade.
sealed class ResultadoDaCidade {
  const ResultadoDaCidade();
}

/// Deu certo: o nome da cidade, **ja aparado e com espaco colapsado**.
class CidadeResolvida extends ResultadoDaCidade {
  CidadeResolvida(String cidade) : cidade = cidade.trim().replaceAll(RegExp(r'\s+'), ' ');
  final String cidade;
}

/// Nao deu, e o motivo decide a frase: a tela trata os nove em DOIS grupos.
class CidadeNaoResolvida extends ResultadoDaCidade {
  const CidadeNaoResolvida(this.motivo, {this.detalhe});
  final MotivoDeNaoTerCidade motivo;

  /// O QUE A PLATAFORMA DISSE, quando disse algo.
  final String? detalhe;
}

/// O NOME DA CIDADE dentro de um [Placemark], ou nulo quando nao ha nenhum.
String? cidadeDoLugar(Placemark lugar) {
  for (final campo in <String?>[lugar.locality, lugar.subAdministrativeArea]) {
    final nome = (campo ?? '').trim();
    if (nome.isNotEmpty) return nome;
  }
  return null;
}

/// O POUCO que a resolucao de cidade precisa do servico da plataforma.
abstract class ServicoDeGeocodificacao {
  /// Ha geocoder neste aparelho.
  Future<bool> geocoderPresente();

  /// **O SENTIDO AUTORIZADO, e o unico**: coordenada -> lugares.
  Future<List<Placemark>> lugaresDoPonto(double lat, double lon);
}

/// O servico de verdade, pelo pacote `geocoding`.
class GeocodificacaoDaPlataforma implements ServicoDeGeocodificacao {
  Geocoding? _geocoding;

  Geocoding get _plataforma => _geocoding ??= Geocoding();

  @override
  Future<bool> geocoderPresente() => _plataforma.isPresent();

  @override
  Future<List<Placemark>> lugaresDoPonto(double lat, double lon) =>
      _plataforma.placemarkFromCoordinates(lat, lon);
}

/// O que a reserva do ultimo ponto conhecido tinha a dizer.
class _Reserva {
  const _Reserva(this.ponto, this.detalhe);
  final PontoCapturado? ponto;
  final String detalhe;
}

/// O acesso a localizacao do aparelho.
abstract class Localizacao {
  /// O estado atual, **sem** abrir dialogo.
  Future<PermissaoDeLocalizacao> estado();

  /// Pede a permissao, abrindo o dialogo do sistema quando ele ainda abre.
  Future<PermissaoDeLocalizacao> pedir();

  /// Abre os ajustes do sistema, no unico caso em que pedir de novo nao resolve
  /// ([PermissaoDeLocalizacao.negadaPermanentemente]).
  Future<void> abrirAjustesDoSistema();

  /// A localizacao esta ligada nos ajustes do aparelho.
  Future<bool> servicoLigado();

  /// Mede a posicao **aproximada**, desistindo depois de [prazo].
  Future<ResultadoDaCaptura> pontoAproximado({required Duration prazo});

  /// O nome da cidade em que o aparelho esta, ou o motivo de nao ter.
  Future<ResultadoDaCidade> cidadeAproximada({required Duration prazo});
}

/// A implementacao de verdade: `geolocator`.
class LocalizacaoPorGeolocator implements Localizacao {
  LocalizacaoPorGeolocator({
    this.forcarGerenciadorDoSistema = true,
    ServicoDeGeocodificacao? geocodificacao,
  }) : _servico = geocodificacao ?? GeocodificacaoDaPlataforma();

  /// O servico de plataforma, **trocavel so para medir**.
  final ServicoDeGeocodificacao _servico;

  /// No Android, usar o `LocationManager` do sistema em vez do provedor fundido
  /// do Google Play Services.
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
      return CapturaComPonto(_pontoDe(posicao));
    } on Object catch (erro) {
      final reserva = await _ultimoPontoConhecido();
      if (reserva.ponto != null) return CapturaComPonto(reserva.ponto!);
      return CapturaSemPonto(
        MotivoDeNaoTerPonto.semFixNoPrazo,
        detalhe: '${_detalheDoErro(erro)}; ${reserva.detalhe}',
      );
    }
  }

  /// O ponto que a medicao devolveu, traduzido.
  static PontoCapturado _pontoDe(Position posicao) => PontoCapturado(
        lat: posicao.latitude,
        lon: posicao.longitude,
        precisaoEmMetros: posicao.accuracy,
        origem: OrigemDoPonto.deviceGps,
      );

  /// ## A IDADE MAXIMA DO PONTO GUARDADO, e por que ela e 30 minutos
  static const Duration idadeMaximaDoPontoGuardado = Duration(minutes: 30);

  /// Quantas vezes a reserva de fato salvou uma captura nesta sessao.
  int reservasUsadas = 0;

  /// O ULTIMO PONTO QUE O SISTEMA GUARDOU, quando ele ainda serve.
  Future<_Reserva> _ultimoPontoConhecido() async {
    final Position? guardado;
    try {
      guardado = await Geolocator.getLastKnownPosition(
        forceAndroidLocationManager: forcarGerenciadorDoSistema,
      );
    } on Object catch (erro) {
      return _Reserva(null, 'reserva falhou (${_detalheDoErro(erro)})');
    }
    if (guardado == null) {
      return const _Reserva(null, 'reserva sem ponto guardado');
    }
    final idade = DateTime.now().toUtc().difference(guardado.timestamp.toUtc());
    if (idade.isNegative || idade > idadeMaximaDoPontoGuardado) {
      return _Reserva(
        null,
        'reserva velha (${idade.inMinutes}min, teto '
        '${idadeMaximaDoPontoGuardado.inMinutes}min)',
      );
    }
    reservasUsadas += 1;
    return _Reserva(_pontoDe(guardado), 'reserva usada (${idade.inMinutes}min)');
  }

  /// O que der para dizer sobre o erro, em pouco texto e sem dado pessoal.
  static String _detalheDoErro(Object erro) {
    if (erro is PlatformException) {
      final partes = <String>[erro.code];
      final detalhes = erro.details;
      if (detalhes != null) partes.add(detalhes.toString());
      return partes.join(' ');
    }
    return erro.runtimeType.toString();
  }

  /// Os ajustes que vao para o lado nativo -- e **o unico lugar que le
  /// [forcarGerenciadorDoSistema]**.
  LocationSettings _ajustesDaMedicao(Duration prazo) {
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
  static const double gradeEmMetros = 100;

  /// ## O PRAZO DA PORTA PARA O GEOCODER, e por que ele nao e o do chamador
  static const Duration prazoDoGeocoder = Duration(seconds: 10);

  PontoCapturado? _ultimoPonto;
  String? _ultimaCidade;

  /// Quantas vezes o servico de plataforma foi de fato chamado nesta sessao.
  int resolucoesPedidas = 0;

  @override
  Future<ResultadoDaCidade> cidadeAproximada({
    required Duration prazo,
  }) async {
    final captura = await pontoAproximado(prazo: prazo);
    switch (captura) {
      case CapturaSemPonto(motivo: final motivo, detalhe: final detalhe):
        return CidadeNaoResolvida(
          switch (motivo) {
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
          },
          detalhe: detalhe,
        );
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
    try {
      if (!await _servico.geocoderPresente().timeout(prazoDoGeocoder)) {
        return const CidadeNaoResolvida(MotivoDeNaoTerCidade.geocoderAusente);
      }
    } on TimeoutException {
      return CidadeNaoResolvida(
        MotivoDeNaoTerCidade.resolucaoSemResposta,
        detalhe: 'isPresent sem resposta em ${prazoDoGeocoder.inSeconds}s',
      );
    } on Object {
      return const CidadeNaoResolvida(MotivoDeNaoTerCidade.geocoderAusente);
    }

    resolucoesPedidas += 1;
    final List<Placemark> lugares;
    try {
      lugares = await _servico
          .lugaresDoPonto(ponto.lat, ponto.lon)
          .timeout(prazoDoGeocoder);
    } on TimeoutException {
      return CidadeNaoResolvida(
        MotivoDeNaoTerCidade.resolucaoSemResposta,
        detalhe: 'geocoder sem resposta em ${prazoDoGeocoder.inSeconds}s',
      );
    } on Object catch (erro) {
      return CidadeNaoResolvida(
        MotivoDeNaoTerCidade.falhaDoServico,
        detalhe: _detalheDoErro(erro),
      );
    }

    for (final lugar in lugares) {
      final nome = cidadeDoLugar(lugar);
      if (nome != null) {
        _ultimoPonto = ponto;
        _ultimaCidade = nome;
        return CidadeResolvida(nome);
      }
    }
    return CidadeNaoResolvida(
      MotivoDeNaoTerCidade.semResultado,
      detalhe: '${lugares.length} lugar(es) sem nome de cidade',
    );
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
