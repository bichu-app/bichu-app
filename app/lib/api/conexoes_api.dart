import 'api_client.dart';
import 'modelos_conexao.dart';

/// As operações da conexão entre pessoas que o app consome (`tags:
/// [connections]`).
///
/// ## Seis operações, e a ausência de uma sétima é o desenho
///
/// **Não existe `listarConexoes`, e não pode existir.** A lista de conexões não
/// aparece a ninguém, nem a quem é conectado (plano 4-B: *"Lista de conexões |
/// nunca | nunca"*), e o contrato não tem a operação. O que o dono vê sobre as
/// próprias conexões é [resumo] — só números.
///
/// **Não existe "seguir"**: a conexão é simétrica e o grafo é um só.
///
/// ## Todas levam token
///
/// `bearerAuth` sem alternativa vazia nas seis. Não há superfície de conexão
/// navegável sem conta, em estado nenhum.
///
/// ## [pedir] e [pedirPorApelido]: DUAS credenciais, nunca as duas juntas
///
/// **Isto mudou em 20/10/2026, e o cabeçalho anterior afirmava o contrário.**
/// Ele dizia que o corpo carrega *"um token, nunca um apelido"*, e que pedir
/// por apelido *"seria busca de pessoas pela porta de trás"*. A frase deixou de
/// valer: o cliente reverteu a recusa junto com a busca de pessoas, e o
/// `ConnectionInvite` do contrato passou a ser um `oneOf` de exatamente uma das
/// duas credenciais.
///
/// | O que vai no corpo | De onde a tela o tirou |
/// |---|---|
/// | `invite_token` | o QR do perfil de alguém, lido pelo leitor do app |
/// | `handle` | a aba `Usuários` da `Rede` |
///
/// **O `oneOf` recusa corpo com as duas e corpo com nenhuma**, e é por isso que
/// há dois métodos e não um com dois parâmetros anuláveis: uma assinatura que
/// aceitasse os dois deixaria o erro acontecer no servidor, com 400, em vez de
/// não ser exprimível aqui.
///
/// **O que a reversão NÃO comprou:** o pedido por apelido não é um oráculo de
/// existência de apelido. Apelido inexistente, apelido de pet, apelido
/// reservado, conta desabilitada, quem bloqueou quem pede e perfil que quem
/// pede denunciou respondem **o mesmo 404** — os seis fundidos na cláusula
/// `WHERE`, e não num `if` de borda. A tela diz "não encontramos esta pessoa" e
/// não tem como distinguir qual dos seis foi.
///
/// ## OS TETOS NÃO SÃO `type` PRÓPRIO, e é aqui que quem chama se engana
///
/// Teto estourado é **400 `validation-failed`** com o motivo em `errors[].code`,
/// e nunca 429 — o 429 é do teto de *requisições* por hora. Os seis códigos
/// possíveis estão em [RecusaDoPedidoDeConexao], com o `field` que os carrega.
/// Uma tela que tratasse teto por status mostraria "servidor fora" para quem
/// bateu num limite de 24 horas.
///
/// ## Nenhuma chamada devolve lista vazia quando quebra
///
/// Falha sobe como `FalhaDeChamada`. Quem chama distingue "não há pedido" de
/// "não consegui perguntar".
class ConexoesApi {
  const ConexoesApi(this._api);

  final ApiClient _api;

  static const String caminhoDoPedido = '/connections';

  /// `requestConnection`. **O corpo é um convite.**
  ///
  /// `idempotencyKey` é obrigatória: um reenvio da mesma tentativa não pode
  /// virar um segundo pedido na caixa da outra pessoa.
  Future<Conexao> pedir({
    required String tokenDoConvite,
    required String idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDoPedido,
      corpo: <String, dynamic>{'invite_token': tokenDoConvite},
      idempotencyKey: idempotencyKey,
    );
    return Conexao.doJson(json);
  }

  /// `requestConnection` **pela aba `Usuários`**: o corpo é um apelido.
  ///
  /// O apelido entra **sem o `@`** — o `@` é símbolo de leitura e não faz parte
  /// do identificador —, e é o mesmo valor que `PersonSearchResult.handle`
  /// trouxe. A tela não o monta, não o normaliza e não o compõe: ela repassa o
  /// que o servidor devolveu.
  ///
  /// **Apelido e nunca `public_ref`, e nunca UUID** (ADR-0010 item 6). O
  /// apelido é a referência pública da pessoa e o endereço do perfil, e é o que
  /// a busca devolve; `public_ref` existe no perfil porque **aquela** tela
  /// hospeda denunciar e bloquear, e não tem uso aqui.
  ///
  /// [idempotencyKey] é obrigatória pelo mesmo motivo de [pedir]: um reenvio da
  /// mesma tentativa não pode virar um segundo pedido na caixa da outra pessoa.
  Future<Conexao> pedirPorApelido({
    required String apelido,
    required String idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDoPedido,
      corpo: <String, dynamic>{'handle': apelido},
      idempotencyKey: idempotencyKey,
    );
    return Conexao.doJson(json);
  }

  /// `listMyConnectionRequests`. Uma das **duas** caixas.
  Future<PaginaDePedidosDeConexao> pedidos({
    CaixaDePedidos caixa = CaixaDePedidos.recebidos,
    int pagina = 1,
    int limite = 20,
  }) async {
    final json = await _api.get(
      '/connections/requests',
      query: <String, String>{
        'direction': caixa.codigo,
        'page': '$pagina',
        'limit': '$limite',
      },
    );
    return PaginaDePedidosDeConexao.doJson(json);
  }

  /// `getMyConnectionSummary`. Só números, e só da própria conta.
  Future<ResumoDeConexoes> resumo() async {
    return ResumoDeConexoes.doJson(await _api.get('/connections/summary'));
  }

  /// `acceptConnection`. **Sem aceite não há conexão.**
  Future<Conexao> aceitar(String ref) async {
    return Conexao.doJson(await _api.post('/connections/$ref/acceptance'));
  }

  /// `endConnection`: recusar, cancelar ou desfazer — **as três**.
  ///
  /// O app **não** diz qual: a semântica é derivada do estado e do papel no
  /// servidor, e a resposta é 204 sem corpo nas três. Um parâmetro de intenção
  /// aqui deixaria a tela mandar "desfazer" num pendente e lavar a recusa.
  ///
  /// **E o 204 é o que mantém a recusa silenciosa**: não há nada para a tela de
  /// quem pediu ler que diga "ela recusou você".
  Future<void> encerrar(String ref) async {
    await _api.delete('/connections/$ref');
  }
}
