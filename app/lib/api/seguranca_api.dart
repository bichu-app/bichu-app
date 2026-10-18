import 'api_client.dart';

/// As cinco operacoes de bloquear e denunciar (`tags: [safety]` do contrato).
///
/// ## O que este arquivo NAO tem, e a ausencia e o desenho
///
/// **Nenhuma leitura.** Nao existe "minhas denuncias", nao existe estado de
/// denuncia e nao existe consulta -- nem no contrato, nem aqui. O servidor
/// responde `202` e nada mais, e **nenhum prazo e prometido, porque nao existe
/// prazo**. Uma leitura da propria denuncia seria exatamente o lugar por onde
/// um prazo prometido entraria na tela.
///
/// **Nenhuma funcao de aviso.** O denunciado nao e avisado -- avisar e
/// retaliacao --, e nao ha nada neste arquivo que o avise.
///
/// ## O `404` que a tela recebe quando a outra pessoa a bloqueou
///
/// E **identico** ao de pessoa inexistente: mesmo corpo, mesmo codigo. A tela
/// nao sabe a diferenca, e nao pode saber -- descobrir que foi bloqueado e o
/// que gera retaliacao. Entao a tela trata os dois do mesmo jeito: "nao
/// encontramos esta pessoa".
class SegurancaApi {
  const SegurancaApi(this._api);

  final ApiClient _api;

  /// `POST /v1/users/{userRef}/blocks`.
  ///
  /// **Idempotente**: bloquear de novo responde o mesmo `204`, e nao erro.
  /// A tela nao precisa de um segundo caminho.
  Future<void> bloquear(String refDaPessoa) async {
    await _api.post('/users/$refDaPessoa/blocks');
  }

  /// `DELETE /v1/users/{userRef}/blocks`. Idempotente pelo mesmo motivo.
  Future<void> desbloquear(String refDaPessoa) async {
    await _api.delete('/users/$refDaPessoa/blocks');
  }

  /// `POST /v1/users/{userRef}/reports` -- a denuncia de PERFIL.
  ///
  /// `motivo` e um dos cinco valores de `ProfileReportInput.reason`, e a tela
  /// so consegue oferecer esses cinco: eles vivem em [MotivoDeDenuncia], que e
  /// uma lista fechada no Dart tambem.
  Future<void> denunciarPerfil(String refDaPessoa, String motivo, {String? relato}) async {
    await _api.post('/users/$refDaPessoa/reports', corpo: _corpo(motivo, relato));
  }

  /// `POST /v1/photos/{photoRef}/reports` -- a denuncia de FOTO.
  ///
  /// O endereco e a chave da derivada publica, que e a MESMA pela qual a tela
  /// carregou a imagem. Denuncia-se NA FOTO, e nao no perfil, porque quem
  /// modera precisa saber qual imagem.
  Future<void> denunciarFoto(String chaveDaFoto, String motivo, {String? relato}) async {
    await _api.post('/photos/$chaveDaFoto/reports', corpo: _corpo(motivo, relato));
  }

  /// `POST /v1/publications/{publicationRef}/reports` -- a denuncia de
  /// PUBLICACAO, no proprio cartao.
  Future<void> denunciarPublicacao(String refDaPublicacao, String motivo, {String? relato}) async {
    await _api.post('/publications/$refDaPublicacao/reports', corpo: _corpo(motivo, relato));
  }

  /// `detail` so vai quando ha algo escrito.
  ///
  /// Vazio e ausente sao a MESMA coisa, e mandar `''` faria o servidor gravar
  /// uma cadeia vazia onde o desenho quer nulo -- duas representacoes de "sem
  /// relato" divergem na primeira leitura que compare uma delas.
  static Map<String, dynamic> _corpo(String motivo, String? relato) {
    final limpo = relato?.trim();
    return <String, dynamic>{
      'reason': motivo,
      if (limpo != null && limpo.isNotEmpty) 'detail': limpo,
    };
  }
}
