import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../api/mensagens_de_erro.dart';
import '../api/problem.dart';
import '../escopo.dart';
import 'rotas.dart';

/// PARA ONDE LEVA o rotulo de acao de uma [MensagemDeErro].
///
/// `MensagensDeErro` e o ponto unico que decide **o que a faixa diz** e **que
/// rotulo de saida ela oferece**; ele nao sabe navegar, e nao e dele esse
/// trabalho. Esta funcao e o outro lado: traduz o vocabulario do catalogo
/// ([MensagemDeErro.rotaDaAcao] e [MensagemDeErro.proximaAcao], que vem do
/// `next_action` do contrato) nos enderecos deste app.
///
/// **Ela existe porque a copia ja divergiu.** A mesma resolucao estava escrita
/// a mao em `rede/criar_encontro.dart` e em `perto/sugerir_profissional.dart`,
/// em duas redacoes, e a segunda tinha dois ramos onde a primeira tinha tres:
/// faltava `verificarEmail`, que e exatamente a saida do
/// `409 contact-channel-unverified`. Uma terceira copia -- que era o conserto
/// obvio para a pagina do local -- seria a terceira chance de esquecer um ramo.
///
/// **E faixa SEM SAIDA, e nao botao morto.** `FaixaDeAviso` so monta o
/// `TextButton` com rotulo **e** callback (`widgets/faixa_de_aviso.dart`),
/// entao o ramo que falta nao desenha um rotulo que nao leva a lugar nenhum:
/// ele nao desenha nada. A pessoa le *"Confirme seu e-mail antes de avaliar"* e
/// nao tem onde tocar -- a ausencia de botao que a BICHUS-62 descreve.
///
/// **Devolver `null` e desfecho legitimo.** `tentarDeNovo` e `recarregar` sao
/// rotulos de OPERACAO desta tela (reenviar o formulario, reler a pagina) e nao
/// de navegacao: quem os oferece passa o proprio callback para a faixa. O que
/// esta funcao resolve e so o que tem endereco.
VoidCallback? saidaDaMensagem(BuildContext context, MensagemDeErro mensagem) {
  if (mensagem.acao == null) return null;

  // `rotaDaAcao` vem ANTES da `proximaAcao`: ela e a navegacao simples que o
  // catalogo declarou (o perfil, a agenda), e e `go` e nao `push` porque o
  // destino e um lugar do app, nao um passo de volta.
  final rota = mensagem.rotaDaAcao;
  if (rota != null) return () => context.go(rota);

  if (mensagem.proximaAcao == ProximaAcao.verificarEmail) {
    // O endereco vai junto: sem ele a tela de confirmacao nao diz PARA ONDE o
    // link foi, e a pessoa nao sabe em qual caixa procurar.
    final email = Escopo.of(context).sessao.usuario?.email ?? '';
    return () => context.push(Rotas.verifiqueSeuEmail, extra: email);
  }

  if (mensagem.proximaAcao == ProximaAcao.entrar) {
    return () => context.push(Rotas.entrar);
  }

  return null;
}
