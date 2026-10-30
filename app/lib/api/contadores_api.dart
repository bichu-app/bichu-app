/// Os contadores das abas `Pets` e `Rede` (BICHUS-278, cliente 20/10/2026).
library;

import 'api_client.dart';
import 'falhas.dart';

/// `#/components/schemas/SectionSeenInput/properties/section` do contrato.
enum SecaoComContador {
  /// A aba `Pets` -- a listagem publica de perdidos, que e o corpo dela.
  pets('pets'),

  /// A sub-aba `Eventos` da `Rede`.
  eventosDaRede('network_events'),

  /// A sub-aba `Comunidade` da `Rede` -- o diretorio.
  comunidadeDaRede('network_directory');

  const SecaoComContador(this.codigo);

  final String codigo;
}

/// Os tres numeros, como `SectionCounters` os declara.
class ContadoresDeSecao {
  const ContadoresDeSecao({
    required this.perdidosNovos,
    required this.eventosNovos,
    required this.profissionaisNovos,
  });

  final int perdidosNovos;
  final int eventosNovos;
  final int profissionaisNovos;

  /// A soma das duas sub-abas da `Rede`, que e o que o selo da aba pinta.
  int get redeNova => eventosNovos + profissionaisNovos;

  static ContadoresDeSecao deJson(Map<String, Object?> json) {
    return ContadoresDeSecao(
      perdidosNovos: _inteiro(json['lost_pets_new']),
      eventosNovos: _inteiro(json['network_events_new']),
      profissionaisNovos: _inteiro(json['network_directory_new']),
    );
  }

  /// **Campo ausente ou de outro tipo e `FormatException`, e nao zero.**
  static int _inteiro(Object? valor) {
    if (valor is int) return valor < 0 ? 0 : valor;
    throw FormatException('contador fora do contrato: $valor');
  }
}

/// As duas operacoes dos contadores de secao (`tags: [me]`).
class ContadoresApi {
  ContadoresApi(this._api);

  final ApiClient _api;

  /// `GET /v1/me/section-counters`.
  Future<ContadoresDeSecao?> contar({String? cidade}) async {
    try {
      final json = await _api.get(
        '/me/section-counters',
        query: <String, String>{
          if (cidade != null && cidade.trim().length >= 2) 'city': cidade.trim(),
        },
      );
      return ContadoresDeSecao.deJson(json.cast<String, Object?>());
    } on FalhaDeChamada {
      return null;
    } on FormatException {
      return null;
    }
  }

  /// `POST /v1/me/sections-seen`.
  Future<ContadoresDeSecao?> marcarVista(
    SecaoComContador secao, {
    String? cidade,
  }) async {
    try {
      final json = await _api.post(
        '/me/sections-seen',
        corpo: <String, Object?>{
          'section': secao.codigo,
          if (cidade != null && cidade.trim().length >= 2) 'city': cidade.trim(),
        },
      );
      return ContadoresDeSecao.deJson(json.cast<String, Object?>());
    } on FalhaDeChamada {
      return null;
    } on FormatException {
      return null;
    }
  }
}
