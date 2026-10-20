// O SELO e o FILTRO de "encontrado pela comunidade" na aba `Pets`.
//
// Decisao do cliente de 20/10/2026: *"o pet ganha um selo/filtro na pagina de
// pets como encontrado por 30 dias e depois ele expira e sai"*.
//
// ===========================================================================
// O QUE ESTE ARQUIVO MEDE, E O QUE ELE NAO CONSEGUE MEDIR
// ===========================================================================
// Ele mede o lado do APLICATIVO, e so ele: que o selo sai do campo da RESPOSTA
// e nao do pedido, que a lista PADRAO desenha os dois conjuntos com um selo
// cada, que o rotulo do leitor de tela acompanha o selo, que as pastilhas
// mandam `case_state` na consulta, que limpa-las o tiram, e que o cartao nao
// ganhou informacao nenhuma alem do selo.
//
// Ele **nao** mede nem pode medir as duas condicoes do selo -- a janela de 30
// dias e o sinal da comunidade. As duas sao do servidor, e um caso de widget que
// as "medisse" estaria medindo a propria massa que ele escreveu: e exatamente o
// defeito que a frente do pet perdido ja cometeu, com dezenas de casos verdes
// sobre `petDoContrato(status: 'lost', ...)` -- uma resposta que o servidor
// nunca emitiu.
//
// Quem mede aquelas duas:
//   - a FORMA da consulta:
//     src/modules/lostfound/adapters/persistence/selo-de-reencontro-na-listagem.test.ts
//   - o EFEITO, com 29 e 31 dias e com um reencontro sem conversa:
//     tests/integration/selo-de-reencontro-na-listagem-publica.test.ts
//
// ===========================================================================
// A ISCA, E COMO ELA FOI PROVADA
// ===========================================================================
// Em 20/10/2026, Flutter test. Base: 9 casos, 9 passaram. Cada desligamento foi
// confirmado por diferenca de conteudo do arquivo ANTES de a suite rodar.
//
// | o que foi desligado | placar | reprovaram, por nome |
// |---|---|---|
// | `_Selo(texto: seloDe(perdido), ...)` voltando a `_Selo(texto: selo)` | 5/4 | `ISCA: o item marcado desenha o selo do reencontro, e NAO "Perdido"`, `o cartao do reencontrado NAO ganha informacao alem do selo`, `ISCA: sem case_state, a lista desenha aberto E reencontrado`, `ISCA: a pastilha Encontrados manda case_state=reunited` |
// | `seloDe(p)` voltando a `selo` em `rotuloAcessivelDe` | 8/1 | `ISCA: o leitor de tela ouve o selo do reencontro, e nao "Perdido"` -- e SO ele, que e o ponto: o selo visual continuava certo |
// | o `GrupoDeFiltro` de `case_state` em `lista_de_perdidos.dart` | 5/4 | `ISCA: a pastilha Perdidos pede SO os abertos`, `ISCA: a pastilha Encontrados manda case_state=reunited`, `ISCA: limpar a pastilha tira case_state da consulta`, `a folha oferece os DOIS conjuntos, e nenhum nasce marcado` |
// | `estado:` do `copiar` em `_aplicarAFolha` | 6/3 | os tres casos de pastilha acima |
// | `'case_state': ?estado?.codigo` da `query` em `modelos_perdido.dart` | 6/3 | os mesmos tres |
// | `found_by_community` lido em `PerdidoPublico.doJson` | 4/5 | os quatro casos do primeiro grupo mais `ISCA: sem case_state, a lista desenha aberto E reencontrado` |
//
// A SEGUNDA LINHA e a que vale sublinhar: desligar so o rotulo acessivel deixa a
// tela visualmente certa e reprova UM caso, pelo nome. Sem ele, quem usa leitor
// de tela ouviria "Perdido" sobre um pet que voltou, com a suite verde -- e e
// exatamente a forma do `MergeSemantics` que esta casa achou escondendo titulo
// de leitor de tela nesta mesma rodada.
//
// A ULTIMA e a que a uniao tornou mais importante: com os dois conjuntos na
// MESMA pagina, um selo que nao venha por item marca o pet errado.

import 'package:bichu/api/modelos.dart';
import 'package:bichu/telas/perdido/cartao_do_perdido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Um `PublicLostPet`, com `found_by_community` **ausente por padrao**.
///
/// Ausente e nao `false`: e assim que um servidor mais antigo responde, e o
/// caminho de leitura do app tem de tratar os dois do mesmo jeito.
Map<String, dynamic> perdidoDoContrato({
  required String token,
  required String nome,
  bool? encontradoPelaComunidade,
}) {
  return <String, dynamic>{
    'share_token': token,
    'pet_display_name': nome,
    'species': 'dog',
    'size': 'P',
    'breed_label': 'Poodle',
    'primary_color': 'Caramelo',
    'area_label': 'Vila Mariana, São Paulo',
    'lost_since': '2026-10-15T12:00:00.000Z',
    'photo_url': null,
    'share_url': 'https://web.teste/p/$token',
    // `?valor` e nao `if (... != null)`: o `use_null_aware_elements` do
    // `analysis_options.yaml` cobra esta forma, e e a mesma que
    // `RecorteDePerdidos.query` usa para `case_state`.
    'found_by_community': ?encontradoPelaComunidade,
  };
}

Map<String, dynamic> paginaDePerdidos(
  List<Map<String, dynamic>> itens, {
  Map<String, String> filtros = const <String, String>{},
}) {
  return <String, dynamic>{
    'items': itens,
    'page': 1,
    'limit': 20,
    'total': itens.length,
    'applied_filters': filtros,
  };
}

/// A rede que responde A LISTAGEM conforme o `case_state` do PEDIDO.
///
/// Ela nao devolve corpo fixo: um duble que responde a mesma pagina para
/// qualquer `case_state` deixaria passar o defeito que estes casos existem para
/// pegar -- a tela pode nunca mandar o parametro, e nada perceberia.
Future<http.Response> Function(http.Request) redeQueRespeitaOConjunto({
  required List<Uri> urls,
}) {
  return (req) async {
    if (req.url.path != '/v1/public/lost-pets' || req.method != 'GET') {
      return problema('not-found', 404);
    }
    urls.add(req.url);
    final estado = req.url.queryParameters['case_state'];
    final mel = perdidoDoContrato(token: 'tk-mel', nome: 'Mel');
    final voltou = perdidoDoContrato(
      token: 'tk-voltou',
      nome: 'Voltou',
      encontradoPelaComunidade: true,
    );
    if (estado == 'reunited') {
      return json200(
        paginaDePerdidos(
          <Map<String, dynamic>>[voltou],
          filtros: const <String, String>{'case_state': 'reunited'},
        ),
      );
    }
    if (estado == 'open') {
      return json200(
        paginaDePerdidos(
          <Map<String, dynamic>>[mel],
          filtros: const <String, String>{'case_state': 'open'},
        ),
      );
    }
    // SEM `case_state`: a UNIAO, que e o recorte padrao desde a segunda decisao
    // do cliente de 20/10/2026 (*"Tambem na lista padrao"*). O duble responde
    // os DOIS, como o servidor responde, e e isso que permite medir se a tela
    // distingue cada cartao pelo campo da resposta.
    return json200(paginaDePerdidos(<Map<String, dynamic>>[mel, voltou]));
  };
}

RegiaoDeReferencia get regiaoDeSaoPaulo => const RegiaoDeReferencia(
      bairro: 'Vila Mariana',
      cidade: 'São Paulo',
      uf: 'SP',
    );

Future<void> abrirPets(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: depositoLogado(regiaoDeReferencia: regiaoDeSaoPaulo),
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
  await tester.pumpAndSettle();
}

/// Abre a folha de filtro pelo gatilho SO-ICONE, a direita do campo de busca.
Future<void> abrirAFolha(WidgetTester tester) async {
  final icone = find.byIcon(Icons.tune);
  expect(
    icone,
    findsOneWidget,
    reason: 'REPROVA: nao ha caminho para a folha de filtro. O gatilho e o '
        'icone `tune`, no topo do corpo e a direita do campo de busca.',
  );
  await tester.tap(icone);
  await tester.pumpAndSettle();
}

Future<void> escolherNaFolha(WidgetTester tester, String pastilha) async {
  await abrirAFolha(tester);
  final alvo = find.text(pastilha);
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
  await tester.tap(alvo);
  await tester.pumpAndSettle();
  final aplicar = find.text('Aplicar');
  await tester.ensureVisible(aplicar);
  await tester.pumpAndSettle();
  await tester.tap(aplicar);
  await tester.pumpAndSettle();
}

/// Os textos que UM cartao pinta, na ordem da arvore.
List<String> textosDoCartao(WidgetTester tester) {
  final cartao = find.byType(CartaoDoPerdido);
  expect(cartao, findsOneWidget, reason: 'esperava exatamente um cartao');
  return <String>[
    for (final e in find
        .descendant(of: cartao, matching: find.byType(Text))
        .evaluate())
      ((e.widget as Text).data ?? '')
  ].where((t) => t.isNotEmpty).toList();
}

void main() {
  group('o selo sai do campo da RESPOSTA, e nao do pedido', () {
    testWidgets(
      'ISCA: o item marcado desenha o selo do reencontro, e NAO "Perdido"',
      (tester) async {
        await abrirPets(
          tester,
          rede: (req) async {
            if (req.url.path != '/v1/public/lost-pets') {
              return problema('not-found', 404);
            }
            // **O PEDIDO NAO TEM `case_state`**, e o item vem marcado. E este o
            // ponto: se a tela desenhasse o selo a partir do conjunto que ela
            // pediu, este caso ficaria vermelho -- e o cartao, que e componente
            // compartilhado, mentiria na proxima tela que o reaproveitasse.
            expect(
              req.url.queryParameters.containsKey('case_state'),
              isFalse,
              reason: 'o atalho deste caso precisa pedir SEM conjunto',
            );
            return json200(
              paginaDePerdidos(<Map<String, dynamic>>[
                perdidoDoContrato(
                  token: 'tk-voltou',
                  nome: 'Voltou',
                  encontradoPelaComunidade: true,
                ),
              ]),
            );
          },
        );

        expect(
          find.text('Encontrado pela comunidade'),
          findsOneWidget,
          reason: 'REPROVA: o selo do reencontro nao foi desenhado. Ele e o que '
              'o cliente pediu ver, e sem ele o filtro recorta uma lista que '
              'parece igual a dos perdidos.',
        );
        expect(
          find.text('Perdido'),
          findsNothing,
          reason: 'REPROVA: o cartao diz "Perdido" sobre um animal que voltou. '
              'Os dois selos no mesmo cartao, ou o errado dos dois, e pior que '
              'selo nenhum.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: sem o campo na resposta, o cartao continua dizendo "Perdido"',
      (tester) async {
        await abrirPets(
          tester,
          rede: (req) async {
            if (req.url.path != '/v1/public/lost-pets') {
              return problema('not-found', 404);
            }
            // Campo AUSENTE, que e como um servidor sem esta entrega responde.
            return json200(
              paginaDePerdidos(<Map<String, dynamic>>[
                perdidoDoContrato(token: 'tk-mel', nome: 'Mel'),
              ]),
            );
          },
        );

        expect(find.text('Perdido'), findsOneWidget);
        expect(
          find.text('Encontrado pela comunidade'),
          findsNothing,
          reason: 'REPROVA: campo ausente virou selo. Um `?? true` nesta leitura '
              'poria o selo em todo pet de uma versao de servidor que nao o '
              'emite -- e esta casa ja pagou por um `?? true` que afirmava '
              'aviso ao tutor sem aviso nenhum.',
        );
      },
    );

    testWidgets(
      'ISCA: o leitor de tela ouve o selo do reencontro, e nao "Perdido"',
      (tester) async {
        // O cartao e `excludeSemantics: true` com um `label` montado a mao: um
        // selo que mudasse so no visual deixaria quem usa leitor de tela ouvindo
        // "Perdido" sobre um pet que voltou -- e seria um caso verde afirmando o
        // contrario do que a tela mostra.
        await abrirPets(
          tester,
          rede: (req) async {
            if (req.url.path != '/v1/public/lost-pets') {
              return problema('not-found', 404);
            }
            return json200(
              paginaDePerdidos(<Map<String, dynamic>>[
                perdidoDoContrato(
                  token: 'tk-voltou',
                  nome: 'Voltou',
                  encontradoPelaComunidade: true,
                ),
              ]),
            );
          },
        );

        // O `label` do no do PROPRIO cartao. Ele e `excludeSemantics: true`,
        // entao nao ha filho a percorrer: o rotulo inteiro esta neste no, e e
        // o que `rotuloAcessivelDe` montou.
        final doCartao =
            tester.getSemantics(find.byType(CartaoDoPerdido).first).label;

        expect(
          doCartao,
          contains('Encontrado pela comunidade'),
          reason: 'REPROVA: o rotulo acessivel do cartao nao diz o selo do '
              'reencontro. `rotuloAcessivelDe` tem de ler `seloDe(p)`, e nao a '
              'constante `selo`.',
        );
        expect(
          doCartao.startsWith('Perdido'),
          isFalse,
          reason: 'REPROVA: o rotulo comeca com "Perdido" num pet que voltou.',
        );
      },
    );

    testWidgets(
      'o cartao do reencontrado NAO ganha informacao alem do selo',
      (tester) async {
        // A decisao foi UM selo. Data de volta, nome de quem achou, contagem de
        // avistamentos -- nada disso foi decidido, e cada linha a mais e dado
        // novo sobre o animal e sobre o lugar numa superficie sem conta
        // (Emenda 4 do ADR-0010).
        await abrirPets(
          tester,
          rede: (req) async {
            if (req.url.path != '/v1/public/lost-pets') {
              return problema('not-found', 404);
            }
            return json200(
              paginaDePerdidos(<Map<String, dynamic>>[
                perdidoDoContrato(
                  token: 'tk-voltou',
                  nome: 'Voltou',
                  encontradoPelaComunidade: true,
                ),
              ]),
            );
          },
        );

        final linhas = textosDoCartao(tester);

        expect(
          linhas.take(4).toList(),
          <String>[
            'Encontrado pela comunidade',
            'Voltou',
            'Cão · Poodle · Pequeno · Caramelo',
            'Vila Mariana, São Paulo',
          ],
          reason: 'REPROVA: o cartao do reencontrado tem linha a mais, a menos, '
              'ou em outra ordem. As cinco linhas sao as MESMAS do cartao de '
              'perdido, com o selo trocado -- e so isso foi decidido.',
        );
        // A QUINTA linha entra por PREFIXO, e nao por texto exato: ela e
        // relativa ao relogio ("ha 5 dias" hoje, "em 15/10/2026" na semana que
        // vem), e um texto exato aqui seria um caso que reprova sozinho com o
        // passar dos dias. O que importa e que ela existe e e a de sempre.
        expect(linhas, hasLength(5), reason: 'o cartao ganhou ou perdeu linha');
        expect(linhas[4], startsWith('Visto por último'));
      },
    );
  });

  group('a lista PADRAO traz os dois, e cada cartao diz qual e', () {
    testWidgets(
      'ISCA: sem `case_state`, a lista desenha aberto E reencontrado, cada um com o seu selo',
      (tester) async {
        // A decisao do cliente de 20/10/2026, segunda rodada: *"Tambem na lista
        // padrao"*. O risco dela e este caso: os dois chegam na MESMA pagina, e
        // um selo por pagina (em vez de por item) poria o chip de "encontrado"
        // num pet que ainda esta na rua -- ou tiraria o chip do que voltou.
        final urls = <Uri>[];
        await abrirPets(tester, rede: redeQueRespeitaOConjunto(urls: urls));

        expect(urls, isNotEmpty, reason: 'a tela nao chamou a rota');
        expect(
          urls.single.queryParameters.containsKey('case_state'),
          isFalse,
          reason: 'REPROVA: a pagina abriu MANDANDO o conjunto. A ausencia e o '
              'recorte padrao do servidor, e mandar `open` ESCONDERIA os '
              'reencontrados de quem nunca abriu a folha -- alem de voltar em '
              '`applied_filters` como filtro numa pagina que ninguem filtrou.',
        );

        expect(find.text('Mel'), findsOneWidget);
        expect(find.text('Voltou'), findsOneWidget);
        expect(
          find.text('Perdido'),
          findsOneWidget,
          reason: 'REPROVA: o selo de perdido nao esta em exatamente UM cartao. '
              'Se esta em dois, o reencontrado foi marcado como procurado e '
              'alguem sai atras de um animal que esta em casa.',
        );
        expect(
          find.text('Encontrado pela comunidade'),
          findsOneWidget,
          reason: 'REPROVA: o selo de reencontro nao esta em exatamente UM '
              'cartao na lista misturada.',
        );
      },
    );

    testWidgets(
      'ISCA: a pastilha Perdidos pede SO os abertos',
      (tester) async {
        // O caminho de volta para o recorte de antes do selo. Sem ele, quem nao
        // quer ver reencontrado nao tem como.
        final urls = <Uri>[];
        await abrirPets(tester, rede: redeQueRespeitaOConjunto(urls: urls));
        await escolherNaFolha(tester, 'Perdidos');

        expect(
          urls.last.queryParameters['case_state'],
          'open',
          reason: 'REPROVA: escolher `Perdidos` nao pediu o recorte so-abertos.',
        );
        expect(find.text('Voltou'), findsNothing);
        expect(find.text('Mel'), findsOneWidget);
      },
    );

    testWidgets(
      'ISCA: a pastilha Encontrados manda case_state=reunited',
      (tester) async {
        final urls = <Uri>[];
        await abrirPets(tester, rede: redeQueRespeitaOConjunto(urls: urls));

        await escolherNaFolha(tester, 'Encontrados');

        expect(
          urls.last.queryParameters['case_state'],
          'reunited',
          reason: 'REPROVA: escolher `Encontrados` nao trocou o conjunto na '
              'consulta. Sem isto o filtro existe na folha e nao filtra nada.',
        );
        expect(
          urls.last.queryParameters['page'],
          '1',
          reason: 'REPROVA: trocar de conjunto nao voltou para a pagina 1. A '
              'pagina 3 dos perdidos nao existe na lista de encontrados, e a '
              'tela mostraria vazio com itens atras.',
        );
        expect(
          find.text('Encontrado pela comunidade'),
          findsOneWidget,
          reason: 'REPROVA: o conjunto trocou e a lista nao redesenhou o selo.',
        );
      },
    );

    testWidgets(
      'ISCA: limpar a pastilha tira case_state da consulta',
      (tester) async {
        final urls = <Uri>[];
        await abrirPets(tester, rede: redeQueRespeitaOConjunto(urls: urls));
        await escolherNaFolha(tester, 'Encontrados');
        expect(urls.last.queryParameters['case_state'], 'reunited');

        // `Limpar` na folha, e nao outra pastilha: e o caminho de volta, e era
        // ele que estava quebrado em `period` -- a tela repunha o valor e a
        // lista continuava recortada sem ninguem ter pedido.
        await abrirAFolha(tester);
        final limpar = find.text('Limpar');
        await tester.ensureVisible(limpar);
        await tester.pumpAndSettle();
        await tester.tap(limpar);
        await tester.pumpAndSettle();
        final aplicar = find.text('Aplicar');
        await tester.ensureVisible(aplicar);
        await tester.pumpAndSettle();
        await tester.tap(aplicar);
        await tester.pumpAndSettle();

        expect(
          urls.last.queryParameters.containsKey('case_state'),
          isFalse,
          reason: 'REPROVA: limpar a pastilha nao tirou o conjunto da consulta. '
              'Quem escolheu `Encontrados` por curiosidade ficaria preso nele.',
        );
        // E a lista volta a trazer os DOIS, que e o recorte padrao.
        expect(find.text('Mel'), findsOneWidget);
        expect(find.text('Voltou'), findsOneWidget);
      },
    );

    testWidgets(
      'a folha oferece os DOIS conjuntos, e nenhum nasce marcado',
      (tester) async {
        await abrirPets(
          tester,
          rede: redeQueRespeitaOConjunto(urls: <Uri>[]),
        );
        await abrirAFolha(tester);

        expect(find.text('Estado'), findsOneWidget);
        expect(find.text('Perdidos'), findsOneWidget);
        expect(find.text('Encontrados'), findsOneWidget);
        expect(
          find.text(
            'A lista já traz os dois. Encontrados mostra só quem voltou com a '
            'ajuda de alguém da comunidade, nos últimos 30 dias.',
          ),
          findsOneWidget,
          reason: 'REPROVA: a folha nao diz as duas condicoes do selo. Sem a '
              'nota, `Encontrados` parece "todos os que ja voltaram", e a lista '
              'vazia de quem escolher a pastilha vira um defeito aparente.',
        );
      },
    );
  });
}
