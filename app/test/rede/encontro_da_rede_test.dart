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
import 'package:bichu/dispositivo/textos_do_app_de_mapas.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/rede/encontro_da_rede.dart';
import 'package:bichu/telas/rede/local_do_encontro.dart';
import 'package:bichu/telas/rede/pecas_da_rede.dart';
import 'package:bichu/widgets/visualizador_de_imagem.dart';
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

  /// O que foi para a FOLHA DO SISTEMA: texto e assunto, na ordem em que
  /// sairam.
  ///
  /// Ate 21/10/2026 este metodo devolvia `false` fixo e nao registrava nada --
  /// o arquivo nao exercitava compartilhamento. O cliente pediu a acao na
  /// pagina do encontro naquele dia, e o grupo `compartilhar o encontro`
  /// precisa LER o texto que saiu: medir o que a pessoa manda para um grupo de
  /// bairro e a unica forma de a isca de privacidade ser isca.
  final List<({String texto, String assunto})> compartilhados =
      <({String texto, String assunto})>[];

  @override
  Future<bool> compartilharTexto({
    required String texto,
    required String assunto,
  }) async {
    compartilhados.add((texto: texto, assunto: assunto));
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
      expect(find.text(TelaDoEncontro.cadastradoPelaEquipe), findsOneWidget);
      expect(find.text('Gratuito'), findsOneWidget);
      expect(find.text('Sábado, 3 de outubro'), findsOneWidget);
      expect(find.text('Das 9h às 11h · 2 horas'), findsOneWidget);
      expect(find.text('Horário de Brasília'), findsOneWidget);
      expect(find.text('Adicionar ao calendário'), findsOneWidget);

      for (final t in <String>[
        'Sobre o evento',
        'Para quais cachorros',
        'Todos os portes',
        'Qualquer idade',
        'Vacinação em dia',
        'O que levar',
        'Água',
        'Saquinhos para cocô',
        'Cuidados no evento',
        'Recolha o cocô e descarte em local adequado.',
        'Na área cercada, o cachorro pode ficar solto. Fora dela, na guia.',
        'Se o seu cachorro parecer desconfortável, afaste-se do grupo com ele por '
            'um tempo.',
        'Fêmea no cio fica em casa.',
        'Acessibilidade e estrutura',
        'Área cercada para cachorros soltos',
        'Sombra',
        'Observações',
      ]) {
        await rolarAte(tester, find.text(t));
        expect(find.text(t), findsOneWidget, reason: 'falta "$t"');
      }
      // O que saiu na revisão da UX (24.17.1).
      //
      // **`Compartilhar` SAIU desta lista em 21/10/2026**, e a saída é pedido
      // do cliente e não descuido: *"vamos implementar o recurso de
      // compartilhar o evento tambem, inserir um botao na pagina de detalhes
      // do evento para convidar outros usuarios no whatsapp e outras
      // ferramentas"*. A 24.17.1 tinha tirado a ação; ele a pediu de volta.
      // O grupo `compartilhar o encontro`, no fim deste arquivo, é quem a
      // mede agora -- a linha não ficou sem dono.
      final tela = textoDaTela(tester);
      for (final t in <String>[
        'Quem organiza',
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

      await rolarAte(tester, find.text(TextosDoAppDeMapas.rotuloDoEndereco));
      expect(find.text(endereco), findsOneWidget);

      await tester.tap(find.text(TextosDoAppDeMapas.rotuloDoEndereco));
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

      await rolarAte(tester, find.text(TextosDoAppDeMapas.rotuloDoEndereco));
      expect(find.text(TextosDoAppDeMapas.rotuloDoEndereco), findsOneWidget);
      expect(find.text(TextosDoAppDeMapas.rotuloDoPonto), findsNothing);
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
      expect(find.text(TextosDoAppDeMapas.rotuloDoEndereco), findsNothing);
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

      // `encontroPublico` monta `admission.kind: 'free'`, entao o rotulo
      // deste caso e o do ramo GRATUITO -- ver o grupo
      // `o rotulo do ingresso` no fim deste arquivo.
      await rolarAte(tester, find.text('Retirar Ingresso'));
      await tester.tap(find.text('Retirar Ingresso'));
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
      expect(find.text('Retirar Ingresso'), findsNothing);
      expect(find.text('Comprar Ingresso'), findsNothing);
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
      expect(tela, isNot(contains('Para quais cachorros')));
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

  // -------------------------------------------------------------------------
  // A FOTO PRINCIPAL AMPLIA AO TOQUE (cliente, 20/10/2026)
  // -------------------------------------------------------------------------
  // Literal: *"na pagina de detalhes do evento, a foto principal deve ser
  // clicada e ampliada."*
  //
  // Os dois casos medem coisas DIFERENTES de proposito, e nenhum deles vale
  // pelo outro:
  //
  //   1. com foto, o toque ABRE e o `Fechar` FECHA -- as duas metades, porque
  //      abrir sem saida e o defeito que prende a pessoa na imagem;
  //   2. SEM foto, nao existe alvo de toque -- a ficha do evento sem imagem
  //      desenha o banner da marca, e banner que se anuncia como botao promete
  //      uma tela que nao abre.
  //
  // O que estes casos NAO medem: os pixeis da ampliacao. `Image.network` nao
  // busca nada em teste de widget (o cliente HTTP do `flutter_test` responde
  // 400 a tudo), entao a imagem cai no `errorBuilder` e o que se mede aqui e a
  // TELA que abriu e o caminho de volta -- que e justamente o que o pedido diz.
  group('a capa amplia', () {
    /// A capa com foto. `cover_banner_url` e a derivada de 1280 px do detalhe,
    /// e e ela que a capa prefere; `images` da o `alt_text`.
    Map<String, dynamic> comCapa() => encontroPublico(
          images: <Map<String, dynamic>>[
            imagem('https://midia.exemplo.invalid/capa.jpeg', 'Cães na praça'),
          ],
          coverBannerUrl: 'https://midia.exemplo.invalid/capa-1280.jpeg',
        );

    testWidgets('a foto principal abre ampliada e fecha', (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: comCapa()),
      );

      // Antes do toque nao ha visualizador: sem isto o caso ficaria verde com
      // uma tela que sempre esteve aberta.
      expect(find.byType(VisualizadorDeImagem), findsNothing);

      await tester.tap(find.byType(ImagemDoEncontroOuBanner));
      await tester.pumpAndSettle();

      expect(
        find.byType(VisualizadorDeImagem),
        findsOneWidget,
        reason: 'REPROVA: o toque na foto principal não abriu a imagem ampliada.',
      );

      // A SAIDA, e ela e o que impede a pessoa de ficar presa. O botao tem
      // NOME (`tooltip`), porque alvo anunciado so como "botao" reprova em
      // SC 4.1.2.
      final fechar = find.byTooltip(VisualizadorDeImagem.rotuloDeFechar);
      expect(
        fechar,
        findsOneWidget,
        reason: 'REPROVA: a imagem ampliada abriu sem botão de fechar com nome.',
      );
      await tester.tap(fechar);
      await tester.pumpAndSettle();

      expect(
        find.byType(VisualizadorDeImagem),
        findsNothing,
        reason: 'REPROVA: o Fechar não devolveu a pessoa para a ficha.',
      );
      // E ela voltou para a FICHA, e nao para uma tela em branco.
      expect(find.text(tituloPublico), findsOneWidget);
    });

    // O ARRASTO DA FOTO AMPLIADA E LIMITADO AS BORDAS (26/10/2026).
    //
    // Duas falas do cliente, e a segunda corrige a leitura da primeira:
    // *"o usuario consegue arrastar a imagem para varias posicoes, a imagem
    // deve ficar fixa"* e, depois, *"o arraste limitada as bordas"*. A
    // primeira entrega desligou o arrasto (`panEnabled: false`) e foi longe
    // demais -- tirava tambem o passeio DENTRO da foto ampliada. O conserto e
    // `boundaryMargin: EdgeInsets.zero`, que entrega as duas metades.
    //
    // **O CASO VIVE AQUI, E NAO SO NO VISUALIZADOR**, porque o cliente nomeou
    // ESTA tela. O mecanismo e compartilhado; a conta e desta superficie.
    //
    // DESLIGAR PARA VER REPROVAR, em `_ImagemAmpliavelState.build` de
    // `lib/widgets/visualizador_de_imagem.dart`, e cada um derruba uma metade:
    //   * `boundaryMargin` de volta para `const EdgeInsets.all(double.infinity)`
    //     -> reprova a metade 1 (sem ampliar a foto passa a andar);
    //   * `panEnabled: false` -> reprova a metade 2 (ampliada ela para de
    //     passear).
    testWidgets('a capa ampliada arrasta DENTRO das bordas, e nao sai delas', (
      tester,
    ) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: comCapa()),
      );
      await tester.tap(find.byType(ImagemDoEncontroOuBanner));
      await tester.pumpAndSettle();

      // ANCORA DUPLA: o visualizador abriu, e a foto DELE esta na arvore. O
      // `Finder` e escopado porque a rota de baixo continua montada, e a
      // imagem da pagina nao se move -- ela aprovaria o caso no lugar errado.
      expect(find.byType(VisualizadorDeImagem), findsOneWidget);
      final foto = find
          .descendant(
            of: find.byType(VisualizadorDeImagem),
            matching: find.byType(Image),
          )
          .first;
      expect(foto, findsOneWidget);
      Rect pintada() =>
          Rect.fromPoints(tester.getTopLeft(foto), tester.getBottomRight(foto));

      // --- METADE 1: SEM AMPLIAR a foto nao sai do lugar.
      final parada = pintada();
      await tester.drag(find.byType(InteractiveViewer), const Offset(-137, -151));
      await tester.pumpAndSettle();
      expect(
        pintada().left,
        closeTo(parada.left, 0.5),
        reason: 'REPROVA: sem ampliacao a foto andou com o arrasto -- saiu de '
            '$parada e parou em ${pintada()}. E a queixa literal do cliente '
            'em 26/10/2026. Meio pixel de tolerancia porque o `clamp` do '
            '`InteractiveViewer` deixa residuo de 2,4e-10 px; o defeito '
            'deslocava 118,9 px.',
      );

      // --- METADE 2: AMPLIADA o dedo passeia, e para na borda.
      await tester.tap(find.byType(InteractiveViewer));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.byType(InteractiveViewer));
      await tester.pumpAndSettle();
      final ampliada = pintada();
      expect(
        ampliada.width,
        greaterThan(parada.width),
        reason: 'REPROVA: o toque duplo nao ampliou, e sem ampliacao o resto '
            'deste caso nao mede o que diz medir.',
      );

      await tester.drag(find.byType(InteractiveViewer), const Offset(-5000, -5000));
      await tester.pumpAndSettle();
      final noLimite = pintada();
      expect(
        noLimite.left,
        lessThan(ampliada.left),
        reason: 'REPROVA: ampliada, a foto NAO passeia com o dedo. O cliente '
            'pediu *"o arraste limitada as bordas"*: limitado, e nao '
            'desligado -- passear dentro da foto e para que serve ampliar.',
      );

      await tester.drag(find.byType(InteractiveViewer), const Offset(-5000, -5000));
      await tester.pumpAndSettle();
      expect(
        pintada().left,
        closeTo(noLimite.left, 0.5),
        reason: 'REPROVA: a foto CONTINUOU andando depois de encostar na '
            'borda -- estava em $noLimite e foi para ${pintada()}. Com '
            '`boundaryMargin` infinito nao existe limite e cada arrasto soma.',
      );
      // E no limite ela ainda COBRE a janela: borda certa, e nao vazio na tela.
      expect(
        noLimite.right >= parada.right - 0.5 &&
            noLimite.bottom >= parada.bottom - 0.5,
        isTrue,
        reason: 'REPROVA: no limite a foto deixou vazio na tela -- $noLimite '
            'nao cobre $parada. A borda tem dois lados: a imagem nao sai para '
            'fora E nao deixa buraco.',
      );
    });

    testWidgets('ficha sem foto não oferece toque', (tester) async {
      // `images` vazia e `coverBannerUrl` nulo sao o padrao da fixture, e sao
      // o estado NORMAL de um encontro sem imagem -- nao um caso de borda.
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico()),
      );

      // A capa DESENHA (o banner da marca), e e isso que torna o caso
      // interessante: ha o que tocar na tela, e nada pode responder.
      final capa = find.byType(ImagemDoEncontroOuBanner);
      expect(capa, findsOneWidget);

      // 1. Estrutural: nao ha `InkWell` em volta da capa. Um `InkWell` com
      //    `onTap` nulo ainda se anuncia; aqui nao ha `InkWell` nenhum.
      expect(
        find.ancestor(of: capa, matching: find.byType(InkWell)),
        findsNothing,
        reason: 'REPROVA: a capa sem foto está envolvida por um alvo de toque.',
      );

      // 2. De comportamento: tocar nela nao abre tela nenhuma.
      await tester.tap(capa);
      await tester.pumpAndSettle();
      expect(
        find.byType(VisualizadorDeImagem),
        findsNothing,
        reason: 'REPROVA: a ficha sem foto abriu a imagem ampliada.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // A LINHA DA ORIGEM NAO MENTE (20/10/2026)
  // -------------------------------------------------------------------------
  // Ate aqui a ficha escrevia *"Cadastrado pela equipe do Bichu"*
  // **incondicionalmente** -- inclusive em encontro proposto pela comunidade --
  // porque `NetworkEventPublic` nao trazia a origem e o literal era um so.
  // Rotulo afirmando autoria que o dado nao provava, e a afirmacao estava
  // ERRADA metade das vezes.
  //
  // O campo `origin` ja existia na coluna e no painel; o que mudou e que ele
  // passou a sair tambem na leitura publica. Ele e a ORIGEM (`admin` ou
  // `community`), e **nao o autor**: `created_by_user_id` continua sem sair
  // do servidor, e nenhum destes tres casos pede nome de pessoa nenhuma.
  group('a linha da origem', () {
    testWidgets('evento da EQUIPE diz equipe do Bichu', (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico(origin: 'admin')),
      );
      expect(find.text(TelaDoEncontro.cadastradoPelaEquipe), findsOneWidget);
      expect(find.text(TelaDoEncontro.cadastradoPelaComunidade), findsNothing);
    });

    testWidgets('evento da COMUNIDADE não diz equipe do Bichu', (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico(origin: 'community')),
      );
      expect(
        find.text(TelaDoEncontro.cadastradoPelaComunidade),
        findsOneWidget,
        reason: 'REPROVA: evento da comunidade não disse que veio da comunidade.',
      );
      expect(
        find.text(TelaDoEncontro.cadastradoPelaEquipe),
        findsNothing,
        reason: 'REPROVA: a ficha atribuiu à equipe do Bichu um evento da comunidade.',
      );
    });

    testWidgets('sem origem a ficha CALA, e não chuta a equipe', (tester) async {
      // `origin: ''` monta o encontro SEM o campo, que e o gravado antes de
      // 20/10/2026. Cair na equipe aqui seria repor o defeito com outra roupa.
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico(origin: '')),
      );
      expect(find.text(tituloPublico), findsOneWidget);
      expect(
        find.text(TelaDoEncontro.cadastradoPelaEquipe),
        findsNothing,
        reason: 'REPROVA: sem origem no contrato, a ficha chutou a equipe do Bichu.',
      );
      expect(find.text(TelaDoEncontro.cadastradoPelaComunidade), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  // COMPARTILHAR O ENCONTRO (cliente, 21/10/2026)
  // -------------------------------------------------------------------------
  //
  // *"vamos implementar o recurso de compartilhar o evento tambem, inserir um
  // botao na pagina de detalhes do evento para convidar outros usuarios no
  // whatsapp e outras ferramentas"*.
  //
  // As iscas deste grupo, e o que cada uma derruba se o mecanismo sumir:
  //   1. o botao EXISTE e abre a FOLHA, e nao o navegador;
  //   2. o texto carrega titulo, dia, horario e lugar;
  //   3. o texto NAO carrega endereco de rua -- a privacidade;
  //   4. cancelado e encerrado nao oferecem a acao;
  //   5. folha que nao abre vira aviso, e nao silencio;
  //   6. o botao e ALCANCAVEL numa tela de celular de verdade;
  //   7. o LINK do texto e o `share_url` DO SERVIDOR (21/10/2026);
  //   8. sem `share_url`, o texto sai sem link -- e o interruptor.
  group('compartilhar o encontro', () {
    testWidgets('o botão abre a FOLHA do sistema com o texto do encontro',
        (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico()),
      );

      await rolarAte(tester, find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.tap(find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      expect(
        saida.compartilhados,
        hasLength(1),
        reason: 'REPROVA: o toque em Compartilhar não abriu a folha do sistema.',
      );
      // A folha, e NAO o navegador: `abrirLink` leva o convite e o Instagram, e
      // trocar uma pela outra mandaria o link para o aparelho de quem
      // compartilha em vez de para o grupo.
      expect(saida.links, isEmpty);
    });

    testWidgets('o texto leva título, dia, horário e lugar', (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico()),
      );

      await rolarAte(tester, find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.tap(find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      final enviado = saida.compartilhados.single;
      // O fixture nao passa `share_url`, que e o estado de 21/10/2026: a
      // pagina nao esta publicada, o servidor omite o campo e o texto sai
      // **identico ao de antes de o link existir**. Este caso e a prova de que
      // acender a pagina nao exigiu APK novo -- e a isca do item 8.
      expect(
        enviado.texto,
        'Passeio matinal na Benedito Calixto\n'
        'Sábado, 3 de outubro · Das 9h às 11h\n'
        'Praça Benedito Calixto, Pinheiros, São Paulo - SP\n'
        'Encontrei no Bichu. Vamos juntos?',
      );
      expect(
        enviado.texto,
        isNot(contains('http')),
        reason: 'REPROVA: um link apareceu sem o servidor ter mandado `share_url`. '
            'O app NAO monta o endereco: um literal montado aqui seria link morto '
            'no dia em que o site mudasse, e o binario instalado nao se corrige.',
      );
      expect(enviado.assunto, 'Vamos juntos? Passeio matinal na Benedito Calixto');
    });

    testWidgets(
        'ISCA -- o texto compartilhado não carrega endereço de rua',
        (tester) async {
      // ESTE CASO E O FREIO DE PRIVACIDADE. `street_address` so sai de
      // `getNetworkEventLocation`, com `bearerAuth` (emenda 1 do ADR-0010), e o
      // ADR-0027 item 21.2 diz que ele **nunca** sai na agenda nem no detalhe
      // publico. A tela TEM o endereco na mao (`_endereco`, desenhado no bloco
      // `Local`) -- e e por isso que o caso monta a sessao LOGADA, com endereco
      // de verdade na resposta: sem conta nao haveria o que vazar, e a isca
      // nao seria isca.
      //
      // Trocar `c.lugar.linhaCompleta` por `_endereco` em
      // `_compartilharOEncontro` derruba este caso, e so este.
      const endereco = 'R. Teodoro Sampaio, 1020 - Pinheiros, São Paulo - SP';
      final rede = redeDoEncontro(
        encontro: encontroPublico(),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location':
              sempre(localizacao(lat: null, endereco: endereco)),
        },
      );
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico);

      // O endereco ESTA na tela: o caso prova que ele chegou antes de provar
      // que ele nao sai.
      await rolarAte(tester, find.text(endereco));
      expect(find.text(endereco), findsOneWidget);

      await rolarAte(tester, find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.tap(find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      final texto = saida.compartilhados.single.texto;
      expect(
        texto,
        isNot(contains('Teodoro Sampaio')),
        reason: 'REPROVA: o endereço de rua, que só sai com conta, foi para '
            'um grupo de WhatsApp.',
      );
      expect(texto, isNot(contains('1020')));
      expect(texto, isNot(contains('Teodoro Sampaio, 1020')));
    });

    // -----------------------------------------------------------------------
    // O LINK DA PAGINA PUBLICA (cliente, 21/10/2026)
    // -----------------------------------------------------------------------
    //
    // "Criar a pagina do encontro -- mesma forma do pet perdido: pagina publica
    //  no site + campo de link no contrato + um interruptor que ACENDE o link
    //  sem precisar de APK novo."
    //
    // O interruptor mora no SERVIDOR (`site_page_availability`, migracao
    // `20261020000017`), e o que o app faz e **ler `share_url` e nada mais**.

    testWidgets('CONTROLE POSITIVO -- com `share_url`, o link entra no texto',
        (tester) async {
      const link = 'https://bichu.app/encontro/$slugPublico';
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(
          encontro: encontroPublico(shareUrl: link),
        ),
      );

      await rolarAte(tester, find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.tap(find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      final texto = saida.compartilhados.single.texto;
      expect(
        texto,
        'Passeio matinal na Benedito Calixto\n'
        'Sábado, 3 de outubro · Das 9h às 11h\n'
        'Praça Benedito Calixto, Pinheiros, São Paulo - SP\n'
        'Encontrei no Bichu. Vamos juntos?\n'
        '$link',
        reason: 'REPROVA: o `share_url` do servidor não chegou ao texto, ou chegou '
            'em outro lugar. Sem este caso, todas as iscas de "não há link" '
            'passariam com a função nunca pondo link nenhum.',
      );
    });

    testWidgets(
        'ISCA -- o link do texto é o DO SERVIDOR, e não um montado no aparelho',
        (tester) async {
      // O servidor manda um endereco que o app **nao teria como inventar**:
      // outro host e outro caminho. Se o texto trouxer `/encontro/<slug>` em
      // `bichu.app`, alguem montou o literal aqui -- e esse literal vira link
      // morto no dia em que o site mudar de forma.
      const doServidor = 'https://hml.bichu.app/e/zzz-outro-caminho';
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico(shareUrl: doServidor)),
      );

      await rolarAte(tester, find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.tap(find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      final texto = saida.compartilhados.single.texto;
      expect(texto, contains(doServidor));
      expect(
        texto,
        isNot(contains('/encontro/$slugPublico')),
        reason: 'REPROVA: o app montou o endereço a partir do `slug` em vez de usar '
            'o que o servidor mandou.',
      );
    });

    testWidgets(
        'ISCA DE VAZAMENTO -- com link, o endereço de rua CONTINUA fora do texto',
        (tester) async {
      // O freio de privacidade de novo, agora com o link aceso: o caso existe
      // porque a tentacao de "mandar tudo que a tela tem" cresce exatamente
      // quando a mensagem passa a ter mais de uma parte.
      const endereco = 'R. Teodoro Sampaio, 1020 - Pinheiros, São Paulo - SP';
      const link = 'https://bichu.app/encontro/$slugPublico';
      final rede = redeDoEncontro(
        encontro: encontroPublico(shareUrl: link),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location':
              sempre(localizacao(lat: null, endereco: endereco)),
        },
      );
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico);

      // O endereco ESTA na tela antes de o caso provar que ele nao sai.
      await rolarAte(tester, find.text(endereco));
      expect(find.text(endereco), findsOneWidget);

      await rolarAte(tester, find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.tap(find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      final texto = saida.compartilhados.single.texto;
      expect(texto, contains(link));
      expect(
        texto,
        isNot(contains('Teodoro Sampaio')),
        reason: 'REPROVA: o endereço de rua, que só sai com conta, foi para um grupo '
            'de WhatsApp junto com o link.',
      );
      expect(texto, isNot(contains('1020')));
    });

    testWidgets('o link vem por ÚLTIMO, depois do convite', (tester) async {
      // A ordem nao e estetica: e o fim do texto que a pre-visualizacao do
      // WhatsApp usa para montar o cartao, e quem le no celular ve o convite
      // antes do endereco.
      const link = 'https://bichu.app/encontro/$slugPublico';
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico(shareUrl: link)),
      );
      await rolarAte(tester, find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.tap(find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      expect(saida.compartilhados.single.texto, endsWith(link));
    });

    testWidgets('ISCA -- encontro cancelado não oferece compartilhar',
        (tester) async {
      final rede = redeDoEncontro(
        encontro: encontroPublico(status: 'cancelled'),
        mais: <String, http.Response Function(http.Request)>{
          'GET /v1/network/events/$slugPublico/location': sempre(localizacao()),
        },
      );
      await abrirEncontro(tester, rede: rede, titulo: tituloPublico);

      await rolarAte(tester, find.text('Sobre o evento'));
      expect(
        textoDaTela(tester),
        isNot(contains(TelaDoEncontro.rotuloDeCompartilhar)),
        reason: 'REPROVA: a tela convidou gente para um encontro cancelado.',
      );
    });

    testWidgets('ISCA -- encontro encerrado não oferece compartilhar',
        (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico(status: 'ended')),
      );
      await rolarAte(tester, find.text('Sobre o evento'));
      expect(
        textoDaTela(tester),
        isNot(contains(TelaDoEncontro.rotuloDeCompartilhar)),
        reason: 'REPROVA: a tela convidou gente para um encontro encerrado.',
      );
    });

    testWidgets('ISCA -- a folha que não abre vira aviso, e não silêncio',
        (tester) async {
      saida.abre = false;
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(encontro: encontroPublico()),
      );

      await rolarAte(tester, find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.tap(find.text(TelaDoEncontro.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      expect(
        find.text(TelaDoEncontro.falhaDoCompartilhar),
        findsOneWidget,
        reason: 'REPROVA: a folha não abriu e a tela ficou calada. Um toque '
            'que não faz nada é indistinguível de um toque que não chegou.',
      );
    });

    testWidgets('ISCA -- o botão é ALCANÇÁVEL numa tela de celular de verdade',
        (tester) async {
      // `telaAlta` monta 400 x 4000: a página inteira cabe de uma vez, e um
      // botão empurrado para fora da área útil passaria despercebido. Aqui a
      // tela é 390 x 844 (um iPhone 14), que é tela de gente.
      //
      // O caso mede DUAS coisas que um `tap` sozinho não mede:
      //   - o retângulo do botão está INTEIRO dentro da área visível **sem
      //     rolagem nenhuma** -- é na primeira dobra que o cliente o pediu;
      //   - o toque LANDA, e sem `warnIfMissed: false`. `tocarSemRolar` usa
      //     `warnIfMissed: false` em outros arquivos, e com ele um botão atrás
      //     de outra coisa passa verde: aqui o aviso é fatal de propósito.
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(tester.view.reset);

      await abrirRede(
        tester,
        rede: redeDoEncontro(encontro: encontroPublico()),
        logado: false,
      );
      await irPara(tester, Rotas.encontroDaRedeDe(slugPublico));

      final botao = find.text(TelaDoEncontro.rotuloDeCompartilhar);
      expect(botao, findsOneWidget);

      final r = tester.getRect(botao);
      expect(
        r.top >= 0 && r.bottom <= 844,
        isTrue,
        reason: 'REPROVA: sem rolar, o botão está em $r, fora da tela de '
            '390 x 844. O cliente pediu o botão NA página, e botão que exige '
            'procurar é botão que ninguém acha.',
      );

      await tester.tap(botao);
      await tester.pumpAndSettle();

      expect(
        saida.compartilhados,
        hasLength(1),
        reason: 'REPROVA: o botão existe na árvore mas não recebe toque numa '
            'tela de 390 x 844 -- alguma coisa está por cima dele.',
      );
    });
  });

  _grupoDoRotuloDoIngresso();
}

// =============================================================================
// O ROTULO DO INGRESSO, NOS DOIS ESTADOS (cliente, 22/10/2026)
// =============================================================================
// Literal: *"O botao de comprar convite, deve ser alterado para Comprar
// Ingresso, porem caso o evento seja gratuito, temos que alterar para Retirar
// Ingresso."*
//
// **O CONDICIONAL NAO ESTAVA BLOQUEADO, e isto foi medido antes de escrever
// uma linha:** `NetworkEventAdmission.kind` e um enum fechado `[free, paid]`
// no contrato, com `price` anulavel ao lado, e o app ja o lia
// (`EntradaDoEncontro.doJson`). Nenhum campo novo de servidor foi preciso e
// `api/openapi.yaml` nao mudou.
//
// **Os dois casos sao um par e moram juntos.** Um rotulo condicional com um
// ramo so medido e um rotulo que ninguem sabe se troca: o segundo caso e o
// que prova que a condicao EXISTE, e nao que o texto foi trocado por outro
// fixo.
void _grupoDoRotuloDoIngresso() {
  group('o rotulo do ingresso', () {
    // DESLIGAR PARA VER REPROVAR: em `_Links.rotuloDoConvite`
    // (`lib/telas/rede/encontro_da_rede.dart`), devolva um valor fixo --
    // `'Comprar Ingresso'` nos dois ramos. ESTE caso reprova e o de baixo
    // passa, que e o que separa "a condicao sumiu" de "o texto esta errado".
    testWidgets('evento GRATUITO: `Retirar Ingresso`', (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(
          encontro: encontroPublico(
            admissionKind: 'free',
            ticketUrl: 'https://ingresso.exemplo.test/gratuito',
          ),
        ),
      );

      // CONTROLE POSITIVO: a secao `Links` existe. Sem link nao ha rotulo
      // nenhum, e os dois `expect` de baixo ficariam verdes por vazio -- e e
      // exatamente o estado que o caso `sem links não há seção Links` mede.
      await rolarAte(tester, find.text('Links'));
      expect(
        find.text('Links'),
        findsOneWidget,
        reason: 'REPROVA: a secao `Links` nao esta na tela, entao nao ha '
            'rotulo de ingresso para medir.',
      );

      expect(
        find.text('Retirar Ingresso'),
        findsOneWidget,
        reason:
            'REPROVA: num evento com `admission.kind: free` o rotulo nao e '
            '`Retirar Ingresso`. O cliente pediu os DOIS rotulos em '
            '22/10/2026, e este e o do ramo gratuito -- cobrar pagamento de '
            'quem entra de graca e o pior dos dois erros.',
      );
      expect(
        find.text('Comprar Ingresso'),
        findsNothing,
        reason: 'REPROVA: o evento gratuito manda COMPRAR.',
      );
      expect(
        find.textContaining('convite'),
        findsNothing,
        reason: 'REPROVA: a palavra `convite` voltou ao rotulo. O cliente '
            'trocou o substantivo para `Ingresso` nos dois ramos.',
      );
    });

    // DESLIGAR PARA VER REPROVAR: mesma troca do caso acima, mas fixando
    // `'Retirar Ingresso'`. ESTE caso reprova.
    testWidgets('evento PAGO: `Comprar Ingresso`', (tester) async {
      await abrirEncontro(
        tester,
        logado: false,
        titulo: tituloPublico,
        rede: redeDoEncontro(
          encontro: encontroPublico(
            admissionKind: 'paid',
            price: <String, dynamic>{
              'amount': 3000,
              'currency': 'BRL',
              'unit': 'per_person',
            },
            ticketUrl: 'https://ingresso.exemplo.test/pago',
          ),
        ),
      );

      await rolarAte(tester, find.text('Links'));
      expect(
        find.text('Links'),
        findsOneWidget,
        reason: 'REPROVA (controle positivo): a secao `Links` nao esta na '
            'tela.',
      );

      expect(
        find.text('Comprar Ingresso'),
        findsOneWidget,
        reason:
            'REPROVA: num evento com `admission.kind: paid` o rotulo nao e '
            '`Comprar Ingresso`.',
      );
      expect(
        find.text('Retirar Ingresso'),
        findsNothing,
        reason: 'REPROVA: o evento pago manda RETIRAR, e quem chegar no site '
            'do organizador vai encontrar um valor a pagar que a tela do '
            'Bichu nao avisou.',
      );
    });
  });
}
