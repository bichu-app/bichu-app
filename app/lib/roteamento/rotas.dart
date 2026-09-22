import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/modelos_pet.dart';
import '../intencao/cadastro_de_pet_como_intencao.dart';
import '../intencao/caso_de_perdido_como_intencao.dart';
import '../achado/rascunho_do_achado.dart';
import '../perdido/rascunho_do_caso.dart';
import '../sessao/controlador_de_sessao.dart';
import '../telas/abas.dart';
import '../telas/casca_com_abas.dart';
import '../telas/conta/tela_criar_conta.dart';
import '../telas/conta/tela_entrar.dart';
import '../telas/conta/tela_esqueci_minha_senha.dart';
import '../telas/conta/tela_verifique_seu_email.dart';
import '../telas/escanear/tela_leitor_de_qr.dart';
import '../telas/pet/rascunho_de_pet.dart';
import '../telas/pet/resultado_do_cadastro.dart';
import '../telas/pet/tela_cadastrar_foto.dart';
import '../telas/pet/tela_cadastrar_identificacao.dart';
import '../telas/pet/tela_cadastrar_sinais.dart';
import '../telas/pet/tela_detalhe_do_pet.dart';
import '../telas/pet/tela_editar_pet.dart';
import '../telas/pet/tela_pet_cadastrado.dart';
import '../telas/perdido/resultado_da_abertura.dart';
import '../telas/perdido/tela_alcance_do_alerta.dart';
import '../telas/perdido/tela_de_quem_e_o_caso.dart';
import '../telas/perdido/tela_de_retomada.dart';
import '../telas/perdido/tela_onde_e_quando.dart';
import '../telas/achado/resultado_do_achado.dart';
import '../telas/achado/tela_achado_registrado.dart';
import '../telas/achado/tela_do_achado.dart';
import '../telas/achado/tela_registrar_achado.dart';
import '../intencao/achado_como_intencao.dart';
import '../telas/tela_de_abertura.dart';

/// Os enderecos do app.
///
/// Estado que merece link tem endereco. As cinco secoes, os sub-destinos e as
/// telas de conta ja nascem enderecaveis para que o deep link (F5) tenha onde
/// chegar quando as historias de App Links e Universal Links entrarem: a rota
/// `/t/<codigo>` da tag entra aqui, e nao numa navegacao imperativa paralela.
abstract final class Rotas {
  static const String abertura = '/';

  /// As CINCO secoes da barra, na ordem em que a barra as mostra (UX 27.2).
  ///
  /// `inicio` e `perdidos` SAIRAM. `Inicio` deixou de ser destino porque cada
  /// secao e a home do proprio conteudo e nao ha tela agregadora; `Perdidos`
  /// deixou de ser destino porque a casa dos perdidos e `Pets`, que reune
  /// perdidos, achados e adocoes. Nao renomeie de volta: a constante `inicio`
  /// era o escape padrao de sete pontos do app e por isso a troca foi feita em
  /// todos eles de uma vez.
  static const String pets = '/pets';
  static const String rede = '/rede';
  static const String perto = '/perto';
  static const String loja = '/loja';
  static const String perfil = '/perfil';

  /// `Pets` > `Adoções`: sub-destino com porta propria (UX 27.2.4).
  ///
  /// E a mesma listagem de `Pets` pre-filtrada, e nao uma segunda lista. A
  /// porta das ONGs em `Perto` aponta para ca, e por isso ela nao duplica
  /// listagem nenhuma.
  static const String adocoes = '/adocoes';

  /// O leitor de QR. **Deixou de ser aba e continua sendo endereco.**
  ///
  /// Ele e irmao da casca e nao filho dela, como as telas de conta: o design
  /// system 11.11 manda a barra sumir no leitor de camera, e uma aba que
  /// escondesse a propria barra seria uma aba que nao existe. As duas portas
  /// (`Pets` e `Perfil`) usam `push`, entao ele sempre tem volta.
  static const String escanear = '/escanear';

  static const String entrar = '/entrar';
  static const String criarConta = '/criar-conta';
  static const String verifiqueSeuEmail = '/verifique-seu-email';
  static const String esqueciMinhaSenha = '/esqueci-minha-senha';

  /// Para onde vai quem acabou de abrir o app.
  ///
  /// **Esta funcao e a costura de uma decisao do cliente que continua ABERTA**
  /// (BICHUS-164, bloco "Em aberto"): qual e a primeira tela de quem abre o
  /// app sem conta. Ela nao e a mesma pergunta que o destino de quem sai da
  /// conta, que ja foi respondida, e eu nao infiro que a resposta seja a mesma
  /// tela.
  ///
  /// As duas respostas possiveis continuam possiveis, e as duas se escrevem
  /// aqui e so aqui:
  ///
  /// - **"tela de aterrissagem antes da casca"** (a recomendacao do PM): nasce
  ///   uma rota irma da casca, como as telas de conta, e este `switch` passa a
  ///   devolve-la quando `logado` e falso.
  /// - **"cai direto numa aba"**: nada muda, e esta linha ja e a resposta.
  ///
  /// O parametro existe **hoje**, sem uso, de proposito: sem ele a decisao
  /// mudaria a assinatura e os chamadores, e uma decisao de produto nao deve
  /// custar refatoracao.
  static String destinoDoArranque({required bool logado}) => pets;

  /// Os tres passos do cadastro de pet (F1.3, F1.4, F1.5) e a confirmacao
  /// (F1.6).
  ///
  /// Sao enderecos, e nao uma navegacao imperativa paralela, pela mesma razao
  /// das telas de conta: estado que merece link tem endereco. O que **nao**
  /// atravessa o endereco e o rascunho: ele vai em `extra`, porque um passo
  /// intermediario de assistente alcancado por link direto nasceria sem os
  /// campos do passo anterior. Quem chega assim cai no primeiro passo.
  static const String cadastrarPet = '/pets/novo';
  static const String cadastrarPetFoto = '/pets/novo/foto';
  static const String cadastrarPetSinais = '/pets/novo/sinais';
  static const String petCadastrado = '/pets/cadastrado';

  /// O fluxo de marcar como perdido: F3.0, F3.1, F3.2 e F3.3.
  ///
  /// Sao enderecos pela mesma razao do assistente de cadastro, e o que **nao**
  /// atravessa o endereco e o mesmo: o rascunho do caso vai em `extra`, porque
  /// um passo intermediario alcancado por link direto nasceria sem o pet e sem
  /// o que a pessoa digitou. Quem chega assim cai na escolha do pet.
  ///
  /// [escolherPetPerdido] e F3.0 e **so aparece com dois ou mais pets**: ver o
  /// cabecalho de `TelaDeQuemEOCaso`.
  static const String escolherPetPerdido = '/pets/perdido';
  static const String marcarPerdido = '/pets/perdido/onde-e-quando';
  static const String marcarPerdidoAlcance = '/pets/perdido/alcance';
  static const String casoAberto = '/pets/perdido/caso';

  /// O achado avulso (F3.5, BICHUS-35).
  ///
  /// **`/achados/novo` nao foi escolhido agora**: e o endereco que
  /// `guarda_de_acao_test.dart` ja traduzia de `F3.5` antes de esta tela
  /// existir. Mudar o caminho aqui deixaria envelopes gravados apontando para
  /// o nada.
  ///
  /// **A ordem importa**, pelo mesmo motivo de `/pets/:petId`: `/achados/novo`
  /// e `/achados/registrado` sao declarados ANTES de `/achados/:achadoId`,
  /// porque um parametro casa com qualquer segmento e engoliria os dois.
  static const String registrarAchado = '/achados/novo';

  /// O desfecho de F3.5, nos dois estados (registrado e na fila).
  static const String achadoRegistrado = '/achados/registrado';

  /// O padrao do achado pelo endereco dele. Use [achadoDe] para montar.
  static const String achado = '/achados/:achadoId';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoAchadoId = 'achadoId';

  /// O endereco do achado [achadoId].
  static String achadoDe(String achadoId) =>
      '/achados/${Uri.encodeComponent(achadoId)}';

  // -- T.1, a edicao e a exclusao (BICHUS-60 e BICHUS-61) -------------------
  //
  // **`/pets/:petId` vem DEPOIS de `/pets/novo` e `/pets/cadastrado` na
  // declaracao, e a ordem e o que impede o engano.** `go_router` casa na
  // ordem em que as rotas sao registradas, e um parametro casa com qualquer
  // segmento: declarado antes, `/pets/:petId` engoliria `/pets/novo` e o
  // cadastro abriria o detalhe de um pet chamado "novo".

  /// O padrao de `T.1`. Use [detalheDoPetDe] para montar o endereco.
  static const String detalheDoPet = '/pets/:petId';

  /// A edicao (BICHUS-61), filha do detalhe.
  static const String editarPet = '/pets/:petId/editar';

  /// O nome do parametro de caminho, num lugar so: quem monta o endereco e
  /// quem o le usam a mesma palavra.
  static const String parametroDoPetId = 'petId';

  /// O endereco de T.1 para [petId].
  ///
  /// `Uri.encodeComponent` porque o id vem da resposta do servidor e nao desta
  /// tela: montar caminho com interpolacao crua e como um id com barra vira
  /// uma rota que nao existe.
  static String detalheDoPetDe(String petId) =>
      '/pets/${Uri.encodeComponent(petId)}';

  static String editarPetDe(String petId) =>
      '${detalheDoPetDe(petId)}/editar';

  /// O endereco da tela de retorno de um envelope de intencao (UX 8.3).
  ///
  /// O envelope guarda `telaDeRetorno` como **ID de tela da pesquisa**
  /// (`F1.5`), e nao como rota: e o documento de UX que nomeia as telas, e um
  /// envelope gravado hoje precisa continuar legivel depois de a rota mudar de
  /// caminho. A traducao mora aqui, num lugar so.
  ///
  /// Devolve nulo para a tela que **este build nao tem**. Nao e caso teorico:
  /// o app se atualiza com um envelope ja gravado no disco, e uma versao pode
  /// ter removido ou renomeado a tela daquele fluxo. A guarda trata o nulo
  /// descartando o envelope em silencio -- a pessoa entra na conta dela, que e
  /// o que ela pediu, em vez de cair num endereco que nao existe.
  static String? rotaDaTelaDeUx(String telaDeUx) {
    return switch (telaDeUx.toUpperCase()) {
      'F1.3' => cadastrarPet,
      'F1.4' => cadastrarPetFoto,
      'F1.5' => cadastrarPetSinais,
      'F1.6' => petCadastrado,
      // O fluxo de perdido. **F3.1 e a tela de retorno de `marcar_perdido`**:
      // e onde o rascunho mora, e e de la que a pessoa segue em frente de novo
      // depois de uma abertura que falhou (UX 8.3, regra 4).
      'F3.0' => escolherPetPerdido,
      'F3.1' => marcarPerdido,
      'F3.2' => marcarPerdidoAlcance,
      'F3.3' => casoAberto,
      // F3.5 e a tela de retorno de `registrar_achado`: e onde o rascunho
      // mora, e e de la que a pessoa segue em frente de novo depois de um
      // registro que falhou (UX 8.3, regra 4).
      'F3.5' => registrarAchado,
      _ => null,
    };
  }
}

/// O rascunho que vem no `extra`, venha ele do assistente ou de um envelope.
///
/// As telas do assistente recebem `RascunhoDePet`; a volta de uma intencao que
/// falhou recebe `RetomadaDoCadastro`, que e o rascunho **mais** o erro. Sem
/// esta funcao, o `as RascunhoDePet?` de cada rota estouraria em tempo de
/// execucao justamente no caminho de erro -- o menos exercitado a mao.
RascunhoDePet? _rascunhoDoExtra(Object? extra) {
  return switch (extra) {
    RascunhoDePet rascunho => rascunho,
    RetomadaDoCadastro retomada => retomada.rascunho,
    _ => null,
  };
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
      if (naAbertura) {
        return Rotas.destinoDoArranque(
          logado: sessao.estado == EstadoDaSessao.logado,
        );
      }
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
      // O leitor de QR (F2.1). **Irmao da casca, e nao filho dela.**
      //
      // Ele deixou de ser aba nesta historia, e o motivo nao e o rotulo: o
      // design system 11.11 diz que a barra nao aparece no leitor de camera, e
      // um destino de primeiro nivel que esconde a propria barra e um destino
      // que nao existe. As duas portas (UX 27.5.6) chegam aqui por `push`, e
      // por isso a tela sempre tem volta.
      GoRoute(
        path: Rotas.escanear,
        builder: (context, estado) => const TelaLeitorDeQr(),
      ),
      // `Pets` > `Adoções`. Sub-destino com pagina propria, alcancado tambem
      // pela porta das ONGs em `Perto`.
      GoRoute(
        path: Rotas.adocoes,
        builder: (context, estado) => const TelaDeAdocoes(),
      ),
      // O assistente de cadastro de pet. As quatro telas cobrem a casca de
      // abas, como as de conta, e por isso cada uma tem saida propria.
      GoRoute(
        path: Rotas.cadastrarPet,
        builder: (context, estado) => TelaCadastrarIdentificacao(
          // Nulo faz a tela criar um rascunho novo: e o que faz o link direto
          // para `/pets/novo` abrir uma tela util em vez de estourar.
          rascunhoExistente: _rascunhoDoExtra(estado.extra),
        ),
      ),
      GoRoute(
        path: Rotas.cadastrarPetFoto,
        builder: (context, estado) {
          final rascunho = _rascunhoDoExtra(estado.extra);
          // Passo intermediario alcancado sem o passo anterior: volta ao
          // comeco em vez de abrir um formulario que nao sabe de qual pet
          // fala.
          if (rascunho == null) return const TelaCadastrarIdentificacao();
          return TelaCadastrarFoto(rascunho: rascunho);
        },
      ),
      GoRoute(
        path: Rotas.cadastrarPetSinais,
        builder: (context, estado) {
          final extra = estado.extra;
          final rascunho = _rascunhoDoExtra(extra);
          if (rascunho == null) return const TelaCadastrarIdentificacao();
          return TelaCadastrarSinais(
            rascunho: rascunho,
            // A volta de uma intencao que falhou (UX 8.3, regra 4) traz o
            // erro **junto** com o rascunho: a pessoa entrou na conta, a acao
            // dela nao aconteceu, e uma tela que reabre preenchida e calada
            // deixaria a falha invisivel -- ela tocaria em `Cadastrar` de novo
            // sem saber o que houve da primeira vez.
            erroInicial: extra is RetomadaDoCadastro ? extra.erro : null,
          );
        },
      ),
      // ---------------------------------------------------------------
      // O fluxo de marcar como perdido (BICHUS-21).
      //
      // As quatro telas cobrem a casca de abas, como o assistente de
      // cadastro, e por isso cada uma tem saida propria. Todas recusam
      // `extra` ausente caindo no comeco do fluxo em vez de estourar: link
      // direto para um passo do meio e caso real (F5, App Links), e uma tela
      // que nasce sem o pet nao sabe de qual animal fala.
      // ---------------------------------------------------------------
      GoRoute(
        path: Rotas.escolherPetPerdido,
        builder: (context, estado) {
          final pets = estado.extra;
          // Sem a lista nao ha o que escolher. **Nao chama rede aqui**: o
          // criterio 6 manda o fluxo funcionar sem conexao, e quem tem a lista
          // e `Perfil` > `Meus pets`, que ja a carregou.
          if (pets is! List<Pet> || pets.isEmpty) return const AbaPerfil();
          return TelaDeQuemEOCaso(pets: pets);
        },
      ),
      GoRoute(
        path: Rotas.marcarPerdido,
        builder: (context, estado) {
          final extra = estado.extra;
          // A volta de uma intencao que falhou (UX 8.3, regra 4) chega aqui
          // com o **id** do pet, e nao com o pet: o envelope nao guarda o
          // animal. Quem busca o resto e a tela de retomada.
          if (extra is RetomadaDoCaso) {
            return TelaDeRetomadaDoCaso(retomada: extra);
          }
          if (extra is! RascunhoDoCaso) return const AbaPerfil();
          return TelaOndeEQuando(rascunho: extra);
        },
      ),
      GoRoute(
        path: Rotas.marcarPerdidoAlcance,
        builder: (context, estado) {
          final rascunho = estado.extra;
          if (rascunho is! RascunhoDoCaso) return const AbaPerfil();
          return TelaAlcanceDoAlerta(rascunho: rascunho);
        },
      ),
      // ---------------------------------------------------------------
      // O achado avulso (F3.5, BICHUS-35)
      // ---------------------------------------------------------------
      //
      // As tres sao irmas da casca, e nao filhas dela: quem esta na rua com um
      // animal no colo esta numa tarefa, e a barra de abas abaixo do
      // formulario ofereceria quatro saidas para o meio do preenchimento.
      //
      // **`/achados/novo` e `/achados/registrado` vem ANTES de
      // `/achados/:achadoId`.** `go_router` casa na ordem em que as rotas sao
      // registradas, e um parametro casa com qualquer segmento: declarado
      // antes, `/achados/:achadoId` engoliria os dois e o formulario abriria o
      // detalhe de um achado chamado "novo".
      GoRoute(
        path: Rotas.registrarAchado,
        builder: (context, estado) {
          final extra = estado.extra;
          // A volta de uma intencao que falhou (UX 8.3, regra 4) chega com o
          // rascunho inteiro e o erro. Sem isto, a pessoa que autenticou e viu
          // o registro falhar cairia num formulario em branco -- que e perder
          // o rascunho pelo outro caminho.
          if (extra is RetomadaDoAchado) {
            return TelaRegistrarAchado(
              rascunho: extra.rascunho,
              erroInicial: extra.erro?.texto,
            );
          }
          return TelaRegistrarAchado(
            rascunho: extra is RascunhoDoAchado ? extra : null,
          );
        },
      ),
      GoRoute(
        path: Rotas.achadoRegistrado,
        builder: (context, estado) {
          final resultado = estado.extra;
          // Alcancada por link direto, sem desfecho nenhum para mostrar, ela
          // devolve o formulario em vez de afirmar que alguma coisa foi
          // registrada. Tela de sucesso sem sucesso e o defeito que o criterio
          // 2 da BICHUS-31 proibe, e link direto e um caminho para ele.
          if (resultado is! ResultadoDoAchado) {
            return const TelaRegistrarAchado();
          }
          return TelaAchadoRegistrado(resultado: resultado);
        },
      ),
      GoRoute(
        path: Rotas.achado,
        builder: (context, estado) {
          final id = estado.pathParameters[Rotas.parametroDoAchadoId] ?? '';
          return TelaDoAchado(achadoId: id);
        },
      ),
      GoRoute(
        path: Rotas.casoAberto,
        builder: (context, estado) {
          final resultado = estado.extra;
          // **Sem `extra` nao ha tela de resultado**, e inventar uma seria
          // exatamente o que o criterio 2 da BICHUS-31 proibe: uma tela que
          // afirma um desfecho que ninguem produziu.
          if (resultado is! ResultadoDaAbertura) return const AbaPerfil();
          return TelaCasoAberto(resultado: resultado);
        },
      ),
      GoRoute(
        path: Rotas.petCadastrado,
        builder: (context, estado) {
          final resultado = estado.extra as ResultadoDoCadastro?;
          if (resultado == null) return const TelaCadastrarIdentificacao();
          return TelaPetCadastrado(resultado: resultado);
        },
      ),
      // T.1, a edicao e a exclusao (BICHUS-60 e BICHUS-61).
      //
      // **Declaradas DEPOIS de `/pets/novo` e `/pets/cadastrado`, e a ordem e
      // o que impede o engano**: `go_router` casa na ordem de registro e um
      // parametro casa com qualquer segmento. Acima delas, `/pets/:petId`
      // engoliria `/pets/novo` e o cadastro abriria o detalhe de um pet
      // chamado "novo".
      //
      // Cobrem a casca de abas, como o assistente, e por isso cada uma tem
      // saida propria: `Perfil` > `Meus pets` continua vivo no ramo de baixo,
      // e voltar devolve a pessoa onde ela estava.
      GoRoute(
        path: Rotas.detalheDoPet,
        builder: (context, estado) => TelaDetalheDoPet(
          petId: estado.pathParameters[Rotas.parametroDoPetId]!,
        ),
      ),
      GoRoute(
        path: Rotas.editarPet,
        builder: (context, estado) {
          // A edicao recebe o pet JA CARREGADO em `extra`, porque quem a abre
          // e T.1, que acabou de le-lo. Alcancada por link direto ela nasceria
          // sem ele: cai no detalhe, que sabe carregar, em vez de abrir um
          // formulario que nao sabe de qual pet fala. E a mesma regra dos
          // passos intermediarios do assistente.
          final pet = estado.extra;
          if (pet is! Pet) {
            return TelaDetalheDoPet(
              petId: estado.pathParameters[Rotas.parametroDoPetId]!,
            );
          }
          return TelaEditarPet(pet: pet);
        },
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, estado, navegacao) =>
            CascaComAbas(navegacao: navegacao),
        // **A ordem dos ramos e a ordem de `CascaComAbas.destinos`, e isso e
        // contrato.** A casca traduz a posicao tocada na barra para o indice
        // do ramo pelo registro; se as duas listas sairem de ordem, tocar em
        // `Perfil` abre `Rede`. O portao `a ordem dos ramos e a ordem do
        // registro` reprova quando isso acontece.
        branches: <StatefulShellBranch>[
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.pets,
                builder: (context, estado) => const AbaPets(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.rede,
                builder: (context, estado) => const AbaRede(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.perto,
                builder: (context, estado) => const AbaPerto(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.loja,
                builder: (context, estado) => const AbaLoja(),
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
