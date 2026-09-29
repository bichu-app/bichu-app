import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// Um encontro para o calendario do aparelho.
class EventoDeCalendario {
  const EventoDeCalendario({
    required this.titulo,
    required this.inicio,
    required this.fim,
    required this.local,
    required this.descricao,
  });

  final String titulo;

  /// Instante absoluto (UTC). O calendario do aparelho desenha no fuso dele,
  /// e o instante e o que nao muda entre fusos.
  final DateTime inicio;

  /// Nulo quando o encontro nao declara fim: o calendario do sistema poe o
  /// padrao dele, e o app nao inventa uma duracao.
  final DateTime? fim;

  final String local;
  final String descricao;
}

/// A porta de saida da `Rede`: o que leva a pessoa para outro app.
///
/// **Duas saidas, e nenhuma pede permissao.**
///
/// - [abrirNoAppDeMapas]: a intencao `geo:` (Android) com o ponto e o nome do
///   lugar como rotulo, sem rota (UX 28.3, decisao 1); sem app que responda, o
///   mesmo ponto no navegador. So recebe o ponto de um ENCONTRO: a porta nao
///   tem metodo que aceite coordenada solta de outra coisa (UX 28.4).
/// - [adicionarAoCalendario]: a tela de "novo evento" do calendario do
///   sistema, ja preenchida (`Intent.ACTION_INSERT` em
///   `CalendarContract.Events`). Nao le nem escreve o calendario, e por isso
///   nao exige `READ_CALENDAR`/`WRITE_CALENDAR`: quem salva e a pessoa, no app
///   dela (design system 24.12.1, item 4).
///
/// Mora em `lib/dispositivo/` porque abre canal de plataforma, que o portao de
/// `porta_nao_contornada_test.dart` proibe em tela.
///
/// **iOS:** o canal do calendario nao existe no Runner (o iOS esta dormente
/// por decisao de 23/09). [adicionarAoCalendario] devolve `false` e a tela diz
/// que nao conseguiu, em vez de fingir.
abstract class SaidaDoApp {
  const SaidaDoApp();

  /// A implementacao em uso. Troca so em teste.
  static SaidaDoApp atual = const SaidaDoAparelho();

  @visibleForTesting
  static void restaurar() => atual = const SaidaDoAparelho();

  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  });

  Future<bool> adicionarAoCalendario(EventoDeCalendario evento);
}

/// A implementacao que fala com o aparelho.
class SaidaDoAparelho extends SaidaDoApp {
  const SaidaDoAparelho();

  static const MethodChannel _calendario = MethodChannel('app.bichu/calendario');

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async {
    final coordenada = '${lat.toStringAsFixed(6)},${lon.toStringAsFixed(6)}';
    final geo = Uri.parse(
      'geo:$coordenada?q=$coordenada(${Uri.encodeComponent(nomeDoLugar)})',
    );
    try {
      if (await launchUrl(geo, mode: LaunchMode.externalApplication)) {
        return true;
      }
    } on PlatformException {
      // Sem app que responda a `geo:`: cai no navegador, abaixo.
    }
    final navegador = Uri.https('www.openstreetmap.org', '/', <String, String>{
      'mlat': lat.toStringAsFixed(6),
      'mlon': lon.toStringAsFixed(6),
    }).replace(fragment: 'map=17/${lat.toStringAsFixed(6)}/${lon.toStringAsFixed(6)}');
    try {
      return await launchUrl(navegador, mode: LaunchMode.externalApplication);
    } on PlatformException {
      return false;
    }
  }

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async {
    try {
      final abriu = await _calendario.invokeMethod<bool>(
        'adicionar',
        <String, Object?>{
          'titulo': evento.titulo,
          'inicioEmMs': evento.inicio.millisecondsSinceEpoch,
          'fimEmMs': evento.fim?.millisecondsSinceEpoch,
          'local': evento.local,
          'descricao': evento.descricao,
        },
      );
      return abriu ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }
}
