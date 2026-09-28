// `Perto` com dado de verdade: a listagem de `GET /v1/directory/entries`.
//
// Os casos marcados ISCA sao os que precisam REPROVAR com o mecanismo
// desligado. Cada um diz, no proprio corpo, qual arquivo mexer e o que
// observar.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante
// que o produz.** Tres testes desta base faziam isso em 22/09 e passavam com
// a tela mostrando qualquer coisa: trocar a constante trocava os dois lados.
// Aqui o esperado esta escrito por extenso, com acento e pontuacao, e trocar
// a microcopy reprova -- que e o ponto.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:bichu/widgets/rodape_da_paginacao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A massa, no formato exato do contrato
// ---------------------------------------------------------------------------

/// Uma entrada como `DirectoryEntrySummary` a declara.
///
/// **Sem `id`**: a chave e o `slug`. Um teste que passasse `id` aqui estaria
/// exercitando um contrato que nao existe.
Map<String, dynamic> entradaDoContrato({
  String slug = 'clinica-santa-barbara',
  String kind = 'clinic',
  String displayName = 'Clínica Santa Bárbara',
  String? city = 'São Paulo',
  String? state = 'SP',
  String? neighborhood = 'Pinheiros',
  String? about,
  String? phoneE164,
  String level = 'document_verified',
  List<String> evidence = const <String>['cnpj', 'crmv'],
  int? distanceM,
}) {
  return <String, dynamic>{
    'slug': slug,
    'kind': kind,
    'display_name': displayName,
    'city': city,
    'state': state,
    'neighborhood': neighborhood,
    'about': about,
    'phone_e164': phoneE164,
    'verification': <String, dynamic>{
      'level': level,
      'evidence_kinds': evidence,
    },
    'distance_m': distanceM,
  };
}

/// A resposta de `DirectoryEntryPage`.
Map<String, dynamic> paginaDoContrato(
  List<Map<String, dynamic>> itens, {
  required bool distanciaDisponivel,
  int? total,
  int pagina = 1,
  int limite = 20,
  Map<String, String> filtros = const <String, String>{'scope': 'all'},
}) {
  return <String, dynamic>{
    'items': itens,
    'page': pagina,
    'limit': limite,
    'total': total ?? itens.length,
    'distance_available': distanciaDisponivel,
    'applied_filters': filtros,
  };
}

/// Vinte e cinco entradas distintas, com nome e `slug` numerados.
///
/// **Vinte e cinco, e nao cinco.** Um caso com cinco itens cabe inteiro na
/// primeira pagina e fica verde com a paginacao quebrada -- foi o que
/// aconteceu: a tela foi entregue com massa de dez e doze itens e o defeito
/// passou. O teto do contrato e `limit: 20`, entao so acima de vinte existe um
/// item que a pagina 1 nao alcanca.
List<Map<String, dynamic>> vinteECincoEntradas() {
  return <Map<String, dynamic>>[
    for (var i = 1; i <= 25; i++)
      entradaDoContrato(
        slug: 'entrada-$i',
        displayName: 'Entrada $i',
        distanceM: i * 100,
      ),
  ];
}

/// A rede que **pagina de verdade**: recorta a massa por `page` e `limit`, do
/// jeito que o contrato manda, e registra cada URL pedida.
///
/// Ela nao devolve um corpo fixo. Um duble que responde a mesma pagina para
/// qualquer `page` deixaria passar exatamente o defeito que estes casos
/// existem para pegar: a tela pode nunca pedir a pagina 2 e o teste nao
/// perceberia.
Future<http.Response> Function(http.Request) redeQuePaginaODiretorio(
  List<Map<String, dynamic>> massa, {
  required List<Uri> urls,
  bool distanciaDisponivel = true,
  Map<String, String> Function(Map<String, String> pedido)? filtrosAplicados,
  List<Map<String, dynamic>> Function(Map<String, String> pedido)? recorte,
}) {
  return (req) async {
    if (req.url.path != '/v1/directory/entries' || req.method != 'GET') {
      return problema('not-found', 404);
    }
    urls.add(req.url);
    final pedido = req.url.queryParameters;
    final pagina = int.parse(pedido['page'] ?? '1');
    final limite = int.parse(pedido['limit'] ?? '20');
    final visivel = recorte == null ? massa : recorte(pedido);
    final inicio = (pagina - 1) * limite;
    final fatia = inicio >= visivel.length
        ? const <Map<String, dynamic>>[]
        : visivel.sublist(
            inicio,
            inicio + limite > visivel.length ? visivel.length : inicio + limite,
          );
    return json200(
      paginaDoContrato(
        fatia,
        distanciaDisponivel: distanciaDisponivel,
        total: visivel.length,
        pagina: pagina,
        limite: limite,
        filtros: filtrosAplicados?.call(pedido) ??
            const <String, String>{'scope': 'all'},
      ),
    );
  };
}

/// Rola ate o rodape e toca em `Carregar mais`.
///
/// O `ensureVisible` nao e cerimonia de teste: com vinte cartoes o botao nasce
/// muito abaixo da dobra, e chegar ate ele rolando e o desenho do paragrafo
/// 11.20 -- e o que a rolagem infinita impediria.
Future<void> tocarEmCarregarMais(WidgetTester tester) async {
  final botao = find.text(RodapeDaPaginacao.rotuloDeCarregarMais);
  expect(
    botao,
    findsOneWidget,
    reason: 'REPROVA: nao ha `Carregar mais` na tela, e os itens depois do '
        '20o sao inalcancaveis.',
  );
  await tester.ensureVisible(botao);
  await tester.pumpAndSettle();
  await tester.tap(botao);
  await tester.pumpAndSettle();
}

/// A rede que atende o diretorio e **404 em qualquer outra rota**.
///
/// 404 no resto, e nao 200 vazio: um caso que dependesse de uma chamada nao
/// declarada aqui precisa falhar alto, e nao passar por acidente.
Future<http.Response> Function(http.Request) redeDoDiretorio(
  Map<String, dynamic> corpo, {
  List<Uri>? urls,
  int status = 200,
}) {
  return (req) async {
    if (req.url.path == '/v1/directory/entries' && req.method == 'GET') {
      urls?.add(req.url);
      if (status != 200) return problema('rate-limited', status);
      return json200(corpo);
    }
    return problema('not-found', 404);
  };
}

Future<void> abrirPerto(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
}) async {
  await abrirOApp(tester, rede: rede, deposito: depositoLogado());
  await tester.tap(find.widgetWithText(NavigationDestination, 'Perto'));
  await tester.pumpAndSettle();
}

/// Os nomes dos cartoes, **na ordem em que a tela os desenhou**.
///
/// Lidos da arvore montada, e nao da resposta: e a ordem da TELA que os casos
/// de ordenacao medem, e ler da resposta provaria que o JSON esta ordenado.
List<String> nomesNaTela(WidgetTester tester) {
  final nomes = <String>[];
  for (final cartao in find.byType(CartaoDoDiretorio).evaluate()) {
    final entrada = (cartao.widget as CartaoDoDiretorio).entrada;
    nomes.add(entrada.nome);
  }
  return nomes;
}

/// Quantos pontos tocaveis ha dentro de [cartao].
///
/// Conta `InkWell` com `onTap` preenchido, que e o que um `TextButton` publica
/// por dentro e o que um cartao tocavel publicaria.
int tocaveisComAcao(Finder cartao) {
  var quantos = 0;
  for (final elemento
      in find.descendant(of: cartao, matching: find.byType(InkWell)).evaluate()) {
    if ((elemento.widget as InkWell).onTap != null) quantos += 1;
  }
  return quantos;
}

/// A raiz do repositorio, subindo a partir do diretorio de execucao.
Directory raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/api/openapi.yaml').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei `api/openapi.yaml` subindo a partir de '
    '"${Directory.current.path}". Sem o contrato este arquivo nao tem contra '
    'o que conferir, e ficar verde sem conferir e o que ele existe para '
    'impedir.',
  );
}

void main() {
  // -------------------------------------------------------------------------
  // 1. A lista aparece, com o que o cartao TEM
  // -------------------------------------------------------------------------
  group('a secao Perto mostra o diretorio', () {
    testWidgets('cada entrada vira um cartao com nome, atividade e lugar',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(distanceM: 2700),
              entradaDoContrato(
                slug: 'banho-do-tobias',
                kind: 'groomer',
                displayName: 'Banho do Tobias',
                neighborhood: 'Vila Madalena',
                level: 'none',
                evidence: const <String>[],
                distanceM: 800,
              ),
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      expect(find.byType(CartaoDoDiretorio), findsNWidgets(2));
      expect(find.text('Clínica Santa Bárbara'), findsOneWidget);
      expect(find.text('Clínica'), findsOneWidget);
      expect(find.text('Pinheiros · São Paulo · SP'), findsOneWidget);
      expect(find.text('Banho e tosa'), findsOneWidget);
      expect(find.text('Vila Madalena · São Paulo · SP'), findsOneWidget);
    });

    testWidgets('o selo diz O QUE foi verificado, e nao apenas "verificado"',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[entradaDoContrato(distanceM: 2700)],
            distanciaDisponivel: true,
          ),
        ),
      );

      // Escrito por extenso: a BICHUS-165 nao passou por selo generico, e o
      // que reprova e a interface dizer "Verificado" sem dizer o que.
      expect(find.text('Verificado: CNPJ, CRMV'), findsOneWidget);
      expect(find.text('Verificado'), findsNothing);
    });

    testWidgets(
        'nivel `none` nao ganha carimbo nenhum, nem positivo nem negativo',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(
                slug: 'passeios-da-ana',
                kind: 'walker',
                displayName: 'Passeios da Ana',
                level: 'none',
                evidence: const <String>[],
                distanceM: 400,
              ),
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      expect(find.text('Passeios da Ana'), findsOneWidget);
      // `none` e estado legitimo e publicavel (ADR-0011): passeador nao tem
      // conselho. Carimbar "Não verificado" seria um selo negativo sobre um
      // estado que o produto aceita de proposito.
      expect(find.textContaining('Verificado'), findsNothing);
      expect(find.textContaining('Não verificado'), findsNothing);
      expect(find.textContaining('Sem verificação'), findsNothing);
    });

    testWidgets('a chamada leva o recorte e NAO leva coordenada nenhuma',
        (tester) async {
      final urls = <Uri>[];
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[entradaDoContrato(distanceM: 100)],
            distanciaDisponivel: true,
          ),
          urls: urls,
        ),
      );

      expect(urls, isNotEmpty);
      final q = urls.last.queryParameters;
      expect(q['sort'], 'distance');
      expect(q['page'], '1');
      expect(q['limit'], '20');
      // Coordenada em URL vai para log de acesso, para o historico do
      // aparelho e para o `Referer`. A localizacao de referencia e do
      // servidor (BICHUS-92), e nenhum parametro daqui a carrega.
      for (final proibido in <String>['lat', 'lng', 'lon', 'latitude',
        'longitude', 'coords', 'point']) {
        expect(
          q.containsKey(proibido),
          isFalse,
          reason: 'REPROVA: a requisicao do diretorio levou "$proibido" na '
              'URL. Coordenada em URL vai para o log de acesso, para o '
              'historico do aparelho e para o cabecalho `Referer`.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. ISCA — a ordem por nome nao passa calada
  // -------------------------------------------------------------------------
  group('ISCA — a lista nao sai por nome sem dizer', () {
    // DESLIGAR PARA VER REPROVAR: em
    // `lib/telas/perto/lista_do_diretorio.dart`, em `_controleDeOrdenacao`,
    // troque `final divergiu = pedida != efetiva;` por `const divergiu =
    // false;`. A lista continua saindo por nome e a tela para de dizer. Este
    // caso e o da linha de resumo abaixo reprovam.
    testWidgets(
        '`distance_available: false` faz a tela dizer que a ordem e alfabetica',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(displayName: 'Ana Vet'),
              entradaDoContrato(slug: 'zeca', displayName: 'Zeca Banho'),
            ],
            // A lista saiu por NOME, e o servidor esta dizendo isso.
            distanciaDisponivel: false,
          ),
        ),
      );

      // A frase esta escrita por extenso de proposito. Comparar com
      // `ListaDoDiretorio.semLocalizacao` seria comparar a constante com ela
      // mesma, e passaria com a tela mostrando qualquer coisa.
      expect(
        find.textContaining(
          'Esta lista está em ordem alfabética, não por proximidade.',
        ),
        findsOneWidget,
        reason: 'REPROVA: a lista saiu por nome e a tela nao disse. Mostrar '
            'ordem errada em silencio e a forma mais barata de mentir sobre '
            'proximidade.',
      );
      // **E nao ha botao nenhum.** O que falta e a regiao de referencia que o
      // servidor guarda, e nenhuma tela deste app a escreve: um `Ligar a
      // localização` aqui ligaria o GPS e a resposta continuaria a mesma, que
      // e acao sem destino com cara de conserto.
      expect(find.text('Ligar a localização'), findsNothing);
      expect(
        find.textContaining('O Bichu ainda não tem a sua região de referência'),
        findsOneWidget,
      );
    });

    testWidgets('a linha de resumo mostra a ordem REAL, e nao a pedida',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[entradaDoContrato()],
            distanciaDisponivel: false,
            total: 10,
          ),
        ),
      );

      // O app pediu `sort=distance` (o padrao). O servidor entregou por nome.
      // O que a tela escreve e `Nome`.
      expect(find.text('10 resultados · Nome'), findsOneWidget);
      expect(find.text('10 resultados · Mais perto'), findsNothing);
    });

    testWidgets(
        'ISCA — o controle de ordenacao nao mostra uma ordem com a lista em '
        'outra', (tester) async {
      // DESLIGAR PARA VER REPROVAR: em `lib/widgets/barra_de_listagem.dart`,
      // troque `efetiva: efetiva.codigo` (em `_controleDeOrdenacao` da tela)
      // por `efetiva: pedida.codigo`. O rotulo passa a dizer `Mais perto` e a
      // lista continua alfabetica. Este caso reprova pelos dois lados: o
      // texto e a ordem dos cartoes.
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(displayName: 'Ana Vet', distanceM: null),
              entradaDoContrato(
                slug: 'zeca',
                displayName: 'Zeca Banho',
                distanceM: null,
              ),
            ],
            distanciaDisponivel: false,
          ),
        ),
      );

      // O que o controle anuncia.
      final ordem = tester.widget<BarraDeListagem>(
        find.byType(BarraDeListagem),
      );
      expect(ordem.ordenacao!.rotuloEfetivo, 'Nome');

      // E a ordem em que os cartoes de fato estao.
      expect(nomesNaTela(tester), <String>['Ana Vet', 'Zeca Banho']);
    });

    testWidgets('quem PEDIU nome nao recebe explicacao nenhuma',
        (tester) async {
      // O app se desculpando por ter atendido seria ruido: nao ha divergencia
      // entre pedida e efetiva aqui.
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[entradaDoContrato()],
            distanciaDisponivel: false,
          ),
        ),
      );

      await tester.tap(find.byTooltip('Ordenar, Nome'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nome').last);
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Esta lista está em ordem alfabética'),
        findsNothing,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. ISCA — a distancia nula nao aparece
  // -------------------------------------------------------------------------
  group('ISCA — distancia nula nao vira texto', () {
    // DESLIGAR PARA VER REPROVAR: em
    // `lib/telas/perto/lista_do_diretorio.dart`, em
    // `CartaoDoDiretorio.distanciaEmTexto`, troque
    // `if (metros == null) return null;` por
    // `final m = metros ?? 0;` e siga usando `m`. O cartao passa a dizer
    // "a 0 m", que e o zero silencioso.
    testWidgets('entrada sem distancia nao mostra "a 0 m" nem travessao',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(displayName: 'Sem ponto', distanceM: null),
            ],
            distanciaDisponivel: false,
          ),
        ),
      );

      expect(find.text('Sem ponto'), findsOneWidget);
      expect(find.text('a 0 m'), findsNothing);
      expect(find.text('a 0,0 km'), findsNothing);
      expect(find.textContaining(' m'), findsNothing);
      expect(find.textContaining(' km'), findsNothing);
    });

    testWidgets('com distancia, o texto respeita a grade de 100 m',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(displayName: 'Perto', distanceM: 700),
              entradaDoContrato(
                slug: 'longe',
                displayName: 'Longe',
                distanceM: 2700,
              ),
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      // O servidor arredonda a 100 m, que e a grade em que o produto quantiza
      // a localizacao (ADR-0006). `2,73 km` inventaria dois digitos.
      expect(find.text('a 700 m'), findsOneWidget);
      expect(find.text('a 2,7 km'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // 4. ISCA — cartao sem telefone nao tem botao de ligar
  // -------------------------------------------------------------------------
  group('ISCA — o botao de ligar so existe com telefone', () {
    // DESLIGAR PARA VER REPROVAR: em
    // `lib/telas/perto/lista_do_diretorio.dart`, troque
    // `if (telefone != null) ...` por `if (true) ...` e passe
    // `entrada.telefoneE164 ?? ''` ao `_ligar`. O cartao sem telefone ganha um
    // botao que abre `tel:` vazio.
    testWidgets('sem `phone_e164`, nenhum botao de ligar na tela',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(displayName: 'Sem telefone'),
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      expect(find.text('Sem telefone'), findsOneWidget);
      expect(find.byIcon(Icons.call_outlined), findsNothing);
      expect(find.textContaining('Ligar para'), findsNothing);
    });

    testWidgets('com `phone_e164`, o botao existe e nomeia PARA QUEM',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(
                displayName: 'Clínica Santa Bárbara',
                phoneE164: '+5511987654321',
              ),
              entradaDoContrato(
                slug: 'sem-fone',
                displayName: 'Banho do Tobias',
              ),
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      // Um botao, e nao dois: a segunda entrada nao tem telefone.
      expect(find.byIcon(Icons.call_outlined), findsOneWidget);
      // Numa lista de dez entradas, dez controles chamados so `Ligar` sao dez
      // paradas indistinguiveis no leitor de tela.
      expect(find.text('Ligar para Clínica Santa Bárbara'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // 5. ISCA — nada leva a uma tela de detalhe que nao existe
  // -------------------------------------------------------------------------
  group('ISCA — nao ha caminho para detalhe nenhum', () {
    // DESLIGAR PARA VER REPROVAR: em
    // `lib/telas/perto/lista_do_diretorio.dart`, embrulhe o `Container` do
    // `CartaoDoDiretorio` num `InkWell(onTap: () {}, ...)` ou acrescente um
    // `Icon(Icons.chevron_right)`. Os dois casos abaixo reprovam.
    testWidgets('o cartao nao e tocavel e nao tem seta de avanco',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(phoneE164: '+5511987654321'),
              entradaDoContrato(
                slug: 'banho-do-tobias',
                kind: 'groomer',
                displayName: 'Banho do Tobias',
              ),
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      final comFone = find.widgetWithText(
        CartaoDoDiretorio,
        'Clínica Santa Bárbara',
      );
      final semFone = find.widgetWithText(
        CartaoDoDiretorio,
        'Banho do Tobias',
      );
      expect(comFone, findsOneWidget);
      expect(semFone, findsOneWidget);

      // A seta de avanco e o desenho que promete destino. Ela existe na porta
      // das ONGs, que TEM destino, entao a busca e dentro do cartao.
      for (final cartao in <Finder>[comFone, semFone]) {
        expect(
          find.descendant(
            of: cartao,
            matching: find.byIcon(Icons.chevron_right),
          ),
          findsNothing,
          reason: 'REPROVA: o cartao do diretorio ganhou seta de avanco. Nao '
              'ha tela de detalhe nesta versao, e seta e promessa de destino.',
        );
      }

      // **O cartao sem telefone nao tem NENHUM ponto tocavel.** Aqui nao ha
      // botao de ligar para confundir a contagem: qualquer `InkWell` com acao
      // e o cartao inteiro tendo virado um caminho.
      expect(
        tocaveisComAcao(semFone),
        0,
        reason: 'REPROVA: o cartao do diretorio virou tocavel. O criterio 2 da '
            'BICHUS-62 proibe acao sem destino, e a tela de detalhe do '
            'profissional nao existe nesta versao.',
      );

      // **O cartao COM telefone tem exatamente um**, e ele e o botao de
      // ligar. Dois significam que o cartao ganhou destino por fora do botao.
      expect(
        tocaveisComAcao(comFone),
        1,
        reason: 'REPROVA: o cartao com telefone tem mais de um ponto tocavel. '
            'O unico controle com desfecho que ele pode ter e `Ligar`.',
      );
      expect(
        find.descendant(of: comFone, matching: find.byType(TextButton)),
        findsOneWidget,
      );
    });

    testWidgets('o `slug` nao vira rota: nenhuma rota do app o aceita',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[entradaDoContrato()],
            distanciaDisponivel: true,
          ),
        ),
      );

      final rotas = rotasRegistradasDoApp(tester);
      for (final rota in rotas) {
        expect(
          rota.contains('directory') || rota.contains('profissional'),
          isFalse,
          reason: 'REPROVA: o roteador registrou "$rota". Uma rota de detalhe '
              'do diretorio significa que alguem construiu o destino -- e '
              'entao o cartao precisa levar a ele, e este arquivo precisa '
              'mudar junto. Enquanto nao houver destino, nao pode haver '
              'caminho.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. ISCA — o campo de busca nao promete alcance que nao tem
  // -------------------------------------------------------------------------
  group('ISCA — a busca nao mente sobre o alcance', () {
    // Este portao le o CONTRATO, e nao uma constante do app.
    //
    // Ele cobra os dois sentidos, e e por isso que ele nao pode ficar verde
    // por vazio: hoje `q` nao existe no contrato e o campo nao pode existir na
    // tela; no dia em que `q` entrar, o campo passa a ser OBRIGATORIO e este
    // caso reprova ate alguem liga-lo. Um portao que so cobrasse "o campo nao
    // existe" viraria uma afirmacao permanente que ninguem revisita.
    //
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/lista_do_diretorio.dart`
    // passe `busca: ControleDeBusca(...)` a `BarraDeListagem` sem `q` entrar
    // no contrato. Este caso reprova nomeando o parametro que falta.
    testWidgets('o campo de busca existe se, e somente se, a rota aceita `q`',
        (tester) async {
      final contrato =
          File('${raizDoRepositorio().path}/api/openapi.yaml').readAsStringSync();
      final operacao = contrato.split('operationId: listDirectoryEntries');
      expect(
        operacao.length,
        2,
        reason: 'REPROVA: nao achei `listDirectoryEntries` em '
            '`api/openapi.yaml`. Este portao confere a tela contra o contrato; '
            'sem a operacao nao ha o que conferir.',
      );
      // O corpo da operacao vai ate a proxima operacao declarada.
      final corpo = operacao[1].split('operationId:').first;
      final aceitaQ = RegExp(r'-\s*name:\s*q\b').hasMatch(corpo);

      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[entradaDoContrato()],
            distanciaDisponivel: true,
          ),
        ),
      );

      final barra = tester.widget<BarraDeListagem>(
        find.byType(BarraDeListagem),
      );

      if (!aceitaQ) {
        expect(
          barra.busca,
          isNull,
          reason: 'REPROVA: a tela desenhou campo de busca e '
              '`listDirectoryEntries` NAO declara o parametro `q`. Um campo '
              'que filtra as 20 entradas da pagina carregada funciona com 10 '
              'registros e mente com 200, e campo de busca que mente e pior '
              'que campo ausente. Ligue `q` no contrato e em '
              '`DiretorioApi.listar` antes de desenhar o campo.',
        );
        expect(find.byType(TextField), findsNothing);
        return;
      }

      expect(
        barra.busca,
        isNotNull,
        reason: 'REPROVA: `listDirectoryEntries` passou a declarar `q` e a '
            'tela de `Perto` continua sem campo de busca. O componente ja '
            'esta pronto: monte um `ControleDeBusca` com '
            '`alcance: AlcanceDaBusca.servidor`, e faca `RecorteDoDiretorio` '
            'levar o termo em `query`.',
      );
      expect(
        barra.busca!.alcance,
        AlcanceDaBusca.servidor,
        reason: 'REPROVA: a rota aceita `q` e a tela declarou a busca como '
            '`paginaCarregada`. O alcance declarado precisa ser o alcance '
            'real.',
      );
    });

    testWidgets(
        'o componente que busca so na pagina carregada DIZ isso na tela',
        (tester) async {
      // A prova positiva do mecanismo, montada direto no componente: ela e o
      // que impede o `AlcanceDaBusca.paginaCarregada` de existir sem
      // consequencia no dia em que alguem o usar.
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);

      await tester.pumpWidget(
        MaterialApp(
          // O tema do app, e nao o do Material: `BichuColors` vive no
          // `ThemeData` e o componente estoura sem ele, de proposito.
          theme: BichuTheme.claro,
          home: Scaffold(
            body: BarraDeListagem(
              total: 3,
              busca: ControleDeBusca(
                controlador: controlador,
                aoMudar: (_) {},
                alcance: AlcanceDaBusca.paginaCarregada,
                exemplo: 'Nome',
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('A busca olha só o que já está carregado nesta página.'),
        findsOneWidget,
        reason: 'REPROVA: a busca declarou alcance de pagina carregada e o '
            'componente nao escreveu isso na tela.',
      );
    });

    testWidgets('com alcance de servidor, nao ha aviso de alcance',
        (tester) async {
      final controlador = TextEditingController();
      addTearDown(controlador.dispose);

      await tester.pumpWidget(
        MaterialApp(
          // O tema do app, e nao o do Material: `BichuColors` vive no
          // `ThemeData` e o componente estoura sem ele, de proposito.
          theme: BichuTheme.claro,
          home: Scaffold(
            body: BarraDeListagem(
              total: 3,
              busca: ControleDeBusca(
                controlador: controlador,
                aoMudar: (_) {},
                alcance: AlcanceDaBusca.servidor,
                exemplo: 'Nome',
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('já está carregado'), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  // 7. O filtro, que TEM destino
  // -------------------------------------------------------------------------
  group('o filtro recorta de verdade', () {
    testWidgets('escolher a atividade manda `kind` para a rota',
        (tester) async {
      final urls = <Uri>[];
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[entradaDoContrato()],
            distanciaDisponivel: true,
          ),
          urls: urls,
        ),
      );

      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Veterinário'));
      await tester.pumpAndSettle();

      expect(urls.last.queryParameters['kind'], 'vet');
      // E o distintivo passa a contar um filtro ativo, no nome acessivel.
      expect(find.byTooltip('Filtrar, 1 filtro ativo'), findsOneWidget);
    });

    testWidgets('a folha explica que o nivel de verificacao e PISO',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[entradaDoContrato()],
            distanciaDisponivel: true,
          ),
        ),
      );

      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();

      // A regra do contrato que ninguem adivinha olhando a lista: filtro por
      // igualdade esconderia o registro mais forte de quem pediu o mais fraco.
      expect(
        find.textContaining(
          'É um piso: quem pede contato verificado recebe também quem tem '
          'documento verificado.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('filtrar ate o vazio mantem a barra e diz que foi o filtro',
        (tester) async {
      var chamadas = 0;
      await abrirPerto(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/directory/entries') {
            chamadas += 1;
            final vazio = req.url.queryParameters.containsKey('kind');
            return json200(
              paginaDoContrato(
                vazio
                    ? const <Map<String, dynamic>>[]
                    : <Map<String, dynamic>>[entradaDoContrato()],
                distanciaDisponivel: true,
              ),
            );
          }
          return problema('not-found', 404);
        },
      );

      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Passeador'));
      await tester.pumpAndSettle();

      expect(chamadas, 2);
      // **A barra FICA.** Tirar a barra aqui prenderia a pessoa num vazio sem
      // o controle que o produziu.
      expect(find.byType(BarraDeListagem), findsOneWidget);
      expect(find.text('0 resultados · Mais perto'), findsOneWidget);
      // E o vazio diz que foi o filtro, e nao que a secao esta vazia.
      expect(find.text('Nada com esses filtros'), findsOneWidget);
      expect(find.text('Ainda não há profissionais por aqui'), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Os estados da listagem: zero, um, falha
  // -------------------------------------------------------------------------
  group('os estados que Loja e Rede vao herdar', () {
    testWidgets('zero itens e nenhum recorte: a barra NAO nasce',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            const <Map<String, dynamic>>[],
            distanciaDisponivel: true,
          ),
        ),
      );

      // Filtrar o nada e ordenar o nada sao controles sem desfecho.
      expect(find.byType(BarraDeListagem), findsOneWidget);
      final barra = tester.widget<BarraDeListagem>(
        find.byType(BarraDeListagem),
      );
      expect(barra.total, 0);
      expect(find.byTooltip('Filtrar'), findsNothing);
      expect(find.byTooltip('Ordenar, Mais perto'), findsNothing);
      expect(find.text('Ainda não há profissionais por aqui'), findsOneWidget);
    });

    testWidgets('um item: o resumo vai para o singular', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            <Map<String, dynamic>>[entradaDoContrato()],
            distanciaDisponivel: true,
          ),
        ),
      );

      expect(find.text('1 resultado · Mais perto'), findsOneWidget);
      // O fim da lista tambem vai para o singular: `todos os 1 profissionais`
      // e o defeito que uma frase montada com o total sozinho produziria.
      expect(
        find.text('Você viu o único profissional desta região.'),
        findsOneWidget,
      );
      expect(find.text(RodapeDaPaginacao.rotuloDeCarregarMais), findsNothing);
    });

    testWidgets('429: o texto diz que o teto e por CONTA, e ha como tentar',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDoDiretorio(
          paginaDoContrato(
            const <Map<String, dynamic>>[],
            distanciaDisponivel: true,
          ),
          status: 429,
        ),
      );

      expect(
        find.text(
          'Você consultou o diretório muitas vezes seguidas. '
          'Tente de novo daqui a pouco.',
        ),
        findsOneWidget,
      );
      expect(find.text('Atualizar'), findsOneWidget);
      // **A falha nao vira lista vazia.** O estado vazio que parece sucesso e
      // exatamente o que este ramo existe para nao produzir.
      expect(find.text('Ainda não há profissionais por aqui'), findsNothing);
    });

    testWidgets('resposta sem `distance_available` nao vira lista confiante',
        (tester) async {
      await abrirPerto(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/directory/entries') {
            return http.Response(
              jsonEncode(<String, dynamic>{
                'items': <dynamic>[entradaDoContrato()],
                'page': 1,
                'limit': 20,
                'total': 1,
              }),
              200,
              headers: const <String, String>{
                'content-type': 'application/json',
              },
            );
          }
          return problema('not-found', 404);
        },
      );

      // Assumir `true` seria a tela afirmar proximidade que ninguem calculou.
      expect(find.byType(CartaoDoDiretorio), findsNothing);
      expect(find.text('Atualizar'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // 9. ISCA — o 21o item e alcancavel, e trocar o filtro volta para a pagina 1
  // -------------------------------------------------------------------------
  group('ISCA — a paginacao avanca de verdade', () {
    // DESLIGAR PARA VER REPROVAR, caso do 21o item: em
    // `lib/telas/perto/lista_do_diretorio.dart`, em `_corpo`, troque o rodape
    // por `const SizedBox.shrink()` -- e o estado em que esta tela foi
    // entregue, sem botao de pagina seguinte. Ou, mais perto do defeito
    // original, troque `_itens.addAll(pagina.itens)` em `_carregarMais` por
    // `_itens..clear()..addAll(pagina.itens)`: a pagina 2 volta a SUBSTITUIR a
    // 1, e `Entrada 1` desaparece.
    //
    // DESLIGAR PARA VER REPROVAR, caso do filtro: no mesmo arquivo, em
    // `_carregar`, troque
    // `_recorte.pagina == 1 ? _recorte : _recorte.com(pagina: 1)` por
    // `_recorte`, e apague o `pagina: 1` da chamada de `_trocarRecorte` em
    // `aoEscolher`. O filtro passa a ser aplicado sobre a pagina 3 e a lista
    // fica vazia sem motivo aparente.
    testWidgets(
        'o 21o item e alcancavel: `Carregar mais` pede a pagina 2 e ACRESCENTA',
        (tester) async {
      final urls = <Uri>[];
      await abrirPerto(
        tester,
        rede: redeQuePaginaODiretorio(vinteECincoEntradas(), urls: urls),
      );

      // A pagina 1 traz as vinte primeiras, e `Entrada 21` nao esta na tela.
      expect(nomesNaTela(tester), hasLength(20));
      expect(find.text('Entrada 21'), findsNothing);
      expect(urls.single.queryParameters['page'], '1');

      // O rodape oferece o caminho, porque ha mais no servidor (25 > 20). E
      // NAO mostra a frase de fim de lista, que seria mentira aqui.
      expect(
        find.text(RodapeDaPaginacao.rotuloDeCarregarMais),
        findsOneWidget,
        reason: 'REPROVA: 25 entradas no servidor, 20 na tela, e nenhum '
            'caminho para as outras 5. Os itens depois do 20o ficam '
            'inalcancaveis, que e o defeito inteiro.',
      );
      expect(find.textContaining('Você viu todos'), findsNothing);

      await tocarEmCarregarMais(tester);

      // A tela PEDIU a pagina 2. Sem isto o resto e coincidencia.
      expect(
        urls.last.queryParameters['page'],
        '2',
        reason: 'REPROVA: a tela nao pediu a pagina seguinte. O parametro '
            '`page` existe no contrato e o cliente de API ja o manda: quem '
            'nao avancava era a tela.',
      );
      expect(urls.last.queryParameters['limit'], '20');

      // E ACRESCENTOU: as 25 estao na tela, a primeira continua lá, e a 21a
      // finalmente existe. Substituir em vez de acrescentar seria a outra
      // forma de o 21o item nao ser alcancavel.
      expect(nomesNaTela(tester), hasLength(25));
      expect(
        find.text('Entrada 21'),
        findsOneWidget,
        reason: 'REPROVA: a pagina 2 chegou e o 21o item continua fora da '
            'tela.',
      );
      expect(
        find.text('Entrada 1'),
        findsOneWidget,
        reason: 'REPROVA: a pagina 2 SUBSTITUIU a pagina 1 em vez de '
            'continua-la. A pessoa perdeu as vinte primeiras entradas ao '
            'pedir mais.',
      );

      // Fim da lista: o botao sai e entra a frase (paragrafo 11.20).
      expect(find.text(RodapeDaPaginacao.rotuloDeCarregarMais), findsNothing);
      expect(
        find.text('Você viu todos os 25 profissionais desta região.'),
        findsOneWidget,
      );
    });

    testWidgets('trocar o filtro VOLTA para a pagina 1', (tester) async {
      final urls = <Uri>[];
      await abrirPerto(
        tester,
        rede: redeQuePaginaODiretorio(
          vinteECincoEntradas(),
          urls: urls,
          // O recorte por `kind` deixa TRES entradas. Se o filtro for pedido
          // na pagina 2, o servidor responde uma fatia vazia e a tela mostra
          // "Nada com esses filtros" com tres entradas existindo -- que e
          // exatamente o "a lista ficou vazia sem motivo" deste defeito.
          recorte: (pedido) => pedido['kind'] == null
              ? vinteECincoEntradas()
              : vinteECincoEntradas().take(3).toList(),
          filtrosAplicados: (pedido) => pedido['kind'] == null
              ? const <String, String>{'scope': 'all'}
              : <String, String>{'kind': pedido['kind']!},
        ),
      );

      // Primeiro sai da pagina 1, para que manter a pagina seja um defeito
      // possivel. Sem este passo o caso fica verde com o defeito de pe.
      await tocarEmCarregarMais(tester);
      expect(urls.last.queryParameters['page'], '2');

      // A barra ficou 25 cartoes acima da dobra depois do `Carregar mais`.
      await tester.ensureVisible(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Filtrar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Veterinário'));
      await tester.pumpAndSettle();

      expect(urls.last.queryParameters['kind'], 'vet');
      expect(
        urls.last.queryParameters['page'],
        '1',
        reason: 'REPROVA: o filtro foi aplicado mantendo a pagina 2. A fatia '
            'volta vazia e a tela diz que nada casa com o filtro, com tres '
            'entradas existindo. Este e o defeito que aparece como "a lista '
            'ficou vazia sem motivo".',
      );

      // E a tela mostra as tres, e nao o vazio filtrado.
      expect(nomesNaTela(tester), hasLength(3));
      expect(find.text(ListaDoDiretorio.tituloDoVazioFiltrado), findsNothing);
      // A lista acumulada da pagina 2 foi DESCARTADA: sobraram tres, e nao
      // vinte e tres.
      expect(
        find.text('Você viu todos os 3 profissionais desta região.'),
        findsOneWidget,
      );
    });

    testWidgets(
        'voltar para a aba depois de `Carregar mais` recomeca da pagina 1',
        (tester) async {
      final urls = <Uri>[];
      await abrirPerto(
        tester,
        rede: redeQuePaginaODiretorio(vinteECincoEntradas(), urls: urls),
      );

      await tocarEmCarregarMais(tester);
      expect(urls.last.queryParameters['page'], '2');

      // Sai da secao e volta. O estado da tela SOBREVIVE (o ramo do
      // `StatefulShellRoute` fica vivo), e e `TickerMode` que dispara a
      // recarga -- e por isso que `_recorte` pode voltar aqui com `page` em 2.
      final antesDeSair = urls.length;
      await tester.tap(find.widgetWithText(NavigationDestination, 'Loja'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perto'));
      await tester.pumpAndSettle();

      final depoisDeVoltar = urls.sublist(antesDeSair);
      expect(
        depoisDeVoltar,
        isNotEmpty,
        reason: 'REPROVA: voltar para a aba nao recarregou nada, e o caso '
            'perdeu o que ele existe para medir.',
      );
      // **Todas** as chamadas depois do retorno, e nao so a ultima.
      //
      // Enquanto este caso olhava apenas `urls.last` ele ficava VERDE com o
      // defeito de pe: o retorno pedia a pagina 2 e uma segunda carga, logo
      // atras, pedia a 1. Medido: `[page=1, page=2, page=2, page=1]`.
      expect(
        depoisDeVoltar
            .map((u) => u.queryParameters['page'])
            .toSet(),
        <String>{'1'},
        reason: 'REPROVA: voltar para a aba pediu a pagina que o `Carregar '
            'mais` tinha deixado no recorte. Pedidas: '
            '${depoisDeVoltar.map((u) => u.query).toList()}. Com um recorte '
            'menor essa pagina volta VAZIA, e a lista fica vazia sem ninguem '
            'ter mexido em filtro nenhum.',
      );
      expect(nomesNaTela(tester), hasLength(20));
      expect(find.text('Entrada 1'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // 10. A barra de topo nao foi ocupada
  // -------------------------------------------------------------------------
  testWidgets('o slot unico de acao da `AppBar` continua LIVRE em Perto',
      (tester) async {
    await abrirPerto(
      tester,
      rede: redeDoDiretorio(
        paginaDoContrato(
          <Map<String, dynamic>>[entradaDoContrato()],
          distanciaDisponivel: true,
        ),
      ),
    );

    final barra = tester.widget<AppBar>(find.byType(AppBar));
    expect(
      barra.actions ?? const <Widget>[],
      isEmpty,
      reason: 'REPROVA: `Perto` ocupou o slot de acao da direita. O 11.23.1 da '
          'UM slot de 64 x 64 ali, e sao TRES os controles de listagem: eles '
          'moram no corpo, no topo da lista. O `Filtros` desceu junto.',
    );
  });
}
