import 'api_client.dart';
import 'modelos_diretorio.dart';

/// `GET /v1/directory/entries` (`listDirectoryEntries`) — o diretorio de
/// `Perto`.
///
/// **Ela exige conta, e e isso que torna a resposta possivel.** O portao
/// `src/tools/portao-contrato-publico.ts` reprova `phone_e164` e `distance_m`
/// em qualquer operacao alcancavel sem conta, e reprova com razao: telefone
/// comercial e distancia sao o conteudo util do diretorio e numa rota publica
/// nao poderiam existir. Por isso [listar] **nao** passa `exigeToken: false`:
/// sem token a chamada volta 401, e esse e o desenho.
///
/// **A localizacao nao vai na requisicao.** A ordenacao por distancia usa a
/// localizacao de referencia que o servidor ja guarda (BICHUS-92). Coordenada
/// em URL vai para log de acesso, para o historico do aparelho e para o
/// cabecalho `Referer`. Nenhum parametro desta classe carrega ponto.
///
/// ## Busca por texto: **nao existe nesta rota, hoje**
///
/// O parametro `q` **nao entrou** no contrato, e o motivo esta escrito la: `q`
/// nao esta em `DIMENSOES_CONHECIDAS` de
/// `src/shared/http/aplicacao-de-teto.ts`, e dimensao de teto nova e decisao
/// de politica. Esta classe **nao inventa** o parametro e **nao filtra em
/// memoria para parecer que busca**: filtrar as 20 entradas da pagina
/// carregada e uma busca que funciona com 10 registros e mente com 200.
///
/// Quando `q` entrar no contrato, o lugar de liga-lo e aqui, e o portao de
/// `app/test/telas/perto_com_dados_test.dart` **reprova** enquanto o campo da
/// tela e o parametro da rota estiverem fora de sincronia, nos dois sentidos.
class DiretorioApi {
  const DiretorioApi(this._api);

  final ApiClient _api;

  /// Uma pagina do diretorio, com o [recorte] pedido.
  ///
  /// **Nao trata falha e nao devolve pagina vazia quando a chamada quebra.**
  /// Quem chama precisa distinguir "nao ha profissional por aqui" de "nao
  /// consegui perguntar": um `catch` que devolvesse lista vazia produziria o
  /// estado vazio que parece sucesso.
  Future<PaginaDoDiretorio> listar([
    RecorteDoDiretorio recorte = const RecorteDoDiretorio(),
  ]) async {
    final json = await _api.get('/directory/entries', query: recorte.query);
    return PaginaDoDiretorio.doJson(json);
  }
}
