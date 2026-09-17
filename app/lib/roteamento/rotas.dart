import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../sessao/controlador_de_sessao.dart';
import '../telas/abas.dart';
import '../telas/casca_com_abas.dart';
import '../telas/conta/tela_criar_conta.dart';
import '../telas/conta/tela_entrar.dart';
import '../telas/conta/tela_esqueci_minha_senha.dart';
import '../telas/conta/tela_verifique_seu_email.dart';
import '../telas/tela_de_abertura.dart';

/// Os enderecos do app.
///
/// Estado que merece link tem endereco. As quatro abas e as telas de conta ja
/// nascem enderecaveis para que o deep link (F5) tenha onde chegar quando as
/// historias de App Links e Universal Links entrarem: a rota `/t/<codigo>` da
/// tag entra aqui, e nao numa navegacao imperativa paralela.
abstract final class Rotas {
  static const String abertura = '/';
  static const String inicio = '/inicio';
  static const String perdidos = '/perdidos';
  static const String escanear = '/escanear';
  static const String perfil = '/perfil';
  static const String entrar = '/entrar';
  static const String criarConta = '/criar-conta';
  static const String verifiqueSeuEmail = '/verifique-seu-email';
  static const String esqueciMinhaSenha = '/esqueci-minha-senha';
}

final GlobalKey<NavigatorState> _navegadorRaiz =
    GlobalKey<NavigatorState>(debugLabel: 'raiz');

/// Monta o roteador.
///
/// O unico redirecionamento e o da abertura: enquanto o chaveiro esta sendo
/// lido, a pessoa fica na splash; depois disso ela vai para Inicio, logada ou
/// nao. **Nao ha guarda de rota por autenticacao**, e isso e desenho: o app e
/// navegavel deslogado, e o login acontece dentro do caminho da acao, e nao no
/// lugar dela.
///
/// **As telas de conta sao irmas da casca de abas, e nao filhas.** Isso e
/// deliberado: elas cobrem a tela inteira, inclusive a barra de abas, porque
/// sao um desvio do caminho e nao um quinto destino. O preco disso e que a
/// barra some enquanto elas estao abertas, e o preco so se paga quando elas
/// tem saida propria -- sem ela, a pessoa fica sem barra **e** sem volta, que
/// e exatamente o defeito que o cliente encontrou no simulador. Quem abre
/// tela de conta usa `push` ou `pushReplacement`; `go` fica para troca de aba
/// e para o fim de um fluxo. Ver `SaidaDaTela`.
GoRouter criarRoteador(ControladorDeSessao sessao) {
  return GoRouter(
    navigatorKey: _navegadorRaiz,
    initialLocation: Rotas.abertura,
    refreshListenable: sessao,
    redirect: (context, estado) {
      final carregando = sessao.estado == EstadoDaSessao.carregando;
      final naAbertura = estado.matchedLocation == Rotas.abertura;
      if (carregando) return naAbertura ? null : Rotas.abertura;
      if (naAbertura) return Rotas.inicio;
      return null;
    },
    routes: <RouteBase>[
      GoRoute(
        path: Rotas.abertura,
        builder: (context, estado) => const TelaDeAbertura(),
      ),
      GoRoute(
        path: Rotas.entrar,
        builder: (context, estado) => TelaEntrar(
          emailInicial: estado.extra as String?,
        ),
      ),
      GoRoute(
        path: Rotas.criarConta,
        builder: (context, estado) => TelaCriarConta(
          emailInicial: estado.extra as String?,
        ),
      ),
      GoRoute(
        path: Rotas.verifiqueSeuEmail,
        builder: (context, estado) => TelaVerifiqueSeuEmail(
          email: estado.extra as String? ?? '',
        ),
      ),
      GoRoute(
        path: Rotas.esqueciMinhaSenha,
        builder: (context, estado) => TelaEsqueciMinhaSenha(
          emailInicial: estado.extra as String?,
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, estado, navegacao) =>
            CascaComAbas(navegacao: navegacao),
        branches: <StatefulShellBranch>[
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.inicio,
                builder: (context, estado) => const AbaInicio(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.perdidos,
                builder: (context, estado) => const AbaPerdidos(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.escanear,
                builder: (context, estado) => const AbaEscanear(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.perfil,
                builder: (context, estado) => const AbaPerfil(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
