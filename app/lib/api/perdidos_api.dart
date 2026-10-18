import 'api_client.dart';
import 'modelos_perdido.dart';

/// A operação pública de perdidos do contrato (`tags: [public]`).
///
/// Escrita contra `api/openapi.yaml`, que é a autoridade.
///
/// ## `exigeToken: false`, e isso é o contrato e não uma folga
///
/// `listPublicLostPets` declara `security: []`: ela é **pública e deslogada**.
/// É o que faz a vizinhança achar o pet — quem recebeu o link no grupo do
/// bairro não tem conta, e exigir uma fecharia a porta pela qual o produto
/// funciona. Esta é a razão de a aba `Pets` ter conteúdo sem conta.
///
/// ## Paginação NUMERADA, e a escolha não é desta classe
///
/// O contrato declara `page` e `limit` com `total` na resposta, e escreve o
/// motivo na descrição da operação: *"a tela precisa dizer '1 a 20 de 87' e
/// permitir chegar ao fim da lista"*. Trocar para cursor seria mudança
/// **quebrante** de contrato (os três campos da resposta são `required` em
/// `PublicLostPetPage`), e mudança quebrante não se faz por preferência de
/// cliente. `listMyFoundReports`, ao lado, é por cursor — porque é assim que o
/// contrato a declara.
///
/// O que o cliente garante é o que a paginação numerada não garante sozinha: a
/// ordem do servidor tem desempate estável (`last_seen_at desc`, depois
/// `share_token`), então a página 2 não repete nem pula caso.
class PerdidosApi {
  const PerdidosApi(this._api);

  final ApiClient _api;

  /// O caminho de `listPublicLostPets`, relativo a `/v1`.
  static const String caminho = '/public/lost-pets';

  /// `GET /public/lost-pets` (`listPublicLostPets`).
  ///
  /// **Sem token, sempre.** Mandar um `Authorization` numa rota que declara
  /// `security: []` não é inofensivo: a borda recusa token vencido antes do
  /// manipulador em rotas de autenticação opcional, e a listagem passaria a
  /// falhar para quem está com a sessão velha — justamente quem mais precisa
  /// dela.
  Future<PaginaDePerdidos> listar(RecorteDePerdidos recorte) async {
    final json = await _api.get(
      caminho,
      query: recorte.query,
      exigeToken: false,
    );
    return PaginaDePerdidos.doJson(json);
  }
}
