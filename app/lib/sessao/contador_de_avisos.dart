/// O NUMERO DO SINO: um objeto, no app inteiro, que pergunta ao servidor
/// quantos avisos nao lidos a pessoa tem.
library;

import 'package:flutter/foundation.dart';

import '../api/falhas.dart';
import '../api/modelos_notificacao.dart';
import '../api/notificacoes_api.dart';

/// Quantos avisos nao lidos, segundo o servidor.
class ContadorDeAvisos extends ChangeNotifier {
  ContadorDeAvisos({required NotificacoesApi notificacoes})
      : _api = notificacoes;

  final NotificacoesApi _api;

  int? _naoLidas;

  int _geracao = 0;

  bool _descartado = false;

  /// Quantos nao lidos, ou **nulo enquanto ninguem contou**.
  int? get naoLidas => _naoLidas;

  /// Pergunta ao servidor e publica.
  Future<void> atualizar() async {
    final minhaGeracao = ++_geracao;
    final ContagemDeAvisos contagem;
    try {
      contagem = await _api.contar();
    } on FalhaDeChamada {
      return;
    } on FormatException {
      return;
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao contar os avisos');
      return;
    }
    if (minhaGeracao != _geracao) return;
    _publicar(contagem.naoLidos);
  }

  /// A caixa foi aberta **e o servidor confirmou** `markNotificationsListSeen`.
  void zerarPorqueAListaFoiVista() {
    _geracao++;
    _publicar(0);
  }

  /// Esquece o numero: ele e da CONTA.
  void limpar() {
    _geracao++;
    _publicar(null);
  }

  @override
  void dispose() {
    _descartado = true;
    super.dispose();
  }

  void _publicar(int? valor) {
    if (_descartado) return;
    if (_naoLidas == valor) return;
    _naoLidas = valor;
    notifyListeners();
  }
}
