// `Minhas indicações`: os TRÊS estados, e o que cada um promete.
//
// Pedido literal do cliente em 18/10/2026: *"e a aba de minhas indicações, com
// o status se está pendente ou se já foi aprovado pelo administrador?"*.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante que
// o produz.** Essa é a regra de `perto_com_dados_test.dart`, e ela nasceu de
// três testes que passavam com a tela mostrando qualquer coisa: trocar a
// constante trocava os dois lados. Aqui o esperado está escrito por extenso,
// com acento e pontuação, e trocar a microcopy reprova -- que é o ponto.
//
// AS ISCAS, e cada uma com o contrapeso que reprova se a proteção sair:
//
// 1. **A aprovada em RASCUNHO não oferece `Ver no Perto`.** Contrapeso: a
//    aprovada publicada oferece. Sem ele, uma tela que nunca desenhasse o botão
//    passaria no primeiro caso.
// 2. **A recusada mostra o motivo.** Contrapeso: pendente e aprovada não
//    mostram linha de motivo nenhuma.
// 3. **A lista vazia não fica em branco, e é UMA LINHA.** Contrapeso: conta o
//    texto na tela, para um parágrafo de apoio reprovar -- o cliente mandou
//    removê-los em 18/10.
// 4. **O filtro é do SERVIDOR.** Contrapeso: a URL pedida tem de levar `state`;
//    um filtro aplicado na página carregada não mandaria nada e passaria num
//    teste que só olhasse a lista.

import 'dart:convert';

import 'package:bichu/telas/perto/tela_de_minhas_indicacoes.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:bichu/telas/rede/secao_da_rede.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/perto/minhas_indicacoes.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A massa, no formato exato do contrato
// ---------------------------------------------------------------------------

/// Uma indicação como `MyDirectorySuggestion` a declara.
///
/// **Sem `id`**: o endereçamento é por `reference` (ADR-0010 item 6). Um teste
/// que passasse `id` aqui exercitaria um contrato que não existe.
///
/// **Sem `note`**: o recado é para quem revisa, e esta projeção não o devolve.
Map<String, dynamic> indicacaoDoContrato({
  String reference = 'u7YkQwE2tLm9ZpR4sAbC',
  String displayName = 'Clínica Santa Bárbara',
  String kind = 'clinic',
  String city = 'São Paulo',
  String state = 'SP',
  String? neighborhood = 'Pinheiros',
  String contactKind = 'phone',
  String contactValue = '+551130612200',
  String reviewStatus = 'pending',
  String createdAt = '2026-10-17T12:00:00.000Z',
  String? decidedAt,
  String? declineReason,
  String? entrySlug,
}) {
  return <String, dynamic>{
    'reference': reference,
    'display_name': displayName,
    'kind': kind,
    'city': city,
    'state': state,
    'neighborhood': neighborhood,
    'public_contact': <String, dynamic>{
      'kind': contactKind,
      'value': contactValue,
    },
    'review_status': reviewStatus,
    'created_at': createdAt,
    'decided_at': decidedAt,
    'decline_reason': declineReason,
    'entry_slug': entrySlug,
  };
}

/// A resposta de `MyDirectorySuggestionPage`.
///
/// **Sem `pending_total`**: aquele número é o aviso do menu do painel, e não
/// tem sentido na tela de quem indicou.
Map<String, dynamic> paginaDoContrato(
  List<Map<String, dynamic>> itens, {
  int? total,
  int pagina = 1,
  int limite = 20,
}) {
  return <String, dynamic>{
    'items': itens,
    'page': pagina,
    'limit': limite,
    'total': total ?? itens.length,
  };
}

/// A rede que atende `GET /v1/directory/suggestions` e **404 em qualquer outra
/// rota**.
///
/// 404 no resto, e não 200 vazio: um caso que dependesse de uma chamada não
/// declarada aqui precisa falhar alto, e não passar por acidente.
Future<http.Response> Function(http.Request) redeDasIndicacoes(
  Map<String, dynamic> corpo, {
  List<Uri>? urls,
  int status = 200,
}) {
  return (req) async {
    if (req.url.path == '/v1/directory/suggestions' && req.method == 'GET') {
      urls?.add(req.url);
      return http.Response(
        json.encode(corpo),
        status,
        headers: const <String, String>{
          'content-type': 'application/json; charset=utf-8',
        },
      );
    }
    return http.Response(
      json.encode(const <String, dynamic>{
        'type': 'https://api.bichu.test/problems/not-found',
        'title': 'Não encontrado',
        'status': 404,
      }),
      404,
      headers: const <String, String>{
        'content-type': 'application/problem+json; charset=utf-8',
      },
    );
  };
}

/// Abre `Minhas indicações` **pelo caminho que a pessoa tem**: a porta no pé
/// da aba `Comunidade` da seção `Rede`.
///
/// ## O CAMINHO MUDOU EM 19/10/2026, e o motivo é medido
///
/// Era a segunda ABA da seção `Perto`. `Perto` deixou de ser seção -- o
/// conteúdo dela virou a aba `Comunidade` da `Rede` --, e as cinco abas
/// antigas tiveram de caber em duas mais filtro. Três couberam no filtro
/// porque a entidade não muda; esta **não cabe**: uma indicação em análise
/// ainda não é um local do diretório, e filtrar a lista de locais por "as que
/// eu indiquei" devolveria **zero** justamente no caso que interessa.
///
/// Então ela virou **porta**, e agora ela TEM rota (`Rotas.minhasIndicacoes`).
///
/// **Este helper continua navegando pela porta e não pela rota**, e isso é
/// deliberado: a porta de entrada é parte da entrega, e uma lista que só o
/// roteador alcança é uma lista que o cliente não acha -- o defeito que esta
/// rodada mediu em `Pedidos de conexão` e `Pessoas bloqueadas`.
Future<void> abrirMinhasIndicacoes(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
}) async {
  await abrirOApp(tester, rede: rede, deposito: depositoLogado());
  await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
  await tester.pumpAndSettle();

  final abaDaComunidade =
      find.widgetWithText(Tab, AbaDaSecaoRede.comunidade.rotulo);
  expect(
    abaDaComunidade,
    findsOneWidget,
    reason: 'REPROVA: não há aba `Comunidade` na seção `Rede`. É ela que '
        'absorveu a seção `Perto`, e é no pé dela que mora a porta de '
        '`Minhas indicações`.',
  );
  await tester.tap(abaDaComunidade);
  await tester.pumpAndSettle();
  // **A agenda SAI de cena, e isto não é detalhe de estilo:** as duas listas
  // publicam o ícone de filtrar no mesmo slot da casca, e com as duas montadas
  // o ícone da barra abriria o filtro da aba de trás.
  expect(
    find.byType(ListaDoDiretorio),
    findsOneWidget,
    reason: 'REPROVA: tocar na aba `Comunidade` não montou a lista do '
        'diretório.',
  );

  final porta = find.widgetWithText(
    ItemDeMenu,
    SecaoDaRede.rotuloDasMinhasIndicacoes,
  );
  // `ensureVisible` e nao `scrollUntilVisible`: com a `TabBar` rolavel da
  // `Rede` ha DOIS rolaveis na tela, e `scrollUntilVisible` sem `scrollable:`
  // exige um so (`Bad state: Too many elements`). `ensureVisible` acha o
  // rolavel ancestral do alvo.
  await tester.ensureVisible(porta);
  await tester.pumpAndSettle();
  expect(
    porta,
    findsOneWidget,
    reason: 'REPROVA: não há porta `Minhas indicações` no pé da aba '
        '`Comunidade`. Com a aba virando porta, ela é o ÚNICO caminho humano '
        'até a lista -- a rota existe, mas rota não é porta.',
  );
  await tester.tap(porta);
  await tester.pumpAndSettle();
  expect(
    find.byType(MinhasIndicacoes),
    findsOneWidget,
    reason: 'REPROVA: tocar na porta `Minhas indicações` não montou o corpo '
        'dela.',
  );
  // A tela é EMPILHADA e tem saída: sem `Voltar` ela seria um beco, e é por
  // isso que ela não é ramo da casca.
  expect(
    find.byType(BackButton),
    findsOneWidget,
    reason: 'REPROVA: a tela de `Minhas indicações` não tem `Voltar`. Ela é '
        'empilhada de propósito -- como ramo, o slot da esquerda seria a foto '
        'da conta e a saída desapareceria.',
  );
}

/// Os textos de motivo visíveis na tela.
List<String> motivosNaTela() {
  return find
      .byType(Text)
      .evaluate()
      .map((e) => (e.widget as Text).data ?? '')
      .where((t) => t.startsWith('Motivo: '))
      .toList();
}

void main() {
  group('a porta no pé da aba `Comunidade`', () {
    testWidgets('a `Rede` tem DUAS abas, `Eventos` primeiro', (tester) async {
      // `Eventos` é a primeira e a principal: é o conteúdo histórico da seção
      // e é onde o arranque do app abre. `Comunidade` é o que era `Perto`.
      await abrirOApp(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(const <Map<String, dynamic>>[]),
        ),
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();

      // Do `Text` DENTRO da aba, e nao de `Tab.text`: as abas da `Rede`
      // ganharam glifo em 22/10/2026 e passam rotulo e glifo num `child:`.
      final rotulos = find
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
          .toList();
      expect(
        rotulos,
        <String>[
          AbaDaSecaoRede.eventos.rotulo,
          AbaDaSecaoRede.comunidade.rotulo,
          AbaDaSecaoRede.usuarios.rotulo,
        ],
        reason: 'REPROVA: as abas da `Rede` não são as três de 21/10/2026, '
            'nesta ordem. As TRÊS abas antigas da agenda (`Próximos`, `Meus '
            'pedidos`, `Encerrados`) viraram FILTRO, as duas que sobraram são '
            'as duas seções que foram reunidas, e `Usuários` entrou com a '
            'busca de pessoas.',
      );
    });

    testWidgets(
      'ISCA: SEM CONTA a porta não aparece, e não fica desabilitada',
      (tester) async {
        // Sem conta não existe "minhas indicações": a rota responderia 401, e
        // uma porta cujo desfecho é uma recusa é controle sem desfecho.
        //
        // PARA DESLIGAR E VER REPROVAR: em `rede/secao_da_rede.dart`, no
        // `_corpoDaAba` da aba `comunidade`, troque `if (logado)` por
        // `if (true)`.
        await abrirOApp(
          tester,
          rede: redeDasIndicacoes(
            paginaDoContrato(const <Map<String, dynamic>>[]),
          ),
          // SEM `deposito`: ninguém logado.
        );
        await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
        await tester.pumpAndSettle();
        await tester
            .tap(find.widgetWithText(Tab, AbaDaSecaoRede.comunidade.rotulo));
        await tester.pumpAndSettle();

        expect(
          find.widgetWithText(
            ItemDeMenu,
            SecaoDaRede.rotuloDasMinhasIndicacoes,
          ),
          findsNothing,
          reason: 'REPROVA: a porta `Minhas indicações` aparece para quem não '
              'tem conta. Não há o que listar, e a rota responderia 401.',
        );
        // **AS DUAS ABAS CONTINUAM**, e isso é diferente das abas antigas:
        // `Eventos` e `Comunidade` não são listas "minhas", então nenhuma
        // aparece e desaparece com a sessão. Esconder a porta não esconde a
        // seção.
        expect(find.byType(TabBar), findsOneWidget);
        expect(find.byType(ListaDoDiretorio), findsOneWidget);
      },
    );

    testWidgets('a porta NÃO mostra contagem de pendentes', (tester) async {
      // A ausência é decisão: o número só existiria honesto vindo do servidor
      // e passando pelo predicado de conta desabilitada, e ele responderia
      // "quanto trabalho está esperando" -- a pergunta do PAINEL, não da
      // pessoa. `MyDirectorySuggestionPage` não traz `pending_total` por isso.
      //
      // **O caso mede a PORTA e não a aba**, e o texto medido é o mesmo: com a
      // aba virando porta, um número no rótulo seria o mesmo defeito no mesmo
      // lugar da tela.
      await abrirOApp(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(<Map<String, dynamic>>[
            indicacaoDoContrato(reference: 'aPendenteDaContaUm0001'),
            indicacaoDoContrato(reference: 'bPendenteDaContaUm0001'),
          ], total: 2),
        ),
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();
      await tester
          .tap(find.widgetWithText(Tab, AbaDaSecaoRede.comunidade.rotulo));
      await tester.pumpAndSettle();

      final porta = find.widgetWithText(
        ItemDeMenu,
        SecaoDaRede.rotuloDasMinhasIndicacoes,
      );
      // `ensureVisible` e nao `scrollUntilVisible`: com a `TabBar` rolavel da
      // `Rede` ha DOIS rolaveis na tela, e `scrollUntilVisible` sem
      // `scrollable:` exige um so (`Bad state: Too many elements`).
      await tester.ensureVisible(porta);
      await tester.pumpAndSettle();
      final rotulos = find
          .descendant(of: porta, matching: find.byType(Text))
          .evaluate()
          .map((e) => (e.widget as Text).data ?? '')
          .where((t) => t.isNotEmpty)
          .toList();
      expect(
        rotulos,
        <String>[SecaoDaRede.rotuloDasMinhasIndicacoes],
        reason: 'REPROVA: a porta `Minhas indicações` pinta mais que o próprio '
            'rótulo -- um número, ou uma linha de apoio. Contagem só existiria '
            'honesta vindo do servidor com o predicado de conta desabilitada, '
            'e ela responde a pergunta do painel. Pintado: $rotulos',
      );
    });

    testWidgets(
      'a tela tem o título da porta, e é a MESMA palavra nos três lugares',
      (tester) async {
        // Aba, porta e título: quem procurava a aba acha a porta e a tela pelo
        // mesmo texto. Três literais soltos divergiriam na primeira redação.
        expect(
          TelaDeMinhasIndicacoes.titulo,
          SecaoDaRede.rotuloDasMinhasIndicacoes,
          reason: 'REPROVA: o título da tela e o rótulo da porta divergiram. '
              'Quem usava a aba `Minhas indicações` acha a função pelo texto, '
              'e um nome novo faria a função parecer removida em vez de '
              'mudada de lugar.',
        );

        await abrirMinhasIndicacoes(
          tester,
          rede: redeDasIndicacoes(
            paginaDoContrato(const <Map<String, dynamic>>[]),
          ),
        );
        expect(
          find.descendant(
            of: find.byType(AppBar),
            matching: find.text(TelaDeMinhasIndicacoes.titulo),
          ),
          findsOneWidget,
        );
      },
    );
  });

  group('Minhas indicações — os três estados', () {
    testWidgets('pendente diz `Em análise` e não oferece ação', (tester) async {
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(<Map<String, dynamic>>[indicacaoDoContrato()]),
        ),
      );

      expect(find.text('Clínica Santa Bárbara'), findsOneWidget);
      expect(find.text('Em análise'), findsOneWidget);
      // Não há o que fazer com uma pendente, e o contrato não tem retirada:
      // um botão aqui seria toque sem desfecho.
      expect(find.text('Ver no Perto'), findsNothing);
      expect(motivosNaTela(), isEmpty);
    });

    testWidgets('aprovada COM entrada publicada leva ao local no Perto',
        (tester) async {
      // O CONTRAPESO da isca 1: sem este caso, uma tela que nunca desenhasse
      // `Ver no Perto` passaria no caso do rascunho.
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(<Map<String, dynamic>>[
            indicacaoDoContrato(
              reviewStatus: 'approved',
              decidedAt: '2026-10-18T09:30:00.000Z',
              entrySlug: 'clinica-santa-barbara',
            ),
          ]),
        ),
      );

      expect(find.text('Aprovada'), findsOneWidget);
      expect(find.text('Ver no Perto'), findsOneWidget);
      // E não diz que está fora do ar, porque ela está no ar.
      expect(find.text('Ainda não está no Perto.'), findsNothing);
    });

    testWidgets(
        'ISCA: aprovada em RASCUNHO não promete link, e diz por que com palavras',
        (tester) async {
      // Entrada nascida de indicação com contato de site nasce rascunho (sem
      // telefone, que é o canal único do diretório), e o `Perto` só lista o
      // publicado. O servidor manda `entry_slug: null`, e a tela NÃO pode
      // inventar endereço.
      //
      // PARA DESLIGAR E VER REPROVAR: em `minhas_indicacoes.dart`, troque a
      // guarda `if (indicacao.levaAoPerto)` do botão por `if (indicacao.estado
      // == EstadoDaSugestao.approved)`. O botão volta a aparecer e este caso
      // reprova.
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(<Map<String, dynamic>>[
            indicacaoDoContrato(
              reviewStatus: 'approved',
              decidedAt: '2026-10-18T09:30:00.000Z',
              contactKind: 'website',
              contactValue: 'https://clinica.example',
              entrySlug: null,
            ),
          ]),
        ),
      );

      expect(find.text('Aprovada'), findsOneWidget);
      expect(
        find.text('Ver no Perto'),
        findsNothing,
        reason: 'REPROVA: a tela oferece `Ver no Perto` para uma entrada que '
            'não está publicada -- o toque levaria a uma página que não está '
            'no `Perto`.',
      );
      // E não cala: a ausência do botão não explica nada por si.
      expect(find.text('Ainda não está no Perto.'), findsOneWidget);
    });

    testWidgets('ISCA: recusada mostra o motivo escrito pelo administrador',
        (tester) async {
      // O motivo passou a chegar a quem indicou em 18/10/2026, revertendo o
      // que o contrato dizia antes.
      //
      // PARA DESLIGAR E VER REPROVAR: em `minhas_indicacoes.dart`, apague o
      // bloco `if (indicacao.motivoDaRecusa != null)` do cartão.
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(<Map<String, dynamic>>[
            indicacaoDoContrato(
              reviewStatus: 'declined',
              decidedAt: '2026-10-18T09:30:00.000Z',
              declineReason: 'A clínica fechou em agosto.',
            ),
          ]),
        ),
      );

      expect(find.text('Recusada'), findsOneWidget);
      expect(
        find.text('Motivo: A clínica fechou em agosto.'),
        findsOneWidget,
        reason: 'REPROVA: a recusada não mostra o motivo, e sem ele a pessoa '
            'indica a mesma clínica outra vez.',
      );
    });

    testWidgets('CONTRAPESO: pendente e aprovada NÃO mostram linha de motivo',
        (tester) async {
      // Sem este caso, um cartão que desenhasse `Motivo:` sempre passaria no
      // caso de cima.
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(<Map<String, dynamic>>[
            indicacaoDoContrato(reference: 'aPendenteDaContaUm0001'),
            indicacaoDoContrato(
              reference: 'bAprovadaDaContaUm001',
              reviewStatus: 'approved',
              decidedAt: '2026-10-18T09:30:00.000Z',
              entrySlug: 'clinica-santa-barbara',
            ),
          ]),
        ),
      );

      expect(motivosNaTela(), isEmpty);
    });

    testWidgets('os três estados convivem na mesma lista', (tester) async {
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(<Map<String, dynamic>>[
            indicacaoDoContrato(
              reference: 'aPendenteDaContaUm0001',
              displayName: 'Pet Shop do Bairro',
            ),
            indicacaoDoContrato(
              reference: 'bAprovadaDaContaUm001',
              displayName: 'Clínica Santa Bárbara',
              reviewStatus: 'approved',
              decidedAt: '2026-10-18T09:30:00.000Z',
              entrySlug: 'clinica-santa-barbara',
            ),
            indicacaoDoContrato(
              reference: 'cRecusadaDaContaUm001',
              displayName: 'Banho do Tobias',
              reviewStatus: 'declined',
              decidedAt: '2026-10-18T09:30:00.000Z',
              declineReason: 'Não atende pet.',
            ),
          ]),
        ),
      );

      expect(find.text('Em análise'), findsOneWidget);
      expect(find.text('Aprovada'), findsOneWidget);
      expect(find.text('Recusada'), findsOneWidget);
      expect(find.text('Motivo: Não atende pet.'), findsOneWidget);
    });
  });

  group('a lista vazia', () {
    testWidgets('ISCA: não fica em branco, e é UMA LINHA', (tester) async {
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(const <Map<String, dynamic>>[]),
        ),
      );

      expect(
        find.text('Você ainda não indicou ninguém.'),
        findsOneWidget,
        reason: 'REPROVA: a lista vazia ficou em branco, e tela em branco '
            'parece quebrada.',
      );
      // E a porta de indicar, que é o que resolve o vazio.
      expect(find.text('Indicar quem atende bem'), findsOneWidget);
    });

    testWidgets(
        'CONTRAPESO: nenhum parágrafo de apoio -- o cliente mandou removê-los',
        (tester) async {
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(const <Map<String, dynamic>>[]),
        ),
      );

      // Conta os textos longos DESTA ABA, e não da tela inteira. Uma linha e
      // um rótulo de botão passam; um parágrafo explicando o que é indicar
      // reprova.
      //
      // **O recorte em `MinhasIndicacoes` é necessário e não é afrouxamento:**
      // a aba vive dentro da casca da seção, e a linha de reforço do `Perto`
      // ("Os profissionais e estabelecimentos indicados por quem já usou.")
      // está na mesma árvore. Ela é da SEÇÃO, não desta lista, e reprovar por
      // causa dela faria este caso cobrar de mim um texto que não é meu --
      // medido: foi exatamente o que ele pegou quando a lista virou aba.
      final longos = find
          .descendant(
            of: find.byType(MinhasIndicacoes),
            matching: find.byType(Text),
          )
          .evaluate()
          .map((e) => (e.widget as Text).data ?? '')
          .where((t) => t.length > 60)
          .toList();
      expect(
        longos,
        isEmpty,
        reason: 'REPROVA: há texto de apoio longo na tela vazia. O cliente '
            'mandou remover textos de apoio em 18/10, e uma linha basta. '
            'Achei: $longos',
      );
    });
  });

  group('o filtro de situação', () {
    // O ICONE DO FILTRO DESCEU PARA O CORPO (uniao de 18/10/2026).
    //
    // O que este caso provava antes: que `BotaoDeAcaoDaListagem` ficava na
    // `AppBar` da casca, publicado no `SlotDaBarraDeListagem`. O cliente
    // decidiu o contrario no ramo da navegacao -- busca, filtro e ordenacao
    // vao para o topo do CORPO da listagem, e a barra de topo fica com
    // hamburguer, titulo, foto e (em Rede e Perto) o icone de criar.
    //
    // O caso nao foi apagado nem afrouxado: ele continua cobrando que exista
    // UM gatilho de filtro e que ele seja o componente da casa, so que no
    // lugar onde ele passou a morar.
    testWidgets('usa `BarraDeListagem`, sem copia, e o ícone fica no CORPO',
        (tester) async {
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(<Map<String, dynamic>>[indicacaoDoContrato()]),
        ),
      );

      final barra = find.byType(BarraDeListagem);
      expect(
        barra,
        findsOneWidget,
        reason: 'REPROVA: a tela não usa `BarraDeListagem`, que é o componente '
            'de toda listagem deste app. Um filtro desenhado à mão aqui seria '
            'a segunda definição do controle.',
      );
      // A barra (resumo, campo de busca e gatilho da folha) fica no CORPO, e o
      // gatilho com ela.
      expect(
        find.descendant(of: find.byType(AppBar), matching: barra),
        findsNothing,
      );
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byType(BotaoDeAcaoDaListagem),
        ),
        findsNothing,
        reason: 'REPROVA: o ícone de filtrar voltou para a barra de topo. Ele '
            'desceu para o corpo por decisão do cliente, e a barra de topo não '
            'carrega controle de listagem.',
      );
      // No corpo o gatilho e `GatilhoDeRecorteNoCorpo`, e nao
      // `BotaoDeAcaoDaListagem` (que continua existindo para a barra de topo):
      // por isso a medida aqui e pelo GLIFO, como `barra_de_listagem_aplica`
      // mede.
      expect(
        find.descendant(of: barra, matching: find.byIcon(Icons.tune)),
        findsOneWidget,
        reason: 'REPROVA: o ícone de filtrar não está na `BarraDeListagem` do '
            'corpo. Sem ele não há caminho até a folha de filtro.',
      );
    });

    testWidgets('ISCA: o filtro vai para o SERVIDOR, no parâmetro `state`',
        (tester) async {
      // PARA DESLIGAR E VER REPROVAR: em `diretorio_api.dart`, apague a linha
      // `if (estado != null) 'state': estado.codigo` de `minhasIndicacoes`. A
      // lista continua desenhando e só este caso reprova -- que é o ponto: um
      // filtro aplicado na página carregada mentiria no `total`.
      final urls = <Uri>[];
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          paginaDoContrato(<Map<String, dynamic>>[
            indicacaoDoContrato(
              reviewStatus: 'declined',
              decidedAt: '2026-10-18T09:30:00.000Z',
              declineReason: 'Não atende pet.',
            ),
          ]),
          urls: urls,
        ),
      );

      // A primeira chamada NÃO filtra: quem abre a tela quer ver todas.
      expect(
        urls.first.queryParameters.containsKey('state'),
        isFalse,
        reason: 'REPROVA: a tela abre filtrando, e esconde estados que o '
            'cliente pediu para ver.',
      );

      // Abre a folha e aplica `Recusada`.
      // O rótulo acessível do ícone é `Filtrar` (com o estado dentro quando há
      // filtro ativo), e não `Filtros`: é `BarraDeListagem` quem o compõe.
      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Recusada').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();

      expect(
        urls.last.queryParameters['state'],
        'declined',
        reason: 'REPROVA: o filtro não chegou ao servidor. Filtrar a página '
            'carregada mentiria no `total` e no paginador: com `limit` 20, '
            '"recusadas" mostraria as da página 1 e diria que são todas. '
            'URLs pedidas: $urls',
      );
    });
  });

  group('a falha não vira lista vazia', () {
    testWidgets('ISCA: servidor fora diz falha, e não "você não indicou nada"',
        (tester) async {
      // A troca mais fácil de fazer e a mais difícil de notar: um `catch` que
      // devolvesse página vazia diria, a quem indicou cinco clínicas, que não
      // indicou nenhuma.
      //
      // PARA DESLIGAR E VER REPROVAR: em `minhas_indicacoes.dart`, troque o
      // `setState(() => _fase = _Fase.falha)` do `on FalhaDeChamada` por
      // `_fase = _Fase.lista` com `_itens` vazio.
      await abrirMinhasIndicacoes(
        tester,
        rede: redeDasIndicacoes(
          const <String, dynamic>{
            'type': 'https://api.bichu.test/problems/internal',
            'title': 'Erro',
            'status': 500,
          },
          status: 500,
        ),
      );

      expect(
        find.text('Não foi possível carregar as suas indicações.'),
        findsOneWidget,
      );
      expect(
        find.text('Você ainda não indicou ninguém.'),
        findsNothing,
        reason: 'REPROVA: a falha virou lista vazia, e a tela mentiu sobre o '
            'que a pessoa fez.',
      );
      expect(find.text('Tentar de novo'), findsOneWidget);
    });
  });
}
