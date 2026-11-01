import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/auth_api.dart';
import '../api/falhas.dart';
import '../api/modelos.dart';
import '../api/problem.dart';
import '../intencao/guarda_de_acao.dart';
import 'deposito_de_sessao.dart';

/// O que aconteceu com a **metade de servidor** do logout.
enum RevogacaoNoServidor {
  /// O servidor confirmou. A familia de refresh daquele aparelho morreu no
  /// banco, que e onde ela e conferida.
  confirmada,

  /// Nao havia o que revogar: o app nao tinha sessao guardada.
  semSessaoParaRevogar,

  /// A requisicao nao chegou, ou a resposta nao voltou.
  naoConfirmadaSemRede,

  /// O servidor respondeu, e **recusou**.
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
typedef LimpezaAoSair = Future<void> Function();

/// Algo que precisa acontecer **depois de todo login bem-sucedido**.
typedef AoEntrar = Future<void> Function();

/// O registro padrao, usado quando ninguem injeta outro.
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

/// O TETO DA LEITURA DO CHAVEIRO NO ARRANQUE.
const Duration tetoDaLeituraDaSessao = Duration(seconds: 2);

/// Em que ponto do arranque e da autenticacao o app esta.
enum EstadoDaSessao {
  /// O app ainda esta lendo o chaveiro.
  carregando,

  /// Sem conta. **Nao e um muro**: o app inteiro e navegavel assim, e so as
  /// acoes exigem conta (UX 5.2 e 8.1).
  deslogado,

  /// Com conta.
  logado,
}

/// POR QUE nao ha conta agora.
enum MotivoSemConta {
  /// Nao havia sessao guardada, ou a pessoa saiu da conta por decisao dela.
  nuncaEntrou,

  /// A pessoa estava logada e a renovacao foi recusada.
  sessaoCaiu,
}

/// A sessao do app: le o chaveiro no arranque, renova quando expira e avisa
/// quem depende disso.
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

  final GuardaDeAcao? _guardaDeAcao;

  final List<LimpezaAoSair> _limpezasAoSair;

  final List<AoEntrar> _aoEntrar;

  final ObservadorDeSaida _observadorDeSaida;

  EstadoDaSessao _estado = EstadoDaSessao.carregando;
  Sessao? _sessao;
  Future<String?>? _renovacaoEmCurso;

  MotivoSemConta _motivoSemConta = MotivoSemConta.nuncaEntrou;

  EstadoDaSessao get estado => _estado;
  Usuario? get usuario => _sessao?.usuario;
  bool get logado => _estado == EstadoDaSessao.logado;

  /// Por que nao ha conta agora.
  MotivoSemConta get motivoSemConta => _motivoSemConta;

  /// Le o que estiver guardado.
  Future<void> iniciar() async {
    final Sessao? guardada;
    try {
      guardada = await _deposito.ler().timeout(tetoDaLeituraDaSessao);
    } on Object catch (erro) {
      debugPrint(
        'Sessao nao carregada neste arranque ($erro). O app sobe DESLOGADO '
        'em vez de ficar numa tela parada; quem tinha sessao entra de novo.',
      );
      _mudar(EstadoDaSessao.deslogado, null);
      return;
    }
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
  Future<void> abrir(Sessao sessao) async {
    await _deposito.gravar(sessao);
    _motivoSemConta = MotivoSemConta.nuncaEntrou;
    _mudar(EstadoDaSessao.logado, sessao);
    await _reporOQueOLoginRepoe();
  }

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
  Future<void> atualizarUsuario(Usuario usuario) async {
    final atual = _sessao;
    if (atual == null) return;
    final nova = atual.comUsuario(usuario);
    await _deposito.gravar(nova);
    _mudar(EstadoDaSessao.logado, nova);
  }

  /// A revogacao perdida **nao e retentada**, e isso e decisao e nao omissao
  /// (ADR-0002, emenda 1, secao 6): retentar exigiria guardar o refresh no
  /// aparelho ate a revogacao passar, o que manteria a credencial no disco
  /// justamente enquanto ele esta sem rede.
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
      return RevogacaoNoServidor.semSessaoParaRevogar;
    }
    try {
      await _auth.sair(refreshToken);
      return RevogacaoNoServidor.confirmada;
    } on FalhaDaApi catch (falha) {
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

  Future<void> _apagarTudoDestaConta() async {
    await _deposito.apagar();
    await _guardaDeAcao?.descartar();
    for (final limpeza in _limpezasAoSair) {
      try {
        await limpeza();
      } on Object catch (erro) {
        debugPrint('Bichu/sessao: uma limpeza de logout falhou ($erro).');
      }
    }
    _motivoSemConta = MotivoSemConta.nuncaEntrou;
    _mudar(EstadoDaSessao.deslogado, null);
  }

  /// Devolve um access token utilizavel, renovando quando preciso.
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
        await _deposito.apagar();
        _motivoSemConta = MotivoSemConta.sessaoCaiu;
        _mudar(EstadoDaSessao.deslogado, null);
        return null;
      }
      return _sessao?.accessToken;
    } on FalhaDeChamada {
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
