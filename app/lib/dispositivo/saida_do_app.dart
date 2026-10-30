import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
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

  /// Instante absoluto (UTC).
  final DateTime inicio;

  /// Nulo quando o encontro nao declara fim: o calendario do sistema poe o
  /// padrao dele, e o app nao inventa uma duracao.
  final DateTime? fim;

  final String local;
  final String descricao;
}

/// A porta de saida da `Rede`: o que leva a pessoa para outro app.
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

  /// Abre o TEXTO do endereco no aplicativo de mapas.
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco});

  /// Abre um link no navegador do aparelho.
  Future<bool> abrirLink(Uri link);

  Future<bool> adicionarAoCalendario(EventoDeCalendario evento);

  /// Abre a folha de compartilhamento do sistema com [texto].
  Future<bool> compartilharTexto({required String texto, required String assunto});
}

/// A implementacao que fala com o aparelho.
class SaidaDoAparelho extends SaidaDoApp {
  const SaidaDoAparelho();

  static const MethodChannel _calendario = MethodChannel('app.bichu/calendario');

  /// O sistema em uso, por [defaultTargetPlatform] e **nao** por
  /// `Platform.isIOS`.
  static bool get _ehIOS => defaultTargetPlatform == TargetPlatform.iOS;

  /// Tenta os destinos **em ordem**, e para no primeiro que abrir.
  static Future<bool> _abrirOPrimeiroQueResponder(List<Uri> destinos) async {
    for (final destino in destinos) {
      try {
        if (await launchUrl(destino, mode: LaunchMode.externalApplication)) {
          return true;
        }
      } on PlatformException {
        // Este nao respondeu. O proximo da lista e a resposta, e a lista termina sempre num `https`, que todo aparelho sabe abrir.
      } on MissingPluginException {
        return false;
      }
    }
    return false;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async {
    final coordenada = '${lat.toStringAsFixed(6)},${lon.toStringAsFixed(6)}';
    return _abrirOPrimeiroQueResponder(<Uri>[
      if (_ehIOS)
        Uri.https('maps.apple.com', '/', <String, String>{
          'll': coordenada,
          'q': nomeDoLugar,
        })
      else
        Uri.parse(
          'geo:$coordenada?q=$coordenada(${Uri.encodeComponent(nomeDoLugar)})',
        ),
      Uri.https('www.openstreetmap.org', '/', <String, String>{
        'mlat': lat.toStringAsFixed(6),
        'mlon': lon.toStringAsFixed(6),
      }).replace(
        fragment:
            'map=17/${lat.toStringAsFixed(6)}/${lon.toStringAsFixed(6)}',
      ),
    ]);
  }

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async {
    final limpo = endereco.trim();
    if (limpo.isEmpty) return false;

    return _abrirOPrimeiroQueResponder(<Uri>[
      if (_ehIOS)
        Uri.https('maps.apple.com', '/', <String, String>{'q': limpo})
      else
        Uri.parse('geo:0,0?q=${Uri.encodeComponent(limpo)}'),
      Uri.https(
        'www.openstreetmap.org',
        '/search',
        <String, String>{'query': limpo},
      ),
    ]);
  }

  @override
  Future<bool> abrirLink(Uri link) async {
    try {
      return await launchUrl(link, mode: LaunchMode.externalApplication);
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

  @override
  Future<bool> compartilharTexto({
    required String texto,
    required String assunto,
  }) async {
    try {
      await SharePlus.instance.share(
        ShareParams(text: texto, subject: assunto, title: assunto),
      );
      return true;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }
}
