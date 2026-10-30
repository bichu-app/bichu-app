import 'api_client.dart';

/// A duvida que o tutor manda pelo botao `Ajuda` do menu do usuario.
///
/// Pedido do cliente de 29/10/2026 ("no menu do usuario, adicione um botao de
/// ajuda, que abrira uma pagina com um formulario de duvida"), com a decisao de
/// destino tomada na mesma conversa: **grava no banco e vai para o
/// backoffice**, **sem notificacao por e-mail**.
///
/// ## NAO HA ENUM AQUI, E A AUSENCIA E DELIBERADA
///
/// O formulario tem dois campos de TEXTO LIVRE, e nenhuma lista fechada. Nao
/// existe enum de "assunto da duvida" porque nao existe lista de assuntos: o
/// contrato declara `subject` como `string`, e inventar aqui uma lista que a
/// spec nao tem criaria um enum sem ancora -- que `verificar-conformidade-do-app`
/// cobra por `enum-sem-classificacao`, e com razao.
///
/// ## NAO HA MODELO DE RESPOSTA
///
/// A rota responde `202` com `{"status":"accepted"}`, o envelope `Accepted` que
/// as denuncias ja usam. Nao ha identificador para o aplicativo guardar, e nao
/// ha `GET` desta duvida: o tutor nao tem historico, e a tela de sucesso nao
/// mostra protocolo nenhum porque nao existe nenhum para mostrar.
class AjudaApi {
  const AjudaApi(this._api);

  final ApiClient _api;

  /// `POST /v1/me/help-requests` -- grava a duvida na fila do painel.
  ///
  /// **NAO envia e-mail, nao notifica e nao promete prazo.** Quem le e uma
  /// pessoa abrindo a fila do backoffice.
  ///
  /// `assunto` vai ate 120 caracteres e `texto` ate 4000, os mesmos tetos de
  /// `HelpRequestInput`. Acima disso a rota responde `400` com o campo nomeado:
  /// **ela recusa e nunca trunca**.
  ///
  /// Sem `Idempotency-Key`, e isto e escolha. Duvida repetida e duvida
  /// repetida -- o tutor que mandar duas vezes mandou duas, e deduplicar seria
  /// o servidor decidir que a segunda nao conta. Quem segura rajada e o teto de
  /// chamada (dez por dia por conta), que recusa com mensagem.
  Future<void> mandarDuvida(String assunto, String texto) async {
    await _api.post(
      '/me/help-requests',
      corpo: <String, dynamic>{'subject': assunto.trim(), 'body': texto.trim()},
    );
  }
}
