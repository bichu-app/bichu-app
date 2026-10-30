import 'api_client.dart';
import 'modelos_conexao.dart';
import 'modelos_pessoa.dart';

/// As três operações do **convite do próprio perfil** — o que alimenta o QR.
class ConvitesApi {
  const ConvitesApi(this._api);

  final ApiClient _api;

  static const String caminho = '/connection-invites';

  /// `issueConnectionInvite`.
  Future<ConviteEmitido> emitir() async {
    return ConviteEmitido.doJson(await _api.post(caminho));
  }

  /// `revokeConnectionInvite`.
  Future<void> revogar() async {
    await _api.delete(caminho);
  }

  /// `resolveConnectionInvite` — **a tela de destino do QR**.
  Future<PerfilDePessoa> resolver(String tokenDoConvite) async {
    final json = await _api.post(
      '$caminho/resolution',
      corpo: <String, dynamic>{'invite_token': tokenDoConvite},
    );
    return PerfilDePessoa.doJson(json);
  }
}
