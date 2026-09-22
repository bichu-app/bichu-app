/// A navegação que fecha o caminho da ação guardada (UX 8.3).
///
/// Mora num lugar só porque **dois pontos do app terminam um login**: `C.2`,
/// quando a pessoa entra numa conta que já existe, e `F1.2`, quando ela acaba
/// de criar a conta e toca em `Continuar` sem verificar o e-mail — que é
/// exatamente o caminho do exemplo de aceite de 8.3, o da Camila. Os dois
/// mandavam para o Início. Se a regra "nunca a home" morasse em cada tela,
/// bastaria alguém acrescentar a terceira tela de fim de login para o defeito
/// voltar calado.
library;

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../roteamento/rotas.dart';
import 'guarda_de_acao.dart';

/// Leva a pessoa para onde a intenção guardada mandar.
///
/// `go`, e não `push`: o desvio da conta sai da pilha inteiro, e nenhuma tela
/// de login fica pendurada atrás do resultado — voltar dali devolveria um
/// formulário de entrar para quem já entrou.
void irParaODestinoDoLogin(BuildContext context, DestinoPosLogin destino) {
  switch (destino) {
    case DestinoDeInicio():
      // O único caminho legítimo para a seção de aterrissagem: não havia
      // intenção, ou ela passou das 24 horas (regras 2 e 4 de 8.3).
      context.go(Rotas.pets);
    case DestinoDeResultado(:final rota, :final extra):
      // A ação **já aconteceu**. Esta é a tela de resultado, com confirmação.
      context.go(rota, extra: extra);
    case DestinoDeRetorno(:final rota, :final extra):
      // A execução falhou: a tela de retorno, com o rascunho carregado e o
      // erro explicado. Não é a home.
      context.go(rota, extra: extra);
  }
}
