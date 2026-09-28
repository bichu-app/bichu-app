// Os modelos da `Rede` contra o contrato e contra a matriz de rastreabilidade.
//
// O portao `infra/verificacao/verificar-conformidade-do-app.mjs` confere os
// NOMES dos campos e os VALORES das listas fechadas contra `api/openapi.yaml`.
// Este arquivo confere o que ele nao ve: a leitura (o que o app faz com cada
// forma da resposta), a apresentacao (valor, distancia, horario) e os ROTULOS
// de cada codigo, que a matriz `api/rastreabilidade-backoffice-rede.yaml`
// (`correspondencias`, um para um) fixa para as quatro pontas.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/api/modelos_rede.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/intencao/intencao_pendente.dart';
import 'package:bichu/intencao/pedido_de_participacao_como_intencao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fixtures_da_rede.dart';

void main() {
  group('a leitura segue o discriminador do contrato', () {
    test('visibility=public vira EncontroPublico, com os campos novos', () {
      final e = EncontroDaRede.doJson(
        encontroPublico(
          fencedOffLeashArea: true,
          acceptedSizes: const <String>['M', 'G'],
          dogAge: 'from_4_months',
          amenities: const <String>['shade', 'nao-existe'],
          bringItems: const <String>['water', 'toy'],
        ),
      );
      expect(e, isA<EncontroPublico>());
      final p = e as EncontroPublico;
      expect(p.areaCercadaParaSoltar, isTrue);
      expect(p.portesAceitos, <Porte>{Porte.medio, Porte.grande});
      expect(p.idadeDosCaes, IdadeDosCaes.aPartirDe4Meses);
      // Valor que o app nao conhece e descartado, e nao quebra a leitura.
      expect(p.estrutura, <EstruturaDoLocal>[EstruturaDoLocal.sombra]);
      expect(p.oQueLevar, <ItemParaLevar>[ItemParaLevar.agua, ItemParaLevar.brinquedo]);
    });

    test('visibility=private vira TeaserDoPrivado com os cinco campos', () {
      final e = EncontroDaRede.doJson(teaserPrivado());
      expect(e, isA<TeaserDoPrivado>());
      expect(e.dia.dataLonga(anoCorrente: 2026), 'Domingo, 4 de outubro');
      expect(e.situacao, SituacaoDoEncontro.aVir);
    });

    test('teaser sem local_date e resposta fora do contrato', () {
      final sem = teaserPrivado()..remove('local_date');
      expect(() => EncontroDaRede.doJson(sem), throwsFormatException);
    });

    test('cancelled e lido do servidor, e valor desconhecido vira nulo', () {
      expect(
        EncontroDaRede.doJson(encontroPublico(status: 'cancelled')).situacao,
        SituacaoDoEncontro.cancelado,
      );
      expect(
        EncontroDaRede.doJson(encontroPublico(status: 'adiado')).situacao,
        isNull,
      );
    });

    test('a pagina por distancia descarta privado que vier nela', () {
      final p = PaginaPorPerto.doJson(
        paginaPorPerto(<Map<String, dynamic>>[
          porPerto(encontroPublico(), 1200),
          <String, dynamic>{...teaserPrivado(), 'distance_m': 800},
        ]),
      );
      expect(p.itens, hasLength(1));
      expect(p.distanciasPorSlug, <String, int>{slugPublico: 1200});
      expect(p.temRegiao, isTrue);
    });

    test('sem regiao: distance_m nula e effective_sort proximos', () {
      final p = PaginaPorPerto.doJson(
        paginaPorPerto(<Map<String, dynamic>>[porPerto(encontroPublico(), null)]),
      );
      expect(p.temRegiao, isFalse);
    });

    test('declined nao existe no vocabulario do app', () {
      expect(EstadoDoPedido.porCodigo('declined'), isNull);
      expect(
        PedidoDeParticipacao.doJson(pedido('declined')).estado,
        isNull,
      );
      for (final e in EstadoDoPedido.values) {
        expect(e.rotulo.toLowerCase(), isNot(contains('recusad')));
      }
    });
  });

  group('apresentacao', () {
    test('valor: numero e unidade em formato fixo', () {
      expect(
        const PrecoDoEncontro(centavos: 1500, unidade: UnidadeDoPreco.porCao).rotulo,
        'R\$ 15 por cão',
      );
      expect(
        const PrecoDoEncontro(centavos: 1250, unidade: UnidadeDoPreco.porPessoa)
            .rotulo,
        'R\$ 12,50 por pessoa',
      );
      expect(
        const PrecoDoEncontro(centavos: 150000, unidade: UnidadeDoPreco.porDupla)
            .rotulo,
        'R\$ 1.500 por dupla',
      );
      expect(const PrecoDoEncontro(centavos: 900, unidade: null).rotulo, 'R\$ 9');
    });

    test('distancia: quilometros inteiros, no minimo 1, da regiao', () {
      expect(DistanciaDaRegiao.texto(200), 'A cerca de 1 km da sua região');
      expect(DistanciaDaRegiao.texto(2600), 'A cerca de 3 km da sua região');
      expect(DistanciaDaRegiao.falado(900), 'a cerca de 1 quilômetro da sua região');
      expect(DistanciaDaRegiao.falado(4200), 'a cerca de 4 quilômetros da sua região');
    });

    test('horario no fuso do evento, com duracao', () {
      final h = HorarioDoEncontro.doIso(
        inicioEmIso: '2026-10-03T12:00:00Z',
        fimEmIso: '2026-10-03T13:30:00Z',
        nomeIana: 'America/Sao_Paulo',
      );
      expect(h.faixaComDuracao, 'Das 9h às 10h30 · 1 hora e meia');
      expect(h.fuso.rotulo, 'Horário de Brasília');

      final manaus = HorarioDoEncontro.doIso(
        inicioEmIso: '2026-10-03T13:00:00Z',
        fimEmIso: null,
        nomeIana: 'America/Manaus',
      );
      expect(manaus.faixaComDuracao, 'Às 9h');
      expect(manaus.fuso.rotulo, 'Horário de Manaus');
    });
  });

  group('rotulos da matriz de rastreabilidade (correspondencias, um para um)', () {
    // Copiados de `api/rastreabilidade-backoffice-rede.yaml`, na branch do
    // backoffice (`feat/backoffice-rede-admin`), e escritos aqui por extenso.
    test('NetworkEventDogAge', () {
      expect(<String, String>{
        for (final i in IdadeDosCaes.values) i.codigo: i.rotulo,
      }, <String, String>{
        'any': 'Qualquer idade',
        'from_4_months': 'A partir de 4 meses',
        'from_1_year': 'A partir de 1 ano',
        'up_to_1_year': 'Até 1 ano',
      });
    });

    test('EventPriceUnit', () {
      expect(<String, String>{
        for (final u in UnidadeDoPreco.values) u.codigo: u.rotulo,
      }, <String, String>{
        'per_dog': 'por cão',
        'per_person': 'por pessoa',
        'per_pair': 'por dupla',
      });
    });

    test('NetworkEventBringItem', () {
      expect(<String, String>{
        for (final i in ItemParaLevar.values) i.codigo: i.rotulo,
      }, <String, String>{
        'water': 'Água',
        'water_bowl': 'Pote de água',
        'leash': 'Guia',
        'poop_bags': 'Saquinho',
        'treats': 'Petisco',
        'towel': 'Toalha',
        'vaccination_card': 'Carteira de vacinação',
        'toy': 'Brinquedo',
      });
    });

    test('NetworkEventAmenity', () {
      expect(<String, String>{
        for (final e in EstruturaDoLocal.values) e.codigo: e.rotulo,
      }, <String, String>{
        'level_ground_or_ramp': 'Piso plano ou rampa',
        'accessible_restroom': 'Banheiro acessível',
        'public_restroom_nearby': 'Banheiro público próximo',
        'shade': 'Sombra',
        'benches': 'Bancos',
        'dog_water_fountain': 'Bebedouro para cães',
        'parking_nearby': 'Estacionamento próximo',
      });
    });

    test('JoinRequestAppState', () {
      expect(<String, String>{
        for (final e in EstadoDoPedido.values) e.codigo: e.rotulo,
      }, <String, String>{
        'requested': 'Pedido enviado',
        'approved': 'Pedido aprovado',
        'withdrawn': 'Pedido cancelado',
        'expired': 'O encontro passou',
      });
    });

    test('PetSize', () {
      expect(<String, String>{
        for (final p in Porte.values) p.valor: p.rotulo,
      }, <String, String>{
        'P': 'Pequeno',
        'M': 'Médio',
        'G': 'Grande',
        'GG': 'Gigante',
      });
    });
  });

  group('o recorte manda so o que cada operacao aceita', () {
    test('listNearbyNetworkEvents nao recebe visibility nem coordenada', () {
      const r = RecorteDaRede(
        visibilidade: VisibilidadeDoEncontro.publico,
        distanciaMaxima: DistanciaMaxima.ate5km,
      );
      final q = r.queryPorPerto(ordemPorPerto: OrdemPorPerto.distancia);
      expect(q.containsKey('visibility'), isFalse);
      expect(q['max_km'], '5');
      expect(q['sort'], 'distancia');
      for (final chave in q.keys) {
        expect(<String>['lat', 'lon', 'latitude', 'longitude'], isNot(contains(chave)));
      }
    });

    test('listMyNetworkEventJoinRequests nao recebe admission nem size', () {
      const r = RecorteDaRede(
        termo: 'border',
        entrada: TipoDeEntrada.pago,
        porte: Porte.grande,
        estadoDoPedido: EstadoDoPedido.aprovado,
      );
      expect(r.queryDePedidos, <String, String>{
        'q': 'border',
        'state': 'approved',
        'sort': 'proximos',
        'page': '1',
        'limit': '20',
      });
    });
  });

  group('a intencao de pedir depois do login', () {
    test('manda o POST sem corpo e volta para o encontro', () async {
      final chamadas = <http.Request>[];
      final api = ApiClient(
        config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
        cliente: MockClient((req) async {
          chamadas.add(req);
          return http.Response(
            jsonEncode(pedido('requested')),
            200,
            headers: <String, String>{'content-type': 'application/json'},
          );
        }),
        tokenDeAcesso: () async => 'token-de-teste',
      );
      final intencao = intencaoDePedirParaParticipar(
        slugPrivado,
        criadaEm: DateTime.utc(2026, 9, 28),
      );
      expect(intencao.acao, AcaoDeIntencao.pedirParaParticipar);
      expect(Rotas.rotaDaTelaDeUx(intencao.telaDeRetorno), Rotas.rede);

      final resultado = await pedidoDeParticipacaoExecutavel(api).executar(intencao);
      expect(chamadas.single.method, 'POST');
      expect(chamadas.single.url.path, '/v1/network/events/$slugPrivado/join-request');
      expect(chamadas.single.body, isEmpty);
      expect(resultado.rota, '/rede/encontros/$slugPrivado');
    });
  });
}
