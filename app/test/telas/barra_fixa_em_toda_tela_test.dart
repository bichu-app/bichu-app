// OS QUATRO PEDIDOS DE 20/10/2026 — as iscas.
//
// Literal do cliente, nos quatro:
//
//  1. *"o icone do perfil do usuario ficou muito perto do titulo da barra, de
//     uma margem do nome"*
//  2. *"quando o usuario vai para a mensagem, o menu inferior some, mantenha
//     ele fixo em todas as paginas"*
//  3. *"na pagina pet, remova o icone dos ..., so deixe o de escanear a tag"*
//  4. *"como o menu do perfil esta crescendo, vamos separar os links por
//     topicos/categorias"*
//
// Os grupos, e o que cada um desliga:
//
//  (a) a margem existe E o orcamento do titulo fecha. A margem NAO e de graca:
//      ela sai do orcamento, que caiu de 224,00 para 216,00 dp. O caso mede as
//      duas coisas no mesmo app -- o vao em coordenada e a constricao que o
//      leiaute entrega ao titulo --, porque medir so uma deixaria passar a
//      margem dada roubando o titulo, ou o titulo intacto sem margem nenhuma.
//
//  (b) a barra de baixo aparece em TODAS as telas empilhadas, **um caso por
//      tela**. Nao e um caso representando todas: o que falha e sempre UMA
//      rota -- quem acrescentar uma irma da casca amanha quebra o caso dela, e
//      so o dela. E tem o caso de COMPLETUDE, que varre o roteador de verdade
//      e reprova quando uma rota nova nasce irma da casca sem estar na lista
//      de excecoes declaradas.
//
//  (c) `more_horiz` nao existe mais em `Pets`, e o alvo que ficou e o leitor.
//
//  (d) as duas acoes que perderam a folha continuam alcancaveis **pelo
//      Perfil**, uma isca cada. A de `Cadastrar pet` tem um caso POR FASE do
//      bloco de pets: a porta dela so existia em duas das seis.
//
//  (e) os cabecalhos de grupo sao CABECALHO para quem nao ve, e nao sao
//      tocaveis. Com contraprova.
//
//  (f) a barra e UMA, desenhada num ponto so. Este e o portao
//      anti-divergencia da escolha (c) do item 2: duas cascas usam a barra, e
//      um segundo `NavigationBar` em `lib/` reprova.
//
//  (g) ninguem ficou sem saida. A propriedade `SAIDA e FOTO nunca aparecem na
//      mesma barra` continua valendo e **mudou de razao**: ela era "o slot da
//      esquerda e a unica saida da tela empilhada", e agora a tela empilhada
//      tem duas. O caso dela foi reescrito em
//      `gaveta_com_submenus_test.dart`; o que mora aqui e a prova de que as
//      telas que NAO tem `Voltar` nenhum sao exatamente as que a barra salva.

import 'dart:io';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/acao_de_criar_flutuante.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:bichu/widgets/saida_da_tela.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'casca_de_cinco_secoes_test.dart' show carregarInter;

// ---------------------------------------------------------------------------
// A LISTA DE TELAS -- a segunda fonte da verdade do item 2
// ---------------------------------------------------------------------------

/// Uma tela empilhada que **tem de** ter a barra de baixo.
///
/// [padrao] e o endereco como `rotas.dart` o declara (com `:parametro`), e
/// [endereco] e um endereco concreto para o caso navegar. Os dois existem
/// porque o caso de completude compara contra o ROTEADOR, que so conhece o
/// padrao, e os casos de tela precisam de um endereco que resolva.
typedef TelaEmpilhada = ({String nome, String endereco, String padrao});

/// As telas em que a barra de baixo DESAPARECIA antes de 20/10/2026.
///
/// Escrita a mao **de proposito**, como `ordemDecidida` no portao da
/// BICHUS-164 e como `secoesComGatilhoDeFiltro` no da gaveta: e a segunda
/// fonte da verdade, e existe para brigar com a primeira. Um portao que
/// derivasse esta lista do roteador ficaria verde por construcao -- ele
/// mediria exatamente as rotas que alguem pos dentro da casca, e nao as que
/// deveriam estar la.
///
/// **A primeira fonte e o roteador**, e o caso `nenhuma rota nova nasceu irma
/// da casca` o varre contra as excecoes declaradas em [semBarraPorDecisao].
///
/// Os enderecos com parametro vem preenchidos com um valor descartavel: o que
/// se mede e a BARRA, e nao o conteudo, e toda tela desta lista tem estado de
/// falha desenhado para quando a chamada nao responde.
const List<TelaEmpilhada> telasComBarraFixa = <TelaEmpilhada>[
  // O pedido LITERAL do cliente: a conversa.
  (nome: 'a conversa', endereco: '/mensagens/c-1', padrao: '/mensagens/:conversaId'),
  // E a area de mensagens, que e **o proprio slot `AuAu` da barra**: tocar no
  // slot empurrava uma rota que cobria a casca, entao a barra desaparecia no
  // toque de quem a estava usando.
  (nome: 'a area de mensagens', endereco: '/mensagens', padrao: '/mensagens'),
  // A caixa de avisos: o sino esta na barra de topo das CINCO secoes.
  (nome: 'a caixa de avisos', endereco: '/notificacoes', padrao: '/notificacoes'),
  (nome: 'o perfil de uma pessoa', endereco: '/pessoa/marina', padrao: '/pessoa/:apelido'),
  (nome: 'os pedidos de conexao', endereco: '/conexoes/pedidos', padrao: '/conexoes/pedidos'),
  (nome: 'as pessoas bloqueadas', endereco: '/perfil/bloqueados', padrao: '/perfil/bloqueados'),
  (nome: 'meus dados', endereco: '/perfil/dados', padrao: '/perfil/dados'),
  (nome: 'minhas fotos', endereco: '/perfil/minhas-fotos', padrao: '/perfil/minhas-fotos'),
  (nome: 'meus achados', endereco: '/perfil/achados', padrao: '/perfil/achados'),
  (nome: 'meus eventos', endereco: '/perfil/eventos', padrao: '/perfil/eventos'),
  (nome: 'minhas indicacoes', endereco: '/rede/indicacoes', padrao: '/rede/indicacoes'),
  (nome: 'sugerir profissional', endereco: '/rede/indicacoes/nova', padrao: '/rede/indicacoes/nova'),
  (nome: 'criar encontro', endereco: '/rede/encontros/novo', padrao: '/rede/encontros/novo'),
  (nome: 'registrar achado', endereco: '/achados/novo', padrao: '/achados/novo'),
  (nome: 'o achado registrado', endereco: '/achados/registrado', padrao: '/achados/registrado'),
  (nome: 'a ficha de um achado', endereco: '/achados/a-1', padrao: '/achados/:achadoId'),
  (nome: 'adocoes', endereco: '/adocoes', padrao: '/adocoes'),
  (nome: 'a pagina do pet', endereco: '/pets/p-1', padrao: '/pets/:petId'),
  (nome: 'editar o pet', endereco: '/pets/p-1/editar', padrao: '/pets/:petId/editar'),
  (nome: 'cadastrar pet: identificacao', endereco: '/pets/novo', padrao: '/pets/novo'),
  (nome: 'cadastrar pet: foto', endereco: '/pets/novo/foto', padrao: '/pets/novo/foto'),
  (nome: 'cadastrar pet: sinais', endereco: '/pets/novo/sinais', padrao: '/pets/novo/sinais'),
  (nome: 'o pet cadastrado', endereco: '/pets/cadastrado', padrao: '/pets/cadastrado'),
  (nome: 'solicitar plaquinha', endereco: '/pets/plaquinha', padrao: '/pets/plaquinha'),
  (nome: 'acompanhar plaquinha', endereco: '/pets/plaquinha/p-1', padrao: '/pets/plaquinha/:petId'),
  (nome: 'de quem e o caso', endereco: '/pets/perdido', padrao: '/pets/perdido'),
  (nome: 'onde e quando', endereco: '/pets/perdido/onde-e-quando', padrao: '/pets/perdido/onde-e-quando'),
  (nome: 'o alcance do alerta', endereco: '/pets/perdido/alcance', padrao: '/pets/perdido/alcance'),
  (nome: 'o caso aberto', endereco: '/pets/perdido/caso', padrao: '/pets/perdido/caso'),
];

/// As rotas que continuam SEM a barra, e o motivo de cada uma.
///
/// **Elas sao a razao pela qual o caso de completude nao e tautologico.** Sem
/// esta lista, "toda rota irma da casca tem de estar na casca fixa" seria uma
/// regra que a propria arvore nao cumpre -- e quem a fizesse passar poria
/// tudo dentro, inclusive a camera, que o design system PROIBE.
/// A QUEM FOR MEXER AQUI DEPOIS: a FICHA DO EVENTO esta voltando.
///
/// Uma frente paralela esta restaurando `rede/encontro_da_rede.dart` e a rota
/// de detalhe do evento -- o cliente pediu para tirar o CLIQUE do cartao e
/// resumi-lo, nao para apagar a tela. **Se ela voltar como SUB-ROTA do ramo da
/// `Rede`** (`encontros/:slug` sob `/rede`, como `locais/:slug` ja e), ela
/// nasce com a barra de baixo por construcao e nao precisa de linha nenhuma
/// nestas duas listas. **Se voltar como rota EMPILHADA**, o caso `nenhuma rota
/// nova nasceu irma da casca` reprova nomeando o endereco, e o conserto e
/// trocar `GoRoute` por `_comBarraFixa` e acrescentar a linha em
/// [telasComBarraFixa] -- um caso de tela e um de saida vem de graca com ela.
const Map<String, String> semBarraPorDecisao = <String, String>{
  '/': 'a abertura e um desvio: ela nao tem conteudo e nunca fica na tela.',
  '/entrar': 'quem nao tem sessao nao esta em secao nenhuma.',
  '/criar-conta': 'quem nao tem sessao nao esta em secao nenhuma.',
  '/verifique-seu-email': 'quem nao tem sessao nao esta em secao nenhuma.',
  '/esqueci-minha-senha': 'quem nao tem sessao nao esta em secao nenhuma.',
  '/escanear':
      'o design system 11.11 PROIBE a barra sobre a camera, e o caso '
          '`o leitor nao leva barra de topo NEM barra de abas` cobra isso.',
  '/t/:codigo': 'porta publica: quem chega de uma plaquinha chega de FORA.',
  '/p/:shareToken': 'porta publica: quem chega de um link chega de FORA.',
};

/// As telas que **nao tem `Voltar` nenhum** na barra de topo, e para as quais
/// a barra de baixo e a unica saida que o grupo (g) encontra.
///
/// As quatro sao as rotas de escape do fluxo de perdido: sem o rascunho no
/// `extra`, `rotas.dart` monta `AbaPerfil()` -- que e raiz de secao e poe a
/// FOTO no `leading`, o que apaga a seta automatica do `AppBar`. **Antes de
/// 20/10 elas nao tinham barra de baixo tambem**, e a unica saida era tocar na
/// foto. Esta lista existe para que a conta nao mude em silencio.
const Set<String> saidaSoPelaBarra = <String>{
  '/pets/perdido',
  '/pets/perdido/onde-e-quando',
  '/pets/perdido/alcance',
  '/pets/perdido/caso',
};

// ---------------------------------------------------------------------------
// A bancada
// ---------------------------------------------------------------------------

/// Uma rede que responde o minimo e recusa o resto.
///
/// **A recusa e deliberada:** o que se mede neste arquivo e a BARRA, e toda
/// tela da lista tem estado de falha desenhado. Montar respostas de verdade
/// para vinte e nove telas poria o caso a medir o conteudo delas -- que e
/// trabalho dos portoes de cada uma -- e faria este arquivo reprovar quando
/// qualquer contrato mudasse.
Future<http.Response> _redeMinima(http.Request req) async {
  if (req.url.path.endsWith('/reference-data')) {
    return json200(referenciaDeTeste());
  }
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
    return http.Response('', 204);
  }
  return problema('not-found', 404);
}

/// Monta o app numa superficie alta e vai para `Pets`.
///
/// Alta porque o menu da conta tem quatro grupos e sete itens mais o bloco de
/// pets: na bancada padrao o ultimo item nasce debaixo da barra de baixo, e o
/// toque nao chega nele.
Future<void> _abrirEmPets(WidgetTester tester, {double? escala}) async {
  tester.view.physicalSize = const Size(1125, 3000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await abrirOApp(
    tester,
    rede: _redeMinima,
    deposito: depositoLogado(),
    escala: escala,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
  await tester.pumpAndSettle();
}

/// Abre a tela da conta pela FOTO, que e a porta que o cliente nomeou.
Future<void> _abrirAContaPelaFoto(WidgetTester tester) async {
  await _abrirEmPets(tester);
  await tester.tap(find.byType(AvatarDaConta));
  await tester.pumpAndSettle();
}

/// Varre o roteador MONTADO e devolve o endereco de toda rota empilhada --
/// isto e, todo `GoRoute` do nivel de cima, que e o que cobre a casca dos
/// ramos quando empurrado.
///
/// A casca dos ramos (`StatefulShellRoute`) nao e `GoRoute` e nao entra: as
/// cinco secoes e as duas sub-rotas de ramo (`locais/:slug` e
/// `produtos/:slug`) tem a barra por construcao.
Set<String> _rotasEmpilhadas(WidgetTester tester) {
  final contexto = tester.element(find.byType(NavigationBar));
  final raiz = GoRouter.of(contexto).configuration.routes;
  return <String>{
    for (final rota in raiz)
      if (rota is GoRoute) rota.path,
  };
}

void main() {
  setUpAll(carregarInter);

  // =========================================================================
  group('(a) a foto tem margem do titulo, e o orcamento fecha nas quatro', () {
    // =======================================================================
    // O PEDIDO 1, MEDIDO NAS DUAS PONTAS
    // =======================================================================
    //
    // Literal: *"o icone do perfil do usuario ficou muito perto do titulo da
    // barra, de uma margem do nome"*. O vao era **0,00 dp**: o circulo de 32
    // dp terminava em 48, o alvo terminava em 48, e `titleSpacing: 0` fazia o
    // titulo comecar em 48.
    //
    // **A MARGEM SAI DO ORCAMENTO DO TITULO, e nao havia como nao sair.** A
    // margem interna de 16 dp da esquerda ja consumiu a folga que o alvo tinha
    // sobre o desenho; do lado direito nao sobra nada. Medido em 320 dp a 200%
    // de escala:
    //
    //   antes:  foto 48 | titulo | sino 48  -> 224,00 dp
    //   agora:  foto 56 | titulo | sino 48  -> **216,00 dp**
    //
    //   `Pets`, `Rede`, `Loja`: 138,32 dp -> cabem (77,68 de folga)
    //   `Mural`:                172,90 dp -> CABE  (43,10 de folga)
    //
    // DESLIGAMENTO: em `casca_com_abas.dart`, devolva `leadingWidth` a
    // `AvatarDaConta.alvo`. O vao vai a 0,00 e o primeiro `expect` reprova
    // nomeando a secao; o orcamento volta a 224,00 e o segundo reprova
    // tambem.
    for (final destino in CascaComAbas.visiveisEm(CascaComAbas.configuracao)
        .where((d) => d.ehRamo)) {
      testWidgets(
        'em "${destino.rotulo}": o vao existe E o titulo cabe em 216,00 dp',
        (tester) async {
          tester.view.physicalSize = const Size(960, 2000);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);

          // **LOGADO, e nao deslogado.** Deslogado a barra esconde o sino e o
          // titulo tem folga de sobra: o portao mediria o arranjo mais vazio e
          // aprovaria o errado.
          await abrirOApp(
            tester,
            rede: _redeMinima,
            deposito: depositoLogado(),
            escala: 2,
          );
          await tester.tap(
            find.widgetWithText(NavigationDestination, destino.rotulo),
          );
          await tester.pumpAndSettle();

          // (1) O ALVO DE TOQUE **NAO INFLOU**. As duas formas baratas de dar
          // a margem engordam o alvo: `padding: right` no `IconButton` o leva
          // a 56, e `Padding` por fora o tira do `leadingWidth`. A forma
          // escolhida poe o respiro FORA do alvo, com um `Align`.
          final alvo = tester.getRect(
            find.byKey(AvatarDaConta.chaveDoAlvo),
          );
          expect(
            alvo.width,
            closeTo(AvatarDaConta.alvo, 0.01),
            reason: 'REPROVA: o alvo da foto mede ${alvo.width} dp de largura '
                'e nao ${AvatarDaConta.alvo}. A margem do titulo virou ALVO: '
                'o dedo passou a acertar a conta no vao que existe para '
                'separar a foto do texto.',
          );

          // (2) O VAO, EM COORDENADA. **E este o pedido dele**, e e a unica
          // medida que ve o que ele viu: a distancia entre a borda direita do
          // CIRCULO desenhado e a borda esquerda do titulo.
          final circulo = tester.getRect(
            find.byKey(AvatarDaConta.chaveDoCirculo),
          );
          final titulo = find.descendant(
            of: find.byType(AppBar),
            matching: find.text(destino.rotulo),
          );
          expect(
            titulo,
            findsOneWidget,
            reason: 'REPROVA: a barra de topo de "${destino.rotulo}" nao '
                'pinta o titulo. Sem ele nao ha vao para medir.',
          );
          final paragrafo = tester.renderObject<RenderParagraph>(
            find.descendant(of: titulo, matching: find.byType(RichText)),
          );
          final vao = tester.getRect(
                find.descendant(of: titulo, matching: find.byType(RichText)),
              ).left -
              circulo.right;
          expect(
            vao,
            closeTo(AvatarDaConta.respiroDoTitulo, 0.01),
            reason: 'REPROVA: ha ${vao.toStringAsFixed(2)} dp entre o circulo '
                'da foto e o titulo de "${destino.rotulo}", e o decidido e '
                '${AvatarDaConta.respiroDoTitulo.toStringAsFixed(2)}. Zero e '
                'o estado que o cliente leu no aparelho em 20/10: *"o icone '
                'do perfil do usuario ficou muito perto do titulo da barra"*.',
          );

          // (3) O ORCAMENTO NOVO. Ele e a OUTRA metade: margem dada sem pagar
          // significaria que ela veio de um controle que saiu da barra.
          expect(
            paragrafo.constraints.maxWidth,
            216.0,
            reason: 'REPROVA: o titulo de "${destino.rotulo}" recebeu '
                '${paragrafo.constraints.maxWidth.toStringAsFixed(2)} dp de '
                'orcamento em 320 dp a 200%, e o arranjo de 20/10 mede '
                '216,00 -- foto 48 + respiro 8 a esquerda, sino 48 a direita, '
                '`titleSpacing: 0`. Menos que isso significa que um controle '
                'voltou para a barra; mais, que um saiu dela, ou que a margem '
                'do pedido 1 desapareceu.',
          );

          // (4) E ELE AINDA CABE. Esta e a linha que para a frente em vez de
          // afrouxar o portao: se um titulo passar a cortar, a decisao e de
          // produto -- rotulo mais curto, ou um controle fora da barra.
          final pedida = paragrafo.getMaxIntrinsicWidth(double.infinity);
          expect(
            pedida,
            lessThanOrEqualTo(paragrafo.constraints.maxWidth),
            reason: 'REPROVA: "${destino.rotulo}" pede '
                '${pedida.toStringAsFixed(2)} dp num orcamento de '
                '${paragrafo.constraints.maxWidth.toStringAsFixed(2)} dp, em '
                '320 dp a 200% de escala. A margem do pedido 1 custou 8,00 dp '
                'do titulo, e com ela os quatro titulos ainda cabiam -- '
                '`Mural`, o pior, pedia 172,90 com 43,10 de folga. Um titulo '
                'que passe a cortar e decisao do cliente, e nao uma '
                'reticencia a aceitar em silencio.',
          );
        },
      );
    }
  });

  // =========================================================================
  group('(b) a barra de baixo esta em TODA tela empilhada', () {
    // =======================================================================
    // O PEDIDO 2, UM CASO POR TELA
    // =======================================================================
    //
    // Literal: *"quando o usuario vai para a mensagem, o menu inferior some,
    // mantenha ele fixo em todas as paginas"*.
    //
    // **UM CASO POR TELA e nao um representando todas**, e a razao e
    // diagnostica: as vinte e nove rotas tem builders diferentes, quatro delas
    // caem em telas de escape quando falta o `extra`, e duas carregam
    // parametro. Um caso so diria "alguma tela perdeu a barra"; estes dizem
    // QUAL.
    //
    // DESLIGAMENTO: em `rotas.dart`, tire o `ShellRoute` e devolva as rotas a
    // irmas da casca. **Os vinte e nove casos reprovam, cada um pelo nome da
    // sua tela.**
    for (final tela in telasComBarraFixa) {
      testWidgets('${tela.nome} (${tela.endereco}) mantem a barra',
          (tester) async {
        await _abrirEmPets(tester);
        await irPara(tester, tela.endereco);

        // (1) A CASCA FIXA ESTA NA ARVORE. Sem esta linha o caso poderia ficar
        // verde com a navegacao falhando: se o `push` nao resolvesse, a tela
        // continuaria sendo `Pets` -- que TEM barra, pela casca dos ramos.
        expect(
          find.byType(CascaFixa),
          findsOneWidget,
          reason: 'REPROVA: ${tela.endereco} nao abriu dentro de '
              '`CascaFixa`. Ou a rota voltou a ser irma da casca -- e a barra '
              'de baixo desapareceu com ela, que e o defeito do pedido 2 --, '
              'ou o `push` nao resolveu e o caso esta medindo `Pets`.',
        );

        // (2) A BARRA, com os cinco slots.
        expect(
          find.byType(NavigationBar),
          findsOneWidget,
          reason: 'REPROVA: ${tela.nome} (${tela.endereco}) nao tem barra de '
              'baixo. O cliente foi literal: *"mantenha ele fixo em todas as '
              'paginas"*.',
        );
        expect(
          find.byType(NavigationDestination),
          findsNWidgets(
            CascaComAbas.visiveisEm(CascaComAbas.configuracao).length,
          ),
          reason: 'REPROVA: a barra de ${tela.nome} nao tem os mesmos slots '
              'da barra das secoes. Barra pela metade e pior que barra '
              'nenhuma: ela some com destinos sem dizer.',
        );
      });
    }

    // =======================================================================
    // AS DUAS QUE JA TINHAM A BARRA -- a conta que o briefing pediu
    // =======================================================================
    //
    // **`pagina do local` ERA SUSPEITA E NAO ERA CULPADA**, e isto e medicao e
    // nao leitura de codigo: ela e SUB-ROTA do ramo da `Rede`
    // (`locais/:slug` sob `/rede`), e sub-rota de ramo e empurrada no
    // `Navigator` do PROPRIO ramo -- dentro do `IndexedStack`, dentro da casca.
    // A barra nunca saiu dela. `produto da loja` e o mesmo arranjo sob `Loja`.
    //
    // As duas provam que a saida (a) FUNCIONA onde ela se aplica, e e por isso
    // que elas tem caso: sem este par, a escolha da saida (c) para as outras 29
    // pareceria a unica possivel, e nao e -- ela e a unica que serve as telas
    // que **nao pertencem a secao nenhuma**.
    //
    // DESLIGAMENTO: em `rotas.dart`, mova `locais/:slug` de dentro do `routes:`
    // do ramo da `Rede` para o nivel de cima. O caso reprova por `CascaFixa`
    // ausente **e** por barra ausente, nesta ordem.
    for (final tela in <({String nome, String endereco, String aba})>[
      (nome: 'a pagina do local', endereco: '/rede/locais/vet-x', aba: 'Rede'),
      (nome: 'o produto da loja', endereco: '/loja/produtos/p-x', aba: 'Loja'),
    ]) {
      testWidgets(
        '${tela.nome} ja tinha a barra, por ser SUB-ROTA do ramo',
        (tester) async {
          await _abrirEmPets(tester);
          await irPara(tester, tela.endereco);

          expect(
            find.byType(NavigationBar),
            findsOneWidget,
            reason: 'REPROVA: ${tela.nome} (${tela.endereco}) nao tem barra de '
                'baixo. Ela e sub-rota do ramo de `${tela.aba}` e a barra vem '
                'da casca dos ramos: se faltou, a rota saiu de dentro do ramo.',
          );
          expect(
            find.byType(CascaFixa),
            findsNothing,
            reason: 'REPROVA: ${tela.nome} passou a vestir `CascaFixa`. Ela '
                'NAO precisa: sub-rota de ramo e empurrada dentro do '
                '`IndexedStack` e a barra ja esta la. Vesti-la seria uma '
                'segunda barra por cima da primeira.',
          );
        },
      );
    }

    // =======================================================================
    // A COMPLETUDE -- o que impede o verde por lista curta
    // =======================================================================
    testWidgets('nenhuma rota nova nasceu irma da casca', (tester) async {
      // **A LISTA ACIMA E ESCRITA A MAO, e por isso ela nao basta.** Quem
      // acrescentar uma rota irma da casca amanha nao quebra nenhum dos vinte
      // e nove casos -- a tela nova simplesmente nao esta la --, e a barra
      // desapareceria nela em silencio. Este caso le o ROTEADOR DE VERDADE.
      //
      // DESLIGAMENTO: declare um `GoRoute` novo no nivel de cima de
      // `rotas.dart`. Este caso reprova nomeando o endereco.
      await _abrirEmPets(tester);
      final noRoteador = _rotasEmpilhadas(tester);
      final declaradas = <String>{
        ...telasComBarraFixa.map((t) => t.padrao),
        ...semBarraPorDecisao.keys,
      };
      final semDecisao = noRoteador.difference(declaradas);
      expect(
        semDecisao,
        isEmpty,
        reason: 'REPROVA: $semDecisao sao rotas empilhadas e nao estao '
            'declaradas em lugar nenhum. Rota empilhada cobre a casca dos '
            'ramos, e sem o embrulho de `_comBarraFixa` a barra de baixo '
            'desaparece nela -- que e exatamente o defeito que o cliente '
            'mandou consertar, e nenhum caso desta suite acusaria. Ou ela '
            'passa a ser `_comBarraFixa` em `rotas.dart` e entra em '
            '`telasComBarraFixa` (ganhando um caso de tela e um de saida), ou '
            'entra em `semBarraPorDecisao` com o motivo escrito.',
      );
      // E A GUARDA DO OUTRO LADO: linha orfa mantem a decisao de uma rota que
      // nao existe mais, e a proxima rota com o mesmo endereco herdaria em
      // silencio o que ninguem decidiu para ela.
      final orfas = declaradas.difference(noRoteador);
      expect(
        orfas,
        isEmpty,
        reason: 'REPROVA: $orfas estao declaradas e nao sao rotas empilhadas '
            'do roteador. Linha orfa e decisao esperando por uma rota futura '
            'que ninguem vai tomar.',
      );
    });

    testWidgets('e a barra da tela empilhada NAO acende slot errado',
        (tester) async {
      // O slot aceso e uma afirmacao sobre onde a pessoa esta, e numa tela
      // empilhada ela e facil de errar. `/mensagens/c-1` esta DENTRO do
      // `AuAu`; `/perfil/dados` nao esta em secao nenhuma da barra -- a conta
      // saiu dela em 19/10.
      //
      // DESLIGAMENTO: em `CascaFixa.slotDaRota`, troque a comparacao por
      // segmento por `startsWith`, ou devolva `0` em vez de `-1`. A segunda
      // metade deste caso reprova.
      expect(
        CascaFixa.slotDaRota('/mensagens/c-1'),
        CascaComAbas.visiveisEm(CascaComAbas.configuracao)
            .indexWhere((d) => d.rota == Rotas.mensagens),
        reason: 'REPROVA: a conversa nao acende o slot do `AuAu`. Ela esta '
            'dentro da secao de mensagens, e a barra tem de dizer isso.',
      );
      expect(
        CascaFixa.slotDaRota('/perfil/dados'),
        -1,
        reason: 'REPROVA: `Meus dados` acende um slot da barra. A secao da '
            'conta SAIU da barra em 19/10 e nao tem slot: acender outro seria '
            'a barra afirmando uma secao em que a pessoa nao esta.',
      );
      expect(
        CascaFixa.slotDaRota('/petshop'),
        -1,
        reason: 'REPROVA: um endereco que apenas COMECA pelas letras de '
            '`/pets` acendeu `Pets`. A comparacao e por SEGMENTO de caminho, '
            'e nao por prefixo de texto.',
      );
    });
  });

  // =========================================================================
  group('(c) `Pets` nao tem mais o alvo dos tres pontos', () {
    // Literal: *"na pagina pet, remova o icone dos ..., so deixe o de escanear
    // a tag"*.
    //
    // DESLIGAMENTO: em `abas.dart`, devolva `AcoesDeCriarFlutuantes` com o
    // `principal` e as `outras`. Os dois casos reprovam.
    testWidgets('o glifo `more_horiz` nao existe na secao', (tester) async {
      await _abrirEmPets(tester);
      expect(
        find.byIcon(Icons.more_horiz),
        findsNothing,
        reason: 'REPROVA: `Pets` ainda desenha `more_horiz`. O cliente foi '
            'literal: *"remova o icone dos ..., so deixe o de escanear a '
            'tag"*.',
      );
    });

    testWidgets('sobrou UM alvo flutuante, e ele e o leitor de UM TOQUE',
        (tester) async {
      await _abrirEmPets(tester);
      final alvos = find.byType(FloatingActionButton);
      expect(
        alvos,
        findsOneWidget,
        reason: 'REPROVA: `Pets` tem '
            '${alvos.evaluate().length} alvos flutuantes, e o cliente pediu '
            'UM. Dois alvos sao o arranjo que ele mandou desfazer.',
      );
      expect(
        find.byType(AcaoDeCriarFlutuante),
        findsOneWidget,
        reason: 'REPROVA: o alvo que ficou nao e `AcaoDeCriarFlutuante`. O '
            'componente de DOIS alvos nao serve mais aqui: a assercao dele '
            'exige duas acoes secundarias, e nao ha nenhuma.',
      );
      // `qr_code_scanner` e nao `qr_code_2`: um LE a plaquinha, o outro
      // EXIBE a propria.
      expect(
        find.descendant(of: alvos, matching: find.byIcon(Icons.qr_code_scanner)),
        findsOneWidget,
        reason: 'REPROVA: o alvo de `Pets` nao desenha `qr_code_scanner`.',
      );
      await tester.tap(alvos);
      await tester.pumpAndSettle();
      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: o alvo que ficou nao abre o leitor. Ele pinta o '
            'glifo do leitor e nao leva a lugar nenhum.',
      );
    });

    testWidgets('e o respiro do pe da lista continua 72,00 dp', (tester) async {
      // A invasao e a do alvo mais alto mais os 16 dp de assentamento do
      // `Scaffold`. **Tirar o segundo alvo tirou LARGURA do canto e nao
      // altura**, entao o respiro rolavel que ja existia continua pagando a
      // conta inteira -- o pedido do briefing era confirmar isso, nao supor.
      await _abrirEmPets(tester);
      final alvo = tester.getRect(find.byType(FloatingActionButton));
      final lista = find
          .descendant(
            of: find.byType(Scaffold),
            matching: find.byType(ListView),
          )
          .first;
      final corpo = tester.getRect(lista);
      final respiro = (tester.widget<ListView>(lista).padding as EdgeInsets)
          .bottom;
      final invasao = corpo.bottom - alvo.top;
      expect(
        invasao,
        closeTo(72.0, 0.01),
        reason: 'REPROVA: o alvo flutuante invade '
            '${invasao.toStringAsFixed(2)} dp do pe do corpo, e o medido '
            'continua sendo 72,00 (56 de desenho + 16 de assentamento).',
      );
      expect(
        respiro,
        greaterThanOrEqualTo(invasao),
        reason: 'REPROVA: o pe da lista reserva '
            '${respiro.toStringAsFixed(2)} dp e o alvo cobre '
            '${invasao.toStringAsFixed(2)} dp. O ultimo cartao de pet perdido '
            'termina embaixo dele, em toda rolagem.',
      );
    });
  });

  // =========================================================================
  group('(d) as duas acoes orfas tem casa no Perfil', () {
    // =======================================================================
    // O ITEM 3 E O ITEM 4 SAO O MESMO PROBLEMA
    // =======================================================================
    //
    // Tirar o alvo secundario de `Pets` tirou a folha, e com ela as duas
    // unicas portas de `Registrar achado avulso` e uma das duas de `Cadastrar
    // pet`. **Medido antes de mover:** `Rotas.registrarAchado` aparecia em
    // `lib/` so em tres lugares -- a folha, a declaracao da rota e a propria
    // tela. Sem casa nova, uma tela construida ficaria inalcancavel em
    // silencio: a rota existe, a tela monta, e o que desaparece e o unico
    // caminho humano.

    testWidgets('`Registrar achado avulso` e alcancavel pela FOTO', (
      tester,
    ) async {
      // DESLIGAMENTO: em `abas.dart`, apague o `ItemDeMenu` de `Registrar
      // achado avulso`. Este caso reprova, e nenhum outro da suite acusa.
      await _abrirAContaPelaFoto(tester);

      final item = find.widgetWithText(ItemDeMenu, 'Registrar achado avulso');
      await tester.scrollUntilVisible(item, 200);
      expect(
        item,
        findsOneWidget,
        reason: 'REPROVA: a tela da conta nao oferece `Registrar achado '
            'avulso`. Ela morava atras do alvo de tres pontos de `Pets`, que '
            'o cliente mandou remover em 20/10, e **nao tinha nenhuma outra '
            'porta em `lib/`**.',
      );
      await tester.tap(item);
      await tester.pumpAndSettle();
      expect(
        find.byType(CascaFixa),
        findsOneWidget,
        reason: 'REPROVA: tocar no item nao empilhou tela nenhuma.',
      );
      expect(
        find.text('Registrar achado avulso'),
        findsNothing,
        reason: 'REPROVA: o toque nao saiu do menu -- a tela de destino nao '
            'abriu e o item continua na tela. Item que pinta o nome e nao '
            'navega e funcao perdida com um rotulo em cima.',
      );
    });

    // =======================================================================
    // `Cadastrar pet`: UM CASO POR FASE do bloco de pets
    // =======================================================================
    //
    // **A porta dela JA EXISTIA no Perfil** -- o `BotaoPrimario` `Cadastrar
    // meu pet` -- e por isso ela nao ganhou um `ItemDeMenu`: dois controles
    // para a mesma rota na mesma tela, a um cabecalho de distancia, e o
    // defeito e nao o conserto.
    //
    // **O que ela tinha era um buraco de FASE**, medido: o botao existia em
    // duas das seis fases do bloco. Com o alvo de `Pets` fora, as outras
    // quatro ficaram sem porta nenhuma no app inteiro -- quem abrisse a conta
    // com o servidor fora nao tinha como cadastrar um pet.
    //
    // DESLIGAMENTO: em `meus_pets.dart`, tire `_acaoDeCadastrar()` de uma das
    // fases. **O caso daquela fase reprova, e so o dela.**
    for (final fase in <({String nome, Future<http.Response> Function(http.Request) rede})>[
      (
        nome: 'a lista VAZIA',
        rede: _redeMinima,
      ),
      (
        nome: 'a lista COM pets',
        rede: _redeComUmPet,
      ),
      (
        nome: 'a FALHA sem cache',
        rede: _redeQueFalhaNosPets,
      ),
    ]) {
      testWidgets(
        '`Cadastrar pet` tem porta no Perfil com ${fase.nome}',
        (tester) async {
          tester.view.physicalSize = const Size(1125, 3000);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);
          await abrirOApp(
            tester,
            rede: fase.rede,
            deposito: depositoLogado(),
          );
          await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
          await tester.pumpAndSettle();
          await tester.tap(find.byType(AvatarDaConta));
          await tester.pumpAndSettle();

          final porta = find.widgetWithText(FilledButton, 'Cadastrar meu pet');
          await tester.scrollUntilVisible(porta, 200);
          expect(
            porta,
            findsOneWidget,
            reason: 'REPROVA: com ${fase.nome}, a tela da conta nao oferece '
                '`Cadastrar meu pet`. Desde 20/10 ela e a UNICA porta de '
                '`Rotas.cadastrarPet` no app -- o alvo de tres pontos de '
                '`Pets`, que tinha a outra, saiu por pedido do cliente.',
          );
          await tester.tap(porta);
          await tester.pumpAndSettle();
          expect(
            find.byType(CascaFixa),
            findsOneWidget,
            reason: 'REPROVA: com ${fase.nome}, o toque em `Cadastrar meu '
                'pet` nao empilhou tela nenhuma.',
          );
        },
      );
    }
  });

  // =========================================================================
  group('(e) os cabecalhos de grupo sao cabecalho, e nao controle', () {
    // =======================================================================
    // O ITEM 4, na parte que nao se ve
    // =======================================================================
    //
    // Literal: *"como o menu do perfil esta crescendo, vamos separar os links
    // por topicos/categorias"*.
    //
    // **Quem navega por cabecalho no VoiceOver e no TalkBack pula de grupo em
    // grupo**, e um texto em `labelMedium` e `textMuted` sem o papel de
    // cabecalho e so um texto pequeno: para essa pessoa os topicos nao
    // existiriam, e a lista continuaria sendo a pilha de linhas iguais que o
    // cliente mandou organizar.
    //
    // **E cabecalho tocavel e pior que nenhum:** ele promete um destino que
    // nao existe.
    //
    // DESLIGAMENTO: em `item_de_menu.dart`, tire o `header: true` do
    // `Semantics` de `TituloDeGrupoDeMenu`. O primeiro caso reprova nomeando
    // o grupo.
    testWidgets('os quatro grupos existem, e sao anunciados como cabecalho',
        (tester) async {
      final semantica = tester.ensureSemantics();
      await _abrirAContaPelaFoto(tester);

      final grupos = find.byType(TituloDeGrupoDeMenu);
      expect(
        grupos.evaluate().length,
        greaterThanOrEqualTo(4),
        reason: 'REPROVA: a tela da conta tem '
            '${grupos.evaluate().length} cabecalho(s) de grupo, e o item 4 '
            'de 20/10 pede quatro: `Meus pets`, `Conta`, `Comunidade` e '
            '`Bichos na rua`. Encolher a lista e a forma mais facil de fazer '
            'um caso de agrupamento passar sem agrupar nada.',
      );

      for (final elemento in grupos.evaluate()) {
        final texto = (elemento.widget as TituloDeGrupoDeMenu).texto;
        final dados = tester
            .getSemantics(
              find.descendant(
                of: find.byWidget(elemento.widget),
                matching: find.text(texto),
              ),
            )
            .getSemanticsData();
        expect(
          dados.flagsCollection.isHeader,
          isTrue,
          reason: 'REPROVA: o grupo "$texto" NAO e anunciado como cabecalho. '
              'Quem navega por cabecalho nao para nele, e para essa pessoa os '
              'topicos do pedido 4 nao existem.',
        );
        expect(
          dados.hasAction(SemanticsAction.tap),
          isFalse,
          reason: 'REPROVA: o grupo "$texto" e TOCAVEL. Cabecalho com acao de '
              'toque promete um destino que nao existe, e quem usa leitor de '
              'tela o ouve anunciado como controle.',
        );
      }
      semantica.dispose();
    });

    testWidgets('CONTRAPROVA: a varredura ENXERGA um cabecalho tocavel',
        (tester) async {
      // Sem esta contraprova, o caso acima poderia estar verde por nao estar
      // olhando: `hasAction` num no que nao existe nao reprova nada. Aqui o
      // MESMO par de conferencias e aplicado a um cabecalho plantado com
      // `onTap`, e ele PRECISA falhar.
      final semantica = tester.ensureSemantics();
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: Scaffold(
            body: InkWell(
              onTap: () {},
              child: const TituloDeGrupoDeMenu('Plantado'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final plantado =
          tester.getSemantics(find.text('Plantado')).getSemanticsData();
      final doInkWell =
          tester.getSemantics(find.byType(InkWell)).getSemanticsData();
      expect(
        plantado.hasAction(SemanticsAction.tap) ||
            doInkWell.hasAction(SemanticsAction.tap),
        isTrue,
        reason: 'REPROVA: a conferencia de "cabecalho nao e tocavel" NAO ve um '
            'cabecalho tocavel plantado. Ela esta verde por nao olhar, e o '
            'caso acima nao prova nada.',
      );
      semantica.dispose();
    });
  });

  // =========================================================================
  group('(f) a barra e UMA, desenhada num ponto so', () {
    // =======================================================================
    // O PORTAO ANTI-DIVERGENCIA DA ESCOLHA (c)
    // =======================================================================
    //
    // A saida escolhida para o item 2 poe a barra em DUAS cascas --
    // `CascaComAbas`, com os ramos, e `CascaFixa`, com as telas empilhadas. O
    // risco nomeado no briefing e exatamente este: *"duplica o componente e o
    // risco e as duas divergirem"*. Este caso e o que impede.
    //
    // DESLIGAMENTO: escreva um segundo `NavigationBar` em qualquer arquivo de
    // `lib/`. Este caso reprova nomeando o arquivo.
    test('`NavigationBar(` aparece em UM arquivo de lib/, e e o da casca', () {
      final achados = <String>[];
      for (final arquivo in Directory('lib').listSync(recursive: true)) {
        if (arquivo is! File || !arquivo.path.endsWith('.dart')) continue;
        final fonte = arquivo.readAsStringSync();
        // Sem os comentarios: a prosa desta arvore cita o nome do componente
        // em varios lugares, e um portao que lesse a PALAVRA reprovaria por
        // documentacao. Foi um dos portoes cegos achados nesta rodada.
        final codigo = fonte
            .split('\n')
            .where((l) => !l.trimLeft().startsWith('//'))
            .join('\n');
        if (codigo.contains('NavigationBar(')) achados.add(arquivo.path);
      }
      expect(
        achados,
        <String>['lib/telas/casca_com_abas.dart'],
        reason: 'REPROVA: a barra de baixo e construida em $achados. Duas '
            'barras divergem, e no dia em que divergirem ninguem sabe qual '
            'das duas e a certa -- o risco que a saida (c) do item 2 assumiu '
            'e que `BarraDeBaixo` existe para fechar. As duas cascas usam o '
            'MESMO componente; o que muda entre elas e o motor do toque.',
      );
    });

    testWidgets('as duas cascas desenham a MESMA barra', (tester) async {
      // O caso de fonte acima nao veria duas barras construidas pelo mesmo
      // arquivo. Este compara o que chega a tela: os rotulos pintados na
      // casca dos ramos e na casca fixa.
      await _abrirEmPets(tester);
      List<String> rotulos() => find
          .byType(NavigationDestination)
          .evaluate()
          .map((e) => (e.widget as NavigationDestination).label)
          .toList();
      final naSecao = rotulos();
      await irPara(tester, '/mensagens/c-1');
      final naConversa = rotulos();
      expect(
        naConversa,
        naSecao,
        reason: 'REPROVA: a barra da conversa pinta $naConversa e a da secao '
            'pinta $naSecao. As duas cascas tem de desenhar a MESMA barra.',
      );
    });
  });

  // =========================================================================
  group('(g) ninguem ficou sem saida', () {
    // =======================================================================
    // A PROPRIEDADE QUE MUDOU DE RAZAO
    // =======================================================================
    //
    // `SAIDA e FOTO nunca aparecem na mesma barra`, em
    // `gaveta_com_submenus_test.dart`, provava que a composicao `Saida +
    // titulo + foto` nao existe -- e a razao escrita era *"perder a SAIDA
    // custa a tela: ela vira um beco"*. **Com a barra de baixo em toda tela
    // empilhada, essa razao mudou:** a tela empilhada passou a ter DUAS
    // saidas, e a regra do slot da esquerda deixou de ser a ultima linha de
    // defesa. O caso la foi reescrito com a razao nova; o que mora aqui e a
    // conta de quem depende de qual saida.
    //
    // **QUATRO TELAS NAO TEM `Voltar` NENHUM**, e isso e anterior a 20/10: as
    // rotas de escape do fluxo de perdido montam `AbaPerfil()` quando falta o
    // rascunho, e `AbaPerfil` e raiz de secao -- a FOTO no `leading` apaga a
    // seta automatica do `AppBar`. Antes de hoje elas nao tinham barra de
    // baixo tambem: a unica saida era tocar na foto.
    //
    // DESLIGAMENTO: tire o `ShellRoute` de `rotas.dart`. As quatro telas de
    // `saidaSoPelaBarra` passam a nao ter saida nenhuma, e o primeiro caso
    // reprova nomeando cada uma.
    for (final tela in telasComBarraFixa) {
      testWidgets('${tela.nome} tem saida', (tester) async {
        await _abrirEmPets(tester);
        await irPara(tester, tela.endereco);

        // **A SAIDA E DETECTADA PELO CONTROLE e nao pelo `tooltip`.** Este
        // app tem TRES formas de saida no slot da esquerda -- `SaidaDaTela`
        // de voltar (`Voltar`), `SaidaDaTela` de fechar (`Fechar`) e o
        // `BackButton` automatico do `AppBar`, cujo texto vem das localizacoes
        // do Material e **nao e portugues na bancada**. Um caso que casasse
        // `find.byTooltip('Voltar')` acusaria beco em dez telas que tem saida,
        // e foi o que a primeira medicao deste arquivo fez.
        final temSaidaNoTopo = find
                .descendant(
                  of: find.byType(AppBar),
                  matching: find.byType(SaidaDaTela),
                )
                .evaluate()
                .isNotEmpty ||
            find
                .descendant(
                  of: find.byType(AppBar),
                  matching: find.byType(BackButton),
                )
                .evaluate()
                .isNotEmpty;
        final temBarra =
            find.byType(NavigationBar).evaluate().isNotEmpty;
        expect(
          temSaidaNoTopo || temBarra,
          isTrue,
          reason: 'REPROVA: ${tela.nome} (${tela.endereco}) e um BECO: nao '
              'tem `Voltar` na barra de topo nem barra de baixo. A pessoa so '
              'sai pelo gesto do sistema.',
        );
        // E A CONTA DE QUEM DEPENDE DE QUAL SAIDA, travada: tela que perde o
        // `Voltar` em silencio passa a depender da barra, e a conta muda sem
        // ninguem decidir.
        expect(
          temSaidaNoTopo,
          !saidaSoPelaBarra.contains(tela.endereco),
          reason: 'REPROVA: ${tela.endereco} '
              '${temSaidaNoTopo ? "GANHOU" : "PERDEU"} a saida da barra de '
              'topo. A lista `saidaSoPelaBarra` diz quais telas dependem so '
              'da barra de baixo, e ela acabou de mudar sem decisao: ou o '
              'slot da esquerda trocou de conteudo, ou uma rota de escape '
              'deixou de montar `AbaPerfil`.',
        );
      });
    }
  });
}

/// Uma rede com UM pet na lista: a fase `lista` com conteudo.
Future<http.Response> _redeComUmPet(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        <String, dynamic>{
          'id': 'p-1',
          'name': 'Nina',
          'species': 'dog',
          'status': 'safe',
        },
      ],
    });
  }
  return _redeMinima(req);
}

/// Uma rede que recusa a lista de pets: a fase `falhaSemCache`.
Future<http.Response> _redeQueFalhaNosPets(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return problema('server-error', 500);
  }
  return _redeMinima(req);
}
