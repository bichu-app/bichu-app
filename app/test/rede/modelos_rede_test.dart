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
import 'package:bichu/api/rede_api.dart';
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
        expect((e.rotulo ?? '').toLowerCase(), isNot(contains('recusad')));
      }
    });
  });

  group('apresentacao', () {
    test('valor: numero e unidade em formato fixo', () {
      expect(
        const PrecoDoEncontro(centavos: 1500, unidade: UnidadeDoPreco.porPet).rotulo,
        'R\$ 15 por pet',
      );
      // Legado: `per_dog` escreve a mesma frase que `per_pet`.
      expect(
        const PrecoDoEncontro(centavos: 1500, unidade: UnidadeDoPreco.porCao).rotulo,
        'R\$ 15 por pet',
      );
      expect(
        const PrecoDoEncontro(centavos: 1250, unidade: UnidadeDoPreco.porPessoa)
            .rotulo,
        'R\$ 12,50 por humano',
      );
      expect(
        const PrecoDoEncontro(centavos: 150000, unidade: UnidadeDoPreco.porDupla)
            .rotulo,
        'R\$ 1.500 por dupla (1 humano + 1 pet)',
      );
      expect(
        const PrecoDoEncontro(
          centavos: 2000,
          unidade: UnidadeDoPreco.porDuasPessoas,
        ).rotulo,
        'R\$ 20 por dupla (2 humanos)',
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

  group('tolerancia a valor que este build nao conhece', () {
    // ISCA. O app novo vai rodar contra um servidor mais novo que ele: quando
    // o contrato ganhar uma unidade de preco (como ganhou `per_pet` e
    // `per_two_people` em 01/10), o aparelho de quem nao atualizou recebe um
    // `unit` que o binario nao tem no enum.
    //
    // A tolerancia e `UnidadeDoPreco.porCodigo` devolver NULO em vez de
    // estourar, e `PrecoDoEncontro.rotulo` escrever so o valor. Trocar aquele
    // laco por um `firstWhere` sem `orElse` reprova ESTE caso -- e nao o teste
    // de apresentacao acima, que monta `unidade: null` no construtor e nunca
    // passa pelo JSON.
    test('tolera unidade de preco que este build nao conhece', () {
      final entrada = EntradaDoEncontro.doJson(<String, dynamic>{
        'kind': 'paid',
        'price': <String, dynamic>{
          'amount': 1500,
          'currency': 'BRL',
          'unit': 'per_flock_of_geese',
        },
      });

      expect(entrada.preco, isNotNull);
      // O valor sobrevive; a unidade desconhecida vira nulo.
      expect(entrada.preco!.centavos, 1500);
      expect(entrada.preco!.unidade, isNull);
      // E o selo diz o que sabe, sem inventar unidade.
      expect(entrada.rotuloDoSelo, 'R\$ 15');
    });

    test('o encontro inteiro nao se perde por uma unidade desconhecida', () {
      // Pelo fio de verdade: `jsonDecode` e o que o cliente da API faz.
      final encontro = EncontroPublico.doJson(
        jsonDecode(
          jsonEncode(
            encontroPublico(
              admissionKind: 'paid',
              price: <String, dynamic>{
                'amount': 2500,
                'currency': 'BRL',
                'unit': 'per_flock_of_geese',
              },
            ),
          ),
        ) as Map<String, dynamic>,
      );

      expect(encontro.entrada.preco!.unidade, isNull);
      expect(encontro.entrada.rotuloDoSelo, 'R\$ 25');
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
        // `per_dog` e legado e aparece como "por pet", igual a `per_pet`: a
        // correspondencia deixou de ser um para um em 01/10. Os textos sao,
        // palavra por palavra, os de `admin/src/rede/dominio/rotulos.ts`.
        'per_dog': 'por pet',
        'per_pet': 'por pet',
        'per_person': 'por humano',
        'per_pair': 'por dupla (1 humano + 1 pet)',
        'per_two_people': 'por dupla (2 humanos)',
      });
    });

    test('NetworkEventBringItem', () {
      expect(<String, String>{
        for (final i in ItemParaLevar.values) i.codigo: i.rotulo,
      }, <String, String>{
        'water': 'Água',
        'water_bowl': 'Pote de água',
        'leash': 'Guia',
        'poop_bags': 'Saquinhos para cocô',
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
        'dog_water_fountain': 'Bebedouro para cachorros',
        'parking_nearby': 'Estacionamento próximo',
      });
    });

    test('JoinRequestAppState: so os dois estados que a tela desenha', () {
      // A matriz da `withdrawn: Pedido cancelado` e `expired: O encontro
      // passou`, e a especificacao nao desenha nenhum dos dois: `expired`
      // vai para `Encerrados` (design system 24.17.5) e o rotulo de
      // `withdrawn` "nao entra na tela" (24.17.6). Vale a especificacao; a
      // divergencia da matriz esta registrada na entrega.
      expect(<String, String?>{
        for (final e in EstadoDoPedido.values) e.codigo: e.rotulo,
      }, <String, String?>{
        'requested': 'Pedido enviado',
        'approved': 'Pedido aprovado',
        'withdrawn': null,
        'expired': null,
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
    test('ISCA -- a assinatura das distancias muda com a regiao', () {
      // ISCA: tire `regiao` da lista de `assinaturaDasDistancias`. As medidas
      // da regiao antiga sobreviveriam a troca, e este caso reprova.
      const r = RecorteDaRede(cidade: 'São Paulo');
      expect(
        r.assinaturaDasDistancias(regiao: 'Pinheiros/São Paulo/SP/'),
        isNot(r.assinaturaDasDistancias(regiao: 'Butantã/São Paulo/SP/')),
      );
      // O termo de busca continua fora: digitar nao apaga as medidas.
      expect(
        const RecorteDaRede(termo: 'passeio', cidade: 'São Paulo')
            .assinaturaDasDistancias(regiao: 'x'),
        r.assinaturaDasDistancias(regiao: 'x'),
      );
    });

    test('listNearbyNetworkEvents nao recebe visibility nem coordenada', () {
      // `visibilidade` saiu de `RecorteDaRede` em 19/10/2026 (o filtro
      // `Público ou privado` saiu do app). O caso FICA e continua medindo o
      // que importava: `queryPorPerto` nao manda `visibility` -- e agora nao
      // tem de onde o mandar, que e uma garantia mais forte.
      const r = RecorteDaRede(distanciaMaxima: DistanciaMaxima.ate5km);
      final q = r.queryPorPerto(ordemPorPerto: OrdemPorPerto.distancia);
      expect(q.containsKey('visibility'), isFalse);
      expect(q['max_km'], '5');
      expect(q['sort'], 'distancia');
      for (final chave in q.keys) {
        expect(<String>['lat', 'lon', 'latitude', 'longitude'], isNot(contains(chave)));
      }
    });

    // **O CASO `listMyNetworkEventJoinRequests nao recebe admission nem size`
    // SAIU** (19/10/2026). Ele media `RecorteDaRede.queryDePedidos`, que era
    // a consulta da aba `Meus pedidos`. A aba saiu do app por decisao do
    // cliente -- *"vamos deixar apenas os eventos abertos por enquanto, no
    // futuro analisamos a necessidade de ter eventos privados tambem"* -- e o
    // montador da consulta saiu com ela.
    //
    // **Nao foi enfraquecido: o que ele protegia virou impossivel.** Ele
    // existia para garantir que `admission` e `size` nao fossem para uma
    // operacao que nao os aceita; agora nao ha consulta nenhuma sendo montada
    // para aquela operacao. A operacao continua no contrato, aposentada com
    // data e com a frase dele em `api/rastreabilidade-backoffice-rede.yaml`.
    //
    // O caso que entrou no lugar vive em `agenda_da_rede_test.dart`:
    // `ISCA -- nenhuma chamada do app vai a /network/join-requests`.
  });

  // ---------------------------------------------------------------------
  // OS TRES CASOS DA INTENCAO DE PEDIR SAIRAM (19/10/2026)
  // ---------------------------------------------------------------------
  //
  // Eram `a intencao de pedir depois do login > manda o POST sem corpo e
  // volta para o encontro`, `a intencao de pedir: falhas depois do login >
  // ISCA -- falha definitiva (event_ended): volta ao encontro com o erro e o
  // envelope morre` e `... > falha transitoria (500): volta ao encontro, e o
  // envelope fica`.
  //
  // Eles mediam `pedidoDeParticipacaoExecutavel`, e o executavel saiu junto
  // com a tela que criava a intencao: a pagina de detalhe do evento era o
  // unico lugar do app que tocava em `Pedir para participar`, e ela saiu por
  // decisao do cliente. Os tres esperavam voltar para `/rede/encontros/<slug>`
  // -- um endereco que nao existe mais.
  //
  // **Nao foram enfraquecidos, foram removidos com o mecanismo.** `RedeApi` e
  // os modelos do pedido (`PedidoDeParticipacao`, `EstadoDoPedido`,
  // `PaginaDeMeusPedidos`) continuam medidos pelos casos deste arquivo que
  // ficaram: o contrato nao mudou, e `Meus pedidos` continua lendo
  // `listMyNetworkEventJoinRequests`.

  group('resposta fora do contrato vira FormatException, nunca TypeError', () {
    ApiClient apiQueDevolve(Map<String, dynamic> corpo) => ApiClient(
          config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
          cliente: MockClient(
            (req) async => http.Response(
              jsonEncode(corpo),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            ),
          ),
        );

    test('teaser com local_date numerico', () {
      expect(
        () => RedeApi(apiQueDevolve(<String, dynamic>{
          ...teaserPrivado(),
          'local_date': 20261004,
        })).detalhar(slugPrivado),
        throwsFormatException,
      );
    });

    test('accepted_sizes com valor de outro tipo nao quebra a leitura', () {
      final e = EncontroPublico.doJson(<String, dynamic>{
        ...encontroPublico(),
        'accepted_sizes': <Object>[1, 'M'],
      });
      expect(e.portesAceitos, <Porte>{Porte.medio});
    });

    test('distance_m de outro tipo vira nula', () {
      final p = EncontroPorPerto.doJson(<String, dynamic>{
        ...encontroPublico(),
        'distance_m': '1200',
      });
      expect(p.distanciaEmMetros, isNull);
    });

    test('`thumb_url` da imagem e a URL que a GALERIA pede', () {
      // A galeria desenha 144 dp em 4:3 (432 px a 3x) e pedia a derivada de
      // 1024 px -- cinco vezes o dado que ela pinta. `urlParaGaleria` e o que
      // a tela usa, e ela precisa preferir a miniatura.
      final imagem = ImagemDoEncontro.doJson(<String, dynamic>{
        'url': 'https://midia.invalid/events/card/a.jpeg',
        'thumb_url': 'https://midia.invalid/events/thumb/a.jpeg',
        'alt_text': 'A roda na sombra',
      });
      expect(imagem, isNotNull);
      expect(imagem!.urlParaGaleria, endsWith('/thumb/a.jpeg'));
    });

    test('sem `thumb_url`, a galeria CAI na capa em vez de nao desenhar', () {
      // A imagem gravada antes desta derivada existir nao tem miniatura, e uma
      // galeria vazia seria pior que uma galeria com imagem grande.
      final imagem = ImagemDoEncontro.doJson(<String, dynamic>{
        'url': 'https://midia.invalid/events/card/a.jpeg',
        'alt_text': 'A roda na sombra',
      });
      expect(imagem!.urlDaMiniatura, isNull);
      expect(imagem.urlParaGaleria, endsWith('/card/a.jpeg'));
    });

    test('`thumb_url` de outro tipo vira nula, e nao quebra a leitura', () {
      final imagem = ImagemDoEncontro.doJson(<String, dynamic>{
        'url': 'https://midia.invalid/events/card/a.jpeg',
        'thumb_url': 42,
        'alt_text': 'A roda na sombra',
      });
      expect(imagem!.urlDaMiniatura, isNull);
    });

    test('`cover_banner_url` e a capa do DETALHE, separada da do cartao', () {
      final encontro = EncontroPublico.doJson(<String, dynamic>{
        ...encontroPublico(
          images: <Map<String, dynamic>>[
            <String, dynamic>{
              'url': 'https://midia.invalid/events/card/a.jpeg',
              'thumb_url': 'https://midia.invalid/events/thumb/a.jpeg',
              'alt_text': 'A roda na sombra',
            },
          ],
          coverBannerUrl: 'https://midia.invalid/events/banner/a.jpeg',
        ),
      });
      expect(encontro.urlDaCapa, endsWith('/card/a.jpeg'));
      expect(encontro.urlDoBannerDaCapa, endsWith('/banner/a.jpeg'));
    });

    test('sem `cover_banner_url`, o detalhe cai na capa de 1024', () {
      final encontro = EncontroPublico.doJson(<String, dynamic>{
        ...encontroPublico(),
        'cover_image_url': 'https://midia.invalid/events/card/a.jpeg',
        'cover_banner_url': null,
      });
      expect(encontro.urlDoBannerDaCapa, isNull);
      expect(encontro.urlDaCapa, isNotNull);
    });

    test('um TypeError de leitura sai da RedeApi como FormatException', () {
      // `place.state` como lista: o modelo confere `is String` e recusa;
      // `images` com mapa de tipos errados e descartado. O caminho que sobra
      // para `TypeError` e o que ninguem previu, e `_ler` o converte.
      expect(
        () => RedeApi(apiQueDevolve(<String, dynamic>{
          ...encontroPublico(),
          'place': <String, dynamic>{'place_name': 1},
        })).detalhar(slugPublico),
        throwsFormatException,
      );
    });
  });
}
