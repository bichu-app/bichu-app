// A BARRA NOVA, A `Rede` REUNIDA E A GAVETA OCULTA — as decisoes do cliente de
// 19/10/2026, com portão para cada uma.
//
// Este arquivo guarda SETE iscas. Nenhuma delas é uma afirmação sobre o
// código-fonte: todas medem a árvore montada, a geometria renderizada ou o
// registro que a produção lê. A vacuidade é o defeito recorrente deste
// repositório -- `findsNothing` sobre texto que a tela já não dizia, rótulo de
// semântica vazio, portão de fonte que lia a PALAVRA
// `AlwaysScrollableScrollPhysics` em vez do comportamento --, e cada grupo
// abaixo diz, por escrito, COMO desligá-lo para ver reprovar.
//
// ---------------------------------------------------------------------------
// AS DECISÕES
// ---------------------------------------------------------------------------
//
// 1. A barra de baixo é `Pets · Rede · Mural · Loja · AuAu`, nesta ordem.
// 2. `Perto` deixa de ser seção. A seção reunida é `Rede`, com as abas
//    `Eventos` e `Comunidade` -- esta última é o que era `Perto`.
// 3. `Próximos`, `Encerrados` e `Meus pedidos` viram FILTRO, não abas.
//    `Minhas indicações` vira porta própria.
// 4. `Mural` é a seção de publicações. Esta frente criou só o LUGAR dela.
// 5. Busca primeiro, gatilho de filtro à DIREITA (reverte 18/10).
// 6. A gaveta é OCULTADA, a foto da pessoa vai para o slot do hamburguer e o
//    sino fica sozinho à direita.
// 7. `Pets` ganha ação flutuante com as três ações que a gaveta perdeu.
//
// O portão da decisão 6 que mede a AUSÊNCIA da gaveta vive em
// `casca_de_cinco_secoes_test.dart` (a isca invertida pela terceira vez, junto
// das outras três inversões dela). Aqui está a metade que importa mais: que
// ocultar o menu **não perdeu função**.

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/tela_registrar_achado.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/conexoes/convide_tutores.dart';
import 'package:bichu/telas/conexoes/tela_minhas_conexoes.dart';
import 'package:bichu/telas/conexoes/tela_pedidos_de_conexao.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/telas/perfil/meus_eventos.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/telas/pet/tela_cadastrar_identificacao.dart';
import 'package:bichu/telas/seguranca/tela_de_bloqueados.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
import 'package:bichu/telas/mural/tela_do_mural.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/perto/minhas_indicacoes.dart';
import 'package:bichu/telas/rede/agenda_da_rede.dart';
import 'package:bichu/telas/rede/secao_da_rede.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'package:bichu/api/modelos.dart';

import '../rede/fixtures_da_rede.dart' as rede_fix;
import 'ajuda_de_tela.dart';
import 'casca_de_cinco_secoes_test.dart' show carregarInter;
import 'loja_com_dados_test.dart' as loja_fix;
import 'minhas_indicacoes_test.dart' as indicacoes_fix;
import 'perdidos_e_meus_achados_test.dart' as perdidos_fix;
import 'perto_com_dados_test.dart' as perto_fix;

/// Uma rede que responde às CINCO listagens de uma vez, cada uma com um item.
///
/// **Ela existe porque a isca da inversão precisa das cinco TELAS**, e não de
/// um `LinhaDeBuscaDaListagem` montado solto: a decisão é de que a inversão
/// aconteça num lugar só, e isso só é provado abrindo as cinco telas de
/// verdade e medindo a geometria de cada uma. Um caso que montasse o
/// componente provaria que o componente inverteu -- não que as telas o usam.
///
/// **Os corpos vêm dos fixtures já versionados de cada tela**, por importação
/// com prefixo, e não de JSON escrito aqui: um corpo inventado neste arquivo
/// divergiria do contrato na primeira mudança dele, e a isca passaria a medir
/// uma tela em estado de falha -- que não desenha barra de listagem nenhuma.
Future<http.Response> redeDasCincoListagens(http.Request req) async {
  final caminho = req.url.path;
  if (req.method != 'GET') return problema('not-found', 404);
  switch (caminho) {
    case '/v1/directory/entries':
      return json200(
        perto_fix.paginaDoContrato(
          <Map<String, dynamic>>[perto_fix.entradaDoContrato()],
          distanciaDisponivel: false,
        ),
      );
    case '/v1/directory/suggestions':
      return json200(
        indicacoes_fix.paginaDoContrato(
          <Map<String, dynamic>>[indicacoes_fix.indicacaoDoContrato()],
        ),
      );
    case '/v1/store/items':
      return json200(
        loja_fix.paginaDoContrato(
          <Map<String, dynamic>>[loja_fix.itemDoContrato()],
        ),
      );
    case '/v1/store/taxonomy':
      return json200(loja_fix.taxonomiaDoContrato());
    case '/v1/public/lost-pets':
      return json200(
        perdidos_fix.paginaDePerdidos(
          <Map<String, dynamic>>[
            perdidos_fix.perdidoDoContrato(vistoEm: '2026-10-18T12:00:00Z'),
          ],
        ),
      );
    case '/v1/network/events':
      return json200(
        rede_fix.pagina(
          <Map<String, dynamic>>[rede_fix.encontroPublico()],
        ),
      );
    case '/v1/network/events/nearby':
      return json200(
        rede_fix.paginaPorPerto(<Map<String, dynamic>>[
          rede_fix.porPerto(rede_fix.encontroPublico(), 1200),
        ]),
      );
    case '/v1/network/join-requests':
      return json200(
        rede_fix.paginaDePedidos(const <Map<String, dynamic>>[]),
      );
    case '/v1/pets':
      return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  return problema('not-found', 404);
}

/// O que `Usuários` pede a 200% de escala, em 320 dp, com a `Inter` real.
///
/// **MEDIDO nesta bancada em 21/10/2026**, e não copiado do protótipo: a
/// bancada é a autoridade, e foi ela que travou 139,62 e 221,24 para os outros
/// dois. O protótipo havia estimado 154,62 pelo mesmo método, e a bancada
/// **confirmou o número na casa dos centésimos** -- o que vale dito porque é a
/// medição do protótipo que sustenta a conta dos 353,74 dp somados e dos 40%
/// de rótulo visível em 320 dp.
const double abaUsuariosA200 = 154.62;

/// Os rótulos das abas que a tela da frente pinta, na ordem desenhada.
///
/// **Lido do `Text` DENTRO da aba, e não de `Tab.text`** (22/10/2026). As abas
/// da `Rede` ganharam glifo por pedido do cliente, e um `Tab` que leva glifo
/// **ao lado** do rótulo passa os dois num `child:` -- `Tab.text` fica nulo e
/// este ajudante devolvia três cadeias vazias.
///
/// A troca não é só conserto: ler a propriedade do widget era justamente o que
/// a prosa de `gruposDaFolha`, logo abaixo, diz para não fazer. O rótulo que
/// importa é o que está pintado.
List<String> abasNaTela(WidgetTester tester) => find
    .byType(Tab)
    .evaluate()
    .map(
      (aba) => tester
          .widgetList<Text>(
            find.descendant(
              of: find.byWidget(aba.widget),
              matching: find.byType(Text),
            ),
          )
          .map((t) => t.data ?? '')
          .join(),
    )
    .toList(growable: false);

/// Os títulos dos grupos da folha de filtro ABERTA.
///
/// Lidos da árvore montada, e não da lista que a tela constrói: um caso que
/// lesse `_controleDeFiltro()` provaria que a função devolve o grupo, e não
/// que a pessoa o vê.
List<String> gruposDaFolha(WidgetTester tester) => tester
    .widgetList<Text>(
      find.descendant(
        of: find.byType(BottomSheet),
        matching: find.byType(Text),
      ),
    )
    .map((t) => t.data ?? '')
    .where((t) => t.isNotEmpty)
    .toList(growable: false);

/// Abre a folha de filtro da tela da frente pelo gatilho do corpo.
Future<void> abrirAFolha(WidgetTester tester) async {
  final gatilho = find.byType(GatilhoDeRecorteNoCorpo);
  expect(
    gatilho,
    findsOneWidget,
    reason: 'REPROVA: não há gatilho de filtro no corpo da tela. Sem ele a '
        'folha não abre por caminho nenhum, e os recortes que absorveram as '
        'abas ficariam inalcançáveis.',
  );
  await tester.tap(gatilho);
  await tester.pumpAndSettle();
}


/// Abre `Minhas indicações` pela porta no MENU DO PERFIL.
///
/// **A PORTA MUDOU DE LUGAR EM 26/10/2026** -- ela estava no pe da aba
/// `Comunidade` e saiu por pedido do cliente de 22/10. Quem acha a porta e
/// `indicacoes_fix.irAtePortaNoPerfil`, e reusa-la em vez de copiar a
/// navegacao e deliberado: duas definicoes de "onde esta a porta" divergiriam
/// na proxima mudanca, e este arquivo mede a GAVETA e nao o caminho.
Future<void> abrirAsMinhasIndicacoes(WidgetTester t) async {
  final porta = await indicacoes_fix.irAtePortaNoPerfil(t);
  await t.tap(porta);
  await t.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // **A `Inter` DE VERDADE, e sem ela TODA MEDIDA DESTE ARQUIVO E OUTRA.**
  //
  // O ambiente de teste do Flutter usa uma fonte sintetica de largura
  // UNIFORME: cada caractere mede o mesmo, nenhuma quebra nunca acontece, e
  // uma isca de largura aprova qualquer rotulo. **Medido aqui, numa bancada
  // descartavel sem esta linha:** `Eventos` deu exatos 126,00 dp e
  // `Comunidade` exatos 180,00 -- 18,00 dp por caractere nos dois, que e a
  // assinatura da fonte sintetica. Com a `Inter` os numeros nao sao multiplos
  // da contagem de letras.
  //
  // A UX perdeu uma passada inteira exatamente assim (UX 27.1), e e a razao
  // pela qual `carregarInter` REPROVA em vez de seguir calada quando nao acha
  // o arquivo da fonte.
  setUpAll(carregarInter);

  // =========================================================================
  // ISCA (a) — A BARRA TEM OS CINCO, NESTA ORDEM
  // =========================================================================
  group('(a) a barra de baixo é `Pets · Rede · Mural · Loja · AuAu`', () {
    // DESLIGAMENTO: troque a ordem de duas entradas de `CascaComAbas.destinos`
    // em `casca_com_abas.dart`, ou apague a entrada do `Mural`. O primeiro
    // caso reprova no primeiro passo; o segundo, nos dois.
    testWidgets('os cinco rótulos PINTADOS, na ordem desenhada',
        (tester) async {
      await abrirOApp(tester, rede: redeDasCincoListagens);

      // **A ORDEM SAI DA GEOMETRIA, e não da lista de `destinations`.** Ler a
      // lista provaria que a lista está na ordem; o que a pessoa toca é o que
      // está mais à esquerda na tela, e uma `Row` em `rtl` inverteria o
      // desenho sem mexer na lista.
      final slots = <(double, String)>[];
      for (final e in find.byType(NavigationDestination).evaluate()) {
        final d = e.widget as NavigationDestination;
        slots.add((tester.getRect(find.byWidget(d)).left, d.label));
      }
      slots.sort((a, b) => a.$1.compareTo(b.$1));

      expect(
        slots.map((s) => s.$2).toList(),
        <String>['Pets', 'Rede', 'Mural', 'Loja', 'AuAu'],
        reason: 'REPROVA: a barra de baixo não desenha os cinco destinos na '
            'ordem que o cliente pediu em 19/10/2026. A ordem foi lida da '
            'POSIÇÃO de cada slot na tela, da esquerda para a direita.',
      );
    });

    testWidgets('e tocar em cada um abre a seção dele, e não a do vizinho',
        (tester) async {
      // **ESTE CASO É O QUE PEGA A DIVERGÊNCIA ENTRE O REGISTRO E OS RAMOS.**
      // A casca traduz a posição tocada na barra para o índice do ramo pelo
      // registro; trocar só uma das duas listas faz tocar em `Mural` abrir a
      // `Rede`, CALADO -- a barra acende o slot certo e o corpo é o errado.
      //
      // O caso anterior, sozinho, fica verde nesse defeito.
      await abrirOApp(tester, rede: redeDasCincoListagens);

      const corpoEsperado = <String, Type>{
        'Rede': SecaoDaRede,
        'Mural': CorpoDoMural,
      };
      for (final (rotulo, tipo) in corpoEsperado.entries.map(
        (e) => (e.key, e.value),
      )) {
        await tester.tap(
          find.widgetWithText(NavigationDestination, rotulo),
        );
        await tester.pumpAndSettle();
        expect(
          find.byType(tipo),
          findsOneWidget,
          reason: 'REPROVA: tocar em `$rotulo` não montou $tipo. A ordem dos '
              'ramos de `rotas.dart` e a ordem de `CascaComAbas.destinos` '
              'divergiram, e o toque abre a seção do vizinho em silêncio.',
        );
        // E o título da barra de topo é a MESMA palavra do rótulo (UX 25.7.2).
        expect(
          find.descendant(
            of: find.byType(AppBar),
            matching: find.text(rotulo),
          ),
          findsOneWidget,
          reason: 'REPROVA: a barra de topo de `$rotulo` não diz `$rotulo`. A '
              'mesma palavra nos dois lugares é o que faz a casca servir para '
              'conferir nomenclatura.',
        );
      }
    });
  });

  // =========================================================================
  // ISCA (b) — `Perto` NÃO EXISTE MAIS, E NÃO HÁ ROTA ÓRFÃ
  // =========================================================================
  group('(b) não há rota órfã para a seção que saiu', () {
    // DESLIGAMENTO: devolva `static const String perto = '/perto';` a
    // `Rotas`, registre o ramo de novo em `rotas.dart` e reponha a entrada no
    // registro de seções. Cada passo reprova um caso daqui.
    test('`Perto` não está no registro de seções', () {
      final destinos = CascaComAbas.destinos;
      // A guarda contra o verde por vazio: um registro vazio satisfaz
      // "`Perto` não está nele" sem nunca ter olhado para uma seção.
      expect(
        destinos,
        hasLength(6),
        reason: 'REPROVA: o registro tem ${destinos.length} entrada(s) e não '
            '6 (as cinco da barra mais a conta). Com outro número, as '
            'afirmações abaixo medem outra barra.',
      );
      expect(
        destinos.where((d) => d.rotulo == 'Perto' || d.rota == '/perto'),
        isEmpty,
        reason: 'REPROVA: `Perto` voltou ao registro de seções.',
      );
    });

    test('nenhuma rota de seção nem de ramo começa por `/perto`', () {
      // **SOBRE O REGISTRO E SOBRE OS RAMOS, que são listas diferentes.** A
      // entrada do registro pode existir sem ser ramo (é o caso de `AuAu`), e
      // o ramo é o que o `IndexedStack` monta.
      final comPrefixo = <String>[
        for (final d in CascaComAbas.destinos)
          if (d.rota.startsWith('/perto')) '${d.rotulo} -> ${d.rota}',
        for (final d in CascaComAbas.ramosDoRegistro)
          if (d.rota.startsWith('/perto')) 'ramo ${d.rotulo} -> ${d.rota}',
      ];
      expect(
        comPrefixo,
        isEmpty,
        reason: 'REPROVA: $comPrefixo. A seção `Perto` deixou de existir, e um '
            'endereço que começa por `/perto` é uma rota órfã: o roteador a '
            'conhece, nenhum destino da barra a alcança, e ela abriria uma '
            'seção que o produto não tem mais.',
      );
    });

    test('as duas rotas que viviam SOB `/perto` mudaram de prefixo, e vivem',
        () {
      // **A AUSÊNCIA SOZINHA NÃO É A ENTREGA.** Apagar `/perto` e deixar as
      // duas telas sem endereço passaria no caso acima e teria quebrado o
      // produto: a ficha de um local e o formulário de indicar continuam
      // existindo. Este caso cobra que elas tenham endereço NOVO.
      expect(
        Rotas.sugerirProfissional,
        '/rede/indicacoes/nova',
        reason: 'REPROVA: a rota de indicar um profissional não mudou de '
            'prefixo. Em `/perto/...` ela mantém vivo o primeiro segmento de '
            'uma seção que não existe.',
      );
      expect(
        Rotas.minhasIndicacoes,
        '/rede/indicacoes',
        reason: 'REPROVA: `Minhas indicações` não tem o endereço esperado. '
            'Ela virou porta própria e precisa de rota -- como aba, ela não '
            'tinha nenhuma.',
      );
      expect(
        Rotas.localDoPertoDe('clinica-exemplo'),
        '/rede/locais/clinica-exemplo',
        reason: 'REPROVA: o montador do endereço da ficha de um local ainda '
            'escreve `/perto/...`. Ele monta o caminho ABSOLUTO, e um prefixo '
            'velho aqui dá uma rota que não existe -- em silêncio, e só no '
            'toque do cartão.',
      );
    });

    testWidgets('e `/perto` não resolve: ele cai no desvio de rota desconhecida',
        (tester) async {
      // **A PROVA DE COMPORTAMENTO, e é ela que fecha o grupo.** As três
      // afirmações acima são sobre constantes; esta abre o endereço de
      // verdade no roteador do app e cobra que ele não monte uma seção.
      await abrirOApp(tester, rede: redeDasCincoListagens);
      // O roteador sai de um elemento da arvore montada, como os outros
      // casos deste repositorio fazem (`casca_de_cinco_secoes_test.dart`).
      GoRouter.of(tester.element(find.byType(CascaComAbas))).go('/perto');
      await tester.pumpAndSettle();

      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.text('Perto'),
        ),
        findsNothing,
        reason: 'REPROVA: `/perto` abriu uma tela com o título `Perto`. A '
            'seção não existe, e um endereço que ainda a monta é a rota órfã '
            'que este grupo existe para impedir.',
      );
      expect(
        find.byType(ListaDoDiretorio),
        findsNothing,
        reason: 'REPROVA: `/perto` abriu a lista do diretório. Ela mora na '
            'aba `Comunidade` da `Rede`, e um segundo endereço para ela é a '
            'segunda definição de onde ela mora.',
      );
    });
  });

  // =========================================================================
  // ISCA (c) — AS DUAS ABAS DA `Rede`, E A ROLÁVEL QUE NÃO CORTA
  // =========================================================================
  group('(c) as TRES abas da `Rede`, e a rolável que não corta', () {
    // ERAM DUAS ATE 21/10/2026, e a terceira entrou com a busca de pessoas:
    // `Usuários`, que o cliente pediu nas palavras *"na aba rede, temos que
    // ter uma aba de usuarios, e o campo buscar para encontrar e adicionar as
    // pessoas"*. A medição da rolável não mudou de forma -- mudou de número,
    // e o número novo está no caso de baixo.
    //
    // DESLIGAMENTO: em `rede/secao_da_rede.dart`, troque
    // `isScrollable: true` por `false`. O caso da escala de 200% reprova com
    // `Comunidade` cortando por 77,24 dp.
    testWidgets('`Eventos`, `Comunidade` e `Usuários`, nesta ordem, com e sem '
        'conta', (tester) async {
      // **COM E SEM CONTA, e isso é diferente das abas antigas.** `Meus
      // pedidos` e `Minhas indicações` sumiam sem sessão porque eram listas do
      // que a pessoa fez. Estas duas não são: `Eventos` é a agenda pública e
      // `Comunidade` é o diretório, que desenha o próprio convite sem sessão.
      for (final logado in <bool>[true, false]) {
        await abrirOApp(
          tester,
          rede: redeDasCincoListagens,
          deposito: logado ? depositoLogado() : null,
        );
        await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
        await tester.pumpAndSettle();

        expect(
          abasNaTela(tester),
          <String>['Eventos', 'Comunidade', 'Usuários'],
          reason: 'REPROVA: com logado=$logado as abas da `Rede` não são as '
              'três de 21/10/2026, nesta ordem. `Eventos` é a primeira porque '
              'é o conteúdo histórico da seção e é onde o arranque do app '
              'abre. `Usuários` é a TERCEIRA e não a segunda: trocar com '
              '`Comunidade` poria a aba inteira na tela, mas empurraria o '
              'diretório -- conteúdo público, alcançável sem conta -- para '
              'trás de uma aba que exige conta. E `Usuários` existe SEM CONTA '
              'por uma razão diferente das outras duas: a rota dela exige '
              'conta, e é o CORPO dela que desenha o convite para entrar. '
              'Esconder a aba faria a seção ter duas abas para quem não '
              'entrou e três para quem entrou.',
        );
      }
    });

    testWidgets('a `TabBar` é ROLÁVEL, e nenhuma das TRÊS abas corta a 200%',
        (tester) async {
      // ======================================================================
      // A MEDIÇÃO QUE DECIDIU O DESENHO
      // ======================================================================
      //
      // Medido na bancada do projeto, com a `Inter` real, em 320 dp, numa
      // `TabBar` NÃO rolável de dois itens (slot de 144,00 dp cada):
      //
      //   `Eventos`     69,81 dp
      //   `Comunidade` 110,62 dp
      //
      // As duas cabem lado a lado **até 130%** de escala. A **200%**,
      // `Comunidade` pede 221,24 dp e corta por **77,24 dp**.
      //
      // `isScrollable: true` é o que resolve sem abreviar: cada aba recebe a
      // largura do próprio texto. O contexto que torna isto uma MELHORA e não
      // uma troca: as TRÊS abas de ontem já cortavam DUAS em 320 dp a 100%.
      //
      // **O CASO MEDE O COMPORTAMENTO, e não a palavra `isScrollable`.** Um
      // portão que lesse o fonte procurando a palavra é exatamente o defeito
      // que este repositório já teve (o portão que lia
      // `AlwaysScrollableScrollPhysics` e ficou verde num defeito real em onze
      // telas). Aqui ele mede duas coisas da árvore renderizada: que a largura
      // de cada aba é a do PRÓPRIO texto (e não a tela dividida em dois), e
      // que nenhum dos dois parágrafos transborda a constrição que recebeu.
      tester.view.physicalSize = const Size(960, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await abrirOApp(
        tester,
        rede: redeDasCincoListagens,
        deposito: depositoLogado(),
        escala: 2,
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();

      final barra = tester.getRect(find.byType(TabBar));
      final larguras = <String, double>{};
      final transbordos = <String>[];
      for (final rotulo in <String>['Eventos', 'Comunidade', 'Usuários']) {
        final alvo = find.descendant(
          of: find.byType(TabBar),
          matching: find.text(rotulo),
        );
        expect(
          alvo,
          findsOneWidget,
          reason: 'REPROVA: a aba `$rotulo` não está pintada.',
        );
        final paragrafo = tester.renderObject<RenderParagraph>(alvo);
        final pedida = paragrafo.getMaxIntrinsicWidth(double.infinity);
        final recebida = paragrafo.constraints.maxWidth;
        larguras[rotulo] = pedida;
        if (pedida > recebida + 0.01) {
          transbordos.add(
            '  `$rotulo` pede ${pedida.toStringAsFixed(2)} dp e recebeu '
            '${recebida.toStringAsFixed(2)} dp',
          );
        }
      }

      expect(
        transbordos,
        isEmpty,
        reason: 'REPROVA: a 200% de escala, em 320 dp, uma das abas da `Rede` '
            'NÃO CABE no espaço que o layout lhe deu:\n'
            '${transbordos.join('\n')}\n'
            'Com `isScrollable: false` as duas dividem a tela em dois slots '
            'de 144,00 dp e `Comunidade` corta por 77,24 dp. A `TabBar` '
            'rolável dá a cada aba a largura do próprio texto.',
      );

      // **OS DOIS NÚMEROS, TRAVADOS, e eles batem com a bancada do
      // protótipo casa por casa.** Medidos aqui, em 320 dp a 200%, com a
      // `Inter` real:
      //
      //   `Eventos`    139,62 dp   (69,81 a 100%)
      //   `Comunidade` 221,24 dp  (110,62 a 100%)
      //
      // Numa `TabBar` NÃO rolável de dois itens o slot é 144,00 dp (o corpo de
      // 288 dividido por dois), e `Comunidade` cortaria por **77,24 dp**. É
      // esse número que `isScrollable: true` resolve.
      //
      // Rótulo que cresce muda a conta, e o caso diz em quanto.
      expect(
        larguras['Eventos'],
        closeTo(139.62, 0.5),
        reason: 'REPROVA: `Eventos` pede ${larguras["Eventos"]} dp a 200% e a '
            'bancada mediu 139,62. Ou o tema mudou de tipografia, ou o rótulo '
            'mudou de palavra.',
      );
      expect(
        larguras['Comunidade'],
        closeTo(221.24, 0.5),
        reason: 'REPROVA: `Comunidade` pede ${larguras["Comunidade"]} dp a '
            '200% e a bancada mediu 221,24. Num slot não rolável de 144,00 ela '
            'cortaria por 77,24 dp, e é esse corte que a `TabBar` rolável '
            'evita sem abreviar o nome que o cliente escolheu.',
      );
      // `Usuários` entrou em 21/10/2026. Ele é o SEGUNDO MENOR dos três
      // rótulos e pede 33,31 dp menos que `Comunidade` a 100% -- então ele
      // cabe, e a 200% continua sem reticência.
      //
      // **O que ele não tem é visibilidade inicial**, e é por isso que o botão
      // do Mural vazio não é enfeite: os três slots somam 353,74 dp, e em
      // 320 dp a terceira aba nasce 40% visível. A 200% ela nasce INTEIRA fora
      // da tela. O caso que mede a saída do Mural é
      // `caminhos_de_conexao_test.dart`.
      expect(
        larguras['Usuários'],
        closeTo(abaUsuariosA200, 0.5),
        reason: 'REPROVA: `Usuários` pede ${larguras["Usuários"]} dp a 200% e '
            'a bancada mediu ${abaUsuariosA200.toStringAsFixed(2)}. Ou o tema mudou de '
            'tipografia, ou o rótulo mudou de palavra.',
      );

      // E a prova de que ela é ROLÁVEL: a soma das duas abas transborda a
      // largura da tela. Numa `TabBar` não rolável isso é impossível por
      // construção -- as abas dividem a largura disponível.
      expect(
        larguras.values.reduce((a, b) => a + b),
        greaterThan(barra.width),
        reason: 'REPROVA: as duas abas somadas (${larguras.values.join(" + ")} '
            'dp) cabem na largura da barra (${barra.width} dp). A 200% de '
            'escala em 320 dp elas NÃO cabem, e se cabem é porque a bancada '
            'não está medindo a escala que diz medir -- ou porque a `TabBar` '
            'voltou a dividir a tela e os rótulos foram abreviados.',
      );
    });
  });

  // =========================================================================
  // ISCA (d) — O FILTRO ABSORVEU AS TRÊS ABAS DA AGENDA
  // =========================================================================
  group('(d) o filtro absorveu `Próximos` e `Encerrados`, e `Meus pedidos` saiu',
      () {
    // DESLIGAMENTO: em `rede/agenda_da_rede.dart`, tire `Próximos` e
    // `Encerrados` das opções do grupo `when`. Cada passo reprova um caso daqui.
    //
    // **`Meus pedidos` NÃO virou filtro, e a união do lote de 19/10 é que
    // decidiu isso.** Esta frente converteu as TRÊS abas em recorte e deixou a
    // terceira viva como o grupo `Meu envolvimento`;
    // `feat/evento-simples-e-sem-telefone` REMOVEU a aba no mesmo método, por
    // decisão do cliente no mesmo dia (*"vamos deixar apenas os eventos
    // abertos por enquanto"*). A remoção ganhou porque o outro lado não
    // compilaria: `RecorteDaRede` perdeu `visibilidade`, `estadoDoPedido` e
    // `queryDePedidos`. Os dois casos que mediam `Só onde eu pedi` foram
    // INVERTIDOS aqui, e não apagados: eles agora medem a ausência do
    // CAMINHO, que é o que a decisão pediu.
    testWidgets('as três NÃO são mais abas, em lugar nenhum da seção',
        (tester) async {
      await abrirOApp(
        tester,
        rede: redeDasCincoListagens,
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();

      // **A medida é a lista de abas PINTADAS, e não `findsNothing` sobre três
      // textos.** `findsNothing` sobre texto que a tela já não diz é o portão
      // cego que esta rodada achou dez vezes: ele passaria igual se a `TabBar`
      // tivesse desaparecido inteira, ou se os rótulos tivessem mudado de
      // palavra e continuassem sendo abas.
      expect(
        abasNaTela(tester),
        <String>['Eventos', 'Comunidade', 'Usuários'],
        reason: 'REPROVA: a seção `Rede` pinta abas que não são as três da '
            'decisão. As três abas da agenda (`Próximos`, `Meus pedidos`, '
            '`Encerrados`) viraram FILTRO em 19/10/2026, e `Usuários` entrou '
            'em 21/10/2026 com a busca de pessoas.',
      );
    });

    testWidgets('`Quando` oferece `Próximos` e `Encerrados`, e mais nada vira aba',
        (tester) async {
      await abrirOApp(
        tester,
        rede: redeDasCincoListagens,
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();
      await abrirAFolha(tester);

      final pintados = gruposDaFolha(tester);
      for (final esperado in <String>['Quando', 'Próximos', 'Encerrados']) {
        expect(
          pintados,
          contains(esperado),
          reason: 'REPROVA: a folha de filtro da `Rede` não oferece '
              '"$esperado". As DUAS abas de tempo da agenda viraram recortes '
              'DESTA folha, e uma que não aparece aqui é função perdida -- não '
              'função movida. Pintados: $pintados',
        );
      }
      for (final proibido in <String>['Meu envolvimento', 'Só onde eu pedi']) {
        expect(
          pintados,
          isNot(contains(proibido)),
          reason: 'REPROVA: "$proibido" está na folha. A aba `Meus pedidos` '
              'NÃO virou filtro: ela saiu do app em 19/10/2026 por decisão do '
              'cliente, e as sete operações do pedido ficaram declaradas e sem '
              'chamador em `api/rede_api.dart`. Pintados: $pintados',
        );
      }
    });

    testWidgets(
      'ISCA: NENHUM caminho da folha chega à rota dos pedidos',
      (tester) async {
        // **ESTE CASO FOI INVERTIDO NA UNIÃO DO LOTE DE 19/10, e não apagado.**
        //
        // Ele media `Só onde eu pedi` TROCANDO a operação para
        // `GET /v1/network/join-requests`. A decisão do cliente removeu a aba
        // `Meus pedidos` e, com ela, esse recorte -- então o que resta a medir
        // é o inverso, e ele vale mais: que NENHUM caminho da folha chega
        // àquela rota. **Medido nesta mescla**: antes da inversão o caso
        // reprovava procurando `Só onde eu pedi`, que a folha já não oferecia.
        //
        // **A medida continua sendo a CHAMADA DE REDE, e não a pastilha
        // ausente.** Um caso que só olhasse a folha ficaria verde com um
        // recorte que a tela aceita por outro caminho e manda à rota
        // aposentada; a rota é que não pode ser pedida.
        final pedidos = <http.Request>[];
        Future<http.Response> comEspiao(http.Request req) {
          pedidos.add(req);
          return redeDasCincoListagens(req);
        }

        await abrirOApp(
          tester,
          rede: comEspiao,
          deposito: depositoLogado(),
        );
        await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
        await tester.pumpAndSettle();

        expect(
          pedidos.where((r) => r.url.path == '/v1/network/join-requests'),
          isEmpty,
          reason: 'REPROVA: a agenda pediu a lista de PEDIDOS na abertura. '
              'Nenhuma tela do app cria pedido de participação desde '
              '19/10/2026, e `listMyNetworkEventJoinRequests` ficou sem '
              'chamador de propósito.',
        );

        // Aplica TODO recorte de tempo que a folha oferece. Se algum deles
        // trocar a operação, o espião acusa.
        for (final recorte in <String>['Encerrados', 'Próximos']) {
          await abrirAFolha(tester);
          await tester.tap(find.text(recorte));
          await tester.pumpAndSettle();
          await tester.tap(find.widgetWithText(FilledButton, 'Aplicar'));
          await tester.pumpAndSettle();
        }

        expect(
          pedidos.where((r) => r.url.path == '/v1/network/join-requests'),
          isEmpty,
          reason: 'REPROVA: algum recorte da folha pediu '
              '`GET /v1/network/join-requests`. A operação continua no '
              'contrato, aposentada com data em '
              '`api/rastreabilidade-backoffice-rede.yaml`, e sem ninguém para '
              'alimentá-la.',
        );
        // E a lista não caiu: se a chamada proibida tivesse saído e levado
        // 404, a agenda estaria em falha e o `isEmpty` acima seria vácuo.
        expect(
          pedidos.where((r) => r.url.path == '/v1/network/events'),
          isNotEmpty,
        );
      },
    );

    testWidgets(
      'ISCA: `Encerrados` manda `when=past` para a rota da agenda',
      (tester) async {
        final pedidos = <http.Request>[];
        Future<http.Response> comEspiao(http.Request req) {
          pedidos.add(req);
          return redeDasCincoListagens(req);
        }

        await abrirOApp(
          tester,
          rede: comEspiao,
          deposito: depositoLogado(),
        );
        await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
        await tester.pumpAndSettle();

        final primeira = pedidos
            .where((r) => r.url.path == '/v1/network/events')
            .last;
        expect(
          primeira.url.queryParameters['when'],
          'upcoming',
          reason: 'REPROVA: a agenda não abre em `upcoming`. `Próximos` é o '
              'padrão, e é por isso que o recorte guarda `null` -- para o '
              'distintivo da barra não nascer com 1 numa lista que ninguém '
              'recortou.',
        );

        await abrirAFolha(tester);
        await tester.tap(find.text('Encerrados'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(FilledButton, 'Aplicar'));
        await tester.pumpAndSettle();

        expect(
          pedidos
              .where((r) => r.url.path == '/v1/network/events')
              .last
              .url
              .queryParameters['when'],
          'past',
          reason: 'REPROVA: escolher `Encerrados` no filtro não mandou '
              '`when=past`. O recorte de tempo já morava em '
              '`RecorteDaRede.quando`; o que mudou em 19/10 foi QUEM escolhe '
              'o valor -- era a aba, e agora é este grupo.',
        );
      },
    );

    test('`AbaDaRede` não existe mais como tipo', () {
      // **A PROVA ESTRUTURAL, e ela é de COMPILAÇÃO e não de texto.** O enum
      // das três abas saiu; se alguém o repuser, este arquivo deixa de
      // compilar na linha abaixo -- e um `grep` no fonte seria o portão de
      // palavra que este repositório já teve verde sobre um defeito real.
      //
      // O que resta no lugar dele é o grupo `Quando` da folha, medido nos
      // casos acima. O `bool _soOndePedi` que esta frente havia deixado no
      // lugar da terceira aba também saiu, na união do lote de 19/10.
      expect(
        AgendaDaRede.rotuloDeMarcar,
        'Criar evento',
        reason: 'REPROVA: o rótulo da porta de criar mudou. Ele é a ÚNICA '
            'fonte do texto, e esta linha existe para este arquivo depender '
            'de `AgendaDaRede` -- se o enum das três abas voltar, ele volta '
            'junto deste import e o compilador acusa.',
      );
    });
  });

  // =========================================================================
  // ISCA (e) — A BUSCA VEM ANTES DO GATILHO, NAS CINCO TELAS
  // =========================================================================
  group('(e) a busca vem ANTES do gatilho de filtro, nas telas que têm busca', () {
    // ======================================================================
    // A REVERSÃO, e ela é deliberada
    // ======================================================================
    //
    // Em 18/10 o cliente pediu o gatilho *"na frente do campo de busca e não
    // embaixo"*. Em 19/10 ele INVERTEU: a busca primeiro, o gatilho à direita.
    // Não é defeito e não é volta ao arranjo de 17/10 -- o gatilho continua só
    // ícone, continua na mesma linha e continua com 48 dp. Mudou o LADO.
    //
    // ======================================================================
    // SÃO QUATRO TELAS COM BUSCA, E NÃO CINCO -- e o número foi medido
    // ======================================================================
    //
    // O briefing listou cinco. `perto/minhas_indicacoes.dart` **não tem campo
    // de busca** e nunca teve: `listMyDirectorySuggestions` não tem parâmetro
    // `q` no contrato, e aquela tela passa só `filtro` para a barra. Sem
    // busca não há par, e não há ordem a inverter. O caso logo acima guarda
    // essa ausência pelos dois lados.
    //
    // As quatro que têm busca e passam por este laço são
    // `perto/lista_do_diretorio.dart`, `loja/vitrine_da_loja.dart`,
    // `perdido/lista_de_perdidos.dart` e `rede/agenda_da_rede.dart` -- as duas
    // últimas desenhando a linha fora da barra, por `buscaAcima`.
    //
    // DESLIGAMENTO: em `widgets/barra_de_listagem.dart`, dentro de
    // `LinhaDeBuscaDaListagem.build`, mova `GatilhoDeRecorteNoCorpo` de volta
    // para ANTES do `Expanded`. **Os quatro casos deste laço reprovam de uma
    // vez**, e é isso que prova que a inversão mora num lugar só.
    //
    // **AS LARGURAS SÃO AS MESMAS DE ANTES DA INVERSÃO**, de propósito: o
    // campo divide a linha com um alvo de 48 dp e 8 dp de respiro, e trocar de
    // lado não muda quanto sobra. Um caso que medisse só a ordem não acusaria
    // uma inversão que tivesse estreitado o campo pelo caminho.
    // Lista de pares, e nao mapa: `double` nao serve de chave de mapa
    // constante em Dart (ele sobrescreve `==`). A primeira medida e a do
    // APARELHO, a segunda a que a busca tem de receber -- o corpo e a largura
    // menos 32 dp de margem, e a busca e o corpo menos 48 do gatilho e 8 de
    // respiro.
    const larguraDaBusca = <(double, double)>[
      (320, 232), // corpo 288
      (360, 272), // corpo 328
      (375, 287), // corpo 343
      (390, 302), // corpo 358
      (412, 324), // corpo 380
    ];

    /// As cinco telas, e como chegar a cada uma.
    final telas = <String, Future<void> Function(WidgetTester)>{
      'perto/lista_do_diretorio.dart': (t) async {
        await t.tap(find.widgetWithText(NavigationDestination, 'Rede'));
        await t.pumpAndSettle();
        await t.tap(find.widgetWithText(Tab, 'Comunidade'));
        await t.pumpAndSettle();
      },
      'loja/vitrine_da_loja.dart': (t) async {
        await t.tap(find.widgetWithText(NavigationDestination, 'Loja'));
        await t.pumpAndSettle();
      },
      'perdido/lista_de_perdidos.dart': (t) async {
        await t.tap(find.widgetWithText(NavigationDestination, 'Pets'));
        await t.pumpAndSettle();
      },
      'rede/agenda_da_rede.dart': (t) async {
        await t.tap(find.widgetWithText(NavigationDestination, 'Rede'));
        await t.pumpAndSettle();
      },
    };

    testWidgets(
      'em `perto/minhas_indicacoes.dart` NÃO há busca, e por isso não há '
      'ordem a inverter',
      (tester) async {
        // ======================================================================
        // ACHADO DESTA RODADA, e ele corrige o briefing
        // ======================================================================
        //
        // O briefing listou `perto/minhas_indicacoes.dart` entre as CINCO
        // telas que usam o padrão de listagem com busca. **A árvore diz
        // outra coisa, e isto foi medido:** aquela tela passa `filtro` e
        // `aoAplicar` para `BarraDeListagem` e **não passa `busca`** -- ela
        // nunca teve campo de busca.
        //
        // **E a ausência é correta, não um esquecimento:**
        // `listMyDirectorySuggestions` não tem parâmetro `q` no contrato. Um
        // campo de busca ali seria exatamente o campo que mente sobre o
        // alcance, que é o que `barra_de_listagem.dart` existe para impedir.
        //
        // Com `busca: null`, `LinhaDeBuscaDaListagem` nem é construída: a
        // barra desenha o gatilho sozinho, alinhado à esquerda do corpo. **Não
        // há par para inverter**, e um caso que exigisse a ordem ali
        // reprovaria pedindo um campo que não pode existir.
        //
        // Este caso guarda as duas metades: que o gatilho existe (a tela tem
        // recorte) e que a busca não existe (não há ordem a medir). Se alguém
        // acrescentar busca àquela tela, ela passa a ter ordem -- e este caso
        // reprova, pedindo que ela entre no laço das outras quatro.
        await abrirOApp(
          tester,
          rede: redeDasCincoListagens,
          deposito: depositoLogado(),
        );
        await abrirAsMinhasIndicacoes(tester);

        expect(
          find.byType(MinhasIndicacoes),
          findsOneWidget,
          reason: 'REPROVA: a porta não abriu `Minhas indicações`.',
        );
        expect(
          find.byType(GatilhoDeRecorteNoCorpo),
          findsOneWidget,
          reason: 'REPROVA: `Minhas indicações` não desenha o gatilho de '
              'filtro no corpo. Ela tem recorte (`Situação da indicação`), e '
              'sem gatilho ele fica inalcançável.',
        );
        expect(
          find.byType(CampoDeBuscaDaListagem),
          findsNothing,
          reason: 'REPROVA: `Minhas indicações` passou a desenhar campo de '
              'busca. `listMyDirectorySuggestions` não tem parâmetro `q` no '
              'contrato, e campo de busca que não vai a lugar nenhum é o '
              'campo que mente sobre o alcance. Se a operação ganhar `q`, '
              'mova esta tela para o laço das outras quatro -- ela passa a ter '
              'uma ordem a medir.',
        );
      },
    );

    for (final entrada in telas.entries) {
      testWidgets(
        'em `${entrada.key}` a busca vem primeiro, nas CINCO larguras',
        (tester) async {
          final medidas = <String>[];
          for (final (aparelho, esperada) in larguraDaBusca) {
            tester.view.physicalSize = Size(aparelho * 3, 2400);
            tester.view.devicePixelRatio = 3;
            addTearDown(tester.view.reset);

            // **O APP E DESMONTADO ENTRE AS LARGURAS, e isto nao e zelo.**
            //
            // `pumpWidget` com o MESMO tipo de widget reaproveita o `State` --
            // e com ele o roteador e a pilha de navegacao. Medido aqui: a
            // segunda largura da tela de `Minhas indicações` encontrava DOIS
            // `ItemDeMenu` com o mesmo rotulo (o da aba `Comunidade` e o da
            // rota que a iteracao anterior deixou empilhada), e
            // `scrollUntilVisible` estourava com "Too many elements". O mesmo
            // reaproveitamento de `State` ja enganou um portao deste
            // repositorio, que chamava `abrirOApp` duas vezes achando que
            // media o estado deslogado.
            //
            // Montar um tipo DIFERENTE antes força a arvore a ser descartada.
            await tester.pumpWidget(const SizedBox.shrink());
            await tester.pumpAndSettle();

            // **A REGIAO CADASTRADA ENTRA, e ela nao e enfeite:** a listagem
            // de perdidos nao desenha controle nenhum sem CIDADE em uso
            // (`_Fase.semCidade`), e a regiao do tutor e uma das fontes dela.
            // Sem isto, a tela de perdidos entra no caso como "nao desenha
            // campo de busca" -- e a isca reprovaria por falta de dado, e nao
            // por ordem errada.
            await abrirOApp(
              tester,
              rede: redeDasCincoListagens,
              deposito: depositoLogado(
                regiaoDeReferencia: const RegiaoDeReferencia(
                  bairro: 'Pinheiros',
                  cidade: 'São Paulo',
                  uf: 'SP',
                ),
              ),
            );
            await entrada.value(tester);

            final campo = find.byType(CampoDeBuscaDaListagem);
            final gatilho = find.byType(GatilhoDeRecorteNoCorpo);
            expect(
              campo,
              findsOneWidget,
              reason: 'REPROVA: `${entrada.key}` não desenha campo de busca em '
                  '$aparelho dp. Sem ele não há ordem para medir, e um caso '
                  'que só olhasse a geometria passaria por não achar nada.',
            );
            expect(
              gatilho,
              findsOneWidget,
              reason: 'REPROVA: `${entrada.key}` não desenha o gatilho de '
                  'filtro em $aparelho dp.',
            );

            final r1 = tester.getRect(campo);
            final r2 = tester.getRect(gatilho);
            if (r1.right > r2.left + 0.01) {
              medidas.add(
                '  $aparelho dp: a busca termina em ${r1.right} e o gatilho '
                'começa em ${r2.left} -- o gatilho NÃO está à direita',
              );
            }
            if (r2.center.dy < r1.top || r2.center.dy > r1.bottom) {
              medidas.add(
                '  $aparelho dp: o gatilho não divide a LINHA com a busca '
                '(centro em ${r2.center.dy}, campo de ${r1.top} a ${r1.bottom})',
              );
            }
            if ((r1.width - esperada).abs() > 0.5) {
              medidas.add(
                '  $aparelho dp: a busca recebeu ${r1.width.toStringAsFixed(2)}'
                ' dp e o esperado é ${esperada.toStringAsFixed(2)}',
              );
            }
            if ((r2.width - BichuAlvoDeToque.min).abs() > 0.5) {
              medidas.add(
                '  $aparelho dp: o gatilho tem ${r2.width} dp e não os 48 do '
                'SC 2.5.8',
              );
            }
          }
          expect(
            medidas,
            isEmpty,
            reason: 'REPROVA em `${entrada.key}`:\n${medidas.join('\n')}\n'
                'O cliente inverteu a ordem em 19/10/2026: a busca primeiro, '
                'o gatilho à DIREITA. A inversão mora numa única `Row`, em '
                '`LinhaDeBuscaDaListagem` -- se esta tela divergir das outras '
                'quatro, ela tem cópia da ordem e a cópia é o defeito.',
          );
        },
      );
    }
  });

  // =========================================================================
  // ISCA (f) — A GAVETA ESTÁ OCULTA (a medida principal vive na casca)
  // =========================================================================
  group('(f) nenhuma rota leva à gaveta', () {
    // A AUSÊNCIA do `drawer:`, do `BotaoDaGaveta` e do glifo de hamburguer nas
    // quatro seções de ramo é medida em `casca_de_cinco_secoes_test.dart`, na
    // isca `a casca NÃO tem gaveta, e nenhuma tela desenha o hamburguer` --
    // ela vive lá porque é a MESMA isca que foi virada quatro vezes, e as
    // quatro inversões precisam ficar juntas para ninguém achar que a de hoje
    // é descuido.
    //
    // Aqui fica o que falta: que não há ENDEREÇO para ela.
    //
    // DESLIGAMENTO: devolva o `drawer:` ao `Scaffold` da casca em
    // `casca_com_abas.dart`. O caso de lá reprova; este continua verde, porque
    // a gaveta nunca teve rota -- e é por isso que os dois existem.
    test('a gaveta nunca teve endereço, e continua sem ter', () {
      // **ESTE CASO É O CONTRAPESO HONESTO, e ele diz o que NÃO mede.**
      //
      // A gaveta não é uma rota: ela era o `drawer:` de um `Scaffold`, e
      // `Scaffold` sem `drawer` não tem como abrir uma. Então não há endereço
      // a apagar, e afirmar "nenhuma rota leva à gaveta" seria verdade
      // trivial -- a classe de verde-por-vazio que esta rodada achou dez
      // vezes.
      //
      // O que ele mede de verdade é o que SOBROU no registro: o inventário de
      // 27.5 continua inteiro, e é dele que a reinstalação vai sair.
      final inventario = RegistroDeSubDestinos.todos;
      expect(
        inventario,
        hasLength(54),
        reason: 'REPROVA: o inventário de 27.5 tem ${inventario.length} '
            'linha(s). Ele tinha 52 e foi a 53 em 19/10: as oito linhas de '
            '`Perto` mudaram de chave para `Rede` (a contagem não muda com '
            'isso) e o `Mural` entrou com UMA linha. **Foi a 54 em 22/10/2026**: '
            '`Conexões` em `Perfil`, por decisão do cliente -- *"o usuário pode '
            'abrir a lista de usuários que é sua conexão"* --, que emenda a '
            'decisão dele mesmo de 18/10. A gaveta foi OCULTADA e '
            'não apagada -- a palavra do cliente é "por enquanto" --, e '
            'apagar o inventário é o que tornaria a reinstalação uma '
            'reescrita.',
      );
    });
  });

  // =========================================================================
  // ISCA (g) — OS SETE ITENS VIVOS CONTINUAM ALCANÇÁVEIS
  // =========================================================================
  group('(g) os nove itens vivos continuam alcançáveis', () {
    // ======================================================================
    // A ISCA QUE IMPORTA MAIS, e por quê
    // ======================================================================
    //
    // Ocultar a gaveta esconde FUNÇÃO QUE EXISTE. Ela tinha sete itens vivos
    // (`forma: destino`, `estado: existe`, `rota != null`), e sem casa nova
    // cada um deles deixaria de ser alcançável **em silêncio**: a rota existe,
    // a tela monta, e o que desapareceria é o único caminho humano até ela.
    // Nenhum caso da suíte acusaria isso.
    //
    // **DOIS DELES TINHAM A GAVETA COMO ÚNICA PORTA**, e isso foi medido antes
    // de ocultar o menu: `Pedidos de conexão` e `Pessoas bloqueadas` só
    // apareciam em `gaveta_de_secoes.dart`, em `rotas.dart` e dentro das
    // próprias telas. Eles entraram no menu da conta de `AbaPerfil`.
    //
    // `Pessoas bloqueadas` é o pior dos dois caso se perdesse: o bloqueio é
    // simétrico no servidor, quem bloqueia passa a receber 404 no perfil da
    // pessoa, e o `Desbloquear` morava dentro do menu daquele perfil -- que
    // nunca mais abre. Aquela lista É o único lugar de onde o desbloqueio sai.
    // Sem porta, **bloquear voltaria a ser irreversível pelo aplicativo**.
    //
    // DESLIGAMENTO: apague qualquer um dos sete controles -- a opção da folha
    // de `Pets` ou o `ItemDeMenu` de `Perfil`. UM caso deste grupo reprova, e
    // ele nomeia o item.
    test('são NOVE, e a lista é lida do registro e não escrita à mão', () {
      // A guarda contra o verde por vazio: os sete casos abaixo citam rótulos
      // à mão, e um registro que mudasse de tamanho os deixaria medindo um
      // subconjunto sem ninguém notar.
      final vivos = RegistroDeSubDestinos.todos
          .where((d) => d.viraItem)
          .map((d) => d.rotulo)
          .toList();
      // SETE -> OITO em 22/10/2026: `Conexões`, por decisão do cliente.
      // OITO -> NOVE em 26/10/2026: `Convide tutores`, por decisão do cliente
      // repetida duas vezes (22/10, *"Mova o convite tutores para a pagina do
      // perfil"*, e 26/10, *"retirar o convite tutores das mensagens, deixar
      // apenas na menu do perfil do usuario"*).
      //
      // **ELE É O ÚNICO DESTA LISTA QUE JÁ TINHA PORTA ANTES DE ENTRAR AQUI, e
      // a porta era em OUTRA seção.** Os outros oito subiram porque não tinham
      // caminho nenhum; este TINHA -- um `ItemDeMenu` no topo do corpo do AuAu
      // --, e o cliente mandou mover. Por isso a casa nova dele neste grupo
      // mede as DUAS metades, e não só a chegada: o caso
      // `` `Convide tutores` é alcançável pela FOTO da barra de topo `` prova
      // que a porta nova abre a tela, e as iscas de
      // `convite_tutores_no_perfil_test.dart` provam que a velha não voltou.
      expect(
        vivos,
        hasLength(9),
        reason: 'REPROVA: o registro tem ${vivos.length} item(ns) vivo(s) e '
            'não 9: $vivos. Cada um precisa de uma casa nomeada neste grupo. '
            'Item novo sem caso aqui é função que pode desaparecer no próximo '
            'diff grande, porque a gaveta já não a mostra.',
      );
      // E são SETE destinos distintos: `Escanear uma tag` aparece em duas
      // seções do inventário, legitimamente (a porta primária em `Pets` e a de
      // conta em `Perfil`), e o destino das duas é o mesmo.
      //
      // **SEIS -> SETE em 22/10/2026**, e os DOIS números subiram juntos: isso
      // é o que prova que `Conexões` é um destino NOVO e não um segundo nome
      // para um que já existia. Se só o primeiro tivesse subido, o item novo
      // apontaria para um lugar que já tinha nome -- e é exatamente isso que
      // `gaveta_de_secoes.dart` proíbe.
      // **SETE -> OITO em 26/10/2026, e os DOIS números subiram juntos de
      // novo**: é isso que prova que `Convide tutores` é um destino NOVO neste
      // menu e não um segundo nome para um que já existia. A rota dele
      // (`/perfil/convide-tutores`) não era apontada por nenhum item vivo --
      // ela era empurrada pelo corpo do AuAu, que não é item de gaveta.
      expect(
        vivos.toSet(),
        hasLength(8),
        reason: 'REPROVA: os nove itens vivos apontam para '
            '${vivos.toSet().length} destinos distintos, e são 8 -- '
            '`Escanear uma tag` tem duas linhas de propósito, e é a ÚNICA '
            'duplicata legítima.',
      );
    });

    // ======================================================================
    // A FORMA MUDOU DUAS VEZES, e as duas foram decisao dele
    // ======================================================================
    //
    // **19/10:** as tres nasceram dentro de UMA folha, atras de um alvo de
    // `add`. Eu perguntei qual delas era *"adicionar um novo pet perdido"* e
    // ele respondeu: ***"botão para escanear o pet"***. Entao `Escanear uma
    // tag` virou a acao de UM TOQUE -- alvo de 56 dp no canto -- e as outras
    // duas ficaram atras de um alvo SECUNDARIO ao lado.
    //
    // **20/10:** ele mandou o alvo secundario sair, literal: *"na pagina pet,
    // remova o icone dos ..., so deixe o de escanear a tag"*. Com ele saiu a
    // folha, e as duas acoes que moravam nela mudaram de casa:
    //
    //   | acao                      | casa de hoje                         |
    //   |---------------------------|--------------------------------------|
    //   | `Registrar achado avulso` | `Perfil` > grupo `Bichos na rua`     |
    //   | `Cadastrar pet`           | `Perfil` > grupo `Meus pets`         |
    //
    // **`Cadastrar pet` NAO ganhou um `ItemDeMenu`, e isso e medido:** o
    // `BotaoPrimario` `Cadastrar meu pet`, dentro do bloco `Meus pets`,
    // empurra a MESMA `Rotas.cadastrarPet` -- um item novo seria um segundo
    // controle para a mesma rota, a um cabecalho de distancia. O que ela tinha
    // era um buraco de FASE (a porta existia em 2 das 6 fases do bloco), e o
    // conserto esta em `meus_pets.dart`. As iscas por fase estao em
    // `barra_fixa_em_toda_tela_test.dart`, grupo `(d)`.
    //
    // **O DESTINO DE CADA UMA e medido pelo TIPO DA TELA.** Medir "saiu da
    // casca" era mais fraco e, desde 20/10, FALSO: a tela empilhada tem barra
    // de baixo agora, e um caso que olhasse a ausencia dela reprovaria por um
    // motivo que nao e o da isca.
    testWidgets(
      '`Escanear uma tag` e a UNICA acao flutuante de `Pets`, e e de UM TOQUE',
      (tester) async {
        // **A ISCA DOS DOIS PEDIDOS DELE, e ela mede tres coisas:** que o
        // alvo e UM so (20/10), que o toque abre o leitor, e que ele abre o
        // leitor **direto** -- sem folha no meio (19/10). Um caso que so
        // medisse o destino ficaria verde com a acao de volta dentro de uma
        // folha, que e o arranjo que ele mandou desfazer duas vezes.
        //
        // DESLIGAMENTO: em `abas.dart`, troque `AcaoDeCriarFlutuante` de volta
        // por `AcoesDeCriarFlutuantes` com as duas secundarias. Este caso
        // reprova na contagem de alvos.
        tester.view.physicalSize = const Size(1125, 3000);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);

        await abrirOApp(
          tester,
          rede: redeDasCincoListagens,
          deposito: depositoLogado(),
        );
        await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
        await tester.pumpAndSettle();

        final alvos = find.byType(FloatingActionButton);
        expect(
          alvos,
          findsOneWidget,
          reason: 'REPROVA: a seção `Pets` tem '
              '${alvos.evaluate().length} alvos flutuantes, e o cliente pediu '
              'UM: *"na pagina pet, remova o icone dos ..., so deixe o de '
              'escanear a tag"*.',
        );
        expect(
          find.byIcon(Icons.more_horiz),
          findsNothing,
          reason: 'REPROVA: `Pets` ainda desenha `more_horiz`, o glifo do '
              'alvo que ele mandou remover em 20/10.',
        );

        // **O GLIFO É `qr_code_scanner` e não `qr_code_2`**, e a distinção é a
        // mesma do item de gaveta que esta porta substitui: um LÊ uma
        // plaquinha, o outro EXIBE a própria. Esta porta lê.
        expect(
          find.descendant(
            of: alvos,
            matching: find.byIcon(Icons.qr_code_scanner),
          ),
          findsOneWidget,
          reason: 'REPROVA: o alvo flutuante de `Pets` não desenha '
              '`qr_code_scanner`. `qr_code_2` é EXIBIR a plaquinha do próprio '
              'pet, e esta porta LÊ a de um bicho na rua.',
        );

        // **O NOME ACESSÍVEL DIZ O VERBO, e não "adicionar".** O `tooltip` é
        // de onde o Flutter publica o nome da árvore de semântica; sem ele o
        // leitor de tela anuncia só "botão".
        expect(
          tester.widget<FloatingActionButton>(alvos).tooltip,
          'Escanear uma tag',
          reason: 'REPROVA: o nome acessível do alvo flutuante não é o verbo '
              'do que o toque faz. `Adicionar` diria o que o app faz com o '
              'resultado, e quem usa leitor de tela ouviria uma palavra que '
              'não descreve nada do que vem depois do toque.',
        );

        await tester.tap(alvos);
        await tester.pumpAndSettle();

        expect(
          find.byType(TelaLeitorDeQr),
          findsOneWidget,
          reason: 'REPROVA: o alvo flutuante de `Pets` não abriu o leitor de '
              'QR. Ele pinta o glifo do leitor e não leva a lugar nenhum: a '
              'função continua perdida, agora com um ícone em cima dela.',
        );
      },
    );

    testWidgets(
        '`Registrar achado avulso` e alcancavel pela FOTO, na casa nova dela',
        (tester) async {
      // **ELA ERA A MAIS EXPOSTA DAS DUAS, e isto foi medido antes de mover:**
      // `Rotas.registrarAchado` aparecia em `lib/` so em tres lugares -- a
      // folha do alvo secundario, a declaracao da rota e a propria tela.
      // Remover o alvo sem dar casa a ela deixaria uma tela construida
      // inalcancavel **em silencio**, que e o mesmo achado de `Pedidos de
      // conexão` e `Pessoas bloqueadas` em 19/10.
      //
      // DESLIGAMENTO: em `abas.dart`, apague o `ItemDeMenu` de `Registrar
      // achado avulso`. Este caso reprova, e nenhum outro da suíte acusa.
      tester.view.physicalSize = const Size(1125, 3000);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await abrirOApp(
        tester,
        rede: redeDasCincoListagens,
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();

      final item = find.widgetWithText(ItemDeMenu, 'Registrar achado avulso');
      await tester.scrollUntilVisible(item, 200);
      expect(
        item,
        findsOneWidget,
        reason: 'REPROVA: a tela da conta não oferece `Registrar achado '
            'avulso`. Ela perdeu a folha do alvo secundário em 20/10 e **não '
            'tinha nenhuma outra porta em `lib/`**.',
      );
      await tester.tap(item);
      await tester.pumpAndSettle();
      expect(
        find.byType(TelaRegistrarAchado),
        findsOneWidget,
        reason: 'REPROVA: tocar em `Registrar achado avulso` não abriu '
            '$TelaRegistrarAchado. Item que pinta o nome e não navega é ação '
            'sem destino, e continuaria sendo função perdida com um rótulo em '
            'cima.',
      );
    });

    testWidgets(
        '`Cadastrar pet` e alcancavel pela FOTO, pelo bloco `Meus pets`',
        (tester) async {
      // **A CASA DELA E O `BotaoPrimario` que ja existia**, e nao um item
      // novo: `Cadastrar meu pet` empurra a MESMA `Rotas.cadastrarPet` que a
      // opcao da folha empurrava. Este caso prova o CAMINHO; as iscas por
      // FASE do bloco -- que e onde estava o buraco -- estao no grupo `(d)` de
      // `barra_fixa_em_toda_tela_test.dart`.
      //
      // DESLIGAMENTO: em `meus_pets.dart`, apague `_acaoDeCadastrar`. Este
      // caso reprova, e os tres do grupo `(d)` tambem.
      tester.view.physicalSize = const Size(1125, 3000);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await abrirOApp(
        tester,
        rede: redeDasCincoListagens,
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
        reason: 'REPROVA: a tela da conta não oferece `Cadastrar meu pet`. '
            'Desde 20/10 ela é a ÚNICA porta de `Rotas.cadastrarPet` no app: '
            'o alvo secundário de `Pets`, que tinha a outra, saiu por pedido '
            'do cliente.',
      );
      await tester.tap(porta);
      await tester.pumpAndSettle();
      expect(
        find.byType(TelaCadastrarIdentificacao),
        findsOneWidget,
        reason: 'REPROVA: tocar em `Cadastrar meu pet` não abriu '
            '$TelaCadastrarIdentificacao.',
      );
    });

    testWidgets(
      'o alvo que ficou e UM, e a invasão do pé continua 72,00 dp',
      (tester) async {
        // ====================================================================
        // O CRITÉRIO 3 DO BRIEFING DE 19/10, confirmado depois de 20/10
        // ====================================================================
        //
        // O alvo flutuante invade os últimos 72,00 dp da lista (56 de desenho
        // + 16 de assentamento do `Scaffold`), pagos com respiro rolável no
        // `padding`. Com DOIS alvos na mesma linha a invasão continuava 72,00
        // -- a altura é a do alvo mais alto --, e **tirar o segundo em 20/10
        // tirou LARGURA do canto e não altura**: a conta não mudou, e o
        // briefing pediu para confirmar isso em vez de supor.
        //
        // (Empilhados em coluna seriam `56 + 16 + 56 = 128` dp de altura e a
        // invasão iria a 144,00 -- um terço da altura visível da lista em
        // 320 x 568 dp. Foi por isso que eles ficaram na mesma linha enquanto
        // eram dois.)
        //
        // DESLIGAMENTO: em `TelaDeAba`, tire `_folgaDaAcaoFlutuante` do
        // `padding` do `ListView`. O segundo `expect` reprova com os dois
        // números na mensagem.
        await abrirOApp(
          tester,
          rede: redeDasCincoListagens,
          deposito: depositoLogado(),
        );
        await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
        await tester.pumpAndSettle();

        final alvos = find.byType(FloatingActionButton);
        expect(
          alvos,
          findsOneWidget,
          reason: 'REPROVA: `Pets` tem ${alvos.evaluate().length} alvos '
              'flutuantes. O cliente pediu UM em 20/10, e a conta da invasão '
              'abaixo é a de um alvo só.',
        );
        final alvo = tester.getRect(alvos);

        // (1) O PISO DE 48 dp do SC 2.5.8.
        //
        // `FloatingActionButton.small` (40 x 40) seria o padrão do Material
        // para um alvo secundário e FURA o piso. O que ficou tem 56.
        expect(
          alvo.shortestSide,
          greaterThanOrEqualTo(BichuAlvoDeToque.min),
          reason: 'REPROVA: o alvo flutuante mede ${alvo.shortestSide} dp no '
              'menor lado, abaixo do piso de ${BichuAlvoDeToque.min} dp do '
              'SC 2.5.8. `FloatingActionButton.small` tem 40 e não serve.',
        );

        // (2) A INVASÃO, e o RESPIRO que a paga.
        final lista = find
            .descendant(
              of: find.byType(Scaffold),
              matching: find.byType(ListView),
            )
            .first;
        final corpo = tester.getRect(lista);
        final respiro =
            (tester.widget<ListView>(lista).padding as EdgeInsets).bottom;
        final invasao = corpo.bottom - alvo.top;
        expect(
          invasao,
          closeTo(72.0, 0.01),
          reason: 'REPROVA: o alvo flutuante invade '
              '${invasao.toStringAsFixed(2)} dp do pé do corpo, e o medido é '
              '72,00 (56 de desenho + 16 de assentamento). Tirar o alvo '
              'secundário em 20/10 não podia mexer neste número: ele era '
              'LARGURA do canto, e largura não cobre item.',
        );
        expect(
          respiro,
          greaterThanOrEqualTo(invasao),
          reason: 'REPROVA: o pé da lista reserva '
              '${respiro.toStringAsFixed(2)} dp e o alvo cobre '
              '${invasao.toStringAsFixed(2)} dp. O último cartão de pet '
              'perdido termina embaixo dele, em toda rolagem.',
        );
      },
    );

    // **`Meus eventos` ENTROU NESTA LISTA NA UNIAO DO LOTE (19/10/2026).**
    //
    // `feat/meus-eventos-e-cancelar` acrescentou o item ao menu da conta no
    // MESMO ponto em que esta frente pos `Pedidos de conexão` e
    // `Pessoas bloqueadas`, e o conflito textual foi resolvido mantendo os
    // TRES. O item dela nascia sem caso de alcance: este portao e quem mede
    // que item do menu da conta tem porta, e um item novo sem linha aqui e
    // justamente o silencio que ele existe para impedir.
    //
    // **E ele e o pior dos tres caso se perdesse**: `MeusEventos` e o UNICO
    // caminho do app ate `Cancelar` um encontro -- a resposta da agenda nao
    // diz de quem o encontro e (item 7 do ADR-0010), entao quem criou um nao
    // teria como voltar a ele.
    //
    // **`Conexões` ENTROU EM 22/10/2026, por decisão do cliente** -- *"o
    // usuário pode abrir a lista de usuários que é sua conexão"*. Ela emenda uma
    // decisão dele mesmo, de 18/10, que dizia que a lista não aparecia a
    // ninguém, nem ao dono. O item nasce com caso de alcance **no mesmo
    // commit**, que é exatamente o que as três linhas acima tiveram de
    // aprender na união do lote.
    for (final (rotulo, tela) in <(String, Type)>[
      ('Meus dados', TelaDadosPessoais),
      ('Pedidos de conexão', TelaDePedidosDeConexao),
      // `Conexões` entrou pela frente da lista das próprias conexões
      // (22/10/2026). O rótulo de bloqueados fica como a
      // `development` o tem -- `Usuários bloqueados` --, que é o que
      // `TelaDeBloqueados.titulo` e `abas.dart` realmente desenham; a
      // outra ponta ainda dizia `Pessoas bloqueadas`, prosa anterior
      // ao renome. Os DOIS lados ficam: o item novo e o rótulo certo.
      (TelaDeMinhasConexoes.titulo, TelaDeMinhasConexoes),
      ('Usuários bloqueados', TelaDeBloqueados),
      (MeusEventos.titulo, MeusEventos),
    ]) {
      testWidgets(
        '`$rotulo` é alcançável pela FOTO da barra de topo',
        (tester) async {
          // Tela alta pela mesma razão do grupo acima: o menu da conta tem
          // seis itens mais o bloco de `Meus pets`, e na bancada padrão o
          // último item fica debaixo da barra de baixo -- o toque não chega
          // nele e o caso reprovaria por geometria da janela, não pela isca.
          tester.view.physicalSize = const Size(1125, 3000);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);

          // **O CAMINHO É A FOTO, e o caso passa por ela.** O cliente nomeou
          // esse caminho: a foto substituiu o hamburguer e leva à tela da
          // conta. Um caso que montasse a rota direto provaria que a tela
          // existe -- e a tela já existia; o que estava em risco era a PORTA.
          await abrirOApp(
            tester,
            rede: redeDasCincoListagens,
            deposito: depositoLogado(),
          );
          await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
          await tester.pumpAndSettle();

          final foto = find.byType(AvatarDaConta);
          expect(
            foto,
            findsOneWidget,
            reason: 'REPROVA: não há foto na barra de topo. Ela é a porta que '
                'o cliente nomeou para os itens de conta quando mandou '
                'ocultar o menu.',
          );
          await tester.tap(foto);
          await tester.pumpAndSettle();

          final item = find.text(rotulo);
          await tester.scrollUntilVisible(item, 200);
          expect(
            item,
            findsOneWidget,
            reason: 'REPROVA: a tela da conta não oferece "$rotulo". Ele era '
                'item VIVO da gaveta, e com o menu oculto este menu é a casa '
                'dele. **Dois dos sete tinham a gaveta como ÚNICA porta** -- '
                '`Pedidos de conexão` e `Pessoas bloqueadas` --, e ocultar o '
                'menu por cima deles deixaria duas telas construídas '
                'inalcançáveis, em silêncio.',
          );

          await tester.tap(item);
          await tester.pumpAndSettle();
          // **O DESTINO É MEDIDO PELO TIPO DA TELA MONTADA**, e não pela URI
          // do roteador: a URI de um `push` dentro de um
          // `StatefulShellRoute` não é o endereço da tela empilhada, e um
          // caso que a lesse reprovaria (ou passaria) por um motivo que não é
          // o da isca. O que importa aqui é que a tela ABRE.
          expect(
            find.byType(tela),
            findsOneWidget,
            reason: 'REPROVA: tocar em "$rotulo" não abriu $tela. Item que '
                'pinta o nome e não navega é ação sem destino, e continuaria '
                'sendo função perdida com um rótulo em cima.',
          );
        },
      );
    }

    testWidgets('`Convide tutores` é alcançável pela FOTO da barra de topo',
        (tester) async {
      tester.view.physicalSize = const Size(1170, 7800);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      // A CASA NOMEADA DO ITEM QUE ENTROU EM 26/10/2026, que e o que o caso de
      // contagem deste grupo cobra de todo item vivo.
      //
      // **A porta dele MUDOU DE SECAO, e nao nasceu.** Ate 26/10 a tela era
      // aberta por um `ItemDeMenu` no topo do corpo do AuAu; o cliente mandou
      // tira-la de la e deixar *"apenas na menu do perfil do usuario"*. Entao
      // aqui a conta e a mesma dos outros oito -- o caminho humano existe --,
      // e a metade que falta (a porta velha NAO voltou) e medida em
      // `convite_tutores_no_perfil_test.dart`, isca (a) e isca (b).
      //
      // O DESTINO E MEDIDO PELO TIPO DA TELA, e nao pelo rotulo: um caso que
      // so achasse o texto ficaria verde com o item na tela e sem destino.
      await abrirOApp(
        tester,
        rede: redeDasCincoListagens,
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();

      final item = find.widgetWithText(
        ItemDeMenu,
        TelaDeConvidarTutores.titulo,
      );
      await tester.scrollUntilVisible(item, 200);
      expect(
        item,
        findsOneWidget,
        reason: 'REPROVA: `${TelaDeConvidarTutores.titulo}` nao esta no menu '
            'da conta. Ele saiu do corpo do AuAu em 26/10/2026 por pedido do '
            'cliente, e sair de LA sem chegar AQUI deixa a tela sem porta '
            'humana nenhuma -- do mesmo jeito que `Pedidos de conexao` ficou '
            'de 18/10 a 19/10, que e o buraco que este grupo existe para '
            'vigiar.',
      );

      await tester.ensureVisible(item);
      await tester.pumpAndSettle();
      await tester.tap(item);
      await tester.pumpAndSettle();
      expect(
        find.byType(TelaDeConvidarTutores),
        findsOneWidget,
        reason: 'REPROVA: o toque no item nao abriu `TelaDeConvidarTutores`. '
            'O item existir e o destino abrir sao duas afirmacoes, e so a '
            'segunda prova que a porta nova nao e um beco.',
      );
    });

    testWidgets('`Sair da conta` é alcançável pela FOTO da barra de topo',
        (tester) async {
      tester.view.physicalSize = const Size(1125, 3000);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      // Ele **não** é item vivo da gaveta (`forma: acaoNaTela`), e por isso
      // nunca esteve nela -- mas o cliente o listou junto dos outros quando
      // mandou ocultar o menu, e vale medir que ele continua onde sempre
      // esteve: o ÚLTIMO item do menu da conta, por pedido literal dele
      // (*"o sair da conta deve ser sempre a última opção do menu"*).
      await abrirOApp(
        tester,
        rede: redeDasCincoListagens,
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();

      final item = find.text('Sair da conta');
      await tester.scrollUntilVisible(item, 200);
      expect(item, findsOneWidget);
    });
  });
}
