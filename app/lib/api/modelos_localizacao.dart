/// O "onde" que o caso (F3.1) e o achado (F3.5) mandam para a API.
library;

import '../dispositivo/localizacao.dart';

/// Bairro, cidade e UF, **como a pessoa digitou**.
class AreaDigitada {
  const AreaDigitada({required this.cidade, this.bairro, this.uf});

  final String cidade;
  final String? bairro;

  /// A sigla de duas letras. O contrato limita a `minLength: 2, maxLength: 2`.
  final String? uf;

  /// Vazia quando nem a cidade foi preenchida -- o unico caso em que nao ha
  /// area nenhuma para mandar.
  static AreaDigitada? montar({
    required String cidade,
    String? bairro,
    String? uf,
  }) {
    final c = cidade.trim();
    if (c.isEmpty) return null;
    final b = bairro?.trim();
    final u = uf?.trim();
    return AreaDigitada(
      cidade: c,
      bairro: (b == null || b.isEmpty) ? null : b,
      uf: (u == null || u.isEmpty) ? null : u.toUpperCase(),
    );
  }

  /// O `Area` do contrato.
  Map<String, Object?> get noContrato => <String, Object?>{
        'city': cidade,
        if (bairro != null) 'neighborhood': bairro,
        if (uf != null) 'state': uf,
      };
}

/// Onde o pet foi visto: coordenada, area, ou as duas.
sealed class Onde {
  const Onde();

  /// Tem centro, e portanto o alerta de 5 km pode ter raio.
  bool get temCoordenada;

  /// As chaves do `StrayFoundReportInput` (`location` / `area`).
  Map<String, Object?> get noAchado;

  /// As chaves do `LostCaseInput` (`last_seen_location` / `last_seen_area`).
  Map<String, Object?> get noCaso;
}

/// So a coordenada: o aparelho mediu e a pessoa nao digitou bairro.
class OndePorPonto extends Onde {
  const OndePorPonto(this.ponto);

  final PontoCapturado ponto;

  @override
  bool get temCoordenada => true;

  @override
  Map<String, Object?> get noAchado => <String, Object?>{
        'location': ponto.noContrato,
      };

  @override
  Map<String, Object?> get noCaso => <String, Object?>{
        'last_seen_location': ponto.noContrato,
      };
}

/// So a area: a pessoa digitou, e coordenada nao ha.
class OndePorArea extends Onde {
  const OndePorArea(this.area);

  final AreaDigitada area;

  @override
  bool get temCoordenada => false;

  @override
  Map<String, Object?> get noAchado => <String, Object?>{
        'area': area.noContrato,
      };

  @override
  Map<String, Object?> get noCaso => <String, Object?>{
        'last_seen_area': area.noContrato,
      };
}

/// A coordenada **e** o bairro que a pessoa digitou junto.
class OndeComPontoEArea extends Onde {
  const OndeComPontoEArea({required this.ponto, required this.area});

  final PontoCapturado ponto;
  final AreaDigitada area;

  @override
  bool get temCoordenada => true;

  @override
  Map<String, Object?> get noAchado => <String, Object?>{
        'location': ponto.noContrato,
        'area': area.noContrato,
      };

  @override
  Map<String, Object?> get noCaso => <String, Object?>{
        'last_seen_location': ponto.noContrato,
        'last_seen_area': area.noContrato,
      };
}

/// Monta o `Onde` a partir do que a tela tem na mao.
Onde? montarOnde({PontoCapturado? ponto, AreaDigitada? area}) {
  if (ponto != null && area != null) {
    return OndeComPontoEArea(ponto: ponto, area: area);
  }
  if (ponto != null) return OndePorPonto(ponto);
  if (area != null) return OndePorArea(area);
  return null;
}

/// O `Onde` remontado a partir de uma coordenada que **ja foi capturada** e
/// atravessou o envelope de intencao (UX 8.3).
Onde? ondeJaCapturado({
  double? lat,
  double? lon,
  AreaDigitada? area,
}) {
  final ponto = (lat == null || lon == null)
      ? null
      : PontoCapturado(
          lat: lat,
          lon: lon,
          precisaoEmMetros: null,
          origem: OrigemDoPonto.deviceGps,
        );
  return montarOnde(ponto: ponto, area: area);
}
