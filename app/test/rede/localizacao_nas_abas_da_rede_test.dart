// A INTELIGENCIA DE LOCALIZACAO DO `Pets` NAS DUAS ABAS DA `Rede` -- cliente,
// 20/10/2026.
//
// Palavra por palavra: *"nos eventos e na comunidade, voce tambem deve trazer
// os mais proximos da localizacao, utilizar a mesma inteligencia do pets"*.
//
// ---------------------------------------------------------------------------
// O QUE `A INTELIGENCIA DO PETS` E -- E O QUE ELA NAO E
// ---------------------------------------------------------------------------
//
// **Ela NAO e ordenar por latitude e longitude.** Ela resolve a **cidade** a
// partir da coordenada, no aparelho, e manda o NOME da cidade. O ADR-0006 e
// explicito -- *"A listagem publica de perdidos filtra por cidade e bairro
// digitados, jamais por latitude e longitude"* -- e a **emenda 1** (19/10/2026)
// autorizou um sentido so, coordenada -> nome de cidade. O inverso segue
// proibido e e cobrado por `test/dispositivo/sem_geocodificacao_test.dart`.
//
// O molde e a decisao do cliente de 19/10 para os pets: *"o campo cidade do
// filtro da pagina pet nao deve ser obrigatorio, mas devemos filtrar pelos 20
// ultimos pets cadastrados e ordenar pela cidade da localizacao dele e deixar
// que ele altere os filtros manualmente"*. Quatro coisas, e as quatro sao
// medidas aqui: cidade NAO obrigatoria, lista com os mais recentes quando nao
// ha cidade, recorte pela cidade do aparelho quando ha, e filtro editavel.
//
// ---------------------------------------------------------------------------
// A ORDEM POR DISTANCIA DAS DUAS ABAS JA EXISTIA, E NAO E ISTO
// ---------------------------------------------------------------------------
//
// Medido no servidor antes de escrever uma linha de app:
//
// - `listNearbyNetworkEvents` (`Eventos`) ordena por
//   `ST_Distance(e.geo, <reference_point>)`;
// - `listDirectoryEntries` com `sort=distance` (`Comunidade`) ordena por
//   `ST_Distance(professionals.geo, <reference_point>)`.
//
// Nos dois, o ponto e o que o SERVIDOR guarda por aparelho
// (`user_reference_locations`, par `(user_id, session_family_id)`), e ele
// **nunca entra na requisicao** -- entra como subconsulta escalar, e o que
// atravessa a borda e `distance_m`, um numero e nao uma posicao. Isso e
// permitido pelo ADR-0006 e continua intocado.
//
// **As duas coisas se somam:** a cidade recorta QUAIS itens entram, a distancia
// ordena os que entraram. Por isso nenhum caso aqui mexe em `distance_m`.
//
// ---------------------------------------------------------------------------
// DESLIGAR PARA VER REPROVAR -- medido, com o nome do caso
// ---------------------------------------------------------------------------
//
//  1. Em `lib/telas/rede/agenda_da_rede.dart`, apague a linha
//     `_criarAResolucaoDaCidade();` de `didChangeDependencies`.
//     -> reprova `a cidade do aparelho RECORTA a agenda: city sai na consulta`
//        e `a caixa DESAPARECE quando a cidade do aparelho chega`.
//     -> **NAO reprova** `sem cidade, a agenda ainda traz os eventos mais
//        recentes`, e essa assimetria e o ponto: o caso sem cidade mede a
//        lista continuar servindo, e nao o mecanismo existir.
//  2. No mesmo arquivo, troque `cidade: cidade, semCidade: cidade == null` em
//     `_carregar` por nada (deixe so a `pagina`).
//     -> reprova `a cidade do aparelho RECORTA a agenda`. O resolvedor
//        continua correndo e a caixa continua saindo -- o que quebra e so o
//        recorte chegar a rota.
//  3. No mesmo arquivo, troque o criterio da caixa por
//     `aoUsarLocalizacao: null` fixo.
//     -> reprova `o toque em Usar minha localizacao resolve e recarrega`.
//  4. Em `lib/widgets/cidade_por_localizacao.dart`, troque a primeira linha de
//     `CaixaDeLocalizacao.build` por `if (false)`.
//     -> reprova `a caixa DESAPARECE quando a cidade do aparelho chega` e
//        `a caixa DESAPARECE quando a cidade vem do filtro`. Os dois juntos
//        sao o requisito: a caixa sai pela CIDADE EM USO, e nao por quem a
//        resolveu.
//  5. No mesmo arquivo, troque o criterio por `if (aviso != null)` -- a
//     armadilha de usar o estado da interacao em vez da cidade.
//     -> reprova `a caixa DESAPARECE quando a cidade vem do filtro` (nao ha
//        aviso nenhum nesse caminho) e **continua verde** no caso do aparelho.
//        E essa assimetria que mostra que `pessoa mexeu` nao serve de criterio.
//  6. Em `lib/widgets/cidade_por_localizacao.dart`, apague
//     `_folhaDecidiuACidade = false;` do corpo de `_usarMinhaLocalizacao`
//     (em `agenda_da_rede.dart`).
//     -> reprova `o toque GANHA da cidade do filtro`, que e o defeito de
//        20/10 nos pets inteiro: a permissao e gasta, a cidade volta, e nada
//        muda na tela.
//  7. Em `lib/api/modelos_diretorio.dart`, apague `'city': ?cidadeQueVai` do
//     `query`.
//     -> reprova `Comunidade: a cidade vai como city na consulta`.
//  8. No mesmo `query`, acrescente `'lat': '-23.55', 'lon': '-46.63'`.
//     -> reprova `ISCA -- nenhuma consulta das duas abas carrega lat nem lon`
//        e `ISCA -- o recorte do diretorio nao tem lat nem lon`. Este e o
//        contrapeso do ADR-0006, e ele existe para reprovar quem "resolver" o
//        pedido pelo caminho proibido.

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/telas/rede/cartao_do_encontro.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/cidade_por_localizacao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';
import 'fixtures_da_rede.dart';

/// A agenda com DUAS cidades, para o recorte ter o que mudar.
///
/// `Sao Paulo` e a cidade que `LocalizacaoDeTeste` resolve do ponto que ela
/// devolve; `Campinas` e a outra. Uma agenda de uma cidade so deixaria o caso
/// do recorte verde mesmo sem recorte nenhum.
RedeDeTeste redeComDuasCidades() {
  return RedeDeTeste(<String, http.Response Function(http.Request)>{
    'GET /v1/network/events': (req) {
      final cidade = req.url.queryParameters['city'];
      final todos = <Map<String, dynamic>>[
        encontroPublico(
          slug: 'passeio-sp',
          title: 'Passeio em São Paulo',
          city: 'Sao Paulo',
        ),
        encontroPublico(
          slug: 'feira-campinas',
          title: 'Feira em Campinas',
          city: 'Campinas',
          placeName: 'Parque Portugal',
          neighborhood: 'Taquaral',
        ),
      ];
      if (cidade == null) return json200(pagina(todos));
      // O servidor de verdade compara por `texto_para_busca`; aqui basta a
      // igualdade, porque o duble so precisa distinguir as duas cidades.
      return json200(
        pagina(<Map<String, dynamic>>[
          if (cidade == 'Sao Paulo') todos.first,
          if (cidade == 'Campinas') todos.last,
        ]),
      );
    },
    'GET /v1/network/events/nearby': (req) => json200(
          paginaPorPerto(<Map<String, dynamic>>[
            porPerto(encontroPublico(slug: 'passeio-sp'), 1200),
          ]),
        ),
  });
}

/// Abre a aba `Eventos` da `Rede` com uma porta de localizacao escolhida.
///
/// `abrirRede` de `fixtures_da_rede.dart` nao passa `localizacao`, e por isso
/// nao serve aqui: o que estes casos medem e justamente o que a porta devolve.
Future<void> abrirEventos(
  WidgetTester tester, {
  required RedeDeTeste rede,
  required Localizacao localizacao,
  bool comRegiao = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede.call,
    localizacao: localizacao,
    deposito: depositoLogado(
      regiaoDeReferencia: comRegiao ? regiaoDeTeste : null,
    ),
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
  await tester.pumpAndSettle();
}

/// Marca uma opcao na folha de filtro e aplica.
///
/// `find.text(opcao).last` e nao `.first`: o nome da cidade aparece TAMBEM nos
/// cartoes atras da folha, e um `find.text` cru daria ambiguidade. A folha e o
/// ultimo a ser construido. O mesmo arranjo de `escolher`, em
/// `agenda_da_rede_test.dart`.
Future<void> escolherNaFolhaDaAgenda(WidgetTester tester, String opcao) async {
  await tester.tap(find.byIcon(Icons.tune));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text(opcao).last);
  await tester.tap(find.text(opcao).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Aplicar'));
  await tester.pumpAndSettle();
}

/// Uma entrada do diretorio, como `DirectoryEntrySummary` a declara.
///
/// **Local, e nao importada de `perto_com_dados_test.dart`:** aquelas fabricas
/// moram num arquivo de CASOS, e importar um `_test.dart` de outro amarra duas
/// suites que nao tem relacao. Aqui so o que estes casos precisam -- `slug`,
/// nome e cidade --, no formato do contrato.
Map<String, dynamic> entradaDoDiretorio({
  required String slug,
  required String nome,
  required String cidade,
}) =>
    <String, dynamic>{
      'slug': slug,
      'kind': 'clinic',
      'display_name': nome,
      'city': cidade,
      'state': 'SP',
      'neighborhood': 'Centro',
      'about': null,
      'phone_e164': null,
      'verification': <String, dynamic>{
        'level': 'none',
        'evidence_kinds': <String>[],
      },
      // **Nula, e de proposito.** `distance_available: false` -- estes casos
      // medem o recorte por CIDADE, e por uma conta diferente: a distancia vem
      // do ponto que o SERVIDOR guarda, e nao do GPS, entao ela nao e afetada
      // pelo que estes casos mexem.
      'distance_m': null,
    };

/// A resposta de `DirectoryEntryPage`.
Map<String, dynamic> paginaDoDiretorio(List<Map<String, dynamic>> itens) =>
    <String, dynamic>{
      'items': itens,
      'page': 1,
      'limit': 20,
      'total': itens.length,
      'distance_available': false,
      'applied_filters': <String, String>{'scope': 'all'},
    };

/// Todas as cidades que sairam em `city` na agenda, na ordem das chamadas.
///
/// **A chave de `chamadasA` e METODO e caminho**, e nao o caminho sozinho: sem
/// o `GET ` a lista volta vazia e um `everyElement(isNull)` fica verde sobre
/// nada. Por isso ela mora aqui, montada num lugar so.
List<String?> cidadesPedidas(RedeDeTeste rede) => rede
    .chamadasA('GET /v1/network/events')
    .map((r) => r.url.queryParameters['city'])
    .toList();

void main() {
  group('Eventos: a cidade do aparelho recorta a agenda', () {
    testWidgets(
      'a cidade do aparelho RECORTA a agenda: city sai na consulta',
      (tester) async {
        final rede = redeComDuasCidades();
        await abrirEventos(
          tester,
          rede: rede,
          // Permissao concedida e servico ligado: o duble resolve `Sao Paulo`.
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida),
        );

        final cidades = cidadesPedidas(rede);
        expect(
          cidades,
          contains('Sao Paulo'),
          reason:
              'REPROVA: a agenda nunca pediu `city`. A cidade que o aparelho '
              'resolveu nao chegou a consulta, e a lista continua a do pais '
              'inteiro -- o recorte que o cliente pediu em 20/10 nao existe.',
        );

        // E o recorte TEM efeito na tela: a outra cidade sai.
        expect(
          find.widgetWithText(CartaoDoEncontro, 'Passeio em São Paulo'),
          findsOneWidget,
        );
        expect(
          find.widgetWithText(CartaoDoEncontro, 'Feira em Campinas'),
          findsNothing,
          reason:
              'REPROVA: a agenda pediu `city` e continuou mostrando a outra '
              'cidade. O parametro saiu e a lista nao acompanhou.',
        );
      },
    );

    testWidgets(
      'sem cidade, a agenda ainda traz os eventos mais recentes',
      (tester) async {
        // **O DEFEITO QUE O CLIENTE CONSERTOU NOS PETS, E QUE NAO VOLTA AQUI.**
        // A pagina de pets tinha uma fase `semCidade` que nao chamava a rota:
        // sem cidade, a tela ficava vazia esperando alguem digitar. Ele tirou a
        // obrigatoriedade em 19/10. A `Rede` nasce sem essa fase, e este caso e
        // o que impede alguem de a introduzir junto com o recorte.
        final rede = redeComDuasCidades();
        await abrirEventos(
          tester,
          rede: rede,
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.negada),
        );

        expect(
          cidadesPedidas(rede),
          everyElement(isNull),
          reason:
              'REPROVA: a agenda mandou `city` sem ter cidade resolvida. '
              'Recortar por uma cidade que ninguem resolveu nem escolheu e a '
              '"cidade errada derivada em silencio".',
        );
        expect(
          find.byType(CartaoDoEncontro),
          findsNWidgets(2),
          reason:
              'REPROVA: sem cidade a agenda ficou sem conteudo. A cidade NAO e '
              'obrigatoria (cliente, 19/10 nos pets): sem ela a lista traz os '
              'mais recentes de todas as cidades, e nao o vazio.',
        );
      },
    );

    testWidgets(
      'o toque em Usar minha localizacao resolve e recarrega',
      (tester) async {
        final rede = redeComDuasCidades();
        final porta = LocalizacaoDeTeste(
          PermissaoDeLocalizacao.naoPedida,
          depoisDePedir: PermissaoDeLocalizacao.concedida,
        );
        await abrirEventos(tester, rede: rede, localizacao: porta);

        // Sem permissao, nada de cidade -- e a caixa esta na tela.
        expect(cidadesPedidas(rede), everyElement(isNull));

        await tester.tap(
          find.widgetWithText(
            TextButton,
            CaixaDeLocalizacao.rotuloDeUsarLocalizacao,
          ),
        );
        await tester.pumpAndSettle();

        expect(
          porta.vezesQuePediu,
          1,
          reason: 'REPROVA: o toque nao pediu a permissao ao sistema.',
        );
        expect(
          cidadesPedidas(rede),
          contains('Sao Paulo'),
          reason:
              'REPROVA: o toque pediu a permissao, gastou uma resolucao do '
              'teto de uso da plataforma, recebeu a cidade e NAO recarregou a '
              'lista. E o defeito de 20/10/2026 nos pets, aqui.',
        );
      },
    );

    testWidgets(
      'limpar a cidade LIMPA: a derivada nao volta sozinha',
      (tester) async {
        // **E o par do caso de cima, e o que impede a correcao de virar
        // defeito.** Se a cidade derivada morasse no recorte, ou se o sinal da
        // folha fosse um `containsKey` cru, ela voltaria no proximo `copiar` e
        // desfaria a limpeza -- quem apagou o filtro de proposito veria a lista
        // recortada de novo, sem nada na tela explicando.
        final rede = redeComDuasCidades();
        await abrirEventos(
          tester,
          rede: rede,
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida),
        );
        expect(cidadesPedidas(rede).last, 'Sao Paulo');

        // Tocar no que ja esta marcado DESMARCA (`barra_de_listagem.dart`).
        await escolherNaFolhaDaAgenda(tester, 'Sao Paulo');

        expect(
          cidadesPedidas(rede).last,
          isNull,
          reason:
              'REPROVA: limpar a cidade no filtro nao limpou. A cidade do '
              'aparelho voltou por cima da decisao de quem acabou de apaga-la.',
        );
        expect(
          find.byType(CartaoDoEncontro),
          findsNWidgets(2),
          reason:
              'REPROVA: sem cidade a agenda ficou sem conteudo. Limpar o '
              'recorte devolve os mais recentes de todas as cidades.',
        );
      },
    );

    testWidgets(
      'o toque GANHA da cidade do filtro',
      (tester) async {
        // **A ARMADILHA DO `_pessoaMexeu`, medida pelo caminho em que ela
        // aparece de verdade.**
        //
        // Com cidade em uso a caixa nao esta na tela (e o requisito), entao a
        // sequencia que reproduz o defeito e: a derivada chega, a pessoa LIMPA
        // o filtro -- a caixa volta --, e ela toca em `Usar minha localizacao`.
        // Um guarda de "a pessoa mexeu" ficaria ligado desde a limpeza e
        // descartaria a resolucao: a permissao seria gasta, a cidade chegaria e
        // a lista nao trocaria um pixel. E o defeito de 20/10/2026 nos pets.
        final rede = redeComDuasCidades();
        await abrirEventos(
          tester,
          rede: rede,
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida),
        );
        await escolherNaFolhaDaAgenda(tester, 'Sao Paulo');
        expect(cidadesPedidas(rede).last, isNull);

        await tester.tap(
          find.widgetWithText(
            TextButton,
            CaixaDeLocalizacao.rotuloDeUsarLocalizacao,
          ),
        );
        await tester.pumpAndSettle();

        expect(
          cidadesPedidas(rede).last,
          'Sao Paulo',
          reason:
              'REPROVA: o toque em `Usar minha localizacao` nao devolveu o '
              'recorte. No toque a pessoa acabou de escolher a localizacao: ela '
              'e a escolha mais nova e ganha do que foi filtrado antes.',
        );
        expect(
          find.text(CaixaDeLocalizacao.rotuloDeUsarLocalizacao),
          findsNothing,
          reason:
              'REPROVA: a caixa ficou na tela depois de o toque resolver a '
              'cidade. Resolvida, fica so a cidade dentro do filtro.',
        );
      },
    );

    testWidgets(
      'a caixa DESAPARECE quando a cidade do aparelho chega',
      (tester) async {
        final rede = redeComDuasCidades();
        await abrirEventos(
          tester,
          rede: rede,
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida),
        );
        expect(
          find.text(CaixaDeLocalizacao.rotuloDeUsarLocalizacao),
          findsNothing,
          reason:
              'REPROVA: a caixa de localizacao ficou na tela com a cidade ja '
              'resolvida. Decisao do cliente de 20/10/2026: resolvida, fica '
              '**so a cidade dentro do filtro**.',
        );
      },
    );

    testWidgets(
      'a caixa APARECE enquanto nao ha cidade',
      (tester) async {
        final rede = redeComDuasCidades();
        await abrirEventos(
          tester,
          rede: rede,
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.negada),
        );
        expect(
          find.text(CaixaDeLocalizacao.rotuloDeUsarLocalizacao),
          findsOneWidget,
          reason:
              'REPROVA: sem cidade resolvida a aba nao oferece a localizacao. '
              'Quem nao concedeu a permissao fica sem caminho nenhum ate o '
              'recorte da propria cidade.',
        );
      },
    );

    testWidgets(
      'ISCA -- nenhuma consulta das duas abas carrega lat nem lon',
      (tester) async {
        // **O CONTRAPESO DO ADR-0006.** Ordenar por coordenada e o caminho
        // curto e proibido: *"jamais por latitude e longitude"*. A emenda 1
        // autorizou coordenada -> cidade, e so isso. Este caso reprova quem
        // "resolver" o pedido do cliente pelo caminho vedado -- em QUALQUER
        // uma das rotas que as duas abas usam.
        final rede = redeComDuasCidades();
        await abrirEventos(
          tester,
          rede: rede,
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida),
        );

        const proibidos = <String>[
          'lat',
          'lon',
          'lng',
          'latitude',
          'longitude',
          'point',
          'coords',
        ];
        for (final chamada in rede.chamadas) {
          final parametros = chamada.url.queryParameters.keys.toList();
          for (final proibido in proibidos) {
            expect(
              parametros,
              isNot(contains(proibido)),
              reason:
                  'REPROVA: `${chamada.url.path}` recebeu `$proibido`. A '
                  'coordenada nasce e morre dentro de '
                  '`Localizacao.cidadeAproximada`; o que vai para a rota e o '
                  'NOME da cidade. Por coordenada em consulta publica e o que '
                  'o ADR-0006 proibe, e mudar isso e emenda de ADR.',
            );
          }
        }
      },
    );
  });

  group('a caixa compartilhada pelas tres secoes', () {
    // A regra de aparecer e sair mora NUM lugar, e por isso ela e medida num
    // lugar: as tres secoes (`Pets`, `Eventos`, `Comunidade`) montam esta mesma
    // caixa, e tres copias do criterio divergiriam na proxima correcao.
    Future<void> montarACaixa(
      WidgetTester tester, {
      required String? cidadeEmUso,
      AvisoDaCidadeDoAparelho? aviso,
      bool podeOferecer = true,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: Scaffold(
            body: CaixaDeLocalizacao(
              cidadeEmUso: cidadeEmUso,
              explicacao: 'Mostrando os mais recentes de todas as cidades.',
              podeOferecer: podeOferecer,
              aviso: aviso,
              aoUsarLocalizacao: () {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('sem cidade em uso, a caixa aparece', (tester) async {
      await montarACaixa(tester, cidadeEmUso: null);
      expect(
        find.text(CaixaDeLocalizacao.rotuloDeUsarLocalizacao),
        findsOneWidget,
      );
      expect(
        find.text('Mostrando os mais recentes de todas as cidades.'),
        findsOneWidget,
      );
    });

    testWidgets(
      'a caixa DESAPARECE quando a cidade vem do filtro',
      (tester) async {
        // **E ESTE CASO QUE DIZ QUE O CRITERIO E `ha cidade em uso`.** Aqui nao
        // ha aviso, nao ha resolucao e ninguem tocou em nada: ha cidade. Um
        // criterio escrito sobre a interacao da pessoa (`_pessoaMexeu`, o
        // defeito de 20/10) ou sobre o aviso ficaria verde no caso do aparelho
        // e reprovaria aqui.
        await montarACaixa(tester, cidadeEmUso: 'Campinas');
        expect(
          find.text(CaixaDeLocalizacao.rotuloDeUsarLocalizacao),
          findsNothing,
          reason:
              'REPROVA: a caixa ficou na tela com a cidade escolhida no filtro. '
              'Cidade em uso e cidade em uso, venha do aparelho ou da folha: as '
              'duas sao "resolvida" para quem olha a tela.',
        );
      },
    );

    testWidgets(
      'sem como oferecer, a caixa nao existe',
      (tester) async {
        // `LocalizacaoNaoEmbarcada` (compilacao sem o plugin) responde
        // `indisponivel`. Um botao que pede a permissao, falha e volta com a
        // terceira frase e `acao sem destino` -- pior que botao nenhum, porque
        // ele *parece* ter funcionado. Mesmo criterio da pagina de pets.
        await montarACaixa(tester, cidadeEmUso: null, podeOferecer: false);
        expect(
          find.text(CaixaDeLocalizacao.rotuloDeUsarLocalizacao),
          findsNothing,
          reason:
              'REPROVA: a caixa oferece a localizacao num aparelho que nao tem '
              'como entrega-la.',
        );
      },
    );

    testWidgets('as quatro frases nao culpam e oferecem saida',
        (tester) async {
      for (final aviso in AvisoDaCidadeDoAparelho.values) {
        await montarACaixa(tester, cidadeEmUso: null, aviso: aviso);
        final texto = CaixaDeLocalizacao.textoDoAviso(aviso);
        expect(texto, isNotNull);
        expect(find.text(texto!), findsOneWidget);
      }
    });
  });

  group('Comunidade: a cidade do aparelho recorta o diretorio', () {
    /// O diretorio com DUAS cidades, e 404 em qualquer outra rota.
    ///
    /// 404 no resto e deliberado (o mesmo de `perto_com_dados_test.dart`): a
    /// aba `Eventos` monta antes desta e pede `/network/events`; deixar aquela
    /// chamada em 200 vazio esconderia um caso que dependesse dela.
    Future<http.Response> Function(http.Request) redeDoDiretorioComDuasCidades(
      List<Uri> urls,
    ) {
      return (req) async {
        if (req.url.path != '/v1/directory/entries' || req.method != 'GET') {
          return problema('not-found', 404);
        }
        urls.add(req.url);
        final cidade = req.url.queryParameters['city'];
        final todas = <Map<String, dynamic>>[
          entradaDoDiretorio(
            slug: 'clinica-sp',
            nome: 'Clínica Paulista',
            cidade: 'Sao Paulo',
          ),
          entradaDoDiretorio(
            slug: 'clinica-campinas',
            nome: 'Clínica Campineira',
            cidade: 'Campinas',
          ),
        ];
        return json200(
          paginaDoDiretorio(
            cidade == null
                ? todas
                : <Map<String, dynamic>>[
                    for (final e in todas)
                      if (e['city'] == cidade) e,
                  ],
          ),
        );
      };
    }

    Future<void> abrirComunidade(
      WidgetTester tester, {
      required Future<http.Response> Function(http.Request) rede,
      required Localizacao localizacao,
    }) async {
      await abrirOApp(
        tester,
        rede: rede,
        localizacao: localizacao,
        deposito: depositoLogado(),
      );
      await abrirAComunidade(tester);
    }

    List<String?> cidadesDoDiretorio(List<Uri> urls) =>
        urls.map((u) => u.queryParameters['city']).toList();

    testWidgets(
      'a cidade do aparelho RECORTA o diretorio: city sai na consulta',
      (tester) async {
        final urls = <Uri>[];
        await abrirComunidade(
          tester,
          rede: redeDoDiretorioComDuasCidades(urls),
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida),
        );

        expect(
          cidadesDoDiretorio(urls),
          contains('Sao Paulo'),
          reason:
              'REPROVA: o diretorio nunca pediu `city`. A cidade que o aparelho '
              'resolveu nao chegou a consulta, e a aba `Comunidade` continua a '
              'lista do pais inteiro.',
        );
        expect(find.text('Clínica Paulista'), findsOneWidget);
        expect(
          find.text('Clínica Campineira'),
          findsNothing,
          reason:
              'REPROVA: o diretorio pediu `city` e continuou mostrando a outra '
              'cidade. O parametro saiu e a lista nao acompanhou.',
        );
      },
    );

    testWidgets(
      'sem cidade, o diretorio ainda traz profissionais',
      (tester) async {
        final urls = <Uri>[];
        await abrirComunidade(
          tester,
          rede: redeDoDiretorioComDuasCidades(urls),
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.negada),
        );
        expect(
          cidadesDoDiretorio(urls),
          everyElement(isNull),
          reason:
              'REPROVA: o diretorio mandou `city` sem cidade resolvida -- a '
              '"cidade errada derivada em silencio".',
        );
        expect(
          find.text('Clínica Paulista'),
          findsOneWidget,
          reason:
              'REPROVA: sem cidade a `Comunidade` ficou sem conteudo. A cidade '
              'NAO e obrigatoria: sem ela a lista traz todas as cidades.',
        );
        expect(find.text('Clínica Campineira'), findsOneWidget);
      },
    );

    testWidgets(
      'a caixa APARECE na Comunidade enquanto nao ha cidade',
      (tester) async {
        final urls = <Uri>[];
        await abrirComunidade(
          tester,
          rede: redeDoDiretorioComDuasCidades(urls),
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.negada),
        );
        expect(
          find.text(CaixaDeLocalizacao.rotuloDeUsarLocalizacao),
          findsOneWidget,
          reason:
              'REPROVA: sem cidade a `Comunidade` nao oferece a localizacao.',
        );
        // Por extenso, e nao pela constante que a produz: comparar com
        // `ListaDoDiretorio.explicacaoSemCidade` trocaria os dois lados junto.
        expect(
          find.text('Mostrando profissionais de todas as cidades.'),
          findsOneWidget,
          reason:
              'REPROVA: a lista do pais inteiro nao diz que e do pais inteiro. '
              'Sem a frase ela parece uma lista que nao conseguiu recortar.',
        );
      },
    );

    testWidgets(
      'a caixa DESAPARECE na Comunidade com a cidade resolvida',
      (tester) async {
        // **O requisito das TRES secoes, medido na SEGUNDA aba.** As duas abas
        // da `Rede` montam a MESMA `CaixaDeLocalizacao`, e e por isso que a
        // regra esta num lugar so -- mas "num lugar so" e afirmacao, e esta e a
        // medicao dela do lado de `Comunidade`.
        //
        // **`findsNothing` vale para a TELA INTEIRA, e isso e deliberado:** as
        // duas abas da `Rede` vivem no mesmo `TabBarView` e as duas montam esta
        // caixa. Com a cidade resolvida, NENHUMA das duas pode estar oferecendo
        // a localizacao -- se `Eventos` continuasse com a caixa aberta atras da
        // aba, a pessoa que trocasse de aba veria a divergencia que esta frente
        // existe para nao ter.
        final urls = <Uri>[];
        await abrirComunidade(
          tester,
          rede: redeDoDiretorioComDuasCidades(urls),
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida),
        );
        expect(
          find.text(CaixaDeLocalizacao.rotuloDeUsarLocalizacao),
          findsNothing,
          reason:
              'REPROVA: a caixa ficou na tela com a cidade ja resolvida. '
              'Decisao do cliente de 20/10/2026: resolvida, fica **so a cidade '
              'dentro do filtro** -- e isso vale nas DUAS abas, porque e a '
              'mesma pessoa no mesmo app.',
        );
      },
    );

    testWidgets(
      'ISCA -- a consulta do diretorio nao carrega lat nem lon',
      (tester) async {
        final urls = <Uri>[];
        await abrirComunidade(
          tester,
          rede: redeDoDiretorioComDuasCidades(urls),
          localizacao: LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida),
        );
        expect(urls, isNotEmpty, reason: 'REPROVA: nada a conferir.');
        for (final u in urls) {
          for (final proibido in <String>[
            'lat',
            'lon',
            'lng',
            'latitude',
            'longitude',
            'point',
            'coords',
          ]) {
            expect(
              u.queryParameters.keys,
              isNot(contains(proibido)),
              reason:
                  'REPROVA: `${u.path}` recebeu `$proibido`. A ordem por '
                  'distancia desta aba sai do ponto que o SERVIDOR guarda por '
                  'aparelho e so volta em metros; por coordenada na consulta e '
                  'o que o ADR-0006 proibe, e mudar isso e emenda de ADR.',
            );
          }
        }
      },
    );
  });

  group('Comunidade: o recorte do diretorio leva a cidade', () {
    // A aba `Comunidade` e a lista do diretorio. **O parametro `city` sempre
    // existiu em `listDirectoryEntries`** (`minLength: 2`, `maxLength: 80`) e o
    // servidor sempre o aplicou (`texto_para_busca(professionals.city)`); o que
    // nao existia era o app mandar. Nenhum contrato mudou.
    test('a cidade vai como city na consulta', () {
      const recorte = RecorteDoDiretorio(cidade: 'Sao Paulo');
      expect(
        recorte.query['city'],
        'Sao Paulo',
        reason:
            'REPROVA: o recorte do diretorio nao leva a cidade. A aba '
            '`Comunidade` continua sem o recorte que o cliente pediu em 20/10.',
      );
    });

    test('sem cidade, `city` nao sai -- e a lista nao fica vazia', () {
      const recorte = RecorteDoDiretorio();
      expect(
        recorte.query.containsKey('city'),
        isFalse,
        reason:
            'REPROVA: o diretorio mandou `city` sem cidade. Cidade nao e '
            'obrigatoria, e recortar por uma cidade que ninguem resolveu e a '
            '"cidade errada derivada em silencio".',
      );
    });

    test('um caractere so nao vai: o contrato pede dois', () {
      // `minLength: 2` em `city`. Mandar um devolveria 400, e engolir o 400
      // desenharia "nada encontrado" para quem tem cidade legitima.
      const recorte = RecorteDoDiretorio(cidade: 'S');
      expect(recorte.query.containsKey('city'), isFalse);
    });

    test('ISCA -- o recorte do diretorio nao tem lat nem lon', () {
      const recorte = RecorteDoDiretorio(cidade: 'Sao Paulo');
      for (final proibido in <String>['lat', 'lon', 'lng', 'point']) {
        expect(
          recorte.query.keys,
          isNot(contains(proibido)),
          reason:
              'REPROVA: o recorte do diretorio carrega `$proibido`. A ordem '
              'por distancia desta aba sai do ponto que o SERVIDOR guarda por '
              'aparelho e so volta em metros; por coordenada na consulta e o '
              'que o ADR-0006 proibe.',
        );
      }
    });
  });

  group('o resolvedor da cidade, sem montar tela', () {
    test('na abertura, resolve so com a permissao JA concedida', () async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.naoPedida);
      final resolvedor = CidadeDoAparelho(porta);
      final trocou = await resolvedor.resolverNaAbertura();
      expect(trocou, isFalse);
      expect(resolvedor.cidade, isNull);
      expect(
        porta.vezesQuePediu,
        0,
        reason:
            'REPROVA: abrir a aba abriu o dialogo do sistema. O pedido e um ato '
            'da pessoa, e nao efeito colateral de abrir uma aba.',
      );
      expect(
        resolvedor.aviso,
        isNull,
        reason:
            'REPROVA: a abertura desenhou aviso. Ninguem pediu nada, e faixa de '
            'erro em cima de uma lista que abriu bem e erro inventado.',
      );
      resolvedor.dispose();
    });

    test('na abertura concedida, a cidade chega em silencio', () async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      final resolvedor = CidadeDoAparelho(porta);
      expect(await resolvedor.resolverNaAbertura(), isTrue);
      expect(resolvedor.cidade, 'Sao Paulo');
      expect(resolvedor.aviso, isNull);
      resolvedor.dispose();
    });

    test('negada em definitivo: abre os ajustes e DIZ', () async {
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.negadaPermanentemente,
      );
      final resolvedor = CidadeDoAparelho(porta);
      expect(await resolvedor.resolverPorToque(), isFalse);
      expect(porta.abriuAjustes, isTrue);
      expect(
        resolvedor.aviso,
        AvisoDaCidadeDoAparelho.semPermissao,
        reason:
            'REPROVA: a tela abriu os ajustes e nao disse nada. Quem volta dos '
            'ajustes sem liberar, e quem nao chega a sair do app, le o nada.',
      );
      resolvedor.dispose();
    });

    test('servico desligado nao e o mesmo que permissao negada', () async {
      // Mandar quem desligou o servico para a tela de permissao que ela JA
      // concedeu e o defeito que `Localizacao.servicoLigado` existe para
      // evitar: as duas falhas sao independentes e falham sozinhas.
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        servico: false,
      );
      final resolvedor = CidadeDoAparelho(porta);
      expect(await resolvedor.resolverPorToque(), isFalse);
      expect(
        resolvedor.aviso,
        AvisoDaCidadeDoAparelho.servicoDesligado,
        reason:
            'REPROVA: servico desligado virou `sem permissao`. A pessoa seria '
            'mandada liberar uma permissao que ela ja concedeu.',
      );
      expect(porta.abriuAjustes, isFalse);
      resolvedor.dispose();
    });

    test('os cinco motivos de fora do app caem na mesma frase', () async {
      for (final motivo in <MotivoDeNaoTerCidade>[
        MotivoDeNaoTerCidade.semFixNoPrazo,
        MotivoDeNaoTerCidade.indisponivel,
        MotivoDeNaoTerCidade.geocoderAusente,
        MotivoDeNaoTerCidade.tetoDeUsoEstourado,
        MotivoDeNaoTerCidade.semResultado,
      ]) {
        final resolvedor = CidadeDoAparelho(
          LocalizacaoDeTeste(
            PermissaoDeLocalizacao.concedida,
            resultadoDaCidade: CidadeNaoResolvida(motivo),
          ),
        );
        expect(await resolvedor.resolverPorToque(), isFalse);
        expect(
          resolvedor.aviso,
          AvisoDaCidadeDoAparelho.naoDescoberta,
          reason:
              'REPROVA: `$motivo` nao caiu na frase que oferece o filtro. Os '
              'cinco sao "nao deu agora" e as duas saidas sao as mesmas.',
        );
        resolvedor.dispose();
      }
    });

    test('a mesma cidade de novo NAO pede recarga', () async {
      // `trocou` e o que dispara `_carregar`. Resolver a mesma cidade duas
      // vezes e comum (voltar para a aba), e recarregar a lista sem recorte
      // novo e uma chamada a rota por nada.
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      final resolvedor = CidadeDoAparelho(porta);
      expect(await resolvedor.resolverNaAbertura(), isTrue);
      expect(
        await resolvedor.resolverNaAbertura(),
        isFalse,
        reason:
            'REPROVA: a segunda resolucao da MESMA cidade pediu recarga. A '
            'lista seria refeita sem o recorte ter mudado.',
      );
      resolvedor.dispose();
    });
  });
}
