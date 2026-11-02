import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../api/mensagens_de_erro.dart';
import '../api/problem.dart';
import '../escopo.dart';
import '../widgets/folha_de_senha.dart';
import 'rotas.dart';

/// PARA ONDE LEVA o rotulo de acao de uma [MensagemDeErro].
VoidCallback? saidaDaMensagem(BuildContext context, MensagemDeErro mensagem) {
  if (mensagem.acao == null) return null;

  final rota = mensagem.rotaDaAcao;
  if (rota != null) return () => context.go(rota);

  // `reauthentication-required`: a saida nao e navegar, e confirmar a senha
  // sem sair de onde a pessoa esta. A sessao dela continua valida -- o que
  // falta e a janela destrutiva --, e por isso esta saida NAO passa pelo
  // `entrar`.
  //
  // A folha devolve a janela e esta funcao a descarta, porque uma `VoidCallback`
  // nao tem para quem devolver: quem precisa do token chama
  // `mostrarFolhaDeSenha` direto, na operacao que vai apresenta-lo. Aqui a
  // saida serve para a pessoa reabrir a janela depois de ela ter vencido,
  // **nao** para refazer a operacao destrutiva sozinha.
  final escopoDeSenha = mensagem.escopoDeSenha;
  if (escopoDeSenha != null) {
    return () => mostrarFolhaDeSenha(
          context,
          auth: Escopo.of(context).auth,
          escopo: escopoDeSenha,
        );
  }

  if (mensagem.proximaAcao == ProximaAcao.verificarEmail) {
    final email = Escopo.of(context).sessao.usuario?.email ?? '';
    return () => context.push(Rotas.verifiqueSeuEmail, extra: email);
  }

  if (mensagem.proximaAcao == ProximaAcao.entrar) {
    return () => context.push(Rotas.entrar);
  }

  return null;
}
