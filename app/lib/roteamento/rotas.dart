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
import '../telas/escanear/tela_do_pet_da_tag.dart';
import '../telas/escanear/tela_leitor_de_qr.dart';
import '../telas/pet/rascunho_de_pet.dart';
import '../telas/pet/resultado_do_cadastro.dart';
import '../telas/pet/tela_cadastrar_foto.dart';
import '../telas/pet/tela_cadastrar_identificacao.dart';
import '../telas/pet/tela_cadastrar_sinais.dart';
import '../telas/pet/tela_detalhe_do_pet.dart';
import '../telas/pet/tela_editar_pet.dart';
import '../telas/pet/tela_pet_cadastrado.dart';
import '../telas/pet/tela_acompanhar_plaquinha.dart';
import '../telas/pet/tela_solicitar_plaquinha.dart';
import '../telas/perfil/meus_achados.dart';
import '../telas/perfil/tela_dados_pessoais.dart';
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
import '../intencao/pedido_de_participacao_como_intencao.dart';
import '../telas/loja/produto_da_loja.dart';
import '../telas/perto/pagina_do_local.dart';
import '../telas/perto/sugerir_profissional.dart';
import '../telas/rede/criar_encontro.dart';
import '../telas/rede/encontro_da_rede.dart';
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

  /// O encontro da `Rede`, sob o ramo da secao: a barra de abas continua, e
  /// voltar devolve a agenda. Endereco proprio porque a guarda de acao do
  /// `Pedir para participar` volta para ca depois do login (UX 8.3).
  static const String encontroDaRede = 'encontros/:slug';

  static const String parametroDoEncontro = 'slug';

  static String encontroDaRedeDe(String slug) =>
      '/rede/encontros/${Uri.encodeComponent(slug)}';

  /// **Marcar um encontro da `Rede`: IRMA da casca, e nao sob o ramo.**
  ///
  /// Mesma razao do assistente de cadastro de pet e do registro de achado:
  /// preencher um formulario e TAREFA, e a barra de abas abaixo dele
  /// ofereceria quatro saidas para o meio do preenchimento. Leitura fica sob o
  /// ramo (`encontroDaRede`); tarefa, irma.
  ///
  /// **Declarada ANTES do ramo da casca**, como `/pets/novo` em relacao a
  /// `/pets`: o `go_router` casa na ordem de registro, e o
  /// `encontros/:slug` do ramo engoliria qualquer segmento -- o formulario
  /// abriria o detalhe de um encontro chamado "novo".
  static const String criarEncontroDaRede = '/rede/encontros/novo';
  static const String perto = '/perto';

  /// **Indicar um profissional para o `Perto`: irma da casca**, pela mesma
  /// razao de [criarEncontroDaRede].
  ///
  /// **Declarada ANTES do ramo da casca** nao e necessario aqui, ao contrario
  /// de [criarEncontroDaRede]: o caminho dela e `/perto/indicacoes/nova`, e
  /// [localDoPerto] casa em `/perto/locais/:slug`. Os dois primeiros segmentos
  /// diferem, entao nao ha como um engolir o outro.
  static const String sugerirProfissional = '/perto/indicacoes/nova';

  /// A pagina de um local do `Perto`, **sob o ramo da secao** (18/10/2026).
  ///
  /// O cliente pediu que o cartao do diretorio abrisse uma pagina, com
  /// pontuacao de 1 a 5 e recomendacao em texto visivel aos outros usuarios.
  /// Esta e a porta.
  ///
  /// **Sob o ramo, e nao irma da casca**, pela mesma escolha de
  /// [produtoDaLoja] e [encontroDaRede] e pelo mesmo motivo: a pagina de um
  /// local e LEITURA, nao tarefa. A barra de abas continua, e voltar devolve a
  /// lista com a busca e o filtro de quem estava procurando intactos -- quem
  /// esta comparando tres veterinarios quer continuar comparando, e esconder
  /// as outras quatro secoes para mostrar uma ficha tiraria o app de quem so
  /// foi ver uma nota.
  static const String localDoPerto = 'locais/:slug';

  static const String parametroDoLocal = 'slug';

  /// O endereco do local [slug].
  ///
  /// `Uri.encodeComponent` porque o `slug` vem da resposta do servidor, e nao
  /// desta tela: montar caminho com interpolacao crua e como um slug com barra
  /// vira uma rota que nao existe. Mesma regra de [produtoDaLojaDe].
  static String localDoPertoDe(String slug) =>
      '/perto/locais/${Uri.encodeComponent(slug)}';
  static const String loja = '/loja';

  /// O produto da `Loja`, sob o ramo da secao: a barra de abas continua, e
  /// voltar devolve a vitrine onde a pessoa estava, com a busca e o filtro
  /// dela intactos.
  ///
  /// **Sob o ramo, e nao irmao da casca**, ao contrario do assistente de
  /// cadastro: o detalhe de um produto e leitura, nao tarefa. Quem esta
  /// comparando produtos quer continuar comparando, e esconder a barra de abas
  /// para mostrar uma ficha de produto tiraria as outras quatro secoes de
  /// quem so foi ver uma foto maior. E a mesma escolha de
  /// [encontroDaRede], pelo mesmo motivo.
  static const String produtoDaLoja = 'produtos/:slug';

  static const String parametroDoProduto = 'slug';

  /// O endereco do produto [slug].
  ///
  /// `Uri.encodeComponent` porque o `slug` vem da resposta do servidor, e nao
  /// desta tela: montar caminho com interpolacao crua e como um slug com barra
  /// vira uma rota que nao existe.
  static String produtoDaLojaDe(String slug) =>
      '/loja/produtos/${Uri.encodeComponent(slug)}';
  static const String perfil = '/perfil';

  /// `Perfil` › `Meus dados`: os dados pessoais do tutor (18/10/2026).
  ///
  /// **Endereco proprio, e nao bloco dentro da aba.** `Meus pets` mora dentro
  /// de `Perfil` porque e a lista da secao; um formulario de edicao nao e
  /// conteudo de secao -- ele tem barra de saida, acao fixa embaixo e um
  /// desfecho. Com endereco, ele e tambem o destino do item `Meus dados` da
  /// gaveta, que e a linha que a UX 27.5.5 listava como `Editar o perfil` e
  /// que ate hoje nao tinha para onde ir.
  ///
  /// **Irma da casca, como as telas de conta**, e por isso ela tem saida
  /// propria: ela cobre a barra de baixo, e o `escape` dela e [perfil].
  static const String dadosPessoais = '/perfil/dados';

  /// `Perfil` > `Meus achados`: a lista dos avisos de achado desta conta.
  ///
  /// **Endereco proprio, como `dadosPessoais`, e nao bloco dentro da aba.**
  /// `Meus pets` e conteudo da secao porque e a lista principal dela; esta e
  /// um sub-destino de menu, com barra de saida e volta -- a mesma forma de
  /// `Meus dados`.
  ///
  /// `/perfil/achados` e nao `/achados`: `/achados/:achadoId` ja existe e
  /// casaria `/achados` como id vazio, e `achados` sob `perfil` diz o que a
  /// lista e -- a MINHA, e nao a da vizinhanca.
  static const String meusAchados = '/perfil/achados';

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

  /// `/t/<codigo>`: F2.2 e F2.3, o pet que o codigo da tag resolveu.
  ///
  /// **O endereco e o mesmo que vai impresso na plaquinha**, e e por isso que
  /// ele existe antes de os App Links e os Universal Links (BICHUS-38 e
  /// BICHUS-39) entrarem: quando eles entrarem, o link da tag ja tem onde
  /// chegar, e nao vai precisar de uma navegacao imperativa paralela.
  ///
  /// O que **nao** atravessa o endereco e a resolucao, pela mesma razao do
  /// rascunho do assistente: `TagResolvida` vai em `extra`, porque quem chega
  /// por link direto chega sem ela. Esse caminho cai no leitor, que e onde se
  /// resolve um codigo -- e nao numa tela montada com os campos em branco.
  static const String petDaTag = '/t/:codigo';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoCodigoDaTag = 'codigo';

  /// O endereco de F2.2/F2.3 para [codigo].
  static String petDaTagDe(String codigo) =>
      '/t/${Uri.encodeComponent(codigo)}';

  static const String entrar = '/entrar';
  static const String criarConta = '/criar-conta';
  static const String verifiqueSeuEmail = '/verifique-seu-email';
  static const String esqueciMinhaSenha = '/esqueci-minha-senha';

  /// Para onde vai quem acabou de abrir o app, ou acabou de entrar.
  ///
  /// **`rede`, decisao do cliente de 18/10/2026**, literal: *"quando o usuário
  /// fizer o login ou abrir o app, traga a pagina da rede como padrão"*. Era
  /// `pets` ate esta data.
  ///
  /// **A MESMA resposta para os dois estados de sessao, e isso e o que ele
  /// pediu.** A frase dele cobre os dois arranques -- "fizer o login" e "abrir
  /// o app" --, e `logado` continua sem uso por isso, nao por esquecimento.
  /// Quem chega deslogado tambem cai na `Rede`, e a secao abre: a casca de
  /// abas e visivel deslogada por decisao de produto (UX 5.2, "deslogado e um
  /// estado de navegacao, nao um muro") e `GET /network/events` e rota publica
  /// -- a agenda lista para visitante, e so as acoes de criar e de pedir
  /// participacao exigem sessao, dentro do caminho delas.
  ///
  /// A pergunta que a BICHUS-164 deixava aberta era "tela de aterrissagem
  /// antes da casca, ou cai direto numa aba". Ele respondeu "cai direto numa
  /// aba" ao nomear a aba; se um dia a aterrissagem voltar, ela nasce como
  /// rota irma da casca e e aqui que este retorno passa a depender de
  /// [logado].
  ///
  /// **LINK PROFUNDO CONTINUA VENCENDO ESTA LINHA.** O `redirect` de
  /// [criarRoteador] so reescreve o destino quando a posicao casada e
  /// [abertura]; qualquer outro endereco passa intacto (`return null`). Quem
  /// abre `/rede/:slug`, `/loja/:slug` ou `/t/:codigo` chega onde o link
  /// manda, e trocar esta constante nao mexe nisso -- o que mudou foi so o
  /// destino de quem nao pediu endereco nenhum.
  static String destinoDoArranque({required bool logado}) => rede;

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

  /// O pedido da plaquinha da coleira: o destino que o botao `Fazer a tag da
  /// coleira` nunca teve.
  ///
  /// **Declarado aqui, no bloco de `/pets/...` literais, e nao depois de
  /// `/pets/:petId`**: `go_router` casa na ordem de registro e um parametro
  /// casa com qualquer segmento. Abaixo do detalhe, este endereco abriria o
  /// detalhe de um pet chamado "plaquinha".
  ///
  /// O pet **nao** esta no endereco, e isso e deliberado: o formulario escolhe
  /// o pet entre os do tutor, e um pet no caminho brigaria com a escolha. Quem
  /// chega do `Pet cadastrado` manda o `petId` em `extra`, que serve so para
  /// pre-selecionar; alcancada por link direto, a tela abre com a lista e
  /// nenhum pet escolhido, que e um estado valido e nao um erro.
  static const String solicitarPlaquinha = '/pets/plaquinha';

  /// A PAGINA DE ACOMPANHAMENTO do pedido da plaquinha (cliente, 18/10).
  ///
  /// **Literal antes do parametro**, pelo mesmo motivo de
  /// [solicitarPlaquinha]: abaixo de `/pets/:petId`, `go_router` casaria
  /// `plaquinha` como `petId`.
  ///
  /// Aqui o pet **esta** no endereco, e a diferenca com o formulario e real: o
  /// formulario ESCOLHE um pet entre os do tutor, e esta pagina LE o pedido de
  /// um pet ja escolhido -- quem chega vem da pagina daquele pet. Sem o pet no
  /// caminho a pagina nao teria o que ler.
  ///
  /// **O endereco nao autoriza nada.** Quem o alcanca com o pet de outra
  /// pessoa recebe 404 do servidor (ADR-0021), e a tela diz o mesmo que diria
  /// para um pet inexistente.
  static const String acompanharPlaquinha = '/pets/plaquinha/:petId';

  /// O endereco de [acompanharPlaquinha] para um pet.
  static String acompanharPlaquinhaDe(String petId) =>
      '/pets/plaquinha/${Uri.encodeComponent(petId)}';

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

  static String editarPetDe(String petId) => '${detalheDoPetDe(petId)}/editar';

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
      // O encontro da `Rede`: a volta de um pedido que falhou depois do login
      // e a agenda, onde a pessoa reabre o encontro (o `slug` esta no `alvo`
      // do envelope, e nao no ID da tela).
      'REDE.ENCONTRO' => rede,
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

final GlobalKey<NavigatorState> _navegadorRaiz = GlobalKey<NavigatorState>(
  debugLabel: 'raiz',
);

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
        builder: (context, estado) =>
            TelaEntrar(emailInicial: estado.extra as String?),
      ),
      GoRoute(
        path: Rotas.criarConta,
        builder: (context, estado) =>
            TelaCriarConta(emailInicial: estado.extra as String?),
      ),
      GoRoute(
        path: Rotas.verifiqueSeuEmail,
        builder: (context, estado) =>
            TelaVerifiqueSeuEmail(email: estado.extra as String? ?? ''),
      ),
      GoRoute(
        path: Rotas.esqueciMinhaSenha,
        builder: (context, estado) =>
            TelaEsqueciMinhaSenha(emailInicial: estado.extra as String?),
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
      GoRoute(
        path: Rotas.petDaTag,
        // Sem `extra` nao ha resolucao, e a tela nao a inventa: quem chegou
        // por link direto vai para o leitor, que sabe resolver um codigo.
        // Uma tela montada com nome vazio e sinais em branco seria uma
        // afirmacao falsa sobre um animal.
        builder: (context, estado) {
          final tag = estado.extra;
          if (tag is! TagResolvida) return const TelaLeitorDeQr();
          // **O codigo sai do CAMINHO, e nao da resolucao.** A resposta
          // publica de `GET /tags/{code}` nao devolve o codigo de proposito:
          // ele E a credencial. Sem ele o botao `Avisar o tutor` nao tem para
          // qual plaquinha avisar, e e por isso que esta rota existe como
          // endereco desde o comeco.
          final codigo =
              estado.pathParameters[Rotas.parametroDoCodigoDaTag] ?? '';
          if (codigo.isEmpty) return const TelaLeitorDeQr();
          return TelaDoPetDaTag(tag: tag, codigo: codigo);
        },
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
      // As duas ESCRITAS da comunidade, irmas da casca porque sao tarefa.
      // Declaradas antes do ramo da casca: `encontros/:slug` engoliria
      // `encontros/novo` e o formulario abriria um detalhe inexistente.
      GoRoute(
        path: Rotas.criarEncontroDaRede,
        builder: (context, estado) => const TelaCriarEncontro(),
      ),
      GoRoute(
        path: Rotas.sugerirProfissional,
        builder: (context, estado) => const TelaSugerirProfissional(),
      ),
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
      // O pedido da plaquinha. **Antes de `/pets/:petId`**, como as outras
      // rotas literais de `/pets/...`: abaixo do detalhe, `go_router` casaria
      // `plaquinha` como `petId`.
      //
      // Sem `extra` a tela NAO cai em outro destino, e aqui a diferenca com o
      // assistente e real: ela nao depende de um passo anterior, ela carrega os
      // pets do tutor sozinha. O `extra` so pre-seleciona, e um link direto
      // abre o formulario com a lista inteira -- estado valido, e nao erro.
      GoRoute(
        path: Rotas.solicitarPlaquinha,
        builder: (context, estado) {
          final petId = estado.extra;
          return TelaSolicitarPlaquinha(
            petIdInicial: petId is String ? petId : null,
          );
        },
      ),
      // O ACOMPANHAMENTO do pedido. Depois de `/pets/plaquinha` e antes de
      // `/pets/:petId`: o literal mais especifico primeiro, o parametro
      // depois. Trocar a ordem faria `/pets/plaquinha/<id>` abrir o detalhe.
      //
      // O pet vem do CAMINHO e nao de `extra`: esta pagina le o pedido do
      // servidor, e um link direto para ela e legitimo -- ela pergunta antes
      // de afirmar qualquer coisa.
      GoRoute(
        path: Rotas.acompanharPlaquinha,
        builder: (context, estado) => TelaAcompanharPlaquinha(
          petId: estado.pathParameters['petId'] ?? '',
        ),
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
      // `Perfil` > `Meus dados` (18/10/2026). Declarada ANTES da casca, como
      // as outras telas que a cobrem: o caminho e `/perfil/dados` e a aba e
      // `/perfil`, dois enderecos distintos, e `go_router` casa o mais
      // especifico por ser exato. Cobre a casca de abas, e por isso tem saida
      // propria -- o `Perfil` continua vivo no ramo de baixo e voltar devolve
      // a pessoa onde ela estava.
      GoRoute(
        path: Rotas.dadosPessoais,
        builder: (context, estado) => const TelaDadosPessoais(),
      ),
      // `Perfil` > `Meus achados`. Irma da de cima e pelo mesmo motivo: ela
      // cobre a barra de baixo e volta para `Perfil`.
      GoRoute(
        path: Rotas.meusAchados,
        builder: (context, estado) => const MeusAchados(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, estado, navegacao) =>
            CascaComAbas(navegacao: navegacao),
        // **A ordem dos ramos e a ordem de `CascaComAbas.destinos`, e isso e
        // contrato.** A casca traduz a posicao tocada na barra para o indice
        // do ramo pelo registro; se as duas listas sairem de ordem, tocar em
        // `Perfil` abre `Rede`. O portao `a ordem dos ramos e a ordem do
        // registro` reprova quando isso acontece.
        //
        // **18/10/2026: `Perto` e `Rede` trocaram de lugar** (literal do
        // cliente: *"inverta a ordem no app do item rede e perto"*). A ordem
        // era `Pets, Rede, Perto, Loja, Perfil` e passou a ser
        // `Pets, Perto, Rede, Loja, Perfil`. Os ramos tiveram de andar JUNTO
        // com o registro, e nao e detalhe: trocar so a barra faria tocar em
        // `Perto` abrir a `Rede`, calado, porque a casca resolve o indice.
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
                path: Rotas.perto,
                builder: (context, estado) => const AbaPerto(),
                routes: <RouteBase>[
                  GoRoute(
                    path: Rotas.localDoPerto,
                    builder: (context, estado) => PaginaDoLocal(
                      slug: estado.pathParameters[Rotas.parametroDoLocal] ?? '',
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.rede,
                builder: (context, estado) => const AbaRede(),
                routes: <RouteBase>[
                  GoRoute(
                    path: Rotas.encontroDaRede,
                    builder: (context, estado) => TelaDoEncontro(
                      slug: estado.pathParameters[Rotas.parametroDoEncontro]!,
                      // A distancia vem do cartao, que a leu de
                      // `listNearbyNetworkEvents`. Por link direto ela nao vem,
                      // e a linha some sem aviso.
                      distanciaEmMetros: estado.extra is int
                          ? estado.extra! as int
                          : null,
                      // O pedido feito depois do login nao saiu: a caixa do
                      // privado diz por que.
                      erroDoPedido: estado.extra is RetomadaDoPedido
                          ? (estado.extra! as RetomadaDoPedido).erro.texto
                          : null,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.loja,
                builder: (context, estado) => const AbaLoja(),
                routes: <RouteBase>[
                  GoRoute(
                    path: Rotas.produtoDaLoja,
                    builder: (context, estado) => TelaDoProduto(
                      slug:
                          estado.pathParameters[Rotas.parametroDoProduto] ?? '',
                    ),
                  ),
                ],
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
