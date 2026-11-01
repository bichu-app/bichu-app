import 'api_client.dart';
import 'falhas.dart';

/// O veredito do servidor sobre ESTA versao do aplicativo.
enum VereditoDeVersao {
  /// Esta versao serve. **E o valor de toda ausencia e de toda falha.**
  liberado,

  /// Ha versao nova e esta ainda funciona.
  recomendado,

  /// Esta versao nao serve mais.
  bloqueado,
}

/// O que o portao de versao recebeu do servidor.
class RespostaDeVersao {
  const RespostaDeVersao({
    required this.veredito,
    this.loja,
    this.servidorRespondeu = true,
  });

  /// O veredito LIBERADO, sem loja.
  const RespostaDeVersao.liberado()
      : veredito = VereditoDeVersao.liberado,
        loja = null,
        servidorRespondeu = true;

  /// LIBERADO **e nao houve servidor do outro lado**.
  const RespostaDeVersao.semResposta()
      : veredito = VereditoDeVersao.liberado,
        loja = null,
        servidorRespondeu = false;

  final VereditoDeVersao veredito;

  /// Houve um servidor do outro lado desta pergunta.
  final bool servidorRespondeu;

  /// Para onde mandar a pessoa.
  final Uri? loja;
}

/// A consulta ao veredito de versao (`getAppVersionStatus`).
class VersaoApi {
  const VersaoApi(this._api);

  final ApiClient _api;

  static const String caminho = '/app/version-status';

  static const Map<String, VereditoDeVersao> _vereditos = <String, VereditoDeVersao>{
    'supported': VereditoDeVersao.liberado,
    'update_recommended': VereditoDeVersao.recomendado,
    'update_required': VereditoDeVersao.bloqueado,
  };

  /// Pergunta o veredito. **Nunca lanca, e nunca bloqueia por falha.**
  Future<RespostaDeVersao> consultar({
    required String plataforma,
    required String? versao,
  }) async {
    if (versao == null || versao.isEmpty) return const RespostaDeVersao.liberado();
    try {
      final json = await _api.get(
        caminho,
        query: <String, String>{'platform': plataforma, 'version': versao},
        exigeToken: false,
      );
      final bruto = json['verdict'];
      if (bruto is! String) return const RespostaDeVersao.liberado();
      final veredito = _vereditos[bruto] ?? VereditoDeVersao.liberado;
      if (veredito == VereditoDeVersao.liberado) {
        return const RespostaDeVersao.liberado();
      }
      return RespostaDeVersao(veredito: veredito, loja: _loja(json['store_url']));
    } on FalhaDeConexao {
      return const RespostaDeVersao.semResposta();
    } on FalhaDeTempo {
      return const RespostaDeVersao.semResposta();
    } on Object {
      return const RespostaDeVersao.liberado();
    }
  }

  static Uri? _loja(Object? bruto) {
    if (bruto is! String || bruto.isEmpty) return null;
    final uri = Uri.tryParse(bruto);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
    return uri;
  }
}
