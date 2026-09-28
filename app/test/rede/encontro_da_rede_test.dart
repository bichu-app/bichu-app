// A pagina do encontro no desenho novo (design system 24.12 a 24.17, UX 28).
//
// As quatro iscas pedidas para a fatia estao aqui e na agenda:
//   1. o mapa nao aparece sem token (e `/location` nem e chamada);
//   2. o teaser nao mostra local (e `private-details` nem e chamada);
//   3. "recusado" nunca aparece;
//   4. a distancia nao aparece para privado (aqui e em `agenda_da_rede_test`).

import 'dart:convert';

import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/intencao/pedido_de_participacao_como_intencao.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/conta/tela_entrar.dart';
import 'package:bichu/telas/rede/agenda_da_rede.dart';
import 'package:bichu/telas/rede/local_do_encontro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';
import 'fixtures_da_rede.dart';

class SaidaDeTeste extends SaidaDoApp {
  final List<({double lat, double lon, String nome})> mapas =
      <({double lat, double lon, String nome})>[];
  final List<EventoDeCalendario> calendario = <EventoDeCalendario>[];
  bool abre = true;

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async {
    mapas.add((lat: lat, lon: lon, nome: nomeDoLugar));
    return abre;
  }

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async {
    calendario.add(evento);
    return abre;
  }
}

/// A rede de um encontro: a agenda com ele, o detalhe, e o que o caso pedir.
RedeDeTeste redeDoEncontro({
  required Map<String, dynamic> encontro,
  Map<String, http.Response Function(http.Request)> mais =
      const <String, http.Response Function(http.Request)>{},
}) {
  final slug = encontro['slug'] as String;
  return RedeDeTeste(<String, http.Response Function(http.Request)>{
    'GET /v1/network/events': sempre(pagina(<Map<String, dynamic>>[encontro])),
    'GET /v1/network/events/nearby':
        sempre(paginaPorPerto(<Map<String, dynamic>>[])),
    'GET /v1/network/events/$slug': sempre(encontro),
    ...mais,
  });
}

/// Uma tela de celular (400 dp) bem alta: a pagina inteira fica montada, e o
/// caso le as secoes sem depender da rolagem preguicosa do `ListView`.
void telaAlta(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(400, 4000);
  addTearDown(tester.view.reset);
}

Future<void> abrirEncontro(
  WidgetTester tester, {
  required RedeDeTeste rede,
  required String titulo,
  bool logado = true,
}) async {
  telaAlta(tester);
  await abrirRede(tester, rede: rede, logado: logado);
  await abrirCartao(tester, titulo);
}

Future<void> rolarAte(WidgetTester tester, Finder alvo) async {
  await tester.scrollUntilVisible(
    alvo,
    200,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.pumpAndSettle();
}

const String tituloPublico = 'Passeio matinal na Benedito Calixto';
const String tituloPrivado = 'Clube dos border collies';

void main() {
  late SaidaDeTeste saida;
  setUp(() {
    saida = SaidaDeTeste();
    SaidaDoApp.atual = saida;
  });
  tearDown(SaidaDoApp.restaurar);

  group('encontro público', () {
    testWidgets('a vir: cabeçalho, Quando com o fuso, e as seções de preparo',
        (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(
          encontro: encontroPublico(
            bringItems: const <String>['water', 'poop_bags'],
            amenities: const <String>['shade', 'benches'],
            fencedOffLeashArea: true,
            notes: 'Se chover forte, o encontro passa para o sábado seguinte.',
          ),
        ),
      );

      expect(find.text(tituloPublico), findsOneWidget);
      expect(find.text('Organizado pela equipe do Bichu'), findsOneWidget);
      expect(find.text('Gratuito'), findsOneWidget);
      expect(find.text('Sábado, 3 de outubro'), findsOneWidget);
      expect(find.text('Das 9h às 11h · 2 horas'), findsOneWidget);
      expect(find.text('Horário de Brasília'), findsOneWidget);
      expect(find.text('Adicionar ao calendário'), findsOneWidget);

      for (final t in <String>[
        'Sobre o encontro',
        'Para quais cães',
        'Todos os portes',
        'Qualquer idade',
        'Vacinação em dia',
        'O que levar',
        'Água',
        'Saquinhos para cocô',
        'Cuidados no encontro',
        'Recolha o cocô e leve o saquinho embora.',
        'Na área cercada, o cão pode ficar solto. Fora dela, na guia.',
        'Se o seu cão parecer desconfortável, afaste-se do grupo com ele por '
            'um tempo.',
        'Fêmea no cio fica em casa.',
        'Acessibilidade e estrutura',
        'Área cercada para cães soltos',
        'Sombra',
        'Observações',
      ]) {
        await rolarAte(tester, find.text(t));
        expect(find.text(t), findsOneWidget, reason: 'falta "$t"');
      }
      // O que saiu na revisão da UX (24.17.1).
      final tela = textoDaTela(tester);
      for (final t in <String>[
        'Quem organiza',
        'Compartilhar',
        'Regras de convivência',
        'Sempre na guia',
      ]) {
        expect(tela, isNot(contains(t)));
      }
    });

    testWidgets('ISCA -- sem conta não há mapa, e /location nem é chamada',
        (tester) async {
      // ISCA: em `encontro_da_rede.dart`, em `_deveBuscarPonto`, apague
      //     if (!_logado || e == null) return false;
      // (deixe so `if (e == null) return false;`). A chamada sai sem token e
      // este caso reprova no registro da rede e na chave do mapa.
      final rede = redeDoEncontro(
        encontro: encontroPublico(),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location': sempre(localizacao()),
        },
      );
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico, logado: false);
      await rolarAte(tester, find.text('Praça Benedito Calixto'));

      expect(rede.chamadasA('GET /v1/network/events/$slugPublico/location'), isEmpty);
      expect(find.byKey(LocalDoEncontro.chaveDoMapa), findsNothing);
      expect(find.text('Abrir no app de mapas'), findsNothing);
      // O endereco continua: o mapa nunca e a unica forma de saber onde e.
      expect(find.text('Pinheiros · São Paulo, SP'), findsOneWidget);
    });

    testWidgets('com conta: /location com token, a área do mapa e o botão',
        (tester) async {
      final rede = redeDoEncontro(
        encontro: encontroPublico(),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location': sempre(localizacao()),
        },
      );
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico);

      final local = rede.chamadasA('GET /v1/network/events/$slugPublico/location');
      expect(local, hasLength(1));
      expect(local.single.headers['Authorization'], startsWith('Bearer '));

      await rolarAte(tester, find.text('Abrir no app de mapas'));
      expect(find.byKey(LocalDoEncontro.chaveDoMapa), findsOneWidget);
      await tester.tap(find.text('Abrir no app de mapas'));
      await tester.pumpAndSettle();
      expect(saida.mapas, hasLength(1));
      expect(saida.mapas.single.lat, -23.5617);
      expect(saida.mapas.single.nome, 'Praça Benedito Calixto');
    });

    testWidgets('/location com falha: o erro do mapa e Tentar de novo refaz só ela',
        (tester) async {
      var falhar = true;
      final rede = redeDoEncontro(
        encontro: encontroPublico(),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location': (_) => falhar
              ? problema('internal-error', 500)
              : json200(localizacao(lat: null)),
        },
      );
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico);
      expect(find.text('Não conseguimos carregar o mapa agora.'), findsOneWidget);
      // O endereco continua: o mapa nunca e a unica forma de saber onde e.
      expect(find.text('Praça Benedito Calixto'), findsOneWidget);
      falhar = false;
      await tester.tap(find.text('Tentar de novo'));
      await tester.pumpAndSettle();
      expect(rede.chamadasA('GET /v1/network/events/$slugPublico/location'), hasLength(2));
      expect(rede.chamadasA('GET /v1/network/events/$slugPublico'), hasLength(1));
      expect(find.text('Não conseguimos carregar o mapa agora.'), findsNothing);
    });

    testWidgets('com conta e sem ponto: só o endereço, sem mapa nem botão',
        (tester) async {
      await abrirEncontro(
        tester,
        titulo: tituloPublico,
        rede: redeDoEncontro(
          encontro: encontroPublico(),
          mais: <String, http.Response Function(http.Request)>{
            'GET /v1/network/events/$slugPublico/location':
                sempre(localizacao(lat: null)),
          },
        ),
      );
      await rolarAte(tester, find.text('Pinheiros · São Paulo, SP'));
      expect(find.byKey(LocalDoEncontro.chaveDoMapa), findsNothing);
      expect(find.text('Abrir no app de mapas'), findsNothing);
      // "Ponto no mapa" e vocabulario do caso de perdido (UX 28.4).
      expect(textoDaTela(tester), isNot(contains('ponto no mapa')));
    });

    testWidgets('a distância vem do cartão, pela região cadastrada',
        (tester) async {
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events':
            sempre(pagina(<Map<String, dynamic>>[encontroPublico()])),
        'GET /v1/network/events/nearby': sempre(
          paginaPorPerto(<Map<String, dynamic>>[
            porPerto(encontroPublico(), 2600),
          ]),
        ),
        'GET /v1/network/events/$slugPublico': sempre(encontroPublico()),
        'GET /v1/network/events/$slugPublico/location': sempre(localizacao()),
      });
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico);
      await rolarAte(tester, find.text('A cerca de 3 km da sua região'));
      expect(find.text('A cerca de 3 km da sua região'), findsOneWidget);
    });

    testWidgets('Adicionar ao calendário leva o instante e o lugar',
        (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico()),
      );
      await rolarAte(tester, find.text('Adicionar ao calendário'));
      await tester.tap(find.text('Adicionar ao calendário'));
      await tester.pumpAndSettle();

      final e = saida.calendario.single;
      expect(e.titulo, tituloPublico);
      expect(e.inicio, DateTime.utc(2026, 10, 3, 12));
      expect(e.fim, DateTime.utc(2026, 10, 3, 14));
      expect(e.local, 'Praça Benedito Calixto, Pinheiros, São Paulo - SP');
    });
  });

  group('cancelado e encerrado', () {
    testWidgets('cancelado: aviso, sem mapa, sem calendário e sem preparo',
        (tester) async {
      final rede = redeDoEncontro(
        encontro: encontroPublico(status: 'cancelled'),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location': sempre(localizacao()),
        },
      );
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico);

      expect(find.text('Cancelado'), findsOneWidget);
      expect(
        find.text('A equipe do Bichu cancelou este encontro. Ele não vai acontecer.'),
        findsOneWidget,
      );
      await rolarAte(tester, find.text('Sobre o encontro'));
      final tela = textoDaTela(tester);
      expect(tela, isNot(contains('Adicionar ao calendário')));
      expect(tela, isNot(contains('Cuidados no encontro')));
      expect(tela, isNot(contains('Para quais cães')));
      expect(find.byKey(LocalDoEncontro.chaveDoMapa), findsNothing);
      // Ha coordenada, e ela nao e usada: a pergunta nem sai.
      expect(rede.chamadasA('GET /v1/network/events/$slugPublico/location'), isEmpty);
    });

    testWidgets('encerrado: sem calendário e sem preparo, com Sobre',
        (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico(status: 'ended')),
      );
      expect(find.text('Encerrado'), findsOneWidget);
      await rolarAte(tester, find.text('Sobre o encontro'));
      final tela = textoDaTela(tester);
      expect(tela, isNot(contains('Adicionar ao calendário')));
      expect(tela, isNot(contains('Cuidados no encontro')));
    });
  });

  group('encontro privado', () {
    RedeDeTeste redePrivada({
      String? estado,
      String status = 'upcoming',
    }) {
      var estadoAtual = estado;
      return redeDoEncontro(
        encontro: teaserPrivado(status: status),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPrivado/join-request': (_) =>
              estadoAtual == null
                  ? problema('not-found', 404)
                  : json200(pedido(estadoAtual!)),
          'POST /v1/network/events/$slugPrivado/join-request': (_) {
            estadoAtual = 'requested';
            return json200(pedido('requested'));
          },
          'DELETE /v1/network/events/$slugPrivado/join-request': (_) {
            estadoAtual = null;
            return json200(pedido('withdrawn'));
          },
          'GET /v1/network/events/$slugPrivado/private-details': (_) =>
              estadoAtual == 'approved'
                  ? json200(detalhesDoPrivado())
                  : problema('not-found', 404),
          'GET /v1/network/events/$slugPrivado/location':
              sempre(localizacao()),
        },
      );
    }

    testWidgets(
        'ISCA -- teaser sem conta: só título e data, sem local, e a guarda de '
        'ação ao pedir', (tester) async {
      // ISCA: em `encontro_da_rede.dart`, no `switch` de `conteudo`, troque
      //     TeaserDoPrivado() => _detalhes,
      // por uma chamada que sempre busque `private-details`. Este caso
      // reprova no registro da rede e nas sentinelas `ISCA-`.
      final rede = redePrivada();
      final envelope = DepositoDeIntencaoEmMemoria();
      telaAlta(tester);
      await abrirOApp(tester, rede: rede.call, envelope: envelope);
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();
      await abrirCartao(tester, tituloPrivado);

      expect(find.text(tituloPrivado), findsOneWidget);
      expect(find.text('Domingo, 4 de outubro'), findsOneWidget);
      expect(find.text('Privado'), findsOneWidget);
      expect(find.text('Encontro privado'), findsOneWidget);
      expect(
        find.text(
          'O local e os detalhes aparecem se a equipe do Bichu aprovar o seu '
          'pedido.',
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          'Ao pedir, a equipe do Bichu vê o seu nome de exibição, o mês em que '
          'você criou a conta e se o seu e-mail está confirmado.',
        ),
        findsOneWidget,
      );
      final tela = textoDaTela(tester);
      for (final proibido in <String>[
        'ISCA-',
        'Local',
        'Sobre o encontro',
        'Horário de',
        'Das ',
        'Gratuito',
        'R\$',
        'Adicionar ao calendário',
        'da sua região',
      ]) {
        expect(tela, isNot(contains(proibido)), reason: 'vazou "$proibido"');
      }
      expect(find.byKey(LocalDoEncontro.chaveDoMapa), findsNothing);
      expect(rede.chamadasA('GET /v1/network/events/$slugPrivado/private-details'), isEmpty);
      expect(rede.chamadasA('GET /v1/network/events/$slugPrivado/location'), isEmpty);
      expect(rede.chamadasA('GET /v1/network/events/$slugPrivado/join-request'), isEmpty);

      // A guarda de acao (24.17.1, item 5).
      await rolarAte(tester, find.text('Pedir para participar'));
      await tester.tap(find.text('Pedir para participar'));
      await tester.pumpAndSettle();
      expect(find.text('Entre para pedir'), findsOneWidget);
      expect(
        find.text(
          'Entre na sua conta para pedir. Depois de entrar, a gente envia o '
          'pedido.',
        ),
        findsOneWidget,
      );
      expect(find.text('Agora não'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar').last);
      await tester.pumpAndSettle();

      // A guarda leva a pessoa a tela de entrar, e ela esta na frente.
      expect(find.byType(TelaEntrar), findsOneWidget);
      final guardado = jsonDecode((await envelope.ler())!) as Map<String, dynamic>;
      expect(guardado['acao'], 'pedir_para_participar');
      expect(guardado['alvo'], slugPrivado);
      expect(rede.chamadasA('POST /v1/network/events/$slugPrivado/join-request'), isEmpty);
    });

    testWidgets('com conta: pedir, pedido enviado, desistir', (tester) async {
      final rede = redePrivada();
      await abrirEncontro(tester, rede: rede, titulo: tituloPrivado);
      expect(rede.chamadasA('GET /v1/network/events/$slugPrivado/join-request'), hasLength(1));

      await rolarAte(tester, find.text('Pedir para participar'));
      await tester.tap(find.text('Pedir para participar'));
      await tester.pumpAndSettle();
      final post = rede.chamadasA('POST /v1/network/events/$slugPrivado/join-request');
      expect(post, hasLength(1));
      // Sem corpo: o pedido e da conta, sem texto e sem pet.
      expect(post.single.body, isEmpty);

      expect(find.text('Pedido enviado'), findsOneWidget);
      expect(
        find.text(
          'Se o pedido for aprovado até o dia do encontro, o local e os '
          'detalhes aparecem aqui.',
        ),
        findsOneWidget,
      );

      await tester.tap(find.text('Desistir do pedido'));
      await tester.pumpAndSettle();
      expect(find.text('Desistir do pedido?'), findsOneWidget);
      expect(find.text('Manter o pedido'), findsOneWidget);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Desistir do pedido'));
      await tester.pumpAndSettle();

      expect(rede.chamadasA('DELETE /v1/network/events/$slugPrivado/join-request'), hasLength(1));
      expect(find.text('Encontro privado'), findsOneWidget);
      expect(find.text('Pedir para participar'), findsOneWidget);
    });

    testWidgets(
        'ISCA -- o recusado chega como requested e a tela diz Pedido enviado',
        (tester) async {
      // ISCA: acrescente em `_caixaDoPrivado` um ramo para um estado de
      // recusa com o titulo `Pedido não aprovado`, e faca o servidor abaixo
      // responder `declined`. Este caso reprova pelo texto.
      final semantica = tester.ensureSemantics();
      for (final estado in <String>['requested', 'declined']) {
        final rede = redePrivada(estado: estado);
        await abrirEncontro(tester, rede: rede, titulo: tituloPrivado);

        expect(find.text('Pedido enviado'), findsOneWidget, reason: estado);
        final tela = textoDaTela(tester).toLowerCase();
        final falado = rotulosSemanticos(tester).toLowerCase();
        for (final proibido in <String>['recusad', 'não aprovado', 'negad']) {
          expect(tela, isNot(contains(proibido)));
          expect(falado, isNot(contains(proibido)));
        }
        expect(textoDaTela(tester), isNot(contains('ISCA-')));
        // Estado que o app nao conhece nao ganha acao.
        if (estado == 'declined') {
          expect(find.text('Desistir do pedido'), findsNothing);
        }
        expect(falado, contains('pedido enviado'));
        await tester.pumpWidget(const SizedBox.shrink());
      }
      semantica.dispose();
    });

    testWidgets('aprovado: o conteúdo oculto aparece, sem distância',
        (tester) async {
      final rede = redePrivada(estado: 'approved');
      telaAlta(tester);
      await abrirRede(tester, rede: rede);
      // Chega com uma distancia no `extra`, como se um cartao a tivesse
      // mandado: a pagina do privado a ignora.
      final contexto = tester.element(find.byType(AgendaDaRede));
      GoRouter.of(contexto).push(Rotas.encontroDaRedeDe(slugPrivado), extra: 800);
      await tester.pumpAndSettle();

      expect(rede.chamadasA('GET /v1/network/events/$slugPrivado/private-details'), hasLength(1));
      expect(find.text('Pedido aprovado'), findsOneWidget);
      expect(
        find.text('Você pode participar. O local e os detalhes estão abaixo.'),
        findsOneWidget,
      );
      expect(find.text('R\$ 30 por cão'), findsOneWidget);
      await rolarAte(tester, find.text('ISCA-LUGAR Parque Villa-Lobos'));
      expect(find.text('ISCA-LUGAR Parque Villa-Lobos'), findsOneWidget);
      expect(textoDaTela(tester), isNot(contains('da sua região')));
      expect(find.text('Compartilhar'), findsNothing);
    });
  
    testWidgets('falha ao consultar o pedido: o teaser fica e só a caixa diz',
        (tester) async {
      // ISCA: em `_lerPedido`, apague os dois `on ... return
      // const _PedidoLido.indisponivel()`. A falha sobe para `_carregar` e a
      // tela inteira vira a faixa de erro; este caso reprova no titulo.
      final rede = redePrivada(estado: 'requested');
      var falhar = true;
      rede.respostas['GET /v1/network/events/$slugPrivado/join-request'] = (_) =>
          falhar ? problema('internal-error', 500) : json200(pedido('requested'));
      await abrirEncontro(tester, rede: rede, titulo: tituloPrivado);

      expect(find.text(tituloPrivado), findsOneWidget);
      expect(find.text('Domingo, 4 de outubro'), findsOneWidget);
      expect(find.text('Não conseguimos consultar o seu pedido agora.'), findsOneWidget);
      expect(find.text('Pedir para participar'), findsNothing);
      falhar = false;
      await tester.tap(find.text('Tentar de novo'));
      await tester.pumpAndSettle();
      expect(find.text('Pedido enviado'), findsOneWidget);
      // So a consulta do pedido foi refeita: o encontro nao foi relido.
      expect(rede.chamadasA('GET /v1/network/events/$slugPrivado'), hasLength(1));
    });

    testWidgets('falha ao pedir: o erro fica na caixa', (tester) async {
      final rede = redePrivada();
      // Sem conexao: a camada de API traduz para uma frase conhecida.
      rede.respostas['POST /v1/network/events/$slugPrivado/join-request'] =
          (_) => throw http.ClientException('sem rede');
      await abrirEncontro(tester, rede: rede, titulo: tituloPrivado);
      await tester.tap(find.text('Pedir para participar'));
      await tester.pumpAndSettle();
      expect(find.text('Encontro privado'), findsOneWidget);
      expect(find.text('Pedido enviado'), findsNothing);
      expect(
        find.text('Isso precisa de conexão. Tente de novo quando tiver sinal.'),
        findsOneWidget,
      );
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('falha ao desistir: continua Pedido enviado, com o erro',
        (tester) async {
      final rede = redePrivada(estado: 'requested');
      rede.respostas['DELETE /v1/network/events/$slugPrivado/join-request'] =
          (_) => throw http.ClientException('sem rede');
      await abrirEncontro(tester, rede: rede, titulo: tituloPrivado);
      await tester.tap(find.text('Desistir do pedido'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, 'Desistir do pedido'));
      await tester.pumpAndSettle();
      expect(find.text('Pedido enviado'), findsOneWidget);
      expect(find.text('Desistir do pedido'), findsOneWidget);
      expect(
        find.text('Isso precisa de conexão. Tente de novo quando tiver sinal.'),
        findsOneWidget,
      );
      expect(find.byType(SnackBar), findsNothing);
    });

    for (final status in <int>[404, 500]) {
      testWidgets('aprovado com private-details $status: a faixa dos detalhes',
          (tester) async {
        final rede = redePrivada(estado: 'approved');
        rede.respostas['GET /v1/network/events/$slugPrivado/private-details'] =
            (_) => problema(status == 404 ? 'not-found' : 'internal-error', status);
        await abrirEncontro(tester, rede: rede, titulo: tituloPrivado);
        expect(find.text('Pedido aprovado'), findsOneWidget);
        expect(find.text('Não conseguimos carregar os detalhes agora.'), findsOneWidget);
        expect(textoDaTela(tester), isNot(contains('ISCA-')));
        expect(rede.chamadasA('GET /v1/network/events/$slugPrivado/location'), isEmpty);
      });
    }

    testWidgets('privado cancelado: o aviso, e nenhuma caixa de pedido',
        (tester) async {
      await abrirEncontro(
        tester,
        rede: redePrivada(status: 'cancelled'),
        titulo: tituloPrivado,
      );
      expect(
        find.text('A equipe do Bichu cancelou este encontro. Ele não vai acontecer.'),
        findsOneWidget,
      );
      expect(find.text('Pedir para participar'), findsNothing);
      expect(find.text('Encontro privado'), findsNothing);
    });

    testWidgets('privado encerrado sem aprovação: sem caixa e sem pedir',
        (tester) async {
      await abrirEncontro(
        tester,
        rede: redePrivada(status: 'ended', estado: 'requested'),
        titulo: tituloPrivado,
      );
      expect(find.text('Encerrado'), findsOneWidget);
      expect(find.text('Pedir para participar'), findsNothing);
      expect(find.text('Pedido enviado'), findsNothing);
    });

    testWidgets('a volta da guarda com erro: a caixa abre dizendo por que',
        (tester) async {
      final rede = redePrivada();
      telaAlta(tester);
      await abrirRede(tester, rede: rede);
      final contexto = tester.element(find.byType(AgendaDaRede));
      GoRouter.of(contexto).go(
        Rotas.encontroDaRedeDe(slugPrivado),
        extra: const RetomadaDoPedido(
          MensagemDeErro(texto: 'Este encontro já aconteceu.'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Encontro privado'), findsOneWidget);
      expect(find.text('Este encontro já aconteceu.'), findsOneWidget);
    });
    testWidgets('guarda: Agora não fecha a folha sem guardar nada', (tester) async {
      final rede = redePrivada();
      final envelope = DepositoDeIntencaoEmMemoria();
      telaAlta(tester);
      await abrirOApp(tester, rede: rede.call, envelope: envelope);
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();
      await abrirCartao(tester, tituloPrivado);
      await tester.tap(find.text('Pedir para participar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Agora não'));
      await tester.pumpAndSettle();
      expect(find.text('Entre para pedir'), findsNothing);
      expect(find.byType(TelaEntrar), findsNothing);
      expect(await envelope.ler(), isNull);
    });

    testWidgets('guarda: tocar em Entrar abre a tela de entrar', (tester) async {
      // ISCA: em `_abrirGuarda`, apague `context.push(Rotas.entrar)`. A
      // intencao fica guardada mas a pessoa continua no encontro, e este caso
      // reprova no `TelaEntrar`.
      final rede = redePrivada();
      final envelope = DepositoDeIntencaoEmMemoria();
      telaAlta(tester);
      await abrirOApp(tester, rede: rede.call, envelope: envelope);
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();
      await abrirCartao(tester, tituloPrivado);
      await tester.tap(find.text('Pedir para participar'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(BottomSheet),
          matching: find.text('Entrar'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Entre para pedir'), findsNothing);
      expect(find.byType(TelaEntrar), findsOneWidget);
      expect(await envelope.ler(), contains('pedir_para_participar'));
    });
  });
}
