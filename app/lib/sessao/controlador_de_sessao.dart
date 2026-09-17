import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/auth_api.dart';
import '../api/falhas.dart';
import '../api/modelos.dart';
import 'deposito_de_sessao.dart';

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
    // ignore: prefer_initializing_formals
  })  : _auth = auth,
        // ignore: prefer_initializing_formals
        _deposito = deposito;

  final AuthApi _auth;
  final DepositoDeSessao _deposito;

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

  /// Guarda a sessao recem-aberta e avisa as telas.
  Future<void> abrir(Sessao sessao) async {
    await _deposito.gravar(sessao);
    _mudar(EstadoDaSessao.logado, sessao);
  }

  /// Sai da conta.
  ///
  /// O token local e apagado **mesmo que a chamada ao servidor falhe**. Sair
  /// sem rede e um pedido legitimo, e um app que se recusa a sair porque o
  /// servidor nao respondeu deixa a sessao aberta num aparelho que a pessoa
  /// quis limpar.
  Future<void> sair() async {
    try {
      await _auth.sair();
    } on FalhaDeChamada {
      // Sem rede ou token ja invalido: nada a fazer do lado do servidor.
    }
    await _deposito.apagar();
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
