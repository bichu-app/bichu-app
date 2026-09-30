import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/auth_api.dart';
import '../api/falhas.dart';
import '../api/modelos.dart';
import '../api/problem.dart';
import '../intencao/guarda_de_acao.dart';
import 'deposito_de_sessao.dart';

/// O que aconteceu com a **metade de servidor** do logout.
///
/// Este enum existe por um motivo so, e ele e o defeito que a `BICHUS-81`
/// existe para matar: *sem rede* e *o servidor recusou a minha requisicao* nao
/// sao a mesma coisa, e por meses foram, porque `sair()` tinha um unico
/// `catch (FalhaDeChamada)` que engolia as duas em silencio.
///
/// O estrago do empate: quando o contrato passou a exigir `refresh_token` no
/// corpo, o app -- que nao mandava corpo nenhum -- passou a receber **400** em
/// todo logout. O `catch` largo engolia, a tela dizia que a pessoa saiu, e a
/// familia de refresh continuava viva no banco. Sucesso indistinguivel do
/// nada, que e a forma de falha que este projeto ja pagou varias vezes.
///
/// O apagamento local nao depende deste valor: ele acontece nos quatro casos,
/// sempre (criterio 13.1). O que este valor governa e **o que fica registrado**
/// e o que quem chamou pode dizer a pessoa.
enum RevogacaoNoServidor {
  /// O servidor confirmou. A familia de refresh daquele aparelho morreu no
  /// banco, que e onde ela e conferida.
  confirmada,

  /// Nao havia o que revogar: o app nao tinha sessao guardada. Nao e falha, e
  /// nao vira ruido.
  semSessaoParaRevogar,

  /// A requisicao nao chegou, ou a resposta nao voltou. **Nao e defeito
  /// nosso**, e e operacao normal deste produto: metro, elevador, aviao.
  ///
  /// A consequencia esta declarada no ADR-0002, emenda 1, secao 6: a familia
  /// fica viva no banco ate vencer por inatividade. Ela nao e retentada porque
  /// retentar exigiria **guardar o refresh no aparelho** ate a revogacao
  /// passar, e isso inverte a prioridade -- manteria a credencial no aparelho
  /// justamente enquanto ele esta sem rede. A saida decidida e registrar, nao
  /// reter.
  naoConfirmadaSemRede,

  /// O servidor respondeu, e **recusou**. Isto e defeito nosso: o par
  /// app/contrato esta desencontrado, ou o app mandou o que nao devia.
  ///
  /// Nunca e silencioso. Um 400 aqui significa que nenhum aparelho no mundo
  /// esta conseguindo revogar a propria sessao, e um defeito desse tamanho nao
  /// pode depender de alguem desconfiar da tela.
  recusadaPeloServidor,
}

/// O que se registra sobre a metade de servidor do logout.
class AvisoDeSaida {
  const AvisoDeSaida({
    required this.revogacao,
    required this.mensagem,
    this.problem,
    this.causa,
  });

  final RevogacaoNoServidor revogacao;

  /// Texto para quem for ler o registro: diz o que nao aconteceu e o que isso
  /// deixa em aberto.
  final String mensagem;

  /// O corpo de erro do contrato (RFC 9457), quando houve resposta.
  final Problem? problem;

  /// A excecao original, para quem coleta pilha.
  final Object? causa;
}

/// Para onde vai o registro da saida.
typedef ObservadorDeSaida = void Function(AvisoDeSaida aviso);

/// Algo guardado neste aparelho que **nao pode** sobreviver ao logout.
///
/// Existe para que o criterio 11 da `BICHUS-81` -- "o cache e apagado no
/// logout" -- seja cumprido **em** `sair()`, e nao no `onPressed` de cada tela
/// que por acaso lembrar. Limpeza que mora no botao so acontece pelo caminho do
/// botao: a sessao que cai por refresh recusado, o envelope que expira, o
/// logout disparado de outra tela, todos passariam ao largo. E trocar de conta
/// no mesmo aparelho nao pode expor os pets da conta anterior.
typedef LimpezaAoSair = Future<void> Function();

/// Algo que precisa acontecer **depois de todo login bem-sucedido**.
///
/// Existe por um motivo so, e ele e o SEC-019. Desde 23/09 o servidor apaga o
/// cadastro de push de TODOS os aparelhos da conta em qualquer revogacao em
/// massa -- sair de todos, troca de senha, redefinicao, "nao fui eu", exclusao
/// de conta -- inclusive o aparelho de quem pediu. Ele nao consegue poupar um:
/// nao ha vinculo entre a linha de `user_devices` e a familia de refresh, e um
/// parametro de "nao apague este" seria preenchido por quem esta com o telefone
/// roubado.
///
/// Quem repoe o registro e o app, e tem de ser **em [abrir]**, nao no
/// `onPressed` da tela de entrar. Sao quatro caminhos de login hoje (entrar,
/// criar conta, e os dois de volta pela guarda de intencao) e nenhuma garantia
/// de que o quinto lembre. E a mesma licao de [LimpezaAoSair], do outro lado da
/// sessao: limpeza que mora no botao so acontece pelo caminho do botao.
///
/// **A falha de uma nao derruba o login.** Entrar na conta nao pode depender de
/// um registro de push, e quem esta sem rede no momento do login precisa entrar
/// assim mesmo.
typedef AoEntrar = Future<void> Function();

/// O registro padrao, usado quando ninguem injeta outro.
///
/// A escolha do canal e por severidade, e nao por gosto:
///
/// - **Recusa do servidor** vai por [FlutterError.reportError], que e o canal
///   que a observabilidade do projeto escuta (Sentry, ADR-0008). Defeito de
///   contrato precisa chegar a quem opera, nao ao console de quem por acaso
///   estava com o depurador aberto.
/// - **Falta de rede** vai por [debugPrint]. Ela e esperada, tem consequencia
///   declarada, e transformar sinal ruim em alerta de erro treina todo mundo a
///   ignorar o alerta.
void registrarSaidaNoCanalPadrao(AvisoDeSaida aviso) {
  switch (aviso.revogacao) {
    case RevogacaoNoServidor.confirmada:
    case RevogacaoNoServidor.semSessaoParaRevogar:
      return;
    case RevogacaoNoServidor.naoConfirmadaSemRede:
      debugPrint('Bichu/sessao: ${aviso.mensagem}');
    case RevogacaoNoServidor.recusadaPeloServidor:
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: aviso.causa ?? StateError(aviso.mensagem),
          library: 'bichu/sessao',
          context: ErrorDescription('ao revogar a sessao no logout'),
          informationCollector: () => <DiagnosticsNode>[
            ErrorDescription(aviso.mensagem),
            if (aviso.problem != null)
              ErrorDescription('Problem: ${aviso.problem}'),
          ],
        ),
      );
  }
}

/// Em que ponto do arranque e da autenticacao o app esta.
enum EstadoDaSessao {
  /// O app ainda esta lendo o chaveiro. E o estado da splash, e ele e curto.
  carregando,

  /// Sem conta. **Nao e um muro**: o app inteiro e navegavel assim, e so as
  /// acoes exigem conta (UX 5.2 e 8.1).
  deslogado,

  /// Com conta.
  logado,
}

/// A sessao do app: le o chaveiro no arranque, renova quando expira e avisa
/// quem depende disso.
///
/// Renovacao e rotacao: o refresh token vale uma vez so, e o novo precisa ser
/// gravado antes de qualquer outra chamada. Apresentar um token ja consumido
/// revoga a familia inteira, que e como o roubo de token e detectado.
class ControladorDeSessao extends ChangeNotifier {
  ControladorDeSessao({
    required AuthApi auth,
    required DepositoDeSessao deposito,
    GuardaDeAcao? guardaDeAcao,
    List<LimpezaAoSair> limpezasAoSair = const <LimpezaAoSair>[],
    List<AoEntrar> aoEntrar = const <AoEntrar>[],
    ObservadorDeSaida observadorDeSaida = registrarSaidaNoCanalPadrao,
    // ignore: prefer_initializing_formals
  })  : _auth = auth,
        // ignore: prefer_initializing_formals
        _deposito = deposito,
        // ignore: prefer_initializing_formals
        _guardaDeAcao = guardaDeAcao,
        // ignore: prefer_initializing_formals
        _limpezasAoSair = limpezasAoSair,
        // ignore: prefer_initializing_formals
        _aoEntrar = aoEntrar,
        // ignore: prefer_initializing_formals
        _observadorDeSaida = observadorDeSaida;

  final AuthApi _auth;
  final DepositoDeSessao _deposito;

  /// A guarda da intencao pendente (UX 8.3). Opcional porque nem todo teste de
  /// sessao tem uma; em producao ela existe sempre.
  final GuardaDeAcao? _guardaDeAcao;

  /// Tudo o mais que o app guardou localmente desta conta. Ver [LimpezaAoSair].
  final List<LimpezaAoSair> _limpezasAoSair;

  /// O que refaz o registro do aparelho depois do login. Ver [AoEntrar].
  final List<AoEntrar> _aoEntrar;

  final ObservadorDeSaida _observadorDeSaida;

  EstadoDaSessao _estado = EstadoDaSessao.carregando;
  Sessao? _sessao;
  Future<String?>? _renovacaoEmCurso;

  EstadoDaSessao get estado => _estado;
  Usuario? get usuario => _sessao?.usuario;
  bool get logado => _estado == EstadoDaSessao.logado;

  /// Le o que estiver guardado. Chamado uma vez, no arranque.
  ///
  /// Falha de rede aqui **nao** desloga ninguem: sem sinal, o app abre com a
  /// sessao que ja tinha e a renovacao acontece quando o sinal voltar. Deslogar
  /// alguem por falta de rede e a pior falha possivel neste produto.
  Future<void> iniciar() async {
    final guardada = await _deposito.ler();
    if (guardada == null) {
      _mudar(EstadoDaSessao.deslogado, null);
      return;
    }
    _mudar(EstadoDaSessao.logado, guardada);
    if (guardada.quaseExpirado) {
      unawaited(tokenValido());
    }
  }

  /// Guarda a sessao recem-aberta, avisa as telas e refaz o que o login repoe.
  ///
  /// A ORDEM E O PONTO: [_aoEntrar] roda **depois** de `_mudar`, nunca antes.
  /// O registro do aparelho e uma chamada `bearerAuth`, e ela pergunta o token
  /// ao controlador -- com a sessao ainda nao publicada, ela sairia sem
  /// `Authorization` e o servidor responderia 401 ao registro que o SEC-019
  /// existe para garantir. O sintoma seria invisivel: nenhuma tela muda, nenhum
  /// erro aparece, e a pessoa fica fora da base de alerta.
  Future<void> abrir(Sessao sessao) async {
    await _deposito.gravar(sessao);
    _mudar(EstadoDaSessao.logado, sessao);
    await _reporOQueOLoginRepoe();
  }

  /// O que precisa acontecer de novo a cada login. Ver [AoEntrar].
  ///
  /// Cada uma e isolada pelo mesmo motivo das limpezas de saida: uma que falhe
  /// nao pode impedir as outras, e nenhuma pode derrubar o login. Entrar na
  /// conta sem rede continua funcionando; o que nao acontece e o registro, e a
  /// retomada seguinte com permissao diferente tenta de novo.
  Future<void> _reporOQueOLoginRepoe() async {
    for (final passo in _aoEntrar) {
      try {
        await passo();
      } on Object catch (erro) {
        debugPrint('Bichu/sessao: um passo de pos-login falhou ($erro).');
      }
    }
  }

  /// Sai da conta **neste aparelho**.
  ///
  /// Sao duas metades com garantias diferentes, e confundi-las e o defeito:
  ///
  /// 1. **No servidor**, a familia de refresh apresentada e revogada. E por
  ///    isso que o `refresh_token` vai no corpo: sem ele o servidor nao sabe
  ///    qual familia matar, e um refresh ja copiado continua renovando por ate
  ///    180 dias mesmo depois de o telefone esquece-lo.
  /// 2. **No aparelho**, tudo desta conta e apagado. Isso e **incondicional**
  ///    (criterio 13.1): acontece com a revogacao confirmada, com o servidor
  ///    fora, sem sinal e com o servidor recusando. Limpeza que depende da
  ///    resposta deixa o dado no aparelho exatamente no caso em que ninguem
  ///    esta olhando -- por isso ela mora num `finally` e nao no caminho feliz.
  ///
  /// A ordem e servidor-e-depois-aparelho, e ela nao e arbitraria: a operacao
  /// exige `bearerAuth`, entao apagar o token antes mandaria a requisicao sem
  /// `Authorization` e o servidor recusaria com 401 o logout que ele deveria
  /// atender. O preco e que a limpeza espera o limite de tempo do cliente HTTP
  /// quando nao ha rede; o `finally` garante que ela nao espera mais que isso.
  ///
  /// **Sem rede a pessoa sai assim mesmo.** Prender alguem numa conta porque o
  /// servidor nao respondeu e pior que a familia orfa que sobra no banco: ela e
  /// inalcancavel para quem saiu, porque o unico exemplar do token foi apagado,
  /// e vence sozinha por inatividade. Quem precisa de mais que isso -- aparelho
  /// roubado, token ja exfiltrado -- usa `Sair de todos os aparelhos`
  /// (`BICHUS-125`), que empurra `sessions_invalid_before` e fecha em menos de
  /// um segundo. Este caminho **nao** toca essa coluna: ela e por pessoa, e
  /// empurra-la aqui derrubaria o tablet e o celular de quem ficou em casa.
  ///
  /// A revogacao perdida **nao e retentada**, e isso e decisao e nao omissao
  /// (ADR-0002, emenda 1, secao 6): retentar exigiria guardar o refresh no
  /// aparelho ate a revogacao passar, o que manteria a credencial no disco
  /// justamente enquanto ele esta sem rede. Registra-se em vez de reter.
  ///
  /// Devolve o que aconteceu com a metade de servidor, para que quem chamou
  /// possa dizer a verdade na tela em vez de supor que deu certo.
  Future<RevogacaoNoServidor> sair() async {
    final refresh = _sessao?.refreshToken;
    try {
      return await _revogarNoServidor(refresh);
    } finally {
      await _apagarTudoDestaConta();
    }
  }

  Future<RevogacaoNoServidor> _revogarNoServidor(String? refreshToken) async {
    if (refreshToken == null) {
      // Nao ha sessao guardada: nao ha familia para revogar. Sair mesmo assim
      // e legitimo -- e o caminho de quem reabre o app num estado sujo -- e
      // nao vira ruido no registro.
      return RevogacaoNoServidor.semSessaoParaRevogar;
    }
    try {
      await _auth.sair(refreshToken);
      return RevogacaoNoServidor.confirmada;
    } on FalhaDaApi catch (falha) {
      // O SERVIDOR RESPONDEU E RECUSOU. Este ramo existe separado do de baixo
      // porque junta-los foi o defeito: com um `catch (FalhaDeChamada)` unico,
      // um 400 em 100% dos logouts do mundo era indistinguivel de sinal ruim.
      return _registrar(
        RevogacaoNoServidor.recusadaPeloServidor,
        'O servidor recusou o logout com ${falha.problem.status} '
        '(${falha.problem.tipo}). A sessao foi apagada neste aparelho, mas a '
        'familia de refresh NAO foi revogada no servidor e continua valida ate '
        'vencer por inatividade. Isto e defeito do par app/contrato, nao do '
        'aparelho de quem usa: confira se o corpo do logout ainda satisfaz o '
        '`requestBody` de `logout` em api/openapi.yaml.',
        problem: falha.problem,
        causa: falha,
      );
    } on FalhaDeConexao catch (falha) {
      return _registrar(
        RevogacaoNoServidor.naoConfirmadaSemRede,
        'Logout sem rede: a revogacao nao chegou ao servidor. O apagamento '
        'local aconteceu assim mesmo (criterio 13.1) e a familia de refresh '
        'fica viva ate vencer por inatividade -- assimetria declarada no '
        'ADR-0002, emenda 1, secao 6.',
        causa: falha,
      );
    } on FalhaDeTempo catch (falha) {
      // Separada de [FalhaDeConexao] na camada de API porque ali a acao **pode**
      // ter acontecido. Aqui as duas caem no mesmo veredito de proposito: a
      // consequencia e identica (nao da para confirmar, e nao se retenta) e a
      // repeticao do logout e idempotente no servidor, entao nada muda com a
      // distincao. O que nao pode e cair junto com a recusa, que e defeito.
      return _registrar(
        RevogacaoNoServidor.naoConfirmadaSemRede,
        'Logout sem resposta dentro do prazo (${falha.limite.inSeconds}s): a '
        'revogacao pode ou nao ter acontecido. O apagamento local aconteceu '
        'assim mesmo.',
        causa: falha,
      );
    }
  }

  RevogacaoNoServidor _registrar(
    RevogacaoNoServidor revogacao,
    String mensagem, {
    Problem? problem,
    Object? causa,
  }) {
    _observadorDeSaida(
      AvisoDeSaida(
        revogacao: revogacao,
        mensagem: mensagem,
        problem: problem,
        causa: causa,
      ),
    );
    return revogacao;
  }

  /// O apagamento local, que acontece nos quatro desfechos.
  ///
  /// O token da sessao sai **primeiro**: e o item mais sensivel, e se alguma
  /// limpeza de cache estourar no meio ele ja saiu. Cada limpeza registrada e
  /// isolada pelo mesmo motivo -- uma que falhe nao pode impedir as outras de
  /// rodar, senao o cache da conta anterior sobrevive por causa de um erro em
  /// outro cache.
  Future<void> _apagarTudoDestaConta() async {
    await _deposito.apagar();
    // A intencao pendente morre junto (regra 7 de UX 8.3). Ela e o rascunho de
    // quem estava na conta que acabou de sair; deixa-la no disco faria a
    // proxima pessoa a entrar neste aparelho -- o filho, o outro tutor da casa,
    // quem comprou o celular usado -- publicar um caso que nao e dela assim
    // que o login terminasse.
    await _guardaDeAcao?.descartar();
    for (final limpeza in _limpezasAoSair) {
      try {
        await limpeza();
      } on Object catch (erro) {
        debugPrint('Bichu/sessao: uma limpeza de logout falhou ($erro).');
      }
    }
    _mudar(EstadoDaSessao.deslogado, null);
  }

  /// Devolve um access token utilizavel, renovando quando preciso.
  ///
  /// E esta a funcao que a camada de API recebe como `tokenDeAcesso`. Chamadas
  /// concorrentes compartilham a mesma renovacao: duas renovacoes em paralelo
  /// com o mesmo refresh token derrubam a familia inteira.
  Future<String?> tokenValido() {
    final atual = _sessao;
    if (atual == null) return Future<String?>.value();
    if (!atual.quaseExpirado) return Future<String?>.value(atual.accessToken);
    return _renovacaoEmCurso ??= _renovar(atual.refreshToken)
        .whenComplete(() => _renovacaoEmCurso = null);
  }

  Future<String?> _renovar(String refreshToken) async {
    try {
      final nova = await _auth.renovar(refreshToken);
      await _deposito.gravar(nova);
      _mudar(EstadoDaSessao.logado, nova);
      return nova.accessToken;
    } on FalhaDaApi catch (falha) {
      if (falha.problem.status == 401) {
        // Token invalido, expirado ou reutilizado. A sessao acabou de verdade.
        await _deposito.apagar();
        _mudar(EstadoDaSessao.deslogado, null);
        return null;
      }
      return _sessao?.accessToken;
    } on FalhaDeChamada {
      // Sem rede. Mantem a sessao: ela volta a valer quando o sinal voltar.
      return _sessao?.accessToken;
    }
  }

  void _mudar(EstadoDaSessao estado, Sessao? sessao) {
    final mudou = _estado != estado || _sessao != sessao;
    _estado = estado;
    _sessao = sessao;
    if (mudou) notifyListeners();
  }
}
