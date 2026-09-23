// `Rede` com dado de verdade: a agenda de `GET /v1/network/events`.
//
// Os casos marcados ISCA sao os que precisam REPROVAR com o mecanismo
// desligado. Cada um diz, no proprio corpo, qual arquivo mexer e o que
// observar.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante
// que o produz.** Todo esperado esta escrito por extenso, com acento e
// pontuacao, e trocar a microcopia reprova -- que e o ponto. Um `expect` que
// lesse `AgendaDaRede.rotuloEncerrado` acompanharia o erro de digitacao para
// sempre.

import 'package:bichu/api/modelos_rede.dart';
import 'package:bichu/telas/rede/agenda_da_rede.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A massa, no formato exato do contrato
// ---------------------------------------------------------------------------

/// Um encontro como `NetworkEventSummary` o declara.
///
/// **Sem `id`**: a chave e o `slug`, e nao ha UUID nesta secao. E **sem
/// nenhum campo com pessoas**: nao ha `attendees`, `checkins`, `people` nem
/// `photo_author`, porque nao ha nenhum deles no contrato. Um teste que
/// passasse qualquer um deles estaria exercitando um contrato que nao existe.
Map<String, dynamic> encontroDoContrato({
  String slug = 'passeio-benedito-calixto',
  String title = 'Passeio matinal na Benedito Calixto',
  String summary = 'Volta tranquila pela praça, com parada na sombra.',
  String placeName = 'Praça Benedito Calixto',
  String neighborhood = 'Pinheiros',
  String city = 'São Paulo',
  String state = 'SP',
  String startsAt = '2026-10-04T12:00:00Z',
  String? endsAt,
  String timeZone = 'America/Sao_Paulo',
  String status = 'upcoming',
  String? coverImageUrl,
  int checkinCount = 0,
  int photoCount = 0,
}) {
  return <String, dynamic>{
    'slug': slug,
    'title': title,
    'summary': summary,
    'place': <String, dynamic>{
      'place_name': placeName,
      'neighborhood': neighborhood,
      'city': city,
      'state': state,
    },
    'starts_at': startsAt,
    'ends_at': endsAt,
    'time_zone': timeZone,
    'status': status,
    'cover_image_url': coverImageUrl,
    'checkin_count': checkinCount,
    'photo_count': photoCount,
  };
}

/// A resposta de `NetworkEventPage`.
Map<String, dynamic> paginaDoContrato(
  List<Map<String, dynamic>> itens, {
  String ordemEfetiva = 'proximos',
  String quandoEfetivo = 'upcoming',
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
    'effective_sort': ordemEfetiva,
    'effective_when': quandoEfetivo,
    'applied_filters': filtros,
  };
}

/// A rede que atende a agenda e **404 em qualquer outra rota**.
Future<http.Response> Function(http.Request) redeDaAgenda(
  Map<String, dynamic> corpo, {
  List<Uri>? urls,
}) {
  return (req) async {
    if (req.url.path == '/v1/network/events' && req.method == 'GET') {
      urls?.add(req.url);
      return json200(corpo);
    }
    return problema('not-found', 404);
  };
}

Future<void> abrirRede(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  bool logado = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado ? depositoLogado() : null,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
  await tester.pumpAndSettle();
}

/// Os titulos dos cartoes, **na ordem em que a tela os desenhou**.
List<String> titulosNaTela(WidgetTester tester) {
  final titulos = <String>[];
  for (final cartao in find.byType(CartaoDoEncontro).evaluate()) {
    titulos.add((cartao.widget as CartaoDoEncontro).encontro.titulo);
  }
  return titulos;
}

/// Todo o texto que a tela desenhou, num so lugar.
///
/// Serve as varreduras negativas: perguntar campo a campo so enxerga o campo
/// que quem escreveu o caso ja conhecia, e e por campo a mais que uma tela se
/// afasta da decisao sem alarme.
List<String> textosNaTela(WidgetTester tester) {
  final textos = <String>[];
  for (final elemento in find.byType(Text).evaluate()) {
    final texto = elemento.widget as Text;
    final conteudo = texto.data ?? texto.textSpan?.toPlainText() ?? '';
    if (conteudo.isNotEmpty) textos.add(conteudo);
  }
  return textos;
}

void main() {
  // -------------------------------------------------------------------------
  // A SITUACAO VEM DO SERVIDOR, E O PASSADO DIZ QUE E PASSADO
  // -------------------------------------------------------------------------

  group('o encontro que ja aconteceu DIZ que ja aconteceu', () {
    // ISCA -- em `app/lib/telas/rede/agenda_da_rede.dart`, em
    // `CartaoDoEncontro.rotuloDaSituacao`, troque a linha do `encerrado` por
    //     SituacaoDoEncontro.encerrado => null,
    // Este caso reprova: a lista passa a mostrar uma data antiga sem uma
    // palavra dizendo que o encontro passou, que e o defeito mais comum de
    // agenda.
    testWidgets('ISCA -- `ended` escreve Encerrado na propria lista', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(
            <Map<String, dynamic>>[encontroDoContrato(status: 'ended')],
            quandoEfetivo: 'past',
            ordemEfetiva: 'recentes',
          ),
        ),
      );

      expect(find.text('Encerrado'), findsOneWidget);
    });

    testWidgets('`happening` escreve Acontecendo agora', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(
            <Map<String, dynamic>>[encontroDoContrato(status: 'happening')],
          ),
        ),
      );

      expect(find.text('Acontecendo agora'), findsOneWidget);
      expect(find.text('Encerrado'), findsNothing);
    });

    testWidgets('`upcoming` nao ganha rotulo: a data ja diz', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
        ),
      );

      expect(find.text('Encerrado'), findsNothing);
      expect(find.text('Acontecendo agora'), findsNothing);
    });

    // ISCA -- em `agenda_da_rede.dart`, em `CartaoDoEncontro.build`, troque
    //     final situacao = rotuloDaSituacao(encontro.situacao);
    // por um calculo local:
    //     final situacao = encontro.comeca.instante.isBefore(DateTime.now())
    //         ? AgendaDaRede.rotuloEncerrado
    //         : null;
    // Os DOIS `expect` abaixo reprovam, e e esse o ponto: o primeiro porque
    // um encontro que o servidor chama de `upcoming` passaria a ser rotulado
    // `Encerrado` por causa do relogio, e o segundo porque um que o servidor
    // chama de `ended` deixaria de ser.
    testWidgets('ISCA -- o status e do SERVIDOR e nao do relogio do aparelho', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(
            <Map<String, dynamic>>[
              // Uma data de tres semanas atras que o servidor chama de
              // `upcoming`: o servidor manda, e a tela nao discute.
              encontroDoContrato(
                slug: 'remarcado',
                title: 'Mutirão de banho remarcado',
                startsAt: '2020-01-05T12:00:00Z',
                status: 'upcoming',
              ),
              // E uma data no futuro que o servidor ja deu por encerrada --
              // um encontro cancelado e fechado antes da hora, por exemplo.
              encontroDoContrato(
                slug: 'fechado-antes',
                title: 'Feira de adoção fechada antes',
                startsAt: '2099-01-05T12:00:00Z',
                status: 'ended',
              ),
            ],
            quandoEfetivo: 'all',
          ),
        ),
      );

      // Um `Encerrado` so, e ele e o do encontro que o SERVIDOR encerrou.
      expect(find.text('Encerrado'), findsOneWidget);
      final cartaoFechado = find.ancestor(
        of: find.text('Feira de adoção fechada antes'),
        matching: find.byType(CartaoDoEncontro),
      );
      expect(
        find.descendant(of: cartaoFechado, matching: find.text('Encerrado')),
        findsOneWidget,
      );
    });
  });

  // -------------------------------------------------------------------------
  // A HORA E A DO FUSO DO EVENTO, E NAO A DO APARELHO
  // -------------------------------------------------------------------------

  group('a hora e a de PAREDE, no fuso do evento', () {
    // ISCA -- em `app/lib/api/modelos_rede.dart`, em `DataDoEncontro.parede`,
    // troque por
    //     DateTime get parede => instante.toLocal();
    // Este caso reprova em qualquer maquina que nao esteja em `-03:00`, e --
    // o que importa mais -- passa a depender do fuso da maquina, que e
    // exatamente o defeito.
    testWidgets('ISCA -- 12:00Z em São Paulo sai como 9h', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[
            encontroDoContrato(
              startsAt: '2026-10-04T12:00:00Z',
              timeZone: 'America/Sao_Paulo',
            ),
          ]),
        ),
      );

      expect(
        find.text('4 de outubro de 2026, 9h · horário de São Paulo'),
        findsOneWidget,
      );
    });

    testWidgets('o MESMO instante em Manaus sai uma hora antes', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[
            encontroDoContrato(
              city: 'Manaus',
              state: 'AM',
              startsAt: '2026-10-04T12:00:00Z',
              timeZone: 'America/Manaus',
            ),
          ]),
        ),
      );

      expect(
        find.text('4 de outubro de 2026, 8h · horário de Manaus'),
        findsOneWidget,
      );
    });

    // ISCA -- em `modelos_rede.dart`, em `FusoDoEvento.resolver`, mova o bloco
    // do `deslocamentoEscritoEm` para ANTES da consulta a `_zonasDoBrasil`.
    // Este caso reprova: o encontro de Manaus passa a sair as 9h, porque o
    // deslocamento escrito na resposta e o da sessao que serializou -- e nao o
    // da zona do evento.
    test('ISCA -- o nome IANA ganha do deslocamento escrito na resposta', () {
      final manaus = DataDoEncontro.doJson(
        // O servidor serializou em `-03:00`, e o evento e em Manaus, que e
        // `-04:00`. Os dois nao podem valer, e quem vale e a zona do evento.
        inicioEmIso: '2026-10-04T09:00:00-03:00',
        nomeIana: 'America/Manaus',
      );

      expect(manaus.horaPorExtenso, '8h');
      expect(manaus.fuso.rotulo, 'horário de Manaus');
    });

    test('zona fora da tabela usa o deslocamento escrito, e o NOMEIA', () {
      final lisboa = DataDoEncontro.doJson(
        inicioEmIso: '2026-10-04T09:00:00+01:00',
        nomeIana: 'Europe/Lisbon',
      );

      expect(lisboa.horaPorExtenso, '9h');
      // O rotulo nao inventa nome de cidade para uma zona que a tabela nao
      // conhece: ele diz o deslocamento, que e exato.
      expect(lisboa.fuso.rotulo, 'horário UTC+01:00');
    });

    test('sem zona conhecida e sem deslocamento escrito, a tela DIZ que e UTC', () {
      final semZona = DataDoEncontro.doJson(
        inicioEmIso: '2026-10-04T12:00:00Z',
        nomeIana: 'Antarctica/Troll',
      );

      // Nao ha palpite: o app nao sabe o fuso, entao ele nomeia o que usou em
      // vez de apresentar como hora de parede um numero que nao e.
      expect(semZona.fuso.conhecido, isFalse);
      expect(semZona.horaPorExtenso, '12h');
      expect(semZona.fuso.rotulo, 'horário UTC');
    });

    test('a hora cheia sai sem minutos, e a quebrada sai com dois digitos', () {
      final cheia = DataDoEncontro.doJson(
        inicioEmIso: '2026-10-04T12:00:00Z',
        nomeIana: 'America/Sao_Paulo',
      );
      final quebrada = DataDoEncontro.doJson(
        inicioEmIso: '2026-10-04T12:05:00Z',
        nomeIana: 'America/Sao_Paulo',
      );

      expect(cheia.horaPorExtenso, '9h');
      expect(quebrada.horaPorExtenso, '9h05');
    });

    test('o dia tambem vira, e nao so a hora', () {
      // 01:00Z do dia 5 e 22h do dia 4 em São Paulo. Uma tela que so
      // deslocasse a hora mostraria o dia errado numa das pontas.
      final virada = DataDoEncontro.doJson(
        inicioEmIso: '2026-10-05T01:00:00Z',
        nomeIana: 'America/Sao_Paulo',
      );

      expect(virada.dataPorExtenso, '4 de outubro de 2026');
      expect(virada.horaPorExtenso, '22h');
    });
  });

  // -------------------------------------------------------------------------
  // NAO HA LISTA DE PRESENCA, E NESTA VERSAO NAO HA NEM A CONTAGEM
  // -------------------------------------------------------------------------

  group('a agenda nao mostra presenca, nem em numero', () {
    // BICHUS-251, decisao do cliente de 23/09/2026: check-in saiu do app, e a
    // contagem de quem confirmou saiu junto. A resposta abaixo TRAZ
    // `checkin_count`, porque o servidor desta branch ainda o manda: o caso
    // prova que a tela nao o desenha, e nao que o dado faltou.
    //
    // ISCA -- devolva ao `CartaoDoEncontro` a linha
    //     Text('${encontro.presencas} pessoas confirmaram presença'),
    // (com o campo de volta em `EncontroDaRede`) e este caso reprova.
    testWidgets('ISCA -- a contagem de presencas nao aparece no cartao', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[
            encontroDoContrato(slug: 'doze', title: 'Doze', checkinCount: 12),
            encontroDoContrato(slug: 'uma', title: 'Uma', checkinCount: 1),
            encontroDoContrato(slug: 'zero', title: 'Zero', checkinCount: 0),
          ]),
        ),
      );

      // Os tres cartoes estao na tela; sem isto o caso passaria numa lista
      // vazia.
      expect(titulosNaTela(tester), <String>['Doze', 'Uma', 'Zero']);

      final tudo = textosNaTela(tester).join(' ');
      for (final palavra in <String>['presença', 'confirmou', 'confirmaram']) {
        expect(
          tudo.contains(palavra),
          isFalse,
          reason: 'check-in saiu desta versao (BICHUS-251), e "$palavra" '
              'apareceu na agenda',
        );
      }
    });

    // A prova negativa do ADR-0025, do lado da TELA.
    //
    // A resposta abaixo e a do contrato -- ela nao tem campo com pessoas. O
    // caso varre o texto inteiro que a tela desenhou e reprova se qualquer nome,
    // apelido ou rotulo de autoria aparecer: se um dia alguem acrescentar um
    // campo de pessoa a resposta e um widget que o desenhe, o caso pega, mesmo
    // sem conhecer o nome do campo novo.
    testWidgets('nenhum nome de pessoa aparece na agenda', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[
            encontroDoContrato(checkinCount: 12, photoCount: 4),
          ]),
        ),
      );

      final tudo = textosNaTela(tester).join(' ');
      for (final palavra in <String>[
        'Quem vai',
        'Quem foi',
        'Confirmados',
        'Participantes',
        'Presentes',
        'enviada por',
        'Enviada por',
        'Lista de presença',
      ]) {
        expect(
          tudo.contains(palavra),
          isFalse,
          reason: 'a Rede nao publica pessoas, e "$palavra" apareceu na tela',
        );
      }
    });

    testWidgets('nao ha escolha de pet, e nao ha mapa nem endereco', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[
            encontroDoContrato(checkinCount: 3),
          ]),
        ),
      );

      final tudo = textosNaTela(tester).join(' ');
      for (final palavra in <String>[
        'Com qual pet',
        'Escolha o pet',
        'Levar o',
        'CEP',
        'Ver no mapa',
        'Abrir no mapa',
        'Como chegar',
      ]) {
        expect(
          tudo.contains(palavra),
          isFalse,
          reason: 'a Rede nao tem escolha de pet nem mapa, e "$palavra" '
              'apareceu na tela',
        );
      }
      // E o lugar esta la, em ROTULO: nome do lugar, bairro, cidade e UF.
      expect(
        find.text('Praça Benedito Calixto · Pinheiros · São Paulo, SP'),
        findsOneWidget,
      );
    });
  });

  // -------------------------------------------------------------------------
  // A ORDEM MOSTRADA E A ORDEM REAL, E O DEFAULT E DO SERVIDOR
  // -------------------------------------------------------------------------

  group('a ordem que a tela mostra e a que o servidor aplicou', () {
    // ISCA -- em `app/lib/telas/rede/agenda_da_rede.dart`, em
    // `_controleDeOrdenacao`, troque
    //     efetiva: pagina.ordemEfetiva.codigo
    // por
    //     efetiva: (_recorte.ordem ?? OrdemDaRede.proximos).codigo
    // Este caso reprova: a tela passa a afirmar `Data mais próxima` sobre uma
    // lista que o servidor devolveu em `recentes`. E aqui isso nao e hipotese:
    // o default de `sort` DEPENDE de `when`, entao a tela que nao pediu ordem
    // nenhuma nao tem de onde tirar a resposta a nao ser da resposta.
    testWidgets('ISCA -- a ordem sai de effective_sort e nao do estado local', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(
            <Map<String, dynamic>>[
              encontroDoContrato(slug: 'a', title: 'Encontro A'),
              encontroDoContrato(slug: 'b', title: 'Encontro B'),
            ],
            // A tela nao mandou `sort`. O servidor aplicou o default dele, que
            // com `past` e `recentes`, e so esta linha conta isso a tela.
            quandoEfetivo: 'past',
            ordemEfetiva: 'recentes',
          ),
        ),
      );

      expect(find.text('2 encontros · Mais recente primeiro'), findsOneWidget);
      expect(find.text('2 encontros · Data mais próxima'), findsNothing);
      expect(titulosNaTela(tester), <String>['Encontro A', 'Encontro B']);
    });

    // ISCA -- em `app/lib/api/modelos_rede.dart`, em `RecorteDaRede.query`,
    // troque as duas linhas condicionais por incondicionais:
    //     'when': (quando ?? QuandoDaRede.aVir).codigo,
    //     'sort': (ordem ?? OrdemDaRede.proximos).codigo,
    // Este caso reprova: a primeira carga passa a mandar os dois parametros, e
    // com isso `effective_sort` volta sempre igual ao pedido -- o campo vira
    // enfeite, junto com a unica coisa que ele prova.
    testWidgets('ISCA -- a primeira carga nao manda `sort` nem `when`', (tester) async {
      final urls = <Uri>[];
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
          urls: urls,
        ),
      );

      expect(urls, isNotEmpty);
      expect(urls.first.queryParameters.containsKey('sort'), isFalse);
      expect(urls.first.queryParameters.containsKey('when'), isFalse);
    });

    testWidgets('nao ha ordem por distancia nem por numero de presencas', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[
            encontroDoContrato(checkinCount: 9),
          ]),
        ),
      );

      await tester.tap(find.byIcon(Icons.swap_vert));
      await tester.pumpAndSettle();

      // As duas que existem, escritas por extenso.
      expect(find.text('Data mais próxima'), findsOneWidget);
      expect(find.text('Mais recente primeiro'), findsOneWidget);

      // E nenhuma das que nao existem -- nem desabilitada, nem com explicacao
      // ao lado. Sem coordenada nao ha distancia, e ordenar por presenca
      // transformaria a contagem numa disputa.
      final tudo = textosNaTela(tester).join(' ');
      for (final palavra in <String>[
        'Mais perto',
        'distância',
        'Distância',
        'presenças',
        'Mais confirmados',
        'Mais populares',
      ]) {
        expect(
          tudo.contains(palavra),
          isFalse,
          reason: 'a folha de ordenacao ofereceu "$palavra"',
        );
      }
    });

    testWidgets('trocar o Quando devolve a ordem ao servidor', (tester) async {
      final urls = <Uri>[];
      await abrirRede(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/network/events' && req.method == 'GET') {
            urls.add(req.url);
            final passado = req.url.queryParameters['when'] == 'past';
            return json200(
              paginaDoContrato(
                <Map<String, dynamic>>[encontroDoContrato()],
                quandoEfetivo: passado ? 'past' : 'upcoming',
                ordemEfetiva: passado ? 'recentes' : 'proximos',
              ),
            );
          }
          return problema('not-found', 404);
        },
      );

      // Primeiro a pessoa escolhe uma ordem, de propria vontade.
      await tester.tap(find.byIcon(Icons.swap_vert));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Data mais próxima'));
      await tester.pumpAndSettle();
      expect(urls.last.queryParameters['sort'], 'proximos');

      // E depois troca o recorte de tempo.
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Já aconteceram'));
      await tester.pumpAndSettle();

      // O `when` foi, e o `sort` NAO: a pergunta "o que houve" se responde de
      // tras para frente, e o default disso e do servidor. Carregar a ordem
      // anterior entregaria a lista invertida sem ninguem ter pedido.
      expect(urls.last.queryParameters['when'], 'past');
      expect(urls.last.queryParameters.containsKey('sort'), isFalse);
      expect(find.text('1 encontro · Mais recente primeiro'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // OS DOIS VAZIOS SAO OPOSTOS
  // -------------------------------------------------------------------------

  group('a barra nasce e some pelo recorte, e nao pela contagem', () {
    testWidgets('agenda vazia SEM recorte nao desenha a barra', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(paginaDoContrato(const <Map<String, dynamic>>[])),
      );

      expect(find.byType(BarraDeListagem), findsOneWidget);
      // O widget existe na arvore e **nao desenha controle nenhum**. Medir
      // pelos controles, e nao pelo tipo, e o que distingue "a barra sumiu" de
      // "a barra esta ali, vazia".
      expect(find.byType(TextField), findsNothing);
      expect(find.byIcon(Icons.tune), findsNothing);
      expect(find.byIcon(Icons.swap_vert), findsNothing);

      expect(find.text('A Rede ainda não tem encontro'), findsOneWidget);
      expect(find.text('Nada com esse recorte'), findsNothing);
    });

    // ISCA -- em `agenda_da_rede.dart`, em `_controleDeFiltro`, troque
    //     selecionado: _recorte.quando?.codigo
    // por
    //     selecionado: (_recorte.quando ?? QuandoDaRede.aVir).codigo
    // Este caso reprova: a barra passa a contar um filtro ativo desde o
    // primeiro frame, o vazio da Rede sem encontro vira "nada com esse
    // recorte", e a barra e desenhada sobre o nada.
    testWidgets('ISCA -- o default do servidor NAO conta como filtro ativo', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(paginaDoContrato(const <Map<String, dynamic>>[])),
      );

      expect(find.text('A Rede ainda não tem encontro'), findsOneWidget);
      expect(find.byIcon(Icons.tune), findsNothing);
    });

    testWidgets('agenda vazia COM filtro ativo MANTEM a barra', (tester) async {
      final urls = <Uri>[];
      await abrirRede(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/network/events' && req.method == 'GET') {
            urls.add(req.url);
            final filtrou = req.url.queryParameters['when'] != null;
            return json200(
              paginaDoContrato(
                filtrou
                    ? const <Map<String, dynamic>>[]
                    : <Map<String, dynamic>>[encontroDoContrato()],
                quandoEfetivo: filtrou ? 'past' : 'upcoming',
                ordemEfetiva: filtrou ? 'recentes' : 'proximos',
                filtros: filtrou
                    ? const <String, String>{'when': 'past'}
                    : const <String, String>{'scope': 'all'},
              ),
            );
          }
          return problema('not-found', 404);
        },
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Já aconteceram'));
      await tester.pumpAndSettle();

      expect(urls.last.queryParameters['when'], 'past');
      expect(find.byType(CartaoDoEncontro), findsNothing);
      // A barra ficou, com o controle que produziu o vazio.
      expect(find.byIcon(Icons.tune), findsOneWidget);
      expect(find.text('Nada com esse recorte'), findsOneWidget);
      expect(find.text('0 encontros · Mais recente primeiro'), findsOneWidget);
    });

    testWidgets('um encontro so usa o singular', (tester) async {
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
        ),
      );
      expect(find.text('1 encontro · Data mais próxima'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // A BUSCA VAI AO SERVIDOR, E DIZ QUE VAI
  // -------------------------------------------------------------------------

  group('a busca e de servidor', () {
    // ISCA -- em `agenda_da_rede.dart`, em `_controleDeBusca`, troque
    //     alcance: AlcanceDaBusca.servidor
    // por
    //     alcance: AlcanceDaBusca.paginaCarregada
    // Este caso reprova: o componente passa a escrever na tela que a busca
    // olha so o que esta carregado, sobre uma busca que de fato vai ao
    // servidor.
    testWidgets('ISCA -- o termo vai na rota e a tela nao avisa alcance local', (tester) async {
      final urls = <Uri>[];
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
          urls: urls,
        ),
      );

      await tester.enterText(find.byType(TextField), 'mutirão');
      await tester.pumpAndSettle();

      expect(urls.last.queryParameters['q'], 'mutirão');
      expect(
        find.text('A busca olha só o que já está carregado nesta página.'),
        findsNothing,
      );
    });

    testWidgets('um caractere so nao vai a rota', (tester) async {
      final urls = <Uri>[];
      await abrirRede(
        tester,
        rede: redeDaAgenda(
          paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
          urls: urls,
        ),
      );
      final antes = urls.length;

      await tester.enterText(find.byType(TextField), 'm');
      await tester.pumpAndSettle();

      // `minLength: 2` no contrato: mandar um caractere produziria um 400 a
      // cada primeira tecla.
      expect(urls.length, antes);
    });
  });

  // -------------------------------------------------------------------------
  // O FILTRO DE CIDADE
  // -------------------------------------------------------------------------

  group('o filtro de cidade', () {
    // ISCA -- em `agenda_da_rede.dart`, em `_AgendaDaRedeState`, troque o
    // corpo de `_controleDeFiltro` para montar as opcoes de cidade a partir de
    //     _pagina?.cidades
    // em vez de `_cidadesConhecidas`. Este caso reprova: depois de filtrar por
    // Santos a resposta so tem Santos, o menu encolhe para uma opcao e o unico
    // caminho de volta a São Paulo passa a ser limpar o filtro.
    testWidgets('ISCA -- as cidades ja vistas continuam no menu depois de filtrar', (tester) async {
      await abrirRede(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/network/events' && req.method == 'GET') {
            final cidade = req.url.queryParameters['city'];
            return json200(
              paginaDoContrato(
                cidade == null
                    ? <Map<String, dynamic>>[
                        encontroDoContrato(slug: 'sp', title: 'Na capital'),
                        encontroDoContrato(
                          slug: 'santos',
                          title: 'Na praia',
                          city: 'Santos',
                          neighborhood: 'Gonzaga',
                        ),
                      ]
                    : <Map<String, dynamic>>[
                        encontroDoContrato(
                          slug: 'santos',
                          title: 'Na praia',
                          city: 'Santos',
                          neighborhood: 'Gonzaga',
                        ),
                      ],
              ),
            );
          }
          return problema('not-found', 404);
        },
      );

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Santos'));
      await tester.pumpAndSettle();

      // A resposta filtrada so tem Santos. O menu continua com as duas.
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      expect(find.text('São Paulo'), findsOneWidget);
      expect(find.text('Santos'), findsOneWidget);
      // E a nota diz de onde saiu essa lista, para o menu nao parecer
      // exaustivo quando nao e.
      expect(
        find.text(
          'As cidades abaixo são as que já apareceram na agenda. O filtro '
          'procura na base inteira.',
        ),
        findsOneWidget,
      );
    });
  });

  // -------------------------------------------------------------------------
  // NENHUM TOQUE TERMINA SEM RESPOSTA
  // -------------------------------------------------------------------------

  testWidgets('a falha mostra a faixa e o caminho de volta', (tester) async {
    var tentativas = 0;
    await abrirRede(
      tester,
      rede: (req) async {
        if (req.url.path == '/v1/network/events' && req.method == 'GET') {
          tentativas += 1;
          if (tentativas == 1) return problema('server-error', 500);
          return json200(
            paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
          );
        }
        return problema('not-found', 404);
      },
    );

    // A pagina anterior nao fica sob a faixa: nao ha cartao nenhum.
    expect(find.byType(CartaoDoEncontro), findsNothing);
    // E o vazio de "a Rede ainda nao tem encontro" NAO aparece: falha nao e
    // agenda vazia, e confundir as duas produz o vazio que parece sucesso.
    expect(find.text('A Rede ainda não tem encontro'), findsNothing);

    await tester.tap(find.text('Atualizar'));
    await tester.pumpAndSettle();

    expect(find.byType(CartaoDoEncontro), findsOneWidget);
  });

  testWidgets('resposta sem effective_sort e falha, e nao palpite de ordem', (tester) async {
    await abrirRede(
      tester,
      rede: (req) async {
        if (req.url.path == '/v1/network/events' && req.method == 'GET') {
          final corpo = paginaDoContrato(
            <Map<String, dynamic>>[encontroDoContrato()],
          )..remove('effective_sort');
          return json200(corpo);
        }
        return problema('not-found', 404);
      },
    );

    // A barra de listagem mostra a ordem REAL e nao tem como mostrar uma que
    // nao existe. O desfecho e o estado de falha, com caminho de volta.
    expect(find.byType(CartaoDoEncontro), findsNothing);
    expect(find.text('Atualizar'), findsOneWidget);
  });

  // -------------------------------------------------------------------------
  // A CASCA HONESTA SAIU
  // -------------------------------------------------------------------------

  testWidgets('a Rede nao diz mais que esta em construcao', (tester) async {
    await abrirRede(
      tester,
      rede: redeDaAgenda(
        paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
      ),
    );

    expect(find.text('Rede está em construção'), findsNothing);
    expect(find.byType(CartaoDoEncontro), findsOneWidget);
  });
}
