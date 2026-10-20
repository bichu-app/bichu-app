import 'api_client.dart';
import 'modelos_conexao.dart';

/// As operações da conexão entre pessoas que o app consome (`tags:
/// [connections]`).
///
/// ## Cinco operações, e a ausência de uma sexta é o desenho
///
/// **Não existe `listarConexoes`, e não pode existir.** A lista de conexões não
/// aparece a ninguém, nem a quem é conectado (plano 4-B: *"Lista de conexões |
/// nunca | nunca"*), e o contrato não tem a operação. O que o dono vê sobre as
/// próprias conexões é [resumo] — só números.
///
/// **Não existe busca de pessoas, não existe "seguir" e não existe link de
/// perfil.** As três foram recusadas por decisão escrita, e nenhuma tem método
/// aqui.
///
/// ## Todas levam token
///
/// `bearerAuth` sem alternativa vazia nas cinco. Não há superfície de conexão
/// navegável sem conta, em estado nenhum.
///
/// ## [pedir] existe e nenhuma tela a chama — de propósito
///
/// Ela recebe um **token de convite**, e os dois emissores de convite são
/// outras fatias: a conexão **ancorada** no contexto (caso de pet encerrado como
/// devolvido, encontro em que os dois estiveram) e o **código presencial** com
/// token rotativo de 5 minutos. Enquanto nenhuma das duas existir, o servidor
/// responde 404 a qualquer token — e é por isso que nenhuma tela desta entrega
/// oferece um botão de "conectar".
///
/// O método está aqui, e não foi deixado de fora, porque é ele que fixa a forma
/// do corpo: **um token, nunca um apelido nem um identificador de pessoa**. Com
/// a assinatura escrita, a fatia do convite liga a tela dela sem reabrir a
/// pergunta de como se endereça alguém.
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
