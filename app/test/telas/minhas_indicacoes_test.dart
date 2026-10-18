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

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
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

/// Abre `Minhas indicações` **pelo caminho que a pessoa tem**: a gaveta da
/// seção `Perto`.
///
/// Não navega pelo roteador direto de propósito. A porta de entrada é parte da
/// entrega -- uma tela alcançável só por URL é uma tela que o cliente não acha,
/// que é exatamente o defeito que esta rodada foi medir.
Future<void> abrirMinhasIndicacoes(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
}) async {
  await abrirOApp(tester, rede: rede, deposito: depositoLogado());
  await tester.tap(find.widgetWithText(NavigationDestination, 'Perto'));
  await tester.pumpAndSettle();

  // A gaveta da seção, e o item dentro dela.
  await tester.tap(find.byTooltip(TextosDaGaveta.abrirAGaveta));
  await tester.pumpAndSettle();
  final item = find.byKey(
    ItemDaGaveta.chaveDe(Rotas.perto, MinhasIndicacoes.tituloDaTela),
  );
  expect(
    item,
    findsOneWidget,
    reason: 'REPROVA: `Minhas indicações` não está na gaveta da seção `Perto`, '
        'e a tela fica alcançável só por URL -- que é uma tela que o cliente '
        'não acha.',
  );
  await tester.tap(item);
  await tester.pumpAndSettle();
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

      // Conta os textos longos do corpo. Uma linha e um rótulo de botão
      // passam; um parágrafo explicando o que é indicar reprova.
      final longos = find
          .byType(Text)
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
    testWidgets('usa `BarraDeListagem`, sem copia, e o ícone vai para a barra',
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
      // A barra (resumo e folha) fica no CORPO; o ícone que abre a folha vai
      // para a `AppBar`, que é onde o `Filtros` do `Perto` mora desde 17/10.
      expect(
        find.descendant(of: find.byType(AppBar), matching: barra),
        findsNothing,
      );
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byType(BotaoDeAcaoDaListagem),
        ),
        findsOneWidget,
        reason: 'REPROVA: o ícone de filtrar não está na barra de topo. Esta '
            'tela não passa pela casca, então ela monta o '
            '`SlotDaBarraDeListagem` ela mesma -- sem ele, `BarraDeListagem` '
            'publica o controle para ninguém e o filtro fica inalcançável.',
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
