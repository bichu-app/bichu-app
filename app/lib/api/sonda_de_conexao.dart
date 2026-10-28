import 'falhas.dart';
import 'api_client.dart';

/// A SONDA DA ABERTURA: *da para falar com o servidor agora?*
///
/// ====================================================================
/// POR QUE ELA EXISTE, E POR QUE NAO E O PORTAO DE VERSAO
/// ====================================================================
///
/// O cliente pediu em 26/10/2026 **uma mensagem de erro quando a pessoa abre
/// o aplicativo sem internet**, em vez de uma tela de abertura que nao diz
/// nada. A pergunta de versao (`VersaoApi.consultar`) ja saia na abertura e
/// seria o lugar obvio -- mas ela **nao sai** quando o build nao declarou
/// `APP_VERSION` (medido, e e o estado do build de iOS). Um mecanismo que
/// depende de um `--dart-define` esquecido e exatamente o defeito de 19/10 que
/// `verificar-apk.sh` existe para nao deixar voltar.
///
/// Entao a conectividade tem uma pergunta **propria**, que nao depende de
/// `APP_VERSION` nenhum: `GET /health`, que o contrato declara `security: []`
/// e **sem `x-rate-limit`** -- e a unica operacao publica assim, de proposito,
/// porque quem a chama e sonda. Nenhuma linha do contrato muda por causa
/// desta classe.
///
/// **E UMA requisicao a mais, nao duas.** Quem chama (`PortaoDeVersao`) so
/// sonda quando a pergunta de versao NAO saiu. Com `APP_VERSION` no build, a
/// abertura continua custando a mesma unica chamada que custava antes.
///
/// ====================================================================
/// ESTA CLASSE NAO LANCA, PELA MESMA RAZAO DE `VersaoApi`
/// ====================================================================
///
/// Quem a consome decide o que a pessoa ve na abertura do app. Falha que
/// sobe daqui seria uma chance de a abertura quebrar por causa da sonda que
/// existe para explicar a falha -- e o custo de errar para esse lado e o
/// produto inteiro.
class SondaDeConexao {
  const SondaDeConexao(this._api);

  final ApiClient _api;

  static const String caminho = '/health';

  /// `true` quando ha um servidor do outro lado. **Nunca lanca.**
  ///
  /// ## Os DOIS sintomas que caem no mesmo veredito, de proposito
  ///
  /// *Sem internet* e *servidor fora* tem a mesma cara para quem abriu o app:
  /// nada carrega e nada explica. O cliente pediu os dois juntos, e tratar um
  /// e nao o outro deixaria metade do defeito de pe com o conserto parecendo
  /// pronto. Entao devolve `false`:
  ///
  /// 1. **sem rede** (`FalhaDeConexao`: sem sinal, DNS, recusa de conexao);
  /// 2. **sem resposta no prazo** (`FalhaDeTempo`, 20 s do `ApiClient`);
  /// 3. **servidor fora** (`FalhaDaApi` de 5xx -- 502 e 503 do balanceador sao
  ///    a cara de serviço que caiu).
  ///
  /// E devolve `true` em tudo o mais, inclusive:
  ///
  /// - **4xx**, que e servidor VIVO respondendo (um 404 aqui significa rota
  ///   que este destino nao publica, e nao aparelho sem rede: trancar a
  ///   abertura nesse caso seria o app se recusando a abrir porque uma sonda
  ///   de operacao mudou de lugar);
  /// - **corpo fora do contrato**, pelo mesmo motivo: a resposta voltou.
  ///
  /// O `catch` final e sobre `Object` e nao sobre `FalhaDeChamada`, pela mesma
  /// razao escrita em `VersaoApi`: corpo 200 fora do contrato estoura
  /// `TypeError`/`FormatException`, fora da hierarquia declarada -- e nenhum
  /// desses dois e "sem internet".
  Future<bool> servidorRespondeu() async {
    try {
      await _api.get(caminho, exigeToken: false);
      return true;
    } on FalhaDeConexao {
      return false;
    } on FalhaDeTempo {
      return false;
    } on FalhaDaApi catch (falha) {
      return falha.problem.status < 500;
    } on Object {
      // Resposta que voltou e nao deu para ler. O servidor esta la.
      return true;
    }
  }
}
