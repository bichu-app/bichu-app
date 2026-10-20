// A pagina do encontro (design system 24.12 a 24.17, UX 28).
//
// ---------------------------------------------------------------------------
// ESTE ARQUIVO FOI APAGADO EM 19/10/2026 E VOLTOU EM 20/10
// ---------------------------------------------------------------------------
// Ele tinha 28 casos e saiu inteiro com a tela. O cliente corrigiu o pedido no
// dia seguinte -- *"eu nao pedi pra voce remover, eu pedi para remover o
// clique para o usuario nnao conseguir acessar a pagina de detalhes e pedi pra
// voce resumir a listagem com foto, titulo do evento"* -- e a tela voltou do
// historico (`be057793^`).
//
// **VOLTARAM 15 CASOS, e nao os 28.** Os 13 do grupo `encontro público` e os 2
// de `cancelado e encerrado` voltam verbatim: eles medem a pagina que existe
// de novo. Os 13 do grupo `encontro privado` NAO voltam, e a ausencia e
// decisao do cliente e nao corte meu -- *"vamos deixar apenas os eventos
// abertos por enquanto, no futuro analisamos a necessidade"*. Com o evento
// privado sairam o teaser, `Pedir para participar`, `Desistir do pedido`, a
// caixa de estado do pedido e a folha de guarda de acao; medir um estado que o
// produto nao tem seria portao cego por construcao.
//
// O aviso de login no TOQUE do cartao -- o pedido de 20/10 -- tem arquivo
// proprio: `test/telas/aviso_de_login_ao_ver_detalhe_test.dart`. Aqui mora o
// que a pagina mostra DEPOIS de aberta.
//
// As iscas que sobreviveram, e elas sao as que importam agora:
//   1. o mapa nao aparece sem token (e `/location` nem e chamada);
//   2. sem conta nao ha endereco nem `Abrir no mapa`;
//   3. sem links nao ha secao `Links` (nem moldura vazia);
//   4. cancelado e encerrado nao oferecem calendario nem preparo.


import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/rede/local_do_encontro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';
import 'fixtures_da_rede.dart';

class SaidaDeTeste extends SaidaDoApp {
  final List<({double lat, double lon, String nome})> mapas =
      <({double lat, double lon, String nome})>[];
  final List<EventoDeCalendario> calendario = <EventoDeCalendario>[];

  /// O que foi para o app de mapas como TEXTO (endereco por extenso).
  final List<String> enderecos = <String>[];

  /// O que foi para o navegador do aparelho (convite, Instagram).
  final List<Uri> links = <Uri>[];
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
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async {
    enderecos.add(endereco);
    return abre;
  }

  @override
  Future<bool> abrirLink(Uri link) async {
    links.add(link);
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

/// Abre a pagina do encontro, **pelo caminho que existe em cada sessao**.
///
/// ## Os DOIS caminhos, e por que eles sao diferentes desde 20/10/2026
///
/// Logado, o caminho e o da pessoa: toca no cartao da agenda, e o cartao abre
/// a pagina.
///
/// Deslogado, **o cartao NAO abre mais a pagina** -- ele abre a folha com o
/// convite para entrar, que e o pedido do cliente de 20/10 e tem arquivo
/// proprio de iscas (`test/telas/aviso_de_login_ao_ver_detalhe_test.dart`).
/// Entao os casos deslogados daqui chegam pelo ENDERECO, que e um caminho de
/// verdade e nao um atalho de teste: a rota nao tem guarda, o link do evento e
/// compartilhavel, e medido na homologacao em 20/10/2026
/// `GET /v1/network/events/{slug}` responde **200 sem conta**.
///
/// **Esta funcao e o ponto unico da distincao**, e e por isso que ela existe:
/// seis casos deslogados chegavam pelo cartao, e seis copias da decisao
/// divergiriam na proxima mudanca de navegacao. O que eles medem nao mudou --
/// o que a PAGINA mostra sem conta -- e por isso nenhum deles foi reescrito.
Future<void> abrirEncontro(
  WidgetTester tester, {
  required RedeDeTeste rede,
  required String titulo,
  bool logado = true,
}) async {
  telaAlta(tester);
  await abrirRede(tester, rede: rede, logado: logado);
  if (logado) {
    await abrirCartao(tester, titulo);
    return;
  }
  // **PELO ENDERECO, e com o `extra` que o cartao passaria.** `distancia`
  // nao vai: por link direto ela nao existe, e e exatamente o que o caso
  // `a distância vem do cartão` mede do outro lado.
  await irPara(tester, Rotas.encontroDaRedeDe(slugDe(titulo)));
}

/// O `slug` do encontro com este titulo, entre os dois que as fixtures montam.
///
/// **Reprova no titulo que ela nao conhece** em vez de devolver um slug
/// qualquer: um slug errado faria a rota responder 404 e o caso reprovaria
/// dizendo que a pagina nao mostra o que deveria -- pelo motivo errado.
String slugDe(String titulo) {
  if (titulo == tituloPublico) return slugPublico;
  fail(
    'REPROVA: nao sei o slug de "$titulo". As fixtures montam dois encontros '
    'e so o publico sobreviveu a saida do evento privado.',
  );
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
        'Sobre o evento',
        'Para quais cães',
        'Todos os portes',
        'Qualquer idade',
        'Vacinação em dia',
        'O que levar',
        'Água',
        'Saquinhos para cocô',
        'Cuidados no evento',
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

    testWidgets('com conta e endereço: a linha do endereço, e Abrir no mapa manda o TEXTO',
        (tester) async {
      const endereco = 'R. Teodoro Sampaio, 1020 - Pinheiros, São Paulo - SP';
      final rede = redeDoEncontro(
        encontro: encontroPublico(),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location':
              sempre(localizacao(lat: null, endereco: endereco)),
        },
      );
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico);

      await rolarAte(tester, find.text(LocalDoEncontro.rotuloDoMapa));
      expect(find.text(endereco), findsOneWidget);

      await tester.tap(find.text(LocalDoEncontro.rotuloDoMapa));
      await tester.pumpAndSettle();
      // O TEXTO vai para o app de mapas: nenhuma coordenada, porque nao
      // geocodificamos (ADR-0006).
      expect(saida.enderecos, <String>[endereco]);
      expect(saida.mapas, isEmpty);
    });

    testWidgets('ISCA -- com endereço E ponto há um botão só, o do endereço',
        (tester) async {
      const endereco = 'R. Teodoro Sampaio, 1020 - Pinheiros, São Paulo - SP';
      final rede = redeDoEncontro(
        encontro: encontroPublico(),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location':
              sempre(localizacao(endereco: endereco)),
        },
      );
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico);

      await rolarAte(tester, find.text(LocalDoEncontro.rotuloDoMapa));
      expect(find.text(LocalDoEncontro.rotuloDoMapa), findsOneWidget);
      expect(find.text(LocalDoEncontro.rotuloDoBotao), findsNothing);
    });

    testWidgets('ISCA -- sem conta não há endereço nem Abrir no mapa',
        (tester) async {
      final rede = redeDoEncontro(
        encontro: encontroPublico(),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location': sempre(
            localizacao(endereco: 'R. Teodoro Sampaio, 1020'),
          ),
        },
      );
      await abrirEncontro(
        tester,
        rede: rede,
        titulo: tituloPublico,
        logado: false,
      );

      // Nao prometemos o que nao vai aparecer: nem o endereco, nem o botao.
      expect(find.text(LocalDoEncontro.rotuloDoMapa), findsNothing);
      expect(textoDaTela(tester), isNot(contains('Teodoro Sampaio')));
    });

    testWidgets('links: convite e Instagram abrem no navegador, sem conta',
        (tester) async {
      final rede = redeDoEncontro(
        encontro: encontroPublico(
          ticketUrl: 'https://ingresso.exemplo.test/oktoberpet',
          instagramHandle: 'bichu.app',
          instagramUrl: 'https://www.instagram.com/bichu.app',
        ),
      );
      await abrirEncontro(
        tester,
        rede: rede,
        titulo: tituloPublico,
        logado: false,
      );

      await rolarAte(tester, find.text('Comprar convite'));
      await tester.tap(find.text('Comprar convite'));
      await tester.pumpAndSettle();
      await rolarAte(tester, find.text('Instagram'));
      await tester.tap(find.text('Instagram'));
      await tester.pumpAndSettle();

      expect(saida.links, <Uri>[
        Uri.parse('https://ingresso.exemplo.test/oktoberpet'),
        Uri.parse('https://www.instagram.com/bichu.app'),
      ]);
    });

    testWidgets('ISCA -- sem links não há seção Links (nem moldura vazia)',
        (tester) async {
      final rede = redeDoEncontro(encontro: encontroPublico());
      await abrirEncontro(
        tester,
        rede: rede,
        titulo: tituloPublico,
        logado: false,
      );

      expect(find.text('Links'), findsNothing);
      expect(find.text('Comprar convite'), findsNothing);
      expect(find.text('Instagram'), findsNothing);
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
        find.text('A equipe do Bichu cancelou este evento. Ele não vai acontecer.'),
        findsOneWidget,
      );
      await rolarAte(tester, find.text('Sobre o evento'));
      final tela = textoDaTela(tester);
      expect(tela, isNot(contains('Adicionar ao calendário')));
      expect(tela, isNot(contains('Cuidados no evento')));
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
      await rolarAte(tester, find.text('Sobre o evento'));
      final tela = textoDaTela(tester);
      expect(tela, isNot(contains('Adicionar ao calendário')));
      expect(tela, isNot(contains('Cuidados no evento')));
    });
  });
}
