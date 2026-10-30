import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../api/mensagens_de_erro.dart';
import '../api/problem.dart';
import '../escopo.dart';
import 'rotas.dart';

/// PARA ONDE LEVA o rotulo de acao de uma [MensagemDeErro].
VoidCallback? saidaDaMensagem(BuildContext context, MensagemDeErro mensagem) {
  if (mensagem.acao == null) return null;

  final rota = mensagem.rotaDaAcao;
  if (rota != null) return () => context.go(rota);

  if (mensagem.proximaAcao == ProximaAcao.verificarEmail) {
    final email = Escopo.of(context).sessao.usuario?.email ?? '';
    return () => context.push(Rotas.verifiqueSeuEmail, extra: email);
  }

  if (mensagem.proximaAcao == ProximaAcao.entrar) {
    return () => context.push(Rotas.entrar);
  }

  return null;
}
