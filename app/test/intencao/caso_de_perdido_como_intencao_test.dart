// BICHUS-21, criterio 7 — a guarda assume, e o CASO e criado.
//
// > *"Dado que estou deslogada, quando toco em `Marcar como perdido`, entao a
// > guarda de acao assume e, depois de autenticar, **o caso e criado** e eu
// > caio na F3.3 com o rascunho aplicado, nunca no formulario de novo e nunca
// > na home."*
//
// A meia-entrega e a entrega se parecem no diff, e e por isso que estes casos
// existem: a meia-entrega leva a pessoa de volta ao formulario preenchido e
// pede que ela toque no botao outra vez. Parece que funcionou, e o teste de
// navegacao passa. O que a regra 3 de 8.3 exige e que a acao ACONTECA.
//
// Camila tocou em `Marcar como perdido` com o pet escolhido e o bairro
// digitado, antes do login. Ela nao toca de novo depois dele.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/casos_api.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/api/pets_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/intencao/caso_de_perdido_como_intencao.dart';
import 'package:bichu/intencao/intencao_pendente.dart';
import 'package:bichu/perdido/quando_foi_visto.dart';
import 'package:bichu/perdido/rascunho_do_caso.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perdido/resultado_da_abertura.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final DateTime agora = DateTime(2026, 9, 22, 19, 47, 31);

Pet get rex => const Pet(
      id: 'p-1',
      nome: 'Rex',
      especie: Especie.cao,
      redacoesDeCuidados: <RedacaoDeCuidados>[],
    );

RascunhoDoCaso rascunhoCheio() => RascunhoDoCaso(pet: rex)
  ..bairro = 'Vila Madalena'
  ..cidade = 'São Paulo'
  ..uf = 'SP'
  ..descricao = 'coleira vermelha'
  ..quando = QuandoFoiVisto.agora;

/// Um par de camadas de API sobre um dublê de rede.
({PetsApi pets, CasosApi casos, List<String> caminhos, List<String> chaves})
    camadas(
  Future<http.Response> Function(http.Request) rede,
) {
  final caminhos = <String>[];
  final chaves = <String>[];
  AppConfig.limparParaTeste();
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
    cliente: MockClient((req) {
      caminhos.add('${req.method} ${req.url.path}');
      final chave = req.headers['idempotency-key'];
      if (chave != null) chaves.add(chave);
      return rede(req);
    }),
    tokenDeAcesso: () async => 'token-de-teste',
  );
  return (
    pets: PetsApi(api),
    casos: CasosApi(api),
    caminhos: caminhos,
    chaves: chaves,
  );
}

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) =>
    http.Response(
      jsonEncode(corpo),
      status,
      headers: <String, String>{'content-type': 'application/json'},
    );

void main() {
  group('o envelope', () {
    test('leva o id do pet no alvo, e NAO leva o pet', () {
      final envelope = intencaoDeMarcarPerdido(rascunhoCheio(), criadaEm: agora);
      expect(envelope.acao, AcaoDeIntencao.marcarPerdido);
      expect(envelope.alvo, 'p-1');

      final gravado = jsonEncode(envelope.paraJson());
      expect(
        gravado.contains('Rex'),
        isFalse,
        reason: 'REPROVA: o nome do pet foi gravado em DISCO dentro do '
            'envelope. O envelope guarda o `alvo`, que e o id, e quem executa '
            'busca o resto: uma copia do animal no disco e dado de conta '
            'esperando a proxima pessoa que entrar naquele aparelho, e o '
            'aparelho compartilhado e caso real no publico deste produto.',
      );
    });

    test('a tela de retorno e F3.1, e ela existe neste build', () {
      final envelope = intencaoDeMarcarPerdido(rascunhoCheio(), criadaEm: agora);
      expect(envelope.telaDeRetorno, 'F3.1');
      expect(
        Rotas.rotaDaTelaDeUx('F3.1'),
        Rotas.marcarPerdido,
        reason: 'REPROVA: a guarda descarta em silencio o envelope cuja tela '
            'de retorno este build nao conhece. Sem esta traducao, a intencao '
            'de marcar perdido sumiria no login e a pessoa cairia no Inicio.',
      );
    });

    test('o instante e resolvido na CRIACAO, e nao na execucao', () {
      final envelope = intencaoDeMarcarPerdido(rascunhoCheio(), criadaEm: agora);
      expect(
        vistoEmDoEnvelope(envelope.rascunho.campos),
        agora,
        reason: 'REPROVA: `Agora` continuou relativo dentro do envelope. A '
            'pessoa toca as 19h02, cria a conta, confere o e-mail noutro app '
            'e volta as 19h11: resolvido na execucao, o caso gravaria 19h11 '
            'como a hora em que o animal foi visto pela ultima vez -- nove '
            'minutos de rastro que ninguem observou.',
      );
    });

    test('o rascunho volta inteiro do envelope', () {
      final envelope = intencaoDeMarcarPerdido(rascunhoCheio(), criadaEm: agora);
      final volta = RascunhoDoCaso.dosCampos(rex, envelope.rascunho.campos);
      expect(volta.bairro, 'Vila Madalena');
      expect(volta.cidade, 'São Paulo');
      expect(volta.uf, 'SP');
      expect(volta.descricao, 'coleira vermelha');
      expect(volta.compartilharNaListaPublica, isTrue);
      expect(volta.quando, QuandoFoiVisto.agora);
    });

    test('o envelope aceita so o que foi digitado ou escolhido', () {
      // `RascunhoDaIntencao` recusa o resto, e a recusa e o que impede alguem
      // de enfiar os bytes de uma foto aqui.
      final envelope = intencaoDeMarcarPerdido(rascunhoCheio(), criadaEm: agora);
      for (final valor in envelope.rascunho.campos.values) {
        expect(
          valor == null || valor is String || valor is num || valor is bool,
          isTrue,
          reason: 'REPROVA: entrou no envelope um valor que nao e texto, '
              'numero, booleano nem nulo.',
        );
      }
    });
  });

  group('o executor', () {
    test('cria o caso e devolve F3.3 com o caso ABERTO', () async {
      final c = camadas((req) async {
        if (req.url.path == '/v1/pets' && req.method == 'GET') {
          return _json(<String, dynamic>{
            'items': <Map<String, dynamic>>[
              <String, dynamic>{'id': 'p-1', 'name': 'Rex', 'species': 'dog'},
            ],
          });
        }
        if (req.url.path == '/v1/pets/p-1/lost-cases' && req.method == 'POST') {
          return _json(<String, dynamic>{
            'id': 'c-1',
            'pet_id': 'p-1',
            'status': 'open',
            'opened_at': '2026-09-22T22:47:31Z',
            'has_location': false,
            'alert': <String, dynamic>{'reach_status': 'unavailable'},
          }, status: 201);
        }
        return http.Response('', 404);
      });

      final executavel = casoDePerdidoExecutavel(c.pets, c.casos);
      final resultado = await executavel.executar(
        intencaoDeMarcarPerdido(rascunhoCheio(), criadaEm: agora),
      );

      expect(
        c.caminhos,
        contains('POST /v1/pets/p-1/lost-cases'),
        reason: 'REPROVA: ninguem abriu o caso. A pessoa entrou na conta e '
            'teria de tocar em `Avisar agora` de novo -- a meia-entrega que a '
            'regra 3 de 8.3 nomeia.',
      );
      expect(resultado.rota, Rotas.casoAberto);
      final extra = resultado.extra;
      expect(extra, isA<ResultadoDaAbertura>());
      expect(
        (extra! as ResultadoDaAbertura).estaNaFila,
        isFalse,
        reason: 'REPROVA: a execucao terminou em sucesso e o resultado diz '
            'que a acao esta na fila. Sao desfechos opostos.',
      );
      expect((extra as ResultadoDaAbertura).caso!.id, 'c-1');
      expect(
        c.chaves.single.isNotEmpty,
        isTrue,
        reason: 'REPROVA: o `POST` saiu sem `Idempotency-Key`.',
      );
    });

    test('o corpo declara `share_to_public_list` e nao manda coordenada',
        () async {
      Map<String, dynamic>? corpo;
      final c = camadas((req) async {
        if (req.url.path == '/v1/pets' && req.method == 'GET') {
          return _json(<String, dynamic>{
            'items': <Map<String, dynamic>>[
              <String, dynamic>{'id': 'p-1', 'name': 'Rex', 'species': 'dog'},
            ],
          });
        }
        if (req.method == 'POST') {
          corpo = jsonDecode(req.body) as Map<String, dynamic>;
          return _json(<String, dynamic>{
            'id': 'c-1',
            'pet_id': 'p-1',
            'status': 'open',
            'opened_at': '2026-09-22T22:47:31Z',
            'has_location': false,
            'alert': <String, dynamic>{'reach_status': 'unavailable'},
          }, status: 201);
        }
        return http.Response('', 404);
      });

      await casoDePerdidoExecutavel(c.pets, c.casos).executar(
        intencaoDeMarcarPerdido(rascunhoCheio(), criadaEm: agora),
      );

      expect(corpo!['share_to_public_list'], isTrue);
      expect(corpo!['description'], 'coleira vermelha');
      expect(
        corpo!.containsKey('last_seen_location'),
        isFalse,
        reason: 'REPROVA: o corpo levou coordenada. A tela nao tem uma para '
            'dar, o ADR-0006 proibe geocodificacao no MVP, e inventar um '
            'ponto a partir do bairro de casa do tutor seria mentira de '
            'aparencia plausivel: a busca acontece em volta desse ponto.',
      );
      expect(
        (corpo!['last_seen_at'] as String).endsWith('Z'),
        isTrue,
        reason: 'REPROVA: `last_seen_at` saiu sem fuso. O servidor recusa '
            'data no futuro comparando com o relogio dele, e um instante sem '
            'fuso seria lido como local do servidor.',
      );
    });

    test('pet que saiu da conta nao vira caso as cegas', () async {
      final c = camadas((req) async {
        if (req.url.path == '/v1/pets' && req.method == 'GET') {
          // A lista voltou sem o pet do envelope: ele saiu da conta nas 24
          // horas de validade do envelope.
          return _json(<String, dynamic>{'items': <dynamic>[]});
        }
        return http.Response('', 404);
      });

      await expectLater(
        casoDePerdidoExecutavel(c.pets, c.casos).executar(
          intencaoDeMarcarPerdido(rascunhoCheio(), criadaEm: agora),
        ),
        throwsA(isA<StateError>()),
      );
      expect(
        c.caminhos.any((caminho) => caminho.contains('lost-cases')),
        isFalse,
        reason: 'REPROVA: o executor abriu um caso contra um id que a conta '
            'nao lista mais. A guarda leva a pessoa para a tela de retorno, '
            'que sabe dizer que o animal saiu da lista; abrir as cegas '
            'terminaria num 404 com o alerta ja prometido.',
      );
    });

    test('a retomada devolve o rascunho e o erro, e nao um formulario vazio',
        () {
      final c = camadas((req) async => http.Response('', 404));
      final envelope = intencaoDeMarcarPerdido(rascunhoCheio(), criadaEm: agora);
      final retomada = casoDePerdidoExecutavel(c.pets, c.casos)
          .retomar(envelope, null) as RetomadaDoCaso;

      expect(retomada.petId, 'p-1');
      expect(
        retomada.campos['bairro'],
        'Vila Madalena',
        reason: 'REPROVA: a tela de retorno abriria em branco, que e perder o '
            'rascunho pelo outro caminho (UX 8.3, regra 4).',
      );
    });
  });
}
