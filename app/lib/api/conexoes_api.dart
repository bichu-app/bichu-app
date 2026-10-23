import 'api_client.dart';
import 'modelos_conexao.dart';

/// As operações da conexão entre pessoas que o app consome (`tags:
/// [connections]`).
///
/// ## SETE operações desde 22/10/2026, e a sétima é a lista do próprio dono
///
/// **`listarConexoes` EXISTE, e este cabeçalho afirmava o contrário.** Ele dizia
/// *"Não existe `listarConexoes`, e não pode existir. A lista de conexões não
/// aparece a ninguém, nem a quem é conectado"*. **O cliente emendou a própria
/// decisão de 18/10/2026**, literal:
///
/// > *"o usuário pode abrir a lista de usuários que é sua conexão"*
///
/// | | antes | agora |
/// |---|---|---|
/// | a própria lista, para o próprio dono | nunca | [listarConexoes] |
/// | a lista de **TERCEIRO** | nunca | **continua NUNCA** |
///
/// **Não há método para a lista de outra pessoa, e não há como escrevê-lo
/// daqui**: `GET /connections` não tem parâmetro de pessoa, e quem chama vem do
/// token. Tocar as *"N conexões"* no perfil de alguém continua não levando a
/// lugar nenhum.
///
/// [resumo] continua existindo ao lado de [listarConexoes]: a tela diz *"Você
/// tem N de 150 conexões"* com o número e lista com a página.
///
/// **Não existe "seguir"**: a conexão é simétrica e o grafo é um só.
///
/// ## Todas levam token
///
/// `bearerAuth` sem alternativa vazia nas sete. Não há superfície de conexão
/// navegável sem conta, em estado nenhum — e a lista das próprias conexões é o
/// caso mais óbvio disso, porque sem conta não existe "as próprias".
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

  /// `listMyConnections`: **as PRÓPRIAS conexões aceitas** (cliente,
  /// 22/10/2026).
  ///
  /// **Sem parâmetro de pessoa**, e isso é o desenho: a conta vem do token, e
  /// não há como pedir a lista de outra pessoa a partir deste método.
  ///
  /// Só conexões **aceitas** — pendente vive em [pedidos], nas duas caixas.
  /// Conta desabilitada de qualquer um dos dois lados sai da lista sem a linha
  /// ser apagada.
  Future<PaginaDeConexoes> listarConexoes({int pagina = 1, int limite = 20}) async {
    final json = await _api.get(
      '/connections',
      query: <String, String>{'page': '$pagina', 'limit': '$limite'},
    );
    return PaginaDeConexoes.doJson(json);
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
