// Criterio 9 da BICHUS-62: `pets_api.dart` tem um metodo que chama
// `GET /pets` (`listMyPets`) e devolve os itens **tipados**.
//
// O caso percorre `PetsApi` -> `ApiClient` -> HTTP, e nao a funcao de parse
// solta: um teste que chamasse `Pet.doJson` direto continuaria verde no dia em
// que a API parasse de usa-la.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/api/pets_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Um `Pet` no formato que `api/openapi.yaml` declara, com os campos que o
/// cartao le. Nao e um objeto inventado: os nomes sao os do contrato.
Map<String, dynamic> petDoContrato({
  String id = '3f1d7a9e-0000-7000-8000-000000000001',
  String nome = 'Nina',
  String especie = 'dog',
  String? porte = 'M',
  String? raca = 'Vira-lata (SRD)',
  String status = 'active',
  int tagsAtivas = 1,
  List<Map<String, dynamic>> fotos = const <Map<String, dynamic>>[],
  String? casoAberto,
}) {
  return <String, dynamic>{
    'id': id,
    'name': nome,
    'species': especie,
    'size': porte,
    'breed_label': raca,
    'status': status,
    'active_tag_count': tagsAtivas,
    'photos': fotos,
    'open_case_id': casoAberto,
    'created_at': '2026-09-20T12:00:00Z',
  };
}

Map<String, dynamic> fotoDoContrato({
  String status = 'ready',
  bool principal = true,
  String? thumb = 'https://midia.bichu.app/t/abc.webp',
  String? card,
}) {
  return <String, dynamic>{
    'id': 'f-1',
    'status': status,
    'is_primary': principal,
    'thumb_url': thumb,
    'card_url': card,
  };
}

PetsApi apiQueResponde(
  Future<http.Response> Function(http.Request) rede, {
  List<http.Request>? registrar,
}) {
  AppConfig.limparParaTeste();
  return PetsApi(
    ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
      cliente: MockClient((req) {
        registrar?.add(req);
        return rede(req);
      }),
      tokenDeAcesso: () async => 'token-de-teste',
    ),
  );
}

http.Response json200(Map<String, dynamic> corpo) => http.Response(
      jsonEncode(corpo),
      200,
      headers: <String, String>{
        'content-type': 'application/json; charset=utf-8',
      },
    );

void main() {
  test('chama GET /v1/pets e devolve os itens tipados', () async {
    final vistas = <http.Request>[];
    final api = apiQueResponde(
      (req) async => json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[
          petDoContrato(fotos: <Map<String, dynamic>>[fotoDoContrato()]),
          petDoContrato(
            id: '3f1d7a9e-0000-7000-8000-000000000002',
            nome: 'Tobias',
            especie: 'cat',
            porte: 'P',
            raca: null,
            status: 'lost',
            tagsAtivas: 0,
          ),
        ],
      }),
      registrar: vistas,
    );

    final pets = await api.listarMeusPets();

    expect(vistas.single.method, 'GET');
    expect(
      vistas.single.url.path,
      '/v1/pets',
      reason: 'REPROVA: a operacao listMyPets do contrato e GET /v1/pets.',
    );
    expect(
      vistas.single.headers['authorization'],
      'Bearer token-de-teste',
      reason: 'REPROVA: listMyPets declara `security: bearerAuth`.',
    );

    expect(pets, hasLength(2));
    expect(pets.first.nome, 'Nina');
    expect(pets.first.especie, Especie.cao);
    expect(pets.first.porte, Porte.medio);
    expect(pets.first.racaRotulo, 'Vira-lata (SRD)');
    expect(pets.first.status, StatusDoPet.ativo);
    expect(pets.first.semTag, isFalse);
    expect(pets.first.fotoDeCapa?.urlDeMiniatura,
        'https://midia.bichu.app/t/abc.webp');

    expect(pets.last.nome, 'Tobias');
    expect(pets.last.status, StatusDoPet.perdido);
    expect(pets.last.semTag, isTrue);
    expect(pets.last.fotoDeCapa, isNull);
  });

  test('lista vazia e uma resposta legitima, e nao uma falha', () async {
    final api = apiQueResponde(
      (req) async => json200(<String, dynamic>{'items': <dynamic>[]}),
    );
    expect(await api.listarMeusPets(), isEmpty);
  });

  test('o teto de 20 do contrato chega inteiro, sem corte nem paginacao',
      () async {
    final api = apiQueResponde(
      (req) async => json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[
          for (var i = 0; i < 20; i++)
            petDoContrato(id: 'p-$i', nome: 'Pet $i'),
        ],
      }),
    );
    final pets = await api.listarMeusPets();
    expect(pets, hasLength(20));
    expect(pets.last.nome, 'Pet 19');
  });

  test('status que este build nao conhece nao derruba a lista', () async {
    // Versao antiga do app continua instalada por semanas depois de o servidor
    // ganhar um estado novo. Um `switch` que estourasse aqui apagaria a lista
    // inteira por causa de um pet.
    final api = apiQueResponde(
      (req) async => json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[petDoContrato(status: 'em_transito')],
      }),
    );
    final pets = await api.listarMeusPets();
    expect(pets.single.status, StatusDoPet.desconhecido);
  });

  test('foto em processamento nao e foto de capa, e a lista sabe disso',
      () async {
    final api = apiQueResponde(
      (req) async => json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[
          petDoContrato(
            fotos: <Map<String, dynamic>>[
              fotoDoContrato(status: 'processing', thumb: null),
            ],
          ),
        ],
      }),
    );
    final pet = (await api.listarMeusPets()).single;
    expect(pet.fotoDeCapa, isNull);
    expect(pet.temFotoEmProcessamento, isTrue);
  });

  test('foto `ready` sem URL nenhuma nao e exibivel', () async {
    // O contrato declara `thumb_url` e `card_url` **anulaveis**, inclusive com
    // status `ready`. Tratar "pronta" como "da para pintar" quebra no
    // aparelho, e nao no teste que so olha o status.
    final api = apiQueResponde(
      (req) async => json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[
          petDoContrato(
            fotos: <Map<String, dynamic>>[fotoDoContrato(thumb: null)],
          ),
        ],
      }),
    );
    final pet = (await api.listarMeusPets()).single;
    expect(pet.fotoDeCapa, isNull);
    expect(pet.temFotoEmProcessamento, isFalse);
  });

  test('401 sobe como FalhaDaApi, e NAO vira lista vazia', () async {
    // Esta e a diferenca que sustenta o criterio 7: "voce nao tem pet" e "nao
    // consegui perguntar" nao podem chegar iguais na tela.
    final api = apiQueResponde(
      (req) async => http.Response(
        jsonEncode(<String, dynamic>{
          'type': 'https://api.bichu.app/problems/unauthenticated',
          'status': 401,
        }),
        401,
        headers: <String, String>{
          'content-type': 'application/problem+json; charset=utf-8',
        },
      ),
    );
    await expectLater(api.listarMeusPets(), throwsA(isA<FalhaDaApi>()));
  });

  test('200 sem `items` reprova alto em vez de virar lista vazia', () async {
    final api = apiQueResponde((req) async => json200(<String, dynamic>{}));
    await expectLater(
      api.listarMeusPets(),
      throwsA(isA<FormatException>()),
      reason: 'REPROVA: `items` e obrigatorio no contrato. Devolver [] aqui '
          'faria a tela dizer "voce nao tem pet" por causa de uma resposta '
          'malformada.',
    );
  });
}
