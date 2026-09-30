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
/// ## Busca por texto: **existe desde 30/09**
///
/// `q` entrou no contrato de `listDirectoryEntries` com `minLength: 3`, teto
/// proprio e indice GIN de trigrama do lado do servidor. Esta classe o repassa
/// por [RecorteDoDiretorio.query], e continua **nao filtrando em memoria**:
/// filtrar as 20 entradas da pagina carregada e uma busca que funciona com 10
/// registros e mente com 200. O alcance declarado na tela e
/// `AlcanceDaBusca.servidor` porque e o alcance REAL.
///
/// O portao de `app/test/telas/perto_com_dados_test.dart` cobra os dois
/// sentidos: sem `q` no contrato o campo nao pode existir na tela, e com `q`
/// no contrato o campo passa a ser obrigatorio.
///
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
