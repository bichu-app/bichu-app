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

  /// O caminho de `suggestDirectoryEntry`, exposto para a fila offline.
  static const String caminhoDaSugestao = '/directory/suggestions';

  /// O corpo de `suggestDirectoryEntry`, montado num lugar so.
  ///
  /// **O minimo que permite checar, e nada alem**: nome, atividade, cidade,
  /// bairro opcional, um contato publico e um recado para quem revisa. Nao ha
  /// parametro de documento (CRMV, CNPJ) nem de pessoa fisica, e a ausencia e
  /// deliberada: documento e prova de quem o APRESENTA, mora em
  /// `entity_verifications` e pedi-lo aqui seria coletar o documento de um
  /// terceiro pela mao de um estranho.
  ///
  /// Sem coordenada e sem endereco (ADR-0006): cidade, estado e bairro sao
  /// rotulo de texto, nunca fonte de ponto.
  static Map<String, dynamic> corpoDaSugestao({
    required String nome,
    required AtividadeDoDiretorio atividade,
    required String cidade,
    required String uf,
    required TipoDeContatoPublico tipoDeContato,
    required String contato,
    String? bairro,
    String? recado,
  }) {
    return <String, dynamic>{
      'display_name': nome,
      'kind': atividade.codigo,
      'city': cidade,
      'state': uf,
      if (bairro != null && bairro.isNotEmpty) 'neighborhood': bairro,
      'public_contact': <String, dynamic>{
        'kind': tipoDeContato.codigo,
        'value': contato,
      },
      if (recado != null && recado.isNotEmpty) 'note': recado,
    };
  }

  /// `POST /v1/directory/suggestions` (`suggestDirectoryEntry`), com conta.
  ///
  /// **Nao publica nada.** A resposta e um recibo com `state: pending`: a
  /// sugestao entrou na fila de revisao do painel, e e isso que a tela diz. Um
  /// texto de sucesso que sugerisse publicacao seria mentira sobre o nome de
  /// uma clinica real.
  ///
  /// Nao trata recusa: 400, 401 e 429 sobem como `FalhaDeChamada`, e a tela
  /// nomeia o campo recusado por `Problem.campo`.
  Future<ReciboDaSugestao> sugerir(
    Map<String, dynamic> corpo, {
    String? idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDaSugestao,
      corpo: corpo,
      idempotencyKey: idempotencyKey,
    );
    return ReciboDaSugestao.doJson(json);
  }
}
